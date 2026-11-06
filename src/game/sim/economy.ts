// Uang mingguan: uang saku keluarga, gaji, biaya pelatih pribadi dan kegiatan.
// Semua harga dasar dalam EUR "Eropa Barat", lalu dikali kekuatan ekonomi negara.

import { ECONOMY } from '../gen/character';
import { lifeCosts } from './life';
import type { Activity, Career, CoachKind, CoachLevel, Intensity, Player, TrainingFocus } from '../types';

export const econOf = (countryId: string) => ECONOMY[countryId] ?? 0.5;

export const FOCUS_INFO: Record<TrainingFocus, { label: string; desc: string }> = {
  seimbang: { label: 'Seimbang', desc: 'Semua atribut berkembang sedikit-sedikit.' },
  teknik: { label: 'Teknik', desc: 'Fokus atribut technical (atau goalkeeping untuk kiper).' },
  mental: { label: 'Mental', desc: 'Fokus keputusan, posisi, dan ketenangan.' },
  fisik: { label: 'Fisik', desc: 'Fokus kecepatan, stamina, dan kekuatan. Lebih melelahkan.' },
  peran: { label: 'Peran', desc: 'Fokus atribut kunci peran yang kamu pilih (peran dari posisi utamamu, atau dari posisi baru yang sedang kamu latih).' },
  taktik: {
    label: 'Taktik',
    desc: 'Pelajari taktik pelatih: pemahaman taktik naik jauh lebih cepat, atribut membaca permainan (Decisions, Teamwork, Anticipation, Positioning) ikut berkembang.',
  },
  istirahat: { label: 'Istirahat', desc: 'Tidak berlatih. Kebugaran dan stres pulih, atribut tidak naik.' },
};

// stress = pengaruh ke "arah stres" (lihat stressTarget di week.ts)
export const INTENSITY_INFO: Record<Intensity, { label: string; growth: number; fitness: number; stress: number; injury: number }> = {
  ringan: { label: 'Ringan', growth: 0.7, fitness: -5, stress: -6, injury: 0.5 },
  normal: { label: 'Normal', growth: 1, fitness: -10, stress: 0, injury: 1 },
  berat: { label: 'Berat', growth: 1.3, fitness: -18, stress: 14, injury: 2 },
};

export const ACTIVITY_INFO: Record<
  Activity,
  { label: string; desc: string; cost: number; stress: number; fitness: number }
> = {
  rumah: { label: 'Santai di rumah', desc: 'Gratis, badan pulih sedikit.', cost: 0, stress: -2, fitness: 3 },
  keluarga: { label: 'Waktu bersama keluarga', desc: 'Stres turun, dukungan keluarga bisa naik.', cost: 5, stress: -8, fitness: 0 },
  nongkrong: { label: 'Nongkrong dengan teman', desc: 'Stres turun lumayan.', cost: 15, stress: -10, fitness: 0 },
  kencan: {
    label: 'Kencan',
    desc: 'Makan malam atau jalan-jalan berdua dengan pasangan. Cara paling cepat menaikkan relasi pasangan.',
    cost: 30,
    stress: -10,
    fitness: 0,
  },
  pesta: { label: 'Pesta', desc: 'Stres turun drastis, tapi mahal, bikin capek, dan bisa jadi kebiasaan buruk.', cost: 80, stress: -20, fitness: -10 },
  video: { label: 'Analisis video sendiri', desc: 'Atribut mental berkembang lebih cepat, sedikit menambah stres.', cost: 0, stress: 5, fitness: 0 },
  kerja: { label: 'Kerja sampingan', desc: 'Dapat uang, tapi capek dan latihan kurang maksimal. Hanya kalau belum digaji klub.', cost: -45, stress: 10, fitness: -5 },
};

