// Nama asli lewat file milik pemain sendiri. Game hanya memakai nama fiktif, tapi kamu bisa mengganti
// nama klub, pemain, pelatih, liga, dan kompetisi: satu per satu lewat editor nama, atau sekaligus
// lewat file CSV (unduh template, isi kolom nama_baru di Excel / Google Sheets, lalu impor).
// Nama bawaan disimpan di world.originalNames supaya selalu bisa dikembalikan.

import type { Career, World } from '../types';
import { COUNTRY_BY_ID } from '../data/countries';
import { fullName } from '../gen/names';
import { ageOn } from '../gen/player';
import { initials } from '../gen/world';
import { CONT_DEFS, contName } from './continental';
import { cupName } from './cup';

export type RenameKind = 'klub' | 'pemain' | 'manajer' | 'liga' | 'kompetisi';
export const RENAME_KINDS: RenameKind[] = ['klub', 'pemain', 'manajer', 'liga', 'kompetisi'];
export const KIND_LABEL: Record<RenameKind, string> = {
  klub: 'Klub',
  pemain: 'Pemain',
  manajer: 'Pelatih',
  liga: 'Liga',
  kompetisi: 'Kompetisi',
};

const KIND_ALIAS: Record<string, RenameKind> = {
  klub: 'klub', club: 'klub', tim: 'klub', team: 'klub',
  pemain: 'pemain', player: 'pemain',
  manajer: 'manajer', manager: 'manajer', pelatih: 'manajer', coach: 'manajer', staf: 'manajer', staff: 'manajer',
  liga: 'liga', league: 'liga',
  kompetisi: 'kompetisi', competition: 'kompetisi', piala: 'kompetisi', cup: 'kompetisi', turnamen: 'kompetisi',
};

/** Satu hal yang namanya bisa diganti */
export interface Nameable {
  kind: RenameKind;
  id: string;
  name: string;
  /** inisial lambang (klub saja) */
  short?: string;
  /** keterangan singkat: liga klub, klub pemain, dst. */
  info: string;
  /** nama bawaan game, kalau sudah diganti */
  original?: string;
}

/** Nama baru; untuk pemain/pelatih "Depan|Belakang" memisah nama persis */
export interface NameEdit {
  kind: RenameKind;
  id: string;
  name: string;
  short?: string;
}
export interface NameChange {
  kind: RenameKind;
  id: string;
  from: string;
  to: string;
}

const MAX_LEN = 60;
/** Untuk mencocokkan nama: tanpa aksen, huruf kecil, spasi rapi */
export const normName = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (s: string) => s.replace(/[|\s]+/g, ' ').trim().slice(0, MAX_LEN);

/** "Virgil van Dijk" -> Virgil + van Dijk; satu kata = nama tunggal; "Son|Heung-min" memisah persis */
export function splitPersonName(full: string): { firstName: string; lastName: string } {
  const bar = full.indexOf('|');
  let firstName: string;
  let lastName: string;
  if (bar >= 0) {
    firstName = clean(full.slice(0, bar));
    lastName = clean(full.slice(bar + 1));
  } else {
    const words = clean(full).split(' ').filter(Boolean);
    firstName = words[0] ?? '';
    lastName = words.slice(1).join(' ');
  }
  return firstName ? { firstName, lastName } : { firstName: lastName, lastName: '' };
}

const country = (id: string) => COUNTRY_BY_ID[id]?.name ?? id;

interface CompInfo {
  id: string;
  name: string;
  /** nama bawaan game */
  base: string;
  info: string;
}

/** Kompetisi benua (EU1, AS1, ...) dan piala domestik (`cup:<liga divisi 1>`) */
function competitions(world: World): CompInfo[] {
  const cont = CONT_DEFS.map((d) => ({
    id: d.id,
    name: contName(world, d),
    base: d.name,
    info: `Kompetisi antarklub ${d.confed === 'UEFA' ? 'Eropa' : 'Asia'}`,
  }));
  const cups = world.leagues
    .filter((l) => l.division === 1)
    .map((l) => ({ id: `cup:${l.id}`, name: cupName(l, world), base: cupName(l), info: `Piala domestik ${country(l.countryId)}` }));
  return [...cont, ...cups];
}

const personOrig = (v?: string) => (v === undefined ? undefined : fullName(splitPersonName(v)));

