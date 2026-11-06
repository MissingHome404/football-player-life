// Statistik musim semua pemain di dunia game, rekor (bisa dipecahkan pemain AI juga),
// penghargaan akhir musim tiap liga, dan penghargaan dunia "Bintang Dunia" tiap Desember.
//
// Laga yang dimainkan match engine (laga timmu) dicatat dari statistik engine. Laga lain
// hanya punya skor, jadi gol/assist dibagi ke starting XI kedua tim sesuai posisi dan atribut.

import type {
  AwardEntry,
  AwardKind,
  Candidate,
  Career,
  LedgerRow,
  Player,
  RecordEntry,
  SeasonLedger,
  Tallies,
  World,
  WorldRecords,
} from '../types';
import { FULL, type EngineInput, type EngineResult } from './engine';
import { Rng, clamp } from '../rng';
import { ageOn } from '../gen/player';
import { fullName, generateName } from '../gen/names';
import { COUNTRY_BY_ID } from '../data/countries';
import { ASSIST_W, GOAL_W, groupOf, type UserEngineMatch } from './match';
import { seasonLabel, squadsOf, standings, type WeekMatches } from './season';
import { STAGE_NAME, nationalSquad, stageReached } from './national';

export const AWARD_NAME: Record<AwardKind, string> = {
  pots: 'Pemain Terbaik',
  top: 'Top Skor',
  young: 'Pemain Muda Terbaik',
  world: 'Bintang Dunia',
  worldYoung: 'Bintang Muda Dunia',
};
export const YOUNG_AGE = 21;
const AWARDS_LIMIT = 400;

// --- XI cepat & pembagian gol -----------------------------------------------------------

const SHAPE = { GK: 1, DEF: 4, MID: 3, ATT: 3 } as const;

/** Starting XI sederhana (1-4-3-3 menurut CA) untuk laga yang tidak dimainkan engine */
export function quickXI(squad: Player[], excludeId?: string): Player[] {
  const pool = squad.filter((p) => !p.isYouth && p.id !== excludeId).sort((a, b) => b.ca - a.ca);
  const need: Record<string, number> = { ...SHAPE };
  const xi: Player[] = [];
  for (const p of pool) {
    const g = groupOf(p.mainPosition);
    if (need[g] > 0) {
      need[g]--;
      xi.push(p);
    }
  }
  for (const p of pool) {
    if (xi.length >= 11) break;
    if (!xi.includes(p)) xi.push(p);
  }
  return xi;
}

const goalW = (p: Player) => GOAL_W[p.mainPosition] * (0.4 + (p.technical.Finishing + p.mental['Off the Ball']) / 25);
const assistW = (p: Player) => ASSIST_W[p.mainPosition] * (0.4 + (p.technical.Passing + p.mental.Vision) / 25);

/** Bagi gol tim ke pemain: [gol, assist] per id */
function distribute(rng: Rng, xi: Player[], goals: number): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const get = (id: string) => {
    let v = out.get(id);
    if (!v) out.set(id, (v = [0, 0]));
    return v;
  };
  const gw = xi.map((p) => [p, goalW(p)] as const).filter(([, w]) => w > 0);
  for (let i = 0; i < goals && gw.length; i++) {
    const scorer = rng.weighted(gw);
    get(scorer.id)[0]++;
    if (rng.chance(0.72)) {
      const aw = xi.filter((p) => p !== scorer).map((p) => [p, assistW(p)] as const);
      if (aw.length) get(rng.weighted(aw).id)[1]++;
    }
  }
  return out;
}

function quickRating(rng: Rng, p: Player, teamAvg: number, gf: number, ga: number, goals: number, assists: number) {
  const g = groupOf(p.mainPosition);
  let r = 6.35 + (p.ca - teamAvg) / 25 + (gf > ga ? 0.35 : gf < ga ? -0.35 : 0) + goals * 0.8 + assists * 0.45;
  if (g === 'GK') r += (ga === 0 ? 0.6 : 0) - ga * 0.2;
  else if (g === 'DEF') r += (ga === 0 ? 0.4 : 0) - ga * 0.12;
  r += rng.normal(0, 0.9 - p.hidden.Consistency / 40);
  return Math.round(clamp(r, 4, 10) * 10) / 10;
}

