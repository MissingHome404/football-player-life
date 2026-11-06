import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { squadOf } from '../sim/season';
import { newCareer } from '../sim/week';
import { initRelations } from '../sim/relations';
import { selection } from '../sim/match';
import { learnPositionWeek } from '../sim/training';
import { Match, PITCH_H, PITCH_W, pickXI, type ETeam } from '../sim/engine';
import {
  FORMATIONS,
  FORMATION_IDS,
  assignXI,
  bestSpot,
  clubFormation,
  familiarity,
  fitFactor,
  isCB,
  isDef,
  slotGroup,
  type FormationId,
} from '../sim/formation';
import { Rng } from '../rng';
import type { Career, Player, World } from '../types';

const w = generateWorld({ seed: 'FORM', activeLeagues: ['IDN1', 'ENG1'] });
const eng = w.clubs.filter((c) => c.leagueId === 'ENG1');
const seniors = (id: string) => squadOf(w, id).filter((p) => !p.isYouth);
const team = (id: string, formation: FormationId): ETeam => {
  const c = w.clubs.find((x) => x.id === id)!;
  const { xi, bench } = pickXI(seniors(id), undefined, false, formation);
  return { id, name: c.name, color: c.colors[0], color2: c.colors[1], formation, xi, bench };
};

function start(seed: string, position: 'ST' | 'AMR' = 'ST') {
  const roll = rollCharacter(w, { countryId: 'IDN', position }, seed);
  const world: World = { ...w, players: [...w.players, roll.player] };
  const career: Career = newCareer(roll, 0, 'test', w.startDate);
  career.rel = initRelations(world, career, roll.player);
  return { world, career, player: roll.player };
}

