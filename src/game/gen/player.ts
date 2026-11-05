import {
  TECHNICAL,
  MENTAL,
  PHYSICAL,
  GOALKEEPING,
  PERSONALITY,
  HIDDEN,
  POSITION_WEIGHTS,
  type Position,
  type VisibleAttr,
} from '../data/attributes';
import type { Player } from '../types';
import { clamp, type Rng } from '../rng';
import { generateName } from './names';

const GK_SET = new Set<string>(GOALKEEPING);

// Bobot atribut untuk posisi tertentu (dipakai untuk CA dan generator).
export function attrWeight(pos: Position, attr: VisibleAttr): number {
  const w = POSITION_WEIGHTS[pos][attr];
  if (w !== undefined) return w;
  if (pos === 'GK') return GK_SET.has(attr) ? 0.5 : 0.2;
  return GK_SET.has(attr) ? 0 : 0.5;
}

function getAttr(p: Pick<Player, 'technical' | 'mental' | 'physical' | 'goalkeeping'>, a: VisibleAttr): number {
  return (
    (p.technical as Record<string, number>)[a] ??
    (p.mental as Record<string, number>)[a] ??
    (p.physical as Record<string, number>)[a] ??
    (p.goalkeeping as Record<string, number>)[a]
  );
}

const ALL: VisibleAttr[] = [...TECHNICAL, ...MENTAL, ...PHYSICAL, ...GOALKEEPING];

/** CA (1-200) dihitung dari atribut, berbobot sesuai posisi utama. */
export function computeCA(
  p: Pick<Player, 'technical' | 'mental' | 'physical' | 'goalkeeping' | 'mainPosition'>,
): number {
  let sum = 0;
  let wsum = 0;
  for (const a of ALL) {
    const w = attrWeight(p.mainPosition, a);
    if (w === 0) continue;
    sum += getAttr(p, a) * w;
    wsum += w;
  }
  const mean = sum / wsum;
  return clamp(Math.round((mean - 1) * 11.5), 1, 200);
}

// Posisi yang wajar dimainkan sebagai posisi kedua
const RELATED: Record<Position, Position[]> = {
  GK: [],
  DC: ['DM', 'DR', 'DL'],
  DR: ['WBR', 'DC', 'MR'],
  DL: ['WBL', 'DC', 'ML'],
  WBR: ['DR', 'MR', 'AMR'],
  WBL: ['DL', 'ML', 'AML'],
  DM: ['MC', 'DC'],
  MC: ['DM', 'AMC', 'MR', 'ML'],
  MR: ['AMR', 'MC', 'WBR'],
  ML: ['AML', 'MC', 'WBL'],
  AMR: ['MR', 'AML', 'ST', 'AMC'],
  AML: ['ML', 'AMR', 'ST', 'AMC'],
  AMC: ['MC', 'ST', 'AMR', 'AML'],
  ST: ['AMC', 'AMR', 'AML'],
};

const LEFT_SIDE = new Set<Position>(['DL', 'WBL', 'ML', 'AML']);

export interface PlayerGenOptions {
  id: string;
  countryId: string;
  position: Position;
  age: number;
  targetCA: number;
  pa?: number; // kalau tidak diisi, dihitung dari umur
  refDate: string; // tanggal acuan umur (YYYY-MM-DD)
  isYouth?: boolean;
}

function birthDateFor(rng: Rng, age: number, refDate: string): string {
  const ref = new Date(refDate + 'T00:00:00Z');
  const daysBack = age * 365.25 + rng.int(0, 364);
  const d = new Date(ref.getTime() - daysBack * 86400000);
  return d.toISOString().slice(0, 10);
}

