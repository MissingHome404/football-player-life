import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { squadOf } from '../sim/season';
import { newCareer, resolveChoice } from '../sim/week';
import { initRelations } from '../sim/relations';
import { INJURIES, PLAN_INFO, injure, injuryFactor, innateTraits, recoverWeek } from '../sim/injury';
import { Match, pickXI, type ETeam } from '../sim/engine';
import { Rng } from '../rng';
import type { Career, Player, World } from '../types';

const w = generateWorld({ seed: 'INJ', activeLeagues: ['IDN1', 'ENG1'] });
const eng = w.clubs.filter((c) => c.leagueId === 'ENG1');

function start(seed: string) {
  const roll = rollCharacter(w, { countryId: 'IDN', position: 'ST' }, seed);
  const world: World = { ...w, players: [...w.players, roll.player] };
  const career: Career = newCareer(roll, 0, 'test', w.startDate);
  career.rel = initRelations(world, career, roll.player);
  return { world, career, player: world.players.find((p) => p.isUser)! };
}

/** Cedera dengan jenis tertentu (diulang sampai undian menghasilkan tingkat yang diminta) */
function injureUntil(career: Career, player: Player, severity: 'ringan' | 'sedang' | 'berat', seed: string) {
  for (let i = 0; i < 500; i++) {
    const c = structuredClone(career);
    const p = structuredClone(player);
    injure(c, new Rng(`${seed}${i}`), 'latihan', [], p);
    if (c.injury!.severity === severity && c.injury!.weeks! >= 2) return { career: c, player: p };
  }
  throw new Error('tidak ketemu');
}

