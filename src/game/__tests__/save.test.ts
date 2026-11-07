import { describe, it, expect } from 'vitest';
import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { buildSaveFile, readSaveFile } from '../save/codec';
import { newCareer } from '../sim/week';

describe('file save', () => {
  const w = generateWorld({ seed: 'SAVE', activeLeagues: ['IDN1', 'ENG1'] });
  const r = rollCharacter(w, { countryId: 'IDN' }, 'S1');
  const world = { ...w, players: [...w.players, r.player] };
  const career = newCareer(r, 2, 'save-test', w.startDate);
  const summary = { playerName: 'X', age: 16, position: 'ST', countryId: 'IDN', team: 'T', gameDate: w.startDate };

  it('simpan lalu muat menghasilkan dunia dan karier yang sama', () => {
    const bytes = gzipSync(strToU8(JSON.stringify(buildSaveFile('save-test', world, career, summary))));
    const back = readSaveFile(JSON.parse(strFromU8(gunzipSync(bytes))));
    expect(back.career).toEqual(career);
    expect(back.world.players).toEqual(world.players);
    expect(back.world.clubs).toEqual(world.clubs);
    expect(back.world.leagues.filter((l) => l.active).map((l) => l.id)).toEqual(['ENG1', 'IDN1']);
  });

  it('save lama (format 1) tetap bisa dibuka', () => {
    const f = buildSaveFile('old', world, career, summary);
    const { week: _w, fitness: _f, injury: _i, plan: _p, progress: _g, inbox: _x, lastReport: _l, cooldowns: _c, ...rest } = career;
    const { agent: _a, offers: _o, loan: _n, history: _h, listed: _s, wantsLoan: _wl, joined: _j, rel: _r, ...v1 } = rest;
    void [_w, _f, _i, _p, _g, _x, _l, _c, _a, _o, _n, _h, _s, _wl, _j, _r];
    const back = readSaveFile(JSON.parse(JSON.stringify({ ...f, format: 1, career: v1 })));
    expect(back.career.week).toBe(0);
    expect(back.career.plan.focus).toBe('seimbang');
    expect(back.career.inbox.length).toBe(1);
    expect(back.career.money).toBe(career.money);
    // data transfer (format 4) ikut dibuat
    expect(back.career.offers).toEqual([]);
    expect(back.career.agent).toBeNull();
    expect(back.career.history.length).toBe(1);
    // relasi (format 5) ikut dibuat
    expect(back.career.rel.media).toBe(0);
    expect(back.career.rel.partner).toBeNull();
  });

  it('save lama (format 7) tanpa Creativity: atributnya diisi tetap (sama setiap kali dimuat)', () => {
    const f = buildSaveFile('old7', world, career, summary);
    const players = (f.world.players as { hidden: number[] }[]).map((p) => ({ ...p, hidden: p.hidden.slice(0, -1) }));
    const old = JSON.parse(JSON.stringify({ ...f, format: 7, world: { ...f.world, players } }));
    const a = readSaveFile(old);
    const b = readSaveFile(JSON.parse(JSON.stringify(old)));
    const cre = a.world.players.map((p) => p.hidden.Creativity);
    expect(cre.every((v) => v >= 1 && v <= 20)).toBe(true);
    expect(b.world.players.map((p) => p.hidden.Creativity)).toEqual(cre);
    // nilainya sama dengan pemain yang dibuat generator
    expect(cre).toEqual(world.players.map((p) => p.hidden.Creativity));
    expect(new Set(cre).size).toBeGreaterThan(8);
  });

  it('menolak file yang bukan save', () => {
    expect(() => readSaveFile({ hello: 1 })).toThrow(/bukan file save/);
    const f = buildSaveFile('x', world, career, summary);
    expect(() => readSaveFile({ ...f, format: 99 })).toThrow(/lebih baru/);
  });
});
