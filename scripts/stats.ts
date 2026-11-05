import { generateWorld } from '../src/game/gen/world';
import { personalityLabel } from '../src/game/gen/personality';
const t = performance.now();
const w = generateWorld({ seed: 'TEST1234' });
console.log('ms', Math.round(performance.now() - t), 'players', w.players.length, 'clubs', w.clubs.length);
for (const lid of ['ENG1', 'ESP1', 'NED1', 'CYP1', 'KSA1', 'JPN1', 'IDN1', 'MAS1']) {
  const clubs = w.clubs.filter((c) => c.leagueId === lid);
  const top = clubs[0], bot = clubs[clubs.length - 1];
  const s = (cid: string) => {
    const sq = w.players.filter((p) => p.contract!.clubId === cid && p.contract!.role === 'Inti');
    const ca = sq.map((p) => p.ca).sort((a, b) => b - a);
    const wage = sq.map((p) => p.contract!.wagePerWeek);
    return `CA ${ca[0]}..${ca[ca.length - 1]} avg ${Math.round(ca.reduce((a, b) => a + b) / ca.length)} wage max ${Math.max(...wage)}`;
  };
  console.log(lid, top.name, s(top.id), '|', bot.name, s(bot.id));
}
const labels: Record<string, number> = {};
for (const p of w.players) { const l = personalityLabel(p); labels[l] = (labels[l] ?? 0) + 1; }
console.log(labels);
const best = [...w.players].sort((a, b) => b.ca - a.ca).slice(0, 5);
for (const p of best) console.log(p.firstName, p.lastName, p.mainPosition, p.ca, p.pa, p.nationalityId, p.contract!.clubId, JSON.stringify(p.technical));
const yp = [...w.players].filter(p=>p.isYouth).sort((a, b) => b.pa - a.pa).slice(0, 5);
for (const p of yp) console.log('youth', p.firstName, p.lastName, p.mainPosition, p.ca, p.pa, p.contract!.clubId);
const pas = w.players.filter(p=>p.pa>=170).length; console.log('PA>=170', pas);
const idn = w.players.filter(p=>p.nationalityId==='IDN').slice(0,15).map(p=>p.firstName+' '+p.lastName); console.log(idn.join(', '));
const young = w.players.filter(p => 2026 - Number(p.birthDate.slice(0,4)) <= 20);
for (const t of [150,160,170,180,190]) console.log('young PA>=',t, young.filter(p=>p.pa>=t).length);
