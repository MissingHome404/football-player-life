import type { Player } from '../types';

// Label personality dihitung dari angka hidden attributes (mirip cara FM).
// Urutan aturan penting: yang paling spesifik dicek lebih dulu.
export function personalityLabel(p: Pick<Player, 'personality' | 'hidden' | 'mental'>): string {
  const x = p.personality;
  const h = p.hidden;
  const det = p.mental.Determination;

  if (x.Professionalism >= 17 && x.Temperament >= 11 && x.Controversy <= 8) return 'Model Professional';
  if (x.Temperament <= 5 && x.Controversy >= 12) return 'Hot-Headed';
  if (x.Professionalism <= 7 && x.Controversy >= 13) return 'Party Animal';
  if (x.Loyalty <= 6 && x.Ambition >= 14) return 'Mercenary';
  if (h['Important Matches'] >= 16 && x.Pressure >= 15) return 'Big-Game Player';
  if (x.Adaptability <= 6 && x.Controversy <= 6 && x.Pressure <= 10) return 'Shy / Introvert';
  if (x.Professionalism >= 15) return 'Professional';
  if (x.Ambition >= 17) return 'Ambitious';
  if (x.Loyalty >= 17) return 'Loyal';
  if (det >= 16 && x.Pressure >= 13) return 'Determined';
  if (x.Temperament <= 5) return 'Temperamental';
  if (x.Professionalism <= 6) return 'Casual';
  if (x.Ambition <= 6) return 'Unambitious';
  if (x.Pressure <= 6) return 'Easily Discouraged';
  if (x.Sportsmanship >= 16) return 'Sporting';
  return 'Balanced';
}

export const PERSONALITY_INFO: Record<string, { good: string; risk: string }> = {
  'Model Professional': { good: 'Latihan efektif, disukai manajer', risk: 'Gampang stres kalau dibangkucadangkan' },
  'Hot-Headed': { good: 'Berani di laga besar', risk: 'Kartu merah, ribut dengan wasit dan pelatih' },
  'Party Animal': { good: 'Disukai teman setim dan fans', risk: 'Event pesta yang menurunkan kebugaran' },
  Mercenary: { good: 'Negosiasi gaji tinggi', risk: 'Fans dan klub ragu soal loyalitas' },
  'Big-Game Player': { good: 'Bonus di final dan derby', risk: 'Kurang konsisten di laga kecil' },
  'Shy / Introvert': { good: 'Fokus, jarang skandal', risk: 'Susah adaptasi di negara baru' },
  Professional: { good: 'Berkembang stabil', risk: 'Sedikit kaku dalam bergaul' },
  Ambitious: { good: 'Selalu ingin naik level', risk: 'Cepat minta pindah kalau klub stagnan' },
  Loyal: { good: 'Dicintai fans klub', risk: 'Susah meninggalkan klub walau sudah mentok' },
  Determined: { good: 'Pantang menyerah, cepat pulih dari keterpurukan', risk: 'Keras kepala' },
  Temperamental: { good: 'Emosional dan bersemangat', risk: 'Mudah tersulut' },
  Casual: { good: 'Santai, stres rendah', risk: 'Latihan kurang efektif' },
  Unambitious: { good: 'Puas dengan keadaan', risk: 'Potensi sering tidak keluar' },
  'Easily Discouraged': { good: 'Rendah hati', risk: 'Performa turun di bawah tekanan' },
  Sporting: { good: 'Citra bagus di media', risk: 'Kadang kurang agresif' },
  Balanced: { good: 'Tidak ada kelemahan menonjol', risk: 'Tidak ada kelebihan menonjol' },
};
