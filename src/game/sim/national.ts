// Sepak bola internasional: timnas senior & U-20, jeda internasional (laga kualifikasi),
// dan turnamen tiap 2 tahun: Piala Dunia (tahun 2030, 2034, ...) dan Euro / Piala Asia
// di antaranya (2028, 2032, ...). Laga timnasmu saat kamu dipanggil dimainkan match engine 2D,
// laga negara lain disimulasikan cepat dari kekuatan skuadnya.

import type {
  Career,
  Confederation,
  IntlFixture,
  IntlRow,
  IntlState,
  MatchRecord,
  MatchStatus,
  NatTeam,
  NationalCareer,
  Player,
  Tournament,
  TournamentKind,
  World,
} from '../types';
import { COUNTRIES, COUNTRY_BY_ID } from '../data/countries';
import { Rng, clamp } from '../rng';
import { addDays, yearOf } from '../date';
import { ageOn } from '../gen/player';
import { simScore, topEleven } from './season';
import { addStats, engineGame, groupOf, recentForm } from './match';
import type { EngineInput } from './engine';
import type { NatPlayed } from './awards';

export const SQUAD_SIZE = 23;
export const SQUAD_GK = 3;
export const U20_AGE = 20;

/** Warna seragam timnas [utama, kedua] */
const KITS: Record<string, [string, string]> = {
  ENG: ['#ffffff', '#1b2a5c'], ITA: ['#1f5fbf', '#ffffff'], ESP: ['#c8102e', '#f1bf00'], GER: ['#ffffff', '#111111'],
  FRA: ['#1e2a78', '#ffffff'], POR: ['#a50d23', '#0b6e3b'], NED: ['#f36c21', '#1b2a5c'], BEL: ['#c8102e', '#111111'],
  TUR: ['#e30a17', '#ffffff'], CZE: ['#d7141a', '#11457e'], GRE: ['#0d5eaf', '#ffffff'], POL: ['#ffffff', '#dc143c'],
  DEN: ['#c8102e', '#ffffff'], NOR: ['#ba0c2f', '#00205b'], CYP: ['#1f5fbf', '#ffffff'], KSA: ['#ffffff', '#006c35'],
  JPN: ['#1a2c6b', '#ffffff'], KOR: ['#d4202c', '#111111'], UAE: ['#ffffff', '#c8102e'], IRN: ['#ffffff', '#da0000'],
  QAT: ['#8a1538', '#ffffff'], THA: ['#1f3f99', '#d7141a'], AUS: ['#f4c300', '#00843d'], UZB: ['#ffffff', '#1eb53a'],
  MAS: ['#f9d616', '#010066'], IDN: ['#d1121b', '#ffffff'], BRA: ['#f7d117', '#1f5fbf'], ARG: ['#75aadb', '#ffffff'],
  URU: ['#5eb6e4', '#111111'], COL: ['#fcd116', '#003893'], NGA: ['#008751', '#ffffff'], GHA: ['#ffffff', '#111111'],
  SEN: ['#ffffff', '#00853f'], CIV: ['#f77f00', '#009e60'], CMR: ['#007a5e', '#ce1126'], MAR: ['#c1272d', '#006233'],
  ALG: ['#ffffff', '#006233'], CRO: ['#e8112d', '#ffffff'], SRB: ['#c6363c', '#0c4076'], SWE: ['#fecc00', '#006aa7'],
  SUI: ['#d52b1e', '#ffffff'], AUT: ['#ed2939', '#ffffff'], SCO: ['#1b2a5c', '#ffffff'], USA: ['#ffffff', '#1b2a5c'],
};
export const kitOf = (id: string): [string, string] => KITS[id] ?? ['#dddddd', '#222222'];
export const countryName = (id: string) => COUNTRY_BY_ID[id]?.name ?? id;