/** Semua hal dari satu jenis yang bisa diganti namanya */
export function listNameables(world: World, kind: RenameKind, today = world.startDate): Nameable[] {
  const orig = world.originalNames ?? {};
  const clubName = new Map(world.clubs.map((c) => [c.id, c.name]));
  switch (kind) {
    case 'liga':
      return world.leagues.map((l) => ({
        kind,
        id: l.id,
        name: l.name,
        info: `${country(l.countryId)} · Divisi ${l.division}`,
        original: orig[`liga:${l.id}`],
      }));
    case 'kompetisi':
      return competitions(world).map((c) => ({
        kind,
        id: c.id,
        name: c.name,
        info: c.info,
        original: c.name !== c.base ? c.base : undefined,
      }));
    case 'klub': {
      const leagueName = new Map(world.leagues.map((l) => [l.id, l.name]));
      return world.clubs.map((c) => ({
        kind,
        id: c.id,
        name: c.name,
        short: c.badge.initials,
        info: `${leagueName.get(c.leagueId) ?? c.leagueId} · ${country(c.countryId)}`,
        original: orig[`klub:${c.id}`]?.split('|')[0],
      }));
    }
    case 'manajer':
      return world.staff.map((s) => ({
        kind,
        id: s.id,
        name: fullName(s),
        info: s.clubId ? `Pelatih ${clubName.get(s.clubId) ?? s.clubId}` : 'Tanpa klub',
        original: personOrig(orig[`manajer:${s.id}`]),
      }));
    case 'pemain':
      return world.players.map((p) => ({
        kind,
        id: p.id,
        name: fullName(p),
        info: `${p.contract ? (clubName.get(p.contract.clubId) ?? p.contract.clubId) : 'Tanpa klub'} · ${p.mainPosition} · ${ageOn(p.birthDate, today)} th`,
        original: personOrig(orig[`pemain:${p.id}`]),
      }));
  }
}

/** Terapkan nama baru. Dunia lama tidak diubah; nama bawaan dicatat untuk dikembalikan. */
export function applyNameEdits(world: World, edits: NameEdit[]): { world: World; changes: NameChange[] } {
  const changes: NameChange[] = [];
  if (!edits.length) return { world, changes };
  const w: World = { ...world };
  const orig: Record<string, string> = { ...world.originalNames };
  const comps: Record<string, string> = { ...world.compNames };
  const index = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x, i) => [x.id, i]));
  const kinds = new Set(edits.map((e) => e.kind));
  if (kinds.has('klub')) w.clubs = world.clubs.slice();
  if (kinds.has('pemain')) w.players = world.players.slice();
  if (kinds.has('manajer')) w.staff = world.staff.slice();
  if (kinds.has('liga')) w.leagues = world.leagues.slice();
  const clubIdx = kinds.has('klub') ? index(w.clubs) : new Map<string, number>();
  const playerIdx = kinds.has('pemain') ? index(w.players) : new Map<string, number>();
  const staffIdx = kinds.has('manajer') ? index(w.staff) : new Map<string, number>();
  const leagueIdx = kinds.has('liga') ? index(w.leagues) : new Map<string, number>();
  /** catat nama bawaan sekali; hapus catatan kalau namanya kembali seperti bawaan */
  const remember = (key: string, before: string, after: string) => {
    orig[key] ??= before;
    if (orig[key] === after) delete orig[key];
  };

  for (const e of edits) {
    const key = `${e.kind}:${e.id}`;
    switch (e.kind) {
      case 'klub': {
        const i = clubIdx.get(e.id);
        if (i === undefined) break;
        const c = w.clubs[i];
        const name = clean(e.name) || c.name;
        const short = e.short?.trim()
          ? clean(e.short).replace(/\s/g, '').toUpperCase().slice(0, 4)
          : name !== c.name
            ? initials(name)
            : c.badge.initials;
        if (name === c.name && short === c.badge.initials) break;
        remember(key, `${c.name}|${c.badge.initials}`, `${name}|${short}`);
        w.clubs[i] = { ...c, name, badge: { ...c.badge, initials: short } };
        changes.push({ kind: e.kind, id: e.id, from: c.name, to: name });
        break;
      }
      case 'pemain':
      case 'manajer': {
        const player = e.kind === 'pemain';
        const i = (player ? playerIdx : staffIdx).get(e.id);
        if (i === undefined) break;
        const p = player ? w.players[i] : w.staff[i];
        const n = splitPersonName(e.name);
        if (!n.firstName || (n.firstName === p.firstName && n.lastName === p.lastName)) break;
        remember(key, `${p.firstName}|${p.lastName}`, `${n.firstName}|${n.lastName}`);
        if (player) w.players[i] = { ...w.players[i], ...n };
        else w.staff[i] = { ...w.staff[i], ...n };
        changes.push({ kind: e.kind, id: e.id, from: fullName(p), to: fullName(n) });
        break;
      }
      case 'liga': {
        const i = leagueIdx.get(e.id);
        if (i === undefined) break;
        const l = w.leagues[i];
        const name = clean(e.name);
        if (!name || name === l.name) break;
        remember(key, l.name, name);
        w.leagues[i] = { ...l, name };
        changes.push({ kind: e.kind, id: e.id, from: l.name, to: name });
        break;
      }
      case 'kompetisi': {
        const c = competitions({ ...w, compNames: comps }).find((x) => x.id === e.id);
        const name = clean(e.name);
        if (!c || !name || name === c.name) break;
        if (name === c.base) delete comps[e.id];
        else comps[e.id] = name;
        // edisi yang sedang berjalan ikut berganti nama
        if (w.continental?.[e.id]) w.continental = { ...w.continental, [e.id]: { ...w.continental[e.id], name } };
        const lid = e.id.startsWith('cup:') ? e.id.slice(4) : '';
        if (lid && w.cups?.[lid]) w.cups = { ...w.cups, [lid]: { ...w.cups[lid], name } };
        changes.push({ kind: e.kind, id: e.id, from: c.name, to: name });
        break;
      }
    }
  }
  w.originalNames = orig;
  w.compNames = comps;
  if (!Object.keys(orig).length) delete w.originalNames;
  if (!Object.keys(comps).length) delete w.compNames;
  return { world: changes.length ? w : world, changes };
}

