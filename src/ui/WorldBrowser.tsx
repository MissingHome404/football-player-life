import { useMemo, useState } from 'react';
import { useGame, useToday, type LeagueTab, type View } from './store';
import { Badge, Flag, Stars, AttrBlock, RolePanel, roleHighlight, caStars, money, num } from './components';
import { ROLES } from '../game/data/roles';
import { SaveControls } from './SavePanel';
import { HomeView, InboxView, MatchesView, PlanView } from './CareerHome';
import { TransferPanel } from './TransferPanel';
import { RelationsPanel } from './RelationsPanel';
import { AwardsPanel } from './AwardsPanel';
import { NationalView } from './NationalView';
import { LeagueHistory, LeagueStats, StatsView } from './StatsView';
import { SearchView } from './SearchView';
import { LifeView } from './LifeView';
import { ContinentalView } from './ContinentalView';
import { NamesView, RenameButton } from './NamesView';
import { ClubTactic } from './FormationView';
import { STYLE_LABEL, clubTactic } from '../game/sim/tactics';
import { PLAY_TRAITS, playTraits } from '../game/sim/traits';
import { ClubFixtures, CupPanel, SeasonPanel } from './LeagueSeason';
import { pendingChoices } from '../game/sim/week';
import { marketValue } from '../game/sim/transfer';
import { badgeValue } from '../game/sim/badges';
import { innateTraits } from '../game/sim/injury';
import { COUNTRY_BY_ID } from '../game/data/countries';
import {
  TECHNICAL,
  MENTAL,
  PHYSICAL,
  GOALKEEPING,
  PERSONALITY,
  HIDDEN,
  POSITIONS,
  POSITION_LABEL,
  type Position,
} from '../game/data/attributes';
import { ageOn } from '../game/gen/player';
import { fullName, shortName } from '../game/gen/names';
import { personalityLabel, PERSONALITY_INFO } from '../game/gen/personality';
import type { Club, Player } from '../game/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const POS_ORDER = Object.fromEntries(POSITIONS.map((p, i) => [p, i])) as Record<Position, number>;

type NavItem = { key: string; icon: string; label: string; to: View; on: boolean; count?: number; hide?: boolean };

