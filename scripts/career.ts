// Simulasi karier beberapa tahun dengan rencana tetap, untuk mengecek keseimbangan.
// npx tsx scripts/career.ts [tahun] [jumlah karakter] [fokus] [intensitas]
import { generateWorld } from '../src/game/gen/world';
import { rollCharacter } from '../src/game/gen/character';
import { advanceWeek, newCareer, pendingChoices, resolveChoice } from '../src/game/sim/week';
import { ageOn } from '../src/game/gen/player';
import type { Intensity, TrainingFocus } from '../src/game/types';

const years = Number(process.argv[2] ?? 4);
const n = Number(process.argv[3] ?? 12);
const focus = (process.argv[4] ?? 'seimbang') as TrainingFocus;
const intensity = (process.argv[5] ?? 'normal') as Intensity;
const w0 = generateWorld({ seed: 'BAL', activeLeagues: ['IDN1', 'ENG1'] });
const evCount: Record<string, number> = {};
for (let k = 0; k < n; k++) {
  const roll = rollCharacter(w0, { countryId: k % 2 ? 'ENG' : 'IDN' }, `B${k}`);
  let world = { ...w0, players: [...w0.players, roll.player] };
  let career = newCareer(roll, 0, 'x', w0.startDate);
  career.plan.focus = focus;
  career.plan.intensity = intensity;
  const age0 = roll.age;
  const ca0 = roll.player.ca;
  let injWeeks = 0;
  const caByYear: number[] = [];
  let maxStress = 0;
  for (let wk = 0; wk < years * 52; wk++) {
    for (const m of pendingChoices(career)) {
      evCount[m.eventId!] = (evCount[m.eventId!] ?? 0) + 1;
      ({ world, career } = resolveChoice(world, career, m.id, 0));
    }
    ({ world, career } = advanceWeek(world, career));
    if (career.injury) injWeeks++;
    maxStress = Math.max(maxStress, career.stress);
    if ((wk + 1) % 52 === 0) caByYear.push(world.players.find((p) => p.isUser)!.ca);
  }
  const p = world.players.find((x) => x.isUser)!;
  console.log(
    `${roll.player.nationalityId} ${roll.origin.padEnd(13)} ${roll.family.wealth.padEnd(8)} umur ${age0}->${ageOn(p.birthDate, career.currentDate)} CA ${ca0} -> ${caByYear.join(' -> ')} (PA ${p.pa}) | uang ${Math.round(roll.money)} -> ${Math.round(career.money)} | stres ${career.stress} (max ${maxStress}) fit ${career.fitness} | cedera ${injWeeks} mg | ${career.teamLabel}${p.contract ? (p.isYouth ? ' U19' : ' SENIOR') : ''}`,
  );
}
console.log(evCount);
