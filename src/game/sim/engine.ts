// Mesin pertandingan 2D (versi 2). 22 pemain bergerak dengan kecepatan normal, sementara
// jam pertandingan berjalan 18 kali lebih cepat: satu babak = 150 detik permainan
// (2,5 menit waktu nyata). Tidak ada kendali dari pemain: setiap keputusan (umpan, dribel,
// tembak, tekel, posisi, kapan sprint) dihitung dari atribut, seperti FM.
//
// Versi 2: bola punya tinggi (lambung, pantul, gelinding), kiper menepis atau menangkap di
// posisinya, gol harus melewati garis di antara tiang, offside, garis pertahanan, bola mati
// (lemparan ke dalam, tendangan gawang, bebas, pojok, penalti) dengan aturan jarak, dan gerak
// pemain yang berbeda menurut atribut (kecepatan, akselerasi, reaksi, positioning).
//
// Versi 4: gaya main tim (penguasaan bola, gegenpress, serangan balik, langsung, sayap,
// bertahan), keunggulan kandang, performa harian, kartu kuning/merah, bola mati dari sayap
// diumpan ke kotak, dan bola yang dibuang bek ke luar garis gawang (sepak pojok).
//
// Deterministik: input + seed yang sama selalu menghasilkan pertandingan yang sama,
// jadi hasil yang dihitung di simulasi mingguan bisa ditonton ulang persis sama.

import type { Player, PlayingStyle } from '../types';
import type { Position } from '../data/attributes';
import { Rng, clamp } from '../rng';
import {
  FORMATIONS,
  FORMATION_IDS,
  SHAPES,
  assignXI,
  bestSpot,
  isBox,
  isCB,
  isCentralMid,
  isDef,
  isFB,
  isHold,
  isST,
  isWideMid,
  isWing,
  slotGroup,
  spotFamiliarity,
  type FormationId,
  type Slot,
  type SlotGroup,
  type Spot,
} from './formation';
import { shortName } from '../gen/names';
import { defaultOop, pickRole, playStyle, slotKind, type Duty, type OopRole, type RoleK } from './roleplay';
import { playTraits, traitK } from './traits';
import { ROLE_DUTIES, aiFamiliarity, mentalityLabel, type Tactic, type TacticK } from './tactics';

/** Naik setiap kali hasil mesin berubah untuk input yang sama (tayangan ulang lama tidak cocok lagi) */
export const ENGINE_VERSION = 21;

export const PITCH_W = 105;
export const PITCH_H = 68;
export const HALF = 150; // detik permainan per babak
export const FULL = HALF * 2;
/** v20 satu babak perpanjangan waktu (15 menit) */
export const ET_HALF = HALF / 3;
export const DT = 0.1;
export const GOAL_HALF = 3.66;
export const BAR = 2.44;
export const NET_DEPTH = 1.8;
const G = 9.8;
const ROLL = 2.6; // perlambatan bola menggelinding di rumput (m/s²)
const BOX_X = 16.5;
const BOX_Y = 20.16;
/** v17 arah mencari kantong ruang (meter, bingkai tim) */
const POCKETS: [number, number][] = [[0, -5], [0, 5], [-4, 0], [-4, -4], [-4, 4], [4, 0]];
/** v17 kontrol ruang: lapangan dibagi petak 5 x 4,9 m */
const PC_NX = 21;
const PC_NY = 14;
const PC_N = PC_NX * PC_NY;
const PC_CW = PITCH_W / PC_NX;
const PC_CH = PITCH_H / PC_NY;
/** jangkauan pemain di peta kontrol ruang (m) */
const PC_R = 30;

/** Angka penyetel hasil laga (dikalibrasi lewat scripts/engine.ts) */
export const TUNE = {
  shotK: 6, progW: 45, xgPassW: 4, foul: 0.55, lineGap: 15, runRate: 0.0025, runPass: 0.18,
  hold: 0.5, risk: 1.0, openShot: 0.35, cross: 0.3, tackle: 0.05, speed: 1.15, onT: 0.38,
  /** tembakan dari luar kotak lebih sulit masuk */
  longK: 1.05,
  /** sundulan lebih sulit masuk */
  headK: 0.36,
  /** tambahan peluang gol per meter kiper keluar dari posisi idealnya */
  gkOff: 0.12,
  /** seberapa jauh wing back naik saat menyerang, dan posisi dasar gelandang sayap saat menyerang */
  wbUp: 30,
  wideUp: 58,
  channel: 1,
  /** v21: penyerang menahan garis pertahanan lawan saat menguasai bola (0 = perilaku lama) */
  pin: 1,
  /** v21 peluang per langkah penyerang turun menjemput bola, dikali nilai turun peran + kebiasaan */
  checkRate: 0.0012,
  /** v21: bentuk tim saat tendangan gawang (0 = perilaku lama) */
  gkShape: 1,
  /** pergantian taktis pelatih AI per tim, dan batas tenaga pemain yang dianggap kelelahan */
  aiSubs: 3,
  subTired: 0.72,
  /** kelelahan jangka panjang per detik permainan (pemain stamina 10) */
  tire: 0.0011,
  /** pengali peluang bola keluar garis gawang lewat sentuhan bek/kiper (sepak pojok) */
  cornerK: 2.2,
  /** pengali peluang umpan silang terblok bek yang menempel (sumber sepak pojok terbesar) */
  crossBlock: 1,
  /** peluang gol dalam fase bola mati (setelah sepak pojok / umpan bola mati): pertahanan sudah tersusun */
  spK: 0.45,
  /** striker kiri dari duet penyerang turun menjemput bola */
  drop: 0,
  /** peluang cedera per benturan (tekel, dilanggar) untuk pemain dengan risiko rata-rata */
  injury: 0.026,
  /** nilai dasar mencoba melewati lawan dengan dribel */
  takeOn: -0.15,
  /** nilai umpan aman yang menjaga penguasaan bola */
  keep: 0.4,
  /** tembakan bebas tanpa penjaga hanya diutamakan dari posisi bagus (xG minimal) */
  openXg: 0.06,
  /** bobot peluang (xG) di ujung bawaan bola; risiko direbut mengurangi nilainya */
  carryXg: 0.4, carryRisk: 0.6, carryBase: 0.32, carrySpace: 0.02,
  /** umpan balik langsung ke pengumpan (tanpa lari) kurang disukai: bukan tiki-taka terus */
  giveGo: 0.12,
  /** seberapa banyak kiper yang menutup sudut mengurangi peluang gol */
  gkCover: 0.35,
  /** peluang gol jenuh: tembakan dari dekat tidak pernah pasti masuk (batas atas pMax) */
  pMax: 0.73,
  /** seberapa besar atribut penyelesaian (Finishing / Long Shots / Heading / Free Kick) mengubah peluang gol, per poin dari 10 */
  finK: 0.05,
  /** bobot peluang gol saat memilih menembak / membawa bola mendekat */
  shootV: 4.5,
  /** bobot hukuman umpan ke belakang (di luar sepertiga akhir) */
  back: 0.25,
  /** jarak garis bek di belakang bola saat timnya menguasai bola */
  backLine: 27,
  /** keunggulan kandang (poin atribut mental & teknik) */
  home: 1.1,
  /** performa harian: simpangan tim & pemain (poin atribut; simpangan pemain dikali faktor Consistency) */
  formTeam: 0.3, formPlayer: 0.5,
  /** peluang kartu kuning per pelanggaran */
  card: 0.36,
  /** mentalitas: selisih kualitas tim (poin atribut) -> -1..1, dan kekuatan efeknya */
  rel: 0.4,
  mental: 1,
  /** pengaruh mentalitas pada tiap kecenderungan (per satuan -1..1) */
  mRisk: 0.45, mHold: 0.4, mProg: 0.12, mLong: 0.06, mLine: 2.5, mPress: 0.15, mKeep: 0.5,
  /** sifat bawaan: peluang memakai kaki lemah, dan poin duel udara per cm tinggi di atas 180 */
  weakUse: 0.35,
  height: 0.12,
  /** kekuatan efek skor (unggul bertahan, tertinggal menyerang) di akhir laga */
  gameState: 1,
  /**
   * v14 tekanan laga: poin atribut per (tingkat tekanan × selisih Pressure/Important Matches dari rata-rata),
   * untuk pemain gugup (di bawah rata-rata) dan pemain bermental baja (di atas rata-rata)
   */
  nerve: 0.45, calm: 0.2,
  /** frustrasi: pengali kenaikan, dan tambahan Aggression saat frustrasi penuh */
  frus: 1.5, frusAgg: 10,
  /** peluang diving per keputusan saat dijaga ketat di sekitar kotak penalti, per poin Sportsmanship di bawah 9 */
  dive: 0.03,
  /** peluang pelanggaran taktis (menjatuhkan lawan yang lolos) per poin Dirtiness di atas 10 */
  tactical: 0.04,
  /** v16 jebakan offside: garis maju sekian meter selama sekian detik */
  trapStep: 3.5, trapTime: 1.6,
  /** man marking: bek mengikuti lawan sampai sekian meter di depan garis; jarak tempel dasar */
  manDef: 10, manGap: 1.2,
  /**
   * v17 kontrol ruang: lebar adu cepat (detik), risiko jalur umpan berbasis waktu (detik), seberapa jauh garis
   * mundur menutup ruang dari penyerang cepat (pengali & batas meter), bek menutup ruang berbahaya, hukuman umpan
   * ke ruang yang kalah adu cepat
   */
  pcSigma: 0.4, laneT: 0.45, depthK: 1, depthMax: 8, coverK: 0.5, spaceLose: 0.5,
  /**
   * v18 kiper & bola mati: kehati-hatian bek di kotak sendiri (pengali pelanggaran), peluang tepisan keluar
   * lapangan (sepak pojok), seberapa jauh kiper mau keluar menyambut bola atas (Command of Area)
   */
  boxFoul: 0.5, parryOut: 0.45, claimK: 0.012,
  /** v19 pelatih mengubah taktik di tengah laga (0 = mati, untuk eksperimen) */
  coach: 1,
  /** v18 pergantian pemain menunggu bola mati paling lama sekian detik permainan */
  subWait: 12,
  /** v17 selisih kecepatan puncak (Pace) dan percepatan (Acceleration) antar-pemain (1 = v16); 0.6: Pace 5 = 8,3 m/s, Pace 20 = 10,2 m/s */
  paceK: 0.6, accK: 0.6,
};
/** atribut yang berubah selama laga menurut keadaan mental (tekanan, frustrasi, tekad, kelelahan) */
const MIND_KEYS = ['cmp', 'dec', 'fin', 'pas', 'tec', 'ft', 'lon', 'pen', 'fk', 'agg', 'wor', 'con'] as const;
type MindKey = (typeof MIND_KEYS)[number];
const mindOf = (a: EAttrs) => Object.fromEntries(MIND_KEYS.map((k) => [k, a[k]])) as Record<MindKey, number>;

/** Pengali keputusan menurut gaya main tim */
interface StyleK {
  /** bobot umpan maju */
  prog: number;
  /** hukuman umpan berisiko (lebih tinggi = lebih hati-hati) */
  risk: number;
  /** bonus umpan jauh */
  long: number;
  /** bonus umpan silang */
  cross: number;
  /** bonus dribel */
  drib: number;
  /** lama menahan bola sebelum memutuskan */
  hold: number;
  /** garis pertahanan: + = lebih dalam */
  line: number;
  /** intensitas menekan */
  press: number;
  /** keinginan menembak */
  shoot: number;
  /** nilai umpan aman untuk menjaga penguasaan bola */
  keep: number;
}
const NEUTRAL_K: StyleK = { prog: 1, risk: 1, long: 0, cross: 0, drib: 0, hold: 1, line: 0, press: 1, shoot: 1, keep: 1 };
export const STYLE_K: Record<PlayingStyle, StyleK> = {
  Possession: { prog: 0.8, risk: 1.4, long: -0.1, cross: -0.04, drib: -0.03, hold: 1.4, line: -2, press: 1.05, shoot: 0.85, keep: 1.15 },
  Gegenpress: { prog: 1.05, risk: 1, long: -0.02, cross: 0, drib: 0, hold: 1, line: 0, press: 1.4, shoot: 1, keep: 1 },
  Counter: { prog: 1.4, risk: 0.9, long: 0.08, cross: 0, drib: 0.05, hold: 0.8, line: 2, press: 0.9, shoot: 1.1, keep: 0.9 },
  Direct: { prog: 1.3, risk: 0.8, long: 0.16, cross: 0.06, drib: -0.02, hold: 0.75, line: 0, press: 1, shoot: 1.1, keep: 0.85 },
  'Wing Play': { prog: 1.05, risk: 1, long: 0, cross: 0.16, drib: 0.04, hold: 1, line: 0, press: 1, shoot: 0.95, keep: 1 },
  Defensive: { prog: 1, risk: 1.2, long: 0.05, cross: 0, drib: -0.02, hold: 1, line: 2, press: 0.9, shoot: 1.05, keep: 1 },
};
const ALL_STYLES = Object.keys(STYLE_K) as PlayingStyle[];
/** atribut yang naik turun menurut performa harian & keunggulan kandang (fisik tidak) */
const FORM_KEYS = ['pas', 'vis', 'tec', 'dri', 'ft', 'fin', 'lon', 'cro', 'hea', 'tck', 'mar', 'cmp', 'dec', 'pos', 'ant', 'otb', 'tea', 'con', 'fla'] as const;
const GK_KEYS = ['gk', 'ref', 'han', 'ono', 'aer', 'cmd'] as const;

/** Gaya main tetap untuk tim nasional (dari kode negara) */
export function nationStyle(countryId: string): PlayingStyle {
  return new Rng(`style:${countryId}`).pick(ALL_STYLES);
}

export type { Slot, FormationId } from './formation';
// posisi dasar bawaan tiap tempat (dipakai kalau formasi tim tidak diketahui)
const BASE = {} as Record<Slot, [number, number]>;
for (const f of FORMATION_IDS) for (const spot of FORMATIONS[f].spots) BASE[spot.slot] ??= spot.base;
/** bek murni (bek tengah dan bek sayap biasa); wing back dihitung penyerang saat timnya menyerang */
/** Pengali peluang dari atribut penyelesaian (10 = rata-rata = 1.0; 20 = 1.5; 5 = 0.75) */
const skillK = (s: number) => Math.max(0.5, 1 + (s - 10) * TUNE.finK);
const isBack = (x: Slot) => isCB(x) || x === 'RB' || x === 'LB';
const isWB = (x: Slot) => x === 'RWB' || x === 'LWB';
/** pergantian pemain per tim per laga */
export const MAX_SUBS = 5;
const GROUP_OF: Record<Position, SlotGroup> = {
  GK: 'GK', DR: 'DEF', DC: 'DEF', DL: 'DEF', WBR: 'DEF', WBL: 'DEF',
  DM: 'MID', MC: 'MID', MR: 'ATT', ML: 'ATT', AMR: 'ATT', AMC: 'ATT', AML: 'ATT', ST: 'ATT',
};

/** Atribut yang dipakai mesin (1-20) */
export interface EAttrs {
  pace: number; acc: number; sta: number; agi: number; str: number; jmp: number;
  pas: number; vis: number; tec: number; dri: number; ft: number; fin: number; lon: number; cro: number; hea: number;
  tck: number; mar: number; fk: number; pen: number;
  cmp: number; dec: number; pos: number; ant: number; otb: number; wor: number; tea: number; con: number; agg: number;
  /** flair (gaya bermain berani & kreatif) dan bravery (berani duel, blok, sundul) */
  fla: number; bra: number;
  /** pengali risiko cedera (1 = rata-rata; dari Injury Proneness, untuk pemain kita juga gaya hidup) */
  inj: number;
  /** tinggi badan (cm): pemain jangkung unggul di duel udara */
  hgt: number;
  /** kaki lemah (1-20): tembakan & umpan dengan kaki lemah kurang akurat */
  wf: number;
  /** rata-rata atribut kiper (3 untuk pemain lapangan) */
  gk: number;
  ref: number; han: number; ono: number; aer: number; cmd: number; kic: number; rus: number;
  /**
   * v18 kiper: communication (mengatur lini belakang & bola mati), eccentricity (keluar sarang tak terduga),
   * punching (kecenderungan meninju bola atas), throwing (lemparan cepat & akurat)
   */
  com: number; ecc: number; pun: number; thr: number;
  /** natural fitness: pulih lebih cepat, tidak cepat lelah */
  nf: number;
  /**
   * Kepribadian & atribut tersembunyi (v14): pressure & important matches (tampil di laga besar),
   * consistency (naik turunnya performa harian), temperament (mudah frustrasi), determination (pantang menyerah),
   * leadership (kapten menenangkan rekan), dirtiness (pelanggaran sengaja), sportsmanship (tidak diving)
   */
  pre: number; imp: number; cons: number; tem: number; det: number; lea: number; dirt: number; spo: number;
}

export interface EP {
  id: string;
  name: string;
  num: number;
  slot: Slot;
  user?: boolean;
  a: EAttrs;
  /** peran (id dari data/roles.ts) yang diminta pelatih: menentukan gaya main di lapangan */
  role?: string;
  /** tugas peran dari pelatih: bertahan / dukungan / menyerang */
  duty?: Duty;
  /** kebiasaan bermain pribadi (lihat traits.ts) */
  traits?: string[];
  /** pemahaman taktik pelatih 0..1 */
  fam?: number;
  /** peran tanpa bola dari pelatih (kosong = bawaan dari peran & tugas) */
  oop?: OopRole;
}

export interface ETeam {
  id: string;
  name: string;
  color: string;
  color2: string;
  xi: EP[];
  /** pemain kita masuk dari bangku di detik permainan ini, menggantikan slot ini */
  sub?: { at: number; player: EP; slot: Slot };
  /** pemain cadangan yang bisa masuk menggantikan pemain cedera */
  bench?: EP[];
  /** gaya main pelatih */
  style?: PlayingStyle;
  /** formasi pelatih (bawaan 4-3-3) */
  formation?: FormationId;
  /** instruksi taktik pelatih (kalau tidak ada: dari gaya main) */
  tactic?: TacticK;
}

/** v20 adu penalti: urutan penendang, skor, dan tahap tendangan yang sedang berjalan */
export interface Shootout {
  order: [Body[], Body[]];
  next: [number, number];
  goals: [number, number];
  taken: [number, number];
  /** tim yang sedang menendang */
  turn: 0 | 1;
  phase: 'gather' | 'walk' | 'run' | 'fly';
  timer: number;
  taker: Body | null;
  out: 'goal' | 'save' | 'miss';
  saved: boolean;
}

/** v19 keadaan pelatih dalam laga */
interface Coach {
  /** watak -1 (sabar) .. 1 (cepat bereaksi & berani) */
  bold: number;
  /** mentalitas awal dari taktiknya */
  ment0: number;
  /** jumlah instruksi pembuka kebuntuan yang sudah dipakai, dan xG saat instruksi terakhir */
  unlock: number;
  xgAt: number;
  used: string[];
  pressed: boolean;
  parked: boolean;
  chase: boolean;
  protect: boolean;
}
const newCoach = (bold: number, ment0: number): Coach => ({ bold, ment0, unlock: 0, xgAt: 0, used: [], pressed: false, parked: false, chase: false, protect: false });

/** v19 peran yang cocok untuk tiap jenis tempat (pemain dipindah ke tempat lain memakai peran bawaan kalau perannya tidak cocok) */
const KIND_ROLES: Record<string, string[]> = {
  gk: ['gk', 'sk'],
  cb: ['cd', 'bpd', 'ncb', 'lib', 'wcb'],
  fb: ['fb', 'wb', 'ifb', 'nfb', 'cwb', 'iwb'],
  dm: ['dm', 'a', 'dlp', 'bwm', 'reg', 'hb', 'sv'],
  cm: ['cm', 'b2b', 'dlp', 'ap', 'bwm', 'mez', 'car', 'rpm'],
  wide: ['wm', 'w', 'wp', 'dw', 'if', 'iw', 'rmd', 'wtf'],
  am: ['am', 'ap', 'ss', 'eng', 't'],
  st: ['af', 'p', 'cf', 'f9', 'dlf', 'tf', 'pf'],
};
function defaultRole(slot: Slot): [string, Duty] {
  const k = slotKind(slot);
  if (k === 'gk') return ['gk', 'De'];
  if (k === 'cb') return ['cd', 'De'];
  if (k === 'fb') return [slot === 'RWB' || slot === 'LWB' ? 'wb' : 'fb', 'Su'];
  if (k === 'dm') return ['dm', 'De'];
  if (k === 'cm') return slot === 'CM' ? ['dm', 'De'] : ['cm', 'Su'];
  if (k === 'wide') return [isWideMid(slot) ? 'wm' : 'w', 'Su'];
  if (k === 'am') return ['am', 'Su'];
  return ['af', 'At'];
}
const roleFits = (role: string, slot: Slot) =>
  KIND_ROLES[slotKind(slot)].includes(role) || (slot === 'CM' && KIND_ROLES.dm.includes(role)) || (isHold(slot) && KIND_ROLES.cm.includes(role));

export interface EngineInput {
  seed: string;
  home: ETeam;
  away: ETeam;
  /** lapangan netral (turnamen): tanpa keunggulan kandang */
  neutral?: boolean;
  /**
   * Tingkat tekanan laga 0..1 (v14): laga liga biasa 0.35, final 1. Pemain dengan Pressure & Important
   * Matches tinggi tampil lebih tenang di laga besar, yang rendah gugup.
   */
  stakes?: number;
  /**
   * v20 laga gugur (piala): kalau imbang setelah 90 menit, perpanjangan waktu 2 x 15 menit, lalu adu
   * penalti. Untuk leg kedua, `agg` = gol leg sebelumnya [tim tuan rumah laga ini, tim tamu laga ini].
   */
  knockout?: boolean;
  agg?: [number, number];
}

/** Risiko cedera dari Injury Proneness (sama dengan rumus cedera mingguan) */
export const injuryRisk = (p: Player) => Math.max(0.15, 1 + (p.hidden['Injury Proneness'] - 10) / 10);

export function engineAttrs(p: Player): EAttrs {
  const t = p.technical;
  const m = p.mental;
  const ph = p.physical;
  const g = p.goalkeeping;
  const keeper = p.mainPosition === 'GK';
  return {
    pace: ph.Pace, acc: ph.Acceleration, sta: ph.Stamina, agi: ph.Agility, str: ph.Strength, jmp: ph['Jumping Reach'],
    pas: t.Passing, vis: m.Vision, tec: t.Technique, dri: t.Dribbling, ft: t['First Touch'], fin: t.Finishing,
    lon: t['Long Shots'], cro: t.Crossing, hea: t.Heading, tck: t.Tackling, mar: t.Marking,
    fk: t['Free Kick Taking'], pen: t['Penalty Taking'],
    cmp: m.Composure, dec: m.Decisions, pos: m.Positioning, ant: m.Anticipation, otb: m['Off the Ball'],
    wor: m['Work Rate'], tea: m.Teamwork, con: m.Concentration, agg: m.Aggression, fla: m.Flair, bra: m.Bravery,
    inj: injuryRisk(p),
    hgt: p.heightCm,
    wf: Math.min(p.leftFoot, p.rightFoot),
    gk: keeper ? (g.Handling + g.Reflexes + g['One on Ones'] + g['Command of Area']) / 4 : 3,
    ref: keeper ? g.Reflexes : 3, han: keeper ? g.Handling : 3, ono: keeper ? g['One on Ones'] : 3,
    aer: keeper ? g['Aerial Reach'] : 3, cmd: keeper ? g['Command of Area'] : 3, kic: keeper ? g.Kicking : 3,
    rus: keeper ? g['Rushing Out (Tendency)'] : 3,
    com: keeper ? g.Communication : 3, ecc: keeper ? g.Eccentricity : 3, pun: keeper ? g['Punching (Tendency)'] : 3,
    thr: keeper ? g.Throwing : 3,
    nf: ph['Natural Fitness'],
    pre: p.personality.Pressure, imp: p.hidden['Important Matches'], cons: p.hidden.Consistency,
    tem: p.personality.Temperament, det: m.Determination, lea: m.Leadership, dirt: p.hidden.Dirtiness,
    spo: p.personality.Sportsmanship,
  };
}

/** Lengkapi atribut dari input versi lama (tayangan ulang save lama) */
function fullAttrs(a: Partial<EAttrs>): EAttrs {
  const gk = a.gk ?? 3;
  const d = (v: number | undefined, def = 10) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  return {
    pace: d(a.pace), acc: d(a.acc), sta: d(a.sta), agi: d(a.agi), str: d(a.str), jmp: d(a.jmp),
    pas: d(a.pas), vis: d(a.vis), tec: d(a.tec), dri: d(a.dri), ft: d(a.ft), fin: d(a.fin), lon: d(a.lon),
    cro: d(a.cro), hea: d(a.hea), tck: d(a.tck), mar: d(a.mar), fk: d(a.fk, d(a.lon)), pen: d(a.pen, d(a.fin)),
    cmp: d(a.cmp), dec: d(a.dec), pos: d(a.pos), ant: d(a.ant), otb: d(a.otb), wor: d(a.wor), tea: d(a.tea),
    con: d(a.con), agg: d(a.agg), fla: d(a.fla), bra: d(a.bra), inj: d(a.inj, 1), hgt: d(a.hgt, 180), wf: d(a.wf, 12), gk,
    ref: d(a.ref, gk), han: d(a.han, gk), ono: d(a.ono, gk), aer: d(a.aer, gk), cmd: d(a.cmd, gk), kic: d(a.kic, 10),
    rus: d(a.rus, 10), nf: d(a.nf, 10), com: d(a.com, gk), ecc: d(a.ecc, gk > 3 ? 8 : 3), pun: d(a.pun, gk > 3 ? 10 : 3),
    thr: d(a.thr, gk > 3 ? 10 : 3),
    pre: d(a.pre, 11), imp: d(a.imp), cons: d(a.cons), tem: d(a.tem, 11), det: d(a.det), lea: d(a.lea), dirt: d(a.dirt, 8),
    spo: d(a.spo, 11),
  };
}

/** Pemain bermain di luar posisinya: membaca permainan sedikit lebih lambat */
function outOfPosition(a: EAttrs, fam: number): EAttrs {
  if (fam >= 15) return a;
  const d = (15 - fam) * 0.2;
  for (const k of ['pos', 'dec', 'ant', 'otb'] as const) a[k] = Math.max(1, a[k] - d);
  return a;
}

/** Susun 11 pemain sesuai formasi pelatih. Pemain kita masuk kalau `userStarts`. */
export function pickXI(
  squad: Player[],
  user: Player | undefined,
  userStarts: boolean,
  formation: FormationId = '4-3-3',
  tactic?: Tactic,
  /** pemahaman taktik tiap pemain (bawaan: perkiraan untuk pemain AI) */
  famOf?: (p: Player) => number | undefined,
): { xi: EP[]; userSlot?: Slot; bench: EP[] } {
  if (tactic) formation = tactic.formation;
  const spots = FORMATIONS[formation].spots;
  const fam = (p: Player) => (tactic ? (famOf?.(p) ?? aiFamiliarity(p, tactic)) : undefined);
  // pemain wajib memainkan peran yang dipilih pelatih untuk tempat itu
  const roleAt = (p: Player, i: number) => (tactic ? tactic.slots[i] : { role: pickRole(p, spots[i].pos), duty: undefined });
  const others = squad.filter((p) => !p.isUser);
  const fixed = user && userStarts ? user : undefined;
  const chosen = assignXI(fixed ? [fixed, ...others] : others, formation, (p) => p.ca, fixed);
  const xi: EP[] = [];
  let userSlot: Slot | undefined;
  spots.forEach((spot, i) => {
    const p = chosen.get(i);
    if (!p) return;
    const isUser = p === fixed;
    if (isUser) userSlot = spot.slot;
    const rd = roleAt(p, i);
    xi.push({
      id: p.id, name: shortName(p), num: spot.num, slot: spot.slot, user: isUser || undefined,
      a: outOfPosition(engineAttrs(p), spotFamiliarity(p, spot)), role: rd.role, duty: rd.duty, traits: playTraits(p), fam: fam(p),
      ...('oop' in rd && rd.oop ? { oop: rd.oop } : {}),
    });
  });
  // bangku cadangan: 1 kiper, 2 bek, 2 gelandang, 2 penyerang (yang terbaik dari sisa skuad)
  const bench: EP[] = [];
  const rest = others.filter((q) => !xi.some((e) => e.id === q.id)).sort((a, b) => b.ca - a.ca);
  for (const [group, n] of [['GK', 1], ['DEF', 2], ['MID', 2], ['ATT', 2]] as const) {
    for (const p of rest.filter((q) => GROUP_OF[q.mainPosition] === group).slice(0, n)) {
      const si = bestSpot(p, formation);
      const rd = roleAt(p, si);
      bench.push({
        id: p.id, name: shortName(p), num: 12 + bench.length, slot: spots[si].slot, a: engineAttrs(p), role: rd.role, duty: rd.duty,
        traits: playTraits(p), fam: fam(p), ...('oop' in rd && rd.oop ? { oop: rd.oop } : {}),
      });
    }
  }
  return { xi, userSlot, bench };
}

/** Tempat untuk pemain kita saat masuk dari bangku (posisi terbaiknya di formasi) */
export function slotFor(p: Player, formation: FormationId = '4-3-3'): Slot {
  return FORMATIONS[formation].spots[bestSpot(p, formation)].slot;
}

/** Peran pemain di tempat terbaiknya pada formasi ini (peran dari taktik pelatih kalau ada) */
export function roleFor(p: Player, formation: FormationId = '4-3-3', tactic?: Tactic): { role: string; duty?: Duty; oop?: OopRole } {
  const f = tactic?.formation ?? formation;
  const i = bestSpot(p, f);
  return tactic ? tactic.slots[i] : { role: pickRole(p, FORMATIONS[f].spots[i].pos) };
}

/** Angka gaya main tim dari instruksi taktik pelatih */
function styleOfTactic(t: TacticK): StyleK {
  const d = t.directness;
  return {
    prog: 1 + 0.1 * d + (t.passIntoSpace ? 0.05 : 0) + 0.04 * t.mentality,
    risk: 1.1 - 0.12 * d - 0.04 * t.mentality - 0.04 * t.creative,
    long: 0.06 * d,
    cross: (t.focus === 'sayap' ? 0.08 : 0) + Math.max(0, t.width) * 0.03 + (t.crosses === 'tinggi' ? 0.03 : 0),
    drib: 0.04 * t.dribble + 0.02 * t.creative,
    hold: 1 - 0.15 * t.tempo + (d < 0 ? 0.1 : 0),
    line: -1.2 * t.line,
    press: 1 + 0.15 * t.press + 0.03 * t.engage,
    shoot: 1 + (t.shootOnSight ? 0.12 : 0) - (t.workIntoBox ? 0.1 : 0) + 0.03 * t.mentality,
    keep: 1 + (d < 0 ? -0.08 * d : 0) + (t.playOut ? 0.04 : 0) - 0.03 * t.tempo,
  };
}

export interface PStats {
  passes: number;
  passesOk: number;
  keyPasses: number;
  shots: number;
  onTarget: number;
  goals: number;
  assists: number;
  tackles: number;
  interceptions: number;
  dribbles: number;
  lost: number;
  saves: number;
  conceded: number;
  offsides: number;
  /** jenis gol: dari luar kotak (> 18 m), bola mati (penalti / tendangan bebas langsung), sundulan */
  longGoals: number;
  setGoals: number;
  headGoals: number;
  fouls: number;
  yellow: number;
  red: number;
  /** percobaan melewati lawan dengan dribel */
  takeOns: number;
  /** umpan terobosan ke ruang di belakang garis pertahanan */
  throughBalls: number;
  /** 1 kalau cedera di laga ini */
  injured: number;
  on: number; // detik permainan mulai main
  off?: number;
  /** menit jam pertandingan saat masuk / keluar (tanpa menit tambahan) */
  onMin?: number;
  offMin?: number;
  /** duel udara yang dimenangkan (saat lawan ikut melompat) */
  aerialWon?: number;
}

export type EventKind =
  | 'goal' | 'shot' | 'save' | 'miss' | 'block' | 'half' | 'full' | 'sub' | 'kickoff' | 'penalty' | 'corner' | 'added'
  | 'freekick' | 'offside' | 'yellow' | 'red' | 'injury' | 'tactic' | 'extra' | 'pens' | 'shootout';
export interface MatchEvent {
  t: number;
  min: number;
  kind: EventKind;
  side: 0 | 1;
  name?: string;
  assist?: string;
  /** gol bunuh diri (nama = pemain lawan yang terakhir menyentuh bola) */
  og?: boolean;
  /** kartu merah karena kartu kuning kedua */
  second?: boolean;
  /** kartu karena diving (pura-pura dilanggar) */
  dive?: boolean;
  /** kartu karena protes keras kepada wasit */
  dissent?: boolean;
  /** menit tambahan (injury time): 45+2 = min 45, plus 2. Untuk event 'added': jumlah menit tambahan */
  plus?: number;
  /** v19 keputusan pelatih (event 'tactic'): mentalitas, instruksi, atau formasi baru */
  note?: string;
  /** v20 tendangan adu penalti (event 'shootout'): masuk atau tidak, dan skor adu penalti setelahnya */
  scored?: boolean;
  pens?: [number, number];
}

