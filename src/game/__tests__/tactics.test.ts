import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { squadOf } from '../sim/season';
import { Match, engineAttrs, pickXI, topSpeed, type ETeam } from '../sim/engine';
import { FORMATIONS } from '../sim/formation';
import { POSITION_ROLES } from '../data/roles';
import { ROLE_DUTIES, clubTactic, makeTactic, tacticIntensity, tacticK, type Tactic } from '../sim/tactics';
import { PLAY_TRAITS, playTraits } from '../sim/traits';
import { famStart, intensityDrain, learnTactic, tacticFam, understandWeek } from '../sim/understanding';
import type { Career } from '../types';
import { LEAGUE_STAKES, leagueStakes, stageStakes } from '../sim/stakes';
import { OOP_OPTIONS, ROLE_PLAY, defaultOop, slotKind, type Duty, type OopRole } from '../sim/roleplay';

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
    let kicks = 0;
    let waited = 0;
    // dua laga supaya cukup banyak tendangan gawang
    for (const seed of ['gk-kick', 'gk-kick-2']) {
      const m = new Match({ seed, home: side(eng[4].id), away: side(eng[5].id) });
      const view = m as unknown as { restart: { kind: string } | null; t: number };
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
      // (v18: peluang sedang di kotak penalti; peluang yang sangat bagus sudah mendekati batas atas)
      return v.shotProb(st, 90, 28, 0.3);
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

describe('match engine versi 15: tugas per peran', () => {
  const withRoles = (t: ETeam, f: (slot: string) => { role: string; duty: Duty } | null): ETeam => ({
    ...t,
    xi: t.xi.map((p) => {
      const r = f(p.slot);
      return r ? { ...p, ...r } : p;
    }),
  });
  /** rata-rata posisi maju (bingkai tim sendiri) tiap pemain tim tuan rumah saat bola dikuasai lawan / dikuasai sendiri */
  const depth = (m: Match, inPoss: boolean, ok: () => boolean = () => true) => {
    const sum = new Map<string, number[]>();
    for (let i = 0; i < 4000 && !m.done; i++) {
      m.step();
      if (!m.owner || (m.owner.side === 0) !== inPoss || !ok()) continue;
      for (const b of m.bodies) if (b.on && b.side === 0) (sum.get(b.p.id) ?? sum.set(b.p.id, []).get(b.p.id)!).push(m.fx(0, b.x));
    }
    return (id: string) => {
      const xs = sum.get(id) ?? [];
      return xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
    };
  };

  it('peran & tugas baru tersedia: Stopper/Cover untuk bek tengah, Libero, Segundo Volante, Otomatis', () => {
    for (const r of ['cd', 'bpd', 'ncb']) expect(ROLE_DUTIES[r]).toEqual(expect.arrayContaining(['De', 'St', 'Co']));
    expect(POSITION_ROLES.DC).toContain('lib');
    expect(POSITION_ROLES.DM).toContain('sv');
    for (const r of ['fb', 'wb', 'cm', 'wm']) expect(ROLE_DUTIES[r]).toContain('Au');
    // setiap peran punya gaya main sendiri di mesin laga
    for (const list of Object.values(POSITION_ROLES)) for (const r of list) expect(ROLE_PLAY[r]).toBeDefined();
    // pelatih AI memakainya
    const duties = new Set<string>();
    const roles = new Set<string>();
    for (const c of w.clubs) {
      for (const s of clubTactic(c).slots) {
        duties.add(s.duty);
        roles.add(s.role);
      }
    }
    for (const d of ['St', 'Co', 'Au']) expect(duties).toContain(d);
    for (const r of ['lib', 'sv']) expect(roles).toContain(r);
  });

  it('cover berdiri lebih dalam daripada stopper; stopper keluar menempel penyerang', () => {
    const home = withRoles(side(eng[0].id), (s) => (s === 'RCB' ? { role: 'cd', duty: 'St' } : s === 'LCB' ? { role: 'cd', duty: 'Co' } : null));
    const m = new Match({ seed: 'stco', home, away: side(eng[1].id) });
    const at = depth(m, false);
    const st = home.xi.find((p) => p.slot === 'RCB')!;
    const co = home.xi.find((p) => p.slot === 'LCB')!;
    expect(at(st.id) - at(co.id)).toBeGreaterThan(1.5);
  });

  it('libero maju ke lini tengah saat timnya menguasai bola', () => {
    const t = makeTactic('lib-test', 'Possession', '3-5-2');
    const home = withRoles(side(eng[2].id, t), (s) => (s === 'CB' ? { role: 'lib', duty: 'Su' } : s === 'RCB' || s === 'LCB' ? { role: 'cd', duty: 'De' } : null));
    const m = new Match({ seed: 'lib', home, away: side(eng[3].id) });
    const at = depth(m, true);
    const lib = home.xi.find((p) => p.slot === 'CB')!;
    const others = home.xi.filter((p) => p.slot === 'RCB' || p.slot === 'LCB');
    expect(others).toHaveLength(2);
    for (const o of others) expect(at(lib.id) - at(o.id)).toBeGreaterThan(5);
  });

  it('segundo volante menyusul ke depan saat serangan sampai di sepertiga akhir, gelandang bertahan biasa tidak', () => {
    const t = makeTactic('sv-test', 'Counter', '4-2-3-1');
    const home = withRoles(side(eng[4].id, t), (s) => (s === 'RDM' ? { role: 'sv', duty: 'At' } : s === 'LDM' ? { role: 'dm', duty: 'De' } : null));
    const m = new Match({ seed: 'sv', home, away: side(eng[5].id) });
    const at = depth(m, true, () => m.fx(0, m.ball.x) > 70);
    const sv = home.xi.find((p) => p.slot === 'RDM')!;
    const dm = home.xi.find((p) => p.slot === 'LDM')!;
    expect(at(sv.id) - at(dm.id)).toBeGreaterThan(6);
  });

  it('tugas Otomatis: menyerang saat tertinggal di akhir laga, bertahan saat unggul', () => {
    const home = withRoles(side(eng[6].id), (s) => (s === 'RB' || s === 'LB' ? { role: 'fb', duty: 'Au' } : null));
    const m = new Match({ seed: 'auto', home, away: side(eng[7].id) });
    const v = m as unknown as { mentality(): void };
    const fbs = m.bodies.filter((b) => b.side === 0 && b.p.duty === 'Au');
    expect(fbs.length).toBe(2);
    m.half = 2;
    m.t = 150 * 1.9;
    m.score = [0, 2];
    v.mentality();
    for (const b of fbs) expect(b.autoDuty).toBe('At');
    m.score = [2, 0];
    v.mentality();
    for (const b of fbs) expect(b.autoDuty).toBe('De');
  });
});

describe('match engine versi 16: peran tanpa bola, man marking, jebakan offside', () => {
  type Priv = {
    offsideTrap(side: 0 | 1, line: number, team: unknown[], opps: unknown[]): boolean;
    assignMarks(side: 0 | 1, team: unknown[], opps: unknown[]): void;
    trapNext: [number, number];
    trapUntil: [number, number];
    trapLate: Set<unknown>;
    marks: Map<unknown, unknown>;
  };

  it('pelatih AI memberi peran tanpa bola untuk tiap tempat; ada yang memakai jebakan offside & man marking', () => {
    let trap = 0;
    let man = 0;
    for (const c of w.clubs) {
      const t = clubTactic(c);
      const spots = FORMATIONS[t.formation].spots;
      t.slots.forEach((s, i) => {
        const kind = slotKind(spots[i].slot);
        if (kind === 'gk') return;
        expect(OOP_OPTIONS[kind]).toContain(s.oop);
      });
      if (t.trap) trap++;
      if (t.marking === 'man') man++;
    }
    expect(trap).toBeGreaterThan(0);
    expect(man).toBeGreaterThan(0);
    expect(defaultOop('pf', 'Su', 'ST')).toBe('press');
    expect(defaultOop('p', 'At', 'ST')).toBe('outlet');
    expect(defaultOop('cd', 'St', 'RCB')).toBe('stop');
    expect(defaultOop('dm', 'De', 'RDM')).toBe('screen');
  });

  it('jebakan offside: bek dengan teamwork, konsentrasi & antisipasi rendah lebih sering terlambat', () => {
    const lateRate = (v: number) => {
      const home = side(eng[0].id);
      home.xi = home.xi.map((p) => ({ ...p, a: { ...p.a, tea: v, con: v, ant: v } }));
      const m = new Match({ seed: 'trap', home, away: side(eng[1].id) });
      const pv = m as unknown as Priv & { restart: unknown; dead: unknown };
      pv.restart = null;
      pv.dead = null;
      const team = m.bodies.filter((b) => b.on && b.side === 0);
      const opps = m.bodies.filter((b) => b.on && b.side === 1);
      const line = 30;
      // semua pemain kita jauh dari pembawa bola lawan; satu penyerang lawan di dekat garis
      for (const b of team) {
        b.x = m.fx(0, b.p.slot === 'GK' ? 3 : line);
        b.y = 4 + team.indexOf(b) * 5;
      }
      const owner = opps.find((b) => b.p.slot !== 'GK')!;
      owner.x = m.fx(0, line + 22);
      owner.y = 60;
      const runner = opps.find((b) => b !== owner && b.p.slot !== 'GK')!;
      runner.x = m.fx(0, line + 1);
      runner.y = 30;
      m.owner = owner;
      const backs = team.filter((b) => /CB$|^(R|L)B$/.test(b.p.slot));
      let late = 0;
      let n = 0;
      for (let i = 0; i < 150; i++) {
        pv.trapNext[0] = 0;
        pv.trapUntil[0] = -1;
        expect(pv.offsideTrap(0, line, team, opps)).toBe(true);
        for (const b of backs) {
          n++;
          if (pv.trapLate.has(b)) late++;
        }
      }
      return late / n;
    };
    const poor = lateRate(4);
    const good = lateRate(18);
    expect(poor).toBeGreaterThan(0.3);
    expect(good).toBeLessThan(0.12);
  });

  it('man marking: tiap lawan di depan dijaga satu pemain; penyerang & bek penyapu tidak ikut menjaga', () => {
    const t = { ...clubTactic(eng[2]), marking: 'man' as const };
    const m = new Match({ seed: 'man', home: side(eng[2].id, t), away: side(eng[3].id) });
    const pv = m as unknown as Priv;
    for (let i = 0; i < 300; i++) m.step();
    const team = m.bodies.filter((b) => b.on && b.side === 0);
    const opps = m.bodies.filter((b) => b.on && b.side === 1);
    // lawan menyerang: pemain lapangannya di separuh lapangan kita, dekat pemain kita
    opps.forEach((o, i) => {
      if (o.p.slot === 'GK') return;
      const near = team[(i % (team.length - 1)) + 1];
      o.x = near.x + 2;
      o.y = near.y;
    });
    pv.assignMarks(0, team, opps);
    const marked = [...pv.marks.entries()].filter(([k]) => team.includes(k as (typeof team)[number]));
    expect(marked.length).toBeGreaterThan(3);
    const targets = new Set(marked.map(([, v]) => v));
    expect(targets.size).toBe(marked.length);
    for (const [k, v] of marked) {
      const b = k as (typeof team)[number];
      expect(/^(ST|RS|LS)$/.test(b.p.slot)).toBe(false);
      expect((v as (typeof team)[number]).side).toBe(1);
    }
  });

  it('pemain sayap yang tetap di depan menunggu lebih tinggi daripada yang mengawal mundur', () => {
    const run = (oop: OopRole) => {
      const base = makeTactic('wing-oop', 'Counter', '4-3-3');
      const spots = FORMATIONS[base.formation].spots;
      const t: Tactic = { ...base, slots: base.slots.map((s, i) => (slotKind(spots[i].slot) === 'wide' ? { ...s, oop } : s)) };
      const home = side(eng[4].id, t);
      const m = new Match({ seed: 'wing-oop', home, away: side(eng[5].id) });
      const xs: number[] = [];
      for (let i = 0; i < 3000 && !m.done; i++) {
        m.step();
        // lawan menyerang di separuh lapangan kita
        if (!m.owner || m.owner.side !== 1 || m.fx(0, m.ball.x) > 45) continue;
        for (const b of m.bodies) if (b.on && b.side === 0 && (b.p.slot === 'RW' || b.p.slot === 'LW')) xs.push(m.fx(0, b.x));
      }
      return xs.reduce((s, x) => s + x, 0) / xs.length;
    };
    expect(run('outlet') - run('track')).toBeGreaterThan(6);
  });
});

describe('match engine versi 17: kontrol ruang (pitch control)', () => {
  type B = Match['bodies'][number];
  type Priv = {
    arrive(b: B, x: number, y: number, react: number): number;
    updateControl(): void;
    laneRisk(c: B, tx: number, ty: number, air: boolean, vEnd: number, skipGk: boolean): number;
    spaceSpot(c: B, m: B, oppLine: number, mfx: number, mfy: number): [number, number, number] | null;
    runLane(b: B): number;
    depth: [number, number];
    restart: unknown;
    dead: unknown;
  };
  /** laga yang sudah berjalan, lalu dibekukan: semua pemain berdiri diam di posisi yang kita atur */
  const frozen = (seed: string) => {
    const m = new Match({ seed, home: side(eng[6].id), away: side(eng[7].id) });
    for (let i = 0; i < 50; i++) m.step();
    const pv = m as unknown as Priv;
    pv.restart = null;
    pv.dead = null;
    for (const b of m.bodies) b.vx = b.vy = 0;
    const team = m.bodies.filter((b) => b.on && b.side === 0);
    const opps = m.bodies.filter((b) => b.on && b.side === 1);
    // tempatkan pemain (bingkai tim tuan rumah)
    const put = (b: B, fx: number, fy: number) => {
      b.x = m.fx(0, fx);
      b.y = m.fy(0, fy);
    };
    return { m, pv, team, opps, put };
  };

  it('rentang kecepatan lari realistis; pemain cepat lebih dulu sampai; tiap pemain menguasai ruang di sekitarnya', () => {
    expect(topSpeed(5)).toBeGreaterThan(8);
    expect(topSpeed(20)).toBeLessThan(10.5);
    expect(topSpeed(20)).toBeGreaterThan(topSpeed(5) + 1.5);
    const { m, pv, team } = frozen('pc');
    const b = team.find((x) => x.p.slot !== 'GK')!;
    const as = (v: number): B => ({ ...b, p: { ...b.p, a: { ...b.p.a, pace: v, acc: v } } });
    for (const d of [5, 30]) expect(pv.arrive(as(20), b.x + d, b.y, 0.2)).toBeLessThan(pv.arrive(as(5), b.x + d, b.y, 0.2) - 0.15);
    pv.updateControl();
    const grid = m.pitchControl();
    expect(grid.home.length).toBe(grid.nx * grid.ny);
    for (const v of grid.home) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    let own = 0;
    let n = 0;
    for (const p of m.bodies) {
      if (!p.on || p.p.slot === 'GK') continue;
      n++;
      if (m.ctrl(p.side, p.x, p.y) > 0.5) own++;
    }
    expect(own / n).toBeGreaterThan(0.7);
  });

  it('risiko jalur umpan berbasis waktu: lawan di jalur berbahaya, umpan panjang lebih mudah dipotong', () => {
    const { m, pv, team, opps, put } = frozen('lane');
    const c = team.find((x) => x.p.slot !== 'GK')!;
    put(c, 30, 34);
    // semua lawan di belakang pengumpan, kecuali satu
    opps.forEach((o, i) => put(o, 5, 3 + i * 6));
    const o = opps.find((x) => x.p.slot !== 'GK')!;
    // (posisi lawan & tujuan umpan di bingkai tim tuan rumah)
    const risk = (ox: number, oy: number, tx: number) => {
      put(o, ox, oy);
      return pv.laneRisk(c, m.fx(0, tx), m.fy(0, 34), false, 10, true);
    };
    expect(risk(40, 34, 50)).toBeGreaterThanOrEqual(1);
    expect(risk(40, 50, 50)).toBe(0);
    // lawan 3 m dari jalur: aman untuk umpan pendek, berbahaya untuk umpan panjang yang melewatinya lebih lambat
    const short = risk(38, 37, 42);
    const long = risk(58, 37, 62);
    expect(long).toBeGreaterThan(short + 0.2);
  });

  it('umpan ke ruang & garis pertahanan: pelari cepat menang adu cepat, garis lawan mundur menghadapinya', () => {
    const { m, pv, team, opps, put } = frozen('space');
    const passer = team.find((x) => x.p.slot !== 'GK' && !/ST|RS|LS/.test(x.p.slot))!;
    const runner = team.find((x) => /ST|RS|LS/.test(x.p.slot))!;
    passer.p.a.vis = 20;
    put(passer, 50, 34);
    for (const b of team) if (b !== passer && b !== runner) put(b, 20, 3 + team.indexOf(b) * 5);
    put(runner, 70, 30);
    const defs = opps.filter((o) => o.p.slot !== 'GK');
    defs.forEach((o, i) => put(o, i < 4 ? 72 : 40, i < 4 ? 18 + i * 10 : 60));
    put(opps.find((o) => o.p.slot === 'GK')!, 102, 34);
    const win = (v: number) => {
      runner.p.a.pace = v;
      runner.p.a.acc = v;
      let s = 0;
      for (let i = 0; i < 20; i++) s += pv.spaceSpot(passer, runner, 72, 70, 30)![2];
      return s / 20;
    };
    expect(win(20)).toBeGreaterThan(win(5) + 0.15);
    // garis pertahanan tim tamu (bertahan) menghadapi penyerang cepat vs lambat; bola cukup jauh di depan garis
    put(passer, 58, 34);
    const depth = (v: number) => {
      runner.p.a.pace = v;
      runner.p.a.acc = v;
      m.owner = passer;
      m.poss = 0;
      m.ball.x = passer.x;
      m.ball.y = passer.y;
      pv.depth[1] = 0;
      for (let i = 0; i < 8; i++) pv.updateControl();
      return pv.depth[1];
    };
    expect(depth(20)).toBeGreaterThan(depth(5) + 0.5);
  });

  it('lari ke ruang: penyerang memilih celah yang tidak dijaga', () => {
    const { m, pv, team, opps, put } = frozen('gap');
    const runner = team.find((x) => /ST|RS|LS/.test(x.p.slot))!;
    runner.p.a.otb = 20;
    for (const b of team) if (b !== runner && b.p.slot !== 'GK') put(b, 40, 3 + team.indexOf(b) * 5);
    put(runner, 70, 34);
    const defs = opps.filter((o) => o.p.slot !== 'GK');
    // bek lawan menumpuk di sisi kiri (y kecil); sisi kanan kosong
    defs.forEach((o, i) => put(o, i < 4 ? 73 : 50, i < 4 ? 14 + i * 5 : 8));
    put(opps.find((o) => o.p.slot === 'GK')!, 102, 34);
    m.owner = team.find((x) => x.p.slot !== 'GK' && x !== runner)!;
    m.poss = 0;
    pv.updateControl();
    let right = 0;
    for (let i = 0; i < 10; i++) if (pv.runLane(runner) > 36) right++;
    expect(right).toBeGreaterThanOrEqual(8);
  });
});

describe('match engine versi 18: kiper & bola mati', () => {
  type B = Match['bodies'][number];
  type Priv = {
    setRestart(d: { kind: 'corner'; side: 0 | 1; x: number; y: number; t: number }): void;
    offsideTrap(side: 0 | 1, line: number, team: B[], opps: B[]): boolean;
    restart: { routine?: string } | null;
    dead: unknown;
    trapUntil: [number, number];
    trapNext: [number, number];
    trapLate: Set<B>;
  };
  const make = (seed: string) => {
    const m = new Match({ seed, home: side(eng[8].id), away: side(eng[9].id) });
    for (let i = 0; i < 50; i++) m.step();
    const pv = m as unknown as Priv;
    pv.restart = null;
    pv.dead = null;
    for (const b of m.bodies) b.vx = b.vy = 0;
    const team = m.bodies.filter((b) => b.on && b.side === 0);
    const opps = m.bodies.filter((b) => b.on && b.side === 1);
    const put = (b: B, fx: number, fy: number) => {
      b.x = m.fx(0, fx);
      b.y = m.fy(0, fy);
    };
    return { m, pv, team, opps, put };
  };

  it('atribut kiper baru dibaca dari data pemain; pemain lapangan tidak punya atribut kiper', () => {
    const squad = squadOf(w, eng[0].id);
    const gk = squad.find((p) => p.mainPosition === 'GK')!;
    const a = engineAttrs(gk);
    const g = gk.goalkeeping;
    expect([a.com, a.ecc, a.pun, a.thr]).toEqual([g.Communication, g.Eccentricity, g['Punching (Tendency)'], g.Throwing]);
    const st = engineAttrs(squad.find((p) => p.mainPosition !== 'GK')!);
    expect([st.com, st.ecc, st.pun, st.thr]).toEqual([3, 3, 3, 3]);
  });

  it('tepisan: kiper dengan Handling bagus lebih jarang memuntahkan bola ke depan gawang', () => {
    const { m } = make('parry');
    const gk = m.bodies.find((b) => b.p.slot === 'GK')!;
    const danger = (han: number) => {
      const a = { ...gk.p.a, han, ref: han };
      let n = 0;
      for (let i = 0; i < 3000; i++) if (m.parryKind(a) === 'danger') n++;
      return n / 3000;
    };
    expect(danger(5)).toBeGreaterThan(danger(20) * 2);
  });

  it('bola atas: kiper suka meninju lebih sering meninju, kiper eksentrik kadang salah membaca bola', () => {
    const { m } = make('high');
    const base = m.bodies.find((b) => b.p.slot === 'GK')!.p.a;
    const count = (a: Partial<typeof base>, crowd: number) => {
      const out = { catch: 0, spill: 0, punch: 0, miss: 0 };
      for (let i = 0; i < 3000; i++) out[m.highBallResult({ ...base, ecc: 3, ...a }, crowd)]++;
      return out;
    };
    const catcher = count({ pun: 3 }, 0);
    const puncher = count({ pun: 20 }, 0);
    expect(puncher.punch).toBeGreaterThan(catcher.punch * 2);
    expect(catcher.catch).toBeGreaterThan(puncher.catch);
    // kotak penuh pemain lawan: lebih sering meninju
    expect(count({ pun: 10 }, 3).punch).toBeGreaterThan(count({ pun: 10 }, 0).punch * 1.3);
    expect(catcher.miss).toBe(0);
    expect(count({ ecc: 20 }, 0).miss).toBeGreaterThan(150);
    // Handling bagus: bola tangkapan lebih jarang lepas
    expect(count({ pun: 1, han: 20 }, 1).spill).toBeLessThan(count({ pun: 1, han: 5 }, 1).spill * 0.6);
  });

  it('posisi kiper: berdiri di garis bagi sudut antara bola dan kedua tiang', () => {
    const { m } = make('gkspot');
    const gk = m.bodies.find((b) => b.side === 0 && b.p.slot === 'GK')!;
    for (const [bx, by] of [
      [12, 8],
      [25, 20],
      [30, 34],
      [16, 55],
    ]) {
      m.ball.x = m.fx(0, bx);
      m.ball.y = m.fy(0, by);
      m.ball.vx = m.ball.vy = 0;
      const [x, y] = m.gkSpot(gk, 30);
      // arah satuan dari bola ke titik (tx, ty)
      const unit = (tx: number, ty: number) => {
        const l = Math.hypot(tx - bx, ty - by);
        return [(tx - bx) / l, (ty - by) / l];
      };
      const [p1x, p1y] = unit(0, 34 - 3.66);
      const [p2x, p2y] = unit(0, 34 + 3.66);
      const [kx, ky] = unit(x, y);
      // garis bagi = jumlah kedua arah satuan; kiper harus searah dengannya (hasil kali silang ~0)
      const bl = Math.hypot(p1x + p2x, p1y + p2y);
      expect(Math.abs(((p1x + p2x) / bl) * ky - ((p1y + p2y) / bl) * kx)).toBeLessThan(0.02);
      expect(Math.abs(y - 34)).toBeLessThan(3.66);
      // bola di sisi lapangan: kiper bergeser ke tiang dekat
      if (by !== 34) expect(Math.sign(y - 34)).toBe(Math.sign(by - 34));
    }
  });

  it('sepak pojok memakai variasi rutinitas: pendek, tiang dekat, tiang jauh, ke tepi kotak, campuran', () => {
    const { m, pv } = make('corner');
    const n: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      pv.setRestart({ kind: 'corner', side: 0, x: m.fx(0, 105), y: 1, t: m.t });
      const r = pv.restart!.routine!;
      n[r] = (n[r] ?? 0) + 1;
    }
    expect(Object.keys(n).sort()).toEqual(['edge', 'far', 'mix', 'near', 'short']);
    expect(n.short / 2000).toBeGreaterThan(0.08);
    expect(n.short / 2000).toBeLessThan(0.17);
    expect(n.mix).toBeGreaterThan(n.edge);
  });

  it('kiper yang komunikatif: lini belakang lebih jarang terlambat saat jebakan offside', () => {
    const { m, pv, team, opps, put } = make('trap');
    const keeper = team.find((b) => b.p.slot === 'GK')!;
    const owner = opps.find((b) => b.p.slot !== 'GK' && !/ST|RS|LS/.test(b.p.slot))!;
    const runner = opps.find((b) => /ST|RS|LS/.test(b.p.slot))!;
    const late = (com: number) => {
      keeper.p.a.com = com;
      let n = 0;
      for (let i = 0; i < 400; i++) {
        team.forEach((b, j) => put(b, b === keeper ? 3 : 30, 5 + j * 5));
        opps.forEach((b, j) => put(b, 80, 2 + j * 6));
        put(owner, 55, 34);
        put(runner, 31, 40);
        m.owner = owner;
        m.poss = 1;
        pv.trapUntil[0] = -1;
        pv.trapNext[0] = 0;
        expect(pv.offsideTrap(0, 30, team, opps)).toBe(true);
        n += pv.trapLate.size;
      }
      return n;
    };
    expect(late(1)).toBeGreaterThan(late(20) * 1.3);
  });
});

