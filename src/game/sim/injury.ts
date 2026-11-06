// Cedera pemain kita: jenis dan bagian tubuh, rencana pemulihan (aman, cepat, fisioterapi),
// masa rawan setelah kembali, cedera kambuhan, dan bekas cedera berat.

import type { Career, Injury, InjuryPart, InjuryPlan, Player } from '../types';
import { clamp, type Rng } from '../rng';
import { addDays } from '../date';
import { ageOn } from '../gen/player';
import { econOf } from './economy';
import { lifeInjuryFactor } from './life';
import type { EventDef } from './events';

type Severity = NonNullable<Injury['severity']>;

/** [nama, bagian tubuh, minggu minimum, maksimum, bobot, tingkat] */
export const INJURIES: [name: string, part: InjuryPart, min: number, max: number, weight: number, severity: Severity][] = [
  ['Memar di paha', 'paha', 1, 2, 5, 'ringan'],
  ['Keseleo pergelangan kaki', 'pergelangan kaki', 2, 4, 4, 'ringan'],
  ['Cedera punggung', 'punggung', 1, 3, 1.5, 'ringan'],
  ['Cedera hamstring', 'hamstring', 3, 6, 3, 'sedang'],
  ['Cedera otot betis', 'betis', 2, 5, 3, 'sedang'],
  ['Cedera pangkal paha', 'pangkal paha', 2, 5, 2, 'sedang'],
  ['Cedera lutut ringan', 'lutut', 4, 8, 2, 'sedang'],
  ['Patah tulang kaki', 'kaki', 12, 20, 0.3, 'berat'],
  ['Robek ligamen lutut (ACL)', 'lutut', 24, 36, 0.25, 'berat'],
];

export const PLAN_INFO: Record<InjuryPlan, { label: string; speed: number; fragileWeeks: number; fragile: number; scar: number }> = {
  aman: { label: 'Pemulihan aman', speed: 1, fragileWeeks: 3, fragile: 1.5, scar: 0.15 },
  cepat: { label: 'Percepat kembali', speed: 0.7, fragileWeeks: 8, fragile: 3, scar: 0.45 },
  fisio: { label: 'Fisioterapi intensif', speed: 0.8, fragileWeeks: 3, fragile: 1.3, scar: 0.1 },
};

/** Biaya fisioterapi intensif untuk cedera ini */
export function physioCost(player: Player, weeks: number): number {
  return Math.round(Math.max(150, 140 * weeks) * econOf(player.nationalityId));
}

/** Pengali risiko cedera pemain kita: staf pribadi dan masa rawan setelah cedera */
export function injuryFactor(career: Career): number {
  const f = career.fragile && career.fragile.weeks > 0 ? career.fragile.factor : 1;
  return lifeInjuryFactor(career) * f;
}

/**
 * Pemain kita cedera. Masa rawan setelah cedera membuat cedera di bagian yang sama sering kambuh;
 * bagian tubuh yang pernah cedera dalam dua tahun terakhir juga lebih mudah cedera lagi.
 * Lama absen dipengaruhi Natural Fitness dan usia. Cedera 2 minggu atau lebih menunggu pilihan
 * rencana pemulihan dari tim medis.
 */
