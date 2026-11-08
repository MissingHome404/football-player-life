// Taktik pelatih ala Football Manager: formasi, peran + tugas (Bertahan / Dukungan / Menyerang) di tiap
// tempat, mentalitas, dan instruksi tim (saat menguasai bola, transisi, tanpa bola). Setiap pelatih punya
// taktiknya sendiri (dibuat deterministik dari klub + pelatih + gaya main), dan pemain wajib memainkan
// peran yang dipilih pelatih, bukan peran favoritnya.

import { Rng, clamp } from '../rng';
import { ROLES } from '../data/roles';
import { FORMATIONS, clubFormation, isBox, isCB, isFB, isHold, isST, isWideMid, isWing, nationFormation, type FormationId, type Slot } from './formation';
import type { Club, Player, PlayingStyle } from '../types';
import { OOP_LABEL, OOP_OPTIONS, defaultOop, slotKind, type Duty, type OopRole } from './roleplay';

export type { Duty };
export const DUTY_LABEL: Record<Duty, string> = { De: 'Bertahan', Su: 'Dukungan', At: 'Menyerang', St: 'Stopper', Co: 'Cover', Au: 'Otomatis' };
export const STYLE_LABEL: Record<PlayingStyle, string> = {
  Possession: 'Penguasaan bola',
  Gegenpress: 'Gegenpress',
  Counter: 'Serangan balik',
  Direct: 'Bola langsung',
  'Wing Play': 'Main lewat sayap',
  Defensive: 'Bertahan',
};

export interface TacticSlot {
  role: string;
  duty: Duty;
  /** peran tanpa bola (v16); kosong = bawaan dari peran & tugas */
  oop?: OopRole;
}

export type Focus = 'tengah' | 'kiri' | 'kanan' | 'sayap' | null;
export type CrossKind = 'rendah' | 'tinggi' | 'awal' | 'campuran';

export interface Tactic {
  name: string;
  style: PlayingStyle;
  formation: FormationId;
  /** -3 (sangat bertahan) .. 3 (sangat menyerang) */
  mentality: number;
  /** peran & tugas per tempat formasi (urutan sama dengan FORMATIONS[formation].spots) */
  slots: TacticSlot[];
  // --- saat menguasai bola
  /** -2 sangat sempit .. 2 sangat lebar */
  width: number;
  /** -2 umpan sangat pendek .. 2 sangat langsung */
  directness: number;
  /** -2 sangat lambat .. 2 sangat cepat */
  tempo: number;
  playOut: boolean;
  passIntoSpace: boolean;
  focus: Focus;
  overlap: boolean;
  crosses: CrossKind;
  workIntoBox: boolean;
  shootOnSight: boolean;
  /** -1 kurangi dribel, 0, 1 serbu pertahanan lawan */
  dribble: number;
  /** -1 lebih disiplin, 0, 1 lebih ekspresif */
  creative: number;
  // --- transisi
  counter: boolean;
  counterPress: boolean;
  /** kiper membagi bola pendek ke bek tengah (bukan tendangan jauh) */
  gkShort: boolean;
  // --- tanpa bola
  /** garis pertahanan -2 sangat dalam .. 2 sangat tinggi */
  line: number;
  /** garis mulai menekan -2 .. 2 */
  engage: number;
  /** intensitas pressing -2 .. 2 */
  press: number;
  /** -1 jaga jarak, 0, 1 tekel lebih keras */
  tackling: number;
  /** penjagaan: zona (bawaan) atau man marking (tiap pemain menempel satu lawan) */
  marking?: 'zonal' | 'man';
  /** jebakan offside: garis belakang maju bersama tepat sebelum umpan terobosan lawan */
  trap?: boolean;
}

export const MENTALITY_LABEL = ['Sangat bertahan', 'Bertahan', 'Hati-hati', 'Seimbang', 'Positif', 'Menyerang', 'Sangat menyerang'];
export const mentalityLabel = (m: number) => MENTALITY_LABEL[clamp(Math.round(m), -3, 3) + 3];

