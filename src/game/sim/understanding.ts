// Pemahaman taktik pemain kita: seberapa paham kamu dengan taktik pelatih sekarang (0..1).
// Naik tiap minggu latihan (lebih cepat dengan fokus latihan "Taktik" dan atribut mental yang bagus) dan
// tiap laga. Pindah klub atau ganti pelatih berarti belajar taktik baru dari awal.
// Di match engine, pemahaman rendah = lebih lambat membaca posisi, sering salah tempat, keputusan ragu-ragu,
// dan gaya peran dari pelatih belum keluar sepenuhnya.

import { clamp } from '../rng';
import { tacticalIQ } from './tactics';
import type { Career, Club, Player } from '../types';

/** Kunci taktik klub: berubah kalau pelatihnya berganti */
export const clubKey = (club: Pick<Club, 'id' | 'managerId'>) => `${club.id}:${club.managerId}`;
/** Kunci taktik tim nasional */
export const natKey = (countryId: string) => `nat:${countryId}`;

/** Pemahaman awal saat bertemu taktik baru */
export const famStart = (p: Player) => 0.3 + 0.15 * tacticalIQ(p);

/** Save lama (sebelum ada pemahaman taktik): anggap sudah cukup paham taktik tim sekarang */
const LEGACY = 0.7;

export function tacticFam(career: Career, key: string, p: Player): number {
  if (!career.tacticFam) return Math.max(LEGACY, famStart(p));
  return career.tacticFam[key] ?? famStart(p);
}

const LEVELS: [number, string][] = [
  [0.9, 'Kamu sudah sangat paham taktik pelatih. Cara mainmu di lapangan sudah persis seperti yang ia mau.'],
  [0.65, 'Kamu mulai paham taktik pelatih. Posisi dan tugasmu di lapangan makin tepat.'],
];

/** Tambah pemahaman (makin paham makin lambat naiknya). Mengembalikan pesan kalau naik level. */
export function learnTactic(career: Career, key: string, p: Player, amount: number): string | null {
  const before = tacticFam(career, key, p);
  const after = clamp(before + amount * (1 - before * 0.55), 0, 1);
  const map = { ...(career.tacticFam ?? {}) };
  delete map[key];
  // simpan yang terbaru di belakang, buang yang terlalu lama (riwayat kecil di save)
  map[key] = Math.round(after * 1000) / 1000;
  const keys = Object.keys(map);
  for (const k of keys.slice(0, Math.max(0, keys.length - 8))) delete map[k];
  career.tacticFam = map;
  const lvl = LEVELS.find(([v]) => before < v && after >= v);
  return lvl ? lvl[1] : null;
}

/** Latihan mingguan bersama klub */
export function understandWeek(career: Career, player: Player, club: Club | undefined, notes?: string[]) {
  if (!club) return;
  let rate = 0.02 + 0.03 * tacticalIQ(player);
  const plan = career.plan;
  if (plan.focus === 'taktik') rate *= 2.2;
  else if (plan.focus === 'istirahat') rate *= 0.3;
  if (plan.activity === 'video') rate *= 1.3;
  if (career.injury) rate *= 0.4;
  const msg = learnTactic(career, clubKey(club), player, rate);
  if (msg) notes?.push(msg);
}

/**
 * Pengali kehilangan kebugaran setelah laga: taktik dengan intensitas tinggi (pressing, tempo, garis tinggi)
 * lebih melelahkan, stamina & natural fitness menahannya.
 */
export function intensityDrain(intensity: number | undefined, p: Player): number {
  const i = intensity ?? 0.5;
  const body = (p.physical.Stamina + p.physical['Natural Fitness']) / 2;
  return clamp((0.7 + 0.6 * i) * (1.15 - body * 0.015), 0.6, 1.6);
}
