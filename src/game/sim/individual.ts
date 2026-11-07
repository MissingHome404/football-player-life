// Latihan individu ala FM: nilai latihan mingguan, posisi & peran latihan, satu atribut fokus
// tambahan, latihan kaki lemah, beban latihan, plus laporan pelatih dan laporan medis.

import { GOALKEEPING, MENTAL, PHYSICAL, POSITION_LABEL, TECHNICAL } from '../data/attributes';
import { POSITION_ROLES, ROLES, roleRating } from '../data/roles';
import { ageOn } from '../gen/player';
import { Rng, clamp } from '../rng';
import { addDays } from '../date';
import type { Career, Player } from '../types';
import { COACH_TIERS, INTENSITY_INFO, levelOf } from './economy';
import { injuryFactor } from './injury';
import { addManager } from './relations';
import { ageFactor, getAttr, isLearning, rolePosition, trainingRole } from './training';

const LOG_LIMIT = 26;
/** panah naik/turun di daftar atribut bertahan 8 minggu */
const TREND_DAYS = 56;

// --- beban latihan --------------------------------------------------------------------

export const WORKLOAD_LABEL = ['Sangat rendah', 'Rendah', 'Sedang', 'Tinggi', 'Sangat tinggi'] as const;

/** Bagian tambahan latihan individu yang sedang aktif */
export function extras(career: Career, p: Player): string[] {
  const plan = career.plan;
  const out: string[] = [];
  if (plan.extraFocus) out.push(`Fokus tambahan ${plan.extraFocus}`);
  if (plan.weakFoot && weakSide(p)) out.push('Latihan kaki lemah');
  if (isLearning(career, p)) out.push(`Latihan posisi ${plan.learnPos}`);
  return out;
}

/** Beban latihan individu 0-4 (Sangat rendah - Sangat tinggi) */
export function workload(career: Career, p: Player): number {
  const plan = career.plan;
  if (plan.focus === 'istirahat' || career.injury) return 0;
  const base = { ringan: 1, normal: 2, berat: 3 }[plan.intensity];
  return clamp(Math.round(base + extras(career, p).length * 0.5 - 0.01), 0, 4);
}

/** Kebugaran tambahan yang terkuras per minggu karena latihan individu tambahan */
export const workloadFitness = (career: Career, p: Player) => -1.5 * extras(career, p).length;

/** Peluang cedera saat latihan minggu ini (sama dengan yang dipakai simulasi mingguan) */
export function trainingInjuryChance(career: Career, p: Player): number {
  const plan = career.plan;
  if (plan.focus === 'istirahat' || career.injury) return 0;
  const proneness = 1 + (p.hidden['Injury Proneness'] - 10) / 10;
  const fis = levelOf(plan.coaches.fisik);
  return (
    0.008 *
    INTENSITY_INFO[plan.intensity].injury *
    Math.max(0.15, proneness) *
    (career.fitness < 40 ? 2 : 1) *
    (career.fitness < 20 ? 1.5 : 1) *
    (fis ? COACH_TIERS[fis as 1 | 2 | 3].injury : 1) *
    (1 + 0.08 * extras(career, p).length) *
    injuryFactor(career)
  );
}

export const riskLabel = (chance: number) => (chance < 0.008 ? 'Rendah' : chance < 0.016 ? 'Sedang' : chance < 0.03 ? 'Tinggi' : 'Sangat tinggi');

// --- nilai latihan --------------------------------------------------------------------

/**
 * Nilai latihan minggu ini (1-10): profesionalisme, determinasi, kerja keras, intensitas,
 * stres, kebugaran, dan pelatih pribadi, ditambah sedikit keberuntungan.
 */
export function trainingRating(career: Career, p: Player, rng: Rng): number {
  const plan = career.plan;
  let r =
    6.3 +
    (p.personality.Professionalism - 10) * 0.09 +
    (p.mental.Determination - 10) * 0.06 +
    (p.mental['Work Rate'] - 10) * 0.03 +
    { ringan: -0.35, normal: 0, berat: 0.35 }[plan.intensity];
  if (career.stress > 70) r -= 0.6;
  else if (career.stress > 50) r -= 0.25;
  if (career.fitness < 30) r -= 0.8;
  else if (career.fitness < 50) r -= 0.4;
  for (const k of ['teknik', 'fisik', 'mental'] as const) r += levelOf(plan.coaches[k]) * 0.06;
  r += rng.normal(0, 0.45);
  return Math.round(clamp(r, 1, 10) * 100) / 100;
}

/** Nilai latihan yang bagus membuat latihan lebih efektif (rata-rata pemain ±1) */
export const ratingMultiplier = (r: number) => clamp(1 + (r - 6.5) * 0.06, 0.82, 1.18);

export const ratingWord = (r: number) =>
  r >= 8.5 ? 'luar biasa' : r >= 7.6 ? 'sangat bagus' : r >= 6.9 ? 'bagus' : r >= 6.2 ? 'cukup' : r >= 5.5 ? 'kurang' : 'buruk';

