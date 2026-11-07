// Layar pertandingan 2D. Laga diputar ulang dari input match engine yang sama dengan
// simulasi mingguan, jadi skor dan statistik di layar identik dengan yang tercatat.

import { SLOT_LABEL, type Slot, type Spot } from '../game/sim/formation';
import { ROLES } from '../game/data/roles';
import { DUTY_LABEL, mentalityLabel } from '../game/sim/tactics';
import { OOP_LABEL, defaultOop, type OopRole } from '../game/sim/roleplay';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from './store';
import {
  DT,
  GOAL_HALF,
  Match,
  NET_DEPTH,
  PITCH_H,
  PITCH_W,
  minutesPlayed,
  possessionPct,
  rate,
  type Body,
  type EngineInput,
  type EngineResult,
  type MatchEvent,
} from '../game/sim/engine';

type Phase = 'lineup' | 'play' | 'end';
const SPEEDS = [1, 2, 4, 8] as const;
/** Kecepatan 1x = dua kali waktu permainan per detik nyata (1x lama terasa seperti gerak lambat) */
const BASE_RATE = 2;
/** Ruang di luar garis (meter) supaya gawang, jaring & bola yang keluar tetap terlihat */
const EDGE = 3;

/** Dipasang sekali di App: muncul saat pemain menonton laga */
export function MatchLayer() {
  const watching = useGame((s) => s.watching);
  const sim = useGame((s) => s.career?.lastSim);
  if (!watching || !sim) return null;
  return <MatchViewer key={sim.date} input={sim.input} />;
}

// --- warna ---------------------------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
const dist = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const GRASS = '#2f7d46';

interface Kits {
  shirt: [string, string];
  keeper: [string, string];
  /** warna seragam wasit & asisten wasit */
  ref: string;
}

/** Warna kaus kedua tim (tim tamu ganti kaus kalau mirip), kiper diberi warna yang beda dari semuanya */
function kits(input: EngineInput): Kits {
  const home = dist(input.home.color, GRASS) < 70 ? input.home.color2 : input.home.color;
  const options = [input.away.color, input.away.color2, '#f4f4f4', '#1c1c1c', '#f5c542'];
  const away = options.find((c) => dist(c, home) > 120 && dist(c, GRASS) > 70) ?? '#f4f4f4';
  const gk = ['#e8e337', '#38c7d6', '#ff7ab8', '#7a3fbf', '#2b2b2b', '#f4f4f4'];
  const ok = (c: string, taken: string[]) => [...taken, GRASS].every((t) => dist(c, t) > 110);
  const k1 = gk.find((c) => ok(c, [home, away])) ?? gk[0];
  const k2 = gk.find((c) => c !== k1 && ok(c, [home, away, k1])) ?? gk[1];
  const refs = ['#151515', '#d7f23a', '#ff4fa3', '#f4f4f4', '#38c7d6'];
  const ref = refs.find((c) => ok(c, [home, away, k1, k2])) ?? refs.find((c) => ok(c, [home, away])) ?? refs[0];
  return { shirt: [home, away], keeper: [k1, k2], ref };
}

// --- teks kejadian -------------------------------------------------------------------

function eventText(e: MatchEvent, names: [string, string]): string | null {
  const team = names[e.side];
  switch (e.kind) {
    case 'goal':
      if (e.og) return `⚽ GOL! Bunuh diri ${e.name} (untuk ${team})`;
      return `⚽ GOL! ${e.name} (${team})${e.assist ? `, assist ${e.assist}` : ''}`;
    case 'offside':
      return `🚩 Offside: ${e.name} (${team})`;
    case 'penalty':
      return `Penalti untuk ${team}!`;
    case 'freekick':
      return `Tendangan bebas berbahaya untuk ${team}`;
    case 'save':
      return `Tembakan ${e.name} ditepis kiper`;
    case 'miss':
      return `Tembakan ${e.name} melenceng`;
    case 'sub':
      return `🔁 ${e.name} masuk menggantikan ${e.assist} (${team})`;
    case 'yellow':
      if (e.dive) return `🟨 Kartu kuning untuk diving: ${e.name} (${team})`;
      if (e.dissent) return `🟨 Kartu kuning karena protes: ${e.name} (${team})`;
      return `🟨 Kartu kuning: ${e.name} (${team})`;
    case 'red': {
      const why = e.dive ? ' karena diving' : e.dissent ? ' karena protes' : '';
      return e.second ? `🟨🟥 Kartu kuning kedua${why}, ${e.name} diusir! (${team})` : `🟥 Kartu merah langsung: ${e.name} (${team})`;
    }
    case 'injury':
      return `🚑 ${e.name} cedera dan harus ditarik keluar (${team})`;
    case 'half':
      return e.min > 90 ? 'Jeda perpanjangan waktu' : 'Turun minum';
    case 'full':
      return 'Peluit panjang';
    case 'added':
      return `⏱️ Tambahan waktu ${e.plus} menit`;
    case 'tactic':
      return `📋 ${e.note} (${team})`;
    case 'extra':
      return '⏱️ Masih imbang: perpanjangan waktu 2 x 15 menit';
    case 'pens':
      return `Adu penalti! ${team} menendang lebih dulu`;
    case 'shootout':
      return `${e.scored ? '✅' : '❌'} ${e.name} (${team}) ${e.scored ? 'mencetak gol' : 'gagal'} · ${e.pens![0]}-${e.pens![1]}`;
    default:
      return null;
  }
}

const SHOWN = new Set(['goal', 'penalty', 'freekick', 'save', 'miss', 'offside', 'sub', 'half', 'full', 'yellow', 'red', 'injury', 'added', 'tactic', 'extra', 'pens', 'shootout']);
/** Menit event: 67' atau 90+3' (event 'added' ditulis di menit 45/90) */
const minLabel = (e: MatchEvent) => (e.kind === 'shootout' || e.kind === 'pens' ? 'Pen' : e.plus && e.kind !== 'added' ? `${e.min}+${e.plus}'` : `${e.min}'`);

const RESTART_TEXT: Record<string, string> = {
  throw: 'Lemparan ke dalam',
  corner: 'Tendangan sudut',
  goalkick: 'Tendangan gawang',
  free: 'Tendangan bebas',
  penalty: 'Penalti',
};

