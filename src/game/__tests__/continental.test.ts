import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { advanceWeek, newCareer, pendingChoices, resolveChoice } from '../sim/week';
import { initRelations } from '../sim/relations';
import {
  CONT_DEFS,
  confedOf,
  contWinner,
  createEdition,
  continentalWeek,
  entrantsFor,
  groupTable,
  nextContGame,
  slotsFor,
} from '../sim/continental';
import { addDays } from '../date';
import { Rng } from '../rng';
import type { Career, MatchRecord, Player, World } from '../types';

const w = generateWorld({ seed: 'CONT', activeLeagues: ['IDN1', 'ENG1'] });
const countryOf = (id: string) => w.clubs.find((c) => c.id === id)!.countryId;
const weekday = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay();

function start(seed: string) {
  const roll = rollCharacter(w, { countryId: 'IDN', position: 'ST' }, seed);
  const world: World = { ...w, players: [...w.players, roll.player] };
  const career: Career = newCareer(roll, 0, 'test', w.startDate);
  career.rel = initRelations(world, career, roll.player);
  return { world, career, player: roll.player };
}

/** Jalankan kompetisi benua minggu demi minggu sampai akhir Juni berikutnya */
function runYear(world: World, career: Career, player: Player) {
  let date = world.startDate;
  const end = `${+date.slice(0, 4) + 1}-06-30`;
  while (date < end) {
    const to = addDays(date, 7);
    world = continentalWeek(world, career, player, date, to, new Rng(date)).world;
    date = to;
  }
  return world;
}