// --- rekor --------------------------------------------------------------------------------

export type RecordKind = keyof WorldRecords;
export const RECORD_NAME: Record<RecordKind, string> = {
  seasonGoals: 'Gol liga terbanyak dalam semusim',
  youngest: 'Pencetak gol termuda di liga',
  clubGoals: 'Gol liga terbanyak untuk klub',
  natGoals: 'Gol timnas terbanyak',
  natCaps: 'Caps timnas terbanyak',
};

const emptyRecords = (): WorldRecords => ({ seasonGoals: {}, youngest: {}, clubGoals: {}, natGoals: {}, natCaps: {} });

/** Pemegang rekor awal: legenda fiktif dari era sebelum game dimulai (selalu sama untuk dunia yang sama) */
const legendCache = new Map<string, RecordEntry>();
export function legendRecord(world: World, kind: RecordKind, key: string): RecordEntry {
  const id = `${world.seed}:legend:${kind}:${key}`;
  const hit = legendCache.get(id);
  if (hit) return hit;
  const rng = new Rng(id);
  let country = key;
  let rep = 50;
  let startMonth = 1;
  if (kind === 'seasonGoals' || kind === 'youngest') {
    const l = world.leagues.find((x) => x.id === key);
    country = l?.countryId ?? 'ENG';
    rep = l?.reputation ?? 50;
    startMonth = l?.seasonStartMonth ?? 1;
  } else if (kind === 'clubGoals') {
    const c = world.clubs.find((x) => x.id === key);
    country = c?.countryId ?? 'ENG';
    rep = c?.reputation ?? 50;
  } else {
    rep = COUNTRY_BY_ID[key]?.footballRep ?? 40;
  }
  const y = rng.int(1975, 2022);
  const value = {
    seasonGoals: () => Math.round(22 + rep * 0.16 + rng.normal(0, 3)),
    youngest: () => Math.round(16 * 365.25 + rng.int(100, 350)),
    clubGoals: () => Math.round(50 + rep * 1.6 + rng.int(-15, 25)),
    natGoals: () => Math.round(20 + rep * 0.5 + rng.normal(0, 8)),
    natCaps: () => Math.round(70 + rep * 0.6 + rng.normal(0, 15)),
  }[kind]();
  const year = kind === 'seasonGoals' || kind === 'youngest' ? seasonLabel(y, startMonth) : String(y);
  const e = { name: fullName(generateName(rng, country)), value: Math.max(kind === 'natGoals' ? 12 : 5, value), year };
  legendCache.set(id, e);
  return e;
}

export const recordOf = (world: World, kind: RecordKind, key: string): RecordEntry =>
  world.records?.[kind][key] ?? legendRecord(world, kind, key);

export function daysOld(birth: string, date: string): number {
  return Math.round((Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(+birth.slice(0, 4), +birth.slice(5, 7) - 1, +birth.slice(8, 10))) / 86_400_000);
}
export const ageLabel = (days: number) => `${Math.floor(days / 365.25)} tahun ${Math.round(days % 365.25)} hari`;

/** Bekal untuk memeriksa & menulis rekor dalam satu minggu (salinan, dunia lama tidak diubah) */
class RecordBook {
  records: WorldRecords;
  tallies: Tallies;
  private world: World;
  private career: Career;
  private user: Player;
  private date: string;
  constructor(world: World, career: Career, user: Player, date: string) {
    this.world = world;
    this.career = career;
    this.user = user;
    this.date = date;
    const r = world.records ?? emptyRecords();
    this.records = { seasonGoals: { ...r.seasonGoals }, youngest: { ...r.youngest }, clubGoals: { ...r.clubGoals }, natGoals: { ...r.natGoals }, natCaps: { ...r.natCaps } };
    const t = world.tallies ?? { club: {}, natGoals: {}, natCaps: {} };
    this.tallies = { club: { ...t.club }, natGoals: { ...t.natGoals }, natCaps: { ...t.natCaps } };
  }
  /** lower = rekor makin kecil makin baik (pencetak gol termuda) */
  check(kind: RecordKind, key: string, value: number, p: Player, year: string, place: string, lower = false) {
    const cur = this.records[kind][key] ?? legendRecord(this.world, kind, key);
    if (lower ? value >= cur.value : value <= cur.value) return;
    this.records[kind][key] = { name: fullName(p), playerId: p.id, value, year };
    if (p.id !== this.user.id || cur.playerId === p.id) return;
    const what =
      kind === 'youngest' ? `pada usia ${ageLabel(value)}` : kind === 'natCaps' ? `${value} caps` : `${value} gol`;
    this.career.inbox.unshift({
      id: `record-${kind}-${key}`,
      date: this.date,
      from: 'Media olahraga',
      title: `Rekor baru: ${RECORD_NAME[kind].toLowerCase()}!`,
      body: `Kamu memecahkan rekor ${RECORD_NAME[kind].toLowerCase()} ${place} (${what}). Rekor sebelumnya dipegang ${cur.name} (${kind === 'youngest' ? ageLabel(cur.value) : cur.value}, ${cur.year}).`,
    });
    this.user.reputation.home = clamp(this.user.reputation.home + 2, 1, 100);
  }
}

