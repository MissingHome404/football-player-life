// Pembuatan karakter pemain kita: semua aspek di-RNG dari seed karakter,
// kecuali yang dipilih sendiri (negara, posisi, nama). Re-roll = seed baru.

import { POSITIONS, type Position } from '../data/attributes';
import { LEAGUES } from '../data/leagues';
import type { Club, Player, World } from '../types';
import { Rng, clamp } from '../rng';
import { generatePlayer, computeCA } from './player';
import { generateName } from './names';

export type Origin = 'sunday' | 'ssb' | 'local_academy' | 'top_academy';
export type FamilyWealth = 'miskin' | 'menengah' | 'kaya';

export const ORIGIN_INFO: Record<Origin, { label: string; desc: string }> = {
  sunday: {
    label: 'Sunday league',
    desc: 'Main di liga kampung. Atribut awal rendah dan jarang dilirik scout, tapi lapar untuk membuktikan diri.',
  },
  ssb: {
    label: 'SSB lokal',
    desc: 'Sekolah sepak bola di kotamu. Dasar teknik lumayan, sesekali ada scout klub yang datang.',
  },
  local_academy: {
    label: 'Akademi klub lokal',
    desc: 'Sudah terdaftar di tim U19 klub profesional di negaramu. Jalur ke tim utama terbuka.',
  },
  top_academy: {
    label: 'Akademi klub top dunia',
    desc: 'Dididik di akademi klub elite. Fasilitas terbaik, persaingan paling keras.',
  },
};

export const FAMILY_INFO: Record<FamilyWealth, { label: string; desc: string }> = {
  miskin: { label: 'Keluarga miskin', desc: 'Uang awal sangat sedikit, keluarga kadang butuh bantuan biaya.' },
  menengah: { label: 'Keluarga menengah', desc: 'Cukup untuk kebutuhan dasar dan sedikit peralatan.' },
  kaya: { label: 'Keluarga kaya', desc: 'Bisa langsung bayar pelatih pribadi dan peralatan bagus.' },
};

// Kekuatan ekonomi negara, untuk uang awal keluarga
export const ECONOMY: Record<string, number> = {
  ENG: 1, GER: 1, NED: 1, BEL: 1, DEN: 1, NOR: 1.2, FRA: 0.95, ITA: 0.85, ESP: 0.8, AUS: 1,
  QAT: 1.3, UAE: 1.2, KSA: 0.9, JPN: 0.85, KOR: 0.8, CYP: 0.7, POR: 0.55, CZE: 0.55, GRE: 0.45,
  POL: 0.5, TUR: 0.35, MAS: 0.3, THA: 0.2, IRN: 0.15, UZB: 0.1, IDN: 0.12,
};

export const PLAYABLE_COUNTRIES = LEAGUES.map((l) => l.countryId);

export interface CharacterChoices {
  countryId?: string; // kosong = acak
  position?: Position; // kosong = acak
  role?: string; // kosong = acak sesuai posisi
}

export interface CharacterRoll {
  seed: string;
  player: Player;
  age: number;
  origin: Origin;
  family: { wealth: FamilyWealth; support: number }; // support 1-20
  money: number; // EUR
  stress: number; // 0-100
  clubId: string | null; // null = belum punya klub profesional
  teamLabel: string; // nama tim tempat main sekarang
  scoutPA: [number, number]; // perkiraan scout (rentang PA)
}

const USER_ID = 'USER';

