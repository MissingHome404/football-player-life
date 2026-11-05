// Mesin pertandingan 2D (versi 1). 22 pemain bergerak dengan kecepatan normal, sementara
// jam pertandingan berjalan 18 kali lebih cepat: satu babak = 150 detik permainan
// (2,5 menit waktu nyata), seperti FIFA. Tidak ada kendali dari pemain: setiap keputusan
// (umpan, dribel, tembak, tekel, posisi) dihitung dari atribut, seperti FM.
// Deterministik: input + seed yang sama selalu menghasilkan pertandingan yang sama,
// jadi hasil yang dihitung di simulasi mingguan bisa ditonton ulang persis sama.

import type { Player } from '../types';
import type { Position } from '../data/attributes';
import { Rng, clamp } from '../rng';
import { shortName } from '../gen/names';

export const PITCH_W = 105;
export const PITCH_H = 68;
export const HALF = 150; // detik permainan per babak
export const FULL = HALF * 2;
export const DT = 0.1;
const GOAL_HALF = 3.66;

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
  pace: number; acc: number; sta: number; pas: number; vis: number; tec: number; dri: number; ft: number;
  fin: number; lon: number; cmp: number; dec: number; tck: number; mar: number; pos: number; ant: number;
  otb: number; str: number; hea: number; cro: number; gk: number;
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
}

export interface EngineInput {
  seed: string;
  home: ETeam;
  away: ETeam;
}

export function engineAttrs(p: Player): EAttrs {
  const t = p.technical;
  const m = p.mental;
  const ph = p.physical;
  const g = p.goalkeeping;
  return {
    pace: ph.Pace, acc: ph.Acceleration, sta: ph.Stamina, pas: t.Passing, vis: m.Vision, tec: t.Technique,
    dri: t.Dribbling, ft: t['First Touch'], fin: t.Finishing, lon: t['Long Shots'], cmp: m.Composure,
    dec: m.Decisions, tck: t.Tackling, mar: t.Marking, pos: m.Positioning, ant: m.Anticipation,
    otb: m['Off the Ball'], str: ph.Strength, hea: t.Heading, cro: t.Crossing,
    gk: p.mainPosition === 'GK' ? (g.Handling + g.Reflexes + g['One on Ones'] + g['Command of Area']) / 4 : 3,
  };
}

/** Susun 11 pemain (4-3-3) dari skuad. Pemain kita masuk kalau `userStarts`. */
export function pickXI(squad: Player[], user: Player | undefined, userStarts: boolean): { xi: EP[]; userSlot?: Slot } {
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
  return { xi, userSlot };
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
  on: number; // detik permainan mulai main
  off?: number;
}

export type EventKind = 'goal' | 'shot' | 'save' | 'miss' | 'block' | 'half' | 'full' | 'sub' | 'kickoff' | 'penalty' | 'corner' | 'freekick';
export interface MatchEvent {
  t: number;
  min: number;
  kind: EventKind;
  side: 0 | 1;
  name?: string;
  assist?: string;
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
}

interface Shot {
  by: Body;
  outcome: 'goal' | 'save' | 'miss';
  tx: number;
  ty: number;
  assist?: Body;
}

interface Pass {
  from: Body;
  to: Body;
  air: boolean;
  cross: boolean;
  tx: number;
  ty: number;
}

interface Restart {
  side: 0 | 1;
  x: number;
  y: number;
  wait: number;
  kind: 'kickoff' | 'throw' | 'goalkick' | 'corner' | 'free' | 'penalty';
  /** tendangan bebas langsung ke gawang */
  direct?: boolean;
}

export const minuteOf = (t: number) => Math.min(90, Math.floor((t / FULL) * 90) + (t >= FULL ? 0 : 1));

export class Match {
  readonly input: EngineInput;
  readonly rng: Rng;
  t = 0;
  half: 1 | 2 = 1;
  score: [number, number] = [0, 0];
  events: MatchEvent[] = [];
  bodies: Body[] = [];
  bench: Body[] = [];
  ball = { x: 52.5, y: 34, vx: 0, vy: 0 };
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
  pause = 0; // jeda setelah gol
  done = false;

  constructor(input: EngineInput) {
    this.input = input;
    this.rng = new Rng(`engine:${input.seed}`);
    const teams = [input.home, input.away];
    teams.forEach((team, side) => {
      for (const p of team.xi) this.bodies.push(this.makeBody(p, side as 0 | 1, true));
      if (team.sub) this.bench.push(this.makeBody(team.sub.player, side as 0 | 1, false));
    });
    this.refresh();
    this.kickoff(0);
  }

  private makeBody(p: EP, side: 0 | 1, on: boolean): Body {
    const st: PStats = {
      passes: 0, passesOk: 0, keyPasses: 0, shots: 0, onTarget: 0, goals: 0, assists: 0, tackles: 0,
      interceptions: 0, dribbles: 0, lost: 0, saves: 0, conceded: 0, on: on ? 0 : -1,
    };
    return { p, side, x: 52.5, y: 34, vx: 0, vy: 0, tx: 52.5, ty: 34, on, st, cool: 0, run: 0 };
  }

