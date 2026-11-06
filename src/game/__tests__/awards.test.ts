import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { newCareer } from '../sim/week';
import { playWeek, squadOf } from '../sim/season';
import { ledgerWeek, legendRecord, quickXI, recordOf, seasonAwards, tallyNational } from '../sim/awards';
import { BADGES, applyBadges, badgeValue, newBadges } from '../sim/badges';
import { engineAttrs } from '../sim/engine';
import { groupOf } from '../sim/match';
import { addDays } from '../date';
import { Rng } from '../rng';
import type { Career, World } from '../types';

const w0 = generateWorld({ seed: 'AWARD', activeLeagues: ['ENG1'] });

function setup(): { world: World; career: Career } {
  const roll = rollCharacter(w0, { countryId: 'ENG', position: 'ST' }, 'AW');
  const world: World = { ...w0, players: [...w0.players, roll.player] };
  return { world, career: newCareer(roll, 0, 'test', w0.startDate) };
}

describe('penghargaan, rekor & lencana', () => {
  it('XI cepat: 11 pemain, 1 kiper, tanpa pemain kita', () => {
    const club = w0.clubs.find((c) => c.leagueId === 'ENG1')!;
    const squad = squadOf(w0, club.id);
    const xi = quickXI(squad, squad[0].id);
    expect(xi).toHaveLength(11);
    expect(xi.filter((p) => groupOf(p.mainPosition) === 'GK')).toHaveLength(1);
    expect(xi.map((p) => p.id)).not.toContain(squad[0].id);
  });

  it('statistik musim: gol pemain = skor laga, dunia lama tidak berubah', () => {
    const { world, career } = setup();
    const user = world.players.find((p) => p.isUser)!;
    let w = world;
    let d = '2026-09-01';
    let total = 0;
    for (let i = 0; i < 4; i++) {
      const to = addDays(d, 7);
      const week = playWeek(w, d, to, new Rng(`aw${i}`));
      w = { ...w, seasons: week.seasons };
      for (const f of week.played.values()) if (f.home && f.leagueId === 'ENG1') total += f.score[0] + f.score[1];
      const before = JSON.stringify(w.ledger ?? null);
      const next = ledgerWeek(w, week, career, user, to);
      expect(JSON.stringify(w.ledger ?? null)).toBe(before);
      w = next;
      d = to;
    }
    expect(total).toBeGreaterThan(10);
    const rows = Object.values(w.ledger!.ENG1.rows);
    expect(rows.reduce((a, r) => a + r[1], 0)).toBe(total);
    expect(rows.every((r) => r[1] >= 0 && r[3] / r[0] >= 4 && r[3] / r[0] <= 10)).toBe(true);
    // deterministik
    expect(legendRecord(w, 'clubGoals', 'x')).toEqual(legendRecord(w, 'clubGoals', 'x'));
  });

  it('akhir musim: pemain terbaik, top skor, pemain muda; pesan & penghargaan untukmu', () => {
    const { world, career } = setup();
    const user = world.players.find((p) => p.isUser)!;
    const s = world.seasons.ENG1;
    const club = world.clubs.find((c) => c.leagueId === 'ENG1')!;
    user.contract = { clubId: club.id, wagePerWeek: 1000, expires: '2030-06-30', role: 'Inti' };
    const others = squadOf(world, club.id).filter((p) => !p.isYouth).slice(0, 15);
    const rows: Record<string, [number, number, number, number, string, number]> = {};
    for (const p of others) rows[p.id] = [30, 3, 2, 30 * 6.8, club.id, 0];
    rows[user.id] = [36, 41, 9, 36 * 7.9, club.id, 0];
    const w: World = { ...world, ledger: { ENG1: { season: s.label, rows } } };
    const out = seasonAwards(w, ['ENG1'], career, user, '2027-05-20');
    const mine = out.awards!.filter((a) => a.playerId === user.id).map((a) => a.kind);
    expect(mine).toEqual(expect.arrayContaining(['pots', 'top']));
    expect(career.awards!.length).toBeGreaterThanOrEqual(2);
    expect(career.inbox.some((m) => m.id === `awards-ENG1-${s.label}`)).toBe(true);
    expect(out.candidates!.ENG1[0].playerId).toBe(user.id);
    // musim yang dicatat dari tengah jalan tidak diberi penghargaan
    const partial = seasonAwards({ ...w, ledger: { ENG1: { season: s.label, rows, partial: true } } }, ['ENG1'], career, user, '2027-05-20');
    expect(partial.awards ?? []).toHaveLength(0);
  });

  it('rekor timnas: caps & gol semua pemain dihitung, pemain kita bisa memecahkan rekor', () => {
    const { world, career } = setup();
    const user = structuredClone(world.players.find((p) => p.isUser)!);
    const rec = recordOf(world, 'natCaps', 'ENG');
    expect(rec.value).toBeGreaterThan(40);
    expect(rec.playerId).toBeUndefined();
    career.intl = { caps: rec.value + 1, goals: 3, u20Caps: 0, u20Goals: 0, called: null, tournaments: [] };
    const out = tallyNational(world, [{ date: '2027-03-25', home: 'ENG', away: 'FRA', score: [2, 1] }], career, user, '2027-03-28');
    expect(recordOf(out, 'natCaps', 'ENG').playerId).toBe(user.id);
    expect(recordOf(world, 'natCaps', 'ENG')).toEqual(rec); // dunia lama tetap
    expect(career.inbox.some((m) => m.id === 'record-natCaps-ENG')).toBe(true);
    const caps = Object.values(out.tallies!.natCaps);
    expect(caps).toHaveLength(22);
    expect(Object.values(out.tallies!.natGoals).reduce((a, v) => a + v, 0)).toBe(3);
    // minggu tanpa laga liga: tidak ada yang berubah
    const same = ledgerWeek(world, { seasons: world.seasons, played: new Map(), leaguesPlayed: new Map(), finished: [] }, career, user, '2027-01-01');
    expect(same).toBe(world);
  });

  it('lencana: syarat atribut + pencapaian, bonus engine maksimal 20, nilai pasar naik', () => {
    const { world, career } = setup();
    const user = structuredClone(world.players.find((p) => p.isUser)!);
    user.physical.Pace = 18;
    user.physical.Acceleration = 17;
    user.technical['Long Shots'] = 17;
    career.feats = { long: 9, set: 0, head: 0 };
    let ids = newBadges(career, user).map((b) => b.id);
    expect(ids).toContain('speed');
    expect(ids).not.toContain('longshot');
    career.feats.long = 10;
    ids = newBadges(career, user).map((b) => b.id);
    expect(ids).toContain('longshot');
    career.badges = ids;
    expect(newBadges(career, user).map((b) => b.id)).not.toContain('speed');
    const a = engineAttrs(user);
    a.lon = 19.5;
    applyBadges(a, ['longshot', 'speed']);
    expect(a.lon).toBe(20);
    expect(a.pace).toBe(19);
    expect(badgeValue(career)).toBeCloseTo(1 + 0.05 * ids.length);
    expect(BADGES.every((b) => Object.keys(b.bonus).length > 0)).toBe(true);
  });
});
