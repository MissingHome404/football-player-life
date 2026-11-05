// Pertandingan pemain kita minggu ini (simulasi cepat, sebelum ada match engine 2D):
// dipilih pelatih atau tidak, berapa menit, rating, gol, dan assist.

import type { Position } from '../data/attributes';
import type { Career, Club, Competition, MatchRecord, MatchStatus, Player, SeasonStat, World } from '../types';
import { Rng, clamp } from '../rng';
import { simScore, squadOf, topEleven, type WeekMatches } from './season';
import { FULL, engineAttrs, pickXI, playEngine, slotFor, type EngineInput, type ETeam } from './engine';
import { shortName } from '../gen/names';

type Group = 'GK' | 'DEF' | 'MID' | 'ATT';
const GROUP: Record<Position, Group> = {
  GK: 'GK', DR: 'DEF', DC: 'DEF', DL: 'DEF', WBR: 'DEF', WBL: 'DEF',
  DM: 'MID', MC: 'MID', MR: 'ATT', ML: 'ATT', AMR: 'ATT', AMC: 'ATT', AML: 'ATT', ST: 'ATT',
};
const STARTERS: Record<Group, number> = { GK: 1, DEF: 4, MID: 3, ATT: 3 };
const BENCH: Record<Group, number> = { GK: 1, DEF: 2, MID: 2, ATT: 2 };

// Peluang mencetak gol / memberi assist per gol tim, sesuai posisi
const GOAL_W: Record<Position, number> = {
  GK: 0, DC: 0.04, DR: 0.03, DL: 0.03, WBR: 0.04, WBL: 0.04, DM: 0.05, MC: 0.08,
  MR: 0.1, ML: 0.1, AMC: 0.16, AMR: 0.17, AML: 0.17, ST: 0.32,
};
const ASSIST_W: Record<Position, number> = {
  GK: 0.01, DC: 0.03, DR: 0.08, DL: 0.08, WBR: 0.1, WBL: 0.1, DM: 0.07, MC: 0.12,
  MR: 0.15, ML: 0.15, AMC: 0.18, AMR: 0.17, AML: 0.17, ST: 0.1,
};

export const groupOf = (pos: Position) => GROUP[pos];

/** Rata-rata rating beberapa pertandingan terakhir yang dimainkan */
export function recentForm(career: Career, n = 5): number | null {
  const r = career.matches.filter((m) => m.rating !== undefined).slice(0, n);
  return r.length ? r.reduce((s, m) => s + m.rating!, 0) / r.length : null;
}

interface Perf {
  minutes: number;
  rating?: number;
  goals: number;
  assists: number;
  cleanSheet?: boolean;
  motm?: boolean;
}

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
  // pemain pengganti: rating lebih dekat ke 6.5
  rating = 6.5 + (rating - 6.5) * (0.4 + 0.6 * share);
  rating = Math.round(clamp(rating, 4, 10) * 10) / 10;
  return { minutes, rating, goals, assists, cleanSheet, motm: rating >= 8.2 };
}