describe('cedera', () => {
  it('cedera punya bagian tubuh, tingkat, riwayat, dan pilihan rencana pemulihan', () => {
    const { career, player } = start('INJ-A');
    const { career: c } = injureUntil(career, player, 'sedang', 'a');
    const inj = c.injury!;
    expect(inj.part).toBeDefined();
    expect(inj.weeks).toBe(inj.weeksLeft);
    expect(c.injuries![0]).toMatchObject({ name: inj.name, part: inj.part, weeks: inj.weeks, where: 'latihan' });
    const msg = c.inbox[0];
    expect(msg.eventId).toBe('injury_plan');
    expect(msg.choices).toHaveLength(3);
    expect(INJURIES.some((x) => x[1] === inj.part)).toBe(true);
  });

  it('pilihan: aman sesuai jadwal, cepat lebih singkat, fisio bayar (atau jatuh ke aman kalau uang kurang)', () => {
    const { world, career, player } = start('INJ-B');
    const base = injureUntil(career, player, 'berat', 'b');
    const weeks = base.career.injury!.weeks!;
    const msgId = base.career.inbox[0].id;
    const pick = (choice: number, money: number) => {
      const c = structuredClone(base.career);
      c.money = money;
      return resolveChoice({ ...world, players: world.players.map((p) => (p.isUser ? base.player : p)) }, c, msgId, choice).career;
    };
    const safe = pick(0, 0);
    expect(safe.injury!.weeksLeft).toBe(weeks);
    expect(safe.injury!.plan).toBe('aman');
    const fast = pick(1, 0);
    expect(fast.injury!.plan).toBe('cepat');
    expect(fast.injury!.weeksLeft).toBe(Math.max(1, Math.round(weeks * PLAN_INFO.cepat.speed)));
    const cost = Number(base.career.inbox[0].data!.cost);
    const physio = pick(2, cost + 100);
    expect(physio.injury!.plan).toBe('fisio');
    expect(physio.money).toBeCloseTo(100, 2);
    expect(physio.injury!.weeksLeft).toBeLessThan(weeks);
    const broke = pick(2, cost - 1);
    expect(broke.injury!.plan).toBe('aman');
    expect(broke.money).toBe(cost - 1);
    expect(broke.inbox.find((m) => m.id === msgId)!.result).toMatch(/tidak cukup/);
  });

  it('setelah sembuh ada masa rawan; memaksakan diri membuat masa rawan lebih lama dan lebih berisiko', () => {
    const { career, player } = start('INJ-C');
    for (const plan of ['aman', 'cepat'] as const) {
      const { career: c, player: p } = injureUntil(career, player, 'sedang', `c-${plan}`);
      c.injury!.plan = plan;
      const notes: string[] = [];
      let weeks = 0;
      while (c.injury) {
        recoverWeek(c, p, new Rng(`r${weeks}`), notes);
        weeks++;
      }
      expect(weeks).toBe(c.injuries![0].weeks);
      expect(notes.some((n) => n.includes('sudah pulih'))).toBe(true);
      expect(c.fragile).toMatchObject({ weeks: PLAN_INFO[plan].fragileWeeks, factor: PLAN_INFO[plan].fragile });
      expect(injuryFactor(c)).toBeCloseTo(PLAN_INFO[plan].fragile, 5);
      for (let i = 0; i < PLAN_INFO[plan].fragileWeeks; i++) recoverWeek(c, p, new Rng(`f${i}`), notes);
      expect(c.fragile).toBeUndefined();
      expect(injuryFactor(c)).toBe(1);
    }
  });

  it('cedera saat masa rawan sering kambuh di bagian yang sama dan menambah Injury Proneness', () => {
    const { career, player } = start('INJ-D');
    let relapses = 0;
    for (let i = 0; i < 60; i++) {
      const c = structuredClone(career);
      const p = structuredClone(player);
      c.fragile = { weeks: 4, factor: 3, part: 'hamstring' };
      injure(c, new Rng(`d${i}`), 'pertandingan', [], p);
      if (c.injury!.name.includes('kambuh')) {
        relapses++;
        expect(c.injury!.part).toBe('hamstring');
        expect(p.hidden['Injury Proneness']).toBe(Math.min(20, player.hidden['Injury Proneness'] + 1));
      }
      expect(c.fragile).toBeUndefined();
    }
    expect(relapses).toBeGreaterThan(25);
    expect(relapses).toBeLessThan(50);
  });

  it('cedera berat yang dipaksakan lebih sering meninggalkan bekas permanen', () => {
    const { career, player } = start('INJ-E');
    const scars = { aman: 0, cepat: 0 };
    for (const plan of ['aman', 'cepat'] as const) {
      for (let i = 0; i < 40; i++) {
        const { career: c, player: p } = injureUntil(career, player, 'berat', `e${i}-`);
        c.injury!.plan = plan;
        c.injury!.weeksLeft = 1;
        const before = { ...p.physical };
        recoverWeek(c, p, new Rng(`scar-${plan}-${i}`), []);
        const lost = (['Pace', 'Acceleration', 'Agility'] as const).some((k) => p.physical[k] < before[k]);
        if (lost) {
          scars[plan]++;
          expect(c.inbox[0].title).toBe('Bekas cedera');
        }
      }
    }
    expect(scars.cepat).toBeGreaterThan(scars.aman);
  }, 30_000);

  it('sifat bawaan di profil: kaki, tinggi badan, rawan cedera', () => {
    const { player } = start('INJ-F');
    const p = (o: Partial<Player>, prone = 10) => ({ ...player, ...o, hidden: { ...player.hidden, 'Injury Proneness': prone } });
    expect(innateTraits(p({ leftFoot: 18, rightFoot: 16 })).map((t) => t.label)).toContain('Dua kaki sama baik');
    expect(innateTraits(p({ leftFoot: 19, rightFoot: 4 })).map((t) => t.label)).toContain('Kaki kiri');
    expect(innateTraits(p({ heightCm: 193 })).map((t) => t.label)).toContain('Jangkung');
    expect(innateTraits(p({ heightCm: 168 })).map((t) => t.label)).toContain('Pendek');
    expect(innateTraits(p({}, 17)).map((t) => t.label)).toContain('Rawan cedera');
    expect(innateTraits(p({}, 3)).map((t) => t.label)).toContain('Tahan cedera');
  });
});

