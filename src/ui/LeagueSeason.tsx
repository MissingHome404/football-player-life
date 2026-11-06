// Klasemen, hasil, dan jadwal liga.

import { useGame } from './store';
import { Badge } from './components';
import { lastPlayedRound, roundDate, standings } from '../game/sim/season';
import { currentRound, tieWinner } from '../game/sim/cup';
import type { CupRound, CupTie, LeagueSeason, World } from '../game/types';

export const shortDate = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Pertandingan liga berikutnya untuk sebuah klub (setelah tanggal tertentu) */
export function nextFixture(world: World, clubId: string, after: string) {
  const club = world.clubs.find((c) => c.id === clubId);
  const s = club && world.seasons[club.leagueId];
  if (!s) return null;
  const me = s.clubs.indexOf(clubId);
  for (let r = 0; r < s.rounds.length; r++) {
    const date = roundDate(s, r);
    if (date <= after) continue;
    const f = s.rounds[r].find(([h, a]) => h === me || a === me);
    if (!f) continue;
    const home = f[0] === me;
    return { date, round: r + 1, home, opponentId: s.clubs[home ? f[1] : f[0]], season: s };
  }
  return null;
}

function Fixture({ s, r, i, played }: { s: LeagueSeason; r: number; i: number; played: boolean }) {
  const idx = useGame((st) => st.idx)!;
  const go = useGame((st) => st.go);
  const myClub = useGame((st) => (st.career ? st.idx?.playerById.get(st.career.playerId)?.contract?.clubId : undefined));
  const [h, a] = s.rounds[r][i];
  const home = idx.clubById.get(s.clubs[h])!;
  const away = idx.clubById.get(s.clubs[a])!;
  const res = s.results[r][i];
  const mine = home.id === myClub || away.id === myClub;
  return (
    <li className={`fx ${mine ? 'mine' : ''}`}>
      <button className="fx-team home" onClick={() => go({ kind: 'club', clubId: home.id })}>
        <span className="fx-name">{home.name}</span>
        <Badge club={home} size={18} />
      </button>
      <span className="fx-score num">{played && res ? `${res[0]} - ${res[1]}` : 'vs'}</span>
      <button className="fx-team" onClick={() => go({ kind: 'club', clubId: away.id })}>
        <Badge club={away} size={18} />
        <span className="fx-name">{away.name}</span>
      </button>
    </li>
  );
}

