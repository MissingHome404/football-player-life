// Perkembangan atribut mingguan. Poin latihan dibagi ke atribut sesuai fokus,
// lalu terkumpul di career.progress. Atribut naik 1 setiap progress-nya mencapai 1.
// Pemain tidak bisa melewati PA (potensi).

import { GOALKEEPING, MENTAL, PHYSICAL, POSITION_LABEL, TECHNICAL, type VisibleAttr } from '../data/attributes';
import { POSITION_ROLES, ROLES } from '../data/roles';
import { attrWeight, computeCA, ageOn } from '../gen/player';
import type { Career, Club, Player } from '../types';
import { INTENSITY_INFO, coachBoostOf } from './economy';
import { familiarity } from './formation';
import { clamp, type Rng } from '../rng';

/** atribut membaca permainan: dilatih lewat fokus latihan "Taktik" */
const TACTIC_ATTRS = new Set(['Decisions', 'Teamwork', 'Anticipation', 'Positioning', 'Off the Ball']);

const GROUP_OF: Record<string, 'technical' | 'mental' | 'physical' | 'goalkeeping'> = {};
for (const a of TECHNICAL) GROUP_OF[a] = 'technical';
for (const a of MENTAL) GROUP_OF[a] = 'mental';
for (const a of PHYSICAL) GROUP_OF[a] = 'physical';
for (const a of GOALKEEPING) GROUP_OF[a] = 'goalkeeping';

export function getAttr(p: Player, a: string): number {
  return (p[GROUP_OF[a]] as Record<string, number>)[a];
}
export function setAttr(p: Player, a: string, v: number) {
  (p[GROUP_OF[a]] as Record<string, number>)[a] = v;
}

/** Kualitas latihan 1-5: fasilitas klub, atau level tim amatir */
export function trainingQuality(career: Career, player: Player, club: Club | undefined): number {
  if (club) return player.isYouth ? Math.max(club.facilities.youth, club.facilities.training - 1) : club.facilities.training;
  return career.origin === 'ssb' ? 2 : 1;
}

/** Posisi yang perannya boleh dilatih: posisi baru yang sedang dipelajari, atau posisi utama */
export function rolePosition(career: Career, player: Player) {
  const learn = career.plan.learnPos;
  return learn && learn !== player.mainPosition ? learn : player.mainPosition;
}

/** Peran yang boleh dipilih di fokus latihan "Peran" */
export const roleChoices = (career: Career, player: Player): string[] => POSITION_ROLES[rolePosition(career, player)];

/** Peran yang benar-benar dilatih minggu ini (pilihanmu kalau cocok dengan posisinya) */
export function trainingRole(career: Career, player: Player): string {
  const choices = roleChoices(career, player);
  const pick = career.plan.trainRole;
  if (pick && choices.includes(pick)) return pick;
  if (choices.includes(player.preferredRole)) return player.preferredRole;
  return choices[0];
}

export function ageFactor(age: number): number {
  if (age <= 17) return 1.3;
  if (age <= 20) return 1.15;
  if (age <= 23) return 1;
  if (age <= 26) return 0.7;
  if (age <= 29) return 0.4;
  return 0.15;
}

export interface TrainingResult {
  changes: Record<string, number>;
  caBefore: number;
  caAfter: number;
  points: number;
}

/**
 * Jalankan latihan satu minggu. Mengubah `player` dan `career.progress` langsung
 * (pemanggil harus memberi salinan).
 */
