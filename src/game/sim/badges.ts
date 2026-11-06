// Lencana (special abilities): terbuka kalau syarat atribut + pencapaian terpenuhi.
// Lencana memberi bonus kecil di match engine dan menaikkan nilai pasarmu.

import type { Career, Player } from '../types';
import type { EAttrs } from './engine';

export interface BadgeNeed {
  label: string;
  cur: number;
  goal: number;
}
export interface BadgeCtx {
  p: Player;
  apps: number;
  goals: number;
  assists: number;
  cs: number;
  caps: number;
  feats: { long: number; set: number; head: number };
}
export interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  needs: (c: BadgeCtx) => BadgeNeed[];
  bonus: Partial<Record<keyof EAttrs, number>>;
  /** hanya untuk posisi tertentu */
  only?: (p: Player) => boolean;
}

const att = (label: string, cur: number, goal: number): BadgeNeed => ({ label, cur, goal });
const isGK = (p: Player) => p.mainPosition === 'GK';
const isDef = (p: Player) => ['DC', 'DR', 'DL', 'WBR', 'WBL', 'DM'].includes(p.mainPosition);

export const BADGES: BadgeDef[] = [
  {
    id: 'longshot',
    name: 'Penembak Jarak Jauh',
    icon: '🎯',
    desc: 'Tembakan dari luar kotak lebih berbahaya.',
    needs: (c) => [att('Long Shots', c.p.technical['Long Shots'], 16), att('Gol dari luar kotak', c.feats.long, 10)],
    bonus: { lon: 2 },
  },
  {
    id: 'setpiece',
    name: 'Raja Bola Mati',
    icon: '🧨',
    desc: 'Tendangan bebas dan penalti lebih akurat.',
    needs: (c) => [
      att('Free Kick / Penalti', Math.max(c.p.technical['Free Kick Taking'], c.p.technical['Penalty Taking']), 16),
      att('Gol bola mati', c.feats.set, 6),
    ],
    bonus: { fk: 2, pen: 2 },
  },
  {
    id: 'speed',
    name: 'Pelari Kilat',
    icon: '⚡',
    desc: 'Sedikit lebih cepat saat sprint.',
    needs: (c) => [att('Pace', c.p.physical.Pace, 17), att('Acceleration', c.p.physical.Acceleration, 16)],
    bonus: { pace: 1, acc: 1 },
  },
  {
    id: 'poacher',
    name: 'Predator Kotak Penalti',
    icon: '🦈',
    desc: 'Lebih tenang dan cerdik di depan gawang.',
    needs: (c) => [att('Finishing', c.p.technical.Finishing, 16), att('Off the Ball', c.p.mental['Off the Ball'], 15), att('Gol', c.goals, 60)],
    bonus: { fin: 1, otb: 1 },
    only: (p) => !isGK(p),
  },
  {
    id: 'playmaker',
    name: 'Maestro Umpan',
    icon: '🎼',
    desc: 'Umpan lebih akurat dan visi lebih luas.',
    needs: (c) => [att('Passing', c.p.technical.Passing, 16), att('Vision', c.p.mental.Vision, 16), att('Assist', c.assists, 40)],
    bonus: { pas: 1, vis: 1 },
    only: (p) => !isGK(p),
  },
  {
    id: 'aerial',
    name: 'Raja Udara',
    icon: '🦅',
    desc: 'Menang duel udara dan sundulan lebih tajam.',
    needs: (c) => [att('Heading', c.p.technical.Heading, 16), att('Jumping Reach', c.p.physical['Jumping Reach'], 15), att('Gol sundulan', c.feats.head, 10)],
    bonus: { hea: 1.5, jmp: 1 },
    only: (p) => !isGK(p),
  },
  {
    id: 'wall',
    name: 'Tembok Pertahanan',
    icon: '🧱',
    desc: 'Tekel dan penjagaan lebih rapat.',
    needs: (c) => [att('Tackling', c.p.technical.Tackling, 16), att('Marking', c.p.technical.Marking, 15), att('Clean sheet', c.cs, 30)],
    bonus: { tck: 1, mar: 1 },
    only: isDef,
  },
  {
    id: 'keeper',
    name: 'Kiper Tangguh',
    icon: '🧤',
    desc: 'Refleks dan tangkapan lebih baik.',
    needs: (c) => [att('Reflexes', c.p.goalkeeping.Reflexes, 16), att('Clean sheet', c.cs, 40)],
    bonus: { ref: 1, han: 1 },
    only: isGK,
  },
  {
    id: 'ironman',
    name: 'Mesin Tak Kenal Lelah',
    icon: '🔋',
    desc: 'Stamina lebih awet sampai menit akhir.',
    needs: (c) => [att('Stamina', c.p.physical.Stamina, 17), att('Natural Fitness', c.p.physical['Natural Fitness'], 15), att('Main', c.apps, 200)],
    bonus: { sta: 1.5 },
  },
  {
    id: 'captain',
    name: 'Kapten',
    icon: '©️',
    desc: 'Pemimpin di lapangan: lebih tenang dan kompak dengan tim.',
    needs: (c) => [att('Leadership', c.p.mental.Leadership, 15), att('Main', c.apps, 150)],
    bonus: { cmp: 1, tea: 1 },
  },
  {
    id: 'dribbler',
    name: 'Penggiring Lincah',
    icon: '🌀',
    desc: 'Lebih sulit direbut saat menggiring bola.',
    needs: (c) => [att('Dribbling', c.p.technical.Dribbling, 16), att('Agility', c.p.physical.Agility, 15), att('Flair', c.p.mental.Flair, 14)],
    bonus: { dri: 1.5, agi: 0.5 },
    only: (p) => !isGK(p),
  },
  {
    id: 'biggame',
    name: 'Pemain Laga Besar',
    icon: '🌟',
    desc: 'Tidak gugup di laga penting.',
    needs: (c) => [att('Important Matches', c.p.hidden['Important Matches'], 15), att('Caps timnas', c.caps, 25)],
    bonus: { cmp: 1.5 },
  },
];
export const BADGE_BY_ID: Record<string, BadgeDef> = Object.fromEntries(BADGES.map((b) => [b.id, b]));

