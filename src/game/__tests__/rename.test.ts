import { describe, it, expect } from 'vitest';
import { generateWorld } from '../gen/world';
import { FAMOUS, fullName } from '../gen/names';
import { NAME_POOLS } from '../data/names';
import { CONT_BY_ID, createEdition } from '../sim/continental';
import { cupName } from '../sim/cup';
import {
  applyNameEdits,
  applyNameFile,
  carryNames,
  listNameables,
  nameTemplate,
  parseCsv,
  parseNameFile,
  renameInCareer,
  restoreNames,
  splitPersonName,
} from '../sim/rename';
import { Rng } from '../rng';
import type { Career } from '../types';

const w = generateWorld({ seed: 'NAMA', activeLeagues: ['ENG1', 'IDN1'] });

describe('pool nama fiktif', () => {
  it('tidak memakai nama belakang khas pemain bintang asli', () => {
    const stars = ['Mbappé', 'Haaland', 'Modrić', 'Griezmann', 'Lewandowski', 'Saka', 'Grealish', 'Osimhen', 'Pulisic',
      'Taremi', 'Mitoma', 'Ødegaard', 'Gyökeres', 'Çalhanoğlu', 'Hakimi', 'Struick', 'Lilipaly', 'Musiala', 'Barella', 'Kanté'];
    const all = new Set(Object.values(NAME_POOLS).flatMap((p) => p.last));
    expect(stars.filter((s) => all.has(s))).toEqual([]);
    const firsts = new Set(Object.values(NAME_POOLS).flatMap((p) => p.first));
    expect(['Kylian', 'Erling', 'Romelu', 'Heung-min', 'Lionel', 'Bukayo', 'Neymar'].filter((s) => firsts.has(s))).toEqual([]);
    expect(NAME_POOLS.spanish.first).not.toContain('Lamine');
  });

  it('dunia tidak berisi kombinasi nama pemain terkenal', () => {
    expect(w.players.filter((p) => FAMOUS.has(fullName(p)))).toEqual([]);
  });
});