export function injure(career: Career, rng: Rng, where: 'latihan' | 'pertandingan', notes?: string[], player?: Player) {
  const since = addDays(career.currentDate, -730);
  const recent = new Set((career.injuries ?? []).filter((r) => r.date >= since).map((r) => r.part));
  const fragile = career.fragile && career.fragile.weeks > 0 ? career.fragile : undefined;
  let pick: (typeof INJURIES)[number];
  let relapse = false;
  if (fragile && rng.chance(0.6)) {
    const same = INJURIES.filter((x) => x[1] === fragile.part && x[5] !== 'berat');
    pick = same.length ? rng.pick(same) : rng.weighted(INJURIES.map((x) => [x, x[4]] as const));
    relapse = true;
  } else {
    pick = rng.weighted(INJURIES.map((x) => [x, x[4] * (recent.has(x[1]) ? 2 : 1)] as const));
    relapse = recent.has(pick[1]) && pick[5] !== 'berat' && rng.chance(0.5);
  }
  const [base, part, min, max, , severity] = pick;
  const age = player ? ageOn(player.birthDate, career.currentDate) : 25;
  const nf = player?.physical['Natural Fitness'] ?? 10;
  let weeks = rng.int(min, max) * (1 + Math.max(0, age - 29) * 0.04) * (1.1 - nf * 0.01) * (relapse ? 1.3 : 1);
  weeks = Math.max(1, Math.round(weeks));
  const name = relapse ? `${base} (kambuh)` : base;
  career.injury = { name, weeksLeft: weeks, weeks, part, severity };
  career.fragile = undefined;
  career.fitness = clamp(career.fitness - 15, 0, 100);
  (career.injuries ??= []).unshift({ name, part, date: career.currentDate, weeks, where, severity });
  career.injuries.length = Math.min(career.injuries.length, 30);
  // cedera berat dan cedera kambuhan membuat tubuh lebih rawan cedera di masa depan
  if (player && (severity === 'berat' || relapse)) {
    player.hidden['Injury Proneness'] = clamp(player.hidden['Injury Proneness'] + 1, 1, 20);
  }
  notes?.push(`Kamu cedera saat ${where}: ${name.toLowerCase()}, perkiraan absen ${weeks} minggu.`);
  const msg = {
    id: `w${career.week}-injury-${where}`,
    date: addDays(career.currentDate, 7),
    from: 'Tim medis',
    title: `Cedera: ${name}`,
    body:
      `Kamu mengalami ${name.toLowerCase()} saat ${where} dan harus absen sekitar ${weeks} minggu. Selama cedera kamu tidak bisa berlatih atau bermain.` +
      (relapse ? ' Cedera ini kambuh karena bagian yang sama belum benar-benar pulih.' : ''),
  };
  if (weeks < 2) {
    career.inbox.unshift(msg);
    return;
  }
  const cost = player ? physioCost(player, weeks) : Math.max(150, 140 * weeks);
  const fast = Math.max(1, Math.round(weeks * PLAN_INFO.cepat.speed));
  const physio = Math.max(1, Math.round(weeks * PLAN_INFO.fisio.speed));
  career.inbox.unshift({
    ...msg,
    body: msg.body + ' Bagaimana kamu mau menjalani pemulihan?',
    eventId: 'injury_plan',
    data: { cost, weeks },
    choices: [
      { label: 'Pemulihan aman sesuai jadwal tim medis', hint: `${weeks} minggu, risiko kambuh kecil` },
      {
        label: 'Paksakan kembali lebih cepat',
        hint: `±${fast} minggu, rawan kambuh selama 2 bulan${severity === 'berat' ? ', bisa meninggalkan bekas permanen' : ''}`,
      },
      { label: `Fisioterapi intensif (€${cost.toLocaleString('id-ID')})`, hint: `±${physio} minggu, risiko normal` },
    ],
  });
}

export const injuryPlanEvent: EventDef = {
  id: 'injury_plan',
  cooldown: 0,
  weight: () => 0,
  create: () => ({ from: 'Tim medis', title: 'Cedera', body: '' }),
  resolve: (c, choice, msg) => {
    const inj = c.career.injury;
    if (!inj) return 'Kamu sudah pulih.';
    let plan: InjuryPlan = choice === 1 ? 'cepat' : choice === 2 ? 'fisio' : 'aman';
    let extra = '';
    if (plan === 'fisio') {
      const cost = Number(msg.data?.cost ?? 0);
      if (c.career.money < cost) {
        plan = 'aman';
        extra = 'Uangmu tidak cukup untuk fisioterapi intensif, jadi kamu menjalani pemulihan biasa. ';
      } else c.career.money = Math.round((c.career.money - cost) * 100) / 100;
    }
    inj.plan = plan;
    const total = inj.weeks ?? inj.weeksLeft;
    inj.weeksLeft = Math.max(1, Math.min(inj.weeksLeft, Math.round(total * PLAN_INFO[plan].speed)));
    if (plan === 'cepat') {
      return `${extra}Kamu memaksakan diri ikut latihan pemulihan ekstra. Perkiraan kembali dalam ${inj.weeksLeft} minggu, tapi tubuhmu akan rawan cedera beberapa minggu setelahnya.`;
    }
    if (plan === 'fisio') return `Kamu menjalani fisioterapi intensif. Perkiraan kembali dalam ${inj.weeksLeft} minggu.`;
    return `${extra}Kamu mengikuti jadwal tim medis. Perkiraan kembali dalam ${inj.weeksLeft} minggu.`;
  },
};

