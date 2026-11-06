// Gaya main tiap peran (role) di match engine. Peran mengubah KE MANA pemain bergerak dan APA yang
// ia sukai saat memegang bola; seberapa berhasil ia melakukannya tetap ditentukan atributnya.
// Rujukan gaya: deskripsi peran Football Manager dan prinsip posisi (half-space, half-back, sweeper keeper).

import { POSITION_ROLES, ROLES, roleRating } from '../data/roles';
import type { Position } from '../data/attributes';
import type { Player } from '../types';

/** Pengatur gaya main sebuah peran. 0 (atau 1 untuk pengali) = netral. */
export interface RoleK {
  /** saat menyerang: maju (+) / tetap lebih dalam (-), meter */
  up: number;
  /** saat menyerang: melebar ke garis samping (+) / masuk ke tengah (-), -1..1 */
  wide: number;
  /** penyerang turun menjemput bola di antara lini lawan (meter dari garis bek lawan) */
  drop: number;
  /** 0..1: masuk ke kotak penalti saat bola di sepertiga akhir */
  box: number;
  /** pengali frekuensi lari ke belakang garis pertahanan */
  runs: number;
  /** pengali keinginan menekan pembawa bola */
  press: number;
  /** pengali ikut turun bertahan (penyerang & gelandang): <1 tinggal di depan */
  back: number;
  /** pengali lama memegang bola sebelum mengambil keputusan */
  hold: number;
  /** tambahan nilai membawa bola (progressive carry) */
  carry: number;
  /** tambahan nilai melewati lawan */
  takeOn: number;
  /** tambahan nilai menembak (dari posisi bagus) */
  shoot: number;
  /** tambahan nilai tembakan jarak jauh */
  long: number;
  /** tambahan nilai umpan silang */
  cross: number;
  /** tambahan nilai umpan kunci / terobosan (berani mengambil risiko) */
  create: number;
  /** tambahan nilai umpan aman (menjaga bola) */
  safe: number;
  /** tambahan nilai umpan panjang / diagonal */
  direct: number;
  /** tambahan nilai menyapu bola */
  clear: number;
  /** 0..1: pemain sayap memotong ke dalam menuju gawang */
  cutIn: number;
  /** 0..1: target bola atas (rekan mencarinya dengan umpan panjang, ia menahan bola) */
  target: number;
}

const N: RoleK = {
  up: 0, wide: 0, drop: 0, box: 0, runs: 1, press: 1, back: 1, hold: 1, carry: 0, takeOn: 0, shoot: 0, long: 0,
  cross: 0, create: 0, safe: 0, direct: 0, clear: 0, cutIn: 0, target: 0,
};
const k = (o: Partial<RoleK>): RoleK => ({ ...N, ...o });

export const NEUTRAL_ROLE = N;