export function ageOn(birthDate: string, date: string): number {
  const b = new Date(birthDate + 'T00:00:00Z');
  const d = new Date(date + 'T00:00:00Z');
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const m = d.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && d.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

/** PA dari CA dan umur: makin muda, makin besar ruang berkembang. */
export function rollPA(rng: Rng, ca: number, age: number): number {
  // Sebaran miring: kebanyakan pemain punya ruang kecil, sedikit yang ruangnya besar
  const skew = Math.pow(rng.next(), 1.8);
  let room: number;
  if (age >= 31) room = skew * 3;
  else if (age >= 28) room = skew * 8;
  else if (age >= 25) room = skew * 20;
  else if (age >= 22) room = 3 + skew * 35;
  else if (age >= 19) room = 8 + skew * 55;
  else room = 12 + skew * 80;
  // PA sangat tinggi dibuat langka
  let pa = Math.round(ca + room);
  if (pa > 150) pa = 150 + Math.round((pa - 150) * 0.5);
  return clamp(pa, ca, 200);
}

export function generatePlayer(rng: Rng, o: PlayerGenOptions): Player {
  const { firstName, lastName } = generateName(rng, o.countryId);
  const pos = o.position;
  const isGK = pos === 'GK';
  const target = clamp(o.targetCA, 1, 200);
  const baseMean = target / 11.5 + 1;

  // Fisik bawaan
  let height: number;
  if (isGK) height = Math.round(rng.normal(190, 4));
  else if (pos === 'DC') height = Math.round(rng.normal(187, 4));
  else if (pos === 'ST') height = Math.round(rng.normal(182, 6));
  else if (pos.startsWith('AM') || pos === 'MR' || pos === 'ML') height = Math.round(rng.normal(175, 6));
  else height = Math.round(rng.normal(179, 5));
  height = clamp(height, 160, 204);
  const weight = clamp(Math.round(height - 105 + rng.normal(0, 4)), 55, 100);

  const raw: Record<string, number> = {};
  for (const a of ALL) {
    const w = attrWeight(pos, a);
    let v: number;
    if (!isGK && GK_SET.has(a)) {
      v = rng.int(1, 4); // pemain lapangan tidak bisa jadi kiper
    } else {
      const offset = w >= 4 ? 2.2 : w >= 3 ? 1.2 : w >= 2 ? 0.4 : w >= 1 ? -0.6 : -2;
      v = baseMean + offset + rng.normal(0, 1.6);
      // umur memengaruhi fisik dan mental
      if ((PHYSICAL as readonly string[]).includes(a)) {
        if (o.age <= 18) v -= 1.2;
        if (o.age >= 31) v -= (o.age - 30) * 0.5;
      }
      if ((MENTAL as readonly string[]).includes(a)) {
        if (o.age <= 19) v -= 1.2;
        if (o.age >= 29) v += 0.8;
      }
      if (isGK && !GK_SET.has(a) && (TECHNICAL as readonly string[]).includes(a)) {
        if (a !== 'Passing' && a !== 'First Touch') v = Math.min(v, rng.int(1, 8));
      }
    }
    raw[a] = v;
  }
  // tinggi badan memengaruhi jumping reach / aerial reach
  raw['Jumping Reach'] += (height - 180) / 5;
  if (isGK) raw['Aerial Reach'] += (height - 188) / 4;

  const build = (): Pick<Player, 'technical' | 'mental' | 'physical' | 'goalkeeping'> => {
    const pick = <K extends string>(keys: readonly K[]) =>
      Object.fromEntries(keys.map((k) => [k, clamp(Math.round(raw[k]), 1, 20)])) as Record<K, number>;
    return {
      technical: pick(TECHNICAL),
      mental: pick(MENTAL),
      physical: pick(PHYSICAL),
      goalkeeping: pick(GOALKEEPING),
    };
  };

  // Kalibrasi: geser atribut sampai CA hasil hitung mendekati target
  let attrs = build();
  for (let i = 0; i < 6; i++) {
    const ca = computeCA({ ...attrs, mainPosition: pos });
    const diff = target - ca;
    if (Math.abs(diff) <= 2) break;
    const shift = diff / 11.5;
    for (const a of ALL) {
      if (!isGK && GK_SET.has(a)) continue;
      raw[a] += shift;
    }
    attrs = build();
  }
  const ca = computeCA({ ...attrs, mainPosition: pos });

  // Personality dan hidden attributes
  const n = (mean: number, sd: number) => clamp(Math.round(rng.normal(mean, sd)), 1, 20);
  const personality = Object.fromEntries(PERSONALITY.map((k) => [k, n(11, 4.5)])) as Player['personality'];
  const hidden = Object.fromEntries(HIDDEN.map((k) => [k, n(10, 4)])) as Player['hidden'];
  hidden['Injury Proneness'] = n(8, 4);
  hidden.Dirtiness = n(8, 4);
  // Natural fitness bagus cenderung jarang cedera
  hidden['Injury Proneness'] = clamp(
    Math.round(hidden['Injury Proneness'] - (attrs.physical['Natural Fitness'] - 11) * 0.3),
    1,
    20,
  );
  // Profesionalisme sedikit berkorelasi dengan determination
  personality.Professionalism = clamp(
    Math.round(personality.Professionalism * 0.85 + attrs.mental.Determination * 0.15),
    1,
    20,
  );

  // Posisi
  const positions: Player['positions'] = { [pos]: 20 };
  const versatility = hidden.Versatility;
  for (const r of RELATED[pos]) {
    if (rng.chance(0.25 + versatility / 40)) {
      positions[r] = clamp(rng.int(8, 14) + Math.round(versatility / 5), 5, 19);
    }
  }

  // Kaki
  const leftFooted = LEFT_SIDE.has(pos) ? rng.chance(0.65) : rng.chance(0.2);
  const strong = rng.int(15, 20);
  const weak = rng.chance(0.08) ? rng.int(14, 18) : clamp(Math.round(rng.normal(8, 3)), 1, 15);

  const pa = o.pa ?? rollPA(rng, ca, o.age);

  return {
    id: o.id,
    firstName,
    lastName,
    nationalityId: o.countryId,
    birthDate: birthDateFor(rng, o.age, o.refDate),
    positions,
    mainPosition: pos,
    heightCm: height,
    weightKg: weight,
    leftFoot: leftFooted ? strong : weak,
    rightFoot: leftFooted ? weak : strong,
    ...attrs,
    personality,
    hidden,
    ca,
    pa: Math.max(pa, ca),
    reputation: { home: 1, world: 1 },
    contract: null,
    isYouth: !!o.isYouth,
  };
}
