// v33 reinforcement learning untuk keputusan pemain di match engine (Evolution Strategies, self-play).
//
// Kebijakan = bobot tambahan RL_POLICY di atas nilai pilihan pembawa bola (engine.ts, decide()). Tiap iterasi:
// ambil N arah gangguan acak e, mainkan laga cermin (skuad identik, lapangan netral) antara kebijakan theta+s*e dan
// theta-s*e (dua kali, sisi ditukar, angka acak sama), hadiah = 0,5 x selisih gol + selisih peluang gol nyata
// (pGoal). Gradien ~ rata-rata(hadiah_i x e_i) -> langkah Adam. Ini "OpenAI ES" (Salimans dkk. 2017), cara RL tanpa
// backprop yang cocok untuk simulasi tanpa turunan. Hasilnya ditulis ke file JSON; salin ke RL_POLICY untuk dirilis.
//
// Pakai:
//   npx tsx scripts/rl.ts train [iterasi] [pasangan] [klub/pasangan]   (env: START=file.json OUT=file.json SIGMA LR SEED J)
//   npx tsx scripts/rl.ts eval [laga] A.json [B.json|zero|ship]         (A/B laga cermin: A vs B)
//   npx tsx scripts/rl.ts attr [laga] dec [kebijakan]                    (atribut 15 vs 8 di kedua sisi, kebijakan sama)
import { fork, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateWorld } from '../src/game/gen/world';
import { POLICY_GROUPS, POLICY_KEYS, POLICY_SCALE, RL_POLICY, policySet, zeroPolicy, type Policy, type PolicySet } from '../src/game/sim/engine';
import type { RlJob, RlResult } from './rl-worker';

const LEAGUES = (process.env.LEAGUES ?? 'ENG1,ESP1,ITA1,GER1,FRA1,POR1,NED1,JPN1,KSA1,THA1,IDN1').split(',');
const w = generateWorld({ seed: 'CAL' });
const pool = w.clubs.filter((c) => LEAGUES.includes(c.leagueId)).map((c) => c.id);
// SPLIT=1: bobot terpisah untuk tiap kelompok posisi (belakang / tengah / depan), selain itu satu bobot bersama
const GROUPS = process.env.SPLIT === '1';
const K = POLICY_KEYS.length;
const D = GROUPS ? K * POLICY_GROUPS.length : K;
// FREEZE=pa,ca,...: bobot ini dikunci di 0 (tidak dilatih), mis. supaya RL tidak menggeser gaya main (oper vs dribel)
const FREEZE = new Set((process.env.FREEZE ?? '').split(',').filter(Boolean));
const frozen = (d: number) => FREEZE.has(POLICY_KEYS[d % K]);

