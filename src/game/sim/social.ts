// Media sosial dan sponsor: pengikut yang tumbuh dari reputasi dan penampilan, postingan mingguan,
// citra di mata publik, kontroversi, dan kontrak sponsor dari merek fiktif.

import type { Career, MatchRecord, Player, PostType, Social, SponsorDeal } from '../types';
import { clamp, type Rng } from '../rng';
import { addDays } from '../date';
import { econOf } from './economy';
import type { EventDef } from './events';

export const POST_INFO: Record<PostType, { label: string; desc: string; reach: number; image: number; risk: number; stress: number }> = {
  tidak: { label: 'Tidak posting', desc: 'Pengikut tumbuh lebih lambat, tidak ada risiko.', reach: 0.85, image: 0, risk: 0, stress: 0 },
  latihan: { label: 'Konten latihan', desc: 'Citra profesional naik pelan.', reach: 1, image: 0.4, risk: 0.002, stress: 0 },
  pribadi: { label: 'Kehidupan pribadi', desc: 'Lebih banyak pengikut, sedikit melepas stres, kadang mengundang gosip.', reach: 1.25, image: 0.2, risk: 0.012, stress: -1 },
  fans: { label: 'Interaksi dengan fans', desc: 'Citra naik, fans makin sayang.', reach: 1.1, image: 0.5, risk: 0.003, stress: 0 },
  provokatif: { label: 'Komentar pedas', desc: 'Pengikut melonjak, tapi citra turun dan sering jadi kontroversi.', reach: 1.6, image: -1.5, risk: 0.07, stress: 1 },
};
export const POST_TYPES = Object.keys(POST_INFO) as PostType[];

/** Merek fiktif per kategori: [nama, tingkat minimum] */
const BRANDS: Record<string, string[]> = {
  'Sepatu bola': ['Garuda Strike', 'Vortex Boots', 'Kilau Sport'],
  Minuman: ['Kilat Energi', 'Segar Murni', 'Nusa Kopi'],
  Jam: ['Zenit Time', 'Arloji Satria'],
  Ponsel: ['Orbit Mobile', 'Nova Phone'],
  Mobil: ['Aurora Motors', 'Rajawali Auto'],
  Pakaian: ['Batik Muda', 'Urban Lane'],
};
export const SPONSOR_CATEGORIES = Object.keys(BRANDS);
const TIERS = [
  { id: 'lokal', label: 'lokal', min: 0, mult: 1 },
  { id: 'nasional', label: 'nasional', min: 30_000, mult: 1.6 },
  { id: 'global', label: 'global', min: 600_000, mult: 2.6 },
] as const;
/** maksimal kontrak sponsor sekaligus */
export const MAX_DEALS = 3;

export function emptySocial(player: Player): Social {
  const f = Math.round(followerTarget(player, undefined) * 0.5);
  return { followers: f, peak: f, image: 60, posts: [], deals: [], scandals: 0 };
}

export function socialOf(career: Career, player: Player): Social {
  return (career.social ??= emptySocial(player));
}

/** Jumlah pengikut yang "pantas" untuk reputasimu (dikejar pelan-pelan) */
export function followerTarget(player: Player, career: Career | undefined): number {
  const r = player.reputation;
  const trophies = Math.min(10, career?.trophies?.length ?? 0);
  return (200 * Math.exp(r.world / 9) + 100 * Math.exp(r.home / 12)) * (1 + trophies * 0.05);
}

/** 12.345 -> "12,3 rb" */
export function fmtFollowers(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (n >= 1e3) return `${(n / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 1 })} rb`;
  return String(Math.round(n));
}

const TEXT: Record<Exclude<PostType, 'tidak'>, string[]> = {
  latihan: ['Kerja keras hari ini 💪', 'Satu sesi lagi selesai. Terus berkembang!', 'Recovery day 🧊', 'Fokus ke laga berikutnya.'],
  pribadi: ['Akhir pekan santai bersama orang tersayang ❤️', 'Kopi pagi sebelum latihan ☕', 'Jalan-jalan sebentar 🌴', 'Main game dulu sebentar 🎮'],
  fans: ['Terima kasih atas dukungannya, kalian luar biasa! 🙏', 'Tanya jawab dengan fans malam ini 🎤', 'Tanda tangan untuk fans kecil di tempat latihan ✍️'],
  provokatif: ['Wasit minggu ini? No comment 🙄', 'Ada yang bilang aku lambat. Lihat saja nanti.', 'Rival kami harus belajar banyak 😏'],
};

/** Teks postingan: momen laga minggu ini lebih menarik dari konten biasa */
function postText(type: Exclude<PostType, 'tidak'>, games: MatchRecord[], rng: Rng): string {
  const played = games.filter((g) => g.minutes > 0);
  const goals = played.reduce((a, g) => a + g.goals, 0);
  const last = played[0];
  if (type !== 'provokatif' && last && rng.chance(0.7)) {
    if (goals >= 2) return `${goals} gol minggu ini! Terima kasih tim 🔥`;
    if (goals === 1) return `GOL! Senang bisa membantu tim ⚽`;
    if (last.score[0] > last.score[1]) return `Kemenangan penting melawan ${last.opponent} 👏`;
    if (last.score[0] < last.score[1]) return 'Bukan hasil yang kami mau. Kita bangkit minggu depan.';
  }
  return rng.pick(TEXT[type]);
}

