// Kehidupan dan belanja: tempat tinggal, barang (sepatu, alat, aksesori, kendaraan),
// staf pribadi, kegiatan sekali bayar (liburan, bantu orang tua, amal), dan tabungan.
// Setiap pengeluaran punya efek yang jelas, dan gaya hidup mahal susah diturunkan.

import type { Career, Life, Player, World } from '../types';
import { clamp } from '../rng';
import { addDays } from '../date';
import { ageOn, computeCA } from '../gen/player';
import { econOf } from './economy';
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
  attrs?: Record<string, number>; // bonus atribut sekali saat dibeli
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
  { id: 'sarung_pro', kind: 'alat', label: 'Sarung tangan kiper pro', desc: 'Grip lebih lengket.', price: 180, attrs: { Handling: 1 }, color: '#3fbf7f' },
  { id: 'recovery', kind: 'alat', label: 'Alat recovery', desc: 'Pijat, es, dan kompresi setiap malam.', price: 350, fitness: 3, color: '#5aa0ff' },
  { id: 'gym', kind: 'alat', label: 'Gym di rumah', desc: 'Butuh rumah atau rumah mewah.', price: 2500, attrs: { Strength: 1 }, fitness: 2, needHouse: 3, color: '#888' },
  { id: 'ikat_kepala', kind: 'aksesori', label: 'Ikat kepala', desc: 'Gaya klasik pemain bintang.', price: 12, local: true, color: '#f2f2f2' },
  { id: 'jam', kind: 'aksesori', label: 'Jam tangan mewah', desc: 'Media suka memotretnya.', price: 4000, media: 4, stress: -1, color: '#d9b44a' },
  { id: 'kalung', kind: 'aksesori', label: 'Kalung emas', desc: 'Mencolok di setiap foto.', price: 2500, media: 2, stress: -1, color: '#e8c84a' },
  { id: 'motor', kind: 'kendaraan', label: 'Motor', desc: 'Tidak perlu naik angkot lagi.', price: 900, local: true, stress: -1, upkeep: 2, color: '#c0392b' },
  { id: 'mobil', kind: 'kendaraan', label: 'Mobil keluarga', desc: 'Nyaman untuk keluarga dan pasangan.', price: 15000, stress: -2, upkeep: 15, color: '#d8dde6' },
  { id: 'sport', kind: 'kendaraan', label: 'Mobil sport', desc: 'Semua mata menoleh.', price: 95000, stress: -4, upkeep: 90, media: 3, color: '#e23b3b' },
  { id: 'super', kind: 'kendaraan', label: 'Supercar', desc: 'Simbol bintang dunia.', price: 320000, stress: -6, upkeep: 300, media: 6, color: '#f2c200' },
];
export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export type SubId = 'suplemen' | 'gizi' | 'fisio';
export const SUBS: Record<SubId, { label: string; desc: string; cost: number; fitness: number; injury: number }> = {
  suplemen: { label: 'Suplemen', desc: 'Kebugaran sedikit lebih cepat pulih.', cost: 20, fitness: 2, injury: 0.9 },
  gizi: { label: 'Ahli gizi pribadi', desc: 'Pola makan teratur: kebugaran naik, risiko cedera turun.', cost: 90, fitness: 3, injury: 0.85 },
  fisio: { label: 'Fisio pribadi', desc: 'Cedera sembuh lebih cepat, risiko cedera turun.', cost: 130, fitness: 0, injury: 0.9 },
};

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
  for (const k of Object.keys(SUBS) as SubId[]) if (life.subs[k]) subs += SUBS[k].cost * econ;
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
  for (const k of Object.keys(SUBS) as SubId[]) if (life.subs[k]) f += SUBS[k].fitness;
  return f;
}

/** Pengali risiko cedera dari staf pribadi */
export function lifeInjuryFactor(career: Career): number {
  let f = 1;
  for (const k of Object.keys(SUBS) as SubId[]) if (career.life.subs[k]) f *= SUBS[k].injury;
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
export function lifeWeek(career: Career, abroad: boolean, healChance: () => boolean) {
  const life = career.life;
  if (life.savings > 0) life.savings = Math.round(life.savings * (1 + INTEREST) * 100) / 100;
  if (life.subs.fisio && career.injury && career.injury.weeksLeft > 1 && healChance()) career.injury.weeksLeft -= 1;
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

// --- aksi dari halaman Kehidupan ---------------------------------------------------

export type LifeOp =
  | { op: 'buy'; id: string }
  | { op: 'sell'; id: string }
  | { op: 'equip'; id: string }
  | { op: 'house'; id: HouseId }
  | { op: 'sub'; id: SubId; on: boolean }
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

  switch (op.op) {
    case 'buy': {
      const item = ITEM_BY_ID[op.id];
      if (!item || life.owned.includes(item.id)) return fail('');
      const price = priceOf(item, econ);
      if (career.money < price) return fail(`Uangmu belum cukup untuk ${item.label.toLowerCase()} (${fmt(price)}).`);
      if (item.needHouse && HOUSES[life.house].rank < item.needHouse) return fail(`${item.label} butuh rumah yang lebih besar.`);
      career.money -= price;
      life.owned.push(item.id);
      if (item.kind === 'sepatu') life.boots = item.id;
      if (item.kind === 'kendaraan') life.car = item.id;
      if (item.kind === 'aksesori') life.wear.push(item.id);
      if (item.media) addMedia(career, item.media);
      let w = world;
      const gains: string[] = [];
      if (item.attrs) {
        const p: Player = structuredClone(me);
        for (const [a, d] of Object.entries(item.attrs)) {
          const v = getAttr(p, a);
          if (v === undefined || v >= 20) continue;
          setAttr(p, a, Math.min(20, v + d));
          gains.push(`${a} +${d}`);
        }
        p.ca = computeCA(p);
        w = replacePlayer(world, p);
      }
      return done(`Kamu membeli ${item.label.toLowerCase()} seharga ${fmt(price)}.${gains.length ? ` ${gains.join(', ')}.` : ''}`, w);
    }
    case 'sell': {
      const item = ITEM_BY_ID[op.id];
      if (!item || !life.owned.includes(item.id) || item.id === 'sepatu_biasa') return fail('');
      const back = Math.round(priceOf(item, econ) * 0.5);
      career.money += back;
      life.owned = life.owned.filter((x) => x !== item.id);
      life.wear = life.wear.filter((x) => x !== item.id);
      if (life.car === item.id) life.car = null;
      if (life.boots === item.id) life.boots = 'sepatu_biasa';
      return done(`${item.label} terjual ${fmt(back)}.`);
    }
    case 'equip': {
      const item = ITEM_BY_ID[op.id];
      if (!item || !life.owned.includes(item.id)) return fail('');
      if (item.kind === 'sepatu') life.boots = item.id;
      else if (item.kind === 'kendaraan') life.car = life.car === item.id ? null : item.id;
      else if (item.kind === 'aksesori') life.wear = life.wear.includes(item.id) ? life.wear.filter((x) => x !== item.id) : [...life.wear, item.id];
      return done('');
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
      life.subs[op.id] = op.on;
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
