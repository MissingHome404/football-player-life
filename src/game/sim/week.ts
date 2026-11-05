// Satu minggu dalam hidup pemain: latihan, uang, stres, kebugaran, cedera,
// lalu event inbox. Semua acak memakai seed karakter + nomor minggu, jadi
// minggu yang sama dari save yang sama selalu memberi hasil yang sama.

import type { Career, Message, Player, WeekPlan, WeekReport, World } from '../types';
import type { CharacterRoll } from '../gen/character';
import { Rng, clamp } from '../rng';
import { ageOn } from '../gen/player';
import { wageFor } from '../gen/world';
import { ACTIVITY_INFO, COACH_INFO, INTENSITY_INFO, econOf, weeklyBudget } from './economy';
import { trainWeek } from './training';
import { EVENTS, EVENT_BY_ID, makeCtx } from './events';

export const DEFAULT_PLAN: WeekPlan = {
  focus: 'seimbang',
  intensity: 'normal',
  activity: 'rumah',
  coaches: { teknik: false, fisik: false, mental: false, psikolog: false },
};

const INBOX_LIMIT = 60;

export function welcomeMessage(career: Pick<Career, 'teamLabel' | 'currentDate'>, hasClub: boolean): Message {
  return {
    id: 'welcome',
    date: career.currentDate,
    from: 'Football Player Life',
    title: 'Selamat datang di kariermu',
    body: hasClub
      ? `Kamu memulai karier di ${career.teamLabel}. Atur rencana latihan dan kegiatan minggu ini, lalu tekan "Lanjut minggu". Kerja keras, jaga stres, dan tunggu kesempatan masuk tim utama.`
      : `Kamu memulai dari ${career.teamLabel}. Belum ada klub profesional yang meliriknya. Latihan yang rajin, ikut turnamen, dan tunggu scout datang. Tekan "Lanjut minggu" untuk memulai.`,
  };
}

export function newCareer(roll: CharacterRoll, rerolls: number, saveId: string, startDate: string): Career {
  const base = {
    saveId,
    characterSeed: roll.seed,
    rerolls,
    playerId: roll.player.id,
    origin: roll.origin,
    family: { ...roll.family },
    money: roll.money,
    stress: roll.stress,
    teamLabel: roll.teamLabel,
    scoutPA: roll.scoutPA,
    currentDate: startDate,
  };
  return {
    ...base,
    week: 0,
    fitness: 85,
    injury: null,
    plan: structuredClone(DEFAULT_PLAN),
    progress: {},
    inbox: [welcomeMessage(base, !!roll.clubId)],
    lastReport: null,
    cooldowns: {},
  };
}

/** Lengkapi karier dari save lama (format 1) dengan nilai bawaan */
export function migrateCareer(c: Partial<Career> & Pick<Career, 'teamLabel' | 'currentDate'>, hasClub: boolean): Career {
  return {
    week: 0,
    fitness: 85,
    injury: null,
    plan: structuredClone(DEFAULT_PLAN),
    progress: {},
    inbox: [welcomeMessage(c, hasClub)],
    lastReport: null,
    cooldowns: {},
    ...c,
  } as Career;
}

export const pendingChoices = (career: Career) =>
  career.inbox.filter((m) => m.choices?.length && m.chosen === undefined);

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const INJURIES: [name: string, min: number, max: number, weight: number][] = [
  ['Memar di paha', 1, 2, 5],
  ['Keseleo pergelangan kaki', 2, 4, 4],
  ['Cedera hamstring', 3, 6, 3],
  ['Cedera otot betis', 2, 5, 3],
  ['Cedera lutut ringan', 4, 8, 2],
  ['Patah tulang kaki', 12, 20, 0.3],
  ['Robek ligamen lutut (ACL)', 24, 36, 0.25],
];

/** Ganti pemain kita di dunia dengan salinan yang sudah diubah */
function withPlayer(world: World, player: Player): World {
  const players = world.players.slice();
  const i = players.findIndex((p) => p.id === player.id);
  players[i] = player;
  return { ...world, players };
}

