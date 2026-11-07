import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { squadOf } from '../sim/season';
import { Match, pickXI, type ETeam } from '../sim/engine';
import { FORMATIONS } from '../sim/formation';
import { POSITION_ROLES } from '../data/roles';
import { ROLE_DUTIES, clubTactic, makeTactic, tacticIntensity, tacticK, type Tactic } from '../sim/tactics';
import { PLAY_TRAITS, playTraits } from '../sim/traits';
import { famStart, intensityDrain, learnTactic, tacticFam, understandWeek } from '../sim/understanding';
import type { Career } from '../types';
import { LEAGUE_STAKES, leagueStakes, stageStakes } from '../sim/stakes';

const w = generateWorld({ seed: 'TACT', activeLeagues: ['ENG1', 'IDN1'] });
const eng = w.clubs.filter((c) => c.leagueId === 'ENG1');

const side = (id: string, t?: Tactic): ETeam => {
  const c = w.clubs.find((x) => x.id === id)!;
  const { xi, bench } = pickXI(squadOf(w, id).filter((p) => !p.isYouth), undefined, false, t?.formation, t);
  return { id, name: c.name, color: c.colors[0], color2: c.colors[1], xi, bench, formation: t?.formation, ...(t ? { tactic: tacticK(t) } : {}) };
};

