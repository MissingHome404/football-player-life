import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { LEAGUES } from '../data/leagues';
import { COUNTRY_BY_ID } from '../data/countries';
import { NAME_POOLS } from '../data/names';

describe('world generator', () => {
  const w = generateWorld({ seed: 'TEST1234' });

  it('punya 26 liga dan semua klub', () => {
    expect(w.leagues).toHaveLength(26);
    expect(w.clubs).toHaveLength(LEAGUES.reduce((s, l) => s + l.clubs.length, 0));
  });

  const byClub = new Map<string, typeof w.players>();
  for (const p of w.players) {
    const id = p.contract!.clubId;
    if (!byClub.has(id)) byClub.set(id, []);
    byClub.get(id)!.push(p);
  }

  it('setiap klub punya 25 senior + 12 U19 dan manajer', () => {
    for (const c of w.clubs) {
      const sq = byClub.get(c.id) ?? [];
      expect(sq.filter((p) => !p.isYouth)).toHaveLength(25);
      expect(sq.filter((p) => p.isYouth)).toHaveLength(12);
      expect(w.staff.find((s) => s.id === c.managerId)).toBeTruthy();
    }
  });

  it('deterministik: seed sama = dunia sama', () => {
    const w2 = generateWorld({ seed: 'TEST1234' });
    expect(w2.players.slice(0, 50)).toEqual(w.players.slice(0, 50));
    const w3 = generateWorld({ seed: 'LAIN' });
    expect(w3.players[0]).not.toEqual(w.players[0]);
  });

  it('atribut 1-20, CA <= PA <= 200', () => {
    const bad: string[] = [];
    for (const p of w.players) {
      for (const g of [p.technical, p.mental, p.physical, p.goalkeeping, p.personality, p.hidden]) {
        for (const v of Object.values(g)) if (!(v >= 1 && v <= 20)) bad.push(p.id);
      }
      if (!(p.ca <= p.pa && p.pa <= 200) || !Number.isInteger(p.pa) || !Number.isInteger(p.ca)) bad.push(p.id);
    }
    expect(bad).toEqual([]);
  });

  it('semua negara punya pool nama', () => {
    const missing = w.players.filter((p) => !NAME_POOLS[COUNTRY_BY_ID[p.nationalityId].nameStyle]);
    expect(missing).toEqual([]);
  });
});
