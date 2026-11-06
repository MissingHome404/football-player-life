// Cari pemain di seluruh dunia game: nama, posisi, negara, liga, umur.

import { useDeferredValue, useMemo, useState } from 'react';
import { useGame } from './store';
import { Badge, Flag, Stars, caStars, money } from './components';
import { PageTitle } from './CareerHome';
import { COUNTRY_BY_ID, flagOf } from '../game/data/countries';
import { POSITIONS, type Position } from '../game/data/attributes';
import { ageOn } from '../game/gen/player';
import { fullName } from '../game/gen/names';
import { marketValue } from '../game/sim/transfer';

type Sort = 'ca' | 'pa' | 'age' | 'value';
const LIMIT = 100;

export function SearchView() {
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const devMode = useGame((s) => s.devMode);
  const today = useGame((s) => s.career?.currentDate ?? s.world!.startDate);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<Position | ''>('');
  const [nat, setNat] = useState('');
  const [league, setLeague] = useState('');
  const [maxAge, setMaxAge] = useState(45);
  const [sort, setSort] = useState<Sort>('ca');
  const query = useDeferredValue(q.trim().toLowerCase());

  const nations = useMemo(() => {
    const have = new Set(world.players.map((p) => p.nationalityId));
    return [...have].sort((a, b) => (COUNTRY_BY_ID[a]?.name ?? a).localeCompare(COUNTRY_BY_ID[b]?.name ?? b));
  }, [world]);

  const { list, total } = useMemo(() => {
    const out = world.players.filter((p) => {
      if (pos && p.mainPosition !== pos) return false;
      if (nat && p.nationalityId !== nat) return false;
      if (league) {
        const c = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
        if (c?.leagueId !== league) return false;
      }
      if (maxAge < 45 && ageOn(p.birthDate, today) > maxAge) return false;
      if (query && !fullName(p).toLowerCase().includes(query)) return false;
      return true;
    });
    const key: Record<Sort, (p: (typeof out)[number]) => number> = {
      ca: (p) => p.ca,
      pa: (p) => p.pa,
      age: (p) => -ageOn(p.birthDate, today),
      value: (p) => marketValue(p, today),
    };
    const ranked = out.map((p) => [key[sort](p), p] as const).sort((a, b) => b[0] - a[0]);
    return { list: ranked.slice(0, LIMIT).map((x) => x[1]), total: out.length };
  }, [world, idx, pos, nat, league, maxAge, query, sort, today]);

  return (
    <div>
      <PageTitle title="Cari pemain" sub={`${world.players.length.toLocaleString('id-ID')} pemain di dunia ini`} />
      <section className="panel search-form">
        <label className="field grow">
          <span>Nama</span>
          <input type="search" value={q} placeholder="Ketik nama pemain…" onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field">
          <span>Posisi</span>
          <select value={pos} onChange={(e) => setPos(e.target.value as Position | '')}>
            <option value="">Semua</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Negara</span>
          <select value={nat} onChange={(e) => setNat(e.target.value)}>
            <option value="">Semua</option>
            {nations.map((id) => (
              <option key={id} value={id}>
                {flagOf(id)} {COUNTRY_BY_ID[id]?.name ?? id}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Liga</span>
          <select value={league} onChange={(e) => setLeague(e.target.value)}>
            <option value="">Semua</option>
            {world.leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {flagOf(l.countryId)} {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Umur maks.</span>
          <select value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))}>
            {[45, 17, 19, 21, 23, 25, 28, 30].map((a) => (
              <option key={a} value={a}>
                {a === 45 ? 'Semua' : `${a} tahun`}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Urutkan</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="ca">Kemampuan</option>
            <option value="pa">Potensi</option>
            <option value="value">Nilai pasar</option>
            <option value="age">Termuda</option>
          </select>
        </label>
      </section>
      <section className="panel">
        <p className="muted small">
          {total > LIMIT ? `${total.toLocaleString('id-ID')} pemain cocok, menampilkan ${LIMIT} teratas.` : `${total} pemain cocok.`}
        </p>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Pos</th>
                <th className="left">Nama</th>
                <th>Umur</th>
                <th className="left hide-sm">Klub</th>
                <th>Kemampuan</th>
                <th>Potensi</th>
                <th className="hide-sm">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
                return (
                  <tr key={p.id} className={`click ${p.isUser ? 'mine' : ''}`} onClick={() => go({ kind: 'player', playerId: p.id })}>
                    <td>
                      <span className="pos">{p.mainPosition}</span>
                    </td>
                    <td className="left">
                      <Flag id={p.nationalityId} /> <b>{fullName(p)}</b>
                    </td>
                    <td>{ageOn(p.birthDate, today)}</td>
                    <td className="left hide-sm">
                      {club ? (
                        <span className="club-cell">
                          <Badge club={club} size={18} /> {club.name}
                        </span>
                      ) : (
                        <span className="muted">Tanpa klub</span>
                      )}
                    </td>
                    <td>
                      <Stars value={caStars(p.ca)} />
                      {devMode && <span className="muted small"> {p.ca}</span>}
                    </td>
                    <td>
                      <Stars value={caStars(p.pa)} />
                      {devMode && <span className="muted small"> {p.pa}</span>}
                    </td>
                    <td className="num hide-sm">{money(marketValue(p, today))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
