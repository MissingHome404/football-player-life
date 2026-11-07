import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { squadOf } from '../sim/season';
import { MAX_SUBS, Match, TUNE, pickXI, type ETeam } from '../sim/engine';
import { YELLOW_LIMIT, afterGame, banOf, serveBan } from '../sim/discipline';
import { rollCharacter } from '../gen/character';
import { advanceWeek, newCareer, pendingChoices, resolveChoice } from '../sim/week';
import { initRelations } from '../sim/relations';
import { careerCsv } from '../sim/retire';
import { statRow } from '../sim/match';
import { Rng } from '../rng';
import type { Career, MatchRecord, World } from '../types';
import type { Position } from '../data/attributes';

const w = generateWorld({ seed: 'DISC', activeLeagues: ['IDN1', 'ENG1'] });
const eng = w.clubs.filter((c) => c.leagueId === 'ENG1');
const team = (id: string, bench = true): ETeam => {
  const c = w.clubs.find((x) => x.id === id)!;
  const x = pickXI(squadOf(w, id).filter((p) => !p.isYouth), undefined, false);
  return { id, name: c.name, color: c.colors[0], color2: c.colors[1], xi: x.xi, ...(bench ? { bench: x.bench } : {}) };
};

/** Jalankan fn dengan peluang cedera yang lebih tinggi supaya cedera pasti terjadi di tes */
function withInjury<T>(v: number, fn: () => T): T {
  const old = TUNE.injury;
  TUNE.injury = v;
  try {
    return fn();
  } finally {
    TUNE.injury = old;
  }
}

function start(seed: string, position: Position = 'ST') {
  const roll = rollCharacter(w, { countryId: 'IDN', position }, seed);
  const world: World = { ...w, players: [...w.players, roll.player] };
  const career: Career = newCareer(roll, 0, 'test', w.startDate);
  career.rel = initRelations(world, career, roll.player);
  return { world, career };
}

const rec = (card: MatchRecord['card'], date = '2026-09-01'): MatchRecord => ({
  date,
  comp: 'Liga',
  season: '2026/27',
  team: 'Tim Kita',
  opponent: 'Tim Lawan',
  home: true,
  score: [1, 0],
  status: 'Inti',
  minutes: 90,
  rating: 6.5,
  goals: 0,
  assists: 0,
  card,
});

describe('cedera di dalam laga', () => {
  it('pemain cedera terkapar lalu diganti pemain cadangan seposisi (maksimal 5 pergantian)', () => {
    let injuries = 0;
    // v19: pelatih bisa menyusun ulang tempat pemain setelahnya; di tes ini pelatih tidak mengubah taktik
    const coach = TUNE.coach;
    TUNE.coach = 0;
    withInjury(0.15, () => {
      for (let i = 0; i < 6; i++) {
        const m = new Match({ seed: `inj-${i}`, home: team(eng[i].id), away: team(eng[10 + i].id) });
        const r = m.run();
        for (const e of r.events.filter((x) => x.kind === 'injury')) {
          injuries++;
          // nama singkat bisa kembar: cari berdasarkan waktu
          const out = m.bodies.find((b) => b.p.name === e.name && b.side === e.side && b.st.injured)!;
          expect(out.st.injured).toBe(1);
          // cedera di detik-detik terakhir: laga keburu selesai sebelum ia ditandu keluar
          if (out.on && m.t - e.t < 8) continue;
          expect(out.on).toBe(false);
          expect(out.st.off).toBeGreaterThanOrEqual(e.t);
          const sub = r.events.find((x) => x.kind === 'sub' && x.assist === e.name && x.side === e.side);
          if (!sub) continue; // jatah pergantian habis: tim main dengan 10 orang
          const inn = m.bodies.find((b) => b.p.name === sub.name && b.side === e.side && Math.abs(b.st.on - sub.t) < 1e-6)!;
          expect(inn.p.slot).toBe(out.p.slot);
          if (out.p.slot === 'GK') expect(inn.p.a.gk).toBeGreaterThan(3);
        }
        expect(m.subs[0]).toBeLessThanOrEqual(MAX_SUBS);
        expect(m.subs[1]).toBeLessThanOrEqual(MAX_SUBS);
      }
    });
    TUNE.coach = coach;
    expect(injuries).toBeGreaterThan(3);
  }, 30_000);

  it('tanpa pemain cadangan tim bermain dengan 10 orang', () => {
    let checked = 0;
    withInjury(0.15, () => {
      for (let i = 0; i < 8; i++) {
        const m = new Match({ seed: `nobench-${i}`, home: team(eng[i].id, false), away: team(eng[i + 1].id, false) });
        const r = m.run();
        expect(r.events.some((e) => e.kind === 'sub')).toBe(false);
        for (const side of [0, 1] as const) {
          const hurt = r.events.filter((e) => e.kind === 'injury' && e.side === side).length;
          const red = r.events.filter((e) => e.kind === 'red' && e.side === side).length;
          expect(m.bodies.filter((b) => b.on && b.side === side)).toHaveLength(11 - hurt - red);
          if (hurt) checked++;
        }
      }
    });
    expect(checked).toBeGreaterThan(0);
  });
});

