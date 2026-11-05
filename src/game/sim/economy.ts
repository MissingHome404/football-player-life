// Uang mingguan: uang saku keluarga, gaji, biaya pelatih pribadi dan kegiatan.
// Semua harga dasar dalam EUR "Eropa Barat", lalu dikali kekuatan ekonomi negara.

import { ECONOMY } from '../gen/character';
import { ageOn } from '../gen/player';
import type { Activity, Career, CoachKind, Intensity, Player, TrainingFocus } from '../types';

export const econOf = (countryId: string) => ECONOMY[countryId] ?? 0.5;

export const FOCUS_INFO: Record<TrainingFocus, { label: string; desc: string }> = {
  seimbang: { label: 'Seimbang', desc: 'Semua atribut berkembang sedikit-sedikit.' },
  teknik: { label: 'Teknik', desc: 'Fokus atribut technical (atau goalkeeping untuk kiper).' },
  mental: { label: 'Mental', desc: 'Fokus keputusan, posisi, dan ketenangan.' },
  fisik: { label: 'Fisik', desc: 'Fokus kecepatan, stamina, dan kekuatan. Lebih melelahkan.' },
  peran: { label: 'Peran', desc: 'Fokus atribut kunci peran favoritmu.' },
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
  pesta: { label: 'Pesta', desc: 'Stres turun drastis, tapi mahal, bikin capek, dan bisa jadi kebiasaan buruk.', cost: 80, stress: -20, fitness: -10 },
  video: { label: 'Analisis video sendiri', desc: 'Atribut mental berkembang lebih cepat, sedikit menambah stres.', cost: 0, stress: 5, fitness: 0 },
  kerja: { label: 'Kerja sampingan', desc: 'Dapat uang, tapi capek dan latihan kurang maksimal. Hanya kalau belum digaji klub.', cost: -45, stress: 10, fitness: -5 },
};

export const COACH_INFO: Record<CoachKind, { label: string; desc: string; cost: number }> = {
  teknik: { label: 'Pelatih teknik', desc: 'Latihan technical lebih efektif.', cost: 60 },
  fisik: { label: 'Pelatih fisik', desc: 'Latihan fisik lebih efektif, risiko cedera turun.', cost: 50 },
  mental: { label: 'Pelatih mental', desc: 'Latihan mental lebih efektif.', cost: 50 },
  psikolog: { label: 'Psikolog', desc: 'Arah stresmu turun banyak.', cost: 70 },
};

export const ALLOWANCE = { miskin: 8, menengah: 40, kaya: 200 } as const;

export const TAX_RATE = 0.3;
const LIVING_COST = 40; // biaya hidup mandiri per minggu, mulai umur 18

const round = (v: number) => Math.round(v * 100) / 100;

/** Perkiraan uang masuk dan keluar minggu ini sesuai rencana */
export function weeklyBudget(career: Career, player: Player) {
  const econ = econOf(player.nationalityId);
  const age = ageOn(player.birthDate, career.currentDate);
  const wage = player.contract?.wagePerWeek ?? 0;
  // uang saku keluarga berhenti saat sudah digaji layak oleh klub
  const fullAllowance = ALLOWANCE[career.family.wealth] * econ;
  const allowance = round(wage >= fullAllowance * 3 ? 0 : fullAllowance);
  const tax = round(wage * TAX_RATE);
  const living = round(age >= 18 ? LIVING_COST * econ : 0);
  let coaches = 0;
  for (const k of Object.keys(COACH_INFO) as CoachKind[]) {
    if (career.plan.coaches[k]) coaches += COACH_INFO[k].cost * econ;
  }
  const act = ACTIVITY_INFO[career.plan.activity];
  // kerja sampingan hanya menghasilkan uang kalau belum digaji klub
  const activity = career.plan.activity === 'kerja' && wage > 0 ? 0 : act.cost * econ;
  const income = allowance + wage + (activity < 0 ? -activity : 0);
  const expense = round(coaches) + (activity > 0 ? activity : 0) + tax + living;
  return {
    allowance,
    wage,
    tax,
    living,
    coaches: round(coaches),
    activity: round(activity),
    income: round(income),
    expense: round(expense),
    net: round(income - expense),
  };
}
