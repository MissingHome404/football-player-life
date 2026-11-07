// Halaman Latihan individu ala FM: nilai latihan, posisi & peran latihan, fokus tambahan,
// intensitas, kaki lemah, beban latihan, atribut (sorotan peran + panah naik/turun),
// laporan pelatih, laporan latihan, dan laporan medis.

import { useState } from 'react';
import { useGame } from './store';
import { PageTitle } from './CareerHome';
import { AttrValue } from './components';
import { GOALKEEPING, MENTAL, PHYSICAL, POSITIONS, POSITION_LABEL, TECHNICAL, type Position } from '../game/data/attributes';
import { ROLES } from '../game/data/roles';
import { familiarity } from '../game/sim/formation';
import { INTENSITY_INFO } from '../game/sim/economy';
import { roleChoices, rolePosition, trainingRole } from '../game/sim/training';
import {
  WORKLOAD_LABEL,
  avgRating,
  coachReport,
  extras,
  focusOptions,
  matchSharpness,
  ratingWord,
  riskLabel,
  sharpWord,
  trainingInjuryChance,
  trainingReport,
  trendOf,
  weakSide,
  workload,
} from '../game/sim/individual';
import { PLAY_TRAITS, playTraits } from '../game/sim/traits';
import type { Intensity, Player } from '../game/types';

/** Letak tiap posisi di lapangan tegak 68x105 (gawang sendiri di bawah) */
const POS_XY: Record<Position, [number, number]> = {
  GK: [34, 97],
  DL: [9, 82],
  DC: [34, 84],
  DR: [59, 82],
  WBL: [7, 67],
  DM: [34, 69],
  WBR: [61, 67],
  ML: [9, 51],
  MC: [34, 53],
  MR: [59, 51],
  AML: [11, 31],
  AMC: [34, 35],
  AMR: [57, 31],
  ST: [34, 16],
};

const UNIT_OF = (pos: Position) =>
  pos === 'GK' ? 'Kiper' : ['DC', 'DL', 'DR', 'WBL', 'WBR'].includes(pos) ? 'Bertahan' : ['ST', 'AML', 'AMR', 'AMC'].includes(pos) ? 'Menyerang' : 'Gelandang';

const LOWER_IS_BETTER = new Set(['Injury Proneness']);

function RatingBars({ ratings }: { ratings: number[] }) {
  // terbaru di kanan
  const list = [...ratings].reverse();
  return (
    <div className="it-bars" aria-label="Nilai latihan 12 minggu terakhir">
      {list.map((r, i) => (
        <span key={i} title={r.toFixed(2)} className={r >= 7.5 ? 'hi' : r >= 6.5 ? 'mid' : 'lo'} style={{ height: `${Math.max(8, (r / 10) * 100)}%` }} />
      ))}
    </div>
  );
}

