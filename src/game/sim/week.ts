// Satu minggu dalam hidup pemain: latihan, uang, stres, kebugaran, cedera,
// lalu event inbox. Semua acak memakai seed karakter + nomor minggu, jadi
// minggu yang sama dari save yang sama selalu memberi hasil yang sama.

import type { Career, Message, Player, WeekPlan, WeekReport, World } from '../types';
import type { CharacterRoll } from '../gen/character';
import { Rng, clamp } from '../rng';
import { addDays } from '../date';
import { ageOn } from '../gen/player';
import { ACTIVITY_INFO, COACH_INFO, INTENSITY_INFO, econOf, weeklyBudget } from './economy';
import { trainWeek } from './training';
import { EVENTS, EVENT_BY_ID, makeCtx } from './events';
import { playWeek, replacePlayer, rolloverLeagues, standings } from './season';
import { recentForm, userMatch } from './match';
import { TRANSFER_EVENTS, contractWeek } from './transfer';
import { RELATION_EVENTS, RELATION_EVENT_BY_ID, emptyRelations, relationStress, relationsWeek } from './relations';

const ALL_EVENTS = [...EVENTS, ...RELATION_EVENTS];

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
    matches: [],
    stats: [],
    ...careerDefaults(base.teamLabel, roll.clubId ?? undefined, !!roll.clubId, startDate),
    rel: emptyRelations(), // diisi initRelations saat karier dimulai (butuh data dunia)
  };
}

/** Field karier untuk transfer/kontrak (tahap 7) */
export function careerDefaults(team: string, clubId: string | undefined, academy: boolean, date: string) {
  return {
    agent: null,
    offers: [],
    loan: null,
    history: [{ clubId, team, from: date, kind: clubId ? (academy ? 'Akademi' : 'Senior') : 'Amatir' } as const],
    listed: false,
    wantsLoan: false,
    joined: date,
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
    matches: [],
    stats: [],
    ...careerDefaults(c.teamLabel, undefined, false, c.currentDate),
    rel: emptyRelations(),
    ...c,
  } as Career;
}

export const pendingChoices = (career: Career) =>
  career.inbox.filter((m) => m.choices?.length && m.chosen === undefined);

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
const withPlayer = replacePlayer;

/**
 * Titik yang dituju stres kalau rencana dan keadaan tidak berubah.
 * Setiap minggu stres bergerak 25% ke arah ini.
 */
export function stressTarget(career: Career, player: Player, clubCountry?: string) {
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
  // menit bermain dan performa 6 minggu terakhir
  const since = addDays(career.currentDate, -42);
  const recent = career.matches.filter((m) => m.date >= since && m.comp !== 'Amatir');
  if (player.contract && recent.length >= 3) {
    const starts = recent.filter((m) => m.status === 'Inti').length;
    if (starts === 0) parts.push(['Jarang dimainkan', 12]);
    else if (starts >= Math.ceil(recent.length * 0.7)) parts.push(['Main reguler', -6]);
  }
  const rated = career.matches.filter((m) => m.date >= since && m.rating !== undefined);
  const form = recentForm(career);
  if (form !== null && rated.length >= 3) {
    if (form >= 7.3) parts.push(['Performa bagus', -6]);
    else if (form <= 6.2) parts.push(['Performa buruk', 8]);
  }
  parts.push(...relationStress(career, player, clubCountry));
  if (player.personality.Pressure <= 7) parts.push(['Mudah tertekan', 10]);
  else if (player.personality.Pressure >= 16) parts.push(['Tahan tekanan', -5]);
  const target = clamp(parts.reduce((s, [, v]) => s + v, 0), 0, 100);
  return { target, parts };
}