/** Bola mati yang sedang berlangsung, untuk label kecil di atas lapangan */
function restartLabel(match: Match, names: [string, string]): string | null {
  // pergantian pemain sedang berlangsung: jam berhenti sampai pengganti di posisinya
  const q = match.subbing[0];
  if (q) return `🔁 Pergantian pemain · ${names[q.sub.side]}`;
  const r = match.dead ?? match.restart;
  if (!r || !RESTART_TEXT[r.kind]) return null;
  return `${RESTART_TEXT[r.kind]} · ${names[r.side]}`;
}

// --- komponen utama ------------------------------------------------------------------

function MatchViewer({ input }: { input: EngineInput }) {
  const close = useGame((s) => s.closeMatch);
  const autoWatch = useGame((s) => s.autoWatch);
  const setAutoWatch = useGame((s) => s.setAutoWatch);
  const [phase, setPhase] = useState<Phase>('lineup');
  const [round, setRound] = useState(0); // naik saat ditonton ulang
  const match = useMemo(() => new Match(input), [input, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [result, setResult] = useState<EngineResult | null>(null);
  const names: [string, string] = [input.home.name, input.away.name];
  const kit = useMemo(() => kits(input), [input]);
  const colors = kit.shirt;
  const sides = [input.home, input.away];
  const mySide: 0 | 1 =
    sides.findIndex((t) => t.xi.some((p) => p.user) || !!t.sub?.player.user || !!t.bench?.some((p) => p.user)) === 1 ? 1 : 0;
  const userStarts = sides.some((t) => t.xi.some((p) => p.user));
  const me =
    [...input.home.xi, ...input.away.xi].find((p) => p.user) ??
    (input.home.sub ?? input.away.sub)?.player ??
    [...(input.home.bench ?? []), ...(input.away.bench ?? [])].find((p) => p.user);

  const skip = () => {
    while (!match.done) match.step();
    setResult(match.result());
    setPhase('end');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  return (
    <div className="mv" role="dialog" aria-modal="true" aria-label={`${names[0]} lawan ${names[1]}`}>
      <div className={`mv-inner ${phase === 'play' ? 'wide' : ''}`}>
        <button className="icon mv-close" onClick={close} aria-label="Tutup layar pertandingan">
          ✕
        </button>
        {phase === 'lineup' && (
          <Lineup
            input={input}
            colors={colors}
            userStarts={userStarts}
            hasMe={!!me}
            onStart={() => setPhase('play')}
            onSkip={skip}
          />
        )}
        {phase === 'play' && (
          <Live
            match={match}
            names={names}
            colors={colors}
            keepers={kit.keeper}
            referee={kit.ref}
            mySide={mySide}
            onEnd={() => {
              setResult(match.result());
              setPhase('end');
            }}
            onSkip={skip}
          />
        )}
        {phase === 'end' && result && (
          <Summary
            match={match}
            result={result}
            names={names}
            colors={colors}
            mySide={mySide}
            meId={me?.id}
            onReplay={() => {
              setResult(null);
              setRound((r) => r + 1);
              setPhase('play');
            }}
            onClose={close}
          />
        )}
        <label className="mv-auto small muted">
          <input type="checkbox" checked={autoWatch} onChange={(e) => setAutoWatch(e.target.checked)} /> Tonton otomatis
          setiap kamu masuk skuad
        </label>
      </div>
    </div>
  );
}

// --- susunan pemain ------------------------------------------------------------------


function Lineup({
  input,
  colors,
  userStarts,
  hasMe,
  onStart,
  onSkip,
}: {
  input: EngineInput;
  colors: [string, string];
  userStarts: boolean;
  hasMe: boolean;
  onStart: () => void;
  onSkip: () => void;
}) {
  const startRef = useRef<HTMLButtonElement>(null);
  useEffect(() => startRef.current?.focus(), []);
  const mine = [input.home, input.away].flatMap((t) => [...t.xi, ...(t.bench ?? []), ...(t.sub ? [t.sub.player] : [])]).find((p) => p.user);
  const roleText = (p: { role?: string; duty?: keyof typeof DUTY_LABEL; slot?: string; oop?: OopRole }) => {
    if (!p.role) return '';
    const oop = p.oop ?? (p.slot ? defaultOop(p.role, p.duty, p.slot) : undefined);
    return `${ROLES[p.role]?.name ?? p.role}${p.duty ? ` (${DUTY_LABEL[p.duty]})` : ''}${oop ? `, tanpa bola: ${OOP_LABEL[oop].toLowerCase()}` : ''}`;
  };
  return (
    <div className="mv-lineup">
      <h2>Susunan pemain</h2>
      <p className="mv-coach">
        {userStarts
          ? 'Pelatih memasangmu sebagai pemain inti hari ini. Tunjukkan kemampuanmu!'
          : hasMe
            ? 'Kamu mulai dari bangku cadangan. Tetap siap, pelatih bisa memanggilmu kapan saja.'
            : 'Kamu mulai dari bangku cadangan hari ini.'}
        {mine?.role && (
          <>
            {' '}
            Instruksi pelatih: main sebagai <b>{roleText(mine)}</b>
            {mine.fam !== undefined && <span className="muted"> · pemahaman taktikmu {Math.round(mine.fam * 100)}%</span>}.
          </>
        )}
      </p>
      <div className="mv-teams">
        {[input.home, input.away].map((t, side) => (
          <div key={t.id} className="mv-team">
            <h3>
              <span className="mv-kit" style={{ background: colors[side] }} aria-hidden />
              {t.name} <span className="muted">{side === 0 ? '(kandang)' : '(tandang)'}</span>
              {t.formation && <span className="muted small"> · {t.formation}</span>}
              {t.tactic && <span className="muted small"> · {mentalityLabel(t.tactic.mentality).toLowerCase()}</span>}
            </h3>
            <ol>
              {t.xi.map((p) => (
                <li key={p.id} className={p.user ? 'me' : ''}>
                  <span className="num mv-n">{p.num}</span>
                  <span>{p.name}</span>
                  <span className="muted small" title={roleText(p)}>
                    {SLOT_LABEL[p.slot] ?? p.slot}
                    {p.role && ` · ${ROLES[p.role]?.short ?? p.role}${p.duty ? `-${p.duty}` : ''}`}
                  </span>
                </li>
              ))}
            </ol>
            {(!!t.bench?.length || !!t.sub) && (
              <p className="small muted mv-bench">
                Cadangan:{' '}
                {[...(t.sub ? [t.sub.player] : []), ...(t.bench ?? [])].map((p, i) => (
                  <span key={p.id} className={p.user ? 'me' : ''}>
                    {i > 0 && ', '}
                    {p.name}
                  </span>
                ))}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="mv-actions">
        <button ref={startRef} className="primary" onClick={onStart}>
          Mulai pertandingan
        </button>
        <button className="ghost" onClick={onSkip}>
          Lewati, lihat hasil
        </button>
      </div>
      <p className="muted small">Satu babak sekitar 2,5 menit di kecepatan normal. Bisa dipercepat atau dilewati.</p>
    </div>
  );
}

// --- pertandingan berjalan -----------------------------------------------------------

interface Snap {
  x: number;
  y: number;
}

function Live({
  match,
  names,
  colors,
  keepers,
  referee,
  mySide,
  onEnd,
  onSkip,
}: {
  match: Match;
  names: [string, string];
  colors: [string, string];
  keepers: [string, string];
  referee: string;
  mySide: 0 | 1;
  onEnd: () => void;
  onSkip: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState({ min: "1'", half: 1, score: [0, 0] as [number, number], events: 0, rs: null as string | null });
  const [banner, setBanner] = useState<string | null>(null);
  const [tab, setTab] = useState<'home' | 'away' | 'stats' | 'events'>(mySide ? 'away' : 'home');
  // kontrol ruang (v17): warnai tiap petak dengan warna tim yang lebih dulu sampai di sana
  const [space, setSpace] = useState(false);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  const spaceRef = useRef(space);
  speedRef.current = speed;
  pausedRef.current = paused;
  spaceRef.current = space;
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const namesRef = useRef(names);
  namesRef.current = names;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    const prev = new WeakMap<Body, Snap>();
    const prevBall = { x: match.ball.x, y: match.ball.y, z: match.ball.z };
    const prevRef = match.officials.map((o) => ({ x: o.x, y: o.y }));
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let holdUntil = 0; // jeda turun minum / gol (waktu nyata)
    // langkah simulasi tersisa sebelum layar berhenti sejenak setelah gol (jam laga berhenti saat selebrasi)
    let goalHoldAt: number | null = null;
    let seenEvents = match.events.length;
    let half = match.half;
    let ended = false;
    let geo = layout();

    function layout() {
      const w = wrap.clientWidth;
      const vertical = w < 560;
      // lapangan dibuat sebesar mungkin supaya jarak antarpemain terasa seperti lapangan 105×68 m sungguhan
      // layar lebar: lapangan + papan skor + teks kejadian harus muat tanpa menggulir
      const maxH = Math.max(300, vertical ? window.innerHeight * 0.72 : Math.min(window.innerHeight * 0.8, window.innerHeight - 150));
      const pad = 6;
      const long = PITCH_W + 2 * EDGE; // ruang untuk gawang & bola yang keluar lapangan
      const short = PITCH_H + 2 * EDGE;
      let s = vertical ? (w - 2 * pad) / short : (w - 2 * pad) / long;
      const h = (vertical ? long : short) * s + 2 * pad;
      if (h > maxH) s *= (maxH - 2 * pad) / (h - 2 * pad);
      const cw = Math.round((vertical ? short : long) * s + 2 * pad);
      const ch = Math.round((vertical ? long : short) * s + 2 * pad);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { s, pad, vertical, cw, ch };
    }

    /** Koordinat lapangan ke piksel */
    function P(x: number, y: number): [number, number] {
      const { s, pad, vertical } = geo;
      if (vertical) return [pad + (y + EDGE) * s, pad + (PITCH_W + EDGE - x) * s];
      return [pad + (x + EDGE) * s, pad + (y + EDGE) * s];
    }

    function snapshot() {
      for (const b of match.bodies) prev.set(b, { x: b.x, y: b.y });
      prevBall.x = match.ball.x;
      prevBall.y = match.ball.y;
      prevBall.z = match.ball.z;
      match.officials.forEach((o, i) => {
        prevRef[i].x = o.x;
        prevRef[i].y = o.y;
      });
    }

    function drawPitch() {
      const { s, cw, ch } = geo;
      ctx.fillStyle = '#25663a';
      ctx.fillRect(0, 0, cw, ch);
      // garis-garis rumput
      for (let i = 0; i < 12; i++) {
        if (i % 2) continue;
        const x0 = (PITCH_W / 12) * i;
        const [ax, ay] = P(x0, 0);
        const [bx, by] = P(x0 + PITCH_W / 12, PITCH_H);
        ctx.fillStyle = GRASS;
        ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      }
      if (spaceRef.current) {
        // kontrol ruang: makin pekat, makin jelas tim itu lebih dulu sampai di petak ini
        const { nx, ny, home } = match.pitchControl();
        const w = PITCH_W / nx;
        const h = PITCH_H / ny;
        for (let j = 0; j < ny; j++) {
          for (let i = 0; i < nx; i++) {
            const c = home[j * nx + i];
            const k = Math.abs(c - 0.5) * 2;
            if (k < 0.1) continue;
            const [ax, ay] = P(i * w, j * h);
            const [bx, by] = P((i + 1) * w, (j + 1) * h);
            ctx.globalAlpha = 0.42 * k;
            ctx.fillStyle = colors[c > 0.5 ? 0 : 1];
            ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
          }
        }
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.lineWidth = Math.max(1, s * 0.18);
      const rect = (x0: number, y0: number, x1: number, y1: number) => {
        const [ax, ay] = P(x0, y0);
        const [bx, by] = P(x1, y1);
        ctx.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      };
      const line = (x0: number, y0: number, x1: number, y1: number) => {
        const [ax, ay] = P(x0, y0);
        const [bx, by] = P(x1, y1);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      };
      rect(0, 0, PITCH_W, PITCH_H);
      line(PITCH_W / 2, 0, PITCH_W / 2, PITCH_H);
      const [cx, cy] = P(PITCH_W / 2, PITCH_H / 2);
      ctx.beginPath();
      ctx.arc(cx, cy, 9.15 * s, 0, Math.PI * 2);
      ctx.stroke();
      for (const left of [true, false]) {
        const gx = left ? 0 : PITCH_W;
        const d = left ? 1 : -1;
        rect(gx, 34 - 20.16, gx + d * 16.5, 34 + 20.16);
        rect(gx, 34 - 9.16, gx + d * 5.5, 34 + 9.16);
        const [px, py] = P(gx + d * 11, 34);
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1.2, s * 0.25), 0, Math.PI * 2);
        ctx.fill();
        // gawang + jaring di belakang garis
        ctx.save();
        const [n0x, n0y] = P(gx, 34 - GOAL_HALF);
        const [n1x, n1y] = P(gx - d * NET_DEPTH, 34 + GOAL_HALF);
        const nx = Math.min(n0x, n1x);
        const ny = Math.min(n0y, n1y);
        const nw = Math.abs(n1x - n0x);
        const nh = Math.abs(n1y - n0y);
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        ctx.fillRect(nx, ny, nw, nh);
        ctx.beginPath();
        ctx.rect(nx, ny, nw, nh);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.lineWidth = 0.6;
        const step = Math.max(2.5, s * 0.45);
        for (let k = -nh; k < nw + nh; k += step) {
          ctx.beginPath();
          ctx.moveTo(nx + k, ny);
          ctx.lineTo(nx + k + nh, ny + nh);
          ctx.moveTo(nx + k + nh, ny);
          ctx.lineTo(nx + k, ny + nh);
          ctx.stroke();
        }
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = Math.max(1.5, s * 0.3);
        rect(gx, 34 - GOAL_HALF, gx - d * NET_DEPTH, 34 + GOAL_HALF);
        ctx.restore();
      }
    }

    function drawPlayers(alpha: number) {
      const { s } = geo;
      // titik pemain kira-kira selebar 1,6 m: cukup untuk nomor punggung tanpa membuat lapangan terlihat sempit
      const r = Math.max(5.5, s * 0.8);
      ctx.font = `700 ${Math.max(8, Math.round(r * 1.15))}px 'Barlow Condensed', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // wasit & asisten wasit: titik kecil tanpa nomor, asisten membawa bendera
      const rr = r * 0.72;
      match.officials.forEach((o, i) => {
        const p0 = prevRef[i] ?? o;
        const [x, y] = P(p0.x + (o.x - p0.x) * alpha, p0.y + (o.y - p0.y) * alpha);
        if (o.role !== 'ref') {
          const up = o.role === 'ar1' ? -1 : 1;
          ctx.strokeStyle = '#222';
          ctx.lineWidth = Math.max(1, rr * 0.18);
          ctx.beginPath();
          ctx.moveTo(x + rr * 0.6, y);
          ctx.lineTo(x + rr * 0.6, y + up * rr * 2);
          ctx.stroke();
          ctx.fillStyle = i === 1 ? '#f5c542' : '#e5484d';
          ctx.fillRect(x + rr * 0.6, y + up * rr * 2 - (up < 0 ? 0 : rr * 0.8), rr * 1.1, rr * 0.8);
        }
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fillStyle = referee;
        ctx.fill();
        ctx.lineWidth = Math.max(1, rr * 0.22);
        ctx.strokeStyle = lum(referee) > 0.6 ? 'rgba(0,0,0,.7)' : 'rgba(255,255,255,.85)';
        ctx.stroke();
      });
      let user: [number, number, string] | null = null;
      for (const b of match.bodies) {
        // pemain yang diganti masih digambar saat berjalan keluar lapangan; pengganti menunggu di pinggir lapangan
        if (!b.on && !b.leaving && !b.waiting) continue;
        const p0 = prev.get(b) ?? b;
        const [x, y] = P(p0.x + (b.x - p0.x) * alpha, p0.y + (b.y - p0.y) * alpha);
        const fill = b.p.slot === 'GK' ? keepers[b.side] : colors[b.side];
        // pemain cedera terkapar: digambar pudar dengan tanda palang merah
        const hurt = b.hurt >= 0;
        ctx.globalAlpha = hurt ? 0.55 : b.leaving ? 0.7 : b.waiting ? 0.9 : 1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.18);
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.stroke();
        ctx.fillStyle = lum(fill) > 0.6 ? '#111' : '#fff';
        ctx.fillText(String(b.p.num), x, y + 0.5);
        ctx.globalAlpha = 1;
        if (hurt) {
          const k = r * 0.9;
          const cx = x + r * 0.9;
          const cy = y - r * 0.9;
          ctx.fillStyle = '#fff';
          ctx.fillRect(cx - k / 2, cy - k / 2, k, k);
          ctx.fillStyle = '#e5484d';
          ctx.fillRect(cx - k * 0.12, cy - k * 0.38, k * 0.24, k * 0.76);
          ctx.fillRect(cx - k * 0.38, cy - k * 0.12, k * 0.76, k * 0.24);
        }
        // pemain yang sedang frustrasi (dilanggar terus, peluang gagal, timnya tertinggal): titik merah kecil
        if (!hurt && b.on && b.frus > 0.6) {
          ctx.fillStyle = '#ff5a36';
          ctx.beginPath();
          ctx.arc(x - r * 0.95, y - r * 0.95, r * 0.34, 0, Math.PI * 2);
          ctx.fill();
        }
        if (b.p.user) user = [x, y, b.p.name];
      }
      // papan pergantian ofisial keempat: nomor merah keluar, nomor hijau masuk
      for (const q of match.subbing) {
        if (!q.sub.waiting) continue;
        const [x, y] = P(q.sub.x, q.sub.y);
        const fs = Math.max(10, Math.round(r * 1.2));
        ctx.font = `700 ${fs}px 'Barlow Condensed', system-ui, sans-serif`;
        const t1 = String(q.out.p.num);
        const t2 = String(q.sub.p.num);
        const w1 = ctx.measureText(t1).width;
        const w2 = ctx.measureText(t2).width;
        const bw = w1 + w2 + fs * 0.9;
        const bh = fs * 1.25;
        // di layar tegak garis samping bawah ada di tepi kanan: papan digambar di sebelah kiri pemain
        const bx = geo.vertical ? x - r * 1.4 - bw : x + r * 1.4;
        const by = y - bh / 2;
        ctx.fillStyle = 'rgba(10,12,16,.9)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = 'rgba(255,255,255,.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ff5a5f';
        ctx.fillText(t1, bx + fs * 0.3, by + bh / 2 + 0.5);
        ctx.fillStyle = '#4ade80';
        ctx.fillText(t2, bx + fs * 0.6 + w1, by + bh / 2 + 0.5);
        ctx.textAlign = 'center';
      }
      if (user) {
        const [x, y, name] = user;
        ctx.beginPath();
        ctx.arc(x, y, r + Math.max(2.5, r * 0.4), 0, Math.PI * 2);
        ctx.lineWidth = Math.max(2, r * 0.35);
        ctx.strokeStyle = '#f5c542';
        ctx.stroke();
        ctx.font = `600 ${Math.max(11, Math.round(r * 1.1))}px 'Barlow', system-ui, sans-serif`;
        const tw = ctx.measureText(name).width + 8;
        const ly = y - r * 2.6;
        ctx.fillStyle = 'rgba(10,12,16,.8)';
        ctx.fillRect(x - tw / 2, ly - 8, tw, 16);
        ctx.fillStyle = '#f5c542';
        ctx.fillText(name, x, ly);
      }
      // bola
      // bola digambar di posisi aslinya (dilihat dari atas); makin tinggi makin besar dan
      // bayangannya makin jauh, jadi bola yang lewat di atas mistar tidak terlihat masuk gawang
      const bx = prevBall.x + (match.ball.x - prevBall.x) * alpha;
      const by = prevBall.y + (match.ball.y - prevBall.y) * alpha;
      const bz = Math.max(0, prevBall.z + (match.ball.z - prevBall.z) * alpha);
      const [px, py] = P(bx, by);
      const base = Math.max(3, s * 0.55);
      const br = base * (1 + Math.min(bz, 12) * 0.07);
      const off = 1 + Math.min(bz, 15) * s * 0.35;
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0.12, 0.4 - bz * 0.025)})`;
      ctx.beginPath();
      ctx.ellipse(px + off, py + off, base, base * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px, py, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#222';
      ctx.stroke();
    }

    function frame(now: number) {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && now >= holdUntil && !match.done) {
        acc += dt * speedRef.current * BASE_RATE;
        let n = 0;
        while (acc >= DT && !match.done && n < 400) {
          snapshot();
          match.step();
          acc -= DT;
          n++;
          if (match.events.length > seenEvents) {
            const fresh = match.events.slice(seenEvents);
            seenEvents = match.events.length;
            const goal = fresh.find((e) => e.kind === 'goal');
            if (goal) {
              setBanner(goal.og ? `GOL! (bunuh diri ${goal.name})` : `GOL! ${goal.name}`);
              // biarkan bola terlihat masuk ke jaring dulu, baru layar berhenti sejenak
              goalHoldAt = 5;
            }
          }
          if (goalHoldAt !== null && --goalHoldAt <= 0) {
            goalHoldAt = null;
            holdUntil = now + 1400;
            snapshot(); // gambar posisi sekarang (bola di dalam jaring), bukan posisi sebelum gol
            acc = 0;
            break;
          }
          if (match.half !== half) {
            half = match.half;
            setBanner(half === 2 ? 'Turun minum' : half === 3 ? 'Perpanjangan waktu' : half === 4 ? 'Jeda perpanjangan waktu' : 'Adu penalti');
            holdUntil = now + 1800;
            snapshot();
            acc = 0;
            break;
          }
        }
      }
      if (now >= holdUntil && goalHoldAt === null) setBanner((b) => (b ? null : b));
      drawPitch();
      drawPlayers(Math.min(1, acc / DT));
      setHud((h) => {
        const min = match.clockLabel();
        const rs = restartLabel(match, namesRef.current);
        if (h.min === min && h.score[0] === match.score[0] && h.score[1] === match.score[1] && h.events === match.events.length && h.half === match.half && h.rs === rs)
          return h;
        return { min, half: match.half, score: [match.score[0], match.score[1]], events: match.events.length, rs };
      });
      if (match.done && !ended && now >= holdUntil) {
        ended = true;
        setTimeout(() => endRef.current(), 900);
      }
      raf = requestAnimationFrame(frame);
    }

    const onResize = () => {
      geo = layout();
    };
    window.addEventListener('resize', onResize);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [match, colors, keepers, referee]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const feed = match.events
    .map((e) => ({ e, text: SHOWN.has(e.kind) ? eventText(e, names) : null }))
    .filter((x) => x.text)
    .reverse();
  const progress = Math.min(1, match.t / match.length());
  const ticker = banner ?? hud.rs ?? feed[0]?.text ?? 'Kick-off!';

  return (
    <div className={`mv-live tab-${tab}`}>
      <div className="mv-top">
        <Scoreboard names={names} colors={colors} score={hud.score} mySide={mySide}>
          <span className="mv-clock num">{match.done ? 'Selesai' : hud.min}</span>
          <span className="muted small">{match.periodLabel()}</span>
        </Scoreboard>
        <div className="mv-controls">
          <button className="chip" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? '▶ Lanjut' : '⏸ Jeda'}
          </button>
          <div className="mv-speeds" role="group" aria-label="Kecepatan">
            {SPEEDS.map((s) => (
              <button key={s} className={`chip ${speed === s ? 'sel' : ''}`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <button
            className={`chip ${space ? 'sel' : ''}`}
            aria-pressed={space}
            onClick={() => setSpace((v) => !v)}
            title="Kontrol ruang: tiap petak diberi warna tim yang lebih dulu bisa sampai di sana"
          >
            Ruang
          </button>
          <button className="ghost" onClick={onSkip}>
            Lewati ke akhir
          </button>
        </div>
      </div>
      <div className="mv-progress" aria-hidden>
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="mv-board">
        <div className="mv-center">
          <div className="mv-pitch" ref={wrapRef}>
            <canvas ref={canvasRef} role="img" aria-label={`Pertandingan menit ${hud.min.replace("'", '')}, skor ${hud.score[0]}-${hud.score[1]}`} />
            {banner && <div className="mv-banner">{banner}</div>}
          </div>
          <div className={`mv-ticker ${banner ? 'hot' : ''}`} aria-live="polite">
            {ticker}
          </div>
        </div>
        <div className="mv-tabs" role="tablist" aria-label="Panel pertandingan">
          {(
            [
              ['home', names[0]],
              ['away', names[1]],
              ['stats', 'Statistik'],
              ['events', 'Kejadian'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`chip ${tab === k ? 'sel' : ''}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="mv-side left">
          <TeamSheet match={match} side={0} color={colors[0]} keeper={keepers[0]} tick={hud.min} cls="p-home" />
          <LiveStats match={match} names={names} colors={colors} tick={hud.min} />
        </div>
        <div className="mv-side right">
          <TeamSheet match={match} side={1} color={colors[1]} keeper={keepers[1]} tick={hud.min} cls="p-away" />
          <section className="mv-panel p-events">
            <h3>Kejadian</h3>
            <ul className="mv-feed small">
              {feed.map(({ e, text }, i) => (
                <li key={`${e.t}-${i}`} className={e.kind === 'goal' ? 'goal' : ''}>
                  <span className="num muted">{minLabel(e)}</span> {text}
                </li>
              ))}
              {!feed.length && <li className="muted">Kick-off!</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Nama pendek untuk papan formasi: "Haikal", "A. Hamdani" -> "Hamdani" */
const shortLabel = (name: string) => {
  const parts = name.split(' ');
  const last = parts[parts.length - 1];
  return last.length > 9 ? last.slice(0, 8) + '…' : last;
};

/** Baris formasi dari belakang ke depan: "5-3-2" -> [5, 3, 2] (tanpa kiper) */
function formationRows(id: string, field: readonly Spot[]): Spot[][] | null {
  const counts = id.split('-').map(Number);
  if (!counts.every((n) => Number.isInteger(n) && n > 0) || counts.reduce((a, b) => a + b, 0) !== field.length) return null;
  const rows: Spot[][] = [];
  let k = 0;
  for (const n of counts) {
    rows.push(field.slice(k, k + n));
    k += n;
  }
  return rows;
}

/**
 * Geser naik/turun pemain dalam satu baris sesuai kedalaman aslinya. Baris lima pemain memakai tiga
 * tingkat (mis. wing back lebih maju, bek tengah paling dalam) supaya nama yang berdekatan tidak bertumpuk.
 */
function rowShift(row: readonly Spot[], j: number, depth: number): number {
  const sp = row[j];
  if (sp.slot === 'GK') return 0;
  if (row.length < 5) return Math.max(-4, Math.min(4, -(sp.base[0] - depth) * 0.5));
  const levels = [...new Set(row.map((r) => r.base[0]))].sort((a, b) => a - b);
  if (levels.length < 2) return j % 2 ? 3 : -3;
  return 5 - (10 * levels.indexOf(sp.base[0])) / (levels.length - 1);
}

/**
 * Titik tiap tempat formasi di papan susunan pemain (lebar 68, tinggi 116, gawang sendiri di bawah).
 * Baris mengikuti angka formasi (5-3-2 = lima bek, tiga gelandang, dua striker), baris dibagi rata
 * dari bawah ke atas, dan pemain dalam satu baris dibagi rata ke samping supaya nama tidak bertumpuk.
 * Pemain yang posisi dasarnya lebih maju (mis. wing back) digambar sedikit lebih tinggi.
 */
function sheetSpots(id: string, shape: readonly Spot[]): Map<Slot, [number, number]> {
  const gk = shape.filter((sp) => sp.slot === 'GK');
  const field = shape.filter((sp) => sp.slot !== 'GK').sort((a, b) => a.base[0] - b.base[0]);
  let lines = formationRows(id, field);
  if (!lines) {
    // bentuk tanpa nama formasi yang cocok: gabungkan tempat dengan kedalaman mirip
    lines = [];
    for (const sp of field) {
      const row = lines[lines.length - 1];
      if (row && sp.base[0] - row[0].base[0] <= 7) row.push(sp);
      else lines.push([sp]);
    }
  }
  const rows = gk.length ? [gk, ...lines] : lines;
  const out = new Map<Slot, [number, number]>();
  rows.forEach((row, i) => {
    const y = 108 - (i / Math.max(1, rows.length - 1)) * 98;
    const sorted = [...row].sort((a, b) => a.base[1] - b.base[1]);
    const depth = sorted.reduce((n, sp) => n + sp.base[0], 0) / sorted.length;
    const n = sorted.length;
    sorted.forEach((sp, j) => {
      // satu pemain / dua pemain sayap: posisi asli ke samping; duet tengah: rapat di tengah;
      // tiga ke atas: dibagi rata (lima pemain memakai hampir seluruh lebar papan)
      const pairNear = n === 2 && Math.abs(sorted[1].base[1] - sorted[0].base[1]) < 30;
      const x =
        n === 1
          ? 6 + sp.base[1] * (56 / 68)
          : pairNear
            ? j
              ? 47
              : 21
            : n === 2
              ? 6 + sp.base[1] * (56 / 68)
              : n >= 5
                ? 5 + j * (58 / (n - 1))
                : 6 + (j + 0.5) * (56 / n);
      out.set(sp.slot, [x, y + rowShift(sorted, j, depth)]);
    });
  });
  return out;
}

/** Susunan pemain satu tim yang ikut berubah selama laga: formasi, rating langsung, gol, kartu, pergantian */
function TeamSheet({
  match,
  side,
  color,
  keeper,
  tick,
  cls,
}: {
  match: Match;
  side: 0 | 1;
  color: string;
  keeper: string;
  tick: string;
  cls: string;
}) {
  void tick; // komponen digambar ulang tiap menit laga berubah
  const team = side ? match.input.away : match.input.home;
  // bentuk tim saat ini (pelatih bisa mengubahnya di tengah laga)
  const shape = match.shapeOf(side);
  const formation = shape.id;
  const onPitch = match.bodies.filter((b) => b.side === side && b.on && !b.leaving);
  const used = new Set(match.bodies.map((b) => b.p.id));
  const bench = [...match.bench, ...match.reserves].filter((b) => b.side === side && (!used.has(b.p.id) || b.waiting));
  const out = match.bodies.filter((b) => b.side === side && (b.st.off !== undefined || b.st.red > 0) && !b.on);
  const cards = (b: Body) => (b.st.red > 0 ? 'red' : b.st.yellow > 0 ? 'yellow' : null);
  const spots = useMemo(() => sheetSpots(formation, shape.spots), [formation, shape.spots]);
  // jaga-jaga: dua pemain di tempat yang sama (atau tempat di luar bentuk tim) tetap terlihat semua
  const drawn = new Map<string, number>();
  const place = (slot: Slot): [number, number] => {
    const [x, y] = spots.get(slot) ?? [34, 58];
    const key = `${Math.round(x)},${Math.round(y)}`;
    const n = drawn.get(key) ?? 0;
    drawn.set(key, n + 1);
    return n ? [Math.min(62, x + 9 * n), y + 4] : [x, y];
  };
  return (
    <section className={`mv-panel mv-sheet ${cls}`}>
      <h3>
        <span className="mv-kit" style={{ background: color }} aria-hidden />
        <span className="mv-sheet-name">{team.name}</span>
        <span className="muted small">{formation}</span>
      </h3>
      <svg className="mv-formation" viewBox="-2 -2 72 120" role="img" aria-label={`Susunan pemain ${team.name}`}>
        <rect x="0" y="0" width="68" height="116" rx="1.5" className="fm-grass" />
        <line x1="0" y1="58" x2="68" y2="58" className="fm-line" />
        <circle cx="34" cy="58" r="9" className="fm-line" fill="none" />
        <rect x="14" y="100" width="40" height="16" className="fm-line" fill="none" />
        <rect x="14" y="0" width="40" height="16" className="fm-line" fill="none" />
        {onPitch.map((b) => {
          const [cx, cy] = place(b.p.slot);
          const fill = b.p.slot === 'GK' ? keeper : color;
          const light = lum(fill) > 0.6;
          const r = rate(b, match.score);
          const card = cards(b);
          // pemain di tepi kanan papan: rating & kartu dipindah ke sisi kiri supaya tidak terpotong
          const flip = cx > 60;
          return (
            <g key={b.p.id} className={b.p.user ? 'mv-me' : ''}>
              <title>
                {b.p.name} · {SLOT_LABEL[b.p.slot] ?? b.p.slot}
                {b.p.role ? ` · ${ROLES[b.p.role]?.name ?? b.p.role}` : ''} · rating {r.toFixed(1)}
                {match.captain(b.side) === b ? ' · kapten' : ''}
                {b.frus > 0.6 ? ' · sedang frustrasi' : ''}
              </title>
              {b.p.user && <circle cx={cx} cy={cy} r={4.3} className="mv-me-ring" />}
              <circle cx={cx} cy={cy} r={3.2} fill={fill} stroke={light ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.7)'} strokeWidth={0.45} opacity={b.hurt >= 0 ? 0.5 : 1} />
              <text x={cx} y={cy + 1.2} className="mv-f-num" fill={light ? '#111' : '#fff'}>
                {b.p.num}
              </text>
              {card && <rect x={flip ? cx + 3.1 : cx - 5.1} y={cy - 4.1} width={2} height={2.8} rx={0.35} fill={card === 'red' ? '#e5484d' : '#f5c542'} />}
              <rect x={flip ? cx - 7.3 : cx + 1.7} y={cy - 6.1} width={5.6} height={3.2} rx={0.9} className={`mv-f-rt ${r >= 7.5 ? 'hi' : r < 6 ? 'lo' : ''}`} />
              <text x={flip ? cx - 4.5 : cx + 4.5} y={cy - 3.65} className="mv-f-rtt">
                {r.toFixed(1)}
              </text>
              <text x={Math.max(7, Math.min(61, cx))} y={cy + 6.6} className="mv-f-name">
                {b.st.goals > 0 ? '⚽'.repeat(Math.min(3, b.st.goals)) + ' ' : ''}
                {shortLabel(b.p.name)}
                {b.st.assists > 0 ? ' ' + '🅰️'.repeat(Math.min(3, b.st.assists)) : ''}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mv-subs small">
        {out.length > 0 && (
          <div>
            <span className="muted">Keluar: </span>
            {out.map((b, i) => (
              <span key={b.p.id} className={b.p.user ? 'me' : ''}>
                {i > 0 && ', '}
                {b.st.red > 0 ? '🟥 ' : b.st.injured ? '🚑 ' : '🔻 '}
                {b.p.num} {shortLabel(b.p.name)}
                {b.st.goals > 0 && ` ${'⚽'.repeat(Math.min(3, b.st.goals))}`}
                {b.st.assists > 0 && ` ${'🅰️'.repeat(Math.min(3, b.st.assists))}`} <span className="muted">{rate(b, match.score).toFixed(1)}</span>
              </span>
            ))}
          </div>
        )}
        <div>
          <span className="muted">Cadangan: </span>
          {bench.length
            ? bench.map((b, i) => (
                <span key={b.p.id} className={b.p.user ? 'me' : ''}>
                  {i > 0 && ', '}
                  {b.waiting ? '🔺 ' : ''}
                  {b.p.num} {shortLabel(b.p.name)}
                </span>
              ))
            : <span className="muted">-</span>}
          <span className="muted"> · pergantian {match.subs[side]}/5</span>
        </div>
      </div>
    </section>
  );
}

interface StatRow {
  label: string;
  v: [number, number];
  unit?: string;
  /** teks pengganti angka, mis. "312/380" untuk umpan sukses / percobaan */
  text?: [string, string];
}

/** Statistik kedua tim dari laga (dipakai selama laga dan di ringkasan akhir) */
function matchStatRows(match: Match): StatRow[] {
  const both = (f: (side: 0 | 1) => number): [number, number] => [f(0), f(1)];
  const sum = (key: 'passes' | 'passesOk' | 'tackles' | 'interceptions') =>
    both((side) => match.bodies.reduce((n, b) => (b.side === side ? n + b.st[key] : n), 0));
  const count = (kind: string) => both((side) => match.events.filter((e) => e.side === side && e.kind === kind).length);
  const passes = sum('passes');
  const ok = sum('passesOk');
  return [
    { label: 'Penguasaan bola', v: possessionPct(match.possTime), unit: '%' },
    { label: 'Tembakan', v: match.shots },
    { label: 'Tepat sasaran', v: match.onTarget },
    { label: 'Umpan sukses / percobaan', v: ok, text: [`${ok[0]}/${passes[0]}`, `${ok[1]}/${passes[1]}`] },
    { label: 'Akurasi umpan', v: both((side) => (passes[side] ? Math.round((ok[side] / passes[side]) * 100) : 0)), unit: '%' },
    { label: 'Tekel', v: sum('tackles') },
    { label: 'Intersepsi', v: sum('interceptions') },
    { label: 'Sepak pojok', v: match.corners },
    { label: 'Pelanggaran', v: match.fouls },
    { label: 'Offside', v: count('offside') },
    { label: 'Kartu kuning', v: count('yellow') },
    { label: 'Kartu merah', v: count('red') },
  ];
}

const statText = (r: StatRow, side: 0 | 1) => r.text?.[side] ?? `${r.v[side]}${r.unit ?? ''}`;

/** Statistik laga langsung: angka kedua tim dengan batang perbandingan */
function LiveStats({ match, names, colors, tick }: { match: Match; names: [string, string]; colors: [string, string]; tick: string }) {
  void tick;
  const rows = matchStatRows(match);
  return (
    <section className="mv-panel p-stats">
      <h3>Statistik</h3>
      <div className="mv-ls-head small">
        <span>
          <span className="mv-kit" style={{ background: colors[0] }} aria-hidden /> {names[0]}
        </span>
        <span>
          {names[1]} <span className="mv-kit" style={{ background: colors[1] }} aria-hidden />
        </span>
      </div>
      {rows.map((r) => {
        const [a, b] = r.v;
        const tot = a + b;
        const pa = tot ? (a / tot) * 100 : 50;
        return (
          <div key={r.label} className="mv-ls-row small">
            <div className="mv-ls-nums">
              <b className="num">{statText(r, 0)}</b>
              <span className="muted">{r.label}</span>
              <b className="num">{statText(r, 1)}</b>
            </div>
            <div className="mv-ls-bar" aria-hidden>
              <span className={a >= b && tot ? 'lead' : ''} style={{ width: `${pa}%`, background: colors[0] }} />
              <span className={b > a ? 'lead' : ''} style={{ width: `${100 - pa}%`, background: colors[1] }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Scoreboard({
  names,
  colors,
  score,
  mySide,
  children,
}: {
  names: [string, string];
  colors: [string, string];
  score: [number, number];
  mySide: 0 | 1;
  children?: React.ReactNode;
}) {
  return (
    <div className="mv-score">
      <span className={`mv-name ${mySide === 0 ? 'mine' : ''}`}>
        <span className="mv-kit" style={{ background: colors[0] }} aria-hidden />
        {names[0]}
      </span>
      <span className="mv-mid">
        <b className="mv-goals num">
          {score[0]} - {score[1]}
        </b>
        {children}
      </span>
      <span className={`mv-name right ${mySide === 1 ? 'mine' : ''}`}>
        {names[1]}
        <span className="mv-kit" style={{ background: colors[1] }} aria-hidden />
      </span>
    </div>
  );
}

// --- ringkasan akhir ------------------------------------------------------------------

function Summary({
  match,
  result,
  names,
  colors,
  mySide,
  meId,
  onReplay,
  onClose,
}: {
  match: Match;
  result: EngineResult;
  names: [string, string];
  colors: [string, string];
  mySide: 0 | 1;
  meId?: string;
  onReplay: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const goals = result.events.filter((e) => e.kind === 'goal');
  const stats = useMemo(() => matchStatRows(match), [match]);
  const st = meId ? result.stats[meId] : undefined;
  const rating = meId ? result.ratings[meId] : undefined;
  const mins = st ? Math.max(1, Math.round(minutesPlayed(st))) : 0;
  return (
    <div className="mv-end">
      <Scoreboard names={names} colors={colors} score={result.score} mySide={mySide}>
        <span className="muted small">Pertandingan selesai</span>
      </Scoreboard>
      <div className="mv-scorers small">
        {[0, 1].map((side) => (
          <ul key={side} className={side ? 'right' : ''}>
            {goals
              .filter((g) => g.side === side)
              .map((g, i) => (
                <li key={i}>
                  {g.name}
                  {g.og && ' (bd)'} <span className="muted num">{minLabel(g)}</span>
                </li>
              ))}
          </ul>
        ))}
      </div>
      <div className="mv-end-grid">
        <section className="panel">
          <h3>Penampilanmu</h3>
          {st && rating !== undefined ? (
            <div className="mv-me">
              <span className={`rating ${rating >= 7.5 ? 'hi' : rating < 6 ? 'lo' : ''}`}>{rating.toFixed(1)}</span>
              <span className="small">
                {mins}' dimainkan
                {st.goals > 0 && ` · ⚽ ${st.goals}`}
                {st.assists > 0 && ` · 🅰️ ${st.assists}`}
                {` · umpan ${st.passesOk}/${st.passes}`}
                {st.shots > 0 && ` · tembakan ${st.onTarget}/${st.shots} tepat sasaran`}
                {st.keyPasses > 0 && ` · umpan kunci ${st.keyPasses}`}
                {st.throughBalls > 0 && ` · umpan terobosan ${st.throughBalls}`}
                {st.dribbles > 0 && ` · melewati lawan ${st.dribbles}×`}
                {st.tackles > 0 && ` · tekel ${st.tackles}`}
                {st.saves > 0 && ` · penyelamatan ${st.saves}`}
                {st.red > 0 ? ' · 🟥 kartu merah' : st.yellow > 0 ? ' · 🟨 kartu kuning' : ''}
                {st.injured > 0 && ' · 🚑 cedera'}
              </span>
              {result.motm === meId && <span className="pill ok">Man of the Match</span>}
            </div>
          ) : (
            <p className="small muted">Kamu tidak dimainkan di laga ini.</p>
          )}
        </section>
        <section className="panel">
          <h3>Statistik laga</h3>
          <table className="mv-stats small">
            <tbody>
              {stats.map((r) => (
                <tr key={r.label}>
                  <td className="num">{statText(r, 0)}</td>
                  <th>{r.label}</th>
                  <td className="num">{statText(r, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <div className="mv-actions">
        <button ref={closeRef} className="primary" onClick={onClose}>
          Selesai
        </button>
        <button className="ghost" onClick={onReplay}>
          Tonton ulang
        </button>
      </div>
    </div>
  );
}
