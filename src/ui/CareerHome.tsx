// Beranda karier: status hidup, rencana minggu ini, inbox, dan laporan minggu lalu.

import { useState, type ReactNode } from 'react';
import { useGame } from './store';
import { Stars, caStars, money } from './components';
import { ORIGIN_INFO, FAMILY_INFO } from '../game/gen/character';
import { ageOn } from '../game/gen/player';
import {
  ACTIVITY_INFO,
  COACH_INFO,
  FOCUS_INFO,
  INTENSITY_INFO,
  econOf,
  weeklyBudget,
} from '../game/sim/economy';
import { pendingChoices, stressTarget } from '../game/sim/week';
import type { Activity, CoachKind, Intensity, Message, TrainingFocus } from '../game/types';

const fmtDate = (d: string, long = false) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('id-ID', {
    day: 'numeric',
    month: long ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const fitLabel = (v: number) => (v >= 75 ? 'segar' : v >= 50 ? 'cukup' : v >= 30 ? 'lelah' : 'sangat lelah');

const signed = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + money(Math.abs(v));

function Meter({ value, invert }: { value: number; invert?: boolean }) {
  // invert: makin tinggi makin buruk (stres)
  const bad = invert ? value : 100 - value;
  return (
    <div className="stress" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <div className={`stress-fill ${bad >= 70 ? 'hi' : bad >= 40 ? 'mid' : ''}`} style={{ width: `${value}%` }} />
    </div>
  );
}

export function CareerHome({ children }: { children: ReactNode }) {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const p = idx.playerById.get(career.playerId)!;
  const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
  const stress = stressTarget(career, p);

  return (
    <div className="home">
      <section className="panel life">
        <div className="life-item">
          <div className="muted small">Tanggal · minggu ke-{career.week + 1}</div>
          <b>{fmtDate(career.currentDate, true)}</b>
          <div className="muted small">Umur {ageOn(p.birthDate, career.currentDate)} tahun</div>
        </div>
        <div className="life-item">
          <div className="muted small">Uang</div>
          <b className={career.money < 0 ? 'loss' : ''}>{signed(career.money).replace(/^\+/, '')}</b>
        </div>
        <div className="life-item">
          <div className="muted small">Stres</div>
          <Meter value={career.stress} invert />
          <span className="muted small">
            {career.stress} / 100 · menuju ≈{stress.target}
          </span>
        </div>
        <div className="life-item">
          <div className="muted small">Kebugaran</div>
          <Meter value={career.fitness} />
          <span className="muted small">
            {career.injury ? (
              <span className="loss">
                Cedera: {career.injury.name} ({career.injury.weeksLeft} mg lagi)
              </span>
            ) : (
              `${career.fitness} / 100 · ${fitLabel(career.fitness)}`
            )}
          </span>
        </div>
        <div className="life-item">
          <div className="muted small">Tim sekarang</div>
          {club ? (
            <button className="link" onClick={() => go({ kind: 'club', clubId: club.id })}>
              {club.name}
            </button>
          ) : (
            <b>{career.teamLabel}</b>
          )}
          <div className="muted small">
            {p.contract ? (p.isYouth ? 'Akademi / U19' : `Skuad senior · ${p.contract.role}`) : 'Amatir, belum dikontrak'}
          </div>
        </div>
        <div className="life-item">
          <div className="muted small">Asal · Keluarga</div>
          <b>
            {ORIGIN_INFO[career.origin].label} · {FAMILY_INFO[career.family.wealth].label}
          </b>
          <div className="muted small">Dukungan keluarga {career.family.support}/20</div>
        </div>
      </section>

      <div className="home-grid">
        <PlanPanel />
        <div className="home-side">
          <Inbox />
          <ReportPanel />
        </div>
      </div>

      <h2 className="section-title">Profil pemain</h2>
      {children}
    </div>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
  label: string;
  disabled?: (v: T) => boolean;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          className={`chip ${value === v ? 'sel' : ''}`}
          aria-pressed={value === v}
          disabled={disabled?.(v)}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function PlanPanel() {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const setPlan = useGame((s) => s.setPlan);
  const nextWeek = useGame((s) => s.nextWeek);
  const p = idx.playerById.get(career.playerId)!;
  const plan = career.plan;
  const econ = econOf(p.nationalityId);
  const budget = weeklyBudget(career, p);
  const stress = stressTarget(career, p);
  const pending = pendingChoices(career).length;
  const hasWage = !!p.contract?.wagePerWeek;
  const resting = plan.focus === 'istirahat';
  const [showStress, setShowStress] = useState(false);

  const lines: [string, number][] = (
    [
      ['Uang saku keluarga', budget.allowance],
      ['Gaji klub', budget.wage],
      ['Kerja sampingan', budget.activity < 0 ? -budget.activity : 0],
      ['Pajak gaji (30%)', -budget.tax],
      ['Biaya hidup', -budget.living],
      ['Pelatih pribadi', -budget.coaches],
      [ACTIVITY_INFO[plan.activity].label, budget.activity > 0 ? -budget.activity : 0],
    ] as [string, number][]
  ).filter(([, v]) => v !== 0);

  return (
    <section className="panel plan">
      <h2>Rencana minggu ini</h2>

      <div className="plan-group">
        <h3>Fokus latihan</h3>
        <Chips<TrainingFocus>
          label="Fokus latihan"
          options={(Object.keys(FOCUS_INFO) as TrainingFocus[]).map((k) => [k, FOCUS_INFO[k].label])}
          value={plan.focus}
          onChange={(focus) => setPlan({ focus })}
        />
        <p className="muted small hint">
          {FOCUS_INFO[plan.focus].desc}
          {career.injury && ' Kamu sedang cedera, jadi tidak bisa berlatih sampai pulih.'}
        </p>
      </div>

      <div className="plan-group">
        <h3>Intensitas</h3>
        <Chips<Intensity>
          label="Intensitas latihan"
          options={(Object.keys(INTENSITY_INFO) as Intensity[]).map((k) => [k, INTENSITY_INFO[k].label])}
          value={plan.intensity}
          onChange={(intensity) => setPlan({ intensity })}
          disabled={() => resting}
        />
        <p className="muted small hint">
          {resting
            ? 'Tidak berlatih minggu ini.'
            : {
                ringan: 'Perkembangan lebih lambat, badan lebih segar, risiko cedera kecil.',
                normal: 'Seimbang antara perkembangan dan kebugaran.',
                berat: 'Perkembangan lebih cepat, tapi capek, stres naik, dan risiko cedera dua kali lipat.',
              }[plan.intensity]}
        </p>
      </div>

      <div className="plan-group">
        <h3>Di luar latihan</h3>
        <Chips<Activity>
          label="Kegiatan di luar latihan"
          options={(Object.keys(ACTIVITY_INFO) as Activity[]).map((k) => [k, ACTIVITY_INFO[k].label])}
          value={plan.activity}
          onChange={(activity) => setPlan({ activity })}
          disabled={(v) => v === 'kerja' && hasWage}
        />
        <p className="muted small hint">
          {ACTIVITY_INFO[plan.activity].desc}
          {ACTIVITY_INFO[plan.activity].cost > 0 && ` Biaya ${money(ACTIVITY_INFO[plan.activity].cost * econ)}.`}
          {plan.activity === 'kerja' && !hasWage && ` Dapat ${money(-ACTIVITY_INFO.kerja.cost * econ)}.`}
        </p>
      </div>

      <div className="plan-group">
        <h3>Pelatih pribadi</h3>
        <div className="coach-list">
          {(Object.keys(COACH_INFO) as CoachKind[]).map((k) => (
            <label key={k} className={`coach ${plan.coaches[k] ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={plan.coaches[k]}
                onChange={(e) => setPlan({ coaches: { ...plan.coaches, [k]: e.target.checked } })}
              />
              <span>
                <b>{COACH_INFO[k].label}</b>
                <span className="muted small"> · {money(COACH_INFO[k].cost * econ)}/mg</span>
                <br />
                <span className="muted small">{COACH_INFO[k].desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="plan-group">
        <h3>Uang minggu ini</h3>
        <table className="budget">
          <tbody>
            {lines.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td className={`num ${v < 0 ? 'loss' : 'gain'}`}>{signed(v)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Total</td>
              <td className={`num ${budget.net < 0 ? 'loss' : 'gain'}`}>{signed(budget.net)}</td>
            </tr>
          </tbody>
        </table>
        {career.money + budget.net < 0 && (
          <p className="small loss">Uangmu tidak cukup. Pelatih pribadi dan kegiatan berbayar akan dibatalkan otomatis.</p>
        )}
      </div>

      <div className="plan-group">
        <button className="link stress-toggle" aria-expanded={showStress} onClick={() => setShowStress(!showStress)}>
          Arah stres dengan rencana ini: ≈{stress.target} {showStress ? '▴' : '▾'}
        </button>
        {showStress && (
          <table className="budget">
            <tbody>
              {stress.parts.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className={`num ${v > 0 ? 'loss' : 'gain'}`}>{v > 0 ? `+${v}` : v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="next-box">
        {pending > 0 && <p className="small warn">Jawab dulu {pending} pesan di inbox sebelum lanjut.</p>}
        <div className="next-actions">
          <button className="primary" disabled={pending > 0} onClick={() => nextWeek(1)}>
            Lanjut minggu ▶
          </button>
          <button
            className="ghost"
            disabled={pending > 0}
            onClick={() => nextWeek(4)}
            title="Berhenti lebih awal kalau ada pesan yang perlu dijawab atau kamu cedera"
          >
            Lanjut 4 minggu ⏩
          </button>
        </div>
      </div>
    </section>
  );
}

function MessageCard({ m, isNew }: { m: Message; isNew: boolean }) {
  const choose = useGame((s) => s.choose);
  const pending = !!m.choices?.length && m.chosen === undefined;
  return (
    <article className={`msg ${pending ? 'pending' : ''}`}>
      <header className="msg-head">
        <b>{m.title}</b>
        {pending ? <span className="pill warn-pill">Perlu jawaban</span> : isNew && <span className="pill ok">Baru</span>}
      </header>
      <div className="muted small">
        {m.from} · {fmtDate(m.date)}
      </div>
      <p className="msg-body">{m.body}</p>
      {pending && (
        <div className="msg-choices">
          {m.choices!.map((c, i) => (
            <button key={i} className="choice" onClick={() => choose(m.id, i)}>
              <b>{c.label}</b>
              {c.hint && <span className="muted small">{c.hint}</span>}
            </button>
          ))}
        </div>
      )}
      {m.chosen !== undefined && m.choices && (
        <p className="msg-result">
          <span className="muted">Pilihanmu: {m.choices[m.chosen].label}.</span> {m.result}
        </p>
      )}
      {!m.choices && m.result && <p className="msg-result">{m.result}</p>}
    </article>
  );
}

function Inbox() {
  const career = useGame((s) => s.career)!;
  const [showOld, setShowOld] = useState(false);
  const isTop = (m: Message) => (m.choices?.length && m.chosen === undefined) || m.date === career.currentDate;
  const top = career.inbox.filter(isTop);
  const old = career.inbox.filter((m) => !isTop(m));
  return (
    <section className="panel inbox">
      <h2>Inbox</h2>
      {top.length ? (
        top.map((m) => <MessageCard key={m.id} m={m} isNew />)
      ) : (
        <p className="muted small">Tidak ada pesan baru minggu ini.</p>
      )}
      {old.length > 0 && (
        <>
          <button className="link old-toggle" aria-expanded={showOld} onClick={() => setShowOld(!showOld)}>
            {showOld ? 'Sembunyikan pesan lama' : `Pesan lama (${old.length})`}
          </button>
          {showOld && old.map((m) => <MessageCard key={m.id} m={m} isNew={false} />)}
        </>
      )}
    </section>
  );
}

function ReportPanel() {
  const r = useGame((s) => s.career!.lastReport);
  const progress = useGame((s) => s.career!.progress);
  const devMode = useGame((s) => s.devMode);
  if (!r) return null;
  const ups = Object.entries(r.attrChanges);
  const near = Object.entries(progress)
    .filter(([, v]) => v > 0 && v < 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  return (
    <section className="panel report">
      <h2>Laporan minggu lalu</h2>
      <div className="report-row">
        <span className="muted small">Atribut naik</span>
        {ups.length ? (
          <div className="ups">
            {ups.map(([a, v]) => (
              <span key={a} className="up-chip">
                {a} +{v}
              </span>
            ))}
          </div>
        ) : (
          <span className="small">Belum ada minggu ini. Hasil latihan tetap terkumpul.</span>
        )}
      </div>
      {near.length > 0 && (
        <div className="report-row">
          <span className="muted small">Hampir naik</span>
          <div className="near">
            {near.map(([a, v]) => (
              <div key={a} className="near-row">
                <span className="small">{a}</span>
                <div className="stress near-bar">
                  <div className="stress-fill" style={{ width: `${Math.round(v * 100)}%` }} />
                </div>
                <span className="muted small num">{Math.round(v * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {r.caAfter !== r.caBefore && (
        <div className="report-row">
          <span className="muted small">Kemampuan</span>
          <span>
            <Stars value={caStars(r.caBefore)} /> → <Stars value={caStars(r.caAfter)} />
            {devMode && (
              <span className="muted small">
                {' '}
                CA {r.caBefore} → {r.caAfter}
              </span>
            )}
          </span>
        </div>
      )}
      <div className="report-nums">
        <span>
          <span className="muted small">Uang </span>
          <b className={r.moneyDelta < 0 ? 'loss' : 'gain'}>{signed(r.moneyDelta)}</b>
        </span>
        <span>
          <span className="muted small">Stres </span>
          <b className={r.stressDelta > 0 ? 'loss' : 'gain'}>
            {r.stressDelta > 0 ? `+${r.stressDelta}` : r.stressDelta}
          </b>
        </span>
        <span>
          <span className="muted small">Kebugaran </span>
          <b>{r.fitness}</b>
        </span>
      </div>
      {r.notes.length > 0 && (
        <ul className="notes">
          {r.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