// --- statistik musim (ledger) ------------------------------------------------------------

const r1 = (v: number) => Math.round(v * 10) / 10;
function addRow(rows: Record<string, LedgerRow>, pid: string, clubId: string, goals: number, assists: number, rating: number, cs: number) {
  const r = rows[pid];
  rows[pid] = r ? [r[0] + 1, r[1] + goals, r[2] + assists, r1(r[3] + rating), clubId, r[5] + cs] : [1, goals, assists, rating, clubId, cs];
}

/**
 * Catat semua laga liga minggu ini ke statistik musim, lalu periksa rekor.
 * Dipanggil setelah userMatch (skor laga timmu sudah dari match engine).
 */
export function ledgerWeek(world: World, week: WeekMatches, career: Career, user: Player, date: string, engine?: UserEngineMatch): World {
  if (!week.played.size) return world;
  const ledger: Record<string, SeasonLedger> = { ...(world.ledger ?? {}) };
  const book = new RecordBook(world, career, user, date);
  const squads = squadsOf(world);
  const xiCache = new Map<string, Player[]>();
  const xiOf = (clubId: string) => {
    let xi = xiCache.get(clubId);
    if (!xi) xiCache.set(clubId, (xi = quickXI(squads.get(clubId) ?? [], user.id)));
    return xi;
  };
  const touched = new Set<string>();
  const scored: { p: Player; clubId: string; leagueId: string; goals: number; season: string }[] = [];

  const fixtures = [...week.played.values()].filter((f) => f.home).sort((a, b) => a.leagueId.localeCompare(b.leagueId) || a.round - b.round || a.index - b.index);
  let rng: Rng | null = null;
  let rngLeague = '';
  for (const f of fixtures) {
    const s = world.seasons[f.leagueId];
    const score = s?.results[f.round]?.[f.index] ?? f.score;
    if (!touched.has(f.leagueId)) {
      touched.add(f.leagueId);
      const old = ledger[f.leagueId];
      ledger[f.leagueId] =
        old && old.season === f.season
          ? { ...old, rows: { ...old.rows } }
          : { season: f.season, rows: {}, ...(f.round > 0 ? { partial: true } : {}) };
    }
    if (rngLeague !== f.leagueId) {
      rng = new Rng(`${world.seed}:ledger:${date}:${f.leagueId}`);
      rngLeague = f.leagueId;
    }
    const rows = ledger[f.leagueId].rows;
    const isEngine = engine && engine.leagueId === f.leagueId && engine.round === f.round && engine.index === f.index;
    if (isEngine) {
      creditEngine(engine.input, engine.result, squads, (p, clubId, g, a, rating, cs) => {
        addRow(rows, p.id, clubId, g, a, rating, cs);
        if (g) scored.push({ p, clubId, leagueId: f.leagueId, goals: g, season: f.season });
      });
      continue;
    }
    const sides: [string, number, number][] = [
      [f.clubId, score[0], score[1]],
      [f.opponentId, score[1], score[0]],
    ];
    for (const [clubId, gf, ga] of sides) {
      const xi = xiOf(clubId);
      if (!xi.length) continue;
      const avg = xi.reduce((a, p) => a + p.ca, 0) / xi.length;
      const dist = distribute(rng!, xi, gf);
      for (const p of xi) {
        const [g, a] = dist.get(p.id) ?? [0, 0];
        const grp = groupOf(p.mainPosition);
        addRow(rows, p.id, clubId, g, a, quickRating(rng!, p, avg, gf, ga, g, a), ga === 0 && (grp === 'GK' || grp === 'DEF') ? 1 : 0);
        if (g) scored.push({ p, clubId, leagueId: f.leagueId, goals: g, season: f.season });
      }
    }
  }

  // Rekor: gol untuk klub, gol semusim, pencetak gol termuda
  const leagueName = (id: string) => world.leagues.find((l) => l.id === id)?.name ?? id;
  const clubName = (id: string) => world.clubs.find((c) => c.id === id)?.name ?? id;
  for (const x of scored) {
    const key = `${x.clubId}|${x.p.id}`;
    const tally = (book.tallies.club[key] = (book.tallies.club[key] ?? 0) + x.goals);
    book.check('clubGoals', x.clubId, tally, x.p, date.slice(0, 4), `di ${clubName(x.clubId)}`);
    book.check('seasonGoals', x.leagueId, ledger[x.leagueId].rows[x.p.id][1], x.p, x.season, `di ${leagueName(x.leagueId)}`);
    book.check('youngest', x.leagueId, daysOld(x.p.birthDate, date), x.p, x.season, `di ${leagueName(x.leagueId)}`, true);
  }
  return { ...world, ledger, records: book.records, tallies: book.tallies };
}

