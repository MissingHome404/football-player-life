// Panel timnas di beranda: status panggilan, peringkatmu di antara pemain senegara,
// caps & gol, jadwal berikutnya, klasemen kualifikasi, dan turnamen (grup + babak gugur).

import { useMemo, useState } from 'react';
import { useGame } from './store';
import { COUNTRY_BY_ID, flagOf } from '../game/data/countries';
import { ageOn } from '../game/gen/player';
import {
  KO_STAGES,
  STAGE_NAME,
  TOURNAMENT_NAME,
  U20_AGE,
  countryName,
  cycleFor,
  emptyNational,
  groupTable,
  natRank,
  nextIntlEvent,
  qualSlots,
  qualTable,
  stageReached,
  tournamentKind,
} from '../game/sim/national';
import type { IntlFixture, Tournament } from '../game/types';
import { shortDate } from './LeagueSeason';

const MONTH: Record<string, string> = { '03': 'Maret', '06': 'Juni', '09': 'September', '10': 'Oktober', '11': 'November' };

/** Nama acara dari id panggilan: "win-2027-03" atau "world-2030" */
function eventLabel(id: string | undefined): string {
  if (!id) return '';
  const w = /^win-(\d{4})-(\d{2})$/.exec(id);
  if (w) return `jeda internasional ${MONTH[w[2]] ?? w[2]} ${w[1]}`;
  const t = /^(world|euro|asia)-(\d{4})$/.exec(id);
  if (t) return `${TOURNAMENT_NAME[t[1] as 'world']} ${t[2]}`;
  return id;
}

const Flag = ({ id }: { id: string }) => <span aria-hidden>{flagOf(id)} </span>;

export function NationalPanel() {
  const career = useGame((s) => s.career)!;
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const p = idx.playerById.get(career.playerId)!;
  const country = p.nationalityId;
  const conf = COUNTRY_BY_ID[country]?.confederation ?? 'UEFA';
  const nc = career.intl ?? emptyNational();
  const age = ageOn(p.birthDate, career.currentDate);
  const cname = countryName(country);

  const ranks = useMemo(
    () => ({
      senior: natRank(world, p, career, 'senior'),
      u20: age <= U20_AGE ? natRank(world, p, career, 'u20') : null,
    }),
    [world, p, career, age],
  );
  const next = nextIntlEvent(career.currentDate, conf);
  const gk = p.mainPosition === 'GK';

  const calledNow = nc.called && nc.calledFor;
  return (
    <section className="panel natl">
      <h2>Statusmu di timnas</h2>
      <div className="nt-status small">
        {calledNow ? (
          <span className="pill ok">
            {nc.called === 'senior' ? 'Skuad senior' : 'Skuad U-20'} · {eventLabel(nc.calledFor)}
          </span>
        ) : career.injury ? (
          <span className="pill">Cedera, tidak bisa dipanggil</span>
        ) : (
          <span className="pill">Belum masuk skuad</span>
        )}
      </div>
      <p className="small nt-rank">
        Peringkatmu: <b>#{ranks.senior.rank}</b> di antara {gk ? 'kiper' : 'pemain lapangan'} {cname} (dipanggil:{' '}
        {ranks.senior.cut} teratas)
        {ranks.u20 && (
          <>
            {' '}
            · U-20: <b>#{ranks.u20.rank}</b>
          </>
        )}
      </p>
      <div className="nt-stats">
        <div>
          <b className="num">{nc.caps}</b>
          <span className="muted small">caps</span>
        </div>
        <div>
          <b className="num">{nc.goals}</b>
          <span className="muted small">gol</span>
        </div>
        {(nc.u20Caps > 0 || age <= U20_AGE) && (
          <div>
            <b className="num">
              {nc.u20Caps}/{nc.u20Goals}
            </b>
            <span className="muted small">U-20 main/gol</span>
          </div>
        )}
      </div>
      {nc.debut && <p className="muted small">Debut senior {shortDate(nc.debut)}</p>}
      {next && (
        <p className="small">
          <span className="muted">Berikutnya:</span> {next.label} · {shortDate(next.date)}
        </p>
      )}
      {nc.tournaments.length > 0 && (
        <ul className="nt-cups small">
          {nc.tournaments.map((x) => (
            <li key={x.id}>
              🏆 {x.name}: <b>{x.stage}</b> · {x.apps} main, {x.goals} gol
            </li>
          ))}
        </ul>
      )}

    </section>
  );
}