export interface Body {
  p: EP;
  /** gaya main perannya */
  rk: RoleK;
  /** geser posisi mencari ruang (pemain dengan kebebasan bergerak), bingkai tim */
  rx: number;
  ry: number;
  side: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  on: boolean;
  st: PStats;
  cool: number; // jeda keputusan / tekel
  run: number; // sisa waktu lari menembus pertahanan
  think: number; // sisa waktu sampai pemain membaca ulang situasi (reaksi)
  ox: number; // kesalahan posisi pribadi (berubah pelan)
  oy: number;
  lean: number; // kecenderungan berdiri di garis offside
  sprint: boolean;
  energy: number;
  /** kelelahan jangka panjang (menit-menit di lapangan); tenaga tidak bisa pulih melebihi 1 - tire */
  tire: number;
  /** kualitas teknik & mental bawaan (tanpa performa harian), untuk mentalitas tim */
  qual: number;
  dive: number; // kiper: sisa waktu terjun
  hurt: number; // detik permainan saat cedera (-1 = sehat); pemain cedera terkapar sampai diganti
  /** pemain yang diganti sedang berjalan keluar lapangan (masih digambar, tidak ikut bermain) */
  leaving?: boolean;
  /** pemain pengganti berdiri di pinggir lapangan, menunggu pemain yang diganti keluar dulu */
  waiting?: boolean;
  /** pemain pengganti sedang berlari dari pinggir lapangan ke posisinya (bola mati menunggu) */
  entering?: boolean;
  /** frustrasi 0..1 (dilanggar, direbut, kebobolan, peluang gagal); Temperament rendah = cepat naik */
  frus: number;
  /** atribut mental & teknik setelah performa harian, sebelum efek tekanan, frustrasi, dan kelelahan */
  base: Record<MindKey, number>;
  /** tugas Otomatis: tugas yang sedang dimainkan (mengikuti mentalitas tim) */
  autoDuty?: Duty;
  /** v17 lari menembus pertahanan: celah yang dituju (y bingkai tim, -1 = belum dipilih) */
  runY: number;
  /** v21 turun menjemput bola (checking): >0 detik tersisa, <0 jeda sebelum boleh lagi */
  check: number;
  /** v21 tambahan turun dari kebiasaan bermain (Turun menjemput bola) */
  tdrop: number;
  /** v19 tempat asli pemain (posisi alaminya), dipakai pelatih saat menyusun ulang bentuk tim */
  home: Slot;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

interface Shot {
  by: Body;
  outcome: 'goal' | 'save' | 'miss';
  assist?: Body;
  blocker: Body | null;
  /** x kiper saat tembakan dilepas (bidang penyelamatan) */
  gkX: number;
  passed: boolean;
  /** pemain lawan yang sudah dilewati bola (dibelokkan sekali saja) */
  near?: Body[];
  kind?: 'long' | 'set' | 'head';
  /** berasal dari bola mati (penalti, tendangan bebas, sepak pojok) */
  sp?: boolean;
  /** penalti: ke mana kiper menjatuhkan diri (sudah memilih arah saat bola ditendang) */
  diveY?: number;
}

interface Pass {
  from: Body;
  to: Body;
  air: boolean;
  cross: boolean;
  tx: number;
  ty: number;
  offside: Body[];
  setPiece: boolean;
}

type RestartKind = 'kickoff' | 'throw' | 'goalkick' | 'corner' | 'free' | 'penalty';
interface Restart {
  side: 0 | 1;
  x: number;
  y: number;
  wait: number;
  kind: RestartKind;
  /** tendangan bebas langsung ke gawang */
  direct?: boolean;
  /** tendangan bebas dari sayap: diumpan ke kotak seperti sepak pojok */
  cross?: boolean;
  /** lama menunggu pemain menuju posisinya (detik permainan) */
  setup?: number;
  /** penalti: penendang sudah mengambil ancang-ancang dan mulai berlari ke bola */
  runup?: number;
  /**
   * v18 variasi sepak pojok: pendek ke bek sayap, bola atas ke tiang dekat / tiang jauh, bola mendatar ke tepi
   * kotak, atau bola atas ke pemain terkuat di udara
   */
  routine?: CornerRoutine;
}

type CornerRoutine = 'short' | 'near' | 'far' | 'edge' | 'mix';
const CORNER_ROUTINES: [CornerRoutine, number][] = [['short', 0.12], ['near', 0.25], ['far', 0.2], ['edge', 0.08], ['mix', 0.35]];

/** Lama selebrasi gol (detik permainan, jam berhenti); 2,5 detik terakhir pemain mulai kembali ke posisi */
const CELEBRATE = 9;

/** Bola mati yang menghentikan jam: pelanggaran, sepak pojok, penalti, sepak mula, tendangan gawang */
const FROZEN: ReadonlySet<RestartKind> = new Set(['free', 'corner', 'penalty', 'kickoff', 'goalkick']);
/** Batas waktu menunggu semua pemain siap di posisinya saat jam berhenti (detik permainan) */
const SETUP_MAX: Partial<Record<RestartKind, number>> = { free: 6, corner: 8, penalty: 6, kickoff: 10, goalkick: 5 };
/** Jarak toleransi pemain dari posisinya sebelum bola mati diambil */
const SETUP_TOL: Partial<Record<RestartKind, number>> = { kickoff: 1, goalkick: 3 };

/** Wasit dan dua asisten wasit (hanya untuk tampilan; tidak memengaruhi jalannya laga) */
export interface Official {
  role: 'ref' | 'ar1' | 'ar2';
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Bola mati: bola masih bergulir keluar / wasit meniup, lalu bola ditaruh di titik restart */
interface Dead {
  kind: RestartKind;
  side: 0 | 1;
  x: number;
  y: number;
  t: number;
}

export const minuteOf = (t: number) => Math.min(90, Math.floor((t / FULL) * 90) + (t >= FULL ? 0 : 1));

/** Kecepatan puncak (m/s): ditentukan pace, turun saat lelah (v17: selisih antar-pemain dipersempit lewat TUNE.paceK) */
export const topSpeed = (pace: number) => (7.96 + (pace - 12) * 0.18 * TUNE.paceK) * TUNE.speed;
const vmaxOf = (b: Body) => topSpeed(b.p.a.pace) * (0.8 + 0.2 * b.energy);
/**
 * Percepatan awal (m/s²): ditentukan acceleration (dan sedikit agility). Percepatan mengecil
 * saat mendekati kecepatan puncak, jadi pemain ber-acceleration tinggi unggul di beberapa meter
 * pertama, sedangkan pemain ber-pace tinggi menyusul di lari yang panjang.
 */
export const startAccel = (acc: number, agi: number) => (7 + (acc - 12) * 0.4 * TUNE.accK) * (1 + agi * 0.01);
const accOf = (b: Body) => startAccel(b.p.a.acc, b.p.a.agi);
/** Satu langkah lari lurus dari kecepatan v (untuk uji balap lari) */
export function sprintStep(v: number, acc: number, vmax: number): number {
  return Math.min(vmax, v + acc * (1 - 0.6 * Math.min(1, v / vmax)) * DT);
}

export class Match {
  readonly input: EngineInput;
  readonly rng: Rng;
  t = 0;
  /** babak: 1-2 waktu normal, 3-4 perpanjangan waktu, 5 adu penalti */
  half: 1 | 2 | 3 | 4 | 5 = 1;
  score: [number, number] = [0, 0];
  events: MatchEvent[] = [];
  bodies: Body[] = [];
  bench: Body[] = [];
  /** pemain cadangan untuk menggantikan pemain cedera */
  reserves: Body[] = [];
  /** jumlah pergantian tiap tim (maksimal MAX_SUBS) */
  subs: [number, number] = [0, 0];
  ball: Ball = { x: 52.5, y: 34, z: 0, vx: 0, vy: 0, vz: 0 };
  owner: Body | null = null;
  lastTouch: Body | null = null;
  lastPasser: Body | null = null;
  poss: 0 | 1 = 0;
  possTime: [number, number] = [0, 0];
  shots: [number, number] = [0, 0];
  onTarget: [number, number] = [0, 0];
  pass: Pass | null = null;
  shot: Shot | null = null;
  restart: Restart | null = null;
  dead: Dead | null = null;
  /** bola sudah di jaring (gol) */
  inNet = false;
  pause = 0; // jeda setelah gol
  /** selebrasi gol: tim yang mencetak dan pencetaknya (null = gol bunuh diri) */
  private celeb: { side: 0 | 1; scorer: Body | null } | null = null;
  /** pergantian yang menunggu bola mati: keluar, masuk */
  private pendingSubs: { out: Body; sub: Body; at: number }[] = [];
  /** pergantian yang sedang berlangsung: yang keluar berjalan ke garis, pengganti menunggu lalu masuk */
  subbing: { out: Body; sub: Body }[] = [];
  /** jumlah pemain pengganti yang masih berjalan ke posisinya */
  private entering = 0;
  /** instruksi taktik tiap tim (null: tanpa taktik, pakai gaya main) */
  private tk: [TacticK | null, TacticK | null] = [null, null];
  /** detik permainan saat tim terakhir merebut bola (untuk serangan balik & counter-press) */
  private wonAt: [number, number] = [-99, -99];
  done = false;
  /**
   * Wasit (mengikuti bola menyusuri diagonal) dan asisten wasit di garis samping: AR1 di sisi atas menjaga
   * separuh kanan, AR2 di sisi bawah separuh kiri, masing-masing sejajar bek kedua terakhir.
   */
  officials: Official[] = [
    { role: 'ref', x: 52.5, y: 26, vx: 0, vy: 0 },
    { role: 'ar1', x: 52.5, y: -1.4, vx: 0, vy: 0 },
    { role: 'ar2', x: 52.5, y: PITCH_H + 1.4, vx: 0, vy: 0 },
  ];
  fouls: [number, number] = [0, 0];
  corners: [number, number] = [0, 0];
  /** gol dari bola mati (penalti, tendangan bebas, dan sepak pojok / umpan bola mati) */
  setPieceGoals = 0;
  /** pengali gaya main tiap tim (gaya pelatih + mentalitas saat ini) */
  readonly k: [StyleK, StyleK];
  /** gaya main dasar pelatih */
  private readonly baseK: [StyleK, StyleK];
  private nextMental = 0;
  private kickoffAfter: 0 | 1 | null = null;
  private traj: { x: number; y: number; z: number }[] = [];
  /** serangan dari bola mati masih berlangsung sampai detik ini */
  private spUntil = -1;
  private spSide: 0 | 1 = 0;
  /** bola baru saja dibuang tim ini ke luar: rekan setim (termasuk kiper) tidak menjemputnya */
  private noTouch: { side: 0 | 1; until: number } | null = null;

  /** v17 kontrol ruang: waktu tercepat tiap tim sampai di tiap petak, dan penguasaan ruang tim tuan rumah (0..1) */
  private pcT: [Float64Array, Float64Array] = [new Float64Array(PC_N), new Float64Array(PC_N)];
  private pc = new Float64Array(PC_N).fill(0.5);
  private pcNext = 0;
  /** v17 garis pertahanan mundur sekian meter untuk menutup ruang di belakangnya dari penyerang yang lebih cepat */
  private depth: [number, number] = [0, 0];

  /** posisi dasar tiap tempat, per tim (dari formasi pelatih) */
  private bases: [Record<string, [number, number]>, Record<string, [number, number]>] = [{}, {}];
  /** v19 bentuk tim saat ini: formasi awal, atau bentuk baru dari pelatih di tengah laga */
  shape: [string, string] = ['4-3-3', '4-3-3'];
  /** v19 jumlah xG peluang tiap tim (pelatih membaca jalannya laga) */
  xgFor: [number, number] = [0, 0];
  /** v19 keadaan pelatih tiap tim */
  private coach: [Coach, Coach];
  private coachNext: [number, number] = [0, 0];
  /** v19 angka acak keputusan pelatih (terpisah supaya tidak menggeser jalannya laga) */
  private crng: Rng;

  constructor(input: EngineInput) {
    this.input = input;
    [input.home, input.away].forEach((t, i) => {
      for (const spot of FORMATIONS[t.formation ?? '4-3-3'].spots) this.bases[i][spot.slot] = spot.base;
      this.shape[i] = t.formation ?? '4-3-3';
    });
    // v19 watak pelatih: ada yang cepat bereaksi & berani, ada yang sabar (generator terpisah dari jalannya laga)
    const cr = new Rng(`coach:${input.seed}`);
    this.crng = cr;
    this.coach = [input.home, input.away].map((t) => newCoach(cr.float(-1, 1), t.tactic?.mentality ?? 0)) as [Coach, Coach];
    this.rng = new Rng(`engine2:${input.seed}`);
    const teams = [input.home, input.away];
    this.tk = [input.home.tactic ?? null, input.away.tactic ?? null];
    this.baseK = teams.map((t) => (t.tactic ? styleOfTactic(t.tactic) : (STYLE_K[t.style!] ?? NEUTRAL_K))) as [StyleK, StyleK];
    this.k = [{ ...this.baseK[0] }, { ...this.baseK[1] }];
    // performa harian: generator terpisah supaya jalannya laga tetap sama untuk input yang sama
    const form = new Rng(`form:${input.seed}`);
    teams.forEach((team, i) => {
      const side = i as 0 | 1;
      const list = team.xi.map((p) => this.makeBody(p, side, true));
      this.bodies.push(...list);
      if (team.sub) {
        const sub = this.makeBody(team.sub.player, side, false);
        this.bench.push(sub);
        list.push(sub);
      }
      for (const p of team.bench ?? []) {
        if (team.sub && p.id === team.sub.player.id) continue;
        const r = this.makeBody(p, side, false);
        this.reserves.push(r);
        list.push(r);
      }
      const tf = form.normal(0, TUNE.formTeam) + (side === 0 && !input.neutral ? TUNE.home : 0);
      for (const b of list) {
        const a = b.p.a;
        // Consistency: pemain konsisten hampir selalu tampil sesuai kemampuannya, yang tidak konsisten naik turun
        const d = tf + form.normal(0, TUNE.formPlayer * clamp(2.6 - a.cons * 0.12, 0.2, 2.5));
        for (const key of FORM_KEYS) a[key] = clamp(a[key] + d, 1, 21);
        if (b.p.slot === 'GK') for (const key of GK_KEYS) a[key] = clamp(a[key] + d, 1, 21);
        b.base = mindOf(a);
      }
    });
    this.refresh();
    this.mentality();
    this.mind();
    this.kickoff(0);
  }

  /**
   * Kualitas teknik & mental rata-rata pemain di lapangan menurut pelatih (atribut bawaan, tanpa performa
   * harian dan keunggulan kandang). Tim dengan 10 orang lebih lemah.
   */
  private quality(side: 0 | 1): number {
    const list = this.onPitch[side].filter((b) => b.p.slot !== 'GK');
    if (!list.length) return 10;
    let s = 0;
    for (const b of list) s += b.qual;
    return (s / list.length) * Math.min(1, list.length / 10);
  }

  /**
   * Mentalitas: tim yang lebih kuat menguasai bola dengan sabar dan menekan tinggi, tim yang lebih lemah
   * bertahan lebih dalam dan langsung mencari umpan maju. Di akhir laga tim yang unggul bertahan,
   * tim yang tertinggal menyerang habis-habisan.
   */
  private mentality() {
    const q = [this.quality(0), this.quality(1)];
    const min = this.clock().min;
    const late = clamp((min - 55) / 25, 0, 1);
    for (const side of [0, 1] as const) {
      const base = this.baseK[side];
      const rel = clamp((q[side] - q[1 - side]) * TUNE.rel, -1, 1) * TUNE.mental;
      // + = unggul (bertahan), - = tertinggal (menyerang)
      const gs = clamp(this.score[side] - this.score[1 - side], -2, 2) * 0.5 * late * TUNE.gameState;
      const k = this.k[side];
      k.risk = base.risk * (1 + TUNE.mRisk * rel + 0.15 * gs);
      k.hold = base.hold * (1 + TUNE.mHold * rel);
      k.prog = base.prog * (1 - TUNE.mProg * rel - 0.1 * gs);
      k.long = base.long - TUNE.mLong * rel;
      k.line = base.line - TUNE.mLine * rel + 2 * gs;
      k.press = base.press * (1 + TUNE.mPress * rel - 0.1 * gs);
      k.keep = base.keep * (1 + TUNE.mKeep * rel);
      // tugas Otomatis mengikuti mentalitas tim: menyerang saat tim lebih kuat / tertinggal, bertahan saat unggul
      const lean = (this.tk[side]?.mentality ?? 0) * 0.4 + rel * 0.8 - gs * 1.5;
      const auto: Duty = lean > 0.6 ? 'At' : lean < -0.6 ? 'De' : 'Su';
      for (const b of this.bodies) {
        if (b.side !== side || b.p.duty !== 'Au' || b.autoDuty === auto) continue;
        b.autoDuty = auto;
        b.rk = this.styleOf(b.p, auto);
      }
    }
  }

  /** seberapa kuat kapten menenangkan rekan (0..0.5, dari Leadership) */
  private capK: [number, number] = [0, 0];
  /** jumlah aksi diving dalam laga */
  dives = 0;

  /** Gaya main pemain: peran + tugas (tugas Otomatis memakai `duty`) + kebiasaan + peran tanpa bola */
  private styleOf(p: EP, duty?: Duty): RoleK {
    const def = defaultOop(p.role, p.duty, p.slot);
    const oop = p.oop ?? def;
    return playStyle(p.role, duty ?? (p.duty === 'Au' ? 'Su' : p.duty), traitK(p.traits), p.fam ?? 1, oop, !!p.oop && p.oop !== def);
  }

  /** Kapten di lapangan: pemain dengan Leadership tertinggi */
  captain(side: 0 | 1): Body | undefined {
    let best: Body | undefined;
    for (const b of this.onPitch[side]) if (!best || b.p.a.lea > best.p.a.lea) best = b;
    return best;
  }

  /**
   * Keadaan mental tiap pemain, dihitung ulang tiap menit:
   * - tekanan laga (laga besar, skor ketat di menit akhir): Pressure & Important Matches rendah = gugup
   *   (Composure, Decisions, Finishing, Penalty Taking turun), tinggi = makin tenang. Kapten menenangkan rekan.
   * - frustrasi (Temperament): Aggression naik, Composure & Decisions turun
   * - Determination: tertinggal di babak kedua, pemain pantang menyerah bekerja lebih keras
   * - Concentration turun saat lelah (pemain dengan konsentrasi tinggi tetap fokus)
   */
  private mind() {
    const min = this.clock().min;
    const close = Math.abs(this.score[0] - this.score[1]) <= 1 ? clamp((min - 70) / 20, 0, 1) * 0.25 : 0;
    const P = (this.input.stakes ?? 0.35) + close;
    const late = clamp((min - 45) / 45, 0, 1);
    for (const side of [0, 1] as const) {
      const back = this.onPitch[side].filter((b) => isDef(b.p.slot));
      const org = back.length ? back.reduce((s, b) => s + (b.p.a.tea + b.p.a.pos + b.p.a.con) / 3, 0) / back.length : 10;
      // v18: kiper yang komunikatif mengatur lini belakangnya (aba-aba posisi)
      this.lineErr[side] = clamp(1.6 - org * 0.06 - this.gkCall(side) * 0.15, 0.4, 1.4);
      const cap = this.captain(side);
      this.capK[side] = cap ? clamp((cap.p.a.lea - 10) * 0.05, 0, 0.5) : 0;
      const trail = Math.max(0, this.score[1 - side] - this.score[side]);
      for (const b of this.onPitch[side]) {
        const a = b.p.a;
        const m = b.base;
        const cool = (a.pre + a.imp) / 2 - 10.5;
        let nerve = clamp(P * cool * (cool < 0 ? TUNE.nerve : TUNE.calm), -4, 2);
        if (nerve < 0 && b !== cap) nerve *= 1 - this.capK[side];
        // frustrasi mereda pelan (Temperament tinggi = cepat tenang); tertinggal jauh membuat panas
        b.frus = clamp(b.frus - (0.006 + a.tem * 0.0012) + (trail >= 2 ? 0.006 * trail * this.temK(b) : 0), 0, 1);
        const f = b.frus;
        a.cmp = clamp(m.cmp + nerve - f * 3, 1, 21);
        a.dec = clamp(m.dec + nerve * 0.8 - f * 2, 1, 21);
        a.fin = clamp(m.fin + nerve * 0.7, 1, 21);
        a.pen = clamp(m.pen + nerve, 1, 21);
        a.fk = clamp(m.fk + nerve * 0.5, 1, 21);
        for (const k of ['pas', 'tec', 'ft', 'lon'] as const) a[k] = clamp(m[k] + nerve * 0.4, 1, 21);
        a.agg = clamp(m.agg + f * TUNE.frusAgg, 1, 21);
        a.wor = clamp(m.wor + (trail > 0 ? (a.det - 10) * 0.3 * late : 0), 1, 21);
        a.con = clamp(m.con - (1 - b.energy) * (20 - m.con) * 0.5, 1, 21);
      }
    }
  }

  /** kepekaan frustrasi dari Temperament (1 = 1.44, 10 = 0.85, 20 = 0.2) */
  private temK(b: Body) {
    return clamp(1.5 - b.p.a.tem * 0.065, 0.2, 1.45);
  }

  /** frustrasi bertambah (dilanggar, direbut, kebobolan, peluang gagal); kapten meredamnya */
  private frustrate(b: Body, amount: number) {
    b.frus = clamp(b.frus + amount * TUNE.frus * this.temK(b) * (1 - this.capK[b.side] * 0.5), 0, 1);
  }

  private makeBody(p: EP, side: 0 | 1, on: boolean): Body {
    const st: PStats = {
      passes: 0, passesOk: 0, keyPasses: 0, shots: 0, onTarget: 0, goals: 0, assists: 0, tackles: 0,
      interceptions: 0, dribbles: 0, lost: 0, saves: 0, conceded: 0, offsides: 0, longGoals: 0, setGoals: 0, headGoals: 0,
      fouls: 0, yellow: 0, red: 0, takeOns: 0, throughBalls: 0, injured: 0, on: on ? 0 : -1,
    };
    // salinan atribut: input tidak pernah diubah (aman untuk ditonton ulang)
    const ep: EP = { ...p, a: fullAttrs(p.a) };
    const a = ep.a;
    const qual = (a.pas + a.tec + a.ft + a.cmp + a.dec + a.vis + a.ant + a.pos + a.otb + a.tck) / 10;
    return {
      p: ep, rk: this.styleOf(ep), rx: 0, ry: 0, side, x: 52.5, y: 34, vx: 0, vy: 0, tx: 52.5, ty: 34, on, st, cool: 0, run: 0,
      think: 0, ox: 0, oy: 0, lean: 0, sprint: false, energy: 1, tire: 0, qual, dive: 0, hurt: -1, frus: 0, base: mindOf(a),
      // semua properti diisi sejak awal: bentuk objek sama untuk semua pemain (lebih cepat di V8)
      autoDuty: ep.duty === 'Au' ? 'Su' : undefined, leaving: false, waiting: false, entering: false, runY: -1, check: 0, tdrop: traitK(ep.traits).reduce((d, k) => d + (k.drop ?? 0), 0), home: ep.slot,
    };
  }

  /** Arah serangan tim: +1 ke kanan, -1 ke kiri (tukar saat babak kedua) */
  dir(side: 0 | 1): 1 | -1 {
    return (side === 0) === (this.half % 2 === 1) ? 1 : -1;
  }
  /** Koordinat lapangan -> bingkai tim (gawang sendiri di x = 0) */
  fx(side: 0 | 1, x: number) {
    return this.dir(side) > 0 ? x : PITCH_W - x;
  }
  fy(side: 0 | 1, y: number) {
    return this.dir(side) > 0 ? y : PITCH_H - y;
  }
  /** Bingkai tim -> koordinat lapangan (fungsi yang sama, karena cermin) */
  private wx(side: 0 | 1, x: number) {
    return this.fx(side, x);
  }
  private wy(side: 0 | 1, y: number) {
    return this.fy(side, y);
  }

  private onPitch: [Body[], Body[], Body[]] = [[], [], []];
  private refresh() {
    // pemain cedera yang terkapar tidak ikut bermain sampai diganti
    const all = this.bodies.filter((b) => b.on && b.hurt < 0);
    this.onPitch = [all.filter((b) => b.side === 0), all.filter((b) => b.side === 1), all];
  }
  private active() {
    return this.onPitch[2];
  }
  private opponents(side: 0 | 1) {
    return this.onPitch[1 - side];
  }
  private mates(side: 0 | 1) {
    return this.onPitch[side];
  }
  private keeper(side: 0 | 1) {
    return this.onPitch[side].find((b) => b.p.slot === 'GK');
  }

  /** Posisi dasar pemain di formasi timnya */
  private baseOf(b: Body): [number, number] {
    return this.bases[b.side][b.p.slot] ?? BASE[b.p.slot];
  }

  /** Posisi awal babak / setelah gol (pemain berdiri di separuh lapangan sendiri) */
  private kickoffSpot(b: Body): [number, number] {
    const [bx, by] = this.baseOf(b);
    let x = Math.min(bx * 0.72, 49);
    if (isST(b.p.slot) && this.restart?.kind === 'kickoff' && this.restart.side === b.side) x = b.p.slot === 'LS' ? 50 : 51.5;
    return [this.wx(b.side, x), this.wy(b.side, by)];
  }

  /** Sepak mula. Awal babak: pemain langsung di posisinya; setelah gol: pemain berjalan kembali (jam berhenti) */
  private kickoff(side: 0 | 1, teleport = true) {
    this.restart = { side, x: 52.5, y: 34, wait: 0.8, kind: 'kickoff' };
    for (const b of this.active()) {
      const [x, y] = this.kickoffSpot(b);
      b.tx = x;
      b.ty = y;
      if (teleport) {
        b.x = x;
        b.y = y;
        b.vx = b.vy = 0;
      }
      b.run = 0;
      b.dive = 0;
    }
    this.ball = { x: 52.5, y: 34, z: 0, vx: 0, vy: 0, vz: 0 };
    this.owner = null;
    this.pass = null;
    this.shot = null;
    this.dead = null;
    this.inNet = false;
    this.poss = side;
  }

  private log(kind: EventKind, side: 0 | 1, name?: string, assist?: string, og?: boolean) {
    const c = this.clock();
    const e: MatchEvent = { t: this.t, min: c.min, kind, side, name, assist };
    if (c.plus) e.plus = c.plus;
    if (og) e.og = true;
    this.events.push(e);
  }

  /** Menit tambahan tiap babak, termasuk dua babak perpanjangan waktu (-1 = belum diumumkan) */
  added: number[] = [-1, -1, -1, -1];
  /** v20 detik permainan saat babak perpanjangan waktu dimulai */
  private etStart: [number, number] = [0, 0];
  /** v20 adu penalti (null = belum / tidak ada) */
  so: Shootout | null = null;

  /** Jam pertandingan: menit (1-90, perpanjangan waktu 91-120) dan menit tambahan kalau sedang injury time */
  clock(): { min: number; plus: number } {
    const per = HALF / 45;
    if (this.half >= 3) {
      if (this.half === 5) return { min: 120, plus: 0 };
      const base = this.half === 3 ? 90 : 105;
      const t3 = this.t - this.etStart[this.half - 3];
      if (t3 <= ET_HALF) return { min: Math.min(base + 15, base + Math.floor(Math.max(0, t3) / per) + 1), plus: 0 };
      return { min: base + 15, plus: Math.max(1, Math.ceil((t3 - ET_HALF) / per)) };
    }
    if (this.half === 1) {
      if (this.t <= HALF) return { min: Math.min(45, Math.floor(this.t / per) + 1), plus: 0 };
      return { min: 45, plus: Math.max(1, Math.ceil((this.t - HALF) / per)) };
    }
    const t2 = this.t - HALF - Math.max(0, this.added[0]) * per;
    if (t2 <= HALF) return { min: Math.min(90, 45 + Math.floor(Math.max(0, t2) / per) + 1), plus: 0 };
    return { min: 90, plus: Math.max(1, Math.ceil((t2 - HALF) / per)) };
  }

  /** Teks jam untuk layar: 67' atau 90+3' */
  clockLabel(): string {
    if (this.half === 5) return 'Adu penalti';
    const c = this.clock();
    return c.plus ? `${c.min}+${c.plus}'` : `${c.min}'`;
  }

  /** Nama babak untuk layar */
  periodLabel(): string {
    if (this.half === 5) return this.so ? `${this.done ? 'Adu penalti' : 'Skor'} ${this.so.goals[0]}-${this.so.goals[1]}` : 'Adu penalti';
    if (this.half >= 3) return `Perpanjangan waktu ${this.half - 2}`;
    return `Babak ${this.half}`;
  }

  /** Perkiraan lama laga dalam detik permainan (termasuk menit tambahan yang sudah diumumkan) */
  length(): number {
    const per = HALF / 45;
    let len = FULL + (Math.max(0, this.added[0]) + Math.max(0, this.added[1])) * per;
    if (this.half >= 3) len += 2 * ET_HALF + (Math.max(0, this.added[2]) + Math.max(0, this.added[3])) * per;
    return len;
  }

  /** Wasit menentukan menit tambahan dari gol, pergantian, cedera, dan kartu di babak ini */
  private addedTime(half: 1 | 2 | 3 | 4): number {
    const from = half === 1 ? 0 : half === 2 ? HALF + Math.max(0, this.added[0]) * (HALF / 45) : this.etStart[half - 3];
    let m = half === 1 ? 0.6 : half === 2 ? 1.8 : half === 3 ? 0.3 : 0.9;
    for (const e of this.events) {
      if (e.t < from) continue;
      if (e.kind === 'goal') m += 0.45;
      else if (e.kind === 'sub') m += 0.35;
      else if (e.kind === 'injury') m += 1.2;
      else if (e.kind === 'yellow' || e.kind === 'red') m += 0.15;
    }
    m += this.rng.float(0, 1.2);
    return clamp(Math.round(m), 1, half === 1 ? 5 : 8);
  }

  // --- bantuan geometri ---------------------------------------------------------

