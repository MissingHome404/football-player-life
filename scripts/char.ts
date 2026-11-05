import { generateWorld } from '../src/game/gen/world';
import { rollCharacter } from '../src/game/gen/character';
const w = generateWorld({ seed: 'CHAR' });
for (let i = 0; i < 6; i++) {
  const r = rollCharacter(w, { countryId: 'IDN', position: 'ST' }, `Z${i}`);
  const all = [...Object.values(r.player.technical), ...Object.values(r.player.mental), ...Object.values(r.player.physical)];
  const low = all.filter(v => v <= 3).length;
  console.log(r.age, r.origin, 'CA', r.player.ca, 'PA', r.player.pa, 'min', Math.min(...all), 'max', Math.max(...all), '<=3:', low, 'fin', r.player.technical.Finishing, 'money', r.money, r.family.wealth, r.teamLabel);
}
