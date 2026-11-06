// Formasi pelatih: posisi 11 pemain di lapangan, posisi FM yang cocok untuk tiap tempat,
// dan seberapa akrab seorang pemain dengan posisi itu.

import type { Club, Player, PlayingStyle } from '../types';
import type { Position } from '../data/attributes';
import { Rng } from '../rng';
import { RELATED } from '../gen/player';

/** Tempat di formasi. Perilaku di match engine mengikuti jenis tempatnya (bek, gelandang, sayap, striker). */
export type Slot =
  | 'GK'
  | 'RB' | 'RCB' | 'CB' | 'LCB' | 'LB' | 'RWB' | 'LWB'
  | 'RDM' | 'CM' | 'LDM' | 'RCM' | 'LCM' | 'RM' | 'LM' | 'AM'
  | 'RW' | 'LW' | 'ST' | 'RS' | 'LS';

export const FORMATION_IDS = ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '5-3-2'] as const;
export type FormationId = (typeof FORMATION_IDS)[number];

export interface Spot {
  slot: Slot;
  /** posisi FM yang cocok; yang pertama paling ideal, sisanya sedikit kurang cocok */
  pos: Position[];
  /** posisi dasar (bingkai tim: gawang sendiri di x = 0, menyerang ke x = 105, y kecil = kiri) */
  base: [number, number];
  num: number;
}

export interface Formation {
  id: FormationId;
  desc: string;
  spots: Spot[];
}

const s = (slot: Slot, pos: Position[], x: number, y: number, num: number): Spot => ({ slot, pos, base: [x, y], num });
const BACK4 = [s('RB', ['DR', 'WBR'], 26, 58, 2), s('RCB', ['DC'], 19, 43, 5), s('LCB', ['DC'], 19, 25, 4), s('LB', ['DL', 'WBL'], 26, 10, 3)];
const GK = s('GK', ['GK'], 4, 34, 1);

export const FORMATIONS: Record<FormationId, Formation> = {
  '4-3-3': {
    id: '4-3-3',
    desc: 'Satu gelandang jangkar, dua gelandang box-to-box, dua sayap menyerang, satu striker.',
    spots: [
      GK, ...BACK4,
      s('RCM', ['MC', 'AMC', 'DM'], 42, 47, 8), s('CM', ['DM', 'MC'], 36, 34, 6), s('LCM', ['MC', 'AMC', 'DM'], 42, 21, 10),
      s('RW', ['AMR', 'MR'], 62, 59, 7), s('ST', ['ST'], 66, 34, 9), s('LW', ['AML', 'ML'], 62, 9, 11),
    ],
  },
  '4-4-2': {
    id: '4-4-2',
    desc: 'Dua baris empat yang rapat, gelandang sayap naik-turun, dua striker berduet di depan.',
    spots: [
      GK, ...BACK4,
      s('RM', ['MR', 'AMR'], 48, 57, 7), s('RCM', ['MC', 'DM'], 40, 42, 8), s('LCM', ['MC', 'DM'], 40, 26, 6), s('LM', ['ML', 'AML'], 48, 11, 11),
      s('RS', ['ST', 'AMC'], 64, 40, 9), s('LS', ['ST', 'AMC'], 63, 28, 10),
    ],
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    desc: 'Dua gelandang bertahan melindungi lini belakang, playmaker di belakang striker tunggal.',
    spots: [
      GK, ...BACK4,
      s('RDM', ['DM', 'MC'], 37, 42, 6), s('LDM', ['DM', 'MC'], 37, 26, 8),
      s('RW', ['AMR', 'MR'], 58, 57, 7), s('AM', ['AMC', 'MC'], 55, 34, 10), s('LW', ['AML', 'ML'], 58, 11, 11),
      s('ST', ['ST'], 68, 34, 9),
    ],
  },
  '3-5-2': {
    id: '3-5-2',
    desc: 'Tiga bek tengah, wing back yang sangat menyerang, lini tengah padat, dua striker.',
    spots: [
      GK,
      s('RCB', ['DC'], 20, 47, 2), s('CB', ['DC'], 17, 34, 5), s('LCB', ['DC'], 20, 21, 4),
      s('RWB', ['WBR', 'DR', 'MR'], 33, 61, 7), s('RCM', ['MC', 'AMC'], 44, 46, 8), s('CM', ['DM', 'MC'], 36, 34, 6),
      s('LCM', ['MC', 'AMC'], 44, 22, 10), s('LWB', ['WBL', 'DL', 'ML'], 33, 7, 3),
      s('RS', ['ST', 'AMC'], 64, 40, 9), s('LS', ['ST', 'AMC'], 63, 28, 11),
    ],
  },
  '5-3-2': {
    id: '5-3-2',
    desc: 'Lima bek saat bertahan, wing back menjaga sisi lapangan, serangan balik lewat dua striker.',
    spots: [
      GK,
      s('RWB', ['WBR', 'DR'], 28, 60, 2), s('RCB', ['DC'], 19, 45, 5), s('CB', ['DC'], 16, 34, 6), s('LCB', ['DC'], 19, 23, 4),
      s('LWB', ['WBL', 'DL'], 28, 8, 3),
      s('RCM', ['MC', 'DM'], 41, 47, 8), s('CM', ['DM', 'MC'], 35, 34, 14), s('LCM', ['MC', 'DM'], 41, 21, 10),
      s('RS', ['ST', 'AMC'], 63, 40, 9), s('LS', ['ST', 'AMC'], 62, 28, 11),
    ],
  },
};

