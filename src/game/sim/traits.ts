// Kebiasaan bermain (mirip "player traits" di FM): kebiasaan pribadi yang membuat dua pemain dengan peran
// yang sama tetap bermain berbeda. Kebiasaan muncul dari atribut + kepribadian (dan sedikit keberuntungan,
// tetap sama untuk pemain yang sama), lalu ditambahkan ke gaya peran di match engine.

import { Rng } from '../rng';
import type { Position } from '../data/attributes';
import type { Player } from '../types';
import type { RoleK } from './roleplay';

export interface PlayTrait {
  id: string;
  name: string;
  desc: string;
  /** perubahan gaya main (ditambahkan ke peran; `runs`/`hold`/`back`/`press` dikalikan) */
  k: Partial<RoleK>;
}

type A = Record<string, number>;
type G = 'GK' | 'DEF' | 'WIDE' | 'MID' | 'FWD';

const T = (id: string, name: string, desc: string, k: Partial<RoleK>): PlayTrait => ({ id, name, desc, k });

export const PLAY_TRAITS: Record<string, PlayTrait> = Object.fromEntries(
  [
    T('longShots', 'Suka tembakan jarak jauh', 'Mencoba menembak dari luar kotak penalti.', { long: 0.16, shoot: 0.04 }),
    T('runsWithBall', 'Suka membawa bola', 'Membawa bola maju sendiri kalau ada ruang.', { carry: 0.16, hold: 1.1 }),
    T('cutsInside', 'Memotong ke dalam', 'Dari sayap membawa bola ke tengah menuju gawang.', { cutIn: 0.5, carry: 0.05 }),
    T('hugsLine', 'Menyisir garis samping', 'Bertahan melebar dan menusuk sampai garis gawang.', { wide: 0.35, cross: 0.08, cutIn: -0.25 }),
    T('beatsMan', 'Suka melewati lawan', 'Menantang bek satu lawan satu.', { takeOn: 0.16, carry: 0.04 }),
    T('killerBalls', 'Mencoba umpan terobosan', 'Selalu mencari umpan yang membelah pertahanan.', { create: 0.16 }),
    T('playsSimple', 'Main simpel', 'Mengoper pendek ke rekan terdekat, jarang mengambil risiko.', { safe: 0.14, create: -0.1, carry: -0.06, hold: 0.85 }),
    T('switchesPlay', 'Suka memindah arah bola', 'Mengirim umpan diagonal jauh ke sisi lain.', { direct: 0.14 }),
    T('getsForward', 'Rajin naik membantu serangan', 'Ikut menyerang setiap ada kesempatan.', { up: 5, runs: 1.5, box: 0.2 }),
    T('staysBack', 'Selalu tetap di belakang', 'Jarang meninggalkan posisinya.', { up: -4, runs: 0.3, box: -0.2 }),
    T('comesDeep', 'Turun menjemput bola', 'Turun ke lini tengah meminta bola.', { drop: 6 }),
    T('runsInBehind', 'Lari ke belakang garis', 'Terus mencoba lolos dari jebakan offside.', { runs: 1.6, up: 2 }),
    T('arrivesLate', 'Datang terlambat ke kotak', 'Menyusul ke kotak penalti saat serangan berkembang.', { box: 0.35, runs: 1.2 }),
    T('oneTwos', 'Suka umpan satu-dua', 'Mengoper lalu langsung berlari meminta bola kembali.', { oneTwo: 1 }),
    T('dwellsOnBall', 'Lama memegang bola', 'Menahan bola lebih lama sebelum memutuskan.', { hold: 1.35 }),
    T('hardTackler', 'Tekel keras', 'Masuk ke duel dengan keras (kadang terlalu keras).', { tackle: 1 }),
    T('presses', 'Menekan tanpa lelah', 'Terus memburu pembawa bola lawan.', { press: 1.4 }),
    T('roams', 'Bergerak bebas', 'Berpindah posisi mencari ruang.', { roam: 0.35 }),
    T('channels', 'Bergerak ke celah', 'Lari ke celah antara bek tengah dan bek sayap.', { wide: 0.3, runs: 1.2 }),
    T('crossesEarly', 'Umpan silang lebih awal', 'Mengirim umpan silang sebelum sampai garis gawang.', { cross: 0.1 }),
  ].map((t) => [t.id, t]),
);

function groupOf(pos: Position): G {
  if (pos === 'GK') return 'GK';
  if (pos === 'DC' || pos === 'DR' || pos === 'DL') return 'DEF';
  if (pos === 'WBR' || pos === 'WBL' || pos === 'MR' || pos === 'ML' || pos === 'AMR' || pos === 'AML') return 'WIDE';
  if (pos === 'ST') return 'FWD';
  return 'MID';
}

const over = (v: number, from: number) => Math.max(0, v - from);

