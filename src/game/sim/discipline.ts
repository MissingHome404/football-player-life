// Kartu, skorsing, dan cedera pemain kita setelah pertandingan.
// Skorsing klub (liga, U19, amatir) dan skorsing timnas dihitung terpisah.

import type { Career, MatchRecord, SeasonStat } from '../types';
import { Rng, clamp } from '../rng';
import { addDays } from '../date';

export const INJURIES: [name: string, min: number, max: number, weight: number][] = [
  ['Memar di paha', 1, 2, 5],
  ['Keseleo pergelangan kaki', 2, 4, 4],
  ['Cedera hamstring', 3, 6, 3],
  ['Cedera otot betis', 2, 5, 3],
  ['Cedera lutut ringan', 4, 8, 2],
  ['Patah tulang kaki', 12, 20, 0.3],
  ['Robek ligamen lutut (ACL)', 24, 36, 0.25],
];

/** Kartu kuning yang terkumpul di satu musim liga sebelum skorsing 1 laga */
export const YELLOW_LIMIT = 5;

export function injure(career: Career, rng: Rng, where: 'latihan' | 'pertandingan', notes?: string[]) {
  const [name, min, max] = rng.weighted(INJURIES.map((x) => [x, x[3]] as const));
  const weeks = rng.int(min, max);
  career.injury = { name, weeksLeft: weeks };
  career.fitness = clamp(career.fitness - 15, 0, 100);
  notes?.push(`Kamu cedera saat ${where}: ${name.toLowerCase()}, perkiraan absen ${weeks} minggu.`);
  career.inbox.unshift({
    id: `w${career.week}-injury-${where}`,
    date: addDays(career.currentDate, 7),
    from: 'Tim medis',
    title: `Cedera: ${name}`,
    body: `Kamu mengalami ${name.toLowerCase()} saat ${where} dan harus absen sekitar ${weeks} minggu. Selama cedera kamu tidak bisa berlatih atau bermain.`,
  });
}

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
export function afterGame(career: Career, rec: MatchRecord, rng: Rng, scope: BanScope, row: SeasonStat | undefined, notes?: string[]) {
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
    } else if (scope === 'club' && rec.comp !== 'Piala' && row && (row.yellow ?? 0) % YELLOW_LIMIT === 0) {
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
  if (rec.injured && !career.injury) injure(career, rng, 'pertandingan', notes);
}
