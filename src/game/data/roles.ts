// Peran (role) per posisi. Setiap peran punya atribut kunci (paling penting)
// dan atribut pendukung. Dipakai untuk: generator pemain, kecocokan peran,
// dan highlight atribut di profil.

import type { Position, VisibleAttr } from './attributes';

export interface Role {
  id: string;
  name: string;
  short: string;
  desc: string;
  key: VisibleAttr[];
  pref: VisibleAttr[];
}

const r = (
  id: string,
  name: string,
  short: string,
  desc: string,
  key: VisibleAttr[],
  pref: VisibleAttr[],
): Role => ({ id, name, short, desc, key, pref });

export const ROLES: Record<string, Role> = Object.fromEntries(
  [
    // Kiper
    r('gk', 'Goalkeeper', 'GK', 'Kiper klasik: fokus menghalau bola dan menguasai kotak penalti.',
      ['Aerial Reach', 'Command of Area', 'Communication', 'Handling', 'Kicking', 'Reflexes', 'Concentration', 'Positioning', 'Agility'],
      ['One on Ones', 'Throwing', 'Anticipation', 'Decisions']),
    r('sk', 'Sweeper Keeper', 'SK', 'Kiper yang berani keluar sarang dan ikut membangun serangan dari belakang.',
      ['Command of Area', 'Kicking', 'One on Ones', 'Reflexes', 'Rushing Out (Tendency)', 'Anticipation', 'Composure', 'Concentration', 'Positioning', 'Agility'],
      ['Aerial Reach', 'Communication', 'First Touch', 'Handling', 'Passing', 'Throwing', 'Decisions', 'Vision', 'Acceleration']),
    // Bek tengah
    r('cd', 'Central Defender', 'CD', 'Bek tengah standar: kawal lawan, menang duel udara, buang bola.',
      ['Heading', 'Marking', 'Tackling', 'Positioning', 'Jumping Reach', 'Strength'],
      ['Aggression', 'Anticipation', 'Bravery', 'Composure', 'Concentration', 'Decisions', 'Pace']),
    r('bpd', 'Ball-Playing Defender', 'BPD', 'Bek yang tenang membawa bola dan bisa mengirim umpan panjang akurat.',
      ['Heading', 'Marking', 'Passing', 'Tackling', 'Composure', 'Positioning', 'Jumping Reach', 'Strength'],
      ['First Touch', 'Technique', 'Anticipation', 'Bravery', 'Concentration', 'Decisions', 'Vision', 'Pace']),
    r('ncb', 'No-Nonsense Centre-Back', 'NCB', 'Bek tanpa basa-basi: bola datang, langsung dibuang jauh.',
      ['Heading', 'Marking', 'Tackling', 'Positioning', 'Jumping Reach', 'Strength'],
      ['Aggression', 'Anticipation', 'Bravery', 'Concentration']),
    r('wcb', 'Wide Centre-Back', 'WCB', 'Bek tengah di trio belakang yang sering naik ke sisi lapangan.',
      ['Heading', 'Marking', 'Tackling', 'Positioning', 'Jumping Reach', 'Strength'],
      ['Crossing', 'Dribbling', 'First Touch', 'Passing', 'Anticipation', 'Composure', 'Work Rate', 'Pace', 'Stamina']),
    // Bek sayap
    r('fb', 'Full-Back', 'FB', 'Bek sayap seimbang: bertahan dulu, sesekali membantu serangan.',
      ['Marking', 'Tackling', 'Anticipation', 'Concentration', 'Positioning', 'Teamwork'],
      ['Crossing', 'Dribbling', 'Passing', 'Technique', 'Decisions', 'Work Rate', 'Pace', 'Stamina']),
    r('wb', 'Wing-Back', 'WB', 'Naik turun sepanjang sisi lapangan, rajin mengirim umpan silang.',
      ['Crossing', 'Dribbling', 'Marking', 'Tackling', 'Off the Ball', 'Teamwork', 'Work Rate', 'Acceleration', 'Stamina'],
      ['First Touch', 'Passing', 'Technique', 'Anticipation', 'Decisions', 'Positioning', 'Agility', 'Balance', 'Pace']),
    r('ifb', 'Inverted Full-Back', 'IFB', 'Bek sayap yang bergeser ke tengah saat menyerang, seperti bek tengah ketiga.',
      ['Marking', 'Tackling', 'Composure', 'Positioning', 'Strength'],
      ['Dribbling', 'First Touch', 'Passing', 'Technique', 'Anticipation', 'Concentration', 'Decisions', 'Vision', 'Pace']),
    r('nfb', 'No-Nonsense Full-Back', 'NFB', 'Bek sayap yang jarang naik, fokus menutup winger lawan.',
      ['Marking', 'Tackling', 'Anticipation', 'Positioning', 'Strength'],
      ['Heading', 'Aggression', 'Bravery', 'Concentration', 'Teamwork']),
    r('cwb', 'Complete Wing-Back', 'CWB', 'Wing-back super ofensif yang praktis jadi pemain sayap.',
      ['Crossing', 'Dribbling', 'Technique', 'Flair', 'Off the Ball', 'Teamwork', 'Work Rate', 'Acceleration', 'Stamina'],
      ['First Touch', 'Marking', 'Passing', 'Tackling', 'Anticipation', 'Decisions', 'Positioning', 'Agility', 'Balance', 'Pace']),
    r('iwb', 'Inverted Wing-Back', 'IWB', 'Wing-back yang masuk ke lini tengah untuk membantu membangun serangan.',
      ['Passing', 'Tackling', 'Decisions', 'Teamwork', 'Acceleration', 'Stamina'],
      ['First Touch', 'Marking', 'Technique', 'Anticipation', 'Composure', 'Concentration', 'Off the Ball', 'Positioning', 'Vision', 'Work Rate', 'Agility']),
    // Gelandang bertahan
    r('dm', 'Defensive Midfielder', 'DM', 'Pelindung lini belakang: memotong serangan lawan, umpan sederhana.',
      ['Tackling', 'Anticipation', 'Concentration', 'Positioning', 'Teamwork'],
      ['Marking', 'Passing', 'Aggression', 'Composure', 'Decisions', 'Work Rate', 'Stamina', 'Strength']),
    r('a', 'Anchor', 'A', 'Diam di depan bek, menutup ruang. Hampir tidak pernah ikut menyerang.',
      ['Marking', 'Tackling', 'Anticipation', 'Concentration', 'Decisions', 'Positioning'],
      ['Composure', 'Teamwork', 'Strength']),
    r('dlp', 'Deep-Lying Playmaker', 'DLP', 'Pengatur tempo dari belakang. Semua bola lewat kakinya.',
      ['First Touch', 'Passing', 'Technique', 'Composure', 'Decisions', 'Teamwork', 'Vision'],
      ['Anticipation', 'Off the Ball', 'Positioning', 'Balance']),
    r('bwm', 'Ball-Winning Midfielder', 'BWM', 'Perebut bola agresif yang memburu lawan di seluruh lapangan.',
      ['Tackling', 'Aggression', 'Anticipation', 'Teamwork', 'Work Rate', 'Stamina'],
      ['Marking', 'Bravery', 'Concentration', 'Positioning', 'Agility', 'Pace', 'Strength']),
    r('reg', 'Regista', 'REG', 'Playmaker dalam yang bebas bergerak dan berani mencoba umpan berisiko.',
      ['First Touch', 'Passing', 'Technique', 'Composure', 'Decisions', 'Flair', 'Off the Ball', 'Teamwork', 'Vision'],
      ['Dribbling', 'Long Shots', 'Anticipation', 'Balance']),
    r('hb', 'Half-Back', 'HB', 'Turun di antara dua bek tengah saat tim membangun serangan.',
      ['Marking', 'Tackling', 'Anticipation', 'Composure', 'Concentration', 'Decisions', 'Positioning', 'Teamwork'],
      ['First Touch', 'Passing', 'Aggression', 'Bravery', 'Work Rate', 'Jumping Reach', 'Stamina', 'Strength']),
    // Gelandang tengah
    r('cm', 'Central Midfielder', 'CM', 'Gelandang serba bisa yang menjaga keseimbangan tim.',
      ['First Touch', 'Passing', 'Tackling', 'Decisions', 'Teamwork'],
      ['Technique', 'Anticipation', 'Composure', 'Concentration', 'Off the Ball', 'Vision', 'Work Rate', 'Stamina']),
    r('b2b', 'Box-to-Box Midfielder', 'BBM', 'Mesin lini tengah: bertahan di kotak sendiri, menyerang sampai kotak lawan.',
      ['Passing', 'Tackling', 'Off the Ball', 'Teamwork', 'Work Rate', 'Stamina'],
      ['Dribbling', 'First Touch', 'Long Shots', 'Technique', 'Aggression', 'Anticipation', 'Composure', 'Decisions', 'Positioning', 'Acceleration', 'Balance', 'Pace', 'Strength']),
    r('ap', 'Advanced Playmaker', 'AP', 'Kreator di antara lini lawan, pencipta peluang utama.',
      ['First Touch', 'Passing', 'Technique', 'Composure', 'Decisions', 'Off the Ball', 'Teamwork', 'Vision'],
      ['Dribbling', 'Anticipation', 'Flair', 'Agility']),
    r('mez', 'Mezzala', 'MEZ', 'Gelandang yang menyusup ke half-space dan sering masuk kotak penalti.',
      ['Passing', 'Technique', 'Decisions', 'Off the Ball', 'Work Rate', 'Acceleration'],
      ['Dribbling', 'First Touch', 'Long Shots', 'Tackling', 'Anticipation', 'Composure', 'Vision', 'Balance', 'Stamina']),
    r('car', 'Carrilero', 'CAR', 'Gelandang pekerja yang menutup sisi lapangan untuk rekannya.',
      ['First Touch', 'Passing', 'Tackling', 'Decisions', 'Positioning', 'Teamwork', 'Stamina'],
      ['Technique', 'Anticipation', 'Composure', 'Concentration', 'Off the Ball', 'Vision', 'Work Rate']),
    r('rpm', 'Roaming Playmaker', 'RPM', 'Playmaker yang berkeliling ke mana saja untuk menjemput bola.',
      ['First Touch', 'Passing', 'Technique', 'Anticipation', 'Composure', 'Decisions', 'Off the Ball', 'Teamwork', 'Vision', 'Work Rate', 'Acceleration', 'Stamina'],
      ['Dribbling', 'Long Shots', 'Concentration', 'Flair', 'Positioning', 'Agility', 'Balance', 'Pace']),
    // Gelandang sayap
    r('wm', 'Wide Midfielder', 'WM', 'Gelandang sayap disiplin yang ikut bertahan dan menyerang.',
      ['Passing', 'Tackling', 'Decisions', 'Teamwork', 'Work Rate'],
      ['Crossing', 'First Touch', 'Technique', 'Anticipation', 'Composure', 'Concentration', 'Off the Ball', 'Positioning', 'Vision', 'Stamina']),
    r('w', 'Winger', 'W', 'Pemain sayap klasik: lari ke garis akhir lalu kirim umpan silang.',
      ['Crossing', 'Dribbling', 'Technique', 'Acceleration', 'Agility'],
      ['First Touch', 'Passing', 'Off the Ball', 'Work Rate', 'Balance', 'Pace', 'Stamina']),
    r('wp', 'Wide Playmaker', 'WP', 'Kreator yang mulai dari sayap lalu masuk ke tengah.',
      ['First Touch', 'Passing', 'Technique', 'Composure', 'Decisions', 'Teamwork', 'Vision'],
      ['Dribbling', 'Off the Ball', 'Agility']),
    r('dw', 'Defensive Winger', 'DW', 'Pemain sayap pekerja keras yang menekan bek lawan.',
      ['Technique', 'Anticipation', 'Off the Ball', 'Positioning', 'Teamwork', 'Work Rate', 'Stamina'],
      ['Crossing', 'Dribbling', 'First Touch', 'Marking', 'Tackling', 'Aggression', 'Concentration', 'Decisions', 'Acceleration']),
    // Sayap serang
    r('if', 'Inside Forward', 'IF', 'Penyerang sayap yang memotong ke dalam untuk menembak.',
      ['Dribbling', 'Finishing', 'First Touch', 'Technique', 'Off the Ball', 'Acceleration', 'Agility'],
      ['Long Shots', 'Passing', 'Anticipation', 'Composure', 'Flair', 'Work Rate', 'Balance', 'Pace', 'Stamina']),
    r('iw', 'Inverted Winger', 'IW', 'Pemain sayap yang masuk ke tengah untuk mengumpan atau menembak.',
      ['Crossing', 'Dribbling', 'Passing', 'Technique', 'Acceleration', 'Agility'],
      ['First Touch', 'Long Shots', 'Composure', 'Decisions', 'Off the Ball', 'Vision', 'Work Rate', 'Balance', 'Pace', 'Stamina']),
    r('rmd', 'Raumdeuter', 'RMD', 'Pencari ruang: muncul tiba-tiba di posisi kosong untuk mencetak gol.',
      ['Finishing', 'Anticipation', 'Composure', 'Concentration', 'Decisions', 'Off the Ball', 'Balance'],
      ['First Touch', 'Technique', 'Work Rate', 'Acceleration', 'Stamina']),
    r('wtf', 'Wide Target Forward', 'WTF', 'Pemain sayap jangkung, sasaran umpan panjang dan duel udara.',
      ['Heading', 'Bravery', 'Off the Ball', 'Teamwork', 'Work Rate', 'Jumping Reach', 'Stamina', 'Strength'],
      ['Crossing', 'First Touch', 'Anticipation', 'Balance']),
    // Gelandang serang
    r('am', 'Attacking Midfielder', 'AM', 'Gelandang serang yang aktif masuk kotak dan menembak dari luar.',
      ['First Touch', 'Long Shots', 'Passing', 'Technique', 'Anticipation', 'Decisions', 'Flair', 'Off the Ball'],
      ['Dribbling', 'Finishing', 'Composure', 'Vision', 'Agility']),
    r('ss', 'Shadow Striker', 'SS', 'Penyerang bayangan yang menyusul dari lini kedua untuk mencetak gol.',
      ['Dribbling', 'Finishing', 'First Touch', 'Anticipation', 'Composure', 'Off the Ball', 'Acceleration'],
      ['Passing', 'Technique', 'Concentration', 'Decisions', 'Work Rate', 'Balance', 'Pace', 'Stamina']),
    r('eng', 'Enganche', 'ENG', 'Playmaker klasik nomor 10 yang diam dan menunggu bola datang.',
      ['First Touch', 'Passing', 'Technique', 'Composure', 'Decisions', 'Vision'],
      ['Dribbling', 'Anticipation', 'Flair', 'Off the Ball', 'Teamwork', 'Agility']),
    r('t', 'Trequartista', 'T', 'Seniman bebas tugas bertahan, mengandalkan kreativitas.',
      ['Dribbling', 'First Touch', 'Passing', 'Technique', 'Composure', 'Decisions', 'Flair', 'Off the Ball', 'Vision', 'Acceleration'],
      ['Finishing', 'Anticipation', 'Balance', 'Agility']),
    // Penyerang
    r('af', 'Advanced Forward', 'AF', 'Penyerang yang selalu berdiri di garis terakhir bek lawan, siap berlari ke belakang.',
      ['Dribbling', 'Finishing', 'First Touch', 'Technique', 'Composure', 'Off the Ball', 'Acceleration'],
      ['Passing', 'Anticipation', 'Decisions', 'Work Rate', 'Agility', 'Balance', 'Pace', 'Stamina']),
    r('p', 'Poacher', 'P', 'Pemburu gol di kotak penalti. Sedikit menyentuh bola, banyak mencetak gol.',
      ['Finishing', 'Anticipation', 'Composure', 'Off the Ball'],
      ['First Touch', 'Heading', 'Technique', 'Decisions', 'Acceleration']),
    r('cf', 'Complete Forward', 'CF', 'Penyerang lengkap: bisa menahan bola, mengumpan, dan mencetak gol.',
      ['Dribbling', 'Finishing', 'First Touch', 'Heading', 'Long Shots', 'Passing', 'Technique', 'Anticipation', 'Composure', 'Decisions', 'Off the Ball', 'Vision', 'Acceleration', 'Agility', 'Strength'],
      ['Teamwork', 'Work Rate', 'Balance', 'Jumping Reach', 'Pace', 'Stamina']),
    r('f9', 'False Nine', 'F9', 'Penyerang yang turun ke lini tengah, menarik bek lawan keluar dari posisinya.',
      ['Dribbling', 'First Touch', 'Passing', 'Technique', 'Composure', 'Decisions', 'Off the Ball', 'Vision', 'Acceleration', 'Agility'],
      ['Finishing', 'Anticipation', 'Flair', 'Teamwork', 'Balance']),
    r('dlf', 'Deep-Lying Forward', 'DLF', 'Penyerang yang menjemput bola lalu menghubungkan lini tengah dan depan.',
      ['First Touch', 'Passing', 'Technique', 'Composure', 'Decisions', 'Off the Ball', 'Teamwork'],
      ['Finishing', 'Anticipation', 'Flair', 'Vision', 'Balance', 'Strength']),
    r('tf', 'Target Forward', 'TF', 'Penyerang jangkung dan kuat, tembok untuk bola panjang dan umpan silang.',
      ['Heading', 'Bravery', 'Composure', 'Off the Ball', 'Balance', 'Jumping Reach', 'Strength'],
      ['Finishing', 'First Touch', 'Aggression', 'Anticipation', 'Decisions', 'Teamwork']),
    r('pf', 'Pressing Forward', 'PF', 'Penyerang yang menekan bek lawan tanpa henti sejak menit pertama.',
      ['Aggression', 'Anticipation', 'Bravery', 'Decisions', 'Teamwork', 'Work Rate', 'Acceleration', 'Stamina'],
      ['Finishing', 'First Touch', 'Composure', 'Concentration', 'Off the Ball', 'Agility', 'Balance', 'Pace', 'Strength']),
  ].map((x) => [x.id, x]),
);

