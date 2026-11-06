// Editor nama: ganti nama klub, pemain, pelatih, liga, dan kompetisi satu per satu,
// atau sekaligus lewat file nama (CSV) milik pemain sendiri. Game tidak menyertakan nama asli.

import { useMemo, useRef, useState } from 'react';
import { useGame, useToday, type NamesImportSummary } from './store';
import { Badge } from './components';
import {
  KIND_LABEL,
  RENAME_KINDS,
  listNameables,
  normName,
  originalEdit,
  renamedCount,
  splitPersonName,
  type Nameable,
  type RenameKind,
  type TemplatePlayers,
} from '../game/sim/rename';

const MAX_SHOWN = 40;

/** Tombol kecil ✏️ di samping judul halaman: buka editor nama untuk hal ini */
export function RenameButton({ kind, id }: { kind: RenameKind; id: string }) {
  const go = useGame((s) => s.go);
  return (
    <button className="rename-btn" title="Ganti nama" aria-label="Ganti nama" onClick={() => go({ kind: 'names', edit: { kind, id } })}>
      ✏️
    </button>
  );
}

export function NamesView({ edit }: { edit?: { kind: RenameKind; id: string } }) {
  const world = useGame((s) => s.world)!;
  const today = useToday();
  const [kind, setKind] = useState<RenameKind>(edit?.kind ?? 'klub');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(edit?.id ?? null);
  const items = useMemo(() => listNameables(world, kind, today), [world, kind, today]);
  const shown = useMemo(() => {
    const n = normName(q);
    let list: Nameable[];
    if (n) {
      list = items.filter(
        (it) => normName(it.name).includes(n) || normName(it.info).includes(n) || (!!it.original && normName(it.original).includes(n)),
      );
    } else if (kind === 'pemain' || kind === 'manajer') {
      // terlalu banyak untuk ditampilkan semua: yang sudah diganti saja (plus yang sedang dibuka)
      list = items.filter((it) => it.original || it.id === open);
    } else list = items;
    if (open) list = [...list.filter((it) => it.id === open), ...list.filter((it) => it.id !== open)];
    return list;
  }, [items, q, kind, open]);
  const people = kind === 'pemain' || kind === 'manajer';

  return (
    <div className="names-view">
      <div className="page-head">
        <div>
          <h1>Editor nama</h1>
          <div className="muted">
            Game ini memakai nama fiktif. Ganti nama apa pun sesukamu, di sini atau lewat file nama milikmu sendiri.
          </div>
        </div>
      </div>

      <NameFilePanel />

      <section className="panel">
        <h2>Ganti satu per satu</h2>
        <div className="chips names-kinds">
          {RENAME_KINDS.map((k) => (
            <button
              key={k}
              className={`chip ${kind === k ? 'sel' : ''}`}
              onClick={() => {
                setKind(k);
                setOpen(null);
                setQ('');
              }}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <input
          className="names-search"
          placeholder={people ? `Cari nama ${KIND_LABEL[kind].toLowerCase()} atau klubnya…` : 'Cari…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {!q && people && !shown.length && (
          <p className="muted small">Ketik nama atau klub untuk mencari. Yang sudah kamu ganti akan muncul di sini.</p>
        )}
        {q && !shown.length && <p className="muted small">Tidak ditemukan.</p>}
        <div className="names-list">
          {shown.slice(0, MAX_SHOWN).map((it) => (
            <NameRow key={it.id} item={it} open={open === it.id} onOpen={() => setOpen(open === it.id ? null : it.id)} />
          ))}
        </div>
        {shown.length > MAX_SHOWN && (
          <p className="muted small">
            {shown.length - MAX_SHOWN} lainnya tidak ditampilkan. Persempit pencarian.
          </p>
        )}
      </section>
    </div>
  );
}

function NameRow({ item, open, onOpen }: { item: Nameable; open: boolean; onOpen: () => void }) {
  const idx = useGame((s) => s.idx)!;
  const club = item.kind === 'klub' ? idx.clubById.get(item.id) : undefined;
  return (
    <div className={`names-row ${open ? 'open' : ''}`}>
      <button className={`names-head ${club ? 'with-badge' : ''}`} onClick={onOpen} aria-expanded={open}>
        {club && <Badge club={club} size={22} />}
        <span className="names-name">
          <b>{item.name}</b>
          {item.original && <span className="muted small"> · bawaan: {item.original}</span>}
        </span>
        <span className="muted small names-info">{item.info}</span>
        <span className="names-edit" aria-hidden>
          ✏️
        </span>
      </button>
      {open && <NameForm item={item} onClose={onOpen} />}
    </div>
  );
}

/** Formulir ganti nama; dipasang ulang tiap dibuka supaya isinya selalu nama sekarang */
function NameForm({ item, onClose }: { item: Nameable; onClose: () => void }) {
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const renameOne = useGame((s) => s.renameOne);
  const people = item.kind === 'pemain' || item.kind === 'manajer';
  const person = people
    ? splitPersonName(item.kind === 'pemain' ? personName(idx.playerById.get(item.id)) : staffName(world, item.id))
    : null;
  const [name, setName] = useState(item.name);
  const [first, setFirst] = useState(person?.firstName ?? '');
  const [last, setLast] = useState(person?.lastName ?? '');
  const [short, setShort] = useState(item.short ?? '');
  const restore = originalEdit(world, item.kind, item.id);

  const save = () => {
    if (people) renameOne({ kind: item.kind, id: item.id, name: `${first}|${last}` });
    else renameOne({ kind: item.kind, id: item.id, name, short: item.kind === 'klub' && short !== item.short ? short : undefined });
    onClose();
  };

  return (
    <form
      className="names-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {people ? (
        <>
          <label>
            Nama depan
            <input value={first} onChange={(e) => setFirst(e.target.value)} maxLength={60} autoFocus />
          </label>
          <label>
            Nama belakang <span className="muted small">(boleh kosong)</span>
            <input value={last} onChange={(e) => setLast(e.target.value)} maxLength={60} />
          </label>
        </>
      ) : (
        <label>
          Nama
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
        </label>
      )}
      {item.kind === 'klub' && (
        <label className="names-short">
          Inisial lambang
          <input value={short} onChange={(e) => setShort(e.target.value.toUpperCase())} maxLength={4} />
        </label>
      )}
      <div className="names-buttons">
        <button type="submit" className="primary small-btn" disabled={people ? !first.trim() && !last.trim() : !name.trim()}>
          Simpan
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Batal
        </button>
        {restore && (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              renameOne(restore);
              onClose();
            }}
          >
            Kembalikan nama bawaan
          </button>
        )}
      </div>
    </form>
  );
}

