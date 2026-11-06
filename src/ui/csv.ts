// Unduh statistik karier sebagai CSV yang langsung terbuka rapi di Excel.
import type { Career, Player, World } from '../game/types';
import { careerCsv, csvFileName } from '../game/sim/retire';
import { downloadFile } from '../game/save/storage';

export function downloadCareerCsv(world: World, career: Career, p: Player) {
  // Excel memakai pemisah daftar dari pengaturan wilayah: ';' kalau desimalnya koma (mis. Indonesia)
  let decimal = '.';
  try {
    decimal = new Intl.NumberFormat().formatToParts(1.5).find((x) => x.type === 'decimal')?.value ?? '.';
  } catch {
    /* Intl tidak tersedia */
  }
  const sep = decimal === ',' ? ';' : ',';
  const csv = careerCsv(world, career, p, { sep, decimal });
  downloadFile(new TextEncoder().encode('﻿' + csv), csvFileName(p), 'text/csv;charset=utf-8');
}
