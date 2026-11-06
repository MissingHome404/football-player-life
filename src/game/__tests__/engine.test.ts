import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { squadOf } from '../sim/season';
import { BAR, DT, ENGINE_VERSION, FULL, GOAL_HALF, HALF, MAX_SUBS, Match, PITCH_W, minutesPlayed, pickXI, playEngine, sprintStep, startAccel, topSpeed, type Body, type EAttrs, type EngineInput, type ETeam } from '../sim/engine';
import { rollCharacter } from '../gen/character';
import { advanceWeek, newCareer, pendingChoices, resolveChoice } from '../sim/week';
import { initRelations } from '../sim/relations';
import type { Career, World } from '../types';

const w = generateWorld({ seed: 'ENGINE', activeLeagues: ['IDN1', 'ENG1'] });
const eng = w.clubs.filter((c) => c.leagueId === 'ENG1');
const team = (id: string): ETeam => {
  const c = w.clubs.find((x) => x.id === id)!;
  return { id, name: c.name, color: c.colors[0], color2: c.colors[1], xi: pickXI(squadOf(w, id).filter((p) => !p.isYouth), undefined, false).xi };
};

describe('match engine', () => {
  it('input yang sama selalu menghasilkan laga yang sama (layar 2D = hasil di klasemen)', () => {
    const input: EngineInput = { seed: 'det', home: team(eng[0].id), away: team(eng[1].id) };
    const before = JSON.stringify(input);
    const a = playEngine(input);
    expect(JSON.stringify(input)).toBe(before); // input tidak diubah, aman ditonton ulang
    const b = playEngine(structuredClone(input));
    expect(b).toEqual(a);
    // diputar langkah demi langkah seperti di layar pertandingan
    const m = new Match(structuredClone(input));
    while (!m.done) m.step();
    expect(m.result().score).toEqual(a.score);
    expect(m.result().events).toEqual(a.events);
  });

  it('statistik laga masuk akal', () => {
    let goals = 0;
    for (let i = 0; i < 12; i++) {
      const r = playEngine({ seed: `s${i}`, home: team(eng[i % 10].id), away: team(eng[10 + (i % 10)].id) });
      goals += r.score[0] + r.score[1];
      expect(r.score[0]).toBeLessThanOrEqual(10);
      expect(r.possession[0] + r.possession[1]).toBe(100);
      expect(Object.keys(r.stats)).toHaveLength(22);
      for (const v of Object.values(r.ratings)) expect(v).toBeGreaterThanOrEqual(3);
      expect(r.events.filter((e) => e.kind === 'goal')).toHaveLength(r.score[0] + r.score[1]);
    }
    expect(goals / 12).toBeGreaterThan(1);
    expect(goals / 12).toBeLessThan(5);
  }, 30_000);

  it('aturan & fisika bola: gol harus masuk gawang, offside, lemparan ke dalam, tidak ada bola teleport', () => {
    const restarts: Record<string, number> = {};
    const afterMiss: Record<string, number> = {};
    let offside = 0;
    let goals = 0;
    for (let i = 0; i < 8; i++) {
      const m = new Match({ seed: `rules${i}`, home: team(eng[i].id), away: team(eng[19 - i].id) });
      let seen = 0;
      let missOpen = false;
      let lastRestart = m.restart;
      while (!m.done) {
        const p0 = { ...m.ball };
        m.step();
        const b = m.ball;
        expect(Number.isFinite(b.x + b.y + b.z)).toBe(true);
        // bola yang bukan gol tidak pernah berada di dalam gawang (jaring samping/atap menahannya)
        const depth = b.x < 0 ? -b.x : b.x - PITCH_W;
        if (!m.inNet && !m.dead) expect(depth > 0.05 && Math.abs(b.y - 34) < GOAL_HALF - 0.05 && b.z < BAR - 0.05).toBe(false);
        if (m.restart && m.restart !== lastRestart) {
          restarts[m.restart.kind] = (restarts[m.restart.kind] ?? 0) + 1;
          if (missOpen) afterMiss[m.restart.kind] = (afterMiss[m.restart.kind] ?? 0) + 1;
          missOpen = false;
        }
        lastRestart = m.restart;
        for (const e of m.events.slice(seen)) {
          if (e.kind === 'offside') offside++;
          if (e.kind === 'miss') missOpen = true;
          if (e.kind !== 'goal') continue;
          goals++;
          // titik bola melewati garis gawang: di antara tiang & di bawah mistar
          const line = p0.x > PITCH_W / 2 ? PITCH_W : 0;
          const f = (line - p0.x) / (b.x - p0.x);
          const raw = { x: p0.x + (b.x - p0.x) * f, y: p0.y + (b.y - p0.y) * f, z: p0.z + (b.z - p0.z) * f };
          expect(Math.abs(raw.y - 34)).toBeLessThan(GOAL_HALF + 0.15);
          expect(raw.z).toBeLessThan(BAR + 0.3);
          // lalu bola tertahan di jaring
          expect(b.x < 0 || b.x > PITCH_W).toBe(true);
        }
        seen = m.events.length;
      }
    }
    expect(goals).toBeGreaterThan(0);
    expect(offside).toBeGreaterThan(0);
    expect(restarts.throw).toBeGreaterThan(0);
    expect(restarts.goalkick).toBeGreaterThan(0);
    // tembakan melenceng biasanya jadi tendangan gawang (sepak pojok hanya kalau terbelokkan bek)
    expect(afterMiss.goalkick ?? 0).toBeGreaterThan((afterMiss.corner ?? 0) * 3);
    // tembakan melenceng = tendangan gawang / sudut, bukan bola kembali ke tengah
    expect((afterMiss.goalkick ?? 0) + (afterMiss.corner ?? 0)).toBeGreaterThanOrEqual(Object.values(afterMiss).reduce((a, b) => a + b, 0) - 1);
  }, 30_000);

  it('versi 4: kartu, sepak pojok, gaya main, dan lapangan netral', () => {
    let yellow = 0;
    let red = 0;
    let corners = 0;
    let cbShots = 0;
    for (let i = 0; i < 24; i++) {
      const home = { ...team(eng[i % 10].id), style: 'Wing Play' as const };
      const away = { ...team(eng[10 + (i % 10)].id), style: 'Defensive' as const };
      const m = new Match({ seed: `v4-${i}`, home, away });
      const r = m.run();
      corners += r.corners[0] + r.corners[1];
      for (const e of r.events) {
        if (e.kind === 'yellow') yellow++;
        if (e.kind !== 'red') continue;
        red++;
        // pemain yang diusir keluar lapangan dan tidak kembali
        const b = m.bodies.find((q) => q.p.name === e.name && q.side === e.side)!;
        expect(b.on).toBe(false);
        expect(b.st.off).toBeCloseTo(e.t, 5);
        expect(r.ratings[b.p.id]).toBeLessThanOrEqual(6);
      }
      for (const b of m.bodies) if (b.p.slot.endsWith('CB')) cbShots += b.st.shots;
    }
    expect(yellow).toBeGreaterThan(12);
    expect(red).toBeLessThan(yellow);
    expect(corners / 24).toBeGreaterThan(0.8);
    expect(cbShots).toBeGreaterThan(0); // bek tengah naik saat sepak pojok
    // gaya main dan lapangan netral mengubah jalannya laga, tetap deterministik
    const base: EngineInput = { seed: 'gaya', home: team(eng[2].id), away: team(eng[3].id) };
    const a = playEngine(base);
    const styled = playEngine({ ...base, home: { ...base.home, style: 'Possession' } });
    const neutral = playEngine({ ...base, neutral: true });
    expect(styled.events).not.toEqual(a.events);
    expect(neutral.events).not.toEqual(a.events);
    expect(playEngine({ ...base, neutral: true })).toEqual(neutral);
  });

  it('versi 5: acceleration unggul di awal lari, pace menyusul di lari panjang', () => {
    const race = (acc: number, pace: number) => {
      const a = startAccel(acc, 10);
      const vmax = topSpeed(pace);
      const at: Record<number, number> = {};
      let v = 0;
      let x = 0;
      for (let t = DT; t < 10; t += DT) {
        v = sprintStep(v, a, vmax);
        x += v * DT;
        for (const d of [10, 50]) if (x >= d && at[d] === undefined) at[d] = t;
      }
      return at;
    };
    const quick = race(20, 10);
    const fast = race(10, 20);
    expect(quick[10]).toBeLessThan(fast[10]);
    expect(fast[50]).toBeLessThan(quick[50]);
  });

  it('versi 5: atribut menentukan gaya main (dribel winger, umpan terobosan gelandang)', () => {
    const tweak = (t: ETeam, slots: string[], keys: (keyof EAttrs)[], v: number): ETeam => ({
      ...t,
      xi: t.xi.map((p) => (slots.includes(p.slot) ? { ...p, a: { ...p.a, ...Object.fromEntries(keys.map((k) => [k, v])) } } : p)),
    });
    const wingers = ['LW', 'RW'];
    const mids = ['LCM', 'CM', 'RCM'];
    const flair: (keyof EAttrs)[] = ['dri', 'fla', 'bra', 'tec'];
    const vision: (keyof EAttrs)[] = ['vis', 'pas', 'dec'];
    const count = (v: number) => {
      let takeOns = 0;
      let through = 0;
      for (let i = 0; i < 8; i++) {
        let home = tweak(team(eng[i % 10].id), wingers, flair, v);
        home = tweak(home, mids, vision, v);
        const m = new Match({ seed: `v5-${i}`, home, away: team(eng[10 + (i % 10)].id) });
        m.run();
        for (const b of m.bodies) {
          if (b.side !== 0) continue;
          if (wingers.includes(b.p.slot)) takeOns += b.st.takeOns;
          if (mids.includes(b.p.slot)) through += b.st.throughBalls;
        }
      }
      return { takeOns, through };
    };
    const hi = count(18);
    const lo = count(6);
    expect(hi.takeOns).toBeGreaterThan(lo.takeOns * 3 + 4);
    expect(hi.through).toBeGreaterThan(lo.through * 3 + 4);
  }, 30_000);

  it('versi 5: kiper dengan Positioning tinggi lebih sering berada di posisi idealnya', () => {
    // median jarak kiper dari titik idealnya saat lawan menguasai bola di dekat gawang
    const off = (v: number) => {
      const ds: number[] = [];
      for (let i = 0; i < 8; i++) {
        const home = team(eng[i].id);
        home.xi = home.xi.map((p) => (p.slot === 'GK' ? { ...p, a: { ...p.a, pos: v, con: v, ant: v } } : p));
        const m = new Match({ seed: `gk-${i}`, home, away: team(eng[10 + i].id) });
        const gk = m.bodies.find((b) => b.side === 0 && b.p.slot === 'GK')!;
        while (!m.done) {
          m.step();
          if (m.poss !== 1 || !m.owner || Math.hypot(m.fx(0, m.ball.x), m.fy(0, m.ball.y) - 34) > 38) continue;
          const [ix, iy] = m.gkSpot(gk, 0);
          ds.push(Math.hypot(m.fx(0, gk.x) - ix, m.fy(0, gk.y) - iy));
        }
      }
      ds.sort((a, b) => a - b);
      return ds[Math.floor(ds.length / 2)];
    };
    expect(off(20)).toBeLessThan(off(4) * 0.6);
  }, 60_000);

  it('pemain cadangan masuk di menit yang ditentukan', () => {
    const home = team(eng[2].id);
    const benchP = squadOf(w, eng[2].id).find((p) => !p.isYouth && !home.xi.some((e) => e.id === p.id))!;
    const xi = pickXI([benchP], benchP, true).xi[0];
    home.sub = { at: FULL - 20, player: { ...xi, user: true }, slot: xi.slot };
    const r = playEngine({ seed: 'sub', home, away: team(eng[3].id) });
    const st = r.stats[benchP.id];
    expect(st.on).toBeGreaterThanOrEqual(FULL - 20);
    expect(r.events.some((e) => e.kind === 'sub' && e.name === xi.name)).toBe(true);
  });
});

