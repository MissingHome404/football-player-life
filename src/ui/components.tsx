import type { Club, Player } from '../game/types';
import type { Position } from '../game/data/attributes';
import { ROLES, POSITION_ROLES, roleRating } from '../game/data/roles';
import { flagOf, COUNTRY_BY_ID } from '../game/data/countries';

/** Logo klub otomatis: bentuk + 2 warna + inisial */
export function Badge({ club, size = 32 }: { club: Club; size?: number }) {
  const [c1, c2] = club.colors;
  const text = club.badge.initials;
  const light = isLight(c1);
  const fg = light ? (isLight(c2) ? '#111' : c2) : isLight(c2) ? c2 : '#fff';
  const fs = text.length >= 3 ? 26 : 32;
  let shape: React.ReactNode;
  switch (club.badge.shape) {
    case 'round':
      shape = (
        <>
          <circle cx="50" cy="50" r="46" fill={c2} />
          <circle cx="50" cy="50" r="39" fill={c1} />
        </>
      );
      break;
    case 'diamond':
      shape = (
        <>
          <polygon points="50,2 98,50 50,98 2,50" fill={c2} />
          <polygon points="50,11 89,50 50,89 11,50" fill={c1} />
        </>
      );
      break;
    case 'classic':
      shape = (
        <>
          <path d="M8 6 H92 V52 C92 78 70 92 50 98 C30 92 8 78 8 52 Z" fill={c2} />
          <path d="M15 13 H85 V52 C85 73 67 85 50 90 C33 85 15 73 15 52 Z" fill={c1} />
          <rect x="15" y="13" width="70" height="14" fill={c2} opacity="0.85" />
        </>
      );
      break;
    default:
      shape = (
        <>
          <path d="M50 2 L94 16 V50 C94 76 72 92 50 98 C28 92 6 76 6 50 V16 Z" fill={c2} />
          <path d="M50 10 L86 22 V50 C86 71 68 84 50 90 C32 84 14 71 14 50 V22 Z" fill={c1} />
        </>
      );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="badge" aria-label={club.name}>
      {shape}
      <text
        x="50"
        y={club.badge.shape === 'classic' ? 66 : 60}
        textAnchor="middle"
        fontSize={fs}
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
        fill={fg}
      >
        {text}
      </text>
    </svg>
  );
}

function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

export function Flag({ id, withName = false }: { id: string; withName?: boolean }) {
  return (
    <span className="flag" title={COUNTRY_BY_ID[id]?.name}>
      {flagOf(id)}
      {withName && <> {COUNTRY_BY_ID[id]?.name}</>}
    </span>
  );
}

/** Bintang 0,5-5 ala FM */
export function Stars({ value, max = 5 }: { value: number; max?: number }) {
  const v = Math.max(0.5, Math.min(max, Math.round(value * 2) / 2));
  const full = Math.floor(v);
  const half = v - full >= 0.5;
  return (
    <span className="stars" title={`${v} / ${max}`}>
      {'★'.repeat(full)}
      {half && <span className="half">★</span>}
      <span className="empty">{'★'.repeat(max - full - (half ? 1 : 0))}</span>
    </span>
  );
}

export const caStars = (ca: number) => ca / 40;

export function AttrValue({ v, invert = false }: { v: number; invert?: boolean }) {
  const c = invert ? 21 - v : v;
  const cls = c >= 16 ? 'a-hi' : c >= 11 ? 'a-mid' : c >= 6 ? 'a-low' : 'a-poor';
  return <span className={`attr ${cls}`}>{v}</span>;
}

const eur = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
export const money = (v: number) => {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (v >= 10_000) return `€${(v / 1000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  return `€${eur.format(v)}`;
};
export const num = (v: number) => eur.format(v);

// Untuk atribut ini angka rendah justru bagus
const LOWER_IS_BETTER = new Set(['Controversy', 'Dirtiness', 'Injury Proneness']);

export interface Highlight {
  key: Set<string>;
  pref: Set<string>;
}

export function AttrBlock({
  title,
  keys,
  values,
  hl,
}: {
  title: string;
  keys: readonly string[];
  values: Record<string, number>;
  hl?: Highlight;
}) {
  return (
    <div className="attr-block">
      <h3>{title}</h3>
      {keys.map((k) => (
        <div
          key={k}
          className={`attr-row ${hl?.key.has(k) ? 'hl-key' : hl?.pref.has(k) ? 'hl-pref' : ''}`}
        >
          <span>{k}</span>
          <AttrValue v={values[k]} invert={LOWER_IS_BETTER.has(k)} />
        </div>
      ))}
    </div>
  );
}


/** Semua atribut terlihat dalam satu map */
export const allAttrs = (p: Player): Record<string, number> => ({
  ...p.technical,
  ...p.mental,
  ...p.physical,
  ...p.goalkeeping,
});

export const roleHighlight = (roleId: string): Highlight => {
  const role = ROLES[roleId];
  return { key: new Set(role.key), pref: new Set(role.pref) };
};

/** Daftar peran yang cocok dengan posisi pemain, dengan bintang kecocokan */
export function RolePanel({
  player,
  selected,
  onSelect,
}: {
  player: Player;
  selected: string;
  onSelect: (roleId: string) => void;
}) {
  const attrs = allAttrs(player);
  const positions = (Object.entries(player.positions) as [Position, number][])
    .filter(([pos, v]) => pos === player.mainPosition || v >= 15)
    .sort((a, b) => b[1] - a[1])
    .map(([pos]) => pos);
  const ids: string[] = [];
  for (const pos of positions) for (const id of POSITION_ROLES[pos]) if (!ids.includes(id)) ids.push(id);
  const role = ROLES[selected];
  return (
    <section className="panel roles">
      <div className="roles-head">
        <h2>Peran</h2>
        <span className="muted small">
          Pilih peran untuk menyorot atributnya. <span className="lg lg-key">kunci</span>{' '}
          <span className="lg lg-pref">pendukung</span>
        </span>
      </div>
      <div className="role-chips">
        {ids.map((id) => {
          const r = ROLES[id];
          const rating = roleRating(attrs, r);
          return (
            <button
              key={id}
              className={`role-chip ${id === selected ? 'sel' : ''}`}
              onClick={() => onSelect(id)}
              title={r.desc}
            >
              <span className="role-name">
                {r.name}
                {id === player.preferredRole && <span className="fav" title="Peran favorit"> ♥</span>}
              </span>
              <Stars value={rating / 4} />
            </button>
          );
        })}
      </div>
      {role && <p className="role-desc muted">{role.desc}</p>}
    </section>
  );
}
