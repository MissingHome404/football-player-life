// Kompetisi antarklub benua: tabel grup, babak gugur, dan daftar juara.

import { useState } from 'react';
import { useGame } from './store';
import { Badge } from './components';
import { shortDate } from './LeagueSeason';
import { CONT_DEFS, aggregate, contWinner, groupTable, type Confed } from '../game/sim/continental';
import type { ContComp, ContGroup, ContRound, ContTie } from '../game/types';

function useMyClub() {
  return useGame((st) => (st.career ? st.idx?.playerById.get(st.career.playerId)?.contract?.clubId : undefined));
}

function GroupTable({ g }: { g: ContGroup }) {
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const myClub = useMyClub();
  const rows = groupTable(g);
  return (
    <div className="ct-group">
      <h3>{g.name}</h3>
      <table className="tbl standings">
        <thead>
          <tr>
            <th>#</th>
            <th></th>
            <th className="left">Klub</th>
            <th>Main</th>
            <th>SG</th>
            <th>Poin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const c = idx.clubById.get(r.clubId);
            if (!c) return null;
            return (
              <tr
                key={r.clubId}
                className={`click ${i < 2 ? 'ct-through' : ''} ${r.clubId === myClub ? 'mine' : ''}`}
                onClick={() => go({ kind: 'club', clubId: c.id })}
              >
                <td className="num">{i + 1}</td>
                <td>
                  <Badge club={c} size={18} />
                </td>
                <td className="left strong ct-name">{c.name}</td>
                <td className="num">{r.p}</td>
                <td className="num">{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga}</td>
                <td className="num strong">{r.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TieRow({ t, final }: { t: ContTie; final: boolean }) {
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const myClub = useMyClub();
  const home = idx.clubById.get(t.home);
  const away = idx.clubById.get(t.away);
  if (!home || !away) return null;
  const won = contWinner(t);
  const played = t.legs.filter(Boolean) as [number, number][];
  const [h, a] = aggregate(t);
  return (
    <li className={`fx ${home.id === myClub || away.id === myClub ? 'mine' : ''}`}>
      <button className={`fx-team home ${won === home.id ? 'strong' : ''}`} onClick={() => go({ kind: 'club', clubId: home.id })}>
        <span className="fx-name">{home.name}</span>
        <Badge club={home} size={18} />
      </button>
      <span className="fx-score num">
        {played.length ? `${h} - ${a}` : 'vs'}
        {!final && played.length > 0 && (
          <span className="muted small fx-pens">
            {/* leg 2 ditulis dari sudut pandang tim kiri supaya mudah dijumlah */}
            {played.map((l) => `${l[0]}-${l[1]}`).join(', ')}
          </span>
        )}
        {t.pens && <span className="muted small fx-pens">pen {t.pens.join('-')}</span>}
      </span>
      <button className={`fx-team ${won === away.id ? 'strong' : ''}`} onClick={() => go({ kind: 'club', clubId: away.id })}>
        <Badge club={away} size={18} />
        <span className="fx-name">{away.name}</span>
      </button>
    </li>
  );
}

function KoRound({ r }: { r: ContRound }) {
  const final = r.dates.length === 1;
  return (
    <div>
      <h3>
        {r.name} · {r.dates.map(shortDate).join(' & ')}
        {final && <span className="muted small"> · tempat netral</span>}
      </h3>
      {r.ties.length ? (
        <ul className="fx-list">
          {r.ties.map((t) => (
            <TieRow key={`${t.home}-${t.away}`} t={t} final={final} />
          ))}
        </ul>
      ) : (
        <p className="muted small">Menunggu undian.</p>
      )}
    </div>
  );
}

function stageText(c: ContComp, today: string): string {
  if (c.winner) return 'Selesai';
  const md = c.groupDates.findIndex((d) => d > today);
  if (md >= 0) return `Fase grup · matchday ${md + 1} pada ${shortDate(c.groupDates[md])}`;
  for (const r of c.ko) {
    const i = r.dates.findIndex((d) => d > today);
    if (i >= 0) return `${r.name}${r.dates.length > 1 ? ` leg ${i + 1}` : ''} pada ${shortDate(r.dates[i])}`;
  }
  return '';
}

function CompPanel({ c }: { c: ContComp }) {
  const idx = useGame((s) => s.idx)!;
  const career = useGame((s) => s.career);
  const world = useGame((s) => s.world)!;
  const today = career?.currentDate ?? world.startDate;
  const ko = c.ko.filter((r) => r.ties.length);
  const [showGroups, setShowGroups] = useState(ko.length === 0);
  return (
    <section className="panel">
      <div className="season-head">
        <h2>
          🏆 {c.name} {c.season}
        </h2>
        <span className="muted small">
          {c.winner ? (
            <>
              Juara: <b>{idx.clubById.get(c.winner)?.name}</b> · runner-up {idx.clubById.get(c.runnerUp!)?.name}
            </>
          ) : (
            stageText(c, today)
          )}
        </span>
      </div>
      {ko.length > 0 && (
        <div className="two-col">
          {[...c.ko].reverse().filter((r) => r.ties.length).map((r) => (
            <KoRound key={r.name} r={r} />
          ))}
        </div>
      )}
      {ko.length > 0 ? (
        <details className="cup-earlier" open={showGroups} onToggle={(e) => setShowGroups((e.target as HTMLDetailsElement).open)}>
          <summary className="small">Fase grup</summary>
          <div className="ct-groups">
            {c.groups.map((g) => (
              <GroupTable key={g.name} g={g} />
            ))}
          </div>
        </details>
      ) : (
        <div className="ct-groups">
          {c.groups.map((g) => (
            <GroupTable key={g.name} g={g} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Halaman kompetisi benua: dua tingkat (Liga Mahkota dan Piala Perisai) */
export function ContinentalView({ confed }: { confed: Confed }) {
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const defs = CONT_DEFS.filter((d) => d.confed === confed);
  const [tier, setTier] = useState(0);
  const def = defs[tier];
  const comp = world.continental?.[def.id];
  const past = [...(world.contHonours ?? [])].reverse().filter((h) => h.leagueId === def.id);
  return (
    <div>
      <section className="panel">
        <h1>{confed === 'UEFA' ? 'Kompetisi Eropa' : 'Kompetisi Asia'}</h1>
        <p className="muted small">
          Klub teratas tiap liga main di {defs[0].name}, peringkat berikutnya di {defs[1].name}. Jatah tiap negara dihitung dari
          reputasi liga, peserta diambil dari klasemen akhir musim lalu. Laga di hari Selasa dan Kamis.
        </p>
        <div className="tabs">
          {defs.map((d, i) => (
            <button key={d.id} className={i === tier ? 'sel' : ''} onClick={() => setTier(i)}>
              {d.name}
            </button>
          ))}
        </div>
      </section>
      {comp ? (
        <CompPanel key={comp.id} c={comp} />
      ) : (
        <section className="panel">
          <p className="muted">Undian {def.name} dilakukan setelah minggu pertama kariermu berjalan.</p>
        </section>
      )}
      {past.length > 0 && (
        <section className="panel">
          <h2>Daftar juara</h2>
          <ul className="ct-honours">
            {past.map((h) => (
              <li key={h.season}>
                <span className="muted">{h.season}</span> <b>{idx.clubById.get(h.winnerId)?.name}</b>{' '}
                <span className="muted small">(final vs {idx.clubById.get(h.runnerUpId)?.name})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
