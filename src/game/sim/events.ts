// Event ala BitLife yang muncul di inbox. Setiap event punya syarat (bobot 0 = tidak
// bisa muncul), teks, pilihan, dan efek tiap pilihan. Teks pesan disimpan di save,
// efeknya dijalankan dari kode ini saat pemain memilih.

import type { Career, Club, Message, Player, World } from '../types';
import { Rng, clamp } from '../rng';
import { ageOn } from '../gen/player';
import { wageFor } from '../gen/world';
import { fullName } from '../gen/names';
import { personalityLabel } from '../gen/personality';
import { econOf } from './economy';
import { recentForm } from './match';
import { squadOf } from './season';
import { startSpell } from './transfer';
import { setMate } from './relations';
import { injuryPlanEvent } from './injury';

export interface EventCtx {
  world: World;
  career: Career;
  player: Player;
  club: Club | undefined;
  rng: Rng;
  age: number;
  econ: number;
  squadOf: (clubId: string) => Player[];
}

type NewMessage = Omit<Message, 'id' | 'date'>;

export interface EventDef {
  id: string;
  cooldown: number; // minggu
  weight: (c: EventCtx) => number;
  create: (c: EventCtx) => NewMessage;
  /** Jalankan efek pilihan, kembalikan teks hasil. */
  resolve?: (c: EventCtx, choice: number, msg: Message) => string;
}

const eur = (v: number) => `€${Math.round(v).toLocaleString('id-ID')}`;
const money = (c: EventCtx, base: number) => Math.max(1, Math.round(base * c.econ));

function addStress(c: EventCtx, d: number) {
  c.career.stress = clamp(Math.round(c.career.stress + d), 0, 100);
}
function addSupport(c: EventCtx, d: number) {
  c.career.family.support = clamp(c.career.family.support + d, 1, 20);
}
function addRep(c: EventCtx, d: number) {
  c.player.reputation.home = clamp(c.player.reputation.home + d, 1, 100);
}
function nudgePersonality(c: EventCtx, key: keyof Player['personality'], d: number, chance: number) {
  if (c.rng.chance(chance)) c.player.personality[key] = clamp(c.player.personality[key] + d, 1, 20);
}

/** Rata-rata CA tim U19 sebuah klub */
function youthLevel(c: EventCtx, clubId: string): number {
  const y = c.squadOf(clubId).filter((p) => p.isYouth && !p.isUser);
  return y.length ? y.reduce((s, p) => s + p.ca, 0) / y.length : 60;
}

/** CA pemain ke-18 di skuad senior (batas masuk skuad) */
function seniorCutoff(c: EventCtx, clubId: string): number {
  const s = c.squadOf(clubId)
    .filter((p) => !p.isYouth && !p.isUser)
    .map((p) => p.ca)
    .sort((a, b) => b - a);
  return s[Math.min(17, s.length - 1)] ?? 80;
}

/** Level yang dibutuhkan untuk lolos trial: U19 untuk remaja, ujung skuad senior untuk 19+ */
function trialLevel(c: EventCtx, clubId: string): number {
  return c.age >= 19 ? seniorCutoff(c, clubId) - 12 : youthLevel(c, clubId);
}