describe('sifat bawaan di match engine', () => {
  const team = (id: string, a: Partial<Record<'hgt' | 'wf', number>>): ETeam => {
    const c = w.clubs.find((x) => x.id === id)!;
    const { xi } = pickXI(squadOf(w, id).filter((p) => !p.isYouth), undefined, false);
    return { id: id + JSON.stringify(a), name: c.name, color: c.colors[0], color2: c.colors[1], style: 'Wing Play', xi: xi.map((e) => ({ ...e, a: { ...e.a, ...a } })) };
  };

  it('tim jangkung menang lebih banyak duel udara dan mencetak lebih banyak gol sundulan', async () => {
    // [jangkung, pendek]
    const head = [0, 0];
    const aerial = [0, 0];
    // cukup banyak laga supaya keberuntungan tidak menentukan (gol sundulan jarang); tim jangkung bergantian sisi
    for (let i = 0; i < 96; i++) {
      // jeda ke event loop supaya worker vitest tidak terblokir terlalu lama di CI
      if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
      const id = eng[i % eng.length].id;
      const tallHome = i % 2 === 0;
      const tall = team(id, { hgt: 194 });
      const short = team(id, { hgt: 170 });
      const m = new Match({ seed: `tall-${i}`, home: tallHome ? tall : short, away: tallHome ? short : tall, neutral: true });
      m.run();
      for (const b of m.bodies) {
        const k = (b.side === 0) === tallHome ? 0 : 1;
        head[k] += b.st.headGoals;
        aerial[k] += b.st.aerialWon ?? 0;
      }
    }
    // duel udara (sering terjadi) jelas dimenangkan tim jangkung; gol sundulan (jarang) juga lebih banyak
    expect(aerial[0]).toBeGreaterThan(aerial[1] * 1.1);
    expect(head[0]).toBeGreaterThanOrEqual(head[1]);
  }, 120_000);

  it('kaki lemah yang buruk: tembakan lebih jarang masuk dan umpan lebih melenceng', () => {
    const run = (wf: number) => {
      const id = eng[0].id;
      const m = new Match({ seed: 'foot', home: team(id, { wf }), away: team(eng[1].id, {}), neutral: true });
      const mm = m as unknown as {
        shoot(c: unknown, xg: number, pressure: number): void;
        passTo(c: unknown, to: unknown, air: boolean, setPiece: boolean): void;
        shot: { outcome: string } | null;
        pass: unknown;
      };
      const me = m.bodies.find((b) => b.side === 0 && b.p.slot === 'ST')!;
      const mate = m.bodies.find((b) => b.side === 0 && b.p.slot === 'LW')!;
      let goals = 0;
      let dev = 0;
      // tembakan dulu semua (urutan acak sama untuk kedua pemain: perbandingan berpasangan), lalu umpan
      for (let i = 0; i < 1500; i++) {
        // 12 m di depan gawang lawan, tanpa tekanan
        me.x = m.fx(0, 93);
        me.y = 34;
        mm.shoot(me, 0.03, 0);
        if (mm.shot?.outcome === 'goal') goals++;
        mm.shot = null;
      }
      for (let i = 0; i < 1500; i++) {
        // umpan datar 20 m ke rekan yang diam
        me.x = 50;
        me.y = 34;
        mate.x = 50;
        mate.y = 14;
        mate.vx = mate.vy = 0;
        mm.passTo(me, mate, false, false);
        dev += Math.abs(Math.atan2(m.ball.vx, -m.ball.vy));
        mm.pass = null;
      }
      return { goals, dev };
    };
    const good = run(20);
    const bad = run(1);
    expect(bad.goals).toBeLessThan(good.goals * 0.9);
    expect(bad.dev).toBeGreaterThan(good.dev * 1.1);
  });
});
