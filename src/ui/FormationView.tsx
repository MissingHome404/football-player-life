// Formasi pelatih: gambar lapangan kecil dengan 11 posisi, susunan utama klub,
// dan panel posisi pemain kita (keakraban, latihan posisi baru).

import { useGame } from './store';
import { shortName } from '../game/gen/names';
import { POSITIONS, POSITION_LABEL, type Position } from '../game/data/attributes';
import { INTENSITY_INFO } from '../game/sim/economy';
import {
  FORMATIONS,
  SLOT_LABEL,
  assignXI,
  bestSpot,
  clubFormation,
  familiarity,
  fitFactor,
  spotFamiliarity,
  type FormationId,
} from '../game/sim/formation';
import type { Club, Player } from '../game/types';

/** Lapangan tegak (gawang sendiri di bawah) dengan titik tiap posisi */
export function FormationPitch({
  formation,
  names,
  mine,
}: {
  formation: FormationId;
  /** nama pemain per indeks tempat */
  names?: Map<number, string>;
  /** indeks tempat pemain kita */
  mine?: number;
}) {
  const spots = FORMATIONS[formation].spots;
  // bingkai tim: x 0..105 (gawang sendiri -> lawan), y 0..68 (kiri -> kanan). Di SVG: atas = lawan.
  const px = (y: number) => y;
  const py = (x: number) => 105 - x * 1.35 - 4;
  return (
    <svg className="fm-pitch" viewBox="-4 -2 76 109" role="img" aria-label={`Formasi ${formation}`}>
      <rect x="0" y="0" width="68" height="105" rx="1.5" className="fm-grass" />
      <line x1="0" y1="52.5" x2="68" y2="52.5" className="fm-line" />
      <circle cx="34" cy="52.5" r="9.15" className="fm-line" fill="none" />
      <rect x="13.85" y="88.5" width="40.3" height="16.5" className="fm-line" fill="none" />
      <rect x="13.85" y="0" width="40.3" height="16.5" className="fm-line" fill="none" />
      {spots.map((s, i) => {
        const cx = px(s.base[1]);
        const cy = py(s.base[0]);
        const me = i === mine;
        // dua pemain berdampingan (mis. duet striker): nama salah satunya ditulis di atas
        const above = spots.some((o, j) => j < i && Math.abs(py(o.base[0]) - cy) < 6 && Math.abs(px(o.base[1]) - cx) < 18);
        return (
          <g key={s.slot} className={me ? 'fm-me' : ''}>
            <circle cx={cx} cy={cy} r={me ? 4.3 : 3.6} className="fm-dot" />
            <text x={cx} y={cy + 1.3} className="fm-pos">
              {SLOT_LABEL[s.slot]}
            </text>
            {names?.get(i) && (
              <text x={cx} y={above ? cy - 5.2 : cy + 8.5} className="fm-name">
                {names.get(i)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Susunan utama klub menurut formasi pelatih (perkiraan dari CA dan posisi) */
export function ClubFormation({ club, squad }: { club: Club; squad: Player[] }) {
  const userId = useGame((s) => s.career?.playerId);
  const f = clubFormation(club);
  const seniors = squad.filter((p) => !p.isYouth);
  const xi = assignXI(seniors, f);
  const names = new Map([...xi].map(([i, p]) => [i, shortName(p)]));
  const mine = [...xi].find(([, p]) => p.id === userId)?.[0];
  return (
    <section className="panel fm-panel">
      <div className="fm-text">
        <h2>Formasi {f}</h2>
        <p className="muted small">{FORMATIONS[f].desc}</p>
        <p className="muted small">
          Susunan utama ini perkiraan dari kemampuan dan posisi pemain. Pemain yang dimainkan di luar posisinya bermain sedikit lebih
          buruk, jadi pelatih lebih memilih pemain yang cocok dengan tempatnya.
        </p>
      </div>
      <FormationPitch formation={f} names={names} mine={mine} />
    </section>
  );
}

/** Keakraban → kata */
const famWord = (f: number) => (f >= 18 ? 'natural' : f >= 15 ? 'akrab' : f >= 11 ? 'cukup akrab' : f >= 7 ? 'canggung' : 'asing');

/** Bagian rencana latihan: posisimu di formasi pelatih dan latihan posisi baru */
export function PositionPlan() {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const setPlan = useGame((s) => s.setPlan);
  const p = idx.playerById.get(career.playerId)!;
  const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
  const f = club ? clubFormation(club) : undefined;
  const spot = f ? FORMATIONS[f].spots[bestSpot(p, f)] : undefined;
  const fam = spot ? spotFamiliarity(p, spot) : 20;
  const learn = career.plan.learnPos ?? null;
  const known = POSITIONS.filter((pos) => pos === p.mainPosition || (p.positions[pos] ?? 0) >= 5).sort(
    (a, b) => familiarity(p, b) - familiarity(p, a),
  );
  const options = POSITIONS.filter((pos) => pos !== p.mainPosition && (pos === 'GK') === (p.mainPosition === 'GK') && familiarity(p, pos) < 20).sort(
    (a, b) => familiarity(p, b) - familiarity(p, a),
  );
  const resting = career.plan.focus === 'istirahat';
  const rate = (0.2 + 0.2) * INTENSITY_INFO[career.plan.intensity].growth; // perkiraan kasar (tanpa angka tersembunyi)
  const weeksLeft = learn ? Math.ceil((20 - familiarity(p, learn)) / rate) : 0;
  return (
    <div className="plan-group">
      <h3>Posisi</h3>
      {f && spot && club ? (
        <div className="fm-mine">
          <FormationPitch formation={f} mine={FORMATIONS[f].spots.indexOf(spot)} />
          <p className="small">
            Pelatih {club.name} memakai <b>{f}</b>. Tempat terbaikmu di formasi ini: <b>{SLOT_LABEL[spot.slot]}</b>{' '}
            <span className="muted">
              (keakraban {fam}/20, {famWord(fam)}, efektivitas {Math.round(fitFactor(fam) * 100)}%)
            </span>
            .{' '}
            {fam < 15
              ? 'Kamu bersaing di posisi yang kurang cocok, jadi peluang main lebih kecil. Latih posisi ini supaya lebih sering dimainkan.'
              : 'Posisimu cocok dengan formasi pelatih.'}
          </p>
        </div>
      ) : (
        <p className="muted small hint">Formasi pelatih berlaku setelah kamu bergabung dengan klub.</p>
      )}
      <p className="small fm-known">
        {known.map((pos) => (
          <span key={pos} className={`fm-chip ${familiarity(p, pos) >= 18 ? 'nat' : ''}`} title={POSITION_LABEL[pos]}>
            {pos} {familiarity(p, pos)}
          </span>
        ))}
      </p>
      <label className="small fm-learn">
        Latih posisi baru:{' '}
        <select value={learn ?? ''} onChange={(e) => setPlan({ learnPos: (e.target.value || null) as Position | null })}>
          <option value="">Tidak</option>
          {options.map((pos) => (
            <option key={pos} value={pos}>
              {POSITION_LABEL[pos]} ({pos}, sekarang {familiarity(p, pos)}/20)
            </option>
          ))}
        </select>
      </label>
      {learn && (
        <p className="muted small hint">
          {resting
            ? 'Tidak ada latihan posisi saat istirahat.'
            : `Sebagian waktu latihan dipakai untuk posisi ini (perkembangan atribut sedikit lebih lambat). Perkiraan dikuasai penuh dalam ±${weeksLeft} minggu; pemain serbabisa belajar lebih cepat.`}
        </p>
      )}
    </div>
  );
}
