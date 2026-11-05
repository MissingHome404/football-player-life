// Cek dunia beberapa musim: kekuatan liga stabil? jumlah pemain? statistik pemain kita masuk akal?
// npx tsx scripts/seasons.ts [tahun]
import { generateWorld } from '../src/game/gen/world';
import { rollCharacter } from '../src/game/gen/character';
import { advanceWeek, newCareer, pendingChoices, resolveChoice } from '../src/game/sim/week';
import { clubStrengths, standings } from '../src/game/sim/season';
import { ageOn } from '../src/game/gen/player';
import type { World } from '../src/game/types';

const years = Number(process.argv[2] ?? 3);
const w0 = generateWorld({ seed: 'SEAS' });
const show = ['ENG1', 'ESP1', 'NED1', 'JPN1', 'NOR1', 'IDN1'];
function snapshot(w: World, label: string, date = w0.startDate) {
  const st = clubStrengths(w);
  const parts = show.map((id) => {
    const cl = w.clubs.filter((c) => c.leagueId === id).map((c) => st.get(c.id)!.senior);
    return `${id} ${Math.round(cl.reduce((a, b) => a + b, 0) / cl.length)}`;
  });
  const ages = w.players.filter((p) => !p.isYouth).map((p) => ageOn(p.birthDate, date));
  console.log(label.padEnd(12), `pemain ${w.players.length}`, parts.join(' | '), `umur senior ${(ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1)}`);
}
snapshot(w0, 'awal');
for (const [k, country, pos] of [[0, 'ENG', 'ST'], [1, 'IDN', 'MC'], [2, 'IDN', 'DC'], [3, 'ESP', 'GK']] as const) {
  const roll = rollCharacter(w0, { countryId: country, position: pos }, `S${k}`);
  let world: World = { ...w0, players: [...w0.players, roll.player] };
  let career = newCareer(roll, 0, 'x', w0.startDate);
  for (let wk = 0; wk < years * 52; wk++) {
    for (const m of pendingChoices(career)) ({ world, career } = resolveChoice(world, career, m.id, 0));
    ({ world, career } = advanceWeek(world, career));
    if (k === 0 && (wk + 1) % 52 === 0) snapshot(world, `tahun ${(wk + 1) / 52}`, career.currentDate);
  }
  const p = world.players.find((x) => x.isUser)!;
  console.log(`\n${country} ${pos} ${roll.origin} CA ${roll.player.ca}->${p.ca} PA ${p.pa} ${career.teamLabel} ${p.isYouth ? 'U19' : p.contract ? 'senior' : 'amatir'}`);
  for (const s of career.stats) {
    console.log(`  ${s.season.padEnd(8)} ${s.comp.padEnd(6)} ${s.team.padEnd(26)} main ${String(s.apps).padStart(2)} (inti ${String(s.starts).padStart(2)}) gol ${String(s.goals).padStart(2)} assist ${String(s.assists).padStart(2)} CS ${s.cleanSheets} rating ${(s.ratingSum / Math.max(1, s.apps)).toFixed(2)} motm ${s.motm}`);
  }
  const statusCount: Record<string, number> = {};
  for (const m of career.matches) statusCount[m.status] = (statusCount[m.status] ?? 0) + 1;
  console.log('  30 laga terakhir:', statusCount);
  if (k === 0) {
    const h = world.honours.filter((x) => ['ENG1', 'IDN1'].includes(x.leagueId)).map((x) => `${x.leagueId} ${x.season}: ${world.clubs.find((c) => c.id === x.championId)!.name}`);
    console.log('  juara:', h.join('; '));
    const s = world.seasons.ENG1;
    const t = standings(s).slice(0, 3).map((r) => `${world.clubs.find((c) => c.id === r.clubId)!.name} ${r.pts}`);
    console.log('  ENG1 sekarang', s.label, t.join(', '));
  }
}