/** Dipilih pelatih? Bandingkan dengan rekan seposisi (CA + sedikit acak) */
function selection(rng: Rng, p: Player, teammates: Player[], career: Career): MatchStatus {
  if (career.injury) return 'Cedera';
  const g = GROUP[p.mainPosition];
  const form = recentForm(career, 3);
  let mine = p.ca + rng.normal(0, 5);
  if (career.fitness < 55) mine -= (55 - career.fitness) / 2;
  if (form !== null) mine += form >= 7.2 ? 4 : form <= 6.1 ? -4 : 0;
  // janji peran di kontrak dan janji manajer setelah diprotes
  if (p.contract?.role === 'Inti') mine += 5;
  else if (p.contract?.role === 'Rotasi') mine += 2;
  // manajer yang menyukaimu lebih sering memainkanmu
  mine += (career.rel.manager?.value ?? 0) / 15;
  const promised = career.cooldowns.promise_bonus;
  if (promised !== undefined && career.week - promised <= 8) mine += 6;
  const rank = teammates.filter((q) => GROUP[q.mainPosition] === g && q.ca + rng.normal(0, 5) > mine).length;
  if (rank < STARTERS[g]) return 'Inti';
  if (rank < STARTERS[g] + BENCH[g]) return 'Cadangan';
  return 'Tidak masuk skuad';
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
): { rec: MatchRecord; sim?: EngineInput } | null {
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
    status = selection(rng, p, seniors, career);
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
    status = selection(rng, p, youth, career);
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
    status = career.injury ? 'Cedera' : 'Inti';
  }

  // Laga tim kita saat kamu masuk skuad: dimainkan oleh match engine 2D
  let perf: Perf;
  let sim: EngineInput | undefined;
  let extra: Partial<MatchRecord> = {};
  if (club && opponentId && (status === 'Inti' || status === 'Cadangan') && ours.length >= 11 && oppSquad.length >= 11) {
    const oppClub = world.clubs.find((c) => c.id === opponentId)!;
    const fit = clamp(0.75 + career.fitness / 400, 0.75, 1);
    const xiOurs = pickXI(ours, p, status === 'Inti');
    const user = xiOurs.xi.find((e) => e.user);
    if (user) for (const k of ['pace', 'acc', 'sta'] as const) user.a[k] *= fit;
    const ourTeam: ETeam = { id: club.id, name: comp === 'U19' ? `${club.name} U19` : club.name, color: club.colors[0], color2: club.colors[1], xi: xiOurs.xi };
    if (status === 'Cadangan' && rng.chance(0.45)) {
      const mins = rng.int(5, 35);
      const a = engineAttrs(p);
      for (const k of ['pace', 'acc', 'sta'] as const) a[k] *= fit;
      const slot = slotFor(p);
      ourTeam.sub = { at: FULL - (mins / 90) * FULL, player: { id: p.id, name: shortName(p), num: 12, slot, user: true, a }, slot };
    }
    const oppTeam: ETeam = {
      id: oppClub.id,
      name: comp === 'U19' ? `${oppClub.name} U19` : oppClub.name,
      color: oppClub.colors[0],
      color2: oppClub.colors[1],
      xi: pickXI(oppSquad, undefined, false).xi,
    };
    sim = { seed: `${career.characterSeed}:${date}:${club.id}`, home: home ? ourTeam : oppTeam, away: home ? oppTeam : ourTeam };
    const r = playEngine(sim);
    const us = home ? 0 : 1;
    score = [r.score[us], r.score[1 - us]];
    const st = r.stats[p.id];
    const minutes = st ? Math.max(1, Math.round((((st.off ?? FULL) - st.on) / FULL) * 90)) : 0;
    const group = GROUP[p.mainPosition];
    perf = st
      ? {
          minutes,
          rating: r.ratings[p.id],
          goals: st.goals,
          assists: st.assists,
          cleanSheet: score[1] === 0 && minutes >= 60 && (group === 'GK' || group === 'DEF'),
          motm: r.motm === p.id,
        }
      : { minutes: 0, goals: 0, assists: 0 };
    extra = {
      scorers: r.events.filter((e) => e.kind === 'goal').map((e) => [e.min, e.side === us ? 0 : 1, e.name ?? ''] as [number, 0 | 1, string]),
      shots: [r.shots[us], r.shots[1 - us]],
      possession: [r.possession[us], r.possession[1 - us]],
    };
    // skor dari match engine menggantikan hasil cepat di klasemen
    if (fixture) {
      const s = week.seasons[fixture.leagueId];
      s.results[fixture.round][fixture.index] = fixture.home ? [score[0], score[1]] : [score[1], score[0]];
    }
  } else {
    perf = performance(rng, p, status, teamCA, score, career.fitness);
  }
  const rec: MatchRecord = { date, comp, season, team, opponent, opponentId, home, score, status, ...perf, ...extra };
  if (perf.minutes > 0) {
    const row = statRow(career, season, team, comp, club?.id);
    row.apps++;
    if (status === 'Inti') row.starts++;
    row.minutes += perf.minutes;
    row.goals += perf.goals;
    row.assists += perf.assists;
    if (perf.cleanSheet) row.cleanSheets++;
    row.ratingSum += perf.rating ?? 0;
    if (perf.motm) row.motm++;
  }
  return { rec, sim };
}