  /** Arah serangan tim: +1 ke kanan, -1 ke kiri (tukar saat babak kedua) */
  dir(side: 0 | 1): 1 | -1 {
    return (side === 0) === (this.half === 1) ? 1 : -1;
  }
  /** Koordinat lapangan -> bingkai tim (gawang sendiri di x = 0) */
  private fx(side: 0 | 1, x: number) {
    return this.dir(side) > 0 ? x : PITCH_W - x;
  }
  private fy(side: 0 | 1, y: number) {
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
    const all = this.bodies.filter((b) => b.on);
    this.onPitch = [all.filter((b) => b.side === 0), all.filter((b) => b.side === 1), all];
  }
  private active() {
    return this.onPitch[2];
  }

  private kickoff(side: 0 | 1) {
    for (const b of this.active()) {
      const [bx, by] = BASE[b.p.slot];
      const fx = Math.min(bx * 0.7, 48);
      b.x = this.wx(b.side, fx);
      b.y = this.wy(b.side, by);
      b.vx = b.vy = 0;
      b.run = 0;
    }
    this.ball = { x: 52.5, y: 34, vx: 0, vy: 0 };
    this.owner = null;
    this.pass = null;
    this.shot = null;
    this.restart = { side, x: 52.5, y: 34, wait: 0.8, kind: 'kickoff' };
  }

  private log(kind: EventKind, side: 0 | 1, name?: string, assist?: string) {
    this.events.push({ t: this.t, min: minuteOf(this.t), kind, side, name, assist });
  }

  // --- bantuan geometri ---------------------------------------------------------

  private nearest(list: Body[], x: number, y: number): [Body | null, number] {
    let best: Body | null = null;
    let bd = Infinity;
    for (const b of list) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return [best, bd];
  }

