import { describe, it, expect } from 'vitest';
import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { buildSaveFile, readSaveFile } from '../save/codec';
import type { Career } from '../types';

describe('file save', () => {
  const w = generateWorld({ seed: 'SAVE', activeLeagues: ['IDN1', 'ENG1'] });
  const r = rollCharacter(w, { countryId: 'IDN' }, 'S1');
  const world = { ...w, players: [...w.players, r.player] };
  const career: Career = {
    saveId: 'save-test',
    characterSeed: 'S1',
    rerolls: 2,
    playerId: r.player.id,
    origin: r.origin,
    family: r.family,
    money: r.money,
    stress: r.stress,
    teamLabel: r.teamLabel,
    scoutPA: r.scoutPA,
    currentDate: w.startDate,
  };
  const summary = { playerName: 'X', age: 16, position: 'ST', countryId: 'IDN', team: 'T', gameDate: w.startDate };

  it('simpan lalu muat menghasilkan dunia dan karier yang sama', () => {
    const bytes = gzipSync(strToU8(JSON.stringify(buildSaveFile('save-test', world, career, summary))));
    const back = readSaveFile(JSON.parse(strFromU8(gunzipSync(bytes))));
    expect(back.career).toEqual(career);
    expect(back.world.players).toEqual(world.players);
    expect(back.world.clubs).toEqual(world.clubs);
    expect(back.world.leagues.filter((l) => l.active).map((l) => l.id)).toEqual(['ENG1', 'IDN1']);
  });

  it('menolak file yang bukan save', () => {
    expect(() => readSaveFile({ hello: 1 })).toThrow(/bukan file save/);
    const f = buildSaveFile('x', world, career, summary);
    expect(() => readSaveFile({ ...f, format: 99 })).toThrow(/lebih baru/);
  });
});