/** Kualifikasi & turnamen untuk satu negara (bisa negara mana saja) */
export function NatCompetitions({ country }: { country: string }) {
  const world = useGame((s) => s.world)!;
  const today = useGame((s) => s.career?.currentDate ?? s.world!.startDate);
  const [showTable, setShowTable] = useState(true);
  const [showCup, setShowCup] = useState(true);
  const conf = COUNTRY_BY_ID[country]?.confederation ?? 'UEFA';
  const intl = world.intl;
  const cname = countryName(country);
  const cycle = intl?.cycle ?? cycleFor(today);
  const kind = tournamentKind(cycle, conf);
  const slots = qualSlots(kind, conf);
  const table = useMemo(() => (intl ? qualTable(world, intl, conf) : []), [world, intl, conf]);
  const t = intl?.tournament;
  if (!intl) return <p className="muted small">Kualifikasi dan turnamen antarnegara akan muncul setelah jeda internasional pertama.</p>;
  return (
    <>
      {kind && intl && (
        <>
          <button className="link nt-toggle" onClick={() => setShowTable(!showTable)} aria-expanded={showTable}>
            {showTable ? '▾' : '▸'} Kualifikasi {TOURNAMENT_NAME[kind]} {cycle} ({slots} tiket {conf})
          </button>
          {showTable && (
            <div className="table-wrap">
              <table className="tbl nt-table small">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="left">Negara</th>
                    <th>Main</th>
                    <th>M-S-K</th>
                    <th>SG</th>
                    <th>Poin</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map(({ id, row }, i) => (
                    <tr key={id} className={`${id === country ? 'mine' : ''} ${i === slots - 1 ? 'cut' : ''}`}>
                      <td className="num">{i + 1}</td>
                      <td className="left">
                        <Flag id={id} />
                        {countryName(id)}
                      </td>
                      <td className="num">{row.p}</td>
                      <td className="num">
                        {row.w}-{row.d}-{row.l}
                      </td>
                      <td className="num">{row.gf - row.ga}</td>
                      <td className="num">
                        <b>{row.pts}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">Diurutkan dari poin per laga. Garis = batas lolos.</p>
            </div>
          )}
        </>
      )}

      {t && (
        <>
          <button className="link nt-toggle" onClick={() => setShowCup(!showCup)} aria-expanded={showCup}>
            {showCup ? '▾' : '▸'} {t.name}
            {t.champion ? ` · juara: ${countryName(t.champion)}` : ' · sedang berlangsung'}
            {' · '}
            {cname}: {stageReached(t, country).toLowerCase()}
          </button>
          {showCup && <TournamentView t={t} mine={country} />}
        </>
      )}
      {intl && intl.history.length > 1 && (
        <p className="muted small nt-hist">
          Juara sebelumnya:{' '}
          {intl.history
            .slice(1, 5)
            .map((h) => `${h.name} ${countryName(h.champion)}`)
            .join(' · ')}
        </p>
      )}
    </>
  );
}

function Score({ f }: { f: IntlFixture }) {
  if (!f.score) return <span className="muted">{shortDate(f.date)}</span>;
  return (
    <b className="num">
      {f.score[0]} - {f.score[1]}
      {f.pens && (
        <span className="muted small">
          {' '}
          (pen {f.pens[0]}-{f.pens[1]})
        </span>
      )}
    </b>
  );
}

function TournamentView({ t, mine }: { t: Tournament; mine: string }) {
  const ko = KO_STAGES.filter((s) => t.fixtures.some((f) => f.stage === s));
  return (
    <div className="nt-cup">
      <div className="nt-groups">
        {t.groups.map((_, gi) => (
          <table key={gi} className="tbl nt-table small">
            <thead>
              <tr>
                <th className="left">Grup {String.fromCharCode(65 + gi)}</th>
                <th>Main</th>
                <th>SG</th>
                <th>Poin</th>
              </tr>
            </thead>
            <tbody>
              {groupTable(t, gi).map(({ id, row }, i) => (
                <tr key={id} className={`${id === mine ? 'mine' : ''} ${i === 1 ? 'cut' : ''}`}>
                  <td className="left">
                    <Flag id={id} />
                    {countryName(id)}
                  </td>
                  <td className="num">{row.p}</td>
                  <td className="num">{row.gf - row.ga}</td>
                  <td className="num">
                    <b>{row.pts}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      {ko.map((s) => (
        <div key={s} className="nt-ko">
          <h4>{STAGE_NAME[s]}</h4>
          <ul className="small">
            {t.fixtures
              .filter((f) => f.stage === s)
              .map((f, i) => (
                <li key={i} className={f.home === mine || f.away === mine ? 'mine' : ''}>
                  <span>
                    <Flag id={f.home} />
                    {countryName(f.home)}
                  </span>
                  <Score f={f} />
                  <span className="right">
                    {countryName(f.away)} <Flag id={f.away} />
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