/** Kerangka game: topbar (judul halaman + tombol Lanjut), menu samping, dan menu bawah di HP. */
export function WorldBrowser() {
  const world = useGame((s) => s.world)!;
  const view = useGame((s) => s.view)!;
  const go = useGame((s) => s.go);
  const back = useGame((s) => s.back);
  const history = useGame((s) => s.history);
  const career = useGame((s) => s.career);
  const idx = useGame((s) => s.idx)!;
  const [menuOpen, setMenuOpen] = useState(false);

  const user = career ? idx.playerById.get(career.playerId) : undefined;
  const myClub = user?.contract ? idx.clubById.get(user.contract.clubId) : undefined;
  const myLeague = myClub?.leagueId ?? world.leagues.find((l) => l.countryId === user?.nationalityId && l.division === 1)?.id;
  const pending = career ? pendingChoices(career).length : 0;
  const retired = !!career?.retired;
  const k = view.kind;

  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Karier',
      items: [
        { key: 'me', icon: '🏠', label: 'Beranda', to: { kind: 'me' }, on: k === 'me' },
        { key: 'inbox', icon: '✉️', label: 'Inbox', to: { kind: 'inbox' }, on: k === 'inbox', count: pending },
        { key: 'plan', icon: '🏋️', label: 'Latihan & rencana', to: { kind: 'plan' }, on: k === 'plan', hide: retired },
        { key: 'profile', icon: '👤', label: 'Profil saya', to: { kind: 'profile' }, on: k === 'profile' || (k === 'player' && view.playerId === user?.id) },
        { key: 'matches', icon: '📅', label: 'Pertandingan', to: { kind: 'matches' }, on: k === 'matches' },
        { key: 'transfer', icon: '✍️', label: 'Kontrak & transfer', to: { kind: 'transfer' }, on: k === 'transfer', count: career?.offers.length, hide: retired },
        { key: 'relations', icon: '🤝', label: 'Hubungan', to: { kind: 'relations' }, on: k === 'relations', hide: retired },
        { key: 'life', icon: '🛍️', label: 'Kehidupan & belanja', to: { kind: 'life' }, on: k === 'life', hide: retired },
        { key: 'awards', icon: '🏅', label: 'Prestasi', to: { kind: 'awards' }, on: k === 'awards' },
      ],
    },
    {
      title: 'Sepak bola',
      items: [
        ...(myClub
          ? [{ key: 'club', icon: '🛡️', label: 'Klub saya', to: { kind: 'club', clubId: myClub.id } as View, on: k === 'club' && view.clubId === myClub.id }]
          : []),
        ...(myLeague
          ? [{ key: 'league', icon: '🏟️', label: 'Liga saya', to: { kind: 'league', leagueId: myLeague } as View, on: k === 'league' && view.leagueId === myLeague }]
          : []),
        { key: 'national', icon: '🌏', label: 'Timnas', to: { kind: 'national' }, on: k === 'national' },
        { key: 'stats', icon: '📊', label: 'Statistik & top skor', to: { kind: 'stats' }, on: k === 'stats' },
        {
          key: 'comps',
          icon: '🏆',
          label: 'Liga & kompetisi',
          to: { kind: 'comps' },
          on: k === 'comps' || k === 'continent' || (k === 'league' && view.leagueId !== myLeague),
        },
        { key: 'search', icon: '🔎', label: 'Cari pemain', to: { kind: 'search' }, on: k === 'search' },
      ],
    },
    {
      title: 'Lainnya',
      items: [
        { key: 'names', icon: '✏️', label: 'Editor nama', to: { kind: 'names' }, on: k === 'names' },
        { key: 'settings', icon: '⚙️', label: 'Simpan & pengaturan', to: { kind: 'settings' }, on: k === 'settings' },
      ],
    },
  ];
  const open = (to: View) => {
    go(to);
    setMenuOpen(false);
  };
  const bottom: NavItem[] = [
    groups[0].items[0],
    groups[0].items[1],
    retired ? groups[0].items[3] : groups[0].items[2],
    groups[0].items[4],
  ];

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon back-btn" disabled={!history.length} onClick={back} aria-label="Kembali" title="Kembali">
          ←
        </button>
        <div className="top-title">
          <div className="brand">⚽ Football Player Life</div>
          {career && (
            <div className="top-sub muted small">
              {fullName(user!)} · {myClub?.name ?? career.teamLabel}
            </div>
          )}
        </div>
        {career && !retired && <TopStatus />}
        <div className="save-slot hide-sm">
          <SaveControls compact />
        </div>
        {career && !retired && <ContinueButton />}
      </header>
      <div className="layout">
        <nav className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Menu utama">
          {groups.map((g) => (
            <div key={g.title} className="side-group">
              <div className="side-title">{g.title}</div>
              {g.items
                .filter((it) => !it.hide)
                .map((it) => (
                  <button key={it.key} className={`side-item ${it.on ? 'sel' : ''}`} onClick={() => open(it.to)} aria-current={it.on ? 'page' : undefined}>
                    <span className="side-icon" aria-hidden>
                      {it.icon}
                    </span>
                    <span className="side-label">{it.label}</span>
                    {!!it.count && <span className="count">{it.count}</span>}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
        <main className="main">
          {k === 'me' && career && <HomeView />}
          {k === 'inbox' && career && <InboxView key={view.id ?? 'inbox'} id={view.id} />}
          {k === 'plan' && career && <PlanView />}
          {k === 'profile' && career && <MyProfile />}
          {k === 'matches' && career && <MatchesView />}
          {k === 'transfer' && career && <TransferPanel />}
          {k === 'relations' && career && <RelationsPanel />}
          {k === 'awards' && career && <AwardsPanel />}
          {k === 'life' && career && <LifeView />}
          {k === 'national' && <NationalView key={view.countryId ?? 'mine'} countryId={view.countryId} />}
          {k === 'stats' && <StatsView key={view.leagueId ?? 'mine'} leagueId={view.leagueId} />}
          {k === 'search' && <SearchView />}
          {k === 'comps' && <CompetitionsView myLeague={myLeague} />}
          {k === 'settings' && <SettingsView />}
          {k === 'league' && <LeagueView key={view.leagueId} leagueId={view.leagueId} tab={view.tab} />}
          {k === 'club' && <ClubView key={view.clubId} clubId={view.clubId} />}
          {k === 'player' && <PlayerView key={view.playerId} playerId={view.playerId} />}
          {k === 'continent' && <ContinentalView key={view.confed} confed={view.confed} />}
          {k === 'names' && <NamesView key={view.edit ? `${view.edit.kind}:${view.edit.id}` : 'all'} edit={view.edit} />}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Menu cepat">
        {bottom.map((it) => (
          <button key={it.key} className={it.on ? 'sel' : ''} onClick={() => open(it.to)}>
            <span aria-hidden>{it.icon}</span>
            <span>{it.label.split(' ')[0]}</span>
            {!!it.count && <span className="count">{it.count}</span>}
          </button>
        ))}
        <button className={menuOpen ? 'sel' : ''} onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>
          <span aria-hidden>☰</span>
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}

/** Tanggal + uang ringkas di topbar */
function TopStatus() {
  const career = useGame((s) => s.career)!;
  const d = new Date(career.currentDate + 'T00:00:00Z');
  return (
    <div className="top-status">
      <div className="ts-date">
        <b>{d.toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'UTC' })}</b>{' '}
        {d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
      </div>
      <div className={`ts-money small ${career.money < 0 ? 'loss' : 'muted'}`}>{money(career.money)}</div>
    </div>
  );
}

/** Tombol Lanjut seperti di game manajer: selalu terlihat. Kalau ada pesan wajib, membuka inbox. */
function ContinueButton() {
  const career = useGame((s) => s.career)!;
  const nextWeek = useGame((s) => s.nextWeek);
  const go = useGame((s) => s.go);
  const busy = useGame((s) => s.busy);
  const waiting = pendingChoices(career);
  const pending = waiting.length;
  if (pending > 0) {
    return (
      <button className="primary continue warn-btn" onClick={() => go({ kind: 'inbox', id: waiting[0].id })} title="Jawab dulu pesan yang perlu jawaban">
        Jawab {pending} pesan
      </button>
    );
  }
  return (
    <div className="continue-group">
      <button className="primary continue" disabled={!!busy} onClick={() => nextWeek(1)} title="Lanjut 1 minggu">
        Lanjut ▶
      </button>
      <button
        className="primary continue more"
        disabled={!!busy}
        onClick={() => nextWeek(4)}
        title="Lanjut 4 minggu (berhenti lebih awal kalau ada pesan penting atau kamu cedera)"
        aria-label="Lanjut 4 minggu"
      >
        ⏩
      </button>
    </div>
  );
}

function MyProfile() {
  const career = useGame((s) => s.career)!;
  return <PlayerView key={career.playerId} playerId={career.playerId} />;
}

/** Semua liga, kompetisi benua, dan turnamen antarnegara */
function CompetitionsView({ myLeague }: { myLeague?: string }) {
  const world = useGame((s) => s.world)!;
  const go = useGame((s) => s.go);
  const regions: { confed: 'UEFA' | 'AFC'; name: string }[] = [
    { confed: 'UEFA', name: 'Eropa' },
    { confed: 'AFC', name: 'Asia' },
  ];
  return (
    <div>
      <div className="page-title">
        <div>
          <h1>Semua liga & kompetisi</h1>
          <div className="muted small">Pilih liga untuk melihat klasemen, piala, klub, pemain, dan statistik.</div>
        </div>
      </div>
      {regions.map((r) => {
        const leagues = world.leagues.filter((l) => COUNTRY_BY_ID[l.countryId].confederation === r.confed);
        return (
          <section key={r.confed} className="panel">
            <div className="card-head">
              <h2>{r.name}</h2>
              <button className="ghost small" onClick={() => go({ kind: 'continent', confed: r.confed })}>
                🏆 Kompetisi antarklub {r.name}
              </button>
            </div>
            <div className="comp-grid">
              {leagues.map((l) => (
                <button
                  key={l.id}
                  className={`comp-card ${l.id === myLeague ? 'mine' : ''} ${l.active ? '' : 'inactive'}`}
                  onClick={() => go({ kind: 'league', leagueId: l.id })}
                >
                  <span className="comp-flag" aria-hidden>
                    <Flag id={l.countryId} />
                  </span>
                  <span className="comp-text">
                    <b>{l.name}</b>
                    <span className="muted small">
                      {COUNTRY_BY_ID[l.countryId].name} · Divisi {l.division}
                      {!l.active && ' · versi ringan'}
                      {l.id === myLeague && ' · ligamu'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <section className="panel">
        <div className="card-head">
          <h2>Antarnegara</h2>
          <button className="ghost small" onClick={() => go({ kind: 'national' })}>
            🌏 Timnas, kualifikasi & turnamen
          </button>
        </div>
        <p className="muted small">
          {world.intl?.tournament
            ? `${world.intl.tournament.name}${world.intl.tournament.champion ? ' sudah selesai' : ' sedang berlangsung'}.`
            : 'Kualifikasi Piala Dunia, Euro, dan Piala Asia berjalan di jeda internasional.'}
        </p>
      </section>
    </div>
  );
}

/** Simpan, ekspor, mode developer, dan info dunia */
function SettingsView() {
  const world = useGame((s) => s.world)!;
  const reset = useGame((s) => s.reset);
  const devMode = useGame((s) => s.devMode);
  const toggleDev = useGame((s) => s.toggleDev);
  const autoWatch = useGame((s) => s.autoWatch);
  const setAutoWatch = useGame((s) => s.setAutoWatch);
  const genMs = useGame((s) => s.genMs);
  return (
    <div>
      <div className="page-title">
        <div>
          <h1>Simpan & pengaturan</h1>
          <div className="muted small">Game tersimpan otomatis tiap minggu. Ekspor untuk memindahkan save ke perangkat lain.</div>
        </div>
      </div>
      <section className="panel settings">
        <h2>Save</h2>
        <SaveControls />
      </section>
      <section className="panel settings">
        <h2>Tampilan</h2>
        <label className="set-row">
          <input type="checkbox" checked={autoWatch} onChange={(e) => setAutoWatch(e.target.checked)} />
          <span>
            <b>Tonton laga otomatis</b>
            <span className="muted small"> · buka layar pertandingan 2D setelah lanjut 1 minggu</span>
          </span>
        </label>
        <label className="set-row">
          <input type="checkbox" checked={devMode} onChange={toggleDev} />
          <span>
            <b>Mode developer</b>
            <span className="muted small"> · tampilkan angka tersembunyi (CA, PA, personality, hidden)</span>
          </span>
        </label>
      </section>
      <section className="panel settings">
        <h2>Dunia ini</h2>
        <p className="small muted">
          Seed <b>{world.seed}</b> · {num(world.players.length)} pemain · {world.clubs.length} klub · {world.leagues.length} liga
          {genMs > 0 && ` · dibuat dalam ${genMs} ms`}
        </p>
        <button className="ghost" onClick={reset} title="Kembali ke layar awal (simpan dulu kalau perlu)">
          Keluar ke menu utama
        </button>
      </section>
    </div>
  );
}

function squadStrength(squad: Player[]): number {
  const top = squad
    .filter((p) => !p.isYouth)
    .map((p) => p.ca)
    .sort((a, b) => b - a)
    .slice(0, 11);
  return top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
}

const LEAGUE_TABS: [LeagueTab, string][] = [
  ['table', 'Klasemen & jadwal'],
  ['cup', 'Piala'],
  ['clubs', 'Klub'],
  ['players', 'Pemain'],
  ['stats', 'Statistik & sejarah'],
];

function LeagueView({ leagueId, tab: initial }: { leagueId: string; tab?: LeagueTab }) {
  const [tab, setTab] = useState<LeagueTab>(initial ?? 'table');
  const world = useGame((s) => s.world)!;
  const today = useToday();
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const devMode = useGame((s) => s.devMode);
  const league = world.leagues.find((l) => l.id === leagueId)!;
  const clubs = useMemo(
    () => world.clubs.filter((c) => c.leagueId === leagueId).sort((a, b) => b.reputation - a.reputation),
    [world, leagueId],
  );
  const best = useMemo(
    () =>
      clubs
        .flatMap((c) => idx.squadByClub.get(c.id) ?? [])
        .sort((a, b) => b.ca - a.ca)
        .slice(0, 10),
    [clubs, idx],
  );
  const talents = useMemo(
    () =>
      clubs
        .flatMap((c) => idx.squadByClub.get(c.id) ?? [])
        .filter((p) => ageOn(p.birthDate, today) <= 20)
        .sort((a, b) => b.pa - a.pa)
        .slice(0, 10),
    [clubs, idx, today],
  );

  return (
    <div>
      <div className="page-head">
        <div className="big-flag">
          <Flag id={league.countryId} />
        </div>
        <div>
          <h1>
            {league.name} <RenameButton kind="liga" id={league.id} />
          </h1>
          <div className="muted">
            {COUNTRY_BY_ID[league.countryId].name} · Divisi {league.division} · Musim mulai{' '}
            {MONTHS[league.seasonStartMonth - 1]} · {clubs.length} klub · Pemain asing ±
            {Math.round(league.foreignShare * 100)}%
          </div>
        </div>
        <div className="head-right">
          <div className="muted small">Reputasi liga</div>
          <Stars value={league.reputation / 20} />
          <div className={`pill ${league.active ? 'ok' : ''}`}>{league.active ? 'Aktif' : 'Versi ringan'}</div>
        </div>
      </div>

      <div className="tabs page-tabs" role="tablist">
        {LEAGUE_TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'sel' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'table' && <SeasonPanel leagueId={leagueId} />}
      {tab === 'cup' && (world.cups?.[leagueId] ? <CupPanel leagueId={leagueId} /> : <section className="panel muted small">Piala domestik musim ini belum dimulai.</section>)}
      {tab === 'clubs' && (
      <section className="panel">
        <h2>Klub</h2>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th></th>
                <th className="left">Klub</th>
                <th className="left hide-sm">Kota</th>
                <th>Reputasi</th>
                <th>Kekuatan</th>
                <th className="hide-sm">Latihan</th>
                <th className="hide-sm">Akademi</th>
                <th className="hide-sm">Stadion</th>
                <th className="hide-sm">Gaji/minggu</th>
              </tr>
            </thead>
            <tbody>
              {clubs.map((c) => {
                const str = squadStrength(idx.squadByClub.get(c.id) ?? []);
                return (
                  <tr key={c.id} className="click" onClick={() => go({ kind: 'club', clubId: c.id })}>
                    <td>
                      <Badge club={c} size={26} />
                    </td>
                    <td className="left strong">
                      {c.name}
                      {devMode && <div className="muted small">ref: {c.realRef}</div>}
                    </td>
                    <td className="left hide-sm muted">{c.city}</td>
                    <td>
                      <Stars value={c.reputation / 20} />
                    </td>
                    <td>
                      <Stars value={caStars(str)} />
                      {devMode && <span className="muted small"> {Math.round(str)}</span>}
                    </td>
                    <td className="hide-sm">
                      <Stars value={c.facilities.training} />
                    </td>
                    <td className="hide-sm">
                      <Stars value={c.facilities.youth} />
                    </td>
                    <td className="hide-sm num">{num(c.stadiumCapacity)}</td>
                    <td className="hide-sm num">{money(c.finances.wageBudget)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}
      {tab === 'players' && (
      <div className="two-col">
        <section className="panel">
          <h2>Pemain terbaik</h2>
          <PlayerList players={best} showClub />
        </section>
        <section className="panel">
          <h2>Talenta muda (≤ 20 tahun)</h2>
          <PlayerList players={talents} showClub potential />
        </section>
      </div>
      )}
      {tab === 'stats' && (
        <>
          <section className="panel">
            <h2>Statistik pemain</h2>
            <LeagueStats leagueId={leagueId} />
          </section>
          <LeagueHistory leagueId={leagueId} />
        </>
      )}
    </div>
  );
}

function PlayerList({
  players,
  showClub,
  potential,
}: {
  players: Player[];
  showClub?: boolean;
  potential?: boolean;
}) {
  const idx = useGame((s) => s.idx)!;
  const today = useToday();
  const go = useGame((s) => s.go);
  const devMode = useGame((s) => s.devMode);
  return (
    <ul className="plist">
      {players.map((p) => {
        const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
        return (
          <li key={p.id} className="click" onClick={() => go({ kind: 'player', playerId: p.id })}>
            <span className="pos">{p.mainPosition}</span>
            <Flag id={p.nationalityId} />
            <span className="pname">{shortName(p)}</span>
            <span className="muted small">{ageOn(p.birthDate, today)} th</span>
            {showClub && club && (
              <span className="pclub">
                <Badge club={club} size={18} />
              </span>
            )}
            <span className="pstars">
              <Stars value={caStars(potential ? p.pa : p.ca)} />
              {devMode && <span className="muted small"> {potential ? p.pa : p.ca}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ClubView({ clubId }: { clubId: string }) {
  const world = useGame((s) => s.world)!;
  const today = useToday();
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const devMode = useGame((s) => s.devMode);
  const [tab, setTab] = useState<'senior' | 'youth'>('senior');
  const [page, setPage] = useState<'overview' | 'squad' | 'tactic'>('overview');
  const club = idx.clubById.get(clubId)!;
  const ledger = world.ledger?.[club.leagueId];
  const league = world.leagues.find((l) => l.id === club.leagueId)!;
  const manager = world.staff.find((s) => s.id === club.managerId)!;
  const squad = (idx.squadByClub.get(clubId) ?? [])
    .filter((p) => (tab === 'youth' ? p.isYouth : !p.isYouth))
    .sort((a, b) => POS_ORDER[a.mainPosition] - POS_ORDER[b.mainPosition] || b.ca - a.ca);

  return (
    <div>
      <div
        className="club-head"
        style={{ background: `linear-gradient(110deg, ${club.colors[0]} 0%, ${club.colors[0]} 80%, ${club.colors[1]} 80%, ${club.colors[1]} 100%)` }}
      >
        <div className="club-head-inner">
          <Badge club={club} size={72} />
          <div>
            <h1>
              {club.name} <RenameButton kind="klub" id={club.id} />
            </h1>
            <div className="small">
              <Flag id={club.countryId} /> {club.city} ·{' '}
              <button className="link light" onClick={() => go({ kind: 'league', leagueId: league.id })}>
                {league.name}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="tabs page-tabs" role="tablist">
        {(
          [
            ['overview', 'Ikhtisar'],
            ['squad', 'Skuad'],
            ['tactic', 'Taktik'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={page === k} className={page === k ? 'sel' : ''} onClick={() => setPage(k)}>
            {label}
          </button>
        ))}
      </div>

      {page === 'overview' && (
        <>
      <div className="cards">
        <InfoCard label="Reputasi">
          <Stars value={club.reputation / 20} />
        </InfoCard>
        <InfoCard label="Kekuatan skuad">
          <Stars value={caStars(squadStrength(idx.squadByClub.get(clubId) ?? []))} />
        </InfoCard>
        <InfoCard label="Fasilitas latihan">
          <Stars value={club.facilities.training} />
        </InfoCard>
        <InfoCard label="Akademi">
          <Stars value={club.facilities.youth} />
        </InfoCard>
        <InfoCard label="Manajer">
          <Flag id={manager.nationalityId} /> {fullName(manager)}
          <div className="muted small">
            Taktik: {clubTactic(club).name} · {STYLE_LABEL[club.playingStyle]} · {clubTactic(club).formation}
            {devMode && ` · MM ${manager.manManagement} · Youth ${manager.workingWithYoungsters} · Tak ${manager.tacticalKnowledge}`}
          </div>
        </InfoCard>
        <InfoCard label="Stadion">{num(club.stadiumCapacity)} kursi</InfoCard>
        <InfoCard label="Budget gaji">{money(club.finances.wageBudget)} / minggu</InfoCard>
        <InfoCard label="Fans">± {num(club.fanBase)}</InfoCard>
      </div>

      <ClubFixtures clubId={clubId} />
        </>
      )}

      {page === 'tactic' && <ClubTactic club={club} squad={idx.squadByClub.get(clubId) ?? []} />}

      {page === 'squad' && (
      <section className="panel">
        <div className="tabs">
          <button className={tab === 'senior' ? 'sel' : ''} onClick={() => setTab('senior')}>
            Skuad senior
          </button>
          <button className={tab === 'youth' ? 'sel' : ''} onClick={() => setTab('youth')}>
            U19 / Akademi
          </button>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Pos</th>
                <th className="left">Nama</th>
                <th>Neg</th>
                <th>Umur</th>
                <th className="hide-sm">Peran</th>
                <th className="hide-sm">Status</th>
                <th>Kemampuan</th>
                <th>Potensi</th>
                <th title="Main musim ini">Main</th>
                <th title="Gol musim ini">Gol</th>
                <th className="hide-sm" title="Assist musim ini">Ast</th>
                <th className="hide-sm" title="Rating rata-rata musim ini">Rat</th>
                <th className="hide-sm">Gaji/minggu</th>
                <th className="hide-sm">Kontrak</th>
              </tr>
            </thead>
            <tbody>
              {squad.map((p) => {
                const st = ledger?.rows[p.id];
                const here = st && st[4] === clubId;
                return (
                <tr key={p.id} className={`click ${p.isUser ? 'mine' : ''}`} onClick={() => go({ kind: 'player', playerId: p.id })}>
                  <td>
                    <span className="pos">{p.mainPosition}</span>
                  </td>
                  <td className="left strong">{fullName(p)}</td>
                  <td>
                    <Flag id={p.nationalityId} />
                  </td>
                  <td>{ageOn(p.birthDate, today)}</td>
                  <td className="hide-sm" title={ROLES[p.preferredRole].name}>
                    {ROLES[p.preferredRole].short}
                  </td>
                  <td className="hide-sm muted">{p.contract?.role}</td>
                  <td>
                    <Stars value={caStars(p.ca)} />
                    {devMode && <span className="muted small"> {p.ca}</span>}
                  </td>
                  <td>
                    <Stars value={caStars(p.pa)} />
                    {devMode && <span className="muted small"> {p.pa}</span>}
                  </td>
                  <td className="num">{here ? st[0] : '-'}</td>
                  <td className="num">{here ? st[1] : '-'}</td>
                  <td className="hide-sm num">{here ? st[2] : '-'}</td>
                  <td className="hide-sm num">{here && st[0] ? (st[3] / st[0]).toFixed(2) : '-'}</td>
                  <td className="hide-sm num">{money(p.contract?.wagePerWeek ?? 0)}</td>
                  <td className="hide-sm muted">{p.contract?.expires.slice(0, 4)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  );
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="muted small">{label}</div>
      <div className="card-v">{children}</div>
    </div>
  );
}

function PlayerView({ playerId }: { playerId: string }) {
  const today = useToday();
  const career = useGame((s) => s.career);
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const devMode = useGame((s) => s.devMode);
  const p = idx.playerById.get(playerId)!;
  const [roleSel, setRoleSel] = useState(p.preferredRole);
  const hl = roleHighlight(roleSel);
  const changes = p.isUser ? career?.lastReport?.attrChanges : undefined;
  const club: Club | undefined = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
  const age = ageOn(p.birthDate, today);
  const label = personalityLabel(p);
  const info = PERSONALITY_INFO[label];
  const isGK = p.mainPosition === 'GK';
  const otherPositions = (Object.entries(p.positions) as [Position, number][])
    .filter(([pos]) => pos !== p.mainPosition)
    .sort((a, b) => b[1] - a[1]);
  const foot = (v: number) => (v >= 18 ? 'Sangat kuat' : v >= 15 ? 'Kuat' : v >= 11 ? 'Cukup' : v >= 6 ? 'Lemah' : 'Sangat lemah');

  return (
    <div>
      <div
        className="club-head"
        style={club ? { background: `linear-gradient(110deg, ${club.colors[0]} 0%, ${club.colors[0]} 80%, ${club.colors[1]} 80%)` } : undefined}
      >
        <div className="club-head-inner">
          {club && <Badge club={club} size={64} />}
          <div>
            <h1>
              {fullName(p)} <RenameButton kind="pemain" id={p.id} />
            </h1>
            <div className="small">
              {POSITION_LABEL[p.mainPosition]} ({ROLES[p.preferredRole].name}) · {age} tahun ·{' '}
              <Flag id={p.nationalityId} withName />
              {club && (
                <>
                  {' · '}
                  <button className="link light" onClick={() => go({ kind: 'club', clubId: club.id })}>
                    {club.name}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="cards">
        <InfoCard label="Kemampuan saat ini">
          <Stars value={caStars(p.ca)} />
          {devMode && <div className="muted small">CA {p.ca}</div>}
        </InfoCard>
        <InfoCard label="Perkiraan potensi">
          {p.isUser && career ? (
            <>
              <Stars value={caStars(career.scoutPA[0])} /> <span className="muted">s/d</span>{' '}
              <Stars value={caStars(career.scoutPA[1])} />
            </>
          ) : (
            <Stars value={caStars(p.pa)} />
          )}
          {devMode && <div className="muted small">PA {p.pa}</div>}
        </InfoCard>
        <InfoCard label="Personality">
          <b>{label}</b>
          <div className="muted small">
            + {info.good}
            <br />− {info.risk}
          </div>
        </InfoCard>
        <InfoCard label="Kebiasaan bermain">
          {playTraits(p).length ? (
            <div className="traits">
              {playTraits(p).map((id) => (
                <span key={id} className="trait" title={PLAY_TRAITS[id].desc}>
                  {PLAY_TRAITS[id].name}
                </span>
              ))}
            </div>
          ) : (
            <span className="muted small">Tidak ada kebiasaan khusus: bermain persis sesuai peran.</span>
          )}
        </InfoCard>
        <InfoCard label="Fisik">
          {p.heightCm} cm · {p.weightKg} kg
          <div className="muted small">
            Kaki kiri: {foot(p.leftFoot)} · kanan: {foot(p.rightFoot)}
          </div>
          <div className="traits">
            {/* rawan / tahan cedera hanya diketahui untuk pemain kita sendiri */}
            {innateTraits(p)
              .filter((t) => p.isUser || !t.label.includes('cedera'))
              .map((t) => (
                <span key={t.label} className="trait" title={t.desc}>
                  {t.label}
                </span>
              ))}
          </div>
        </InfoCard>
        <InfoCard label="Kontrak">
          {p.contract ? (
            <>
              {money(p.contract.wagePerWeek)} / minggu
              <div className="muted small">
                s/d {p.contract.expires} · {p.contract.role}
              </div>
            </>
          ) : (
            'Tanpa klub'
          )}
        </InfoCard>
        <InfoCard label="Nilai pasar">
          ± {money(marketValue(p, today, p.isUser ? badgeValue(career ?? undefined) : 1))}
          <div className="muted small">perkiraan harga transfer</div>
        </InfoCard>
        <InfoCard label="Posisi lain">
          {otherPositions.length
            ? otherPositions.map(([pos, v]) => (
                <span key={pos} className="pos" title={`Keakraban ${v}/20`}>
                  {pos}
                </span>
              ))
            : <span className="muted">-</span>}
        </InfoCard>
      </div>

      <RolePanel player={p} selected={roleSel} onSelect={setRoleSel} />

      <section className="panel attrs">
        <AttrBlock
          title={isGK ? 'Goalkeeping' : 'Technical'}
          keys={isGK ? GOALKEEPING : TECHNICAL}
          values={isGK ? p.goalkeeping : p.technical}
          hl={hl}
          changes={changes}
        />
        <AttrBlock title="Mental" keys={MENTAL} values={p.mental} hl={hl} changes={changes} />
        <div>
          <AttrBlock title="Physical" keys={PHYSICAL} values={p.physical} hl={hl} changes={changes} />
          {isGK && (
            <AttrBlock
              title="Technical (kiper)"
              keys={['First Touch', 'Passing']}
              values={p.technical}
              hl={hl}
              changes={changes}
            />
          )}
        </div>
      </section>

      {p.isUser && !!career?.injuries?.length && (
        <section className="panel">
          <h2>Riwayat cedera</h2>
          <table className="tbl inj-history">
            <thead>
              <tr>
                <th className="left">Tanggal</th>
                <th className="left">Cedera</th>
                <th className="left">Saat</th>
                <th>Absen</th>
              </tr>
            </thead>
            <tbody>
              {career.injuries.map((r, i) => (
                <tr key={`${r.date}-${i}`}>
                  <td className="left muted">{r.date}</td>
                  <td className={`left ${r.severity === 'berat' ? 'loss strong' : ''}`}>{r.name}</td>
                  <td className="left muted">{r.where}</td>
                  <td className="num">{r.weeks} mg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {devMode && (
        <section className="panel attrs dev">
          <AttrBlock title="Personality (tersembunyi)" keys={PERSONALITY} values={p.personality} />
          <AttrBlock title="Hidden attributes" keys={HIDDEN} values={p.hidden} />
          <div className="muted small dev-note">
            Angka di bagian ini tidak akan terlihat oleh pemain di game asli. Hanya muncul di mode developer untuk
            mengecek keseimbangan generator.
          </div>
        </section>
      )}
    </div>
  );
}

