// Kalibrasi match engine: mainkan banyak laga antar klub dan cetak statistik rata-rata.
// Pakai: npx tsx scripts/engine.ts [jumlah laga]
import { generateWorld } from '../src/game/gen/world';
import { squadOf } from '../src/game/sim/season';
import { Match, TUNE, pickXI, type ETeam } from '../src/game/sim/engine';
const N = Number(process.argv[2] ?? 200);
// penyetel bisa diubah dari baris perintah, mis. shotK=1.1 shootW=18
for (const arg of process.argv.slice(3)) {
  const [k, v] = arg.split('=');
  if (k in TUNE) (TUNE as Record<string, number>)[k] = Number(v);
}
const w = generateWorld({ seed: 'CAL' });
const clubs = w.clubs.filter((c) => c.leagueId === 'ENG1' || c.leagueId === 'IDN1');
const team = (id: string): ETeam => {
  const c = w.clubs.find((x) => x.id === id)!;
  return { id, name: c.name, color: c.colors[0], color2: c.colors[1], xi: pickXI(squadOf(w, id).filter((p) => !p.isYouth), undefined, false).xi };
};
let played = 0;
let goals = 0, homeW = 0, draws = 0, shots = 0, onT = 0, ms = 0, poss = 0, passes = 0, passOk = 0, tackles = 0;
const ratings: number[] = [];
const strongWins: number[] = [];
const evK: Record<string, number> = {};
const gBy: Record<string, number> = {}, aBy: Record<string, number> = {}, shBy: Record<string, number> = {};
for (let i = 0; i < N; i++) {
  const a = clubs[(i * 7) % clubs.length], b = clubs[(i * 13 + 5) % clubs.length];
  if (a.id === b.id || a.leagueId !== b.leagueId) continue;
  played++;
  const t0 = performance.now();
  const m = new Match({ seed: 'c' + i, home: team(a.id), away: team(b.id) });
  const r = m.run();
  ms += performance.now() - t0;
  for (const e of r.events) evK[e.kind] = (evK[e.kind] ?? 0) + 1;
  goals += r.score[0] + r.score[1];
  if (r.score[0] > r.score[1]) homeW++; else if (r.score[0] === r.score[1]) draws++;
  shots += r.shots[0] + r.shots[1]; onT += r.onTarget[0] + r.onTarget[1];
  poss += Math.abs(r.possession[0] - 50);
  const slotOf = new Map([...m.bodies, ...m.bench].map((b) => [b.p.id, b.p.slot.replace(/^[LR](?=C)/, '').replace(/^[LR](?=[BW])/, 'F')]));
  for (const [id, s] of Object.entries(r.stats)) { const sl = slotOf.get(id)!; gBy[sl] = (gBy[sl] ?? 0) + s.goals; aBy[sl] = (aBy[sl] ?? 0) + s.assists; shBy[sl] = (shBy[sl] ?? 0) + s.shots; passes += s.passes; passOk += s.passesOk; tackles += s.tackles; ratings.push(r.ratings[id]); }
  const diff = a.reputation - b.reputation;
  if (Math.abs(diff) > 15) strongWins.push((diff > 0) === (r.score[0] > r.score[1]) ? 1 : r.score[0] === r.score[1] ? 0.5 : 0);
}
const n = played;
ratings.sort((x, y) => x - y);
console.log(`n=${n} goals/match ${(goals / n).toFixed(2)} homeW ${(homeW / n * 100).toFixed(0)}% draws ${(draws / n * 100).toFixed(0)}% shots ${(shots / n).toFixed(1)} onT ${(onT / n).toFixed(1)} passAcc ${(passOk / passes * 100).toFixed(0)}% passes/team ${(passes / n / 2).toFixed(0)} tackles/match ${(tackles / n).toFixed(0)} |poss-50| ${(poss / n).toFixed(1)} strongerWins ${(strongWins.reduce((s, v) => s + v, 0) / strongWins.length * 100).toFixed(0)}% rating p10/50/90 ${ratings[Math.floor(ratings.length * 0.1)]}/${ratings[Math.floor(ratings.length / 2)]}/${ratings[Math.floor(ratings.length * 0.9)]} ms/match ${(ms / n).toFixed(1)}`);
const tot = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const pct = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => k + ':' + (v / tot(o) * 100).toFixed(0)).join(' ');
console.log('goals', pct(gBy)); console.log('assists', pct(aBy), 'assist rate', (tot(aBy) / tot(gBy)).toFixed(2)); console.log('shots', pct(shBy));
console.log('per match', Object.entries(evK).map(([k, v]) => k + ':' + (v / n).toFixed(2)).join(' '));