export function rollCharacter(world: World, choices: CharacterChoices, seed: string): CharacterRoll {
  const rng = new Rng(`char:${seed}`);

  const countryId = choices.countryId ?? rng.pick(PLAYABLE_COUNTRIES);
  const outfield = POSITIONS.filter((p) => p !== 'GK');
  const position: Position = choices.position ?? (rng.chance(0.08) ? 'GK' : rng.pick(outfield));
  const age = rng.weighted<number>([[14, 1], [15, 2], [16, 3], [17, 3], [18, 2], [19, 1]]);
  const origin = rng.weighted<Origin>([
    ['sunday', 30],
    ['ssb', 35],
    ['local_academy', 28],
    ['top_academy', 7],
  ]);
  const wealth = rng.weighted<FamilyWealth>([
    ['miskin', 35],
    ['menengah', 45],
    ['kaya', 20],
  ]);

  // Klub tempat main sekarang
  const domestic = world.clubs.filter((c) => c.countryId === countryId);
  let club: Club | null = null;
  if (origin === 'local_academy') {
    // lebih sering klub kecil/menengah
    const sorted = [...domestic].sort((a, b) => a.reputation - b.reputation);
    club = rng.weighted(sorted.map((c, i) => [c, sorted.length - i] as const));
  } else if (origin === 'top_academy') {
    const domesticTop = domestic.filter((c) => c.reputation >= 78);
    const pool = domesticTop.length
      ? domesticTop
      : world.clubs.filter((c) => c.reputation >= 84);
    club = rng.pick(pool);
  }
  const city = rng.pick(domestic).city;
  const teamLabel =
    club?.name ?? (origin === 'sunday' ? `Tim kampung ${city}` : `SSB ${city}`);

  // Kemampuan awal: umur + asal
  const originBonus = { sunday: 0, ssb: 8, local_academy: 18, top_academy: 30 }[origin];
  const targetCA = clamp(Math.round(32 + (age - 14) * 7 + originBonus + rng.normal(0, 6)), 20, 110);

  const base = generatePlayer(rng, {
    id: USER_ID,
    countryId,
    position,
    role: choices.role,
    age,
    targetCA,
    refDate: world.startDate,
    isYouth: true,
  });

  // Potensi: RNG penuh dengan batas bawah/atas sesuai asal. Inilah "kesulitan" karier.
  const [lo, hi] = {
    sunday: [70, 175],
    ssb: [80, 180],
    local_academy: [90, 188],
    top_academy: [110, 195],
  }[origin];
  const pa = clamp(Math.round(lo + (hi - lo) * rng.next()), base.ca + 20, 200);

  // Perkiraan scout: makin kecil levelmu, makin tidak yakin scout-nya
  const width = { sunday: 30, ssb: 24, local_academy: 16, top_academy: 10 }[origin];
  const center = pa + rng.normal(0, width / 3);
  const scoutPA: [number, number] = [
    clamp(Math.round(center - width / 2), 1, 200),
    clamp(Math.round(center + width / 2), 1, 200),
  ];

  const player: Player = {
    ...base,
    ca: computeCA(base),
    pa,
    isUser: true,
    reputation: { home: clamp(Math.round(originBonus / 2 + rng.int(0, 5)), 1, 100), world: 1 },
    contract: club
      ? {
          clubId: club.id,
          wagePerWeek: age >= 16 ? Math.round(10 + club.reputation * 0.8) : 0,
          expires: `${2027 + (age >= 17 ? 1 : 0)}-06-30`,
          role: 'Pemain muda',
        }
      : null,
  };

  const econ = ECONOMY[countryId] ?? 0.5;
  const moneyBase = { miskin: 150, menengah: 2500, kaya: 40000 }[wealth];
  const money = Math.round((moneyBase * econ * rng.float(0.7, 1.3)) / 10) * 10;
  const support = clamp(Math.round(rng.normal(wealth === 'miskin' ? 11 : 13, 4)), 1, 20);
  const stress = clamp(
    Math.round(15 + (wealth === 'miskin' ? 10 : 0) + (20 - player.personality.Pressure) + rng.normal(0, 5)),
    0,
    100,
  );

  return {
    seed,
    player,
    age,
    origin,
    family: { wealth, support },
    money,
    stress,
    clubId: club?.id ?? null,
    teamLabel,
    scoutPA,
  };
}

/** Ganti nama tanpa mengubah hasil roll lain */
export function renameCharacter(roll: CharacterRoll, firstName: string, lastName: string): CharacterRoll {
  return { ...roll, player: { ...roll.player, firstName, lastName } };
}

export function randomName(countryId: string, seed: string) {
  return generateName(new Rng(`name:${seed}`), countryId);
}

export const injuryHint = (v: number) => (v <= 6 ? 'Jarang cedera' : v <= 13 ? 'Normal' : 'Rawan cedera');
