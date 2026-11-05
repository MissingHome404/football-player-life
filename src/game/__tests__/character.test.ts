import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';

describe('pembuatan karakter', () => {
  const w = generateWorld({ seed: 'CHAR' });

  it('seed sama = karakter sama, seed beda = karakter beda', () => {
    const a = rollCharacter(w, {}, 'X1');
    expect(rollCharacter(w, {}, 'X1')).toEqual(a);
    expect(rollCharacter(w, {}, 'X2').player).not.toEqual(a.player);
  });

  it('pilihan negara dan posisi dipakai', () => {
    for (let i = 0; i < 30; i++) {
      const r = rollCharacter(w, { countryId: 'IDN', position: 'ST' }, `S${i}`);
      expect(r.player.nationalityId).toBe('IDN');
      expect(r.player.mainPosition).toBe('ST');
    }
  });

  it('angka awal masuk akal', () => {
    const origins = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const r = rollCharacter(w, {}, `R${i}`);
      origins.add(r.origin);
      expect(r.age).toBeGreaterThanOrEqual(14);
      expect(r.age).toBeLessThanOrEqual(19);
      expect(r.player.pa).toBeGreaterThanOrEqual(r.player.ca + 20);
      expect(r.player.pa).toBeLessThanOrEqual(200);
      expect(r.stress).toBeGreaterThanOrEqual(0);
      expect(r.stress).toBeLessThanOrEqual(100);
      expect(r.money).toBeGreaterThanOrEqual(0);
      if (r.origin === 'local_academy' || r.origin === 'top_academy') {
        expect(r.clubId).toBeTruthy();
        expect(r.player.contract?.clubId).toBe(r.clubId);
      } else {
        expect(r.clubId).toBeNull();
      }
      if (r.origin === 'local_academy') {
        expect(w.clubs.find((c) => c.id === r.clubId)!.countryId).toBe(r.player.nationalityId);
      }
    }
    expect(origins.size).toBe(4);
  });
});