/** Total karier untuk syarat lencana (laga liga + timnas) */
export function badgeCtx(career: Career, p: Player): BadgeCtx {
  let apps = 0;
  let goals = 0;
  let assists = 0;
  let cs = 0;
  for (const s of career.stats) {
    if (s.comp === 'Amatir' || s.comp === 'U19' || s.comp === 'Timnas U20') continue;
    apps += s.apps;
    goals += s.goals;
    assists += s.assists;
    cs += s.cleanSheets;
  }
  return { p, apps, goals, assists, cs, caps: career.intl?.caps ?? 0, feats: career.feats ?? { long: 0, set: 0, head: 0 } };
}

export const badgeReady = (b: BadgeDef, c: BadgeCtx) => (!b.only || b.only(c.p)) && b.needs(c).every((n) => n.cur >= n.goal);

/** Lencana yang baru terbuka minggu ini */
export function newBadges(career: Career, p: Player): BadgeDef[] {
  const have = new Set(career.badges ?? []);
  const c = badgeCtx(career, p);
  return BADGES.filter((b) => !have.has(b.id) && badgeReady(b, c));
}

/** Bonus lencana di match engine (atribut maksimal 20) */
export function applyBadges(a: EAttrs, ids: string[] | undefined) {
  for (const id of ids ?? []) {
    const b = BADGE_BY_ID[id];
    if (!b) continue;
    for (const [k, v] of Object.entries(b.bonus) as [keyof EAttrs, number][]) a[k] = Math.min(20, a[k] + v);
  }
}

const BONUS_LABEL: Partial<Record<keyof EAttrs, string>> = {
  lon: 'Long Shots', fk: 'Free Kick', pen: 'Penalti', pace: 'Pace', acc: 'Acceleration', fin: 'Finishing',
  otb: 'Off the Ball', pas: 'Passing', vis: 'Vision', hea: 'Heading', jmp: 'Jumping Reach', tck: 'Tackling',
  mar: 'Marking', ref: 'Reflexes', han: 'Handling', sta: 'Stamina', cmp: 'Composure', tea: 'Teamwork',
  dri: 'Dribbling', agi: 'Agility',
};
/** "Long Shots +2, Free Kick +2" */
export const bonusText = (b: BadgeDef) =>
  (Object.entries(b.bonus) as [keyof EAttrs, number][]).map(([k, v]) => `${BONUS_LABEL[k] ?? k} +${v}`).join(', ');

/** Nilai pasar naik 5% per lencana */
export const badgeValue = (career: Career | undefined) => 1 + 0.05 * (career?.badges?.length ?? 0);