export function trainWeek(
  career: Career,
  player: Player,
  club: Club | undefined,
  extraMultiplier: number,
): TrainingResult {
  const caBefore = player.ca;
  const changes: Record<string, number> = {};
  const plan = career.plan;
  if (plan.focus === 'istirahat' || career.injury) {
    return { changes, caBefore, caAfter: caBefore, points: 0 };
  }
  const age = ageOn(player.birthDate, career.currentDate);
  const gap = Math.max(0, player.pa - player.ca) / 200;
  if (gap <= 0) return { changes, caBefore, caAfter: caBefore, points: 0 };

  const quality = trainingQuality(career, player, club);
  const mentality = 0.7 + ((player.personality.Professionalism + player.mental.Determination) / 40) * 0.6;
  const stressF = career.stress > 85 ? 0.4 : career.stress > 70 ? 0.6 : career.stress > 50 ? 0.85 : 1;
  const fitnessF = career.fitness < 30 ? 0.6 : career.fitness < 50 ? 0.85 : 1;
  // Makin dekat ke PA, makin lambat (mendekati potensi secara perlahan)
  const points =
    1.05 *
    Math.min(1, gap * 2.5) *
    ageFactor(age) *
    (0.6 + 0.15 * quality) *
    INTENSITY_INFO[plan.intensity].growth *
    mentality *
    stressF *
    fitnessF *
    extraMultiplier;

  // Bobot tiap atribut sesuai fokus
  const isGK = player.mainPosition === 'GK';
  const role = ROLES[trainingRole(career, player)];
  const roleKey = new Set<string>(role.key);
  const rolePref = new Set<string>(role.pref);
  const candidates: VisibleAttr[] = [...TECHNICAL, ...MENTAL, ...PHYSICAL, ...(isGK ? GOALKEEPING : [])];
  const coachBoost = (a: string) => {
    const g = GROUP_OF[a];
    if (g === 'technical' || g === 'goalkeeping') return coachBoostOf(career, 'teknik');
    if (g === 'physical') return coachBoostOf(career, 'fisik');
    if (g === 'mental') return coachBoostOf(career, 'mental');
    return 1;
  };
  const focusMatch = (a: string) => {
    const g = GROUP_OF[a];
    switch (plan.focus) {
      case 'teknik':
        return isGK ? g === 'goalkeeping' : g === 'technical';
      case 'mental':
        return g === 'mental';
      case 'fisik':
        return g === 'physical';
      case 'peran':
        return roleKey.has(a) || rolePref.has(a);
      case 'taktik':
        return TACTIC_ATTRS.has(a);
      default:
        return false;
    }
  };

  const weights: [string, number][] = [];
  let total = 0;
  for (const a of candidates) {
    if (getAttr(player, a) >= 20) continue;
    let w = Math.max(0.3, attrWeight(player.mainPosition, a));
    if (roleKey.has(a)) w += 1.5;
    else if (rolePref.has(a)) w += 0.6;
    if (plan.focus !== 'seimbang') w *= focusMatch(a) ? 4 : 0.6;
    weights.push([a, w]);
    total += w;
  }
  if (!total) return { changes, caBefore, caAfter: caBefore, points: 0 };

  for (const [a, w] of weights) {
    const v = getAttr(player, a);
    // makin tinggi atributnya, makin susah naik
    const cost = v >= 10 ? 1 + (v - 10) / 8 : 1;
    // atribut fisik sulit naik setelah 24 tahun
    const physAge = GROUP_OF[a] === 'physical' && age >= 24 ? 0.4 : 1;
    // pelatih pribadi dan analisis video menambah poin (bukan cuma menggeser)
    const boost = coachBoost(a) * (plan.activity === 'video' && GROUP_OF[a] === 'mental' ? 1.4 : 1);
    career.progress[a] = (career.progress[a] ?? 0) + ((points * w) / total / cost) * physAge * boost;
  }

  // Terapkan kenaikan, dari progress terbesar, sambil menjaga CA <= PA
  const ready = Object.entries(career.progress)
    .filter(([, v]) => v >= 1)
    .sort((x, y) => y[1] - x[1]);
  for (const [a] of ready) {
    while (career.progress[a] >= 1) {
      const v = getAttr(player, a);
      if (v >= 20) {
        career.progress[a] = 0;
        break;
      }
      setAttr(player, a, v + 1);
      const ca = computeCA(player);
      if (ca > player.pa) {
        setAttr(player, a, v); // sudah mentok di potensi
        career.progress[a] = 0.99;
        break;
      }
      career.progress[a] -= 1;
      changes[a] = (changes[a] ?? 0) + 1;
    }
  }
  player.ca = clamp(computeCA(player), 1, 200);
  return { changes, caBefore, caAfter: player.ca, points };
}

/**
 * Penurunan karena usia (dipanggil saat ulang tahun, mulai 31 tahun): fisik turun paling cepat,
 * teknik sedikit, mental hampir tidak. Natural Fitness yang tinggi memperlambatnya.
 * Hasilnya daftar atribut yang turun.
 */
export function ageDecline(p: Player, age: number, rng: Rng): Record<string, number> {
  const changes: Record<string, number> = {};
  if (age < 31) return changes;
  const nf = p.physical['Natural Fitness'];
  const drop = Math.min(12, (age - 30) * rng.float(0.8, 1.8)) * (1.25 - nf / 40) * (p.mainPosition === 'GK' ? 0.6 : 1);
  const d = drop / 11.5;
  const groups: [readonly string[], number][] = [
    [TECHNICAL, 0.8],
    [MENTAL, 0.2],
    [PHYSICAL, 1.8],
    ...(p.mainPosition === 'GK' ? ([[GOALKEEPING, 0.9]] as [readonly string[], number][]) : []),
  ];
  for (const [keys, mult] of groups) {
    for (const a of keys) {
      const v = d * mult;
      const n = Math.floor(v) + (rng.next() < v - Math.floor(v) ? 1 : 0);
      if (!n) continue;
      const before = getAttr(p, a);
      const after = clamp(before - n, 1, 20);
      if (after === before) continue;
      setAttr(p, a, after);
      changes[a] = after - before;
    }
  }
  p.ca = clamp(computeCA(p), 1, 200);
  return changes;
}

/**
 * Latihan posisi baru: keakraban naik pelan-pelan (lebih cepat kalau Versatility tinggi dan latihan berat).
 * Mengubah `player` dan `career` langsung. Mengembalikan true kalau posisinya sudah dikuasai penuh.
 */
export function learnPositionWeek(career: Career, player: Player, notes?: string[]): boolean {
  const pos = career.plan.learnPos;
  if (!pos || career.injury || career.plan.focus === 'istirahat' || pos === player.mainPosition) return false;
  const key = `pos:${pos}`;
  const rate = (0.2 + player.hidden.Versatility / 50) * INTENSITY_INFO[career.plan.intensity].growth;
  career.progress[key] = (career.progress[key] ?? 0) + rate;
  let fam = familiarity(player, pos);
  while (career.progress[key] >= 1 && fam < 20) {
    career.progress[key] -= 1;
    fam += 1;
  }
  player.positions = { ...player.positions, [pos]: fam };
  if (fam >= 20) {
    delete career.progress[key];
    career.plan = { ...career.plan, learnPos: null };
    notes?.push(`Kamu sekarang menguasai posisi ${POSITION_LABEL[pos].toLowerCase()} sepenuhnya.`);
    career.inbox.unshift({
      id: `w${career.week}-pos-${pos}`,
      date: career.currentDate,
      from: 'Staf pelatih',
      title: `Posisi baru dikuasai: ${POSITION_LABEL[pos]}`,
      body: `Latihan posisimu berhasil. Pelatih sekarang bisa memainkanmu sebagai ${POSITION_LABEL[pos].toLowerCase()} tanpa penurunan performa.`,
    });
    return true;
  }
  return false;
}