// Jenis tempat (dipakai match engine)
export const isCB = (x: Slot) => x === 'RCB' || x === 'LCB' || x === 'CB';
export const isFB = (x: Slot) => x === 'RB' || x === 'LB' || x === 'RWB' || x === 'LWB';
export const isDef = (x: Slot) => isCB(x) || isFB(x);
/** gelandang bertahan / jangkar */
export const isHold = (x: Slot) => x === 'CM' || x === 'RDM' || x === 'LDM';
/** gelandang box-to-box */
export const isBox = (x: Slot) => x === 'RCM' || x === 'LCM';
export const isCentralMid = (x: Slot) => isHold(x) || isBox(x) || x === 'AM';
export const isWideMid = (x: Slot) => x === 'RM' || x === 'LM';
export const isWing = (x: Slot) => x === 'RW' || x === 'LW';
export const isST = (x: Slot) => x === 'ST' || x === 'RS' || x === 'LS';
export type SlotGroup = 'GK' | 'DEF' | 'MID' | 'ATT';
export const slotGroup = (x: Slot): SlotGroup =>
  x === 'GK' ? 'GK' : isDef(x) ? 'DEF' : isCentralMid(x) || isWideMid(x) ? 'MID' : 'ATT';

/** Keakraban pemain dengan sebuah posisi (1-20). Posisi berdekatan yang belum tercatat dianggap canggung. */
export function familiarity(p: Player, pos: Position): number {
  if (p.mainPosition === pos) return 20;
  const v = p.positions[pos];
  if (v !== undefined) return v;
  if (pos === 'GK' || p.mainPosition === 'GK') return 1;
  return RELATED[p.mainPosition].includes(pos) ? 7 : 3;
}

export function spotFamiliarity(p: Player, spot: Spot): number {
  let best = familiarity(p, spot.pos[0]);
  for (let i = 1; i < spot.pos.length; i++) best = Math.max(best, familiarity(p, spot.pos[i]) - 2);
  return Math.max(1, best);
}

