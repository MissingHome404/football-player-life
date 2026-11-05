// Panel Relasi di beranda: manajer, fans, media, keluarga, pasangan, rekan setim.

import { useState } from 'react';
import { useGame } from './store';
import { fullName } from '../game/gen/names';
import { partnerWeekly, relLabel } from '../game/sim/relations';
import type { MateTag } from '../game/types';

const TAG: Record<MateTag, string> = { sahabat: 'Sahabat', mentor: 'Mentor', rival: 'Rival posisi' };
const STAGE = { pacaran: 'Pacar', tunangan: 'Tunangan', menikah: 'Istri' } as const;

function RelBar({ v }: { v: number }) {
  return (
    <div className="relbar" role="meter" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      <div
        className={`relbar-fill ${v >= 0 ? 'up' : 'down'}`}
        style={v >= 0 ? { left: '50%', width: `${v / 2}%` } : { right: '50%', width: `${-v / 2}%` }}
      />
    </div>
  );
}

function Row({ title, sub, v, onClick }: { title: string; sub?: string; v: number; onClick?: () => void }) {
  return (
    <li className="rel-row">
      <div className="rel-who">
        {onClick ? (
          <button className="link" onClick={onClick}>
            {title}
          </button>
        ) : (
          <b>{title}</b>
        )}
        {sub && <span className="muted small">{sub}</span>}
      </div>
      <RelBar v={v} />
      <span className={`small rel-word ${v >= 20 ? 'gain' : v <= -20 ? 'loss' : 'muted'}`}>{relLabel(v)}</span>
    </li>
  );
}

export function RelationsPanel() {
  const career = useGame((s) => s.career)!;
  const world = useGame((s) => s.world)!;
  const idx = useGame((s) => s.idx)!;
  const go = useGame((s) => s.go);
  const [showOld, setShowOld] = useState(false);
  const rel = career.rel;
  const club = rel.clubId ? idx.clubById.get(rel.clubId) : undefined;
  const manager = rel.manager ? world.staff.find((s) => s.id === rel.manager!.staffId) : undefined;
  const family = ((career.family.support - 10.5) / 9.5) * 100;
  const here = rel.mates.filter((m) => m.clubId === rel.clubId);
  const away = rel.mates.filter((m) => m.clubId !== rel.clubId);
  const oldFans = Object.entries(rel.fans).filter(([id]) => id !== rel.clubId);
  const weekly = partnerWeekly(career);

  return (
    <section className="panel relations">
      <h2>Relasi</h2>
      <ul className="rel-list">
        {rel.manager && club && (
          <Row title={manager ? fullName(manager) : 'Manajer'} sub={`Manajer ${club.name}`} v={rel.manager.value} />
        )}
        {club && <Row title={`Fans ${club.name}`} v={rel.fans[club.id] ?? 0} />}
        <Row title="Media" v={rel.media} />
        <Row title="Keluarga" sub={`Dukungan ${career.family.support}/20`} v={family} />
        {rel.partner ? (
          <>
            <Row title={rel.partner.name} sub={STAGE[rel.partner.stage]} v={rel.partner.value} />
            <li className={`small rel-hint ${weekly > 0 ? 'gain' : 'loss'}`}>
              Dengan rencana minggu ini: {weekly > 0 ? '+' : ''}
              {weekly.toFixed(1)} per minggu.
              {career.plan.activity !== 'kencan' && ' Pilih kegiatan Kencan supaya relasi naik cepat.'}
            </li>
          </>
        ) : (
          <li className="rel-row muted small">Belum punya pasangan.</li>
        )}
      </ul>

      {(here.length > 0 || away.length > 0) && (
        <>
          <h3>Rekan setim</h3>
          <ul className="rel-list">
            {here.map((m) => (
              <Row key={m.playerId} title={m.name} sub={TAG[m.tag]} v={m.value} onClick={() => go({ kind: 'player', playerId: m.playerId })} />
            ))}
            {away.map((m) => (
              <Row
                key={m.playerId}
                title={m.name}
                sub={`${TAG[m.tag]} · sekarang di ${m.clubId ? (idx.clubById.get(m.clubId)?.name ?? '-') : 'tanpa klub'}`}
                v={m.value}
                onClick={() => go({ kind: 'player', playerId: m.playerId })}
              />
            ))}
          </ul>
        </>
      )}

      {oldFans.length > 0 && (
        <>
          <button className="link old-toggle" aria-expanded={showOld} onClick={() => setShowOld(!showOld)}>
            {showOld ? 'Sembunyikan fans bekas klub' : `Fans bekas klub (${oldFans.length})`}
          </button>
          {showOld && (
            <ul className="rel-list">
              {oldFans.map(([id, v]) => (
                <Row key={id} title={`Fans ${idx.clubById.get(id)?.name ?? id}`} v={v} />
              ))}
            </ul>
          )}
        </>
      )}
      <p className="muted small rel-tip">
        Manajer menilai performa dan sikapmu, dan relasi yang baik membuatmu lebih sering dimainkan. Pasangan butuh waktu: tanpa
        kencan, relasinya pelan-pelan turun.
      </p>
    </section>
  );
}
