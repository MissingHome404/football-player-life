// Format file save. Atribut disimpan sebagai array (urutan tetap) supaya
// ukurannya jauh lebih kecil daripada objek dengan nama atribut panjang.

import { TECHNICAL, MENTAL, PHYSICAL, GOALKEEPING, PERSONALITY, HIDDEN } from '../data/attributes';
import { COUNTRIES } from '../data/countries';
import type { Career, Player, World } from '../types';
import { migrateCareer } from '../sim/week';

export const SAVE_MAGIC = 'FPL-SAVE';
// 1: tahap 4 (karier dasar). 2: tahap 5 (minggu, latihan, inbox).
export const SAVE_FORMAT = 2;

const GROUPS = {
  technical: TECHNICAL,
  mental: MENTAL,
  physical: PHYSICAL,
  goalkeeping: GOALKEEPING,
  personality: PERSONALITY,
  hidden: HIDDEN,
} as const;
type GroupKey = keyof typeof GROUPS;
const GROUP_KEYS = Object.keys(GROUPS) as GroupKey[];

export interface SaveSummary {
  playerName: string;
  age: number;
  position: string;
  countryId: string;
  team: string;
  gameDate: string;
}

export interface SaveFile {
  magic: typeof SAVE_MAGIC;
  format: number;
  id: string;
  savedAt: string;
  summary: SaveSummary;
  world: Omit<World, 'countries' | 'players'> & { players: unknown[] };
  career: Career;
}

function packPlayer(p: Player): unknown {
  const out: Record<string, unknown> = { ...p };
  for (const g of GROUP_KEYS) {
    const rec = p[g] as Record<string, number>;
    out[g] = GROUPS[g].map((k) => rec[k]);
  }
  return out;
}

function unpackPlayer(raw: Record<string, unknown>): Player {
  const out: Record<string, unknown> = { ...raw };
  for (const g of GROUP_KEYS) {
    const arr = raw[g] as number[];
    if (!Array.isArray(arr) || arr.length !== GROUPS[g].length) {
      throw new Error(`Data atribut ${g} rusak`);
    }
    out[g] = Object.fromEntries(GROUPS[g].map((k, i) => [k, arr[i]]));
  }
  return out as unknown as Player;
}

export function buildSaveFile(
  id: string,
  world: World,
  career: Career,
  summary: SaveSummary,
): SaveFile {
  const { countries: _c, players, ...rest } = world;
  void _c;
  return {
    magic: SAVE_MAGIC,
    format: SAVE_FORMAT,
    id,
    savedAt: new Date().toISOString(),
    summary,
    world: { ...rest, players: players.map(packPlayer) },
    career,
  };
}

export function readSaveFile(data: unknown): { file: SaveFile; world: World; career: Career } {
  const f = data as SaveFile;
  if (!f || f.magic !== SAVE_MAGIC) throw new Error('Ini bukan file save Football Player Life.');
  if (f.format > SAVE_FORMAT) {
    throw new Error('File save ini dibuat versi game yang lebih baru. Muat ulang halaman lalu coba lagi.');
  }
  if (!f.world || !Array.isArray(f.world.players) || !f.career) throw new Error('File save tidak lengkap.');
  const world: World = {
    ...(f.world as Omit<World, 'countries' | 'players'>),
    countries: COUNTRIES,
    players: f.world.players.map((p) => unpackPlayer(p as Record<string, unknown>)),
  };
  const me = world.players.find((p) => p.id === f.career.playerId);
  if (!me) throw new Error('Pemain kamu tidak ada di file save.');
  const career = f.format < 2 ? migrateCareer(f.career, !!me.contract) : f.career;
  return { file: f, world, career };
}
