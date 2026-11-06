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
import { shortName } from '../gen/names';

/** Naik setiap kali hasil mesin berubah untuk input yang sama (tayangan ulang lama tidak cocok lagi) */
export const ENGINE_VERSION = 6;

export const PITCH_W = 105;
export const PITCH_H = 68;
export const HALF = 150; // detik permainan per babak
export const FULL = HALF * 2;
export const DT = 0.1;
export const GOAL_HALF = 3.66;
export const BAR = 2.44;
export const NET_DEPTH = 1.8;
const G = 9.8;
const ROLL = 2.6; // perlambatan bola menggelinding di rumput (m/s²)
const BOX_X = 16.5;
const BOX_Y = 20.16;

/** Angka penyetel hasil laga (dikalibrasi lewat scripts/engine.ts) */
export const TUNE = {
  shotK: 9.5, shootW: 28, progW: 45, xgPassW: 4, foul: 0.55, dribZone: 0.15, lineGap: 15, runRate: 0.0025, runPass: 0.18,
  hold: 0.2, risk: 1.0, openShot: 0.35, cross: 0.3, tackle: 0.05, speed: 1.15, onT: 0.38,
  /** tembakan dari luar kotak lebih sulit masuk */
  longK: 0.75,
  /** sundulan lebih sulit masuk */
  headK: 0.45,
  /** tambahan peluang gol per meter kiper keluar dari posisi idealnya */
  gkOff: 0.12,
  /** peluang cedera per benturan (tekel, dilanggar) untuk pemain dengan risiko rata-rata */
  injury: 0.026,
  /** nilai dasar mencoba melewati lawan dengan dribel */
  takeOn: -0.15,
  /** nilai umpan aman yang menjaga penguasaan bola */
  keep: 0.4,
  /** bobot hukuman umpan ke belakang (di luar sepertiga akhir) */
  back: 0.25,
  /** jarak garis bek di belakang bola saat timnya menguasai bola */
  backLine: 27,
  /** keunggulan kandang (poin atribut mental & teknik) */
  home: 0.7,
  /** performa harian: simpangan tim & pemain (poin atribut) */
  formTeam: 0.3, formPlayer: 0.3,
  /** peluang kartu kuning per pelanggaran */
  card: 0.4,
};

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
}
const NEUTRAL_K: StyleK = { prog: 1, risk: 1, long: 0, cross: 0, drib: 0, hold: 1, line: 0, press: 1, shoot: 1 };
export const STYLE_K: Record<PlayingStyle, StyleK> = {
  Possession: { prog: 0.8, risk: 1.4, long: -0.1, cross: -0.04, drib: -0.03, hold: 1.4, line: -2, press: 1.05, shoot: 0.85 },
  Gegenpress: { prog: 1.05, risk: 1, long: -0.02, cross: 0, drib: 0, hold: 1, line: 0, press: 1.4, shoot: 1 },
  Counter: { prog: 1.4, risk: 0.9, long: 0.08, cross: 0, drib: 0.05, hold: 0.8, line: 2, press: 0.9, shoot: 1.1 },
  Direct: { prog: 1.3, risk: 0.8, long: 0.16, cross: 0.06, drib: -0.02, hold: 0.75, line: 0, press: 1, shoot: 1.1 },
  'Wing Play': { prog: 1.05, risk: 1, long: 0, cross: 0.16, drib: 0.04, hold: 1, line: 0, press: 1, shoot: 0.95 },
  Defensive: { prog: 1, risk: 1.2, long: 0.05, cross: 0, drib: -0.02, hold: 1, line: 2, press: 0.9, shoot: 1.05 },
};
const ALL_STYLES = Object.keys(STYLE_K) as PlayingStyle[];
/** atribut yang naik turun menurut performa harian & keunggulan kandang (fisik tidak) */
const FORM_KEYS = ['pas', 'vis', 'tec', 'dri', 'ft', 'fin', 'lon', 'cro', 'hea', 'tck', 'mar', 'cmp', 'dec', 'pos', 'ant', 'otb', 'tea', 'con', 'fla'] as const;
const GK_KEYS = ['gk', 'ref', 'han', 'ono', 'aer', 'cmd'] as const;

/** Gaya main tetap untuk tim nasional (dari kode negara) */
export function nationStyle(countryId: string): PlayingStyle {
  return new Rng(`style:${countryId}`).pick(ALL_STYLES);
}

export type Slot = 'GK' | 'RB' | 'RCB' | 'LCB' | 'LB' | 'RCM' | 'CM' | 'LCM' | 'RW' | 'ST' | 'LW';
export const SLOTS: Slot[] = ['GK', 'RB', 'RCB', 'LCB', 'LB', 'RCM', 'CM', 'LCM', 'RW', 'ST', 'LW'];
const NUM: Record<Slot, number> = { GK: 1, RB: 2, LB: 3, LCB: 4, RCB: 5, CM: 6, RW: 7, RCM: 8, ST: 9, LCM: 10, LW: 11 };
// posisi dasar dalam "bingkai tim": gawang sendiri di x = 0, menyerang ke x = 105
const BASE: Record<Slot, [number, number]> = {
  GK: [4, 34],
  RB: [26, 58],
  RCB: [19, 43],
  LCB: [19, 25],
  LB: [26, 10],
  RCM: [42, 47],
  CM: [36, 34],
  LCM: [42, 21],
  RW: [62, 59],
  ST: [66, 34],
  LW: [62, 9],
};
const DEF_SLOTS = new Set<Slot>(['RB', 'RCB', 'LCB', 'LB']);
/** pergantian pemain per tim per laga */
export const MAX_SUBS = 5;
const SLOT_GROUP: Record<Slot, string> = {
  GK: 'GK', RB: 'DEF', RCB: 'DEF', LCB: 'DEF', LB: 'DEF', RCM: 'MID', CM: 'MID', LCM: 'MID', RW: 'ATT', ST: 'ATT', LW: 'ATT',
};
const GROUP_SLOTS = { GK: ['GK'], DEF: ['RB', 'RCB', 'LCB', 'LB'], MID: ['RCM', 'CM', 'LCM'], ATT: ['RW', 'ST', 'LW'] } as const;
const PREF: Partial<Record<Position, Slot[]>> = {
  GK: ['GK'],
  DR: ['RB'], WBR: ['RB'], DL: ['LB'], WBL: ['LB'], DC: ['RCB', 'LCB'],
  DM: ['CM', 'RCM', 'LCM'], MC: ['RCM', 'LCM', 'CM'],
  MR: ['RW'], AMR: ['RW'], ML: ['LW'], AML: ['LW'], AMC: ['ST', 'RW', 'LW'], ST: ['ST'],
};
const GROUP_OF: Record<Position, keyof typeof GROUP_SLOTS> = {
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
  /** rata-rata atribut kiper (3 untuk pemain lapangan) */
  gk: number;
  ref: number; han: number; ono: number; aer: number; cmd: number; kic: number; rus: number;
}

