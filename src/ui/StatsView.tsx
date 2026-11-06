// Statistik lengkap: top skor, assist, rating, clean sheet semua pemain per liga (atau semua liga),
// plus sejarah juara liga, piala, penghargaan musim, dan rekor liga.

import { useMemo, useState } from 'react';
import { useGame } from './store';
import { Badge, Flag } from './components';
import { PageTitle } from './CareerHome';
import { COUNTRY_BY_ID, flagOf } from '../game/data/countries';
import { fullName } from '../game/gen/names';
import { AWARD_NAME, ageLabel, recordOf } from '../game/sim/awards';
import type { Player } from '../game/types';

type Sort = 'goals' | 'assists' | 'ga' | 'rating' | 'cs' | 'apps';
const SORTS: [Sort, string][] = [
  ['goals', 'Top skor'],
  ['assists', 'Assist'],
  ['ga', 'Gol + assist'],
  ['rating', 'Rating'],
  ['cs', 'Clean sheet'],
  ['apps', 'Penampilan'],
];
const PAGE = 50;

interface StatRow {
  p: Player;
  clubId: string;
  apps: number;
  goals: number;
  assists: number;
  avg: number;
  cs: number;
}

/** Tabel statistik pemain satu liga ('all' = gabungan semua liga) */
export function LeagueStats({ leagueId }: { leagueId: string }) {
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const [sort, setSort] = useState<Sort>('goals');
  const [limit, setLimit] = useState(PAGE);

  const { rows, season, partial } = useMemo(() => {
    const ledgers = leagueId === 'all' ? Object.values(world.ledger ?? {}) : [world.ledger?.[leagueId]].filter((x) => !!x);
    const merged = new Map<string, StatRow & { sum: number }>();
    for (const led of ledgers) {
      for (const [pid, r] of Object.entries(led.rows)) {
        const p = idx.playerById.get(pid);
        if (!p || !r[0]) continue;
        const m = merged.get(pid);
        if (m) {
          m.apps += r[0];
          m.goals += r[1];
          m.assists += r[2];
          m.sum += r[3];
          m.cs += r[5];
        } else merged.set(pid, { p, clubId: r[4], apps: r[0], goals: r[1], assists: r[2], sum: r[3], avg: 0, cs: r[5] });
      }
    }
    const rows = [...merged.values()].map((r) => ({ ...r, avg: r.sum / r.apps }));
    return {
      rows,
      season: leagueId === 'all' ? '' : (world.ledger?.[leagueId]?.season ?? ''),
      partial: ledgers.some((l) => l.partial),
    };
  }, [world, idx, leagueId]);

  const sorted = useMemo(() => {
    const maxApps = rows.reduce((a, r) => Math.max(a, r.apps), 0);
    const minApps = Math.max(1, Math.round(maxApps * 0.4));
    const list = sort === 'rating' ? rows.filter((r) => r.apps >= minApps) : sort === 'cs' ? rows.filter((r) => r.cs > 0) : rows;
    const key: Record<Sort, (r: StatRow) => number> = {
      goals: (r) => r.goals * 1000 - r.apps,
      assists: (r) => r.assists * 1000 - r.apps,
      ga: (r) => (r.goals + r.assists) * 1000 - r.apps,
      rating: (r) => r.avg,
      cs: (r) => r.cs * 1000 - r.apps,
      apps: (r) => r.apps * 1000 + r.goals,
    };
    return [...list].sort((a, b) => key[sort](b) - key[sort](a));
  }, [rows, sort]);

  if (!rows.length) {
    return <p className="muted small">Belum ada statistik pemain musim ini. Statistik terisi setelah pekan pertama dimainkan.</p>;
  }
  const shown = sorted.slice(0, limit);
  return (
    <div>
      <div className="chips stat-sorts">
        {SORTS.map(([k, label]) => (
          <button key={k} className={`chip ${sort === k ? 'sel' : ''}`} onClick={() => setSort(k)}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted small">
        {season && `Musim ${season} · `}
        {rows.length} pemain sudah bermain
        {sort === 'rating' && ' · minimal 40% penampilan pemain terbanyak'}
        {partial && ' · game dimulai di tengah musim, jadi angka musim ini belum penuh'}
      </p>
      <div className="table-wrap">
        <table className="tbl stat-tbl">
          <thead>
            <tr>
              <th>#</th>
              <th className="left">Pemain</th>
              <th className="left hide-sm">Klub</th>
              <th className={sort === 'apps' ? 'on' : ''}>Main</th>
              <th className={sort === 'goals' || sort === 'ga' ? 'on' : ''}>Gol</th>
              <th className={sort === 'assists' || sort === 'ga' ? 'on' : ''}>Ast</th>
              <th className={sort === 'rating' ? 'on' : ''}>Rating</th>
              <th className={sort === 'cs' ? 'on' : ''}>CS</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const club = idx.clubById.get(r.clubId);
              return (
                <tr key={r.p.id} className={`click ${r.p.isUser ? 'mine' : ''}`} onClick={() => go({ kind: 'player', playerId: r.p.id })}>
                  <td className="num muted">{i + 1}</td>
                  <td className="left">
                    <span className="pos">{r.p.mainPosition}</span>
                    <Flag id={r.p.nationalityId} /> <b>{r.p.isUser ? 'Kamu' : fullName(r.p)}</b>
                  </td>
                  <td className="left hide-sm">
                    {club && (
                      <span className="club-cell">
                        <Badge club={club} size={18} /> {club.name}
                      </span>
                    )}
                  </td>
                  <td className="num">{r.apps}</td>
                  <td className="num">{r.goals}</td>
                  <td className="num">{r.assists}</td>
                  <td className="num">{r.avg.toFixed(2)}</td>
                  <td className="num">{r.cs}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <button className="ghost more-btn" onClick={() => setLimit(limit + PAGE * 2)}>
          Tampilkan lebih banyak ({sorted.length - limit} lagi)
        </button>
      )}
    </div>
  );
}

/** Sejarah juara, penghargaan, dan rekor satu liga */
export function LeagueHistory({ leagueId }: { leagueId: string }) {
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const clubName = (id?: string) => (id ? (idx.clubById.get(id)?.name ?? '-') : '-');
  const champs = world.honours.filter((h) => h.leagueId === leagueId).reverse();
  const cups = (world.cupHonours ?? []).filter((h) => h.leagueId === leagueId).reverse();
  const awards = (world.awards ?? []).filter((a) => a.scope === leagueId);
  const bySeason = new Map<string, typeof awards>();
  for (const a of awards) bySeason.set(a.season, [...(bySeason.get(a.season) ?? []), a]);
  const recGoals = recordOf(world, 'seasonGoals', leagueId);
  const recYoung = recordOf(world, 'youngest', leagueId);
  return (
    <div className="two-col">
      <section className="panel">
        <h2>Juara</h2>
        {champs.length || cups.length ? (
          <table className="tbl small">
            <thead>
              <tr>
                <th className="left">Musim</th>
                <th className="left">Liga</th>
                <th className="left">Piala</th>
              </tr>
            </thead>
            <tbody>
              {[...new Set([...champs.map((h) => h.season), ...cups.map((h) => h.season)])].map((season) => (
                <tr key={season}>
                  <td className="left muted">{season}</td>
                  <td className="left strong">{clubName(champs.find((h) => h.season === season)?.championId)}</td>
                  <td className="left">{clubName(cups.find((h) => h.season === season)?.winnerId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small">Belum ada musim yang selesai.</p>
        )}
      </section>
      <section className="panel">
        <h2>Penghargaan & rekor</h2>
        <ul className="rec-list small">
          <li>
            <span className="muted rec-label">Gol semusim terbanyak</span>
            <span>
              <b>{recGoals.value} gol</b> · {recGoals.name} <span className="muted">({recGoals.year})</span>
            </span>
          </li>
          <li>
            <span className="muted rec-label">Pencetak gol termuda</span>
            <span>
              <b>{ageLabel(recYoung.value)}</b> · {recYoung.name} <span className="muted">({recYoung.year})</span>
            </span>
          </li>
        </ul>
        {bySeason.size > 0 ? (
          [...bySeason].map(([season, list]) => (
            <div key={season} className="aw-season small">
              <h3>Musim {season}</h3>
              {list.map((a) => (
                <div key={a.kind}>
                  <span className="muted">{AWARD_NAME[a.kind]}:</span> <b>{a.name}</b>
                  {a.clubId && <span className="muted"> · {clubName(a.clubId)}</span>}
                  {a.value && <span className="muted"> · {a.value}</span>}
                </div>
              ))}
            </div>
          ))
        ) : (
          <p className="muted small">Penghargaan pemain terbaik, top skor, dan pemain muda terbaik dibagikan tiap akhir musim.</p>
        )}
      </section>
    </div>
  );
}

export function StatsView({ leagueId }: { leagueId?: string }) {
  const world = useGame((s) => s.world)!;
  const career = useGame((s) => s.career);
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const user = career ? idx.playerById.get(career.playerId) : undefined;
  const myClub = user?.contract ? idx.clubById.get(user.contract.clubId) : undefined;
  const def = myClub?.leagueId ?? world.leagues.find((l) => l.countryId === user?.nationalityId)?.id ?? world.leagues[0].id;
  const id = leagueId ?? def;
  const league = world.leagues.find((l) => l.id === id);
  const wa = world.worldAward;
  return (
    <div>
      <PageTitle
        title="Statistik & top skor"
        sub={league ? `${flagOf(league.countryId)} ${league.name}` : 'Semua liga digabung'}
        right={
          <label className="field inline">
            <span>Liga</span>
            <select value={id} onChange={(e) => go({ kind: 'stats', leagueId: e.target.value })}>
              <option value="all">🌍 Semua liga</option>
              {world.leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {flagOf(l.countryId)} {COUNTRY_BY_ID[l.countryId].name} · {l.name}
                </option>
              ))}
            </select>
          </label>
        }
      />
      <section className="panel">
        <LeagueStats key={id} leagueId={id} />
      </section>
      {league && <LeagueHistory leagueId={league.id} />}
      {wa && (
        <section className="panel">
          <h2>Bintang Dunia {wa.year}</h2>
          <ol className="aw-top small">
            {wa.top.map((c, i) => (
              <li key={c.playerId} className={`click ${c.playerId === user?.id ? 'mine' : ''}`} onClick={() => go({ kind: 'player', playerId: c.playerId })}>
                <span className="muted num">{i + 1}.</span>
                <span>
                  {c.playerId === user?.id ? 'Kamu' : c.name} <span className="muted">· {idx.clubById.get(c.clubId ?? '')?.name}</span>
                </span>
                <span className="muted num">
                  {c.goals} gol · {c.avg.toFixed(2)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