  private nearest(list: Body[], x: number, y: number, skip?: Body): [Body | null, number] {
    let best: Body | null = null;
    let bd = Infinity;
    for (const b of list) {
      if (b === skip) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return [best, bd];
  }

  /** Peluang gol dasar dari posisi (bingkai tim penyerang) */
  private xgAt(fx: number, fy: number): number {
    const gx = PITCH_W;
    const d = Math.hypot(gx - fx, 34 - fy);
    const a1 = Math.atan2(34 + GOAL_HALF - fy, gx - fx);
    const a2 = Math.atan2(34 - GOAL_HALF - fy, gx - fx);
    const angle = Math.abs(a1 - a2);
    return clamp(0.5 * Math.exp(-(d - 5) / 8.5) * clamp(angle / 0.55, 0.15, 1), 0.005, 0.6);
  }

  /** Peluang jenuh: dari posisi terbaik pun tidak pasti gol. Penyelesai jago punya batas atas lebih tinggi. */
  private sat(x: number, skill = 10): number {
    const cap = TUNE.pMax * clamp(0.85 + skill * 0.015, 0.85, 1.15);
    return cap * (1 - Math.exp(-x / cap));
  }

  /**
   * Bagian peluang yang hilang karena kiper menutup sudut (satu lawan satu): makin dekat dan makin lurus
   * di depan penembak, makin sedikit gawang yang terlihat. Penembak tenang & jago finishing masih
   * menemukan celah; kiper jago one on ones melebarkan badan lebih baik. (fx, fy: bingkai penyerang)
   */
  private gkCoverAt(side: 0 | 1, fx: number, fy: number, a: EAttrs): number {
    const gk = this.keeper((1 - side) as 0 | 1);
    if (!gk) return 0;
    const gfx = this.fx(side, gk.x);
    const gfy = this.fy(side, gk.y);
    const gd = Math.hypot(gfx - fx, gfy - fy);
    if (gd > 12) return 0;
    const gl = this.laneDist(fx, fy, PITCH_W, 34, gfx, gfy);
    if (gl >= 2.5) return 0;
    const a1 = Math.atan2(34 + GOAL_HALF - fy, PITCH_W - fx);
    const a2 = Math.atan2(34 - GOAL_HALF - fy, PITCH_W - fx);
    const goalAng = Math.abs(a1 - a2) || 0.1;
    const gkAng = 2 * Math.atan((1.0 + gk.p.a.ono * 0.02) / Math.max(0.8, gd));
    return clamp(gkAng / goalAng, 0, 1) * (1 - gl / 2.5) * clamp(TUNE.gkCover - (a.cmp + a.fin - 20) * 0.01, 0.25, 0.85);
  }

  /** Perkiraan peluang gol tembakan kaki dari titik ini (bingkai penyerang), untuk keputusan pemain */
  private shotProb(c: Body, fx: number, fy: number, pressure: number): number {
    const a = c.p.a;
    const dist = Math.hypot(PITCH_W - fx, 34 - fy);
    const gk = this.keeper((1 - c.side) as 0 | 1);
    const gkSkill = gk ? (gk.p.a.ref * 2 + gk.p.a.ono + gk.p.a.han + gk.p.a.pos) / 5 : 8;
    const skill = dist < 18 ? a.fin : a.lon;
    const x =
      this.xgAt(fx, fy) * skillK(skill) * (0.9 + a.cmp * 0.008) * (1 - pressure * 0.25) * (1.3 - gkSkill * 0.03) *
      (dist > 18 ? TUNE.longK : 1) * TUNE.shotK;
    return this.sat(x, skill) * (1 - this.gkCoverAt(c.side, fx, fy, a));
  }

  /** Jarak titik (px,py) ke garis a-b (hanya kalau proyeksi di dalam segmen) */
  private laneDist(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const u = ((px - ax) * dx + (py - ay) * dy) / len2;
    if (u < 0.05 || u > 1) return Infinity;
    return Math.hypot(ax + u * dx - px, ay + u * dy - py);
  }

  /** Garis offside untuk tim yang menyerang: pemain lawan kedua terakhir (bingkai tim penyerang) */
  private offsideLine(side: 0 | 1): number {
    let a = -1;
    let b = -1;
    for (const o of this.opponents(side)) {
      const f = this.fx(side, o.x);
      if (f > a) {
        b = a;
        a = f;
      } else if (f > b) b = f;
    }
    return Math.max(b, PITCH_W / 2);
  }

  private isOffside(m: Body, line: number, ballFx: number) {
    const f = this.fx(m.side, m.x);
    return f > line + 0.15 && f > ballFx + 0.15 && f > PITCH_W / 2;
  }

  private inBox(side: 0 | 1, x: number, y: number) {
    // kotak penalti milik tim `side`
    const f = this.fx(side, x);
    return f < BOX_X && Math.abs(this.fy(side, y) - 34) < BOX_Y;
  }

  // --- perkiraan lintasan bola (untuk mengejar bola dengan cerdas) ---------------------

  // --- v17 kontrol ruang (pitch control) -------------------------------------------

  /**
   * Perkiraan waktu (detik) pemain sampai di titik (x, y): reaksi dulu (badannya masih meluncur searah larinya),
   * berbalik kalau sedang lari menjauh, lalu berakselerasi (Acceleration) sampai kecepatan puncak (Pace).
   */
  private arrive(b: Body, x: number, y: number, react: number): number {
    const vmax = vmaxOf(b);
    const acc = accOf(b);
    const px = b.x + b.vx * react;
    const py = b.y + b.vy * react;
    const dx = x - px;
    const dy = y - py;
    const dist = Math.hypot(dx, dy);
    const d = dist - 0.9;
    if (d <= 0) return react;
    const u0 = (b.vx * dx + b.vy * dy) / dist;
    return react + (u0 < 0 ? -u0 / acc : 0) + runTime(d, clamp(u0, 0, vmax), vmax, acc * 0.7);
  }

  /** Reaksi membaca situasi (detik): Anticipation */
  private react(b: Body, base = 0.15): number {
    return base + (20 - b.p.a.ant) * 0.012;
  }

  /**
   * Siapa yang lebih dulu sampai di tiap petak lapangan; diperbarui tiap 0,5 detik permainan.
   * (Rumus sama dengan arrive(), ditulis langsung di sini supaya cepat.)
   */
  private updateControl() {
    const [t0, t1] = this.pcT;
    t0.fill(99);
    t1.fill(99);
    for (const b of this.active()) {
      if (b.hurt >= 0) continue;
      const T = b.side === 0 ? t0 : t1;
      const react = this.react(b);
      const vmax = vmaxOf(b);
      const acc = accOf(b);
      const a7 = acc * 0.7;
      const vx = b.vx;
      const vy = b.vy;
      const px = b.x + vx * react;
      const py = b.y + vy * react;
      // hanya petak dalam jangkauan 30 m (lebih jauh dari itu adu cepatnya tidak penting lagi);
      // kiper hanya menguasai daerah sekitar kotak penaltinya (sweeper keeper sedikit lebih jauh)
      let i0 = Math.max(0, Math.floor((px - PC_R) / PC_CW));
      let i1 = Math.min(PC_NX, Math.ceil((px + PC_R) / PC_CW));
      let j0 = Math.max(0, Math.floor((py - PC_R) / PC_CH));
      let j1 = Math.min(PC_NY, Math.ceil((py + PC_R) / PC_CH));
      if (b.p.slot === 'GK') {
        const reach = Math.ceil((b.p.role === 'sk' ? 28 : BOX_X + 2) / PC_CW);
        if (this.dir(b.side) > 0) i1 = Math.min(i1, reach);
        else i0 = Math.max(i0, PC_NX - reach);
        j0 = Math.max(j0, Math.floor((34 - BOX_Y - 2) / PC_CH));
        j1 = Math.min(j1, Math.ceil((34 + BOX_Y + 2) / PC_CH));
      }
      for (let j = j0; j < j1; j++) {
        const dy = (j + 0.5) * PC_CH - py;
        for (let i = i0; i < i1; i++) {
          const k = j * PC_NX + i;
          const dx = (i + 0.5) * PC_CW - px;
          const d2 = dx * dx + dy * dy;
          // terlalu jauh, atau tidak mungkin lebih cepat dari rekan yang sudah tercatat: lewati
          const lim = Math.min(PC_R, vmax * (T[k] - react) + 0.9);
          if (lim <= 0 || d2 > lim * lim) continue;
          const dist = Math.sqrt(d2);
          const d = dist - 0.9;
          let t = react;
          if (d > 0) {
            const u0 = (vx * dx + vy * dy) / dist;
            const u = u0 < 0 ? 0 : u0 > vmax ? vmax : u0;
            const dAcc = (vmax * vmax - u * u) / (2 * a7);
            t += (u0 < 0 ? -u0 / acc : 0) + (d <= dAcc ? (Math.sqrt(u * u + 2 * a7 * d) - u) / a7 : (vmax - u) / a7 + (d - dAcc) / vmax);
          }
          if (t < T[k]) T[k] = t;
        }
      }
    }
    const s = TUNE.pcSigma;
    for (let k = 0; k < PC_N; k++) this.pc[k] = 1 / (1 + Math.exp((t0[k] - t1[k]) / s));
    this.updateDepth();
  }

  /** Penguasaan ruang tim `side` di titik (x, y) dunia, 0..1 (interpolasi antar-petak) */
  ctrl(side: 0 | 1, x: number, y: number): number {
    const gx = clamp(x / PC_CW - 0.5, 0, PC_NX - 1.001);
    const gy = clamp(y / PC_CH - 0.5, 0, PC_NY - 1.001);
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const u = gx - i;
    const v = gy - j;
    const k = j * PC_NX + i;
    const pc = this.pc;
    const c = (pc[k] * (1 - u) + pc[k + 1] * u) * (1 - v) + (pc[k + PC_NX] * (1 - u) + pc[k + PC_NX + 1] * u) * v;
    return side === 0 ? c : 1 - c;
  }

  /** Untuk tayangan: penguasaan ruang tim tuan rumah per petak (baris demi baris dari y = 0) */
  pitchControl(): { nx: number; ny: number; home: Float64Array } {
    return { nx: PC_NX, ny: PC_NY, home: this.pc };
  }

  /**
   * Garis pertahanan vs penyerang cepat: untuk tiap penyerang lawan di sekitar garis, siapa yang lebih dulu sampai
   * di ruang 12 m di belakang garis? Kalau penyerang menang, garis mundur secukupnya. Lini belakang yang pandai
   * membaca permainan (Anticipation, Decisions, Positioning) melakukannya lebih tepat.
   */
  private updateDepth() {
    for (const side of [0, 1] as const) {
      let want = 0;
      if (this.poss !== side || !this.owner) {
        const back = this.mates(side).filter((b) => isDef(b.p.slot) && !isWB(b.p.slot) && b.hurt < 0);
        if (back.length) {
          const line = this.defLine(side, false, true);
          let read = 0;
          for (const d of back) read += (d.p.a.ant + d.p.a.dec + d.p.a.pos) / 3;
          read = clamp(0.3 + (read / back.length - 10) * 0.05, 0.1, 0.9);
          for (const o of this.opponents(side)) {
            if (o.p.slot === 'GK' || o.hurt >= 0) continue;
            const ofx = this.fx(side, o.x);
            if (ofx < line - 3 || ofx > line + 20) continue;
            const ofy = this.fy(side, o.y);
            const px = this.wx(side, Math.max(line - 12, 5));
            const py = this.wy(side, ofy + (34 - ofy) * 0.3);
            const ta = this.arrive(o, px, py, 0.1);
            let td = Infinity;
            for (const d of back) td = Math.min(td, this.arrive(d, px, py, this.react(d, 0.3)));
            // selisih wajar (penyerang yang memulai lari selalu sedikit lebih dulu) tidak perlu ditutup
            const lose = td - ta - 0.2;
            if (lose > 0) want = Math.max(want, lose * vmaxOf(back[0]) * read * TUNE.depthK);
          }
        }
      }
      this.depth[side] += (Math.min(want, TUNE.depthMax) - this.depth[side]) * 0.5;
    }
  }

  /**
   * Risiko jalur umpan berbasis waktu: lawan berbahaya kalau bisa sampai di lintasan bola sebelum bola lewat
   * (Anticipation = reaksi, Acceleration & Pace = lari). Bola atas hanya bisa direbut di dekat titik jatuhnya,
   * dan di sana lawan harus lebih dulu dari penerima.
   */
  private laneRisk(c: Body, tx: number, ty: number, air: boolean, vEnd: number, skipGk: boolean, to?: Body): number {
    const dx = tx - c.x;
    const dy = ty - c.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const v0 = Math.min(24, Math.sqrt(vEnd * vEnd + 2 * ROLL * len));
    const fly = clamp(0.8 + len * 0.032, 0.7, 2.6);
    const tr = air && to ? Math.max(fly, this.arrive(to, tx, ty, 0)) : fly;
    let risk = 0;
    for (const o of this.opponents(c.side)) {
      if (skipGk && o.p.slot === 'GK') continue;
      const along = (o.x - c.x) * ux + (o.y - c.y) * uy;
      if (along < -1) continue;
      const s = air ? len : clamp(along, 0, Math.max(0, len - 1.5));
      const d = Math.hypot(c.x + ux * s - o.x, c.y + uy * s - o.y) - (0.9 + o.p.a.agi * 0.01);
      if (d <= 0) {
        risk += 1;
        continue;
      }
      const tb = air ? tr : (v0 - Math.sqrt(Math.max(0, v0 * v0 - 2 * ROLL * s))) / ROLL;
      const vmax = vmaxOf(o);
      const to2 = this.react(o, 0.25) + runTime(d, 0, vmax, accOf(o) * 0.7);
      risk += clamp(0.5 + (tb - to2) / TUNE.laneT, 0, 1);
    }
    return risk;
  }

  /**
   * Umpan ke ruang: dari beberapa titik di belakang garis lawan, pilih yang paling jelas dimenangkan si pelari
   * dalam adu cepat melawan bek & kiper lawan. Ini perkiraan si pengumpan: Vision membuatnya lebih tepat.
   * Hasil: [fx, fy, peluang si pelari menang] (bingkai tim), atau null kalau tidak ada titik yang terjangkau.
   */
  private spaceSpot(c: Body, m: Body, oppLine: number, mfx: number, mfy: number): [number, number, number] | null {
    const side = c.side;
    const a = c.p.a;
    const opps = this.opponents(side);
    const sd = 0.04 + (20 - a.vis) * 0.025;
    const vEnd = 4 + a.pas * 0.15;
    let best: [number, number, number] | null = null;
    let bv = -Infinity;
    for (const ahead of [3, 7, 11]) {
      const fx = clamp(Math.max(oppLine + ahead + a.vis * 0.1, mfx + 2), 0, 99);
      for (const lat of [0.05, 0.3, 0.6]) {
        const fy = clamp(mfy + (34 - mfy) * lat, 5, 63);
        const x = this.wx(side, fx);
        const y = this.wy(side, fy);
        const len = Math.hypot(x - c.x, y - c.y);
        if (len > 45) continue;
        const v0 = Math.min(24, Math.sqrt(vEnd * vEnd + 2 * ROLL * len));
        const tb = (v0 - vEnd) / ROLL;
        const ta = this.arrive(m, x, y, 0);
        let td = Infinity;
        for (const o of opps) {
          if (o.p.slot === 'GK' && o.p.role !== 'sk' && !this.inBox(o.side, x, y)) continue;
          td = Math.min(td, this.arrive(o, x, y, this.react(o, 0.2)));
        }
        // bola yang terlalu jauh di depan pelari menggelinding ke kiper / keluar
        const edge = td - ta - Math.max(0, ta - tb - 0.8) * 0.5 + this.rng.normal(0, sd);
        const win = 1 / (1 + Math.exp(-edge / 0.35));
        const v = this.xgAt(fx, fy) * (0.3 + win) + win * 0.15;
        if (v > bv) {
          bv = v;
          best = [fx, fy, win];
        }
      }
    }
    return best;
  }

  /**
   * Lari ke ruang: pilih celah di belakang garis lawan yang paling dikuasai timnya (antara bek tengah dan bek
   * sayap, atau di belakang bek yang lambat). Off the Ball membuat pilihannya lebih tepat. Hasil: y bingkai tim.
   */
  private runLane(b: Body): number {
    const side = b.side;
    const fy = this.fy(side, b.y);
    const wing = isWing(b.p.slot) || isWideMid(b.p.slot) || isWB(b.p.slot);
    const y0 = clamp(fy + (34 - fy) * (wing ? 0.55 : 0.35), 6, 62);
    const fx = Math.min(100, this.offsideLine(side) + 5);
    const sd = 0.03 + (20 - b.p.a.otb) * 0.02;
    let best = y0;
    let bv = -Infinity;
    for (const dy of [-10, -5, 0, 5, 10]) {
      const y = clamp(y0 + dy, 5, 63);
      const v =
        this.ctrl(side, this.wx(side, fx), this.wy(side, y)) + this.xgAt(fx, y) * 2 - Math.abs(dy) * 0.008 + this.rng.normal(0, sd);
      if (v > bv) {
        bv = v;
        best = y;
      }
    }
    return best;
  }

  /**
   * Menutup ruang berbahaya: bek tengah bergeser ke ruang di dekatnya yang dikuasai lawan dan dekat gawang
   * (bek cover juga mundur ke sana). Positioning & Anticipation menentukan seberapa tepat ia membacanya.
   */
  private coverSpace(b: Body, side: 0 | 1, x: number, y: number): [number, number] {
    const opp = (1 - side) as 0 | 1;
    let best = 0;
    let bx = x;
    let by = y;
    for (const dx of [-8, -4, 0]) {
      for (const dy of [-8, -4, 0, 4, 8]) {
        const cx = clamp(x + dx, 3, 60);
        const cy = clamp(y + dy, 3, 65);
        const oc = this.ctrl(opp, this.wx(side, cx), this.wy(side, cy));
        const danger = oc * oc * this.xgAt(PITCH_W - cx, PITCH_H - cy) - (Math.abs(dx) + Math.abs(dy)) * 0.0015;
        if (danger > best) {
          best = danger;
          bx = cx;
          by = cy;
        }
      }
    }
    if (best < 0.02) return [x, y];
    const a = b.p.a;
    const w = clamp(((a.pos + a.ant) / 2 - 4) / 16, 0.1, 1) * TUNE.coverK;
    return [b.rk.step < 0 ? x + (bx - x) * w : x, y + clamp((by - y) * w, -4, 4)];
  }

  private predict() {
    const b = this.ball;
    let { x, y, z, vx, vy, vz } = b;
    const out = this.traj;
    out.length = 0;
    for (let i = 0; i < 26; i++) {
      out.push({ x, y, z });
      const r = stepBall(x, y, z, vx, vy, vz);
      [x, y, z, vx, vy, vz] = r;
    }
  }

  /** Titik paling awal di lintasan bola yang bisa dicapai pemain ini, plus waktunya */
  private reachPoint(b: Body, hands = false): [number, number, number] {
    const vmax = vmaxOf(b);
    const react = 0.1 + (20 - b.p.a.ant) * 0.012;
    const reach = hands ? 1.6 : 1.0;
    const zMax = hands ? 2.7 : 2.2;
    const tr = this.traj;
    for (let i = 0; i < tr.length; i++) {
      const p = tr[i];
      if (p.z > zMax) continue;
      if (p.x < -0.5 || p.x > PITCH_W + 0.5 || p.y < -0.5 || p.y > PITCH_H + 0.5) break;
      const tt = i * DT;
      const d = Math.hypot(p.x - b.x, p.y - b.y) - reach;
      if (d <= vmax * Math.max(0, tt - react)) return [p.x, p.y, tt];
    }
    const last = tr[tr.length - 1];
    return [clamp(last.x, 0.5, PITCH_W - 0.5), clamp(last.y, 0.5, PITCH_H - 0.5), 99];
  }

  // --- posisi target --------------------------------------------------------------

  /** Garis pertahanan tim (bingkai tim sendiri) */
  private defLine(side: 0 | 1, inPoss: boolean, raw = false): number {
    const bfx = this.fx(side, this.ball.x);
    const k = this.k[side];
    if (inPoss) return clamp(bfx - TUNE.backLine + k.line * 0.5, 14, 52 - k.line);
    // v17: mundur menutup ruang di belakang garis dari penyerang yang lebih cepat
    let line = clamp(bfx - TUNE.lineGap - k.line, 7, 42 - k.line) - (raw ? 0 : this.depth[side]);
    // pembawa bola lawan bebas menghadap gawang: mundur menutup ruang di belakang
    const o = this.owner;
    if (o && o.side !== side) {
      const [, pd] = this.nearest(this.mates(side), o.x, o.y);
      const towardUs = this.dir(side) * o.vx < -1;
      if (pd > 4 && towardUs) line -= 5;
    }
    return clamp(Math.min(line, bfx - 3), 6, 42 - k.line);
  }

  private targets(live: boolean) {
    const ball = this.ball;
    for (const side of [0, 1] as const) {
      const inPoss = this.poss === side;
      const bfx = this.fx(side, ball.x);
      const bfy = this.fy(side, ball.y);
      const team = this.mates(side);
      const opps = this.opponents(side);
      const oppLine = this.offsideLine(side);
      const tk = this.tk[side];
      // v21 tinggi blok tanpa bola dari garis mulai menekan & intensitas pressing pelatih (-2..2)
      const eng = tk ? clamp(tk.engage + 0.3 * tk.press, -2, 2) : 0;
      // v21 tendangan gawang: tim sendiri menyebar (pendek / panjang), lawan memasang pressing setinggi garis mulai menekan
      const rs = this.restart;
      const gkOwn = TUNE.gkShape > 0 && rs?.kind === 'goalkick' && rs.side === side;
      const gkOpp = TUNE.gkShape > 0 && rs?.kind === 'goalkick' && rs.side !== side;
      const gkShort = gkOwn && this.shortGoalKick(side);
      const line = this.defLine(side, inPoss) + (gkOpp ? 3 * Math.max(0, eng) : 0);
      const adv = clamp((bfx - 55) / 35, 0, 1);
      // half-back turun di antara bek tengah: kedua bek tengah melebar
      const halfBack = inPoss && team.some((t) => t.p.role === 'hb');
      // tanpa bola: jebakan offside & man marking dari instruksi pelatih
      let trapOn = false;
      if (!inPoss && live) {
        if (tk?.trap) trapOn = this.offsideTrap(side, line, team, opps);
        if (tk?.marking === 'man' && this.t >= this.markNext[side]) this.assignMarks(side, team, opps);
      }
      for (const b of team) {
        if (b.think > 0 || b === this.owner) continue;
        const a = b.p.a;
        // pemain yang belum paham taktik lebih lambat membaca posisinya dan lebih sering salah tempat
        const fam = b.p.fam ?? 1;
        const famErr = 1.45 - 0.5 * fam;
        // konsentrasi rendah (apalagi saat lelah di akhir laga): lebih lambat membaca ulang situasi
        b.think = 0.15 + (20 - a.ant) * 0.018 + this.rng.float(0, 0.12) + (1 - fam) * 0.12 + Math.max(0, 13 - a.con) * 0.008;
        // kesalahan posisi pribadi bergerak pelan
        b.ox = clamp(b.ox * 0.85 + this.rng.normal(0, 0.9), -3, 3);
        b.oy = clamp(b.oy * 0.85 + this.rng.normal(0, 0.9), -3, 3);
        if (this.rng.chance(0.05)) b.lean = this.rng.normal(0, 1) * (22 - (a.otb + a.ant + a.dec) / 3) * 0.07;
        const slot = b.p.slot;
        const [bx, by] = this.baseOf(b);
        let x: number;
        let y: number;
        let sprint = false;
        if (slot === 'GK') {
          // kiper dengan positioning & antisipasi tinggi membaca arah bola lebih dulu
          [x, y] = this.gkSpot(b, line, (a.pos + a.ant) * 0.012);
          // kiper dengan positioning & konsentrasi tinggi hampir selalu di titik yang tepat
          const gerr = (21 - (a.pos * 2 + a.con) / 3) / 20;
          x += b.ox * gerr * 0.5;
          y += b.oy * gerr * 0.9;
        } else if (inPoss) {
          // wing back menyerang seperti pemain sayap saat timnya menguasai bola
          const wb = isWB(slot);
          const def = isDef(slot) && !wb;
          // striker kanan dari duet penyerang bergerak ke celah antara bek tengah dan bek sayap
          const wing = isWing(slot) || isWideMid(slot) || wb || (TUNE.channel > 0 && slot === 'RS');
          const rk = b.rk;
          // v21 penyerang menahan garis bek lawan (pin) walau bola masih jauh di belakang: berdiri sejajar bek
          // terakhir, siap lari ke belakang garis. Off the Ball & Anticipation menentukan seberapa rapat ke garis.
          const pin = TUNE.pin > 0 && isST(slot) && b.run <= 0 && rk.drop - b.tdrop < 5;
          const gap = pin ? this.pinGap(a) : 0.9;
          if (def) {
            const fb = isFB(slot);
            if (fb && (b.p.role === 'ifb' || b.p.role === 'iwb')) {
              // bek sayap terbalik: masuk ke tengah (jadi bek tengah ketiga atau gelandang tambahan)
              x = line + (b.p.role === 'iwb' ? 13 : 3);
              y = 34 + (by - 34) * 0.45;
            } else if (b.p.role === 'lib') {
              // libero: maju dari lini belakang ke lini tengah, makin jauh saat bola di depan
              x = line + 9 + (b.p.duty === 'At' ? 5 : 0) + 6 * adv;
              y = 34 + (by - 34) * 0.3 + (bfy - 34) * 0.15;
            } else {
              x = fb ? clamp(bfx - 12 + 12 * adv + rk.up + (tk?.overlap ? 6 * adv : 0), 16, 75 + Math.max(0, rk.up)) : line + rk.up * 0.5;
              y = 34 + (by - 34) * (fb ? 1.15 : 1.25) * (1 + rk.wide * 0.4 + (halfBack && !fb ? 0.45 : 0)) + (bfy - 34) * 0.12;
            }
          } else if (b.p.role === 'hb') {
            // half-back: turun di antara dua bek tengah saat membangun serangan
            x = line + 1;
            y = 34 + (bfy - 34) * 0.1;
          } else {
            const shift = (bfx - 45) * (isBox(slot) || slot === 'AM' ? 0.75 : 0.6);
            // gelandang sayap dan wing back ikut naik sejajar penyerang
            x = (wb ? bx + TUNE.wbUp * clamp((bfx - 35) / 30, 0, 1) : isWideMid(slot) ? Math.max(bx, TUNE.wideUp) : bx) + shift + 7 + rk.up;
            y = 34 + (by - 34) * (1.1 + rk.wide * 0.35) * (1 + 0.06 * (tk?.width ?? 0)) + (bfy - 34) * 0.12;
            if (wing) {
              // sayap sisi jauh menyerang tiang jauh, sayap sisi bola memberi lebar
              const far = (by - 34) * (bfy - 34) < 0;
              y += (34 - y) * (far ? 0.75 : 0.35) * adv;
              x += (far ? 10 : 5) * adv;
            } else if (isHold(slot)) x += 6 * adv;
            else if (isBox(slot) || slot === 'AM') {
              x = Math.max(x + 13 * adv, bfx - 14 + 10 * adv);
              y += (34 - y) * 0.35 * adv;
            } else if (isST(slot) && b.run <= 0) x = Math.min(x, Math.max(bfx + 22, 55)) - (slot === 'LS' ? TUNE.drop : 0);
            if (pin && b.check > 0) {
              // turun menjemput bola sebentar (checking): memberi opsi umpan ke kaki, lalu kembali menahan garis
              x = oppLine - 7 - rk.drop * 0.8;
              y += (bfy - y) * 0.3;
              sprint = Math.hypot(this.fx(side, b.x) - x, this.fy(side, b.y) - y) > 3;
            } else if (pin) x = Math.max(x, oppLine - gap - (rk.drop - b.tdrop));
            // false 9 / deep-lying forward turun ke ruang di antara lini lawan
            else if (rk.drop > 0 && b.run <= 0) x = Math.min(x, oppLine - rk.drop * (1 - 0.5 * adv));
            // poacher, shadow striker, raumdeuter: menyerbu kotak saat bola di sepertiga akhir
            if (rk.box > 0 && adv > 0) {
              x += (Math.max(x, 91) - x) * rk.box * adv;
              y += (34 - y) * 0.5 * rk.box * adv;
            }
            if (b.run > 0) {
              x = Math.min(100, oppLine + 5);
              // v17: lari ke celah yang dipilih saat mulai berlari
              y = b.runY >= 0 ? b.runY : clamp(y + (34 - y) * (wing ? 0.55 : 0.35), 6, 62);
              sprint = true;
            } else {
              // v17 mencari ruang: bergeser ke kantong ruang terdekat yang dikuasai timnya (Off the Ball)
              x = Math.min(x, oppLine - gap + b.lean);
              let bc = this.ctrl(side, this.wx(side, x), this.wy(side, y)) + 0.04;
              let px = 0;
              let py = 0;
              for (const [ddx, ddy] of POCKETS) {
                // penyerang yang menahan garis hanya bergeser ke samping, tidak turun meninggalkan garis
                if (pin && ddx < 0) continue;
                const c = this.ctrl(side, this.wx(side, clamp(x + ddx, 1, 104)), this.wy(side, clamp(y + ddy, 2, 66)));
                if (c > bc) {
                  bc = c;
                  px = ddx;
                  py = ddy;
                }
              }
              x += px * (a.otb / 20);
              y += py * (a.otb / 20);
              // berdiri tepat di garis offside: pemain cerdas tidak terjebak
              x = Math.min(x, oppLine - gap + b.lean);
            }
          }
          // kebebasan bergerak: pemain dengan peran bebas & flair tinggi berpindah ke ruang kosong
          if (!def && b.run <= 0) {
            const roam = clamp(b.rk.roam * (0.5 + a.fla / 20) * (1 + 0.4 * (tk?.creative ?? 0)), 0, 1.2);
            if (roam > 0.05 && this.rng.chance(0.25)) {
              let best = -1;
              for (let i = 0; i < 6; i++) {
                const ang = this.rng.float(0, Math.PI * 2);
                const rx = Math.cos(ang) * 7 * roam;
                const ry = Math.sin(ang) * 9 * roam;
                const [, od] = this.nearest(opps, this.wx(side, clamp(x + rx, 1, 104)), this.wy(side, clamp(y + ry, 1, 67)));
                if (od > best) {
                  best = od;
                  b.rx = rx;
                  b.ry = ry;
                }
              }
            } else if (roam <= 0.05) b.rx = b.ry = 0;
            x += b.rx;
            y += b.ry;
          }
          const err = ((21 - (a.otb + a.tea) / 2) / 20) * famErr;
          x += b.ox * err;
          y += b.oy * err;
          // penyerang yang menahan garis tetap tidak melewati garis (kecuali salah baca karena Off the Ball rendah)
          if (pin) x = Math.min(x, oppLine - gap + b.lean);
          // umpan silang sedang melayang: penyerang menyerbu kotak
          const cr = this.pass;
          if (cr?.cross && cr.from.side === side && cr.from !== b && !def && cr.to !== b) {
            x = Math.max(x, isST(slot) ? 95 : wing ? 93 : 89);
            y = 34 + (y - 34) * 0.45;
            sprint = true;
          }
          if (gkOwn) {
            [x, y] = this.goalKickSpot(b, gkShort, oppLine, x, y);
            x += b.ox * 0.4;
            y += b.oy * 0.4;
          }
        } else {
          // bertahan: tiga lini bergeser bersama
          const def = isDef(slot);
          const mid = isCentralMid(slot) || isWideMid(slot);
          const rk = b.rk;
          if (def) {
            const fb = isFB(slot);
            if (fb && rk.wideCover > 0) {
              // jaga sayap: tetap melebar sedikit di belakang garis, menjaga pemain sayap lawan
              x = line - 0.5;
              y = 34 + (by - 34) * 0.95 + (bfy - 34) * 0.18;
            } else {
              // cover & libero berdiri sedikit di belakang garis untuk menyapu bola terobosan
              x = line + (fb ? 1 : Math.min(0, rk.step));
              y = 34 + (by - 34) * (fb ? 0.78 : 0.62) + (bfy - 34) * 0.32;
            }
          } else if (mid) {
            if (rk.screen > 0) {
              // menutup jalur: tetap di tengah di depan lini belakang, bergeser ke sisi bola
              x = line + (isHold(slot) ? 8 : slot === 'AM' ? 14 : 10) - (rk.back - 1) * 6;
              y = 34 + (by - 34) * 0.45 + (bfy - 34) * 0.45;
            } else {
              x = line + (isHold(slot) ? 9 : slot === 'AM' ? 16 : 12) - (rk.back - 1) * 6;
              y = 34 + (by - 34) * 0.72 + (bfy - 34) * 0.4;
            }
            // tetap di depan: gelandang sayap / gelandang serang menunggu serangan balik
            if (rk.outlet > 0) {
              x = Math.max(x, line + 22);
              if (isWideMid(slot)) y = 34 + (by - 34) * 0.95;
            }
          } else {
            // penyerang yang malas bertahan (poacher, enganche) tetap di depan menunggu serangan balik
            x = Math.min(line + (isST(slot) ? 30 : 24) - (rk.back - 1) * 12, 64 + 6 * eng + (1 - rk.back) * 10);
            y = 34 + (by - 34) * 0.78 + (bfy - 34) * 0.3;
            if (rk.screen > 0) {
              // membayangi gelandang bertahan lawan: sedikit lebih dalam dan di tengah
              x = Math.min(x, line + 25);
              y = 34 + (by - 34) * 0.5 + (bfy - 34) * 0.3;
            }
            if (rk.outlet > 0) {
              x = Math.max(x, 58);
              if (isWing(slot)) y = 34 + (by - 34) * 0.95;
            }
          }
          if (gkOpp) {
            // v21 tendangan gawang lawan: penyerang tetap di depan (tidak mundur sejajar gelandang), makin tinggi
            // garis mulai menekan makin dekat ke bek tengah lawan di tepi kotak; gelandang serang di belakangnya
            const w = isWing(slot);
            if (isST(slot)) {
              x = clamp(76 + 5.5 * eng + (rk.press - 1) * 4, 62, 87);
              y = 34 + (by - 34) * 0.7;
            } else if (w) {
              x = clamp(68 + 8 * eng, 50, 85);
              y = 34 + (by - 34) * (eng >= 1 ? 0.7 : 0.95);
            } else if (slot === 'AM') {
              x = clamp(66 + 5 * eng, 54, 78);
              y = 34 + (bfy - 34) * 0.15;
            }
          }
          // disiplin posisi: positioning & konsentrasi rendah = sering tidak sejajar; lini belakang yang
          // terorganisasi (teamwork, positioning, konsentrasi) bergerak sebagai satu unit
          const err = ((21 - (a.pos + a.con) / 2) / 20) * famErr;
          x += b.ox * err * (def ? 0.8 * this.lineErr[side] : 1);
          y += b.oy * err;
          const mk = tk?.marking === 'man' ? this.marks.get(b) : undefined;
          if (def && trapOn && !this.trapLate.has(b)) {
            // jebakan offside: maju bersama, tidak mengikuti pelari lawan
            x = line + TUNE.trapStep + b.ox * err * 0.3;
            sprint = true;
          } else if (mk && mk.on && mk.hurt < 0 && this.fx(side, mk.x) < (def ? line + TUNE.manDef : 82)) {
            // man marking: menempel lawan yang dijaga dari sisi gawang sendiri
            const mfx = this.fx(side, mk.x);
            const mfy = this.fy(side, mk.y);
            x = mfx - (TUNE.manGap + (20 - a.mar) * 0.08);
            y = mfy + (34 - mfy) * 0.1;
            sprint = Math.hypot(this.fx(side, b.x) - x, this.fy(side, b.y) - y) > 5;
          } else if (def) {
            const m = this.markAdjust(b, side, line, x, y);
            x = m[0];
            y = m[1];
            sprint = m[2];
            // v17: bek tengah menutup ruang berbahaya yang dikuasai lawan
            if (!isFB(slot) && !sprint) [x, y] = this.coverSpace(b, side, x, y);
          }
          // mengawal mundur: kejar pelari lawan di sisinya sampai ke belakang
          if (rk.track > 0 && !def && !isHold(slot)) {
            const zy = 34 + (by - 34) * 0.85;
            let runner: Body | null = null;
            let rd = 15;
            for (const o of opps) {
              if (o.p.slot === 'GK') continue;
              const ofx = this.fx(side, o.x);
              if (!(o.run > 0 || this.dir(side) * o.vx < -2.5) || ofx > x + 4 || ofx < line - 6) continue;
              const dy = Math.abs(this.fy(side, o.y) - zy);
              if (dy < rd) {
                rd = dy;
                runner = o;
              }
            }
            if (runner) {
              x = this.fx(side, runner.x) - 1.5;
              y = this.fy(side, runner.y) + (34 - this.fy(side, runner.y)) * 0.1;
              sprint = true;
            }
          }
          if (isHold(slot)) {
            const runner = opps.find((o) => o.run > 0 && (isBox(o.p.slot) || o.p.slot === 'AM'));
            if (runner) {
              x = this.fx(side, runner.x) - 2;
              y = this.fy(side, runner.y);
              sprint = true;
            }
          }
        }
        b.tx = this.wx(side, clamp(x, 1, PITCH_W - 1));
        b.ty = this.wy(side, clamp(y, 1, PITCH_H - 1));
        // lari kembali ke posisi: bek tidak boleh tertinggal (mis. setelah sepak pojok), pemain lain
        // sprint kalau jauh dari posisinya, makin rajin (work rate) makin cepat kembali
        if (!sprint && slot !== 'GK') {
          const far = Math.hypot(b.x - b.tx, b.y - b.ty);
          const backLine = isDef(slot) || b.p.role === 'hb';
          const behind = !inPoss && this.fx(side, b.x) > bfx + 3;
          if (backLine) sprint = far > (inPoss ? 12 : behind ? 5 : 7);
          else if (!inPoss) sprint = far > 9 + (20 - a.wor) * 0.6 && (behind || b.rk.back >= 0.9);
          // v21 penyerang yang tertinggal di belakang garis lawan berlari menyusul (Off the Ball: lebih cepat sadar)
          else if (TUNE.pin > 0 && inPoss && (isST(slot) || isWing(slot))) {
            const fxNow = this.fx(side, b.x);
            if (this.fx(side, b.tx) > fxNow + 2) sprint = far > 6 + (20 - a.otb) * 0.4;
            // tertinggal di posisi offside (garis lawan maju): pemain yang cerdas cepat kembali onside
            else if (fxNow > oppLine - 0.2 && fxNow > bfx + 1) sprint = (a.otb + a.ant) / 2 > 6;
          }
        }
        b.sprint = sprint;
      }
    }
    if (live) this.activeRoles();
    this.setPieceShape();
  }

  /** Bek: geser ke lawan terdekat di sisinya, kejar lari lawan ke belakang garis (bingkai tim) */
  /** jebakan offside per tim: aktif sampai detik ini, boleh dipicu lagi setelah detik ini, bek yang terlambat */
  private trapUntil: [number, number] = [-1, -1];
  private trapNext: [number, number] = [0, 0];
  private trapLate = new Set<Body>();
  /** jumlah jebakan offside yang dipasang tiap tim */
  traps: [number, number] = [0, 0];
  /** man marking: pemain -> lawan yang dijaga */
  private marks = new Map<Body, Body>();
  private markNext: [number, number] = [0, 0];
  /** pengali kesalahan posisi lini belakang (organisasi: teamwork, positioning, konsentrasi) */
  private lineErr: [number, number] = [1, 1];

  /**
   * Jebakan offside: pembawa bola lawan punya waktu di depan lini belakang dan ada pelari di dekat garis.
   * Lini belakang maju bersama; bek dengan teamwork, konsentrasi & antisipasi rendah bisa terlambat
   * (dan malah membuat pelari lawan onside).
   */
  /** v21 jarak penyerang dari garis offside lawan: Off the Ball & Anticipation 20 = 0,8 m, 10 = 2,1 m, 5 = 2,75 m */
  private pinGap(a: EAttrs): number {
    return clamp(0.8 + (20 - a.otb) * 0.1 + (20 - a.ant) * 0.03, 0.8, 3.5);
  }

  /** v21 tendangan gawang pendek: instruksi pelatih "bagi bola ke bek tengah" dan/atau sweeper keeper */
  private shortGoalKick(side: 0 | 1): boolean {
    const tk = this.tk[side];
    const gk = this.keeper(side);
    return (gk?.p.role === 'sk' ? 1 : 0) + (tk ? (tk.gkShort ? 1 : -0.5) : 0) > 0;
  }

  /**
   * v21 posisi saat tendangan gawang sendiri (bingkai tim). Pendek: bek tengah melebar ke sudut kotak, bek sayap
   * tinggi & lebar, gelandang bertahan di depan kotak, sayap & penyerang menahan garis lawan (meregangkan lawan).
   * Panjang: tim naik mengerumuni zona jatuhnya bola di sekitar penyerang untuk memenangi bola kedua.
   */
  private goalKickSpot(b: Body, short: boolean, oppLine: number, x: number, y: number): [number, number] {
    const slot = b.p.slot;
    const [, by] = this.baseOf(b);
    const s = Math.sign(by - 34) || 1;
    if (slot === 'CB') return short ? [12, 34] : [17, 34];
    if (isCB(slot)) return short ? [6.5, 34 + s * 15] : [16, 34 + s * 11];
    if (isWB(slot)) return short ? [30, 34 + s * 30] : [40, 34 + s * 29];
    if (isFB(slot)) return short ? [22, 34 + s * 29] : [32, 34 + s * 27];
    if (isHold(slot)) return short ? [19, 34 + (slot === 'CM' ? 0 : s * 6)] : [40, 34 + (slot === 'CM' ? 0 : s * 7)];
    if (isBox(slot)) return short ? [34, 34 + s * 13] : [48, 34 + s * 11];
    if (slot === 'AM') return short ? [44, 34] : [54, 34];
    if (isWideMid(slot)) return short ? [44, 34 + s * 30] : [Math.min(oppLine - 3, 56), 34 + s * 24];
    if (isWing(slot)) return short ? [Math.min(oppLine - 1.5, 56), 34 + s * 31] : [Math.min(oppLine - 2, 60), 34 + s * 22];
    return [x, y];
  }

  /** v18 komunikasi kiper: -1..1 (Communication 1 = -0,9, 10 = 0, 20 = 1) */
  private gkCall(side: 0 | 1): number {
    const gk = this.keeper(side);
    return gk ? clamp((gk.p.a.com - 10) / 10, -1, 1) : -0.5;
  }

  private offsideTrap(side: 0 | 1, line: number, team: Body[], opps: Body[]): boolean {
    if (this.t < this.trapUntil[side]) return true;
    const o = this.owner;
    if (!o || o.side === side || this.t < this.trapNext[side] || this.restart || this.dead) return false;
    const ofx = this.fx(side, o.x);
    if (ofx < line + 10 || ofx > line + 40) return false;
    const [, pd] = this.nearest(team, o.x, o.y);
    if (pd < 2.5) return false;
    if (!opps.some((r) => r !== o && r.p.slot !== 'GK' && Math.abs(this.fx(side, r.x) - line) < 3)) return false;
    this.trapUntil[side] = this.t + TUNE.trapTime;
    this.trapNext[side] = this.t + 6;
    this.traps[side]++;
    // v18: kiper yang komunikatif meneriakkan aba-aba "maju!", bek lebih jarang terlambat
    const call = this.gkCall(side);
    for (const d of team) {
      if (!isDef(d.p.slot)) continue;
      this.trapLate.delete(d);
      const a = d.p.a;
      if (this.rng.chance(clamp(0.3 - ((a.tea + a.con + a.ant) / 3 - 10) * 0.025 - call * 0.1, 0.03, 0.5))) this.trapLate.add(d);
      else d.think = 0;
    }
    return true;
  }

  /** Man marking: tiap pemain (kecuali penyerang, pemain yang tetap di depan, dan bek penyapu) menjaga satu lawan */
  private assignMarks(side: 0 | 1, team: Body[], opps: Body[]) {
    this.markNext[side] = this.t + 3;
    const markers = team.filter((b) => b.p.slot !== 'GK' && !isST(b.p.slot) && b.rk.outlet === 0 && !(isCB(b.p.slot) && b.rk.step < 0));
    const taken = new Set<Body>();
    const free = new Set(markers);
    // pasangan lama tetap dipertahankan selama masih masuk akal
    for (const m of markers) {
      const t = this.marks.get(m);
      if (t && t.on && t.hurt < 0 && !taken.has(t) && Math.hypot(t.x - m.x, t.y - m.y) < 25 && this.fx(side, t.x) < 78) {
        taken.add(t);
        free.delete(m);
      } else this.marks.delete(m);
    }
    // lawan yang paling dekat ke gawang sendiri dijaga dulu; bek tengah lawan yang jauh di belakang tidak
    const targets = opps.filter((o) => o.p.slot !== 'GK' && !taken.has(o) && this.fx(side, o.x) < 78).sort((p, q) => this.fx(side, p.x) - this.fx(side, q.x));
    for (const t of targets) {
      let best: Body | null = null;
      let bd = 28;
      for (const m of free) {
        const d = Math.hypot(t.x - m.x, t.y - m.y);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (best) {
        this.marks.set(best, t);
        free.delete(best);
      }
    }
  }

  private markAdjust(b: Body, side: 0 | 1, line: number, x: number, y: number): [number, number, boolean] {
    const a = b.p.a;
    const step = isCB(b.p.slot) ? b.rk.step : 0;
    // stopper juga menjaga penyerang yang turun ke depan garis (sampai ~13 m)
    const ahead = step > 0 ? 4 + step * 3 : 4;
    let bestD = 13;
    let att: Body | null = null;
    for (const o of this.opponents(side)) {
      if (o.p.slot === 'GK') continue;
      const ox = this.fx(side, o.x);
      const dy = Math.abs(this.fy(side, o.y) - y);
      if (ox < line + ahead && dy < bestD) {
        bestD = dy;
        att = o;
      }
    }
    if (!att) return [x, y, false];
    const ox = this.fx(side, att.x);
    const oy = this.fy(side, att.y);
    // cover menjaga ruang: tidak terlalu terpancing mengikuti lawan ke samping
    const ny = y + (oy - y) * (0.25 + a.mar * 0.025) * (step < 0 ? 0.6 : 1);
    // lawan sudah lolos ke belakang garis: kejar dan tetap di sisi gawang
    if (ox < line - 1) return [Math.max(1, ox - 1.5), ny, true];
    // stopper: keluar dari garis menempel penyerang yang turun menjemput bola (tetap di sisi gawang)
    if (step > 0 && ox > line + 1.5) return [Math.max(x, ox - 1.6), y + (oy - y) * 0.85, ox - x > 6];
    return [x, ny, false];
  }

  /** Titik kiper: di garis antara bola dan tengah gawang, maju menyapu kalau garis pertahanan tinggi */
  /** Titik ideal kiper (bingkai tim): di garis antara bola dan tengah gawang */
  gkSpot(b: Body, line: number, ahead = 0): [number, number] {
    const side = b.side;
    const bfx = this.fx(side, clamp(this.ball.x + this.ball.vx * ahead, 0, PITCH_W));
    const bfy = this.fy(side, clamp(this.ball.y + this.ball.vy * ahead, 0, PITCH_H));
    const dist = Math.hypot(bfx, bfy - 34) || 1;
    let depth = clamp(1 + dist * 0.045, 1, 5.5);
    // sweeper keeper berdiri lebih tinggi di belakang garis pertahanan, tapi hanya saat bola jauh; makin dekat
    // bola, makin dekat ke gawang (tugas utama kiper tetap menjaga gawang). Kiper klasik tetap dekat gawang.
    const sk = b.p.role === 'sk';
    const far = clamp((dist - (sk ? 38 : 50)) / 22, 0, 1);
    if (far > 0) {
      const duty = b.p.duty === 'At' ? 2.5 : b.p.duty === 'De' ? -1.5 : 0.5;
      const maxD = sk ? 7 + duty + b.p.a.rus * 0.15 : 3.5 + b.p.a.rus * 0.1;
      const want = clamp(line - (sk ? 11 : 14), depth, maxD);
      depth += (want - depth) * far;
    }
    // v18: berdiri di garis bagi sudut antara bola dan kedua tiang (bukan garis ke tengah gawang): saat bola
    // di sisi lapangan, kiper bergeser ke tiang dekat tanpa membuka tiang jauh (bergerak di busur depan gawang)
    const u1x = -bfx;
    const u1y = 34 - GOAL_HALF - bfy;
    const u2y = 34 + GOAL_HALF - bfy;
    const l1 = Math.hypot(u1x, u1y) || 1;
    const l2 = Math.hypot(u1x, u2y) || 1;
    const bx = u1x / l1 + u1x / l2;
    const by = u1y / l1 + u2y / l2;
    const gy = bx < -1e-6 ? clamp(bfy + (-bfx / bx) * by, 34 - GOAL_HALF, 34 + GOAL_HALF) : 34;
    const dl = Math.hypot(bfx, bfy - gy) || 1;
    return [(bfx / dl) * depth, gy + ((bfy - gy) / dl) * depth];
  }

  /** Peran aktif tiap langkah: pembawa bola ditekan, bola lepas dikejar, penerima umpan menjemput */
  private activeRoles() {
    const owner = this.owner;
    if (owner) {
      const def = (1 - owner.side) as 0 | 1;
      const team = this.mates(def);
      // penekan pertama: yang paling cepat sampai, pekerja keras lebih sering maju
      let best: Body | null = null;
      let bt = Infinity;
      let second: Body | null = null;
      let st = Infinity;
      const ofx = this.fx(def, owner.x);
      const ofy = this.fy(def, owner.y);
      const dline = this.defLine(def, false);
      for (const b of team) {
        if (b.p.slot === 'GK') continue;
        let tt = Math.hypot(b.x - owner.x, b.y - owner.y) / vmaxOf(b) - b.p.a.wor * 0.03 - (b.rk.press - 1) * 0.35;
        // pemain lini belakang hanya keluar menekan di zonanya sendiri; jauh di depan, gelandang yang menekan
        if (isDef(b.p.slot) || b.p.role === 'hb') {
          const [, by] = this.baseOf(b);
          // stopper keluar menekan lebih jauh dari garis; cover & libero jarang meninggalkan garis
          const step = isCB(b.p.slot) ? b.rk.step : 0;
          const zone = ofx < dline + 11 + step * 3 && Math.abs(ofy - (34 + (by - 34) * 0.8)) < (isFB(b.p.slot) ? 17 : 13);
          if (!zone && ofx > 22) tt += 2.5;
          tt -= step * 0.08;
        }
        if (tt < bt) {
          second = best;
          st = bt;
          best = b;
          bt = tt;
        } else if (tt < st) {
          second = b;
          st = tt;
        }
      }
      const k = this.k[def];
      // tim yang bertahan dalam tidak menekan tinggi: menunggu di depan pembawa bola
      const tkd = this.tk[def];
      const cpress = this.counterPressing(def);
      // garis mulai menekan dari taktik pelatih; counter-press: langsung memburu bola di mana pun
      const engage = tkd ? 72 + 12 * tkd.engage : 50 + 50 * k.press;
      // tiap pemain punya pemicu menekan sendiri: peran penekan, work rate, dan agresi membuatnya menekan lebih tinggi
      const deepFor = (b: Body) =>
        !cpress && this.fx(def, owner.x) > engage + (b.rk.press - 1) * 14 + (b.p.a.wor - 10) * 0.9 + (b.p.a.agg - 10) * 0.3;
      const deep = best ? deepFor(best) : true;
      if (best) {
        const gx = this.wx(def, 0);
        const d = Math.hypot(gx - owner.x, 34 - owner.y) || 1;
        // tekan dari sisi gawang sendiri, berhenti sedikit di depan pembawa bola
        const gap = deep ? 7 : 0.8;
        best.tx = owner.x + owner.vx * 0.3 + ((gx - owner.x) / d) * gap;
        best.ty = owner.y + owner.vy * 0.3 + ((34 - owner.y) / d) * gap;
        best.sprint = !deep;
        best.think = Math.max(best.think, 0.1);
      }
      // penekan kedua: pekerja keras, atau selalu kalau timnya gegenpress
      const keen = second ? cpress || k.press > 1.3 || second.rk.press > 1.3 || second.p.a.wor + second.p.a.tea > 22 / (k.press * second.rk.press) : false;
      if (second && !deepFor(second) && keen && !isDef(second.p.slot)) {
        const gx = this.wx(def, 0);
        second.tx = (owner.x * 2 + gx) / 3;
        second.ty = (owner.y * 2 + 34) / 3;
        second.sprint = second.p.a.wor > 12;
      }
      // kiper: menutup sudut saat lawan lolos sendirian di kotak
      const gk = this.keeper(def);
      if (gk && this.inBox(def, owner.x, owner.y)) {
        const gx = this.wx(def, 0);
        const d = Math.hypot(gx - owner.x, 34 - owner.y);
        if (d < 15) {
          const out = clamp(d - 2.5 - (20 - gk.p.a.ono) * 0.1, 1, 9) / d;
          gk.tx = gx + (owner.x - gx) * out;
          gk.ty = 34 + (owner.y - 34) * out;
          gk.sprint = true;
        }
      }
      return;
    }
    if (this.shot) {
      // kiper terjun ke garis tembakan
      const s = this.shot;
      const gk = this.keeper((1 - s.by.side) as 0 | 1);
      if (gk && gk.dive > 0 && gk.think <= 0) {
        const b = this.ball;
        const tt = Math.abs(s.gkX - b.x) / (Math.abs(b.vx) || 1);
        gk.tx = s.gkX;
        gk.ty = s.diveY ?? clamp(b.y + b.vy * tt, 30, 38);
        gk.sprint = true;
      }
      return;
    }
    // bola lepas atau umpan di udara
    this.predict();
    const pass = this.pass;
    const p10 = this.traj[Math.min(10, this.traj.length - 1)];
    // tiap tim: pemain lapangan tercepat dan kiper (kalau boleh keluar) dinilai terpisah
    type Reach = { b: Body; r: [number, number, number]; tt: number };
    const field: (Reach | null)[] = [null, null];
    const keep: (Reach | null)[] = [null, null];
    for (const side of [0, 1] as const) {
      const dline = this.defLine(side, this.poss === side);
      for (const b of this.mates(side)) {
        let hands = b.p.slot === 'GK';
        let r: [number, number, number] | null = null;
        if (hands && !this.inBox(side, p10.x, p10.y)) {
          // v18: bola (umpan silang) yang baru bisa diraih di dalam kotak: kiper boleh menyambutnya di sana
          const rh = this.reachPoint(b, true);
          if (rh[2] < 99 && this.inBox(side, rh[0], rh[1])) r = rh;
          // sweeper keeper keluar dari kotak hanya untuk bola terobosan di depan kotaknya (bukan ke sayap)
          else if (b.p.role !== 'sk' || this.fx(side, p10.x) > 30 || Math.abs(this.fy(side, p10.y) - 34) > 20 || p10.z > 1.5) continue;
          else hands = false;
        }
        if (pass && b === pass.from && pass.from.side === side) continue;
        r ??= this.reachPoint(b, hands);
        // penerima umpan selalu menjemput bola; bek tidak mengejar bola jauh di depan garisnya
        let tt = pass && b === pass.to ? r[2] - 0.5 : r[2];
        if ((isDef(b.p.slot) || b.p.role === 'hb') && this.fx(side, r[0]) > dline + 18 && b !== pass?.to) tt += 1.2;
        const slot = b.p.slot === 'GK' ? keep : field;
        if (!slot[side] || tt < slot[side]!.tt) slot[side] = { b, r, tt };
      }
    }
    for (const side of [0, 1] as const) {
      let pick = field[side];
      const gk = keep[side];
      // v18 bola atas ke kotak: "bola kiper!" - kiper didahulukan dari rekannya kalau bisa meraihnya;
      // Command of Area membuatnya berani keluar menyambut bola, kiper eksentrik tidak terduga
      const ga = gk?.b.p.a;
      const air = !!gk && (p10.z > 1.5 || !!pass?.cross) && this.inBox(side, gk.r[0], gk.r[1]);
      const claim = ga && air ? (ga.cmd - 10) * TUNE.claimK + (ga.hgt - 188) * 0.006 + (ga.ecc > 10 ? (ga.ecc - 10) * 0.03 * this.rng.float(-0.5, 1) : 0) : 0;
      if (gk && ga && (!pick || gk.tt < pick.tt + (air ? 0.3 + claim * 2 : 0))) {
        // kiper hanya meninggalkan gawang kalau yakin sampai lebih dulu dari lawan; bola dekat gawang selalu diambil
        const other = (1 - side) as 0 | 1;
        const opp = Math.min(field[other]?.tt ?? Infinity, keep[other]?.tt ?? Infinity);
        const dGoal = Math.hypot(this.fx(side, gk.r[0]), this.fy(side, gk.r[1]) - 34);
        const out = !this.inBox(side, gk.r[0], gk.r[1]);
        const margin = dGoal < 6.5 ? -0.4 : (air ? -0.25 : 0.15) + (out ? 0.2 : 0) - (ga.rus - 10) * 0.01 - (ga.dec - 10) * 0.01 - claim;
        if (gk.tt + margin < opp) pick = gk;
      }
      if (pick) {
        pick.b.tx = pick.r[0];
        pick.b.ty = pick.r[1];
        pick.b.sprint = true;
        pick.b.think = Math.max(pick.b.think, 0.1);
      }
    }
  }

  /** Bola mati: jarak lawan dari bola, pagar tendangan bebas, posisi pojok & penalti */
  private setPieceShape() {
    const r = this.restart ?? this.dead;
    if (!r) return;
    const att = r.side;
    const def = (1 - att) as 0 | 1;
    if (r.kind === 'corner' || (r.kind === 'free' && this.restart?.cross)) this.cornerTargets();
    if (r.kind === 'penalty') {
      const spotX = this.wx(att, PITCH_W - 11);
      for (const b of this.active()) {
        if (b.p.slot === 'GK' && b.side === def) {
          b.tx = this.wx(def, 0.4);
          b.ty = 34;
          continue;
        }
        const f = this.fx(att, b.tx);
        if (f > PITCH_W - BOX_X - 1) b.tx = this.wx(att, PITCH_W - BOX_X - 1.5);
        if (Math.hypot(b.tx - spotX, b.ty - 34) < 10) b.tx = this.wx(att, PITCH_W - BOX_X - 3);
      }
      return;
    }
    if (r.kind === 'kickoff') {
      for (const b of this.active()) {
        const [x, y] = this.kickoffSpot(b);
        b.tx = x;
        b.ty = y;
        // masih jauh (mis. setelah selebrasi di bendera sudut): berlari kecil kembali
        b.sprint = Math.hypot(b.x - x, b.y - y) > 9;
      }
      return;
    }
    const minD = r.kind === 'throw' ? 2.5 : r.kind === 'goalkick' ? 0 : 9.15;
    for (const b of this.mates(def)) {
      b.sprint = false;
      if (r.kind === 'goalkick') {
        // lawan harus di luar kotak penalti saat tendangan gawang
        if (this.inBox(att, b.tx, b.ty)) b.tx = this.wx(att, BOX_X + 1.5);
        continue;
      }
      const d = Math.hypot(b.tx - r.x, b.ty - r.y);
      if (d < minD) {
        const k = minD / (d || 1);
        b.tx = r.x + (b.tx - r.x) * k;
        b.ty = r.y + (b.ty - r.y) * k;
      }
    }
    // pagar tendangan bebas langsung
    if (r.kind === 'free' && this.restart?.direct) {
      const gx = this.wx(def, 0);
      const d = Math.hypot(gx - r.x, 34 - r.y) || 1;
      const ux = (gx - r.x) / d;
      const uy = (34 - r.y) / d;
      const wall = this.mates(def)
        .filter((b) => b.p.slot !== 'GK')
        .sort((p, q) => Math.hypot(p.x - r.x, p.y - r.y) - Math.hypot(q.x - r.x, q.y - r.y))
        .slice(0, 4);
      wall.forEach((b, i) => {
        const off = (i - 1.5) * 0.7;
        b.tx = r.x + ux * 9.15 - uy * off;
        b.ty = r.y + uy * 9.15 + ux * off;
      });
    }
    for (const b of this.active()) {
      b.tx = clamp(b.tx, 0.5, PITCH_W - 0.5);
      b.ty = clamp(b.ty, 0.5, PITCH_H - 0.5);
      // jam berhenti: pemain yang masih jauh berlari ke posisinya supaya bola bisa segera dimainkan
      if (FROZEN.has(r.kind) && Math.hypot(b.x - b.tx, b.y - b.ty) > 6) b.sprint = true;
    }
  }

  /**
   * Sepak pojok / bola mati dari sayap: bek tengah, striker, dan gelandang naik ke kotak (sprint
   * kalau masih jauh); lawan menjaga zona di depan gawang dan menempel pemain yang naik.
   */
  private cornerTargets() {
    const r = this.restart ?? this.dead;
    if (!r) return;
    const att = r.side;
    const def = (1 - att) as 0 | 1;
    const corner = r.kind === 'corner';
    // sisi bola: pemain menyebar dari tiang dekat ke tiang jauh
    const near = Math.sign(this.fy(att, r.y) - 34) || 1;
    // tempat di kotak, diisi menurut urutan tempat formasi yang cocok (formasi apa pun)
    const spots: [Slot[], number, number][] = corner
      ? [[['RCB', 'CB', 'LCB'], 95, 34 + near * 2], [['LCB', 'CB', 'RCB'], 94.5, 34 - near * 4], [['ST', 'RS', 'LS'], 97.5, 34 + near * 4.5], [['CM', 'RDM', 'LDM', 'RCM', 'LCM'], 92, 34 - near * 1], [['LW', 'LS', 'LM', 'AM'], 96.5, 34 - near * 7.5], [['RW', 'RM', 'AM', 'RCM'], 88, 34 + near * 6]]
      : [[['RCB', 'CB', 'LCB'], 91, 34 + near * 2], [['LCB', 'CB', 'RCB'], 90.5, 34 - near * 4], [['ST', 'RS', 'LS'], 92, 34 + near * 5], [['CM', 'RDM', 'LDM', 'RCM', 'LCM'], 88, 34 - near * 1], [['LW', 'LS', 'LM', 'AM'], 91, 34 - near * 8], [['RW', 'RM', 'AM', 'RCM'], 85, 34 + near * 8]];
    const taker = this.restartTaker();
    const up: Body[] = [];
    const pick = (team: Body[], prefs: Slot[], used: Set<Body>) => {
      for (const sl of prefs) {
        const b = team.find((q) => q.p.slot === sl && !used.has(q));
        if (b) return b;
      }
      return undefined;
    };
    const taken = new Set<Body>(taker ? [taker] : []);
    for (const [prefs, x, y] of spots) {
      const b = pick(this.mates(att), prefs, taken);
      if (!b) continue;
      taken.add(b);
      b.tx = this.wx(att, x);
      b.ty = this.wy(att, y);
      b.sprint = Math.hypot(b.x - b.tx, b.y - b.ty) > 5;
      up.push(b);
    }
    // v18 sepak pojok pendek: bek sayap / wing back di sisi bola datang mendekat ke pengambil
    if (corner && this.restart?.routine === 'short') {
      const fb = this.mates(att).find((b) => !taken.has(b) && (isFB(b.p.slot) || isWB(b.p.slot)) && Math.sign(this.baseOf(b)[1] - 34) === near);
      if (fb) {
        fb.tx = this.wx(att, PITCH_W - 7);
        fb.ty = this.wy(att, 34 + near * 27);
        fb.sprint = Math.hypot(fb.x - fb.tx, fb.y - fb.ty) > 5;
      }
    }
    // bertahan: tiga pemain menjaga zona, sisanya menempel penyerang di sisi gawang
    const defs = this.mates(def).filter((b) => b.p.slot !== 'GK');
    const zone: [number, number][] = corner
      ? [[5.5, 34 + near * 2.5], [6, 34 - near * 1.5], [4.5, 34 + near * 6]]
      : [[13, 34], [13, 34 - near * 6], [13, 34 + near * 6]];
    const zoneOrder: Slot[] = ['CM', 'RCM', 'LCM', 'RDM', 'LDM', 'AM', 'RM', 'LM'];
    const used = new Set<Body>();
    for (const [x, y] of zone) {
      const b = pick(defs, zoneOrder, used);
      if (!b) continue;
      b.tx = this.wx(def, x);
      b.ty = this.wy(def, y);
      b.sprint = Math.hypot(b.x - b.tx, b.y - b.ty) > 6;
      used.add(b);
    }
    const markers = defs.filter((b) => !used.has(b) && !isWing(b.p.slot) && (!isST(b.p.slot) || corner));
    for (const a of up) {
      // penjaga terkuat di udara menempel penyerang paling berbahaya
      let mk: Body | null = null;
      for (const b of markers) if (!mk || Math.hypot(b.x - a.x, b.y - a.y) < Math.hypot(mk.x - a.x, mk.y - a.y)) mk = b;
      if (!mk) break;
      markers.splice(markers.indexOf(mk), 1);
      const gx = this.wx(def, 0);
      const d = Math.hypot(gx - a.tx, 34 - a.ty) || 1;
      mk.tx = a.tx + ((gx - a.tx) / d) * 1.1;
      mk.ty = a.ty + ((34 - a.ty) / d) * 1.1;
      mk.sprint = Math.hypot(mk.x - mk.tx, mk.y - mk.ty) > 5;
    }
    const gk = this.keeper(def);
    if (gk) {
      gk.tx = this.wx(def, corner ? 1 : 3);
      gk.ty = this.wy(def, 34 + near * (corner ? 1.2 : 0.5));
    }
  }

  // --- gerak pemain -----------------------------------------------------------------

  private move(b: Body) {
    const a = b.p.a;
    const isOwner = b === this.owner;
    const vmax = vmaxOf(b);
    let cap: number;
    if (b.dive > 0) cap = vmax * 1.2;
    else if (isOwner) cap = vmax * (b.sprint ? 0.68 + a.dri * 0.012 : 0.45);
    else if (b.sprint) cap = vmax;
    // kiper bergeser cepat menyesuaikan posisi; positioning & antisipasi membuatnya selalu tepat waktu
    else if (b.p.slot === 'GK') cap = vmax * (0.45 + (a.pos + a.ant) * 0.015);
    else cap = vmax * (0.42 + a.wor * 0.006);
    const dx = b.tx - b.x;
    const dy = b.ty - b.y;
    const d = Math.hypot(dx, dy);
    const want = d < 0.25 ? 0 : Math.min(cap, d * 1.6 + 0.4);
    const wvx = d ? (dx / d) * want : 0;
    const wvy = d ? (dy / d) * want : 0;
    // akselerasi & kelincahan menentukan seberapa cepat mengubah kecepatan dan arah;
    // makin dekat kecepatan puncak, makin kecil tambahan kecepatannya (mengerem tetap penuh)
    const sp0 = Math.hypot(b.vx, b.vy);
    const speeding = want > sp0 ? 1 - 0.6 * Math.min(1, sp0 / vmax) : 1;
    const amax = accOf(b) * (b.sprint || b.dive > 0 ? 1 : 0.8) * speeding;
    let ax = wvx - b.vx;
    let ay = wvy - b.vy;
    const al = Math.hypot(ax, ay);
    const lim = amax * DT;
    if (al > lim) {
      ax *= lim / al;
      ay *= lim / al;
    }
    b.vx += ax;
    b.vy += ay;
    b.x = clamp(b.x + b.vx * DT, -2, PITCH_W + 2);
    b.y = clamp(b.y + b.vy * DT, -2, PITCH_H + 2);
    if (isOwner) {
      b.x = clamp(b.x, 0.6, PITCH_W - 0.6);
      b.y = clamp(b.y, 0.6, PITCH_H - 0.6);
    }
    // tenaga: sprint menguras, stamina menentukan seberapa cepat
    const sp = Math.hypot(b.vx, b.vy);
    // kelelahan jangka panjang: tiap menit di lapangan menguras tenaga (stamina menentukan seberapa cepat,
    // tim yang banyak menekan lebih cepat lelah); tenaga sprint pulih saat jogging, tapi tidak melewati batas ini
    // intensitas taktik (pressing, tempo, garis tinggi) menguras tenaga; stamina & natural fitness menahannya
    const tkb = this.tk[b.side];
    const inten = tkb ? 0.7 + 0.6 * tkb.intensity : 0.75 + 0.25 * this.k[b.side].press;
    if (!this.frozen()) b.tire += DT * TUNE.tire * (1.5 - a.sta / 20) * (1.15 - a.nf * 0.015) * inten * (b.p.slot === 'GK' ? 0.3 : 1);
    const fresh = 1 - b.tire;
    if (sp > vmax * 0.7) b.energy = Math.max(0.2, b.energy - DT * 0.004 * (1.6 - a.sta / 20) * (tkb ? 0.5 + 0.9 * tkb.intensity : 0.4 + 0.6 * this.k[b.side].press));
    else b.energy = Math.min(fresh, b.energy + DT * 0.0012 * (a.sta / 20));
    b.energy = Math.max(0.2, Math.min(b.energy, fresh));
  }

  // --- aksi pemain yang menguasai bola -------------------------------------------

  private gain(b: Body) {
    this.owner = b;
    this.lastTouch = b;
    if (this.poss !== b.side) this.wonAt[b.side] = this.t;
    this.poss = b.side;
    this.pass = null;
    // tanpa tekanan pemain mengontrol dulu dan mengangkat kepala; pengambil keputusan bagus lebih cepat
    // first touch menentukan berapa lama bola dikontrol; ditekan dari dekat = harus cepat
    const [, pd] = this.nearest(this.opponents(b.side), b.x, b.y);
    const a = b.p.a;
    b.cool =
      pd < 3
        ? 0.12 + (20 - a.ft) * 0.01
        : (TUNE.hold + (20 - a.ft) * 0.012 + (20 - a.dec) * 0.012) * this.k[b.side].hold * b.rk.hold;
    b.run = 0;
    const ball = this.ball;
    ball.vx = ball.vy = ball.vz = 0;
    ball.z = 0;
  }

  private decide(c: Body) {
    const side = c.side;
    const a = c.p.a;
    const fx = this.fx(side, c.x);
    const fy = this.fy(side, c.y);
    const opps = this.opponents(side);
    const [near, pd] = this.nearest(opps, c.x, c.y);
    const pressure = pd < 2 ? 1 : pd < 4 ? 0.5 : 0;
    // diving: penyerang dengan Sportsmanship rendah menjatuhkan diri saat dijaga ketat di sekitar kotak penalti
    if (
      near && a.spo < 9 && pd < 1.8 && near.p.slot !== 'GK' && fx > PITCH_W - BOX_X - 6 && Math.abs(fy - 34) < BOX_Y + 4 &&
      this.rng.chance((9 - a.spo) * TUNE.dive)
    ) {
      this.simulate(c, near);
      return;
    }
    const tk = this.tk[side];
    // pemahaman taktik & kebebasan kreatif: pemain yang belum paham ragu-ragu, tim ekspresif lebih spontan
    const noise = () => this.rng.normal(0, 0.04 + (20 - a.dec) * 0.012 + (1 - (c.p.a && (c.p.fam ?? 1))) * 0.03 + (tk?.creative ?? 0) * 0.01);
    // serangan balik: setelah merebut bola tim langsung mencari jalan maju
    const cp = this.counterPhase(side) ? 1.2 : 1;
    const keeper = c.p.slot === 'GK';
    const oppLine = this.offsideLine(side);
    const k = this.k[side];
    const rk = c.rk;
    const options: [number, () => void][] = [];

    // ruang di depan: lawan terdekat di koridor selebar 14 m ke arah gawang lawan
    let space = 20;
    let front: Body | null = null;
    for (const o of opps) {
      const ofx = this.fx(side, o.x);
      const ofy = this.fy(side, o.y);
      if (ofx > fx - 1 && Math.abs(ofy - fy) < 7) {
        const dd = Math.hypot(ofx - fx, ofy - fy);
        if (dd < space) {
          space = dd;
          front = o;
        }
      }
    }

    // tembak
    const distGoal = Math.hypot(PITCH_W - fx, 34 - fy);
    if (distGoal < 35 && !keeper) {
      const xg = this.xgAt(fx, fy);
      const v =
        this.shotProb(c, fx, fy, pressure) * TUNE.shootV * k.shoot * (1 + rk.shoot) -
        // pemain yang frustrasi lebih nekat menembak dari jauh
        (distGoal > 22 ? 0.14 - a.lon * 0.009 - rk.long - c.frus * 0.1 : 0) +
        (distGoal < 20 ? 0.12 : 0) +
        // bebas tanpa penjaga: langsung tembak hanya dari posisi bagus (bukan dari sudut sempit / jauh)
        (pd > 3 && xg > TUNE.openXg ? TUNE.openShot : 0);
      options.push([v + noise(), () => this.shoot(c, xg, pressure)]);
    }

    // umpan
    for (const m of this.mates(side)) {
      if (m === c) continue;
      const d = Math.hypot(m.x - c.x, m.y - c.y);
      if (d < 4 || d > 52) continue;
      if (d > 32 && a.vis < 11 && !keeper) continue;
      const mfx = this.fx(side, m.x);
      const mfy = this.fy(side, m.y);
      const progress = mfx - fx;
      const [, open] = this.nearest(opps, m.x, m.y);
      // v17: risiko jalur berbasis waktu (siapa yang lebih dulu sampai di lintasan bola)
      const vEnd = 8 + a.pas * 0.2;
      const ground = this.laneRisk(c, m.x, m.y, false, vEnd, false);
      const wide = fx > (tk?.crosses === 'awal' ? 62 : 72) && Math.abs(fy - 34) > 12;
      const inBox = mfx > 87 && Math.abs(mfy - 34) < 18;
      // penyerang di depan kotak bisa dicari dengan umpan silang ke ruang di depannya
      const runner = mfx > 76 && Math.abs(mfy - 34) < 17 && !isBack(m.p.slot) && m.p.slot !== 'GK';
      const cross = wide && (inBox || runner);
      const air = cross || d > 30 || (ground > 0.8 && d > 18 && (a.pas + a.tec) / 2 > 11);
      const risk = air ? this.laneRisk(c, m.x, m.y, true, vEnd, false, m) : ground;
      // di sepertiga akhir, umpan ke belakang tidak terlalu dihukum: yang penting peluang si penerima
      // umpan ke belakang tidak terlalu dihukum (menjaga bola, mencari jalan lain), umpan maju ada batasnya
      const prog = progress < 0 ? progress * (fx > 70 ? 0.6 : TUNE.back) : Math.min(progress, 28);
      // pengumpan kreatif (vision, flair) lebih berani dan lebih mencari rekan di posisi berbahaya
      const daring = Math.max(0.3, 1.25 - a.vis * 0.0125 - a.fla * 0.0075 - rk.create);
      const danger = 0.6 + a.vis * 0.03;
      let v =
        0.22 +
        (prog / TUNE.progW) * k.prog * cp +
        Math.min(open, 8) * 0.03 -
        risk * (cross ? 0.2 : air ? 0.3 : TUNE.risk) * (fx > 70 ? 0.6 : 1) * k.risk * daring -
        (d > 30 ? 0.12 : 0) +
        (air ? k.long + rk.direct * (d > 28 ? 1 : 0.3) : 0) +
        this.xgAt(mfx, mfy) * TUNE.xgPassW * clamp(open / 4, 0.3, 1.2) * danger +
        (m.run > 0 ? TUNE.runPass : 0) +
        // umpan aman ke rekan yang bebas menjaga penguasaan bola (membangun serangan)
        // (ruang luas di depan pembawa bola: lebih baik dibawa maju daripada dioper ke samping)
        (risk < 0.25 && open > 5 && !air ? (TUNE.keep * k.keep * (fx < 55 ? 1 : 0.3) + rk.safe) * (space > 12 && pressure === 0 ? 0.5 : 1) : 0) +
        // rekan yang pandai mengatur permainan lebih sering dicari
        (m.p.a.vis + m.p.a.pas - 20) * 0.006;
      if (m.p.slot === 'GK') v -= 0.5;
      if (cross) {
        const [lx, ly] = this.crossSpot(mfx, mfy);
        v += TUNE.cross + k.cross + rk.cross + (a.cro - 10) * 0.02 + (m.p.a.hea - 10) * 0.015 + this.xgAt(lx, ly) * 0.8;
      }
      // target man: dicari dengan bola atas, apalagi kalau kuat & jago duel udara
      if (air && m.rk.target > 0) v += m.rk.target * (0.06 + (m.p.a.hea + m.p.a.str - 20) * 0.006);
      // tidak langsung mengembalikan bola ke pengumpan (kecuali ia berlari untuk umpan satu-dua)
      if (m === this.lastPasser && m.run <= 0 && pressure === 0) v -= TUNE.giveGo;
      else if (m === this.lastPasser && m.run > 0 && (m.rk.oneTwo > 0 || rk.oneTwo > 0)) v += 0.12;
      // fokus serangan dari pelatih (tengah / sayap / sisi kiri / sisi kanan)
      if (tk?.focus && mfx > 45) {
        const inZone =
          tk.focus === 'tengah' ? Math.abs(mfy - 34) < 12 : tk.focus === 'sayap' ? Math.abs(mfy - 34) > 17 : tk.focus === 'kiri' ? mfy < 26 : mfy > 42;
        if (inZone) v += 0.06;
      }
      if (pressure > 0 && fx > 75 && open > 5 && mfx > 65) v += 0.15 * pressure * 2;
      if (fx > 92 && Math.abs(fy - 34) > 9 && mfx > 78 && mfx < 96 && Math.abs(mfy - 34) < 13 && progress < 0) v += 0.3;
      // kiper: sweeper keeper membangun dari belakang lewat bek yang bebas, kiper klasik lebih sering menendang jauh
      if (keeper) {
        // instruksi pelatih (bagi bola ke bek tengah / tendang jauh) ditambah gaya kiper sendiri
        const short = (c.p.role === 'sk' ? 1 : 0) + (tk ? (tk.gkShort ? 1 : -0.5) : 0);
        // (v18: kiper yang pandai melempar lebih sering memulai serangan dengan lemparan pendek)
        if (isDef(m.p.slot) && open > 8) v += 0.15 + 0.2 * Math.max(0, short) + (d < 40 ? (a.thr - 10) * 0.012 : 0);
        else if (d > 35) v += (a.kic - 10) * 0.02 + 0.2 - 0.15 * Math.max(0, short);
      }
      // rekan berdiri offside: pengumpan dengan visi & keputusan bagus tidak memberi bola
      if (this.isOffside(m, oppLine, fx) && m.run <= 0 && this.rng.chance(0.45 + (a.vis + a.dec) * 0.0125)) v -= 1;
      options.push([v + noise(), () => this.passTo(c, m, air, false, 0, cross)]);

      // umpan terobosan (killer ball) ke ruang di belakang garis pertahanan untuk rekan yang berlari
      const runs = m.run > 0 || mfx > oppLine - 5;
      if (keeper || fx < 30 || isBack(m.p.slot) || m.p.slot === 'GK' || !runs || oppLine > 95) continue;
      if (this.isOffside(m, oppLine, fx)) continue;
      // pengumpan bervisi tinggi jauh lebih sering melihat celahnya
      if (!this.rng.chance(clamp(0.06 + (a.vis - 6) * 0.05 + rk.create * 0.5, 0.03, 0.85))) continue;
      // v17: titik di ruang kosong yang paling jelas dimenangkan si pelari (adu cepat dengan bek & kiper)
      const spot = this.spaceSpot(c, m, oppLine, mfx, mfy);
      if (!spot) continue;
      const [tfx, tfy, win] = spot;
      const tx = this.wx(side, tfx);
      const ty = this.wy(side, tfy);
      const trisk = this.laneRisk(c, tx, ty, false, 4 + a.pas * 0.15, true);
      const chip = trisk > 0.6 && (a.pas + a.tec) / 2 > 13;
      const tv =
        0.15 + (a.vis - 10) * 0.035 + (a.pas - 10) * 0.02 + (a.dec - 10) * 0.01 + (a.fla - 10) * 0.01 +
        this.xgAt(tfx, tfy) * TUNE.xgPassW * 0.9 * (0.4 + 0.8 * win) + (m.run > 0 ? 0.1 : 0) + (k.prog - 1) * 0.2 + rk.create -
        (chip ? 0.25 : trisk * 0.45) - (1 - win) * TUNE.spaceLose;
      options.push([tv + noise(), () => this.passTo(c, m, chip, false, chip ? 0.3 : 0, false, [tfx, tfy])]);
    }

    // buang bola dari kotak sendiri saat ditekan
    if (fx < 20 && pressure > 0 && !keeper) {
      const v = 0.2 + pressure * 0.45 - (a.tec + a.cmp) / 80 + rk.clear;
      options.push([v + noise(), () => this.clear(c)]);
    }

    // dribel / membawa bola: dribbling, flair, dan technique membuat pemain lebih suka membawa bola
    if (!keeper) {
      const flair = (a.dri - 10) * 0.02 + (a.fla - 10) * 0.012 + (a.tec - 10) * 0.006 + (a.cmp - 10) * 0.005;
      // di sayap dekat garis gawang tidak ada ruang lagi: saatnya mengumpan silang
      const corner = fx > 84 && Math.abs(fy - 34) > 14 ? 0.12 : 0;
      const [cv, ctx, cty] = this.bestCarry(c, fx, fy);
      const v = TUNE.carryBase + k.drib + rk.carry + flair + cv + Math.min(space, 15) * TUNE.carrySpace - pressure * 0.25 - corner;
      options.push([v + noise(), () => this.dribble(c, ctx, cty, space)]);
      // melewati lawan yang menghadang (take-on): winger dengan dribbling, flair, bravery, technique
      if (front && space < 6 && fx > 30) {
        const o = front;
        const tv =
          TUNE.takeOn + k.drib + rk.takeOn + (a.dri - 10) * 0.035 + (a.fla - 10) * 0.03 + (a.bra - 10) * 0.012 + (a.tec - 10) * 0.01 +
          (a.agi - 10) * 0.01 - (o.p.a.tck - 10) * 0.01 + (fx > 60 ? 0.12 : 0) + (fx > 80 ? 0.06 : 0) - (fx < 45 ? 0.15 : 0);
        options.push([tv + noise(), () => this.takeOn(c, o)]);
      }
    }

    if (!options.length) options.push([0, () => this.clear(c)]);
    let best = options[0];
    for (const o of options) if (o[0] > best[0]) best = o;
    best[1]();
    // (Math.max: aksi seperti umpan silang yang terblok sudah memberi jeda lebih lama)
    c.cool = Math.max(c.cool, keeper ? 0.6 : this.owner === c ? (0.35 + this.rng.float(0, 0.4)) * k.hold : 0.5 - a.dec * 0.012);
  }

  /** Tendang bola: arah, kecepatan, dan tinggi dihitung supaya sampai di titik tujuan */
  private kick(c: Body, tx: number, ty: number, air: boolean, err: number, lob = 0, soft = false) {
    const d0 = Math.hypot(tx - c.x, ty - c.y) || 1;
    // salah arah dan salah jarak sesuai kemampuan
    const ang = this.rng.normal(0, err);
    const len = d0 * (1 + this.rng.normal(0, err * 0.4));
    const ux = (tx - c.x) / d0;
    const uy = (ty - c.y) / d0;
    const dx = ux * Math.cos(ang) - uy * Math.sin(ang);
    const dy = ux * Math.sin(ang) + uy * Math.cos(ang);
    const b = this.ball;
    b.x = c.x + dx * 0.5;
    b.y = c.y + dy * 0.5;
    b.z = 0.1;
    if (air) {
      const T = clamp(0.8 + len * 0.032 + lob, 0.7, 2.6);
      const h = len / T;
      b.vx = dx * h;
      b.vy = dy * h;
      b.vz = (G * T) / 2;
    } else {
      // bola sampai di kaki penerima dengan kecepatan yang masih bisa dikontrol
      // umpan terobosan: bola melambat di ruang kosong supaya bisa dikejar pelari
      const vEnd = soft ? 4 + c.p.a.pas * 0.15 : 8 + c.p.a.pas * 0.2;
      const v0 = Math.min(24, Math.sqrt(vEnd * vEnd + 2 * ROLL * len));
      b.vx = dx * v0;
      b.vy = dy * v0;
      b.vz = 0;
      b.z = 0;
    }
    this.owner = null;
    this.lastTouch = c;
  }

  /** Titik jatuh umpan silang ke ruang di depan penyerang (bingkai tim penyerang) */
  private crossSpot(mfx: number, mfy: number): [number, number] {
    return [clamp(Math.max(mfx + 6, 92), 90, 98), 34 + clamp((mfy - 34) * 0.6, -9, 9)];
  }

  private passTo(c: Body, m: Body, air: boolean, setPiece: boolean, lob = 0, intoBox = false, spot?: [number, number]) {
    const a = c.p.a;
    const side = c.side;
    let tx: number;
    let ty: number;
    const vEnd = 8 + a.pas * 0.2;
    if (spot) {
      // umpan terobosan ke ruang kosong: penerima langsung berlari mengejarnya
      tx = this.wx(side, spot[0]);
      ty = this.wy(side, spot[1]);
      c.st.throughBalls++;
      m.run = Math.max(m.run, 2.5);
      m.runY = -1;
    } else if (intoBox) {
      // umpan silang bisa diblok bek yang menempel: bola sering keluar garis gawang
      const [o, od] = this.nearest(this.opponents(side), c.x, c.y);
      if (o && od < 2.2 && o.p.slot !== 'GK' && this.rng.chance(Math.min(0.8, (0.2 + o.p.a.pos * 0.01) * TUNE.crossBlock))) {
        this.blockCross(c, o);
        return;
      }
      // umpan silang: bola dilambungkan ke ruang di kotak, penerima berlari menyambutnya
      const [lx, ly] = this.crossSpot(this.fx(side, m.x), this.fy(side, m.y));
      tx = this.wx(side, lx);
      ty = this.wy(side, ly);
    } else {
      const d = Math.hypot(m.x - c.x, m.y - c.y);
      // perkiraan waktu bola sampai, lalu umpan diarahkan ke depan larinya penerima
      const T = air ? clamp(0.8 + d * 0.032 + lob, 0.7, 2.6) : (2 * d) / (Math.min(24, Math.sqrt(vEnd * vEnd + 2 * ROLL * d)) + vEnd);
      const lead = setPiece && air ? 0.2 : m.run > 0 ? 1.1 : 0.7;
      // jangan mengarahkan bola ke garis: umpan panjang jatuh agak ke dalam lapangan
      const margin = air ? (d > 25 ? 6 : 4) : 2.5;
      tx = clamp(m.x + m.vx * T * lead, margin, PITCH_W - margin);
      ty = clamp(m.y + m.vy * T * lead, margin, PITCH_H - margin);
    }
    const [, pd] = this.nearest(this.opponents(c.side), c.x, c.y);
    // ditekan dari dekat: pemain yang tenang (composure) tetap mengumpan dengan akurat
    // kaki lemah membuat umpan (terutama umpan jauh dan umpan silang) kurang akurat
    const weak = !setPiece && this.rng.chance(TUNE.weakUse * 0.8) ? 1 + (20 - a.wf) * (air ? 0.06 : 0.04) : 1;
    // v18: kiper melempar bola dari tangannya (umpan pendek dari kotak sendiri): Throwing menentukan akurasinya
    const thrown = c.p.slot === 'GK' && !setPiece && !air && this.inBox(side, c.x, c.y) && Math.hypot(m.x - c.x, m.y - c.y) < 40;
    const err = thrown
      ? (21 - a.thr) * 0.006
      : ((21 - (a.pas + a.tec) / 2) * 0.006 + (pd < 2 ? 0.05 - a.cmp * 0.0015 : 0)) * (air ? 1.25 : 1) * weak;
    // offside dinilai saat bola dimainkan
    const offside: Body[] = [];
    if (!setPiece) {
      const line = this.offsideLine(c.side);
      const bfx = this.fx(c.side, c.x);
      for (const t of this.mates(c.side)) if (t !== c && this.isOffside(t, line, bfx)) offside.push(t);
    }
    this.kick(c, tx, ty, air, err, lob, !!spot);
    const cross = intoBox || (air && this.fx(c.side, m.x) > 84);
    this.pass = { from: c, to: m, air, cross, tx, ty, offside, setPiece };
    m.tx = tx;
    m.ty = ty;
    m.sprint = true;
    c.st.passes++;
    this.lastPasser = c;
  }

  /** Umpan silang membentur kaki bek: memantul ke arah garis gawang atau kembali ke lapangan */
  private blockCross(c: Body, o: Body) {
    const side = c.side;
    const ball = this.ball;
    const fy = this.fy(side, c.y);
    c.st.passes++;
    this.log('block', side, c.p.name);
    const fx = this.fx(side, c.x);
    if (fx > 78 && this.rng.chance(0.7)) {
      // memantul ke arah garis gawang lawan, ke sisi luar
      const out = fy < 34 ? -1 : 1;
      const tx = this.wx(side, PITCH_W + 2);
      const ty = this.wy(side, clamp(fy + out * this.rng.float(-3, 8), 1, 67));
      const d = Math.hypot(tx - c.x, ty - c.y) || 1;
      const v = Math.sqrt(30 + 2 * ROLL * d * 1.3);
      ball.vx = ((tx - c.x) / d) * v;
      ball.vy = ((ty - c.y) / d) * v;
    } else {
      const ang = this.rng.float(0, Math.PI * 2);
      const v = this.rng.float(4, 8);
      ball.vx = Math.cos(ang) * v;
      ball.vy = Math.sin(ang) * v;
    }
    ball.x = c.x + this.dir(side) * 0.6;
    ball.z = 0.2;
    ball.vz = this.rng.float(0.3, 2);
    this.pass = null;
    this.owner = null;
    this.lastPasser = null;
    this.lastTouch = o;
    o.cool = 1;
    c.cool = 1;
  }

  /** Sapuan: bola ditendang jauh ke depan dan ke sayap */
  private clear(c: Body) {
    const side = c.side;
    const fx = this.fx(side, c.x);
    const fy = this.fy(side, c.y);
    const tx = this.wx(side, clamp(fx + 35 + this.rng.float(0, 15), 30, 95));
    const ty = this.wy(side, clamp(fy + (fy < 34 ? -1 : 1) * this.rng.float(5, 20), 3, 65));
    this.pass = null;
    this.kick(c, tx, ty, true, 0.12 + (20 - c.p.a.tec) * 0.01);
    this.lastPasser = null;
  }

  /**
   * Arah terbaik membawa bola (bingkai tim): lurus ke depan, menuju gawang (memotong ke dalam), atau
   * menyusuri sayap ke garis gawang. Nilainya: kemajuan + peluang di ujung bawaan, dikurangi risiko
   * lawan sampai lebih dulu di titik itu (dihitung dari kecepatan dan antisipasi mereka).
   */
  private bestCarry(c: Body, fx: number, fy: number): [number, number, number] {
    const side = c.side;
    const a = c.p.a;
    const rk = c.rk;
    const k = this.k[side];
    const opps = this.opponents(side);
    const vc = vmaxOf(c) * (0.68 + a.dri * 0.012);
    const distGoal = Math.hypot(PITCH_W - fx, 34 - fy);
    const wideMan = isWing(c.p.slot) || isWideMid(c.p.slot) || isWB(c.p.slot) || isFB(c.p.slot);
    const onFlank = Math.abs(fy - 34) > 11;
    const cands: [number, number, number][] = [];
    // lurus ke depan (sedikit ke tengah)
    cands.push([Math.min(PITCH_W - 2, fx + 9), fy + (34 - fy) * 0.12, 0]);
    // menuju gawang: pemain sayap memotong ke dalam, penyerang menusuk ke kotak
    if (fx > 55 && distGoal > 9) {
      const L = Math.min(9, distGoal - 7);
      const gx = fx + ((PITCH_W - fx) / distGoal) * L;
      const gy = fy + ((34 - fy) / distGoal) * L;
      cands.push([gx, gy, wideMan && onFlank ? rk.cutIn * 0.3 + (a.dri - 10) * 0.01 : 0]);
    }
    // pemain sayap menyusuri garis untuk umpan silang / cut-back
    if (wideMan && onFlank && fx > 62 && fx < PITCH_W - 4) {
      cands.push([Math.min(PITCH_W - 2.5, fx + 9), fy + Math.sign(fy - 34) * 1.5, rk.cross * 0.8 + (a.cro - 10) * 0.012 - rk.cutIn * 0.15]);
    }
    let best: [number, number, number] = [-9, cands[0][0], cands[0][1]];
    for (const [px, py0, bonus] of cands) {
      const py = clamp(py0, 2, 66);
      const L = Math.hypot(px - fx, py - fy) || 1;
      const tC = L / vc + 0.15;
      let risk = 0;
      for (const o of opps) {
        const ofx = this.fx(side, o.x);
        const ofy = this.fy(side, o.y);
        const tO = Math.max(0, Math.hypot(ofx - px, ofy - py) - 1.2) / vmaxOf(o) + 0.15 + (20 - o.p.a.ant) * 0.01;
        // lawan yang sampai lebih dulu di ujung bawaan baru berbahaya kalau jauh lebih dulu
        // (kalau hanya bersamaan, pembawa bola masih sempat mengumpan)
        let r = clamp((tC - tO) / 1.2, 0, 1) * 0.7;
        // lawan berdiri di jalur bawaan bola
        if (this.laneDist(fx, fy, px, py, ofx, ofy) < 1.6) r = Math.max(r, 0.8);
        if (r > risk) risk = r;
      }
      const v =
        ((px - fx) / TUNE.progW) * k.prog * (this.counterPhase(side) ? 1.2 : 1) +
        this.shotProb(c, px, py, 0) * TUNE.shootV * TUNE.carryXg * (1 - risk) -
        risk * TUNE.carryRisk * (fx < 40 ? 1.5 : 1) +
        bonus;
      if (v > best[0]) best = [v, px, py];
    }
    return best;
  }

  private dribble(c: Body, tfx: number, tfy: number, space: number) {
    const side = c.side;
    const fy = this.fy(side, c.y);
    let ty = tfy + this.rng.normal(0, 1.5);
    // menghindari lawan terdekat
    const [o, od] = this.nearest(this.opponents(side), c.x, c.y);
    if (o && od < 5) ty += Math.sign(fy - this.fy(side, o.y) || 1) * 2.5;
    c.tx = this.wx(side, tfx);
    c.ty = this.wy(side, clamp(ty, 2, 66));
    // bawa bola cepat kalau ada ruang
    c.sprint = space > 5;
    // terus membawa bola sebentar sebelum menilai ulang (lebih lama untuk pemain yang suka memegang bola)
    c.cool = (0.5 + this.rng.float(0, 0.35)) * c.rk.hold;
  }

  /** Melewati lawan: bawa bola ke sisi lawan yang lebih terbuka, lalu ke belakangnya */
  private takeOn(c: Body, o: Body) {
    const side = c.side;
    const fy = this.fy(side, c.y);
    const ofx = this.fx(side, o.x);
    const ofy = this.fy(side, o.y);
    let dir = Math.sign(fy - ofy) || (fy < 34 ? -1 : 1);
    // dekat garis samping: potong ke dalam
    if ((fy < 8 && dir < 0) || (fy > 60 && dir > 0)) dir = -dir;
    c.tx = this.wx(side, Math.min(PITCH_W - 2, ofx + 4));
    c.ty = this.wy(side, clamp(ofy + dir * (2.5 + c.p.a.agi * 0.05), 2, 66));
    c.sprint = true;
    c.st.takeOns++;
  }

  /**
   * Penalti: penendang memilih sisi (kiri/kanan, kadang tengah), kiper menebak arah saat bola ditendang.
   * Tebakan benar = peluang menyelamatkan besar (refleks kiper vs ketenangan & kemampuan penalti penendang).
   */
  private penaltyKick(c: Body) {
    const a = c.p.a;
    const gk = this.keeper((1 - c.side) as 0 | 1);
    const ga = gk?.p.a;
    const side = this.rng.chance(0.12) ? 0 : this.rng.chance(0.5) ? -1 : 1;
    // kiper dengan antisipasi tinggi sedikit lebih sering menebak dengan benar
    const read = ga ? (ga.ant - 10) * 0.012 : 0;
    const guess = this.rng.chance(0.1) ? 0 : this.rng.chance(0.5 + (side !== 0 ? read * side : 0)) ? 1 : -1;
    const miss = clamp(0.06 + (12 - a.pen) * 0.007 - (a.cmp - 10) * 0.004, 0.02, 0.16);
    const gkSkill = ga ? (ga.ref * 2 + ga.ono + ga.han) / 4 : 8;
    let save = 0;
    if (side !== 0 && guess === side) save = clamp(0.18 + (gkSkill - 10) * 0.02 - (a.pen - 10) * 0.02, 0.15, 0.65);
    else if (side === 0 && guess === 0) save = 0.85;
    else if (side !== 0 && guess === 0) save = 0.1;
    const r = this.rng.next();
    const outcome: Shot['outcome'] = r < miss ? 'miss' : r < miss + (1 - miss) * save ? 'save' : 'goal';
    // sasaran di mulut gawang (bingkai tim penendang): sisi pilihan, kiper terjun ke tebakannya
    const aimY = outcome === 'miss' ? 34 + (side || 1) * this.rng.float(GOAL_HALF + 0.3, GOAL_HALF + 1.5) : 34 + side * this.rng.float(1.9, 3.2);
    const h = outcome === 'miss' && this.rng.chance(0.4) ? this.rng.float(BAR + 0.2, BAR + 1.2) : this.rng.float(0.15, 1.6);
    const diveY = this.wy(c.side, outcome === 'save' ? aimY : 34 + guess * 2.6);
    this.shoot(c, 0.76, 0, false, true, { outcome, aimY, h, diveY });
  }

  private shoot(
    c: Body,
    xg: number,
    pressure: number,
    header = false,
    setPiece = false,
    forced?: { outcome: Shot['outcome']; aimY: number; h: number; diveY: number },
  ) {
    const side = c.side;
    const a = c.p.a;
    const opps = this.opponents(side);
    const gk = this.keeper((1 - side) as 0 | 1);
    c.st.shots++;
    this.shots[side]++;
    this.xgFor[side] += xg;
    const fx = this.fx(side, c.x);
    const fy = this.fy(side, c.y);
    const dist = Math.hypot(PITCH_W - fx, 34 - fy);
    const goalX = this.wx(side, PITCH_W);
    // diblok bek di jalur tembakan
    let blocker: Body | null = null;
    for (const o of setPiece ? [] : opps) {
      if (o.p.slot === 'GK') continue;
      const ld = this.laneDist(c.x, c.y, goalX, 34, o.x, o.y);
      if (ld < 1.5 && Math.hypot(o.x - c.x, o.y - c.y) < 11 && this.rng.chance(0.4 + o.p.a.pos * 0.01 + (o.p.a.bra - 10) * 0.012)) {
        blocker = o;
        break;
      }
    }
    const skill = setPiece && dist > 14 ? a.fk : setPiece ? a.pen : header ? a.hea : dist < 18 ? a.fin : a.lon;
    const gkSkill = gk ? (gk.p.a.ref * 2 + gk.p.a.ono + gk.p.a.han + gk.p.a.pos) / 5 : 8;
    // kaki lemah: tidak selalu sempat memindahkan bola ke kaki terkuat (pemain dua kaki tidak terpengaruh)
    const foot = !header && !setPiece && this.rng.chance(TUNE.weakUse) ? Math.min(1, 0.45 + a.wf * 0.0275) : 1;
    let p = xg * skillK(skill) * (0.9 + a.cmp * 0.008) * (1 - pressure * 0.25) * foot;
    p *= 1.3 - gkSkill * 0.03;
    // kiper yang salah posisi (jauh dari titik idealnya) lebih mudah dibobol
    if (gk) {
      const [ix, iy] = this.gkSpot(gk, 0);
      const off = Math.hypot(this.fx(gk.side, gk.x) - ix, this.fy(gk.side, gk.y) - iy);
      p *= 1 + clamp(off - 0.6, 0, 4) * TUNE.gkOff;
    }
    p *= header ? TUNE.headK : 1;
    if (!header && !setPiece && dist > 18) p *= TUNE.longK;
    // fase bola mati: pertahanan sudah tersusun dan menjaga lawan satu per satu
    // v18: kiper yang komunikatif mengatur penjagaan bola mati (siapa menjaga siapa)
    if (!setPiece && this.t < this.spUntil && this.spSide === side) p *= TUNE.spK * (1 - this.gkCall((1 - side) as 0 | 1) * 0.2);
    // penalti & tendangan bebas langsung: peluangnya sudah berupa persentase nyata (tanpa pengali tembakan)
    // peluang jenuh (dari dekat pun tidak pasti gol); kiper yang menutup sudut mengurangi peluang
    p = setPiece ? clamp(p, 0.004, 0.85) : clamp(this.sat(p * TUNE.shotK, skill) * (header ? 1 : 1 - this.gkCoverAt(side, fx, fy, a)), 0.004, 0.85);
    const onTarget = clamp(Math.max(p + 0.12, TUNE.onT + skill * foot * 0.017 - dist * 0.004 - pressure * 0.08), 0, 0.95);
    const r = this.rng.next();
    const outcome: Shot['outcome'] = forced ? forced.outcome : blocker ? 'miss' : r < p ? 'goal' : r < onTarget ? 'save' : 'miss';
    // peluang emas gagal membuat penembak frustrasi
    if (outcome !== 'goal' && xg > 0.25) this.frustrate(c, 0.12);

    // titik sasaran di mulut gawang & tinggi bola saat melewati garis
    const gy = gk ? this.fy(side, gk.y) : 34;
    let aimY: number;
    let h: number;
    if (outcome === 'goal') {
      aimY = dist < 9 ? 34 + this.rng.float(-3.2, 3.2) : gy >= 34 ? 34 - this.rng.float(1.6, 3.3) : 34 + this.rng.float(1.6, 3.3);
      h = this.rng.float(0.15, header ? 1.6 : 2.1);
    } else if (outcome === 'save') {
      aimY = clamp(gy + this.rng.normal(0, 1.3), 34 - 3.3, 34 + 3.3);
      h = this.rng.float(0.2, 2.1);
    } else if (this.rng.chance(0.55)) {
      aimY = 34 + (this.rng.chance(0.5) ? 1 : -1) * this.rng.float(GOAL_HALF + 0.4, GOAL_HALF + 4);
      h = this.rng.float(0.1, 2);
    } else {
      aimY = 34 + this.rng.float(-3.4, 3.4);
      h = this.rng.float(BAR + 0.4, BAR + 3);
    }
    if (forced) {
      aimY = forced.aimY;
      h = forced.h;
    }
    const tyWorld = this.wy(side, aimY);
    const dx = goalX - c.x;
    const dy = tyWorld - c.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = header ? 13 + a.hea * 0.2 : setPiece && dist > 14 ? 21 + a.fk * 0.3 : 20 + skill * 0.4 + (dist > 18 ? 3 : 0);
    const tl = d / speed;
    const ball = this.ball;
    ball.x = c.x + (dx / d) * 0.4;
    ball.y = c.y + (dy / d) * 0.4;
    ball.z = header ? 1.8 : 0.1;
    ball.vx = (dx / d) * speed;
    ball.vy = (dy / d) * speed;
    // tinggi di garis = h  ->  vz = (h - z0 + g t²/2) / t
    ball.vz = (h - ball.z + (G * tl * tl) / 2) / tl;
    const assist = this.lastPasser && this.lastPasser.side === side && this.lastPasser !== c ? this.lastPasser : undefined;
    const gkX = gk && this.fx(side, gk.x) > fx ? gk.x : this.wx(side, PITCH_W - 0.4);
    const kind = header ? 'head' : setPiece ? 'set' : dist > 18 ? 'long' : undefined;
    const sp = setPiece || (this.t < this.spUntil && this.spSide === side);
    this.shot = { by: c, outcome, assist, blocker: forced ? null : blocker, gkX, passed: false, kind, sp, diveY: forced?.diveY };
    if (outcome !== 'miss') {
      c.st.onTarget++;
      this.onTarget[side]++;
    }
    if (assist) assist.st.keyPasses++;
    this.owner = null;
    this.pass = null;
    this.lastTouch = c;
    if (gk) {
      // kiper bereaksi: refleks bagus = terjun lebih cepat; gol = kiper terlambat
      gk.dive = 1.2;
      // penalti: kiper sudah memilih arah saat bola ditendang
      gk.think = forced || outcome === 'save' ? 0 : 0.35;
      gk.sprint = true;
    }
  }

  // --- bola lepas, umpan, tembakan -------------------------------------------------

  private ballPhysics(live: boolean) {
    const ball = this.ball;
    const px = ball.x;
    const py = ball.y;
    const pz = ball.z;
    [ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz] = stepBall(ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz);
    const rx = ball.x;
    const ry = ball.y;
    const rz = ball.z;
    if (!this.inNet) this.goalFrame(px, py, pz);

    // bola di jaring: berhenti di dalam gawang
    if (this.inNet) {
      const gx = ball.x < PITCH_W / 2 ? 0 : PITCH_W;
      const depth = Math.abs(ball.x - gx);
      if (depth > NET_DEPTH - 0.2 || Math.abs(ball.y - 34) > GOAL_HALF - 0.2) {
        ball.x = gx + Math.sign(ball.x - gx || 1) * Math.min(depth, NET_DEPTH - 0.2);
        ball.y = clamp(ball.y, 34 - GOAL_HALF + 0.2, 34 + GOAL_HALF - 0.2);
        ball.vx *= -0.15;
        ball.vy *= 0.3;
      }
      ball.z = Math.min(ball.z, BAR - 0.2);
      return;
    }

    if (this.shot && live) {
      const s = this.shot;
      // diblok bek
      if (s.blocker && Math.hypot(ball.x - s.blocker.x, ball.y - s.blocker.y) < 1.1) {
        this.log('block', s.by.side, s.by.p.name);
        this.shot = null;
        if (this.rng.chance(Math.min(0.9, 0.5 * TUNE.cornerK))) {
          // terbelokkan menjauhi gawang, sering keluar garis gawang
          this.nick(s.blocker, 0.35, 1.0, 0.5);
          ball.vz *= 0.6;
          s.blocker.cool = 0.6;
        } else this.deflect(s.blocker, 7);
        return;
      }
      // tembakan melenceng yang lewat tepat di dekat kaki bek bisa terbelokkan (jadi sepak pojok kalau keluar)
      if (s.outcome === 'miss' && ball.z < 1.9) {
        for (const o of this.opponents(s.by.side)) {
          if (o.p.slot === 'GK' || o === s.blocker || s.near?.includes(o)) continue;
          if (segDist(px, py, ball.x, ball.y, o.x, o.y) > 1.2) continue;
          (s.near ??= []).push(o);
          if (this.rng.chance(0.75)) this.nick(o);
          break;
        }
      }
      // kiper menepis / menangkap di posisinya
      const gk = this.keeper((1 - s.by.side) as 0 | 1);
      const crossedGk = (px - s.gkX) * (ball.x - s.gkX) <= 0 || Math.abs(ball.x - (gk?.x ?? s.gkX)) < 0.6;
      if (s.outcome === 'save' && gk && !s.passed && crossedGk) {
        s.passed = true;
        this.save(gk, s);
        return;
      }
    }

    // melewati garis gawang
    for (const gx of [0, PITCH_W]) {
      if ((px - gx) * (rx - gx) > 0 || px === gx) continue;
      const f = (gx - px) / (rx - px || 1);
      const yc = py + (ry - py) * f;
      const zc = pz + (rz - pz) * f;
      const attacking: 0 | 1 = this.dir(0) > 0 === (gx === PITCH_W) ? 0 : 1;
      if (live && Math.abs(yc - 34) < GOAL_HALF && zc < BAR) {
        this.goal(attacking);
        return;
      }
      if (this.shot) {
        this.log('miss', this.shot.by.side, this.shot.by.p.name);
      }
      this.shot = null;
      if (live) {
        const defending = (1 - attacking) as 0 | 1;
        const lastDef = this.lastTouch?.side === defending;
        if (lastDef) {
          this.toDead('corner', attacking, gx, yc);
          this.log('corner', attacking);
        } else this.toDead('goalkick', defending, gx, yc);
      }
      return;
    }
    // melewati garis samping
    if (live && (ball.y < -0.12 || ball.y > PITCH_H + 0.12)) {
      const side = this.lastTouch ? ((1 - this.lastTouch.side) as 0 | 1) : this.poss;
      this.toDead('throw', side, ball.x, ball.y < 0 ? 0 : PITCH_H);
      return;
    }
    // bola di luar lapangan berhenti (anak gawang)
    if (ball.x < -2 || ball.x > PITCH_W + 2 || ball.y < -2 || ball.y > PITCH_H + 2) {
      ball.vx = ball.vy = ball.vz = 0;
      ball.z = 0;
      ball.x = clamp(ball.x, -2, PITCH_W + 2);
      ball.y = clamp(ball.y, -2, PITCH_H + 2);
    }
    if (!live || this.shot) return;
    this.receive(px, py);
  }

  private save(gk: Body, s: Shot) {
    const ball = this.ball;
    gk.st.saves++;
    this.log('save', s.by.side, s.by.p.name);
    this.shot = null;
    ball.x = gk.x + (ball.x - gk.x) * 0.3;
    ball.y = clamp(ball.y, gk.y - 2, gk.y + 2);
    // bola ditepis selalu di depan garis gawang (kalau sudah lewat garis, itu gol)
    if (this.fx(gk.side, ball.x) < 0.4) ball.x = this.wx(gk.side, 0.4);
    ball.z = Math.min(ball.z, BAR - 0.3);
    const power = Math.hypot(ball.vx, ball.vy);
    const hold = clamp(0.25 + gk.p.a.han * 0.03 - (power - 22) * 0.02, 0.1, 0.85);
    if (this.rng.chance(hold)) {
      // ditangkap
      ball.x = gk.x;
      ball.y = gk.y;
      this.gain(gk);
      gk.cool = 1.4;
      return;
    }
    this.lastTouch = gk;
    gk.cool = 1.6; // kiper masih terjatuh setelah menepis (~0,6 detik tidak bisa meraih bola)
    const side = gk.side;
    const away = -this.dir((1 - side) as 0 | 1); // arah keluar dari gawang
    // v18: tepisan keluar lapangan (sepak pojok), ke samping yang aman, atau muntah ke depan gawang (bahaya);
    // Handling & Reflexes membuat bola jarang muntah ke depan
    const ga = gk.p.a;
    const kind = this.parryKind(ga);
    if (kind === 'wide') {
      // ditepis ke samping, menjauh dari mulut gawang
      const sy = ball.y >= 34 ? 1 : -1;
      ball.vx = away * this.rng.float(2, 5);
      ball.vy = sy * this.rng.float(7, 11);
      ball.vz = this.rng.float(0.3, 2);
      return;
    }
    if (kind === 'out') {
      // ditepis melewati tiang: bola keluar garis gawang di luar tiang -> sepak pojok
      const sy = ball.y >= 34 ? 1 : -1;
      const cy = 34 + sy * (GOAL_HALF + this.rng.float(1, 3));
      const bfx = this.fx(side, ball.x);
      // titik di garis gawang di luar tiang, lalu bola terus bergerak ke arah yang sama
      const tgx = this.wx(side, -1.2);
      const tgy = cy + (cy - ball.y) * (1.2 / Math.max(bfx, 0.4));
      const d = Math.hypot(tgx - ball.x, tgy - ball.y) || 1;
      const v = this.rng.float(10, 14);
      ball.vx = ((tgx - ball.x) / d) * v;
      ball.vy = ((tgy - ball.y) / d) * v;
      ball.vz = this.rng.float(0.3, 1.2);
    } else {
      // ditepis ke depan: bola muntah di depan gawang
      ball.vx = away * this.rng.float(4, 9);
      ball.vy = this.rng.normal(0, 4);
      ball.vz = this.rng.float(0.5, 3);
    }
  }

  /** v18 arah tepisan kiper: keluar lapangan, ke samping (aman), atau muntah ke depan gawang (bahaya) */
  parryKind(a: EAttrs): 'out' | 'wide' | 'danger' {
    const r = this.rng.next();
    if (r < TUNE.parryOut) return 'out';
    const danger = clamp(0.5 - (a.han - 10) * 0.025 - (a.ref - 10) * 0.012, 0.15, 0.8);
    return r < TUNE.parryOut + (1 - TUNE.parryOut) * danger ? 'danger' : 'wide';
  }

  private goal(side: 0 | 1) {
    const s = this.shot;
    const ball = this.ball;
    const opp = (1 - side) as 0 | 1;
    const gk = this.keeper(opp);
    this.score[side]++;
    if (gk) gk.st.conceded++;
    for (const b of this.onPitch[opp]) this.frustrate(b, 0.15);
    for (const b of this.onPitch[side]) b.frus = Math.max(0, b.frus - 0.2);
    if (s?.sp && s.by.side === side) this.setPieceGoals++;
    // pencetak gol untuk selebrasi (gol bunuh diri: tanpa selebrasi pencetak)
    const scorer = s && s.by.side === side ? s.by : this.lastTouch?.side === side ? this.lastTouch : null;
    this.celeb = { side, scorer };
    if (s && s.by.side === side) {
      s.by.st.goals++;
      if (s.kind === 'long') s.by.st.longGoals++;
      else if (s.kind === 'set') s.by.st.setGoals++;
      else if (s.kind === 'head') s.by.st.headGoals++;
      if (s.assist) s.assist.st.assists++;
      this.log('goal', side, s.by.p.name, s.assist?.p.name);
    } else {
      const lt = this.lastTouch;
      if (lt && lt.side === side) {
        lt.st.goals++;
        this.log('goal', side, lt.p.name);
      } else this.log('goal', side, lt?.p.name ?? '', undefined, true);
    }
    this.shot = null;
    this.pass = null;
    this.owner = null;
    this.inNet = true;
    // bola sudah melewati garis: tahan di dalam jaring (tidak tembus ke belakang gawang)
    const gx = ball.x < PITCH_W / 2 ? 0 : PITCH_W;
    const out = gx === 0 ? -1 : 1;
    ball.x = gx + out * clamp(Math.abs(ball.x - gx), 0.3, NET_DEPTH - 0.2);
    ball.y = clamp(ball.y, 34 - GOAL_HALF + 0.2, 34 + GOAL_HALF - 0.2);
    ball.z = Math.min(ball.z, BAR - 0.2);
    ball.vx *= 0.6;
    ball.vy *= 0.6;
    this.pause = CELEBRATE;
    this.kickoffAfter = opp;
  }

  /** Bola lepas / umpan: siapa yang menguasai atau memotongnya */
  private receive(px: number, py: number) {
    const ball = this.ball;
    const sp = Math.hypot(ball.vx, ball.vy);
    const pass = this.pass;
    let best: Body | null = null;
    let bd = Infinity;
    const nt = this.noTouch && this.t < this.noTouch.until ? this.noTouch.side : -1;
    for (const b of this.active()) {
      if (pass && b === pass.from && sp > 3) continue;
      if (b.side === nt) continue;
      if (b.cool > (b.p.slot === 'GK' ? 1 : 0.5)) continue; // baru saja dilewati / kiper masih terjatuh
      const hands = b.p.slot === 'GK' && this.inBox(b.side, b.x, b.y);
      // tinggi badan menambah jangkauan: pemain jangkung menyundul bola yang lewat di atas kepala pemain lain
      const tall = (b.p.a.hgt - (hands ? 188 : 180)) * 0.01;
      const reach = hands ? 1.5 + b.p.a.aer * 0.02 + tall * 0.8 : 1.0 + b.p.a.agi * 0.01;
      const zMax = hands ? 2.4 + b.p.a.aer * 0.03 + tall : 1.3 + (b.p.a.hea + b.p.a.jmp) * 0.025 + tall;
      if (ball.z > zMax) continue;
      // jarak ke lintasan bola selama langkah ini (bola cepat tidak boleh "menembus" pemain)
      const d = segDist(px, py, ball.x, ball.y, b.x, b.y);
      if (d > reach) continue;
      const pri = pass && b === pass.to ? d - 0.4 : d;
      if (pri < bd) {
        bd = pri;
        best = b;
      }
    }
    if (!best) {
      if (pass && sp < 0.5) this.pass = null;
      return;
    }
    // v18: kiper ikut menyambut bola atas di kotaknya (tangan menjangkau lebih tinggi dari kepala penyerang)
    if (ball.z > 1.3 && best.p.slot !== 'GK' && pass && pass.from.side === best.side) {
      const gk = this.keeper((1 - best.side) as 0 | 1);
      if (gk && gk.cool <= 1 && gk.side !== nt && this.inBox(gk.side, gk.x, gk.y)) {
        const ga = gk.p.a;
        const reach = 1.5 + ga.aer * 0.02 + (ga.hgt - 188) * 0.008;
        // penyerang yang jangkung & jago melompat masih bisa mendahului tangan kiper
        const ba = best.p.a;
        const jump = (ba.hea + ba.jmp) / 2 + (ba.hgt - 180) * 0.15 - 10;
        if (
          segDist(px, py, ball.x, ball.y, gk.x, gk.y) < reach + 0.4 &&
          this.rng.chance(clamp(0.5 + (ga.cmd + ga.aer - 20) * 0.015 - jump * 0.04, 0.15, 0.85))
        ) {
          this.highBall(gk);
          return;
        }
      }
    }
    // duel udara: lawan di dekatnya ikut melompat, yang lebih kuat di udara menang
    let duel = false;
    if (ball.z > 1.3 && best.p.slot !== 'GK') {
      const aerial = (b: Body) => b.p.a.hea + b.p.a.jmp * 0.7 + b.p.a.str * 0.3 + b.p.a.bra * 0.25 + (b.p.a.hgt - 180) * TUNE.height;
      for (const o of this.opponents(best.side)) {
        if (o.p.slot === 'GK' || o.cool > 0.5 || o.side === nt) continue;
        if (segDist(px, py, ball.x, ball.y, o.x, o.y) > 1.9) continue;
        if (ball.z > 1.3 + (o.p.a.hea + o.p.a.jmp) * 0.025 + (o.p.a.hgt - 180) * 0.01) continue;
        // pembela menghadap bola: sedikit lebih unggul
        const defBonus = pass && o.side !== pass.from.side ? 0.08 : pass && best.side !== pass.from.side ? -0.08 : 0;
        if (this.rng.chance(clamp(0.5 + (aerial(o) - aerial(best)) * 0.025 + defBonus, 0.15, 0.85))) {
          best = o;
          duel = true;
        }
        best.st.aerialWon = (best.st.aerialWon ?? 0) + 1;
        break;
      }
    }
    // v18: penyerang yang kuat di udara (dan jangkung) kadang mendahului kiper yang keluar menyambut bola
    if (ball.z > 1.3 && best.p.slot === 'GK' && pass && pass.from.side !== best.side && this.inBox(best.side, best.x, best.y)) {
      const ga = best.p.a;
      const keepAir = ga.aer + ga.cmd * 0.5 + (ga.hgt - 188) * TUNE.height;
      for (const o of this.opponents(best.side)) {
        if (o.cool > 0.5 || o.side === nt) continue;
        if (segDist(px, py, ball.x, ball.y, o.x, o.y) > 1.4) continue;
        if (ball.z > 1.3 + (o.p.a.hea + o.p.a.jmp) * 0.025 + (o.p.a.hgt - 180) * 0.01) continue;
        const oa = o.p.a;
        const att = oa.hea + oa.jmp * 0.7 + oa.bra * 0.25 + (oa.hgt - 180) * TUNE.height;
        if (this.rng.chance(clamp(0.15 + (att - keepAir) * 0.03, 0.04, 0.5))) {
          best = o;
          best.st.aerialWon = (best.st.aerialWon ?? 0) + 1;
        }
        break;
      }
    }
    const a = best.p.a;
    const side = best.side;
    const high = ball.z > 1.3;
    const hands = best.p.slot === 'GK' && this.inBox(side, best.x, best.y);

    // offside: rekan yang berdiri offside saat umpan dimainkan menyentuh bola
    if (pass && pass.from.side === side && pass.offside.includes(best)) {
      best.st.offsides++;
      this.log('offside', side, best.p.name);
      this.toDead('free', (1 - side) as 0 | 1, best.x, best.y, 0.9);
      return;
    }

    // v18: kiper menyambut bola atas lawan di kotaknya: menangkap atau meninju
    if (pass && side !== pass.from.side && hands && high) {
      this.highBall(best);
      return;
    }
    if (pass && side !== pass.from.side) {
      // memotong umpan
      const p = hands
        ? 0.6 + a.cmd * 0.015
        : high
          ? 0.35 + (a.hea + a.jmp) / 60
          : 0.22 + (a.ant + a.pos) / 100 - sp / 70;
      if (duel || this.rng.chance(clamp(p, 0.1, 0.92))) {
        best.st.interceptions++;
        const bfx = this.fx(side, best.x);
        // umpan ke kotak dipotong dekat garis gawang: sering dibuang ke luar (sepak pojok)
        const intoBox = pass.cross || this.fx(pass.from.side, pass.tx) > 86;
        if (!hands && intoBox && bfx < (high ? 18 : 12) && this.rng.chance(Math.min(0.9, (high ? 0.55 : 0.5) * TUNE.cornerK))) this.behind(best, high);
        else if (high && !hands && bfx < 35) this.header(best, true);
        else this.gain(best);
      } else if (this.rng.chance(0.4)) {
        this.deflect(best, 5);
      } else {
        best.cool = 0.6; // bola lolos dari jangkauannya
      }
      return;
    }

    // bola lepas di kotak sendiri: kiper menangkap dengan tangan
    if (hands) {
      if (this.rng.chance(clamp(0.6 + a.han * 0.02 - (high ? 0.1 : 0), 0.4, 0.97))) {
        if (pass) pass.from.st.passesOk += pass.from.side === side ? 1 : 0;
        this.gain(best);
        best.cool = 1.2;
      } else this.deflect(best, 4);
      return;
    }

    if (high) {
      const fx = this.fx(side, best.x);
      // sundulan: menyerang dari umpan silang = tembakan, di daerah sendiri = sapuan
      if (pass?.cross && fx > 88 && pass.from.side === side) {
        this.gain(best);
        this.shoot(best, this.xgAt(fx, this.fy(side, best.y)) * 0.85, 0.5, true);
        pass.from.st.passesOk++;
        return;
      }
      if (fx < 40) {
        // bola atas di depan gawang sendiri: kadang disundul ke luar garis gawang
        if (fx < 12 && Math.abs(this.fy(side, best.y) - 34) < 22 && this.rng.chance(Math.min(0.9, 0.35 * TUNE.cornerK))) this.behind(best, true);
        else this.header(best, false);
        return;
      }
    }
    const [, pd] = this.nearest(this.opponents(side), best.x, best.y);
    const control = 0.78 + (a.ft + a.tec) / 100 - (pd < 1.5 ? 0.12 : 0) - Math.max(0, sp - 18) / 60 - (high ? 0.12 : 0);
    if (this.rng.chance(clamp(control, 0.35, 0.98))) {
      if (pass && pass.from.side === side) pass.from.st.passesOk++;
      this.gain(best);
    } else {
      this.deflect(best, 4);
    }
  }

  /**
   * v18 kiper menyambut bola atas (umpan silang, sepak pojok): menangkap (Handling, Aerial Reach) atau meninju
   * (Punching; lebih sering kalau kotak penuh pemain). Gagal = bola lepas di depan gawang. Kiper eksentrik
   * kadang salah membaca bola dan tidak menyentuhnya sama sekali.
   */
  private highBall(gk: Body) {
    let crowd = 0;
    for (const o of this.opponents(gk.side)) if (Math.hypot(o.x - gk.x, o.y - gk.y) < 2.5) crowd++;
    const res = this.highBallResult(gk.p.a, crowd);
    const ball = this.ball;
    if (res === 'miss') {
      gk.cool = 0.8;
      return;
    }
    this.pass = null;
    if (res === 'spill') {
      this.deflect(gk, 3);
      return;
    }
    gk.st.interceptions++;
    gk.st.aerialWon = (gk.st.aerialWon ?? 0) + 1;
    if (res === 'catch') {
      this.gain(gk);
      gk.cool = 1.2;
      return;
    }
    // tinju menjauh dari gawang, condong ke sisi tempat bola datang
    const out = -this.dir((1 - gk.side) as 0 | 1);
    const sy = Math.sign(ball.y - 34) || 1;
    const ang = this.rng.float(0.15, 0.7) * sy;
    const v = this.rng.float(13, 18);
    this.owner = null;
    this.lastTouch = gk;
    ball.vx = out * Math.cos(ang) * v;
    ball.vy = Math.sin(ang) * v;
    ball.vz = this.rng.float(3.5, 6);
    gk.cool = 0.8;
  }

  /** v18 hasil kiper menyambut bola atas, dengan `crowd` lawan di dekatnya */
  highBallResult(a: EAttrs, crowd: number): 'catch' | 'spill' | 'punch' | 'miss' {
    if (this.rng.chance(Math.max(0, a.ecc - 8) * 0.008)) return 'miss';
    if (this.rng.chance(clamp((a.pun / 20) * 0.6 + crowd * 0.12, 0.05, 0.9))) {
      return this.rng.chance(clamp(0.72 + (a.aer - 10) * 0.015 - crowd * 0.04, 0.4, 0.95)) ? 'punch' : 'spill';
    }
    return this.rng.chance(clamp(0.74 + (a.han - 10) * 0.02 + (a.aer - 10) * 0.01 - crowd * 0.07, 0.35, 0.96)) ? 'catch' : 'spill';
  }

  /** Sundulan menjauh dari gawang sendiri */
  private header(b: Body, intercept: boolean) {
    const side = b.side;
    const fx = this.fx(side, b.x);
    const fy = this.fy(side, b.y);
    const tx = this.wx(side, clamp(fx + 15 + b.p.a.hea, 10, 90));
    const ty = this.wy(side, clamp(fy + (fy < 34 ? -1 : 1) * this.rng.float(4, 14), 2, 66));
    this.pass = null;
    this.lastPasser = null;
    if (!intercept) this.poss = side;
    this.kick(b, tx, ty, true, 0.18 + (20 - b.p.a.hea) * 0.012, -0.2);
    this.ball.z = 1.8;
    b.cool = 0.4;
  }

  /**
   * Bek membuang bola ke luar garis gawangnya sendiri, selalu di luar tiang (jadi sepak pojok,
   * bukan gol bunuh diri).
   */
  private behind(b: Body, high: boolean) {
    const side = b.side;
    const ball = this.ball;
    const bfx = Math.max(this.fx(side, ball.x), 0.6);
    const bfy = this.fy(side, ball.y);
    const sy = bfy >= 34 ? 1 : -1;
    // titik saat bola melewati garis gawang: di luar tiang, lalu sasaran 3 m di belakang garis
    const yc = 34 + sy * (GOAL_HALF + this.rng.float(1.5, 11));
    const ty = clamp(bfy + ((yc - bfy) * (bfx + 3)) / bfx, -1.5, PITCH_H + 1.5);
    const tx = this.wx(side, -3);
    const twy = this.wy(side, ty);
    const d = Math.hypot(tx - ball.x, twy - ball.y) || 1;
    // cukup keras supaya bola masih bergulir saat melewati garis
    const v = Math.max(this.rng.float(9, 14), Math.sqrt(40 + 2 * ROLL * d * 1.3));
    ball.vx = ((tx - ball.x) / d) * v;
    ball.vy = ((twy - ball.y) / d) * v;
    ball.z = high ? Math.max(ball.z, 1.5) : 0.1;
    ball.vz = high ? this.rng.float(1, 3) : this.rng.float(0, 1);
    this.pass = null;
    this.owner = null;
    this.lastPasser = null;
    this.lastTouch = b;
    this.noTouch = { side, until: this.t + 2.5 };
    b.cool = 0.6;
  }

  /** Tembakan sedikit terbelokkan kaki bek: arah berubah menjauhi gawang, bola melambat */
  private nick(o: Body, min = 0.08, max = 0.25, keep = 0.8) {
    const ball = this.ball;
    this.lastTouch = o;
    const goalX = ball.vx > 0 ? PITCH_W : 0;
    const ang = this.rng.float(min, max);
    let best: [number, number] = [ball.vx, ball.vy];
    let far = -1;
    for (const a of [ang, -ang]) {
      const vx = (ball.vx * Math.cos(a) - ball.vy * Math.sin(a)) * keep;
      const vy = (ball.vx * Math.sin(a) + ball.vy * Math.cos(a)) * keep;
      const tLine = (goalX - ball.x) / (vx || 1e-6);
      const yc = tLine > 0 ? Math.abs(ball.y + vy * tLine - 34) : 99;
      if (yc > far) {
        far = yc;
        best = [vx, vy];
      }
    }
    [ball.vx, ball.vy] = best;
    ball.vz *= 0.7;
  }

  /**
   * Rangka gawang untuk bola yang bukan gol: jaring samping, atap, dan jaring belakang menahan bola,
   * jadi bola melenceng tidak terlihat "masuk" ke dalam gawang.
   */
  private goalFrame(px: number, py: number, pz: number) {
    const ball = this.ball;
    const gx = ball.x < PITCH_W / 2 ? 0 : PITCH_W;
    const out = gx === 0 ? -1 : 1;
    const inGoal = (x: number, y: number, z: number) => {
      const depth = (x - gx) * out;
      return depth > 0 && depth <= NET_DEPTH && Math.abs(y - 34) < GOAL_HALF && z < BAR;
    };
    const was = inGoal(px, py, pz);
    const now = inGoal(ball.x, ball.y, ball.z);
    if (was === now) return;
    const pDepth = (px - gx) * out;
    if (now) {
      // masuk lewat mulut gawang: urusan cek gol
      if (pDepth <= 0) {
        const f = (gx - px) / (ball.x - px || 1);
        if (Math.abs(py + (ball.y - py) * f - 34) < GOAL_HALF && pz + (ball.z - pz) * f < BAR) return;
      }
      if (pz >= BAR) {
        // jatuh di atap jaring lalu menggelinding ke belakang
        ball.z = BAR + 0.02;
        ball.vz = Math.abs(ball.vz) * 0.2;
        ball.vx = out * Math.max(Math.abs(ball.vx) * 0.5, 2);
        ball.vy *= 0.5;
      } else if (Math.abs(py - 34) >= GOAL_HALF) {
        // kena jaring samping dari luar
        const sy = Math.sign(py - 34);
        ball.y = 34 + sy * (GOAL_HALF + 0.12);
        ball.vy = sy * Math.abs(ball.vy) * 0.15;
        ball.vx *= 0.35;
      } else {
        // kena jaring belakang dari luar
        ball.x = gx + out * (NET_DEPTH + 0.12);
        ball.vx = out * Math.abs(ball.vx) * 0.15;
        ball.vy *= 0.4;
      }
    } else if (was && (ball.x - gx) * out > 0) {
      // bola mati yang sudah di dalam gawang tertahan jaring
      ball.x = gx + out * clamp((ball.x - gx) * out, 0.2, NET_DEPTH - 0.15);
      ball.y = clamp(ball.y, 34 - GOAL_HALF + 0.15, 34 + GOAL_HALF - 0.15);
      ball.z = Math.min(ball.z, BAR - 0.15);
      ball.vx *= -0.2;
      ball.vy *= 0.3;
      ball.vz = Math.min(ball.vz, 0);
    }
  }

  private deflect(b: Body, speed: number) {
    this.pass = null;
    this.owner = null;
    this.lastTouch = b;
    const ball = this.ball;
    const ang = this.rng.float(0, Math.PI * 2);
    const v = this.rng.float(speed * 0.4, speed);
    ball.vx = Math.cos(ang) * v;
    ball.vy = Math.sin(ang) * v;
    ball.vz = this.rng.float(0, 3);
    b.cool = 0.6;
  }

  /** Bola mati: bola masih bergerak keluar, lalu ditaruh di titik restart */
  private toDead(kind: RestartKind, side: 0 | 1, x: number, y: number, t = kind === 'throw' ? 0.5 : 0.9) {
    this.dead = { kind, side, x, y, t };
    this.pass = null;
    this.owner = null;
    this.poss = side;
    if (kind === 'free') {
      const b = this.ball;
      b.vx *= 0.3;
      b.vy *= 0.3;
    }
  }

  private setRestart(d: Dead) {
    const ball = this.ball;
    const { side, kind } = d;
    let x = clamp(d.x, 0, PITCH_W);
    let y = clamp(d.y, 0, PITCH_H);
    if (kind === 'goalkick') {
      x = this.wx(side, 5.5);
      y = this.wy(side, 34 + Math.sign(this.fy(side, d.y) - 34 || 1) * 6);
    } else if (kind === 'corner') {
      x = this.wx(side, PITCH_W - 0.3);
      y = y < 34 ? 0.3 : PITCH_H - 0.3;
    } else if (kind === 'throw') {
      x = clamp(x, 1, PITCH_W - 1);
      y = y < 34 ? 0 : PITCH_H;
    } else if (kind === 'free') {
      x = clamp(x, 1, PITCH_W - 1);
      y = clamp(y, 1, PITCH_H - 1);
    }
    let direct = false;
    let cross = false;
    let k: RestartKind = kind;
    if (kind === 'free') {
      // pelanggaran di kotak penalti lawan = penalti
      const fx = this.fx(side, x);
      const dist = Math.hypot(PITCH_W - fx, 34 - this.fy(side, y));
      if (fx > PITCH_W - BOX_X && Math.abs(this.fy(side, y) - 34) < BOX_Y) {
        k = 'penalty';
        x = this.wx(side, PITCH_W - 11);
        y = 34;
        this.log('penalty', side);
      } else {
        const wide = Math.abs(this.fy(side, y) - 34);
        direct = fx > 74 && dist < 30 && wide < 18 && this.rng.chance(0.7);
        if (direct) this.log('freekick', side);
        // tendangan bebas dari sayap / agak jauh di sepertiga akhir: diumpan ke kotak
        else cross = fx > 68;
      }
    }
    ball.x = x;
    ball.y = y;
    ball.z = 0;
    ball.vx = ball.vy = ball.vz = 0;
    this.owner = null;
    this.pass = null;
    this.shot = null;
    this.poss = side;
    // kiper menaruh bola dan menunggu rekan menyebar sebelum tendangan gawang
    const wait = k === 'throw' ? 0.3 : k === 'penalty' ? 2 : k === 'goalkick' ? 1.5 : k === 'corner' || cross ? 1.2 : 0.8;
    this.restart = { side, x, y, wait, kind: k, direct, cross };
    if (k === 'corner') {
      this.corners[side]++;
      let r = this.rng.next();
      this.restart.routine = CORNER_ROUTINES.find(([, w]) => (r -= w) < 0)?.[0] ?? 'mix';
    }
  }

  private best(list: Body[], f: (a: EAttrs) => number): Body | null {
    let b: Body | null = null;
    for (const q of list) if (q.p.slot !== 'GK' && (!b || f(q.p.a) > f(b.p.a))) b = q;
    return b;
  }

  /** Pengambil bola mati yang sedang berlangsung */
  private restartTaker(): Body | null {
    const r = this.restart ?? this.dead;
    if (!r) return null;
    const team = this.mates(r.side);
    const restart = this.restart;
    if (r.kind === 'goalkick') return this.keeper(r.side) ?? this.nearest(team, r.x, r.y)[0];
    if (r.kind === 'kickoff') return team.find((b) => isST(b.p.slot)) ?? team[team.length - 1];
    const crosser = (list: Body[]) => this.best(list, (a) => a.cro * 2 + a.fk) ?? this.best(team, (a) => a.cro);
    if (r.kind === 'corner') return crosser(team.filter((b) => isWing(b.p.slot) || isWideMid(b.p.slot) || isBox(b.p.slot) || b.p.slot === 'AM' || isFB(b.p.slot)));
    if (r.kind === 'penalty') return this.best(team, (a) => a.pen * 2 + a.cmp);
    if (restart?.direct) return this.best(team, (a) => a.fk * 2 + a.lon);
    if (restart?.cross) return crosser(team.filter((b) => !isCB(b.p.slot) && !isST(b.p.slot) && !isHold(b.p.slot)));
    return this.nearest(team.filter((b) => b.p.slot !== 'GK'), r.x, r.y)[0];
  }

  private doRestart() {
    const r = this.restart!;
    const team = this.mates(r.side);
    const taker = this.restartTaker();
    if (!taker) return;
    // pengambil berdiri sedikit di belakang bola (penalti: mengambil ancang-ancang beberapa langkah ke belakang)
    const pen = r.kind === 'penalty';
    const back = r.kind === 'throw' ? 0 : pen ? (r.runup !== undefined ? 0.5 : 3.4) : 0.6;
    const gxOwn = this.wx(r.side, 0);
    const dd = Math.hypot(r.x - gxOwn, r.y - 34) || 1;
    taker.tx = r.x + ((gxOwn - r.x) / dd) * back;
    taker.ty = r.y + ((34 - r.y) / dd) * back + (pen && r.runup === undefined ? (taker.p.a.wf < 10 ? 1.4 : -1.4) : 0);
    taker.sprint = !pen && Math.hypot(taker.x - r.x, taker.y - r.y) > 3;
    taker.think = 0.3;
    if (pen && r.runup !== undefined) {
      // peluit sudah ditiup: penendang berlari ke bola, kiper bergoyang di garis menunggu
      r.runup += DT;
      if (Math.hypot(taker.x - taker.tx, taker.y - taker.ty) > 0.45 && r.runup < 2.5) return;
      taker.x = taker.tx;
      taker.y = taker.ty;
      this.restart = null;
      this.ball.x = r.x;
      this.ball.y = r.y;
      this.lastTouch = taker;
      this.poss = r.side;
      this.gain(taker);
      this.penaltyKick(taker);
      return;
    }
    r.wait -= DT;
    r.setup = (r.setup ?? 0) + DT;
    // pergantian pemain belum selesai (yang keluar belum melewati garis / pengganti belum di posisinya):
    // wasit menunggu, jam berhenti
    if (this.entering > 0 && r.setup < 30) return;
    const d = Math.hypot(taker.x - taker.tx, taker.y - taker.ty);
    if (r.wait > 0 || (d > 1 && r.wait > -3)) return;
    const max = SETUP_MAX[r.kind];
    if (max !== undefined && r.setup < max) {
      // jam berhenti: wasit baru meniup peluit setelah semua pemain sampai di posisinya
      const tol = SETUP_TOL[r.kind] ?? 2.2;
      for (const b of this.active()) if (b !== taker && Math.hypot(b.x - b.tx, b.y - b.ty) > tol) return;
    } else if ((r.kind === 'corner' || r.cross) && r.wait > -4) {
      // tunggu bek tengah naik ke kotak
      for (const cb of team) if (isCB(cb.p.slot) && Math.hypot(cb.x - cb.tx, cb.y - cb.ty) > 3) return;
    }
    if (pen) {
      // semua siap: wasit meniup peluit, penendang mulai berlari dari ancang-ancangnya
      r.runup = 0;
      return;
    }
    taker.x = taker.tx;
    taker.y = taker.ty;
    this.restart = null;
    const ball = this.ball;
    ball.x = r.x;
    ball.y = r.y;
    this.lastTouch = taker;
    this.poss = r.side;
    if (r.kind === 'kickoff') {
      this.log('kickoff', r.side);
      const mate = team.filter((b) => b !== taker && (isCentralMid(b.p.slot) || isST(b.p.slot))).sort((p, q) => Math.hypot(p.x - 52.5, p.y - 34) - Math.hypot(q.x - 52.5, q.y - 34))[0];
      if (mate) this.passTo(taker, mate, false, true);
      else this.gain(taker);
    } else if (r.direct) {
      this.gain(taker);
      this.shoot(taker, 0.06 + (taker.p.a.fk - 10) * 0.004, 0, false, true);
    } else if (r.kind === 'corner' || r.cross) {
      // umpan silang ke kotak: pemain dengan sundulan dan fisik bagus paling sering dicari
      this.spUntil = this.t + 6;
      this.spSide = r.side;
      const near = Math.sign(this.fy(r.side, r.y) - 34) || 1;
      const closest = (fx: number, fy: number, list: Body[]) => {
        const x = this.wx(r.side, fx);
        const y = this.wy(r.side, fy);
        let best: Body | null = null;
        for (const b of list) if (!best || Math.hypot(b.x - x, b.y - y) < Math.hypot(best.x - x, best.y - y)) best = b;
        return best;
      };
      const others = team.filter((b) => b !== taker && b.p.slot !== 'GK');
      const routine = r.routine ?? 'mix';
      if (routine === 'short') {
        // pendek: bola mendatar ke rekan terdekat, lalu dia mencari sudut umpan silang yang lain
        const mate = closest(PITCH_W - 7, 34 + near * 27, others);
        if (mate && Math.hypot(mate.x - taker.x, mate.y - taker.y) < 16) {
          this.passTo(taker, mate, false, true);
          return;
        }
      } else if (routine === 'edge') {
        // mendatar ke tepi kotak: ditembak dari jauh atau dimainkan ulang
        const mate = closest(88, 34 + near * 6, others);
        if (mate && this.fx(r.side, mate.x) > 80) {
          this.passTo(taker, mate, false, true);
          return;
        }
      }
      const box = others.filter((b) => this.fx(r.side, b.x) > 84);
      if (routine === 'near' || routine === 'far') {
        // ke tiang dekat (disundul langsung / diteruskan) atau tiang jauh
        const target = routine === 'near' ? closest(95, 34 + near * 3, box) : closest(95.5, 34 - near * 6.5, box);
        if (target) {
          this.passTo(taker, target, true, true, routine === 'near' ? -0.3 : 0);
          return;
        }
      }
      let total = 0;
      const w = box.map((b) => {
        const v = Math.max(1, b.p.a.hea + b.p.a.jmp / 2 + b.p.a.str / 2 + (b.p.a.hgt - 180) * TUNE.height) ** 2;
        total += v;
        return v;
      });
      let pick = this.rng.float(0, total);
      const target = box.find((_, i) => (pick -= w[i]) <= 0);
      if (target) this.passTo(taker, target, true, true, r.cross ? 0 : -0.2);
      else this.gain(taker);
    } else if (r.kind === 'throw') {
      // lemparan ke dalam: ke rekan terdekat yang bebas
      let best: Body | null = null;
      let bv = -Infinity;
      for (const m of team) {
        if (m === taker || m.p.slot === 'GK') continue;
        const d2 = Math.hypot(m.x - taker.x, m.y - taker.y);
        if (d2 < 4 || d2 > 24) continue;
        const [, open] = this.nearest(this.opponents(r.side), m.x, m.y);
        const v = Math.min(open, 6) + (this.fx(r.side, m.x) - this.fx(r.side, taker.x)) * 0.08 + this.rng.float(0, 1.5);
        if (v > bv) {
          bv = v;
          best = m;
        }
      }
      if (best) {
        this.passTo(taker, best, true, true, -0.35);
        this.ball.z = 2;
      } else this.gain(taker);
    } else {
      // tendangan gawang & bebas tidak langsung: dimainkan seperti biasa
      this.gain(taker);
      taker.cool = 0.2;
      if (r.kind === 'goalkick') this.decide(taker);
      if (this.pass) this.pass.setPiece = r.kind === 'goalkick';
      if (this.pass && r.kind === 'goalkick') this.pass.offside = [];
    }
  }

  // --- tekel ------------------------------------------------------------------------

  private tackles() {
    const c = this.owner;
    if (!c || this.restart || this.dead) return;
    for (const d of this.opponents(c.side)) {
      if (d.cool > 0) continue;
      const dist = Math.hypot(d.x - c.x, d.y - c.y);
      if (d.p.slot === 'GK') {
        // kiper menyergap bola di kaki penyerang (one on ones, kelincahan, keberanian)
        if (dist > 1.7 || !this.inBox(d.side, c.x, c.y)) continue;
        const ga = d.p.a;
        const ca = c.p.a;
        d.cool = 1.1;
        const p = 0.2 + (ga.ono - 10) * 0.02 + (ga.agi - 10) * 0.008 + (ga.bra - 10) * 0.005 - (ca.dri - 10) * 0.012 - (ca.cmp - 10) * 0.008;
        if (this.rng.chance(clamp(p, 0.05, 0.6))) {
          c.st.lost++;
          c.cool = 0.8;
          this.gain(d);
          return;
        }
        continue;
      }
      if (dist > 1.5) continue;
      const da = d.p.a;
      const ca = c.p.a;
      d.cool = 0.7;
      const p =
        TUNE.tackle + (da.tck + da.ant) / 140 - (ca.dri + ca.agi * 0.5 + ca.str * 0.5) / 260 + (da.agg - 10) * 0.004 -
        // target man melindungi bola dengan badannya
        c.rk.target * Math.max(0, ca.str - 8) * 0.005 +
        // pemain bertipe keras & instruksi tekel keras: lebih berani masuk duel
        d.rk.tackle * 0.03 + (this.tk[d.side]?.tackling ?? 0) * 0.02;
      if (this.rng.chance(clamp(p, 0.04, 0.45))) {
        d.st.tackles++;
        c.st.lost++;
        c.cool = 0.8;
        this.frustrate(c, 0.07);
        if (this.rng.chance(0.45 + da.tec * 0.01)) this.gain(d);
        else this.deflect(d, 6);
        this.knock(c, 1);
        return;
      }
      // pemain yang sudah kena kartu kuning lebih berhati-hati; pemain "kotor" (Dirtiness) lebih sering melanggar
      // v18: di kotak penalti sendiri bek menahan diri (tetap berdiri, tidak menjegal); Tackling & Decisions
      const care = this.inBox(d.side, c.x, c.y) ? clamp(TUNE.boxFoul * (1.5 - (da.tck + da.dec) / 40), 0.08, 1) : 1;
      const foul =
        TUNE.foul * (0.6 + da.agg / 25) * (1.3 - da.tck / 40) * (d.st.yellow ? 0.6 : 1) * (1 + 0.35 * d.rk.tackle + 0.2 * (this.tk[d.side]?.tackling ?? 0)) *
        (0.7 + da.dirt * 0.0375) * care;
      if (this.rng.chance(foul)) {
        this.foul(d, c);
        // pelanggaran keras (agresif) lebih sering mencederai
        this.knock(c, 2 + (da.agg - 10) * 0.1);
        return;
      }
      const afx = this.fx(c.side, c.x);
      // pelanggaran taktis: pemain "kotor" menjatuhkan lawan yang lolos saat serangan balik
      if (
        da.dirt > 10 && afx > 40 && afx < PITCH_W - BOX_X - 3 && (c.run > 0 || this.t - this.wonAt[c.side] < 6) &&
        this.rng.chance((da.dirt - 10) * TUNE.tactical)
      ) {
        this.foul(d, c, true);
        return;
      }
      // dilewati: pembela butuh waktu untuk berbalik
      c.st.dribbles += dist < 1.2 ? 1 : 0;
      if (dist < 1.2) this.frustrate(d, 0.04);
      d.cool = 1.0 + (20 - da.agi) * 0.03;
    }
  }

  /**
   * Diving: penyerang menjatuhkan diri. Wasit bisa tertipu (pelanggaran; di kotak penalti jarang),
   * menghukumnya dengan kartu kuning, atau membiarkan permainan berjalan.
   */
  private simulate(c: Body, d: Body) {
    this.dives++;
    const fooled = this.inBox(d.side, c.x, c.y) ? 0.12 : 0.3;
    const r = this.rng.next();
    if (r < fooled) {
      this.foul(d, c);
      return;
    }
    if (r < fooled + 0.3) {
      this.toDead('free', d.side, c.x, c.y, 1.6);
      this.book(c, 'yellow', true);
      return;
    }
    // dibiarkan: penyerang terjatuh dan kehilangan bola
    c.cool = 1.3;
    c.vx *= 0.2;
    c.vy *= 0.2;
    c.st.lost++;
    if (this.owner === c) this.owner = null;
  }

  /** Pelanggaran: tendangan bebas / penalti, dan mungkin kartu. tactical = sengaja menghentikan serangan balik */
  private foul(d: Body, c: Body, tactical = false) {
    d.st.fouls++;
    this.fouls[d.side]++;
    this.frustrate(c, 0.2);
    const att = c.side;
    const fx = this.fx(att, c.x);
    const fy = this.fy(att, c.y);
    const box = fx > PITCH_W - BOX_X && Math.abs(fy - 34) < BOX_Y;
    // menggagalkan peluang emas: penyerang sudah lolos, tidak ada bek lain di antara dia dan gawang
    let covered = false;
    for (const o of this.mates(d.side)) {
      if (o === d || o.p.slot === 'GK') continue;
      if (this.fx(att, o.x) > fx + 0.5 && Math.abs(this.fy(att, o.y) - fy) < 12) covered = true;
    }
    const clear = !covered && fx > 75 && Math.abs(fy - 34) < 20;
    const a = d.p.a;
    let card: 'yellow' | 'red' | null = null;
    if (clear && !box && this.rng.chance(0.2)) card = 'red';
    else if (this.rng.chance(0.0015 + Math.max(0, d.base.agg - 12) * 0.001)) card = 'red';
    // frustrasi memuncak pada pemain bertemperamen buruk: tindakan kasar, kartu merah langsung
    else if (d.frus > 0.75 && a.tem < 9 && this.rng.chance((d.frus - 0.75) * (9 - a.tem) * 0.03)) card = 'red';
    else if (
      this.rng.chance(
        (TUNE.card * (0.6 + a.agg / 25) * (1.25 - a.cmp / 40) * (0.85 + a.dirt * 0.019) * (1.3 - a.tem * 0.03) +
          (clear ? 0.45 : tactical ? 0.35 : fx > 60 && c.run > 0 ? 0.2 : 0)) *
          (d.st.yellow ? 0.6 : 1),
      )
    ) {
      card = 'yellow';
    }
    // protes: pemain yang sedang frustrasi memprotes keputusan wasit dan bisa kena kartu kuning
    let dissent = false;
    if (!card && d.frus > 0.45 && a.tem < 12 && this.rng.chance((d.frus - 0.45) * (12 - a.tem) * 0.04)) {
      card = 'yellow';
      dissent = true;
    }
    this.toDead('free', att, c.x, c.y, card ? 1.6 : 0.8);
    if (card) this.book(d, card, false, dissent);
  }

  /** Benturan bisa membuat pemain cedera: pemain rawan cedera dan yang kelelahan lebih sering */
  private knock(b: Body, k: number) {
    if (!b.on || b.hurt >= 0) return;
    // kiper hanya bisa cedera kalau ada kiper cadangan yang bisa masuk
    if (b.p.slot === 'GK' && !this.reserveFor(b)) return;
    if (!this.rng.chance(TUNE.injury * k * b.p.a.inj * (b.energy < 0.6 ? 1.5 : 1))) return;
    b.hurt = this.t;
    b.st.injured = 1;
    b.vx = b.vy = 0;
    if (this.owner === b) this.owner = null;
    this.log('injury', b.side, b.p.name);
    this.refresh();
  }

  /** Cadangan yang masuk menggantikan pemain ini: seposisi dulu, kiper hanya diganti kiper */
  private reserveFor(out: Body): Body | undefined {
    if (this.subs[out.side] >= this.maxSubs()) return undefined;
    const pool = this.reserves.filter((r) => r.side === out.side && r.st.on < 0 && !this.inSub(r));
    const group = slotGroup(out.p.slot);
    const same = pool.find((r) => slotGroup(r.p.slot) === group);
    if (out.p.slot === 'GK') return same;
    return same ?? pool.find((r) => r.p.slot !== 'GK');
  }

  /** Pergantian pemain: diputuskan sekarang, dilakukan saat bola mati berikutnya */
  private substitute(out: Body, sub: Body) {
    this.subs[out.side]++;
    this.pendingSubs.push({ out, sub, at: this.t });
    if (this.restart) this.runSubs();
  }

  /** Pemain sedang menunggu / dalam proses pergantian */
  private inSub(b: Body): boolean {
    const has = (q: { out: Body; sub: Body }) => q.out === b || q.sub === b;
    return this.pendingSubs.some(has) || this.subbing.some(has);
  }

  /**
   * Bola mati: pergantian yang tertunda dilakukan, seperti di laga sungguhan:
   * 1. pemain yang diganti berjalan keluar lewat garis samping terdekat, pengganti menunggu di pinggir
   *    lapangan dekat garis tengah;
   * 2. setelah yang keluar melewati garis, pengganti masuk dan berlari ke posisinya;
   * 3. bola mati menunggu (jam berhenti) sampai pengganti siap di posisinya.
   */
  private runSubs() {
    const list = this.pendingSubs;
    this.pendingSubs = [];
    for (const { out, sub } of list) {
      // yang mau diganti terlanjur dikartu merah: pergantian batal
      if (!out.on && out.hurt < 0 && out.st.red > 0) {
        this.subs[out.side]--;
        continue;
      }
      const min = this.clock().min;
      if (out.on) {
        out.on = false;
        out.st.off = this.t;
        out.st.offMin = min;
        // keluar lewat titik terdekat di garis samping
        out.leaving = true;
        out.tx = clamp(out.x, 3, PITCH_W - 3);
        out.ty = out.y < PITCH_H / 2 ? -1.5 : PITCH_H + 1.5;
        out.sprint = false;
      }
      // pengganti menunggu di pinggir lapangan dekat garis tengah, di depan bangku cadangan (sisi bawah layar)
      sub.on = false;
      sub.waiting = true;
      this.entering++;
      sub.st.on = this.t;
      sub.st.onMin = min;
      sub.x = PITCH_W / 2 + (out.side === 0 ? -2.5 : 2.5);
      sub.y = PITCH_H + 1.6;
      sub.tx = sub.x;
      sub.ty = sub.y;
      sub.vx = sub.vy = 0;
      this.takeSlot(sub, out);
      this.bodies.push(sub);
      this.subbing.push({ out, sub });
      if (this.owner === out) this.owner = null;
      if (this.lastTouch === out) this.lastTouch = sub;
      this.log('sub', out.side, sub.p.name, out.p.name);
    }
    this.refresh();
  }

  /**
   * Pemain yang keluar berjalan ke luar lapangan; pengganti baru masuk setelah ia melewati garis,
   * lalu siap bermain setelah sampai di posisinya
   */
  private walkSubs() {
    for (const b of this.bodies) {
      if (b.leaving) {
        this.move(b);
        if (Math.hypot(b.x - b.tx, b.y - b.ty) < 1) b.leaving = false;
      }
    }
    if (!this.subbing.length) return;
    for (const q of this.subbing) {
      const { out, sub } = q;
      if (sub.waiting) {
        // sudah melewati garis samping tempat ia keluar
        const offPitch = !out.leaving || (out.ty < PITCH_H / 2 ? out.y < 0 : out.y > PITCH_H);
        // bola sudah dimainkan lagi (wasit tidak bisa menunggu lebih lama): pengganti langsung masuk
        if (!offPitch && this.restart) continue;
        sub.waiting = false;
        sub.on = true;
        sub.entering = true;
        this.refresh();
        // posisi tujuannya baru dihitung pada langkah berikutnya
        if (this.restart) continue;
      }
      if (sub.entering) {
        sub.sprint = true;
        if (Math.hypot(sub.x - sub.tx, sub.y - sub.ty) < 2.5 || !this.restart) {
          sub.entering = false;
          this.entering--;
        }
      }
    }
    this.subbing = this.subbing.filter((q) => q.sub.waiting || q.sub.entering);
  }

  /** Pelatih mengganti pemain: kaki segar untuk yang kelelahan, penyerang tambahan kalau tertinggal */
  private nextCoach: [number, number] = [0, 0];
  private tactical: [number, number] = [0, 0];
  // --- v20 laga gugur: perpanjangan waktu & adu penalti -----------------------------------------

  /** laga gugur yang masih imbang (termasuk agregat leg sebelumnya) */
  private level(): boolean {
    if (!this.input.knockout) return false;
    const agg = this.input.agg ?? [0, 0];
    return this.score[0] + agg[0] === this.score[1] + agg[1];
  }

  /** jatah pergantian: satu tambahan di perpanjangan waktu */
  private maxSubs(): number {
    return MAX_SUBS + (this.half >= 3 ? 1 : 0);
  }

  /** peluit panjang; pemain yang bermain sampai akhir perpanjangan waktu tercatat 120 menit */
  private finish() {
    if (this.half >= 3) for (const b of this.bodies) if (b.on && b.st.on >= 0 && b.st.offMin === undefined) b.st.offMin = 120;
    this.done = true;
    this.log('full', 0);
  }

  /**
   * Adu penalti: lima penendang tiap tim (yang paling tenang & jago penalti lebih dulu, kiper terakhir),
   * bergantian ke gawang yang sama, lalu sudden death. Tim dengan pemain lebih banyak menyamakan jumlah penendang.
   */
  private startShootout() {
    for (const b of this.bodies) if (b.on && b.st.on >= 0 && b.st.offMin === undefined) b.st.offMin = 120;
    this.half = 5;
    this.pendingSubs = [];
    this.restart = null;
    this.dead = null;
    this.pass = null;
    this.shot = null;
    this.owner = null;
    const val = (b: Body) => b.p.a.pen * 2 + b.p.a.cmp + (b.p.a.pre + b.p.a.imp) / 4 - (b.p.slot === 'GK' ? 60 : 0);
    const order = ([0, 1] as const).map((side) => [...this.onPitch[side]].sort((a, b) => val(b) - val(a))) as [Body[], Body[]];
    const n = Math.min(order[0].length, order[1].length);
    order[0] = order[0].slice(0, n);
    order[1] = order[1].slice(0, n);
    const first = this.rng.chance(0.5) ? 0 : 1;
    this.so = { order, next: [0, 0], goals: [0, 0], taken: [0, 0], turn: first, phase: 'gather', timer: 0, taker: null, out: 'goal', saved: false };
    this.log('pens', first);
    this.ball = { x: PITCH_W - 11, y: 34, z: 0, vx: 0, vy: 0, vz: 0 };
    this.inNet = false;
    for (const b of this.bodies) b.dive = 0;
  }

  private shootoutStep() {
    const so = this.so!;
    so.timer += DT;
    const spotX = PITCH_W - 11;
    const shooter = so.turn;
    const keeper = this.keeper((1 - shooter) as 0 | 1);
    const idle = this.keeper(shooter);
    // pemain menunggu di garis tengah, kiper yang tidak bertugas berdiri di tepi kotak penalti
    for (const side of [0, 1] as const) {
      let i = 0;
      for (const b of this.onPitch[side]) {
        if (b === so.taker || b === keeper) continue;
        if (b === idle) {
          b.tx = PITCH_W - 18;
          b.ty = 34 - 14;
        } else {
          b.tx = PITCH_W / 2;
          b.ty = side ? 35 + i * 1.3 : 33 - i * 1.3;
          i++;
        }
        b.sprint = false;
        this.move(b);
      }
    }
    if (keeper && so.phase !== 'fly') {
      keeper.tx = PITCH_W - 0.4;
      keeper.ty = 34;
      keeper.dive = 0;
      keeper.sprint = false;
      this.move(keeper);
    }
    this.walkSubs();
    this.moveOfficials();
    const ball = this.ball;
    if (so.phase === 'gather') {
      if (so.timer >= 3) {
        so.phase = 'walk';
        so.timer = 0;
      }
      return;
    }
    if (so.phase === 'walk') {
      const list = so.order[shooter];
      so.taker ??= list[so.next[shooter] % list.length];
      const c = so.taker;
      c.tx = spotX - 2.6;
      c.ty = 34 + (c.p.a.wf < 10 ? 1.2 : -1.2);
      c.sprint = Math.hypot(c.x - c.tx, c.y - c.ty) > 4;
      this.move(c);
      ball.x = spotX;
      ball.y = 34;
      ball.z = 0;
      ball.vx = ball.vy = ball.vz = 0;
      if (Math.hypot(c.x - c.tx, c.y - c.ty) < 0.6 && so.timer > 1) {
        so.phase = 'run';
        so.timer = 0;
      }
      return;
    }
    const c = so.taker!;
    if (so.phase === 'run') {
      c.tx = spotX - 0.4;
      c.ty = 34;
      c.sprint = false;
      this.move(c);
      if (so.timer < 0.5 || (Math.hypot(c.x - c.tx, c.y - c.ty) > 0.45 && so.timer < 2.5)) return;
      this.spotKick(c, keeper);
      so.phase = 'fly';
      so.timer = 0;
      return;
    }
    // bola melayang ke gawang, kiper terjun
    this.ballPhysics(false);
    if (keeper) {
      keeper.sprint = true;
      this.move(keeper);
      if (so.out === 'save' && !so.saved && ball.x >= keeper.x - 0.4) {
        so.saved = true;
        keeper.y += (ball.y - keeper.y) * 0.6;
        ball.vx = -Math.abs(ball.vx) * 0.25;
        ball.vy = this.rng.float(-5, 5);
        ball.vz = this.rng.float(0.5, 2.5);
      }
    }
    this.move(c);
    if (so.timer < 2) return;
    // catat hasil tendangan
    const scored = so.out === 'goal';
    if (scored) so.goals[shooter]++;
    so.taken[shooter]++;
    const e: MatchEvent = { t: this.t, min: 120, kind: 'shootout', side: shooter, name: c.p.name, scored, pens: [so.goals[0], so.goals[1]] };
    this.events.push(e);
    const [g0, g1] = so.goals;
    const [n0, n1] = so.taken;
    const decided = n0 <= 5 && n1 <= 5 && (n0 < 5 || n1 < 5) ? g0 + (5 - n0) < g1 || g1 + (5 - n1) < g0 : n0 === n1 && g0 !== g1;
    if (decided) {
      this.so = { ...so, taker: null };
      this.finish();
      return;
    }
    so.next[shooter]++;
    so.turn = (1 - shooter) as 0 | 1;
    so.taker = null;
    so.phase = 'walk';
    so.timer = 0;
    so.saved = false;
    this.inNet = false;
    ball.x = spotX;
    ball.y = 34;
    ball.z = 0;
    ball.vx = ball.vy = ball.vz = 0;
    if (keeper) keeper.dive = 0;
  }

  /**
   * Satu tendangan adu penalti: seperti penalti biasa (sisi pilihan penendang, tebakan kiper), ditambah
   * tekanan: penendang yang gugup (Pressure & Composure rendah) dan lelah lebih sering gagal, apalagi di
   * tendangan penentu (kelima dan sudden death).
   */
  private spotKick(c: Body, gk: Body | undefined) {
    const so = this.so!;
    const a = c.p.a;
    const ga = gk?.p.a;
    const decisive = so.taken[c.side] >= 4;
    const nerve = (decisive ? 0.06 : 0.025) * clamp(1.6 - (a.pre + a.cmp) / 25, 0.2, 1.4) + (1 - c.energy) * 0.05;
    const side = this.rng.chance(0.1) ? 0 : this.rng.chance(0.5) ? -1 : 1;
    const read = ga ? (ga.ant - 10) * 0.012 : 0;
    const guess = this.rng.chance(0.08) ? 0 : this.rng.chance(0.5 + (side !== 0 ? read * side : 0)) ? 1 : -1;
    const miss = clamp(0.075 + (12 - a.pen) * 0.007 - (a.cmp - 10) * 0.004 + nerve, 0.02, 0.32);
    const gkSkill = ga ? (ga.ref * 2 + ga.ono + ga.han) / 4 : 8;
    let save = 0;
    if (side !== 0 && guess === side) save = clamp(0.2 + (gkSkill - 10) * 0.02 - (a.pen - 10) * 0.02, 0.15, 0.65);
    else if (side === 0 && guess === 0) save = 0.85;
    else if (side !== 0 && guess === 0) save = 0.1;
    const r = this.rng.next();
    so.out = r < miss ? 'miss' : r < miss + (1 - miss) * save ? 'save' : 'goal';
    so.saved = false;
    const aimY = so.out === 'miss' ? 34 + (side || 1) * this.rng.float(GOAL_HALF + 0.3, GOAL_HALF + 1.5) : 34 + side * this.rng.float(1.9, 3.2);
    const h = so.out === 'miss' && this.rng.chance(0.4) ? this.rng.float(BAR + 0.2, BAR + 1.2) : this.rng.float(0.15, 1.6);
    const ball = this.ball;
    const dx = PITCH_W - ball.x;
    const dy = aimY - ball.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = 20 + a.pen * 0.4;
    const tl = d / speed;
    ball.z = 0.1;
    ball.vx = (dx / d) * speed;
    ball.vy = (dy / d) * speed;
    ball.vz = (h - ball.z + (G * tl * tl) / 2) / tl;
    if (gk) {
      gk.dive = 1.2;
      gk.tx = PITCH_W - 0.6;
      gk.ty = so.out === 'save' ? aimY : 34 + guess * 2.6;
    }
  }

  // --- v19 pelatih membaca laga: mentalitas, instruksi, dan bentuk tim di tengah laga ---------------

  /** v19 bentuk tim saat ini: nama dan tempat-tempatnya (untuk papan susunan pemain) */
  shapeOf(side: 0 | 1): { id: string; spots: Spot[] } {
    const id = this.shape[side];
    return { id, spots: SHAPES[id] ?? FORMATIONS['4-3-3'].spots };
  }

  /** catatan keputusan pelatih di daftar kejadian */
  private note(side: 0 | 1, text: string) {
    const c = this.clock();
    const e: MatchEvent = { t: this.t, min: c.min, kind: 'tactic', side, note: text };
    if (c.plus) e.plus = c.plus;
    this.events.push(e);
  }

  /** jumlah pemain tim yang diusir wasit */
  private sentOff(side: 0 | 1): number {
    let n = 0;
    for (const b of this.bodies) if (b.side === side && b.st.red > 0) n++;
    return n;
  }

  /**
   * Susun ulang tempat pemain ke bentuk tim baru: tiap tempat diisi pemain yang posisi alaminya paling dekat
   * (pemain bertahan di tempatnya kalau tempat itu masih ada). Kalau pemain lebih sedikit dari tempat
   * (kartu merah), tempat paling depan dikosongkan lebih dulu, tapi selalu tersisa satu penyerang.
   */
  private reshape(side: 0 | 1, id: string, why?: string) {
    const all = SHAPES[id];
    if (!all) return;
    const list = this.bodies.filter((b) => b.side === side && b.p.slot !== 'GK' && !b.leaving && (b.on || b.waiting || b.entering) && b.st.red === 0);
    const spots = all.filter((sp) => sp.slot !== 'GK');
    while (spots.length > list.length) {
      const fwd = spots.filter((sp) => isST(sp.slot)).length;
      let drop = -1;
      for (let i = 0; i < spots.length; i++) {
        if (isST(spots[i].slot) && fwd <= 1) continue;
        if (drop < 0 || spots[i].base[0] > spots[drop].base[0]) drop = i;
      }
      spots.splice(drop, 1);
    }
    const cost = (b: Body, sp: Spot) => {
      const h = BASE[b.home] ?? sp.base;
      return Math.hypot(h[0] - sp.base[0], (h[1] - sp.base[1]) * 1.2) - (b.p.slot === sp.slot ? 2 : 0);
    };
    const pairs: [number, number, number][] = [];
    list.forEach((b, i) => spots.forEach((sp, j) => pairs.push([cost(b, sp), i, j])));
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const at = new Array<number>(list.length).fill(-1);
    const taken = new Set<number>();
    for (const [, i, j] of pairs) {
      if (at[i] >= 0 || taken.has(j)) continue;
      at[i] = j;
      taken.add(j);
    }
    // perbaikan: tukar tempat dua pemain kalau jarak totalnya lebih kecil
    for (let pass = 0; pass < 6; pass++) {
      let better = false;
      for (let i = 0; i < list.length; i++) {
        for (let k = i + 1; k < list.length; k++) {
          if (at[i] < 0 || at[k] < 0) continue;
          const now = cost(list[i], spots[at[i]]) + cost(list[k], spots[at[k]]);
          if (cost(list[i], spots[at[k]]) + cost(list[k], spots[at[i]]) < now - 0.01) {
            [at[i], at[k]] = [at[k], at[i]];
            better = true;
          }
        }
      }
      if (!better) break;
    }
    this.shape[side] = id;
    const bases: Record<string, [number, number]> = {};
    for (const sp of all) bases[sp.slot] = sp.base;
    this.bases[side] = bases;
    list.forEach((b, i) => {
      if (at[i] >= 0) this.moveTo(b, spots[at[i]].slot);
    });
    if (why) this.note(side, why);
  }

  /** pindahkan pemain ke tempat lain; peran yang tidak cocok dengan tempat barunya diganti peran bawaan */
  private moveTo(b: Body, slot: Slot) {
    if (b.p.slot === slot) return;
    let role = b.p.role;
    let duty = b.p.duty;
    if (role && !roleFits(role, slot)) [role, duty] = defaultRole(slot);
    else if (role && duty && duty !== 'Au' && ROLE_DUTIES[role] && !ROLE_DUTIES[role].includes(duty)) duty = ROLE_DUTIES[role][0];
    const oop = slotKind(b.p.slot) === slotKind(slot) ? b.p.oop : undefined;
    b.p = { ...b.p, slot, role, duty, oop };
    b.rk = this.styleOf(b.p, b.p.duty === 'Au' ? (b.autoDuty ?? 'Su') : undefined);
  }

  /** ganti mentalitas tim (hanya tim dengan taktik pelatih) */
  private setMent(side: 0 | 1, m: number): boolean {
    const tk = this.tk[side];
    m = clamp(Math.round(m), -3, 3);
    if (!tk || m === tk.mentality) return false;
    const from = tk.mentality;
    this.tk[side] = { ...tk, mentality: m };
    this.baseK[side] = styleOfTactic(this.tk[side]!);
    this.note(side, `Mentalitas: ${mentalityLabel(from)} → ${mentalityLabel(m)}`);
    return true;
  }

  /** ubah sebagian instruksi tim */
  private setInstr(side: 0 | 1, patch: Partial<TacticK>, text: string): boolean {
    const tk = this.tk[side];
    if (!tk) return false;
    this.tk[side] = { ...tk, ...patch };
    this.baseK[side] = styleOfTactic(this.tk[side]!);
    this.note(side, text);
    return true;
  }

  /**
   * Kartu merah: pelatih langsung menyusun ulang tim (biasanya mengorbankan satu penyerang). Bek yang
   * diusir diganti bek dari bangku cadangan kalau masih ada jatah pergantian.
   */
  private redShape(red: Body) {
    const side = red.side;
    const c = this.clock();
    const n = 11 - this.sentOff(side);
    if (red.p.slot === 'GK' || n >= 11) return;
    const cur = this.shape[side];
    const back = (SHAPES[cur] ?? FORMATIONS['4-3-3'].spots).filter((sp) => isDef(sp.slot)).length;
    const d = this.score[side] - this.score[1 - side];
    const chase = d < 0 && c.min >= 55;
    const id = n <= 9 ? '4-3-1' : back >= 5 ? (chase ? '4-3-2' : '5-3-1') : back === 3 ? (chase ? '3-4-2' : '4-4-1') : chase ? '4-3-2' : '4-4-1';
    if (id !== cur) this.reshape(side, id, `Formasi diubah: ${cur} → ${id} (bermain dengan ${n} orang)`);
    else this.reshape(side, id);
    if (slotGroup(red.home) === 'DEF' && c.min < 80 && this.subs[side] < this.maxSubs() - 1) {
      const sub = this.reserves.find((r) => r.side === side && r.st.on < 0 && !this.inSub(r) && slotGroup(r.p.slot) === 'DEF');
      const out = this.onPitch[side]
        .filter((b) => slotGroup(b.p.slot) === 'ATT' && !b.p.user && !this.inSub(b))
        .sort((a, b) => this.fx(side, b.x) - this.fx(side, a.x))[0];
      if (sub && out) {
        this.tactical[side]++;
        this.substitute(out, sub);
      }
    }
  }

  /**
   * Pelatih membaca laga tiap 5 menit (mulai menit 20):
   * - mentalitas: tertinggal = makin menyerang; unggul tipis melawan tim lebih kuat = bertahan (sampai
   *   sangat bertahan di menit akhir); imbang melawan tim lebih lemah = mendorong mencari gol kemenangan.
   * - instruksi: menguasai laga tapi buntu = ubah cara menyerang sesuai kekuatan pemainnya (umpan silang,
   *   tembakan jarak jauh, tempo & umpan terobosan, atau dribel); tertinggal di menit akhir = pressing tinggi;
   *   menjaga keunggulan = garis turun & lebih rapat.
   * - formasi: mengejar ketinggalan = dua penyerang; menjaga keunggulan tipis di menit akhir = lima bek.
   * Pelatih yang berani bereaksi lebih cepat.
   */
  private coachThink() {
    const c = this.clock();
    if (c.min < 20) return;
    const per = HALF / 45;
    const q = [this.quality(0), this.quality(1)];
    for (const side of [0, 1] as const) {
      if (this.t < this.coachNext[side]) continue;
      this.coachNext[side] = this.t + 5 * per;
      const cs = this.coach[side];
      const opp = (1 - side) as 0 | 1;
      const min = c.min + (this.half >= 2 ? c.plus : 0);
      const d = this.score[side] - this.score[opp];
      const rel = clamp((q[side] - q[opp]) * TUNE.rel, -1, 1);
      const man = this.sentOff(opp) - this.sentOff(side);
      const early = cs.bold * 5;
      const tk = this.tk[side];

      // 1. mentalitas
      let want = cs.ment0;
      if (d < 0) {
        if (min >= 58 - early) want = cs.ment0 + 1;
        if (min >= 73 - early || (d <= -2 && min >= 65)) want = cs.ment0 + 2;
        if (min >= 84 && cs.bold > 0.3) want = 3;
      } else if (d > 0) {
        if (d === 1 && rel < -0.15 && min >= 68 + early) want = min >= 80 ? -2 - (cs.bold < 0 ? 1 : 0) : Math.min(cs.ment0, -1);
        else if (d === 1 && min >= 78 + early) want = cs.ment0 - 1;
        else if (d >= 2 && min >= 70) want = cs.ment0 - 1;
      } else if (rel > 0.15 && min >= 65 - early) want = cs.ment0 + 1;
      else if (rel < -0.15 && min >= 75 + early) want = cs.ment0 - 1;
      if (man < 0 && d >= 0) want -= 1;
      else if (man > 0 && d <= 0) want += 1;
      this.setMent(side, want);
      if (!tk) continue;

      // 2. instruksi
      const poss = this.possTime[side] / (this.possTime[0] + this.possTime[1] || 1);
      const stuck = d <= 0 && (rel > 0.05 || poss > 0.55) && this.xgFor[side] - cs.xgAt < (min / 90) * 1.4 * (cs.unlock ? 0.4 : 1);
      if (stuck && cs.unlock < 2 && min >= (cs.unlock ? 72 : 55) - early) this.unlock(side, cs);
      else if (d < 0 && min >= 72 - early && !cs.pressed) {
        cs.pressed = true;
        const t = this.tk[side]!;
        this.setInstr(side, { press: Math.min(2, t.press + 1), engage: Math.min(2, t.engage + 1), line: Math.min(2, t.line + 1), counterPress: true }, 'Instruksi: pressing lebih tinggi untuk merebut bola');
      } else if (d > 0 && (this.tk[side]!.mentality <= -2 || man < 0) && !cs.parked) {
        cs.parked = true;
        const t = this.tk[side]!;
        this.setInstr(
          side,
          { line: Math.max(-2, t.line - 1), engage: Math.max(-2, t.engage - 1), press: Math.max(-2, t.press - 1), tempo: Math.max(-2, t.tempo - 1), counter: true },
          'Instruksi: garis pertahanan turun, lebih rapat, ulur tempo',
        );
      }

      // 3. formasi (11 pemain)
      if (man < 0 || this.sentOff(side)) continue;
      const cur = this.shape[side];
      const spots = SHAPES[cur] ?? FORMATIONS['4-3-3'].spots;
      const strikers = spots.filter((sp) => isST(sp.slot)).length;
      const back = spots.filter((sp) => isDef(sp.slot)).length;
      if (d < 0 && min >= 66 - early && !cs.chase && (strikers < 2 || back >= 5)) {
        cs.chase = true;
        this.reshape(side, '4-4-2', `Formasi diubah: ${cur} → 4-4-2 (dua penyerang untuk mengejar gol)`);
      } else if (d === 1 && min >= 80 + early && rel < 0.1 && !cs.protect && back < 5) {
        cs.protect = true;
        const id = strikers >= 2 && back === 3 ? '5-3-2' : '5-4-1';
        this.reshape(side, id, `Formasi diubah: ${cur} → ${id} (lima bek menjaga keunggulan)`);
        // bek dari bangku cadangan masuk menggantikan penyerang yang paling lelah
        if (this.tactical[side] < TUNE.aiSubs + 1 && this.subs[side] < this.maxSubs() - 1) {
          const sub = this.reserves.find((r) => r.side === side && r.st.on < 0 && !this.inSub(r) && slotGroup(r.p.slot) === 'DEF');
          const out = this.onPitch[side].filter((b) => slotGroup(b.p.slot) === 'ATT' && !b.p.user && !this.inSub(b)).sort((a, b) => a.energy - b.energy)[0];
          if (sub && out) {
            this.tactical[side]++;
            this.substitute(out, sub);
          }
        }
      }
    }
  }

  /** instruksi pembuka kebuntuan, dipilih sesuai kekuatan pemain di lapangan */
  private unlock(side: 0 | 1, cs: Coach) {
    const on = this.onPitch[side].filter((b) => b.p.slot !== 'GK');
    const avg = (list: Body[], f: (a: EAttrs) => number) => (list.length ? list.reduce((s, b) => s + f(b.p.a), 0) / list.length : 10);
    const wide = on.filter((b) => isFB(b.p.slot) || isWing(b.p.slot) || isWideMid(b.p.slot));
    const front = on.filter((b) => isST(b.p.slot) || isWing(b.p.slot) || b.p.slot === 'AM');
    const shooters = on.filter((b) => !isDef(b.p.slot));
    const air = on.reduce((m, b) => Math.max(m, b.p.a.hea + b.p.a.jmp / 2 + (b.p.a.hgt - 180) * 0.1), 0);
    const opts: [string, number][] = [
      ['cross', avg(wide, (a) => a.cro) * 0.6 + air * 0.25],
      ['long', avg(shooters, (a) => a.lon) + 0.5],
      ['direct', avg(front, (a) => (a.pace + a.acc + a.otb) / 3)],
      ['creative', avg(front, (a) => (a.dri + a.fla) / 2)],
    ];
    let best = '';
    let bv = -Infinity;
    for (const [k, v] of opts) {
      if (cs.used.includes(k)) continue;
      const score = v + this.crng.float(-1.5, 1.5);
      if (score > bv) {
        bv = score;
        best = k;
      }
    }
    const t = this.tk[side]!;
    cs.used.push(best);
    cs.unlock++;
    cs.xgAt = this.xgFor[side];
    if (best === 'cross') this.setInstr(side, { width: Math.min(2, t.width + 1), focus: 'sayap', crosses: 'campuran', overlap: true, workIntoBox: false }, 'Instruksi: main melebar & lebih banyak umpan silang');
    else if (best === 'long') this.setInstr(side, { shootOnSight: true, workIntoBox: false }, 'Instruksi: lebih sering menembak dari luar kotak');
    else if (best === 'direct') this.setInstr(side, { tempo: Math.min(2, t.tempo + 1), directness: Math.min(2, t.directness + 1), passIntoSpace: true }, 'Instruksi: tempo lebih cepat & umpan terobosan');
    else this.setInstr(side, { creative: 1, dribble: 1 }, 'Instruksi: lebih ekspresif, berani menggiring bola');
  }

  private coachSubs() {
    if (this.half < 2 || this.half > 4 || (!this.dead && !this.restart) || this.restart?.kind === 'penalty') return;
    const c = this.clock();
    if (c.min < 55) return;
    const per = HALF / 45;
    for (const side of [0, 1] as const) {
      if (this.t < this.nextCoach[side]) continue;
      this.nextCoach[side] = this.t + 5 * per;
      // sisakan satu pergantian untuk pemain cedera
      if (this.tactical[side] >= TUNE.aiSubs + (this.half >= 3 ? 1 : 0) || this.subs[side] >= this.maxSubs() - 1) continue;
      const pool = this.reserves.filter((r) => r.side === side && r.st.on < 0 && !this.inSub(r));
      if (!pool.length) continue;
      const fieldOn = this.onPitch[side].filter((b) => b.p.slot !== 'GK' && this.t - Math.max(0, b.st.on) > 10 * per && !this.inSub(b));
      // pemain kita hanya ditarik kalau benar-benar kelelahan
      const can = fieldOn.filter((b) => !b.p.user || b.energy < TUNE.subTired - 0.12);
      let out: Body | undefined;
      let sub: Body | undefined;
      if (this.score[side] < this.score[1 - side] && c.min >= 62 && this.rng.chance(0.6)) {
        sub = pool.find((r) => slotGroup(r.p.slot) === 'ATT');
        out = can.filter((b) => slotGroup(b.p.slot) !== 'DEF').sort((a, b) => a.energy - b.energy)[0];
      }
      if (!out || !sub) {
        out = can.sort((a, b) => a.energy - b.energy)[0];
        if (!out || !(out.energy < TUNE.subTired || (c.min >= 68 && this.rng.chance(0.5)))) continue;
        const group = slotGroup(out.p.slot);
        sub = pool.find((r) => slotGroup(r.p.slot) === group) ?? pool.find((r) => r.p.slot !== 'GK');
      }
      if (!out || !sub) continue;
      this.tactical[side]++;
      this.substitute(out, sub);
    }
  }

  /** Pemain cedera diganti saat bola mati (atau setelah beberapa detik kalau bola terus hidup) */
  private replaceHurt() {
    for (const out of [...this.bodies]) {
      if (!out.on || out.hurt < 0) continue;
      if (!this.dead && !this.restart && this.t - out.hurt < 8) continue;
      out.on = false;
      out.st.off = this.t;
      out.st.offMin = this.clock().min;
      // ditandu / dipapah keluar lapangan
      out.leaving = true;
      out.tx = out.x;
      out.ty = out.y < PITCH_H / 2 ? -1.5 : PITCH_H + 1.5;
      out.sprint = false;
      if (this.owner === out) this.owner = null;
      const sub = this.reserveFor(out);
      if (sub) this.substitute(out, sub);
      this.refresh();
    }
  }


  private book(b: Body, card: 'yellow' | 'red', dive = false, dissent = false) {
    if (card === 'yellow') {
      b.st.yellow++;
      if (b.st.yellow < 2) {
        this.log('yellow', b.side, b.p.name);
        if (dive) this.events[this.events.length - 1].dive = true;
        if (dissent) this.events[this.events.length - 1].dissent = true;
        return;
      }
    }
    // kartu merah (langsung atau kuning kedua): keluar lapangan, tim main dengan 10 orang
    b.st.red++;
    const c = this.clock();
    const e: MatchEvent = { t: this.t, min: c.min, kind: 'red', side: b.side, name: b.p.name };
    if (c.plus) e.plus = c.plus;
    if (card === 'yellow') e.second = true;
    if (dive) e.dive = true;
    if (dissent) e.dissent = true;
    this.events.push(e);
    b.on = false;
    b.st.off = this.t;
    b.st.offMin = c.min;
    if (this.owner === b) this.owner = null;
    this.refresh();
    if (TUNE.coach) this.redShape(b);
  }

  // --- langkah simulasi --------------------------------------------------------------

  step() {
    if (this.done) return;
    if (this.so) {
      this.shootoutStep();
      return;
    }
    if (this.pause > 0) {
      // selebrasi gol: pencetak lari ke bendera sudut, rekan mengerumuninya, kiper merayakan di dekat gawang;
      // tim lawan berjalan kembali. Lalu semua kembali ke posisi untuk sepak mula (jam berhenti)
      this.pause -= DT;
      this.ballPhysics(false);
      const party = this.pause > 2.5 ? this.celeb : null;
      const mates = party ? this.mates(party.side).filter((b) => b.p.slot !== 'GK' && b !== party.scorer) : [];
      for (const b of this.active()) {
        let [x, y] = this.kickoffSpot(b);
        let sprint = false;
        if (party && b.side === party.side) {
          const sc = party.scorer;
          const side = b.side;
          if (b.p.slot === 'GK') {
            // kiper merayakan di samping gawangnya
            x = this.wx(side, 2.5);
            y = this.wy(side, 34 + (this.fy(side, b.y) >= 34 ? 6.5 : -6.5));
          } else if (sc && b === sc) {
            // pencetak gol berlari ke bendera sudut terdekat
            x = this.wx(side, PITCH_W - 2.5);
            y = this.wy(side, this.fy(side, sc.y) < 34 ? 2.5 : PITCH_H - 2.5);
            sprint = Math.hypot(b.x - x, b.y - y) > 3;
          } else if (sc) {
            // rekan setim mengerumuni pencetak gol
            const i = mates.indexOf(b);
            const ang = (i / Math.max(1, mates.length)) * Math.PI * 2;
            const r = 1.3 + (i % 3) * 0.5;
            x = clamp(sc.x + Math.cos(ang) * r, 0.5, PITCH_W - 0.5);
            y = clamp(sc.y + Math.sin(ang) * r, 0.5, PITCH_H - 0.5);
            sprint = Math.hypot(b.x - x, b.y - y) > 4;
          }
        }
        b.tx = x;
        b.ty = y;
        // akhir selebrasi: yang masih jauh dari posisinya berlari kecil kembali
        b.sprint = sprint || (!party && Math.hypot(b.x - x, b.y - y) > 12);
        this.move(b);
      }
      this.walkSubs();
      if (this.pause <= 0 && this.kickoffAfter !== null) {
        // pemain berjalan kembali ke posisinya; sepak mula menunggu sampai semua siap
        this.kickoff(this.kickoffAfter, false);
        this.kickoffAfter = null;
        this.celeb = null;
      }
      this.moveOfficials();
      return;
    }
    // jam berhenti saat bola mati besar (pelanggaran, pojok, penalti): wasit menunggu semua pemain siap
    if (!this.frozen()) {
      this.t += DT;
      this.possTime[this.poss] += DT;
    }
    if (this.t >= this.nextMental) {
      this.nextMental = this.t + HALF / 45;
      if (TUNE.coach) this.coachThink();
      this.mentality();
      this.mind();
    }

    // pergantian pemain kita: diputuskan pada menitnya, dilakukan saat bola mati berikutnya
    for (const sub of this.bench) {
      const team = sub.side === 0 ? this.input.home : this.input.away;
      if (sub.on || sub.st.on >= 0 || !team.sub || this.t < team.sub.at || this.inSub(sub)) continue;
      const out =
        this.bodies.find((b) => b.on && b.side === sub.side && b.p.slot === team.sub!.slot && !this.inSub(b)) ??
        // pemain di slot itu dikartu merah: pelatih menarik pemain lain
        this.bodies.find((b) => b.on && b.side === sub.side && b.p.slot !== 'GK' && slotGroup(b.p.slot) === slotGroup(team.sub!.slot) && !this.inSub(b));
      if (!out) continue;
      sub.p.num = out.p.num;
      this.substitute(out, sub);
    }
    // v18: bola lama tidak mati (jarang ada pelanggaran / bola keluar): pergantian tetap dilakukan
    if (this.pendingSubs.length && (this.restart || this.t - this.pendingSubs[0].at > TUNE.subWait)) this.runSubs();
    this.replaceHurt();

    this.coachSubs();

    const per = HALF / 45;
    if (this.half === 1 && this.t >= HALF) {
      if (this.added[0] < 0) {
        this.added[0] = this.addedTime(1);
        this.events.push({ t: this.t, min: 45, kind: 'added', side: 0, plus: this.added[0] });
      }
      if (this.t >= HALF + this.added[0] * per) {
        // jeda turun minum: sebagian tenaga pulih
        for (const b of this.bodies) {
          b.tire *= 0.8;
          b.energy = Math.min(1 - b.tire, b.energy + 0.1);
        }
        this.half = 2;
        this.log('half', 0);
        this.kickoff(1);
        return;
      }
    }
    if (this.half === 2) {
      const t2 = this.t - HALF - this.added[0] * per;
      if (t2 >= HALF && this.added[1] < 0) {
        this.added[1] = this.addedTime(2);
        this.events.push({ t: this.t, min: 90, kind: 'added', side: 0, plus: this.added[1] });
      }
      if (this.added[1] >= 0 && t2 >= HALF + this.added[1] * per) {
        if (this.level()) {
          // v20 laga gugur masih imbang: perpanjangan waktu (jeda singkat, sedikit tenaga pulih)
          for (const b of this.bodies) {
            b.tire *= 0.92;
            b.energy = Math.min(1 - b.tire, b.energy + 0.04);
          }
          this.half = 3;
          this.etStart[0] = this.t;
          this.log('extra', 0);
          this.kickoff(0);
          return;
        }
        this.finish();
        return;
      }
    }
    if (this.half === 3 || this.half === 4) {
      const h = this.half;
      const t3 = this.t - this.etStart[h - 3];
      if (t3 >= ET_HALF && this.added[h - 1] < 0) {
        this.added[h - 1] = this.addedTime(h);
        this.events.push({ t: this.t, min: h === 3 ? 105 : 120, kind: 'added', side: 0, plus: this.added[h - 1] });
      }
      if (this.added[h - 1] >= 0 && t3 >= ET_HALF + this.added[h - 1] * per) {
        if (h === 3) {
          this.half = 4;
          this.etStart[1] = this.t;
          this.log('half', 0);
          this.kickoff(1);
        } else if (this.level()) this.startShootout();
        else this.finish();
        return;
      }
    }

    for (const b of this.active()) {
      b.cool = Math.max(0, b.cool - DT);
      b.think -= DT;
      if (b.dive > 0) b.dive -= DT;
      if (b.check > 0) {
        b.check -= DT;
        // selesai turun: jeda beberapa detik sebelum turun lagi
        if (b.check <= 0) b.check = -(5 + this.rng.float(0, 5));
      } else if (b.check < 0) b.check = Math.min(0, b.check + DT);
      // v21 penyerang yang suka turun (Complete Forward, kebiasaan "Turun menjemput bola") sesekali turun ke kaki
      else if (
        TUNE.pin > 0 && b.rk.drop > 0 && b.rk.drop - b.tdrop < 5 && b.run <= 0 && isST(b.p.slot) && this.poss === b.side && this.owner && this.owner !== b && !this.restart &&
        this.rng.chance(TUNE.checkRate * b.rk.drop * (0.5 + (b.p.a.otb + b.p.a.dec) / 40))
      ) {
        const ofx = this.fx(b.side, this.owner.x);
        if (ofx > 15 && ofx < 72) b.check = 2 + this.rng.float(0, 1.2);
      }
      if (b.run > 0) b.run -= DT;
      else if (
        this.poss === b.side && this.owner && b.p.slot !== 'GK' && b !== this.owner &&
        this.rng.chance(b.p.a.otb * TUNE.runRate * b.rk.runs * (1 + 0.08 * (this.tk[b.side]?.mentality ?? 0)) * (this.counterPhase(b.side) ? 1.6 : 1))
      ) {
        const mid = isCentralMid(b.p.slot) && !isHold(b.p.slot);
        const fwd = isST(b.p.slot) || isWing(b.p.slot) || isWideMid(b.p.slot) || isWB(b.p.slot);
        const bfx = this.fx(b.side, this.ball.x);
        // pemain cerdas mulai lari saat masih onside
        const onside = this.fx(b.side, b.x) < this.offsideLine(b.side) || this.rng.chance(0.25 - b.p.a.dec * 0.01);
        if (onside) {
          if (fwd) b.run = isST(b.p.slot) ? 2.5 : 3.2;
          else if (mid && bfx > 55) b.run = 4.5;
          if (b.run > 0) {
            b.think = 0;
            b.runY = this.runLane(b);
          }
        }
      }
    }

    const live = !this.restart && !this.dead;
    if (live && this.t >= this.pcNext) {
      this.pcNext = this.t + 0.5;
      this.updateControl();
    }
    this.targets(live);
    if (this.dead) {
      this.dead.t -= DT;
      if (this.dead.t <= 0) {
        const d = this.dead;
        this.dead = null;
        this.setRestart(d);
      }
    } else if (this.restart) this.doRestart();
    else if (this.owner) {
      // lawan datang menekan: pemain yang membaca situasi melepas bola lebih cepat
      const o = this.owner;
      if (o.cool > 0.1 && o.p.slot !== 'GK') {
        const [, pd] = this.nearest(this.opponents(o.side), o.x, o.y);
        if (pd < 2.2 + o.p.a.ant * 0.05) o.cool = Math.min(o.cool, 0.1);
      }
      if (o.cool <= 0) this.decide(o);
    }

    for (const b of this.active()) {
      if (b.entering) b.sprint = true;
      this.move(b);
    }
    this.walkSubs();

    if (this.owner) {
      const o = this.owner;
      const sp = Math.hypot(o.vx, o.vy);
      const fdx = sp > 0.3 ? o.vx / sp : this.dir(o.side);
      const fdy = sp > 0.3 ? o.vy / sp : 0;
      this.ball.x = o.x + fdx * 0.6;
      this.ball.y = o.y + fdy * 0.6;
      this.ball.z = 0;
      this.ball.vx = this.ball.vy = this.ball.vz = 0;
      this.tackles();
    } else if (!this.restart) {
      this.ballPhysics(!this.dead);
    }
    this.moveOfficials();
  }

  /** Pemain pengganti mengambil tempat, peran, dan tugas yang diminta pelatih untuk tempat itu */
  private takeSlot(sub: Body, out: Body) {
    sub.p = { ...sub.p, slot: out.p.slot, role: out.p.role ?? sub.p.role, duty: out.p.duty ?? sub.p.duty, oop: out.p.oop };
    const duty = sub.p.duty === 'Au' ? (out.autoDuty ?? 'Su') : sub.p.duty;
    if (sub.p.duty === 'Au') sub.autoDuty = duty;
    sub.rk = this.styleOf(sub.p, duty);
    // v19 pengganti dari lini lain (mis. bek masuk menggantikan penyerang): pelatih menyusun ulang tempat pemain
    if (TUNE.coach && sub.home !== 'GK' && sub.p.slot !== 'GK' && slotGroup(sub.home) !== slotGroup(sub.p.slot)) this.reshape(sub.side, this.shape[sub.side]);
  }

  /** Serangan balik: beberapa detik setelah merebut bola, tim yang diinstruksikan langsung menyerang */
  private counterPhase(side: 0 | 1): boolean {
    return !!this.tk[side]?.counter && this.t - this.wonAt[side] < 4;
  }

  /** Counter-press: beberapa detik setelah kehilangan bola, tim yang diinstruksikan langsung merebut kembali */
  private counterPressing(side: 0 | 1): boolean {
    return !!this.tk[side]?.counterPress && this.t - this.wonAt[(1 - side) as 0 | 1] < 3;
  }

  /** Jam berhenti: bola mati besar sedang disiapkan */
  frozen(): boolean {
    const r = this.restart ?? this.dead;
    // selebrasi gol dan pemain pengganti yang sedang masuk juga menghentikan jam
    return this.pause > 0 || (!!r && (FROZEN.has(r.kind) || (this.entering > 0 && !!this.restart)));
  }

  /** Wasit & asisten wasit bergerak ke posisinya (tanpa angka acak: hasil laga tidak berubah) */
  private moveOfficials() {
    const r = this.restart ?? this.dead;
    const bx = r ? r.x : this.ball.x;
    const by = r ? r.y : this.ball.y;
    for (const o of this.officials) {
      let tx: number;
      let ty: number;
      if (o.role === 'ref') {
        // diagonal kiri: dari dekat pojok kiri atas ke pojok kanan bawah, sedikit di belakang arah serangan
        const diag = 8 + ((clamp(bx, 16, 89) - 16) / 73) * 52;
        tx = bx - this.dir(this.poss) * 7;
        let off = clamp(diag - by, -12, 12);
        if (Math.abs(off) < 7) off = (off >= 0 ? 1 : -1) * 7;
        ty = by + off;
        if (r?.kind === 'corner' || r?.kind === 'penalty') {
          // bola mati di depan gawang: wasit berdiri di tepi kotak, menghadap mulut gawang
          const gx = bx < PITCH_W / 2 ? 0 : PITCH_W;
          tx = gx + (gx === 0 ? 1 : -1) * 15;
          ty = 34 + (by < 34 ? 12 : -12);
        }
        tx = clamp(tx, 6, PITCH_W - 6);
        ty = clamp(ty, 3, PITCH_H - 3);
      } else {
        // asisten wasit: sejajar bek kedua terakhir (atau bola kalau lebih dekat ke garis gawang)
        const right = o.role === 'ar1';
        const defSide = (this.dir(0) > 0) === right ? 1 : 0; // tim yang menjaga gawang di separuh ini
        const xs = this.onPitch[defSide].map((b) => b.x).sort((p, q) => (right ? q - p : p - q));
        const second = xs[1] ?? PITCH_W / 2;
        tx = right ? clamp(Math.max(second, bx), PITCH_W / 2, PITCH_W) : clamp(Math.min(second, bx), 0, PITCH_W / 2);
        ty = right ? -1.4 : PITCH_H + 1.4;
      }
      const dx = tx - o.x;
      const dy = ty - o.y;
      const d = Math.hypot(dx, dy);
      const want = d < 0.3 ? 0 : Math.min(o.role === 'ref' ? 8 : 7.5, d * 1.2 + 0.3);
      let ax = (d ? (dx / d) * want : 0) - o.vx;
      let ay = (d ? (dy / d) * want : 0) - o.vy;
      const al = Math.hypot(ax, ay);
      const lim = 6 * DT;
      if (al > lim) {
        ax *= lim / al;
        ay *= lim / al;
      }
      o.vx += ax;
      o.vy += ay;
      o.x += o.vx * DT;
      o.y += o.vy * DT;
    }
  }

  /** Jalankan sampai selesai (tanpa tampilan) */
  run(): EngineResult {
    while (!this.done) this.step();
    return this.result();
  }

  result(): EngineResult {
    const all = [...this.bodies, ...this.bench.filter((b) => !this.bodies.includes(b))];
    const ratings: Record<string, number> = {};
    const stats: Record<string, PStats> = {};
    for (const b of all) {
      if (b.st.on < 0) continue;
      stats[b.p.id] = b.st;
      ratings[b.p.id] = rate(b, this.score);
    }
    let motm = '';
    for (const id of Object.keys(ratings)) if (!motm || ratings[id] > ratings[motm]) motm = id;
    return {
      score: [...this.score] as [number, number],
      events: this.events.filter((e) => e.kind !== 'kickoff'),
      stats,
      ratings,
      motm,
      possession: possessionPct(this.possTime),
      shots: [...this.shots] as [number, number],
      onTarget: [...this.onTarget] as [number, number],
      corners: [...this.corners] as [number, number],
      added: [Math.max(0, this.added[0]), Math.max(0, this.added[1])],
      fouls: [...this.fouls] as [number, number],
      ...(this.etStart[0] > 0 ? { et: true } : {}),
      ...(this.so ? { pens: [...this.so.goals] as [number, number] } : {}),
    };
  }
}

/** Waktu menempuh jarak d dengan kecepatan awal u, percepatan acc, sampai kecepatan puncak vmax */
function runTime(d: number, u: number, vmax: number, acc: number): number {
  const dAcc = (vmax * vmax - u * u) / (2 * acc);
  return d <= dAcc ? (Math.sqrt(u * u + 2 * acc * d) - u) / acc : (vmax - u) / acc + (d - dAcc) / vmax;
}

function segDist(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const u = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(ax + u * dx - px, ay + u * dy - py);
}

/** Satu langkah fisika bola: gravitasi, pantulan, gesekan rumput */
function stepBall(x: number, y: number, z: number, vx: number, vy: number, vz: number): [number, number, number, number, number, number] {
  x += vx * DT;
  y += vy * DT;
  if (z > 0 || vz > 0) {
    z += vz * DT;
    vz -= G * DT;
    if (z <= 0) {
      z = 0;
      if (vz < -2) {
        // memantul: kehilangan banyak kecepatan di rumput
        vz = -vz * 0.4;
        vx *= 0.62;
        vy *= 0.62;
      } else vz = 0;
    }
  } else {
    const sp = Math.hypot(vx, vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - ROLL * DT);
      vx *= ns / sp;
      vy *= ns / sp;
    }
  }
  return [x, y, z, vx, vy, vz];
}

export interface EngineResult {
  score: [number, number];
  events: MatchEvent[];
  stats: Record<string, PStats>;
  ratings: Record<string, number>;
  motm: string;
  possession: [number, number];
  shots: [number, number];
  onTarget: [number, number];
  corners: [number, number];
  fouls: [number, number];
  /** menit tambahan babak 1 dan 2 */
  added?: [number, number];
  /** v20 laga gugur: dimainkan sampai perpanjangan waktu, dan skor adu penalti (kalau ada) */
  et?: boolean;
  pens?: [number, number];
}

/** Menit bermain dari statistik laga (jam pertandingan; laga lama memakai detik permainan) */
export function minutesPlayed(st: PStats): number {
  if (st.on < 0) return 0;
  if (st.onMin !== undefined || st.offMin !== undefined) return Math.max(0, (st.offMin ?? 90) - (st.onMin ?? 0));
  return Math.max(0, (((st.off ?? FULL) - st.on) / FULL) * 90);
}

export function possessionPct(t: [number, number]): [number, number] {
  const home = Math.round((t[0] / (t[0] + t[1] || 1)) * 100);
  return [home, 100 - home];
}

/** Rating pemain (juga dipakai untuk rating langsung selama laga di layar pertandingan) */
export function rate(b: Body, score: [number, number]): number {
  const s = b.st;
  const mins = minutesPlayed(s) / 90;
  const my = score[b.side];
  const their = score[1 - b.side];
  let r = 6.3;
  r += s.goals * 1.0 + s.assists * 0.7 + s.keyPasses * 0.15 + s.onTarget * 0.1 - (s.shots - s.onTarget) * 0.04;
  if (s.passes >= 4) r += (s.passesOk / s.passes - 0.75) * 1.6;
  r += s.tackles * 0.12 + s.interceptions * 0.1 + s.dribbles * 0.05 - s.lost * 0.06 - s.offsides * 0.05;
  r += my > their ? 0.3 : my < their ? -0.3 : 0;
  if (b.p.slot === 'GK') r += s.saves * 0.3 - s.conceded * 0.35 + (their === 0 ? 0.6 : 0);
  else if (isDef(b.p.slot)) r += (their === 0 ? 0.4 : 0) - their * 0.12;
  r -= s.yellow * 0.3 + s.fouls * 0.04;
  r = 6.5 + (r - 6.5) * (0.4 + 0.6 * Math.min(1, mins));
  r -= s.red * 2;
  return Math.round(clamp(r, 3, 10) * 10) / 10;
}

/** Jalankan pertandingan penuh tanpa tampilan */
export function playEngine(input: EngineInput): EngineResult {
  return new Match(input).run();
}