/** tim lengkap dengan bangku cadangan (pelatih AI bisa mengganti pemain) */
const fullTeam = (id: string, bump = 0): ETeam => {
  const c = w.clubs.find((x) => x.id === id)!;
  const { xi, bench } = pickXI(squadOf(w, id).filter((p) => !p.isYouth), undefined, false);
  const up = (e: (typeof xi)[number]) => ({
    ...e,
    a: Object.fromEntries(Object.entries(e.a).map(([k, v]) => [k, Math.min(20, Math.max(1, (v as number) + bump))])) as unknown as typeof e.a,
  });
  return { id, name: c.name, color: c.colors[0], color2: c.colors[1], style: 'Gegenpress', xi: xi.map(up), bench: bench.map(up) };
};

describe('match engine versi 8', () => {
  it('injury time di tiap babak, jam 45+X dan 90+X', () => {
    let goalsInAdded = 0;
    for (let i = 0; i < 6; i++) {
      const m = new Match({ seed: `added-${i}`, home: fullTeam(eng[i].id), away: fullTeam(eng[10 + i].id) });
      const labels = new Set<string>();
      while (!m.done) {
        m.step();
        labels.add(m.clockLabel());
      }
      const r = m.result();
      const [a1, a2] = r.added!;
      expect(a1).toBeGreaterThanOrEqual(1);
      expect(a1).toBeLessThanOrEqual(5);
      expect(a2).toBeGreaterThanOrEqual(1);
      expect(a2).toBeLessThanOrEqual(8);
      // papan tambahan waktu muncul dua kali: di menit 45 dan 90
      const added = r.events.filter((e) => e.kind === 'added');
      expect(added.map((e) => [e.min, e.plus])).toEqual([
        [45, a1],
        [90, a2],
      ]);
      expect(labels.has(`45+${a1}'`)).toBe(true);
      expect(labels.has(`90+${a2}'`)).toBe(true);
      expect(labels.has(`45+${a1 + 1}'`)).toBe(false);
      expect(m.length()).toBeCloseTo(2 * HALF + ((a1 + a2) * HALF) / 45, 5);
      // menit setiap kejadian tidak pernah mundur
      // (kejadian 'added' memakai plus untuk lamanya tambahan waktu, bukan jam)
      const timed = r.events.filter((e) => e.kind !== 'added');
      for (let j = 1; j < timed.length; j++) {
        const p = timed[j - 1];
        const e = timed[j];
        expect(e.min * 100 + (e.plus ?? 0)).toBeGreaterThanOrEqual(p.min * 100 + (p.plus ?? 0));
      }
      goalsInAdded += r.events.filter((e) => e.kind === 'goal' && e.plus).length;
    }
    expect(goalsInAdded).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it('pelatih AI mengganti pemain yang lelah; menit bermain dihitung dari jam pertandingan', () => {
    let subs = 0;
    for (let i = 0; i < 6; i++) {
      const m = new Match({ seed: `subs-${i}`, home: fullTeam(eng[i].id), away: fullTeam(eng[10 + i].id) });
      const r = m.run();
      for (const side of [0, 1] as const) expect(m.subs[side]).toBeLessThanOrEqual(MAX_SUBS);
      for (const e of r.events.filter((x) => x.kind === 'sub')) {
        subs++;
        const inn = m.bodies.find((b) => b.p.name === e.name && b.side === e.side)!;
        const out = m.bodies.find((b) => b.p.name === e.assist && b.side === e.side)!;
        expect(inn.st.onMin).toBe(e.min);
        expect(out.st.offMin).toBe(e.min);
        // pemain pengganti bisa ikut diganti lagi (cedera)
        expect(minutesPlayed(out.st)).toBe(e.min - (out.st.onMin ?? 0));
        expect(minutesPlayed(inn.st)).toBe((inn.st.offMin ?? 90) - e.min);
        expect(r.stats[inn.p.id]).toBeDefined();
      }
      // pemain yang main penuh tercatat 90 menit, cadangan yang tidak masuk 0 menit
      for (const b of m.bodies) {
        if (b.st.on === 0 && b.st.offMin === undefined) expect(minutesPlayed(b.st)).toBe(90);
        if (b.st.on < 0) expect(minutesPlayed(b.st)).toBe(0);
      }
    }
    expect(subs / 6).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it('stamina menentukan kelelahan di akhir laga', () => {
    const home = fullTeam(eng[4].id);
    home.xi = home.xi.map((p, i) => (p.slot === 'GK' ? p : { ...p, a: { ...p.a, sta: i % 2 ? 19 : 4 } }));
    const m = new Match({ seed: 'tired', home, away: fullTeam(eng[14].id) });
    let at80: Record<string, number> = {};
    while (!m.done) {
      m.step();
      if (m.half === 2 && m.clock().min === 80 && !Object.keys(at80).length) {
        at80 = Object.fromEntries(m.bodies.filter((b) => b.side === 0 && b.on && b.p.slot !== 'GK').map((b) => [b.p.id, b.energy]));
      }
    }
    const fit = home.xi.filter((p) => p.a.sta === 19 && p.id in at80).map((p) => at80[p.id]);
    const unfit = home.xi.filter((p) => p.a.sta === 4 && p.id in at80).map((p) => at80[p.id]);
    const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    expect(avg(fit)).toBeGreaterThan(avg(unfit) + 0.08);
    expect(Math.min(...unfit, ...fit)).toBeLessThan(0.85);
  }, 30_000);

  it('tim yang lebih kuat menguasai bola lebih lama', () => {
    let poss = 0;
    for (let i = 0; i < 16; i++) {
      const r = playEngine({ seed: `poss-${i}`, home: fullTeam(eng[i].id, 3), away: fullTeam(eng[i].id), neutral: true });
      poss += r.possession[0];
    }
    expect(poss / 16).toBeGreaterThan(54);
  }, 60_000);
});

describe('laga mingguan memakai match engine', () => {
  it('skor di catatanmu = skor tayangan ulang = skor di klasemen', () => {
    const roll = rollCharacter(w, { countryId: 'IDN', position: 'ST' }, 'ENGWEEK');
    let world: World = { ...w, players: [...w.players, roll.player] };
    let career: Career = newCareer(roll, 0, 'test', w.startDate);
    career.rel = initRelations(world, career, roll.player);
    let checked = 0;
    for (let i = 0; i < 160 && checked < 3; i++) {
      for (const m of pendingChoices(career)) ({ world, career } = resolveChoice(world, career, m.id, 0));
      const r = advanceWeek(world, career);
      ({ world, career } = r);
      if (!r.sim) continue;
      const rec = career.matches.find((m) => m.date === career.lastSim!.date)!;
      if (rec.comp !== 'Liga') continue;
      const replay = playEngine(structuredClone(career.lastSim!.input));
      const us = rec.home ? 0 : 1;
      expect([replay.score[us], replay.score[1 - us]]).toEqual(rec.score);
      // hasil di klasemen liga
      const me = world.players.find((p) => p.isUser)!;
      const club = world.clubs.find((c) => c.id === me.contract!.clubId)!;
      const s = world.seasons[club.leagueId];
      const found = s.rounds.some((rd, ri) =>
        rd.some(([h, a], ii) => {
          const res = s.results[ri][ii];
          return !!res && s.clubs[h] === (rec.home ? club.id : rec.opponentId) && s.clubs[a] === (rec.home ? rec.opponentId : club.id) && res[0] === replay.score[0] && res[1] === replay.score[1];
        }),
      );
      expect(found).toBe(true);
      expect(rec.scorers?.length).toBe(rec.score[0] + rec.score[1]);
      expect(career.lastSim!.v).toBe(ENGINE_VERSION);
      checked++;
    }
    expect(checked).toBe(3);
  }, 120_000);
});

describe('match engine versi 10', () => {
  const withRole = (t: ETeam, slot: string, role: string): ETeam => ({ ...t, xi: t.xi.map((e) => (e.slot === slot ? { ...e, role } : e)) });

  it('setiap pemain mendapat peran yang cocok dengan tempatnya; peran favorit dipakai kalau cocok', () => {
    const squad = squadOf(w, eng[2].id).filter((p) => !p.isYouth);
    const { xi, bench } = pickXI(squad, undefined, false, '4-3-3');
    const ok: Record<string, string[]> = {
      GK: ['gk', 'sk'], RB: ['fb', 'wb', 'ifb', 'nfb', 'cwb', 'iwb'], LB: ['fb', 'wb', 'ifb', 'nfb', 'cwb', 'iwb'],
      RCB: ['cd', 'bpd', 'ncb', 'wcb'], LCB: ['cd', 'bpd', 'ncb', 'wcb'], ST: ['af', 'p', 'cf', 'f9', 'dlf', 'tf', 'pf'],
    };
    for (const e of [...xi, ...bench]) expect(e.role).toBeTruthy();
    for (const e of xi) if (ok[e.slot]) expect(ok[e.slot]).toContain(e.role);
    const st = xi.find((e) => e.slot === 'ST')!;
    const p = squad.find((q) => q.id === st.id)!;
    if (['af', 'p', 'cf', 'f9', 'dlf', 'tf', 'pf'].includes(p.preferredRole)) expect(st.role).toBe(p.preferredRole);
  });

  it('wasit & dua asisten wasit: wasit dekat bola, asisten di garis samping sejajar bek kedua terakhir', () => {
    const m = new Match({ seed: 'ref', home: team(eng[3].id), away: team(eng[13].id) });
    let n = 0;
    let near = 0;
    while (!m.done && m.t < 120) {
      m.step();
      const [ref, ar1, ar2] = m.officials;
      expect(ar1.y).toBeLessThan(0);
      expect(ar2.y).toBeGreaterThan(68);
      expect(ar1.x).toBeGreaterThanOrEqual(52.5 - 0.5);
      expect(ar2.x).toBeLessThanOrEqual(52.5 + 0.5);
      if (m.t > 10) {
        n++;
        if (Math.hypot(ref.x - m.ball.x, ref.y - m.ball.y) < 30) near++;
      }
    }
    expect(near / n).toBeGreaterThan(0.75);
  });

  it('jam berhenti saat sepak pojok & tendangan bebas sampai semua pemain siap', () => {
    let frozenSteps = 0;
    let setups = 0;
    for (let i = 0; i < 4; i++) {
      const m = new Match({ seed: `freeze-${i}`, home: team(eng[i].id), away: team(eng[19 - i].id) });
      while (!m.done) {
        const r = m.restart;
        const t0 = m.t;
        m.step();
        if (r && (r.kind === 'corner' || r.kind === 'free')) {
          frozenSteps++;
          expect(m.t).toBe(t0);
        }
        if (r && !m.restart && (r.kind === 'corner' || r.kind === 'free')) {
          setups++;
          expect(r.setup ?? 0).toBeLessThanOrEqual(8.2);
        }
        if (r?.kind === 'throw') expect(m.t).toBeGreaterThan(t0);
      }
    }
    expect(setups).toBeGreaterThan(5);
    expect(frozenSteps).toBeGreaterThan(setups * 5);
  }, 30_000);

  it('sweeper keeper berdiri lebih tinggi daripada kiper klasik; false 9 turun lebih dalam daripada advanced forward', () => {
    const home = team(eng[5].id);
    const away = team(eng[15].id);
    const avg = (h: ETeam, slot: string, side: 0 | 1, inPoss: boolean) => {
      const m = new Match({ seed: 'roles', home: h, away });
      let sum = 0;
      let n = 0;
      while (!m.done) {
        m.step();
        if (m.restart || m.dead || (m.poss === side) !== inPoss) continue;
        const b = m.bodies.find((x) => x.on && x.side === side && x.p.slot === slot);
        if (!b) continue;
        sum += m.fx(side, b.x);
        n++;
      }
      return sum / n;
    };
    expect(avg(withRole(home, 'GK', 'sk'), 'GK', 0, true)).toBeGreaterThan(avg(withRole(home, 'GK', 'gk'), 'GK', 0, true) + 2);
    const st = home.xi.find((e) => e.slot === 'ST' || e.slot === 'RS')!.slot;
    expect(avg(withRole(home, st, 'f9'), st, 0, true)).toBeLessThan(avg(withRole(home, st, 'af'), st, 0, true) - 3);
  }, 30_000);

  it('pemain yang lolos sendirian tidak menembak dari jauh: tembakan open play kebanyakan dari dalam kotak', () => {
    let inBox = 0;
    let total = 0;
    const P = Match.prototype as unknown as { shoot: (...a: unknown[]) => void };
    const orig = P.shoot;
    P.shoot = function (this: Match, ...a: unknown[]) {
      const c = a[0] as Body;
      if (!a[3] && !a[4]) {
        total++;
        const fx = this.fx(c.side, c.x);
        const fy = this.fy(c.side, c.y);
        if (fx > PITCH_W - 16.5 && Math.abs(fy - 34) < 20.16) inBox++;
      }
      return orig.apply(this, a);
    };
    try {
      for (let i = 0; i < 8; i++) playEngine({ seed: `box-${i}`, home: team(eng[i].id), away: team(eng[10 + i].id) });
    } finally {
      P.shoot = orig;
    }
    expect(total).toBeGreaterThan(20);
    expect(inBox / total).toBeGreaterThan(0.55);
  }, 30_000);
});