const CONFS: Confederation[] = ['UEFA', 'AFC', 'CONMEBOL', 'CAF', 'CONCACAF'];
/** Jatah Piala Dunia (32 tim) per konfederasi */
export const WC_QUOTA: Record<Confederation, number> = { UEFA: 13, AFC: 8, CONMEBOL: 4, CAF: 6, CONCACAF: 1 };
const CONTINENTAL: Record<Confederation, { kind: TournamentKind; teams: number } | undefined> = {
  UEFA: { kind: 'euro', teams: 16 },
  AFC: { kind: 'asia', teams: 8 },
  CONMEBOL: undefined,
  CAF: undefined,
  CONCACAF: undefined,
};
export const TOURNAMENT_NAME: Record<TournamentKind, string> = { world: 'Piala Dunia', euro: 'Euro', asia: 'Piala Asia' };
/** Babak gugur (grup memakai huruf 'A'..'H') */
export const KO_STAGES = ['R16', 'QF', 'SF', 'FINAL'];
export const STAGE_NAME: Record<string, string> = { R16: '16 besar', QF: 'Perempat final', SF: 'Semifinal', FINAL: 'Final' };

/** Turnamen di tahun (genap) itu untuk konfederasi negaramu */
export function tournamentKind(year: number, conf: Confederation): TournamentKind | null {
  if (year % 2) return null;
  if (year % 4 === 2) return 'world';
  return CONTINENTAL[conf]?.kind ?? null;
}

// --- kalender -----------------------------------------------------------------------

const WINDOWS: [string, string, string][] = [
  ['03', '21', 'Maret'],
  ['06', '04', 'Juni'],
  ['09', '04', 'September'],
  ['10', '09', 'Oktober'],
  ['11', '13', 'November'],
];

export interface IntlWindow {
  id: string;
  start: string;
  days: [string, string];
  label: string;
}

/** Jeda internasional dalam setahun (Juni hanya di tahun tanpa turnamen) */
export function windowsOf(year: number): IntlWindow[] {
  return WINDOWS.filter(([m]) => m !== '06' || year % 2 === 1).map(([m, d, name]) => {
    const start = `${year}-${m}-${d}`;
    return { id: `win-${year}-${m}`, start, days: [addDays(start, 2), addDays(start, 5)], label: `${name} ${year}` };
  });
}

const squadDay = (year: number) => `${year}-06-01`;
const kickoffDay = (year: number) => `${year}-06-12`;

