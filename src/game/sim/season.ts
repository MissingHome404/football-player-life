// Musim liga: jadwal kandang-tandang, simulasi cepat hasil pertandingan,
// klasemen, dan pergantian musim (pemain AI berkembang, menua, pensiun,
// pemain muda baru masuk, skuad diisi ulang).

import type { Honour, League, LeagueSeason, Player, World } from '../types';
import type { Position } from '../data/attributes';
import { GOALKEEPING, MENTAL, PHYSICAL, TECHNICAL } from '../data/attributes';
import { Rng, clamp } from '../rng';
import { addDays, firstSaturday, yearOf } from '../date';
import { ageOn, clonePlayer, computeCA, generatePlayer } from '../gen/player';
import { SQUAD, YOUTH, clubStarterCA, foreignPoolFor, wageFor } from '../gen/world';

export const seasonLabel = (year: number, startMonth: number) =>
  startMonth >= 7 ? `${year}/${String((year + 1) % 100).padStart(2, '0')}` : String(year);

export const roundDate = (s: LeagueSeason, r: number) => addDays(s.startDate, 7 * r);
export const seasonEnd = (s: LeagueSeason) => roundDate(s, s.rounds.length - 1);

/** Jadwal round-robin ganda (metode lingkaran). Indeks -1 = libur. */
export function makeFixtures(n: number): [number, number][][] {
  const arr = Array.from({ length: n }, (_, i) => i);
  if (n % 2) arr.push(-1);
  const N = arr.length;
  const half: [number, number][][] = [];
  for (let r = 0; r < N - 1; r++) {
    const round: [number, number][] = [];
    for (let i = 0; i < N / 2; i++) {
      const a = arr[i];
      const b = arr[N - 1 - i];
      if (a < 0 || b < 0) continue;
      const flip = i === 0 ? r % 2 === 1 : i % 2 === 1;
      round.push(flip ? [b, a] : [a, b]);
    }
    half.push(round);
    arr.splice(1, 0, arr.pop()!);
  }
  return [...half, ...half.map((round) => round.map(([h, a]) => [a, h] as [number, number]))];
}

export function newSeason(league: League, clubIds: string[], year: number, rng: Rng): LeagueSeason {
  const clubs = rng.shuffle(clubIds.slice());
  const rounds = makeFixtures(clubs.length);
  return {
    leagueId: league.id,
    year,
    label: seasonLabel(year, league.seasonStartMonth),
    startDate: firstSaturday(year, league.seasonStartMonth),
    clubs,
    rounds,
    results: rounds.map((r) => r.map(() => null)),
  };
}

function poisson(rng: Rng, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L && k < 12);
  return k - 1;
}

/** Skor pertandingan dari kekuatan dua tim (rata-rata CA 11 terbaik) */
export function simScore(rng: Rng, home: number, away: number): [number, number] {
  const d = (home - away) / 30;
  return [poisson(rng, 1.4 * Math.exp(0.5 * d)), poisson(rng, 1.1 * Math.exp(-0.45 * d))];
}

/** v20 perpanjangan waktu 2 x 15 menit (simulasi cepat): sepertiga laga, pemain sudah lelah */
export function extraTime(rng: Rng, home: number, away: number): [number, number] {
  const d = (home - away) / 30;
  return [poisson(rng, 0.38 * Math.exp(0.5 * d)), poisson(rng, 0.3 * Math.exp(-0.45 * d))];
}

/** Rata-rata CA 11 pemain terbaik */
export function topEleven(cas: number[]): number {
  const top = cas.sort((a, b) => b - a).slice(0, 11);
  return top.length ? top.reduce((s, v) => s + v, 0) / top.length : 40;
}

/** Pemain per klub. Disimpan per array pemain, jadi dihitung ulang hanya kalau dunia berubah. */
const squadCache = new WeakMap<Player[], Map<string, Player[]>>();
export function squadsOf(world: World): Map<string, Player[]> {
  let m = squadCache.get(world.players);
  if (!m) {
    m = new Map();
    for (const p of world.players) {
      const id = p.contract?.clubId;
      if (!id) continue;
      if (!m.has(id)) m.set(id, []);
      m.get(id)!.push(p);
    }
    squadCache.set(world.players, m);
  }
  return m;
}
export const squadOf = (world: World, clubId: string) => squadsOf(world).get(clubId) ?? [];