export const EVENTS: EventDef[] = [
  {
    id: 'scout_trial',
    cooldown: 6,
    weight: (c) => {
      if (c.player.contract) return 0;
      const domestic = c.world.clubs.filter((k) => k.countryId === c.player.nationalityId);
      const minLevel = Math.min(...domestic.map((k) => trialLevel(c, k.id)));
      // main bagus di tim amatir = lebih cepat dilirik scout
      const form = recentForm(c.career) ?? 6.5;
      const formBoost = 1 + Math.max(0, form - 6.5);
      return (c.player.ca >= minLevel - 15 ? 3 + (c.player.ca - minLevel) / 10 : 0.3) * formBoost;
    },
    create: (c) => {
      const domestic = c.world.clubs
        .filter((k) => k.countryId === c.player.nationalityId)
        .map((k) => ({ k, lvl: trialLevel(c, k.id) }))
        .sort((a, b) => a.lvl - b.lvl);
      // scout dari klub yang levelnya kira-kira sesuai, kadang sedikit di atas
      const fit = domestic.filter((x) => x.lvl <= c.player.ca + 15);
      const pick = c.rng.pick(fit.length ? fit : domestic.slice(0, 3)).k;
      const senior = c.age >= 19;
      return {
        from: `Scout ${pick.name}`,
        title: 'Undangan trial',
        body: `Seorang scout dari ${pick.name} menonton pertandinganmu akhir pekan lalu. Dia mengundangmu ikut trial seminggu bersama ${senior ? 'tim utama' : 'tim U19'} mereka.`,
        eventId: 'scout_trial',
        data: { clubId: pick.id },
        choices: [
          { label: 'Ikut trial', hint: senior ? 'Kalau lolos, kamu dikontrak tim utama' : 'Kalau lolos, kamu masuk akademi klub' },
          { label: 'Tolak dulu', hint: 'Belum merasa siap' },
        ],
      };
    },
    resolve: (c, choice, msg) => {
      const club = c.world.clubs.find((k) => k.id === msg.data!.clubId)!;
      if (choice === 1) {
        addStress(c, -2);
        return 'Kamu menolak dengan sopan. Mungkin akan ada kesempatan lain.';
      }
      const lvl = trialLevel(c, club.id);
      const chance = clamp(0.35 + (c.player.ca - lvl) / 30 + (c.career.fitness - 60) / 200, 0.05, 0.95);
      if (!c.rng.chance(chance)) {
        addStress(c, 8);
        return `Kamu belum lolos trial di ${club.name}. Pelatih mereka bilang kamu perlu berkembang lagi.`;
      }
      const year = Number(c.career.currentDate.slice(0, 4));
      c.career.teamLabel = club.name;
      c.career.joined = c.career.currentDate;
      c.career.signed = c.career.currentDate;
      startSpell(c.career, { clubId: club.id, team: club.name, from: c.career.currentDate, kind: c.age >= 19 ? 'Senior' : 'Akademi' });
      addStress(c, -10);
      addRep(c, 3);
      if (c.age >= 19) {
        const league = c.world.leagues.find((l) => l.id === club.leagueId)!;
        c.player.isYouth = false;
        c.player.contract = {
          clubId: club.id,
          wagePerWeek: Math.round(wageFor(c.player.ca, league, club.reputation) * 0.5),
          expires: `${year + 1}-06-30`,
          role: 'Pelapis',
        };
        return `Kamu lolos trial! ${club.name} memberimu kontrak satu musim sebagai pemain pelapis.`;
      }
      c.player.isYouth = true;
      c.player.contract = {
        clubId: club.id,
        wagePerWeek: c.age >= 16 ? Math.round(10 + club.reputation * 0.8) : 0,
        expires: `${year + 2}-06-30`,
        role: 'Pemain muda',
      };
      return `Kamu lolos trial! Mulai minggu depan kamu resmi pemain akademi ${club.name}.`;
    },
  },
  {
    id: 'first_team_call',
    cooldown: 8,
    weight: (c) => {
      if (!c.player.contract || !c.player.isYouth || c.age < 16) return 0;
      const form = recentForm(c.career) ?? 6.5;
      const margin = form >= 7.2 ? 10 : 6;
      return c.player.ca >= seniorCutoff(c, c.player.contract.clubId) - margin ? 6 : 0;
    },
    create: (c) => {
      const mgr = c.world.staff.find((s) => s.id === c.club?.managerId);
      return {
        from: mgr ? `${fullName(mgr)} (manajer)` : 'Manajer tim utama',
        title: 'Dipanggil ke tim utama',
        body: `Manajer ${c.club?.name} terkesan dengan perkembanganmu dan menawarkan kontrak profesional di skuad senior.`,
        eventId: 'first_team_call',
        choices: [
          { label: 'Tanda tangan kontrak', hint: 'Naik ke skuad senior, gaji naik' },
          { label: 'Tetap di U19 dulu', hint: 'Lebih banyak waktu berkembang' },
        ],
      };
    },
    resolve: (c, choice) => {
      if (choice === 1) return 'Kamu memilih tetap di U19. Manajer bilang pintu tetap terbuka.';
      const club = c.club!;
      const league = c.world.leagues.find((l) => l.id === club.leagueId)!;
      c.player.isYouth = false;
      c.player.contract = {
        clubId: club.id,
        wagePerWeek: wageFor(c.player.ca, league, club.reputation),
        expires: `${Number(c.career.currentDate.slice(0, 4)) + 3}-06-30`,
        role: 'Pemain muda',
      };
      addRep(c, 5);
      c.career.joined = c.career.currentDate;
      c.career.signed = c.career.currentDate;
      startSpell(c.career, { clubId: club.id, team: club.name, from: c.career.currentDate, kind: 'Senior' });
      addStress(c, -6);
      return `Resmi! Kamu sekarang pemain senior ${club.name} dengan gaji ${eur(c.player.contract.wagePerWeek)} per minggu.`;
    },
  },
  {
    id: 'family_money',
    cooldown: 10,
    weight: (c) => (c.career.family.wealth === 'kaya' ? 0 : c.career.family.wealth === 'miskin' ? 1.2 : 0.5),
    create: (c) => {
      const need = money(c, c.career.family.wealth === 'miskin' ? 60 : 150);
      return {
        from: 'Keluarga',
        title: 'Keluarga butuh bantuan',
        body: `Orang tuamu sedang kesulitan membayar tagihan bulan ini. Mereka butuh sekitar ${eur(need)}.`,
        eventId: 'family_money',
        data: { need },
        choices: [
          { label: `Bantu ${eur(need)}`, hint: 'Uang berkurang, keluarga makin mendukung' },
          { label: 'Belum bisa bantu', hint: 'Keluarga kecewa' },
        ],
      };
    },
    resolve: (c, choice, msg) => {
      const need = Number(msg.data!.need);
      if (choice === 0 && c.career.money >= need) {
        c.career.money -= need;
        addSupport(c, 2);
        addStress(c, -2);
        return 'Orang tuamu sangat berterima kasih.';
      }
      addSupport(c, -2);
      addStress(c, 4);
      return choice === 0
        ? 'Uangmu tidak cukup. Kamu merasa bersalah.'
        : 'Orang tuamu mengerti, tapi suasana di rumah jadi canggung.';
    },
  },
  {
    id: 'party_invite',
    cooldown: 8,
    weight: (c) => {
      const l = personalityLabel(c.player);
      return (l === 'Party Animal' ? 2.5 : 0.5) * (c.age >= 16 ? 1 : 0.3);
    },
    create: (c) => ({
      from: 'Teman',
      title: 'Ajakan pesta',
      body: 'Teman-temanmu mengadakan pesta akhir pekan ini dan memaksamu ikut. "Sekali-sekali lah!"',
      eventId: 'party_invite',
      data: { cost: money(c, 40) },
      choices: [
        { label: 'Ikut pesta', hint: 'Stres turun, kebugaran turun' },
        { label: 'Tolak', hint: 'Fokus ke latihan' },
      ],
    }),
    resolve: (c, choice, msg) => {
      if (choice === 1) {
        addStress(c, 2);
        nudgePersonality(c, 'Professionalism', 1, 0.1);
        return 'Kamu tetap di rumah. Teman-temanmu sedikit kecewa.';
      }
      const cost = Number(msg.data!.cost);
      if (c.career.money < cost) {
        addStress(c, 2);
        return 'Uangmu tidak cukup untuk ikut. Kamu menghabiskan akhir pekan di rumah.';
      }
      c.career.money -= cost;
      addStress(c, -8);
      c.career.fitness = clamp(c.career.fitness - 12, 0, 100);
      nudgePersonality(c, 'Professionalism', -1, 0.15);
      return 'Pestanya seru, tapi besoknya badanmu terasa berat.';
    },
  },
  {
    id: 'school_exam',
    cooldown: 12,
    weight: (c) => (c.age < 18 ? 1.2 : 0),
    create: () => ({
      from: 'Sekolah',
      title: 'Ujian sekolah',
      body: 'Minggu depan ada ujian sekolah. Orang tuamu ingin kamu belajar, tapi pelatih ingin kamu tetap latihan penuh.',
      eventId: 'school_exam',
      choices: [
        { label: 'Fokus belajar', hint: 'Keluarga senang, stres sedikit naik' },
        { label: 'Fokus bola', hint: 'Mental lebih kuat, keluarga kecewa' },
      ],
    }),
    resolve: (c, choice) => {
      if (choice === 0) {
        addSupport(c, 2);
        addStress(c, 3);
        return 'Nilai ujianmu lumayan. Orang tuamu bangga.';
      }
      addSupport(c, -2);
      c.career.progress.Determination = (c.career.progress.Determination ?? 0) + 0.5;
      return 'Kamu tetap latihan keras. Orang tuamu kurang senang dengan nilaimu.';
    },
  },
  {
    id: 'coach_praise',
    cooldown: 5,
    weight: (c) => (c.player.contract && c.career.plan.intensity !== 'ringan' && c.career.stress < 60 ? 1 : 0),
    create: () => ({
      from: 'Pelatih',
      title: 'Pujian dari pelatih',
      body: 'Pelatih memujimu di depan tim karena kerja kerasmu di latihan minggu ini.',
      eventId: 'coach_praise',
    }),
    resolve: (c) => {
      addStress(c, -4);
      return '';
    },
  },
  {
    id: 'viral_video',
    cooldown: 30,
    weight: (c) => 0.2 + c.player.technical.Dribbling / 40 + c.player.mental.Flair / 60,
    create: () => ({
      from: 'Media sosial',
      title: 'Videomu viral',
      body: 'Video skill-mu saat latihan diunggah teman dan ditonton ratusan ribu orang.',
      eventId: 'viral_video',
      choices: [
        { label: 'Nikmati ketenarannya', hint: 'Reputasi naik, tekanan naik' },
        { label: 'Tetap rendah hati', hint: 'Tidak banyak berubah' },
      ],
    }),
    resolve: (c, choice) => {
      if (choice === 0) {
        addRep(c, 4);
        addStress(c, 3);
        nudgePersonality(c, 'Controversy', 1, 0.2);
        return 'Pengikutmu bertambah banyak. Orang mulai mengenalimu di jalan.';
      }
      addRep(c, 1);
      nudgePersonality(c, 'Sportsmanship', 1, 0.2);
      return 'Kamu membalas komentar dengan sopan dan kembali fokus latihan.';
    },
  },
  {
    id: 'boot_sponsor',
    cooldown: 40,
    weight: (c) => (c.player.reputation.home >= 15 ? 0.8 : 0),
    create: (c) => ({
      from: 'Brand olahraga lokal',
      title: 'Tawaran sponsor sepatu',
      body: 'Sebuah brand olahraga lokal ingin kamu memakai sepatu mereka dan memberi bayaran kecil.',
      eventId: 'boot_sponsor',
      data: { pay: money(c, 120) },
      choices: [
        { label: 'Terima', hint: 'Dapat uang' },
        { label: 'Tolak', hint: 'Tunggu tawaran yang lebih besar' },
      ],
    }),
    resolve: (c, choice, msg) => {
      if (choice === 0) {
        c.career.money += Number(msg.data!.pay);
        return `Kontrak sponsor pertamamu! Kamu menerima ${eur(Number(msg.data!.pay))}.`;
      }
      return 'Kamu menolak. Semoga brand yang lebih besar datang.';
    },
  },
  {
    id: 'training_fight',
    cooldown: 16,
    weight: (c) => (c.player.personality.Temperament <= 8 ? 1.5 : 0.2),
    create: () => ({
      from: 'Latihan',
      title: 'Ribut saat latihan',
      body: 'Seorang rekan menekelmu terlalu keras di latihan. Emosimu memuncak dan kalian saling dorong.',
      eventId: 'training_fight',
      choices: [
        { label: 'Minta maaf duluan', hint: 'Masalah selesai' },
        { label: 'Biarkan saja', hint: 'Lega, tapi citramu turun' },
      ],
    }),
    resolve: (c, choice) => {
      if (choice === 0) {
        addStress(c, 1);
        nudgePersonality(c, 'Temperament', 1, 0.2);
        return 'Kalian berjabat tangan. Pelatih menghargai sikapmu.';
      }
      addStress(c, -2);
      addRep(c, -1);
      nudgePersonality(c, 'Temperament', -1, 0.15);
      return 'Suasana latihan jadi tegang selama beberapa hari.';
    },
  },
  {
    id: 'local_tournament',
    cooldown: 8,
    weight: (c) => (c.player.contract ? 0 : 1.5),
    create: (c) => ({
      from: 'Panitia turnamen',
      title: 'Turnamen antarkampung',
      body: 'Ada turnamen antarkampung bulan ini dengan hadiah uang. Biasanya ada scout yang datang menonton.',
      eventId: 'local_tournament',
      data: { prize: money(c, 60) },
      choices: [
        { label: 'Ikut turnamen', hint: 'Capek, tapi bisa dilirik scout' },
        { label: 'Lewatkan', hint: 'Fokus latihan sendiri' },
      ],
    }),
    resolve: (c, choice, msg) => {
      if (choice === 1) return 'Kamu melewatkan turnamen tahun ini.';
      c.career.fitness = clamp(c.career.fitness - 10, 0, 100);
      const win = c.rng.chance(clamp(0.2 + (c.player.ca - 50) / 100, 0.1, 0.7));
      if (win) {
        c.career.money += Number(msg.data!.prize);
        addRep(c, 3);
        addStress(c, -5);
        // turnamen bagus = scout datang lebih cepat
        delete c.career.cooldowns.scout_trial;
        return `Timmu juara dan kamu jadi salah satu pemain terbaik! Hadiahmu ${eur(Number(msg.data!.prize))}. Beberapa scout terlihat mencatat namamu.`;
      }
      addRep(c, 1);
      return 'Timmu tersingkir, tapi kamu bermain cukup baik.';
    },
  },
  {
    id: 'mentor_offer',
    cooldown: 26,
    weight: (c) => (c.player.contract ? 1 : 0),
    create: (c) => {
      const pool = c.squadOf(c.player.contract!.clubId).filter((p) => !p.isYouth && !p.isUser);
      const mentor = pool.sort((a, b) => b.personality.Professionalism - a.personality.Professionalism)[0];
      return {
        from: mentor ? fullName(mentor) : 'Pemain senior',
        title: 'Tawaran latihan tambahan',
        body: `${mentor ? fullName(mentor) : 'Seorang pemain senior'} melihat potensimu dan menawarkan latihan tambahan setelah sesi tim.`,
        eventId: 'mentor_offer',
        data: { mentorProf: mentor?.personality.Professionalism ?? 12, mentorId: mentor?.id ?? '' },
        choices: [
          { label: 'Terima', hint: 'Latihan ekstra, bisa ketularan profesional' },
          { label: 'Sungkan, tolak', hint: 'Tidak ada perubahan' },
        ],
      };
    },
    resolve: (c, choice, msg) => {
      if (choice === 1) return 'Kamu menolak dengan sopan.';
      const prof = Number(msg.data!.mentorProf);
      for (const a of ['Decisions', 'Composure', 'Positioning', 'Teamwork']) {
        c.career.progress[a] = (c.career.progress[a] ?? 0) + 0.35;
      }
      addStress(c, 2);
      if (prof > c.player.personality.Professionalism) nudgePersonality(c, 'Professionalism', 1, 0.4);
      const mentor = c.world.players.find((p) => p.id === msg.data!.mentorId);
      if (mentor) setMate(c.career, mentor, 'mentor', 35);
      return 'Latihan tambahannya berat, tapi kamu belajar banyak dari pengalamannya.';
    },
  },
  {
    id: 'burnout',
    cooldown: 6,
    weight: (c) => (c.career.stress >= 90 ? 50 : 0),
    create: () => ({
      from: 'Dirimu sendiri',
      title: 'Kamu kelelahan mental',
      body: 'Belakangan kamu susah tidur dan kehilangan semangat. Rasanya semua jadi beban.',
      eventId: 'burnout',
      choices: [
        { label: 'Ambil jeda seminggu', hint: 'Stres turun banyak, latihan minggu ini diganti istirahat' },
        { label: 'Paksakan terus', hint: 'Risiko cedera dan stres tetap tinggi' },
      ],
    }),
    resolve: (c, choice) => {
      if (choice === 0) {
        addStress(c, -25);
        c.career.plan = { ...c.career.plan, focus: 'istirahat', intensity: 'ringan' };
        return 'Kamu beristirahat total. Rencana latihan minggu ini diganti jadi Istirahat.';
      }
      c.career.fitness = clamp(c.career.fitness - 10, 0, 100);
      nudgePersonality(c, 'Pressure', 1, 0.2);
      return 'Kamu memaksakan diri. Semoga tubuhmu kuat.';
    },
  },
  // rencana pemulihan cedera (pesan dibuat oleh injury.ts, tidak muncul acak)
  injuryPlanEvent,
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

export function makeCtx(world: World, career: Career, player: Player, rng: Rng): EventCtx {
  const club = player.contract ? world.clubs.find((k) => k.id === player.contract!.clubId) : undefined;
  return {
    world,
    career,
    player,
    club,
    rng,
    age: ageOn(player.birthDate, career.currentDate),
    econ: econOf(player.nationalityId),
    squadOf: (clubId) => squadOf(world, clubId),
  };
}
