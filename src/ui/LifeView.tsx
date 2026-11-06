// Halaman Kehidupan & belanja, plus kartu model 3D untuk beranda.

import { lazy, Suspense, useState } from 'react';
import { useGame } from './store';
import { money } from './components';
import { COACH_LEVELS, COACH_TIERS, econOf } from '../game/sim/economy';
import type { CoachLevel } from '../game/types';
import {
  ACTIONS,
  HOUSES,
  ITEMS,
  ITEM_BY_ID,
  MAX_WEAR,
  SUBS,
  activeMods,
  actionCost,
  subCost,
  subLevel,
  priceOf,
  type ActionId,
  type HouseId,
  type ItemDef,
  type ItemKind,
  type SubId,
} from '../game/sim/life';
import type { AvatarLook } from './Avatar3D';
import { POST_INFO, POST_TYPES, fmtFollowers, socialOf, tierLabel } from '../game/sim/social';

const Avatar3D = lazy(() => import('./Avatar3D'));

/** Penampilan model 3D dari data karier sekarang */
function useLook(): AvatarLook {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const p = idx.playerById.get(career.playerId)!;
  const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
  const life = career.life;
  const car = life.car ? ITEM_BY_ID[life.car] : undefined;
  return {
    seed: career.characterSeed,
    shirt: club?.colors[0] ?? '#e9ecef',
    trim: club?.colors[1] ?? '#5b6273',
    shorts: club?.colors[1] ?? '#2d3240',
    boots: ITEM_BY_ID[life.boots]?.color ?? '#1d1f24',
    wear: life.wear,
    car: car ? { id: car.id, color: car.color } : null,
    house: life.house,
    heightCm: p.heightCm,
  };
}

export function AvatarStage({ height = 260 }: { height?: number }) {
  const look = useLook();
  return (
    <Suspense fallback={<div className="avatar3d avatar-fallback muted small" style={{ height }}>Memuat model 3D…</div>}>
      <Avatar3D look={look} height={height} />
    </Suspense>
  );
}

/** Kartu di beranda: model 3D + ringkasan barang + tombol ke halaman Kehidupan */
export function AvatarPanel() {
  const career = useGame((s) => s.career)!;
  const go = useGame((s) => s.go);
  const life = career.life;
  return (
    <section className="panel avatar-panel">
      <AvatarStage height={240} />
      <div className="avatar-info">
        <div className="small">
          <b>{HOUSES[life.house].label}</b>
          <span className="muted"> · {life.car ? ITEM_BY_ID[life.car].label : 'Belum punya kendaraan'}</span>
          <span className="muted"> · {ITEM_BY_ID[life.boots].label}</span>
        </div>
        <button className="ghost small" onClick={() => go({ kind: 'life' })}>
          Kehidupan & belanja
        </button>
      </div>
    </section>
  );
}

const KIND_LABEL: Record<ItemKind, string> = {
  sepatu: 'Sepatu',
  alat: 'Perlengkapan',
  aksesori: 'Aksesori',
  kendaraan: 'Kendaraan',
};

function itemEffects(i: ItemDef, econ: number): string {
  const e: string[] = [];
  if (i.attrs) e.push(Object.entries(i.attrs).map(([a, d]) => `${a} +${d}`).join(', ') + ' (permanen)');
  if (i.mods) e.push(Object.entries(i.mods).map(([a, d]) => `${a} ${d > 0 ? '+' : ''}${d}`).join(', ') + ' (selama dipakai)');
  if (i.fitness) e.push(`kebugaran +${i.fitness}/mg`);
  if (i.stress) e.push(`stres ${i.stress}`);
  if (i.media) e.push(`media +${i.media}`);
  const upkeep = i.upkeep ? (i.local ? i.upkeep * econ : i.upkeep) : 0;
  if (upkeep >= 1) e.push(`perawatan ${money(upkeep)}/mg`);
  if (i.needHouse) e.push('butuh rumah');
  return e.join(' · ');
}

/** Total efek atribut dari sepatu & aksesori yang sedang dipakai */
function ModsSummary() {
  const career = useGame((s) => s.career)!;
  const mods = Object.entries(activeMods(career.life)).filter(([, d]) => d !== 0);
  return (
    <p className="small">
      {mods.length ? (
        <>
          Efek barang yang dipakai:{' '}
          {mods.map(([a, d], i) => (
            <span key={a} className={d > 0 ? 'mod-plus' : 'mod-minus'}>
              {i > 0 && ', '}
              {a} {d > 0 ? '+' : ''}
              {d}
            </span>
          ))}
          .
        </>
      ) : (
        <span className="muted">Sepatu dan aksesori tertentu menaikkan atau menurunkan atribut selama dipakai.</span>
      )}{' '}
      <span className="muted">
        Aksesori dipakai {career.life.wear.length}/{MAX_WEAR}.
      </span>
    </p>
  );
}