/** Kekuatan tim senior dan U19 setiap klub (disimpan per array pemain) */
const strengthCache = new WeakMap<Player[], Map<string, { senior: number; youth: number }>>();
function strengthOf(squad: Player[]) {
  const senior: number[] = [];
  const youth: number[] = [];
  for (const p of squad) (p.isYouth ? youth : senior).push(p.ca);
  return { senior: topEleven(senior), youth: topEleven(youth) };
}
export function clubStrengths(world: World) {
  let out = strengthCache.get(world.players);
  if (!out) {
    const squads = squadsOf(world);
    out = new Map();
    for (const c of world.clubs) out.set(c.id, strengthOf(squads.get(c.id) ?? []));
    strengthCache.set(world.players, out);
  }
  return out;
}

/**
 * Ganti satu pemain di dunia dengan salinan yang sudah diubah. Cache skuad dan kekuatan
 * klub ikut diperbarui hanya untuk klub yang terkena, supaya minggu berikutnya tetap cepat.
 */
export function replacePlayer(world: World, player: Player): World {
  const players = world.players.slice();
  const i = players.findIndex((p) => p.id === player.id);
  const old = players[i];
  players[i] = player;
  const squads = squadCache.get(world.players);
  if (squads) {
    const next = new Map(squads);
    const from = old.contract?.clubId;
    const to = player.contract?.clubId;
    const touched = [...new Set([from, to].filter((x): x is string => !!x))];
    if (from === to && from) {
      next.set(from, (next.get(from) ?? []).map((p) => (p.id === player.id ? player : p)));
    } else {
      for (const id of touched) next.set(id, players.filter((p) => p.contract?.clubId === id));
    }
    squadCache.set(players, next);
    const str = strengthCache.get(world.players);
    if (str) {
      const ns = new Map(str);
      for (const id of touched) ns.set(id, strengthOf(next.get(id) ?? []));
      strengthCache.set(players, ns);
    }
  }
  return { ...world, players };
}

export interface PlayedFixture {
  leagueId: string;
  season: string;
  clubId: string;
  opponentId: string;
  home: boolean;
  score: [number, number]; // [klub ini, lawan]
  date: string;
  round: number;
  index: number; // urutan laga di ronde (untuk mengganti skor dengan hasil match engine)
}

// Naik-turun performa tim per musim (manajer baru, chemistry, keberuntungan), supaya juara tidak selalu sama
const formCache = new Map<string, number>();
export function seasonForm(clubId: string, year: number): number {
  const key = `${clubId}:${year}`;
  let v = formCache.get(key);
  if (v === undefined) {
    v = new Rng(`form:${key}`).normal(0, 3.5);
    formCache.set(key, v);
  }
  return v;
}

function playRound(
  season: LeagueSeason,
  r: number,
  strength: Map<string, { senior: number }>,
  rng: Rng,
  played?: Map<string, PlayedFixture>,
): LeagueSeason {
  const results = season.results.slice();
  results[r] = season.rounds[r].map(([h, a], index) => {
    const hid = season.clubs[h];
    const aid = season.clubs[a];
    const hs = (strength.get(hid)?.senior ?? 60) + seasonForm(hid, season.year);
    const as = (strength.get(aid)?.senior ?? 60) + seasonForm(aid, season.year);
    const score = simScore(rng, hs, as);
    if (played) {
      const base = { leagueId: season.leagueId, season: season.label, date: roundDate(season, r), round: r, index };
      played.set(hid, { ...base, clubId: hid, opponentId: aid, home: true, score });
      played.set(aid, { ...base, clubId: aid, opponentId: hid, home: false, score: [score[1], score[0]] });
    }
    return score;
  });
  return { ...season, results };
}

/** Jadwal musim pertama setiap liga. Musim yang sudah berjalan langsung diisi hasilnya. */
export function createSeasons(world: World, date: string, rng: Rng): Record<string, LeagueSeason> {
  const strength = clubStrengths(world);
  const out: Record<string, LeagueSeason> = {};
  for (const league of world.leagues) {
    const clubIds = world.clubs.filter((c) => c.leagueId === league.id).map((c) => c.id);
    const y = yearOf(date);
    let season = newSeason(league, clubIds, y + 1, rng.fork(league.id));
    for (const yy of [y - 1, y]) {
      const s = newSeason(league, clubIds, yy, rng.fork(`${league.id}:${yy}`));
      if (seasonEnd(s) > date) {
        season = s;
        break;
      }
    }
    for (let r = 0; r < season.rounds.length && roundDate(season, r) <= date; r++) {
      season = playRound(season, r, strength, rng);
    }
    out[league.id] = season;
  }
  return out;
}

export interface WeekMatches {
  seasons: Record<string, LeagueSeason>;
  played: Map<string, PlayedFixture>; // per klub
  leaguesPlayed: Map<string, string>; // liga -> tanggal pekan yang dimainkan
  finished: string[]; // liga yang musimnya selesai minggu ini
}