/**
 * Titik yang dituju stres kalau rencana dan keadaan tidak berubah.
 * Setiap minggu stres bergerak 25% ke arah ini.
 */
export function stressTarget(career: Career, player: Player) {
  const plan = career.plan;
  const age = ageOn(player.birthDate, career.currentDate);
  const parts: [string, number][] = [['Kehidupan sehari-hari', 30]];
  if (plan.focus === 'istirahat') parts.push(['Istirahat dari latihan', -12]);
  else if (INTENSITY_INFO[plan.intensity].stress) {
    parts.push([`Latihan ${INTENSITY_INFO[plan.intensity].label.toLowerCase()}`, INTENSITY_INFO[plan.intensity].stress]);
  }
  const kerjaPaid = plan.activity === 'kerja' && !!player.contract?.wagePerWeek;
  const act = ACTIVITY_INFO[kerjaPaid ? 'rumah' : plan.activity];
  parts.push([act.label, act.stress]);
  if (!player.contract && age >= 17) parts.push(['Belum punya klub', 15]);
  const fam = Math.round(-(career.family.support - 10) * 1.5);
  if (fam) parts.push([fam < 0 ? 'Dukungan keluarga' : 'Keluarga kurang mendukung', fam]);
  if (plan.coaches.psikolog) parts.push(['Psikolog', -15]);
  if (career.injury) parts.push(['Cedera', 15]);
  if (career.money < 0) parts.push(['Uang minus', 20]);
  if (player.personality.Pressure <= 7) parts.push(['Mudah tertekan', 10]);
  else if (player.personality.Pressure >= 16) parts.push(['Tahan tekanan', -5]);
  const target = clamp(parts.reduce((s, [, v]) => s + v, 0), 0, 100);
  return { target, parts };
}

export interface WeekResult {
  world: World;
  career: Career;
  report: WeekReport;
}