/** Jeda internasional / turnamen berikutnya mulai tanggal `date` */
export function nextIntlEvent(date: string, conf: Confederation): { date: string; label: string } | null {
  const y = yearOf(date);
  const list: { date: string; label: string }[] = [];
  for (const yy of [y, y + 1]) {
    for (const w of windowsOf(yy)) list.push({ date: w.start, label: `Jeda internasional ${w.label}` });
    const k = tournamentKind(yy, conf);
    if (k) list.push({ date: kickoffDay(yy), label: `${TOURNAMENT_NAME[k]} ${yy}` });
  }
  return list.filter((e) => e.date >= date).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

// --- skuad & kekuatan ---------------------------------------------------------------

const poolCache = new WeakMap<Player[], Map<string, Player[]>>();
function poolOf(world: World, countryId: string): Player[] {
  let m = poolCache.get(world.players);
  if (!m) {
    m = new Map();
    for (const p of world.players) {
      let a = m.get(p.nationalityId);
      if (!a) m.set(p.nationalityId, (a = []));
      a.push(p);
    }
    for (const a of m.values()) a.sort((x, y) => y.ca - x.ca);
    poolCache.set(world.players, m);
  }
  return m.get(countryId) ?? [];
}

/** Nilai pemain di mata pelatih timnas (pemain kita: + performa terakhir) */
function natScore(p: Player, career?: Career): number {
  let v = p.ca + p.reputation.world * 0.05;
  if (p.isUser && career) {
    const form = recentForm(career, 5);
    if (form !== null) v += form >= 7.2 ? 4 : form <= 6.1 ? -3 : 0;
  }
  return v;
}

/**
 * Skuad 23 pemain: 3 kiper terbaik + 20 pemain lapangan terbaik. U-20: umur maksimal 20.
 * `user` = versi terbaru pemain kita (menggantikan data lama di world.players).
 */
export function nationalSquad(world: World, countryId: string, team: NatTeam, date: string, user?: Player, career?: Career): Player[] {
  let pool = poolOf(world, countryId);
  if (user && user.nationalityId === countryId) pool = [...pool.filter((p) => p.id !== user.id), user];
  if (team === 'u20') pool = pool.filter((p) => ageOn(p.birthDate, date) <= U20_AGE);
  if (career?.injury && user) pool = pool.filter((p) => p.id !== user.id);
  const sorted = [...pool].sort((a, b) => natScore(b, career) - natScore(a, career));
  const gks = sorted.filter((p) => p.mainPosition === 'GK').slice(0, SQUAD_GK);
  const out = sorted.filter((p) => p.mainPosition !== 'GK').slice(0, SQUAD_SIZE - gks.length);
  return [...gks, ...out];
}

/** Peringkatmu di antara pemain senegara seposisi (kiper / pemain lapangan) */
export function natRank(world: World, user: Player, career: Career, team: NatTeam): { rank: number; cut: number } {
  let pool = poolOf(world, user.nationalityId).filter((p) => p.id !== user.id);
  if (team === 'u20') pool = pool.filter((p) => ageOn(p.birthDate, career.currentDate) <= U20_AGE);
  const gk = user.mainPosition === 'GK';
  const mine = natScore(user, career);
  const rank = pool.filter((p) => (p.mainPosition === 'GK') === gk && natScore(p) > mine).length + 1;
  return { rank, cut: gk ? SQUAD_GK : SQUAD_SIZE - SQUAD_GK };
}

const strCache = new WeakMap<Player[], Map<string, number>>();
/** Kekuatan timnas: rata-rata CA 11 terbaik di skuadnya */
export function natStrength(world: World, countryId: string, team: NatTeam = 'senior', date = world.startDate): number {
  let m = strCache.get(world.players);
  if (!m) strCache.set(world.players, (m = new Map()));
  const key = `${countryId}:${team}`;
  let v = m.get(key);
  if (v === undefined) {
    v = topEleven(nationalSquad(world, countryId, team, date).map((p) => p.ca));
    m.set(key, v);
  }
  return v;
}

// --- klasemen kualifikasi -----------------------------------------------------------

const emptyRow = (): IntlRow => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });

/** Tahun turnamen berikutnya yang skuadnya belum diumumkan */
export function cycleFor(date: string): number {
  let y = yearOf(date);
  if (y % 2) y++;
  if (squadDay(y) <= date) y += 2;
  return y;
}

export function initIntl(date: string): IntlState {
  return { cycle: cycleFor(date), table: Object.fromEntries(COUNTRIES.map((c) => [c.id, emptyRow()])), history: [] };
}

function addResult(table: Record<string, IntlRow>, home: string, away: string, s: [number, number]) {
  const h = (table[home] ??= emptyRow());
  const a = (table[away] ??= emptyRow());
  h.p++;
  a.p++;
  h.gf += s[0];
  h.ga += s[1];
  a.gf += s[1];
  a.ga += s[0];
  if (s[0] > s[1]) {
    h.w++;
    a.l++;
    h.pts += 3;
  } else if (s[0] < s[1]) {
    a.w++;
    h.l++;
    a.pts += 3;
  } else {
    h.d++;
    a.d++;
    h.pts++;
    a.pts++;
  }
}

/** Klasemen kualifikasi satu konfederasi (poin per laga, lalu selisih gol per laga) */
export function qualTable(world: World, intl: IntlState, conf: Confederation): { id: string; row: IntlRow }[] {
  const per = (r: IntlRow, v: number) => (r.p ? v / r.p : 0);
  return COUNTRIES.filter((c) => c.confederation === conf)
    .map((c) => ({ id: c.id, row: intl.table[c.id] ?? emptyRow() }))
    .sort(
      (a, b) =>
        per(b.row, b.row.pts) - per(a.row, a.row.pts) ||
        per(b.row, b.row.gf - b.row.ga) - per(a.row, a.row.gf - a.row.ga) ||
        natStrength(world, b.id) - natStrength(world, a.id),
    );
}