describe('kartu dan skorsing', () => {
  it('kartu merah, dua kartu kuning, dan akumulasi kuning menjadi skorsing', () => {
    const { career } = start('BAN1');
    const rng = new Rng('ban');
    // kartu merah langsung: 1-3 laga klub
    afterGame(career, rec('R'), rng, 'club', statRow(career, '2026/27', 'Tim Kita', 'Liga'));
    const red = banOf(career, 'club');
    expect(red).toBeGreaterThanOrEqual(1);
    expect(red).toBeLessThanOrEqual(3);
    expect(career.inbox[0].title).toBe(`Skorsing ${red} laga`);
    expect(serveBan(career, 'club')).toBe(true);
    expect(banOf(career, 'club')).toBe(red - 1);
    while (serveBan(career, 'club'));
    expect(banOf(career, 'club')).toBe(0);
    expect(serveBan(career, 'club')).toBe(false);
    // dua kuning di laga timnas: 1 laga timnas, skorsing klub tidak berubah
    afterGame(career, { ...rec('YR'), comp: 'Timnas' }, rng, 'nat', statRow(career, '2026', 'Indonesia', 'Timnas'));
    expect(banOf(career, 'nat')).toBe(1);
    expect(banOf(career, 'club')).toBe(0);
    // akumulasi kuning: skorsing tepat di kuning ke-5 musim itu
    const row = statRow(career, '2026/27', 'Tim Kita', 'Liga');
    for (let i = 1; i <= YELLOW_LIMIT; i++) {
      afterGame(career, rec('Y', `2026-10-0${i}`), rng, 'club', row);
      expect(banOf(career, 'club')).toBe(i === YELLOW_LIMIT ? 1 : 0);
    }
    expect(row.yellow).toBe(YELLOW_LIMIT);
    expect(row.red).toBe(1);
  });

  it('pemain yang diskors absen di laga klub berikutnya', () => {
    let { world, career } = start('BAN2');
    career.ban = { club: 2, nat: 0 };
    const seen: MatchRecord[] = [];
    for (let i = 0; i < 60 && seen.length < 3; i++) {
      for (const m of pendingChoices(career)) ({ world, career } = resolveChoice(world, career, m.id, 0));
      const before = career.matches.length;
      ({ world, career } = advanceWeek(world, career));
      const club = career.matches.slice(0, career.matches.length - before).filter((m) => m.comp !== 'Timnas' && m.comp !== 'Timnas U20');
      seen.push(...club.reverse());
    }
    expect(seen.length).toBe(3);
    expect(seen[0].status).toBe('Skorsing');
    expect(seen[1].status).toBe('Skorsing');
    expect(seen[0].minutes).toBe(0);
    expect(seen[2].status).not.toBe('Skorsing');
    expect(banOf(career, 'club')).toBeLessThanOrEqual(seen.filter((m) => m.card === 'R').length * 3 + seen.filter((m) => m.card).length);
  }, 60_000);

  it('cedera di laga match engine membuatmu absen dan kartu masuk ke ekspor CSV', () => {
    let { world, career } = start('INJ3');
    let injuredRec: MatchRecord | undefined;
    withInjury(0.6, () => {
      for (let i = 0; i < 80 && !injuredRec; i++) {
        for (const m of pendingChoices(career)) ({ world, career } = resolveChoice(world, career, m.id, 0));
        ({ world, career } = advanceWeek(world, career));
        injuredRec = career.matches.find((m) => m.injured);
      }
    });
    expect(injuredRec).toBeDefined();
    expect(injuredRec!.minutes).toBeGreaterThan(0);
    expect(career.inbox.some((m) => m.from === 'Tim medis')).toBe(true);
    const row = career.stats.find((s) => s.comp === 'Liga') ?? career.stats[0];
    row.yellow = 4;
    row.red = 1;
    const csv = careerCsv(world, career, world.players.find((p) => p.isUser)!);
    expect(csv).toContain('Kartu kuning');
    expect(csv).toContain('Kartu merah');
  }, 60_000);
});
