// Panel Kontrak & transfer: kontrak sekarang, agent, permintaan ke klub,
// kartu perbandingan tawaran klub, dan riwayat klub.

import { useState } from 'react';
import { useGame } from './store';
import { Badge, Flag, Stars, caStars, money } from './components';
import { shortDate } from './LeagueSeason';
import { ageOn } from '../game/gen/player';
import { addDays } from '../game/date';
import { fullName } from '../game/gen/names';
import { groupOf } from '../game/sim/match';
import { squadOf } from '../game/sim/season';
import { AGENT_INFO, SETTLE_DAYS, agentAvailable, marketValue, transferWindow } from '../game/sim/transfer';
import type { AgentTier, Offer, PlayingStyle } from '../game/types';

const TYPE_LABEL: Record<Offer['type'], string> = {
  transfer: 'Transfer',
  bebas: 'Bebas transfer',
  pinjaman: 'Pinjaman',
  perpanjangan: 'Perpanjangan',
};

const STYLE_LABEL: Record<PlayingStyle, string> = {
  Possession: 'Penguasaan bola',
  Gegenpress: 'Gegenpress',
  Counter: 'Serangan balik',
  Direct: 'Bola langsung',
  'Wing Play': 'Main lewat sayap',
  Defensive: 'Bertahan',
};

const pressure = (fans: number) =>
  fans < 100_000 ? 'Rendah' : fans < 600_000 ? 'Sedang' : fans < 2_000_000 ? 'Tinggi' : 'Sangat tinggi';

const TIERS: AgentTier[] = ['lokal', 'regional', 'super'];

