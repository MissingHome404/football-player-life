// Kehidupan dan belanja: tempat tinggal, barang (sepatu, alat, aksesori, kendaraan),
// staf pribadi, kegiatan sekali bayar (liburan, bantu orang tua, amal), dan tabungan.
// Setiap pengeluaran punya efek yang jelas, dan gaya hidup mahal susah diturunkan.

import type { Career, CoachLevel, Life, Player, World } from '../types';
import { clamp } from '../rng';
import { addDays } from '../date';
import { ageOn, computeCA } from '../gen/player';
import { COACH_TIERS, econOf, levelOf, tierCost } from './economy';
import { getAttr, setAttr } from './training';
import { addFans, addMedia, addPartner } from './relations';
import { replacePlayer } from './season';

export type HouseId = Life['house'];
export const HOUSES: Record<HouseId, { label: string; desc: string; cost: number; stress: number; fitness: number; rank: number }> = {
  ortu: { label: 'Tinggal dengan orang tua', desc: 'Gratis. Setelah umur 21 mulai terasa sempit.', cost: 0, stress: 0, fitness: 0, rank: 0 },
  kos: { label: 'Kos sederhana', desc: 'Murah, tapi sempit dan bising.', cost: 40, stress: 2, fitness: 0, rank: 1 },
  apartemen: { label: 'Apartemen', desc: 'Nyaman dan dekat tempat latihan.', cost: 150, stress: -3, fitness: 1, rank: 2 },
  rumah: { label: 'Rumah', desc: 'Lega dan tenang, istirahat lebih berkualitas.', cost: 400, stress: -5, fitness: 2, rank: 3 },
  mewah: { label: 'Rumah mewah', desc: 'Kolam renang, ruang pemulihan, citra bintang di media.', cost: 1500, stress: -8, fitness: 3, rank: 4 },
};

export type ItemKind = 'sepatu' | 'alat' | 'aksesori' | 'kendaraan';
export interface ItemDef {
  id: string;
  kind: ItemKind;
  label: string;
  desc: string;
  price: number;
  local?: boolean; // harga ikut ekonomi negaramu
  attrs?: Record<string, number>; // bonus atribut permanen, sekali saat dibeli (barang lama)
  /** perubahan atribut selama dipakai (bisa plus atau minus); hilang lagi saat dilepas/dijual */
  mods?: Record<string, number>;
  fitness?: number; // per minggu
  stress?: number; // selama dipakai
  media?: number; // sekali saat dibeli
  upkeep?: number; // biaya perawatan per minggu
  needHouse?: number; // minimal rank rumah
  color: string; // warna di model 3D
}