export function LifeView() {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const run = useGame((s) => s.lifeOp);
  const [note, setNote] = useState<string | null>(null);
  const p = idx.playerById.get(career.playerId)!;
  const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
  const abroad = !!club && club.countryId !== p.nationalityId;
  const econ = econOf(p.nationalityId);
  const life = career.life;
  const act = (op: Parameters<typeof run>[0]) => {
    const r = run(op);
    if (r) setNote(r);
  };

  return (
    <div className="life-view">
      <header className="life-head">
        <h1>Kehidupan & belanja</h1>
        <div className="small">
          Uang <b className={career.money < 0 ? 'loss' : ''}>{money(career.money)}</b> · Tabungan <b>{money(life.savings)}</b>
        </div>
      </header>

      <div className="life-top">
        <section className="panel">
          <AvatarStage height={300} />
          <p className="muted small">Barang yang kamu beli dan pakai langsung terlihat di model ini. Geser untuk memutar.</p>
        </section>
        <section className="panel">
          <h2>Tabungan</h2>
          <p className="small">
            Saldo <b>{money(life.savings)}</b>. Bunga 3% per tahun, aman dari pengeluaran mingguan.
          </p>
          <div className="chips">
            <button className="chip" disabled={career.money <= 0} onClick={() => act({ op: 'deposit', amount: Math.floor(career.money * 0.25) })}>
              Tabung 25% uang
            </button>
            <button className="chip" disabled={career.money <= 0} onClick={() => act({ op: 'deposit', amount: Math.floor(career.money * 0.5) })}>
              Tabung 50% uang
            </button>
            <button className="chip" disabled={life.savings <= 0} onClick={() => act({ op: 'withdraw', amount: life.savings })}>
              Ambil semua
            </button>
          </div>
          <h2 className="mt">Kegiatan</h2>
          <div className="life-actions">
            {(Object.keys(ACTIONS) as ActionId[]).map((id) => {
              const a = ACTIONS[id];
              const last = career.cooldowns[`life_${id}`];
              const wait = last !== undefined ? a.cooldown - (career.week - last) : 0;
              return (
                <div key={id} className="shop-item">
                  <div>
                    <b>{a.label}</b> <span className="muted small">{money(actionCost(id, econ))}</span>
                    <div className="muted small">{a.desc}</div>
                  </div>
                  <button className="chip" disabled={wait > 0} onClick={() => act({ op: 'action', id })}>
                    {wait > 0 ? `${wait} mg lagi` : 'Lakukan'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {note && (
        <p className="tr-note" role="status">
          {note}
        </p>
      )}

      <SocialPanel />

      <section className="panel">
        <h2>Tempat tinggal</h2>
        <div className="shop-grid">
          {(Object.keys(HOUSES) as HouseId[]).map((id) => {
            const h = HOUSES[id];
            const cur = life.house === id;
            const blocked = id === 'ortu' && abroad;
            return (
              <div key={id} className={`shop-card ${cur ? 'cur' : ''}`}>
                <b>{h.label}</b>
                <span className="muted small">{h.desc}</span>
                <span className="small">
                  {h.cost ? `${money(h.cost * econ)}/mg` : 'Gratis'}
                  {h.stress ? ` · stres ${h.stress > 0 ? '+' : ''}${h.stress}` : ''}
                  {h.fitness ? ` · kebugaran +${h.fitness}/mg` : ''}
                </span>
                {cur ? (
                  <span className="pill ok">Tempat tinggalmu</span>
                ) : (
                  <button className="chip" disabled={blocked} title={blocked ? 'Kamu main di luar negeri' : undefined} onClick={() => act({ op: 'house', id })}>
                    Pindah ke sini
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="muted small">Pindah ke tempat yang lebih murah setelah terbiasa hidup nyaman bikin stres beberapa minggu.</p>
      </section>

      <section className="panel">
        <h2>Belanja</h2>
        <ModsSummary />
        {(Object.keys(KIND_LABEL) as ItemKind[]).map((kind) => (
          <div key={kind} className="shop-group">
            <h3>{KIND_LABEL[kind]}</h3>
            <div className="shop-grid">
              {ITEMS.filter((i) => i.kind === kind).map((i) => {
                const owned = life.owned.includes(i.id);
                const price = priceOf(i, econ);
                const using = life.boots === i.id || life.car === i.id || life.wear.includes(i.id);
                return (
                  <div key={i.id} className={`shop-card ${using ? 'cur' : ''}`}>
                    <span className="swatch" style={{ background: i.color }} aria-hidden />
                    <b>{i.label}</b>
                    <span className="muted small">{i.desc}</span>
                    <span className="small">{itemEffects(i, econ) || 'Tampilan saja'}</span>
                    {owned ? (
                      <div className="chips">
                        {kind !== 'alat' && !(kind === 'sepatu' && using) && (
                          <button className="chip" onClick={() => act({ op: 'equip', id: i.id })}>
                            {using ? 'Lepas' : 'Pakai'}
                          </button>
                        )}
                        {kind === 'sepatu' && using && <span className="pill ok">Dipakai</span>}
                        {kind === 'alat' && <span className="pill ok">Dimiliki</span>}
                        {i.id !== 'sepatu_biasa' && (
                          <button className="chip" onClick={() => act({ op: 'sell', id: i.id })} title="Dijual setengah harga">
                            Jual {money(Math.round(price * 0.5))}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button className="chip buy" disabled={career.money < price} onClick={() => act({ op: 'buy', id: i.id })}>
                        Beli {money(price)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Staf pribadi</h2>
        <div className="shop-grid">
          {(Object.keys(SUBS) as SubId[]).map((id) => {
            const s = SUBS[id];
            const lv = subLevel(life, id);
            const levels: CoachLevel[] = s.tiered ? COACH_LEVELS : [0, 2];
            const fx = (l: CoachLevel) => {
              if (!l) return '';
              const i = l - 1;
              const parts = [
                s.fitness[i] ? `kebugaran +${s.fitness[i]}/mg` : '',
                `risiko cedera -${Math.round((1 - s.injury[i]) * 100)}%`,
                s.heal ? `${Math.round(s.heal[i] * 100)}% peluang sembuh 1 mg lebih cepat` : '',
              ];
              return parts.filter(Boolean).join(', ');
            };
            return (
              <div key={id} className={`shop-card ${lv ? 'cur' : ''}`}>
                <b>{s.label}</b>
                <span className="muted small">{s.desc}</span>
                {lv > 0 && (
                  <span className="small">
                    {s.tiered ? `${COACH_TIERS[lv as 1 | 2 | 3].label}: ` : ''}
                    {fx(lv)} · {money(subCost(id, lv, econ))}/mg
                  </span>
                )}
                <div className="chips">
                  {levels.map((l) => (
                    <button
                      key={l}
                      className={`chip ${lv === l ? 'sel' : ''}`}
                      aria-pressed={lv === l}
                      title={fx(l) || undefined}
                      onClick={() => act({ op: 'sub', id, level: l })}
                    >
                      {l === 0 ? 'Tidak' : s.tiered ? `${COACH_TIERS[l as 1 | 2 | 3].label} · ${money(subCost(id, l, econ))}` : `Pakai · ${money(subCost(id, l, econ))}`}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="muted small">Ahli gizi dan fisio punya tiga tingkat: amatir (murah), profesional, dan world class (harga internasional, efek terbesar).</p>
      </section>
    </div>
  );
}

/** Media sosial & sponsor: pengikut, citra, postingan mingguan, kontrak sponsor */
function SocialPanel() {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const setPlan = useGame((s) => s.setPlan);
  const p = idx.playerById.get(career.playerId)!;
  // career di store tidak diubah di sini: tampilkan data awal kalau belum pernah dibuat
  const s = career.social ?? socialOf(structuredClone(career), p);
  const post = career.plan.post ?? 'tidak';
  const total = s.deals.reduce((a, d) => a + d.weekly, 0);
  return (
    <section className="panel social">
      <div className="season-head">
        <h2>Media sosial & sponsor</h2>
        <span className="muted small">
          <b className="social-big">{fmtFollowers(s.followers)}</b> pengikut · puncak {fmtFollowers(s.peak)} · citra {Math.round(s.image)}/100
          {s.scandals > 0 && ` · ${s.scandals} kontroversi`}
        </span>
      </div>
      <div className="two-col">
        <div>
          <h3>Postingan minggu ini</h3>
          <div className="chips">
            {POST_TYPES.map((t) => (
              <button key={t} className={`chip ${post === t ? 'sel' : ''}`} aria-pressed={post === t} onClick={() => setPlan({ post: t })}>
                {POST_INFO[t].label}
              </button>
            ))}
          </div>
          <p className="muted small">{POST_INFO[post].desc}</p>
          <p className="muted small">
            Pengikut tumbuh dari reputasimu, gol, man of the match, dan laga timnas. Citra yang bagus membuat sponsor datang dan membayar
            lebih; citra di bawah 25 bisa membuat sponsor memutus kontrak.
          </p>
          <h3 className="mt">Kontrak sponsor</h3>
          {s.deals.length ? (
            <ul className="social-deals">
              {s.deals.map((d) => (
                <li key={d.brand}>
                  <b>{d.brand}</b> <span className="muted small">({d.category.toLowerCase()}, {tierLabel(d.tier)})</span>
                  <span className="num">{money(d.weekly)} / mg</span>
                  <span className="muted small">s/d {d.until}</span>
                </li>
              ))}
              <li className="muted small">Total {money(total)} per minggu (kena pajak 30%).</li>
            </ul>
          ) : (
            <p className="muted small">
              Belum ada sponsor. Tawaran datang lewat inbox kalau pengikutmu cukup banyak (±1.500+) dan citramu bagus. Maksimal 3 kontrak, satu per
              kategori.
            </p>
          )}
        </div>
        <div>
          <h3>Postingan terakhir</h3>
          {s.posts.length ? (
            <ul className="social-posts">
              {s.posts.slice(0, 6).map((x, i) => (
                <li key={`${x.date}-${i}`}>
                  <div>{x.text}</div>
                  <div className="muted small">
                    {x.date} · ❤️ {fmtFollowers(x.likes)}
                    {x.viral && <span className="pill ok"> viral</span>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Belum ada postingan.</p>
          )}
        </div>
      </div>
    </section>
  );
}