describe('kompetisi benua', () => {
  it('jatah peserta: total pas, minimal 1 dan maksimal 4 per liga, liga kuat dapat lebih banyak', () => {
    for (const confed of ['UEFA', 'AFC'] as const) {
      const leagues = w.leagues.filter((l) => confedOf(l) === confed);
      for (const def of CONT_DEFS.filter((d) => d.confed === confed)) {
        const slots = slotsFor(leagues, def.teams);
        const vals = [...slots.values()];
        expect(vals.reduce((a, b) => a + b, 0)).toBe(def.teams);
        expect(Math.min(...vals)).toBeGreaterThanOrEqual(1);
        expect(Math.max(...vals)).toBeLessThanOrEqual(4);
        const sorted = [...leagues].sort((a, b) => b.reputation - a.reputation);
        for (let i = 1; i < sorted.length; i++) expect(slots.get(sorted[i - 1].id)!).toBeGreaterThanOrEqual(slots.get(sorted[i].id)!);
      }
      const e = entrantsFor(w, confed);
      const n = confed === 'UEFA' ? 32 : 16;
      expect(e[1]).toHaveLength(n);
      expect(e[2]).toHaveLength(n);
      expect(new Set([...e[1], ...e[2]]).size).toBe(2 * n);
    }
  });

  it('peserta diambil dari klasemen akhir musim lalu', () => {
    const eng = w.clubs.filter((c) => c.leagueId === 'ENG1').map((c) => c.id);
    const order = [...eng].reverse();
    const world: World = { ...w, finalTables: { ENG1: { season: '2025/26', order } } };
    const e = entrantsFor(world, 'UEFA');
    const n1 = e[1].filter((id) => eng.includes(id)).length;
    const n2 = e[2].filter((id) => eng.includes(id)).length;
    expect(e[1].filter((id) => eng.includes(id))).toEqual(order.slice(0, n1));
    expect(e[2].filter((id) => eng.includes(id))).toEqual(order.slice(n1, n1 + n2));
  });

  it('jadwal: grup 4 klub tanpa klub senegara, laga Selasa/Kamis, final hari Sabtu', () => {
    for (const def of CONT_DEFS) {
      const clubs = entrantsFor(w, def.confed)[def.tier];
      const c = createEdition(w, def, 2026, clubs, new Rng('jadwal'));
      expect(c.groups).toHaveLength(def.teams / 4);
      expect(new Set(c.groups.flatMap((g) => g.clubs))).toEqual(new Set(clubs));
      for (const g of c.groups) {
        expect(g.clubs).toHaveLength(4);
        expect(new Set(g.clubs.map(countryOf)).size).toBe(4);
        expect(g.fixtures).toHaveLength(6);
        // tiap klub bertemu tiap lawan dua kali, sekali kandang sekali tandang
        const pairs = g.fixtures.flat().map((t) => `${t.home}>${t.away}`);
        expect(new Set(pairs).size).toBe(12);
      }
      const dates = [...c.groupDates, ...c.ko.flatMap((r) => r.dates)];
      for (let i = 1; i < dates.length; i++) expect(dates[i] > dates[i - 1]).toBe(true);
      expect(dates.slice(0, -1).every((d) => weekday(d) === def.weekday)).toBe(true);
      expect(weekday(dates[dates.length - 1])).toBe(6);
      expect(c.ko[c.ko.length - 1].name).toBe('Final');
    }
  });

  it('satu musim penuh: semua babak selesai, peserta tiap babak = pemenang babak sebelumnya', () => {
    const run = () => {
      const { world, career, player } = start('CONTRUN');
      return runYear(world, career, player);
    };
    const a = run();
    expect(Object.keys(a.continental!)).toHaveLength(CONT_DEFS.length);
    for (const c of Object.values(a.continental!)) {
      expect(c.winner).toBeDefined();
      expect(c.groups.every((g) => g.fixtures.flat().every((t) => t.score))).toBe(true);
      // babak gugur pertama: juara grup vs runner-up grup lain
      const tables = c.groups.map(groupTable);
      const first = c.ko[0].ties;
      expect(new Set(first.map((t) => t.away))).toEqual(new Set(tables.map((t) => t[0].clubId)));
      expect(new Set(first.map((t) => t.home))).toEqual(new Set(tables.map((t) => t[1].clubId)));
      for (const t of first) expect(c.groups.find((g) => g.clubs.includes(t.home))).not.toBe(c.groups.find((g) => g.clubs.includes(t.away)));
      for (let r = 0; r < c.ko.length; r++) {
        expect(c.ko[r].ties.every((t) => contWinner(t))).toBe(true);
        if (r === 0) continue;
        const expected = new Set(c.ko[r - 1].ties.map((t) => contWinner(t)!));
        expect(new Set(c.ko[r].ties.flatMap((t) => [t.home, t.away]))).toEqual(expected);
      }
      const final = c.ko[c.ko.length - 1].ties;
      expect(final).toHaveLength(1);
      expect(final[0].legs).toHaveLength(1);
      expect(contWinner(final[0])).toBe(c.winner);
    }
    expect(a.contHonours).toHaveLength(CONT_DEFS.length);
    expect(run().continental).toEqual(a.continental);
  }, 60_000);

  it('laga klubmu dimainkan match engine dan tercatat sebagai "Kontinental"', () => {
    let { world, career } = start('CONTME');
    // jadikan pemain kita bintang senior klub Inggris peserta Liga Mahkota Eropa
    const clubId = entrantsFor(world, 'UEFA')[1].find((id) => countryOf(id) === 'ENG')!;
    const mate = world.players.find((q) => q.contract?.clubId === clubId && !q.isYouth)!;
    world = {
      ...world,
      players: world.players.map((q) => (q.isUser ? { ...q, isYouth: false, ca: 199, contract: { ...mate.contract! } } : q)),
    };
    const games: MatchRecord[] = [];
    let watched = 0;
    let sawNext = false;
    let sawQualified = false;
    for (let i = 0; i < 48 && !world.continental?.EU1?.winner; i++) {
      for (const m of pendingChoices(career)) ({ world, career } = resolveChoice(world, career, m.id, 0));
      ({ world, career } = advanceWeek(world, career));
      // (kotak masuk dibatasi; pesan lama bisa tergeser pesan baru di akhir musim)
      if (career.inbox.some((m) => m.title === 'Lolos ke Liga Mahkota Eropa')) sawQualified = true;
      const fresh = career.matches.filter((m) => m.comp === 'Kontinental' && !games.some((g) => g.date === m.date));
      games.push(...fresh);
      if (fresh.some((g) => g.date === career.lastSim?.date)) watched++;
      const next = nextContGame(world, clubId);
      if (next) {
        sawNext = true;
        expect(next.date > career.currentDate).toBe(true);
      }
    }
    expect(sawNext).toBe(true);
    // fase grup: 6 laga, semua hari Selasa
    expect(games.length).toBeGreaterThanOrEqual(6);
    for (const g of games) {
      expect(g.stage).toMatch(/^Liga Mahkota Eropa · /);
      expect([2, 6]).toContain(weekday(g.date));
    }
    expect(watched).toBeGreaterThan(0);
    const played = games.filter((g) => g.minutes > 0);
    const row = career.stats.find((s) => s.comp === 'Kontinental');
    expect(row?.apps ?? 0).toBe(played.length);
    expect(sawQualified).toBe(true);
    const c = world.continental!.EU1;
    if (c.winner === clubId && played.length) expect(career.trophies?.some((t) => t.id === `cont-${c.id}`)).toBe(true);
  }, 180_000);
});