export function advanceWeek(world: World, prev: Career): WeekResult {
  if (pendingChoices(prev).length) throw new Error('Masih ada pesan yang menunggu keputusanmu.');
  const career: Career = structuredClone(prev);
  const original = world.players.find((p) => p.id === career.playerId)!;
  const player: Player = structuredClone(original);
  const rng = new Rng(`${career.characterSeed}:w${career.week}`);
  const club = player.contract ? world.clubs.find((k) => k.id === player.contract!.clubId) : undefined;
  const notes: string[] = [];
  const moneyBefore = career.money;
  const stressBefore = career.stress;
  const ageBefore = ageOn(player.birthDate, career.currentDate);
  const plan = career.plan;
  const resting = plan.focus === 'istirahat';

  // 1. Uang. Kalau tidak cukup, pelatih pribadi dan kegiatan berbayar dibatalkan.
  let budget = weeklyBudget(career, player);
  if (career.money + budget.net < 0) {
    const coaches = (Object.keys(plan.coaches) as (keyof WeekPlan['coaches'])[]).filter((k) => plan.coaches[k]);
    if (coaches.length) {
      for (const k of coaches) plan.coaches[k] = false;
      notes.push(`Uangmu tidak cukup, jadi ${coaches.map((k) => COACH_INFO[k].label.toLowerCase()).join(', ')} dihentikan.`);
    }
    budget = weeklyBudget(career, player);
    if (career.money + budget.net < 0 && budget.activity > 0) {
      notes.push(`Uangmu tidak cukup untuk ${ACTIVITY_INFO[plan.activity].label.toLowerCase()}, jadi kamu di rumah saja.`);
      plan.activity = 'rumah';
      budget = weeklyBudget(career, player);
    }
  }
  career.money = Math.round((career.money + budget.net) * 100) / 100;

  // 2. Latihan
  let extra = 1;
  if (plan.activity === 'kerja' && !player.contract?.wagePerWeek) extra *= 0.85;
  if (plan.activity === 'pesta') extra *= 0.9;
  const training = trainWeek(career, player, club, extra);

  // 3. Kebugaran
  const act = ACTIVITY_INFO[plan.activity];
  const kerjaCounts = !(plan.activity === 'kerja' && player.contract?.wagePerWeek);
  if (career.injury) {
    career.fitness = clamp(career.fitness + (career.fitness < 60 ? 6 : -4), 0, 100);
  } else {
    const recovery = 12 + player.physical['Natural Fitness'] / 2;
    const load = resting ? 18 : INTENSITY_INFO[plan.intensity].fitness;
    career.fitness = clamp(Math.round(career.fitness + load + recovery + (kerjaCounts ? act.fitness : 0)), 0, 100);
  }

  // 4. Cedera
  if (career.injury) {
    career.injury.weeksLeft -= 1;
    if (career.injury.weeksLeft <= 0) {
      notes.push(`Kamu sudah pulih dari ${career.injury.name.toLowerCase()}.`);
      career.injury = null;
    }
  } else if (!resting) {
    const proneness = 1 + (player.hidden['Injury Proneness'] - 10) / 10;
    const chance =
      0.008 *
      INTENSITY_INFO[plan.intensity].injury *
      Math.max(0.15, proneness) *
      (career.fitness < 40 ? 2 : 1) *
      (career.fitness < 20 ? 1.5 : 1) *
      (plan.coaches.fisik ? 0.7 : 1);
    if (rng.chance(chance)) {
      const [name, min, max] = rng.weighted(INJURIES.map((x) => [x, x[3]] as const));
      const weeks = rng.int(min, max);
      career.injury = { name, weeksLeft: weeks };
      career.fitness = clamp(career.fitness - 15, 0, 100);
      notes.push(`Kamu cedera saat latihan: ${name.toLowerCase()}, perkiraan absen ${weeks} minggu.`);
      career.inbox.unshift({
        id: `w${career.week}-injury`,
        date: addDays(career.currentDate, 7),
        from: 'Tim medis',
        title: `Cedera: ${name}`,
        body: `Kamu mengalami ${name.toLowerCase()} dan harus absen sekitar ${weeks} minggu. Selama cedera kamu tidak bisa berlatih.`,
      });
    }
  }

  // 5. Stres bergerak perlahan ke "arah stres" minggu ini
  const target = stressTarget(career, player).target;
  career.stress = clamp(Math.round(career.stress + (target - career.stress) * 0.25 + rng.normal(0, 2)), 0, 100);

  // 6. Efek kecil dari kegiatan
  if (plan.activity === 'keluarga' && rng.chance(0.25)) {
    career.family.support = clamp(career.family.support + 1, 1, 20);
  }
  if (plan.activity === 'pesta' && rng.chance(0.06)) {
    player.personality.Professionalism = clamp(player.personality.Professionalism - 1, 1, 20);
  }

  // 7. Kalender
  career.week += 1;
  career.currentDate = addDays(career.currentDate, 7);
  const ageNow = ageOn(player.birthDate, career.currentDate);
  if (ageNow > ageBefore) {
    const gift = Math.round({ miskin: 10, menengah: 60, kaya: 500 }[career.family.wealth] * econOf(player.nationalityId));
    career.money += gift;
    career.inbox.unshift({
      id: `bday-${career.currentDate.slice(0, 4)}`,
      date: career.currentDate,
      from: 'Keluarga',
      title: `Selamat ulang tahun ke-${ageNow}!`,
      body: `Keluargamu merayakan ulang tahunmu yang ke-${ageNow} dan memberi hadiah €${gift.toLocaleString('id-ID')}.`,
    });
  }

  // Kontrak habis: untuk sekarang diperpanjang otomatis (bursa transfer menyusul).
  // Pemain akademi yang sudah 19 tahun naik ke skuad senior sebagai pelapis.
  if (player.contract && club && player.contract.expires <= career.currentDate) {
    const year = Number(career.currentDate.slice(0, 4));
    if (player.isYouth && ageNow >= 19) {
      const league = world.leagues.find((l) => l.id === club.leagueId)!;
      player.isYouth = false;
      player.contract = {
        clubId: club.id,
        wagePerWeek: Math.round(wageFor(player.ca, league, club.reputation) * 0.6),
        expires: `${year + 2}-06-30`,
        role: 'Pelapis',
      };
      career.inbox.unshift({
        id: `w${career.week}-promoted`,
        date: career.currentDate,
        from: club.name,
        title: 'Naik ke skuad senior',
        body: `Kamu sudah terlalu tua untuk tim U19. ${club.name} memberimu kontrak senior sebagai pemain pelapis sampai ${player.contract.expires}, gaji €${player.contract.wagePerWeek.toLocaleString('id-ID')} per minggu.`,
      });
    } else {
      player.contract.expires = `${year + (player.isYouth ? 1 : 2)}-06-30`;
      career.inbox.unshift({
        id: `w${career.week}-renew`,
        date: career.currentDate,
        from: club.name,
        title: 'Kontrak diperpanjang',
        body: `${club.name} memperpanjang kontrakmu sampai ${player.contract.expires}.`,
      });
    }
  }

  // 8. Event inbox
  const updated = withPlayer(world, player);
  const ctx = makeCtx(updated, career, player, rng);
  const ready = (id: string, cd: number) => career.cooldowns[id] === undefined || career.week - career.cooldowns[id] >= cd;
  const burnout = EVENT_BY_ID.burnout;
  const picks: string[] = [];
  if (career.stress >= 90 && ready('burnout', burnout.cooldown)) picks.push('burnout');
  let slots = rng.chance(0.5) ? (rng.chance(0.15) ? 2 : 1) : 0;
  while (slots-- > 0) {
    const options = EVENTS.filter((e) => e.id !== 'burnout' && !picks.includes(e.id) && ready(e.id, e.cooldown))
      .map((e) => [e, e.weight(ctx)] as const)
      .filter(([, w]) => w > 0);
    if (!options.length) break;
    picks.push(rng.weighted(options).id);
  }
  for (const id of picks) {
    const def = EVENT_BY_ID[id];
    const msg: Message = { id: `w${career.week}-${id}`, date: career.currentDate, ...def.create(ctx) };
    career.cooldowns[id] = career.week;
    if (!msg.choices?.length && def.resolve) msg.result = def.resolve(ctx, 0, msg) || undefined;
    career.inbox.unshift(msg);
  }

  // Batasi isi inbox, tapi jangan buang pesan yang belum dijawab
  if (career.inbox.length > INBOX_LIMIT) {
    let keep = INBOX_LIMIT;
    career.inbox = career.inbox.filter((m) => (m.choices?.length && m.chosen === undefined) || keep-- > 0);
  }

  const report: WeekReport = {
    date: career.currentDate,
    attrChanges: training.changes,
    caBefore: training.caBefore,
    caAfter: player.ca,
    moneyDelta: Math.round((career.money - moneyBefore) * 100) / 100,
    stressDelta: career.stress - stressBefore,
    fitness: career.fitness,
    notes,
  };
  career.lastReport = report;
  return { world: updated, career, report };
}

/** Pemain memilih jawaban untuk pesan di inbox */
export function resolveChoice(world: World, prev: Career, msgId: string, choice: number): { world: World; career: Career } {
  const career: Career = structuredClone(prev);
  const msg = career.inbox.find((m) => m.id === msgId);
  if (!msg || !msg.choices || msg.chosen !== undefined) return { world, career: prev };
  const def = msg.eventId ? EVENT_BY_ID[msg.eventId] : undefined;
  const player: Player = structuredClone(world.players.find((p) => p.id === career.playerId)!);
  const rng = new Rng(`${career.characterSeed}:w${career.week}:${msgId}:${choice}`);
  const ctx = makeCtx(world, career, player, rng);
  msg.chosen = choice;
  msg.result = def?.resolve?.(ctx, choice, msg) || undefined;
  return { world: withPlayer(world, player), career };
}
