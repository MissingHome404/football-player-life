// Pertandingan pemain kita minggu ini (simulasi cepat, sebelum ada match engine 2D):
// dipilih pelatih atau tidak, berapa menit, rating, gol, dan assist.

import type { Position } from '../data/attributes';
import type { Career, Club, Competition, MatchRecord, MatchStatus, Player, PlayingStyle, SeasonStat, World } from '../types';
import { Rng, clamp } from '../rng';
import { simScore, squadOf, topEleven, type WeekMatches } from './season';
import { FULL, engineAttrs, injuryRisk, minutesPlayed, pickXI, playEngine, roleFor, slotFor, type EngineInput, type EngineResult, type EP, type ETeam } from './engine';
import { injuryFactor } from './injury';
import { shortName } from '../gen/names';
import { applyBadges } from './badges';
import { afterGame, cardOf, serveBan } from './discipline';
import { assignXI, clubFormation, type FormationId } from './formation';
import { clubTactic, tacticIntensity, tacticK, type Tactic } from './tactics';
import { playTraits } from './traits';
import { clubKey, tacticFam } from './understanding';
import { leagueStakes } from './stakes';

type Group = 'GK' | 'DEF' | 'MID' | 'ATT';
const GROUP: Record<Position, Group> = {
  GK: 'GK', DR: 'DEF', DC: 'DEF', DL: 'DEF', WBR: 'DEF', WBL: 'DEF',
  DM: 'MID', MC: 'MID', MR: 'ATT', ML: 'ATT', AMR: 'ATT', AMC: 'ATT', AML: 'ATT', ST: 'ATT',
};
const BENCH: Record<Group, number> = { GK: 1, DEF: 2, MID: 2, ATT: 2 };

// Peluang mencetak gol / memberi assist per gol tim, sesuai posisi
export const GOAL_W: Record<Position, number> = {
  GK: 0, DC: 0.04, DR: 0.03, DL: 0.03, WBR: 0.04, WBL: 0.04, DM: 0.05, MC: 0.08,
  MR: 0.1, ML: 0.1, AMC: 0.16, AMR: 0.17, AML: 0.17, ST: 0.32,
};
export const ASSIST_W: Record<Position, number> = {
  GK: 0.01, DC: 0.03, DR: 0.08, DL: 0.08, WBR: 0.1, WBL: 0.1, DM: 0.07, MC: 0.12,
  MR: 0.15, ML: 0.15, AMC: 0.18, AMR: 0.17, AML: 0.17, ST: 0.1,
};

export const groupOf = (pos: Position) => GROUP[pos];

/** Rata-rata rating beberapa pertandingan terakhir yang dimainkan */
export function recentForm(career: Career, n = 5): number | null {
  const r = career.matches.filter((m) => m.rating !== undefined).slice(0, n);
  return r.length ? r.reduce((s, m) => s + m.rating!, 0) / r.length : null;
}

export interface Perf {
  minutes: number;
  rating?: number;
  goals: number;
  assists: number;
  cleanSheet?: boolean;
  motm?: boolean;
  card?: MatchRecord['card'];
  injured?: boolean;
}

/** Kartu di laga simulasi cepat: bek dan pemain agresif lebih sering kena */
const CARD_W: Record<Group, number> = { GK: 0.25, DEF: 1.2, MID: 1.1, ATT: 0.75 };

