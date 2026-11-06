// Piala domestik: turnamen sistem gugur per negara tiap musim untuk semua klub divisi 1.
// Laga tengah pekan (Rabu), final hari Minggu di tempat netral, adu penalti kalau imbang.
// Undian tiap babak dilakukan setelah babak sebelumnya selesai.

import { clubFormation } from './formation';
import type { Career, Competition, Cup, CupHonour, CupRound, CupTie, League, LeagueSeason, MatchRecord, MatchStatus, Player, World } from '../types';
import { Rng, clamp } from '../rng';
import { addDays } from '../date';
import { COUNTRY_BY_ID } from '../data/countries';
import { clubStrengths, roundDate, seasonForm, simScore, squadOf } from './season';
import { addStats, engineGame, selection } from './match';
import type { EngineInput } from './engine';
import { afterGame, serveBan } from './discipline';

export const cupName = (league: League) => `Piala ${COUNTRY_BY_ID[league.countryId]?.name ?? league.countryId}`;

function roundName(teams: number): string {
  if (teams === 2) return 'Final';
  if (teams === 4) return 'Semifinal';
  if (teams === 8) return 'Perempat final';
  return `${teams} besar`;
}

/** Bagan piala untuk satu musim liga: babak pertama untuk klub terlemah kalau jumlah klub bukan pangkat dua */
export function createCup(league: League, season: LeagueSeason, strength: Map<string, { senior: number }>, rng: Rng): Cup {
  const clubs = season.clubs.slice().sort((a, b) => (strength.get(b)?.senior ?? 0) - (strength.get(a)?.senior ?? 0));
  const n = clubs.length;
  let size = 1;
  while (size * 2 <= n) size *= 2;
  const extra = n - size;
  // jumlah klub di tiap babak
  const sizes: number[] = extra ? [extra * 2] : [];
  for (let t = size; t >= 2; t /= 2) sizes.push(t);
  const R = season.rounds.length;
  const first = Math.round(R * 0.12);
  const rounds: CupRound[] = sizes.map((t, i) => {
    const idx = Math.round(first + ((R - 2 - first) * i) / Math.max(1, sizes.length - 1));
    const final = i === sizes.length - 1;
    // Rabu setelah pekan liga; final hari Minggu
    const date = addDays(roundDate(season, idx), final ? 1 : 4);
    return { name: extra && i === 0 ? 'Babak pertama' : roundName(t), date, ties: [] };
  });
  // klub terlemah main di babak pertama, sisanya langsung lolos
  const entrants = extra ? clubs.slice(n - extra * 2) : clubs;
  if (extra) rounds[0].byes = clubs.slice(0, n - extra * 2);
  rounds[0].ties = draw(entrants, rng);
  return { id: `${league.id}:${season.label}`, leagueId: league.id, name: cupName(league), season: season.label, rounds };
}

function draw(clubs: string[], rng: Rng): CupTie[] {
  const list = rng.shuffle(clubs.slice());
  const ties: CupTie[] = [];
  for (let i = 0; i + 1 < list.length; i += 2) ties.push({ home: list[i], away: list[i + 1] });
  return ties;
}

export const tieWinner = (t: CupTie): string | undefined => {
  if (!t.score) return undefined;
  const [h, a] = t.score;
  if (h !== a) return h > a ? t.home : t.away;
  if (!t.pens) return undefined;
  return t.pens[0] > t.pens[1] ? t.home : t.away;
};

/** Adu penalti: tim yang lebih kuat sedikit diunggulkan */
export function shootout(rng: Rng, edge: number): [number, number] {
  const homeWins = rng.chance(0.5 + clamp(edge / 200, -0.15, 0.15));
  const lose = rng.int(2, 4);
  const win = Math.min(5, lose + rng.int(1, 2));
  return homeWins ? [win, lose] : [lose, win];
}

/** Babak yang sedang berjalan (berikutnya untuk dimainkan) */
export const currentRound = (cup: Cup) => cup.rounds.findIndex((r) => !r.ties.length || r.ties.some((t) => !t.score));

/** Laga piala berikutnya untuk sebuah klub (kalau masih bertahan) */
export function nextCupTie(world: World, clubId: string): { cup: Cup; round: CupRound; tie: CupTie | null } | null {
  const club = world.clubs.find((c) => c.id === clubId);
  const cup = club && world.cups?.[club.leagueId];
  if (!cup || cup.winner) return null;
  const r = currentRound(cup);
  if (r < 0) return null;
  const round = cup.rounds[r];
  const tie = round.ties.find((t) => t.home === clubId || t.away === clubId) ?? null;
  if (tie) return { cup, round, tie };
  // klub unggulan langsung lolos dari babak pertama
  return round.byes?.includes(clubId) ? { cup, round, tie: null } : null;
}

export interface CupGame {
  rec: MatchRecord;
  sim?: EngineInput;
}

/**
 * Piala domestik minggu ini (from, to]: buat bagan musim baru, mainkan laga, undi babak berikutnya,
 * catat juara. Laga klubmu dimainkan match engine kalau kamu masuk skuad.
 */
