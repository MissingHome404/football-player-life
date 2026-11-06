// Taktik pelatih: gambar lapangan kecil dengan 11 posisi (peran + tugas dari pelatih), instruksi tim,
// intensitas, dan panel posisi pemain kita (peran di taktik, pemahaman taktik, latihan posisi baru).

import { useGame } from './store';
import { shortName } from '../game/gen/names';
import { POSITIONS, POSITION_LABEL, type Position } from '../game/data/attributes';
import { INTENSITY_INFO } from '../game/sim/economy';
import {
  FORMATIONS,
  SLOT_LABEL,
  assignXI,
  bestSpot,
  familiarity,
  fitFactor,
  spotFamiliarity,
  type FormationId,
} from '../game/sim/formation';
import { ROLES } from '../game/data/roles';
import {
  DUTY_LABEL,
  STYLE_LABEL,
  clubTactic,
  mentalityLabel,
  roleDutyLabel,
  tacticInstructions,
  tacticIntensity,
  type TacticSlot,
} from '../game/sim/tactics';
import { clubKey, tacticFam } from '../game/sim/understanding';
import type { Club, Player } from '../game/types';

/** Bar 0..1 sederhana (warna: hijau baik, kuning sedang, merah buruk) */
function Bar({ value, invert }: { value: number; invert?: boolean }) {
  const pct = Math.round(value * 100);
  const bad = invert ? pct : 100 - pct;
  return (
    <div className="stress" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className={`stress-fill ${bad >= 70 ? 'hi' : bad >= 40 ? 'mid' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Pemahaman taktik → kata */
const understandWord = (f: number) => (f >= 0.9 ? 'sangat paham' : f >= 0.65 ? 'paham' : f >= 0.45 ? 'mulai paham' : 'masih belajar');
/** Intensitas taktik → kata */
const intensityWord = (v: number) => (v >= 0.75 ? 'sangat tinggi' : v >= 0.55 ? 'tinggi' : v >= 0.35 ? 'sedang' : 'rendah');

/** Lapangan tegak (gawang sendiri di bawah) dengan titik tiap posisi */
export function FormationPitch({
  formation,
  names,
  mine,
  roles,
}: {
  formation: FormationId;
  /** nama pemain per indeks tempat */
  names?: Map<number, string>;
  /** indeks tempat pemain kita */
  mine?: number;
  /** peran + tugas dari pelatih per indeks tempat */
  roles?: readonly TacticSlot[];
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
        const r = roles?.[i];
        return (
          <g key={s.slot} className={`${me ? 'fm-me' : ''} ${r ? `fm-${r.duty}` : ''}`}>
            {r && <title>{roleDutyLabel(r)}</title>}
            <circle cx={cx} cy={cy} r={me ? 4.3 : 3.6} className="fm-dot" />
            <text x={cx} y={cy + 1.3} className="fm-pos">
              {SLOT_LABEL[s.slot]}
            </text>
            {r && (
              <text x={cx} y={cy + 6.4} className="fm-role">
                {ROLES[r.role]?.short ?? r.role}-{r.duty}
              </text>
            )}
            {names?.get(i) && (
              <text x={cx} y={above ? cy - 5.2 : cy + (r ? 9.9 : 8.5)} className="fm-name">
                {names.get(i)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Taktik pelatih klub: peran + tugas tiap tempat, instruksi tim, intensitas, dan susunan utama (perkiraan) */
export function ClubTactic({ club, squad }: { club: Club; squad: Player[] }) {
  const career = useGame((s) => s.career);
  const userId = career?.playerId;
  const t = clubTactic(club);
  const f = t.formation;
  const seniors = squad.filter((p) => !p.isYouth);
  const xi = assignXI(seniors, f);
  const names = new Map([...xi].map(([i, p]) => [i, shortName(p)]));
  const mine = [...xi].find(([, p]) => p.id === userId)?.[0];
  const me = userId ? seniors.find((p) => p.id === userId) : undefined;
  const fam = me && career ? tacticFam(career, clubKey(club), me) : undefined;
  const ins = tacticInstructions(t);
  const inten = tacticIntensity(t);
  const groups: [string, string[]][] = [
    ['Saat menguasai bola', ins.possession],
    ['Transisi', ins.transition],
    ['Saat tidak menguasai bola', ins.defence],
  ];
  return (
    <section className="panel fm-panel">
      <div className="fm-text">
        <h2>Taktik pelatih: {t.name}</h2>
        <p className="muted small">
          {STYLE_LABEL[t.style]} · Formasi {f} · Mentalitas {mentalityLabel(t.mentality).toLowerCase()}
        </p>
        {groups.map(([label, list]) => (
          <div key={label} className="tac-group">
            <h3>{label}</h3>
            <div className="traits">
              {list.length ? (
                list.map((x) => (
                  <span key={x} className="trait">
                    {x}
                  </span>
                ))
              ) : (
                <span className="muted small">Bawaan (tanpa instruksi khusus)</span>
              )}
            </div>
          </div>
        ))}
        <div className="tac-meters">
          <div>
            <span className="small">
              Intensitas taktik: <b>{intensityWord(inten)}</b>
            </span>
            <Bar value={inten} invert />
            <span className="muted small">Makin tinggi, makin cepat kebugaran pemain turun (stamina & natural fitness menahannya).</span>
          </div>
          {fam !== undefined && (
            <div>
              <span className="small">
                Pemahaman taktikmu: <b>{Math.round(fam * 100)}%</b> ({understandWord(fam)})
              </span>
              <Bar value={fam} />
            </div>
          )}
        </div>
        <p className="muted small">
          Setiap pemain wajib memainkan peran dan tugas yang diminta pelatih untuk tempatnya, bukan peran favoritnya. Warna titik:{' '}
          <span className="duty-De">{DUTY_LABEL.De.toLowerCase()}</span>, <span className="duty-Su">{DUTY_LABEL.Su.toLowerCase()}</span>,{' '}
          <span className="duty-At">{DUTY_LABEL.At.toLowerCase()}</span>. Susunan utama ini perkiraan dari kemampuan dan posisi pemain.
        </p>
      </div>
      <FormationPitch formation={f} names={names} mine={mine} roles={t.slots} />
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
  const tactic = club ? clubTactic(club) : undefined;
  const f = tactic?.formation;
  const si = f ? bestSpot(p, f) : -1;
  const spot = f ? FORMATIONS[f].spots[si] : undefined;
  const slotRole = tactic && si >= 0 ? tactic.slots[si] : undefined;
  const tf = club ? tacticFam(career, clubKey(club), p) : undefined;
  const inten = tactic ? tacticIntensity(tactic) : undefined;
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
          {slotRole && (
            <div className="small tac-mine">
              <p>
                Peranmu di taktik pelatih: <b>{roleDutyLabel(slotRole)}</b>.{' '}
                {slotRole.role !== p.preferredRole && (
                  <span className="muted">
                    Peran favoritmu {ROLES[p.preferredRole]?.name}, tapi di laga kamu wajib bermain sesuai permintaan pelatih.
                  </span>
                )}
              </p>
              {tf !== undefined && (
                <>
                  <span>
                    Pemahaman taktik: <b>{Math.round(tf * 100)}%</b> ({understandWord(tf)})
                  </span>
                  <Bar value={tf} />
                  <p className="muted">
                    {tf < 0.9
                      ? 'Makin paham, makin tepat posisimu dan makin cepat kamu membaca permainan. Naik tiap minggu latihan dan tiap laga; fokus latihan Taktik mempercepatnya.'
                      : 'Kamu sudah menguasai taktik pelatih.'}
                  </p>
                </>
              )}
              {inten !== undefined && (
                <p className="muted">
                  Intensitas taktik {intensityWord(inten)} ({Math.round(inten * 100)}%):{' '}
                  {inten >= 0.55 ? 'kebugaranmu turun lebih cepat setelah laga.' : 'tidak terlalu menguras kebugaran.'}
                </p>
              )}
            </div>
          )}
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