/** Berapa tiket ke turnamen siklus ini untuk konfederasi tersebut */
export function qualSlots(kind: TournamentKind | null, conf: Confederation): number {
  if (kind === 'world') return WC_QUOTA[conf];
  const c = CONTINENTAL[conf];
  return c && kind === c.kind ? c.teams : 0;
}

/** Laga kualifikasi satu hari: negara satu konfederasi dipasangkan acak */
function qualifierFixtures(world: World, date: string): IntlFixture[] {
  const rng = new Rng(`${world.seed}:intl:${date}`);
  const out: IntlFixture[] = [];
  for (const conf of CONFS) {
    const ids = rng.shuffle(COUNTRIES.filter((c) => c.confederation === conf).map((c) => c.id));
    for (let i = 0; i + 1 < ids.length; i += 2) out.push({ date, stage: 'Q', home: ids[i], away: ids[i + 1] });
  }
  return out;
}

// --- turnamen -----------------------------------------------------------------------

function createTournament(world: World, intl: IntlState, kind: TournamentKind, conf: Confederation): Tournament {
  const year = intl.cycle;
  const teams: string[] = [];
  if (kind === 'world') for (const c of CONFS) teams.push(...qualTable(world, intl, c).slice(0, WC_QUOTA[c]).map((r) => r.id));
  else teams.push(...qualTable(world, intl, conf).slice(0, CONTINENTAL[conf]!.teams).map((r) => r.id));
  // undian: pot berdasarkan kekuatan
  const rng = new Rng(`${world.seed}:draw:${kind}:${year}`);
  const seeded = [...teams].sort((a, b) => natStrength(world, b) - natStrength(world, a));
  const g = teams.length / 4;
  const groups: string[][] = Array.from({ length: g }, () => []);
  for (let pot = 0; pot < 4; pot++) {
    const ids = rng.shuffle(seeded.slice(pot * g, (pot + 1) * g));
    ids.forEach((id, i) => groups[i].push(id));
  }
  const start = kickoffDay(year);
  const fixtures: IntlFixture[] = [];
  groups.forEach((gr, i) => {
    const stage = String.fromCharCode(65 + i);
    const [a, b, c, d] = gr;
    const md: [string, string][][] = [
      [[a, b], [c, d]],
      [[a, c], [d, b]],
      [[d, a], [b, c]],
    ];
    md.forEach((pairs, k) => pairs.forEach(([h, w]) => fixtures.push({ date: addDays(start, k * 4 + (i % 2)), stage, home: h, away: w })));
  });
  return { id: `${kind}-${year}`, kind, name: `${TOURNAMENT_NAME[kind]} ${year}`, year, teams, groups, fixtures };
}

/** Klasemen grup turnamen */
export function groupTable(t: Tournament, gi: number): { id: string; row: IntlRow }[] {
  const stage = String.fromCharCode(65 + gi);
  const table: Record<string, IntlRow> = Object.fromEntries(t.groups[gi].map((id) => [id, emptyRow()]));
  for (const f of t.fixtures) if (f.stage === stage && f.score) addResult(table, f.home, f.away, f.score);
  return t.groups[gi]
    .map((id) => ({ id, row: table[id] }))
    .sort((a, b) => b.row.pts - a.row.pts || b.row.gf - b.row.ga - (a.row.gf - a.row.ga) || b.row.gf - a.row.gf || a.id.localeCompare(b.id));
}

const winnerOf = (f: IntlFixture) =>
  !f.score ? undefined : f.score[0] > f.score[1] ? f.home : f.score[0] < f.score[1] ? f.away : f.pens && f.pens[0] > f.pens[1] ? f.home : f.away;