describe('formasi', () => {
  it('tiap formasi: 11 tempat unik, satu kiper, jumlah bek/gelandang/penyerang sesuai namanya', () => {
    for (const id of FORMATION_IDS) {
      const spots = FORMATIONS[id].spots;
      expect(spots).toHaveLength(11);
      expect(new Set(spots.map((s) => s.slot)).size).toBe(11);
      expect(new Set(spots.map((s) => s.num)).size).toBe(11);
      expect(spots.filter((s) => s.slot === 'GK')).toHaveLength(1);
      for (const s of spots) {
        expect(s.base[0]).toBeGreaterThan(0);
        expect(s.base[0]).toBeLessThan(PITCH_W / 1.5);
        expect(s.base[1]).toBeGreaterThan(0);
        expect(s.base[1]).toBeLessThan(PITCH_H);
      }
      // 3-5-2: wing back dihitung bek saat bertahan (lima pemain di belakang)
      const defs = spots.filter((s) => isDef(s.slot)).length;
      expect(defs).toBe(id === '3-5-2' ? 5 : +id[0]);
      // pemain terdepan: striker dan sayap (4-4-2 punya dua striker)
      const back3 = spots.filter((s) => isCB(s.slot)).length;
      expect(back3).toBe(id.startsWith('4') ? 2 : 3);
      expect(spots.filter((s) => slotGroup(s.slot) === 'GK')).toHaveLength(1);
    }
  });

  it('keakraban posisi: posisi utama 20, posisi asing membuat pemain bermain lebih buruk', () => {
    const p = seniors(eng[0].id).find((q) => q.mainPosition === 'ST')!;
    expect(familiarity(p, 'ST')).toBe(20);
    expect(familiarity(p, 'GK')).toBe(1);
    expect(familiarity(p, 'DC')).toBeLessThan(familiarity(p, 'AMC') + 1);
    let prev = 0;
    for (let f = 1; f <= 20; f++) {
      const v = fitFactor(f);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(fitFactor(20)).toBe(1);
    expect(fitFactor(1)).toBeLessThan(0.7);
  });

  it('pelatih menaruh kiper di gawang dan pemain di posisi yang cocok', () => {
    for (const f of FORMATION_IDS) {
      for (const c of eng.slice(0, 6)) {
        const squad = seniors(c.id);
        const xi = assignXI(squad, f);
        expect(xi.size).toBe(11);
        const spots = FORMATIONS[f].spots;
        for (const [i, p] of xi) {
          expect(spots[i].slot === 'GK').toBe(p.mainPosition === 'GK');
        }
        // rata-rata efektivitas tinggi: skuad bisa memainkan formasi pelatih
        const fit = [...xi].reduce((s, [i, p]) => s + fitFactor(familiarity(p, spots[i].pos[0]) > 0 ? Math.max(...spots[i].pos.map((x, k) => familiarity(p, x) - (k ? 2 : 0))) : 1), 0) / 11;
        expect(fit).toBeGreaterThan(0.9);
      }
    }
    // klub punya formasi tetap (sama untuk pelatih yang sama)
    expect(clubFormation(eng[0])).toBe(clubFormation({ ...eng[0] }));
    expect(new Set(w.clubs.map(clubFormation)).size).toBeGreaterThanOrEqual(4);
  });

  it('striker lebih sering jadi starter di formasi dua striker', () => {
    const { career, player } = start('FORM-ST');
    const club = eng[3];
    const mates = seniors(club.id);
    // striker kita setara striker terbaik klub
    const bestST = Math.max(...mates.filter((q) => q.mainPosition === 'ST').map((q) => q.ca));
    const me: Player = { ...player, isYouth: false, ca: bestST - 2 };
    const starts = (f: FormationId) => {
      let n = 0;
      for (let i = 0; i < 300; i++) if (selection(new Rng(`sel${i}`), me, mates, career, 0, f) === 'Inti') n++;
      return n;
    };
    expect(starts('4-4-2')).toBeGreaterThan(starts('4-3-3') + 30);
    expect(bestSpot(me, '4-4-2')).toBeGreaterThan(0);
  });

  it('latihan posisi baru menaikkan keakraban sampai dikuasai penuh', () => {
    const { career, player } = start('FORM-LEARN', 'AMR');
    const p: Player = structuredClone(player);
    career.plan = { ...career.plan, learnPos: 'ST', intensity: 'berat', focus: 'seimbang' };
    const before = familiarity(p, 'ST');
    let weeks = 0;
    while (career.plan.learnPos && weeks < 200) {
      learnPositionWeek(career, p);
      weeks++;
    }
    expect(before).toBeLessThan(20);
    expect(familiarity(p, 'ST')).toBe(20);
    expect(career.plan.learnPos).toBeNull();
    expect(weeks).toBeGreaterThan(8);
    expect(career.inbox[0].title).toMatch(/Posisi baru dikuasai/);
    // istirahat: tidak ada kemajuan
    const q: Player = structuredClone(player);
    career.plan = { ...career.plan, learnPos: 'ST', focus: 'istirahat' };
    learnPositionWeek(career, q);
    expect(familiarity(q, 'ST')).toBe(before);
  });

  it('match engine memakai formasi: posisi awal sesuai formasi dan laga tetap deterministik', () => {
    for (const f of FORMATION_IDS) {
      const input = { seed: `form-${f}`, home: team(eng[0].id, f), away: team(eng[1].id, '4-3-3') };
      const m = new Match(input);
      // posisi kick-off tiap pemain mengikuti posisi dasar formasinya (dilihat dari sisi tim)
      const spots = FORMATIONS[f].spots;
      for (const b of m.bodies.filter((x) => x.side === 0 && x.on)) {
        const spot = spots.find((s) => s.slot === b.p.slot)!;
        expect(spot).toBeDefined();
        expect(Math.abs(m.fy(0, b.y) - spot.base[1])).toBeLessThan(0.01);
      }
      const r1 = m.run();
      const r2 = new Match(input).run();
      expect(r2.score).toEqual(r1.score);
      expect(r1.score[0] + r1.score[1]).toBeLessThan(12);
    }
  }, 60_000);
});
