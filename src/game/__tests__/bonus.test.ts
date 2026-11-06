import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { newCareer } from '../sim/week';
import { initRelations } from '../sim/relations';
import { bonusOf, clubMatchMoney, makeBonus, netBonus, trophyBonus } from '../sim/bonus';
import { COACH_TIERS, levelOf, weeklyBudget } from '../sim/economy';
import { roleChoices, trainingRole } from '../sim/training';
import { POSITION_ROLES } from '../data/roles';
import { applyLife, activeMods, ITEM_BY_ID } from '../sim/life';
import { applyEditor, draftOf } from '../sim/editor';
import { buildSaveFile, readSaveFile } from '../save/codec';
import { getAttr } from '../sim/training';
import type { Career, MatchRecord, Player, World } from '../types';
import type { Position } from '../data/attributes';

const w = generateWorld({ seed: 'BONUS', activeLeagues: ['IDN1', 'ENG1'] });
const club = w.clubs.find((c) => c.leagueId === 'ENG1')!;

function start(seed: string, position: Position = 'ST', wage = 1000) {
  const roll = rollCharacter(w, { countryId: 'IDN', position }, seed);
  const p: Player = { ...roll.player, isYouth: false, contract: { clubId: club.id, wagePerWeek: wage, expires: '2029-06-30', role: 'Inti' } };
  const world: World = { ...w, players: [...w.players, p] };
  const career: Career = newCareer({ ...roll, player: p }, 0, 'test', w.startDate);
  career.rel = initRelations(world, career, p);
  return { world, career, p };
}

const rec = (over: Partial<MatchRecord> = {}): MatchRecord => ({
  date: '2026-09-01',
  comp: 'Liga',
  season: '2026/27',
  team: club.name,
  opponent: 'Tim Lawan',
  home: true,
  score: [2, 0],
  status: 'Inti',
  minutes: 90,
  rating: 7.5,
  goals: 1,
  assists: 1,
  cleanSheet: true,
  ...over,
});

describe('bonus kontrak & denda', () => {
  it('bonus mengikuti posisi: clean sheet hanya untuk kiper & bek, deterministik', () => {
    const st = makeBonus(1000, 'ST', 'Inti', 'x');
    const dc = makeBonus(1000, 'DC', 'Inti', 'x');
    expect(st).toEqual(makeBonus(1000, 'ST', 'Inti', 'x'));
    expect(st.cs).toBe(0);
    expect(dc.cs).toBeGreaterThan(0);
    expect(st.app).toBeGreaterThanOrEqual(150);
    expect(st.app).toBeLessThanOrEqual(350);
    expect(st.trophy).toBeGreaterThan(st.goal);
  });

  it('laga liga: bonus main + gol + assist masuk (bersih), bangku cadangan dapat bonus bangku', () => {
    const { career, p } = start('B1');
    const b = bonusOf(p.contract, p)!;
    const before = career.money;
    clubMatchMoney(career, rec(), p);
    expect(career.money - before).toBeCloseTo(netBonus(career, b.app + b.goal + b.assist), 1);
    expect(career.bonusLog?.[0].amount).toBeGreaterThan(0);
    const m2 = career.money;
    clubMatchMoney(career, rec({ status: 'Cadangan', minutes: 0, goals: 0, assists: 0 }), p);
    expect(career.money - m2).toBeCloseTo(netBonus(career, b.unused), 1);
    // laga U19 / timnas tidak dibayar bonus klub
    const m3 = career.money;
    clubMatchMoney(career, rec({ comp: 'U19' }), p);
    expect(career.money).toBe(m3);
  });

  it('kartu merah: denda 2 minggu gaji (langsung) / 1 minggu (dua kuning) + pesan inbox', () => {
    const { career, p } = start('B2', 'ST', 2000);
    const b = bonusOf(p.contract, p)!;
    const before = career.money;
    clubMatchMoney(career, rec({ goals: 0, assists: 0, card: 'R' }), p);
    expect(career.money - before).toBeCloseTo(netBonus(career, b.app) - 4000, 1);
    expect(career.inbox[0].title).toMatch(/Denda/);
    const m2 = career.money;
    clubMatchMoney(career, rec({ goals: 0, assists: 0, card: 'YR', date: '2026-09-08' }), p);
    expect(career.money - m2).toBeCloseTo(netBonus(career, b.app) - 2000, 1);
  });

  it('bonus juara hanya untuk klub di kontrakmu', () => {
    const { career, p } = start('B3');
    const before = career.money;
    trophyBonus(career, p, 'klub-lain', 'Liga X', '2027-05-30');
    expect(career.money).toBe(before);
    trophyBonus(career, p, club.id, 'Liga X', '2027-05-30');
    expect(career.money).toBeGreaterThan(before);
  });
});

