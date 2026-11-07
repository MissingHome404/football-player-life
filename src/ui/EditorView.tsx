// Editor in-game (cheat) ala FM: pilih pemain mana saja lalu ubah datanya. Untuk pemainmu sendiri
// juga ada data karier (uang, stres, cedera, skorsing, bonus kontrak).

import { useMemo, useState } from 'react';
import { useGame, useToday } from './store';
import { PageTitle } from './CareerHome';
import { Badge, Stars, caStars } from './components';
import { POSITIONS, POSITION_LABEL, type Position } from '../game/data/attributes';
import { POSITION_ROLES, ROLES } from '../game/data/roles';
import { COUNTRIES, flagOf } from '../game/data/countries';
import { ATTR_GROUPS, EDIT_AGE, bestRoleFor, draftOf, type AttrGroup, type EditorDraft } from '../game/sim/editor';
import { ageOn, computeCA } from '../game/gen/player';
import { fullName } from '../game/gen/names';
import type { ContractBonus, Player, SquadRole } from '../game/types';

const GROUP_LABEL: Record<AttrGroup, string> = {
  technical: 'Technical',
  mental: 'Mental',
  physical: 'Physical',
  goalkeeping: 'Goalkeeping',
  personality: 'Kepribadian (tersembunyi)',
  hidden: 'Atribut tersembunyi',
};

const ROLES_SQUAD: SquadRole[] = ['Inti', 'Rotasi', 'Pelapis', 'Pemain muda'];

const BONUS_LABEL: [keyof ContractBonus, string][] = [
  ['app', 'Bonus dimainkan'],
  ['unused', 'Bonus di bangku'],
  ['goal', 'Bonus per gol'],
  ['assist', 'Bonus per assist'],
  ['cs', 'Bonus clean sheet'],
  ['trophy', 'Bonus juara'],
];

const MAX_RESULTS = 25;

function Num({
  label,
  value,
  min,
  max,
  step,
  money,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** kolom uang: lebih lebar */
  money?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        className={money ? 'ed-money' : undefined}
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </label>
  );
}

