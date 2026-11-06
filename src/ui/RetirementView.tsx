// Layar setelah pensiun: ringkasan karier, skor legacy, perjalanan klub, peringkat Hall of Fame,
// dan unduh statistik untuk Football Manager. Juga daftar Hall of Fame di layar awal.

import { useEffect, useMemo, useState } from 'react';
import { useGame } from './store';
import { Flag } from './components';
import { careerTotals, HOF_MIN } from '../game/sim/retire';
import { listHof } from '../game/save/storage';
import { fullName } from '../game/gen/names';
import { groupOf } from '../game/sim/match';
import { COUNTRY_BY_ID } from '../game/data/countries';
import { downloadCareerCsv } from './csv';
import type { HofEntry, RetireReason } from '../game/types';
import { POSITIONS, POSITION_LABEL, type Position } from '../game/data/attributes';
import { heirGap, heirKind, heirWealth } from '../game/sim/dynasty';
import { FAMILY_INFO } from '../game/gen/character';

const REASON_LABEL: Record<RetireReason, string> = {
  pilihan: 'pilihan sendiri',
  cedera: 'cedera parah',
  usia: 'faktor usia',
};

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function RetirementView() {
  const career = useGame((s) => s.career)!;
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const reset = useGame((s) => s.reset);
  const r = career.retired!;
  const p = idx.playerById.get(career.playerId)!;
  const t = useMemo(() => careerTotals(career), [career]);
  const [hof, setHof] = useState<HofEntry[] | null>(null);
  useEffect(() => {
    // entri Hall of Fame ditulis bersamaan dengan pensiun; tunggu sebentar supaya ikut terhitung
    const id = setTimeout(() => void listHof().then(setHof), 300);
    return () => clearTimeout(id);
  }, [r.entry.id]);
  const rank = hof ? hof.findIndex((h) => h.id === r.entry.id) + 1 : 0;
  const grp = groupOf(p.mainPosition);

  const tiles: [string, string | number][] = [
    ['Laga liga', t.apps],
    ['Gol', t.goals],
    ['Assist', t.assists],
    ...(grp === 'GK' || grp === 'DEF' ? ([['Clean sheet', t.cleanSheets]] as [string, number][]) : []),
    ['Rating rata-rata', t.apps ? t.avg.toFixed(2) : '-'],
    ['Caps timnas', t.caps],
    ['Gol timnas', t.natGoals],
    ['Trofi', career.trophies?.length ?? 0],
    ['Penghargaan', career.awards?.length ?? 0],
    ['Lencana', career.badges?.length ?? 0],
  ];

  return (
    <section className="panel retired">
      <div className="rt-head">
        <div>
          <p className="muted small">Karier selesai · {fmtDate(r.date)}</p>
          <h2>
            <Flag id={p.nationalityId} /> {fullName(p)}
          </h2>
          <p className="small">
            {COUNTRY_BY_ID[p.nationalityId]?.name} · {p.mainPosition} · pensiun di usia {r.age} ({REASON_LABEL[r.reason]}) ·{' '}
            {r.entry.years}
          </p>
        </div>
        <div className="rt-score">
          <span className="muted small">Skor legacy</span>
          <b className="num">{r.legacy.total}</b>
          <span className="pill ok">{r.legacy.tier}</span>
          {r.legacy.hallOfFame ? (
            <span className="rt-hof">⭐ Masuk Hall of Fame</span>
          ) : (
            <span className="muted small">Hall of Fame mulai skor {HOF_MIN}</span>
          )}
        </div>
      </div>

      <div className="rt-tiles">
        {tiles.map(([k, v]) => (
          <div key={k}>
            <b className="num">{v}</b>
            <span className="muted small">{k}</span>
          </div>
        ))}
      </div>

      <div className="rt-cols">
        <div>
          <h3>Rincian skor legacy</h3>
          <table className="budget rt-parts">
            <tbody>
              {r.legacy.parts.map((x) => (
                <tr key={x.label}>
                  <td>
                    {x.label}
                    <div className="muted small">{x.detail}</div>
                  </td>
                  <td className="num gain">+{x.points}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Total</td>
                <td className="num">{r.legacy.total}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <h3>Perjalanan klub</h3>
          {t.clubs.length ? (
            <ol className="rt-clubs small">
              {t.clubs.map((c) => (
                <li key={(c.clubId ?? c.team) + c.from}>
                  <span>
                    <b>{c.team}</b>
                    <span className="muted"> · {c.from === c.to ? c.from : `${c.from} – ${c.to}`}</span>
                  </span>
                  <span className="num muted">
                    {c.apps} main · {c.goals} gol · {c.assists} ast
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted small">Belum pernah tampil di liga profesional.</p>
          )}
          {rank > 0 && hof && (
            <p className="small rt-rank">
              Peringkat <b>#{rank}</b> dari {hof.length} karier di Hall of Fame browser ini.
            </p>
          )}
        </div>
      </div>

      <NextGeneration />

      <div className="rt-actions">
        <button className="primary" onClick={() => downloadCareerCsv(world, career, p)}>
          Unduh statistik untuk FM (CSV)
        </button>
        <button className="ghost" onClick={reset}>
          Menu utama & Hall of Fame
        </button>
      </div>
      <p className="muted small">
        File CSV bisa dibuka di Excel: riwayat per musim, total karier, trofi, atribut akhir (skala 1-20, urutan sama
        dengan layar FM), personality, dan hidden attributes, jadi bisa langsung diketik ke save Football Manager.
      </p>
    </section>
  );
}

/** Lanjutkan sebagai anak atau keponakan di dunia beberapa tahun kemudian */
function NextGeneration() {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const start = useGame((s) => s.startNextGen);
  const [pos, setPos] = useState<Position | ''>('');
  const p = idx.playerById.get(career.playerId)!;
  const kind = heirKind(career);
  const gap = heirGap(career);
  const year = Number(career.retired!.date.slice(0, 4)) + gap;
  const gen = (career.dynasty?.generation ?? 1) + 1;
  const who = kind === 'anak' ? 'anakmu' : 'keponakanmu';
  return (
    <div className="rt-nextgen">
      <h3>Generasi berikutnya</h3>
      <p className="small">
        Lanjutkan kisah keluarga {p.lastName} sebagai <b>{who}</b> (generasi ke-{gen}). Dunia maju {gap} tahun ke musim {year}/
        {String(year + 1).slice(2)}: klubnya sama, pemainnya generasi baru, dan sejarah juara tetap tercatat.
      </p>
      <p className="muted small">
        {kind === 'anak'
          ? 'Anakmu mewarisi nama keluarga, sebagian bakat dari puncak kemampuanmu, tinggi badan, kaki terkuat, dan sebagian watak (determination, profesionalisme, ambisi).'
          : 'Kamu belum menikah, jadi yang meneruskan adalah keponakanmu: warisan bakat dan watak lebih kecil dari seorang anak.'}{' '}
        Keluarga mulai dengan status {FAMILY_INFO[heirWealth(career)].label.toLowerCase()} dari uang dan tabunganmu, dan nama besarmu membawa
        sedikit reputasi serta pengikut media sosial.
      </p>
      <div className="rt-nextgen-row">
        <label className="small">
          Posisi:{' '}
          <select value={pos} onChange={(e) => setPos(e.target.value as Position | '')}>
            <option value="">Acak</option>
            {POSITIONS.map((x) => (
              <option key={x} value={x}>
                {POSITION_LABEL[x]} ({x})
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={() => void start(pos || undefined)}>
          Mulai karier {who}
        </button>
      </div>
    </div>
  );
}

/** Daftar karier yang sudah pensiun (lintas save) di layar awal */
export function HallOfFame() {
  const [list, setList] = useState<HofEntry[] | null>(null);
  useEffect(() => {
    void listHof().then(setList);
  }, []);
  if (!list?.length) return null;
  return (
    <section className="panel hof">
      <h2>Hall of Fame</h2>
      <p className="muted small">
        Semua karier yang sudah pensiun di browser ini, diurutkan dari skor legacy. ⭐ = masuk Hall of Fame (skor{' '}
        {HOF_MIN} ke atas).
      </p>
      <ol className="hof-list">
        {list.map((h, i) => (
          <li key={h.id}>
            <span className="hof-rank num">{i + 1}</span>
            <div className="hof-info">
              <b>
                <Flag id={h.countryId} /> {h.name} {h.hallOfFame && <span title="Masuk Hall of Fame">⭐</span>}
              </b>
              <span className="muted small">
                {h.position} · {h.years} · pensiun umur {h.age}
                {h.clubs.length > 0 && ` · ${h.clubs.join(', ')}`}
              </span>
              <span className="small">
                {h.apps} laga · {h.goals} gol · {h.assists} assist · {h.caps} caps · {h.trophies} trofi · {h.awards} penghargaan
              </span>
            </div>
            <div className="hof-score">
              <b className="num">{h.legacy}</b>
              <span className="muted small">{h.tier}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