function TrainingPitch({ p, current, onPick }: { p: Player; current: Position; onPick: (pos: Position) => void }) {
  return (
    <svg className="fm-pitch it-pitch" viewBox="-2 -2 72 109" role="group" aria-label="Pilih posisi latihan">
      <rect x="0" y="0" width="68" height="105" rx="1.5" className="fm-grass" />
      <line x1="0" y1="52.5" x2="68" y2="52.5" className="fm-line" />
      <circle cx="34" cy="52.5" r="9.15" className="fm-line" />
      <rect x="13.85" y="88.5" width="40.3" height="16.5" className="fm-line" />
      <rect x="13.85" y="0" width="40.3" height="16.5" className="fm-line" />
      {POSITIONS.map((pos) => {
        const [x, y] = POS_XY[pos];
        const fam = familiarity(p, pos);
        const ok = (pos === 'GK') === (p.mainPosition === 'GK');
        const cls = pos === current ? 'cur' : fam >= 18 ? 'nat' : fam >= 10 ? 'mid' : 'low';
        return (
          <g
            key={pos}
            className={`it-pos ${cls} ${ok ? '' : 'off'}`}
            onClick={() => ok && onPick(pos)}
            role="button"
            tabIndex={ok ? 0 : -1}
            aria-label={`${POSITION_LABEL[pos]}, keakraban ${fam}`}
            onKeyDown={(e) => ok && (e.key === 'Enter' || e.key === ' ') && onPick(pos)}
          >
            <title>{`${POSITION_LABEL[pos]} · keakraban ${fam}/20`}</title>
            {pos === current && <circle cx={x} cy={y} r={6.6} className="it-ring" />}
            <circle cx={x} cy={y} r={5} className="it-dot" />
            <text x={x} y={y + 1.1} className="it-lbl">
              {pos}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function TrainingView() {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const setPlan = useGame((s) => s.setPlan);
  const [tab, setTab] = useState<'attrs' | 'coach'>('attrs');
  const p = idx.playerById.get(career.playerId)!;
  const plan = career.plan;
  const pos = rolePosition(career, p);
  const role = trainingRole(career, p);
  const r = ROLES[role];
  const key = new Set<string>(r.key);
  const pref = new Set<string>(r.pref);
  const trend = trendOf(career);
  const log = career.trainingLog ?? [];
  const last = log[0];
  const avg = avgRating(career, 4);
  const prevAvg = avgRating({ ...career, trainingLog: log.slice(1) }, 4);
  const wl = workload(career, p);
  const side = weakSide(p);
  const rep = coachReport(career, p);
  const risk = trainingInjuryChance(career, p);
  const sharp = matchSharpness(career);
  const resting = plan.focus === 'istirahat';
  const isGK = p.mainPosition === 'GK';
  const values: Record<string, number> = { ...p.technical, ...p.mental, ...p.physical, ...p.goalkeeping };
  const traits = playTraits(p);

  const pickPos = (x: Position) => {
    // posisi utama = berhenti latihan posisi; posisi lain = latih (atau latih peran di posisi itu)
    setPlan({ learnPos: x === p.mainPosition ? null : x, trainRole: null });
  };

  const col = (title: string, keys: readonly string[]) => (
    <div className="attr-block">
      <h3>{title}</h3>
      {keys.map((a) => {
        const prog = Math.min(0.99, Math.max(0, career.progress[a] ?? 0));
        const t = trend[a];
        return (
          <div
            key={a}
            className={`attr-row ${key.has(a) ? 'hl-key' : pref.has(a) ? 'hl-pref' : ''} ${plan.extraFocus === a ? 'it-focus' : ''}`}
            title={`Progres ke poin berikutnya: ${Math.round(prog * 100)}%`}
          >
            <span>
              {a}
              {plan.extraFocus === a && <span className="it-star"> ★</span>}
            </span>
            <span className="attr-cell">
              {t ? <span className={t > 0 ? 'attr-up' : 'attr-down'}>{t > 0 ? '▲' : '▼'}</span> : null}
              <AttrValue v={values[a]} invert={LOWER_IS_BETTER.has(a)} />
            </span>
            <span className="it-prog" style={{ width: `${Math.round(prog * 100)}%` }} />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="itrain">
      <PageTitle title="Latihan individu" sub="Atur latihan pribadimu di luar latihan tim" />

      <section className="panel it-head">
        <div className="it-rating">
          <span className="muted small">NILAI LATIHAN</span>
          <b className="it-big">
            {last ? last.rating.toFixed(2) : '–'}
            {last && log[1] && (
              <span className={last.rating >= log[1].rating ? 'attr-up' : 'attr-down'}> {last.rating >= log[1].rating ? '▲' : '▼'}</span>
            )}
          </b>
        </div>
        <p className="small it-sum">
          {avg === null
            ? 'Nilai latihan muncul setelah minggu pertama latihan.'
            : `Rata-rata 4 minggu terakhir ${avg.toFixed(2)}: tampil ${ratingWord(avg)} di latihan${prevAvg !== null && log.length > 4 ? (avg >= prevAvg ? ', sedang naik' : ', sedang turun') : ''}. `}
          <span className="muted">
            Nilai latihan tergantung profesionalisme, determinasi, kerja keras, intensitas, stres, kebugaran, dan pelatih pribadimu. Nilai tinggi =
            latihan lebih efektif; rata-rata sangat bagus/buruk bisa membuat pelatih memuji atau mengkritikmu.
          </span>
        </p>
        {log.length > 1 && <RatingBars ratings={log.slice(0, 12).map((e) => e.rating)} />}
      </section>

      <div className="it-grid">
        <section className="panel it-setup">
          <h3>Posisi latihan</h3>
          <TrainingPitch p={p} current={pos} onPick={pickPos} />
          <p className="small center">
            <b>{POSITION_LABEL[pos]}</b>
            <span className="muted"> · keakraban {familiarity(p, pos)}/20</span>
          </p>
          <p className="muted small center">
            {pos === p.mainPosition ? 'Posisi utamamu. Klik posisi lain untuk berlatih di sana.' : familiarity(p, pos) >= 20 ? 'Posisi ini sudah kamu kuasai; kamu melatih perannya.' : 'Sedang belajar posisi ini (latihan atribut sedikit melambat).'}
          </p>

          <h3>Unit latihan</h3>
          <p className="it-unit">{UNIT_OF(pos)}</p>

          <h3>Peran</h3>
          <select value={role} onChange={(e) => setPlan({ trainRole: e.target.value })} aria-label="Peran latihan">
            {roleChoices(career, p).map((id) => (
              <option key={id} value={id}>
                {ROLES[id].name}
                {id === p.preferredRole ? ' ♥' : ''}
              </option>
            ))}
          </select>
          <p className="muted small">{r.desc}</p>

          <h3>Fokus tambahan</h3>
          <select value={plan.extraFocus ?? ''} onChange={(e) => setPlan({ extraFocus: e.target.value || null })} aria-label="Fokus tambahan">
            <option value="">Tidak ada</option>
            {(
              [
                ['Technical', TECHNICAL],
                ['Mental', MENTAL],
                ['Physical', PHYSICAL],
                ...(isGK ? [['Goalkeeping', GOALKEEPING]] : []),
              ] as [string, readonly string[]][]
            ).map(([g, list]) => (
              <optgroup key={g} label={g}>
                {list
                  .filter((a) => focusOptions(p).includes(a))
                  .map((a) => (
                    <option key={a} value={a} disabled={values[a] >= 20}>
                      {a} ({values[a]})
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <p className="muted small">Satu atribut mendapat porsi latihan jauh lebih besar. Menambah beban latihan.</p>

          <h3>Intensitas</h3>
          <div className="chips" role="group" aria-label="Intensitas latihan">
            {(Object.keys(INTENSITY_INFO) as Intensity[]).map((k) => (
              <button key={k} className={`chip ${plan.intensity === k ? 'sel' : ''}`} aria-pressed={plan.intensity === k} disabled={resting} onClick={() => setPlan({ intensity: k })}>
                {INTENSITY_INFO[k].label}
              </button>
            ))}
          </div>

          <h3>Latihan kaki lemah</h3>
          {side ? (
            <button className={`chip ${plan.weakFoot ? 'sel' : ''}`} aria-pressed={!!plan.weakFoot} onClick={() => setPlan({ weakFoot: !plan.weakFoot })}>
              {plan.weakFoot ? 'Berhenti' : 'Mulai'} kembangkan kaki {side === 'leftFoot' ? 'kiri' : 'kanan'} ({p[side]}/20)
            </button>
          ) : (
            <p className="muted small">Kedua kakimu sudah sama kuat.</p>
          )}
          {side && (
            <p className="muted small">
              Kaki kiri {p.leftFoot} · kaki kanan {p.rightFoot}. Butuh waktu berbulan-bulan, lebih cepat saat masih muda.
            </p>
          )}

          <h3>Beban latihan individu</h3>
          <p className="it-unit">{WORKLOAD_LABEL[wl]}</p>
          <div className="stress" role="meter" aria-valuemin={0} aria-valuemax={4} aria-valuenow={wl}>
            <div className={`stress-fill ${wl >= 4 ? 'hi' : wl >= 3 ? 'mid' : ''}`} style={{ width: `${(wl / 4) * 100}%` }} />
          </div>
          <p className="muted small">
            {extras(career, p).length ? `Tambahan: ${extras(career, p).join(', ')}. Tiap tambahan menguras kebugaran dan sedikit menaikkan risiko cedera.` : 'Tanpa latihan tambahan.'}
          </p>
          {resting && <p className="small warn">Fokus latihan minggu ini Istirahat, jadi latihan individu juga libur.</p>}
          {career.injury && <p className="small warn">Kamu cedera, latihan individu menunggu sampai pulih.</p>}
        </section>

        <section className="panel it-attrs">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'attrs'} className={tab === 'attrs' ? 'sel' : ''} onClick={() => setTab('attrs')}>
              Atribut
            </button>
            <button role="tab" aria-selected={tab === 'coach'} className={tab === 'coach' ? 'sel' : ''} onClick={() => setTab('coach')}>
              Laporan pelatih
            </button>
          </div>
          {tab === 'attrs' ? (
            <>
              <div className="it-cols">
                {col(isGK ? 'Goalkeeping' : 'Technical', isGK ? GOALKEEPING : TECHNICAL)}
                {col('Mental', MENTAL)}
                <div>
                  {col('Physical', PHYSICAL)}
                  <div className="attr-block">
                    <h3>Kebiasaan bermain</h3>
                    {traits.length ? (
                      traits.map((id) => (
                        <div key={id} className="small it-trait" title={PLAY_TRAITS[id]?.desc}>
                          {PLAY_TRAITS[id]?.name ?? id}
                        </div>
                      ))
                    ) : (
                      <div className="muted small">Belum ada</div>
                    )}
                  </div>
                </div>
              </div>
              <p className="muted small">
                <span className="lg lg-key">kunci</span> <span className="lg lg-pref">pendukung</span> peran {r.name}. ▲▼ berubah dalam 8 minggu
                terakhir. ★ fokus tambahan. Garis tipis di bawah atribut = progres menuju poin berikutnya.
              </p>
            </>
          ) : (
            <div className="it-coach small">
              <p>
                Kecocokan dengan peran <b>{r.name}</b>: <b>{rep.fit.toFixed(1)}</b>/20.
              </p>
              <p>
                <span className="muted">Kekuatan:</span> {rep.strengths.map((a) => `${a} (${values[a]})`).join(', ')}
              </p>
              <p>
                <span className="muted">Perlu ditingkatkan:</span> {rep.weaknesses.map((a) => `${a} (${values[a]})`).join(', ') || '-'}
              </p>
              <p>
                <span className="muted">Peran paling cocok di posisi {pos}:</span>{' '}
                {rep.best.map(([id, v], i) => (
                  <span key={id}>
                    {i > 0 && ', '}
                    <button className="link" onClick={() => setPlan({ trainRole: id })}>
                      {ROLES[id].name}
                    </button>{' '}
                    ({v.toFixed(1)})
                  </span>
                ))}
              </p>
              {rep.suggest && plan.extraFocus !== rep.suggest && (
                <p>
                  Saran pelatih: fokus tambahan <b>{rep.suggest}</b>.{' '}
                  <button className="chip" onClick={() => setPlan({ extraFocus: rep.suggest })}>
                    Jadikan fokus tambahan
                  </button>
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="it-grid2">
        <section className="panel">
          <h3>Laporan latihan</h3>
          <ul className="it-report small">
            {trainingReport(career, p).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h3>Laporan medis</h3>
          <dl className="offer-grid small">
            <dt>Kondisi fisik</dt>
            <dd>{career.injury ? `Cedera: ${career.injury.name} (${career.injury.weeksLeft} mg lagi)` : `${Math.round(career.fitness)}% bugar`}</dd>
            <dt>Ketajaman bertanding</dt>
            <dd>{sharpWord(sharp)}</dd>
            <dt>Beban latihan</dt>
            <dd>{WORKLOAD_LABEL[wl]}</dd>
            <dt>Risiko cedera latihan</dt>
            <dd>{career.injury || resting ? '-' : `${riskLabel(risk)} (±${(risk * 100).toFixed(1)}% minggu ini)`}</dd>
            {career.fragile && (
              <>
                <dt>Masa rawan</dt>
                <dd>Baru pulih dari cedera {career.fragile.part}, {career.fragile.weeks} mg lagi</dd>
              </>
            )}
          </dl>
        </section>
      </div>
    </div>
  );
}
