// Pekerja pelatihan RL (dipanggil oleh scripts/rl.ts lewat child_process.fork): memainkan satu laga per tugas
// dengan kebijakan keputusan yang diberikan untuk tiap sisi, lalu mengirim balik hasilnya.
import { generateWorld } from '../src/game/gen/world';
import { squadOf } from '../src/game/sim/season';
import { Match, TUNE, pickXI, type ETeam, type PolicySet } from '../src/game/sim/engine';
import { clubFormation } from '../src/game/sim/formation';
import { clubTactic, tacticK } from '../src/game/sim/tactics';

export interface RlJob {
  id: number;
  seed: string;
  /** klub tuan rumah & tamu (sama = laga cermin, skuad identik) */
  home: string;
  away: string;
  pol: [PolicySet, PolicySet];
  tune?: Record<string, number>;
  /** uji atribut: atribut ini diset ke [nilai tuan rumah, nilai tamu] untuk semua pemain non-kiper */
  attr?: [string, number, number];
}
export interface RlResult {
  id: number;
  score: [number, number];
  pGoal: [number, number];
  xg: [number, number];
  shots: [number, number];
  /** umpan tiap tim (dari badan pemain: laga cermin memakai id pemain yang sama di kedua sisi) */
  passes: [number, number];
  fouls: [number, number];
}

const w = generateWorld({ seed: 'CAL' });
const team = (id: string): ETeam => {
  const c = w.clubs.find((x) => x.id === id)!;
  const tactic = clubTactic(c);
  const formation = tactic?.formation ?? clubFormation(c);
  const { xi, bench } = pickXI(squadOf(w, id).filter((p) => !p.isYouth), undefined, false, formation, tactic);
  return { id, name: c.name, color: c.colors[0], color2: c.colors[1], style: c.playingStyle, formation, xi, bench, ...(tactic ? { tactic: tacticK(tactic) } : {}) };
};

process.on('message', (job: RlJob) => {
  if (job.tune) for (const [k, v] of Object.entries(job.tune)) (TUNE as Record<string, number>)[k] = v;
  const h = team(job.home), a = team(job.away);
  if (job.attr) {
    const [k, v0, v1] = job.attr;
    for (const [t, v] of [[h, v0], [a, v1]] as const)
      for (const p of [...t.xi, ...(t.bench ?? [])]) if (p.slot !== 'GK') p.a = { ...p.a, [k]: v };
  }
  const m = new Match({ seed: job.seed, home: h, away: a, neutral: true });
  m.pol = job.pol;
  const r = m.run();
  const passes: [number, number] = [0, 0];
  for (const b of [...m.bodies, ...m.bench]) passes[b.side] += b.st.passes;
  const out: RlResult = { id: job.id, score: r.score, pGoal: m.pGoal, xg: m.xgFor, shots: r.shots, passes, fouls: m.fouls };
  process.send!(out);
});
process.send!({ ready: true });