/** Rata-rata nilai latihan n minggu terakhir */
export function avgRating(career: Career, n = 4): number | null {
  const log = (career.trainingLog ?? []).slice(0, n);
  return log.length ? Math.round((log.reduce((a, e) => a + e.rating, 0) / log.length) * 100) / 100 : null;
}

// --- kaki lemah ----------------------------------------------------------------------

/** Kaki yang lebih lemah (null kalau dua kaki sama kuat atau sudah 20) */
export function weakSide(p: Player): 'leftFoot' | 'rightFoot' | null {
  if (p.leftFoot === p.rightFoot) return p.leftFoot >= 20 ? null : 'leftFoot';
  const side = p.leftFoot < p.rightFoot ? 'leftFoot' : 'rightFoot';
  return p[side] >= 20 ? null : side;
}

/** Latihan kaki lemah satu minggu: naik 1 tiap progress-nya mencapai 1, tidak melewati kaki kuat */
export function weakFootWeek(career: Career, p: Player, notes?: string[]): boolean {
  const side = weakSide(p);
  if (!career.plan.weakFoot || !side || career.injury || career.plan.focus === 'istirahat') return false;
  const strong = Math.max(p.leftFoot, p.rightFoot);
  if (p[side] >= strong && p.leftFoot !== p.rightFoot) return false;
  const age = ageOn(p.birthDate, career.currentDate);
  const rate = 0.13 * ageFactor(age) * INTENSITY_INFO[career.plan.intensity].growth * (0.8 + p.personality.Professionalism / 50);
  career.progress.foot = (career.progress.foot ?? 0) + rate;
  if (career.progress.foot < 1) return false;
  career.progress.foot -= 1;
  p[side] = Math.min(20, p[side] + 1);
  career.attrTrend = { ...(career.attrTrend ?? {}), [side]: { d: 1, date: career.currentDate } };
  notes?.push(`Kaki ${side === 'leftFoot' ? 'kiri' : 'kanan'}mu makin terlatih (${p[side]}/20).`);
  return true;
}

// --- catatan mingguan ----------------------------------------------------------------

/** Simpan nilai latihan + CA minggu ini dan tandai atribut yang berubah */
export function recordTraining(career: Career, p: Player, rating: number | null, changes: Record<string, number>) {
  const date = career.currentDate;
  if (rating !== null) {
    const log = (career.trainingLog ??= []);
    log.unshift({ date, rating, ca: p.ca });
    log.length = Math.min(log.length, LOG_LIMIT);
  }
  markTrend(career, changes);
}

/** Tandai atribut yang naik/turun (untuk panah), buang tanda yang sudah lama */
export function markTrend(career: Career, changes: Record<string, number>) {
  const date = career.currentDate;
  const cut = addDays(date, -TREND_DAYS);
  const t: Record<string, { d: number; date: string }> = {};
  for (const [a, v] of Object.entries(career.attrTrend ?? {})) if (v.date >= cut) t[a] = v;
  for (const [a, d] of Object.entries(changes)) if (d) t[a] = { d: Math.sign(d), date };
  career.attrTrend = t;
}

/** Pujian/kritik pelatih kalau nilai latihan 4 minggu terakhir sangat bagus/buruk */
export function trainingReaction(career: Career, from: string, notes?: string[]) {
  const log = career.trainingLog ?? [];
  if (log.length < 4 || !career.rel.manager) return;
  const avg = avgRating(career, 4)!;
  const last = career.cooldowns.training_talk;
  if (last !== undefined && career.week - last < 8) return;
  if (avg >= 7.9) {
    career.cooldowns.training_talk = career.week;
    addManager(career, 3);
    career.stress = clamp(career.stress - 3, 0, 100);
    notes?.push('Pelatih memujimu karena tampil sangat bagus di latihan.');
    career.inbox.unshift({
      id: `w${career.week}-train-praise`,
      date: career.currentDate,
      from,
      title: 'Pujian dari pelatih',
      body: `Pelatih memujimu di depan tim: rata-rata nilai latihanmu ${avg.toFixed(2)} dalam 4 minggu terakhir. Hubunganmu dengan pelatih membaik.`,
    });
  } else if (avg <= 5.8) {
    career.cooldowns.training_talk = career.week;
    addManager(career, -3);
    career.stress = clamp(career.stress + 4, 0, 100);
    notes?.push('Pelatih mengkritik sikapmu di latihan.');
    career.inbox.unshift({
      id: `w${career.week}-train-criticism`,
      date: career.currentDate,
      from,
      title: 'Kritik dari pelatih',
      body: `Pelatih memanggilmu: rata-rata nilai latihanmu hanya ${avg.toFixed(2)} dalam 4 minggu terakhir. Dia ingin melihat usaha lebih. Jaga stres dan kebugaranmu supaya latihan lebih bagus.`,
    });
  }
}

// --- laporan ---------------------------------------------------------------------------