function performance(
  rng: Rng,
  p: Player,
  status: MatchStatus,
  teamCA: number,
  score: [number, number],
  fitness: number,
): Perf {
  let minutes = 0;
  if (status === 'Inti') minutes = rng.chance(0.8) ? 90 : rng.int(60, 85);
  else if (status === 'Cadangan' && rng.chance(0.45)) minutes = 90 - rng.int(55, 85);
  if (!minutes) return { minutes: 0, goals: 0, assists: 0 };

  const share = minutes / 90;
  const avgAttr = 1 + teamCA / 11.5; // perkiraan rata-rata atribut rekan setim
  const t = p.technical;
  const m = p.mental;
  const fGoal = clamp((t.Finishing + m.Composure + m['Off the Ball']) / 3 / avgAttr, 0.3, 2);
  const fAssist = clamp((t.Passing + m.Vision + (t.Crossing + t.Technique) / 2) / 3 / avgAttr, 0.3, 2);
  let goals = 0;
  let assists = 0;
  for (let g = 0; g < score[0]; g++) {
    if (rng.chance(clamp(GOAL_W[p.mainPosition] * fGoal * share, 0, 0.7))) goals++;
    else if (rng.chance(clamp(0.8 * ASSIST_W[p.mainPosition] * fAssist * share, 0, 0.6))) assists++;
  }

  const group = GROUP[p.mainPosition];
  const conceded = score[1];
  const cleanSheet = conceded === 0 && minutes >= 60 && (group === 'GK' || group === 'DEF');
  const sd = 0.95 - p.hidden.Consistency / 40;
  let rating = 6.3 + (p.ca - teamCA) / 30;
  rating += score[0] > score[1] ? 0.3 : score[0] < score[1] ? -0.3 : 0;
  rating += goals * 0.9 + assists * 0.5;
  if (group === 'GK') rating += (cleanSheet ? 0.6 : 0) - conceded * 0.25;
  else if (group === 'DEF') rating += (cleanSheet ? 0.4 : 0) - conceded * 0.15;
  if (fitness < 50) rating -= 0.3;
  rating += rng.normal(0, sd);
  const cw = CARD_W[group] * (0.5 + m.Aggression / 20) * share;
  const card: Perf['card'] = rng.chance(0.006 * cw) ? 'R' : rng.chance(0.13 * cw) ? (rng.chance(0.04) ? 'YR' : 'Y') : undefined;
  if (card === 'Y') rating -= 0.2;
  else if (card) rating -= 1;
  // pemain pengganti: rating lebih dekat ke 6.5
  rating = 6.5 + (rating - 6.5) * (0.4 + 0.6 * share);
  rating = Math.round(clamp(rating, 4, 10) * 10) / 10;
  return { minutes, rating, goals, assists, cleanSheet, motm: rating >= 8.2, ...(card ? { card } : {}) };
}

/** Dipilih pelatih? Bandingkan dengan rekan seposisi (CA + sedikit acak) */
export function selection(rng: Rng, p: Player, teammates: Player[], career: Career, bonus = 0, formation: FormationId = '4-3-3'): MatchStatus {
  if (career.injury) return 'Cedera';
  const g = GROUP[p.mainPosition];
  const form = recentForm(career, 3);
  let mine = p.ca + rng.normal(0, 5) + bonus;
  if (career.fitness < 55) mine -= (55 - career.fitness) / 2;
  if (form !== null) mine += form >= 7.2 ? 4 : form <= 6.1 ? -4 : 0;
  // janji peran di kontrak dan janji manajer setelah diprotes
  if (p.contract?.role === 'Inti') mine += 5;
  else if (p.contract?.role === 'Rotasi') mine += 2;
  // manajer yang menyukaimu lebih sering memainkanmu
  mine += (career.rel.manager?.value ?? 0) / 15;
  const promised = career.cooldowns.promise_bonus;
  if (promised !== undefined && career.week - promised <= 8) mine += 6;
  // pelatih menyusun XI sesuai formasinya: posisi yang cocok lebih penting daripada sekadar CA
  const mates = teammates.filter((q) => q.id !== p.id);
  const value = new Map<Player, number>(mates.map((q) => [q, q.ca + rng.normal(0, 5)]));
  value.set(p, mine);
  const xi = new Set(assignXI([p, ...mates], formation, (q) => value.get(q)!).values());
  if (xi.has(p)) return 'Inti';
  const rank = mates.filter((q) => GROUP[q.mainPosition] === g && !xi.has(q) && value.get(q)! > mine).length;
  return rank < BENCH[g] ? 'Cadangan' : 'Tidak masuk skuad';
}

/** Cari baris statistik musim (buat kalau belum ada) */
export function statRow(career: Career, season: string, team: string, comp: Competition, clubId?: string): SeasonStat {
  let row = career.stats.find((s) => s.season === season && s.team === team && s.comp === comp);
  if (!row) {
    row = { season, team, clubId, comp, apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, cleanSheets: 0, ratingSum: 0, motm: 0 };
    career.stats.push(row);
  }
  return row;
}

/** Laga liga milikmu yang dimainkan match engine (untuk statistik musim semua pemain) */
export interface UserEngineMatch {
  leagueId: string;
  round: number;
  index: number;
  result: EngineResult;
  input: EngineInput;
}

