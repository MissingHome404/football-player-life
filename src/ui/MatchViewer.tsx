// Layar pertandingan 2D. Laga diputar ulang dari input match engine yang sama dengan
// simulasi mingguan, jadi skor dan statistik di layar identik dengan yang tercatat.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from './store';
import {
  DT,
  FULL,
  GOAL_HALF,
  HALF,
  Match,
  NET_DEPTH,
  PITCH_H,
  PITCH_W,
  minuteOf,
  type Body,
  type EngineInput,
  type EngineResult,
  type MatchEvent,
} from '../game/sim/engine';

type Phase = 'lineup' | 'play' | 'end';
const SPEEDS = [1, 2, 4, 8] as const;
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
  return { shirt: [home, away], keeper: [k1, k2] };
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
      return `🟨 Kartu kuning: ${e.name} (${team})`;
    case 'red':
      return e.second ? `🟨🟥 Kartu kuning kedua, ${e.name} diusir! (${team})` : `🟥 Kartu merah langsung: ${e.name} (${team})`;
    case 'half':
      return 'Turun minum';
    case 'full':
      return 'Peluit panjang';
    default:
      return null;
  }
}

const SHOWN = new Set(['goal', 'penalty', 'freekick', 'save', 'miss', 'offside', 'sub', 'half', 'full', 'yellow', 'red']);

const RESTART_TEXT: Record<string, string> = {
  throw: 'Lemparan ke dalam',
  corner: 'Tendangan sudut',
  goalkick: 'Tendangan gawang',
  free: 'Tendangan bebas',
  penalty: 'Penalti',
};