/** Ketajaman bertanding 0..1 dari menit bermain 4 minggu terakhir */
export function matchSharpness(career: Career): number {
  const since = addDays(career.currentDate, -28);
  const mins = career.matches.filter((m) => m.date >= since).reduce((a, m) => a + m.minutes, 0);
  return clamp(mins / 300, 0, 1);
}
export const sharpWord = (v: number) => (v >= 0.8 ? 'Tajam' : v >= 0.5 ? 'Cukup' : v >= 0.2 ? 'Kurang' : 'Kurang menit bermain');

const ATTRS_FOR = (p: Player) => [...TECHNICAL, ...MENTAL, ...PHYSICAL, ...(p.mainPosition === 'GK' ? GOALKEEPING : [])];
/** Atribut yang boleh dipilih sebagai fokus tambahan */
export const focusOptions = (p: Player): string[] => ATTRS_FOR(p);

const allValues = (p: Player): Record<string, number> => ({ ...p.technical, ...p.mental, ...p.physical, ...p.goalkeeping });

export interface CoachReport {
  role: string;
  /** cocok dengan peran latihan, 1-20 */
  fit: number;
  strengths: string[];
  weaknesses: string[];
  /** peran terbaik di posisi latihan: [id, kecocokan] */
  best: [string, number][];
  /** saran fokus tambahan */
  suggest: string | null;
}

/** Laporan pelatih: kekuatan & kelemahan untuk peran latihan, peran paling cocok, saran fokus */
export function coachReport(career: Career, p: Player): CoachReport {
  const role = trainingRole(career, p);
  const r = ROLES[role];
  const v = allValues(p);
  const keys = [...r.key].sort((a, b) => v[b] - v[a]);
  const best = POSITION_ROLES[rolePosition(career, p)]
    .map((id) => [id, Math.round(roleRating(v, ROLES[id]) * 10) / 10] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const weak = [...keys].reverse().filter((a) => v[a] < 20);
  return {
    role,
    fit: Math.round(roleRating(v, r) * 10) / 10,
    strengths: keys.slice(0, 3),
    weaknesses: weak.slice(0, 3),
    best,
    suggest: weak[0] ?? null,
  };
}

/** Laporan latihan dari staf pelatih: kalimat pendek seperti di FM */
export function trainingReport(career: Career, p: Player): string[] {
  const out: string[] = [];
  const log = career.trainingLog ?? [];
  if (!log.length) return ['Belum ada catatan latihan. Laporan muncul setelah satu minggu latihan.'];
  // perkembangan 8 minggu terakhir
  const old = log[Math.min(log.length - 1, 8)];
  const gain = p.ca - old.ca;
  const weeks = Math.min(log.length - 1, 8);
  if (weeks >= 3) {
    if (gain >= 6) out.push(`Berkembang pesat dalam ${weeks} minggu terakhir.`);
    else if (gain >= 2) out.push(`Membuat kemajuan dalam ${weeks} minggu terakhir.`);
    else if (gain >= 0) out.push(`Perkembangannya hampir tidak terlihat dalam ${weeks} minggu terakhir.`);
    else out.push(`Kemampuannya menurun dalam ${weeks} minggu terakhir.`);
  }
  const avg = avgRating(career, 4)!;
  const prev = avgRating({ ...career, trainingLog: log.slice(4) }, 4);
  out.push(`Tampil ${ratingWord(avg)} di latihan belakangan ini (rata-rata ${avg.toFixed(2)}).`);
  if (prev !== null && Math.abs(avg - prev) >= 0.3) out.push(avg > prev ? 'Nilai latihannya sedang naik.' : 'Nilai latihannya sedang turun.');
  const gap = p.pa - p.ca;
  const age = ageOn(p.birthDate, career.currentDate);
  if (gap <= 3) out.push('Tampaknya sudah hampir mencapai batas kemampuannya.');
  else if (age <= 21 && gap >= 40) out.push('Masih punya banyak ruang untuk berkembang.');
  if (age >= 30) out.push('Usianya membuat atribut fisik sulit naik; jaga kebugaran.');
  if (career.stress > 70) out.push('Stres tinggi mengganggu fokusnya di latihan.');
  if (career.fitness < 50) out.push('Terlihat lelah; pertimbangkan intensitas lebih ringan.');
  const learn = career.plan.learnPos;
  if (learn && isLearning(career, p)) out.push(`Sedang belajar bermain sebagai ${POSITION_LABEL[learn].toLowerCase()}.`);
  const side = weakSide(p);
  if (career.plan.weakFoot && side) out.push(`Kaki ${side === 'leftFoot' ? 'kiri' : 'kanan'}nya sedang dilatih (${p[side]}/20).`);
  return out;
}

/** Atribut ditandai naik/turun dalam 8 minggu terakhir (untuk panah) */
export function trendOf(career: Career): Record<string, number> {
  const cut = addDays(career.currentDate, -TREND_DAYS);
  const t: Record<string, number> = {};
  for (const [a, v] of Object.entries(career.attrTrend ?? {})) if (v.date >= cut) t[a] = v.d;
  return t;
}

/** Nilai atribut sekarang (untuk UI) */
export const attrValue = (p: Player, a: string) => getAttr(p, a);
