// Halaman Timnas: pilih negara mana saja, lihat skuad senior/U-20 (perkiraan pilihan pelatih),
// caps & gol tiap pemain, top skor & caps sepanjang masa, kualifikasi, turnamen, dan juara.

import { useMemo, useState } from 'react';
import { useGame } from './store';
import { Badge, Stars, caStars } from './components';
import { PageTitle } from './CareerHome';
import { NationalPanel, NatCompetitions } from './NationalPanel';
import { COUNTRIES, COUNTRY_BY_ID, flagOf } from '../game/data/countries';
import { ageOn } from '../game/gen/player';
import { fullName } from '../game/gen/names';
import { POSITIONS, type Position } from '../game/data/attributes';
import { countryName, nationalSquad, natStrength, U20_AGE } from '../game/sim/national';
import { recordOf } from '../game/sim/awards';
import type { Player } from '../game/types';

const POS_ORDER = Object.fromEntries(POSITIONS.map((p, i) => [p, i])) as Record<Position, number>;

export function NationalView({ countryId }: { countryId?: string }) {
  const world = useGame((s) => s.world)!;
  const career = useGame((s) => s.career);
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const user = career ? idx.playerById.get(career.playerId) : undefined;
  const mine = user?.nationalityId;
  const country = countryId ?? mine ?? world.leagues[0].countryId;
  const today = career?.currentDate ?? world.startDate;
  const [team, setTeam] = useState<'senior' | 'u20'>('senior');
  const conf = COUNTRY_BY_ID[country]?.confederation;

  // negara yang punya pemain di dunia game
  const options = useMemo(() => {
    const have = new Set(world.players.map((p) => p.nationalityId));
    return COUNTRIES.filter((c) => have.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [world]);

  const squad = useMemo(
    () =>
      nationalSquad(world, country, team, today, user, career ?? undefined).sort(
        (a, b) => POS_ORDER[a.mainPosition] - POS_ORDER[b.mainPosition] || b.ca - a.ca,
      ),
    [world, country, team, today, user, career],
  );
  const strength = useMemo(() => natStrength(world, country, 'senior', today), [world, country, today]);

  const t = world.tallies;
  const capsOf = (p: Player) => (p.isUser ? (career?.intl?.caps ?? 0) : (t?.natCaps[p.id] ?? 0));
  const goalsOf = (p: Player) => (p.isUser ? (career?.intl?.goals ?? 0) : (t?.natGoals[p.id] ?? 0));

  // top skor & caps sepanjang masa dari pemain yang masih ada di dunia game
  const allTime = useMemo(() => {
    const pool = world.players.filter((p) => p.nationalityId === country);
    const withUser = user && user.nationalityId === country ? [...pool.filter((p) => p.id !== user.id), user] : pool;
    const rows = withUser.map((p) => ({ p, caps: capsOf(p), goals: goalsOf(p) })).filter((r) => r.caps > 0);
    return {
      goals: [...rows].filter((r) => r.goals > 0).sort((a, b) => b.goals - a.goals || a.caps - b.caps).slice(0, 10),
      caps: [...rows].sort((a, b) => b.caps - a.caps || b.goals - a.goals).slice(0, 10),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, country, user, career]);

  const recGoals = recordOf(world, 'natGoals', country);
  const recCaps = recordOf(world, 'natCaps', country);
  const titles = (world.intl?.history ?? []).filter((h) => h.champion === country);

  return (
    <div>
      <PageTitle
        title={`${flagOf(country)} Timnas ${countryName(country)}`}
        sub={
          <>
            {conf} · Kekuatan <Stars value={caStars(strength)} />
            {titles.length > 0 && ` · ${titles.length} gelar: ${titles.map((h) => h.name).join(', ')}`}
          </>
        }
        right={
          <label className="field inline">
            <span>Negara</span>
            <select value={country} onChange={(e) => go({ kind: 'national', countryId: e.target.value })}>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {flagOf(c.id)} {c.name}
                  {c.id === mine ? ' (negaramu)' : ''}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {country === mine && career && !career.retired && <NationalPanel />}

      <section className="panel">
        <div className="card-head">
          <h2>Skuad {team === 'senior' ? 'senior' : 'U-20'}</h2>
          <div className="chips">
            <button className={`chip ${team === 'senior' ? 'sel' : ''}`} onClick={() => setTeam('senior')}>
              Senior
            </button>
            <button className={`chip ${team === 'u20' ? 'sel' : ''}`} onClick={() => setTeam('u20')}>
              U-20
            </button>
          </div>
        </div>
        <p className="muted small">
          {squad.length} pemain terbaik {team === 'u20' ? `berumur ${U20_AGE} tahun ke bawah ` : ''}pilihan pelatih saat ini. Skuad bisa
          berubah tiap jeda internasional sesuai performa.
        </p>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Pos</th>
                <th className="left">Nama</th>
                <th>Umur</th>
                <th className="left">Klub</th>
                <th>Caps</th>
                <th>Gol</th>
                <th>Kemampuan</th>
              </tr>
            </thead>
            <tbody>
              {squad.map((p) => {
                const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
                return (
                  <tr key={p.id} className={`click ${p.isUser ? 'mine' : ''}`} onClick={() => go({ kind: 'player', playerId: p.id })}>
                    <td>
                      <span className="pos">{p.mainPosition}</span>
                    </td>
                    <td className="left strong">{p.isUser ? `${fullName(p)} (kamu)` : fullName(p)}</td>
                    <td>{ageOn(p.birthDate, today)}</td>
                    <td className="left">
                      {club ? (
                        <span className="club-cell">
                          <Badge club={club} size={18} /> {club.name}
                        </span>
                      ) : (
                        <span className="muted">Tanpa klub</span>
                      )}
                    </td>
                    <td className="num">{capsOf(p)}</td>
                    <td className="num">{goalsOf(p)}</td>
                    <td>
                      <Stars value={caStars(p.ca)} />
                    </td>
                  </tr>
                );
              })}
              {!squad.length && (
                <tr>
                  <td colSpan={7} className="muted small left">
                    Belum ada pemain yang memenuhi syarat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Kualifikasi & turnamen</h2>
        <NatCompetitions country={country} />
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>Top skor timnas</h2>
          <p className="small">
            Rekor: <b>{recGoals.value} gol</b> · {recGoals.name} <span className="muted">({recGoals.year})</span>
          </p>
          <AllTimeList rows={allTime.goals} value={(r) => `${r.goals} gol`} sub={(r) => `${r.caps} caps`} empty="Belum ada gol tercatat." />
        </section>
        <section className="panel">
          <h2>Caps terbanyak</h2>
          <p className="small">
            Rekor: <b>{recCaps.value} caps</b> · {recCaps.name} <span className="muted">({recCaps.year})</span>
          </p>
          <AllTimeList rows={allTime.caps} value={(r) => `${r.caps} caps`} sub={(r) => `${r.goals} gol`} empty="Belum ada laga tercatat." />
        </section>
      </div>

      {world.intl && world.intl.history.length > 0 && (
        <section className="panel">
          <h2>Juara turnamen antarnegara</h2>
          <table className="tbl small">
            <thead>
              <tr>
                <th className="left">Turnamen</th>
                <th className="left">Juara</th>
                <th className="left">Runner-up</th>
              </tr>
            </thead>
            <tbody>
              {world.intl.history.map((h) => (
                <tr key={h.id} className={h.champion === country || h.runnerUp === country ? 'mine' : ''}>
                  <td className="left">{h.name}</td>
                  <td className="left strong">
                    {flagOf(h.champion)} {countryName(h.champion)}
                  </td>
                  <td className="left">
                    {flagOf(h.runnerUp)} {countryName(h.runnerUp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

type Row = { p: Player; caps: number; goals: number };
function AllTimeList({ rows, value, sub, empty }: { rows: Row[]; value: (r: Row) => string; sub: (r: Row) => string; empty: string }) {
  const go = useGame((s) => s.go);
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (
    <ol className="aw-top small">
      {rows.map((r, i) => (
        <li key={r.p.id} className={`click ${r.p.isUser ? 'mine' : ''}`} onClick={() => go({ kind: 'player', playerId: r.p.id })}>
          <span className="muted num">{i + 1}.</span>
          <span>
            {r.p.isUser ? 'Kamu' : fullName(r.p)} <span className="muted">· {sub(r)}</span>
          </span>
          <b className="num">{value(r)}</b>
        </li>
      ))}
    </ol>
  );
}