/**
 * Seminggu di media sosial: pengikut mengejar target dari reputasi (lebih cepat kalau aktif posting dan
 * tampil bagus), postingan baru, citra bergerak, kontroversi, tawaran dan berakhirnya kontrak sponsor.
 */
export function socialWeek(career: Career, player: Player, games: MatchRecord[], rng: Rng, notes: string[]) {
  const s = socialOf(career, player);
  const type: PostType = career.plan.post ?? 'tidak';
  const info = POST_INFO[type];
  const played = games.filter((g) => g.minutes > 0);
  // momen besar: gol, man of the match, laga timnas dan kontinental
  let boost = 0;
  for (const g of played) {
    boost += g.goals * 0.004 + (g.motm ? 0.005 : 0) + (g.comp === 'Timnas' ? 0.006 : g.comp === 'Kontinental' ? 0.003 : 0);
  }
  const target = followerTarget(player, career) * info.reach * (0.7 + s.image / 200);
  const rate = target > s.followers ? 0.04 : 0.01;
  let f = s.followers + (target - s.followers) * rate + s.followers * boost;
  // postingan
  if (type !== 'tidak') {
    const viral = rng.chance(type === 'provokatif' ? 0.08 : 0.03);
    if (viral) f *= 1.03;
    const likes = Math.round(f * rng.float(0.03, 0.08) * (viral ? 5 : 1));
    s.posts.unshift({ date: career.currentDate, type, text: postText(type, games, rng), likes, viral: viral || undefined });
    s.posts.length = Math.min(s.posts.length, 12);
    if (info.stress) career.stress = clamp(career.stress + info.stress, 0, 100);
  }
  s.followers = Math.max(50, Math.round(f));
  s.peak = Math.max(s.peak, s.followers);
  // citra: kembali pelan ke 60, gaya posting dan profesionalisme menggeser
  const pro = (player.personality.Professionalism - 10) * 0.03;
  s.image = clamp(s.image + (60 - s.image) * 0.04 + info.image + pro, 0, 100);
  // kontroversi
  const risk = info.risk * Math.max(0.3, 1 + (player.personality.Controversy - 10) / 8) * Math.max(0.5, 1 - (player.personality.Temperament - 10) / 20);
  if (risk > 0 && rng.chance(risk)) controversy(career, s, type, rng);
  sponsorsWeek(career, player, s, rng, notes);
}

function controversy(career: Career, s: Social, type: PostType, rng: Rng) {
  const what =
    type === 'provokatif'
      ? rng.pick(['komentarmu tentang wasit', 'sindiranmu ke klub rival', 'balasan kasarmu ke seorang fans'])
      : rng.pick(['foto pestamu yang tersebar', 'gosip tentang kehidupan pribadimu', 'video lama yang diunggah ulang']);
  s.scandals += 1;
  s.image = clamp(s.image - 6, 0, 100);
  career.inbox.unshift({
    id: `w${career.week}-controversy`,
    date: career.currentDate,
    from: 'Media sosial',
    title: 'Kontroversi di media sosial',
    body: `Warganet ramai membicarakan ${what}. Media mulai bertanya. Apa yang kamu lakukan?`,
    eventId: 'social_controversy',
    choices: [
      { label: 'Minta maaf secara terbuka', hint: 'citra sedikit pulih, stres naik' },
      { label: 'Diam dan tunggu reda', hint: 'citra turun' },
      { label: 'Balas lebih keras', hint: 'pengikut naik, citra anjlok, bisa didenda klub' },
    ],
  });
}

export const controversyEvent: EventDef = {
  id: 'social_controversy',
  cooldown: 0,
  weight: () => 0,
  create: () => ({ from: 'Media sosial', title: 'Kontroversi', body: '' }),
  resolve: (c, choice) => {
    const s = socialOf(c.career, c.player);
    if (choice === 0) {
      s.image = clamp(s.image + 4, 0, 100);
      s.followers = Math.round(s.followers * 0.99);
      c.career.stress = clamp(c.career.stress + 4, 0, 100);
      return 'Permintaan maafmu diterima sebagian besar orang. Beritanya cepat reda.';
    }
    if (choice === 1) {
      s.image = clamp(s.image - 6, 0, 100);
      return 'Kamu memilih diam. Beritanya reda perlahan, tapi namamu sempat jelek.';
    }
    s.followers = Math.round(s.followers * 1.05);
    s.image = clamp(s.image - 15, 0, 100);
    const wage = c.player.contract?.wagePerWeek ?? 0;
    if (wage > 0 && c.rng.chance(0.4)) {
      const fine = Math.round(wage * 100) / 100;
      c.career.money = Math.round((c.career.money - fine) * 100) / 100;
      return `Perang kata-katamu makin ramai. Pengikutmu bertambah, tapi klub mendendamu sebesar gaji seminggu (€${fine.toLocaleString('id-ID')}).`;
    }
    return 'Perang kata-katamu makin ramai. Pengikutmu bertambah, tapi citramu anjlok.';
  },
};

