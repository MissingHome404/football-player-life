import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { advanceWeek, newCareer, pendingChoices, resolveChoice } from '../sim/week';
import { initRelations } from '../sim/relations';
import { KO_STAGES, nationalWeek, windowsOf } from '../sim/national';
import { addDays } from '../date';
import type { Career, World } from '../types';

const w0 = generateWorld({ seed: 'INTL', activeLeagues: ['IDN1'] });

describe('timnas & turnamen', () => {
  it('jeda internasional: Juni hanya di tahun tanpa turnamen', () => {
    expect(windowsOf(2027).map((w) => w.id)).toContain('win-2027-06');
    expect(windowsOf(2028).map((w) => w.id)).not.toContain('win-2028-06');
  });

  it('Piala Dunia 32 tim: grup, babak gugur sampai final, pemain bintang dipanggil', () => {
    const roll = rollCharacter(w0, { countryId: 'ENG', position: 'ST' }, 'NAT-WC');
    roll.player.ca = 195;
    // jangan sampai cedera di laga pertama (yang diuji: dipanggil dan dimainkan)
    roll.player.hidden['Injury Proneness'] = 1;
    let world: World = { ...w0, players: [...w0.players, roll.player] };
    const career: Career = newCareer(roll, 0, 'test', '2030-05-25');
    career.rel = initRelations(world, career, roll.player);
    let d = '2030-05-25';
    for (let i = 0; i < 9; i++) {
      const to = addDays(d, 7);
      ({ world } = nationalWeek(world, career, roll.player, d, to));
      d = to;
    }
    const intl = world.intl!;
    const t = intl.tournament!;
    expect(t.name).toBe('Piala Dunia 2030');
    expect(new Set(t.teams).size).toBe(32);
    expect(t.fixtures.filter((f) => /^[A-H]$/.test(f.stage))).toHaveLength(48);
    expect(KO_STAGES.map((s) => t.fixtures.filter((f) => f.stage === s).length)).toEqual([8, 4, 2, 1]);
    for (const f of t.fixtures) {
      expect(f.score).toBeDefined();
      if (KO_STAGES.includes(f.stage) && f.score![0] === f.score![1]) expect(f.pens![0]).not.toBe(f.pens![1]);
    }
    expect(t.champion).toBeDefined();
    expect(intl.history.map((h) => h.id)).toEqual(['world-2030']);
    expect(intl.cycle).toBe(2032);
    // Inggris lolos dan pemain CA 195 masuk skuad
    expect(t.teams).toContain('ENG');
    expect(career.intl!.tournaments[0].name).toBe('Piala Dunia 2030');
    // (cedera tetap bisa terjadi walau Injury Proneness 1: cukup satu laga kalau ia cedera di turnamen)
    expect(career.intl!.caps).toBeGreaterThanOrEqual(career.injury ? 1 : 3);
  }, 60_000);

  it('karier: dipanggil di jeda internasional, caps = statistik timnas', () => {
    const roll = rollCharacter(w0, { countryId: 'IDN', position: 'ST' }, 'NAT-IDN');
    roll.player.ca = Math.max(roll.player.ca, 140);
    // tanpa cedera panjang supaya hasilnya tidak bergantung pada nasib di jeda internasional
    roll.player.hidden['Injury Proneness'] = 1;
    let world: World = { ...w0, players: [...w0.players, roll.player] };
    let career: Career = newCareer(roll, 0, 'test', w0.startDate);
    career.rel = initRelations(world, career, roll.player);
    for (let i = 0; i < 40; i++) {
      for (const m of pendingChoices(career)) ({ world, career } = resolveChoice(world, career, m.id, 0));
      ({ world, career } = advanceWeek(world, career));
    }
    const nc = career.intl!;
    expect(nc.caps + nc.u20Caps).toBeGreaterThan(0);
    const rows = career.stats.filter((s) => s.comp === 'Timnas');
    expect(rows.reduce((a, s) => a + s.apps, 0)).toBe(nc.caps);
    expect(rows.reduce((a, s) => a + s.goals, 0)).toBe(nc.goals);
    expect(career.inbox.some((m) => m.title.includes('Timnas'))).toBe(true);
    const intlGames = career.matches.filter((m) => m.comp === 'Timnas');
    for (const m of intlGames) expect(m.stage).toBeTruthy();
    // klasemen kualifikasi terisi
    expect(Object.values(world.intl!.table).some((r) => r.p > 0)).toBe(true);
  }, 120_000);
});