/** Tugas yang tersedia untuk tiap peran (seperti di FM) */
export const ROLE_DUTIES: Record<string, Duty[]> = {
  gk: ['De'], sk: ['De', 'Su', 'At'],
  cd: ['De', 'St', 'Co'], bpd: ['De', 'St', 'Co'], ncb: ['De', 'St', 'Co'], lib: ['Su', 'At'], wcb: ['De', 'Su', 'At'],
  fb: ['De', 'Su', 'At', 'Au'], wb: ['De', 'Su', 'At', 'Au'], ifb: ['De'], nfb: ['De'], cwb: ['Su', 'At'], iwb: ['De', 'Su', 'At'],
  dm: ['De', 'Su'], a: ['De'], dlp: ['De', 'Su'], bwm: ['De', 'Su'], reg: ['Su'], hb: ['De'], sv: ['Su', 'At'],
  cm: ['De', 'Su', 'At', 'Au'], b2b: ['Su'], ap: ['Su', 'At'], mez: ['Su', 'At'], car: ['Su'], rpm: ['Su'],
  wm: ['De', 'Su', 'At', 'Au'], w: ['Su', 'At'], wp: ['Su', 'At'], dw: ['De', 'Su'],
  if: ['Su', 'At'], iw: ['Su', 'At'], rmd: ['At'], wtf: ['Su', 'At'],
  am: ['Su', 'At'], ss: ['At'], eng: ['Su'], t: ['At'],
  af: ['At'], p: ['At'], cf: ['Su', 'At'], f9: ['Su'], dlf: ['Su', 'At'], tf: ['Su', 'At'], pf: ['De', 'Su', 'At'],
};

type Group = 'gk' | 'cb' | 'cb3' | 'fb' | 'wb' | 'pivot' | 'dm2' | 'cm' | 'wm' | 'wing' | 'am' | 'st';

function groupOf(slot: Slot, formation: FormationId): Group {
  if (slot === 'GK') return 'gk';
  if (isCB(slot)) return FORMATIONS[formation].spots.filter((s) => isCB(s.slot)).length >= 3 ? 'cb3' : 'cb';
  if (slot === 'RWB' || slot === 'LWB') return 'wb';
  if (isFB(slot)) return 'fb';
  if (slot === 'RDM' || slot === 'LDM') return 'dm2';
  if (isHold(slot)) return 'pivot';
  if (isBox(slot)) return 'cm';
  if (isWideMid(slot)) return 'wm';
  if (isWing(slot)) return 'wing';
  if (slot === 'AM') return 'am';
  if (isST(slot)) return 'st';
  return 'cm';
}

