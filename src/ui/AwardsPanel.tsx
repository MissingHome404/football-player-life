// Panel Prestasi di beranda: trofi & penghargaan, lencana (special abilities) dengan progres,
// top skor liga musim ini, rekor yang bisa kamu kejar, dan peringkat Bintang Dunia.

import { useMemo, useState } from 'react';
import { useGame } from './store';
import { BADGES, badgeCtx, badgeReady, bonusText } from '../game/sim/badges';
import { AWARD_NAME, ageLabel, leagueLeaders, recordOf, type RecordKind } from '../game/sim/awards';
import { countryName } from '../game/sim/national';
import { fullName } from '../game/gen/names';
import type { RecordEntry } from '../game/types';
import { downloadCareerCsv } from './csv';

export function AwardsPanel() {
  const career = useGame((s) => s.career)!;
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const [allBadges, setAllBadges] = useState(false);
  const [showWorld, setShowWorld] = useState(false);
  const p = idx.playerById.get(career.playerId)!;
  const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
  const league = world.leagues.find((l) => (club ? l.id === club.leagueId : l.countryId === p.nationalityId && l.division === 1));
  const clubName = (id?: string) => (id ? (idx.clubById.get(id)?.name ?? '') : '');

  const ctx = useMemo(() => badgeCtx(career, p), [career, p]);
  const have = new Set(career.badges ?? []);
  const badges = BADGES.filter((b) => !b.only || b.only(p) || have.has(b.id));
  const shown = allBadges ? badges : badges.filter((b) => have.has(b.id));

  const leaders = useMemo(() => (league ? leagueLeaders(world, league.id, 5) : null), [world, league]);
  const myRow = league ? world.ledger?.[league.id]?.rows[p.id] : undefined;
  const myRank = useMemo(() => {
    const rows = league ? world.ledger?.[league.id]?.rows : undefined;
    if (!rows || !myRow || !myRow[1]) return null;
    return Object.values(rows).filter((r) => r[1] > myRow[1]).length + 1;
  }, [world, league, myRow]);

  const honours = [
    ...(career.trophies ?? []).map((t) => ({ key: `t-${t.id}`, icon: '🏆', title: `${t.name} ${t.season}`, sub: t.team })),
    ...(career.awards ?? []).map((a) => ({ key: `a-${a.id}`, icon: '🏅', title: `${a.name} ${a.season}`, sub: a.detail })),
  ].reverse();

  const lastAwards = useMemo(() => {
    const list = (world.awards ?? []).filter((a) => a.scope === league?.id);
    const season = list[0]?.season;
    return list.filter((a) => a.season === season).reverse();
  }, [world, league]);

  type Rec = { kind: RecordKind; key: string; label: string; mine?: number };
  const recs: Rec[] = [];
  if (league) {
    recs.push({ kind: 'seasonGoals', key: league.id, label: `Gol semusim · ${league.name}`, mine: myRow?.[1] ?? 0 });
    recs.push({ kind: 'youngest', key: league.id, label: `Pencetak gol termuda · ${league.name}` });
  }
  if (club) recs.push({ kind: 'clubGoals', key: club.id, label: `Gol liga untuk ${club.name}`, mine: world.tallies?.club[`${club.id}|${p.id}`] ?? 0 });
  const cname = countryName(p.nationalityId);
  recs.push({ kind: 'natGoals', key: p.nationalityId, label: `Gol Timnas ${cname}`, mine: career.intl?.goals ?? 0 });
  recs.push({ kind: 'natCaps', key: p.nationalityId, label: `Caps Timnas ${cname}`, mine: career.intl?.caps ?? 0 });
  const fmt = (kind: RecordKind, v: number) => (kind === 'youngest' ? ageLabel(v) : kind === 'natCaps' ? `${v} caps` : `${v} gol`);
  const holder = (r: RecordEntry) => (r.playerId === p.id ? 'Kamu' : r.name);

  const wa = world.worldAward;
  return (
    <section className="panel awards">
      <h2>Prestasi</h2>

      {honours.length ? (
        <ul className="aw-list small">
          {honours.map((h) => (
            <li key={h.key}>
              <span aria-hidden>{h.icon}</span>
              <span>
                <b>{h.title}</b>
                {h.sub && <span className="muted"> · {h.sub}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Belum ada trofi atau penghargaan. Juara liga, top skor, dan pemain terbaik musim akan tercatat di sini.</p>
      )}

      <h3 className="aw-h">
        Lencana {have.size}/{badges.length}
        <span className="muted small"> · tiap lencana: bonus kecil di laga, nilai pasar +5%</span>
      </h3>
      {shown.length > 0 && (
        <div className="bdg-grid">
          {shown.map((b) => {
            const on = have.has(b.id);
            const needs = b.needs(ctx);
            return (
              <div key={b.id} className={`bdg ${on ? 'on' : ''}`} title={b.desc}>
                <div className="bdg-head">
                  <span className="bdg-icon" aria-hidden>
                    {b.icon}
                  </span>
                  <b>{b.name}</b>
                </div>
                {on ? (
                  <div className="small bdg-bonus">{bonusText(b)}</div>
                ) : (
                  <ul className="bdg-needs small">
                    {needs.map((n) => (
                      <li key={n.label}>
                        <span>{n.label}</span>
                        <span className={`num ${n.cur >= n.goal ? 'ok' : ''}`}>
                          {Math.min(n.cur, n.goal)}/{n.goal}
                        </span>
                        <span className="bdg-bar" aria-hidden>
                          <i style={{ width: `${Math.min(100, (n.cur / n.goal) * 100)}%` }} />
                        </span>
                      </li>
                    ))}
                    {!badgeReady(b, ctx) && b.only && !b.only(p) && <li className="muted">Tidak untuk posisimu</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      <button className="link nt-toggle" onClick={() => setAllBadges(!allBadges)} aria-expanded={allBadges}>
        {allBadges ? '▾ Sembunyikan lencana yang belum terbuka' : `▸ Lihat semua lencana & syaratnya`}
      </button>

      {league && leaders && leaders.scorers.length > 0 && (
        <>
          <h3 className="aw-h">
            Top skor {league.name} {leaders.season}
          </h3>
          <ol className="aw-top small">
            {leaders.scorers.map((x, i) => (
              <li key={x.pid} className={x.pid === p.id ? 'mine' : ''}>
                <span className="muted num">{i + 1}.</span>
                <span>
                  {x.pid === p.id ? 'Kamu' : fullName(x.p!)} <span className="muted">· {clubName(x.clubId)}</span>
                </span>
                <b className="num">{x.goals}</b>
              </li>
            ))}
          </ol>
          {myRow && !leaders.scorers.some((x) => x.pid === p.id) && (
            <p className="small muted">
              Kamu: {myRow[1]} gol, {myRow[2]} assist dari {myRow[0]} laga{myRank ? ` (peringkat ${myRank} top skor)` : ''}
            </p>
          )}
        </>
      )}
      {lastAwards.length > 0 && (
        <p className="small aw-last">
          <span className="muted">Penghargaan musim {lastAwards[0].season}:</span>{' '}
          {lastAwards.map((a, i) => (
            <span key={a.kind} className={a.playerId === p.id ? 'mine' : ''}>
              {i > 0 && ' · '}
              {AWARD_NAME[a.kind]} <b>{a.playerId === p.id ? 'Kamu' : a.name}</b>
            </span>
          ))}
        </p>
      )}

      <h3 className="aw-h">Rekor</h3>
      <ul className="rec-list small">
        {recs.map((x) => {
          const r = recordOf(world, x.kind, x.key);
          return (
            <li key={x.kind} className={r.playerId === p.id ? 'mine' : ''}>
              <span className="muted rec-label">{x.label}</span>
              <span>
                <b>{fmt(x.kind, r.value)}</b> · {holder(r)} <span className="muted">({r.year})</span>
              </span>
              {x.mine !== undefined && r.playerId !== p.id && (
                <span className="rec-me">
                  Kamu: <b className="num">{x.mine}</b>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {wa && (
        <>
          <button className="link nt-toggle" onClick={() => setShowWorld(!showWorld)} aria-expanded={showWorld}>
            {showWorld ? '▾' : '▸'} Bintang Dunia {wa.year}: {wa.top[0]?.playerId === p.id ? 'Kamu!' : wa.top[0]?.name}
          </button>
          {showWorld && (
            <div className="aw-world">
              <ol className="aw-top small">
                {wa.top.map((c, i) => (
                  <li key={c.playerId} className={c.playerId === p.id ? 'mine' : ''}>
                    <span className="muted num">{i + 1}.</span>
                    <span>
                      {c.playerId === p.id ? 'Kamu' : c.name} <span className="muted">· {clubName(c.clubId)}</span>
                    </span>
                    <span className="muted num">
                      {c.goals} gol · {c.avg.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ol>
              {wa.young.length > 0 && (
                <p className="small">
                  <span className="muted">Bintang Muda Dunia:</span> <b>{wa.young[0].playerId === p.id ? 'Kamu' : wa.young[0].name}</b>{' '}
                  <span className="muted">· {clubName(wa.young[0].clubId)}</span>
                </p>
              )}
            </div>
          )}
        </>
      )}
      {!career.retired && (
        <button className="link nt-toggle" onClick={() => downloadCareerCsv(world, career, p)}>
          ⬇ Unduh statistik karier (CSV untuk FM)
        </button>
      )}
    </section>
  );
}
