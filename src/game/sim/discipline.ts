// Kartu, skorsing, dan cedera pemain kita setelah pertandingan.
// Skorsing klub (liga, U19, amatir) dan skorsing timnas dihitung terpisah.

import type { Career, Competition, MatchRecord, Player, SeasonStat } from '../types';
import type { Rng } from '../rng';
import { injure } from './injury';

/** Kartu kuning yang terkumpul di satu musim liga sebelum skorsing 1 laga */
export const YELLOW_LIMIT = 5;
/** Kompetisi liga: hanya kartu kuning di sini yang dihitung untuk akumulasi */
const LEAGUE_COMPS = new Set<Competition>(['Liga', 'U19', 'Amatir']);

export type BanScope = 'club' | 'nat';

/** Sisa laga skorsing */
export const banOf = (career: Career, scope: BanScope) => career.ban?.[scope] ?? 0;

/** Timmu bertanding saat kamu diskors: kamu absen dan sisa skorsing berkurang satu */
export function serveBan(career: Career, scope: BanScope): boolean {
  const n = banOf(career, scope);
  if (n <= 0) return false;
  career.ban![scope] = n - 1;
  return true;
}

/** Kartu dari statistik match engine */
export function cardOf(yellow: number, red: number): MatchRecord['card'] {
  if (red > 0) return yellow >= 2 ? 'YR' : 'R';
  return yellow > 0 ? 'Y' : undefined;
}

/**
 * Setelah laga: kartu dicatat di statistik musim dan bisa berujung skorsing, cedera di laga
 * langsung membuatmu absen (laga berikutnya di minggu yang sama juga).
 */
export function afterGame(
  career: Career,
  rec: MatchRecord,
  rng: Rng,
  scope: BanScope,
  row: SeasonStat | undefined,
  notes?: string[],
  player?: Player,
) {
  if (rec.card) {
    if (row) {
      if (rec.card === 'Y') row.yellow = (row.yellow ?? 0) + 1;
      else row.red = (row.red ?? 0) + 1;
    }
    let games = 0;
    let why = '';
    if (rec.card === 'R') {
      // kartu merah langsung: 1 laga (menggagalkan peluang), 3 laga (pelanggaran keras)
      games = rng.weighted([
        [1, 55],
        [2, 15],
        [3, 30],
      ] as [number, number][]);
      why = 'kartu merah langsung';
    } else if (rec.card === 'YR') {
      games = 1;
      why = 'dua kartu kuning';
    } else if (scope === 'club' && LEAGUE_COMPS.has(rec.comp) && row && (row.yellow ?? 0) % YELLOW_LIMIT === 0) {
      games = 1;
      why = `akumulasi ${row.yellow} kartu kuning musim ini`;
    }
    if (games > 0) {
      const ban = (career.ban ??= { club: 0, nat: 0 });
      ban[scope] += games;
      const where = scope === 'club' ? `laga ${rec.team}` : 'laga timnas';
      notes?.push(`Kamu diskors ${games} laga karena ${why}.`);
      career.inbox.unshift({
        id: `ban-${rec.date}-${scope}`,
        date: rec.date,
        from: 'Komisi Disiplin',
        title: `Skorsing ${games} laga`,
        body: `Kamu mendapat ${why} saat melawan ${rec.opponent}, jadi kamu tidak boleh bermain di ${games} ${where} berikutnya.`,
      });
    }
  }
  if (rec.injured && !career.injury) injure(career, rng, 'pertandingan', notes, player);
}