export interface EP {
  id: string;
  name: string;
  num: number;
  slot: Slot;
  user?: boolean;
  a: EAttrs;
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
}

export interface EngineInput {
  seed: string;
  home: ETeam;
  away: ETeam;
  /** lapangan netral (turnamen): tanpa keunggulan kandang */
  neutral?: boolean;
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
    gk: keeper ? (g.Handling + g.Reflexes + g['One on Ones'] + g['Command of Area']) / 4 : 3,
    ref: keeper ? g.Reflexes : 3, han: keeper ? g.Handling : 3, ono: keeper ? g['One on Ones'] : 3,
    aer: keeper ? g['Aerial Reach'] : 3, cmd: keeper ? g['Command of Area'] : 3, kic: keeper ? g.Kicking : 3,
    rus: keeper ? g['Rushing Out (Tendency)'] : 3,
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
    con: d(a.con), agg: d(a.agg), fla: d(a.fla), bra: d(a.bra), inj: d(a.inj, 1), gk,
    ref: d(a.ref, gk), han: d(a.han, gk), ono: d(a.ono, gk), aer: d(a.aer, gk), cmd: d(a.cmd, gk), kic: d(a.kic, 10),
    rus: d(a.rus, 10),
  };
}

/** Susun 11 pemain (4-3-3) dari skuad. Pemain kita masuk kalau `userStarts`. */
export function pickXI(squad: Player[], user: Player | undefined, userStarts: boolean): { xi: EP[]; userSlot?: Slot; bench: EP[] } {
  const taken = new Set<Slot>();
  const xi: EP[] = [];
  const place = (p: Player, isUser = false): Slot | undefined => {
    const group = GROUP_OF[p.mainPosition];
    const options = [...(PREF[p.mainPosition] ?? []), ...GROUP_SLOTS[group]] as Slot[];
    const slot = options.find((s) => !taken.has(s));
    if (!slot) return undefined;
    taken.add(slot);
    xi.push({ id: p.id, name: shortName(p), num: NUM[slot], slot, user: isUser || undefined, a: engineAttrs(p) });
    return slot;
  };
  let userSlot: Slot | undefined;
  if (user && userStarts) userSlot = place(user, true);
  const others = squad.filter((p) => !p.isUser).sort((a, b) => b.ca - a.ca);
  for (const p of others) {
    if (xi.length >= 11) break;
    place(p);
  }
  // kalau ada slot kosong (skuad tidak lengkap), isi dengan siapa saja
  for (const s of SLOTS) {
    if (taken.has(s)) continue;
    const p = others.find((q) => !xi.some((e) => e.id === q.id));
    if (!p) break;
    taken.add(s);
    xi.push({ id: p.id, name: shortName(p), num: NUM[s], slot: s, a: engineAttrs(p) });
  }
  xi.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  // bangku cadangan: 1 kiper, 2 bek, 2 gelandang, 2 penyerang (yang terbaik dari sisa skuad)
  const bench: EP[] = [];
  const rest = others.filter((q) => !xi.some((e) => e.id === q.id));
  for (const [group, n] of [['GK', 1], ['DEF', 2], ['MID', 2], ['ATT', 2]] as const) {
    for (const p of rest.filter((q) => GROUP_OF[q.mainPosition] === group).slice(0, n)) {
      const slot = (PREF[p.mainPosition] ?? GROUP_SLOTS[group])[0] as Slot;
      bench.push({ id: p.id, name: shortName(p), num: 12 + bench.length, slot, a: engineAttrs(p) });
    }
  }
  return { xi, userSlot, bench };
}

/** Slot untuk pemain kita saat masuk dari bangku (sesuai posisinya) */
export function slotFor(p: Player): Slot {
  return (PREF[p.mainPosition] ?? GROUP_SLOTS[GROUP_OF[p.mainPosition]])[0] as Slot;
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
}

export type EventKind =
  | 'goal' | 'shot' | 'save' | 'miss' | 'block' | 'half' | 'full' | 'sub' | 'kickoff' | 'penalty' | 'corner'
  | 'freekick' | 'offside' | 'yellow' | 'red' | 'injury';
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
}

export interface Body {
  p: EP;
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
  dive: number; // kiper: sisa waktu terjun
  hurt: number; // detik permainan saat cedera (-1 = sehat); pemain cedera terkapar sampai diganti
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

/** Kecepatan puncak (m/s): ditentukan pace, turun saat lelah */
export const topSpeed = (pace: number) => (5.8 + pace * 0.18) * TUNE.speed;
const vmaxOf = (b: Body) => topSpeed(b.p.a.pace) * (0.8 + 0.2 * b.energy);
/**
 * Percepatan awal (m/s²): ditentukan acceleration (dan sedikit agility). Percepatan mengecil
 * saat mendekati kecepatan puncak, jadi pemain ber-acceleration tinggi unggul di beberapa meter
 * pertama, sedangkan pemain ber-pace tinggi menyusul di lari yang panjang.
 */
export const startAccel = (acc: number, agi: number) => (2.2 + acc * 0.4) * (1 + agi * 0.01);
const accOf = (b: Body) => startAccel(b.p.a.acc, b.p.a.agi);
/** Satu langkah lari lurus dari kecepatan v (untuk uji balap lari) */
export function sprintStep(v: number, acc: number, vmax: number): number {
  return Math.min(vmax, v + acc * (1 - 0.6 * Math.min(1, v / vmax)) * DT);
}

export class Match {
  readonly input: EngineInput;
  readonly rng: Rng;
  t = 0;
  half: 1 | 2 = 1;
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
  done = false;
  fouls: [number, number] = [0, 0];
  corners: [number, number] = [0, 0];
  /** gol dari bola mati (penalti, tendangan bebas, dan sepak pojok / umpan bola mati) */
  setPieceGoals = 0;
  /** pengali gaya main tiap tim */
  readonly k: [StyleK, StyleK];
  private kickoffAfter: 0 | 1 | null = null;
  private traj: { x: number; y: number; z: number }[] = [];
  /** serangan dari bola mati masih berlangsung sampai detik ini */
  private spUntil = -1;
  private spSide: 0 | 1 = 0;
  /** bola baru saja dibuang tim ini ke luar: rekan setim (termasuk kiper) tidak menjemputnya */
  private noTouch: { side: 0 | 1; until: number } | null = null;