type Credit = (p: Player, clubId: string, goals: number, assists: number, rating: number, cs: number) => void;

/** Statistik semua pemain dari laga match engine */
function creditEngine(input: EngineInput, r: EngineResult, squads: Map<string, Player[]>, credit: Credit, byId?: Map<string, Player>) {
  for (const [side, team] of [input.home, input.away].entries()) {
    const conceded = r.score[1 - side];
    const ids = [...team.xi.map((e) => e.id), ...(team.sub ? [team.sub.player.id] : [])];
    const squad = squads.get(team.id) ?? [];
    for (const id of ids) {
      const st = r.stats[id];
      if (!st) continue;
      const p = byId?.get(id) ?? squad.find((q) => q.id === id);
      if (!p) continue;
      const grp = groupOf(p.mainPosition);
      const long = (st.off ?? FULL) - st.on >= FULL * 0.66;
      credit(p, team.id, st.goals, st.assists, r.ratings[id] ?? 6.5, conceded === 0 && long && (grp === 'GK' || grp === 'DEF') ? 1 : 0);
    }
  }
}

// --- timnas: caps & gol untuk semua pemain -------------------------------------------------

export interface NatPlayed {
  date: string;
  home: string;
  away: string;
  score: [number, number];
  engine?: { result: EngineResult; input: EngineInput };
}

/** Catat caps & gol timnas senior semua pemain, lalu periksa rekor timnas */
export function tallyNational(world: World, games: NatPlayed[], career: Career, user: Player, date: string): World {
  if (!games.length) return world;
  const book = new RecordBook(world, career, user, date);
  const t = book.tallies;
  const sqCache = new Map<string, Player[]>();
  const xiOf = (c: string, d: string) => {
    let xi = sqCache.get(c);
    if (!xi) sqCache.set(c, (xi = quickXI(nationalSquad(world, c, 'senior', d).filter((p) => !p.isUser))));
    return xi;
  };
  const byId = new Map(world.players.map((p) => [p.id, p]));
  const touched = new Map<string, Player>();
  const credit = (p: Player, goals: number) => {
    if (p.isUser) return; // caps & gol pemain kita dari karier
    t.natCaps[p.id] = (t.natCaps[p.id] ?? 0) + 1;
    if (goals) t.natGoals[p.id] = (t.natGoals[p.id] ?? 0) + goals;
    touched.set(p.id, p);
  };
  for (const g of games) {
    if (g.engine) {
      creditEngine(g.engine.input, g.engine.result, new Map(), (p, _c, goals) => credit(p, goals), byId);
      continue;
    }
    const rng = new Rng(`${world.seed}:natledger:${g.date}:${g.home}:${g.away}`);
    for (const [c, gf] of [
      [g.home, g.score[0]],
      [g.away, g.score[1]],
    ] as const) {
      const xi = xiOf(c, g.date);
      const dist = distribute(rng, xi, gf);
      for (const p of xi) credit(p, dist.get(p.id)?.[0] ?? 0);
    }
  }
  const year = date.slice(0, 4);
  for (const p of touched.values()) {
    const place = `${COUNTRY_BY_ID[p.nationalityId]?.name ?? p.nationalityId}`;
    book.check('natCaps', p.nationalityId, t.natCaps[p.id] ?? 0, p, year, place);
    book.check('natGoals', p.nationalityId, t.natGoals[p.id] ?? 0, p, year, place);
  }
  if (career.intl) {
    const place = COUNTRY_BY_ID[user.nationalityId]?.name ?? user.nationalityId;
    book.check('natCaps', user.nationalityId, career.intl.caps, user, year, `Timnas ${place}`);
    book.check('natGoals', user.nationalityId, career.intl.goals, user, year, `Timnas ${place}`);
  }
  return { ...world, records: book.records, tallies: book.tallies };
}

