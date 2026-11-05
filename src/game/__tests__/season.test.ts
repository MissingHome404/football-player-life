import { describe, it, expect } from 'vitest';
import { makeFixtures, standings, simScore, rolloverLeagues, clubStrengths } from '../sim/season';
import { generateWorld } from '../gen/world';
import { Rng } from '../rng';

describe('musim liga', () => {
  it('jadwal round-robin ganda: tiap tim bertemu semua lawan dua kali, kandang dan tandang', () => {
    for (const n of [12, 16, 18, 20, 19]) {
      const rounds = makeFixtures(n);
      const pairs = new Map<string, number>();
      const homes = new Array(n).fill(0);
      for (const round of rounds) {
        const seen = new Set<number>();
        for (const [h, a] of round) {
          expect(seen.has(h) || seen.has(a)).toBe(false); // satu laga per pekan
          seen.add(h);
          seen.add(a);
          pairs.set(`${h}-${a}`, (pairs.get(`${h}-${a}`) ?? 0) + 1);
          homes[h]++;
        }
      }
      expect(pairs.size).toBe(n * (n - 1));
      for (const v of pairs.values()) expect(v).toBe(1);
      for (const h of homes) expect(h).toBe(n - 1);
    }
  });

  it('tim lebih kuat lebih sering menang', () => {
    const rng = new Rng('score');
    let strong = 0;
    let weak = 0;
    for (let i = 0; i < 2000; i++) {
      const [a, b] = simScore(rng, 150, 125);
      if (a > b) strong++;
      if (b > a) weak++;
    }
    expect(strong).toBeGreaterThan(weak * 2.5);
  });

  it('dunia baru punya jadwal untuk semua liga; liga yang sudah berjalan punya hasil', () => {
    const w = generateWorld({ seed: 'SEASON' });
    expect(Object.keys(w.seasons).length).toBe(w.leagues.length);
    const nor = standings(w.seasons.NOR1);
    expect(nor[0].p).toBeGreaterThan(10); // liga Norwegia mulai Maret
    const eng = standings(w.seasons.ENG1);
    expect(eng[0].p).toBe(0); // liga Inggris belum mulai
  });

  it('pergantian musim menjaga ukuran skuad dan kekuatan liga', () => {
    const w = generateWorld({ seed: 'ROLL', activeLeagues: ['ENG1'] });
    const before = clubStrengths(w);
    const { world, honours } = rolloverLeagues(w, ['ENG1', 'IDN1'], '2027-05-30', new Rng('r'));
    expect(honours.length).toBe(2);
    const after = clubStrengths(world);
    for (const c of world.clubs.filter((k) => k.leagueId === 'ENG1' || k.leagueId === 'IDN1')) {
      const squad = world.players.filter((p) => p.contract?.clubId === c.id);
      const seniors = squad.filter((p) => !p.isYouth).length;
      expect(seniors).toBeGreaterThanOrEqual(22);
      expect(seniors).toBeLessThanOrEqual(30);
      expect(squad.filter((p) => p.isYouth).length).toBeGreaterThanOrEqual(8);
      expect(Math.abs(after.get(c.id)!.senior - before.get(c.id)!.senior)).toBeLessThan(15);
    }
    expect(world.seasons.ENG1.year).toBe(w.seasons.ENG1.year + 1);
    const ids = new Set(world.players.map((p) => p.id));
    expect(ids.size).toBe(world.players.length);
  });
});