type W = [string, number][];
/** Peran yang disukai tiap gaya main per kelompok tempat (bobot) */
const STYLE_ROLES: Record<PlayingStyle, Record<Group, W>> = {
  Possession: {
    gk: [['sk', 3], ['gk', 1]], cb: [['bpd', 3], ['cd', 2]], cb3: [['bpd', 2], ['cd', 1], ['wcb', 2], ['lib', 1]],
    fb: [['wb', 2], ['fb', 2], ['ifb', 1]], wb: [['cwb', 1], ['wb', 2], ['iwb', 1]],
    pivot: [['dlp', 3], ['reg', 1], ['hb', 1], ['dm', 1]], dm2: [['dlp', 2], ['dm', 2], ['reg', 1], ['sv', 0.5]],
    cm: [['mez', 2], ['ap', 1], ['cm', 1], ['rpm', 1], ['b2b', 1]], wm: [['wp', 2], ['w', 1], ['wm', 1]],
    wing: [['iw', 2], ['if', 2], ['w', 1]], am: [['ap', 2], ['am', 1], ['t', 1], ['eng', 1]],
    st: [['f9', 2], ['cf', 1], ['dlf', 1], ['af', 1]],
  },
  Gegenpress: {
    gk: [['sk', 2], ['gk', 1]], cb: [['cd', 2], ['bpd', 2]], cb3: [['cd', 2], ['wcb', 2], ['bpd', 1]],
    fb: [['wb', 2], ['fb', 1]], wb: [['wb', 2], ['cwb', 1]],
    pivot: [['dm', 2], ['bwm', 1], ['dlp', 1]], dm2: [['bwm', 2], ['dm', 2], ['dlp', 1], ['sv', 1]],
    cm: [['b2b', 3], ['bwm', 1], ['mez', 1], ['cm', 1]], wm: [['wm', 1], ['w', 1], ['dw', 1]],
    wing: [['if', 2], ['w', 1], ['rmd', 1]], am: [['am', 2], ['ss', 1]],
    st: [['pf', 3], ['af', 2], ['cf', 1]],
  },
  Counter: {
    gk: [['gk', 3], ['sk', 1]], cb: [['cd', 3], ['ncb', 1]], cb3: [['cd', 2], ['wcb', 1], ['lib', 0.5]],
    fb: [['fb', 2], ['wb', 1]], wb: [['wb', 2]],
    pivot: [['dm', 2], ['a', 1], ['dlp', 1]], dm2: [['dm', 2], ['dlp', 1], ['bwm', 1], ['sv', 1]],
    cm: [['b2b', 2], ['cm', 1], ['car', 1], ['rpm', 1]], wm: [['w', 2], ['wm', 1]],
    wing: [['w', 2], ['if', 2], ['iw', 1]], am: [['ss', 2], ['am', 1]],
    st: [['af', 3], ['cf', 1], ['pf', 1]],
  },
  Direct: {
    gk: [['gk', 3]], cb: [['ncb', 2], ['cd', 2]], cb3: [['cd', 2], ['ncb', 1]],
    fb: [['fb', 2], ['nfb', 1]], wb: [['wb', 2]],
    pivot: [['dm', 2], ['a', 1], ['bwm', 1]], dm2: [['dm', 2], ['bwm', 1], ['a', 1]],
    cm: [['b2b', 2], ['cm', 1], ['car', 1]], wm: [['wm', 2], ['w', 1]],
    wing: [['w', 1], ['wtf', 1], ['if', 1]], am: [['am', 1], ['ss', 1]],
    st: [['tf', 3], ['af', 1], ['p', 1], ['dlf', 1]],
  },
  'Wing Play': {
    gk: [['gk', 2], ['sk', 1]], cb: [['cd', 2], ['bpd', 1]], cb3: [['cd', 2], ['wcb', 1]],
    fb: [['wb', 3], ['fb', 1]], wb: [['cwb', 2], ['wb', 2]],
    pivot: [['dm', 2], ['dlp', 1]], dm2: [['dm', 2], ['dlp', 1], ['sv', 0.5]],
    cm: [['cm', 2], ['b2b', 1], ['car', 1]], wm: [['w', 3], ['wm', 1]],
    wing: [['w', 3], ['if', 1], ['wtf', 1]], am: [['am', 2], ['ap', 1]],
    st: [['tf', 2], ['p', 2], ['af', 1], ['cf', 1]],
  },
  Defensive: {
    gk: [['gk', 3]], cb: [['cd', 3], ['ncb', 2]], cb3: [['cd', 2], ['ncb', 1], ['lib', 1]],
    fb: [['fb', 2], ['nfb', 2]], wb: [['wb', 2], ['iwb', 1]],
    pivot: [['a', 2], ['dm', 2], ['hb', 1]], dm2: [['dm', 2], ['a', 1], ['bwm', 1]],
    cm: [['car', 2], ['cm', 2], ['bwm', 1]], wm: [['dw', 2], ['wm', 2]],
    wing: [['w', 1], ['if', 1], ['iw', 1]], am: [['am', 1], ['eng', 1]],
    st: [['dlf', 1], ['af', 1], ['tf', 1], ['p', 1]],
  },
};

/** Kecenderungan tugas tiap gaya (bobot De/Su/At) */
const STYLE_DUTY: Record<PlayingStyle, [number, number, number]> = {
  Possession: [1, 3, 2],
  Gegenpress: [1, 2, 3],
  Counter: [2, 2, 2],
  Direct: [1, 2, 2],
  'Wing Play': [1, 2, 3],
  Defensive: [3, 3, 1],
};

