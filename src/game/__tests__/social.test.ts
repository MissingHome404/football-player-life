import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { advanceWeek, newCareer, pendingChoices, resolveChoice } from '../sim/week';
import { initRelations } from '../sim/relations';
import { weeklyBudget } from '../sim/economy';
import { MAX_DEALS, emptySocial, fmtFollowers, followerTarget, socialOf, socialWeek } from '../sim/social';
import { Rng } from '../rng';
import type { Career, MatchRecord, Player, PostType, World } from '../types';

const w = generateWorld({ seed: 'SOC', activeLeagues: ['IDN1'] });

function start(seed: string) {
  const roll = rollCharacter(w, { countryId: 'IDN', position: 'ST' }, seed);
  const world: World = { ...w, players: [...w.players, roll.player] };
  const career: Career = newCareer(roll, 0, 'test', w.startDate);
  career.rel = initRelations(world, career, roll.player);
  return { world, career, player: world.players.find((p) => p.isUser)! };
}

/** Jalankan socialWeek beberapa minggu tanpa laga */
function weeks(career: Career, player: Player, n: number, post: PostType, seed: string, games: MatchRecord[] = []) {
  career.plan.post = post;
  for (let i = 0; i < n; i++) {
    socialWeek(career, player, games, new Rng(`${seed}${i}`), []);
    career.week++;
  }
}

describe('media sosial & sponsor', () => {
  it('pengikut mengikuti reputasi; aktif posting tumbuh lebih cepat dari diam', () => {
    const { career, player } = start('SOC-A');
    const star = { ...player, reputation: { home: 80, world: 70 } };
    expect(followerTarget(star, career)).toBeGreaterThan(followerTarget(player, career) * 50);
    const quiet = structuredClone(career);
    const active = structuredClone(career);
    quiet.social = emptySocial(star);
    active.social = emptySocial(star);
    weeks(quiet, star, 30, 'tidak', 'q');
    weeks(active, star, 30, 'pribadi', 'a');
    expect(active.social!.followers).toBeGreaterThan(quiet.social!.followers);
    expect(active.social!.posts.length).toBeGreaterThan(0);
    expect(quiet.social!.posts).toHaveLength(0);
    expect(active.social!.peak).toBeGreaterThanOrEqual(active.social!.followers);
    expect(fmtFollowers(1234)).toBe('1,2 rb');
    expect(fmtFollowers(2_500_000)).toBe('2,5 jt');
  });

  it('komentar pedas menurunkan citra dan memicu kontroversi dengan pilihan', () => {
    const { world, career, player } = start('SOC-B');
    const p = { ...player, personality: { ...player.personality, Controversy: 18, Temperament: 4 } };
    career.social = emptySocial(p);
    weeks(career, p, 40, 'provokatif', 'b');
    expect(career.social!.image).toBeLessThan(45);
    const msg = career.inbox.find((m) => m.eventId === 'social_controversy');
    expect(msg).toBeDefined();
    expect(career.social!.scandals).toBeGreaterThan(0);
    const before = career.social!.image;
    const after = resolveChoice(world, career, msg!.id, 0).career;
    expect(after.social!.image).toBeGreaterThan(before);
    expect(after.inbox.find((m) => m.id === msg!.id)!.result).toBeTruthy();
  });

  it('tawaran sponsor datang untuk pemain terkenal; diterima menambah pemasukan mingguan', () => {
    const { world, career, player } = start('SOC-C');
    const star = { ...player, reputation: { home: 70, world: 40 } };
    career.social = emptySocial(star);
    career.social.followers = 200_000;
    career.social.image = 80;
    let offer;
    for (let i = 0; i < 200 && !offer; i++) {
      socialWeek(career, star, [], new Rng(`c${i}`), []);
      career.week++;
      offer = career.inbox.find((m) => m.eventId === 'sponsor_offer' && m.chosen === undefined);
    }
    expect(offer).toBeDefined();
    const weekly = Number(offer!.data!.weekly);
    expect(weekly).toBeGreaterThan(100);
    const before = weeklyBudget(career, star);
    const signed = resolveChoice({ ...world, players: world.players.map((q) => (q.isUser ? star : q)) }, career, offer!.id, 0).career;
    expect(signed.social!.deals).toHaveLength(1);
    const after = weeklyBudget(signed, star);
    expect(after.sponsor).toBe(weekly);
    expect(after.net).toBeCloseTo(before.net + weekly * 0.7, 1);
    // tolak = tidak ada kontrak
    const no = resolveChoice(world, career, offer!.id, 2).career;
    expect(no.social?.deals ?? []).toHaveLength(0);
  });

  it('kontrak berakhir dan citra buruk membuat sponsor pergi; maksimal 3 kontrak', () => {
    const { career, player } = start('SOC-D');
    const s = socialOf(career, player);
    s.followers = 50_000;
    s.deals = [
      { brand: 'A', category: 'Jam', weekly: 100, until: career.currentDate, tier: 0 },
      { brand: 'B', category: 'Mobil', weekly: 100, until: '2099-01-01', tier: 0 },
    ];
    s.image = 10;
    for (let i = 0; i < 30; i++) socialWeek(career, player, [], new Rng(`d${i}`), []);
    expect(s.deals).toHaveLength(0);
    expect(career.inbox.some((m) => m.title === 'Kontrak sponsor diputus')).toBe(true);
    expect(MAX_DEALS).toBe(3);
  });

  it('karier berjalan dengan media sosial tanpa error', () => {
    let { world, career } = start('SOC-E');
    career.plan.post = 'latihan';
    for (let i = 0; i < 20; i++) {
      for (const m of pendingChoices(career)) ({ world, career } = resolveChoice(world, career, m.id, 0));
      ({ world, career } = advanceWeek(world, career));
    }
    expect(career.social!.posts.length).toBeGreaterThan(10);
    expect(career.social!.followers).toBeGreaterThan(0);
  }, 60_000);
});
