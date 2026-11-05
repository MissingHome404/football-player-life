import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { advanceWeek, newCareer, pendingChoices, resolveChoice } from '../sim/week';
import { ALL_VISIBLE } from '../data/attributes';
import { getAttr } from '../sim/training';
import type { Career, Intensity, World } from '../types';

const w0 = generateWorld({ seed: 'WEEK', activeLeagues: ['IDN1', 'ENG1'] });

function start(seed: string, countryId = 'IDN') {
  const roll = rollCharacter(w0, { countryId }, seed);
  const world: World = { ...w0, players: [...w0.players, roll.player] };
  return { world, career: newCareer(roll, 0, 'test', w0.startDate) };
}

function run(world: World, career: Career, weeks: number) {
  for (let i = 0; i < weeks; i++) {
    for (const m of pendingChoices(career)) ({ world, career } = resolveChoice(world, career, m.id, 0));
    ({ world, career } = advanceWeek(world, career));
  }
  return { world, career };
}

const me = (w: World) => w.players.find((p) => p.isUser)!;

describe('minggu demi minggu', () => {
  it('hasilnya sama persis untuk save yang sama (deterministik)', () => {
    const a = start('DET');
    const r1 = run(a.world, a.career, 30);
    const r2 = run(a.world, a.career, 30);
    expect(r2.career).toEqual(r1.career);
    expect(me(r2.world)).toEqual(me(r1.world));
  });

  it('tidak mengubah data lama (aman untuk undo dan React)', () => {
    const a = start('IMM');
    const before = JSON.stringify({ c: a.career, p: me(a.world) });
    run(a.world, a.career, 10);
    expect(JSON.stringify({ c: a.career, p: me(a.world) })).toBe(before);
  });

  it('3 tahun: CA tidak melewati PA, semua nilai tetap di batasnya', () => {
    for (const seed of ['L1', 'L2', 'L3', 'L4']) {
      const a = start(seed, seed === 'L2' ? 'ENG' : 'IDN');
      a.career.plan.intensity = 'berat';
      a.career.plan.focus = 'peran';
      const { world, career } = run(a.world, a.career, 156);
      const p = me(world);
      expect(career.week).toBe(156);
      expect(p.ca).toBeLessThanOrEqual(p.pa);
      expect(p.ca).toBeGreaterThanOrEqual(me(a.world).ca);
      for (const k of ALL_VISIBLE) {
        const v = getAttr(p, k);
        if (v === undefined) continue;
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(20);
      }
      expect(career.stress).toBeGreaterThanOrEqual(0);
      expect(career.stress).toBeLessThanOrEqual(100);
      expect(career.fitness).toBeGreaterThanOrEqual(0);
      expect(career.fitness).toBeLessThanOrEqual(100);
      expect(Number.isFinite(career.money)).toBe(true);
      expect(career.inbox.length).toBeLessThanOrEqual(61);
    }
  });

  it('latihan berat membuat pemain berkembang lebih cepat daripada ringan', () => {
    const grow = (intensity: Intensity) => {
      let total = 0;
      for (const seed of ['G1', 'G2', 'G3', 'G4', 'G5']) {
        const a = start(seed);
        a.career.plan.intensity = intensity;
        a.career.fitness = 100;
        // tanpa cedera supaya adil
        const p = me(a.world);
        p.hidden['Injury Proneness'] = 1;
        const r = run(a.world, a.career, 26);
        total += me(r.world).ca - p.ca;
      }
      return total;
    };
    expect(grow('berat')).toBeGreaterThan(grow('ringan'));
  });

  it('tidak bisa lanjut minggu sebelum pesan dijawab', () => {
    let { world, career } = start('EVT');
    let found = false;
    for (let i = 0; i < 80 && !found; i++) {
      ({ world, career } = advanceWeek(world, career));
      found = pendingChoices(career).length > 0;
    }
    expect(found).toBe(true);
    expect(() => advanceWeek(world, career)).toThrow(/menunggu keputusanmu/);
    const m = pendingChoices(career)[0];
    const r = resolveChoice(world, career, m.id, 1);
    const answered = r.career.inbox.find((x) => x.id === m.id)!;
    expect(answered.chosen).toBe(1);
    expect(pendingChoices(r.career).length).toBe(pendingChoices(career).length - 1);
  });
});