// --- penghargaan akhir musim ----------------------------------------------------------------

function candidateScore(p: Player, row: LedgerRow, pos: number, teams: number) {
  const [apps, goals, assists, sum, , cs] = row;
  const avg = sum / apps;
  const grp = groupOf(p.mainPosition);
  let s = (avg - 6.4) * 12 + goals * (grp === 'ATT' ? 0.5 : 0.7) + assists * 0.4;
  if (grp === 'GK' || grp === 'DEF') s += cs * 0.35;
  s += pos === 1 ? 4 : pos <= Math.min(4, Math.ceil(teams / 4)) ? 1.5 : 0;
  s += (p.ca - 120) * 0.04;
  return s;
}

const awardMsgId = (kind: AwardKind, scope: string, season: string) => `award-${kind}-${scope}-${season}`;

function giveUser(career: Career, user: Player, e: AwardEntry, title: string, detail: string, from: string, rep: [number, number]) {
  (career.awards ??= []).push({ id: awardMsgId(e.kind, e.scope, e.season), name: title, season: e.season, detail });
  user.reputation.home = clamp(user.reputation.home + rep[0], 1, 100);
  user.reputation.world = clamp(user.reputation.world + rep[1], 1, 100);
  career.inbox.unshift({
    id: awardMsgId(e.kind, e.scope, e.season),
    date: career.currentDate,
    from,
    title: `Penghargaan: ${title}!`,
    body: `Selamat! Kamu meraih ${title} musim ${e.season} (${detail}). Namamu makin dikenal.`,
  });
}