export function cupWeek(
  world: World,
  career: Career,
  p: Player,
  from: string,
  to: string,
  rng: Rng,
  notes?: string[],
): { world: World; games: CupGame[] } {
  const strength = clubStrengths(world);
  const cups: Record<string, Cup> = { ...(world.cups ?? {}) };
  const honours: CupHonour[] = [...(world.cupHonours ?? [])];
  const games: CupGame[] = [];
  const myClubId = p.contract && !p.isYouth ? p.contract.clubId : undefined;
  const nameOf = (id: string) => world.clubs.find((c) => c.id === id)?.name ?? id;
  const power = (id: string, year: number) => (strength.get(id)?.senior ?? 60) + seasonForm(id, year);
  const msg = (id: string, title: string, body: string, from: string) => {
    if (career.inbox.some((m) => m.id === id)) return;
    career.inbox.unshift({ id, date: to, from, title, body });
  };

  for (const league of world.leagues) {
    const season = world.seasons[league.id];
    if (!season || season.clubs.length < 4) continue;
    let cup = cups[league.id];
    if (!cup || cup.season !== season.label) {
      cup = createCup(league, season, strength, new Rng(`${world.seed}:cup:${league.id}:${season.label}`));
    } else if (cup.winner || cup.rounds.every((r) => r.date > to)) {
      continue;
    } else {
      cup = structuredClone(cup);
    }
    const mine = !!myClubId && season.clubs.includes(myClubId);
    for (let r = 0; r < cup.rounds.length; r++) {
      const round = cup.rounds[r];
      if (round.date > to) break;
      if (!round.ties.length || round.ties.every((t) => t.score)) continue;
      const live = round.date > from;
      const final = r === cup.rounds.length - 1;
      const trng = new Rng(`${world.seed}:cup:${cup.id}:${r}`);
      for (const tie of round.ties) {
        if (tie.score) continue;
        const h = power(tie.home, season.year);
        const a = power(tie.away, season.year);
        // final di tempat netral: tanpa keunggulan kandang
        tie.score = final && trng.chance(0.5) ? (simScore(trng, a, h).reverse() as [number, number]) : simScore(trng, h, a);
        if (live && mine && (tie.home === myClubId || tie.away === myClubId)) {
          const g = userTie(world, career, p, cup, round, tie, final, h - a, rng, notes);
          if (g) games.push(g);
        }
        if (tie.score[0] === tie.score[1] && !tie.pens) tie.pens = shootout(trng, h - a);
      }
      if (final) {
        const t = round.ties[0];
        cup.winner = tieWinner(t);
        cup.runnerUp = cup.winner === t.home ? t.away : t.home;
        honours.push({ leagueId: league.id, name: cup.name, season: cup.season, winnerId: cup.winner!, runnerUpId: cup.runnerUp });
        if (mine) cupEnd(world, career, cup, myClubId!, msg);
      } else {
        const winners = round.ties.map((t) => tieWinner(t)!);
        const next = cup.rounds[r + 1];
        next.ties = draw([...winners, ...(round.byes ?? [])], trng);
        if (mine && live) {
          const out = round.ties.find((t) => (t.home === myClubId || t.away === myClubId) && tieWinner(t) !== myClubId);
          const tie = next.ties.find((t) => t.home === myClubId || t.away === myClubId);
          if (out) {
            const [s0, s1] = out.home === myClubId ? out.score! : [out.score![1], out.score![0]];
            const pens = out.pens ? ` (kalah adu penalti)` : '';
            msg(`cup-out-${cup.id}`, `Tersingkir dari ${cup.name}`, `${nameOf(myClubId!)} kalah ${s0}-${s1}${pens} dari ${nameOf(out.home === myClubId ? out.away : out.home)} di ${round.name.toLowerCase()} ${cup.name}.`, cup.name);
          } else if (tie) {
            const opp = tie.home === myClubId ? tie.away : tie.home;
            const where = r + 1 === cup.rounds.length - 1 ? 'di tempat netral' : tie.home === myClubId ? 'di kandang' : 'di kandang lawan';
            msg(`cup-draw-${cup.id}-${r + 1}`, `Undian ${cup.name}: ${next.name}`, `${nameOf(myClubId!)} akan melawan ${nameOf(opp)} ${where} pada ${next.date}.`, cup.name);
          }
        }
      }
    }
    cups[league.id] = cup;
  }
  return { world: { ...world, cups, cupHonours: honours }, games };
}

/**
 * Laga klubmu di luar liga (piala, kompetisi benua): skuad dipilih pelatih, dimainkan match engine
 * kalau kamu masuk skuad. Skor dari sudut pandang klubmu. Setelah adu penalti (kalau ada), panggil
 * recordClubGame untuk mencatat statistik, kartu, dan cedera.
 */
