// Kalibrasi match engine: mainkan banyak laga antar klub dan cetak statistik rata-rata.
// Pakai: npx tsx scripts/engine.ts [jumlah laga] [penyetel=nilai ...]
import { generateWorld } from '../src/game/gen/world';
import { squadOf } from '../src/game/sim/season';
import { Match, TUNE, pickXI, type ETeam } from '../src/game/sim/engine';
import { SLOT_LABEL, clubFormation, type FormationId } from '../src/game/sim/formation';
// formasi bisa dipaksa untuk semua tim: F=4-4-2 npx tsx scripts/engine.ts
const FORCE = process.env.F as FormationId | undefined;
const N = Number(process.argv[2] ?? 200);
// penyetel bisa diubah dari baris perintah, mis. shotK=7.7 shootV=4.5
for (const arg of process.argv.slice(3)) {
  const [k, v] = arg.split('=');
  if (k in TUNE) (TUNE as Record<string, number>)[k] = Number(v);
}
const w = generateWorld({ seed: 'CAL' });
const clubs = w.clubs.filter((c) => c.leagueId === 'ENG1' || c.leagueId === 'IDN1');
const team = (id: string): ETeam => {
  const c = w.clubs.find((x) => x.id === id)!;
  const formation = FORCE ?? clubFormation(c);
  const { xi, bench } = pickXI(squadOf(w, id).filter((p) => !p.isYouth), undefined, false, formation);
  return { id, name: c.name, color: c.colors[0], color2: c.colors[1], style: c.playingStyle, formation, xi, bench };
};
let played = 0;
const kinds: number[][] = [];
let goals = 0, homeW = 0, awayW = 0, draws = 0, shots = 0, onT = 0, ms = 0, poss = 0, passes = 0, passOk = 0, tackles = 0;
let fouls = 0, yellow = 0, red = 0, corners = 0, spGoals = 0;
const ratings: number[] = [];
const strongWins: number[] = [];
const evK: Record<string, number> = {};
const gBy: Record<string, number> = {}, aBy: Record<string, number> = {}, shBy: Record<string, number> = {};
const styleP: Record<string, number[]> = {};
const stylePts: Record<string, number[]> = {};
const formPts: Record<string, number[]> = {};
const formGoals: Record<string, number[]> = {};
const pts = (x: number, y: number) => (x > y ? 3 : x === y ? 1 : 0);
for (let i = 0; i < N; i++) {
  const a = clubs[(i * 7) % clubs.length], b = clubs[(i * 13 + 5) % clubs.length];
  if (a.id === b.id || a.leagueId !== b.leagueId) continue;
  played++;
  const t0 = performance.now();
  const ta = team(a.id), tb = team(b.id);
  const m = new Match({ seed: 'c' + i, home: ta, away: tb });
  const r = m.run();
  ms += performance.now() - t0;
  for (const e of r.events) evK[e.kind] = (evK[e.kind] ?? 0) + 1;
  goals += r.score[0] + r.score[1];
  if (r.score[0] > r.score[1]) homeW++; else if (r.score[0] === r.score[1]) draws++; else awayW++;
  shots += r.shots[0] + r.shots[1]; onT += r.onTarget[0] + r.onTarget[1];
  poss += Math.abs(r.possession[0] - 50);
  fouls += m.fouls[0] + m.fouls[1]; corners += m.corners[0] + m.corners[1]; spGoals += m.setPieceGoals;
  (styleP[a.playingStyle] ??= []).push(r.possession[0]);
  (styleP[b.playingStyle] ??= []).push(r.possession[1]);
  // poin per laga dikoreksi kekuatan: poin - harapan dari selisih reputasi
  const exp = 1.4 + (a.reputation - b.reputation) * 0.03;
  (stylePts[a.playingStyle] ??= []).push(pts(r.score[0], r.score[1]) - exp);
  (stylePts[b.playingStyle] ??= []).push(pts(r.score[1], r.score[0]) - (2.8 - exp));
  (formPts[ta.formation!] ??= []).push(pts(r.score[0], r.score[1]) - exp);
  (formPts[tb.formation!] ??= []).push(pts(r.score[1], r.score[0]) - (2.8 - exp));
  (formGoals[ta.formation!] ??= []).push(r.score[0], -r.score[1]);
  (formGoals[tb.formation!] ??= []).push(r.score[1], -r.score[0]);
  const slotOf = new Map([...m.bodies, ...m.bench].map((b) => [b.p.id, SLOT_LABEL[b.p.slot]]));
  kinds.push(Object.values(r.stats).reduce((a, s) => [a[0] + s.longGoals, a[1] + s.setGoals, a[2] + s.headGoals], [0, 0, 0]));
  for (const [id, s] of Object.entries(r.stats)) {
    const sl = slotOf.get(id)!;
    gBy[sl] = (gBy[sl] ?? 0) + s.goals; aBy[sl] = (aBy[sl] ?? 0) + s.assists; shBy[sl] = (shBy[sl] ?? 0) + s.shots;
    passes += s.passes; passOk += s.passesOk; tackles += s.tackles; yellow += s.yellow; red += s.red; ratings.push(r.ratings[id]);
  }
  const diff = a.reputation - b.reputation;
  if (Math.abs(diff) > 15) strongWins.push((diff > 0) === (r.score[0] > r.score[1]) ? 1 : r.score[0] === r.score[1] ? 0.5 : 0);
}
const n = played;
const pc = (v: number) => (v / n * 100).toFixed(0) + '%';
ratings.sort((x, y) => x - y);
console.log(`n=${n} goals/match ${(goals / n).toFixed(2)} H/D/A ${pc(homeW)}/${pc(draws)}/${pc(awayW)} shots ${(shots / n).toFixed(1)} onT ${(onT / n).toFixed(1)} passAcc ${(passOk / passes * 100).toFixed(0)}% passes/team ${(passes / n / 2).toFixed(0)} tackles/match ${(tackles / n).toFixed(0)} |poss-50| ${(poss / n).toFixed(1)} strongerWins ${(strongWins.reduce((s, v) => s + v, 0) / strongWins.length * 100).toFixed(0)}% (${strongWins.length}) rating p10/50/90 ${ratings[Math.floor(ratings.length * 0.1)]}/${ratings[Math.floor(ratings.length / 2)]}/${ratings[Math.floor(ratings.length * 0.9)]} ms/match ${(ms / n).toFixed(1)}`);
console.log(`fouls ${(fouls / n).toFixed(1)} yellow ${(yellow / n).toFixed(2)} red ${(red / n).toFixed(2)} corners ${(corners / n).toFixed(1)} set-piece goals ${(spGoals / goals * 100).toFixed(0)}%`);
const tot = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const pct = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => k + ':' + (v / tot(o) * 100).toFixed(0)).join(' ');
let lg = 0, sg = 0, hg = 0; for (const r of kinds) { lg += r[0]; sg += r[1]; hg += r[2]; } console.log(`goal kinds: long ${(lg / goals * 100).toFixed(0)}% set ${(sg / goals * 100).toFixed(0)}% head ${(hg / goals * 100).toFixed(0)}%`);
console.log("goals", pct(gBy)); console.log('assists', pct(aBy), 'assist rate', (tot(aBy) / tot(gBy)).toFixed(2)); console.log('shots', pct(shBy));
console.log('possession by style', Object.entries(styleP).map(([k, v]) => `${k}:${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join(' '));
console.log('points vs expected by style', Object.entries(stylePts).map(([k, v]) => `${k}:${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}(${v.length})`).join(' '));
console.log('per match', Object.entries(evK).map(([k, v]) => k + ':' + (v / n).toFixed(2)).join(' '));
const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
console.log('points vs expected by formation', Object.entries(formPts).map(([k, v]) => `${k}:${avg(v).toFixed(2)}(${v.length})`).join(' '));
console.log('goals for/against by formation', Object.entries(formGoals).map(([k, v]) => `${k}:${avg(v.filter((x) => x >= 0).map((x) => x) .concat([])).toFixed(2)}`).join(' '));
