// Beranda karier: status hidup, rencana minggu ini, inbox, dan laporan minggu lalu.

import { useMemo, useState, type ReactNode } from 'react';
import { useGame, type View } from './store';
import { Badge, Stars, caStars, money } from './components';
import { ORIGIN_INFO, FAMILY_INFO } from '../game/gen/character';
import { ageOn } from '../game/gen/player';
import {
  ACTIVITY_INFO,
  COACH_INFO,
  COACH_LEVELS,
  COACH_TIERS,
  FOCUS_INFO,
  INTENSITY_INFO,
  econOf,
  levelOf,
  tierCost,
  weeklyBudget,
} from '../game/sim/economy';
import { rolePosition, trainingRole } from '../game/sim/training';
import { ROLES } from '../game/data/roles';
import { POSITION_LABEL } from '../game/data/attributes';
import { pendingChoices, stressTarget } from '../game/sim/week';
import { PLAN_INFO } from '../game/sim/injury';
import type { Activity, CoachKind, CoachLevel, Intensity, MatchRecord, Message, SeasonStat, TrainingFocus } from '../game/types';
import { ClubFixtures, nextFixture, shortDate } from './LeagueSeason';
import { nextCupTie } from '../game/sim/cup';
import { nextContGame } from '../game/sim/continental';
import { PositionPlan } from './FormationView';
import { roundDate, standings } from '../game/sim/season';
import { AwardsPanel } from './AwardsPanel';
import { RetirementView } from './RetirementView';
import { AvatarPanel } from './LifeView';
import { matchReactions } from '../game/sim/relations';
import { ENGINE_VERSION } from '../game/sim/engine';
import { countryName, natRank } from '../game/sim/national';
import { leagueLeaders } from '../game/sim/awards';
import { fullName } from '../game/gen/names';

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

/** Baris status: tanggal, uang, stres, kebugaran, tim, asal. */
export function StatusStrip() {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const p = idx.playerById.get(career.playerId)!;
  const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
  const stress = stressTarget(career, p, club?.countryId);
  return (
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
              Cedera: {career.injury.name} ({career.injury.weeksLeft} mg lagi
              {career.injury.plan ? ` · ${PLAN_INFO[career.injury.plan].label.toLowerCase()}` : ''})
            </span>
          ) : (
            `${career.fitness} / 100 · ${fitLabel(career.fitness)}`
          )}
          {!career.injury && career.fragile && (
            <span className="warn" title="Baru pulih dari cedera: risiko cedera lebih tinggi, terutama di bagian yang sama.">
              {' '}
              · Rawan kambuh {career.fragile.weeks} mg lagi ({career.fragile.part})
            </span>
          )}
          {(career.ban?.club ?? 0) > 0 && <span className="loss"> · Skorsing klub {career.ban!.club} laga</span>}
          {(career.ban?.nat ?? 0) > 0 && <span className="loss"> · Skorsing timnas {career.ban!.nat} laga</span>}
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
        {career.dynasty && career.dynasty.ancestors.length > 0 && (
          <div className="muted small" title={career.dynasty.ancestors.map((a) => `${a.name} (${a.years}, ${a.tier})`).join(' → ')}>
            Generasi ke-{career.dynasty.generation} · {career.dynasty.ancestors[career.dynasty.ancestors.length - 1].relation === 'orang tua' ? 'anak' : 'keponakan'}{' '}
            {career.dynasty.ancestors[career.dynasty.ancestors.length - 1].name}
          </div>
        )}
      </div>
    </section>
  );
}

/** Judul kartu beranda dengan tautan "Lihat semua" ke halamannya */
function CardHead({ title, to, label = 'Lihat semua' }: { title: string; to?: View; label?: string }) {
  const go = useGame((s) => s.go);
  return (
    <div className="card-head">
      <h2>{title}</h2>
      {to && (
        <button className="link small" onClick={() => go(to)}>
          {label} →
        </button>
      )}
    </div>
  );
}

