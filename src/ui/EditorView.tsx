// Editor in-game (cheat) ala FM: ubah data pemain kita dan kariernya.

import { useState } from 'react';
import { useGame } from './store';
import { PageTitle } from './CareerHome';
import { POSITIONS, POSITION_LABEL, type Position } from '../game/data/attributes';
import { ATTR_GROUPS, draftOf, type AttrGroup, type EditorDraft } from '../game/sim/editor';
import { computeCA } from '../game/gen/player';
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

function Num({ label, value, min, max, step, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label>
      <span>{label}</span>
      <input type="number" value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step ?? 1} onChange={(e) => onChange(e.target.valueAsNumber)} />
    </label>
  );
}

export function EditorView() {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const apply = useGame((s) => s.applyEditor);
  const p = idx.playerById.get(career.playerId)!;
  const [unlocked, setUnlocked] = useState(!!career.edited);
  const [d, setD] = useState<EditorDraft>(() => draftOf(career, p));
  const [note, setNote] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

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
  const isGK = p.mainPosition === 'GK';
  const groups = ATTR_GROUPS.filter((g) => g !== 'goalkeeping' || isGK);
  const allAttrs = (delta: number | 'max') =>
    up((x) => {
      for (const g of ['technical', 'mental', 'physical', 'goalkeeping'] as const) {
        if (g === 'goalkeeping' && !isGK) continue;
        for (const a of Object.keys(x.attrs[g])) x.attrs[g][a] = delta === 'max' ? 20 : Math.max(1, Math.min(20, x.attrs[g][a] + delta));
      }
    });

  if (!unlocked) {
    return (
      <div>
        <PageTitle title="Editor in-game" />
        <section className="panel">
          <p className="editor-warn">
            Editor ini seperti in-game editor di FM: kamu bisa mengubah atribut, potensi, posisi, uang, stres, kebugaran, reputasi, kontrak, dan
            bonus pemainmu sesukamu. Karier yang pernah diedit diberi tanda <b>"Diedit"</b> di halaman ini dan tidak bisa dihapus.
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
      <PageTitle title="Editor in-game" />
      {career.edited && <p className="muted small">Karier ini sudah pernah diedit.</p>}

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
        <h2>Posisi & tubuh</h2>
        <div className="editor-grid">
          {POSITIONS.filter((pos) => pos !== p.mainPosition).map((pos: Position) => (
            <Num key={pos} label={`${pos} (${POSITION_LABEL[pos]})`} value={d.positions[pos] ?? 1} min={1} max={20} onChange={(n) => up((x) => (x.positions[pos] = n))} />
          ))}
          <Num label="Tinggi (cm)" value={d.heightCm} min={150} max={210} onChange={(n) => up((x) => (x.heightCm = n))} />
          <Num label="Berat (kg)" value={d.weightKg} min={45} max={120} onChange={(n) => up((x) => (x.weightKg = n))} />
          <Num label="Kaki kiri" value={d.leftFoot} min={1} max={20} onChange={(n) => up((x) => (x.leftFoot = n))} />
          <Num label="Kaki kanan" value={d.rightFoot} min={1} max={20} onChange={(n) => up((x) => (x.rightFoot = n))} />
        </div>
        <p className="muted small">Posisi utama ({POSITION_LABEL[p.mainPosition]}) selalu 20.</p>
      </section>

      <section className="panel">
        <h2>Karier</h2>
        <div className="editor-grid">
          <Num label="Uang (€)" value={d.money} step={100} onChange={(n) => up((x) => (x.money = n))} />
          <Num label="Tabungan (€)" value={d.savings} min={0} step={100} onChange={(n) => up((x) => (x.savings = n))} />
          <Num label="Stres (0-100)" value={d.stress} min={0} max={100} onChange={(n) => up((x) => (x.stress = n))} />
          <Num label="Kebugaran (0-100)" value={d.fitness} min={0} max={100} onChange={(n) => up((x) => (x.fitness = n))} />
          <Num label="Reputasi lokal (1-100)" value={d.repHome} min={1} max={100} onChange={(n) => up((x) => (x.repHome = n))} />
          <Num label="Reputasi dunia (1-100)" value={d.repWorld} min={1} max={100} onChange={(n) => up((x) => (x.repWorld = n))} />
          <Num label="Dukungan keluarga (1-20)" value={d.familySupport} min={1} max={20} onChange={(n) => up((x) => (x.familySupport = n))} />
          <Num
            label="Pemahaman taktik (%)"
            value={d.tactic ?? NaN}
            min={0}
            max={100}
            onChange={(n) => up((x) => (x.tactic = Number.isFinite(n) ? n : null))}
          />
        </div>
        <div className="chips mt">
          <label className="chip">
            <input type="checkbox" checked={d.healInjury} disabled={!career.injury && !career.fragile} onChange={(e) => up((x) => (x.healInjury = e.target.checked))} />{' '}
            Sembuhkan cedera{career.injury ? ` (${career.injury.name})` : ''}
          </label>
          <label className="chip">
            <input
              type="checkbox"
              checked={d.clearBan}
              disabled={!(career.ban?.club || career.ban?.nat)}
              onChange={(e) => up((x) => (x.clearBan = e.target.checked))}
            />{' '}
            Hapus skorsing
          </label>
        </div>
      </section>

      {d.contract && (
        <section className="panel">
          <h2>Kontrak & bonus</h2>
          <div className="editor-grid">
            <Num label="Gaji per minggu (€)" value={d.contract.wage} min={0} step={10} onChange={(n) => up((x) => (x.contract!.wage = n))} />
            <label>
              <span>Habis kontrak</span>
              <input type="date" value={d.contract.expires} onChange={(e) => up((x) => (x.contract!.expires = e.target.value))} />
            </label>
            <label>
              <span>Peran dijanjikan</span>
              <select value={d.contract.role} onChange={(e) => up((x) => (x.contract!.role = e.target.value as SquadRole))}>
                {ROLES_SQUAD.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            {BONUS_LABEL.map(([k, label]) => (
              <Num key={k} label={`${label} (€)`} value={d.contract!.bonus[k]} min={0} step={10} onChange={(n) => up((x) => (x.contract!.bonus[k] = n))} />
            ))}
          </div>
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
            const me = fresh.idx!.playerById.get(fresh.career!.playerId)!;
            setD(draftOf(fresh.career!, me));
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
    </div>
  );
}