// angka acak deterministik (mulberry32 + Box-Muller)
let rs = Number(process.env.SEED ?? 33) >>> 0;
const rnd = () => {
  rs = (rs + 0x6d2b79f5) >>> 0;
  let t = rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

const toOne = (z: number[], o: number): Policy =>
  Object.fromEntries(POLICY_KEYS.map((k, i) => [k, +(z[o + i] * POLICY_SCALE[k]).toFixed(5)])) as Policy;
const toPolicy = (z: number[]): PolicySet =>
  GROUPS ? (Object.fromEntries(POLICY_GROUPS.map((g, j) => [g, toOne(z, j * K)])) as PolicySet) : policySet(toOne(z, 0));
const toZ = (p: PolicySet): number[] =>
  (GROUPS ? POLICY_GROUPS : (['mid'] as const)).flatMap((g) => POLICY_KEYS.map((k) => (p[g][k] ?? 0) / POLICY_SCALE[k]));
/** file JSON berisi satu kebijakan (bersama) atau kebijakan per kelompok posisi */
const load = (s: string | undefined): PolicySet => {
  if (!s || s === 'zero') return policySet(zeroPolicy());
  if (s === 'ship') return RL_POLICY;
  const j = JSON.parse(readFileSync(s, 'utf8'));
  return j.mid ? (Object.fromEntries(POLICY_GROUPS.map((g) => [g, { ...zeroPolicy(), ...j[g] }])) as PolicySet) : policySet({ ...zeroPolicy(), ...j });
};

// ---- kumpulan pekerja ----
const J = Number(process.env.J ?? cpus().length);
const workers: ChildProcess[] = [];
const idle: ChildProcess[] = [];
const waiting = new Map<number, (r: RlResult) => void>();
const queue: RlJob[] = [];
let nextId = 0;
const pump = () => {
  while (idle.length && queue.length) idle.pop()!.send(queue.shift()!);
};
async function start() {
  const file = fileURLToPath(new URL('./rl-worker.ts', import.meta.url));
  await Promise.all(
    Array.from({ length: J }, () =>
      new Promise<void>((ok) => {
        const c = fork(file, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
        workers.push(c);
        c.on('message', (m: RlResult | { ready: true }) => {
          if ('ready' in m) {
            idle.push(c);
            ok();
          } else {
            idle.push(c);
            waiting.get(m.id)!(m);
            waiting.delete(m.id);
          }
          pump();
        });
      }),
    ),
  );
}
let attr: [string, number, number] | undefined;
const play = (seed: string, club: string, pol: [PolicySet, PolicySet], flip = false) =>
  new Promise<RlResult>((ok) => {
    const id = nextId++;
    waiting.set(id, ok);
    queue.push({ id, seed, home: club, away: club, pol, ...(attr ? { attr: flip ? [attr[0], attr[2], attr[1]] : attr } : {}) });
    pump();
  });
/** hadiah untuk sisi 0: setengah selisih gol + selisih peluang gol nyata */
const reward = (r: RlResult) => 0.5 * (r.score[0] - r.score[1]) + (r.pGoal[0] - r.pGoal[1]);
/** dua laga cermin (sisi ditukar, angka acak sama): hasil dari sudut pandang kebijakan A */
async function duel(seed: string, club: string, A: PolicySet, B: PolicySet) {
  const [r1, r2] = await Promise.all([play(seed, club, [A, B]), play(seed, club, [B, A], true)]);
  return {
    R: (reward(r1) - reward(r2)) / 2,
    /** umpan A - umpan B, dan rata-rata umpan per tim */
    dp: (r1.passes[0] - r1.passes[1] - (r2.passes[0] - r2.passes[1])) / 2,
    pass: (r1.passes[0] + r1.passes[1] + r2.passes[0] + r2.passes[1]) / 4,
    fouls: (r1.fouls[0] + r1.fouls[1] + r2.fouls[0] + r2.fouls[1]) / 2,
    gd: (r1.score[0] - r1.score[1] - (r2.score[0] - r2.score[1])) / 2,
    pgd: (r1.pGoal[0] - r1.pGoal[1] - (r2.pGoal[0] - r2.pGoal[1])) / 2,
    pts: [r1, r2].map((r, i) => {
      const d = (r.score[0] - r.score[1]) * (i === 0 ? 1 : -1);
      return d > 0 ? 3 : d === 0 ? 1 : 0;
    }) as number[],
    goals: (r1.score[0] + r1.score[1] + r2.score[0] + r2.score[1]) / 2,
  };
}
const pick = () => pool[Math.floor(rnd() * pool.length)];

async function train() {
  const iters = Number(process.argv[3] ?? 100);
  const pairs = Number(process.argv[4] ?? 16);
  const clubs = Number(process.argv[5] ?? 2);
  const sigma = Number(process.env.SIGMA ?? 1.5);
  const lr = Number(process.env.LR ?? 0.08);
  const cap = Number(process.env.CAP ?? 8);
  // STYLE=lambda: penalti kuadrat untuk jumlah umpan yang menjauh dari gaya main asli (kebijakan nol), supaya RL
  // belajar memilih aksi yang lebih baik tanpa mengubah gaya tim (liga top tetap lebih banyak mengoper)
  const lam = Number(process.env.STYLE ?? 0);
  let target = 0;
  if (lam > 0) {
    const z0 = policySet(zeroPolicy());
    const base = await Promise.all(Array.from({ length: 24 }, (_, i) => duel(`base${i}`, pool[(i * 11) % pool.length], z0, z0)));
    target = base.reduce((s, r) => s + r.pass, 0) / base.length;
    console.log(`target passes/team ${target.toFixed(1)}`);
  }
  const out = process.env.OUT ?? 'rl-policy.json';
  const z = toZ(load(process.env.START)).map((x, d) => (frozen(d) ? 0 : x));
  const m = new Array(D).fill(0), v = new Array(D).fill(0);
  const b1 = 0.9, b2 = 0.999;
  const t0 = Date.now();
  for (let it = 1; it <= iters; it++) {
    const eps = Array.from({ length: pairs }, () => Array.from({ length: D }, (_, d) => (frozen(d) ? 0 : gauss())));
    const res = await Promise.all(
      eps.map(async (e, i) => {
        const plus = toPolicy(z.map((x, d) => x + sigma * e[d]));
        const minus = toPolicy(z.map((x, d) => x - sigma * e[d]));
        const ds = [];
        for (let c = 0; c < clubs; c++) ds.push(await duel(`rl${it}-${i}-${c}`, pick(), plus, minus));
        const avg = (f: (d: (typeof ds)[number]) => number) => ds.reduce((s, d) => s + f(d), 0) / ds.length;
        return { R: avg((d) => d.R), dp: avg((d) => d.dp), pass: avg((d) => d.pass), fouls: avg((d) => d.fouls) };
      }),
    );
    const passNow = res.reduce((s, o) => s + o.pass, 0) / res.length;
    const foulNow = res.reduce((s, o) => s + o.fouls, 0) / res.length;
    // gradien penalti -lam/2 x ((umpan - target)/target)^2 lewat selisih umpan +/- tiap pasangan
    const R = res.map((o) => o.R - (lam > 0 ? (lam * (passNow - target) * o.dp) / (target * target) * 10 : 0));
    const sd = Math.sqrt(R.reduce((s, r) => s + r * r, 0) / R.length) || 1;
    const g = new Array(D).fill(0);
    for (let i = 0; i < pairs; i++) for (let d = 0; d < D; d++) g[d] += ((R[i] / sd) * eps[i][d]) / pairs;
    for (let d = 0; d < D; d++) {
      m[d] = b1 * m[d] + (1 - b1) * g[d];
      v[d] = b2 * v[d] + (1 - b2) * g[d] * g[d];
      const mh = m[d] / (1 - b1 ** it), vh = v[d] / (1 - b2 ** it);
      z[d] = Math.max(-cap, Math.min(cap, z[d] + (lr * mh) / (Math.sqrt(vh) + 1e-8)));
    }
    const pol = toPolicy(z);
    writeFileSync(out, JSON.stringify(pol, null, 1));
    const top = z
      .map((x, d) => [(GROUPS ? POLICY_GROUPS[Math.floor(d / K)][0] + ':' : '') + POLICY_KEYS[d % K], x] as const)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 6)
      .map(([k, x]) => `${k}${x >= 0 ? '+' : ''}${x.toFixed(1)}`)
      .join(' ');
    console.log(`it ${it} |R| ${sd.toFixed(2)} pass ${passNow.toFixed(0)} fouls ${foulNow.toFixed(1)} ${((Date.now() - t0) / 1000).toFixed(0)}s  ${top}`);
  }
}

async function evaluate(mode: string) {
  const n = Number(process.argv[3] ?? 200);
  // attr: kedua sisi memakai kebijakan yang sama, A = sisi dengan atribut 15, B = sisi dengan atribut 8
  if (mode === 'attr') attr = [process.argv[4], 15, 8];
  const A = load(mode === 'attr' ? process.argv[5] : process.argv[4]);
  const B = mode === 'attr' ? A : load(process.argv[5] ?? 'zero');
  const res = await Promise.all(Array.from({ length: Math.ceil(n / 2) }, (_, i) => duel(`ev${i}`, pool[(i * 7) % pool.length], A, B)));
  const k = res.length;
  const mean = (f: (r: (typeof res)[number]) => number) => res.reduce((s, r) => s + f(r), 0) / k;
  const se = (f: (r: (typeof res)[number]) => number) => {
    const mu = mean(f);
    return Math.sqrt(res.reduce((s, r) => s + (f(r) - mu) ** 2, 0) / (k - 1) / k);
  };
  const ppm = mean((r) => (r.pts[0] + r.pts[1]) / 2);
  console.log(
    `A vs B over ${k * 2} matches: GD ${mean((r) => r.gd).toFixed(3)} (SE ${se((r) => r.gd).toFixed(3)})  ` +
      `pGD ${mean((r) => r.pgd).toFixed(3)} (SE ${se((r) => r.pgd).toFixed(3)})  pts/match ${ppm.toFixed(2)}  goals ${mean((r) => r.goals).toFixed(2)}`,
  );
}

await start();
if (process.argv[2] === 'eval' || process.argv[2] === 'attr') await evaluate(process.argv[2]);
else await train();
for (const c of workers) c.kill();
process.exit(0);