/** Perubahan yang mengembalikan satu nama ke bawaan game (undefined kalau belum pernah diganti) */
export function originalEdit(world: World, kind: RenameKind, id: string): NameEdit | undefined {
  if (kind === 'kompetisi') {
    const c = competitions(world).find((x) => x.id === id);
    return c && c.name !== c.base ? { kind, id, name: c.base } : undefined;
  }
  const val = world.originalNames?.[`${kind}:${id}`];
  if (val === undefined) return undefined;
  if (kind === 'klub') {
    const [name, short] = val.split('|');
    return { kind, id, name, short };
  }
  return { kind, id, name: val };
}

/** Berapa nama yang sedang diganti */
export const renamedCount = (world: World) =>
  Object.keys(world.originalNames ?? {}).length + Object.keys(world.compNames ?? {}).length;

/** Kembalikan semua nama bawaan game */
export function restoreNames(world: World): { world: World; changes: NameChange[] } {
  const edits: NameEdit[] = [];
  for (const key of Object.keys(world.originalNames ?? {})) {
    const at = key.indexOf(':');
    const e = originalEdit(world, key.slice(0, at) as RenameKind, key.slice(at + 1));
    if (e) edits.push(e);
  }
  for (const c of competitions(world)) if (c.name !== c.base) edits.push({ kind: 'kompetisi', id: c.id, name: c.base });
  return applyNameEdits(world, edits);
}

/** Generasi berikutnya: klub, liga, dan kompetisi tetap sama, jadi nama yang kamu ganti ikut terbawa */
export function carryNames(from: World, to: World): World {
  const edits: NameEdit[] = [];
  for (const key of Object.keys(from.originalNames ?? {})) {
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (kind === 'klub') {
      const c = from.clubs.find((x) => x.id === id);
      if (c) edits.push({ kind, id, name: c.name, short: c.badge.initials });
    } else if (kind === 'liga') {
      const l = from.leagues.find((x) => x.id === id);
      if (l) edits.push({ kind, id, name: l.name });
    }
  }
  for (const [id, name] of Object.entries(from.compNames ?? {})) edits.push({ kind: 'kompetisi', id, name });
  return applyNameEdits(to, edits).world;
}

/** Nama yang tersimpan di karier (klub saat ini, rekan setim) ikut diperbarui */
export function renameInCareer(career: Career, changes: NameChange[]): Career {
  let c = career;
  for (const ch of changes) {
    if (ch.kind === 'klub' && c.teamLabel === ch.from) c = { ...c, teamLabel: ch.to };
    if (ch.kind === 'pemain' && c.rel?.mates.some((m) => m.playerId === ch.id)) {
      c = { ...c, rel: { ...c.rel, mates: c.rel.mates.map((m) => (m.playerId === ch.id ? { ...m, name: ch.to } : m)) } };
    }
  }
  return c;
}

