import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { rollCharacter } from '../gen/character';
import { newCareer } from '../sim/week';
import { replacePlayer } from '../sim/season';
import { acceptOffer, contractWeek, negotiate, transferWindow } from '../sim/transfer';
import { addDays } from '../date';
import { Rng } from '../rng';
import type { Career, Player, World } from '../types';

const w0 = generateWorld({ seed: 'TRANSFER', activeLeagues: ['ENG1'] });

/** Pemain senior 22 tahun yang terlalu bagus untuk klub kecil di Inggris */
function setup(): { world: World; career: Career; p: Player } {
  const roll = rollCharacter(w0, { countryId: 'ENG' }, 'T');
  let world: World = { ...w0, players: [...w0.players, roll.player] };
  const career = newCareer(roll, 0, 'test', w0.startDate);
  const small = world.clubs.filter((c) => c.countryId === 'ENG').sort((a, b) => a.reputation - b.reputation)[0];
  const p: Player = structuredClone(roll.player);
  p.birthDate = '2004-03-01';
  p.ca = 135;
  p.isYouth = false;
  p.reputation = { home: 40, world: 10 };
  p.contract = { clubId: small.id, wagePerWeek: 800, expires: '2030-06-30', role: 'Inti' };
  world = replacePlayer(world, p);
  return { world, career, p };
}

/** Jalankan urusan kontrak minggu demi minggu sampai ada tawaran */
function waitForOffer(world: World, career: Career, p: Player, weeks = 9) {
  for (let i = 0; i < weeks && !career.offers.length; i++) {
    career.currentDate = addDays(career.currentDate, 7);
    career.week++;
    contractWeek(world, career, p, new Rng(`t:${i}`));
  }
}

describe('transfer dan kontrak', () => {
  it('bursa transfer: buka musim panas dan Januari', () => {
    expect(transferWindow('2026-07-01').open).toBe(true);
    expect(transferWindow('2026-10-01').open).toBe(false);
    expect(transferWindow('2027-01-15').open).toBe(true);
    expect(transferWindow('2027-03-01').until).toBe('2027-06-15');
  });

  it('pemain bagus dapat tawaran saat bursa buka, dan pindah setelah menerima', () => {
    const { world, career, p } = setup();
    waitForOffer(world, career, p);
    expect(career.offers.length).toBeGreaterThan(0);
    const o = career.offers[0];
    expect(o.type).toBe('transfer');
    expect(o.fee).toBeGreaterThan(0);

    // negosiasi hanya sekali per tawaran
    const n1 = negotiate(world, career, o.id, 'gaji');
    const n2 = negotiate(world, n1.career, o.id, 'gaji');
    expect(n1.result).not.toBe('');
    expect(n2.career).toBe(n1.career);

    const r = acceptOffer(world, career, o.id);
    const me = r.world.players.find((x) => x.id === p.id)!;
    expect(me.contract!.clubId).toBe(o.clubId);
    expect(r.career.offers).toEqual([]);
    const last = r.career.history[r.career.history.length - 1];
    expect(last.clubId).toBe(o.clubId);
    expect(last.to).toBeUndefined();
    expect(r.career.history[r.career.history.length - 2].to).toBe(career.currentDate);
    expect(r.career.signed).toBe(career.currentDate);
    // relasi pindah ke klub baru: manajer baru, fans klub lama kecewa
    const newClub = r.world.clubs.find((c) => c.id === o.clubId)!;
    expect(r.career.rel.clubId).toBe(o.clubId);
    expect(r.career.rel.manager!.staffId).toBe(newClub.managerId);
    expect(r.career.rel.fans[p.contract!.clubId]).toBeLessThan(0);
    // setelah pindah: tidak ada tawaran klub lain di sisa bursa ini
    const me2 = structuredClone(me);
    const c2 = structuredClone(r.career);
    waitForOffer(r.world, c2, me2, 8);
    expect(c2.offers.filter((x) => x.type !== 'perpanjangan')).toEqual([]);
    // tidak mengubah data lama
    expect(world.players.find((x) => x.id === p.id)!.contract!.clubId).not.toBe(o.clubId);
  });

  it('pinjaman selesai: kembali ke klub asal', () => {
    const { world, career, p } = setup();
    const parent = p.contract!;
    const loanClub = world.clubs.find((c) => c.countryId === 'ENG' && c.id !== parent.clubId)!;
    career.loan = { parentClubId: parent.clubId, parentContract: parent, until: addDays(career.currentDate, 7) };
    p.contract = { ...parent, clubId: loanClub.id, expires: career.loan.until };
    career.currentDate = addDays(career.currentDate, 7);
    contractWeek(world, career, p, new Rng('loan'));
    expect(career.loan).toBeNull();
    expect(p.contract!.clubId).toBe(parent.clubId);
  });

  it('kontrak habis: jadi pemain bebas', () => {
    const { world, career, p } = setup();
    p.contract!.expires = addDays(career.currentDate, 7);
    career.currentDate = addDays(career.currentDate, 7);
    contractWeek(world, career, p, new Rng('free'));
    expect(p.contract).toBeNull();
    expect(career.teamLabel).toBe('Tanpa klub');
    expect(career.inbox[0].title).toMatch(/habis/);
  });
});

describe('kehidupan dan belanja', () => {
  it('beli sepatu menambah atribut sekali, rumah mengubah biaya mingguan', async () => {
    const { applyLife, defaultLife } = await import('../sim/life');
    const { weeklyBudget } = await import('../sim/economy');
    const { world, career, p } = setup();
    career.life = defaultLife(22, career.currentDate);
    career.money = 5000;
    const before = p.technical['First Touch'];
    const r = applyLife(world, career, { op: 'buy', id: 'sepatu_pro' });
    const me2 = r.world.players.find((x) => x.id === p.id)!;
    expect(me2.technical['First Touch']).toBe(Math.min(20, before + 1));
    expect(r.career.life.boots).toBe('sepatu_pro');
    expect(r.career.money).toBe(5000 - 220);
    // tidak bisa beli dua kali
    expect(applyLife(r.world, r.career, { op: 'buy', id: 'sepatu_pro' }).career).toBe(r.career);
    // pindah ke rumah: biaya tempat tinggal naik
    const kos = weeklyBudget(r.career, me2).living;
    const h = applyLife(r.world, r.career, { op: 'house', id: 'rumah' });
    expect(weeklyBudget(h.career, me2).living).toBeGreaterThan(kos);
    // uang tidak cukup: gagal tanpa mengubah apa pun
    const poor = { ...h.career, money: 10 };
    expect(applyLife(h.world, poor, { op: 'buy', id: 'super' }).career).toBe(poor);
  });
});