describe('editor nama', () => {
  it('ganti nama klub: inisial ikut, nama bawaan dicatat, dunia lama utuh, bisa dikembalikan', () => {
    const club = w.clubs[0];
    const r = applyNameEdits(w, [{ kind: 'klub', id: club.id, name: 'Kota Biru FC' }]);
    const c = r.world.clubs.find((x) => x.id === club.id)!;
    expect(c.name).toBe('Kota Biru FC');
    expect(c.badge.initials).toBe('KBF');
    expect(w.clubs[0].name).toBe(club.name);
    expect(r.changes).toEqual([{ kind: 'klub', id: club.id, from: club.name, to: 'Kota Biru FC' }]);
    expect(r.world.originalNames).toEqual({ [`klub:${club.id}`]: `${club.name}|${club.badge.initials}` });
    // singkatan sendiri
    const r2 = applyNameEdits(r.world, [{ kind: 'klub', id: club.id, name: 'Kota Biru FC', short: 'kb' }]);
    expect(r2.world.clubs[0].badge.initials).toBe('KB');
    const back = restoreNames(r2.world);
    expect(back.world.clubs[0]).toEqual(club);
    expect(back.world.originalNames).toBeUndefined();
  });

  it('nama pemain dipecah jadi nama depan dan belakang; nama tunggal didukung', () => {
    expect(splitPersonName('Virgil van Dijk')).toEqual({ firstName: 'Virgil', lastName: 'van Dijk' });
    expect(splitPersonName('  Kaka ')).toEqual({ firstName: 'Kaka', lastName: '' });
    expect(splitPersonName('Son|Heung-min')).toEqual({ firstName: 'Son', lastName: 'Heung-min' });
    const p = w.players[5];
    const r = applyNameEdits(w, [{ kind: 'pemain', id: p.id, name: 'Budi Hartono Jaya' }]);
    const q = r.world.players.find((x) => x.id === p.id)!;
    expect([q.firstName, q.lastName]).toEqual(['Budi', 'Hartono Jaya']);
    expect(listNameables(r.world, 'pemain').find((x) => x.id === p.id)!.original).toBe(fullName(p));
  });

  it('nama kompetisi dipakai edisi berikutnya dan edisi berjalan', () => {
    const eng = w.leagues.find((l) => l.id === 'ENG1')!;
    const r = applyNameEdits(w, [
      { kind: 'kompetisi', id: 'EU1', name: 'Liga Juara Eropa' },
      { kind: 'kompetisi', id: 'cup:ENG1', name: 'Piala Tua' },
      { kind: 'liga', id: 'ENG1', name: 'Liga Utama Inggris' },
    ]);
    expect(r.world.compNames).toEqual({ EU1: 'Liga Juara Eropa', 'cup:ENG1': 'Piala Tua' });
    expect(cupName(eng, r.world)).toBe('Piala Tua');
    expect(cupName(eng)).toBe('Piala Inggris');
    const ed = createEdition(r.world, CONT_BY_ID.EU1, 2026, r.world.clubs.slice(0, 32).map((c) => c.id), new Rng('x'));
    expect(ed.name).toBe('Liga Juara Eropa');
    expect(r.world.leagues.find((l) => l.id === 'ENG1')!.name).toBe('Liga Utama Inggris');
    const back = restoreNames(r.world).world;
    expect(back.compNames).toBeUndefined();
    expect(back.leagues.find((l) => l.id === 'ENG1')!.name).toBe(eng.name);
  });

  it('nama di karier (klub sekarang, rekan setim) ikut diperbarui', () => {
    const career = { teamLabel: w.clubs[0].name, rel: { mates: [{ playerId: 'P1', name: 'Lama', tag: 'teman', value: 50 }] } } as unknown as Career;
    const c = renameInCareer(career, [
      { kind: 'klub', id: w.clubs[0].id, from: w.clubs[0].name, to: 'Baru FC' },
      { kind: 'pemain', id: 'P1', from: 'Lama', to: 'Baru' },
    ]);
    expect(c.teamLabel).toBe('Baru FC');
    expect(c.rel!.mates[0].name).toBe('Baru');
  });
});