describe('taktik pelatih', () => {
  it('setiap pelatih punya taktik tetap dengan peran yang cocok untuk tiap tempat', () => {
    for (const c of eng) {
      const t = clubTactic(c);
      expect(clubTactic(c)).toEqual(t);
      const spots = FORMATIONS[t.formation].spots;
      expect(t.slots).toHaveLength(spots.length);
      t.slots.forEach((s, i) => {
        expect(spots[i].pos.some((pos) => POSITION_ROLES[pos].includes(s.role))).toBe(true);
        expect(ROLE_DUTIES[s.role] ?? ['De', 'Su', 'At']).toContain(s.duty);
      });
      expect(t.workIntoBox && t.shootOnSight).toBe(false);
    }
    // pelatih baru membawa taktik baru
    const c = eng[0];
    expect(clubTactic({ ...c, managerId: 'pelatih-baru' }).name + clubTactic({ ...c, managerId: 'pelatih-baru' }).slots.map((s) => s.role).join()).not.toBe(
      clubTactic(c).name + clubTactic(c).slots.map((s) => s.role).join(),
    );
  });

  it('pemain wajib memainkan peran dari pelatih, bukan peran favoritnya', () => {
    const squad = squadOf(w, eng[1].id).filter((p) => !p.isYouth);
    const st = squad.find((p) => p.mainPosition === 'ST')!;
    const me = { ...st, preferredRole: 'cf', isUser: true };
    const base = makeTactic('tes', 'Possession', '4-2-3-1');
    const stIdx = FORMATIONS[base.formation].spots.findIndex((s) => s.slot === 'ST');
    const t: Tactic = { ...base, slots: base.slots.map((s, i) => (i === stIdx ? { role: 'f9', duty: 'Su' } : s)) };
    const { xi } = pickXI([me, ...squad.filter((p) => p.id !== st.id)], me, true, t.formation, t, (p) => (p.id === me.id ? 0.4 : undefined));
    const mine = xi.find((e) => e.id === me.id)!;
    expect(mine.slot).toBe('ST');
    expect(mine.role).toBe('f9');
    expect(mine.duty).toBe('Su');
    expect(mine.fam).toBe(0.4);
    // pemain AI: perkiraan pemahaman 0.5..1 dan kebiasaan bermainnya ikut dibawa
    for (const e of xi.filter((x) => !x.user)) {
      expect(e.fam).toBeGreaterThanOrEqual(0.5);
      expect(e.fam).toBeLessThanOrEqual(1);
      expect(e.traits).toBeDefined();
    }
  });

  it('kebiasaan bermain tetap untuk pemain yang sama, maksimal 3, tanpa pasangan yang bertentangan', () => {
    let some = 0;
    for (const p of w.players.slice(0, 600)) {
      const t = playTraits(p);
      expect(playTraits(p)).toEqual(t);
      expect(t.length).toBeLessThanOrEqual(3);
      for (const id of t) expect(PLAY_TRAITS[id]).toBeDefined();
      expect(t.includes('cutsInside') && t.includes('hugsLine')).toBe(false);
      expect(t.includes('getsForward') && t.includes('staysBack')).toBe(false);
      if (p.mainPosition === 'GK') expect(t).toEqual([]);
      if (t.length) some++;
    }
    expect(some).toBeGreaterThan(300);
  });

  it('taktik yang lebih intens membuat pemain lebih cepat lelah', { timeout: 60_000 }, () => {
    const t = clubTactic(eng[2]);
    const tire = (intensity: number) => {
      const home = side(eng[2].id, t);
      home.tactic = { ...home.tactic!, intensity };
      const m = new Match({ seed: 'intens', home, away: side(eng[3].id) });
      m.run();
      const mine = m.bodies.filter((b) => b.side === 0 && b.p.slot !== 'GK' && b.st.on === 0);
      return mine.reduce((s, b) => s + b.tire, 0) / mine.length;
    };
    expect(tire(0.95)).toBeGreaterThan(tire(0.1) * 1.2);
    expect(tacticIntensity(makeTactic('a', 'Gegenpress', '4-3-3'))).toBeGreaterThan(tacticIntensity(makeTactic('a', 'Defensive', '4-4-2')));
  });

  it('tendangan gawang: jam berhenti dan kiper menunggu rekan siap', { timeout: 60_000 }, () => {
    const m = new Match({ seed: 'gk-kick', home: side(eng[4].id), away: side(eng[5].id) });
    const view = m as unknown as { restart: { kind: string } | null; t: number };
    let kicks = 0;
    let waited = 0;
    let startT = -1;
    let steps = 0;
    while (!m.done) {
      const r = view.restart;
      if (r?.kind === 'goalkick') {
        if (startT < 0) {
          startT = view.t;
          steps = 0;
        }
        steps++;
        // jam tidak berjalan selama tendangan gawang disiapkan
        expect(view.t).toBe(startT);
      } else if (startT >= 0) {
        kicks++;
        waited += steps;
        startT = -1;
      }
      m.step();
    }
    expect(kicks).toBeGreaterThan(2);
    // rata-rata menunggu minimal 1,5 detik permainan (15 langkah)
    expect(waited / kicks).toBeGreaterThanOrEqual(15);
  });
});

describe('pemahaman taktik', () => {
  const p = w.players.find((x) => x.mainPosition === 'MC')!;
  const club = w.clubs.find((c) => c.id === p.contract?.clubId)!;
  const career = (focus: 'seimbang' | 'taktik'): Career =>
    ({
      tacticFam: {},
      injury: null,
      plan: { focus, intensity: 'normal', activity: 'rumah', coaches: { teknik: false, fisik: false, mental: false, psikolog: false } },
    }) as unknown as Career;

  it('dimulai rendah di taktik baru dan naik lebih cepat dengan fokus latihan Taktik', () => {
    const a = career('seimbang');
    const b = career('taktik');
    const key = `${club.id}:${club.managerId}`;
    expect(tacticFam(a, key, p)).toBe(famStart(p));
    expect(famStart(p)).toBeLessThan(0.46);
    for (let i = 0; i < 6; i++) {
      understandWeek(a, p, club);
      understandWeek(b, p, club);
    }
    expect(tacticFam(a, key, p)).toBeGreaterThan(famStart(p));
    expect(tacticFam(b, key, p)).toBeGreaterThan(tacticFam(a, key, p) + 0.05);
    // tidak pernah lewat 100%
    for (let i = 0; i < 200; i++) learnTactic(b, key, p, 0.2);
    expect(tacticFam(b, key, p)).toBeLessThanOrEqual(1);
    // save lama tanpa data pemahaman: dianggap sudah cukup paham
    expect(tacticFam({} as Career, key, p)).toBeGreaterThanOrEqual(0.7);
  });

  it('intensitas & stamina menentukan kebugaran yang hilang setelah laga', () => {
    const fit = { ...p, physical: { ...p.physical, Stamina: 18, 'Natural Fitness': 18 } };
    const weak = { ...p, physical: { ...p.physical, Stamina: 6, 'Natural Fitness': 6 } };
    expect(intensityDrain(0.9, p)).toBeGreaterThan(intensityDrain(0.2, p));
    expect(intensityDrain(0.9, weak)).toBeGreaterThan(intensityDrain(0.9, fit));
  });
});

