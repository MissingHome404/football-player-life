// Kompetisi antarklub benua (nama fiktif): Eropa dan Asia, masing-masing dua tingkat.
// Jatah tiap liga dari reputasi liga, peserta dari klasemen akhir musim terakhir.
// Fase grup (4 klub, kandang-tandang), babak gugur dua leg, final satu laga di tempat netral.

import { trophyBonus } from './bonus';
import type { Career, ContComp, ContGroup, ContTie, CupHonour, League, Player, World } from '../types';
import { Rng } from '../rng';
import { addDays } from '../date';
import { COUNTRY_BY_ID } from '../data/countries';
import { clubStrengths, extraTime, makeFixtures, seasonForm, simScore } from './season';
import { playClubGame, recordClubGame, shootout, type CupGame } from './cup';
import { stageStakes } from './stakes';

export type Confed = 'UEFA' | 'AFC';

export interface ContDef {
  id: string;
  confed: Confed;
  tier: 1 | 2;
  name: string;
  teams: 32 | 16;
  /** hari laga: 2 = Selasa, 4 = Kamis */
  weekday: number;
  /** hadiah klub per kemenangan dan untuk juara (EUR) */
  prize: number;
}

export const CONT_DEFS: ContDef[] = [
  { id: 'EU1', confed: 'UEFA', tier: 1, name: 'Liga Mahkota Eropa', teams: 32, weekday: 2, prize: 2_800_000 },
  { id: 'EU2', confed: 'UEFA', tier: 2, name: 'Piala Perisai Eropa', teams: 32, weekday: 4, prize: 600_000 },
  { id: 'AS1', confed: 'AFC', tier: 1, name: 'Liga Mahkota Asia', teams: 16, weekday: 2, prize: 400_000 },
  { id: 'AS2', confed: 'AFC', tier: 2, name: 'Piala Perisai Asia', teams: 16, weekday: 4, prize: 100_000 },
];
export const CONT_BY_ID = Object.fromEntries(CONT_DEFS.map((d) => [d.id, d])) as Record<string, ContDef>;

/** Nama kompetisi benua; bisa diganti lewat editor nama (world.compNames[id]) */
export const contName = (world: Pick<World, 'compNames'>, def: ContDef) => world.compNames?.[def.id] ?? def.name;
export const confedOf = (league: League): Confed => (COUNTRY_BY_ID[league.countryId]?.confederation === 'AFC' ? 'AFC' : 'UEFA');

const pad = (n: number) => String(n).padStart(2, '0');
const weekdayOf = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay();
function onOrAfter(date: string, weekday: number): string {
  let d = date;
  while (weekdayOf(d) !== weekday) d = addDays(d, 1);
  return d;
}

/**
 * Jatah peserta per liga (metode D'Hondt dengan bobot reputasi, minimal 1, maksimal 4 per tingkat).
 * Liga terkuat juga mendapat jatah lebih banyak di tingkat kedua.
 */
export function slotsFor(leagues: League[], n: number): Map<string, number> {
  const out = new Map<string, number>(leagues.map((l) => [l.id, 1]));
  let left = n - leagues.length;
  while (left > 0) {
    let best: League | null = null;
    let bq = -1;
    for (const l of leagues) {
      const s = out.get(l.id)!;
      if (s >= 4) continue;
      const q = l.reputation ** 2 / (s + 1);
      if (q > bq) {
        bq = q;
        best = l;
      }
    }
    if (!best) break;
    out.set(best.id, out.get(best.id)! + 1);
    left--;
  }
  return out;
}