export function playClubGame(o: {
  world: World;
  career: Career;
  p: Player;
  oppId: string;
  home: boolean;
  neutral: boolean;
  date: string;
  comp: Competition;
  season: string;
  stage: string;
  /** skor simulasi cepat (sudut pandang klubmu), dipakai kalau kamu tidak bermain */
  quick: [number, number];
  /** bonus peluang dipilih (rotasi pelatih) */
  bonus: number;
  rng: Rng;
  tag: string;
}): CupGame {
  const { world, career, p, rng } = o;
  const clubId = p.contract!.clubId;
  const club = world.clubs.find((c) => c.id === clubId)!;
  const opp = world.clubs.find((c) => c.id === o.oppId)!;
  const seniors = squadOf(world, clubId).filter((q) => !q.isUser && !q.isYouth);
  const theirs = squadOf(world, o.oppId).filter((q) => !q.isUser && !q.isYouth);
  const status: MatchStatus = serveBan(career, 'club') ? 'Skorsing' : selection(rng, p, seniors, career, o.bonus, clubFormation(club));
  let score = o.quick;
  let perf: Partial<MatchRecord> = {};
  let sim: EngineInput | undefined;
  if ((status === 'Inti' || status === 'Cadangan') && seniors.length >= 11 && theirs.length >= 11) {
    const g = engineGame({
      p,
      career,
      status,
      rng,
      ours: { id: club.id, name: club.name, colors: club.colors, squad: seniors, style: club.playingStyle, formation: clubFormation(club) },
      theirs: { id: opp.id, name: opp.name, colors: opp.colors, squad: theirs, style: opp.playingStyle, formation: clubFormation(opp) },
      home: o.home,
      neutral: o.neutral,
      seed: `${career.characterSeed}:${o.date}:${club.id}:${o.tag}`,
      feats: true,
    });
    score = g.score;
    perf = { ...g.perf, ...g.extra };
    sim = g.sim;
  }
  const rec: MatchRecord = {
    date: o.date,
    comp: o.comp,
    season: o.season,
    team: club.name,
    opponent: opp.name,
    opponentId: opp.id,
    home: o.home,
    score,
    status,
    stage: o.stage,
    minutes: 0,
    goals: 0,
    assists: 0,
    ...perf,
  };
  return { rec, sim };
}

/** Catat laga klubmu ke statistik musim, lalu kartu dan cedera */
export function recordClubGame(career: Career, rec: MatchRecord, clubId: string, rng: Rng, notes?: string[]) {
  afterGame(career, rec, rng, 'club', addStats(career, rec, clubId), notes);
}

/** Laga piala klubmu (rotasi pelatih di babak awal) */
function userTie(
  world: World,
  career: Career,
  p: Player,
  cup: Cup,
  round: CupRound,
  tie: CupTie,
  final: boolean,
  /** selisih kekuatan kandang - tandang (untuk adu penalti) */
  edge: number,
  rng: Rng,
  notes?: string[],
): CupGame {
  const clubId = p.contract!.clubId;
  const home = tie.home === clubId;
  const early = cup.rounds.indexOf(round) < cup.rounds.length - 2;
  const g = playClubGame({
    world,
    career,
    p,
    oppId: home ? tie.away : tie.home,
    home,
    neutral: final,
    date: round.date,
    comp: 'Piala',
    season: cup.season,
    stage: `${cup.name} · ${round.name}`,
    quick: home ? tie.score! : [tie.score![1], tie.score![0]],
    bonus: early ? 5 : 0,
    rng,
    tag: 'cup',
  });
  const score = g.rec.score;
  tie.score = home ? score : [score[1], score[0]];
  if (score[0] === score[1]) {
    const pens = shootout(rng, edge);
    tie.pens = pens;
    g.rec.pens = home ? pens : [pens[1], pens[0]];
  }
  recordClubGame(career, g.rec, clubId, rng, notes);
  return g;
}

/** Final piala selesai: trofi kalau klubmu juara dan kamu ikut bermain di piala ini */
function cupEnd(world: World, career: Career, cup: Cup, clubId: string, msg: (id: string, title: string, body: string, from: string) => void) {
  const name = (id: string) => world.clubs.find((c) => c.id === id)?.name ?? id;
  const club = name(clubId);
  const played = career.stats.some((s) => s.comp === 'Piala' && s.season === cup.season && s.clubId === clubId && s.apps > 0);
  if (cup.winner === clubId) {
    let body = `${club} juara ${cup.name} ${cup.season} setelah mengalahkan ${name(cup.runnerUp!)} di final!`;
    if (played) {
      (career.trophies ??= []).push({ id: `cup-${cup.id}`, name: cup.name, season: cup.season, team: club });
      body += ' Kamu ikut membawa timmu juara.';
    }
    msg(`cup-win-${cup.id}`, `Juara ${cup.name}!`, body, cup.name);
  } else if (cup.runnerUp === clubId) {
    msg(`cup-out-${cup.id}`, `Kalah di final ${cup.name}`, `${club} kalah dari ${name(cup.winner!)} di final ${cup.name} ${cup.season}.`, cup.name);
  }
}