/** Bola mati yang sedang berlangsung, untuk label kecil di atas lapangan */
function restartLabel(match: Match, names: [string, string]): string | null {
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
  const mySide: 0 | 1 = sides.findIndex((t) => t.xi.some((p) => p.user) || !!t.sub?.player.user) === 1 ? 1 : 0;
  const userStarts = sides.some((t) => t.xi.some((p) => p.user));
  const me = [...input.home.xi, ...input.away.xi].find((p) => p.user) ?? (input.home.sub ?? input.away.sub)?.player;

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
      <div className="mv-inner">
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

const SLOT_LABEL: Record<string, string> = {
  GK: 'GK',
  RB: 'DR',
  RCB: 'DC',
  LCB: 'DC',
  LB: 'DL',
  RCM: 'MC',
  CM: 'DM',
  LCM: 'MC',
  RW: 'AMR',
  ST: 'ST',
  LW: 'AML',
};

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
  return (
    <div className="mv-lineup">
      <h2>Susunan pemain</h2>
      <p className="mv-coach">
        {userStarts
          ? 'Pelatih memasangmu sebagai pemain inti hari ini. Tunjukkan kemampuanmu!'
          : hasMe
            ? 'Kamu mulai dari bangku cadangan. Tetap siap, pelatih bisa memanggilmu kapan saja.'
            : 'Kamu mulai dari bangku cadangan hari ini.'}
      </p>
      <div className="mv-teams">
        {[input.home, input.away].map((t, side) => (
          <div key={t.id} className="mv-team">
            <h3>
              <span className="mv-kit" style={{ background: colors[side] }} aria-hidden />
              {t.name} <span className="muted">{side === 0 ? '(kandang)' : '(tandang)'}</span>
            </h3>
            <ol>
              {t.xi.map((p) => (
                <li key={p.id} className={p.user ? 'me' : ''}>
                  <span className="num mv-n">{p.num}</span>
                  <span>{p.name}</span>
                  <span className="muted small">{SLOT_LABEL[p.slot]}</span>
                </li>
              ))}
            </ol>
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
  mySide,
  onEnd,
  onSkip,
}: {
  match: Match;
  names: [string, string];
  colors: [string, string];
  keepers: [string, string];
  mySide: 0 | 1;
  onEnd: () => void;
  onSkip: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState({ min: 1, half: 1, score: [0, 0] as [number, number], events: 0, rs: null as string | null });
  const [banner, setBanner] = useState<string | null>(null);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  speedRef.current = speed;
  pausedRef.current = paused;
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
      const maxH = Math.max(260, window.innerHeight * (vertical ? 0.58 : 0.62));
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
      const r = Math.max(7, s * 1.15);
      ctx.font = `700 ${Math.round(r * 1.05)}px 'Barlow Condensed', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let user: [number, number, string] | null = null;
      for (const b of match.bodies) {
        if (!b.on) continue;
        const p0 = prev.get(b) ?? b;
        const [x, y] = P(p0.x + (b.x - p0.x) * alpha, p0.y + (b.y - p0.y) * alpha);
        const fill = b.p.slot === 'GK' ? keepers[b.side] : colors[b.side];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.18);
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.stroke();
        ctx.fillStyle = lum(fill) > 0.6 ? '#111' : '#fff';
        ctx.fillText(String(b.p.num), x, y + 0.5);
        if (b.p.user) user = [x, y, b.p.name];
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
        acc += dt * speedRef.current;
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
            setBanner('Turun minum');
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
        const min = minuteOf(match.t);
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
  }, [match, colors, keepers]);

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
    .slice(-5)
    .reverse();
  const progress = Math.min(1, match.t / FULL);

  return (
    <div className="mv-live">
      <Scoreboard names={names} colors={colors} score={hud.score} mySide={mySide}>
        <span className="mv-clock num">{match.done ? 'Selesai' : `${hud.min}'`}</span>
        <span className="muted small">{match.t >= HALF ? 'Babak 2' : 'Babak 1'}</span>
      </Scoreboard>
      <div className="mv-progress" aria-hidden>
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="mv-pitch" ref={wrapRef}>
        <canvas ref={canvasRef} role="img" aria-label={`Pertandingan menit ${hud.min}, skor ${hud.score[0]}-${hud.score[1]}`} />
        {banner && <div className="mv-banner">{banner}</div>}
        {!banner && hud.rs && <div className="mv-restart small">{hud.rs}</div>}
      </div>
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
        <button className="ghost" onClick={onSkip}>
          Lewati ke akhir
        </button>
      </div>
      <ul className="mv-feed small" aria-live="polite">
        {feed.map(({ e, text }, i) => (
          <li key={`${e.t}-${i}`} className={e.kind === 'goal' ? 'goal' : ''}>
            <span className="num muted">{e.min}'</span> {text}
          </li>
        ))}
        {!feed.length && <li className="muted">Kick-off!</li>}
      </ul>
    </div>
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
  result,
  names,
  colors,
  mySide,
  meId,
  onReplay,
  onClose,
}: {
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
  const cards = (side: 0 | 1) => {
    const y = result.events.filter((e) => e.side === side && e.kind === 'yellow').length;
    const r = result.events.filter((e) => e.side === side && e.kind === 'red').length;
    return `🟨 ${y}${r ? ` 🟥 ${r}` : ''}`;
  };
  const st = meId ? result.stats[meId] : undefined;
  const rating = meId ? result.ratings[meId] : undefined;
  const mins = st ? Math.max(1, Math.round((((st.off ?? FULL) - st.on) / FULL) * 90)) : 0;
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
                  {g.og && ' (bd)'} <span className="muted num">{g.min}'</span>
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
                {st.tackles > 0 && ` · tekel ${st.tackles}`}
                {st.saves > 0 && ` · penyelamatan ${st.saves}`}
                {st.red > 0 ? ' · 🟥 kartu merah' : st.yellow > 0 ? ' · 🟨 kartu kuning' : ''}
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
              <tr>
                <td className="num">{result.possession[0]}%</td>
                <th>Penguasaan bola</th>
                <td className="num">{result.possession[1]}%</td>
              </tr>
              <tr>
                <td className="num">{result.shots[0]}</td>
                <th>Tembakan</th>
                <td className="num">{result.shots[1]}</td>
              </tr>
              <tr>
                <td className="num">{result.onTarget[0]}</td>
                <th>Tepat sasaran</th>
                <td className="num">{result.onTarget[1]}</td>
              </tr>
              {result.corners && (
                <tr>
                  <td className="num">{result.corners[0]}</td>
                  <th>Sepak pojok</th>
                  <td className="num">{result.corners[1]}</td>
                </tr>
              )}
              {result.fouls && (
                <tr>
                  <td className="num">{result.fouls[0]}</td>
                  <th>Pelanggaran</th>
                  <td className="num">{result.fouls[1]}</td>
                </tr>
              )}
              <tr>
                <td className="num">{cards(0)}</td>
                <th>Kartu</th>
                <td className="num">{cards(1)}</td>
              </tr>
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