export const ITEMS: ItemDef[] = [
  { id: 'sepatu_biasa', kind: 'sepatu', label: 'Sepatu bola biasa', desc: 'Sepatu pertamamu.', price: 40, local: true, color: '#1d1f24' },
  { id: 'sepatu_pro', kind: 'sepatu', label: 'Sepatu pro', desc: 'Ringan dan pas di kaki.', price: 220, attrs: { 'First Touch': 1 }, color: '#ff6a1a' },
  { id: 'sepatu_elite', kind: 'sepatu', label: 'Sepatu elite', desc: 'Dibuat khusus untuk kakimu.', price: 850, attrs: { Finishing: 1, Technique: 1 }, color: '#e8c84a' },
  { id: 'sepatu_speed', kind: 'sepatu', label: 'Sepatu speed', desc: 'Super ringan untuk sprint, tapi tipis dan kurang kokoh saat duel.', price: 600, mods: { Acceleration: 1, Pace: 1, Strength: -1 }, color: '#39e0ff' },
  { id: 'sepatu_kontrol', kind: 'sepatu', label: 'Sepatu kontrol', desc: 'Kulit lembut, bola terasa lengket. Sedikit lebih berat.', price: 550, mods: { 'First Touch': 1, Dribbling: 1, Acceleration: -1 }, color: '#7a3cff' },
  { id: 'sepatu_baja', kind: 'sepatu', label: 'Sepatu stud besi', desc: 'Pijakan mantap di rumput basah, tapi kaki terasa berat.', price: 450, mods: { Strength: 1, Balance: 1, Agility: -1 }, color: '#5b6273' },
  { id: 'sepatu_finisher', kind: 'sepatu', label: 'Sepatu finisher', desc: 'Zona tendangan diperbesar. Umpan pendek jadi kurang terasa.', price: 1800, mods: { Finishing: 2, 'Long Shots': 1, Passing: -1 }, color: '#ff2d55' },
  { id: 'sepatu_maestro', kind: 'sepatu', label: 'Sepatu maestro', desc: 'Untuk pengatur serangan: umpan presisi, tendangan kurang bertenaga.', price: 1500, mods: { Passing: 1, Technique: 1, Crossing: 1, 'Long Shots': -1 }, color: '#ffffff' },
  { id: 'sepatu_tembok', kind: 'sepatu', label: 'Sepatu bertahan', desc: 'Stud panjang untuk menekel dan duel udara. Kurang lincah.', price: 700, mods: { Tackling: 1, 'Jumping Reach': 1, Dribbling: -1 }, color: '#1f6f3f' },
  { id: 'sepatu_legenda', kind: 'sepatu', label: 'Sepatu edisi legenda', desc: 'Edisi terbatas buatan tangan, sempurna di segala hal.', price: 15000, mods: { Finishing: 1, 'First Touch': 1, Technique: 1, Dribbling: 1, Passing: 1 }, color: '#b8860b' },
  { id: 'sarung_pro', kind: 'alat', label: 'Sarung tangan kiper pro', desc: 'Grip lebih lengket.', price: 180, attrs: { Handling: 1 }, color: '#3fbf7f' },
  { id: 'recovery', kind: 'alat', label: 'Alat recovery', desc: 'Pijat, es, dan kompresi setiap malam.', price: 350, fitness: 3, color: '#5aa0ff' },
  { id: 'gym', kind: 'alat', label: 'Gym di rumah', desc: 'Butuh rumah atau rumah mewah.', price: 2500, attrs: { Strength: 1 }, fitness: 2, needHouse: 3, color: '#888' },
  { id: 'ikat_kepala', kind: 'aksesori', label: 'Ikat kepala', desc: 'Gaya klasik pemain bintang.', price: 12, local: true, color: '#f2f2f2' },
  { id: 'gelang', kind: 'aksesori', label: 'Gelang keberuntungan', desc: 'Pemberian ibu. Bikin tenang di depan gawang.', price: 30, local: true, mods: { Composure: 1 }, stress: -1, color: '#c0392b' },
  { id: 'kaus_grip', kind: 'aksesori', label: 'Kaus kaki grip', desc: 'Kaki tidak bergeser di dalam sepatu.', price: 80, mods: { Balance: 1, Agility: 1 }, color: '#f2f2f2' },
  { id: 'deker_pro', kind: 'aksesori', label: 'Deker karbon', desc: 'Pelindung kaki ringan: berani masuk duel, sedikit membatasi gerak.', price: 150, mods: { Bravery: 1, Acceleration: -1 }, color: '#222831' },
  { id: 'headphone', kind: 'aksesori', label: 'Headphone mahal', desc: 'Fokus penuh sebelum laga, tapi kamu jadi menyendiri di ruang ganti.', price: 450, mods: { Concentration: 1, Teamwork: -1 }, media: 1, color: '#111111' },
  { id: 'jam_pintar', kind: 'aksesori', label: 'Jam pintar olahraga', desc: 'Memantau detak jantung dan beban latihan.', price: 350, mods: { 'Work Rate': 1 }, fitness: 1, color: '#2d3240' },
  { id: 'kacamata', kind: 'aksesori', label: 'Kacamata desainer', desc: 'Gaya bintang film. Kamu jadi agak malas berlari.', price: 1200, mods: { 'Work Rate': -1 }, media: 2, stress: -1, color: '#0b0b0b' },
  { id: 'anting', kind: 'aksesori', label: 'Anting berlian', desc: 'Berkilau di setiap foto, tapi pikiranmu sering ke mana-mana.', price: 7000, mods: { Concentration: -1 }, media: 4, stress: -2, color: '#e8f4ff' },
  { id: 'jam', kind: 'aksesori', label: 'Jam tangan mewah', desc: 'Media suka memotretnya.', price: 4000, media: 4, stress: -1, color: '#d9b44a' },
  { id: 'kalung', kind: 'aksesori', label: 'Kalung emas', desc: 'Mencolok di setiap foto.', price: 2500, media: 2, stress: -1, color: '#e8c84a' },
  { id: 'motor', kind: 'kendaraan', label: 'Motor', desc: 'Tidak perlu naik angkot lagi.', price: 900, local: true, stress: -1, upkeep: 2, color: '#c0392b' },
  { id: 'mobil', kind: 'kendaraan', label: 'Mobil keluarga', desc: 'Nyaman untuk keluarga dan pasangan.', price: 15000, stress: -2, upkeep: 15, color: '#d8dde6' },
  { id: 'sport', kind: 'kendaraan', label: 'Mobil sport', desc: 'Semua mata menoleh.', price: 95000, stress: -4, upkeep: 90, media: 3, color: '#e23b3b' },
  { id: 'super', kind: 'kendaraan', label: 'Supercar', desc: 'Simbol bintang dunia.', price: 320000, stress: -6, upkeep: 300, media: 6, color: '#f2c200' },
];
export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export type SubId = 'suplemen' | 'gizi' | 'fisio';
/**
 * Staf pribadi. Ahli gizi dan fisio punya tingkatan (amatir, profesional, world class): efek per tingkat
 * ada di larik [amatir, profesional, world class]; biaya dasar = tingkat profesional.
 */
