import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { advanceWeek, newCareer, pendingChoices, resolveChoice } from '../sim/week';
import { initRelations } from '../sim/relations';
import { clubStrengths, seasonEnd } from '../sim/season';
import { createCup, cupWeek, nextCupTie, tieWinner } from '../sim/cup';
import { afterGame, banOf } from '../sim/discipline';
import { statRow } from '../sim/match';
import { addDays } from '../date';
import { Rng } from '../rng';
import type { Career, MatchRecord, Player, World } from '../types';

const w = generateWorld({ seed: 'CUP', activeLeagues: ['IDN1', 'ENG1'] });

function start(seed: string) {
  const roll = rollCharacter(w, { countryId: 'IDN', position: 'ST' }, seed);
  const world: World = { ...w, players: [...w.players, roll.player] };
  const career: Career = newCareer(roll, 0, 'test', w.startDate);
  career.rel = initRelations(world, career, roll.player);
  return { world, career, player: roll.player };
}

/** Jalankan piala minggu demi minggu sampai musim liga selesai */
function runSeason(world: World, career: Career, player: Player, leagueId: string) {
  const end = seasonEnd(world.seasons[leagueId]);
  let date = career.currentDate;
  while (date <= end) {
    const to = addDays(date, 7);
    world = cupWeek(world, career, player, date, to, new Rng(date)).world;
    date = to;
  }
  return world;
}

describe('piala domestik', () => {
  it('bagan: babak pertama untuk klub terlemah, laga Rabu, final hari Minggu', () => {
    const league = w.leagues.find((l) => l.id === 'ENG1')!;
    const season = w.seasons.ENG1;
    const cup = createCup(league, season, clubStrengths(w), new Rng('bagan'));
    expect(season.clubs).toHaveLength(20);
    expect(cup.rounds.map((r) => r.name)).toEqual(['Babak pertama', '16 besar', 'Perempat final', 'Semifinal', 'Final']);
    expect(cup.rounds[0].ties).toHaveLength(4);
    expect(cup.rounds[0].byes).toHaveLength(12);
    const first = new Set([...cup.rounds[0].ties.flatMap((t) => [t.home, t.away]), ...cup.rounds[0].byes!]);
    expect(first.size).toBe(20);
    const days = cup.rounds.map((r) => new Date(r.date + 'T00:00:00Z').getUTCDay());
    expect(days.slice(0, -1).every((d) => d === 3)).toBe(true);
    expect(days[days.length - 1]).toBe(0);
    for (let i = 1; i < cup.rounds.length; i++) expect(cup.rounds[i].date > cup.rounds[i - 1].date).toBe(true);
    expect(cup.rounds[cup.rounds.length - 1].date < seasonEnd(season)).toBe(true);
  });

  it('semua babak dimainkan sampai ada juara, sama untuk seed yang sama', () => {
    const run = () => {
      const { world, career, player } = start('CUPRUN');
      return runSeason(world, career, player, 'ENG1');
    };
    const a = run();
    const cup = a.cups!.ENG1;
    expect(cup.winner).toBeDefined();
    for (let r = 0; r < cup.rounds.length; r++) {
      const round = cup.rounds[r];
      expect(round.ties.every((t) => tieWinner(t))).toBe(true);
      if (r === 0) continue;
      // peserta babak ini = pemenang babak sebelumnya (+ klub yang dapat bye)
      const prev = cup.rounds[r - 1];
      const expected = new Set([...prev.ties.map((t) => tieWinner(t)!), ...(prev.byes ?? [])]);
      expect(new Set(round.ties.flatMap((t) => [t.home, t.away]))).toEqual(expected);
    }
    const final = cup.rounds[cup.rounds.length - 1].ties[0];
    expect(tieWinner(final)).toBe(cup.winner);
    expect(a.cupHonours!.some((h) => h.leagueId === 'ENG1' && h.winnerId === cup.winner && h.season === cup.season)).toBe(true);
    expect(run().cups!.ENG1).toEqual(cup);
    // tiap negara punya piala sendiri
    expect(Object.keys(a.cups!)).toHaveLength(w.leagues.length);
  }, 60_000);

  it('laga piala klubmu dimainkan match engine dan tercatat sebagai "Piala"', () => {
    let { world, career } = start('CUPME');
    // jadikan pemain kita bintang senior klub Inggris supaya selalu dipilih
    const club = world.clubs.find((c) => c.leagueId === 'ENG1')!;
    const mate = world.players.find((q) => q.contract?.clubId === club.id && !q.isYouth)!;
    world = {
      ...world,
      // tidak rawan cedera: tes ini tentang laga piala, bukan cedera
      players: world.players.map((q) =>
        q.isUser ? { ...q, isYouth: false, ca: 199, contract: { ...mate.contract! }, hidden: { ...q.hidden, 'Injury Proneness': 1 } } : q,
      ),
    };
    const cupGames: MatchRecord[] = [];
    let watched = 0;
    for (let i = 0; i < 45 && !world.cups?.ENG1?.winner; i++) {
      for (const m of pendingChoices(career)) ({ world, career } = resolveChoice(world, career, m.id, 0));
      const r = advanceWeek(world, career);
      ({ world, career } = r);
      const games = career.matches.filter((m) => m.comp === 'Piala' && !cupGames.some((g) => g.date === m.date));
      cupGames.push(...games);
      if (games.some((g) => g.date === career.lastSim?.date)) watched++;
    }
    expect(cupGames.length).toBeGreaterThan(0);
    for (const g of cupGames) {
      expect(g.stage).toMatch(/^Piala Inggris · /);
      if (g.score[0] === g.score[1]) expect(g.pens).toBeDefined();
    }
    const played = cupGames.filter((g) => g.minutes > 0);
    expect(played.length).toBeGreaterThan(0);
    expect(watched).toBeGreaterThan(0);
    const row = career.stats.find((s) => s.comp === 'Piala')!;
    expect(row.apps).toBe(played.length);
    // tersingkir: tidak ada laga berikutnya; juara: trofi kalau ikut main
    const cup = world.cups!.ENG1;
    if (cup.winner === club.id) expect(career.trophies?.some((t) => t.id === `cup-${cup.id}`)).toBe(true);
    expect(nextCupTie(world, club.id)).toBeNull();
  }, 120_000);

  it('kartu kuning di piala tidak dihitung untuk akumulasi skorsing liga', () => {
    const { career } = start('CUPBAN');
    const row = statRow(career, '2026/27', 'Tim Kita', 'Piala');
    const rec = (date: string): MatchRecord => ({
      date,
      comp: 'Piala',
      season: '2026/27',
      team: 'Tim Kita',
      opponent: 'Lawan',
      home: true,
      score: [1, 0],
      status: 'Inti',
      minutes: 90,
      goals: 0,
      assists: 0,
      card: 'Y',
    });
    for (let i = 1; i <= 5; i++) afterGame(career, rec(`2026-10-0${i}`), new Rng(`y${i}`), 'club', row);
    expect(row.yellow).toBe(5);
    expect(banOf(career, 'club')).toBe(0);
  });
});