describe('match engine versi 19: pelatih mengubah taktik di tengah laga', () => {
  type B = Match['bodies'][number];
  type Priv = {
    book(b: B, card: 'yellow' | 'red'): void;
    coachThink(): void;
    coachNext: [number, number];
    tk: [{ mentality: number; line: number; width: number; crosses: string } | null, unknown];
    possTime: [number, number];
    added: [number, number];
    restart: unknown;
    dead: unknown;
  };
  const game = (seed: string, home = makeTactic('c19-h', 'Possession', '4-2-3-1'), away = makeTactic('c19-a', 'Counter', '4-4-2')) => {
    const m = new Match({ seed, home: side(eng[2].id, home), away: side(eng[3].id, away) });
    for (let i = 0; i < 30; i++) m.step();
    return { m, pv: m as unknown as Priv };
  };
  /** pindahkan jam ke menit tertentu di babak kedua, lalu pelatih membaca laga */
  const think = (m: Match, pv: Priv, min: number) => {
    m.half = 2;
    pv.added = [0, -1];
    m.t = 150 + ((min - 45.5) / 45) * 150;
    pv.coachNext = [0, 0];
    pv.coachThink();
  };
  const notes = (m: Match, side: 0 | 1) => m.events.filter((e) => e.kind === 'tactic' && e.side === side).map((e) => e.note!);
  const outfield = (m: Match, s: 0 | 1) => m.bodies.filter((b) => b.on && b.side === s && b.p.slot !== 'GK');

  it('kartu merah: bentuk tim langsung disusun ulang untuk 10 orang, tiap pemain di tempat yang berbeda', () => {
    const { m, pv } = game('c19-red');
    const cb = m.bodies.find((b) => b.side === 0 && b.on && b.p.slot === 'RCB')!;
    pv.book(cb, 'red');
    expect(['4-4-1', '4-3-2']).toContain(m.shape[0]);
    const list = outfield(m, 0);
    expect(list.length).toBe(9);
    const slots = new Set(list.map((b) => b.p.slot));
    expect(slots.size).toBe(9);
    const spots = new Set(m.shapeOf(0).spots.map((sp) => sp.slot));
    for (const sl of slots) expect(spots.has(sl)).toBe(true);
    // lini belakang tetap empat orang: seseorang mengisi tempat bek yang diusir
    expect(list.filter((b) => /CB$|^(R|L)B$/.test(b.p.slot)).length).toBe(4);
    expect(notes(m, 0).some((n) => n.startsWith('Formasi diubah'))).toBe(true);
  });

  it('mentalitas: tertinggal makin menyerang; unggul tipis melawan tim lebih kuat makin bertahan', () => {
    const { m, pv } = game('c19-ment');
    const m0 = pv.tk[0]!.mentality;
    m.score = [0, 1];
    think(m, pv, 62);
    think(m, pv, 80);
    expect(pv.tk[0]!.mentality).toBeGreaterThanOrEqual(Math.min(3, m0 + 2));
    expect(notes(m, 0).some((n) => n.startsWith('Mentalitas'))).toBe(true);

    // tim tamu unggul 1-0 tapi lebih lemah: dari hati-hati sampai (sangat) bertahan
    const g = game('c19-ment2');
    g.m.score = [0, 1];
    for (const b of g.m.bodies) if (b.side === 0) b.qual += 3;
    think(g.m, g.pv, 70);
    expect((g.pv.tk[1] as { mentality: number }).mentality).toBeLessThanOrEqual(-1);
    think(g.m, g.pv, 86);
    expect((g.pv.tk[1] as { mentality: number }).mentality).toBeLessThanOrEqual(-2);
    // lima bek untuk menjaga keunggulan, garis pertahanan turun
    expect(g.m.shape[1]).toMatch(/^5-/);
    expect(notes(g.m, 1).some((n) => n.startsWith('Instruksi: garis pertahanan turun'))).toBe(true);
  });

  it('kebuntuan: tim yang lebih kuat & menguasai bola mengubah cara menyerang sesuai kekuatan pemainnya', () => {
    const { m, pv } = game('c19-stuck');
    for (const b of m.bodies) {
      if (b.side !== 0) continue;
      b.qual += 3;
      // pemain sayap jago mengumpan silang, penyerang jago menyundul; tembakan jarak jauh & dribel buruk
      Object.assign(b.p.a, { cro: 20, hea: 19, jmp: 18, lon: 2, dri: 3, fla: 3, pace: 6, acc: 6, otb: 6 });
    }
    pv.possTime = [600, 300];
    const w0 = pv.tk[0]!.width;
    think(m, pv, 60);
    expect(notes(m, 0)).toContain('Instruksi: main melebar & lebih banyak umpan silang');
    expect(pv.tk[0]!.width).toBe(Math.min(2, w0 + 1));
    expect(pv.tk[0]!.crosses).toBe('campuran');
  });

  it('mengejar gol: formasi satu penyerang berubah jadi dua penyerang, pemain pindah ke tempat terdekat', () => {
    const { m, pv } = game('c19-chase');
    const before = new Map(outfield(m, 0).map((b) => [b.p.id, b.p.slot]));
    m.score = [0, 1];
    think(m, pv, 70);
    expect(m.shape[0]).toBe('4-4-2');
    const after = outfield(m, 0);
    expect(new Set(after.map((b) => b.p.slot)).size).toBe(10);
    for (const b of after) {
      const was = before.get(b.p.id)!;
      // bek tetap bek; sayap kanan/kiri tetap di sisinya
      if (/CB$|^(R|L)B$/.test(was)) expect(b.p.slot).toBe(was);
      if (was === 'RW') expect(b.p.slot).toBe('RM');
      if (was === 'LW') expect(b.p.slot).toBe('LM');
    }
    expect(after.filter((b) => /^(RS|LS)$/.test(b.p.slot)).length).toBe(2);
  });

  it('laga sama tetap menghasilkan keputusan pelatih yang sama (bisa ditonton ulang)', () => {
    const run = () => {
      const m = new Match({ seed: 'c19-det', home: side(eng[4].id, clubTactic(eng[4])), away: side(eng[5].id, clubTactic(eng[5])) });
      m.run();
      return JSON.stringify(m.events.filter((e) => e.kind === 'tactic' || e.kind === 'goal'));
    };
    expect(run()).toBe(run());
  });
});