const TACTIC_NAMES: Record<PlayingStyle, string[]> = {
  Possession: ['Tiki-Taka', 'Tiki-Taka Vertikal', 'Penguasaan Bola', 'Juego de Posición'],
  Gegenpress: ['Gegenpress', 'Pressing Tinggi', 'Heavy Metal', 'Rebut Lalu Serang'],
  Counter: ['Serangan Balik', 'Serangan Balik Cepat', 'Blok Tengah & Kontra', 'Transisi Kilat'],
  Direct: ['Bola Langsung', 'Bola Panjang ke Target', 'Vertikal Langsung'],
  'Wing Play': ['Permainan Sayap', 'Umpan Silang & Sundulan', 'Lebar & Overlap'],
  Defensive: ['Blok Rendah', 'Parkir Bus', 'Bertahan Rapat & Kontra', 'Catenaccio Modern'],
};

/** Instruksi tim dasar per gaya: [mentalitas, lebar, langsung, tempo, garis, mulai menekan, pressing] */
const STYLE_BASE: Record<PlayingStyle, [number, number, number, number, number, number, number]> = {
  Possession: [1, 0, -2, -1, 1, 1, 1],
  Gegenpress: [1, 0, 0, 1, 2, 2, 2],
  Counter: [-1, 0, 1, 1, -1, -1, 0],
  Direct: [0, 1, 2, 1, 0, 0, 0],
  'Wing Play': [0, 2, 0, 0, 0, 0, 0],
  Defensive: [-2, -1, 1, -1, -2, -2, -1],
};

/** Kecenderungan bek tengah Stopper / Cover tiap gaya (bobot, dibanding Bertahan dari STYLE_DUTY) */
const STYLE_CB_DUTY: Record<PlayingStyle, [number, number]> = {
  Possession: [0.6, 0.5],
  Gegenpress: [1.2, 0.3],
  Counter: [0.5, 0.9],
  Direct: [0.6, 0.5],
  'Wing Play': [0.5, 0.5],
  Defensive: [0.7, 1.4],
};

function pickDuty(rng: Rng, role: string, style: PlayingStyle, prefer?: Duty): Duty {
  const ok = ROLE_DUTIES[role] ?? ['Su'];
  if (prefer && ok.includes(prefer)) return prefer;
  const w = STYLE_DUTY[style];
  const cb = STYLE_CB_DUTY[style];
  const weight = (d: Duty) =>
    d === 'De' ? w[0] : d === 'Su' ? w[1] : d === 'At' ? w[2] : d === 'St' ? w[0] * cb[0] : d === 'Co' ? w[0] * cb[1] : w[1] * 0.35;
  return rng.weighted(ok.map((d) => [d, weight(d)] as const));
}

const MAN_MARK: Record<PlayingStyle, number> = { Possession: 0.05, Gegenpress: 0.15, Counter: 0.2, Direct: 0.1, 'Wing Play': 0.05, Defensive: 0.3 };
const TRAP: Record<PlayingStyle, number> = { Possession: 0.5, Gegenpress: 0.75, Counter: 0.15, Direct: 0.25, 'Wing Play': 0.35, Defensive: 0.05 };

/** Peran tanpa bola pilihan pelatih AI: bawaan peran, disesuaikan gaya main */
function styleOop(style: PlayingStyle, role: string, duty: Duty, slot: string): OopRole | undefined {
  const def = defaultOop(role, duty, slot);
  const kind = slotKind(slot);
  const ok = OOP_OPTIONS[kind];
  const want = (o: OopRole) => (ok.includes(o) ? o : def);
  if (style === 'Gegenpress' && (kind === 'st' || kind === 'am' || kind === 'wide' || kind === 'cm')) return want('press');
  if (style === 'Defensive') {
    if (kind === 'wide') return want('track');
    if ((kind === 'st' && role !== 'p') || kind === 'am' || kind === 'cm') return want('screen');
  }
  return def;
}