export interface GameSide {
  id: string;
  name: string;
  colors: readonly [string, string] | string[];
  squad: Player[];
  /** gaya main pelatih (klub) atau gaya tetap tim nasional */
  style?: PlayingStyle;
  formation?: FormationId;
  /** taktik pelatih: peran & tugas tiap tempat dan instruksi tim */
  tactic?: Tactic;
  /** kunci pemahaman taktik pemain kita (lihat understanding.ts) */
  famKey?: string;
}

/** Sisi laga untuk sebuah klub, lengkap dengan taktik pelatihnya */
export function clubSide(club: Club, squad: Player[], name = club.name): GameSide {
  const tactic = clubTactic(club);
  return { id: club.id, name, colors: club.colors, squad, style: club.playingStyle, formation: tactic.formation, tactic, famKey: clubKey(club) };
}

/**
 * Satu laga timmu yang dimainkan match engine 2D (klub atau timnas). Kamu masuk XI kalau
 * statusmu Inti, atau masuk dari bangku cadangan (45%) kalau Cadangan.
 */
export function engineGame(o: {
  p: Player;
  career: Career;
  status: MatchStatus;
  rng: Rng;
  ours: GameSide;
  theirs: GameSide;
  home: boolean;
  seed: string;
  /** hitung jenis gol untuk syarat lencana (hanya laga senior) */
  feats?: boolean;
  /** lapangan netral (turnamen): tanpa keunggulan kandang */
  neutral?: boolean;
  /** tingkat tekanan laga 0..1 (lihat stakes.ts) */
  stakes?: number;
}): { score: [number, number]; perf: Perf; sim: EngineInput; extra: Partial<MatchRecord>; result: EngineResult } {
  const { p, career, status, rng, home } = o;
  const fit = clamp(0.75 + career.fitness / 400, 0.75, 1);
  // pemahaman taktikmu menentukan seberapa baik kamu memainkan peran yang diminta pelatih
  const userFam = o.ours.famKey ? tacticFam(career, o.ours.famKey, p) : undefined;
  const xiOurs = pickXI(o.ours.squad, p, status === 'Inti', o.ours.formation, o.ours.tactic, (q) => (q.id === p.id ? userFam : undefined));
  const user = xiOurs.xi.find((e) => e.user);
  if (user) {
    applyBadges(user.a, career.badges);
    for (const k of ['pace', 'acc', 'sta'] as const) user.a[k] *= fit;
  }
  const ourTeam: ETeam = {
    id: o.ours.id,
    name: o.ours.name,
    color: o.ours.colors[0],
    color2: o.ours.colors[1],
    xi: xiOurs.xi,
    bench: xiOurs.bench,
    style: o.ours.style,
    formation: o.ours.tactic?.formation ?? o.ours.formation,
    ...(o.ours.tactic ? { tactic: tacticK(o.ours.tactic) } : {}),
  };
  // risiko cedera pemain kita juga dipengaruhi gaya hidup (ahli gizi, fisio, dll.)
  if (user) user.a.inj = injuryRisk(p) * injuryFactor(career);
  if (status === 'Cadangan') {
    const a = engineAttrs(p);
    applyBadges(a, career.badges);
    for (const k of ['pace', 'acc', 'sta'] as const) a[k] *= fit;
    a.inj = injuryRisk(p) * injuryFactor(career);
    const formation = o.ours.tactic?.formation ?? o.ours.formation;
    const slot = slotFor(p, formation);
    const rd = roleFor(p, formation, o.ours.tactic);
    const me: EP = { id: p.id, name: shortName(p), num: 12, slot, user: true, a, role: rd.role, duty: rd.duty, traits: playTraits(p), fam: userFam, ...(rd.oop ? { oop: rd.oop } : {}) };
    if (rng.chance(0.45)) {
      const mins = rng.int(5, 35);
      ourTeam.sub = { at: FULL - (mins / 90) * FULL, player: me, slot };
    } else {
      // tetap di bangku: bisa masuk kalau rekan seposisi cedera
      ourTeam.bench = [me, ...xiOurs.bench.filter((b) => b.id !== p.id)].map((b, i) => ({ ...b, num: 12 + i }));
    }
  }
  const xiTheirs = pickXI(o.theirs.squad, undefined, false, o.theirs.formation, o.theirs.tactic);
  const oppTeam: ETeam = {
    id: o.theirs.id,
    name: o.theirs.name,
    color: o.theirs.colors[0],
    color2: o.theirs.colors[1],
    xi: xiTheirs.xi,
    bench: xiTheirs.bench,
    style: o.theirs.style,
    formation: o.theirs.tactic?.formation ?? o.theirs.formation,
    ...(o.theirs.tactic ? { tactic: tacticK(o.theirs.tactic) } : {}),
  };
  const sim: EngineInput = { seed: o.seed, home: home ? ourTeam : oppTeam, away: home ? oppTeam : ourTeam };
  if (o.neutral) sim.neutral = true;
  if (o.stakes !== undefined) sim.stakes = o.stakes;
  const r = playEngine(sim);
  const us = home ? 0 : 1;
  const score: [number, number] = [r.score[us], r.score[1 - us]];
  const st = r.stats[p.id];
  const minutes = st ? Math.max(1, Math.round(minutesPlayed(st))) : 0;
  const group = GROUP[p.mainPosition];
  if (st && o.feats) {
    const f = (career.feats ??= { long: 0, set: 0, head: 0 });
    f.long += st.longGoals;
    f.set += st.setGoals;
    f.head += st.headGoals;
  }
  const perf: Perf = st
    ? {
        minutes,
        rating: r.ratings[p.id],
        goals: st.goals,
        assists: st.assists,
        cleanSheet: score[1] === 0 && minutes >= 60 && (group === 'GK' || group === 'DEF'),
        motm: r.motm === p.id,
        ...(cardOf(st.yellow, st.red) ? { card: cardOf(st.yellow, st.red) } : {}),
        ...(st.injured ? { injured: true } : {}),
      }
    : { minutes: 0, goals: 0, assists: 0 };
  const extra: Partial<MatchRecord> = {
    scorers: r.events.filter((e) => e.kind === 'goal').map((e) => [e.min, e.side === us ? 0 : 1, e.og ? `${e.name ?? ''} (bd)` : (e.name ?? '')] as [number, 0 | 1, string]),
    shots: [r.shots[us], r.shots[1 - us]],
    possession: [r.possession[us], r.possession[1 - us]],
    ...(o.ours.tactic ? { intensity: Math.round(tacticIntensity(o.ours.tactic) * 100) / 100 } : {}),
  };
  return { score, perf, sim, extra, result: r };
}