/** Hal yang perlu kamu tangani minggu ini */
function Attention() {
  const career = useGame((s) => s.career)!;
  const go = useGame((s) => s.go);
  const pending = pendingChoices(career).length;
  const items: { text: string; to: View; tone: 'warn' | 'ok' | 'loss' }[] = [];
  if (pending) items.push({ text: `${pending} pesan perlu jawaban sebelum lanjut`, to: { kind: 'inbox' }, tone: 'warn' });
  if (career.offers.length) items.push({ text: `${career.offers.length} tawaran kontrak menunggu`, to: { kind: 'transfer' }, tone: 'ok' });
  if (career.injury) items.push({ text: `Cedera ${career.injury.name}, ${career.injury.weeksLeft} minggu lagi`, to: { kind: 'plan' }, tone: 'loss' });
  if (career.stress >= 70) items.push({ text: `Stres tinggi (${career.stress}). Coba istirahat atau kegiatan santai`, to: { kind: 'plan' }, tone: 'loss' });
  if (career.money < 0) items.push({ text: 'Uangmu minus. Kurangi pengeluaran', to: { kind: 'life' }, tone: 'loss' });
  if (!items.length) return null;
  return (
    <section className="panel attention">
      {items.map((it) => (
        <button key={it.text} className={`att-item ${it.tone}`} onClick={() => go(it.to)}>
          <span>{it.text}</span>
          <span aria-hidden>→</span>
        </button>
      ))}
    </section>
  );
}

/** Beranda karier: ringkasan singkat; detail ada di halaman masing-masing lewat menu samping. */
export function HomeView() {
  const career = useGame((s) => s.career)!;
  if (career.retired) {
    return (
      <div className="home">
        <RetirementView />
        <AwardsPanel />
      </div>
    );
  }
  return (
    <div className="home">
      <StatusStrip />
      <Attention />
      <div className="dash">
        <div className="dash-col">
          <section className="panel">
            <CardHead title="Pertandingan" to={{ kind: 'matches' }} label="Jadwal & statistik" />
            <MatchSummary />
          </section>
          <InboxPreview />
          <ReportPanel />
        </div>
        <div className="dash-col">
          <AvatarPanel />
          <MiniTable />
          <MiniNational />
          <MiniScorers />
        </div>
      </div>
    </div>
  );
}