/** Peserta tiap tingkat: urutan klasemen akhir musim terakhir (atau kekuatan skuad kalau belum ada) */
export function entrantsFor(world: World, confed: Confed): Record<1 | 2, string[]> {
  const strength = clubStrengths(world);
  const leagues = world.leagues.filter((l) => confedOf(l) === confed).sort((a, b) => b.reputation - a.reputation);
  const size = (tier: 1 | 2) => CONT_DEFS.find((d) => d.confed === confed && d.tier === tier)!.teams;
  const s1 = slotsFor(leagues, size(1));
  const s2 = slotsFor(leagues, size(2));
  const out: Record<1 | 2, string[]> = { 1: [], 2: [] };
  for (const l of leagues) {
    const clubs = world.clubs.filter((c) => c.leagueId === l.id).map((c) => c.id);
    const table = world.finalTables?.[l.id]?.order.filter((id) => clubs.includes(id));
    const order = table?.length ? table : clubs.slice().sort((a, b) => (strength.get(b)?.senior ?? 0) - (strength.get(a)?.senior ?? 0));
    const a = s1.get(l.id) ?? 0;
    const b = s2.get(l.id) ?? 0;
    out[1].push(...order.slice(0, a));
    out[2].push(...order.slice(a, a + b));
  }
  return out;
}

const GROUP_NAMES = 'ABCDEFGH';

/** Undian grup: pot berdasarkan kekuatan, klub senegara sebisa mungkin tidak satu grup */
function drawGroups(world: World, clubs: string[], groups: number, strength: Map<string, { senior: number }>, rng: Rng): string[][] {
  const country = (id: string) => world.clubs.find((c) => c.id === id)?.countryId ?? '';
  const sorted = clubs.slice().sort((a, b) => (strength.get(b)?.senior ?? 0) - (strength.get(a)?.senior ?? 0));
  const out: string[][] = Array.from({ length: groups }, () => []);
  for (let pot = 0; pot < 4; pot++) {
    const list = rng.shuffle(sorted.slice(pot * groups, (pot + 1) * groups));
    for (const id of list) {
      const open = out.filter((g) => g.length === pot);
      const ok = open.filter((g) => !g.some((x) => country(x) === country(id)));
      (ok[0] ?? open[0]).push(id);
    }
  }
  return out;
}

/** Jadwal satu edisi: grup September-Desember, gugur Februari-Mei, final akhir Mei (Sabtu) */
export function createEdition(world: World, def: ContDef, year: number, clubs: string[], rng: Rng): ContComp {
  const strength = clubStrengths(world);
  const nGroups = def.teams / 4;
  const groupDates = ['09-16', '09-30', '10-21', '11-04', '11-25', '12-09'].map((md) => onOrAfter(`${year}-${md}`, def.weekday));
  const groups: ContGroup[] = drawGroups(world, clubs, nGroups, strength, rng).map((ids, i) => ({
    name: `Grup ${GROUP_NAMES[i]}`,
    clubs: ids,
    fixtures: makeFixtures(4).map((round) => round.map(([h, a]) => ({ home: ids[h], away: ids[a] }))),
  }));
  const y = year + 1;
  const legs = (a: string, b: string) => [onOrAfter(`${y}-${a}`, def.weekday), onOrAfter(`${y}-${b}`, def.weekday)];
  const ko =
    def.teams === 32
      ? [
          { name: '16 besar', dates: legs('02-17', '03-10'), ties: [] },
          { name: 'Perempat final', dates: legs('04-07', '04-14'), ties: [] },
          { name: 'Semifinal', dates: legs('04-28', '05-05'), ties: [] },
        ]
      : [
          { name: 'Perempat final', dates: legs('02-17', '03-10'), ties: [] },
          { name: 'Semifinal', dates: legs('04-07', '04-28'), ties: [] },
        ];
  ko.push({ name: 'Final', dates: [onOrAfter(`${y}-05-29`, 6)], ties: [] });
  return { id: `${def.id}:${year}`, comp: def.id, name: contName(world, def), season: `${year}/${pad(y % 100)}`, year, groupDates, groups, ko };
}