// Peran yang tersedia di tiap posisi
export const POSITION_ROLES: Record<Position, string[]> = {
  GK: ['gk', 'sk'],
  DC: ['cd', 'bpd', 'ncb', 'wcb'],
  DR: ['fb', 'wb', 'ifb', 'nfb'],
  DL: ['fb', 'wb', 'ifb', 'nfb'],
  WBR: ['wb', 'cwb', 'iwb'],
  WBL: ['wb', 'cwb', 'iwb'],
  DM: ['dm', 'a', 'dlp', 'bwm', 'reg', 'hb'],
  MC: ['cm', 'b2b', 'dlp', 'ap', 'bwm', 'mez', 'car', 'rpm'],
  MR: ['wm', 'w', 'wp', 'dw'],
  ML: ['wm', 'w', 'wp', 'dw'],
  AMR: ['w', 'if', 'iw', 'rmd', 'wtf'],
  AML: ['w', 'if', 'iw', 'rmd', 'wtf'],
  AMC: ['am', 'ap', 'ss', 'eng', 't'],
  ST: ['af', 'p', 'cf', 'f9', 'dlf', 'tf', 'pf'],
};

/** Kecocokan pemain dengan peran, skala 1-20 (kunci dihitung dua kali lipat) */
export function roleRating(attrs: Record<string, number>, role: Role): number {
  let sum = 0;
  let w = 0;
  for (const a of role.key) {
    sum += attrs[a] * 2;
    w += 2;
  }
  for (const a of role.pref) {
    sum += attrs[a];
    w += 1;
  }
  return sum / w;
}