function injure(career: Career, rng: Rng, notes: string[], where: 'latihan' | 'pertandingan') {
  const [name, min, max] = rng.weighted(INJURIES.map((x) => [x, x[3]] as const));
  const weeks = rng.int(min, max);
  career.injury = { name, weeksLeft: weeks };
  career.fitness = clamp(career.fitness - 15, 0, 100);
  notes.push(`Kamu cedera saat ${where}: ${name.toLowerCase()}, perkiraan absen ${weeks} minggu.`);
  career.inbox.unshift({
    id: `w${career.week}-injury-${where}`,
    date: addDays(career.currentDate, 7),
    from: 'Tim medis',
    title: `Cedera: ${name}`,
    body: `Kamu mengalami ${name.toLowerCase()} saat ${where} dan harus absen sekitar ${weeks} minggu. Selama cedera kamu tidak bisa berlatih atau bermain.`,
  });
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
  // pengalaman bertanding minggu lalu ikut membantu perkembangan
  const last = career.matches[0];
  if (last && last.date > addDays(career.currentDate, -7)) {
    if (last.minutes >= 60) extra *= 1.15;
    else if (last.minutes > 0) extra *= 1.05;
    else if (last.comp === 'Liga') extra *= 0.95;
  }
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
    if (rng.chance(chance)) injure(career, rng, notes, 'latihan');
  }

  // 4b. Pertandingan minggu ini: semua liga, lalu pemain kita
  const weekEnd = addDays(career.currentDate, 7);
  const week = playWeek(world, career.currentDate, weekEnd, new Rng(`${world.seed}:${weekEnd}`));
  let w: World = { ...world, seasons: week.seasons };
  const match = userMatch(w, career, player, week, rng.fork('match'));
  if (match) {
    career.matches.unshift(match);
    career.matches.length = Math.min(career.matches.length, 30);
    if (match.minutes > 0) {
      career.fitness = clamp(Math.round(career.fitness - match.minutes / 9), 0, 100);
      const good = (match.rating ?? 0) >= 7.5;
      const repChance = { Liga: 0.5, U19: 0.2, Amatir: 0.1 }[match.comp];
      if (good && rng.chance(repChance)) player.reputation.home = clamp(player.reputation.home + 1, 1, 100);
      if (match.motm && match.comp === 'Liga') player.reputation.home = clamp(player.reputation.home + 1, 1, 100);
      if (good && match.comp === 'Liga' && club) {
        const lrep = world.leagues.find((l) => l.id === club.leagueId)!.reputation;
        if (rng.chance(lrep / 250)) player.reputation.world = clamp(player.reputation.world + 1, 1, 100);
      }
      const proneness = Math.max(0.15, 1 + (player.hidden['Injury Proneness'] - 10) / 10);
      if (!career.injury && rng.chance(0.012 * (match.minutes / 90) * proneness)) injure(career, rng, notes, 'pertandingan');
    }
  }

  // 5. Stres bergerak perlahan ke "arah stres" minggu ini
  const clubCountry = player.contract ? w.clubs.find((c) => c.id === player.contract!.clubId)?.countryId : undefined;
  const target = stressTarget(career, player, clubCountry).target;
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
  career.currentDate = weekEnd;
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

  // Musim liga yang selesai minggu ini: juara, pemain AI berkembang/pensiun, jadwal baru
  w = withPlayer(w, player);
  if (week.finished.length) {
    const finished = w.seasons;
    const r = rolloverLeagues(w, week.finished, career.currentDate, new Rng(`${world.seed}:rollover:${career.currentDate}`));
    w = r.world;
    for (const h of r.honours) {
      const league = w.leagues.find((l) => l.id === h.leagueId)!;
      const mine = player.contract && w.clubs.find((c) => c.id === player.contract!.clubId)?.leagueId === league.id;
      if (!mine && league.countryId !== player.nationalityId) continue;
      const name = (id: string) => w.clubs.find((c) => c.id === id)!.name;
      let body = `${name(h.championId)} juara ${league.name} musim ${h.season}, ${name(h.runnerUpId)} di posisi kedua.`;
      if (mine) {
        const pos = standings(finished[league.id]).findIndex((r) => r.clubId === player.contract!.clubId) + 1;
        body += ` ${name(player.contract!.clubId)} finis di posisi ke-${pos}.`;
      }
      const rows = career.stats.filter((x) => x.season === h.season);
      const apps = rows.reduce((a, x) => a + x.apps, 0);
      if (apps) {
        const goals = rows.reduce((a, x) => a + x.goals, 0);
        const assists = rows.reduce((a, x) => a + x.assists, 0);
        const avg = rows.reduce((a, x) => a + x.ratingSum, 0) / apps;
        body += ` Musimmu: ${apps} kali main, ${goals} gol, ${assists} assist, rating rata-rata ${avg.toFixed(2)}.`;
      }
      career.inbox.unshift({
        id: `season-${h.leagueId}-${h.season}`,
        date: career.currentDate,
        from: league.name,
        title: `Musim ${h.season} selesai`,
        body,
      });
    }
  }

  // Kontrak, tawaran klub, pinjaman
  contractWeek(w, career, player, rng.fork('contract'));
  // Relasi: manajer, fans, rekan setim, pasangan
  w = relationsWeek(w, career, player, match, rng.fork('rel'));
  w = withPlayer(w, player);

  // 8. Event inbox
  const ctx = makeCtx(w, career, player, rng);
  const ready = (id: string, cd: number) => career.cooldowns[id] === undefined || career.week - career.cooldowns[id] >= cd;
  const burnout = EVENT_BY_ID.burnout;
  const picks: string[] = [];
  if (career.stress >= 90 && ready('burnout', burnout.cooldown)) picks.push('burnout');
  let slots = rng.chance(0.5) ? (rng.chance(0.15) ? 2 : 1) : 0;
  while (slots-- > 0) {
    const options = ALL_EVENTS.filter((e) => e.id !== 'burnout' && !picks.includes(e.id) && ready(e.id, e.cooldown))
      .map((e) => [e, e.weight(ctx)] as const)
      .filter(([, w]) => w > 0);
    if (!options.length) break;
    picks.push(rng.weighted(options).id);
  }
  for (const id of picks) {
    const def = EVENT_BY_ID[id] ?? RELATION_EVENT_BY_ID[id];
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
  return { world: w, career, report };
}

/** Pemain memilih jawaban untuk pesan di inbox */
export function resolveChoice(world: World, prev: Career, msgId: string, choice: number): { world: World; career: Career } {
  const career: Career = structuredClone(prev);
  const msg = career.inbox.find((m) => m.id === msgId);
  if (!msg || !msg.choices || msg.chosen !== undefined) return { world, career: prev };
  const def = msg.eventId ? (EVENT_BY_ID[msg.eventId] ?? TRANSFER_EVENTS[msg.eventId] ?? RELATION_EVENT_BY_ID[msg.eventId]) : undefined;
  const player: Player = structuredClone(world.players.find((p) => p.id === career.playerId)!);
  const rng = new Rng(`${career.characterSeed}:w${career.week}:${msgId}:${choice}`);
  const ctx = makeCtx(world, career, player, rng);
  msg.chosen = choice;
  msg.result = def?.resolve?.(ctx, choice, msg) || undefined;
  return { world: withPlayer(world, player), career };
}