describe('match engine versi 12', () => {
  type View = {
    restart: { kind: string; side: 0 | 1; runup?: number } | null;
    pause: number;
    t: number;
    entering: number;
    shot: { diveY?: number } | null;
  };

  it('pergantian hanya saat bola mati; jam berhenti sampai pemain pengganti di posisinya', { timeout: 60_000 }, () => {
    let subs = 0;
    for (let i = 0; i < 3; i++) {
      const home = side(eng[6 + i].id, clubTactic(eng[6 + i]));
      const m = new Match({ seed: `subs-${i}`, home, away: side(eng[12 + i].id, clubTactic(eng[12 + i])) });
      const v = m as unknown as View;
      let seen = 0;
      while (!m.done) {
        const t0 = v.t;
        const walking = v.entering > 0 && !!v.restart;
        m.step();
        const ev = m.result().events.filter((e) => e.kind === 'sub');
        if (ev.length > seen) {
          seen = ev.length;
          subs++;
          // pergantian dilakukan saat bola mati
          expect(v.restart).not.toBeNull();
        }
        if (walking) expect(v.t).toBe(t0);
        for (const q of m.subbing) {
          // pengganti baru masuk setelah pemain yang diganti melewati garis samping
          const outInside = q.out.leaving && q.out.y >= 0 && q.out.y <= 68;
          if (q.sub.on && v.restart) expect(outInside).toBe(false);
          // selama menunggu, pengganti berdiri di luar lapangan
          if (q.sub.waiting) expect(q.sub.y).toBeGreaterThan(68);
        }
      }
    }
    expect(subs).toBeGreaterThan(6);
  });

  it('selebrasi: pencetak gol lari ke bendera sudut, kiper merayakan di dekat gawangnya', { timeout: 60_000 }, () => {
    let checked = 0;
    for (let i = 0; i < 6 && checked < 3; i++) {
      const m = new Match({ seed: `celeb-${i}`, home: side(eng[i].id), away: side(eng[10 + i].id) });
      const v = m as unknown as View & { celeb: { side: 0 | 1; scorer: { x: number; y: number; side: 0 | 1 } | null } | null };
      while (!m.done) {
        m.step();
        if (v.pause > 0 && v.pause < 2.6 && v.pause > 2.4 && v.celeb?.scorer) {
          const sc = v.celeb.scorer;
          const fx = m.fx(sc.side, sc.x);
          const fy = m.fy(sc.side, sc.y);
          expect(fx).toBeGreaterThan(90);
          expect(Math.min(fy, 68 - fy)).toBeLessThan(14);
          const gk = m.bodies.find((b) => b.on && b.side === v.celeb!.side && b.p.slot === 'GK')!;
          expect(m.fx(gk.side, gk.x)).toBeLessThan(8);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('penalti: penendang mengambil ancang-ancang, kiper sudah memilih arah saat bola ditendang', { timeout: 60_000 }, () => {
    let pens = 0;
    for (let i = 0; i < 20 && pens < 2; i++) {
      const m = new Match({ seed: `probe-${i}`, home: side(eng[0].id, clubTactic(eng[0])), away: side(eng[1].id, clubTactic(eng[1])) });
      const v = m as unknown as View;
      let run = -1;
      while (!m.done) {
        const r = v.restart;
        m.step();
        if (r?.kind === 'penalty' && r.runup !== undefined) run = Math.max(run, r.runup);
        if (r?.kind === 'penalty' && !v.restart) {
          pens++;
          // berlari dari ancang-ancang beberapa langkah, bukan langsung menendang
          expect(run).toBeGreaterThan(0.3);
          expect(v.shot?.diveY).toBeDefined();
          run = -1;
        }
      }
    }
    expect(pens).toBeGreaterThan(0);
  });

  it('striker tidak turun ke kotak sendiri saat tendangan gawang timnya', { timeout: 60_000 }, () => {
    const m = new Match({ seed: 'gk-st', home: side(eng[2].id, clubTactic(eng[2])), away: side(eng[3].id, clubTactic(eng[3])) });
    const v = m as unknown as View;
    const xs: number[] = [];
    while (!m.done) {
      m.step();
      const r = v.restart;
      if (r?.kind !== 'goalkick') continue;
      for (const b of m.bodies) if (b.on && b.side === r.side && (b.p.slot === 'ST' || b.p.slot === 'LS' || b.p.slot === 'RS')) xs.push(m.fx(b.side, b.x));
    }
    expect(xs.length).toBeGreaterThan(10);
    expect(xs.reduce((s, x) => s + x, 0) / xs.length).toBeGreaterThan(38);
  });
});

describe('match engine versi 13', () => {
  it('Finishing jelas mengubah peluang gol tembakan kaki di kotak penalti', () => {
    const m = new Match({ seed: 'fin', home: side(eng[0].id), away: side(eng[1].id) });
    const v = m as unknown as { shotProb(c: unknown, fx: number, fy: number, pressure: number): number };
    const st = m.bodies.find((b) => b.on && b.side === 0 && b.p.slot !== 'GK')!;
    const at = (fin: number) => {
      st.p.a.fin = fin;
      return v.shotProb(st, 94, 30, 0.3);
    };
    const p5 = at(5);
    const p10 = at(10);
    const p20 = at(20);
    expect(p20 / p10).toBeGreaterThan(1.3);
    expect(p5 / p10).toBeLessThan(0.85);
  });
});

describe('match engine versi 14: kepribadian & mental', () => {
  type Mind = { mind(): void; frustrate(b: unknown, n: number): void; foul(d: unknown, c: unknown): void };
  const withAll = (t: ETeam, k: keyof ETeam['xi'][number]['a'], v: number): ETeam => ({
    ...t,
    xi: t.xi.map((p) => ({ ...p, a: { ...p.a, [k]: v } })),
    bench: t.bench?.map((p) => ({ ...p, a: { ...p.a, [k]: v } })),
  });

  it('tingkat tekanan laga dari nama babak, derby, dan akhir musim', () => {
    expect(stageStakes('Piala Liga · Final', 0.45)).toBe(1);
    expect(stageStakes('Semifinal · leg 2', 0.55)).toBe(0.85);
    expect(stageStakes('Perempat final', 0.45)).toBe(0.75);
    expect(stageStakes('16 besar', 0.45)).toBe(0.65);
    expect(stageStakes('Grup B · matchday 2', 0.55)).toBe(0.55);
    expect(stageStakes('Laga internasional', 0.5)).toBeLessThanOrEqual(0.25);
    expect(leagueStakes({ round: 3, rounds: 38, derby: false })).toBe(LEAGUE_STAKES);
    expect(leagueStakes({ round: 36, rounds: 38, derby: true })).toBeCloseTo(0.65);
    expect(leagueStakes({ round: 36, rounds: 38, derby: true, youth: true })).toBe(0.2);
  });

  it('di final pemain gugup (Pressure & Important Matches rendah) kehilangan ketenangan, pemain bermental baja tidak', () => {
    const run = (v: number) => {
      const home = withAll(withAll(side(eng[0].id), 'pre', v), 'imp', v);
      const m = new Match({ seed: 'nerve', home, away: side(eng[1].id), stakes: 1 });
      return m.bodies.filter((b) => b.on && b.side === 0).map((b) => b.p.a.cmp - b.base.cmp);
    };
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(avg(run(3))).toBeLessThan(-1);
    expect(avg(run(18))).toBeGreaterThan(0.5);
    // laga liga biasa: efeknya jauh lebih kecil
    const league = new Match({ seed: 'nerve', home: withAll(withAll(side(eng[0].id), 'pre', 3), 'imp', 3), away: side(eng[1].id) });
    const l = avg(league.bodies.filter((b) => b.on && b.side === 0).map((b) => b.p.a.cmp - b.base.cmp));
    expect(l).toBeGreaterThan(avg(run(3)));
  });

  it('Temperament rendah cepat frustrasi; frustrasi menaikkan agresi dan menurunkan ketenangan', () => {
    const m = new Match({ seed: 'tem', home: side(eng[0].id), away: side(eng[1].id) });
    const v = m as unknown as Mind;
    const [hot, calm] = m.bodies.filter((b) => b.on && b.side === 0 && b.p.slot !== 'GK');
    hot.p.a.tem = 3;
    calm.p.a.tem = 18;
    for (const b of [hot, calm]) v.frustrate(b, 0.3);
    expect(hot.frus).toBeGreaterThan(calm.frus * 2);
    v.mind();
    expect(hot.p.a.agg).toBeGreaterThan(hot.base.agg + 2);
    expect(hot.p.a.cmp).toBeLessThan(hot.base.cmp - 0.5);
    // dilanggar membuat frustrasi
    const before = calm.frus;
    v.foul(m.bodies.find((b) => b.on && b.side === 1 && b.p.slot !== 'GK'), calm);
    expect(calm.frus).toBeGreaterThan(before);
  });

  it('Consistency menentukan naik turunnya performa harian', () => {
    const spread = (cons: number) => {
      let s = 0;
      let n = 0;
      for (let i = 0; i < 40; i++) {
        const home = withAll(side(eng[2].id), 'cons', cons);
        const m = new Match({ seed: `cons-${i}`, home, away: side(eng[3].id) });
        // simpangan tiap pemain dari rata-rata timnya (tanpa performa tim & keunggulan kandang)
        const d = m.bodies.filter((x) => x.on && x.side === 0).map((b) => b.base.pas - home.xi.find((p) => p.id === b.p.id)!.a.pas);
        const mean = d.reduce((t, x) => t + x, 0) / d.length;
        for (const x of d) {
          s += Math.abs(x - mean);
          n++;
        }
      }
      return s / n;
    };
    expect(spread(3)).toBeGreaterThan(spread(18) * 2.5);
  });

  it('Dirtiness menambah pelanggaran, Sportsmanship rendah membuat pemain diving', () => {
    let clean = 0;
    let dirty = 0;
    let dives = 0;
    for (let i = 0; i < 12; i++) {
      const a = new Match({ seed: `dirt-${i}`, home: withAll(side(eng[4].id), 'dirt', 2), away: side(eng[5].id) });
      a.run();
      clean += a.fouls[0];
      const b = new Match({ seed: `dirt-${i}`, home: withAll(withAll(side(eng[4].id), 'dirt', 18), 'spo', 1), away: side(eng[5].id) });
      b.run();
      dirty += b.fouls[0];
      dives += b.dives;
    }
    expect(dirty).toBeGreaterThan(clean * 1.25);
    expect(dives).toBeGreaterThan(0);
  }, 30000);
});