function InboxPreview() {
  const career = useGame((s) => s.career)!;
  const go = useGame((s) => s.go);
  const list = career.inbox.slice(0, 4);
  return (
    <section className="panel">
      <CardHead title="Inbox" to={{ kind: 'inbox' }} label={`Buka inbox (${career.inbox.length})`} />
      {list.length ? (
        <ul className="ib-mini">
          {list.map((m) => {
            const pending = !!m.choices?.length && m.chosen === undefined;
            return (
              <li key={m.id}>
                <button className="ib-mini-row" onClick={() => go({ kind: 'inbox', id: m.id })}>
                  <span className="ib-mini-title">
                    {pending && <span className="dot" aria-label="Perlu jawaban" />}
                    {m.title}
                  </span>
                  <span className="muted small">
                    {m.from} · {fmtDate(m.date)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted small">Belum ada pesan.</p>
      )}
    </section>
  );
}

/** Klasemen ringkas di sekitar posisi klub kita */
function MiniTable() {
  const career = useGame((s) => s.career)!;
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const p = idx.playerById.get(career.playerId)!;
  const club = p.contract && !p.isYouth ? idx.clubById.get(p.contract.clubId) : undefined;
  const s = club ? world.seasons[club.leagueId] : undefined;
  if (!club || !s) return null;
  const table = standings(s);
  const at = table.findIndex((r) => r.clubId === club.id);
  const from = Math.max(0, Math.min(at - 2, table.length - 5));
  const rows = table.slice(from, from + 5);
  const league = world.leagues.find((l) => l.id === club.leagueId)!;
  return (
    <section className="panel">
      <CardHead title={league.name} to={{ kind: 'league', leagueId: league.id }} label="Klasemen" />
      <table className="tbl small mini-tbl">
        <tbody>
          {rows.map((r, i) => {
            const c = idx.clubById.get(r.clubId)!;
            return (
              <tr key={r.clubId} className={r.clubId === club.id ? 'mine' : ''}>
                <td className="num">{from + i + 1}</td>
                <td>
                  <Badge club={c} size={18} />
                </td>
                <td className="left">{c.name}</td>
                <td className="num muted">{r.p}</td>
                <td className="num strong">{r.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function MiniNational() {
  const career = useGame((s) => s.career)!;
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const p = idx.playerById.get(career.playerId)!;
  const nc = career.intl;
  const rank = useMemo(() => natRank(world, p, career, 'senior'), [world, p, career]);
  return (
    <section className="panel">
      <CardHead title={`Timnas ${countryName(p.nationalityId)}`} to={{ kind: 'national' }} label="Skuad & jadwal" />
      <p className="small">
        {nc?.called ? (
          <span className="pill ok">Dipanggil {nc.called === 'senior' ? 'skuad senior' : 'skuad U-20'}</span>
        ) : (
          <span className="pill">Belum masuk skuad</span>
        )}{' '}
        Peringkatmu <b>#{rank.rank}</b> <span className="muted">(dipanggil {rank.cut} teratas)</span>
      </p>
      <p className="small muted">
        {nc?.caps ?? 0} caps · {nc?.goals ?? 0} gol
      </p>
    </section>
  );
}

function MiniScorers() {
  const career = useGame((s) => s.career)!;
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const p = idx.playerById.get(career.playerId)!;
  const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
  const league = world.leagues.find((l) => (club ? l.id === club.leagueId : l.countryId === p.nationalityId && l.division === 1));
  const leaders = useMemo(() => (league ? leagueLeaders(world, league.id, 5) : null), [world, league]);
  if (!league || !leaders || !leaders.scorers.length) return null;
  return (
    <section className="panel">
      <CardHead title="Top skor" to={{ kind: 'stats', leagueId: league.id }} label="Statistik lengkap" />
      <ol className="aw-top small">
        {leaders.scorers.map((x, i) => (
          <li key={x.pid} className={x.pid === p.id ? 'mine' : ''}>
            <span className="muted num">{i + 1}.</span>
            <span>
              {x.pid === p.id ? 'Kamu' : fullName(x.p!)} <span className="muted">· {idx.clubById.get(x.clubId)?.name}</span>
            </span>
            <b className="num">{x.goals}</b>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Halaman Latihan & rencana */
export function PlanView() {
  const career = useGame((s) => s.career)!;
  return (
    <div className="home">
      <PageTitle title="Latihan & rencana minggu ini" sub={fmtDate(career.currentDate, true)} />
      <div className="home-grid">
        <PlanPanel />
        <div className="home-side">
          <ReportPanel />
        </div>
      </div>
    </div>
  );
}

/** Halaman Pertandingan: laga terakhir, jadwal, statistik musim, dan riwayat laga */
export function MatchesView() {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const p = idx.playerById.get(career.playerId)!;
  const club = p.contract && !p.isYouth ? idx.clubById.get(p.contract.clubId) : undefined;
  return (
    <div className="home">
      <PageTitle title="Pertandingan" sub="Laga terakhir, jadwal, dan statistik kariermu" />
      <MatchPanel />
      {club && <ClubFixtures clubId={club.id} />}
      <MatchHistory />
    </div>
  );
}

function MatchHistory() {
  const matches = useGame((s) => s.career!.matches);
  if (!matches.length) return null;
  return (
    <section className="panel">
      <h2>Riwayat laga terakhir</h2>
      <div className="table-wrap">
        <table className="tbl small">
          <thead>
            <tr>
              <th className="left">Tanggal</th>
              <th className="left">Kompetisi</th>
              <th className="left">Lawan</th>
              <th>Skor</th>
              <th>Menit</th>
              <th>Gol</th>
              <th>Ast</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m, i) => {
              const [us, them] = m.score;
              const res = us > them ? 'win' : us < them ? 'loss-r' : 'draw';
              return (
                <tr key={`${m.date}-${i}`}>
                  <td className="left muted">{shortDate(m.date)}</td>
                  <td className="left">{m.stage ?? m.comp}</td>
                  <td className="left">
                    {m.home ? 'vs' : '@'} {m.opponent}
                  </td>
                  <td>
                    <span className={`res ${res}`}>
                      {us}-{them}
                    </span>
                  </td>
                  <td className="num">{m.minutes > 0 ? `${m.minutes}'` : <span className="muted">{m.status}</span>}</td>
                  <td className="num">{m.goals || ''}</td>
                  <td className="num">{m.assists || ''}</td>
                  <td className="num">
                    {m.minutes > 0 && m.rating ? (
                      <span className={`rating ${m.rating >= 7.5 ? 'hi' : m.rating < 6 ? 'lo' : ''}`}>{m.rating.toFixed(1)}</span>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Judul halaman sederhana */
export function PageTitle({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {sub && <div className="muted small">{sub}</div>}
      </div>
      {right && <div className="page-title-right">{right}</div>}
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

/** Ringkasan efek satu tingkat pelatih */
function coachHint(k: CoachKind, l: CoachLevel): string {
  const t = COACH_TIERS[l as 1 | 2 | 3];
  if (k === 'psikolog') return `Arah stres ${t.stress}`;
  const boost = `latihan ${k === 'teknik' ? 'teknik' : k} +${Math.round((t.boost - 1) * 100)}%`;
  return k === 'fisik' ? `${boost}, risiko cedera latihan -${Math.round((1 - t.injury) * 100)}%` : boost;
}

/** Ringkasan latihan individu + tautan ke halamannya */
function IndividualSummary() {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const p = idx.playerById.get(career.playerId)!;
  const role = ROLES[trainingRole(career, p)];
  const pos = rolePosition(career, p);
  const last = career.trainingLog?.[0];
  return (
    <p className="small it-mini">
      Latihan individu: <b>{role.name}</b> ({POSITION_LABEL[pos].toLowerCase()})
      {career.plan.extraFocus && <> · fokus tambahan <b>{career.plan.extraFocus}</b></>}
      {career.plan.weakFoot && ' · kaki lemah'}
      {last && <> · nilai latihan terakhir <b>{last.rating.toFixed(2)}</b></>}.{' '}
      <button className="link" onClick={() => go({ kind: 'training' })}>
        Atur latihan individu →
      </button>
    </p>
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
  const stress = stressTarget(career, p, p.contract ? idx.clubById.get(p.contract.clubId)?.countryId : undefined);
  const pending = pendingChoices(career).length;
  const hasWage = !!p.contract?.wagePerWeek;
  const resting = plan.focus === 'istirahat';
  const [showStress, setShowStress] = useState(false);

  const lines: [string, number][] = (
    [
      ['Uang saku keluarga', budget.allowance],
      ['Gaji klub', budget.wage],
      ['Sponsor', budget.sponsor],
      ['Kerja sampingan', budget.activity < 0 ? -budget.activity : 0],
      ['Pajak (30%)', -budget.tax],
      ['Komisi agent', -budget.agent],
      ['Tempat tinggal', -budget.living],
      ['Staf pribadi & kendaraan', -budget.lifestyle],
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
        <IndividualSummary />
      </div>

      <PositionPlan />

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
          options={(Object.keys(ACTIVITY_INFO) as Activity[])
            .filter((k) => k !== 'kencan' || career.rel.partner)
            .map((k) => [k, ACTIVITY_INFO[k].label])}
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
          {(Object.keys(COACH_INFO) as CoachKind[]).map((k) => {
            const lv = levelOf(plan.coaches[k]);
            return (
              <div key={k} className={`coach-row ${lv ? 'on' : ''}`}>
                <b>{COACH_INFO[k].label}</b>
                {lv > 0 && <span className="muted small"> · {COACH_TIERS[lv as 1 | 2 | 3].label} · {money(tierCost(COACH_INFO[k].cost, lv, econ))}/mg</span>}
                <div className="muted small">{COACH_INFO[k].desc}</div>
                <div className="coach-tiers" role="group" aria-label={COACH_INFO[k].label}>
                  {COACH_LEVELS.map((l) => (
                    <button
                      key={l}
                      className={`chip ${lv === l ? 'sel' : ''}`}
                      aria-pressed={lv === l}
                      onClick={() => setPlan({ coaches: { ...plan.coaches, [k]: l as CoachLevel } })}
                      title={l ? coachHint(k, l) : undefined}
                    >
                      {l ? `${COACH_TIERS[l as 1 | 2 | 3].label} · ${money(tierCost(COACH_INFO[k].cost, l, econ))}` : 'Tidak'}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="muted small hint">
          Makin tinggi tingkatnya, makin efektif latihanmu, tapi makin mahal. Pelatih world class dibayar dengan harga internasional.
        </p>
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

/** Halaman Inbox: daftar pesan di kiri, isi pesan di kanan */
export function InboxView({ id }: { id?: string }) {
  const career = useGame((s) => s.career)!;
  const [filter, setFilter] = useState<'all' | 'pending'>('all');
  const isPending = (m: Message) => !!m.choices?.length && m.chosen === undefined;
  const firstPending = career.inbox.find(isPending);
  const [sel, setSel] = useState<string | undefined>(id ?? firstPending?.id ?? career.inbox[0]?.id);
  const list = filter === 'pending' ? career.inbox.filter(isPending) : career.inbox;
  const cur = career.inbox.find((m) => m.id === sel) ?? list[0];
  const pendingCount = career.inbox.filter(isPending).length;
  return (
    <div>
      <PageTitle
        title="Inbox"
        sub={pendingCount ? `${pendingCount} pesan perlu jawaban` : `${career.inbox.length} pesan`}
        right={
          <div className="chips">
            <button className={`chip ${filter === 'all' ? 'sel' : ''}`} onClick={() => setFilter('all')}>
              Semua
            </button>
            <button className={`chip ${filter === 'pending' ? 'sel' : ''}`} onClick={() => setFilter('pending')}>
              Perlu jawaban ({pendingCount})
            </button>
          </div>
        }
      />
      <div className="inbox2">
        <ul className="ib-list panel">
          {list.map((m) => (
            <li key={m.id}>
              <button className={`ib-row ${cur?.id === m.id ? 'sel' : ''} ${isPending(m) ? 'pending' : ''}`} onClick={() => setSel(m.id)}>
                <span className="ib-from muted small">
                  {m.from}
                  <span>{fmtDate(m.date)}</span>
                </span>
                <span className="ib-title">
                  {isPending(m) && <span className="dot" aria-label="Perlu jawaban" />}
                  {m.title}
                </span>
              </button>
            </li>
          ))}
          {!list.length && <li className="muted small ib-empty">Tidak ada pesan di sini.</li>}
        </ul>
        <div className="ib-detail">
          {cur ? <MessageCard key={cur.id} m={cur} isNew={cur.date === career.currentDate} /> : <p className="muted">Belum ada pesan.</p>}
          {cur && !isPending(cur) && firstPending && (
            <button className="primary ib-next" onClick={() => setSel(firstPending.id)}>
              Jawab pesan berikutnya ({pendingCount}) →
            </button>
          )}
        </div>
      </div>
    </div>
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

function LastMatch({ m }: { m: MatchRecord }) {
  const reactions = matchReactions(m);
  const canWatch = useGame((s) => s.career?.lastSim?.date === m.date && s.career.lastSim.v === ENGINE_VERSION);
  const watch = useGame((s) => s.watch);
  const [us, them] = m.score;
  const res = us > them ? 'win' : us < them ? 'loss-r' : 'draw';
  return (
    <div className="last-match">
      <div className="lm-top">
        <span className="pill">{m.stage ?? m.comp}</span>
        <span className="muted small">
          {shortDate(m.date)} · {m.home ? 'Kandang' : 'Tandang'}
        </span>
      </div>
      <div className="lm-score">
        <span className="lm-team">{m.team}</span>
        <span className={`res big ${res}`}>
          {us} - {them}
        </span>
        <span className="lm-team right">{m.opponent}</span>
      </div>
      {m.pens && (
        <div className="muted small lm-pens">
          Adu penalti {m.pens[0]}-{m.pens[1]} ({m.pens[0] > m.pens[1] ? 'menang' : 'kalah'})
        </div>
      )}
      {m.scorers && m.scorers.length > 0 && (
        <div className="lm-goals small">
          {[0, 1].map((side) => (
            <div key={side}>
              {m.scorers!
                .filter((g) => g[1] === side)
                .map((g, i) => (
                  <div key={i}>
                    {g[2]} <span className="muted num">{g[0]}'</span>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
      {m.shots && m.possession && (
        <div className="lm-extra small muted">
          <span>
            Penguasaan bola {m.possession[0]}% - {m.possession[1]}%
          </span>
          <span>
            Tembakan {m.shots[0]} - {m.shots[1]}
          </span>
        </div>
      )}
      <div className="lm-me">
        {m.minutes > 0 ? (
          <>
            <span className={`rating ${m.rating! >= 7.5 ? 'hi' : m.rating! < 6 ? 'lo' : ''}`}>{m.rating!.toFixed(1)}</span>
            <span className="small">
              {m.status === 'Inti' ? 'Main sejak awal' : 'Masuk dari bangku cadangan'} · {m.minutes}'
              {m.goals > 0 && ` · ⚽ ${m.goals > 1 ? `×${m.goals}` : ''}`}
              {m.assists > 0 && ` · 🅰️ ${m.assists > 1 ? `×${m.assists}` : ''}`}
              {m.cleanSheet && ' · clean sheet'}
              {m.card === 'Y' && ' · 🟨'}
              {m.card === 'YR' && ' · 🟨🟥 diusir'}
              {m.card === 'R' && ' · 🟥 diusir'}
              {m.injured && ' · 🚑 cedera'}
            </span>
            {m.motm && <span className="pill ok">Man of the Match</span>}
            {reactions && (
              <div className="lm-react small">
                <div>
                  <span className="muted">Manajer:</span> {reactions.manager}
                </div>
                <div>
                  <span className="muted">Fans:</span> {reactions.fans}
                </div>
              </div>
            )}
          </>
        ) : (
          <span className="small muted">
            {m.status === 'Cedera'
              ? 'Kamu absen karena cedera.'
              : m.status === 'Skorsing'
                ? 'Kamu absen karena skorsing.'
                : m.status === 'Cadangan'
                ? 'Kamu duduk di bangku cadangan dan tidak dimainkan.'
                : 'Kamu tidak masuk skuad pertandingan.'}
          </span>
        )}
      </div>
      {canWatch && (
        <div className="lm-watch">
          <button className="chip" onClick={watch}>
            ▶ Tonton ulang laga 2D
          </button>
        </div>
      )}
    </div>
  );
}

const avg = (s: SeasonStat) => (s.apps ? (s.ratingSum / s.apps).toFixed(2) : '-');

/** Laga terakhir + jadwal berikutnya (dipakai di beranda dan halaman Pertandingan) */
function MatchSummary() {
  const career = useGame((s) => s.career)!;
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const p = idx.playerById.get(career.playerId)!;
  const last = career.matches[0];
  const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
  const leagueId = club?.leagueId ?? world.leagues.find((l) => l.countryId === p.nationalityId)?.id;
  const season = leagueId ? world.seasons[leagueId] : undefined;
  const next = club && !p.isYouth ? nextFixture(world, club.id, career.currentDate) : null;
  const nextOpp = next ? idx.clubById.get(next.opponentId) : undefined;
  const cupNext = club && !p.isYouth ? nextCupTie(world, club.id) : null;
  const cupOppId = cupNext?.tie ? (cupNext.tie.home === club!.id ? cupNext.tie.away : cupNext.tie.home) : undefined;
  const cupOpp = cupOppId ? idx.clubById.get(cupOppId) : undefined;
  const contNext = club && !p.isYouth ? nextContGame(world, club.id) : null;
  const contOpp = contNext ? idx.clubById.get(contNext.opp) : undefined;
  // jadwal U19/amatir ikut pekan liga
  const nextRoundDate = season
    ? (season.rounds.map((_, r) => roundDate(season, r)).find((d) => d > career.currentDate) ?? null)
    : null;
  return (
    <>
      {last ? <LastMatch m={last} /> : <p className="muted small">Belum ada pertandingan.</p>}
      <div className="next-match small">
        <span className="muted">Berikutnya: </span>
        {next && nextOpp ? (
          <span className="nm">
            {shortDate(next.date)} · {next.home ? 'vs' : 'di kandang'} <Badge club={nextOpp} size={16} /> <b>{nextOpp.name}</b>{' '}
            <span className="muted">(pekan {next.round})</span>
          </span>
        ) : nextRoundDate ? (
          <span>
            {shortDate(nextRoundDate)} ·{' '}
            {p.contract ? `pertandingan U19 ${club?.name}` : `pertandingan bersama ${career.teamLabel}`}
          </span>
        ) : (
          <span className="muted">Jeda musim. Jadwal baru menyusul.</span>
        )}
      </div>
      {cupNext && (
        <div className="next-match small">
          <span className="muted">{cupNext.cup.name}: </span>
          {cupNext.tie && cupOpp ? (
            <span className="nm">
              {shortDate(cupNext.round.date)} · {cupNext.round.name} ·{' '}
              {cupNext.round.name === 'Final' ? 'vs' : cupNext.tie.home === club!.id ? 'vs' : 'di kandang'} <Badge club={cupOpp} size={16} />{' '}
              <b>{cupOpp.name}</b>
            </span>
          ) : (
            <span>langsung lolos ke babak berikutnya ({shortDate(cupNext.round.date)})</span>
          )}
        </div>
      )}
      {contNext && contOpp && (
        <div className="next-match small">
          <span className="muted">{contNext.comp.name}: </span>
          <span className="nm">
            {shortDate(contNext.date)} · {contNext.stage} · {contNext.home || contNext.stage === 'Final' ? 'vs' : 'di kandang'} <Badge club={contOpp} size={16} />{' '}
            <b>{contOpp.name}</b>
          </span>
        </div>
      )}
    </>
  );
}

function MatchPanel() {
  const career = useGame((s) => s.career)!;
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const [showAll, setShowAll] = useState(false);
  const p = idx.playerById.get(career.playerId)!;
  const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
  const leagueId = club?.leagueId ?? world.leagues.find((l) => l.countryId === p.nationalityId)?.id;
  const season = leagueId ? world.seasons[leagueId] : undefined;
  const current = career.stats.filter((s) => season && s.season === season.label);
  const rows = showAll ? [...career.stats].reverse() : current;

  return (
    <section className="panel matches">
      <h2>Pertandingan</h2>
      <MatchSummary />
      {(rows.length > 0 || career.stats.length > 0) && (
        <>
          <div className="table-wrap">
            <table className="tbl stats">
              <thead>
                <tr>
                  {showAll && <th className="left">Musim</th>}
                  <th className="left">Tim</th>
                  <th>Main</th>
                  <th>Gol</th>
                  <th>Ast</th>
                  {p.mainPosition === 'GK' || ['DC', 'DR', 'DL', 'WBR', 'WBL'].includes(p.mainPosition) ? <th>CS</th> : null}
                  <th title="Kartu kuning">🟨</th>
                  <th title="Kartu merah">🟥</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={`${s.season}-${s.team}-${s.comp}`}>
                    {showAll && <td className="left">{s.season}</td>}
                    <td className="left">
                      {s.team}
                      {s.comp !== 'Liga' && <span className="muted small"> · {s.comp}</span>}
                    </td>
                    <td className="num">
                      {s.apps}
                      {s.apps > s.starts && <span className="muted small"> ({s.apps - s.starts})</span>}
                    </td>
                    <td className="num">{s.goals}</td>
                    <td className="num">{s.assists}</td>
                    {p.mainPosition === 'GK' || ['DC', 'DR', 'DL', 'WBR', 'WBL'].includes(p.mainPosition) ? (
                      <td className="num">{s.cleanSheets}</td>
                    ) : null}
                    <td className="num">{s.yellow ?? 0}</td>
                    <td className="num">{s.red ?? 0}</td>
                    <td className="num">{avg(s)}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={8} className="left muted small">
                      Belum main musim ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <button className="link old-toggle" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Musim ini saja' : 'Riwayat semua musim'}
          </button>
        </>
      )}
    </section>
  );
}
