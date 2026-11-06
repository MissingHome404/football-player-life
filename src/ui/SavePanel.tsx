import { useEffect, useRef, useState } from 'react';
import { useGame } from './store';
import { Flag } from './components';
import { listSaves, deleteSave } from '../game/save/storage';
import type { SaveSummary } from '../game/save/codec';

type SaveMeta = { id: string; savedAt: string; summary: SaveSummary };

const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'barusan';
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
};

/** Daftar save di layar awal + tombol impor */
export function SavePanel() {
  const loadSave = useGame((s) => s.loadSave);
  const exportSave = useGame((s) => s.exportSave);
  const importSave = useGame((s) => s.importSave);
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    listSaves().then(setSaves);
  };
  useEffect(refresh, []);

  return (
    <section className="panel saves">
      <div className="saves-head">
        <div>
          <h2>Lanjutkan karier</h2>
          <p className="muted small">
            Save tersimpan otomatis di browser ini. Ekspor ke file supaya aman kalau data browser terhapus atau mau
            pindah perangkat.
          </p>
        </div>
        <button className="ghost" onClick={() => fileRef.current?.click()}>
          Impor file save
        </button>
        <input
          ref={fileRef}
          id="import-save"
          type="file"
          accept=".fplsave,application/octet-stream"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importSave(f);
          }}
        />
      </div>
      {saves === null ? (
        <p className="muted small">Memeriksa save…</p>
      ) : saves.length === 0 ? (
        <p className="muted small">Belum ada karier tersimpan. Buat dunia di bawah untuk memulai.</p>
      ) : (
        <ul className="save-list">
          {saves.map((s) => (
            <li key={s.id}>
              <div className="save-info">
                <b>
                  <Flag id={s.summary.countryId} /> {s.summary.playerName}
                </b>
                <span className="muted small">
                  {s.summary.position} · {s.summary.age} th · {s.summary.team} · {fmtDate(s.summary.gameDate)}
                  {s.summary.retired && ` · skor legacy ${s.summary.legacy ?? '-'}`}
                </span>
                <span className="muted small">Disimpan {ago(s.savedAt)}</span>
              </div>
              {confirmId === s.id ? (
                <div className="save-actions">
                  <span className="small">Hapus karier ini?</span>
                  <button
                    className="danger"
                    onClick={async () => {
                      await deleteSave(s.id);
                      setConfirmId(null);
                      refresh();
                    }}
                  >
                    Hapus
                  </button>
                  <button className="ghost" onClick={() => setConfirmId(null)}>
                    Batal
                  </button>
                </div>
              ) : (
                <div className="save-actions">
                  <button className={`${s.summary.retired ? 'ghost' : 'primary'} small-btn`} onClick={() => void loadSave(s.id)}>
                    {s.summary.retired ? 'Lihat' : 'Lanjutkan'}
                  </button>
                  <button className="ghost" onClick={() => void exportSave(s.id)}>
                    Ekspor
                  </button>
                  <button className="ghost" onClick={() => setConfirmId(s.id)} aria-label="Hapus save">
                    Hapus
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Status simpan + tombol di topbar */
export function SaveControls() {
  const saveNow = useGame((s) => s.saveNow);
  const exportSave = useGame((s) => s.exportSave);
  const status = useGame((s) => s.saveStatus);
  const lastSavedAt = useGame((s) => s.lastSavedAt);
  const text =
    status === 'saving'
      ? 'Menyimpan…'
      : status === 'error'
        ? 'Gagal simpan'
        : lastSavedAt
          ? `Tersimpan ${new Date(lastSavedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
          : 'Belum disimpan';
  return (
    <div className="save-controls">
      <span className={`save-status ${status}`}>{text}</span>
      <button className="ghost" disabled={status === 'saving'} onClick={() => void saveNow()}>
        Simpan
      </button>
      <button className="ghost hide-sm" onClick={() => void exportSave()}>
        Ekspor
      </button>
    </div>
  );
}

/** Overlay loading + pesan error global */
export function GlobalLayer() {
  const busy = useGame((s) => s.busy);
  const message = useGame((s) => s.message);
  const clear = useGame((s) => s.clearMessage);
  return (
    <>
      {busy && (
        <div className="overlay" role="status">
          <div className="overlay-box">{busy}</div>
        </div>
      )}
      {message && (
        <div className="toast" role="alert">
          <span>{message}</span>
          <button className="ghost" onClick={clear}>
            Tutup
          </button>
        </div>
      )}
    </>
  );
}