/** Babak berikutnya kalau babak sekarang sudah selesai semua */
function nextStage(t: Tournament): IntlFixture[] {
  if (t.fixtures.some((f) => !f.score)) return [];
  const last = t.fixtures[t.fixtures.length - 1];
  const lastDate = t.fixtures.reduce((m, f) => (f.date > m ? f.date : m), last.date);
  const ko = KO_STAGES;
  let pairs: [string, string][];
  let stage: string;
  if (!ko.includes(last.stage)) {
    const tables = t.groups.map((_, gi) => groupTable(t, gi));
    pairs = [];
    for (let i = 0; i < tables.length; i += 2) {
      pairs.push([tables[i][0].id, tables[i + 1][1].id], [tables[i + 1][0].id, tables[i][1].id]);
    }
    stage = { 16: 'R16', 8: 'QF', 4: 'SF', 2: 'FINAL' }[pairs.length * 2]!;
  } else {
    if (last.stage === 'FINAL') return [];
    const prev = t.fixtures.filter((f) => f.stage === last.stage);
    const winners = prev.map((f) => winnerOf(f)!);
    pairs = [];
    for (let i = 0; i < winners.length; i += 2) pairs.push([winners[i], winners[i + 1]]);
    stage = ko[ko.indexOf(last.stage) + 1];
  }
  const day = addDays(lastDate, ko.includes(last.stage) ? 4 : 5);
  return pairs.map(([home, away], i) => ({ date: addDays(day, pairs.length > 2 ? i % 2 : 0), stage, home, away }));
}

/** Babak terjauh suatu negara di turnamen */
export function stageReached(t: Tournament, id: string): string {
  if (!t.teams.includes(id)) return 'Tidak lolos';
  if (t.champion === id) return 'Juara';
  const ko = t.fixtures.filter((f) => KO_STAGES.includes(f.stage) && (f.home === id || f.away === id));
  if (!ko.length) return 'Fase grup';
  return STAGE_NAME[ko[ko.length - 1].stage] ?? 'Fase grup';
}

// --- minggu internasional -----------------------------------------------------------

export function emptyNational(): NationalCareer {
  return { caps: 0, goals: 0, u20Caps: 0, u20Goals: 0, called: null, tournaments: [] };
}

export interface IntlGame {
  rec: MatchRecord;
  sim?: EngineInput;
}

/** Status di laga timnas: bersaing dengan pemain seposisi di skuad */
function natStatus(rng: Rng, p: Player, squad: Player[], career: Career): MatchStatus {
  if (career.injury) return 'Cedera';
  const g = groupOf(p.mainPosition);
  let mine = natScore(p, career) + rng.normal(0, 5);
  if (career.fitness < 55) mine -= (55 - career.fitness) / 2;
  const starters = { GK: 1, DEF: 4, MID: 3, ATT: 3 }[g];
  const rank = squad.filter((q) => groupOf(q.mainPosition) === g && q.ca + rng.normal(0, 5) > mine).length;
  return rank < starters ? 'Inti' : 'Cadangan';
}

function quickScore(world: World, f: IntlFixture, team: NatTeam = 'senior'): [number, number] {
  const rng = new Rng(`${world.seed}:intl:${f.date}:${f.home}:${f.away}`);
  const h = natStrength(world, f.home, team, f.date);
  const a = natStrength(world, f.away, team, f.date);
  // tempat netral di turnamen: keuntungan kandang dihapus
  const s = f.stage === 'Q' ? simScore(rng, h, a) : rng.chance(0.5) ? simScore(rng, h, a) : (simScore(rng, a, h).reverse() as [number, number]);
  return s;
}

function penalties(rng: Rng, home: string, away: string, world: World): [number, number] {
  const edge = clamp((natStrength(world, home) - natStrength(world, away)) / 200, -0.15, 0.15);
  const homeWins = rng.chance(0.5 + edge);
  const lose = rng.int(2, 4);
  const win = lose + rng.int(1, 2);
  return homeWins ? [Math.min(5, win), lose] : [lose, Math.min(5, win)];
}

