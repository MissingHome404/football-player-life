/**
 * Tingkat tekanan laga (0..1) untuk mesin laga: laga liga biasa 0.35, final 1.
 * Pemain dengan Pressure & Important Matches rendah gugup di laga besar, yang tinggi tetap tenang.
 */
export const LEAGUE_STAKES = 0.35;

/** Tekanan dari nama babak (piala, kompetisi benua, turnamen timnas); `base` untuk babak biasa / fase grup */
export function stageStakes(stage: string, base: number): number {
  const s = stage.toLowerCase();
  if (/semifinal/.test(s)) return Math.max(base, 0.85);
  if (/perempat final/.test(s)) return Math.max(base, 0.75);
  if (/\bfinal\b/.test(s)) return 1;
  if (/\b(16|32|64) besar/.test(s)) return Math.max(base, 0.65);
  if (/kualifikasi/.test(s)) return Math.max(base, 0.6);
  if (/persahabatan|laga internasional/.test(s)) return Math.min(base, 0.25);
  return base;
}

/**
 * Tekanan laga liga: derby sekota dan laga-laga terakhir musim (perebutan gelar / degradasi) lebih panas.
 * `round` dihitung dari 0.
 */
export function leagueStakes(o: { round: number; rounds: number; derby: boolean; youth?: boolean }): number {
  if (o.youth) return 0.2;
  let s = LEAGUE_STAKES;
  if (o.derby) s += 0.15;
  if (o.rounds > 0 && o.round >= o.rounds * 0.8) s += 0.15;
  return s;
}