  private opponents(side: 0 | 1) {
    return this.onPitch[1 - side];
  }
  private mates(side: 0 | 1) {
    return this.onPitch[side];
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

  // --- posisi target --------------------------------------------------------------

  private targets() {
    const ball = this.ball;
    for (const side of [0, 1] as const) {
      const inPoss = this.poss === side;
      const bfx = this.fx(side, ball.x);
      const bfy = this.fy(side, ball.y);
      const team = this.mates(side);
      // garis pertahanan lawan (untuk lari menembus)
      const oppLine = Math.max(...this.opponents(side).filter((o) => o.p.slot !== 'GK').map((o) => this.fx(side, o.x)), 50);
      for (const b of team) {
        const [bx, by] = BASE[b.p.slot];
        const slot0 = b.p.slot;
        let x: number;
        let y: number;
        if (b.p.slot === 'GK') {
          x = clamp(3 + Math.max(0, bfx - 40) * 0.06, 2, 10);
          y = 34 + (bfy - 34) * 0.18;
        } else {
          const shift = (bfx - 45) * (inPoss && (slot0 === 'RCM' || slot0 === 'LCM') ? 0.75 : 0.6);
          x = bx + shift + (inPoss ? 7 : -4);
          y = inPoss ? 34 + (by - 34) * 1.12 + (bfy - 34) * 0.12 : 34 + (by - 34) * 0.82 + (bfy - 34) * 0.28;
          const slot = b.p.slot;
          const isDef = slot === 'RB' || slot === 'LB' || slot === 'RCB' || slot === 'LCB';
          const wing = slot === 'RW' || slot === 'LW';
          if (!inPoss && isDef) x = Math.min(x, bfx - 3);
          if (inPoss) {
            // makin dekat ke gawang lawan: sayap masuk ke kotak, gelandang naik, bek sayap overlap
            const adv = clamp((bfx - 55) / 35, 0, 1);
            if (wing) {
              // sayap sisi jauh menyerang tiang jauh, sayap sisi bola tetap memberi lebar
              const far = (by - 34) * (bfy - 34) < 0;
              y += (34 - y) * (far ? 0.8 : 0.4) * adv;
              x += (far ? 10 : 5) * adv;
            } else if (slot === 'CM') x += 6 * adv;
            else if (slot.endsWith('CM')) {
              // gelandang datang ke tepi kotak
              x = Math.max(x + 13 * adv, bfx - 14 + 10 * adv);
              y += (34 - y) * 0.35 * adv;
            }
            else if (slot === 'RB' || slot === 'LB') x += 10 * adv;
            else if (slot === 'ST' && b.run <= 0) x = Math.min(x, bfx + ST_DROP); // striker turun menjemput bola
          }
          if (inPoss && b.run > 0) {
            x = Math.min(100, oppLine + 3);
            y = clamp(y + (34 - y) * (wing ? 0.55 : 0.35), 6, 62);
          } else if (inPoss && !isDef) {
            x = Math.min(x, oppLine - 1); // jangan offside
          }
          x = clamp(x, 2, 102);
          y = clamp(y, 2, 66);
        }
        b.tx = this.wx(side, x);
        b.ty = this.wy(side, y);
      }
      if (!inPoss && !this.restart) this.markTargets(side, team);
      if (this.restart?.kind === 'corner') this.cornerTargets(side, team);
      // tekanan: pemain terdekat mengejar bola, pemain kedua menutup jalur ke gawang
      if (!inPoss || !this.owner) {
        const others = team.filter((b) => b.p.slot !== 'GK' && b !== this.owner);
        const px = ball.x + ball.vx * 0.3;
        const py = ball.y + ball.vy * 0.3;
        const sorted = others.map((b) => [b, Math.hypot(b.x - px, b.y - py)] as const).sort((a, c) => a[1] - c[1]);
        if (sorted[0]) {
          sorted[0][0].tx = px;
          sorted[0][0].ty = py;
        }
        if (sorted[1] && this.owner && this.owner.side !== side) {
          const gx = this.wx(side, 0);
          sorted[1][0].tx = (px * 2 + gx) / 3;
          sorted[1][0].ty = (py * 2 + 34) / 3;
        }
      }
    }
    // penerima umpan berlari menjemput bola
    if (this.pass) {
      this.pass.to.tx = this.pass.tx;
      this.pass.to.ty = this.pass.ty;
    }
  }

  /** Bertahan: bek tengah menjaga striker, bek sayap menjaga sayap, gelandang bertahan mengikuti pelari */
  private markTargets(side: 0 | 1, team: Body[]) {
    const opps = this.opponents(side);
    const by = (slot: Slot) => team.find((b) => b.p.slot === slot);
    const mark = (def: Body | undefined, att: Body | undefined, tight: number) => {
      if (!def || !att) return;
      const ax = this.fx(side, att.x);
      if (ax > 45) return;
      const ay = this.fy(side, att.y);
      const k = tight * (0.5 + def.p.a.mar * 0.025);
      const tx = this.fx(side, def.tx) + (ax - 1.6 - this.fx(side, def.tx)) * k;
      const ty = this.fy(side, def.ty) + (ay + (34 - ay) * 0.12 - this.fy(side, def.ty)) * k;
      def.tx = this.wx(side, clamp(tx, 1, 104));
      def.ty = this.wy(side, clamp(ty, 1, 67));
    };
    const st = opps.find((o) => o.p.slot === 'ST');
    if (st) {
      const cb = [by('RCB'), by('LCB')].filter(Boolean).sort((a, b) => Math.hypot(a!.x - st.x, a!.y - st.y) - Math.hypot(b!.x - st.x, b!.y - st.y))[0];
      mark(cb, st, MARK_K);
    }
    mark(by('LB'), opps.find((o) => o.p.slot === 'RW'), MARK_K * 0.75);
    mark(by('RB'), opps.find((o) => o.p.slot === 'LW'), MARK_K * 0.75);
    const runner = opps.find((o) => o.run > 0 && o.p.slot.endsWith('CM'));
    mark(by('CM'), runner, 0.8);
  }

  /** Sepak pojok: bek tengah, striker, dan satu gelandang naik ke kotak; lawan menjaga kotaknya */
  private cornerTargets(side: 0 | 1, team: Body[]) {
    const attacking = this.restart!.side === side;
    const spots = attacking
      ? [[99, 31], [97, 38], [94, 34], [100, 36], [92, 41]]
      : [[4, 31], [4, 37], [7, 34], [8, 29], [8, 40], [13, 34], [12, 26]];
    const order: Slot[] = attacking ? ['RCB', 'LCB', 'ST', 'CM', 'LW'] : ['RCB', 'LCB', 'CM', 'RB', 'LB', 'RCM', 'LCM'];
    order.forEach((slot, i) => {
      const b = team.find((q) => q.p.slot === slot);
      if (!b) return;
      b.tx = this.wx(side, spots[i][0]);
      b.ty = this.wy(side, spots[i][1]);
    });
  }

  private move(b: Body) {
    if (b === this.owner && this.restart) return;
    const fatigue = 1 - 0.12 * (this.t / FULL) * ((20 - b.p.a.sta) / 20);
    let speed = (4.4 + b.p.a.pace * 0.2) * fatigue;
    if (b === this.owner) speed *= 0.82;
    const dx = b.tx - b.x;
    const dy = b.ty - b.y;
    const d = Math.hypot(dx, dy);
    const want = d < 0.3 ? 0 : Math.min(speed, d / DT);
    const vx = d ? (dx / d) * want : 0;
    const vy = d ? (dy / d) * want : 0;
    const k = Math.min(1, (2 + b.p.a.acc * 0.18) * DT);
    b.vx += (vx - b.vx) * k;
    b.vy += (vy - b.vy) * k;
    b.x = clamp(b.x + b.vx * DT, -1, PITCH_W + 1);
    b.y = clamp(b.y + b.vy * DT, -1, PITCH_H + 1);
  }

  // --- aksi pemain yang menguasai bola -------------------------------------------

  private gain(b: Body) {
    this.owner = b;
    this.lastTouch = b;
    this.poss = b.side;
    this.pass = null;
    b.cool = 0.25;
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

    // kiper: segera distribusikan
    const options: [number, () => void][] = [];

    // tembak
    const distGoal = Math.hypot(PITCH_W - fx, 34 - fy);
    if (distGoal < 35 && c.p.slot !== 'GK') {
      const xg = this.xgAt(fx, fy);
      const skill = distGoal < 18 ? a.fin : a.lon;
      const v = xg * (0.6 + skill * 0.035) * (1 - pressure * 0.3) * SHOOT_W - (distGoal > 22 ? 0.2 - a.lon * 0.009 : 0);
      options.push([v + noise(), () => this.shoot(c, xg, pressure)]);
    }

    // umpan
    for (const m of this.mates(side)) {
      if (m === c) continue;
      const d = Math.hypot(m.x - c.x, m.y - c.y);
      if (d < 4 || d > 48) continue;
      if (d > 32 && a.vis < 11) continue;
      const mfx = this.fx(side, m.x);
      const mfy = this.fy(side, m.y);
      const progress = mfx - fx;
      const [, open] = this.nearest(opps, m.x, m.y);
      let risk = 0;
      for (const o of opps) {
        const ld = this.laneDist(c.x, c.y, m.x, m.y, o.x, o.y);
        if (ld < 3) risk += (3 - ld) / 3;
      }
      const wide = fx > 78 && Math.abs(fy - 34) > 14;
      const inBox = mfx > 88 && Math.abs(mfy - 34) < 18;
      const cross = wide && inBox;
      // di sepertiga akhir, umpan ke belakang tidak terlalu dihukum: yang penting peluang si penerima
      const prog = progress < 0 && fx > 70 ? progress * 0.6 : progress;
      let v =
        0.22 +
        prog / PROG_W +
        Math.min(open, 8) * 0.03 -
        risk * (cross ? 0.2 : 0.7) -
        (d > 30 ? 0.12 : 0) +
        this.xgAt(mfx, mfy) * XG_PASS_W * clamp(open / 4, 0.3, 1.2) +
        (m.run > 0 ? 0.15 : 0);
      if (m.p.slot === 'GK') v -= 0.5;
      if (cross) v += (a.cro - 10) * 0.02 + (m.p.a.hea - 10) * 0.015;
      // ditekan di depan kotak: kembalikan bola ke rekan yang bebas
      if (pressure > 0 && fx > 75 && open > 5 && mfx > 65) v += 0.15 * pressure * 2;
      // umpan tarik dari garis gawang ke pemain yang datang dari belakang
      if (fx > 92 && Math.abs(fy - 34) > 9 && mfx > 78 && mfx < 96 && Math.abs(mfy - 34) < 13 && progress < 0) v += 0.3;
      options.push([v + noise(), () => this.passTo(c, m, cross || d > 30)]);
    }

    // dribel ke depan
    if (c.p.slot !== 'GK') {
      let space = 12;
      for (const o of opps) {
        const ofx = this.fx(side, o.x);
        const ofy = this.fy(side, o.y);
        if (ofx > fx - 1 && Math.abs(ofy - fy) < 7) space = Math.min(space, Math.hypot(ofx - fx, ofy - fy));
      }
      const v = 0.12 + space / 22 + (a.dri - 10) * 0.02 - pressure * 0.18 + (fx > 70 ? 0.06 : 0);
      options.push([v + noise(), () => this.dribble(c)]);
    }

    // tidak ada pilihan (mis. kiper tanpa rekan dalam jangkauan): buang bola ke rekan terdekat dari jarak 30 m
    if (!options.length) {
      let target: Body | undefined;
      for (const m of this.mates(side)) {
        if (m === c) continue;
        if (!target || Math.abs(Math.hypot(m.x - c.x, m.y - c.y) - 30) < Math.abs(Math.hypot(target.x - c.x, target.y - c.y) - 30)) target = m;
      }
      if (target) options.push([0, () => this.passTo(c, target, true)]);
      else options.push([0, () => this.dribble(c)]);
    }
    let best = options[0];
    for (const o of options) if (o[0] > best[0]) best = o;
    best[1]();
    c.cool = 0.5 - a.dec * 0.012;
  }

  private passTo(c: Body, m: Body, air: boolean) {
    const a = c.p.a;
    const d = Math.hypot(m.x - c.x, m.y - c.y);
    const speed = clamp(10 + d * 0.45, 12, 26);
    const lead = d / speed;
    let tx = m.x + m.vx * lead;
    let ty = m.y + m.vy * lead;
    const [, pd] = this.nearest(this.opponents(c.side), c.x, c.y);
    const err = ((21 - (a.pas + a.tec) / 2) * 0.007 + (pd < 2 ? 0.035 : 0)) * (air ? 1.5 : 1);
    const ang = this.rng.normal(0, err);
    const dx = tx - c.x;
    const dy = ty - c.y;
    tx = c.x + dx * Math.cos(ang) - dy * Math.sin(ang);
    ty = c.y + dx * Math.sin(ang) + dy * Math.cos(ang);
    const dd = Math.hypot(tx - c.x, ty - c.y) || 1;
    this.ball.vx = ((tx - c.x) / dd) * speed;
    this.ball.vy = ((ty - c.y) / dd) * speed;
    const cross = air && this.fx(c.side, m.x) > 85;
    this.pass = { from: c, to: m, air, cross, tx, ty };
    c.st.passes++;
    this.lastPasser = c;
    this.owner = null;
    this.lastTouch = c;
  }

  private dribble(c: Body) {
    const side = c.side;
    const fy = this.fy(side, c.y);
    const gx = this.wx(side, Math.min(PITCH_W, this.fx(side, c.x) + 9));
    const fx = this.fx(side, c.x);
    const cutIn = (c.p.slot === 'RW' || c.p.slot === 'LW') && fx > 62 ? 0.25 + c.p.a.dri * 0.02 : 0.25;
    const ty = this.wy(side, fy + (34 - fy) * cutIn + this.rng.normal(0, 3));
    c.tx = gx;
    c.ty = clamp(ty, 2, 66);
  }

  private shoot(c: Body, xg: number, pressure: number, header = false, setPiece = false) {
    const side = c.side;
    const a = c.p.a;
    const opps = this.opponents(side);
    const gk = opps.find((o) => o.p.slot === 'GK');
    c.st.shots++;
    this.shots[side]++;
    const fx = this.fx(side, c.x);
    const dist = Math.hypot(PITCH_W - fx, 34 - this.fy(side, c.y));
    // diblok bek di jalur tembakan
    const goalX = this.wx(side, PITCH_W);
    for (const o of setPiece ? [] : opps) {
      if (o.p.slot === 'GK') continue;
      const ld = this.laneDist(c.x, c.y, goalX, 34, o.x, o.y);
      if (ld < 1.2 && Math.hypot(o.x - c.x, o.y - c.y) < 9 && this.rng.chance(0.35 + o.p.a.pos * 0.01)) {
        this.log('block', side, c.p.name);
        if (this.rng.chance(0.3)) {
          this.setRestart(side, 'corner', this.rng.chance(0.5) ? 0.5 : PITCH_H - 0.5);
          return;
        }
        this.owner = null;
        this.lastTouch = o;
        this.ball.vx = this.rng.normal(0, 6);
        this.ball.vy = this.rng.normal(0, 6);
        return;
      }
    }
    const skill = header ? a.hea : dist < 18 ? a.fin : a.lon;
    let p = xg * (0.7 + skill * 0.025) * (0.9 + a.cmp * 0.008) * (1 - pressure * 0.25);
    p *= 1.3 - (gk?.p.a.gk ?? 8) * 0.03;
    p *= header ? 0.7 : 1;
    p = clamp(p * SHOT_K, 0.004, 0.8);
    const onTarget = clamp(Math.max(p + 0.12, 0.28 + skill * 0.017 - dist * 0.004 - pressure * 0.08), 0, 0.95);
    const r = this.rng.next();
    const outcome: Shot['outcome'] = r < p ? 'goal' : r < onTarget ? 'save' : 'miss';
    const ty =
      outcome === 'miss'
        ? 34 + (this.rng.chance(0.5) ? 1 : -1) * (GOAL_HALF + 0.5 + this.rng.float(0, 4))
        : 34 + this.rng.float(-GOAL_HALF + 0.4, GOAL_HALF - 0.4);
    const tx = goalX + this.dir(side) * 1.5;
    const d = Math.hypot(tx - c.x, ty - c.y) || 1;
    const speed = header ? 16 : 24 + a.lon * 0.3;
    this.ball.vx = ((tx - c.x) / d) * speed;
    this.ball.vy = ((ty - c.y) / d) * speed;
    const assist = this.lastPasser && this.lastPasser.side === side && this.lastPasser !== c ? this.lastPasser : undefined;
    this.shot = { by: c, outcome, tx, ty, assist };
    if (outcome !== 'miss') {
      c.st.onTarget++;
      this.onTarget[side]++;
    }
    if (assist) assist.st.keyPasses++;
    this.owner = null;
    this.pass = null;
    this.lastTouch = c;
    if (gk) {
      gk.tx = this.wx(gk.side, 1);
      gk.ty = ty;
    }
  }

  // --- bola lepas, umpan, tembakan -------------------------------------------------

  private ballFlight() {
    const ball = this.ball;
    ball.x += ball.vx * DT;
    ball.y += ball.vy * DT;
    const sp = Math.hypot(ball.vx, ball.vy);
    if (!this.shot && sp > 0) {
      const ns = Math.max(0, sp - (this.pass?.air ? 1.5 : 4) * DT);
      ball.vx *= ns / sp;
      ball.vy *= ns / sp;
    }

    if (this.shot) {
      const s = this.shot;
      const side = s.by.side;
      const crossed = this.dir(side) > 0 ? ball.x >= PITCH_W : ball.x <= 0;
      if (!crossed) return;
      const opp = (1 - side) as 0 | 1;
      const gk = this.mates(opp).find((b) => b.p.slot === 'GK');
      if (s.outcome === 'goal') {
        this.score[side]++;
        s.by.st.goals++;
        if (s.assist) s.assist.st.assists++;
        if (gk) gk.st.conceded++;
        this.log('goal', side, s.by.p.name, s.assist?.p.name);
        this.shot = null;
        this.pause = 2.5;
        this.kickoffAfter = opp;
        return;
      }
      if (s.outcome === 'save' && gk) {
        gk.st.saves++;
        this.log('save', side, s.by.p.name);
        this.shot = null;
        if (this.rng.chance(0.42)) {
          this.setRestart(side, 'corner', ball.y);
        } else {
          ball.x = gk.x;
          ball.y = gk.y;
          ball.vx = ball.vy = 0;
          this.gain(gk);
          gk.cool = 1.2;
        }
        return;
      }
      this.log('miss', side, s.by.p.name);
      this.shot = null;
      // sebagian tembakan melenceng sempat mengenai bek: sepak pojok
      if (this.rng.chance(0.3)) this.setRestart(side, 'corner', ball.y);
      else this.setRestart(opp, 'goalkick', 34);
      return;
    }

    // keluar lapangan
    if (ball.y < 0 || ball.y > PITCH_H) {
      const side = this.lastTouch ? ((1 - this.lastTouch.side) as 0 | 1) : this.poss;
      this.setRestart(side, 'throw', ball.y < 0 ? 0 : PITCH_H);
      return;
    }
    if (ball.x < 0 || ball.x > PITCH_W) {
      const defending: 0 | 1 = this.dir(0) > 0 === ball.x > PITCH_W ? 1 : 0;
      const lastDef = this.lastTouch?.side === defending;
      if (lastDef) this.setRestart((1 - defending) as 0 | 1, 'corner', ball.y);
      else this.setRestart(defending, 'goalkick', 34);
      return;
    }

    // siapa yang menguasai bola lepas
    const sp2 = Math.hypot(ball.vx, ball.vy);
    const pass = this.pass;
    let best: Body | null = null;
    let bd = Infinity;
    for (const b of this.active()) {
      if (pass && b === pass.from && sp2 > 3) continue;
      const reach = b.p.slot === 'GK' && this.inOwnBox(b) ? 2.2 : 1.3;
      const d = Math.hypot(b.x - ball.x, b.y - ball.y);
      if (d > reach) continue;
      // umpan lambung hanya bisa diterima di ujungnya
      if (pass?.air && Math.hypot(ball.x - pass.tx, ball.y - pass.ty) > 5 && !(b.p.slot === 'GK' && this.inOwnBox(b))) continue;
      const pri = pass && b === pass.to ? d - 0.6 : d;
      if (pri < bd) {
        bd = pri;
        best = b;
      }
    }
    if (!best) {
      if (pass && sp2 < 0.5) this.pass = null;
      return;
    }
    const a = best.p.a;
    if (pass && best.side !== pass.from.side) {
      // intersep
      const p = best.p.slot === 'GK' ? 0.85 : 0.22 + (a.ant + a.pos) / 100 - sp2 / 70;
      if (this.rng.chance(clamp(p, 0.1, 0.9))) {
        best.st.interceptions++;
        this.gain(best);
      } else if (this.rng.chance(0.4)) {
        this.deflect(best);
      } else {
        // bola lolos dari kaki lawan dan meneruskan perjalanannya
        this.ball.vx *= 0.8;
        this.ball.vy *= 0.8;
        this.ball.x += this.ball.vx * DT * 2;
        this.ball.y += this.ball.vy * DT * 2;
      }
      return;
    }
    const [, pd] = this.nearest(this.opponents(best.side), best.x, best.y);
    const control = 0.72 + (a.ft + a.tec) / 100 - (pd < 1.5 ? 0.12 : 0) - Math.max(0, sp2 - 18) / 60;
    if (this.rng.chance(clamp(control, 0.35, 0.98))) {
      if (pass && pass.from.side === best.side) pass.from.st.passesOk++;
      const wasCross = pass?.cross;
      this.gain(best);
      // sundulan / tembakan langsung dari umpan silang
      const fx = this.fx(best.side, best.x);
      if (wasCross && fx > 90 && best.p.slot !== 'GK') {
        this.shoot(best, this.xgAt(fx, this.fy(best.side, best.y)), 0.5, true);
      }
    } else {
      this.deflect(best);
    }
  }

  private kickoffAfter: 0 | 1 | null = null;

  private deflect(b: Body) {
    this.pass = null;
    this.owner = null;
    this.lastTouch = b;
    this.ball.vx = this.rng.normal(0, 4);
    this.ball.vy = this.rng.normal(0, 4);
  }

  private inOwnBox(b: Body) {
    const fx = this.fx(b.side, b.x);
    return fx < 16.5 && Math.abs(this.fy(b.side, b.y) - 34) < 20;
  }

  private setRestart(side: 0 | 1, kind: Restart['kind'], y: number) {
    const ball = this.ball;
    let x = clamp(ball.x, 0, PITCH_W);
    if (kind === 'goalkick') {
      x = this.wx(side, 6);
      y = 34;
    } else if (kind === 'corner') {
      x = this.wx(side, PITCH_W);
      y = y < 34 ? 0.5 : PITCH_H - 0.5;
    }
    ball.x = x;
    ball.y = clamp(y, 0.5, PITCH_H - 0.5);
    ball.vx = ball.vy = 0;
    this.owner = null;
    this.pass = null;
    this.shot = null;
    this.poss = side;
    if (kind === 'penalty') {
      ball.x = this.wx(side, 94);
      ball.y = 34;
    }
    let direct = false;
    if (kind === 'free') {
      const fx = this.fx(side, ball.x);
      const dist = Math.hypot(PITCH_W - fx, 34 - this.fy(side, ball.y));
      direct = fx > 74 && dist < 30 && this.rng.chance(0.6);
      if (direct) this.log('freekick', side);
    }
    if (kind === 'penalty') this.log('penalty', side);
    if (kind === 'corner') this.log('corner', side);
    const wait = kind === 'throw' ? 1.2 : kind === 'penalty' ? 3 : kind === 'corner' ? 2 : 1.6;
    this.restart = { side, x: ball.x, y: ball.y, wait, kind, direct };
  }

  private doRestart() {
    const r = this.restart!;
    const team = this.mates(r.side);
    let taker: Body | null;
    if (r.kind === 'goalkick') taker = team.find((b) => b.p.slot === 'GK') ?? null;
    else if (r.kind === 'kickoff') taker = team.find((b) => b.p.slot === 'ST') ?? team[team.length - 1];
    else if (r.kind === 'corner') taker = this.best(team.filter((b) => ['RW', 'LW', 'RCM', 'LCM', 'RB', 'LB'].includes(b.p.slot)), (a) => a.cro);
    else if (r.kind === 'penalty') taker = this.best(team, (a) => a.fin * 2 + a.cmp);
    else if (r.direct) taker = this.best(team, (a) => a.lon * 2 + a.tec);
    else taker = this.nearest(team.filter((b) => b.p.slot !== 'GK'), r.x, r.y)[0];
    if (!taker) return;
    taker.tx = r.x;
    taker.ty = r.y;
    r.wait -= DT;
    const d = Math.hypot(taker.x - r.x, taker.y - r.y);
    if (r.wait > 0 && d > 1) return;
    if (r.kind === 'corner' && r.wait > -4) {
      const cb = team.find((b) => b.p.slot === 'RCB');
      if (cb && Math.abs(cb.x - cb.tx) > 5) return; // tunggu bek tengah naik
    }
    if (d > 1) {
      taker.x = r.x;
      taker.y = r.y;
    }
    this.restart = null;
    this.gain(taker);
    taker.cool = r.kind === 'kickoff' ? 0.2 : 0.4;
    if (r.kind === 'kickoff') this.log('kickoff', r.side);
    else if (r.kind === 'penalty') this.shoot(taker, 0.76, 0, false, true);
    else if (r.direct) this.shoot(taker, 0.06 + (taker.p.a.lon - 10) * 0.004, 0, false, true);
    else if (r.kind === 'corner') {
      // umpan silang ke kotak: pemain dengan sundulan dan fisik bagus paling sering dicari
      const box = team.filter((b) => b !== taker && b.p.slot !== 'GK' && this.fx(r.side, b.x) > 84);
      let total = 0;
      const w = box.map((b) => {
        const v = (b.p.a.hea + b.p.a.str / 2) ** 2;
        total += v;
        return v;
      });
      let pick = this.rng.float(0, total);
      const target = box.find((_, i) => (pick -= w[i]) <= 0);
      if (target) this.passTo(taker, target, true);
    }
  }

  private best(list: Body[], f: (a: EAttrs) => number): Body | null {
    let b: Body | null = null;
    for (const q of list) if (q.p.slot !== 'GK' && (!b || f(q.p.a) > f(b.p.a))) b = q;
    return b;
  }

  // --- tekel ------------------------------------------------------------------------

  private tackles() {
    const c = this.owner;
    if (!c || this.restart) return;
    for (const d of this.opponents(c.side)) {
      if (d.cool > 0) continue;
      const dist = Math.hypot(d.x - c.x, d.y - c.y);
      if (dist > 1.6) continue;
      d.cool = 0.7;
      const p = 0.1 + (d.p.a.tck + d.p.a.ant) / 140 - (c.p.a.dri + c.p.a.str) / 260;
      if (this.rng.chance(clamp(p, 0.04, 0.45))) {
        d.st.tackles++;
        c.st.lost++;
        if (this.rng.chance(0.65)) this.gain(d);
        else this.deflect(d);
        return;
      }
      if (this.rng.chance(FOUL)) {
        // pelanggaran: penalti kalau di kotak, selain itu tendangan bebas
        const fx = this.fx(c.side, c.x);
        const inBox = fx > 88.5 && Math.abs(this.fy(c.side, c.y) - 34) < 20;
        this.setRestart(c.side, inBox && this.rng.chance(0.6) ? 'penalty' : 'free', c.y);
        return;
      }
      c.st.dribbles += dist < 1.2 ? 1 : 0;
    }
  }

  // --- langkah simulasi --------------------------------------------------------------

  step() {
    if (this.done) return;
    if (this.pause > 0) {
      this.pause -= DT;
      for (const b of this.active()) {
        b.vx *= 0.8;
        b.vy *= 0.8;
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
      const out = this.bodies.find((b) => b.on && b.side === sub.side && b.p.slot === team.sub!.slot);
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
      this.refresh();
      this.log('sub', sub.side, sub.p.name, out.p.name);
    }

    if (this.t >= HALF && this.half === 1) {
      this.half = 2;
      this.log('half', 0);
      this.kickoff(1);
    }
    if (this.t >= FULL) {
      this.done = true;
      this.log('full', 0);
      return;
    }

    for (const b of this.active()) {
      b.cool = Math.max(0, b.cool - DT);
      if (b.run > 0) b.run -= DT;
      else if (this.poss === b.side && b.p.slot !== 'GK' && this.rng.chance(b.p.a.otb * 0.0012)) {
        const mid = b.p.slot.endsWith('CM');
        const fwd = b.p.slot === 'ST' || b.p.slot === 'RW' || b.p.slot === 'LW';
        const bfx = this.fx(b.side, this.ball.x);
        if (fwd) b.run = b.p.slot === 'ST' ? 2.5 : 3.2;
        else if (mid && bfx > 55 && b.p.slot !== 'CM') b.run = 4.5;
      }
    }

    this.targets();
    if (this.restart) this.doRestart();
    else if (this.owner && this.owner.cool <= 0) this.decide(this.owner);

    for (const b of this.active()) this.move(b);

    if (this.owner) {
      const o = this.owner;
      const sp = Math.hypot(o.vx, o.vy);
      const fdx = sp > 0.3 ? o.vx / sp : this.dir(o.side);
      const fdy = sp > 0.3 ? o.vy / sp : 0;
      this.ball.x = o.x + fdx * 0.7;
      this.ball.y = o.y + fdy * 0.7;
      this.ball.vx = this.ball.vy = 0;
      this.tackles();
    } else if (!this.restart) {
      this.ballFlight();
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
    };
  }
}

/** Pengali peluang gol dan keinginan menembak, dikalibrasi supaya statistik laga realistis */
export let SHOT_K = 1.08;
let SHOOT_W = 15;
let PROG_W = 30;
let XG_PASS_W = 4;
let MARK_K = 0.5;
let ST_DROP = 12;
let FOUL = 0.12;
export function setShotK(k: number, shoot = SHOOT_W, prog = PROG_W, xgPass = XG_PASS_W, mark = MARK_K, drop = ST_DROP, foul = FOUL) {
  MARK_K = mark;
  ST_DROP = drop;
  FOUL = foul;
  SHOT_K = k;
  SHOOT_W = shoot;
  PROG_W = prog;
  XG_PASS_W = xgPass;
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
  r += s.tackles * 0.12 + s.interceptions * 0.1 + s.dribbles * 0.05 - s.lost * 0.06;
  r += my > their ? 0.3 : my < their ? -0.3 : 0;
  if (b.p.slot === 'GK') r += s.saves * 0.3 - s.conceded * 0.35 + (their === 0 ? 0.6 : 0);
  else if (['RB', 'RCB', 'LCB', 'LB'].includes(b.p.slot)) r += (their === 0 ? 0.4 : 0) - their * 0.12;
  r = 6.5 + (r - 6.5) * (0.4 + 0.6 * Math.min(1, mins));
  return Math.round(clamp(r, 3, 10) * 10) / 10;
}

/** Jalankan pertandingan penuh tanpa tampilan */
export function playEngine(input: EngineInput): EngineResult {
  return new Match(input).run();
}