/** Buat taktik deterministik dari seed (klub+pelatih atau negara), gaya main, dan formasi */
export function makeTactic(seed: string, style: PlayingStyle, formation: FormationId): Tactic {
  const rng = new Rng(`tactic:${seed}`);
  const spots = FORMATIONS[formation].spots;
  const slots: TacticSlot[] = [];
  const used = new Map<string, number>();
  // pasangan (2 bek tengah, 2 gelandang, 2 striker): tugasnya saling melengkapi
  const pairDuty = new Map<Group, Duty>();
  spots.forEach((spot) => {
    const g = groupOf(spot.slot, formation);
    const pool = STYLE_ROLES[style][g].map(([r, w]) => [r, w / (1 + (used.get(r) ?? 0) * (r === 'cd' || r === 'fb' || r === 'wb' ? 0.5 : 3))] as const);
    const role = rng.weighted(pool);
    used.set(role, (used.get(role) ?? 0) + 1);
    let prefer: Duty | undefined;
    const prev = pairDuty.get(g);
    if (prev && (g === 'st' || g === 'cm' || g === 'dm2')) prefer = prev === 'At' ? 'Su' : prev === 'De' ? 'Su' : g === 'dm2' ? 'De' : 'At';
    if (g === 'fb' && prev) prefer = prev === 'At' ? 'Su' : undefined;
    // duet bek tengah: stopper ditemani cover (dan sebaliknya)
    if ((g === 'cb' || g === 'cb3') && (prev === 'St' || prev === 'Co')) prefer = prev === 'St' ? 'Co' : 'St';
    const duty = pickDuty(rng, role, style, prefer);
    pairDuty.set(g, duty);
    slots.push({ role, duty, oop: styleOop(style, role, duty, spot.slot) });
  });
  // serangan balik: minimal satu pemain depan tetap di depan
  if ((style === 'Counter' || style === 'Direct') && !slots.some((s) => s.oop === 'outlet')) {
    const i = spots.findIndex((sp, j) => OOP_OPTIONS[slotKind(sp.slot)].includes('outlet') && slotKind(sp.slot) === 'st' && slots[j]);
    if (i >= 0) slots[i] = { ...slots[i], oop: 'outlet' };
  }
  const [m, w, d, t, l, e, p] = STYLE_BASE[style];
  const jitter = (v: number, lo = -2, hi = 2) => clamp(v + (rng.chance(0.35) ? rng.pick([-1, 1]) : 0), lo, hi);
  const tactic: Tactic = {
    name: rng.pick(TACTIC_NAMES[style]),
    style,
    formation,
    mentality: jitter(m, -3, 3),
    slots,
    width: jitter(w),
    directness: jitter(d),
    tempo: jitter(t),
    playOut: style === 'Possession' || (style === 'Gegenpress' && rng.chance(0.5)) || (style === 'Wing Play' && rng.chance(0.3)),
    passIntoSpace: style === 'Counter' || style === 'Direct' || style === 'Gegenpress' ? true : rng.chance(0.25),
    focus: style === 'Wing Play' ? 'sayap' : style === 'Possession' ? (rng.chance(0.6) ? 'tengah' : null) : rng.chance(0.2) ? rng.pick(['kiri', 'kanan'] as const) : null,
    overlap: style === 'Wing Play' || (style === 'Possession' && rng.chance(0.5)) || rng.chance(0.2),
    crosses: style === 'Direct' ? 'tinggi' : style === 'Wing Play' ? rng.pick(['rendah', 'tinggi', 'awal'] as const) : rng.pick(['rendah', 'campuran'] as const),
    workIntoBox: style === 'Possession' || rng.chance(0.15),
    shootOnSight: style !== 'Possession' && rng.chance(0.3),
    dribble: style === 'Counter' ? 1 : style === 'Possession' && rng.chance(0.4) ? -1 : rng.pick([0, 0, 1]),
    creative: style === 'Possession' || style === 'Gegenpress' ? (rng.chance(0.7) ? 1 : 0) : style === 'Defensive' ? -1 : rng.pick([-1, 0, 0, 1]),
    counter: style !== 'Possession' && style !== 'Defensive' ? true : style === 'Defensive',
    counterPress: style === 'Gegenpress' || (style === 'Possession' && rng.chance(0.7)) || rng.chance(0.15),
    gkShort: style === 'Possession' || (style === 'Gegenpress' && rng.chance(0.5)),
    line: jitter(l),
    engage: jitter(e),
    press: jitter(p),
    tackling: style === 'Gegenpress' ? 1 : style === 'Possession' ? 0 : rng.pick([-1, 0, 0, 1]),
  };
  // tanpa bola: man marking jarang (lebih sering di tim bertahan), jebakan offside untuk garis tinggi
  tactic.marking = rng.chance(MAN_MARK[style]) ? 'man' : 'zonal';
  tactic.trap = tactic.line >= 1 ? rng.chance(TRAP[style]) : tactic.line === 0 && rng.chance(TRAP[style] * 0.4);
  // instruksi yang saling bertentangan tidak dipakai bersamaan
  if (tactic.workIntoBox) tactic.shootOnSight = false;
  if (tactic.creative < 0 && tactic.dribble > 0 && style !== 'Counter') tactic.dribble = 0;
  return tactic;
}