// ---------- File CSV ----------

/** Pemisah kolom: yang paling sering muncul di baris pertama (Excel Indonesia memakai ';') */
function detectSep(line: string): string {
  const count: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in count) count[ch]++;
  }
  const [best, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : ',';
}

/** CSV sederhana: tanda kutip, kutip ganda di dalam kutip, baris baru di dalam kutip */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const sep = detectSep(src.slice(0, src.search(/\r?\n|$/)));
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

type Col = 'kind' | 'id' | 'info' | 'current' | 'name' | 'short';
const TEMPLATE_COLS: Col[] = ['kind', 'id', 'info', 'current', 'name', 'short'];
const HEADER = ['jenis', 'id', 'keterangan', 'nama_sekarang', 'nama_baru', 'singkatan_baru'];
const COL_ALIAS: Record<string, Col> = {
  jenis: 'kind', type: 'kind', tipe: 'kind', kind: 'kind',
  id: 'id',
  keterangan: 'info', info: 'info', klub: 'info', club: 'info', tim: 'info', team: 'info',
  nama_sekarang: 'current', nama_lama: 'current', nama: 'current', current: 'current', current_name: 'current', old_name: 'current', name: 'current',
  nama_baru: 'name', baru: 'name', new: 'name', new_name: 'name',
  singkatan_baru: 'short', singkatan: 'short', inisial: 'short', short: 'short', short_name: 'short', new_short: 'short', initials: 'short',
};

export interface FileRow {
  line: number;
  kind: RenameKind;
  id: string;
  info: string;
  current: string;
  name: string;
  short: string;
}