export const COACH_INFO: Record<CoachKind, { label: string; desc: string; cost: number }> = {
  teknik: { label: 'Pelatih teknik', desc: 'Latihan technical (atau goalkeeping) lebih efektif.', cost: 60 },
  fisik: { label: 'Pelatih fisik', desc: 'Latihan fisik lebih efektif, risiko cedera latihan turun.', cost: 50 },
  mental: { label: 'Pelatih mental', desc: 'Latihan mental lebih efektif.', cost: 50 },
  psikolog: { label: 'Psikolog', desc: 'Arah stresmu turun.', cost: 70 },
};

/**
 * Tingkatan pelatih & staf pribadi. Amatir murah tapi efeknya kecil; world class dibayar
 * dengan harga internasional (tidak ikut ekonomi negaramu) dan efeknya paling besar.
 */
export const COACH_TIERS: Record<1 | 2 | 3, { label: string; cost: number; local: boolean; boost: number; injury: number; stress: number }> = {
  1: { label: 'Amatir', cost: 0.4, local: true, boost: 1.15, injury: 0.85, stress: -7 },
  2: { label: 'Profesional', cost: 1, local: true, boost: 1.35, injury: 0.7, stress: -15 },
  3: { label: 'World class', cost: 6, local: false, boost: 1.7, injury: 0.5, stress: -24 },
};
export const COACH_LEVELS: CoachLevel[] = [0, 1, 2, 3];

/** Tingkat pelatih/staf; save lama menyimpan true (= profesional) atau false */
export function levelOf(v: unknown): CoachLevel {
  if (v === true) return 2;
  if (typeof v === 'number' && v >= 1 && v <= 3) return Math.round(v) as CoachLevel;
  return 0;
}

/** Biaya mingguan pelatih/staf dengan tingkat tertentu (harga dasar = tingkat profesional) */
export function tierCost(base: number, level: CoachLevel, econ: number): number {
  if (!level) return 0;
  const t = COACH_TIERS[level];
  return base * t.cost * (t.local ? econ : 1);
}

/** Pengali poin latihan dari pelatih pribadi jenis ini */
export const coachBoostOf = (career: Career, k: CoachKind) => {
  const l = levelOf(career.plan.coaches[k]);
  return l ? COACH_TIERS[l].boost : 1;
};

export const ALLOWANCE = { miskin: 8, menengah: 40, kaya: 200 } as const;

export const TAX_RATE = 0.3;

const round = (v: number) => Math.round(v * 100) / 100;

/** Perkiraan uang masuk dan keluar minggu ini sesuai rencana */
export function weeklyBudget(career: Career, player: Player) {
  const econ = econOf(player.nationalityId);
  const wage = player.contract?.wagePerWeek ?? 0;
  // uang saku keluarga berhenti saat sudah digaji layak oleh klub
  const fullAllowance = ALLOWANCE[career.family.wealth] * econ;
  const allowance = round(wage >= fullAllowance * 3 ? 0 : fullAllowance);
  // kontrak sponsor (lihat social.ts)
  const sponsor = round((career.social?.deals ?? []).reduce((a, d) => a + d.weekly, 0));
  const tax = round((wage + sponsor) * TAX_RATE);
  const agent = round(wage * (career.agent?.fee ?? 0));
  const lc = lifeCosts(career, econ);
  const living = round(lc.house);
  const lifestyle = round(lc.subs + lc.upkeep);
  let coaches = 0;
  for (const k of Object.keys(COACH_INFO) as CoachKind[]) {
    coaches += tierCost(COACH_INFO[k].cost, levelOf(career.plan.coaches[k]), econ);
  }
  const act = ACTIVITY_INFO[career.plan.activity];
  // kerja sampingan hanya menghasilkan uang kalau belum digaji klub
  const activity = career.plan.activity === 'kerja' && wage > 0 ? 0 : act.cost * econ;
  const income = allowance + wage + sponsor + (activity < 0 ? -activity : 0);
  const expense = round(coaches) + (activity > 0 ? activity : 0) + tax + living + lifestyle + agent;
  return {
    allowance,
    wage,
    sponsor,
    tax,
    living,
    lifestyle,
    agent,
    coaches: round(coaches),
    activity: round(activity),
    income: round(income),
    expense: round(expense),
    net: round(income - expense),
  };
}