/** Catat menit, gol, assist, dan rating ke baris statistik musim */
export function addStats(career: Career, rec: MatchRecord, clubId?: string): SeasonStat | undefined {
  if (rec.minutes <= 0) return undefined;
  const row = statRow(career, rec.season, rec.team, rec.comp, clubId);
  row.apps++;
  if (rec.status === 'Inti') row.starts++;
  row.minutes += rec.minutes;
  row.goals += rec.goals;
  row.assists += rec.assists;
  if (rec.cleanSheet) row.cleanSheets++;
  row.ratingSum += rec.rating ?? 0;
  if (rec.motm) row.motm++;
  return row;
}

/**
 * Pertandingan pemain kita minggu ini, kalau ada. Senior ikut jadwal liga klubnya,
 * U19 dan amatir main di minggu yang sama dengan liga di negaranya.
 */
export function userMatch(
  world: World,
  career: Career,
  p: Player,
  week: WeekMatches,
  rng: Rng,
  notes?: string[],
): { rec: MatchRecord; sim?: EngineInput; engine?: UserEngineMatch } | null {
  const club: Club | undefined = p.contract ? world.clubs.find((c) => c.id === p.contract!.clubId) : undefined;
  const squad = club ? squadOf(world, club.id).filter((q) => !q.isUser) : [];
  let comp: Competition;
  let season: string;
  let team: string;
  let opponent: string;
  let opponentId: string | undefined;
  let home: boolean;
  let date: string;
  let score: [number, number];
  let teamCA: number;
  let status: MatchStatus;
  let oppSquad: Player[] = [];
  let ours: Player[] = [];
  let fixture: { leagueId: string; round: number; index: number; home: boolean } | undefined;
  let engine: UserEngineMatch | undefined;

  if (club && !p.isYouth) {
    const f = week.played.get(club.id);
    if (!f) return null;
    comp = 'Liga';
    season = f.season;
    team = club.name;
    opponentId = f.opponentId;
    opponent = world.clubs.find((c) => c.id === f.opponentId)!.name;
    home = f.home;
    date = f.date;
    score = f.score;
    const seniors = squad.filter((q) => !q.isYouth);
    teamCA = topEleven(seniors.map((q) => q.ca));
    status = serveBan(career, 'club') ? 'Skorsing' : selection(rng, p, seniors, career, 0, clubFormation(club));
    ours = seniors;
    oppSquad = squadOf(world, f.opponentId).filter((q) => !q.isYouth && !q.isUser);
    fixture = { leagueId: f.leagueId, round: f.round, index: f.index, home: f.home };
  } else if (club) {
    if (!week.leaguesPlayed.has(club.leagueId)) return null;
    comp = 'U19';
    season = week.seasons[club.leagueId].label;
    date = week.leaguesPlayed.get(club.leagueId)!;
    team = `${club.name} U19`;
    const others = world.clubs.filter((c) => c.leagueId === club.leagueId && c.id !== club.id);
    const opp = rng.pick(others);
    opponentId = opp.id;
    opponent = `${opp.name} U19`;
    home = rng.chance(0.5);
    const youth = squad.filter((q) => q.isYouth);
    teamCA = topEleven(youth.map((q) => q.ca));
    oppSquad = squadOf(world, opp.id).filter((q) => q.isYouth && !q.isUser);
    ours = youth;
    const oppCA = topEleven(oppSquad.map((q) => q.ca));
    const s = home ? simScore(rng, teamCA, oppCA) : simScore(rng, oppCA, teamCA);
    score = home ? s : [s[1], s[0]];
    status = serveBan(career, 'club') ? 'Skorsing' : selection(rng, p, youth, career, 0, clubFormation(club));
  } else {
    const league = world.leagues.find((l) => l.countryId === p.nationalityId);
    if (!league || !week.leaguesPlayed.has(league.id)) return null;
    comp = 'Amatir';
    season = week.seasons[league.id].label;
    date = week.leaguesPlayed.get(league.id)!;
    team = career.teamLabel;
    const cities = world.clubs.filter((c) => c.countryId === p.nationalityId).map((c) => c.city);
    opponent = `${career.origin === 'ssb' ? 'SSB' : 'Tim kampung'} ${rng.pick(cities)}`;
    home = rng.chance(0.5);
    // tim amatir: rekan setim sedikit di bawah levelmu
    teamCA = Math.max(20, p.ca - 8 + rng.normal(0, 4));
    const oppCA = teamCA + rng.normal(0, 10);
    const s = home ? simScore(rng, teamCA, oppCA) : simScore(rng, oppCA, teamCA);
    score = home ? s : [s[1], s[0]];
    status = serveBan(career, 'club') ? 'Skorsing' : career.injury ? 'Cedera' : 'Inti';
  }

  // Laga tim kita saat kamu masuk skuad: dimainkan oleh match engine 2D
  let perf: Perf;
  let sim: EngineInput | undefined;
  let extra: Partial<MatchRecord> = {};
  if (club && opponentId && (status === 'Inti' || status === 'Cadangan') && ours.length >= 11 && oppSquad.length >= 11) {
    const oppClub = world.clubs.find((c) => c.id === opponentId)!;
    const g = engineGame({
      p,
      career,
      status,
      rng,
      ours: clubSide(club, ours, comp === 'U19' ? `${club.name} U19` : club.name),
      theirs: clubSide(oppClub, oppSquad, comp === 'U19' ? `${oppClub.name} U19` : oppClub.name),
      home,
      seed: `${career.characterSeed}:${date}:${club.id}`,
      feats: comp === 'Liga',
      stakes: leagueStakes({
        round: fixture?.round ?? 0,
        rounds: fixture ? week.seasons[fixture.leagueId].rounds.length : 0,
        derby: !!club.city && club.city === oppClub.city,
        youth: comp === 'U19',
      }),
    });
    ({ score, perf, sim, extra } = g);
    if (fixture) engine = { ...fixture, result: g.result, input: g.sim };
    // skor dari match engine menggantikan hasil cepat di klasemen
    if (fixture) {
      const s = week.seasons[fixture.leagueId];
      s.results[fixture.round][fixture.index] = fixture.home ? [score[0], score[1]] : [score[1], score[0]];
    }
  } else {
    perf = performance(rng, p, status, teamCA, score, career.fitness);
  }
  const rec: MatchRecord = { date, comp, season, team, opponent, opponentId, home, score, status, ...perf, ...extra };
  const row = addStats(career, rec, club?.id);
  afterGame(career, rec, rng, 'club', row, notes, p);
  return { rec, sim, engine };
}