describe('file nama (CSV)', () => {
  it('template berisi liga, kompetisi, klub, pelatih, dan pemain liga aktif', () => {
    const csv = nameTemplate(w, { players: 'aktif', sep: ';' });
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(['jenis', 'id', 'keterangan', 'nama_sekarang', 'nama_baru', 'singkatan_baru']);
    const kinds = new Set(rows.slice(1).map((r) => r[0]));
    expect([...kinds]).toEqual(['liga', 'kompetisi', 'klub', 'pelatih', 'pemain']);
    const active = new Set(w.clubs.filter((c) => ['ENG1', 'IDN1'].includes(c.leagueId)).map((c) => c.id));
    const players = rows.filter((r) => r[0] === 'pemain');
    expect(players.length).toBe(w.players.filter((p) => p.contract && active.has(p.contract.clubId)).length);
    expect(parseCsv(nameTemplate(w, { players: 'tidak' })).some((r) => r[0] === 'pemain')).toBe(false);
  });

  it('impor template yang diisi di Excel (titik koma, BOM, tanda kutip)', () => {
    const csv = nameTemplate(w, { players: 'aktif', sep: ';' });
    const rows = parseCsv(csv);
    const club = w.clubs.find((c) => c.leagueId === 'ENG1')!;
    const p = w.players.find((x) => x.contract?.clubId === club.id)!;
    const fill = (r: string[]) => {
      if (r[1] === club.id) return [...r.slice(0, 4), 'Kota "Merah" United', 'KMU'];
      if (r[1] === p.id) return [...r.slice(0, 4), 'Andi Saputra', ''];
      if (r[1] === 'EU2') return [...r.slice(0, 4), 'Piala Perak', ''];
      return r;
    };
    const text = '\uFEFF' + rows.map((r) => fill(r).map((c) => (/[;"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n');
    const res = applyNameFile(w, text);
    expect(res.problems).toEqual([]);
    expect(res.rows).toBe(3);
    expect(res.changes).toHaveLength(3);
    const c = res.world.clubs.find((x) => x.id === club.id)!;
    expect(c.name).toBe('Kota "Merah" United');
    expect(c.badge.initials).toBe('KMU');
    expect(fullName(res.world.players.find((x) => x.id === p.id)!)).toBe('Andi Saputra');
    expect(res.world.compNames).toEqual({ EU2: 'Piala Perak' });
    // impor ulang file yang sama tidak mengubah apa-apa dan tidak dianggap salah
    const again = applyNameFile(res.world, text);
    expect(again.problems).toEqual([]);
    expect(again.changes).toEqual([]);
  });

  it('file tulisan tangan: cocok lewat nama, kolom bahasa Inggris, dan baris bermasalah dilaporkan', () => {
    const club = w.clubs[3];
    const p = w.players.find((x) => x.contract?.clubId === club.id)!;
    const text = [
      'type,current_name,new_name,club',
      `club,${club.name.toUpperCase()},Kota Hijau,`,
      `player,${fullName(p)},Joko Susilo,${club.name}`,
      'player,Nama Yang Tidak Ada,Siapa Saja,',
      'alien,X,Y,',
    ].join('\n');
    const res = applyNameFile(w, text);
    expect(res.world.clubs[3].name).toBe('Kota Hijau');
    expect(fullName(res.world.players.find((x) => x.id === p.id)!)).toBe('Joko Susilo');
    expect(res.problems).toHaveLength(2);
    expect(res.problems.join(' ')).toMatch(/tidak ditemukan/);
    expect(res.problems.join(' ')).toMatch(/tidak dikenal/);
  });

  it('id pemain dari dunia lain ditolak supaya tidak salah orang', () => {
    const other = generateWorld({ seed: 'LAIN', activeLeagues: ['IDN1'] });
    const p = other.players[10];
    const mine = w.players.find((x) => x.id === p.id)!;
    expect(fullName(mine)).not.toBe(fullName(p));
    const res = applyNameFile(w, `jenis,id,nama_sekarang,nama_baru\npemain,${p.id},${fullName(p)},Orang Lain\n`);
    expect(res.changes).toEqual([]);
    expect(res.problems[0]).toMatch(/dunia lain/);
    // klub punya id tetap di semua dunia, jadi file klub bisa dipakai ulang
    const club = applyNameFile(other, `jenis,id,nama_baru\nklub,${w.clubs[0].id},Klub Ku\n`);
    expect(club.world.clubs[0].name).toBe('Klub Ku');
  });

  it('judul tidak dikenal memberi pesan jelas', () => {
    expect(parseNameFile('a,b,c\n1,2,3').errors[0]).toMatch(/judul/);
    expect(parseNameFile('').errors[0]).toMatch(/kosong/);
  });

  it('generasi berikutnya membawa nama klub, liga, dan kompetisi yang diganti', () => {
    const r = applyNameEdits(w, [
      { kind: 'klub', id: w.clubs[1].id, name: 'Klub Warisan', short: 'KW' },
      { kind: 'liga', id: 'IDN1', name: 'Liga Satu' },
      { kind: 'kompetisi', id: 'AS1', name: 'Liga Asia' },
      { kind: 'pemain', id: w.players[0].id, name: 'Tidak Dibawa' },
    ]);
    const next = carryNames(r.world, generateWorld({ seed: 'NAMA', activeLeagues: ['ENG1', 'IDN1'], startDate: '2040-07-01', era: 2 }));
    expect(next.clubs[1].name).toBe('Klub Warisan');
    expect(next.clubs[1].badge.initials).toBe('KW');
    expect(next.leagues.find((l) => l.id === 'IDN1')!.name).toBe('Liga Satu');
    expect(next.compNames).toEqual({ AS1: 'Liga Asia' });
    expect(Object.keys(next.originalNames!).sort()).toEqual([`klub:${w.clubs[1].id}`, 'liga:IDN1']);
    expect(fullName(next.players[0])).not.toBe('Tidak Dibawa');
  }, 30_000);
});