export function EditorView({ playerId }: { playerId?: string }) {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const [unlocked, setUnlocked] = useState(!!career.edited);
  const p = idx.playerById.get(playerId ?? career.playerId) ?? idx.playerById.get(career.playerId)!;

  if (!unlocked) {
    return (
      <div>
        <PageTitle title="Editor in-game" />
        <section className="panel">
          <p className="editor-warn">
            Editor ini seperti in-game editor di FM: kamu bisa mengubah pemain mana saja, baik pemainmu sendiri maupun pemain lain. Atribut,
            potensi, posisi, peran, umur, kewarganegaraan, reputasi, klub, dan kontrak bisa diubah sesukamu. Untuk pemainmu juga ada uang,
            stres, kebugaran, cedera, skorsing, dan bonus kontrak. Karier yang pernah diedit diberi tanda <b>"Diedit"</b> di halaman ini dan
            tidak bisa dihapus.
          </p>
          <button className="primary" onClick={() => setUnlocked(true)}>
            Buka editor
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="editor-view">
      <PageTitle title="Editor in-game" sub={career.edited ? 'Karier ini sudah pernah diedit.' : 'Pilih pemain, ubah datanya, lalu simpan.'} />
      <PlayerPicker current={p} />
      <EditorForm key={p.id} p={p} />
    </div>
  );
}

/** Cari pemain (nama atau klub) untuk diedit */
function PlayerPicker({ current }: { current: Player }) {
  const world = useGame((s) => s.world)!;
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const today = useToday();
  const [q, setQ] = useState('');
  const mine = current.id === career.playerId;
  const club = current.contract ? idx.clubById.get(current.contract.clubId) : undefined;

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return world.players
      .filter((x) => {
        if (fullName(x).toLowerCase().includes(s)) return true;
        const c = x.contract ? idx.clubById.get(x.contract.clubId) : undefined;
        return !!c && c.name.toLowerCase().includes(s);
      })
      .sort((a, b) => b.ca - a.ca);
  }, [q, world, idx]);

  return (
    <section className="panel">
      <div className="card-head">
        <h2>Pemain yang diedit</h2>
        <div className="chips">
          {!mine && (
            <button className="chip" onClick={() => go({ kind: 'editor' })}>
              Kembali ke pemainku
            </button>
          )}
          <button className="chip" onClick={() => go({ kind: 'player', playerId: current.id })}>
            Lihat profil
          </button>
        </div>
      </div>
      <div className="ed-current">
        {club && <Badge club={club} size={32} />}
        <div>
          <b>
            {fullName(current)}
            {mine ? ' (kamu)' : ''}
          </b>
          <div className="muted small">
            {POSITION_LABEL[current.mainPosition]} · {ageOn(current.birthDate, today)} tahun · {flagOf(current.nationalityId)} ·{' '}
            {club ? club.name : 'Tanpa klub'} · <Stars value={caStars(current.ca)} />
          </div>
        </div>
      </div>
      <input
        className="names-search"
        placeholder="Cari pemain lain lewat nama atau klubnya…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Cari pemain untuk diedit"
      />
      {q.trim().length >= 2 && !results.length && <p className="muted small">Tidak ditemukan.</p>}
      {results.length > 0 && (
        <div className="table-wrap">
          <table className="tbl small">
            <thead>
              <tr>
                <th>Pos</th>
                <th className="left">Nama</th>
                <th>Umur</th>
                <th className="left">Klub</th>
                <th>Kemampuan</th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, MAX_RESULTS).map((x) => {
                const c = x.contract ? idx.clubById.get(x.contract.clubId) : undefined;
                return (
                  <tr
                    key={x.id}
                    className={`click ${x.id === current.id ? 'mine' : ''}`}
                    onClick={() => {
                      setQ('');
                      go({ kind: 'editor', playerId: x.id });
                    }}
                  >
                    <td>
                      <span className="pos">{x.mainPosition}</span>
                    </td>
                    <td className="left strong">
                      {flagOf(x.nationalityId)} {fullName(x)}
                      {x.isUser ? ' (kamu)' : ''}
                    </td>
                    <td>{ageOn(x.birthDate, today)}</td>
                    <td className="left">{c ? c.name : <span className="muted">Tanpa klub</span>}</td>
                    <td>
                      <Stars value={caStars(x.ca)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {results.length > MAX_RESULTS && (
            <p className="muted small">{results.length - MAX_RESULTS} pemain lain tidak ditampilkan. Persempit pencarian.</p>
          )}
        </div>
      )}
      <p className="muted small">Kamu juga bisa membuka editor dari halaman profil pemain mana saja lewat tombol 🛠️ di samping namanya.</p>
    </section>
  );
}

function EditorForm({ p }: { p: Player }) {
  const career = useGame((s) => s.career)!;
  const world = useGame((s) => s.world)!;
  const apply = useGame((s) => s.applyEditor);
  const mine = p.id === career.playerId;
  const [d, setD] = useState<EditorDraft>(() => draftOf(career, p));
  const [note, setNote] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const countries = useMemo(() => [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name)), []);
  const leagues = useMemo(
    () =>
      world.leagues
        .map((l) => ({ l, clubs: world.clubs.filter((c) => c.leagueId === l.id).sort((a, b) => a.name.localeCompare(b.name)) }))
        .filter((g) => g.clubs.length),
    [world],
  );

  const up = (fn: (x: EditorDraft) => void) => {
    setD((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };
  const preview = { ...p, ...d.attrs } as unknown as Player;
  const ca = computeCA(preview);
  const isGK = d.mainPosition === 'GK' || p.mainPosition === 'GK';
  const groups = ATTR_GROUPS.filter((g) => g !== 'goalkeeping' || isGK);
  const allAttrs = (delta: number | 'max') =>
    up((x) => {
      for (const g of ['technical', 'mental', 'physical', 'goalkeeping'] as const) {
        if (g === 'goalkeeping' && !isGK) continue;
        for (const a of Object.keys(x.attrs[g])) x.attrs[g][a] = delta === 'max' ? 20 : Math.max(1, Math.min(20, x.attrs[g][a] + delta));
      }
    });
  const newAge = /^\d{4}-\d{2}-\d{2}$/.test(d.birthDate) ? ageOn(d.birthDate, career.currentDate) : NaN;
  const c = d.career;
  const k = d.contract;

  return (
    <>
      <section className="panel">
        <div className="season-head">
          <h2>Atribut</h2>
          <span className="small">
            CA sekarang <b>{p.ca}</b> → <b>{ca}</b> · PA <b>{d.pa}</b>
          </span>
        </div>
        <div className="chips">
          <button className="chip" onClick={() => allAttrs(1)}>
            Semua atribut +1
          </button>
          <button className="chip" onClick={() => allAttrs(-1)}>
            Semua atribut −1
          </button>
          <button className="chip" onClick={() => allAttrs('max')}>
            Semua atribut 20
          </button>
        </div>
        <div className="editor-grid mt">
          <Num label="Potensi (PA, 1-200)" value={d.pa} min={1} max={200} onChange={(v) => up((x) => (x.pa = v))} />
        </div>
        {groups.map((g) => (
          <div key={g}>
            <h3 className="mt">{GROUP_LABEL[g]}</h3>
            <div className="editor-grid">
              {Object.entries(d.attrs[g]).map(([a, v]) => (
                <Num key={a} label={a} value={v} min={1} max={20} onChange={(n) => up((x) => (x.attrs[g][a] = n))} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Posisi, peran & tubuh</h2>
        <div className="editor-grid">
          <label className="ed-pick">
            <span>Posisi utama</span>
            <select
              value={d.mainPosition}
              onChange={(e) =>
                up((x) => {
                  const pos = e.target.value as Position;
                  x.mainPosition = pos;
                  if (!POSITION_ROLES[pos].includes(x.preferredRole)) x.preferredRole = bestRoleFor(preview, pos);
                })
              }
            >
              {POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos} ({POSITION_LABEL[pos]})
                </option>
              ))}
            </select>
          </label>
          <label className="ed-pick">
            <span>Peran favorit</span>
            <select value={d.preferredRole} onChange={(e) => up((x) => (x.preferredRole = e.target.value))}>
              {POSITION_ROLES[d.mainPosition].map((id) => (
                <option key={id} value={id}>
                  {ROLES[id].name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <h3 className="mt">Keakraban posisi lain (1-20)</h3>
        <div className="editor-grid">
          {POSITIONS.filter((pos) => pos !== d.mainPosition).map((pos: Position) => (
            <Num key={pos} label={`${pos} (${POSITION_LABEL[pos]})`} value={d.positions[pos] ?? 1} min={1} max={20} onChange={(n) => up((x) => (x.positions[pos] = n))} />
          ))}
        </div>
        <h3 className="mt">Tubuh</h3>
        <div className="editor-grid">
          <Num label="Tinggi (cm)" value={d.heightCm} min={150} max={210} onChange={(n) => up((x) => (x.heightCm = n))} />
          <Num label="Berat (kg)" value={d.weightKg} min={45} max={120} onChange={(n) => up((x) => (x.weightKg = n))} />
          <Num label="Kaki kiri" value={d.leftFoot} min={1} max={20} onChange={(n) => up((x) => (x.leftFoot = n))} />
          <Num label="Kaki kanan" value={d.rightFoot} min={1} max={20} onChange={(n) => up((x) => (x.rightFoot = n))} />
        </div>
        <p className="muted small">Posisi utama ({POSITION_LABEL[d.mainPosition]}) selalu 20.</p>
      </section>

      <section className="panel">
        <h2>Identitas & reputasi</h2>
        <div className="editor-grid">
          <label className="ed-pick">
            <span>Tanggal lahir{Number.isFinite(newAge) ? ` (${newAge} th)` : ''}</span>
            <input type="date" value={d.birthDate} onChange={(e) => up((x) => (x.birthDate = e.target.value))} />
          </label>
          <label className="ed-pick">
            <span>Kewarganegaraan</span>
            <select value={d.nationalityId} onChange={(e) => up((x) => (x.nationalityId = e.target.value))}>
              {countries.map((cn) => (
                <option key={cn.id} value={cn.id}>
                  {flagOf(cn.id)} {cn.name}
                </option>
              ))}
            </select>
          </label>
          <Num label="Reputasi lokal (1-100)" value={d.repHome} min={1} max={100} onChange={(n) => up((x) => (x.repHome = n))} />
          <Num label="Reputasi dunia (1-100)" value={d.repWorld} min={1} max={100} onChange={(n) => up((x) => (x.repWorld = n))} />
        </div>
        <p className="muted small">
          Umur {EDIT_AGE[0]}-{EDIT_AGE[1]} tahun. Ganti nama lewat tombol ✏️ di halaman profil pemain.
        </p>
      </section>

      {c && (
        <section className="panel">
          <h2>Karier</h2>
          <div className="editor-grid">
            <Num label="Uang (€)" value={c.money} step={100} money onChange={(n) => up((x) => (x.career!.money = n))} />
            <Num label="Tabungan (€)" value={c.savings} min={0} step={100} money onChange={(n) => up((x) => (x.career!.savings = n))} />
            <Num label="Stres (0-100)" value={c.stress} min={0} max={100} onChange={(n) => up((x) => (x.career!.stress = n))} />
            <Num label="Kebugaran (0-100)" value={c.fitness} min={0} max={100} onChange={(n) => up((x) => (x.career!.fitness = n))} />
            <Num label="Dukungan keluarga (1-20)" value={c.familySupport} min={1} max={20} onChange={(n) => up((x) => (x.career!.familySupport = n))} />
            <Num
              label="Pemahaman taktik (%)"
              value={c.tactic ?? NaN}
              min={0}
              max={100}
              onChange={(n) => up((x) => (x.career!.tactic = Number.isFinite(n) ? n : null))}
            />
          </div>
          <div className="chips mt">
            <label className="chip">
              <input
                type="checkbox"
                checked={c.healInjury}
                disabled={!career.injury && !career.fragile}
                onChange={(e) => up((x) => (x.career!.healInjury = e.target.checked))}
              />{' '}
              Sembuhkan cedera{career.injury ? ` (${career.injury.name})` : ''}
            </label>
            <label className="chip">
              <input
                type="checkbox"
                checked={c.clearBan}
                disabled={!(career.ban?.club || career.ban?.nat)}
                onChange={(e) => up((x) => (x.career!.clearBan = e.target.checked))}
              />{' '}
              Hapus skorsing
            </label>
          </div>
        </section>
      )}

      {k && (
        <section className="panel">
          <h2>{mine ? 'Kontrak & bonus' : 'Klub & kontrak'}</h2>
          <div className="editor-grid">
            {!mine && (
              <label className="ed-wide">
                <span>Klub</span>
                <select value={k.clubId ?? ''} onChange={(e) => up((x) => (x.contract!.clubId = e.target.value || null))}>
                  <option value="">Tanpa klub (bebas transfer)</option>
                  {leagues.map(({ l, clubs }) => (
                    <optgroup key={l.id} label={`${flagOf(l.countryId)} ${l.name}`}>
                      {clubs.map((cl) => (
                        <option key={cl.id} value={cl.id}>
                          {cl.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            {(mine || k.clubId) && (
              <>
                <Num label="Gaji per minggu (€)" value={k.wage} min={0} step={10} money onChange={(n) => up((x) => (x.contract!.wage = n))} />
                <label className="ed-pick">
                  <span>Habis kontrak</span>
                  <input type="date" value={k.expires} onChange={(e) => up((x) => (x.contract!.expires = e.target.value))} />
                </label>
                <label className="ed-pick">
                  <span>Peran di skuad</span>
                  <select value={k.role} onChange={(e) => up((x) => (x.contract!.role = e.target.value as SquadRole))}>
                    {ROLES_SQUAD.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {mine &&
              BONUS_LABEL.map(([key, label]) => (
                <Num key={key} label={`${label} (€)`} value={k.bonus[key]} min={0} step={10} money onChange={(n) => up((x) => (x.contract!.bonus[key] = n))} />
              ))}
          </div>
          {mine && <p className="muted small">Klubmu sendiri hanya bisa diganti lewat bursa transfer.</p>}
        </section>
      )}

      {note && (
        <p className="tr-note" role="status">
          {note}
        </p>
      )}
      <div className="next-actions">
        <button
          className="primary"
          disabled={!dirty}
          onClick={() => {
            const notes = apply(d);
            const fresh = useGame.getState();
            const after = fresh.idx!.playerById.get(p.id)!;
            setD(draftOf(fresh.career!, after));
            setDirty(false);
            setNote(['Perubahan disimpan.', ...notes].join(' '));
          }}
        >
          Simpan perubahan
        </button>
        <button
          className="ghost"
          disabled={!dirty}
          onClick={() => {
            setD(draftOf(career, p));
            setDirty(false);
          }}
        >
          Batalkan
        </button>
      </div>
    </>
  );
}