const personName = (p?: { firstName: string; lastName: string }) => (p ? `${p.firstName}|${p.lastName}` : '');
const staffName = (world: { staff: { id: string; firstName: string; lastName: string }[] }, id: string) =>
  personName(world.staff.find((s) => s.id === id));

function NameFilePanel() {
  const world = useGame((s) => s.world)!;
  const exportNames = useGame((s) => s.exportNames);
  const importNames = useGame((s) => s.importNames);
  const restoreAllNames = useGame((s) => s.restoreAllNames);
  const [players, setPlayers] = useState<TemplatePlayers>('aktif');
  const [result, setResult] = useState<NamesImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const count = renamedCount(world);

  return (
    <section className="panel names-file">
      <h2>File nama</h2>
      <p className="small">
        Game tidak menyertakan nama asli. Kalau mau, buat file namamu sendiri: unduh template, isi kolom{' '}
        <b>nama_baru</b> (dan <b>singkatan_baru</b> untuk inisial lambang klub) di Excel atau Google Sheets, simpan sebagai
        CSV, lalu impor di sini. Baris yang tidak diisi dibiarkan.
      </p>
      <div className="names-actions">
        <select value={players} onChange={(e) => setPlayers(e.target.value as TemplatePlayers)} aria-label="Pemain di template">
          <option value="aktif">Dengan pemain liga aktif</option>
          <option value="semua">Dengan semua pemain</option>
          <option value="tidak">Tanpa pemain (klub, liga, kompetisi, pelatih)</option>
        </select>
        <button className="ghost" onClick={() => exportNames(players)}>
          ⬇️ Unduh template CSV
        </button>
        <button className="primary small-btn" onClick={() => fileRef.current?.click()}>
          Impor file nama
        </button>
        <input
          ref={fileRef}
          id="import-names"
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) setResult(await importNames(f));
          }}
        />
      </div>
      {result && (
        <div className={`names-result ${result.changed ? 'ok' : ''}`}>
          <div>{result.changed ? '✓ ' : ''}{result.text}</div>
          {result.problems.length > 0 && (
            <details>
              <summary>{result.problems.length} baris dilewati</summary>
              <ul className="small">
                {result.problems.slice(0, 50).map((p) => (
                  <li key={p}>{p}</li>
                ))}
                {result.problems.length > 50 && <li>… dan {result.problems.length - 50} lainnya</li>}
              </ul>
            </details>
          )}
        </div>
      )}
      <p className="muted small">
        Id klub, liga, dan kompetisi sama di semua dunia, jadi file berisi nama klub bisa dipakai lagi di karier baru (bisa
        langsung dipilih saat membuat dunia). Id pemain berbeda tiap dunia; baris pemain dari dunia lain otomatis dilewati.
        Nama pemain ditulis "Nama Depan Nama Belakang"; pakai tanda | untuk memisah persis, misalnya "Budi|Santoso Putra".
        Nama klub, liga, dan kompetisi yang diganti ikut terbawa ke generasi berikutnya.
      </p>
      {count > 0 && (
        <button
          className="ghost"
          onClick={() => {
            if (window.confirm(`Kembalikan ${count} nama yang sudah diganti ke nama bawaan game?`)) {
              const n = restoreAllNames();
              setResult({ changed: 0, text: `${n} nama dikembalikan ke bawaan.`, problems: [] });
            }
          }}
        >
          Kembalikan semua nama bawaan ({count})
        </button>
      )}
    </section>
  );
}