/** Nilai kontrak sponsor per minggu (EUR) */
export function sponsorValue(followers: number, tier: number, image: number, econ: number): number {
  // pasar iklan negara kaya membayar lebih per pengikut
  return Math.round(Math.max(25 * econ, followers * 0.0025 * TIERS[tier].mult * (0.5 + econ / 2)) * (0.6 + image / 150));
}

function sponsorsWeek(career: Career, player: Player, s: Social, rng: Rng, notes: string[]) {
  const today = career.currentDate;
  // kontrak berakhir, atau diputus karena citra buruk
  for (const d of [...s.deals]) {
    const ended = d.until <= today;
    const dropped = !ended && s.image < 25 && rng.chance(0.3);
    if (!ended && !dropped) continue;
    s.deals = s.deals.filter((x) => x !== d);
    notes.push(ended ? `Kontrak sponsor ${d.brand} berakhir.` : `${d.brand} memutus kontrak sponsormu karena citramu buruk.`);
    if (dropped) {
      career.inbox.unshift({
        id: `w${career.week}-sponsor-drop-${d.brand}`,
        date: today,
        from: d.brand,
        title: 'Kontrak sponsor diputus',
        body: `${d.brand} memutus kontrak ${d.category.toLowerCase()} denganmu karena kontroversi belakangan ini.`,
      });
    }
  }
  // tawaran baru (maksimal satu tawaran menunggu jawaban)
  if (s.deals.length >= MAX_DEALS || s.image < 35 || s.followers < 1500) return;
  if (career.inbox.some((m) => m.eventId === 'sponsor_offer' && m.chosen === undefined)) return;
  const chance = clamp(0.02 + Math.log10(s.followers / 1500) * 0.03, 0.02, 0.15);
  if (!rng.chance(chance)) return;
  const free = SPONSOR_CATEGORIES.filter((c) => !s.deals.some((d) => d.category === c));
  if (!free.length) return;
  const category = rng.pick(free);
  const brand = rng.pick(BRANDS[category]);
  const global = player.reputation.world >= 60;
  const tier = TIERS.reduce((best, t, i) => (s.followers >= t.min && (t.id !== 'global' || global) ? i : best), 0);
  const weekly = sponsorValue(s.followers, tier, s.image, econOf(player.nationalityId));
  const weeks = rng.pick([26, 52, 104]);
  career.inbox.unshift({
    id: `w${career.week}-sponsor-${brand}`,
    date: today,
    from: brand,
    title: `Tawaran sponsor: ${brand}`,
    body: `${brand} (${category.toLowerCase()}, merek ${TIERS[tier].label}) ingin menjadikanmu duta merek selama ${weeks} minggu dengan bayaran €${weekly.toLocaleString('id-ID')} per minggu.`,
    eventId: 'sponsor_offer',
    data: { brand, category, weekly, weeks, tier },
    choices: [
      { label: 'Terima', hint: `+€${weekly.toLocaleString('id-ID')} / minggu` },
      { label: 'Minta bayaran lebih tinggi', hint: '+25% kalau setuju, tapi mereka bisa mundur' },
      { label: 'Tolak' },
    ],
  });
}

export const sponsorOfferEvent: EventDef = {
  id: 'sponsor_offer',
  cooldown: 0,
  weight: () => 0,
  create: () => ({ from: 'Sponsor', title: 'Tawaran sponsor', body: '' }),
  resolve: (c, choice, msg) => {
    const d = msg.data ?? {};
    const brand = String(d.brand);
    if (choice === 2) return `Kamu menolak tawaran ${brand}.`;
    let weekly = Number(d.weekly);
    if (choice === 1) {
      if (!c.rng.chance(0.55)) return `${brand} tidak setuju dengan permintaanmu dan membatalkan tawarannya.`;
      weekly = Math.round(weekly * 1.25);
    }
    const s = socialOf(c.career, c.player);
    if (s.deals.length >= MAX_DEALS || s.deals.some((x) => x.category === d.category)) return 'Kamu sudah punya sponsor di kategori ini.';
    const deal: SponsorDeal = {
      brand,
      category: String(d.category),
      weekly,
      until: addDays(c.career.currentDate, Number(d.weeks) * 7),
      tier: Number(d.tier),
    };
    s.deals.push(deal);
    return `Kamu resmi jadi duta ${brand}: €${weekly.toLocaleString('id-ID')} per minggu sampai ${deal.until}.`;
  },
};

/** Pemasukan sponsor per minggu */
export const sponsorIncome = (career: Career) => (career.social?.deals ?? []).reduce((a, d) => a + d.weekly, 0);

export const tierLabel = (t: number) => TIERS[t]?.label ?? 'lokal';