describe('pelatih bertingkat & latihan peran', () => {
  it('save lama: true = profesional; world class lebih mahal & lebih efektif', () => {
    expect(levelOf(true)).toBe(2);
    expect(levelOf(false)).toBe(0);
    const { career, p } = start('C1');
    const cost = (l: 0 | 1 | 2 | 3) => weeklyBudget({ ...career, plan: { ...career.plan, coaches: { ...career.plan.coaches, teknik: l } } }, p).coaches;
    expect(cost(0)).toBe(0);
    expect(cost(1)).toBeLessThan(cost(2));
    expect(cost(2)).toBeLessThan(cost(3));
    expect(COACH_TIERS[3].boost).toBeGreaterThan(COACH_TIERS[2].boost);
  });

  it('peran yang dilatih mengikuti posisi baru yang sedang dilatih', () => {
    const { career, p } = start('C2', 'MC');
    expect(roleChoices(career, p)).toEqual(POSITION_ROLES.MC);
    career.plan = { ...career.plan, learnPos: 'AMC', trainRole: 'ss' };
    expect(roleChoices(career, p)).toEqual(POSITION_ROLES.AMC);
    expect(trainingRole(career, p)).toBe('ss');
    // peran yang tidak cocok dengan posisi diabaikan
    career.plan = { ...career.plan, learnPos: null, trainRole: 'ss' };
    expect(POSITION_ROLES.MC).toContain(trainingRole(career, p));
  });
});

describe('sepatu & aksesori dengan efek atribut', () => {
  it('efek berlaku selama dipakai dan hilang persis saat dilepas/dijual', () => {
    const s = start('D1');
    s.career.money = 100000;
    const me = (world: World) => world.players.find((x) => x.id === s.p.id)!;
    const pace0 = getAttr(me(s.world), 'Pace');
    const str0 = getAttr(me(s.world), 'Strength');
    let r = applyLife(s.world, s.career, { op: 'buy', id: 'sepatu_speed' });
    expect(getAttr(me(r.world), 'Pace')).toBe(Math.min(20, pace0 + 1));
    expect(getAttr(me(r.world), 'Strength')).toBe(Math.max(1, str0 - 1));
    expect(activeMods(r.career.life)).toEqual(ITEM_BY_ID.sepatu_speed.mods);
    r = applyLife(r.world, r.career, { op: 'equip', id: 'sepatu_biasa' });
    expect(getAttr(me(r.world), 'Pace')).toBe(pace0);
    expect(getAttr(me(r.world), 'Strength')).toBe(str0);
    r = applyLife(r.world, r.career, { op: 'equip', id: 'sepatu_speed' });
    r = applyLife(r.world, r.career, { op: 'sell', id: 'sepatu_speed' });
    expect(getAttr(me(r.world), 'Pace')).toBe(pace0);
    expect(r.career.life.boots).toBe('sepatu_biasa');
  });
});

describe('editor in-game', () => {
  it('mengubah atribut, uang, kontrak; karier ditandai diedit', () => {
    const { world, career, p } = start('E1');
    const d = draftOf(career, p);
    d.attrs.technical.Finishing = 20;
    d.money = 123456;
    d.contract!.wage = 5000;
    d.contract!.bonus.goal = 999;
    const r = applyEditor(world, career, d);
    const me = r.world.players.find((x) => x.id === p.id)!;
    expect(me.technical.Finishing).toBe(20);
    expect(me.contract!.wagePerWeek).toBe(5000);
    expect(me.contract!.bonus!.goal).toBe(999);
    expect(r.career.money).toBe(123456);
    expect(r.career.edited).toBe(true);
    expect(me.pa).toBeGreaterThanOrEqual(me.ca);
  });
});

describe('save lama', () => {
  it('format 6: pelatih & staf boolean jadi tingkat', () => {
    const { world, career } = start('F1');
    const old = structuredClone(career) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    old.plan.coaches = { teknik: true, fisik: false, mental: false, psikolog: true };
    old.life.subs = { fisio: true };
    const f = buildSaveFile('x', world, old as unknown as Career, { playerName: 'X', age: 16, position: 'ST', countryId: 'IDN', team: 'T', gameDate: w.startDate });
    const back = readSaveFile(JSON.parse(JSON.stringify({ ...f, format: 6 })));
    expect(back.career.plan.coaches).toEqual({ teknik: 2, fisik: 0, mental: 0, psikolog: 2 });
    expect(back.career.life.subs).toEqual({ fisio: 2 });
  });
});