/** Taktik pelatih klub (berganti kalau pelatihnya berganti) */
export function clubTactic(club: Pick<Club, 'id' | 'managerId' | 'playingStyle'>): Tactic {
  return makeTactic(`club:${club.id}:${club.managerId}`, club.playingStyle, clubFormation(club));
}

/** Taktik tim nasional */
export function nationTactic(countryId: string, style: PlayingStyle): Tactic {
  return makeTactic(`nat:${countryId}`, style, nationFormation(countryId, style));
}

/** Kecerdasan taktik pemain 0..1 (Decisions, Teamwork, Anticipation, Positioning/Off the Ball): cepat paham taktik baru */
export function tacticalIQ(p: Player): number {
  const m = p.mental;
  return clamp(((m.Decisions + m.Teamwork + m.Anticipation + Math.max(m.Positioning, m['Off the Ball'])) / 4 - 5) / 13, 0, 1);
}

/**
 * Perkiraan pemahaman taktik pemain AI (0.5..1): tetap untuk pemain + pelatih yang sama; pemain cerdas
 * pemain akademi masih belajar.
 */
export function aiFamiliarity(p: Player, t: Tactic): number {
  const r = new Rng(`fam:${p.id}:${t.name}:${t.formation}`).float(0, 1);
  return clamp(0.5 + 0.25 * tacticalIQ(p) + 0.25 * r + (p.isYouth ? -0.08 : 0), 0.5, 1);
}

/**
 * Intensitas taktik 0..1: pressing, garis tinggi, tempo, counter-press, dan mentalitas menyerang menguras
 * tenaga lebih cepat (pemain dengan stamina & natural fitness tinggi lebih tahan).
 */
export function tacticIntensity(t: Tactic): number {
  return clamp(
    0.42 + t.press * 0.09 + t.engage * 0.04 + t.line * 0.03 + t.tempo * 0.05 + (t.counterPress ? 0.08 : 0) + t.mentality * 0.02 + (t.overlap ? 0.02 : 0),
    0.05,
    1,
  );
}

