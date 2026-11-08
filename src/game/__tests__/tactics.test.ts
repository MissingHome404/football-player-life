import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { squadOf } from '../sim/season';
import { Match, TUNE, engineAttrs, minutesPlayed, pickXI, topSpeed, type ETeam } from '../sim/engine';
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
    pendingSubs: { at: number }[];
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
        const pending = v.pendingSubs[0]?.at;
        m.step();
        const ev = m.result().events.filter((e) => e.kind === 'sub');
        if (ev.length > seen) {
          seen = ev.length;
          subs++;
          // pergantian dilakukan saat bola mati (v18: kecuali bola sudah lama tidak mati)
          if (pending === undefined || v.t - pending <= TUNE.subWait) expect(v.restart).not.toBeNull();
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
      // (di separuh lapangan kita walau tim kita sedang menyerang tinggi)
      near.x = m.dir(0) > 0 ? Math.min(near.x, 50) : Math.max(near.x, 55);
      o.x = near.x + 2 * m.dir(0) * -1;
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

describe('match engine versi 20: perpanjangan waktu & adu penalti', () => {
  const ko = (i: number, knockout = true) =>
    new Match({ seed: `ko20-${i}`, home: side(eng[i % 10].id, clubTactic(eng[i % 10])), away: side(eng[(i + 3) % 10].id, clubTactic(eng[(i + 3) % 10])), knockout, neutral: true });

  it('laga gugur imbang: perpanjangan waktu 2 x 15 menit, lalu adu penalti sampai ada pemenang', () => {
    let found = 0;
    let et = 0;
    for (let i = 0; i < 60 && found < 2; i++) {
      const m = ko(i);
      const r = m.run();
      if (!r.et) {
        expect(r.events.some((e) => e.kind === 'extra')).toBe(false);
        continue;
      }
      et++;
      expect(r.events.some((e) => e.kind === 'extra')).toBe(true);
      expect(r.events.find((e) => e.kind === 'full')!.min).toBe(120);
      expect(Math.max(...Object.values(r.stats).map((st) => minutesPlayed(st)))).toBe(120);
      // jatah pergantian: maksimal satu tambahan di perpanjangan waktu
      expect(Math.max(...m.subs)).toBeLessThanOrEqual(6);
      if (!r.pens) {
        expect(r.score[0]).not.toBe(r.score[1]);
        continue;
      }
      found++;
      expect(r.score[0]).toBe(r.score[1]);
      expect(r.pens[0]).not.toBe(r.pens[1]);
      expect(m.periodLabel()).toBe(`Adu penalti ${r.pens[0]}-${r.pens[1]}`);
      const first = r.events.find((e) => e.kind === 'pens')!.side;
      const kicks = r.events.filter((e) => e.kind === 'shootout');
      const goals = [0, 0];
      const taken = [0, 0];
      kicks.forEach((k, j) => {
        // bergantian, tim yang menang undian menendang lebih dulu
        expect(k.side).toBe(j % 2 === 0 ? first : 1 - first);
        // belum ada pemenang sebelum tendangan terakhir
        const [g0, g1] = goals;
        const [n0, n1] = taken;
        const decided = n0 <= 5 && n1 <= 5 && (n0 < 5 || n1 < 5) ? g0 + (5 - n0) < g1 || g1 + (5 - n1) < g0 : n0 === n1 && g0 !== g1;
        expect(decided).toBe(false);
        if (k.scored) goals[k.side]++;
        taken[k.side]++;
        expect(k.pens).toEqual(goals);
      });
      expect(goals).toEqual(r.pens);
      expect(kicks.length).toBeGreaterThanOrEqual(6);
    }
    expect(et).toBeGreaterThanOrEqual(found);
    expect(found).toBe(2);
  }, 60_000);

  it('laga biasa tetap boleh imbang; agregat leg pertama ikut dihitung', () => {
    for (let i = 0; i < 6; i++) {
      const r = ko(i, false).run();
      expect(r.et).toBeUndefined();
      expect(r.events.some((e) => e.kind === 'extra' || e.kind === 'shootout')).toBe(false);
    }
    const m = new Match({ seed: 'agg', home: side(eng[0].id), away: side(eng[1].id), knockout: true, agg: [0, 1] });
    const level = () => (m as unknown as { level(): boolean }).level();
    m.score = [1, 0];
    expect(level()).toBe(true);
    m.score = [1, 1];
    expect(level()).toBe(false);
  });

  it('adu penalti: penendang jago & tenang lebih sering mencetak gol', () => {
    const m = ko(0);
    const pv = m as unknown as { startShootout(): void; spotKick(c: unknown, gk: unknown): void; so: { out: string } };
    pv.startShootout();
    const c = m.bodies.find((b) => b.on && b.side === 0 && b.p.slot !== 'GK')!;
    const gk = m.bodies.find((b) => b.on && b.side === 1 && b.p.slot === 'GK');
    const rate = (v: number) => {
      Object.assign(c.p.a, { pen: v, cmp: v, pre: v });
      let n = 0;
      for (let i = 0; i < 3000; i++) {
        pv.spotKick(c, gk);
        if (pv.so.out === 'goal') n++;
      }
      return n / 3000;
    };
    const good = rate(20);
    const bad = rate(3);
    expect(good).toBeGreaterThan(bad + 0.12);
    expect(good).toBeLessThan(0.95);
    expect(bad).toBeGreaterThan(0.45);
  });
});

describe('match engine versi 21: penyerang menahan garis & tendangan gawang', () => {
  type B = { p: { slot: string; id: string; a: Record<string, number> }; x: number; y: number; tx: number; run: number };
  type P = {
    restart: { kind: string; side: 0 | 1 } | null;
    poss: 0 | 1;
    owner: unknown;
    t: number;
    done: boolean;
    dead: unknown;
    mates(s: 0 | 1): B[];
    fx(s: 0 | 1, x: number): number;
    offsideLine(s: 0 | 1): number;
  };
  const ST = ['ST', 'RS', 'LS'];
  const MID = ['CM', 'RDM', 'LDM', 'RCM', 'LCM', 'AM'];
  /** jalankan laga, panggil cb tepat saat tendangan gawang diambil */
  const atGoalKicks = (m: Match, cb: (v: P, kicker: 0 | 1) => void) => {
    const v = m as unknown as P;
    while (!v.done) {
      const pre = v.restart?.kind === 'goalkick' ? v.restart.side : null;
      m.step();
      if (pre !== null && !v.restart) cb(v, pre);
    }
  };
  const mean = (a: number[]) => a.reduce((p, q) => p + q, 0) / a.length;

  it('tendangan gawang sendiri: tim menyebar, penyerang di garis lawan di depan semua gelandang', () => {
    let n = 0;
    let wideCB = 0;
    let stAhead = 0;
    for (let i = 0; i < 4; i++) {
      const h = { ...clubTactic(eng[i]), gkShort: true };
      const aw = { ...clubTactic(eng[i + 5]), gkShort: true };
      atGoalKicks(new Match({ seed: `gk21-${i}`, home: side(eng[i].id, h), away: side(eng[i + 5].id, aw) }), (v, k) => {
        const team = v.mates(k);
        const st = team.filter((b) => ST.includes(b.p.slot)).map((b) => v.fx(k, b.x));
        const mids = team.filter((b) => MID.includes(b.p.slot)).map((b) => v.fx(k, b.x));
        if (!st.length || !mids.length) return;
        n++;
        if (Math.min(...st) > Math.max(...mids)) stAhead++;
        // umpan pendek: bek tengah berdiri lebar di sudut kotak penalti
        const cbs = team.filter((b) => b.p.slot === 'RCB' || b.p.slot === 'LCB');
        if (cbs.length === 2 && cbs.every((b) => Math.abs(b.y - 34) > 10 && v.fx(k, b.x) < 18)) wideCB++;
      });
    }
    expect(n).toBeGreaterThan(10);
    expect(stAhead / n).toBeGreaterThan(0.8);
    expect(wideCB / n).toBeGreaterThan(0.6);
  });

  it('tendangan gawang lawan: penyerang tidak mundur sejajar gelandang, makin tinggi saat garis mulai menekan tinggi', () => {
    const height = (engage: number) => {
      const t = { ...clubTactic(eng[1]), engage, press: engage };
      const st: number[] = [];
      const gap: number[] = [];
      for (let i = 0; i < 2; i++) {
        atGoalKicks(new Match({ seed: `gko21-${i}`, home: side(eng[1].id, t), away: side(eng[6].id, clubTactic(eng[6])) }), (v, k) => {
          if (k !== 1) return;
          const team = v.mates(0);
          const s = team.filter((b) => ST.includes(b.p.slot)).map((b) => v.fx(0, b.x));
          const mids = team.filter((b) => MID.includes(b.p.slot)).map((b) => v.fx(0, b.x));
          if (!s.length || !mids.length) return;
          st.push(Math.max(...s));
          gap.push(Math.max(...s) - Math.max(...mids));
        });
      }
      return { st: mean(st), gap: mean(gap) };
    };
    const hi = height(2);
    const lo = height(-2);
    expect(hi.st).toBeGreaterThan(lo.st + 10);
    expect(hi.st).toBeGreaterThan(80);
    expect(lo.gap).toBeGreaterThan(5);
  });

  it('Advanced Forward menahan garis bek lawan saat membangun serangan; Off the Ball 20 lebih rapat ke garis', () => {
    const gapFor = (otb: number) => {
      const gaps: number[] = [];
      const tgts: number[] = [];
      for (const seed of ['pin21a', 'pin21b', 'pin21c']) {
        const home = side(eng[2].id, clubTactic(eng[2]));
        const st = home.xi.find((p) => ST.includes(p.slot))!;
        st.role = 'af';
        st.duty = 'At';
        st.a.otb = otb;
        st.a.ant = otb;
        const m = new Match({ seed, home, away: side(eng[4].id, clubTactic(eng[4])) });
        const v = m as unknown as P;
        let poss = -1;
        let since = 0;
        while (!v.done) {
          m.step();
          if (v.poss !== poss) {
            poss = v.poss;
            since = v.t;
          }
          // penguasaan bola yang sudah tenang (bukan transisi), bola di separuh lapangan sendiri
          if (v.poss !== 0 || !v.owner || v.restart || v.dead || v.t - since < 4) continue;
          const b = v.mates(0).find((q) => q.p.id === st.id);
          if (!b || b.run > 0 || !ST.includes(b.p.slot) || v.fx(0, (v.owner as { x: number }).x) > 50) continue;
          gaps.push(v.offsideLine(0) - v.fx(0, b.x));
          tgts.push(v.offsideLine(0) - v.fx(0, b.tx));
        }
      }
      return { gap: mean(gaps), tgt: mean(tgts) };
    };
    const good = gapFor(20);
    const poor = gapFor(5);
    // dulu striker menunggu rata-rata 11 m di belakang garis bek lawan saat timnya membangun serangan
    expect(Math.abs(good.gap)).toBeLessThan(3);
    expect(good.tgt).toBeLessThan(2.5);
    expect(poor.tgt).toBeGreaterThan(good.tgt + 1);
  });

});

describe('match engine versi 22: gerak tenang, tendangan bebas, offside IFAB, dribel dengan sentuhan', () => {
  type B = {
    p: { slot: string; a: Record<string, number> };
    side: 0 | 1;
    x: number;
    y: number;
    vx: number;
    vy: number;
    tx: number;
    ty: number;
    sprint: boolean;
    st: { offsides: number };
  };
  type R = {
    restart: { kind: string; side: 0 | 1; direct?: boolean; cross?: boolean; indirect?: boolean } | null;
    dead: { kind: string; side: 0 | 1; indirect?: boolean } | null;
    owner: B | null;
    shot: unknown;
    pass: unknown;
    done: boolean;
    pause: number;
    ball: { x: number; y: number; z: number; vx: number; vy: number; vz: number };
    taking: string | null;
    offPos: { side: 0 | 1; list: B[]; leave: B[] } | null;
    mates(s: 0 | 1): B[];
    keeper(s: 0 | 1): B;
    restartTaker(): B | null;
    judgeOffside(c: B): void;
    deflect(b: B, speed: number): void;
    gain(b: B): void;
    receive(px: number, py: number): void;
    carry(o: B, sp: number, fdx: number, fdy: number): void;
  };
  const teams = (i: number) => ({ home: side(eng[i].id, clubTactic(eng[i])), away: side(eng[i + 4].id, clubTactic(eng[i + 4])) });

  it('tendangan bebas setelah pelanggaran / offside langsung ditendang, tidak digiring; tendangan bebas tidak langsung tidak ditembak', () => {
    let n = 0;
    let owned = 0;
    let ind = 0;
    let indShot = 0;
    for (let i = 0; i < 3; i++) {
      const m = new Match({ seed: `fk22-${i}`, ...teams(i) });
      const v = m as unknown as R;
      while (!v.done) {
        const r = v.restart;
        const taker = r?.kind === 'free' ? v.restartTaker() : null;
        m.step();
        if (!r || v.restart || r.kind !== 'free' || r.direct || r.cross) continue;
        n++;
        // dulu pengambil tendangan bebas mendapat bola seperti permainan biasa dan kadang menggiringnya
        if (v.owner && v.owner === taker) owned++;
        if (r.indirect) {
          ind++;
          if (v.shot) indShot++;
        }
      }
    }
    expect(n).toBeGreaterThan(15);
    expect(owned).toBe(0);
    expect(ind).toBeGreaterThan(0);
    expect(indShot).toBe(0);
  });

  /** posisi buatan: tim 0 menyerang ke kanan, bek tim 1 sejajar di x = 80, kiper di x = 103 */
  const scene = () => {
    const m = new Match({ seed: 'off22', ...teams(0) });
    const v = m as unknown as R;
    const att = v.mates(0).filter((b) => b.p.slot !== 'GK');
    const def = v.mates(1);
    def.forEach((b, i) => {
      b.x = b.p.slot === 'GK' ? 103 : 80;
      b.y = 6 + i * 6;
    });
    att.forEach((b, i) => {
      b.x = 50;
      b.y = 6 + i * 6;
    });
    const [c, st, lev, behind] = att;
    c.x = 60;
    st.x = 85; // di depan bek kedua terakhir & bola, di separuh lawan: posisi offside
    lev.x = 80; // sejajar bek kedua terakhir: onside
    behind.x = 58; // di belakang bola
    v.ball.x = 60.6;
    v.ball.y = c.y;
    return { m, v, c, st, lev, behind, def };
  };

  it('offside menurut IFAB: dinilai saat bola dimainkan, termasuk tendangan bebas; tidak dari sepak pojok, lemparan, tendangan gawang', () => {
    const { v, c, st, lev, behind } = scene();
    for (const t of [null, 'free']) {
      v.taking = t;
      v.judgeOffside(c);
      expect(v.offPos?.list).toContain(st);
      expect(v.offPos?.list).not.toContain(lev);
      expect(v.offPos?.list).not.toContain(behind);
    }
    for (const t of ['corner', 'throw', 'goalkick']) {
      v.taking = t;
      v.judgeOffside(c);
      expect(v.offPos).toBeNull();
    }
    // di separuh lapangan sendiri tidak pernah offside
    v.taking = null;
    st.x = 52;
    v.judgeOffside(c);
    expect(v.offPos?.list ?? []).not.toContain(st);
  });

  it('offside tetap berlaku setelah bola memantul dari lawan / ditepis kiper; hilang saat lawan menguasai bola', () => {
    const { v, c, st, def } = scene();
    v.taking = null;
    v.judgeOffside(c);
    // kiper menepis (bukan memainkan bola dengan sengaja): penyerang yang tadi offside tetap offside
    v.deflect(v.keeper(1), 3);
    expect(v.offPos?.list).toContain(st);
    // penyerang itu menyambar bola muntah: tendangan bebas tidak langsung untuk lawan
    v.offPos!.leave = [];
    v.owner = null;
    v.pass = null;
    v.shot = null;
    v.ball.x = st.x - 0.3;
    v.ball.y = st.y;
    v.ball.z = 0;
    v.ball.vx = v.ball.vy = v.ball.vz = 0;
    v.receive(v.ball.x, v.ball.y);
    expect(st.st.offsides).toBe(1);
    expect(v.dead?.kind).toBe('free');
    expect(v.dead?.side).toBe(1);
    expect(v.dead?.indirect).toBe(true);
    // lawan menguasai bola dengan sengaja: penilaian offside selesai
    v.judgeOffside(c);
    v.gain(def[1]);
    expect(v.offPos).toBeNull();
  });

  it('pemain berdiri mantap di posisinya, tidak terus bergeser kecil', () => {
    const still = (steady: number) => {
      const old = TUNE.steady;
      TUNE.steady = steady;
      try {
        let n = 0;
        let s = 0;
        for (let i = 0; i < 2; i++) {
          const m = new Match({ seed: `st22-${i}`, ...teams(i) });
          const v = m as unknown as R;
          while (!v.done) {
            m.step();
            if (v.restart || v.dead || v.pause > 0) continue;
            for (const b of [...v.mates(0), ...v.mates(1)]) {
              if (b === v.owner || b.p.slot === 'GK' || b.sprint || Math.hypot(b.tx - b.x, b.ty - b.y) > 1.5) continue;
              n++;
              if (Math.hypot(b.vx, b.vy) < 0.3) s++;
            }
          }
        }
        return s / n;
      } finally {
        TUNE.steady = old;
      }
    };
    const before = still(0);
    const after = still(1);
    expect(after).toBeGreaterThan(before + 0.1);
  });

  it('dribel dengan sentuhan: bola didorong ke depan lalu dikejar; dribbler hebat menjaga bola lebih dekat', () => {
    const m = new Match({ seed: 'touch22', ...teams(1) });
    const v = m as unknown as R;
    const leads: number[] = [];
    let prev: unknown = null;
    while (!v.done) {
      m.step();
      const o = v.owner;
      // (langkah pertama setelah merebut / menerima bola: bola belum di kaki pemilik barunya)
      const fresh = o !== prev;
      prev = o;
      if (!o || fresh || v.restart || v.dead || Math.hypot(o.vx, o.vy) < 4) continue;
      leads.push(Math.hypot(v.ball.x - o.x, v.ball.y - o.y));
    }
    const mean = leads.reduce((p, q) => p + q, 0) / leads.length;
    const sd = Math.sqrt(leads.reduce((p, q) => p + (q - mean) ** 2, 0) / leads.length);
    expect(leads.length).toBeGreaterThan(50);
    // dulu bola selalu 0,6 m di depan kaki
    expect(sd).toBeGreaterThan(0.2);
    expect(Math.max(...leads)).toBeGreaterThan(1.1);
    expect(Math.max(...leads)).toBeLessThan(3.5);
    // lari lurus 6 m/s dengan bola: jarak terjauh bola dari kaki
    const run = (skill: number) => {
      const o = v.mates(0).find((b) => b.p.slot !== 'GK')!;
      o.p.a.dri = o.p.a.tec = o.p.a.ft = skill;
      o.x = 30;
      o.y = 34;
      v.ball.x = 30.5;
      v.ball.y = 34;
      let far = 0;
      for (let i = 0; i < 40; i++) {
        o.x += 0.6;
        v.carry(o, 6, 1, 0);
        far = Math.max(far, v.ball.x - o.x);
      }
      return far;
    };
    expect(run(20)).toBeLessThan(run(5));
  });
});

describe('match engine versi 23: Vision, Teamwork, Creativity', () => {
  type B = {
    p: { id: string; slot: string; role?: string; duty?: string; a: Record<string, number> };
    rk: { roam: number };
    side: 0 | 1;
    x: number;
    y: number;
    face: number;
    scan: number;
    st: { passes: number; shots: number; takeOns: number; throughBalls: number };
  };
  type R = {
    t: number;
    done: boolean;
    owner: B | null;
    shot: { outcome: string } | null;
    mates(s: 0 | 1): B[];
    bodies: B[];
    sees(c: B, m: B): boolean;
    creative(c: B): number;
    creRisk(c: B, cr: number): number;
    shoot(c: B, xg: number, pressure: number): void;
    styleOf(p: B['p']): B['rk'];
  };
  const teams = (i: number) => ({ home: side(eng[i].id, clubTactic(eng[i])), away: side(eng[i + 5].id, clubTactic(eng[i + 5])) });

  it('Vision = jangkauan pandang: rekan di belakang badan hanya terlihat setelah scanning; Vision tinggi melihat lebih lebar', () => {
    const m = new Match({ seed: 'fov23', ...teams(0) });
    const v = m as unknown as R;
    const [c, mate] = v.mates(0).filter((b) => b.p.slot !== 'GK');
    c.x = 50;
    c.y = 34;
    c.face = 0; // menghadap +x
    c.scan = -99;
    const at = (deg: number, dist = 15) => {
      mate.x = c.x + Math.cos((deg * Math.PI) / 180) * dist;
      mate.y = c.y + Math.sin((deg * Math.PI) / 180) * dist;
    };
    c.p.a.vis = 5;
    at(20);
    expect(v.sees(c, mate)).toBe(true);
    at(180);
    expect(v.sees(c, mate)).toBe(false);
    // sangat dekat: terdengar memanggil
    at(180, 3);
    expect(v.sees(c, mate)).toBe(true);
    // baru saja scanning: tahu posisi rekan di belakangnya
    at(180);
    c.scan = v.t;
    expect(v.sees(c, mate)).toBe(true);
    c.scan = -99;
    // 120° dari arah hadap: Vision 20 melihatnya, Vision 5 tidak
    at(120);
    expect(v.sees(c, mate)).toBe(false);
    c.p.a.vis = 20;
    expect(v.sees(c, mate)).toBe(true);
  });

  it('Teamwork tinggi lebih sering mengoper; Teamwork rendah egois (lebih banyak dribel & tembakan)', () => {
    const stats = (tea: number) => {
      let passes = 0;
      let selfish = 0;
      for (let i = 0; i < 10; i++) {
        const t = teams(i);
        for (const p of t.home.xi) if (p.slot !== 'GK') p.a.tea = tea;
        const m = new Match({ seed: `tea23-${i}`, ...t });
        while (!m.done) m.step();
        for (const b of (m as unknown as R).bodies.filter((q) => q.side === 0)) {
          passes += b.st.passes;
          selfish += b.st.shots + b.st.takeOns;
        }
      }
      return { passes, selfish };
    };
    const lo = stats(5);
    const hi = stats(20);
    // 200 laga: oper 76 vs 83, tembakan + take-on 11,4 vs 8,7 per laga
    expect(hi.passes).toBeGreaterThan(lo.passes * 1.04);
    expect(lo.selfish).toBeGreaterThan(hi.selfish * 1.12);
  });

  it('Creativity hanya aktif dengan peran bebas; pemain kreatif lebih sering mencoba killer ball', () => {
    const m = new Match({ seed: 'cre23', ...teams(1) });
    const v = m as unknown as R;
    const b = v.mates(0).find((q) => q.p.slot !== 'GK')!;
    b.p.a.cre = 20;
    b.rk = { ...b.rk, roam: 0 };
    expect(v.creative(b)).toBe(0);
    b.rk = { ...b.rk, roam: 0.8 };
    expect(v.creative(b)).toBeGreaterThan(0.9);
    b.p.a.cre = 7;
    expect(v.creative(b)).toBe(0);
    // Consistency menurunkan risiko percobaan kreatif (20 = lebih akurat dari biasa)
    b.p.a.cons = 20;
    expect(v.creRisk(b, 1)).toBeLessThan(0);
    b.p.a.cons = 2;
    expect(v.creRisk(b, 1)).toBeGreaterThan(0.3);

    const through = (cre: number) => {
      let n = 0;
      for (let i = 0; i < 8; i++) {
        const t = teams(i);
        const star = t.home.xi.find((p) => ['AM', 'CM', 'RCM', 'LCM'].includes(p.slot))!;
        star.role = 't';
        star.duty = 'At';
        star.a.cre = cre;
        const mm = new Match({ seed: `cre23-${i}`, ...t });
        while (!mm.done) mm.step();
        n += (mm as unknown as R).mates(0).find((q) => q.p.id === star.id)?.st.throughBalls ?? 0;
      }
      return n;
    };
    expect(through(20)).toBeGreaterThan(through(5) * 1.4);
  });

  it('tembakan kreatif: Consistency tinggi jauh lebih sering masuk (high risk high reward)', () => {
    const goals = (cons: number) => {
      const m = new Match({ seed: 'shot23', ...teams(2) });
      const v = m as unknown as R;
      const c = v.mates(0).find((q) => q.p.slot !== 'GK')!;
      c.rk = { ...c.rk, roam: 0.8 };
      c.p.a.cre = 20;
      c.p.a.cons = cons;
      for (const o of v.mates(1)) if (o.p.slot !== 'GK') o.x = 10;
      let g = 0;
      for (let i = 0; i < 600; i++) {
        c.x = m.dir(0) > 0 ? 85 : 20;
        c.y = 30;
        v.owner = c;
        v.shoot(c, 0.12, 0);
        if (v.shot?.outcome === 'goal') g++;
        v.shot = null;
      }
      return g;
    };
    expect(goals(18)).toBeGreaterThan(goals(3) * 1.25);
  });
});


describe('match engine versi 24: struktur bertahan, struktur serangan, positional play', () => {
  type B = {
    p: { id: string; slot: string; role: string; duty: string; a: Record<string, number> };
    side: 0 | 1;
    x: number;
    y: number;
    tx: number;
    ty: number;
    run: number;
    on: boolean;
    vx: number;
    vy: number;
  };
  type R = {
    t: number;
    done: boolean;
    poss: number;
    owner: B | null;
    restart: unknown;
    dead: unknown;
    wonAt: [number, number];
    mates(s: 0 | 1): B[];
    offsideLine(s: 0 | 1): number;
    attackShape(s: 0 | 1, team: B[], opps: B[], bfx: number, bfy: number, oppLine: number): { w: number; spots: Map<B, [number, number, number, string]> } | null;
    supportSpots(s: 0 | 1, team: B[], shape: null): Map<B, [number, number]> | null;
    laneBlock(b: B, s: 0 | 1, x: number, y: number): [number, number];
    laneOpen(ax: number, ay: number, bx: number, by: number, opps: B[]): boolean;
  };
  const MID = ['CM', 'RCM', 'LCM', 'RDM', 'LDM', 'RM', 'LM'];
  const teams = (i: number) => ({ home: side(eng[i].id, clubTactic(eng[i])), away: side(eng[i + 6].id, clubTactic(eng[i + 6])) });

  it('blok rapat: lini belakang menyusul lini tengah yang menekan; penyerang yang diam di belakang garis tidak diikuti mundur', () => {
    const m = new Match({ seed: 'blk24', ...teams(0) });
    const v = m as unknown as R & {
      ball: { x: number; y: number };
      defLine(s: 0 | 1, inPoss: boolean, raw?: boolean): number;
      markAdjust(b: B, s: 0 | 1, line: number, x: number, y: number): [number, number, boolean];
    };
    for (let i = 0; i < 20; i++) m.step();
    const W = (fx: number) => (m.dir(0) > 0 ? fx : 105 - fx);
    // lawan membangun serangan dari belakang (bola di x 85 bingkai kita), gelandang kita menekan di x 62
    const opp = v.mates(1).filter((b) => b.p.slot !== 'GK');
    const carrier = opp[0];
    carrier.x = W(85);
    carrier.y = 34;
    v.owner = carrier;
    v.poss = 1;
    v.ball.x = carrier.x;
    v.ball.y = carrier.y;
    for (const b of v.mates(0)) if (MID.includes(b.p.slot) || b.p.slot === 'AM') b.x = W(62);
    const line = (squeeze: number) => {
      const keep = TUNE.squeeze;
      TUNE.squeeze = squeeze;
      const l = v.defLine(0, false, true);
      TUNE.squeeze = keep;
      return l;
    };
    const tight = line(TUNE.squeeze);
    expect(tight).toBeGreaterThan(line(0) + 4);
    expect(62 - tight).toBeLessThan(23);
    // penyerang lawan berdiri diam 4 m di belakang garis, pembawa bola ditekan: bek tidak ikut mundur
    const cb = v.mates(0).find((b) => /^(RCB|LCB|CB)$/.test(b.p.slot))!;
    const st = opp[1];
    st.x = W(tight - 4);
    st.y = 34;
    st.vx = st.vy = 0;
    st.run = 0;
    opp[2].x = W(83);
    opp[2].y = 34;
    const press = v.mates(0).find((b) => MID.includes(b.p.slot))!;
    press.x = W(82);
    press.y = 34;
    const keep = TUNE.stepUp;
    const [hold] = v.markAdjust(cb, 0, tight, tight, 34);
    TUNE.stepUp = 0;
    const [chase] = v.markAdjust(cb, 0, tight, tight, 34);
    TUNE.stepUp = keep;
    expect(hold).toBeCloseTo(tight, 5);
    expect(chase).toBeLessThan(tight - 4);
  });

  it('struktur serangan melawan blok: pemberi lebar di garis samping, dua pemain di half-space di antara lini, bek tengah di belakang lini pertama lawan', () => {
    const m = new Match({ seed: 'shape24', ...teams(1) });
    const v = m as unknown as R;
    let checked = 0;
    while (!v.done && checked < 20) {
      m.step();
      const o = v.owner;
      if (!o || o.side !== 0 || v.restart || v.dead || v.t - v.wonAt[0] < 5) continue;
      const bfx = m.fx(0, o.x);
      if (bfx < 50 || bfx > 80) continue;
      const line = v.offsideLine(0);
      const sh = v.attackShape(0, v.mates(0), v.mates(1), bfx, m.fy(0, o.y), line);
      if (!sh || sh.w < 0.5) continue;
      checked++;
      const kinds = [...sh.spots.values()];
      const wide = kinds.filter((s) => s[3] === 'w');
      const half = kinds.filter((s) => s[3] === 'h');
      expect(wide.length).toBe(2);
      for (const s of wide) {
        expect(Math.abs(s[1] - 34)).toBeGreaterThan(25);
        expect(s[0]).toBeGreaterThan(Math.min(line - 8, bfx + 22));
      }
      expect(half.length).toBeGreaterThanOrEqual(1);
      for (const s of half) {
        expect(Math.abs(s[1] - 34)).toBeGreaterThan(9);
        expect(Math.abs(s[1] - 34)).toBeLessThan(16);
        expect(s[0]).toBeLessThan(line - 3);
      }
      // half-space di kedua sisi, bukan dua pemain di sisi yang sama
      if (half.length === 2) expect(Math.sign(half[0][1] - 34)).not.toBe(Math.sign(half[1][1] - 34));
      for (const [b, s] of sh.spots) if (/^(RCB|LCB|CB)$/.test(b.p.slot) && s[3] === 'c') expect(s[0]).toBeLessThan(bfx);
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('positional play: dua rekan terdekat menawarkan sudut di kedua sisi pembawa bola (segitiga); jalur tertutup lawan terdeteksi', () => {
    const m = new Match({ seed: 'tri24', ...teams(2) });
    const v = m as unknown as R;
    let checked = 0;
    while (!v.done && checked < 15) {
      m.step();
      const o = v.owner;
      if (!o || o.p.slot === 'GK' || v.restart || v.dead || v.t - v.wonAt[o.side] < 2 || m.fx(o.side, o.x) > 80) continue;
      const sp = v.supportSpots(o.side, v.mates(o.side), null);
      if (!sp || sp.size < 2) continue;
      checked++;
      const [a, b] = [...sp.values()];
      const oy = m.fy(o.side, o.y);
      // satu di kiri, satu di kanan pembawa bola, satu di belakang (opsi aman), satu di depan
      expect(Math.sign(a[1] - oy)).not.toBe(Math.sign(b[1] - oy));
      expect(Math.min(a[0], b[0])).toBeLessThan(m.fx(o.side, o.x));
      for (const s of [a, b]) expect(Math.hypot(s[0] - m.fx(o.side, o.x), s[1] - oy)).toBeLessThan(14);
    }
    expect(checked).toBeGreaterThan(5);
    const opp = v.mates(1)[3];
    opp.x = 50;
    opp.y = 34;
    expect(v.laneOpen(40, 34, 60, 34, [opp])).toBe(false);
    expect(v.laneOpen(40, 30, 60, 30, [opp])).toBe(true);
  });

  it('menutup jalur umpan: gelandang bertahan bergeser ke jalur antara pembawa bola dan lawan di dekatnya', () => {
    const m = new Match({ seed: 'lane24', ...teams(3) });
    const v = m as unknown as R;
    for (let i = 0; i < 50; i++) m.step();
    const att = v.mates(1).filter((b) => b.p.slot !== 'GK');
    const def = v.mates(0).find((b) => MID.includes(b.p.slot))!;
    // pembawa bola lawan di (60, 34), penerima di (60 - 20, 20) bingkai tim kita; gelandang kita di dekat penerima
    const carrier = att[0];
    const recv = att[1];
    for (const b of att.slice(2)) b.x = m.dir(0) > 0 ? 100 : 5;
    const W = (fx: number) => (m.dir(0) > 0 ? fx : 105 - fx);
    const WY = (fy: number) => (m.fy(0, 20) === 20 ? fy : 68 - fy);
    carrier.x = W(60);
    carrier.y = WY(34);
    recv.x = W(40);
    recv.y = WY(20);
    v.owner = carrier;
    v.poss = 1;
    const [x, y] = v.laneBlock(def, 0, 44, 26);
    // titik baru lebih dekat ke garis lurus pembawa bola -> penerima
    const distToLane = (px: number, py: number) => {
      const ax = 60, ay = 34, bx = 40, by = 20;
      const t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2);
      return Math.hypot(px - (ax + (bx - ax) * t), py - (ay + (by - ay) * t));
    };
    expect(distToLane(x, y)).toBeLessThan(distToLane(44, 26) * 0.7);
  });
});

describe('match engine versi 25: pergantian pemain', () => {
  it('setelah pergantian & perubahan bentuk tim, tiap pemain di lapangan punya tempat sendiri', async () => {
    let subs = 0;
    for (let i = 0; i < 12; i++) {
      const a = eng[i % eng.length];
      const b = eng[(i * 7 + 3) % eng.length];
      if (a.id === b.id) continue;
      const m = new Match({ seed: `slot25-${i}`, home: side(a.id, clubTactic(a)), away: side(b.id, clubTactic(b)) });
      while (!m.done) {
        m.step();
        for (const s of [0, 1] as const) {
          const slots = m.bodies.filter((x) => x.side === s && x.on && !x.leaving).map((x) => x.p.slot);
          expect(new Set(slots).size).toBe(slots.length);
        }
      }
      subs += m.subs[0] + m.subs[1];
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(subs).toBeGreaterThan(20);
  }, 120_000);
});

describe('match engine versi 25: bola di kaki saat berbelok, gaya per kecerdasan tim', () => {
  type B = {
    p: { slot: string; a: Record<string, number> };
    side: 0 | 1;
    x: number;
    y: number;
    vx: number;
    vy: number;
    st: { passes: number; takeOns: number; dribbles: number };
  };
  type R = {
    done: boolean;
    owner: B | null;
    restart: unknown;
    dead: unknown;
    ball: { x: number; y: number };
    iq: [number, number];
    bodies: B[];
    mates(s: 0 | 1): B[];
    carry(o: B, sp: number, fdx: number, fdy: number): void;
  };
  const teams = (i: number) => ({ home: side(eng[i].id, clubTactic(eng[i])), away: side(eng[i + 7].id, clubTactic(eng[i + 7])) });

  it('pembawa bola yang berlari tidak pernah meninggalkan bola di belakang badannya', () => {
    const m = new Match({ seed: 'ball25', ...teams(0) });
    const v = m as unknown as R;
    let prev: unknown = null;
    let frames = 0;
    let behind = 0;
    while (!v.done) {
      m.step();
      const o = v.owner;
      const fresh = o !== prev;
      prev = o;
      if (!o || fresh || v.restart || v.dead || o.p.slot === 'GK') continue;
      const sp = Math.hypot(o.vx, o.vy);
      if (sp < 2) continue;
      frames++;
      if (((v.ball.x - o.x) * o.vx + (v.ball.y - o.y) * o.vy) / sp < 0) behind++;
    }
    expect(frames).toBeGreaterThan(100);
    // dulu 13,5% langkah lari dengan bola: bola di belakang pemain (sampai 2 m)
    expect(behind).toBe(0);
  });

  it('berbelok dengan bola: bola ditarik ke arah baru dan larinya melambat; pemain lincah kehilangan lebih sedikit kecepatan', () => {
    const turn = (skill: number) => {
      const m = new Match({ seed: 'turn25', ...teams(1) });
      const v = m as unknown as R;
      const o = v.mates(0).find((b) => b.p.slot !== 'GK')!;
      o.p.a.agi = o.p.a.dri = o.p.a.tec = skill;
      o.x = 50;
      o.y = 34;
      // berlari ke kanan, bola tertinggal 1,2 m di kiri belakang (baru berbalik arah)
      o.vx = 7;
      o.vy = 0;
      v.ball.x = 49;
      v.ball.y = 33.4;
      v.carry(o, 7, 1, 0);
      return { speed: Math.hypot(o.vx, o.vy), ahead: v.ball.x - o.x };
    };
    const good = turn(20);
    const poor = turn(4);
    expect(good.ahead).toBeGreaterThan(0);
    expect(poor.ahead).toBeGreaterThan(0);
    expect(good.speed).toBeLessThan(7);
    expect(good.speed).toBeGreaterThan(poor.speed + 0.8);
  });

  it('kecerdasan bermain tim dari atribut: tim kurang cerdas lebih banyak dribel & take-on, tim cerdas lebih banyak mengoper', () => {
    const m0 = new Match({ seed: 'iq25', ...teams(2) });
    const v0 = m0 as unknown as R;
    expect(v0.iq[0]).toBeGreaterThan(0.5);
    const style = (iq: 0 | 1) => {
      const keep = { iqLo: TUNE.iqLo, iqHi: TUNE.iqHi };
      Object.assign(TUNE, iq ? { iqLo: -100, iqHi: -99 } : { iqLo: 100, iqHi: 101 });
      let solo = 0;
      let passes = 0;
      for (let i = 0; i < 4; i++) {
        const m = new Match({ seed: `iq25-${i}`, ...teams(i) });
        const v = m as unknown as R;
        while (!v.done) m.step();
        for (const b of v.bodies) {
          solo += b.st.takeOns + b.st.dribbles;
          passes += b.st.passes;
        }
      }
      Object.assign(TUNE, keep);
      return { solo, passes };
    };
    const weak = style(0);
    const smart = style(1);
    expect(weak.solo).toBeGreaterThan(smart.solo * 1.3);
    expect(smart.passes).toBeGreaterThan(weak.passes);
  });
});
