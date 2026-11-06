// Unduh statistik karier sebagai CSV yang langsung terbuka rapi di Excel.
import type { Career, Player, World } from '../game/types';
import { careerCsv, csvFileName } from '../game/sim/retire';
import { downloadFile } from '../game/save/storage';

/** Excel memakai pemisah daftar dari pengaturan wilayah: ';' kalau desimalnya koma (mis. Indonesia) */
export function csvFormat(): { sep: string; decimal: string } {
  let decimal = '.';
  try {
    decimal = new Intl.NumberFormat().formatToParts(1.5).find((x) => x.type === 'decimal')?.value ?? '.';
  } catch {
    /* Intl tidak tersedia */
  }
  return { sep: decimal === ',' ? ';' : ',', decimal };
}

/** Unduh teks CSV dengan BOM supaya Excel membaca huruf beraksen dengan benar */
export function downloadCsv(csv: string, name: string) {
  downloadFile(new TextEncoder().encode('\uFEFF' + csv), name, 'text/csv;charset=utf-8');
}

export function downloadCareerCsv(world: World, career: Career, p: Player) {
  downloadCsv(careerCsv(world, career, p, csvFormat()), csvFileName(p));
}