const SCAR_ATTRS = ['Pace', 'Acceleration', 'Agility'] as const;

/**
 * Seminggu pemulihan. Saat sembuh dimulai masa rawan (lebih lama kalau dipaksakan), dan cedera berat
 * bisa meninggalkan bekas permanen (Pace, Acceleration, atau Agility turun).
 */
export function recoverWeek(career: Career, player: Player, rng: Rng, notes: string[]) {
  if (career.fragile && career.fragile.weeks > 0 && !career.injury) {
    career.fragile.weeks -= 1;
    if (career.fragile.weeks <= 0) career.fragile = undefined;
  }
  const inj = career.injury;
  if (!inj) return;
  inj.weeksLeft -= 1;
  if (inj.weeksLeft > 0) return;
  const plan = inj.plan ?? 'aman';
  const info = PLAN_INFO[plan];
  notes.push(`Kamu sudah pulih dari ${inj.name.toLowerCase()}.`);
  career.injury = null;
  if (inj.part) career.fragile = { weeks: info.fragileWeeks, factor: info.fragile, part: inj.part };
  if (inj.severity !== 'berat') return;
  const age = ageOn(player.birthDate, career.currentDate);
  if (!rng.chance(clamp(info.scar + Math.max(0, age - 28) * 0.03, 0, 0.9))) return;
  const lost: string[] = [];
  for (const key of rng.shuffle([...SCAR_ATTRS]).slice(0, rng.chance(0.4) ? 2 : 1)) {
    const d = rng.chance(0.3) ? 2 : 1;
    if (player.physical[key] <= 1) continue;
    player.physical[key] = clamp(player.physical[key] - d, 1, 20);
    lost.push(`${key} -${d}`);
  }
  if (!lost.length) return;
  notes.push(`Cedera beratmu meninggalkan bekas: ${lost.join(', ')}.`);
  career.inbox.unshift({
    id: `w${career.week}-injury-scar`,
    date: career.currentDate,
    from: 'Tim medis',
    title: 'Bekas cedera',
    body: `Kamu sudah bisa bermain lagi, tapi ${inj.name.toLowerCase()} meninggalkan bekas permanen: ${lost.join(', ')}.${plan === 'cepat' ? ' Memaksakan diri kembali lebih cepat ikut berperan.' : ''}`,
  });
}

/** Sifat bawaan yang terlihat di profil pemain */
export function innateTraits(p: Player): { label: string; desc: string }[] {
  const out: { label: string; desc: string }[] = [];
  const strong = Math.max(p.leftFoot, p.rightFoot);
  const weak = Math.min(p.leftFoot, p.rightFoot);
  if (weak >= 14) out.push({ label: 'Dua kaki sama baik', desc: 'Menembak dan mengumpan dengan kaki mana pun hampir sama akuratnya.' });
  else {
    const side = p.leftFoot >= p.rightFoot ? 'kiri' : 'kanan';
    out.push({
      label: `Kaki ${side}`,
      desc:
        weak <= 6
          ? `Hampir tidak pernah memakai kaki ${side === 'kiri' ? 'kanan' : 'kiri'}: tembakan dan umpan dengan kaki lemah sering meleset.`
          : `Kaki ${side === 'kiri' ? 'kanan' : 'kiri'} lumayan, tapi tidak sebaik kaki ${side}.`,
    });
  }
  if (strong < 12) out.push({ label: 'Teknik kaki biasa', desc: 'Kaki terkuatnya pun tidak istimewa.' });
  if (p.heightCm >= 188) out.push({ label: 'Jangkung', desc: `${p.heightCm} cm: unggul dalam duel udara dan sundulan.` });
  else if (p.heightCm <= 172) out.push({ label: 'Pendek', desc: `${p.heightCm} cm: sering kalah duel udara dari pemain jangkung.` });
  const prone = p.hidden['Injury Proneness'];
  if (prone >= 14) out.push({ label: 'Rawan cedera', desc: 'Tubuhnya lebih mudah cedera dari pemain lain.' });
  else if (prone <= 6) out.push({ label: 'Tahan cedera', desc: 'Jarang sekali cedera.' });
  return out;
}

/** Hari ini masih masa rawan setelah cedera? (untuk tampilan) */
export const isFragile = (career: Career) => !!career.fragile && career.fragile.weeks > 0;
