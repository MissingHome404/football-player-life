import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { advanceWeek, newCareer, pendingChoices, resolveChoice } from '../sim/week';
import { initRelations } from '../sim/relations';
import {
  coachReport,
  extras,
  markTrend,
  ratingMultiplier,
  recordTraining,
  trainingRating,
  trainingReaction,
  trainingReport,
  trendOf,
  weakFootWeek,
  weakSide,
  workload,
} from '../sim/individual';
import { learnPositionWeek, trainWeek, rolePosition } from '../sim/training';
import { Rng } from '../rng';
import type { Career, Player, World } from '../types';
import type { Position } from '../data/attributes';

const w = generateWorld({ seed: 'INDIV', activeLeagues: ['IDN1'] });

function start(seed: string, position: Position = 'MC') {
  const roll = rollCharacter(w, { countryId: 'IDN', position }, seed);
  const world: World = { ...w, players: [...w.players, roll.player] };
  const career: Career = newCareer(roll, 0, 'test', w.startDate);
  career.rel = initRelations(world, career, roll.player);
  return { world, career, p: roll.player };
}

describe('latihan individu', () => {
  it('nilai latihan 1-10, deterministik, dan pemain profesional lebih tinggi', () => {
    const { career, p } = start('I1');
    const a = trainingRating(career, p, new Rng('x'));
    expect(a).toBe(trainingRating(career, p, new Rng('x')));
    expect(a).toBeGreaterThanOrEqual(1);
    expect(a).toBeLessThanOrEqual(10);
    const pro: Player = { ...p, personality: { ...p.personality, Professionalism: 20 }, mental: { ...p.mental, Determination: 20 } };
    const lazy: Player = { ...p, personality: { ...p.personality, Professionalism: 1 }, mental: { ...p.mental, Determination: 1 } };
    let hi = 0;
    let lo = 0;
    for (let i = 0; i < 50; i++) {
      hi += trainingRating(career, pro, new Rng(`r${i}`));
      lo += trainingRating(career, lazy, new Rng(`r${i}`));
    }
    expect(hi / 50).toBeGreaterThan(lo / 50 + 1.5);
    expect(ratingMultiplier(9)).toBeGreaterThan(1);
    expect(ratingMultiplier(5)).toBeLessThan(1);
  });

  it('fokus tambahan membuat atribut itu naik lebih cepat', () => {
    const base = start('I2');
    const gainOf = (focus: string | null) => {
      const career = structuredClone(base.career);
      const p = structuredClone(base.p);
      career.plan = { ...career.plan, extraFocus: focus };
      const before = p.technical.Passing;
      for (let i = 0; i < 20; i++) trainWeek(career, p, undefined, 1);
      return p.technical.Passing - before + (career.progress.Passing ?? 0);
    };
    expect(gainOf('Passing')).toBeGreaterThan(gainOf(null) * 1.8);
  });

  it('beban latihan naik dengan latihan tambahan', () => {
    const { career, p } = start('I3');
    const w0 = workload(career, p);
    career.plan = { ...career.plan, extraFocus: 'Passing', weakFoot: true, learnPos: 'AMC' };
    expect(extras(career, p).length).toBe(weakSide(p) ? 3 : 2);
    expect(workload(career, p)).toBeGreaterThan(w0);
    career.plan = { ...career.plan, focus: 'istirahat' };
    expect(workload(career, p)).toBe(0);
  });

  it('kaki lemah naik pelan-pelan dan tidak melewati kaki kuat', () => {
    const { career, p } = start('I4');
    const side = weakSide(p)!;
    const other = side === 'leftFoot' ? 'rightFoot' : 'leftFoot';
    const before = p[side];
    career.plan = { ...career.plan, weakFoot: true };
    for (let i = 0; i < 40; i++) weakFootWeek(career, p);
    expect(p[side]).toBeGreaterThan(before);
    expect(p[side]).toBeLessThanOrEqual(Math.max(p[other], before));
    expect(trendOf(career)[side]).toBe(1);
  });

  it('posisi yang sudah dikuasai tetap jadi posisi latihan (untuk melatih perannya)', () => {
    const { career, p } = start('I5', 'MC');
    p.positions = { ...p.positions, AMC: 20 };
    career.plan = { ...career.plan, learnPos: 'AMC' };
    expect(learnPositionWeek(career, p)).toBe(false);
    expect(career.plan.learnPos).toBe('AMC');
    expect(rolePosition(career, p)).toBe('AMC');
    expect(extras(career, p)).not.toContain('Latihan posisi AMC');
  });

  it('catatan, panah tren, laporan, dan pujian pelatih', () => {
    const { career, p } = start('I6');
    for (let i = 0; i < 4; i++) {
      recordTraining(career, p, 8.4, i === 0 ? { Passing: 1 } : {});
      career.week++;
    }
    expect(career.trainingLog).toHaveLength(4);
    expect(trendOf(career).Passing).toBe(1);
    markTrend(career, { Pace: -1 });
    expect(trendOf(career).Pace).toBe(-1);
    career.rel.manager = { staffId: 'x', value: 0, since: career.currentDate };
    trainingReaction(career, 'Pelatih');
    expect(career.rel.manager.value).toBe(3);
    expect(career.inbox[0].title).toMatch(/Pujian/);
    expect(trainingReport(career, p).length).toBeGreaterThan(0);
    const rep = coachReport(career, p);
    expect(rep.strengths.length).toBe(3);
    expect(rep.best.length).toBeGreaterThan(0);
  });

  it('minggu berjalan mengisi nilai latihan', () => {
    let { world, career } = start('I7');
    career.plan = { ...career.plan, extraFocus: 'Passing', weakFoot: true };
    for (let i = 0; i < 6; i++) {
      for (const m of pendingChoices(career)) ({ world, career } = resolveChoice(world, career, m.id, 0));
      ({ world, career } = advanceWeek(world, career));
    }
    expect((career.trainingLog ?? []).length).toBeGreaterThan(0);
    for (const e of career.trainingLog ?? []) {
      expect(e.rating).toBeGreaterThanOrEqual(1);
      expect(e.rating).toBeLessThanOrEqual(10);
    }
  });
});