/** Bobot kemunculan tiap kebiasaan dari atribut, kepribadian, dan posisi (0 = tidak mungkin) */
function weights(a: A, g: G, pos: Position, per: A, hid: A): [string, number][] {
  const out: [string, number][] = [];
  const add = (id: string, w: number) => {
    if (w > 0) out.push([id, w]);
  };
  if (g === 'GK') return out;
  const fla = a.Flair;
  add('longShots', g !== 'DEF' ? over(a['Long Shots'], 13) * (1 + over(fla, 11) * 0.15) + over(a['Long Shots'], 16) : 0);
  add('runsWithBall', over(a.Dribbling, 13) + over(a.Acceleration, 14) * 0.5 + (g === 'DEF' && pos === 'DC' ? -2 : 0));
  add('cutsInside', g === 'WIDE' && pos !== 'WBR' && pos !== 'WBL' ? over(a.Dribbling, 12) + over(a.Finishing, 11) * 0.7 : 0);
  add('hugsLine', g === 'WIDE' || pos === 'DR' || pos === 'DL' ? over(a.Crossing, 12) + over(a.Pace, 13) * 0.5 : 0);
  add('beatsMan', g !== 'DEF' ? over(a.Dribbling, 14) + over(fla, 13) : 0);
  add('killerBalls', g !== 'DEF' ? over(a.Vision, 14) + over(a.Passing, 14) * 0.6 + over(fla, 13) * 0.5 : 0);
  add('playsSimple', fla <= 9 ? over(a.Teamwork, 11) * 0.6 + over(a.Decisions, 11) * 0.4 + (9 - fla) * 0.3 : 0);
  add('switchesPlay', over(a.Passing, 13) + over(a.Vision, 13) * 0.6);
  add('getsForward', g === 'DEF' || g === 'MID' ? over(a['Off the Ball'], 12) + over(a.Stamina, 13) * 0.5 + over(per.Ambition ?? 10, 13) * 0.3 : 0);
  add('staysBack', g === 'DEF' || pos === 'DM' ? over(a.Positioning, 12) * 0.7 + over(12, a['Off the Ball']) * 0.6 : 0);
  add('comesDeep', g === 'FWD' ? over(a.Vision, 12) + over(a.Passing, 12) * 0.6 : 0);
  add('runsInBehind', g === 'FWD' || g === 'WIDE' ? over(a.Pace, 14) + over(a['Off the Ball'], 13) : 0);
  add('arrivesLate', g === 'MID' ? over(a['Off the Ball'], 12) + over(a.Finishing, 11) * 0.6 : 0);
  add('oneTwos', over(a.Technique, 13) * 0.6 + over(a.Teamwork, 13) * 0.6 + over(fla, 12) * 0.3);
  add('dwellsOnBall', over(a.Composure, 13) * 0.5 + over(fla, 13) * 0.5 + over(11, a.Decisions) * 0.6);
  add('hardTackler', over(a.Aggression, 14) + over(hid.Dirtiness ?? 8, 13) * 0.6 + over(12, per.Temperament ?? 10) * 0.3);
  add('presses', over(a['Work Rate'], 14) + over(a.Stamina, 14) * 0.5 + over(a.Aggression, 13) * 0.3);
  add('roams', g !== 'DEF' ? over(fla, 14) + over(a['Off the Ball'], 14) * 0.5 : 0);
  add('channels', g === 'FWD' ? over(a['Off the Ball'], 12) + over(a.Pace, 13) * 0.4 : 0);
  add('crossesEarly', g === 'WIDE' || pos === 'DR' || pos === 'DL' ? over(a.Crossing, 13) * 0.6 + over(a.Vision, 12) * 0.3 : 0);
  return out;
}

const EXCLUSIVE: [string, string][] = [
  ['cutsInside', 'hugsLine'],
  ['getsForward', 'staysBack'],
  ['playsSimple', 'killerBalls'],
  ['playsSimple', 'dwellsOnBall'],
  ['playsSimple', 'beatsMan'],
];

/**
 * Kebiasaan bermain seorang pemain (0-3): sama untuk pemain yang sama selama atributnya tidak berubah
 * jauh. Pemain berbakat dan ber-flair tinggi punya lebih banyak kebiasaan.
 */
export function playTraits(p: Player): string[] {
  const a = { ...p.technical, ...p.mental, ...p.physical } as A;
  const g = groupOf(p.mainPosition);
  const pool = weights(a, g, p.mainPosition, p.personality as A, p.hidden as A);
  if (!pool.length) return [];
  const rng = new Rng(`ppm:${p.id}`);
  const total = pool.reduce((s, [, w]) => s + w, 0);
  // jumlah kebiasaan: dari kekuatan bobot (atribut menonjol) dan flair
  const n = Math.min(3, Math.floor(Math.sqrt(total) * 0.55 + (a.Flair - 8) * 0.05 + rng.float(0, 1)));
  const out: string[] = [];
  const left = [...pool];
  while (out.length < n && left.length) {
    const id = rng.weighted(left);
    left.splice(left.findIndex(([x]) => x === id), 1);
    if (EXCLUSIVE.some(([x, y]) => (x === id && out.includes(y)) || (y === id && out.includes(x)))) continue;
    out.push(id);
  }
  return out;
}

/** Perubahan gaya main dari daftar kebiasaan (untuk playStyle) */
export function traitK(traits: readonly string[] | undefined): Partial<RoleK>[] {
  return (traits ?? []).map((id) => PLAY_TRAITS[id]?.k).filter((k): k is Partial<RoleK> => !!k);
}