/** Penghargaan liga yang musimnya baru selesai: pemain terbaik, top skor, pemain muda terbaik */
export function seasonAwards(world: World, leagueIds: string[], career: Career, user: Player, date: string): World {
  const awards = [...(world.awards ?? [])];
  const candidates = { ...(world.candidates ?? {}) };
  const byId = new Map(world.players.map((p) => [p.id, p]));
  const clubName = (id?: string) => world.clubs.find((c) => c.id === id)?.name ?? '';
  for (const leagueId of leagueIds) {
    const led = world.ledger?.[leagueId];
    const s = world.seasons[leagueId];
    const league = world.leagues.find((l) => l.id === leagueId);
    if (!led || !s || !league || led.season !== s.label || led.partial) continue;
    const table = standings(s);
    const posOf = new Map(table.map((r, i) => [r.clubId, i + 1]));
    const minApps = Math.ceil(s.rounds.length * 0.4);
    const all: (Candidate & { p: Player; row: LedgerRow })[] = [];
    for (const [pid, row] of Object.entries(led.rows)) {
      const p = byId.get(pid);
      if (!p || row[0] <= 0) continue;
      all.push({
        p,
        row,
        playerId: pid,
        name: fullName(p),
        clubId: row[4],
        leagueId,
        apps: row[0],
        goals: row[1],
        assists: row[2],
        avg: Math.round((row[3] / row[0]) * 100) / 100,
        score: Math.round(candidateScore(p, row, posOf.get(row[4]) ?? 99, table.length) * 10) / 10,
      });
    }
    if (!all.length) continue;
    const eligible = all.filter((c) => c.apps >= minApps).sort((a, b) => b.score - a.score);
    candidates[leagueId] = eligible.slice(0, 12).map(
      (c): Candidate => ({ playerId: c.playerId, name: c.name, clubId: c.clubId, leagueId, apps: c.apps, goals: c.goals, assists: c.assists, avg: c.avg, score: c.score }),
    );
    const top = [...all].sort((a, b) => b.goals - a.goals || a.apps - b.apps || b.avg - a.avg)[0];
    const young = eligible.find((c) => ageOn(c.p.birthDate, date) <= YOUNG_AGE);
    const wins: [AwardKind, (typeof all)[number] | undefined, string][] = [
      ['pots', eligible[0], eligible[0] ? `rating ${eligible[0].avg.toFixed(2)}, ${eligible[0].goals} gol, ${eligible[0].assists} assist` : ''],
      ['top', top.goals > 0 ? top : undefined, `${top.goals} gol`],
      ['young', young, young ? `rating ${young.avg.toFixed(2)}, ${young.goals} gol` : ''],
    ];
    const lines: string[] = [];
    for (const [kind, c, detail] of wins) {
      if (!c) continue;
      const e: AwardEntry = { kind, scope: leagueId, season: s.label, playerId: c.playerId, name: c.name, clubId: c.clubId, value: detail };
      awards.unshift(e);
      lines.push(`${AWARD_NAME[kind]}: ${c.name} (${clubName(c.clubId)}), ${detail}`);
      if (c.playerId === user.id) {
        const rep: [number, number] = kind === 'pots' ? [4, 2] : [3, 1];
        giveUser(career, user, e, `${AWARD_NAME[kind]} ${league.name}`, detail, league.name, rep);
      }
    }
    // kabar penghargaan liga tempatmu bermain
    const mine = led.rows[user.id] || (user.contract && world.clubs.find((c) => c.id === user.contract!.clubId)?.leagueId === leagueId);
    if (mine && lines.length) {
      const myRank = eligible.findIndex((c) => c.playerId === user.id);
      career.inbox.unshift({
        id: `awards-${leagueId}-${s.label}`,
        date: career.currentDate,
        from: league.name,
        title: `Penghargaan ${league.name} ${s.label}`,
        body: lines.join('. ') + '.' + (myRank >= 0 ? ` Kamu berada di peringkat ${myRank + 1} daftar pemain terbaik musim ini.` : ''),
      });
    }
  }
  awards.length = Math.min(awards.length, AWARDS_LIMIT);
  return { ...world, awards, candidates };
}

/** Tanggal penghargaan dunia tiap tahun */
export const worldAwardDay = (year: number) => `${year}-12-01`;