  constructor(input: EngineInput) {
    this.input = input;
    this.rng = new Rng(`engine2:${input.seed}`);
    const teams = [input.home, input.away];
    this.k = [STYLE_K[input.home.style!] ?? NEUTRAL_K, STYLE_K[input.away.style!] ?? NEUTRAL_K];
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
        const d = tf + form.normal(0, TUNE.formPlayer);
        const a = b.p.a;
        for (const key of FORM_KEYS) a[key] = clamp(a[key] + d, 1, 21);
        if (b.p.slot === 'GK') for (const key of GK_KEYS) a[key] = clamp(a[key] + d, 1, 21);
      }
    });
    this.refresh();
    this.kickoff(0);
  }

  private makeBody(p: EP, side: 0 | 1, on: boolean): Body {
    const st: PStats = {
      passes: 0, passesOk: 0, keyPasses: 0, shots: 0, onTarget: 0, goals: 0, assists: 0, tackles: 0,
      interceptions: 0, dribbles: 0, lost: 0, saves: 0, conceded: 0, offsides: 0, longGoals: 0, setGoals: 0, headGoals: 0,
      fouls: 0, yellow: 0, red: 0, takeOns: 0, throughBalls: 0, injured: 0, on: on ? 0 : -1,
    };
    // salinan atribut: input tidak pernah diubah (aman untuk ditonton ulang)
    const ep: EP = { ...p, a: fullAttrs(p.a) };
    return {
      p: ep, side, x: 52.5, y: 34, vx: 0, vy: 0, tx: 52.5, ty: 34, on, st, cool: 0, run: 0,
      think: 0, ox: 0, oy: 0, lean: 0, sprint: false, energy: 1, dive: 0, hurt: -1,
    };
  }

  /** Arah serangan tim: +1 ke kanan, -1 ke kiri (tukar saat babak kedua) */
  dir(side: 0 | 1): 1 | -1 {
    return (side === 0) === (this.half === 1) ? 1 : -1;
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

  /** Posisi awal babak / setelah gol (pemain berdiri di separuh lapangan sendiri) */
  private kickoffSpot(b: Body): [number, number] {
    const [bx, by] = BASE[b.p.slot];
    let x = Math.min(bx * 0.72, 49);
    if (b.p.slot === 'ST' && this.restart?.kind === 'kickoff' && this.restart.side === b.side) x = 51.5;
    return [this.wx(b.side, x), this.wy(b.side, by)];
  }

  private kickoff(side: 0 | 1) {
    this.restart = { side, x: 52.5, y: 34, wait: 0.8, kind: 'kickoff' };
    for (const b of this.active()) {
      const [x, y] = this.kickoffSpot(b);
      b.x = b.tx = x;
      b.y = b.ty = y;
      b.vx = b.vy = 0;
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
    const e: MatchEvent = { t: this.t, min: minuteOf(this.t), kind, side, name, assist };
    if (og) e.og = true;
    this.events.push(e);
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
  private defLine(side: 0 | 1, inPoss: boolean): number {
    const bfx = this.fx(side, this.ball.x);
    const k = this.k[side];
    if (inPoss) return clamp(bfx - TUNE.backLine + k.line * 0.5, 14, 52 - k.line);
    let line = clamp(bfx - TUNE.lineGap - k.line, 7, 42 - k.line);
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
      const line = this.defLine(side, inPoss);
      const adv = clamp((bfx - 55) / 35, 0, 1);
      for (const b of team) {
        if (b.think > 0 || b === this.owner) continue;
        const a = b.p.a;
        b.think = 0.15 + (20 - a.ant) * 0.018 + this.rng.float(0, 0.12);
        // kesalahan posisi pribadi bergerak pelan
        b.ox = clamp(b.ox * 0.85 + this.rng.normal(0, 0.9), -3, 3);
        b.oy = clamp(b.oy * 0.85 + this.rng.normal(0, 0.9), -3, 3);
        if (this.rng.chance(0.05)) b.lean = this.rng.normal(0, 1) * (22 - (a.otb + a.ant + a.dec) / 3) * 0.07;
        const slot = b.p.slot;
        const [bx, by] = BASE[slot];
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
          const isDef = DEF_SLOTS.has(slot);
          const wing = slot === 'RW' || slot === 'LW';
          if (isDef) {
            const fb = slot === 'RB' || slot === 'LB';
            x = fb ? clamp(bfx - 12 + 12 * adv, 16, 75) : line;
            y = 34 + (by - 34) * (fb ? 1.15 : 1.25) + (bfy - 34) * 0.12;
          } else {
            const shift = (bfx - 45) * (slot === 'RCM' || slot === 'LCM' ? 0.75 : 0.6);
            x = bx + shift + 7;
            y = 34 + (by - 34) * 1.1 + (bfy - 34) * 0.12;
            if (wing) {
              // sayap sisi jauh menyerang tiang jauh, sayap sisi bola memberi lebar
              const far = (by - 34) * (bfy - 34) < 0;
              y += (34 - y) * (far ? 0.75 : 0.35) * adv;
              x += (far ? 10 : 5) * adv;
            } else if (slot === 'CM') x += 6 * adv;
            else if (slot.endsWith('CM')) {
              x = Math.max(x + 13 * adv, bfx - 14 + 10 * adv);
              y += (34 - y) * 0.35 * adv;
            } else if (slot === 'ST' && b.run <= 0) x = Math.min(x, bfx + 12);
            if (b.run > 0) {
              x = Math.min(100, oppLine + 5);
              y = clamp(y + (34 - y) * (wing ? 0.55 : 0.35), 6, 62);
              sprint = true;
            } else {
              // berdiri tepat di garis offside: pemain cerdas tidak terjebak
              x = Math.min(x, oppLine - 0.9 + b.lean);
              // mencari ruang: menjauh dari penjaga terdekat
              const [mk, md] = this.nearest(opps, b.x, b.y);
              if (mk && md < 4) {
                const away = this.fy(side, b.y) - this.fy(side, mk.y);
                y += Math.sign(away || 1) * (a.otb / 20) * 2.5;
              }
            }
          }
          const err = (21 - (a.otb + a.tea) / 2) / 20;
          x += b.ox * err;
          y += b.oy * err;
          // umpan silang sedang melayang: penyerang menyerbu kotak
          const cr = this.pass;
          if (cr?.cross && cr.from.side === side && cr.from !== b && !isDef && cr.to !== b) {
            x = Math.max(x, slot === 'ST' ? 95 : wing ? 93 : 89);
            y = 34 + (y - 34) * 0.45;
            sprint = true;
          }
        } else {
          // bertahan: tiga lini bergeser bersama
          const isDef = DEF_SLOTS.has(slot);
          const mid = slot.endsWith('CM');
          if (isDef) {
            const fb = slot === 'RB' || slot === 'LB';
            x = line + (fb ? 1 : 0);
            y = 34 + (by - 34) * (fb ? 0.78 : 0.62) + (bfy - 34) * 0.32;
          } else if (mid) {
            x = line + (slot === 'CM' ? 9 : 12);
            y = 34 + (by - 34) * 0.72 + (bfy - 34) * 0.4;
          } else {
            x = Math.min(line + (slot === 'ST' ? 30 : 24), 64);
            y = 34 + (by - 34) * 0.78 + (bfy - 34) * 0.3;
          }
          // disiplin posisi: positioning & konsentrasi rendah = sering tidak sejajar
          const err = (21 - (a.pos + a.con) / 2) / 20;
          x += b.ox * err * (isDef ? 0.8 : 1);
          y += b.oy * err;
          if (isDef) {
            const m = this.markAdjust(b, side, line, x, y);
            x = m[0];
            y = m[1];
            sprint = m[2];
          }
          if (slot === 'CM') {
            const runner = opps.find((o) => o.run > 0 && o.p.slot.endsWith('CM'));
            if (runner) {
              x = this.fx(side, runner.x) - 2;
              y = this.fy(side, runner.y);
              sprint = true;
            }
          }
        }
        b.tx = this.wx(side, clamp(x, 1, PITCH_W - 1));
        b.ty = this.wy(side, clamp(y, 1, PITCH_H - 1));
        b.sprint = sprint;
      }
    }
    if (live) this.activeRoles();
    this.setPieceShape();
  }

  /** Bek: geser ke lawan terdekat di sisinya, kejar lari lawan ke belakang garis (bingkai tim) */
  private markAdjust(b: Body, side: 0 | 1, line: number, x: number, y: number): [number, number, boolean] {
    const a = b.p.a;
    let bestD = 13;
    let att: Body | null = null;
    for (const o of this.opponents(side)) {
      if (o.p.slot === 'GK') continue;
      const ox = this.fx(side, o.x);
      const dy = Math.abs(this.fy(side, o.y) - y);
      if (ox < line + 4 && dy < bestD) {
        bestD = dy;
        att = o;
      }
    }
    if (!att) return [x, y, false];
    const ox = this.fx(side, att.x);
    const oy = this.fy(side, att.y);
    const ny = y + (oy - y) * (0.25 + a.mar * 0.025);
    // lawan sudah lolos ke belakang garis: kejar dan tetap di sisi gawang
    if (ox < line - 1) return [Math.max(1, ox - 1.5), ny, true];
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
    if (dist > 45) depth = clamp(line - 14, depth, 6 + b.p.a.rus * 0.4);
    return [(bfx / dist) * depth, 34 + ((bfy - 34) / dist) * depth];
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
      for (const b of team) {
        if (b.p.slot === 'GK') continue;
        const tt = Math.hypot(b.x - owner.x, b.y - owner.y) / vmaxOf(b) - b.p.a.wor * 0.03;
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
      const deep = this.fx(def, owner.x) > 50 + 50 * k.press;
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
      const keen = second ? k.press > 1.3 || second.p.a.wor + second.p.a.tea > 22 / k.press : false;
      if (second && !deep && keen && !DEF_SLOTS.has(second.p.slot)) {
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
        gk.ty = clamp(b.y + b.vy * tt, 30, 38);
        gk.sprint = true;
      }
      return;
    }
    // bola lepas atau umpan di udara
    this.predict();
    const pass = this.pass;
    for (const side of [0, 1] as const) {
      let best: Body | null = null;
      let bt = Infinity;
      let bp: [number, number, number] = [0, 0, 0];
      for (const b of this.mates(side)) {
        const hands = b.p.slot === 'GK';
        if (hands && !this.inBox(side, this.traj[Math.min(10, this.traj.length - 1)].x, this.traj[Math.min(10, this.traj.length - 1)].y)) continue;
        if (pass && b === pass.from && pass.from.side === side) continue;
        const r = this.reachPoint(b, hands);
        // penerima umpan selalu menjemput bola
        const tt = pass && b === pass.to ? r[2] - 0.5 : r[2];
        if (tt < bt) {
          bt = tt;
          best = b;
          bp = r;
        }
      }
      if (best) {
        best.tx = bp[0];
        best.ty = bp[1];
        best.sprint = true;
        best.think = Math.max(best.think, 0.1);
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
        b.sprint = false;
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
    const spots: [Slot, number, number][] = corner
      ? [['RCB', 95, 34 + near * 2], ['LCB', 94.5, 34 - near * 4], ['ST', 97.5, 34 + near * 4.5], ['CM', 92, 34 - near * 1], ['LW', 96.5, 34 - near * 7.5], ['RW', 88, 34 + near * 6]]
      : [['RCB', 91, 34 + near * 2], ['LCB', 90.5, 34 - near * 4], ['ST', 92, 34 + near * 5], ['CM', 88, 34 - near * 1], ['LW', 91, 34 - near * 8], ['RW', 85, 34 + near * 8]];
    const taker = this.restartTaker();
    const up: Body[] = [];
    for (const [slot, x, y] of spots) {
      const b = this.mates(att).find((q) => q.p.slot === slot);
      if (!b || b === taker) continue;
      b.tx = this.wx(att, x);
      b.ty = this.wy(att, y);
      b.sprint = Math.hypot(b.x - b.tx, b.y - b.ty) > 5;
      up.push(b);
    }
    // bertahan: tiga pemain menjaga zona, sisanya menempel penyerang di sisi gawang
    const defs = this.mates(def).filter((b) => b.p.slot !== 'GK');
    const zone: [Slot, number, number][] = corner
      ? [['CM', 5.5, 34 + near * 2.5], ['RCM', 6, 34 - near * 1.5], ['LCM', 4.5, 34 + near * 6]]
      : [['CM', 13, 34], ['RCM', 13, 34 - near * 6], ['LCM', 13, 34 + near * 6]];
    const used = new Set<Body>();
    for (const [slot, x, y] of zone) {
      const b = defs.find((q) => q.p.slot === slot);
      if (!b) continue;
      b.tx = this.wx(def, x);
      b.ty = this.wy(def, y);
      b.sprint = Math.hypot(b.x - b.tx, b.y - b.ty) > 6;
      used.add(b);
    }
    const markers = defs.filter((b) => !used.has(b) && !['RW', 'LW'].includes(b.p.slot) && (b.p.slot !== 'ST' || corner));
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
    if (sp > vmax * 0.7) b.energy = Math.max(0.2, b.energy - DT * 0.004 * (1.6 - a.sta / 20) * (0.4 + 0.6 * this.k[b.side].press));
    else b.energy = Math.min(1, b.energy + DT * 0.0012 * (a.sta / 20));
  }

  // --- aksi pemain yang menguasai bola -------------------------------------------

  private gain(b: Body) {
    this.owner = b;
    this.lastTouch = b;
    this.poss = b.side;
    this.pass = null;
    // tanpa tekanan pemain mengontrol dulu dan mengangkat kepala; pengambil keputusan bagus lebih cepat
    const [, pd] = this.nearest(this.opponents(b.side), b.x, b.y);
    b.cool = pd < 3 ? 0.2 : (TUNE.hold + (20 - b.p.a.dec) * 0.02) * this.k[b.side].hold;
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
    const [, pd] = this.nearest(opps, c.x, c.y);
    const pressure = pd < 2 ? 1 : pd < 4 ? 0.5 : 0;
    const noise = () => this.rng.normal(0, 0.04 + (20 - a.dec) * 0.012);
    const keeper = c.p.slot === 'GK';
    const oppLine = this.offsideLine(side);
    const k = this.k[side];
    const options: [number, () => void][] = [];

    // tembak
    const distGoal = Math.hypot(PITCH_W - fx, 34 - fy);
    if (distGoal < 35 && !keeper) {
      const xg = this.xgAt(fx, fy);
      const skill = distGoal < 18 ? a.fin : a.lon;
      const v =
        xg * (0.6 + skill * 0.035) * (1 - pressure * 0.3) * TUNE.shootW * k.shoot -
        (distGoal > 22 ? 0.14 - a.lon * 0.009 : 0) +
        (distGoal < 20 ? 0.12 : 0) +
        (pd > 3 && distGoal < 26 ? TUNE.openShot : 0);
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
      let risk = 0;
      for (const o of opps) {
        const ld = this.laneDist(c.x, c.y, m.x, m.y, o.x, o.y);
        const lane = 2.2 + o.p.a.ant * 0.05;
        if (ld < lane) risk += (lane - ld) / lane;
      }
      const wide = fx > 72 && Math.abs(fy - 34) > 12;
      const inBox = mfx > 87 && Math.abs(mfy - 34) < 18;
      // penyerang di depan kotak bisa dicari dengan umpan silang ke ruang di depannya
      const runner = mfx > 76 && Math.abs(mfy - 34) < 17 && !DEF_SLOTS.has(m.p.slot) && m.p.slot !== 'GK';
      const cross = wide && (inBox || runner);
      const air = cross || d > 30 || (risk > 0.8 && d > 18 && (a.pas + a.tec) / 2 > 11);
      // di sepertiga akhir, umpan ke belakang tidak terlalu dihukum: yang penting peluang si penerima
      // umpan ke belakang tidak terlalu dihukum (menjaga bola, mencari jalan lain), umpan maju ada batasnya
      const prog = progress < 0 ? progress * (fx > 70 ? 0.6 : TUNE.back) : Math.min(progress, 28);
      // pengumpan kreatif (vision, flair) lebih berani dan lebih mencari rekan di posisi berbahaya
      const daring = 1.25 - a.vis * 0.0125 - a.fla * 0.0075;
      const danger = 0.6 + a.vis * 0.03;
      let v =
        0.22 +
        (prog / TUNE.progW) * k.prog +
        Math.min(open, 8) * 0.03 -
        risk * (cross ? 0.2 : air ? 0.3 : TUNE.risk) * (fx > 70 ? 0.6 : 1) * k.risk * daring -
        (d > 30 ? 0.12 : 0) +
        (air ? k.long : 0) +
        this.xgAt(mfx, mfy) * TUNE.xgPassW * clamp(open / 4, 0.3, 1.2) * danger +
        (m.run > 0 ? TUNE.runPass : 0) +
        // umpan aman ke rekan yang bebas menjaga penguasaan bola (membangun serangan)
        (risk < 0.25 && open > 5 && !air ? TUNE.keep * (fx < 55 ? 1 : 0.3) : 0) +
        // rekan yang pandai mengatur permainan lebih sering dicari
        (m.p.a.vis + m.p.a.pas - 20) * 0.006;
      if (m.p.slot === 'GK') v -= 0.5;
      if (cross) {
        const [lx, ly] = this.crossSpot(mfx, mfy);
        v += TUNE.cross + k.cross + (a.cro - 10) * 0.02 + (m.p.a.hea - 10) * 0.015 + this.xgAt(lx, ly) * 0.8;
      }
      if (pressure > 0 && fx > 75 && open > 5 && mfx > 65) v += 0.15 * pressure * 2;
      if (fx > 92 && Math.abs(fy - 34) > 9 && mfx > 78 && mfx < 96 && Math.abs(mfy - 34) < 13 && progress < 0) v += 0.3;
      // kiper: umpan pendek ke bek kalau aman, selain itu tendang jauh
      if (keeper) v += DEF_SLOTS.has(m.p.slot) && open > 8 ? 0.3 : d > 35 ? (a.kic - 10) * 0.02 : 0;
      // rekan berdiri offside: pengumpan dengan visi & keputusan bagus tidak memberi bola
      if (this.isOffside(m, oppLine, fx) && m.run <= 0 && this.rng.chance(0.45 + (a.vis + a.dec) * 0.0125)) v -= 1;
      options.push([v + noise(), () => this.passTo(c, m, air, false, 0, cross)]);

      // umpan terobosan (killer ball) ke ruang di belakang garis pertahanan untuk rekan yang berlari
      const runs = m.run > 0 || mfx > oppLine - 5;
      if (keeper || fx < 30 || DEF_SLOTS.has(m.p.slot) || m.p.slot === 'GK' || !runs || oppLine > 95) continue;
      if (this.isOffside(m, oppLine, fx)) continue;
      // pengumpan bervisi tinggi jauh lebih sering melihat celahnya
      if (!this.rng.chance(clamp(0.06 + (a.vis - 6) * 0.05, 0.03, 0.8))) continue;
      const tfx = clamp(Math.max(oppLine + 5 + a.vis * 0.25, mfx + 4), 0, 99);
      const tfy = clamp(mfy + (34 - mfy) * 0.25, 5, 63);
      const tx = this.wx(side, tfx);
      const ty = this.wy(side, tfy);
      if (Math.hypot(tx - c.x, ty - c.y) > 45) continue;
      let trisk = 0;
      for (const o of opps) {
        if (o.p.slot === 'GK') continue;
        const ld = this.laneDist(c.x, c.y, tx, ty, o.x, o.y);
        const lane = 2 + o.p.a.ant * 0.05;
        if (ld < lane) trisk += (lane - ld) / lane;
      }
      // kiper lawan lebih dulu sampai di bola: bukan peluang
      const ogk = this.keeper((1 - side) as 0 | 1);
      const late = ogk ? Math.hypot(ogk.x - tx, ogk.y - ty) < Math.hypot(m.x - tx, m.y - ty) * 0.9 : false;
      const chip = trisk > 0.6 && (a.pas + a.tec) / 2 > 13;
      const tv =
        0.15 + (a.vis - 10) * 0.035 + (a.pas - 10) * 0.02 + (a.dec - 10) * 0.01 + (a.fla - 10) * 0.01 +
        this.xgAt(tfx, tfy) * TUNE.xgPassW * 0.9 + (m.run > 0 ? 0.1 : 0) + (k.prog - 1) * 0.2 -
        (chip ? 0.25 : trisk * 0.45) - (late ? 0.5 : 0);
      options.push([tv + noise(), () => this.passTo(c, m, chip, false, chip ? 0.3 : 0, false, [tfx, tfy])]);
    }

    // buang bola dari kotak sendiri saat ditekan
    if (fx < 20 && pressure > 0 && !keeper) {
      const v = 0.2 + pressure * 0.45 - (a.tec + a.cmp) / 80;
      options.push([v + noise(), () => this.clear(c)]);
    }

    // dribel / membawa bola: dribbling, flair, dan technique membuat pemain lebih suka membawa bola
    if (!keeper) {
      let space = 12;
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
      const flair = (a.dri - 10) * 0.02 + (a.fla - 10) * 0.012 + (a.tec - 10) * 0.006;
      // di sayap dekat garis gawang tidak ada ruang lagi: saatnya mengumpan silang
      const corner = fx > 84 && Math.abs(fy - 34) > 14 ? 0.12 : 0;
      const v =
        0.12 + k.drib + space / 22 + flair - pressure * 0.18 + (fx > 70 ? 0.06 : 0) - (distGoal < 28 ? TUNE.dribZone : 0) - corner;
      options.push([v + noise(), () => this.dribble(c, space)]);
      // melewati lawan yang menghadang (take-on): winger dengan dribbling, flair, bravery, technique
      if (front && space < 6 && fx > 30) {
        const o = front;
        const tv =
          TUNE.takeOn + k.drib + (a.dri - 10) * 0.035 + (a.fla - 10) * 0.03 + (a.bra - 10) * 0.012 + (a.tec - 10) * 0.01 +
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
    } else if (intoBox) {
      // umpan silang bisa diblok bek yang menempel: bola sering keluar garis gawang
      const [o, od] = this.nearest(this.opponents(side), c.x, c.y);
      if (o && od < 2.2 && o.p.slot !== 'GK' && this.rng.chance(0.2 + o.p.a.pos * 0.01)) {
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
    const err = ((21 - (a.pas + a.tec) / 2) * 0.006 + (pd < 2 ? 0.03 : 0)) * (air ? 1.25 : 1);
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

  private dribble(c: Body, space: number) {
    const side = c.side;
    const fx = this.fx(side, c.x);
    const fy = this.fy(side, c.y);
    const cutIn = (c.p.slot === 'RW' || c.p.slot === 'LW') && fx > 62 ? 0.15 + c.p.a.dri * 0.012 : 0.25;
    let ty = fy + (34 - fy) * cutIn + this.rng.normal(0, 3);
    // menghindari lawan terdekat
    const [o, od] = this.nearest(this.opponents(side), c.x, c.y);
    if (o && od < 5) ty += Math.sign(fy - this.fy(side, o.y) || 1) * 3;
    c.tx = this.wx(side, Math.min(PITCH_W - 2, fx + 9));
    c.ty = this.wy(side, clamp(ty, 2, 66));
    // bawa bola cepat kalau ada ruang
    c.sprint = space > 6;
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

  private shoot(c: Body, xg: number, pressure: number, header = false, setPiece = false) {
    const side = c.side;
    const a = c.p.a;
    const opps = this.opponents(side);
    const gk = this.keeper((1 - side) as 0 | 1);
    c.st.shots++;
    this.shots[side]++;
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
    let p = xg * (0.7 + skill * 0.025) * (0.9 + a.cmp * 0.008) * (1 - pressure * 0.25);
    p *= 1.3 - gkSkill * 0.03;
    // kiper yang salah posisi (jauh dari titik idealnya) lebih mudah dibobol
    if (gk) {
      const [ix, iy] = this.gkSpot(gk, 0);
      const off = Math.hypot(this.fx(gk.side, gk.x) - ix, this.fy(gk.side, gk.y) - iy);
      p *= 1 + clamp(off - 0.6, 0, 4) * TUNE.gkOff;
    }
    p *= header ? TUNE.headK : 1;
    if (!header && !setPiece && dist > 18) p *= TUNE.longK;
    p = clamp(p * TUNE.shotK, 0.004, 0.8);
    const onTarget = clamp(Math.max(p + 0.12, TUNE.onT + skill * 0.017 - dist * 0.004 - pressure * 0.08), 0, 0.95);
    const r = this.rng.next();
    const outcome: Shot['outcome'] = blocker ? 'miss' : r < p ? 'goal' : r < onTarget ? 'save' : 'miss';

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
    this.shot = { by: c, outcome, assist, blocker, gkX, passed: false, kind, sp };
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
      gk.think = outcome === 'save' ? 0 : 0.35;
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
        if (this.rng.chance(0.5)) {
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
    if (this.rng.chance(0.68)) {
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
      // ditepis ke depan: bola muntah
      ball.vx = away * this.rng.float(4, 9);
      ball.vy = this.rng.normal(0, 6);
      ball.vz = this.rng.float(0.5, 3);
    }
  }

  private goal(side: 0 | 1) {
    const s = this.shot;
    const ball = this.ball;
    const opp = (1 - side) as 0 | 1;
    const gk = this.keeper(opp);
    this.score[side]++;
    if (gk) gk.st.conceded++;
    if (s?.sp && s.by.side === side) this.setPieceGoals++;
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
    this.pause = 3;
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
      const reach = hands ? 1.5 + b.p.a.aer * 0.02 : 1.0 + b.p.a.agi * 0.01;
      const zMax = hands ? 2.4 + b.p.a.aer * 0.03 : 1.3 + (b.p.a.hea + b.p.a.jmp) * 0.025;
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
    // duel udara: lawan di dekatnya ikut melompat, yang lebih kuat di udara menang
    let duel = false;
    if (ball.z > 1.3 && best.p.slot !== 'GK') {
      const aerial = (b: Body) => b.p.a.hea + b.p.a.jmp * 0.7 + b.p.a.str * 0.3 + b.p.a.bra * 0.25;
      for (const o of this.opponents(best.side)) {
        if (o.p.slot === 'GK' || o.cool > 0.5 || o.side === nt) continue;
        if (segDist(px, py, ball.x, ball.y, o.x, o.y) > 1.9) continue;
        if (ball.z > 1.3 + (o.p.a.hea + o.p.a.jmp) * 0.025) continue;
        // pembela menghadap bola: sedikit lebih unggul
        const defBonus = pass && o.side !== pass.from.side ? 0.08 : pass && best.side !== pass.from.side ? -0.08 : 0;
        if (this.rng.chance(clamp(0.5 + (aerial(o) - aerial(best)) * 0.025 + defBonus, 0.15, 0.85))) {
          best = o;
          duel = true;
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
        if (!hands && intoBox && bfx < (high ? 18 : 12) && this.rng.chance(high ? 0.55 : 0.5)) this.behind(best, high);
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
        if (fx < 12 && Math.abs(this.fy(side, best.y) - 34) < 22 && this.rng.chance(0.35)) this.behind(best, true);
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
    const wait = k === 'throw' ? 0.3 : k === 'penalty' ? 2 : k === 'corner' || cross ? 1.2 : 0.8;
    this.restart = { side, x, y, wait, kind: k, direct, cross };
    if (k === 'corner') this.corners[side]++;
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
    if (r.kind === 'kickoff') return team.find((b) => b.p.slot === 'ST') ?? team[team.length - 1];
    const crosser = (list: Body[]) => this.best(list, (a) => a.cro * 2 + a.fk) ?? this.best(team, (a) => a.cro);
    if (r.kind === 'corner') return crosser(team.filter((b) => ['RW', 'LW', 'RCM', 'LCM', 'RB', 'LB'].includes(b.p.slot)));
    if (r.kind === 'penalty') return this.best(team, (a) => a.pen * 2 + a.cmp);
    if (restart?.direct) return this.best(team, (a) => a.fk * 2 + a.lon);
    if (restart?.cross) return crosser(team.filter((b) => !['RCB', 'LCB', 'ST', 'CM'].includes(b.p.slot)));
    return this.nearest(team.filter((b) => b.p.slot !== 'GK'), r.x, r.y)[0];
  }

  private doRestart() {
    const r = this.restart!;
    const team = this.mates(r.side);
    const taker = this.restartTaker();
    if (!taker) return;
    // pengambil berdiri sedikit di belakang bola
    const back = r.kind === 'throw' ? 0 : 0.6;
    const gxOwn = this.wx(r.side, 0);
    const dd = Math.hypot(r.x - gxOwn, r.y - 34) || 1;
    taker.tx = r.x + ((gxOwn - r.x) / dd) * back;
    taker.ty = r.y + ((34 - r.y) / dd) * back;
    taker.sprint = Math.hypot(taker.x - r.x, taker.y - r.y) > 3;
    taker.think = 0.3;
    r.wait -= DT;
    const d = Math.hypot(taker.x - taker.tx, taker.y - taker.ty);
    if (r.wait > 0 || (d > 1 && r.wait > -3)) return;
    if ((r.kind === 'corner' || r.cross) && r.wait > -4) {
      // tunggu bek tengah naik ke kotak
      for (const cb of team) if ((cb.p.slot === 'RCB' || cb.p.slot === 'LCB') && Math.hypot(cb.x - cb.tx, cb.y - cb.ty) > 3) return;
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
      const mate = team.filter((b) => b !== taker && b.p.slot.endsWith('CM')).sort((p, q) => Math.hypot(p.x - 52.5, p.y - 34) - Math.hypot(q.x - 52.5, q.y - 34))[0];
      if (mate) this.passTo(taker, mate, false, true);
      else this.gain(taker);
    } else if (r.kind === 'penalty') {
      this.gain(taker);
      this.shoot(taker, 0.76, 0, false, true);
    } else if (r.direct) {
      this.gain(taker);
      this.shoot(taker, 0.06 + (taker.p.a.fk - 10) * 0.004, 0, false, true);
    } else if (r.kind === 'corner' || r.cross) {
      // umpan silang ke kotak: pemain dengan sundulan dan fisik bagus paling sering dicari
      this.spUntil = this.t + 6;
      this.spSide = r.side;
      const box = team.filter((b) => b !== taker && b.p.slot !== 'GK' && this.fx(r.side, b.x) > 84);
      let total = 0;
      const w = box.map((b) => {
        const v = (b.p.a.hea + b.p.a.jmp / 2 + b.p.a.str / 2) ** 2;
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
      if (d.cool > 0 || d.p.slot === 'GK') continue;
      const dist = Math.hypot(d.x - c.x, d.y - c.y);
      if (dist > 1.5) continue;
      const da = d.p.a;
      const ca = c.p.a;
      d.cool = 0.7;
      const p = TUNE.tackle + (da.tck + da.ant) / 140 - (ca.dri + ca.agi * 0.5 + ca.str * 0.5) / 260 + (da.agg - 10) * 0.004;
      if (this.rng.chance(clamp(p, 0.04, 0.45))) {
        d.st.tackles++;
        c.st.lost++;
        c.cool = 0.8;
        if (this.rng.chance(0.45 + da.tec * 0.01)) this.gain(d);
        else this.deflect(d, 6);
        this.knock(c, 1);
        return;
      }
      // pemain yang sudah kena kartu kuning lebih berhati-hati
      const foul = TUNE.foul * (0.6 + da.agg / 25) * (1.3 - da.tck / 40) * (d.st.yellow ? 0.6 : 1);
      if (this.rng.chance(foul)) {
        this.foul(d, c);
        // pelanggaran keras (agresif) lebih sering mencederai
        this.knock(c, 2 + (da.agg - 10) * 0.1);
        return;
      }
      // dilewati: pembela butuh waktu untuk berbalik
      c.st.dribbles += dist < 1.2 ? 1 : 0;
      d.cool = 1.0 + (20 - da.agi) * 0.03;
    }
  }

  /** Pelanggaran: tendangan bebas / penalti, dan mungkin kartu */
  private foul(d: Body, c: Body) {
    d.st.fouls++;
    this.fouls[d.side]++;
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
    else if (this.rng.chance(0.0015 + Math.max(0, a.agg - 12) * 0.001)) card = 'red';
    else if (this.rng.chance((TUNE.card * (0.6 + a.agg / 25) * (1.25 - a.cmp / 40) + (clear ? 0.45 : fx > 60 && c.run > 0 ? 0.2 : 0)) * (d.st.yellow ? 0.6 : 1))) {
      card = 'yellow';
    }
    this.toDead('free', att, c.x, c.y, card ? 1.6 : 0.8);
    if (card) this.book(d, card);
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
    if (this.subs[out.side] >= MAX_SUBS) return undefined;
    const pool = this.reserves.filter((r) => r.side === out.side && r.st.on < 0);
    const group = SLOT_GROUP[out.p.slot];
    const same = pool.find((r) => SLOT_GROUP[r.p.slot] === group);
    if (out.p.slot === 'GK') return same;
    return same ?? pool.find((r) => r.p.slot !== 'GK');
  }

  /** Pemain cedera diganti saat bola mati (atau setelah beberapa detik kalau bola terus hidup) */
  private replaceHurt() {
    for (const out of [...this.bodies]) {
      if (!out.on || out.hurt < 0) continue;
      if (!this.dead && !this.restart && this.t - out.hurt < 8) continue;
      out.on = false;
      out.st.off = this.t;
      const sub = this.reserveFor(out);
      if (sub) {
        sub.on = true;
        sub.st.on = this.t;
        // masuk dari pinggir lapangan
        sub.x = clamp(out.x, 35, 70);
        sub.y = out.y < PITCH_H / 2 ? -1 : PITCH_H + 1;
        sub.p = { ...sub.p, slot: out.p.slot };
        this.bodies.push(sub);
        this.subs[out.side]++;
        this.log('sub', out.side, sub.p.name, out.p.name);
      }
      this.refresh();
    }
  }

  private book(b: Body, card: 'yellow' | 'red') {
    if (card === 'yellow') {
      b.st.yellow++;
      if (b.st.yellow < 2) {
        this.log('yellow', b.side, b.p.name);
        return;
      }
    }
    // kartu merah (langsung atau kuning kedua): keluar lapangan, tim main dengan 10 orang
    b.st.red++;
    const e: MatchEvent = { t: this.t, min: minuteOf(this.t), kind: 'red', side: b.side, name: b.p.name };
    if (card === 'yellow') e.second = true;
    this.events.push(e);
    b.on = false;
    b.st.off = this.t;
    if (this.owner === b) this.owner = null;
    this.refresh();
  }

  // --- langkah simulasi --------------------------------------------------------------

  step() {
    if (this.done) return;
    if (this.pause > 0) {
      // selebrasi gol: bola masuk jaring, pemain kembali ke posisi
      this.pause -= DT;
      this.ballPhysics(false);
      for (const b of this.active()) {
        const [x, y] = this.kickoffSpot(b);
        b.tx = x;
        b.ty = y;
        b.sprint = false;
        this.move(b);
      }
      if (this.pause <= 0 && this.kickoffAfter !== null) {
        this.kickoff(this.kickoffAfter);
        this.kickoffAfter = null;
      }
      return;
    }
    this.t += DT;
    this.possTime[this.poss] += DT;

    // pergantian pemain kita
    for (const sub of this.bench) {
      const team = sub.side === 0 ? this.input.home : this.input.away;
      if (sub.on || !team.sub || this.t < team.sub.at) continue;
      const out =
        this.bodies.find((b) => b.on && b.side === sub.side && b.p.slot === team.sub!.slot) ??
        // pemain di slot itu dikartu merah: pelatih menarik pemain lain
        this.bodies.find((b) => b.on && b.side === sub.side && b.p.slot !== 'GK' && SLOT_GROUP[b.p.slot] === SLOT_GROUP[team.sub!.slot]);
      if (!out) continue;
      out.on = false;
      out.st.off = this.t;
      sub.on = true;
      sub.st.on = this.t;
      sub.x = out.x;
      sub.y = out.y;
      sub.p = { ...sub.p, slot: out.p.slot, num: out.p.num };
      this.bodies.push(sub);
      if (this.owner === out) this.owner = sub;
      if (this.lastTouch === out) this.lastTouch = sub;
      this.subs[sub.side]++;
      this.refresh();
      this.log('sub', sub.side, sub.p.name, out.p.name);
    }
    this.replaceHurt();

    if (this.t >= HALF && this.half === 1) {
      this.half = 2;
      this.log('half', 0);
      this.kickoff(1);
      return;
    }
    if (this.t >= FULL) {
      this.done = true;
      this.log('full', 0);
      return;
    }

    for (const b of this.active()) {
      b.cool = Math.max(0, b.cool - DT);
      b.think -= DT;
      if (b.dive > 0) b.dive -= DT;
      if (b.run > 0) b.run -= DT;
      else if (this.poss === b.side && this.owner && b.p.slot !== 'GK' && b !== this.owner && this.rng.chance(b.p.a.otb * TUNE.runRate)) {
        const mid = b.p.slot.endsWith('CM');
        const fwd = b.p.slot === 'ST' || b.p.slot === 'RW' || b.p.slot === 'LW';
        const bfx = this.fx(b.side, this.ball.x);
        // pemain cerdas mulai lari saat masih onside
        const onside = this.fx(b.side, b.x) < this.offsideLine(b.side) || this.rng.chance(0.25 - b.p.a.dec * 0.01);
        if (onside) {
          if (fwd) b.run = b.p.slot === 'ST' ? 2.5 : 3.2;
          else if (mid && bfx > 55 && b.p.slot !== 'CM') b.run = 4.5;
          if (b.run > 0) b.think = 0;
        }
      }
    }

    const live = !this.restart && !this.dead;
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

    for (const b of this.active()) this.move(b);

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
      fouls: [...this.fouls] as [number, number],
    };
  }
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
}

function possessionPct(t: [number, number]): [number, number] {
  const home = Math.round((t[0] / (t[0] + t[1] || 1)) * 100);
  return [home, 100 - home];
}

function rate(b: Body, score: [number, number]): number {
  const s = b.st;
  const mins = ((s.off ?? FULL) - s.on) / FULL;
  const my = score[b.side];
  const their = score[1 - b.side];
  let r = 6.3;
  r += s.goals * 1.0 + s.assists * 0.7 + s.keyPasses * 0.15 + s.onTarget * 0.1 - (s.shots - s.onTarget) * 0.04;
  if (s.passes >= 4) r += (s.passesOk / s.passes - 0.75) * 1.6;
  r += s.tackles * 0.12 + s.interceptions * 0.1 + s.dribbles * 0.05 - s.lost * 0.06 - s.offsides * 0.05;
  r += my > their ? 0.3 : my < their ? -0.3 : 0;
  if (b.p.slot === 'GK') r += s.saves * 0.3 - s.conceded * 0.35 + (their === 0 ? 0.6 : 0);
  else if (DEF_SLOTS.has(b.p.slot)) r += (their === 0 ? 0.4 : 0) - their * 0.12;
  r -= s.yellow * 0.3 + s.fouls * 0.04;
  r = 6.5 + (r - 6.5) * (0.4 + 0.6 * Math.min(1, mins));
  r -= s.red * 2;
  return Math.round(clamp(r, 3, 10) * 10) / 10;
}

/** Jalankan pertandingan penuh tanpa tampilan */
export function playEngine(input: EngineInput): EngineResult {
  return new Match(input).run();
}
