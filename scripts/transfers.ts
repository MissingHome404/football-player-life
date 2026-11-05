// Simulasi karier dengan transfer otomatis: sewa agent terbaik yang tersedia,
// terima tawaran klub dengan reputasi tertinggi yang menjanjikan peran Inti/Rotasi.
// npx tsx scripts/transfers.ts [tahun] [jumlah]
import { generateWorld } from '../src/game/gen/world';
import { rollCharacter } from '../src/game/gen/character';
import { advanceWeek, newCareer, pendingChoices, resolveChoice } from '../src/game/sim/week';
import { acceptOffer, agentAvailable, hireAgent } from '../src/game/sim/transfer';
import type { World } from '../src/game/types';

const years = Number(process.argv[2] ?? 6);
const n = Number(process.argv[3] ?? 4);
const w0 = generateWorld({ seed: 'TRF' });
for (let k = 0; k < n; k++) {
  const roll = rollCharacter(w0, { countryId: k % 2 ? 'IDN' : 'POR' }, `T${k}`);
  let world: World = { ...w0, players: [...w0.players, roll.player] };
  let career = newCareer(roll, 0, 'x', w0.startDate);
  const offersSeen: Record<string, number> = {};
  for (let wk = 0; wk < years * 52; wk++) {
    for (const m of pendingChoices(career)) ({ world, career } = resolveChoice(world, career, m.id, 0));
    const p = world.players.find((x) => x.isUser)!;
    for (const tier of ['super', 'regional', 'lokal'] as const) {
      const order = { lokal: 1, regional: 2, super: 3 };
      if (agentAvailable(tier, p) && (!career.agent || order[career.agent.tier] < order[tier])) {
        career = hireAgent(career, p, tier, 'x');
        break;
      }
    }
    for (const o of career.offers) offersSeen[o.type] = (offersSeen[o.type] ?? 0) + 0; // hitung di bawah
    const curRep = p.contract ? world.clubs.find((c) => c.id === p.contract!.clubId)!.reputation : 0;
    const good = career.offers
      .filter((o) => o.type === 'pinjaman' || o.type === 'perpanjangan' || o.role === 'Inti' || o.role === 'Rotasi')
      .map((o) => ({ o, rep: world.clubs.find((c) => c.id === o.clubId)!.reputation }))
      .filter((x) => x.o.type !== 'transfer' || x.rep > curRep + 3)
      .sort((a, b) => b.rep - a.rep)[0];
    if (good) {
      offersSeen[good.o.type] = (offersSeen[good.o.type] ?? 0) + 1;
      ({ world, career } = acceptOffer(world, career, good.o.id));
    }
    ({ world, career } = advanceWeek(world, career));
  }
  const p = world.players.find((x) => x.isUser)!;
  console.log(`\n${roll.player.nationalityId} ${roll.origin} ${p.mainPosition} CA ${roll.player.ca}->${p.ca} PA ${p.pa} agent ${career.agent?.tier ?? '-'} uang €${Math.round(career.money).toLocaleString()} rep ${p.reputation.home}/${p.reputation.world}`);
  console.log('  diterima:', offersSeen);
  for (const h of career.history) console.log(`  ${h.from} → ${h.to ?? 'sekarang'}  ${h.kind.padEnd(8)} ${h.team}`);
  const tot = career.stats.reduce((a, s) => ({ apps: a.apps + s.apps, goals: a.goals + s.goals }), { apps: 0, goals: 0 });
  console.log('  total', tot, p.contract ? `kontrak s/d ${p.contract.expires} ${p.contract.role} €${p.contract.wagePerWeek}/mg` : 'tanpa klub');
}