export const SUBS: Record<SubId, { label: string; desc: string; cost: number; tiered: boolean; fitness: number[]; injury: number[]; heal?: number[] }> = {
  suplemen: { label: 'Suplemen', desc: 'Kebugaran sedikit lebih cepat pulih.', cost: 20, tiered: false, fitness: [2, 2, 2], injury: [0.9, 0.9, 0.9] },
  gizi: { label: 'Ahli gizi pribadi', desc: 'Pola makan teratur: kebugaran naik, risiko cedera turun.', cost: 90, tiered: true, fitness: [2, 3, 5], injury: [0.92, 0.85, 0.75] },
  fisio: {
    label: 'Fisio pribadi',
    desc: 'Cedera sembuh lebih cepat, risiko cedera turun.',
    cost: 130,
    tiered: true,
    fitness: [0, 0, 1],
    injury: [0.95, 0.9, 0.82],
    heal: [0.25, 0.4, 0.6],
  },
};

/** Tingkat staf yang dipakai (0 = tidak) */
export const subLevel = (life: Life, id: SubId): CoachLevel => {
  const l = levelOf(life.subs[id]);
  return l && !SUBS[id].tiered ? 2 : l;
};
/** Biaya mingguan staf pada tingkat tertentu */
export const subCost = (id: SubId, level: CoachLevel, econ: number) =>
  SUBS[id].tiered ? tierCost(SUBS[id].cost, level, econ) : level ? SUBS[id].cost * econ : 0;
const subEffect = (life: Life, id: SubId, k: 'fitness' | 'injury' | 'heal') => {
  const l = subLevel(life, id);
  return l ? SUBS[id][k]?.[l - 1] : undefined;
};
export { COACH_TIERS };

/** Aksesori yang boleh dipakai bersamaan */
export const MAX_WEAR = 4;

export type ActionId = 'liburan' | 'bantu_ortu' | 'amal';
export const ACTIONS: Record<ActionId, { label: string; desc: string; cost: number; local: boolean; cooldown: number }> = {
  liburan: { label: 'Liburan', desc: 'Stres turun banyak, pasangan senang. Kebugaran turun sedikit.', cost: 500, local: true, cooldown: 12 },
  bantu_ortu: { label: 'Bantu orang tua', desc: 'Dukungan keluarga naik.', cost: 400, local: true, cooldown: 26 },
  amal: { label: 'Donasi ke yayasan amal', desc: 'Fans dan media menyukaimu, reputasi naik.', cost: 2000, local: false, cooldown: 26 },
};

const INTEREST = 0.03 / 52; // bunga tabungan per minggu

export function defaultLife(age: number, date: string): Life {
  return { house: age >= 18 ? 'kos' : 'ortu', houseSince: date, owned: ['sepatu_biasa'], boots: 'sepatu_biasa', car: null, wear: [], subs: {}, savings: 0 };
}

export const priceOf = (item: ItemDef, econ: number) => Math.round(item.local ? item.price * econ : item.price);
export const actionCost = (id: ActionId, econ: number) => Math.round(ACTIONS[id].local ? ACTIONS[id].cost * econ : ACTIONS[id].cost);