const FIT: [number, number][] = [
  [1, 0.6],
  [5, 0.75],
  [9, 0.85],
  [12, 0.92],
  [15, 0.97],
  [18, 1],
];
/** Efektivitas bermain di posisi dengan keakraban `f` (1 = sepenuhnya, 0.6 = sangat canggung) */
export function fitFactor(f: number): number {
  if (f >= 18) return 1;
  for (let i = 1; i < FIT.length; i++) {
    const [x1, y1] = FIT[i];
    if (f <= x1) {
      const [x0, y0] = FIT[i - 1];
      return y0 + ((Math.max(f, x0) - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 1;
}

/** Nilai pemain di sebuah tempat formasi menurut pelatih */
export function spotValue(p: Player, spot: Spot, ca = p.ca): number {
  const keeper = p.mainPosition === 'GK';
  if ((spot.slot === 'GK') !== keeper) return ca * 0.3;
  return ca * fitFactor(spotFamiliarity(p, spot));
}

/** Tempat terbaik seorang pemain di formasi ini */
export function bestSpot(p: Player, f: FormationId, free?: Set<number>): number {
  const spots = FORMATIONS[f].spots;
  let best = -1;
  let bv = -1;
  spots.forEach((spot, i) => {
    if (free && !free.has(i)) return;
    const v = spotValue(p, spot, 100);
    if (v > bv) {
      bv = v;
      best = i;
    }
  });
  return best;
}

/**
 * Pelatih memilih 11 pemain: pasangan (pemain, tempat) dengan nilai tertinggi diisi lebih dulu.
 * `value` = penilaian pelatih (CA plus performa dan lain-lain). `fixed` = pemain yang pasti main.
 */
export function assignXI(
  players: Player[],
  f: FormationId,
  value: (p: Player) => number = (p) => p.ca,
  fixed?: Player,
): Map<number, Player> {
  const spots = FORMATIONS[f].spots;
  const free = new Set(spots.map((_, i) => i));
  const out = new Map<number, Player>();
  if (fixed) {
    const i = bestSpot(fixed, f);
    out.set(i, fixed);
    free.delete(i);
  }
  const pairs: [number, Player, number][] = [];
  for (const p of players) {
    if (p === fixed) continue;
    const v = value(p);
    for (const i of free) pairs.push([v * (spotValue(p, spots[i], 100) / 100), p, i]);
  }
  pairs.sort((a, b) => b[0] - a[0] || a[2] - b[2]);
  const used = new Set<Player>();
  for (const [, p, i] of pairs) {
    if (used.has(p) || !free.has(i)) continue;
    out.set(i, p);
    used.add(p);
    free.delete(i);
    if (!free.size) break;
  }
  return out;
}

const STYLE_FORMATIONS: Record<PlayingStyle, FormationId[]> = {
  Possession: ['4-3-3', '4-3-3', '4-2-3-1'],
  Gegenpress: ['4-3-3', '4-2-3-1', '4-4-2'],
  Counter: ['4-4-2', '4-2-3-1', '5-3-2'],
  Direct: ['4-4-2', '4-4-2', '3-5-2'],
  'Wing Play': ['4-4-2', '4-2-3-1', '3-5-2'],
  Defensive: ['5-3-2', '4-4-2', '5-3-2'],
};

/** Formasi favorit pelatih klub (mengikuti gaya main, berganti kalau pelatihnya berganti) */
export function clubFormation(club: Pick<Club, 'id' | 'managerId' | 'playingStyle'>): FormationId {
  return new Rng(`formation:${club.id}:${club.managerId}`).pick(STYLE_FORMATIONS[club.playingStyle]);
}

/** Formasi tim nasional */
export function nationFormation(countryId: string, style: PlayingStyle): FormationId {
  return new Rng(`formation:nat:${countryId}`).pick(STYLE_FORMATIONS[style]);
}

/** Label posisi singkat ala FM untuk tempat di formasi */
export const SLOT_LABEL: Record<Slot, string> = {
  GK: 'GK',
  RB: 'DR', RCB: 'DC', CB: 'DC', LCB: 'DC', LB: 'DL', RWB: 'WBR', LWB: 'WBL',
  RDM: 'DM', CM: 'DM', LDM: 'DM', RCM: 'MC', LCM: 'MC', RM: 'MR', LM: 'ML', AM: 'AMC',
  RW: 'AMR', LW: 'AML', ST: 'ST', RS: 'ST', LS: 'ST',
};