export interface GroupRow {
  clubId: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

export function groupTable(g: ContGroup): GroupRow[] {
  const rows = new Map<string, GroupRow>(g.clubs.map((id) => [id, { clubId: id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  for (const md of g.fixtures) {
    for (const t of md) {
      if (!t.score) continue;
      const h = rows.get(t.home)!;
      const a = rows.get(t.away)!;
      const [x, y] = t.score;
      h.p++;
      a.p++;
      h.gf += x;
      h.ga += y;
      a.gf += y;
      a.ga += x;
      if (x > y) {
        h.w++;
        h.pts += 3;
        a.l++;
      } else if (x < y) {
        a.w++;
        a.pts += 3;
        h.l++;
      } else {
        h.d++;
        a.d++;
        h.pts++;
        a.pts++;
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.clubId.localeCompare(b.clubId));
}

/** Agregat dua leg dari sudut pandang `home` */
export function aggregate(t: ContTie): [number, number] {
  let h = 0;
  let a = 0;
  for (const l of t.legs) {
    if (!l) continue;
    h += l[0];
    a += l[1];
  }
  return [h, a];
}

export function contWinner(t: ContTie): string | undefined {
  if (t.legs.some((l) => !l)) return undefined;
  const [h, a] = aggregate(t);
  if (h !== a) return h > a ? t.home : t.away;
  if (!t.pens) return undefined;
  return t.pens[0] > t.pens[1] ? t.home : t.away;
}

/**
 * Babak gugur pertama: juara grup melawan runner-up grup lain (sebisa mungkin juga beda negara).
 * Runner-up tuan rumah di leg pertama, juara grup tuan rumah di leg kedua.
 */
function firstKnockout(world: World, comp: ContComp, rng: Rng): ContTie[] {
  const tables = comp.groups.map(groupTable);
  const winners = tables.map((t) => t[0].clubId);
  const runners = tables.map((t, i) => ({ id: t[1].clubId, g: i }));
  const country = (id: string) => world.clubs.find((c) => c.id === id)?.countryId;
  for (const strict of [true, false]) {
    for (let k = 0; k < 60; k++) {
      const order = rng.shuffle(runners.slice());
      const ok = order.every((r, i) => r.g !== i && (!strict || country(r.id) !== country(winners[i])));
      if (ok) return winners.map((w, i) => ({ home: order[i].id, away: w, legs: [null, null] }));
    }
  }
  // cadangan: geser satu posisi supaya tidak pernah bertemu lawan satu grup
  return winners.map((w, i) => ({ home: runners[(i + 1) % runners.length].id, away: w, legs: [null, null] }));
}

function drawNext(winners: string[], final: boolean, rng: Rng): ContTie[] {
  const list = rng.shuffle(winners.slice());
  const ties: ContTie[] = [];
  for (let i = 0; i + 1 < list.length; i += 2) ties.push({ home: list[i], away: list[i + 1], legs: final ? [null] : [null, null] });
  return ties;
}

/** Edisi berjalan untuk tanggal ini (musim Juli-Juni) */
export const editionYear = (date: string) => {
  const y = +date.slice(0, 4);
  return +date.slice(5, 7) >= 7 ? y : y - 1;
};

/** Laga kompetisi benua berikutnya untuk sebuah klub */
export function nextContGame(world: World, clubId: string): { comp: ContComp; date: string; opp: string; home: boolean; stage: string } | null {
  let best: { comp: ContComp; date: string; opp: string; home: boolean; stage: string } | null = null;
  for (const comp of Object.values(world.continental ?? {})) {
    if (comp.winner) continue;
    const consider = (date: string, home: string, away: string, stage: string) => {
      if (home !== clubId && away !== clubId) return;
      if (best && best.date <= date) return;
      best = { comp, date, opp: home === clubId ? away : home, home: home === clubId, stage };
    };
    comp.groups.forEach((g) =>
      g.fixtures.forEach((md, i) => md.forEach((t) => !t.score && consider(comp.groupDates[i], t.home, t.away, `${g.name} · matchday ${i + 1}`))),
    );
    for (const r of comp.ko) {
      for (const t of r.ties) {
        t.legs.forEach((l, i) => {
          if (l) return;
          const leg = r.dates.length > 1 ? ` · leg ${i + 1}` : '';
          consider(r.dates[i], i === 0 ? t.home : t.away, i === 0 ? t.away : t.home, `${r.name}${leg}`);
        });
      }
    }
  }
  return best;
}

/**
 * Kompetisi benua minggu ini (from, to]: buat edisi baru tiap Juli, mainkan laga grup dan gugur,
 * undi babak berikutnya, catat juara. Laga klubmu dimainkan match engine kalau kamu masuk skuad.
 */
export function continentalWeek(
  world: World,
  career: Career,
  p: Player,
  from: string,
  to: string,
  rng: Rng,
  notes?: string[],
): { world: World; games: CupGame[] } {
  const strength = clubStrengths(world);
  const cont: Record<string, ContComp> = { ...(world.continental ?? {}) };
  const honours: CupHonour[] = [...(world.contHonours ?? [])];
  const games: CupGame[] = [];
  const clubs = [...world.clubs];
  let clubsChanged = false;
  const myClubId = p.contract && !p.isYouth ? p.contract.clubId : undefined;
  const nameOf = (id: string) => world.clubs.find((c) => c.id === id)?.name ?? id;
  const power = (id: string, year: number) => (strength.get(id)?.senior ?? 60) + seasonForm(id, year);
  const msg = (id: string, title: string, body: string, from: string) => {
    if (career.inbox.some((m) => m.id === id)) return;
    career.inbox.unshift({ id, date: to, from, title, body });
  };
  const year = editionYear(to);
  const wage = p.contract?.wagePerWeek ?? 0;
  const pay = (clubId: string, amount: number) => {
    const i = clubs.findIndex((c) => c.id === clubId);
    if (i < 0) return;
    clubs[i] = { ...clubs[i], finances: { ...clubs[i].finances, balance: clubs[i].finances.balance + amount } };
    clubsChanged = true;
  };

  for (const def of CONT_DEFS) {
    let comp = cont[def.id];
    if (!comp || comp.year < year) {
      const entrants = entrantsFor(world, def.confed)[def.tier];
      comp = createEdition(world, def, year, entrants, new Rng(`${world.seed}:cont:${def.id}:${year}`));
      if (myClubId && entrants.includes(myClubId)) {
        msg(
          `cont-in-${comp.id}`,
          `Lolos ke ${comp.name}`,
          `${nameOf(myClubId)} akan bermain di ${comp.name} ${comp.season}. Hasil undian: ${comp.groups.find((g) => g.clubs.includes(myClubId))!.name}.`,
          comp.name,
        );
      }
    } else if (comp.winner) {
      continue;
    } else {
      comp = structuredClone(comp);
    }
    const mine = !!myClubId && comp.groups.some((g) => g.clubs.includes(myClubId));
    const isMine = (h: string, a: string) => mine && (h === myClubId || a === myClubId);

    // laga (h kandang, a tandang); neutral = final. Mengembalikan skor [h, a]
    // ko = laga gugur penentu (final satu leg, atau leg kedua dengan agregat leg pertama [h, a])
    const play = (h: string, a: string, date: string, live: boolean, stage: string, neutral: boolean, trng: Rng, ko?: { agg?: [number, number] }): [number, number] => {
      const ph = power(h, comp.year);
      const pa = power(a, comp.year);
      let score: [number, number] = neutral && trng.chance(0.5) ? (simScore(trng, pa, ph).reverse() as [number, number]) : simScore(trng, ph, pa);
      if (live && isMine(h, a)) {
        const home = h === myClubId;
        const g = playClubGame({
          world,
          career,
          p,
          oppId: home ? a : h,
          home,
          neutral,
          date,
          comp: 'Kontinental',
          season: comp.season,
          stage: `${comp.name} · ${stage}`,
          stakes: stageStakes(stage, 0.55),
          quick: home ? score : [score[1], score[0]],
          bonus: 0,
          rng,
          tag: def.id,
          ...(ko ? { ko: { edge: home ? ph - pa : pa - ph, agg: ko.agg && (home ? ko.agg : ([ko.agg[1], ko.agg[0]] as [number, number])) } } : {}),
        });
        score = home ? g.rec.score : [g.rec.score[1], g.rec.score[0]];
        pending.push(g);
      }
      // hadiah klub per kemenangan
      if (score[0] !== score[1]) pay(score[0] > score[1] ? h : a, def.prize * 0.5);
      return score;
    };
    const pending: CupGame[] = [];
    const settle = () => {
      for (const g of pending.splice(0)) {
        recordClubGame(career, g.rec, myClubId!, rng, notes, p);
        // bonus menang untuk pemain yang ikut main
        if (g.rec.minutes > 0 && wage > 0) {
          const won = g.rec.score[0] > g.rec.score[1] || (g.rec.pens && g.rec.pens[0] > g.rec.pens[1]);
          if (won) {
            const bonus = Math.round(wage * (def.tier === 1 ? 0.5 : 0.3));
            career.money = Math.round((career.money + bonus) * 100) / 100;
            notes?.push(`Bonus kemenangan ${comp.name}: €${bonus.toLocaleString('id-ID')}.`);
          }
        }
        games.push(g);
      }
    };

    // fase grup
    let stop = false;
    for (let md = 0; md < comp.groupDates.length && !stop; md++) {
      const date = comp.groupDates[md];
      if (date > to) {
        stop = true;
        break;
      }
      const live = date > from;
      const trng = new Rng(`${world.seed}:cont:${comp.id}:g${md}`);
      for (const g of comp.groups) {
        for (const t of g.fixtures[md]) {
          if (t.score) continue;
          t.score = play(t.home, t.away, date, live, `${g.name} · matchday ${md + 1}`, false, trng);
        }
      }
      settle();
    }
    if (!stop && comp.ko[0].ties.length === 0 && comp.groups.every((g) => g.fixtures.every((md) => md.every((t) => t.score)))) {
      comp.ko[0].ties = firstKnockout(world, comp, new Rng(`${world.seed}:cont:${comp.id}:draw0`));
      if (mine) {
        const t = comp.ko[0].ties.find((x) => x.home === myClubId || x.away === myClubId);
        msg(
          `cont-ko-${comp.id}-0`,
          t ? `${comp.name}: lolos ke ${comp.ko[0].name}` : `Tersingkir dari ${comp.name}`,
          t
            ? `${nameOf(myClubId!)} lolos dari fase grup dan akan melawan ${nameOf(t.home === myClubId ? t.away : t.home)}.`
            : `${nameOf(myClubId!)} gagal lolos dari fase grup ${comp.name}.`,
          comp.name,
        );
      }
    }

    // babak gugur
    for (let r = 0; r < comp.ko.length && !stop; r++) {
      const round = comp.ko[r];
      if (!round.ties.length) break;
      const final = r === comp.ko.length - 1;
      for (let leg = 0; leg < round.dates.length; leg++) {
        const date = round.dates[leg];
        if (date > to) {
          stop = true;
          break;
        }
        if (round.ties.every((t) => t.legs[leg])) continue;
        const live = date > from;
        const trng = new Rng(`${world.seed}:cont:${comp.id}:k${r}:${leg}`);
        for (const t of round.ties) {
          if (t.legs[leg]) continue;
          const legName = round.dates.length > 1 ? ` · leg ${leg + 1}` : '';
          // leg 1 di kandang `home`, leg 2 di kandang `away`
          const last = leg === round.dates.length - 1;
          if (leg === 0) t.legs[0] = play(t.home, t.away, date, live, `${round.name}${legName}`, final, trng, last ? {} : undefined);
          else {
            // leg kedua: tuan rumahnya `away`, agregat leg pertama dari sudut pandang laga ini
            const s = play(t.away, t.home, date, live, `${round.name}${legName}`, false, trng, { agg: [t.legs[0]![1], t.legs[0]![0]] });
            t.legs[1] = [s[1], s[0]];
          }
          if (last) {
            // v20 laga klubmu sudah diselesaikan match engine (perpanjangan waktu & adu penalti)
            const g = isMine(t.home, t.away) ? pending.find((x) => x.rec.date === date) : undefined;
            const home = t.home === myClubId;
            if (g?.rec.aet) t.aet = true;
            if (g?.rec.pens) t.pens = home ? g.rec.pens : [g.rec.pens[1], g.rec.pens[0]];
            let [h, a] = aggregate(t);
            if (h === a && !t.pens && !t.aet) {
              // perpanjangan waktu di leg terakhir (simulasi cepat), dari sudut pandang tuan rumah leg itu
              const lh = leg === 0 ? t.home : t.away;
              const la = leg === 0 ? t.away : t.home;
              const x = extraTime(trng, power(lh, comp.year), power(la, comp.year));
              const l = t.legs[leg]!;
              t.legs[leg] = leg === 0 ? [l[0] + x[0], l[1] + x[1]] : [l[0] + x[1], l[1] + x[0]];
              t.aet = true;
              [h, a] = aggregate(t);
            }
            if (h === a && !t.pens) t.pens = shootout(trng, power(t.home, comp.year) - power(t.away, comp.year));
            if (g && t.pens && !g.rec.pens) g.rec.pens = home ? t.pens : [t.pens[1], t.pens[0]];
          }
        }
        settle();
      }
      if (stop || round.ties.some((t) => !contWinner(t))) break;
      const winners = round.ties.map((t) => contWinner(t)!);
      if (final) {
        const t = round.ties[0];
        comp.winner = winners[0];
        comp.runnerUp = comp.winner === t.home ? t.away : t.home;
        honours.push({ leagueId: def.id, name: comp.name, season: comp.season, winnerId: comp.winner, runnerUpId: comp.runnerUp });
        pay(comp.winner, def.prize * 4);
        if (mine) contEnd(world, career, comp, myClubId!, msg, p, to, notes);
        break;
      }
      const next = comp.ko[r + 1];
      if (!next.ties.length) {
        next.ties = drawNext(winners, r + 1 === comp.ko.length - 1, new Rng(`${world.seed}:cont:${comp.id}:draw${r + 1}`));
        if (mine) {
          const out = round.ties.find((t) => (t.home === myClubId || t.away === myClubId) && contWinner(t) !== myClubId);
          const t = next.ties.find((x) => x.home === myClubId || x.away === myClubId);
          if (out) {
            msg(`cont-out-${comp.id}`, `Tersingkir dari ${comp.name}`, `${nameOf(myClubId!)} tersingkir di ${round.name.toLowerCase()} ${comp.name}.`, comp.name);
          } else if (t) {
            msg(
              `cont-ko-${comp.id}-${r + 1}`,
              `${comp.name}: ${next.name}`,
              `${nameOf(myClubId!)} lolos ke ${next.name.toLowerCase()} dan akan melawan ${nameOf(t.home === myClubId ? t.away : t.home)}.`,
              comp.name,
            );
          }
        }
      }
    }
    cont[def.id] = comp;
  }
  const out: World = { ...world, continental: cont, contHonours: honours };
  if (clubsChanged) out.clubs = clubs;
  return { world: out, games };
}

/** Final selesai: trofi kalau klubmu juara dan kamu ikut bermain di edisi ini */
function contEnd(world: World, career: Career, comp: ContComp, clubId: string, msg: (id: string, title: string, body: string, from: string) => void, p: Player, date: string, notes?: string[]) {
  const name = (id: string) => world.clubs.find((c) => c.id === id)?.name ?? id;
  const club = name(clubId);
  const played = career.stats.some((s) => s.comp === 'Kontinental' && s.season === comp.season && s.clubId === clubId && s.apps > 0);
  if (comp.winner === clubId) {
    let body = `${club} juara ${comp.name} ${comp.season} setelah mengalahkan ${name(comp.runnerUp!)} di final!`;
    if (played) {
      (career.trophies ??= []).push({ id: `cont-${comp.id}`, name: comp.name, season: comp.season, team: club });
      trophyBonus(career, p, clubId, comp.name, date, notes);
      body += ' Kamu ikut membawa timmu menjadi juara benua.';
    }
    msg(`cont-win-${comp.id}`, `Juara ${comp.name}!`, body, comp.name);
  } else if (comp.runnerUp === clubId) {
    msg(`cont-out-${comp.id}`, `Kalah di final ${comp.name}`, `${club} kalah dari ${name(comp.winner!)} di final ${comp.name} ${comp.season}.`, comp.name);
  }
}