/** Biaya hidup per minggu: rumah, staf/suplemen, perawatan kendaraan */
export function lifeCosts(career: Career, econ: number) {
  const life = career.life;
  const house = HOUSES[life.house].cost * econ;
  let subs = 0;
  for (const k of Object.keys(SUBS) as SubId[]) subs += subCost(k, subLevel(life, k), econ);
  const car = life.car ? ITEM_BY_ID[life.car] : undefined;
  const upkeep = car?.upkeep ? (car.local ? car.upkeep * econ : car.upkeep) : 0;
  return { house, subs, upkeep };
}

const equippedItems = (life: Life) =>
  [life.boots, life.car, ...life.wear, ...life.owned.filter((id) => ITEM_BY_ID[id]?.kind === 'alat')]
    .filter((x): x is string => !!x)
    .map((id) => ITEM_BY_ID[id])
    .filter(Boolean);

/** Tambahan kebugaran per minggu dari rumah, alat, dan staf */
export function lifeFitness(career: Career): number {
  const life = career.life;
  let f = HOUSES[life.house].fitness;
  for (const i of equippedItems(life)) f += i.fitness ?? 0;
  for (const k of Object.keys(SUBS) as SubId[]) f += subEffect(life, k, 'fitness') ?? 0;
  return f;
}

/** Pengali risiko cedera dari staf pribadi */
export function lifeInjuryFactor(career: Career): number {
  let f = 1;
  for (const k of Object.keys(SUBS) as SubId[]) f *= subEffect(career.life, k, 'injury') ?? 1;
  return f;
}

/** Bagian stres dari gaya hidup */
export function lifeStress(career: Career, age: number): [string, number][] {
  const life = career.life;
  const parts: [string, number][] = [];
  const h = HOUSES[life.house];
  if (h.stress) parts.push([h.label, h.stress]);
  if (life.house === 'ortu' && age >= 21) parts.push(['Masih tinggal dengan orang tua', 3]);
  const items = equippedItems(life).filter((i) => i.stress);
  const s = items.reduce((t, i) => t + (i.stress ?? 0), 0);
  if (s) parts.push(['Barang kesukaanmu', s]);
  if (life.shockUntil && life.shockUntil > career.currentDate) parts.push(['Turun gaya hidup', 8]);
  return parts;
}

/**
 * Efek mingguan: bunga tabungan, fisio mempercepat pemulihan, pindah dari rumah
 * orang tua kalau main di luar negeri. Mengubah `career` langsung.
 */
export function lifeWeek(career: Career, abroad: boolean, healChance: (p: number) => boolean) {
  const life = career.life;
  if (life.savings > 0) life.savings = Math.round(life.savings * (1 + INTEREST) * 100) / 100;
  const heal = subEffect(life, 'fisio', 'heal');
  if (heal && career.injury && career.injury.weeksLeft > 1 && healChance(heal)) career.injury.weeksLeft -= 1;
  if (abroad && life.house === 'ortu') {
    life.house = 'kos';
    life.houseSince = career.currentDate;
    career.inbox.unshift({
      id: `w${career.week}-moved-out`,
      date: career.currentDate,
      from: 'Keluarga',
      title: 'Pindah dari rumah orang tua',
      body: 'Karena main di luar negeri, kamu tinggal di kos dekat tempat latihan. Kamu bisa pindah ke tempat yang lebih nyaman di halaman Kehidupan.',
    });
  }
  if (life.house === 'mewah') addMedia(career, 0.3);
}

/**
 * Pasang (on) atau lepas efek atribut barang. Selisih yang benar-benar diterapkan disimpan di
 * life.mods supaya saat dilepas atribut kembali persis (tidak terpotong batas 1-20).
 * Mengubah `p` dan `life` langsung; mengembalikan teks efek, mis. ["Pace +1", "Strength -1"].
 */
export function wearMods(p: Player, life: Life, id: string, on: boolean): string[] {
  const item = ITEM_BY_ID[id];
  const out: string[] = [];
  const mods = (life.mods ??= {});
  if (on) {
    if (!item?.mods || mods[id]) return out;
    const applied: Record<string, number> = {};
    for (const [a, d] of Object.entries(item.mods)) {
      const v = getAttr(p, a);
      if (v === undefined) continue;
      const nv = clamp(v + d, 1, 20);
      if (nv !== v) {
        setAttr(p, a, nv);
        applied[a] = nv - v;
      }
      out.push(`${a} ${d > 0 ? '+' : ''}${d}`);
    }
    mods[id] = applied;
  } else {
    const applied = mods[id];
    if (!applied) return out;
    for (const [a, d] of Object.entries(applied)) setAttr(p, a, clamp(getAttr(p, a) - d, 1, 20));
    delete mods[id];
  }
  p.ca = computeCA(p);
  return out;
}