/** "Bintang Dunia" & "Bintang Muda Dunia": kandidat terbaik dari semua liga + bonus turnamen timnas */
export function worldAwards(world: World, career: Career, user: Player, year: number): World {
  // tahun pertama game: belum ada satu musim penuh di semua liga
  if (world.startDate > `${year}-01-01`) return world;
  const byId = new Map(world.players.map((p) => [p.id, p]));
  const repOf = new Map(world.leagues.map((l) => [l.id, l.reputation]));
  const t = world.intl?.tournament;
  const cup = t && t.year === year && t.champion ? t : undefined;
  const squadSets = new Map<string, Set<string>>();
  const cupBonus = (p: Player) => {
    if (!cup) return 0;
    const nat = p.nationalityId;
    if (!cup.teams.includes(nat)) return 0;
    let set = squadSets.get(nat);
    if (!set) {
      const sq = nationalSquad(world, nat, 'senior', `${year}-06-01`, p.isUser ? p : undefined, p.isUser ? career : undefined);
      squadSets.set(nat, (set = new Set(sq.map((q) => q.id))));
    }
    if (!set.has(p.id)) return 0;
    const stage = stageReached(cup, nat);
    return stage === 'Juara' ? 6 : stage === STAGE_NAME.FINAL ? 3 : stage === STAGE_NAME.SF ? 1.5 : stage === STAGE_NAME.QF ? 0.5 : 0;
  };
  const pool: Candidate[] = [];
  const seen = new Set<string>();
  for (const [lid, list] of Object.entries(world.candidates ?? {})) {
    for (const c of list) {
      const p = byId.get(c.playerId);
      if (!p || seen.has(c.playerId)) continue;
      seen.add(c.playerId);
      pool.push({ ...c, score: Math.round((c.score + (repOf.get(lid) ?? 40) * 0.12 + cupBonus(p)) * 10) / 10 });
    }
  }
  if (!pool.length) return world;
  pool.sort((a, b) => b.score - a.score);
  const top = pool.slice(0, 10);
  const young = pool.filter((c) => ageOn(byId.get(c.playerId)!.birthDate, worldAwardDay(year)) <= YOUNG_AGE).slice(0, 5);
  const y = String(year);
  const awards = [...(world.awards ?? [])];
  const clubName = (id?: string) => world.clubs.find((c) => c.id === id)?.name ?? '';
  const entries: [AwardKind, Candidate | undefined][] = [
    ['world', top[0]],
    ['worldYoung', young[0]],
  ];
  for (const [kind, c] of entries) {
    if (!c) continue;
    const detail = `${c.goals} gol, ${c.assists} assist, rating ${c.avg.toFixed(2)}`;
    const e: AwardEntry = { kind, scope: 'world', season: y, playerId: c.playerId, name: c.name, clubId: c.clubId, value: detail };
    awards.unshift(e);
    if (c.playerId === user.id) giveUser(career, user, e, `${AWARD_NAME[kind]} ${y}`, detail, 'Federasi Sepak Bola Dunia', kind === 'world' ? [5, 10] : [3, 4]);
  }
  const myRank = top.findIndex((c) => c.playerId === user.id);
  if (myRank > 0) user.reputation.world = clamp(user.reputation.world + (myRank < 3 ? 4 : 2), 1, 100);
  const w0 = top[0];
  career.inbox.unshift({
    id: `world-award-${y}`,
    date: career.currentDate,
    from: 'Federasi Sepak Bola Dunia',
    title: `Bintang Dunia ${y}: ${w0.name}`,
    body:
      `${w0.name} (${clubName(w0.clubId)}) terpilih sebagai Bintang Dunia ${y}.` +
      (young[0] ? ` Bintang Muda Dunia: ${young[0].name} (${clubName(young[0].clubId)}).` : '') +
      (myRank >= 0 ? ` Kamu masuk 10 besar di peringkat ${myRank + 1}!` : ''),
  });
  awards.length = Math.min(awards.length, AWARDS_LIMIT);
  return { ...world, awards, worldAward: { year: y, top, young }, tallies: pruneTallies(world, byId) };
}

/** Buang hitungan pemain yang sudah pensiun / pindah (supaya save tidak membengkak) */
function pruneTallies(world: World, byId: Map<string, Player>): Tallies | undefined {
  const t = world.tallies;
  if (!t) return t;
  const club: Record<string, number> = {};
  for (const [k, v] of Object.entries(t.club)) {
    const [c, pid] = k.split('|');
    const p = byId.get(pid);
    if (p && (p.contract?.clubId === c || v >= 20)) club[k] = v;
  }
  const keep = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).filter(([pid]) => byId.has(pid)));
  return { club, natGoals: keep(t.natGoals), natCaps: keep(t.natCaps) };
}

/** Top skor & pemain terbaik sementara di satu liga (untuk panel) */
export function leagueLeaders(world: World, leagueId: string, n = 5) {
  const led = world.ledger?.[leagueId];
  if (!led) return null;
  const byId = new Map(world.players.map((p) => [p.id, p]));
  const rows = Object.entries(led.rows)
    .map(([pid, r]) => ({ pid, p: byId.get(pid), apps: r[0], goals: r[1], assists: r[2], avg: r[3] / r[0], clubId: r[4] }))
    .filter((x) => x.p && x.apps > 0);
  return {
    season: led.season,
    scorers: [...rows].sort((a, b) => b.goals - a.goals || a.apps - b.apps).slice(0, n),
    assists: [...rows].sort((a, b) => b.assists - a.assists || a.apps - b.apps).slice(0, n),
  };
}
