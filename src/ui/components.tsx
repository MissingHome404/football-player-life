import type { Club } from '../game/types';
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