/** Mainkan semua pekan liga yang jatuh di antara (from, to] */
export function playWeek(world: World, from: string, to: string, rng: Rng): WeekMatches {
  const strength = clubStrengths(world);
  const played = new Map<string, PlayedFixture>();
  const leaguesPlayed = new Map<string, string>();
  const finished: string[] = [];
  const seasons = { ...world.seasons };
  for (const league of world.leagues) {
    let s = seasons[league.id];
    if (!s) continue;
    for (let r = 0; r < s.rounds.length; r++) {
      const d = roundDate(s, r);
      if (d <= from || d > to || s.results[r].every((x) => x)) continue;
      s = playRound(s, r, strength, rng.fork(`${league.id}:${s.year}:${r}`), played);
      leaguesPlayed.set(league.id, d);
      if (r === s.rounds.length - 1) finished.push(league.id);
    }
    seasons[league.id] = s;
  }
  return { seasons, played, leaguesPlayed, finished };
}

export interface TableRow {
  clubId: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

export function standings(s: LeagueSeason, nameOf?: (id: string) => string): TableRow[] {
  const rows = s.clubs.map((clubId) => ({ clubId, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
  s.rounds.forEach((round, r) =>
    round.forEach(([h, a], i) => {
      const res = s.results[r][i];
      if (!res) return;
      const [hg, ag] = res;
      const H = rows[h];
      const A = rows[a];
      H.p++;
      A.p++;
      H.gf += hg;
      H.ga += ag;
      A.gf += ag;
      A.ga += hg;
      if (hg > ag) {
        H.w++;
        A.l++;
        H.pts += 3;
      } else if (hg < ag) {
        A.w++;
        H.l++;
        A.pts += 3;
      } else {
        H.d++;
        A.d++;
        H.pts++;
        A.pts++;
      }
    }),
  );
  return rows.sort(
    (x, y) =>
      y.pts - x.pts ||
      y.gf - y.ga - (x.gf - x.ga) ||
      y.gf - x.gf ||
      (nameOf ? nameOf(x.clubId).localeCompare(nameOf(y.clubId)) : 0),
  );
}

/** Pekan terakhir yang sudah dimainkan (-1 kalau belum ada) */
export function lastPlayedRound(s: LeagueSeason): number {
  let last = -1;
  s.results.forEach((r, i) => {
    if (r.every((x) => x)) last = i;
  });
  return last;
}

// ---------------------------------------------------------------------------
// Pergantian musim

function stochRound(rng: Rng, v: number) {
  const f = Math.floor(v);
  return f + (rng.next() < v - f ? 1 : 0);
}

/** Satu tahun perkembangan pemain AI: naik saat muda, turun setelah 30 */
export function developYear(p: Player, age: number, rng: Rng) {
  const gap = Math.max(0, p.pa - p.ca);
  let target = p.ca;
  if (age <= 17) target += gap * 0.22 * rng.float(0.5, 1.4);
  else if (age <= 20) target += gap * 0.2 * rng.float(0.5, 1.4);
  else if (age <= 23) target += gap * 0.15 * rng.float(0.5, 1.4);
  else if (age <= 27) target += gap * 0.08 * rng.float(0.3, 1.4);
  else if (age >= 31) target -= (age - 30) * rng.float(1.2, 3.2) * (p.mainPosition === 'GK' ? 0.6 : 1);
  const delta = Math.round(target) - p.ca;
  if (!delta) return;
  const d = delta / 11.5;
  const grow = delta > 0;
  const groups = [
    [p.technical, TECHNICAL, grow ? 1 : 0.8],
    [p.mental, MENTAL, grow ? 1.1 : 0.2],
    [p.physical, PHYSICAL, grow ? (age <= 23 ? 1 : 0.5) : 1.8],
    ...(p.mainPosition === 'GK' ? [[p.goalkeeping, GOALKEEPING, grow ? 1 : 0.9]] : []),
  ] as [Record<string, number>, readonly string[], number][];
  for (const [rec, keys, mult] of groups) {
    for (const k of keys) rec[k] = clamp(rec[k] + stochRound(rng, d * mult), 1, 20);
  }
  p.ca = computeCA(p);
  if (p.ca > p.pa) p.pa = p.ca;
}

function contractRoles(squad: Player[]) {
  const seniors = squad.filter((p) => !p.isYouth && !p.isUser).sort((a, b) => b.ca - a.ca);
  seniors.forEach((p, rank) => {
    if (!p.contract) return;
    p.contract.role = rank < 11 ? 'Inti' : rank < 18 ? 'Rotasi' : 'Pelapis';
  });
}

/**
 * Akhir musim sebuah liga: catat juara, kembangkan pemain AI, pensiun,
 * promosi/lepas pemain U19, isi ulang skuad, lalu jadwalkan musim berikutnya.
 */
export function rolloverLeagues(world: World, leagueIds: string[], date: string, rng: Rng): { world: World; honours: Honour[] } {
  if (!leagueIds.length) return { world, honours: [] };
  const ids = new Set(leagueIds);
  const clubLeague = new Map(world.clubs.filter((c) => ids.has(c.leagueId)).map((c) => [c.id, c.leagueId]));
  const kept: Player[] = [];
  const squads = new Map<string, Player[]>();
  const year = yearOf(date);

  for (const p of world.players) {
    const clubId = p.contract?.clubId;
    if (!clubId || !clubLeague.has(clubId) || p.isUser) {
      kept.push(p);
      if (p.isUser && clubId && clubLeague.has(clubId)) {
        if (!squads.has(clubId)) squads.set(clubId, []);
        squads.get(clubId)!.push(p);
      }
      continue;
    }
    const prng = rng.fork(`${p.id}:${year}`);
    const age = ageOn(p.birthDate, date);
    // pensiun
    const retireAge = p.mainPosition === 'GK' ? age - 2 : age;
    if (age >= 40 || (retireAge >= 30 && prng.chance(0.04 + (retireAge - 30) * 0.1))) continue;
    const q: Player = clonePlayer(p);
    developYear(q, age, prng);
    if (q.contract && q.contract.expires <= date) q.contract.expires = `${year + prng.int(1, 3)}-06-30`;
    kept.push(q);
    if (!squads.has(clubId)) squads.set(clubId, []);
    squads.get(clubId)!.push(q);
  }

  // Pemain AI yang terlalu bagus untuk klubnya dibeli klub yang lebih kuat (versi sederhana
  // sebelum ada bursa transfer sungguhan)
  const strength = clubStrengths(world);
  const byStrength = world.clubs
    .map((c) => ({ c, s: strength.get(c.id)!.senior, league: world.leagues.find((l) => l.id === c.leagueId)! }))
    .sort((a, b) => a.s - b.s);
  for (const [clubId, squad] of squads) {
    const own = strength.get(clubId)!.senior;
    for (const p of squad.slice()) {
      if (p.isUser || p.isYouth || p.ca < own + 8) continue;
      const trng = rng.fork(`move:${p.id}:${year}`);
      if (!trng.chance(0.6)) continue;
      const targets = byStrength.filter((x) => x.c.id !== clubId && x.s >= p.ca - 6 && x.s <= p.ca + 8);
      if (!targets.length) continue;
      const to = trng.pick(targets);
      p.contract = { clubId: to.c.id, wagePerWeek: wageFor(p.ca, to.league, to.c.reputation), expires: `${year + trng.int(3, 5)}-06-30`, role: 'Rotasi' };
      squad.splice(squad.indexOf(p), 1);
      squads.get(to.c.id)?.push(p);
    }
  }

  const removed = new Set<string>();
  for (const club of world.clubs) {
    const leagueId = clubLeague.get(club.id);
    if (!leagueId) continue;
    const league = world.leagues.find((l) => l.id === leagueId)!;
    const crng = rng.fork(`${club.id}:${year}`);
    const squad = squads.get(club.id) ?? [];
    const starter = clamp(clubStarterCA(league.reputation, club.reputation), 40, 192);
    const seniorCAs = squad.filter((p) => !p.isYouth).map((p) => p.ca).sort((a, b) => b - a);
    const cutoff = seniorCAs[Math.min(17, seniorCAs.length - 1)] ?? starter - 20;

    // U19 yang sudah 19 tahun: naik ke senior atau dilepas
    for (const p of squad) {
      if (!p.isYouth || p.isUser || ageOn(p.birthDate, date) < 19) continue;
      if (p.ca >= cutoff - 12) {
        p.isYouth = false;
        p.contract = { clubId: club.id, wagePerWeek: wageFor(p.ca, league, club.reputation), expires: `${year + 3}-06-30`, role: 'Pelapis' };
      } else {
        removed.add(p.id);
      }
    }
    const active = squad.filter((p) => !removed.has(p.id));
    const pool = foreignPoolFor(league.countryId);
    let n = 0;
    const newId = () => `${club.id}-${year}-${n++}`;

    // Isi ulang skuad senior (anggap saja transfer masuk), posisi yang kurang diisi dulu
    const seniors = active.filter((p) => !p.isYouth);
    const deficits: Position[] = [];
    for (const [pos, want] of SQUAD) {
      for (let k = seniors.filter((p) => p.mainPosition === pos).length; k < want; k++) deficits.push(pos);
    }
    crng.shuffle(deficits);
    // koreksi supaya kekuatan liga tidak pelan-pelan naik/turun dari musim ke musim
    const drift = starter - topEleven(seniors.map((p) => p.ca));
    while (seniors.length < 25 && deficits.length) {
      const pos = deficits.pop()!;
      const age = crng.int(19, 28);
      const ca = Math.round(starter - crng.int(0, 24) + clamp(drift, -15, 15) * 0.7 + crng.normal(0, 4));
      const p = generatePlayer(crng, {
        id: newId(),
        countryId: crng.chance(league.foreignShare) ? crng.weighted(pool) : league.countryId,
        position: pos,
        age,
        targetCA: clamp(ca, 20, 195),
        refDate: date,
      });
      p.contract = { clubId: club.id, wagePerWeek: wageFor(p.ca, league, club.reputation), expires: `${year + crng.int(2, 4)}-06-30`, role: 'Rotasi' };
      active.push(p);
      seniors.push(p);
      kept.push(p);
    }
    // Skuad terlalu gemuk: lepas pemain terlemah (pemain tua lebih dulu)
    const gks = () => seniors.filter((p) => p.mainPosition === 'GK' && !removed.has(p.id)).length;
    const cands = seniors
      .filter((p) => !p.isUser)
      .sort((a, b) => a.ca - (ageOn(a.birthDate, date) >= 30 ? 8 : 0) - (b.ca - (ageOn(b.birthDate, date) >= 30 ? 8 : 0)));
    let excess = seniors.length - 26;
    for (const p of cands) {
      if (excess <= 0) break;
      if (p.mainPosition === 'GK' && gks() <= 2) continue;
      removed.add(p.id);
      excess--;
    }

    // Pemain muda baru dari akademi
    const youthLeft = YOUTH.slice();
    for (const p of active.filter((x) => x.isYouth)) {
      const i = youthLeft.indexOf(p.mainPosition);
      if (i >= 0) youthLeft.splice(i, 1);
    }
    const youthNow = active.filter((x) => x.isYouth).length;
    for (const pos of youthLeft.slice(0, Math.max(0, 12 - youthNow))) {
      const ca = clamp(Math.round(starter * 0.38 + club.facilities.youth * 4 + crng.normal(0, 8)), 20, 120);
      const p = generatePlayer(crng, {
        id: newId(),
        countryId: crng.chance(0.08) ? crng.weighted(pool) : league.countryId,
        position: pos,
        age: crng.int(15, 16),
        targetCA: ca,
        refDate: date,
        isYouth: true,
      });
      p.pa = clamp(Math.round(p.pa + club.facilities.youth * 1.5 + (crng.chance(0.02) ? crng.int(10, 30) : 0)), p.ca, 200);
      p.contract = { clubId: club.id, wagePerWeek: Math.max(20, Math.round(wageFor(p.ca, league, club.reputation) * 0.3)), expires: `${year + 2}-06-30`, role: 'Pemain muda' };
      active.push(p);
      kept.push(p);
    }
    contractRoles(active.filter((p) => !removed.has(p.id)));
    for (const p of active) {
      if (p.isUser) continue;
      p.reputation.home = clamp(Math.round(club.reputation * 0.5 + (p.ca / 200) * 50 - (p.isYouth ? 25 : 0)), 1, 100);
    }
  }

  // Juara dan musim berikutnya
  const honours: Honour[] = [];
  const seasons = { ...world.seasons };
  const finalTables = { ...(world.finalTables ?? {}) };
  for (const id of leagueIds) {
    const s = world.seasons[id];
    const table = standings(s);
    honours.push({ leagueId: id, season: s.label, championId: table[0].clubId, runnerUpId: table[1].clubId });
    finalTables[id] = { season: s.label, order: table.map((r) => r.clubId) };
    const league = world.leagues.find((l) => l.id === id)!;
    const clubIds = world.clubs.filter((c) => c.leagueId === id).map((c) => c.id);
    let next = newSeason(league, clubIds, s.year + 1, rng.fork(`${id}:${s.year + 1}`));
    if (next.startDate <= date) next = newSeason(league, clubIds, s.year + 2, rng.fork(`${id}:${s.year + 2}`));
    seasons[id] = next;
  }

  return {
    world: {
      ...world,
      players: kept.filter((p) => !removed.has(p.id)),
      seasons,
      honours: [...world.honours, ...honours],
      finalTables,
    },
    honours,
  };
}
