import { useMemo, useState } from 'react';
import { useGame, useToday } from './store';
import { Badge, Flag, Stars, AttrBlock, RolePanel, roleHighlight, caStars, money, num } from './components';
import { ROLES } from '../game/data/roles';
import { SaveControls } from './SavePanel';
import { CareerHome } from './CareerHome';
import { LifeView } from './LifeView';
import { ContinentalView } from './ContinentalView';
import { ClubFixtures, CupPanel, SeasonPanel } from './LeagueSeason';
import { pendingChoices } from '../game/sim/week';
import { marketValue } from '../game/sim/transfer';
import { badgeValue } from '../game/sim/badges';
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
import type { Club, League, Player } from '../game/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const POS_ORDER = Object.fromEntries(POSITIONS.map((p, i) => [p, i])) as Record<Position, number>;

export function WorldBrowser() {
  const world = useGame((s) => s.world)!;
  const view = useGame((s) => s.view)!;
  const go = useGame((s) => s.go);
  const back = useGame((s) => s.back);
  const history = useGame((s) => s.history);
  const reset = useGame((s) => s.reset);
  const devMode = useGame((s) => s.devMode);
  const toggleDev = useGame((s) => s.toggleDev);
  const genMs = useGame((s) => s.genMs);
  const career = useGame((s) => s.career);
  const pending = career ? pendingChoices(career).length + career.offers.length : 0;
  const [menuOpen, setMenuOpen] = useState(false);

  const currentLeague =
    view.kind === 'league'
      ? view.leagueId
      : view.kind === 'club'
        ? world.clubs.find((c) => c.id === view.clubId)?.leagueId
        : undefined;

  const europe = world.leagues.filter((l) => COUNTRY_BY_ID[l.countryId].confederation === 'UEFA');
  const asia = world.leagues.filter((l) => COUNTRY_BY_ID[l.countryId].confederation === 'AFC');

  const leagueLink = (l: League) => (
    <button
      key={l.id}
      className={`side-item ${currentLeague === l.id ? 'sel' : ''} ${l.active ? '' : 'inactive'}`}
      onClick={() => {
        go({ kind: 'league', leagueId: l.id });
        setMenuOpen(false);
      }}
      title={l.active ? 'Liga aktif' : 'Liga versi ringan'}
    >
      <Flag id={l.countryId} /> {COUNTRY_BY_ID[l.countryId].name}
    </button>
  );

  const contLink = (confed: 'UEFA' | 'AFC') => (
    <button
      className={`side-item cont ${view.kind === 'continent' && view.confed === confed ? 'sel' : ''}`}
      onClick={() => {
        go({ kind: 'continent', confed });
        setMenuOpen(false);
      }}
    >
      🏆 Kompetisi {confed === 'UEFA' ? 'Eropa' : 'Asia'}
    </button>
  );

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          ☰
        </button>
        <button className="icon" disabled={!history.length} onClick={back} aria-label="Kembali">
          ←
        </button>
        <div className="brand">⚽ Football Player Life</div>
        <div className="top-meta muted">
          Seed <b>{world.seed}</b> · {num(world.players.length)} pemain · {world.clubs.length} klub
          {genMs > 0 && ` · ${genMs} ms`}
        </div>
        <SaveControls />
        <label className="dev-toggle hide-sm" title="Tampilkan angka tersembunyi (CA, PA, personality, hidden)">
          <input type="checkbox" checked={devMode} onChange={toggleDev} /> Mode developer
        </label>
        <button className="ghost" onClick={reset} title="Kembali ke layar awal (simpan dulu kalau perlu)">
          Menu utama
        </button>
      </header>
      <div className="layout">
        <nav className={`sidebar ${menuOpen ? 'open' : ''}`}>
          {career && (
            <button
              className={`side-item me ${view.kind === 'me' ? 'sel' : ''}`}
              onClick={() => {
                go({ kind: 'me' });
                setMenuOpen(false);
              }}
            >
              ⭐ Karier saya
              {pending > 0 && <span className="count">{pending}</span>}
            </button>
          )}
          {career && (
            <button
              className={`side-item me ${view.kind === 'life' ? 'sel' : ''}`}
              onClick={() => {
                go({ kind: 'life' });
                setMenuOpen(false);
              }}
            >
              🛍️ Kehidupan & belanja
            </button>
          )}
          <div className="side-title">Eropa</div>
          {contLink('UEFA')}
          {europe.map(leagueLink)}
          <div className="side-title">Asia</div>
          {contLink('AFC')}
          {asia.map(leagueLink)}
        </nav>
        <main className="main">
          {view.kind === 'league' && <LeagueView leagueId={view.leagueId} />}
          {view.kind === 'club' && <ClubView clubId={view.clubId} />}
          {view.kind === 'player' && <PlayerView key={view.playerId} playerId={view.playerId} />}
          {view.kind === 'me' && career && <MyCareerView />}
          {view.kind === 'life' && career && <LifeView />}
          {view.kind === 'continent' && <ContinentalView key={view.confed} confed={view.confed} />}
        </main>
      </div>
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

function LeagueView({ leagueId }: { leagueId: string }) {
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
          <h1>{league.name}</h1>
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

      <SeasonPanel leagueId={leagueId} />
      <CupPanel leagueId={leagueId} />

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
  const club = idx.clubById.get(clubId)!;
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
            <h1>{club.name}</h1>
            <div className="small">
              <Flag id={club.countryId} /> {club.city} ·{' '}
              <button className="link light" onClick={() => go({ kind: 'league', leagueId: league.id })}>
                {league.name}
              </button>
            </div>
          </div>
        </div>
      </div>

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
            Gaya: {manager.preferredStyle}
            {devMode && ` · MM ${manager.manManagement} · Youth ${manager.workingWithYoungsters} · Tak ${manager.tacticalKnowledge}`}
          </div>
        </InfoCard>
        <InfoCard label="Stadion">{num(club.stadiumCapacity)} kursi</InfoCard>
        <InfoCard label="Budget gaji">{money(club.finances.wageBudget)} / minggu</InfoCard>
        <InfoCard label="Fans">± {num(club.fanBase)}</InfoCard>
      </div>

      <ClubFixtures clubId={clubId} />

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
                <th className="hide-sm">Gaji/minggu</th>
                <th className="hide-sm">Kontrak</th>
              </tr>
            </thead>
            <tbody>
              {squad.map((p) => (
                <tr key={p.id} className="click" onClick={() => go({ kind: 'player', playerId: p.id })}>
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
                  <td className="hide-sm num">{money(p.contract?.wagePerWeek ?? 0)}</td>
                  <td className="hide-sm muted">{p.contract?.expires.slice(0, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
            <h1>{fullName(p)}</h1>
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
        <InfoCard label="Fisik">
          {p.heightCm} cm · {p.weightKg} kg
          <div className="muted small">
            Kaki kiri: {foot(p.leftFoot)} · kanan: {foot(p.rightFoot)}
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

function MyCareerView() {
  const career = useGame((s) => s.career)!;
  return (
    <CareerHome>
      <PlayerView key={career.playerId} playerId={career.playerId} />
    </CareerHome>
  );
}
