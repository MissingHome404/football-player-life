// Tanggal disimpan sebagai teks YYYY-MM-DD (UTC) supaya mudah disimpan dan dibandingkan.

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Sabtu pertama pada atau setelah tanggal 1 bulan itu */
export function firstSaturday(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  d.setUTCDate(1 + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

export const yearOf = (date: string) => Number(date.slice(0, 4));
