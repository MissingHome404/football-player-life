import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { advanceWeek, newCareer } from '../sim/week';
import { initRelations } from '../sim/relations';
import { careerCsv, legacyScore, retireCareer, tierOf, HOF_MIN } from '../sim/retire';
import { ageDecline } from '../sim/training';
import { computeCA } from '../gen/player';
import { addDays } from '../date';
import { Rng } from '../rng';
import type { Career, World } from '../types';

const w0 = generateWorld({ seed: 'RETIRE', activeLeagues: ['ENG1'] });

function setup(position: 'ST' | 'GK' = 'ST'): { world: World; career: Career } {
  const roll = rollCharacter(w0, { countryId: 'ENG', position }, `RT-${position}`);
  const world: World = { ...w0, players: [...w0.players, roll.player] };
  const career = newCareer(roll, 0, 'test', w0.startDate);
  career.rel = initRelations(world, career, roll.player);
  return { world, career };
}

describe('pensiun, legacy & ekspor CSV', () => {
  it('pensiun atas pilihan sendiri: karier selesai, data lama tidak berubah, minggu tidak bisa lanjut', () => {
    const { world, career } = setup();
    career.stats.push({ season: '2026/27', team: 'X', clubId: 'c', comp: 'Liga', apps: 30, starts: 28, minutes: 2500, goals: 12, assists: 5, cleanSheets: 0, ratingSum: 30 * 7.1, motm: 3 });
    career.trophies = [{ id: 'league-ENG1-2026/27', name: 'Premier', season: '2026/27', team: 'X' }];
    career.awards = [{ id: 'award-top-ENG1-2026/27', name: 'Top Skor', season: '2026/27' }];
    const before = JSON.stringify(career);
    const r = retireCareer(world, career);
    expect(JSON.stringify(career)).toBe(before);
    const ret = r.career.retired!;
    expect(ret.reason).toBe('pilihan');
    expect(ret.legacy.total).toBe(ret.legacy.parts.reduce((a, x) => a + x.points, 0));
    expect(ret.legacy.parts.map((x) => x.label)).toEqual(expect.arrayContaining(['Gol & assist', 'Trofi', 'Penghargaan individu']));
    expect(ret.entry.goals).toBe(12);
    expect(ret.entry.trophies).toBe(1);
    expect(r.world.players.find((p) => p.isUser)!.contract).toBeNull();
    expect(r.career.inbox[0].id).toBe(`retired-${career.currentDate}`);
    expect(() => advanceWeek(r.world, r.career)).toThrow(/pensiun/);
    expect(retireCareer(r.world, r.career).career).toBe(r.career);
  });

  it('skor legacy naik dengan prestasi; tier & batas Hall of Fame', () => {
    const { world, career } = setup();
    const p = world.players.find((x) => x.isUser)!;
    const empty = legacyScore(world, career, p).total;
    career.stats.push({ season: '2030/31', team: 'X', clubId: 'c', comp: 'Liga', apps: 400, starts: 380, minutes: 30000, goals: 250, assists: 80, cleanSheets: 0, ratingSum: 400 * 7.4, motm: 60 });
    career.awards = [{ id: 'award-world-world-2031', name: 'Bintang Dunia 2031', season: '2031' }];
    const big = legacyScore(world, career, p);
    expect(big.total).toBeGreaterThan(empty + 200);
    expect(tierOf(0)).toBe('Karier Singkat');
    expect(tierOf(HOF_MIN)).toBe('Bintang Besar');
    expect(big.hallOfFame).toBe(big.total >= HOF_MIN);
  });

  it('dipaksa pensiun di usia 41', () => {
    const { world, career } = setup();
    const p = world.players.find((x) => x.isUser)!;
    // ulang tahun ke-41 jatuh di minggu ini
    p.birthDate = `${+career.currentDate.slice(0, 4) - 41}${addDays(career.currentDate, 3).slice(4)}`;
    const r = advanceWeek(world, career);
    expect(r.career.retired?.reason).toBe('usia');
    expect(r.career.retired?.age).toBe(41);
  });

  it('usia: fisik turun setelah 31, tidak sebelum', () => {
    const { world } = setup();
    const p = structuredClone(world.players.find((x) => x.isUser)!);
    for (const k of Object.keys(p.physical) as (keyof typeof p.physical)[]) p.physical[k] = 16;
    p.ca = computeCA(p);
    expect(Object.keys(ageDecline(p, 30, new Rng('a')))).toHaveLength(0);
    const ca = p.ca;
    let lost = 0;
    for (let age = 31; age <= 37; age++) lost += Object.values(ageDecline(p, age, new Rng(`a${age}`))).reduce((a, v) => a + v, 0);
    expect(lost).toBeLessThan(-10);
    expect(p.physical.Pace).toBeLessThan(16);
    expect(p.ca).toBeLessThan(ca);
  });

  it('CSV: bagian lengkap, pemisah & desimal sesuai pilihan, atribut urut seperti FM', () => {
    const { world, career } = setup();
    const p = world.players.find((x) => x.isUser)!;
    career.stats.push({ season: '2026/27', team: 'Klub; Satu', clubId: 'c', comp: 'Liga', apps: 2, starts: 2, minutes: 180, goals: 1, assists: 0, cleanSheets: 0, ratingSum: 14.5, motm: 0 });
    const csv = careerCsv(world, career, p, { sep: ';', decimal: ',' });
    for (const h of ['RIWAYAT PER MUSIM', 'TOTAL KARIER', 'ATRIBUT AKHIR', 'PERSONALITY DAN HIDDEN ATTRIBUTES']) expect(csv).toContain(h);
    expect(csv).toContain('"Klub; Satu"');
    expect(csv).toContain('7,25');
    const attrHead = csv.split('\r\n').find((l) => l.startsWith('Technical;'))!;
    expect(attrHead).toBe('Technical;;Mental;;Physical;');
    const next = csv.split('\r\n')[csv.split('\r\n').indexOf(attrHead) + 1];
    expect(next.startsWith(`Corners;${p.technical.Corners};Aggression;${p.mental.Aggression};Acceleration;`)).toBe(true);
    const en = careerCsv(world, career, p, { sep: ',', decimal: '.' });
    expect(en).toContain('7.25');
    // kiper: kolom pertama Goalkeeping
    const gk = setup('GK');
    const gkCsv = careerCsv(gk.world, gk.career, gk.world.players.find((x) => x.isUser)!);
    expect(gkCsv).toContain('Goalkeeping;;Mental;;Physical;');
  });
});