/**
 * Sepak bola internasional minggu ini [from, to): panggilan timnas, laga kualifikasi,
 * dan turnamen. Mengubah `career` (inbox, statistik, caps) dan mengembalikan dunia baru
 * beserta laga timnas yang kamu mainkan.
 */
export function nationalWeek(
  world: World,
  career: Career,
  p: Player,
  from: string,
  to: string,
): { world: World; games: IntlGame[]; played: NatPlayed[] } {
  const intl: IntlState = world.intl ? structuredClone(world.intl) : initIntl(from);
  const nc = (career.intl ??= emptyNational());
  const country = p.nationalityId;
  const conf = COUNTRY_BY_ID[country]?.confederation ?? 'UEFA';
  const cname = countryName(country);
  const games: IntlGame[] = [];
  // semua laga senior minggu ini (untuk caps & gol semua pemain)
  const played: NatPlayed[] = [];
  let lastEngine: NatPlayed['engine'];
  const rng = new Rng(`${career.characterSeed}:intl:${from}`);
  const inRange = (d: string) => d >= from && d < to;
  const age = ageOn(p.birthDate, from);

  const msg = (id: string, title: string, body: string) => {
    if (career.inbox.some((m) => m.id === id)) return;
    career.inbox.unshift({ id, date: to, from: `Federasi Sepak Bola ${cname}`, title, body });
  };

  const callUp = (eventId: string, label: string, allowU20: boolean) => {
    const before = nc.called;
    const senior = nationalSquad(world, country, 'senior', from, p, career).some((q) => q.id === p.id);
    const u20 = !senior && allowU20 && age <= U20_AGE && nationalSquad(world, country, 'u20', from, p, career).some((q) => q.id === p.id);
    nc.called = senior ? 'senior' : u20 ? 'u20' : null;
    nc.calledFor = eventId;
    if (senior) {
      const first = nc.caps === 0;
      msg(
        `intl-call-${eventId}`,
        first ? `Panggilan pertama ke Timnas ${cname}!` : `Dipanggil Timnas ${cname}`,
        `Pelatih timnas memasukkanmu ke skuad ${SQUAD_SIZE} pemain untuk ${label}.${first ? ' Ini kesempatan untuk debut membela negaramu.' : ''}`,
      );
    } else if (u20) {
      msg(`intl-call-${eventId}`, `Dipanggil Timnas U-20 ${cname}`, `Kamu masuk skuad Timnas U-20 ${cname} untuk ${label}. Tampil bagus di sini bisa membuka jalan ke tim senior.`);
    } else if (before && career.injury) {
      msg(`intl-call-${eventId}`, 'Absen dari timnas karena cedera', `Kamu tidak bisa dipanggil untuk ${label} karena cedera.`);
    } else if (before === 'senior') {
      msg(`intl-call-${eventId}`, `Tidak dipanggil Timnas ${cname}`, `Namamu tidak ada di skuad untuk ${label}. Pelatih memilih pemain lain; jaga performamu di klub supaya dipanggil lagi.`);
    }
  };

  const playUser = (f: IntlFixture, team: NatTeam, stage: string, knockout: boolean): [number, number] => {
    const home = f.home === country;
    const opp = home ? f.away : f.home;
    const squad = nationalSquad(world, country, team, f.date, p, career).filter((q) => !q.isUser);
    const theirs = nationalSquad(world, opp, team, f.date).filter((q) => !q.isUser);
    const status = natStatus(rng, p, squad, career);
    const suffix = team === 'u20' ? ' U-20' : '';
    const g = engineGame({
      p,
      career,
      status,
      rng,
      ours: { id: country, name: `${cname}${suffix}`, colors: kitOf(country), squad },
      theirs: { id: opp, name: `${countryName(opp)}${suffix}`, colors: kitOf(opp), squad: theirs },
      home,
      seed: `${career.characterSeed}:${f.date}:${country}:${team}`,
      feats: team === 'senior',
    });
    const rec: MatchRecord = {
      date: f.date,
      comp: team === 'senior' ? 'Timnas' : 'Timnas U20',
      season: f.date.slice(0, 4),
      team: `${cname}${suffix}`,
      opponent: `${countryName(opp)}${suffix}`,
      opponentId: opp,
      home,
      score: g.score,
      status,
      stage,
      ...g.perf,
      ...g.extra,
    };
    if (knockout && g.score[0] === g.score[1]) rec.pens = penalties(rng, country, opp, world);
    addStats(career, rec);
    if (rec.minutes > 0) {
      if (team === 'senior') {
        nc.caps++;
        nc.goals += rec.goals;
        nc.debut ??= f.date;
      } else {
        nc.u20Caps++;
        nc.u20Goals += rec.goals;
      }
    }
    games.push({ rec, sim: g.sim });
    lastEngine = team === 'senior' ? { result: g.result, input: g.sim } : undefined;
    const s: [number, number] = home ? g.score : [g.score[1], g.score[0]];
    if (rec.pens) f.pens = home ? rec.pens : [rec.pens[1], rec.pens[0]];
    return s;
  };

  // Kejadian minggu ini, urut tanggal
  type Ev = { date: string; run: () => void };
  const evs: Ev[] = [];
  for (const y of new Set([yearOf(from), yearOf(to)])) {
    for (const w of windowsOf(y)) {
      if (inRange(w.start)) evs.push({ date: w.start, run: () => callUp(w.id, `jeda internasional ${w.label}`, true) });
      for (const day of w.days) {
        if (!inRange(day)) continue;
        evs.push({
          date: day,
          run: () => {
            const kind = tournamentKind(intl.cycle, conf);
            const label = kind ? `Kualifikasi ${TOURNAMENT_NAME[kind]} ${intl.cycle}` : 'Laga internasional';
            for (const f of qualifierFixtures(world, day)) {
              const mine = f.home === country || f.away === country;
              lastEngine = undefined;
              const s = mine && nc.called === 'senior' && nc.calledFor === w.id && !career.injury ? playUser(f, 'senior', label, false) : quickScore(world, f);
              f.score = s;
              played.push({ date: day, home: f.home, away: f.away, score: s, engine: lastEngine });
              addResult(intl.table, f.home, f.away, s);
            }
            if (nc.called === 'u20' && nc.calledFor === w.id && !career.injury) {
              const others = COUNTRIES.filter((c) => c.confederation === conf && c.id !== country);
              const opp = new Rng(`${world.seed}:u20:${day}:${country}`).pick(others).id;
              playUser({ date: day, stage: 'U20', home: country, away: opp }, 'u20', 'Persahabatan U-20', false);
            }
          },
        });
      }
    }
    // turnamen: pengumuman skuad
    if (inRange(squadDay(y)) && intl.cycle === y) {
      evs.push({
        date: squadDay(y),
        run: () => {
          const kind = tournamentKind(y, conf);
          if (!kind) return;
          const t = createTournament(world, intl, kind, conf);
          intl.tournament = t;
          if (!t.teams.includes(country)) {
            nc.called = null;
            nc.calledFor = t.id;
            msg(`intl-out-${t.id}`, `${cname} gagal lolos ke ${t.name}`, `${cname} tidak mendapat tiket ke ${t.name} lewat klasemen kualifikasi. Turnamen tetap bisa kamu ikuti dari panel Timnas.`);
          } else {
            const gi = t.groups.findIndex((g) => g.includes(country));
            msg(
              `intl-in-${t.id}`,
              `${cname} lolos ke ${t.name}!`,
              `${cname} masuk Grup ${String.fromCharCode(65 + gi)} bersama ${t.groups[gi].filter((id) => id !== country).map(countryName).join(', ')}. Turnamen mulai ${kickoffDay(y).slice(8)} Juni.`,
            );
            callUp(t.id, t.name, false);
          }
        },
      });
    }
  }
  // laga turnamen (termasuk babak gugur yang baru dibuat di minggu ini)
  const runTournamentDays = () => {
    const t = intl.tournament;
    if (!t || t.champion) return;
    for (let guard = 0; guard < 12; guard++) {
      const due = t.fixtures.filter((f) => !f.score && inRange(f.date)).sort((a, b) => a.date.localeCompare(b.date));
      if (!due.length) break;
      const day = due[0].date;
      for (const f of due.filter((x) => x.date === day)) {
        const ko = KO_STAGES.includes(f.stage);
        const mine = f.home === country || f.away === country;
        const stage = `${t.name} · ${ko ? STAGE_NAME[f.stage] : `Grup ${f.stage}`}`;
        lastEngine = undefined;
        if (mine && nc.called === 'senior' && nc.calledFor === t.id && !career.injury) f.score = playUser(f, 'senior', stage, ko);
        else {
          f.score = quickScore(world, f);
          if (ko && f.score[0] === f.score[1]) f.pens = penalties(new Rng(`${world.seed}:pens:${f.date}:${f.home}`), f.home, f.away, world);
        }
        played.push({ date: f.date, home: f.home, away: f.away, score: f.score, engine: lastEngine });
      }
      t.fixtures.push(...nextStage(t));
      const fin = t.fixtures.find((f) => f.stage === 'FINAL' && f.score);
      if (fin && !t.champion) finishTournament(t, fin);
    }
  };
  const finishTournament = (t: Tournament, fin: IntlFixture) => {
    t.champion = winnerOf(fin);
    t.runnerUp = t.champion === fin.home ? fin.away : fin.home;
    intl.history.unshift({ id: t.id, name: t.name, champion: t.champion!, runnerUp: t.runnerUp });
    const stage = stageReached(t, country);
    const mine = games.filter((g) => g.rec.stage?.startsWith(t.name));
    const prevApps = career.matches.filter((m) => m.stage?.startsWith(t.name) && m.minutes > 0);
    const apps = prevApps.length + mine.filter((g) => g.rec.minutes > 0).length;
    const goals = prevApps.reduce((a, m) => a + m.goals, 0) + mine.reduce((a, g) => a + g.rec.goals, 0);
    if (nc.calledFor === t.id && nc.called === 'senior') {
      nc.tournaments.push({ id: t.id, name: t.name, stage, apps, goals });
      if (stage === 'Juara') (career.trophies ??= []).push({ id: t.id, name: t.name, season: String(t.year), team: cname });
      p.reputation.world = clamp(p.reputation.world + (stage === 'Juara' ? 6 : 2), 1, 100);
      p.reputation.home = clamp(p.reputation.home + (stage === 'Juara' ? 8 : 2), 1, 100);
    }
    let body = `${countryName(t.champion!)} juara ${t.name} setelah mengalahkan ${countryName(t.runnerUp)} di final.`;
    if (t.teams.includes(country)) body += ` ${cname}: ${stage === 'Juara' ? 'JUARA!' : `terhenti di ${stage.toLowerCase()}`}.`;
    if (nc.calledFor === t.id && nc.called === 'senior') body += ` Kamu tampil ${apps} kali dan mencetak ${goals} gol.`;
    msg(`intl-end-${t.id}`, stage === 'Juara' ? `${cname} JUARA ${t.name}!` : `${t.name} selesai`, body);
    // siklus kualifikasi berikutnya
    intl.cycle = t.year + 2;
    intl.table = Object.fromEntries(COUNTRIES.map((c) => [c.id, emptyRow()]));
    nc.called = null;
  };

  evs.sort((a, b) => a.date.localeCompare(b.date));
  for (const e of evs) {
    // laga turnamen yang tanggalnya sebelum kejadian ini dimainkan dulu
    e.run();
  }
  runTournamentDays();
  return { world: { ...world, intl }, games, played };
}
