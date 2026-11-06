import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { newCareer } from '../sim/week';
import { initRelations } from '../sim/relations';
import { retireCareer } from '../sim/retire';
import { heirGap, heirKind, heirSocial, heirWealth, nextGeneration } from '../sim/dynasty';
import type { Career, World } from '../types';

const w = generateWorld({ seed: 'DYN', activeLeagues: ['IDN1'] });

/** Pemain yang langsung pensiun sebagai bintang (puncak CA tinggi) */
function retiredStar(married: boolean, money = 2_000_000) {
  const roll = rollCharacter(w, { countryId: 'IDN', position: 'ST' }, 'DYN-P');
  roll.player.heightCm = 192;
  roll.player.leftFoot = 19;
  roll.player.rightFoot = 6;
  let world: World = { ...w, players: [...w.players, roll.player] };
  let career: Career = newCareer(roll, 0, 'test', w.startDate);
  career.rel = initRelations(world, career, roll.player);
  career.peakCA = 175;
  career.money = money;
  career.social = { followers: 400_000, peak: 1_000_000, image: 70, posts: [], deals: [], scandals: 0 };
  if (married) career.rel.partner = { name: 'Sari', since: w.startDate, value: 80, stage: 'menikah', stageSince: w.startDate };
  // pensiun di usia 35
  const birth = roll.player.birthDate;
  career.currentDate = `${Number(birth.slice(0, 4)) + 35}${birth.slice(4)}`;
  ({ world, career } = retireCareer(world, career));
  return { world, career, player: world.players.find((p) => p.isUser)! };
}

describe('generasi berikutnya', () => {
  it('anak kalau menikah, keponakan kalau tidak; dunia maju sampai pewaris mulai berkarier', () => {
    const a = retiredStar(true);
    const b = retiredStar(false);
    expect(heirKind(a.career)).toBe('anak');
    expect(heirKind(b.career)).toBe('keponakan');
    expect(heirGap(a.career)).toBe(15 - (a.career.retired!.age - 29));
    expect(heirWealth(a.career)).toBe('kaya');
    expect(heirWealth(retiredStar(true, 500).career)).toBe('miskin');
  });

  it('dunia baru: klub sama, pemain generasi baru, tahun lebih maju, sejarah juara dibawa', () => {
    const { world, career, player } = retiredStar(true);
    world.honours = [{ leagueId: 'IDN1', season: '2030/31', championId: world.clubs[0].id, runnerUpId: world.clubs[1].id }];
    const r = nextGeneration(world, career, player, 'MC');
    const year = Number(career.retired!.date.slice(0, 4)) + heirGap(career);
    expect(r.world.startDate).toBe(`${year}-07-01`);
    expect(r.world.clubs.map((c) => c.name)).toEqual(world.clubs.map((c) => c.name));
    // nama pemain berbeda dari generasi sebelumnya
    const oldName = new Map(world.players.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
    const same = r.world.players.filter((p) => oldName.get(p.id) === `${p.firstName} ${p.lastName}`).length;
    expect(same / r.world.players.length).toBeLessThan(0.1);
    // umur pemain dihitung dari tahun baru
    const ages = r.world.players.map((p) => year - Number(p.birthDate.slice(0, 4)));
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(14);
    expect(Math.max(...ages)).toBeLessThanOrEqual(45);
    expect(r.world.seasons.IDN1.label.startsWith(String(year))).toBe(true);
    expect(r.world.honours).toEqual(world.honours);
    expect(r.dynasty.generation).toBe(2);
    expect(r.dynasty.ancestors[0]).toMatchObject({ relation: 'orang tua', legacy: career.retired!.legacy.total });
  });

  it('pewaris membawa nama keluarga, sebagian bakat, tubuh, dan pengikut', () => {
    const { world, career, player } = retiredStar(true);
    const pas: number[] = [];
    const plain: number[] = [];
    for (let i = 0; i < 6; i++) {
      const c = { ...career, characterSeed: `${career.characterSeed}-${i}` };
      const r = nextGeneration(world, c, player);
      const kid = r.roll.player;
      expect(kid.lastName).toBe(player.lastName);
      expect(kid.nationalityId).toBe(player.nationalityId);
      pas.push(kid.pa);
      plain.push(rollCharacter(r.world, { countryId: 'IDN' }, `${c.characterSeed}:gen2`).player.pa);
      expect(Math.abs(kid.heightCm - 192)).toBeLessThan(15);
      expect(r.roll.family.wealth).toBe('kaya');
      expect(r.roll.family.support).toBeGreaterThanOrEqual(15);
    }
    const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    expect(avg(pas)).toBeGreaterThan(avg(plain) + 10);
    const s = heirSocial(career, player);
    expect(s.followers).toBe(50_000);
  }, 60_000);
});