export function TransferPanel() {
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const hire = useGame((s) => s.hireAgent);
  const fire = useGame((s) => s.fireAgent);
  const setWish = useGame((s) => s.setWish);
  const [showAgents, setShowAgents] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const p = idx.playerById.get(career.playerId)!;
  const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
  const date = career.currentDate;
  const win = transferWindow(date);
  const age = ageOn(p.birthDate, date);
  const senior = !!p.contract && !p.isYouth;
  const parent = career.loan ? idx.clubById.get(career.loan.parentClubId) : undefined;
  const agent = career.agent;
  const agentRank = agent ? TIERS.indexOf(agent.tier) : -1;
  const settledUntil = career.signed && addDays(career.signed, SETTLE_DAYS) > date ? addDays(career.signed, SETTLE_DAYS) : null;

  return (
    <section className="panel transfer">
      <header className="tr-head">
        <h2>Kontrak & transfer</h2>
        <span className={`pill ${win.open ? 'ok' : ''}`}>
          {win.label} · {win.open ? 's/d' : 'buka'} {shortDate(win.until)}
        </span>
      </header>

      <div className="tr-now">
        {club && p.contract ? (
          <>
            <Badge club={club} size={28} />
            <div>
              <b>{club.name}</b>
              <div className="muted small">
                {p.isYouth ? 'Akademi / U19' : `Peran dijanjikan: ${p.contract.role}`} · {money(p.contract.wagePerWeek)}/mg ·
                s/d {shortDate(career.loan ? career.loan.until : p.contract.expires)} {(career.loan ? career.loan.until : p.contract.expires).slice(0, 4)}
              </div>
              {parent && <div className="muted small">Dipinjamkan dari {parent.name}</div>}
            </div>
          </>
        ) : (
          <div>
            <b>{career.teamLabel}</b>
            <div className="muted small">
              {age < 16
                ? 'Pemain amatir. Masuk akademi lewat trial pemandu bakat; kontrak profesional bisa datang mulai umur 16.'
                : 'Belum punya kontrak. Klub boleh mengontrakmu kapan saja tanpa biaya transfer.'}
            </div>
          </div>
        )}
        <div className="tr-value">
          <div className="muted small">Nilai pasar</div>
          <b>± {money(marketValue(p, date))}</b>
        </div>
      </div>

      <div className="tr-agent">
        <h3>Agent</h3>
        {agent ? (
          <div className="tr-row">
            <div>
              <b>{agent.name}</b>
              <div className="muted small">
                {AGENT_INFO[agent.tier].label} · komisi {Math.round(agent.fee * 100)}% dari gaji dan bonus
              </div>
            </div>
            <div className="tr-actions">
              {agentRank < 2 && (
                <button className="ghost small" onClick={() => setShowAgents(!showAgents)} aria-expanded={showAgents}>
                  Ganti
                </button>
              )}
              <button className="ghost small" onClick={fire}>
                Lepas
              </button>
            </div>
          </div>
        ) : (
          <p className="muted small">
            Belum punya agent. Tanpa agent, tawaran hanya datang dari klub di negaramu dan gajimu lebih kecil.
          </p>
        )}
        {(!agent || showAgents) && (
          <div className="tr-tiers">
            {TIERS.filter((t) => TIERS.indexOf(t) > agentRank).map((t) => {
              const info = AGENT_INFO[t];
              const ok = agentAvailable(t, p);
              return (
                <div key={t} className={`tr-tier ${ok ? '' : 'locked'}`}>
                  <b>{info.label}</b>
                  <span className="muted small">
                    {info.desc} Komisi {Math.round(info.fee * 100)}%.
                  </span>
                  {!ok && <span className="small warn">{info.need}</span>}
                  <button
                    className="chip"
                    disabled={!ok}
                    onClick={() => {
                      hire(t);
                      setShowAgents(false);
                    }}
                  >
                    Sewa
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {senior && !career.loan && (
        <div className="tr-wish">
          <h3>Permintaan ke klub</h3>
          <div className="chips">
            {age <= 23 && (
              <button
                className={`chip ${career.wantsLoan ? 'sel' : ''}`}
                aria-pressed={career.wantsLoan}
                onClick={() => setWish({ wantsLoan: !career.wantsLoan })}
              >
                Minta dipinjamkan
              </button>
            )}
            <button
              className={`chip ${career.listed ? 'sel' : ''}`}
              aria-pressed={career.listed}
              onClick={() => setWish({ listed: !career.listed })}
            >
              Minta dijual
            </button>
          </div>
          <p className="muted small">
            {career.wantsLoan
              ? 'Klub mencarikan klub peminjam saat bursa transfer buka.'
              : career.listed
                ? 'Kamu masuk daftar jual: tawaran lebih sering datang saat bursa buka.'
                : settledUntil
                  ? `Kamu baru tanda tangan kontrak, jadi klub lain belum akan menawar sampai ${shortDate(settledUntil)} ${settledUntil.slice(0, 4)}, kecuali kamu minta dijual.`
                  : 'Tawaran datang sendiri saat bursa transfer buka (musim panas, dan lebih jarang di bulan Januari), tergantung reputasi, performa, dan agentmu.'}
          </p>
        </div>
      )}

      {note && (
        <p className="tr-note" role="status">
          {note}
        </p>
      )}

      {career.offers.length > 0 && (
        <div className="tr-offers">
          <h3>Tawaran ({career.offers.length})</h3>
          {career.offers.map((o) => (
            <OfferCard key={o.id} offer={o} onNote={setNote} />
          ))}
        </div>
      )}

      {career.history.length > 0 && (
        <>
          <button className="link old-toggle" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Sembunyikan riwayat klub' : `Riwayat klub (${career.history.length})`}
          </button>
          {showHistory && (
            <ol className="tr-history">
              {[...career.history].reverse().map((h, i) => (
                <li key={i}>
                  <span className="muted small num">
                    {h.from.slice(0, 7)} – {h.to ? h.to.slice(0, 7) : 'sekarang'}
                  </span>
                  <span>{h.team}</span>
                  <span className="pill">{h.kind}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function OfferCard({ offer: o, onNote }: { offer: Offer; onNote: (s: string) => void }) {
  const world = useGame((s) => s.world)!;
  const career = useGame((s) => s.career)!;
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const accept = useGame((s) => s.acceptOffer);
  const reject = useGame((s) => s.rejectOffer);
  const negotiate = useGame((s) => s.negotiate);
  const [confirm, setConfirm] = useState(false);

  const p = idx.playerById.get(career.playerId)!;
  const club = idx.clubById.get(o.clubId)!;
  const league = world.leagues.find((l) => l.id === club.leagueId)!;
  const current = p.contract?.wagePerWeek ?? 0;
  const diff = current ? Math.round(((o.wage - current) / current) * 100) : null;
  const g = groupOf(p.mainPosition);
  const rivals = squadOf(world, club.id)
    .filter((q) => !q.isYouth && !q.isUser && groupOf(q.mainPosition) === g)
    .sort((a, b) => b.ca - a.ca);
  const better = rivals.filter((q) => q.ca > p.ca + 2).length;
  const top = rivals[0];
  const canAskRole = o.role !== 'Inti';
  const ask = (a: 'gaji' | 'peran') => onNote(negotiate(o.id, a));

  return (
    <article className="offer">
      <header className="offer-head">
        <Badge club={club} size={32} />
        <div className="offer-title">
          <button className="link" onClick={() => go({ kind: 'club', clubId: club.id })}>
            {club.name}
          </button>
          <div className="muted small">
            <Flag id={club.countryId} /> {league.name} <Stars value={league.reputation / 20} />
          </div>
        </div>
        <span className="pill">{TYPE_LABEL[o.type]}</span>
      </header>

      <dl className="offer-grid">
        <dt>Gaji</dt>
        <dd>
          {money(o.wage)}/mg{' '}
          {diff !== null && o.type !== 'pinjaman' && (
            <span className={diff >= 0 ? 'gain' : 'loss'}>
              ({diff >= 0 ? '+' : ''}
              {diff}%)
            </span>
          )}
        </dd>
        <dt>{o.type === 'pinjaman' ? 'Pinjaman' : 'Kontrak'}</dt>
        <dd>{o.type === 'pinjaman' ? `s/d ${shortDate(o.until!)} ${o.until!.slice(0, 4)}` : `${o.years} tahun`}</dd>
        <dt>Peran dijanjikan</dt>
        <dd>
          <b>{o.role}</b>
        </dd>
        {o.signOn > 0 && (
          <>
            <dt>Bonus tanda tangan</dt>
            <dd>{money(o.signOn)}</dd>
          </>
        )}
        {o.fee > 0 && (
          <>
            <dt>Biaya transfer</dt>
            <dd>{money(o.fee)}</dd>
          </>
        )}
        <dt>Reputasi klub</dt>
        <dd>
          <Stars value={club.reputation / 20} />
        </dd>
        <dt>Fasilitas latihan</dt>
        <dd>
          <Stars value={club.facilities.training} />
        </dd>
        <dt>Akademi</dt>
        <dd>
          <Stars value={club.facilities.youth} />
        </dd>
        <dt>Tekanan fans</dt>
        <dd>{pressure(club.fanBase)}</dd>
        <dt>Gaya main</dt>
        <dd>{STYLE_LABEL[club.playingStyle]}</dd>
        <dt>Saingan seposisi</dt>
        <dd>
          {top ? (
            <>
              {fullName(top)} <Stars value={caStars(top.ca)} />
              <div className="muted small">
                {better ? `${better} pemain seposisi lebih bagus darimu` : 'Tidak ada yang jelas lebih bagus darimu'}
              </div>
            </>
          ) : (
            '-'
          )}
        </dd>
      </dl>

      <div className="offer-actions">
        {confirm ? (
          <>
            <button className="primary small-btn" onClick={() => accept(o.id)}>
              Ya, terima
            </button>
            <button className="ghost small" onClick={() => setConfirm(false)}>
              Batal
            </button>
          </>
        ) : (
          <>
            <button className="primary small-btn" onClick={() => setConfirm(true)}>
              Terima
            </button>
            {!o.negotiated && o.type !== 'pinjaman' && (
              <button className="ghost small" onClick={() => ask('gaji')} title="Satu kali negosiasi per tawaran">
                Minta gaji +20%
              </button>
            )}
            {!o.negotiated && canAskRole && (
              <button className="ghost small" onClick={() => ask('peran')} title="Satu kali negosiasi per tawaran">
                Minta peran lebih besar
              </button>
            )}
            <button className="ghost small" onClick={() => reject(o.id)}>
              Tolak
            </button>
          </>
        )}
      </div>
      <div className="muted small">
        Berlaku s/d {shortDate(o.expires)}
        {o.negotiated && ' · sudah dinegosiasi'}
      </div>
    </article>
  );
}