/** Profil gaya main setiap peran */
export const ROLE_PLAY: Record<string, RoleK> = {
  // kiper: perbedaannya diatur langsung di engine (posisi, menyapu bola, distribusi)
  gk: k({ direct: 0.2 }),
  sk: k({ safe: 0.15, hold: 1.2 }),
  // bek tengah
  cd: N,
  bpd: k({ carry: 0.1, direct: 0.12, create: 0.08, hold: 1.2, safe: 0.05 }),
  ncb: k({ clear: 0.35, carry: -0.2, create: -0.25, safe: -0.05, direct: 0.1, hold: 0.7 }),
  wcb: k({ up: 6, wide: 0.45, carry: 0.1, cross: 0.06, runs: 0.6 }),
  // bek sayap
  fb: N,
  wb: k({ up: 8, wide: 0.3, cross: 0.1, runs: 1.3, carry: 0.05 }),
  ifb: k({ up: -6, wide: -0.75, safe: 0.12, cross: -0.15, runs: 0.2 }),
  nfb: k({ up: -18, cross: -0.1, clear: 0.2, carry: -0.12, runs: 0.2, takeOn: -0.1 }),
  cwb: k({ up: 14, wide: 0.35, cross: 0.12, takeOn: 0.1, carry: 0.1, runs: 1.5 }),
  iwb: k({ up: 2, wide: -0.8, safe: 0.12, create: 0.05, cross: -0.15, runs: 0.4 }),
  // gelandang bertahan
  dm: k({ safe: 0.08 }),
  a: k({ up: -5, runs: 0, press: 0.7, safe: 0.15, create: -0.12, carry: -0.08, back: 1.15 }),
  dlp: k({ up: -3, hold: 1.3, safe: 0.08, create: 0.12, direct: 0.12, runs: 0.2 }),
  bwm: k({ press: 1.7, safe: 0.12, create: -0.05, runs: 0.5 }),
  reg: k({ hold: 1.35, create: 0.22, direct: 0.15, carry: 0.06, runs: 0.4, long: 0.05 }),
  hb: k({ up: -12, wide: -1, safe: 0.18, runs: 0, press: 0.8, create: -0.05 }),
  // gelandang tengah
  cm: N,
  b2b: k({ up: 4, runs: 1.6, press: 1.25, box: 0.35, shoot: 0.08, long: 0.04 }),
  ap: k({ up: 3, hold: 1.25, create: 0.22, carry: 0.06, drop: 0, runs: 0.6 }),
  mez: k({ up: 6, wide: 0.5, carry: 0.12, runs: 1.4, shoot: 0.08, box: 0.25 }),
  car: k({ up: -2, press: 1.2, safe: 0.15, runs: 0.4, create: -0.05 }),
  rpm: k({ up: 6, runs: 1.4, create: 0.15, carry: 0.12, hold: 1.1, box: 0.2 }),
  // gelandang sayap
  wm: k({ cross: 0.05, back: 1.1 }),
  w: k({ wide: 0.5, cross: 0.15, takeOn: 0.12, carry: 0.1, cutIn: 0.1, shoot: -0.08 }),
  wp: k({ wide: -0.45, hold: 1.25, create: 0.18, carry: 0.04, cutIn: 0.4, cross: -0.05 }),
  dw: k({ up: -4, back: 1.35, press: 1.35, cross: 0.05, takeOn: -0.05, runs: 0.6 }),
  // pemain sayap depan
  if: k({ wide: -0.1, cutIn: 0.85, shoot: 0.15, takeOn: 0.1, carry: 0.1, runs: 1.3, box: 0.3, cross: -0.12, long: 0.04 }),
  iw: k({ cutIn: 0.7, create: 0.15, hold: 1.1, cross: -0.05, carry: 0.06 }),
  rmd: k({ wide: -0.3, runs: 1.7, box: 0.8, shoot: 0.15, carry: -0.05, press: 0.75, back: 0.8 }),
  wtf: k({ target: 0.8, cross: 0.04, takeOn: -0.08, hold: 1.2, box: 0.4 }),
  // gelandang serang
  am: k({ shoot: 0.05, create: 0.06 }),
  ss: k({ up: 6, runs: 1.7, box: 0.6, shoot: 0.15, back: 0.8, press: 0.9 }),
  eng: k({ hold: 1.45, create: 0.26, press: 0.4, back: 0.55, runs: 0.2, carry: -0.04 }),
  t: k({ hold: 1.25, create: 0.2, takeOn: 0.12, carry: 0.12, press: 0.45, back: 0.6, shoot: 0.05 }),
  // penyerang
  af: k({ up: 2, runs: 1.9, carry: 0.1, shoot: 0.1, press: 1.05 }),
  p: k({ box: 1, runs: 1.4, shoot: 0.22, press: 0.5, back: 0.55, hold: 0.7, carry: -0.12, create: -0.1, long: -0.1 }),
  cf: k({ drop: 3, carry: 0.1, shoot: 0.1, long: 0.1, create: 0.1, takeOn: 0.05, target: 0.4, runs: 1.1 }),
  f9: k({ drop: 13, create: 0.2, carry: 0.12, hold: 1.3, runs: 0.3, box: -0.4, shoot: -0.02 }),
  dlf: k({ drop: 9, safe: 0.1, hold: 1.35, create: 0.1, runs: 0.4, target: 0.45 }),
  tf: k({ drop: 1, target: 1, hold: 1.25, runs: 0.35, carry: -0.12, takeOn: -0.12, box: 0.5 }),
  // pressing forward tetap tinggi untuk menekan bek lawan, bukan turun
  pf: k({ press: 2.4, back: 0.85, runs: 1.05, carry: 0.02 }),
};

export function rolePlay(role: string | undefined): RoleK {
  return (role && ROLE_PLAY[role]) || N;
}

/** Atribut pemain dalam satu rekaman nama -> nilai (untuk roleRating) */
export function flatAttrs(p: Player): Record<string, number> {
  return { ...p.technical, ...p.mental, ...p.physical, ...p.goalkeeping } as Record<string, number>;
}

/**
 * Peran pemain di sebuah tempat formasi: peran favoritnya kalau cocok dengan posisi tempat itu,
 * selain itu peran dengan kecocokan atribut tertinggi.
 */
export function pickRole(p: Player, pos: Position[]): string {
  const ok = new Set(pos.flatMap((x) => POSITION_ROLES[x]));
  if (ok.has(p.preferredRole)) return p.preferredRole;
  const attrs = flatAttrs(p);
  let best = POSITION_ROLES[pos[0]][0];
  let bv = -Infinity;
  for (const id of POSITION_ROLES[pos[0]]) {
    const v = roleRating(attrs, ROLES[id]);
    if (v > bv) {
      bv = v;
      best = id;
    }
  }
  return best;
}