/** Jumlah efek atribut dari semua barang yang sedang dipakai */
export function activeMods(life: Life): Record<string, number> {
  const t: Record<string, number> = {};
  for (const m of Object.values(life.mods ?? {})) for (const [a, d] of Object.entries(m)) t[a] = (t[a] ?? 0) + d;
  return t;
}

// --- aksi dari halaman Kehidupan ---------------------------------------------------

export type LifeOp =
  | { op: 'buy'; id: string }
  | { op: 'sell'; id: string }
  | { op: 'equip'; id: string }
  | { op: 'house'; id: HouseId }
  | { op: 'sub'; id: SubId; level: CoachLevel }
  | { op: 'action'; id: ActionId }
  | { op: 'deposit'; amount: number }
  | { op: 'withdraw'; amount: number };

const fmt = (v: number) => `€${Math.round(v).toLocaleString('id-ID')}`;

/** Jalankan aksi. Mengembalikan dunia/karier baru dan teks hasil. */
export function applyLife(world: World, prev: Career, op: LifeOp): { world: World; career: Career; result: string } {
  const career: Career = structuredClone(prev);
  const life = career.life;
  const me = world.players.find((p) => p.id === career.playerId)!;
  const econ = econOf(me.nationalityId);
  const fail = (result: string) => ({ world, career: prev, result });
  const done = (result: string, w: World = world) => ({ world: w, career, result });

  // barang dengan efek atribut selama dipakai mengubah pemain kita di dunia
  let me2: Player | null = null;
  const mine = () => (me2 ??= structuredClone(me));
  const worldOut = () => (me2 ? (me2.ca = computeCA(me2), replacePlayer(world, me2)) : world);
  const wearOn = (id: string) => wearMods(mine(), life, id, true);
  const wearOff = (id: string) => {
    if (life.mods?.[id]) wearMods(mine(), life, id, false);
  };

  switch (op.op) {
    case 'buy': {
      const item = ITEM_BY_ID[op.id];
      if (!item || life.owned.includes(item.id)) return fail('');
      const price = priceOf(item, econ);
      if (career.money < price) return fail(`Uangmu belum cukup untuk ${item.label.toLowerCase()} (${fmt(price)}).`);
      if (item.needHouse && HOUSES[life.house].rank < item.needHouse) return fail(`${item.label} butuh rumah yang lebih besar.`);
      career.money -= price;
      life.owned.push(item.id);
      const gains: string[] = [];
      let extra = '';
      if (item.kind === 'sepatu') {
        wearOff(life.boots);
        life.boots = item.id;
        gains.push(...wearOn(item.id));
      }
      if (item.kind === 'kendaraan') life.car = item.id;
      if (item.kind === 'aksesori') {
        if (life.wear.length < MAX_WEAR) {
          life.wear.push(item.id);
          gains.push(...wearOn(item.id));
        } else extra = ` Kamu sudah memakai ${MAX_WEAR} aksesori, lepas satu dulu untuk memakainya.`;
      }
      if (item.media) addMedia(career, item.media);
      if (item.attrs) {
        const p = mine();
        for (const [a, d] of Object.entries(item.attrs)) {
          const v = getAttr(p, a);
          if (v === undefined || v >= 20) continue;
          setAttr(p, a, Math.min(20, v + d));
          gains.push(`${a} +${d}`);
        }
      }
      return done(`Kamu membeli ${item.label.toLowerCase()} seharga ${fmt(price)}.${gains.length ? ` ${gains.join(', ')}.` : ''}${extra}`, worldOut());
    }
    case 'sell': {
      const item = ITEM_BY_ID[op.id];
      if (!item || !life.owned.includes(item.id) || item.id === 'sepatu_biasa') return fail('');
      const back = Math.round(priceOf(item, econ) * 0.5);
      career.money += back;
      wearOff(item.id);
      life.owned = life.owned.filter((x) => x !== item.id);
      life.wear = life.wear.filter((x) => x !== item.id);
      if (life.car === item.id) life.car = null;
      if (life.boots === item.id) {
        life.boots = 'sepatu_biasa';
        wearOn('sepatu_biasa');
      }
      return done(`${item.label} terjual ${fmt(back)}.`, worldOut());
    }
    case 'equip': {
      const item = ITEM_BY_ID[op.id];
      if (!item || !life.owned.includes(item.id)) return fail('');
      if (item.kind === 'sepatu') {
        if (life.boots === item.id) return fail('');
        wearOff(life.boots);
        life.boots = item.id;
        wearOn(item.id);
      } else if (item.kind === 'kendaraan') life.car = life.car === item.id ? null : item.id;
      else if (item.kind === 'aksesori') {
        if (life.wear.includes(item.id)) {
          life.wear = life.wear.filter((x) => x !== item.id);
          wearOff(item.id);
        } else {
          if (life.wear.length >= MAX_WEAR) return fail(`Maksimal ${MAX_WEAR} aksesori sekaligus. Lepas satu dulu.`);
          life.wear = [...life.wear, item.id];
          wearOn(item.id);
        }
      }
      return done('', worldOut());
    }
    case 'house': {
      if (op.id === life.house) return fail('');
      const from = HOUSES[life.house];
      const to = HOUSES[op.id];
      const age = ageOn(me.birthDate, career.currentDate);
      // turun kelas setelah terbiasa hidup enak itu berat
      if (to.rank < from.rank && from.rank >= 2 && life.houseSince <= addDays(career.currentDate, -56)) {
        life.shockUntil = addDays(career.currentDate, 56);
      }
      life.house = op.id;
      life.houseSince = career.currentDate;
      if (op.id === 'ortu') career.family.support = clamp(career.family.support + 1, 1, 20);
      return done(
        op.id === 'ortu'
          ? 'Kamu kembali tinggal bersama orang tua.'
          : `Kamu pindah ke ${to.label.toLowerCase()}. Biaya ${fmt(to.cost * econ)} per minggu.${life.shockUntil && life.shockUntil > career.currentDate ? ' Turun gaya hidup bikin stres beberapa minggu.' : ''}${age < 17 ? ' Orang tuamu sedikit khawatir.' : ''}`,
      );
    }
    case 'sub': {
      life.subs[op.id] = op.level;
      return done('');
    }
    case 'action': {
      const a = ACTIONS[op.id];
      const cost = actionCost(op.id, econ);
      const key = `life_${op.id}`;
      const last = career.cooldowns[key];
      if (last !== undefined && career.week - last < a.cooldown) return fail(`${a.label} baru bisa lagi ${a.cooldown - (career.week - last)} minggu lagi.`);
      if (career.money < cost) return fail(`Uangmu belum cukup (${fmt(cost)}).`);
      career.money -= cost;
      career.cooldowns[key] = career.week;
      let w = world;
      if (op.id === 'liburan') {
        career.stress = clamp(career.stress - 25, 0, 100);
        career.fitness = clamp(career.fitness - 5, 0, 100);
        addPartner(career, 15);
        return done(career.rel.partner ? `Liburan bersama ${career.rel.partner.name} benar-benar menyegarkan.` : 'Liburan singkat yang menyegarkan pikiran.');
      }
      if (op.id === 'bantu_ortu') {
        career.family.support = clamp(career.family.support + 2, 1, 20);
        career.stress = clamp(career.stress - 3, 0, 100);
        return done('Orang tuamu terharu. Mereka makin mendukung kariermu.');
      }
      addFans(career, career.rel.clubId, 6);
      addMedia(career, 5);
      const p: Player = structuredClone(me);
      p.reputation.home = clamp(p.reputation.home + 1, 1, 100);
      w = replacePlayer(world, p);
      return done('Donasimu diberitakan media lokal. Fans bangga punya pemain sepertimu.', w);
    }
    case 'deposit': {
      const v = Math.min(op.amount, Math.max(0, career.money));
      if (v <= 0) return fail('Tidak ada uang untuk ditabung.');
      career.money -= v;
      life.savings += v;
      return done(`${fmt(v)} masuk tabungan.`);
    }
    case 'withdraw': {
      const v = Math.min(op.amount, life.savings);
      if (v <= 0) return fail('');
      life.savings -= v;
      career.money += v;
      return done(`${fmt(v)} diambil dari tabungan.`);
    }
  }
}