/** Ringkasan instruksi tim yang aktif, dikelompokkan seperti layar taktik FM */
export function tacticInstructions(t: Tactic): { possession: string[]; transition: string[]; defence: string[] } {
  const lv = (v: number, neg2: string, neg1: string, pos1: string, pos2: string) =>
    v <= -2 ? neg2 : v === -1 ? neg1 : v === 1 ? pos1 : v >= 2 ? pos2 : null;
  const possession = [
    lv(t.width, 'Sangat sempit', 'Sempit', 'Lebar', 'Sangat lebar'),
    lv(t.directness, 'Umpan sangat pendek', 'Umpan pendek', 'Umpan lebih langsung', 'Umpan sangat langsung'),
    lv(t.tempo, 'Tempo sangat lambat', 'Tempo lebih lambat', 'Tempo lebih cepat', 'Tempo sangat cepat'),
    t.playOut ? 'Bangun serangan dari belakang' : null,
    t.passIntoSpace ? 'Umpan ke ruang kosong' : null,
    t.focus === 'tengah' ? 'Fokus serangan lewat tengah' : t.focus === 'sayap' ? 'Fokus serangan lewat sayap' : t.focus ? `Fokus serangan sisi ${t.focus}` : null,
    t.overlap ? 'Bek sayap overlap' : null,
    t.crosses === 'rendah' ? 'Umpan silang rendah' : t.crosses === 'tinggi' ? 'Umpan silang tinggi' : t.crosses === 'awal' ? 'Umpan silang lebih awal' : null,
    t.workIntoBox ? 'Bawa bola sampai ke kotak' : null,
    t.shootOnSight ? 'Tembak kalau ada kesempatan' : null,
    t.dribble > 0 ? 'Serbu pertahanan lawan' : t.dribble < 0 ? 'Kurangi dribel' : null,
    t.creative > 0 ? 'Lebih ekspresif' : t.creative < 0 ? 'Lebih disiplin' : null,
  ].filter((x): x is string => !!x);
  const transition = [
    t.counterPress ? 'Counter-press (rebut bola segera)' : 'Mundur ke posisi setelah kehilangan bola',
    t.counter ? 'Serangan balik' : 'Tahan bentuk setelah merebut bola',
    t.gkShort ? 'Kiper membagi bola ke bek tengah' : 'Kiper menendang jauh',
  ];
  const defence = [
    lv(t.line, 'Garis pertahanan sangat dalam', 'Garis pertahanan lebih dalam', 'Garis pertahanan lebih tinggi', 'Garis pertahanan sangat tinggi'),
    lv(t.engage, 'Mulai menekan sangat dalam', 'Mulai menekan lebih dalam', 'Mulai menekan lebih tinggi', 'Mulai menekan sangat tinggi'),
    lv(t.press, 'Pressing sangat jarang', 'Pressing lebih jarang', 'Pressing lebih sering', 'Pressing jauh lebih sering'),
    t.tackling > 0 ? 'Tekel lebih keras' : t.tackling < 0 ? 'Jangan terburu-buru menekel' : null,
    t.marking === 'man'
      ? 'Man marking (tiap pemain menempel satu lawan ke mana pun; yang tidak punya lawan jagaan ikut mengepung bola)'
      : 'Zonal marking (tiap pemain menjaga daerahnya; yang daerahnya kosong ikut mengepung pembawa bola)',
    t.trap ? 'Jebakan offside' : null,
  ].filter((x): x is string => !!x);
  return { possession, transition, defence };
}

/** Nama peran + tugas, mis. "False Nine (Dukungan)" */
export function roleDutyLabel(s: TacticSlot): string {
  return `${ROLES[s.role]?.name ?? s.role} (${DUTY_LABEL[s.duty]})${s.oop ? ` · tanpa bola: ${OOP_LABEL[s.oop]}` : ''}`;
}

/** Angka taktik yang dibaca match engine (disimpan di input laga; kecil dan bisa diputar ulang) */
export interface TacticK {
  mentality: number;
  width: number;
  directness: number;
  tempo: number;
  playOut: boolean;
  passIntoSpace: boolean;
  focus: Focus;
  overlap: boolean;
  crosses: CrossKind;
  workIntoBox: boolean;
  shootOnSight: boolean;
  dribble: number;
  creative: number;
  counter: boolean;
  counterPress: boolean;
  gkShort: boolean;
  line: number;
  engage: number;
  press: number;
  tackling: number;
  marking?: 'zonal' | 'man';
  trap?: boolean;
  intensity: number;
}

export function tacticK(t: Tactic): TacticK {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { name, style, formation, slots, ...rest } = t;
  return { ...rest, intensity: tacticIntensity(t) };
}