/** Baca file nama. Baris judul boleh pakai nama kolom Indonesia atau Inggris; tanpa judul = urutan template. */
export function parseNameFile(text: string): { rows: FileRow[]; errors: string[] } {
  const rows: FileRow[] = [];
  const errors: string[] = [];
  const table = parseCsv(text);
  let start = 0;
  // lewati baris kosong / komentar di awal
  while (start < table.length && (table[start].every((c) => !c.trim()) || table[start][0]?.trim().startsWith('#'))) start++;
  if (start >= table.length) return { rows, errors: ['File kosong.'] };
  const head = table[start].map((c) => c.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  let cols: (Col | undefined)[];
  if (head.some((h) => COL_ALIAS[h] === 'kind') && head.some((h) => COL_ALIAS[h] === 'name')) {
    cols = head.map((h) => COL_ALIAS[h]);
    start++;
  } else if (KIND_ALIAS[normName(table[start][0] ?? '')]) {
    cols = TEMPLATE_COLS;
  } else {
    return { rows, errors: ['Baris judul tidak dikenali. Pakai kolom: jenis, id, keterangan, nama_sekarang, nama_baru, singkatan_baru.'] };
  }
  for (let r = start; r < table.length; r++) {
    const cells = table[r];
    if (cells.every((c) => !c.trim()) || cells[0]?.trim().startsWith('#')) continue;
    const get = (col: Col) => {
      const i = cols.indexOf(col);
      return i >= 0 ? (cells[i] ?? '').trim() : '';
    };
    const line = r + 1;
    const name = get('name');
    const short = get('short');
    if (!name && !short) continue; // belum diisi: lewati
    const kind = KIND_ALIAS[normName(get('kind'))];
    if (!kind) {
      errors.push(`Baris ${line}: jenis "${get('kind')}" tidak dikenal (pakai klub, pemain, pelatih, liga, atau kompetisi).`);
      continue;
    }
    rows.push({ line, kind, id: get('id'), info: get('info'), current: get('current'), name, short });
  }
  return { rows, errors };
}

export interface ImportResult {
  world: World;
  changes: NameChange[];
  /** baris yang tidak bisa dicocokkan, dengan alasannya */
  problems: string[];
  /** baris berisi nama baru di file */
  rows: number;
}

/** Cocokkan baris file ke dunia (pakai id; kalau kosong pakai nama sekarang) lalu ganti namanya */
export function applyNameFile(world: World, text: string, today = world.startDate): ImportResult {
  const { rows, errors } = parseNameFile(text);
  const problems = [...errors];
  const cache = new Map<RenameKind, { byId: Map<string, Nameable>; byName: Map<string, Nameable[]> }>();
  const lookup = (kind: RenameKind) => {
    let c = cache.get(kind);
    if (!c) {
      const items = listNameables(world, kind, today);
      const byName = new Map<string, Nameable[]>();
      const add = (n: string, it: Nameable) => {
        const k = normName(n);
        const list = byName.get(k) ?? [];
        if (!list.includes(it)) list.push(it);
        byName.set(k, list);
      };
      for (const it of items) {
        add(it.name, it);
        if (it.original) add(it.original, it);
      }
      c = { byId: new Map(items.map((it) => [it.id, it])), byName };
      cache.set(kind, c);
    }
    return c;
  };
  const edits: NameEdit[] = [];
  for (const row of rows) {
    const label = KIND_LABEL[row.kind].toLowerCase();
    const { byId, byName } = lookup(row.kind);
    let item: Nameable | undefined;
    if (row.id) {
      item = byId.get(row.id);
      if (!item) {
        problems.push(`Baris ${row.line}: ${label} dengan id "${row.id}" tidak ada di dunia ini.`);
        continue;
      }
      // id pemain/pelatih berbeda tiap dunia: pastikan nama sekarang cocok supaya tidak salah orang
      const person = row.kind === 'pemain' || row.kind === 'manajer';
      const known = [item.name, item.original ?? '', fullName(splitPersonName(row.name))].map(normName);
      if (person && row.current && !known.includes(normName(row.current))) {
        problems.push(`Baris ${row.line}: ${label} ${row.id} di dunia ini bernama "${item.name}", bukan "${row.current}" (file dari dunia lain?).`);
        continue;
      }
    } else if (row.current) {
      let found = byName.get(normName(row.current)) ?? [];
      if (found.length > 1 && row.info) {
        const want = normName(row.info);
        found = found.filter((it) => normName(it.info).includes(want));
      }
      if (found.length !== 1) {
        problems.push(
          found.length
            ? `Baris ${row.line}: ada ${found.length} ${label} bernama "${row.current}". Tambahkan id atau keterangan (nama klub).`
            : `Baris ${row.line}: ${label} "${row.current}" tidak ditemukan.`,
        );
        continue;
      }
      item = found[0];
    } else {
      problems.push(`Baris ${row.line}: isi kolom id atau nama_sekarang.`);
      continue;
    }
    edits.push({ kind: row.kind, id: item.id, name: row.name || (row.kind === 'klub' ? item.name : ''), short: row.short || undefined });
  }
  const r = applyNameEdits(world, edits);
  return { world: r.world, changes: r.changes, problems, rows: rows.length };
}

export type TemplatePlayers = 'aktif' | 'semua' | 'tidak';

function csvCell(v: string, sep: string): string {
  return v.includes(sep) || v.includes('"') || /[\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Template file nama: semua liga, kompetisi, klub, dan pelatih, plus pemain (liga aktif saja, semua,
 * atau tidak ada). Isi kolom nama_baru (dan singkatan_baru untuk lambang klub), lalu impor.
 */
export function nameTemplate(world: World, opts: { players: TemplatePlayers; sep?: string; today?: string }): string {
  const sep = opts.sep ?? ',';
  const lines: string[][] = [HEADER];
  const active = new Set(world.leagues.filter((l) => l.active).map((l) => l.id));
  const clubLeague = new Map(world.clubs.map((c) => [c.id, c.leagueId]));
  const clubOrder = new Map(world.clubs.map((c, i) => [c.id, i]));
  const kinds: RenameKind[] = ['liga', 'kompetisi', 'klub', 'manajer', ...(opts.players === 'tidak' ? [] : (['pemain'] as const))];
  for (const kind of kinds) {
    let items = listNameables(world, kind, opts.today);
    if (kind === 'pemain') {
      const byId = new Map(world.players.map((p) => [p.id, p]));
      const club = (id: string) => byId.get(id)?.contract?.clubId;
      items = items
        .filter((it) => {
          const cid = club(it.id);
          return opts.players === 'semua' || byId.get(it.id)?.isUser || (!!cid && active.has(clubLeague.get(cid)!));
        })
        .sort((a, b) => (clubOrder.get(club(a.id) ?? '') ?? 1e9) - (clubOrder.get(club(b.id) ?? '') ?? 1e9));
    }
    for (const it of items) lines.push([kind === 'manajer' ? 'pelatih' : kind, it.id, it.info, it.name, '', '']);
  }
  return lines.map((l) => l.map((c) => csvCell(c, sep)).join(sep)).join('\r\n') + '\r\n';
}