export function SeasonPanel({ leagueId }: { leagueId: string }) {
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const myClub = useGame((s) => (s.career ? s.idx?.playerById.get(s.career.playerId)?.contract?.clubId : undefined));
  const s = world.seasons[leagueId];
  if (!s) return null;
  const table = standings(s, (id) => idx.clubById.get(id)?.name ?? id);
  const last = lastPlayedRound(s);
  const next = last + 1 < s.rounds.length ? last + 1 : -1;
  const lastHonour = [...world.honours].reverse().find((h) => h.leagueId === leagueId);
  const started = last >= 0;

  return (
    <section className="panel">
      <div className="season-head">
        <h2>Musim {s.label}</h2>
        <span className="muted small">
          {started
            ? `Pekan ${last + 1} dari ${s.rounds.length}`
            : `Dimulai ${shortDate(s.startDate)} ${s.startDate.slice(0, 4)}`}
          {lastHonour && (
            <>
              {' · '}Juara {lastHonour.season}: <b>{idx.clubById.get(lastHonour.championId)?.name}</b>
            </>
          )}
        </span>
      </div>
      <div className="season-grid">
        <div className="table-wrap">
          <table className="tbl standings">
            <thead>
              <tr>
                <th>#</th>
                <th></th>
                <th className="left">Klub</th>
                <th>Main</th>
                <th className="hide-sm">M</th>
                <th className="hide-sm">S</th>
                <th className="hide-sm">K</th>
                <th className="hide-sm">Gol</th>
                <th>SG</th>
                <th>Poin</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r, i) => {
                const c = idx.clubById.get(r.clubId)!;
                return (
                  <tr
                    key={r.clubId}
                    className={`click ${r.clubId === myClub ? 'mine' : ''}`}
                    onClick={() => go({ kind: 'club', clubId: c.id })}
                  >
                    <td className="num">{i + 1}</td>
                    <td>
                      <Badge club={c} size={20} />
                    </td>
                    <td className="left strong">{c.name}</td>
                    <td className="num">{r.p}</td>
                    <td className="num hide-sm">{r.w}</td>
                    <td className="num hide-sm">{r.d}</td>
                    <td className="num hide-sm">{r.l}</td>
                    <td className="num hide-sm">
                      {r.gf}:{r.ga}
                    </td>
                    <td className="num">{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga}</td>
                    <td className="num strong">{r.pts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="fixtures">
          {last >= 0 && (
            <>
              <h3>
                Hasil pekan {last + 1} · {shortDate(roundDate(s, last))}
              </h3>
              <ul className="fx-list">
                {s.rounds[last].map((_, i) => (
                  <Fixture key={i} s={s} r={last} i={i} played />
                ))}
              </ul>
            </>
          )}
          {next >= 0 && (
            <>
              <h3>
                Pekan {next + 1} · {shortDate(roundDate(s, next))}
              </h3>
              <ul className="fx-list">
                {s.rounds[next].map((_, i) => (
                  <Fixture key={i} s={s} r={next} i={i} played={false} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** Hasil terakhir dan jadwal berikutnya sebuah klub */
export function ClubFixtures({ clubId }: { clubId: string }) {
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const club = idx.clubById.get(clubId)!;
  const s = world.seasons[club.leagueId];
  if (!s) return null;
  const me = s.clubs.indexOf(clubId);
  const games: { r: number; home: boolean; opp: string; res: [number, number] | null }[] = [];
  s.rounds.forEach((round, r) => {
    const i = round.findIndex(([h, a]) => h === me || a === me);
    if (i < 0) return;
    const [h, a] = round[i];
    const home = h === me;
    games.push({ r, home, opp: s.clubs[home ? a : h], res: s.results[r][i] });
  });
  const played = games.filter((g) => g.res).slice(-5).reverse();
  const upcoming = games.filter((g) => !g.res).slice(0, 3);
  const pos = standings(s).findIndex((r) => r.clubId === clubId) + 1;
  const row = (g: (typeof games)[number]) => {
    const opp = idx.clubById.get(g.opp)!;
    let cls = '';
    let score = '';
    if (g.res) {
      const [mine, theirs] = g.home ? g.res : [g.res[1], g.res[0]];
      cls = mine > theirs ? 'win' : mine < theirs ? 'loss-r' : 'draw';
      score = `${mine}-${theirs}`;
    }
    return (
      <li key={g.r} className="cf-row click" onClick={() => go({ kind: 'club', clubId: opp.id })}>
        <span className="muted small cf-date">{shortDate(roundDate(s, g.r))}</span>
        <span className="pill">{g.home ? 'K' : 'T'}</span>
        <Badge club={opp} size={18} />
        <span className="cf-opp">{opp.name}</span>
        {g.res ? <span className={`res ${cls}`}>{score}</span> : <span className="muted small">pekan {g.r + 1}</span>}
      </li>
    );
  };
  return (
    <section className="panel">
      <div className="season-head">
        <h2>Musim {s.label}</h2>
        {played.length > 0 && <span className="muted small">Posisi ke-{pos} di klasemen</span>}
      </div>
      <div className="two-col">
        <div>
          <h3>Hasil terakhir</h3>
          {played.length ? <ul className="cf-list">{played.map(row)}</ul> : <p className="muted small">Musim belum dimulai.</p>}
        </div>
        <div>
          <h3>Jadwal berikutnya</h3>
          {upcoming.length ? <ul className="cf-list">{upcoming.map(row)}</ul> : <p className="muted small">Musim sudah selesai.</p>}
        </div>
      </div>
    </section>
  );
}

function CupTieRow({ t }: { t: CupTie }) {
  const idx = useGame((st) => st.idx)!;
  const go = useGame((st) => st.go);
  const myClub = useGame((st) => (st.career ? st.idx?.playerById.get(st.career.playerId)?.contract?.clubId : undefined));
  const home = idx.clubById.get(t.home);
  const away = idx.clubById.get(t.away);
  if (!home || !away) return null;
  const won = tieWinner(t);
  return (
    <li className={`fx ${home.id === myClub || away.id === myClub ? 'mine' : ''}`}>
      <button className={`fx-team home ${won === home.id ? 'strong' : ''}`} onClick={() => go({ kind: 'club', clubId: home.id })}>
        <span className="fx-name">{home.name}</span>
        <Badge club={home} size={18} />
      </button>
      <span className="fx-score num">
        {t.score ? `${t.score[0]} - ${t.score[1]}` : 'vs'}
        {t.pens && <span className="muted small fx-pens">pen {t.pens.join('-')}</span>}
      </span>
      <button className={`fx-team ${won === away.id ? 'strong' : ''}`} onClick={() => go({ kind: 'club', clubId: away.id })}>
        <Badge club={away} size={18} />
        <span className="fx-name">{away.name}</span>
      </button>
    </li>
  );
}

function CupRoundList({ r }: { r: CupRound }) {
  const idx = useGame((st) => st.idx)!;
  return (
    <>
      <h3>
        {r.name} · {shortDate(r.date)}
        {r.name === 'Final' && <span className="muted small"> · tempat netral</span>}
      </h3>
      <ul className="fx-list">
        {r.ties.map((t) => (
          <CupTieRow key={`${t.home}-${t.away}`} t={t} />
        ))}
      </ul>
      {!!r.byes?.length && (
        <p className="muted small">Langsung lolos: {r.byes.map((id) => idx.clubById.get(id)?.name ?? id).join(', ')}</p>
      )}
    </>
  );
}

/** Piala domestik negara liga ini: babak terakhir, babak berikutnya, dan juara */
export function CupPanel({ leagueId }: { leagueId: string }) {
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const cup = world.cups?.[leagueId];
  if (!cup) return null;
  const cur = currentRound(cup);
  const done = cup.rounds.filter((r) => r.ties.length && r.ties.every((t) => t.score));
  const last = done[done.length - 1];
  const next = cur >= 0 ? cup.rounds[cur] : undefined;
  const prev = [...(world.cupHonours ?? [])].reverse().find((h) => h.leagueId === leagueId && h.season !== cup.season);
  const earlier = done.slice(0, -1).reverse();
  return (
    <section className="panel">
      <div className="season-head">
        <h2>
          🏆 {cup.name} {cup.season}
        </h2>
        <span className="muted small">
          {cup.winner ? (
            <>
              Juara: <b>{idx.clubById.get(cup.winner)?.name}</b>
            </>
          ) : next ? (
            `Berikutnya: ${next.name} · ${shortDate(next.date)}`
          ) : null}
          {prev && (
            <>
              {' · '}Juara {prev.season}: <b>{idx.clubById.get(prev.winnerId)?.name}</b>
            </>
          )}
        </span>
      </div>
      <div className="two-col">
        <div>{last ? <CupRoundList r={last} /> : <p className="muted small">Piala belum dimulai.</p>}</div>
        <div>{next && next.ties.length > 0 ? <CupRoundList r={next} /> : null}</div>
      </div>
      {earlier.length > 0 && (
        <details className="cup-earlier">
          <summary className="small">Babak sebelumnya</summary>
          {earlier.map((r) => (
            <CupRoundList key={r.name} r={r} />
          ))}
        </details>
      )}
    </section>
  );
}
