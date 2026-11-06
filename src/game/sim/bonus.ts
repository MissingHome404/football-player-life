// Bonus performa di kontrak, bonus penghargaan individu, dan denda kartu merah.
// Semua bonus dipotong pajak dan komisi agent seperti gaji; denda dibayar penuh.

import type { AwardKind, Career, Contract, ContractBonus, MatchRecord, Player, SquadRole } from '../types';
import type { Position } from '../data/attributes';
import { Rng } from '../rng';
import { TAX_RATE } from './economy';

const LOG_LIMIT = 40;
const DEF = new Set<Position>(['GK', 'DC', 'DR', 'DL', 'WBR', 'WBL']);
const ATT = new Set<Position>(['AMR', 'AML', 'AMC', 'ST']);
/** Kompetisi klub senior yang dibayar bonus kontrak */
const BONUS_COMPS = new Set<MatchRecord['comp']>(['Liga', 'Piala', 'Kontinental']);

const nice = (v: number) => (v <= 0 ? 0 : v < 100 ? Math.max(5, Math.round(v / 5) * 5) : Math.round(v / 10) * 10);

/**
 * Bonus performa untuk tawaran kontrak. Besarnya mengikuti gaji: bonus main ±25% gaji mingguan,
 * gol untuk penyerang lebih besar, clean sheet hanya untuk kiper & bek. Pemain cadangan dapat
 * bonus bangku lebih besar (klub tahu kamu jarang main).
 */
export function makeBonus(wage: number, pos: Position, role: SquadRole, seed: string): ContractBonus {
  const rng = new Rng(`bonus:${seed}`);
  const att = ATT.has(pos);
  const def = DEF.has(pos);
  const app = wage * rng.float(0.15, 0.35);
  const goal = wage * (att ? rng.float(0.3, 0.6) : def ? rng.float(0.5, 1) : rng.float(0.35, 0.7));
  return {
    app: nice(app),
    unused: nice(app * (role === 'Inti' ? 0.25 : 0.45)),
    goal: nice(goal),
    assist: nice(goal * rng.float(0.5, 0.75)),
    cs: def ? nice(wage * (pos === 'GK' ? rng.float(0.3, 0.55) : rng.float(0.2, 0.4))) : 0,
    trophy: nice(wage * rng.float(4, 10)),
  };
}

/**
 * Bonus kontrak yang berlaku. Kontrak dari sebelum ada fitur bonus (atau kontrak akademi) memakai
 * bonus standar yang dihitung dari gajinya, selalu sama untuk kontrak yang sama.
 */
export function bonusOf(c: Contract | null | undefined, p: Player): ContractBonus | undefined {
  if (!c || c.wagePerWeek <= 0) return undefined;
  return c.bonus ?? makeBonus(c.wagePerWeek, p.mainPosition, c.role, `std:${p.id}:${c.clubId}:${c.expires}`);
}

/** Naikkan semua bonus (negosiasi) */
export function raiseBonus(b: ContractBonus, f: number): ContractBonus {
  return {
    app: nice(b.app * f),
    unused: nice(b.unused * f),
    goal: nice(b.goal * f),
    assist: nice(b.assist * f),
    cs: nice(b.cs * f),
    trophy: nice(b.trophy * f),
  };
}

/** Bonus kotor -> bersih setelah pajak dan komisi agent */
export const netBonus = (career: Career, gross: number) => Math.round(gross * (1 - TAX_RATE - (career.agent?.fee ?? 0)) * 100) / 100;

function log(career: Career, date: string, label: string, amount: number) {
  const list = (career.bonusLog ??= []);
  list.unshift({ date, label, amount: Math.round(amount * 100) / 100 });
  list.length = Math.min(list.length, LOG_LIMIT);
}

const eur = (v: number) => `€${Math.round(v).toLocaleString('id-ID')}`;

/** Bayar bonus kotor `gross`: uang bersih masuk, dicatat. Mengembalikan jumlah bersih. */
export function payBonus(career: Career, date: string, label: string, gross: number): number {
  if (gross <= 0) return 0;
  const net = netBonus(career, gross);
  career.money = Math.round((career.money + net) * 100) / 100;
  log(career, date, label, net);
  return net;
}

/** Rincian bonus satu laga sesuai kontrak */
export function matchBonusParts(b: ContractBonus, rec: MatchRecord): [string, number][] {
  const parts: [string, number][] = [];
  if (rec.status === 'Inti' || (rec.status === 'Cadangan' && rec.minutes > 0)) parts.push(['dimainkan', b.app]);
  else if (rec.status === 'Cadangan') parts.push(['di bangku cadangan', b.unused]);
  if (rec.minutes > 0) {
    if (rec.goals) parts.push([`${rec.goals} gol`, rec.goals * b.goal]);
    if (rec.assists) parts.push([`${rec.assists} assist`, rec.assists * b.assist]);
    if (rec.cleanSheet && rec.minutes >= 60 && b.cs) parts.push(['clean sheet', b.cs]);
  }
  return parts.filter(([, v]) => v > 0);
}

/**
 * Setelah laga klub: bonus performa sesuai kontrak dan denda kartu merah.
 * Hanya laga senior (liga, piala, benua) dengan kontrak klub yang kamu bela di laga itu.
 */
export function clubMatchMoney(career: Career, rec: MatchRecord, player: Player | undefined, notes?: string[]) {
  const c = player?.contract;
  if (!c || !BONUS_COMPS.has(rec.comp)) return;
  const b = bonusOf(c, player!);
  if (b) {
    const parts = matchBonusParts(b, rec);
    const gross = parts.reduce((a, [, v]) => a + v, 0);
    if (gross > 0) {
      const net = payBonus(career, rec.date, `Bonus laga vs ${rec.opponent} (${parts.map(([k]) => k).join(', ')})`, gross);
      notes?.push(`Bonus laga vs ${rec.opponent}: ${eur(net)} bersih (${parts.map(([k]) => k).join(', ')}).`);
    }
  }
  if (rec.card === 'R' || rec.card === 'YR') redCardFine(career, rec, c, notes);
}

/** Denda klub untuk kartu merah: 2 minggu gaji (merah langsung) atau 1 minggu (dua kuning) */
export function redCardFine(career: Career, rec: MatchRecord, c: Contract, notes?: string[]) {
  const weeks = rec.card === 'R' ? 2 : 1;
  const fine = Math.round(c.wagePerWeek * weeks);
  if (fine <= 0) return;
  career.money = Math.round((career.money - fine) * 100) / 100;
  log(career, rec.date, `Denda kartu merah vs ${rec.opponent}`, -fine);
  notes?.push(`Klub mendendamu ${eur(fine)} karena kartu merah.`);
  career.inbox.unshift({
    id: `fine-${rec.date}-${rec.opponentId ?? rec.opponent}`,
    date: rec.date,
    from: `Manajemen ${rec.team}`,
    title: `Denda kartu merah: ${eur(fine)}`,
    body: `Kartu ${rec.card === 'R' ? 'merah langsung' : 'merah (dua kuning)'} saat melawan ${rec.opponent} merugikan tim. Sesuai aturan disiplin klub, kamu didenda ${weeks} minggu gaji (${eur(fine)}).`,
  });
}

/** Bonus juara bersama klub (liga, piala, benua) sesuai kontrak klub itu */
export function trophyBonus(career: Career, player: Player | undefined, clubId: string, comp: string, date: string, notes?: string[]) {
  const c = player?.contract;
  const b = bonusOf(c, player!);
  if (!b?.trophy || c!.clubId !== clubId) return;
  const net = payBonus(career, date, `Bonus juara ${comp}`, b.trophy);
  notes?.push(`Bonus juara ${comp}: ${eur(net)} bersih.`);
}

/** Bonus penghargaan individu: kelipatan gaji mingguan (minimal dari hadiah federasi) */
export const AWARD_WEEKS: Record<AwardKind, number> = { pots: 10, top: 6, assist: 4, gk: 5, young: 4, world: 25, worldYoung: 8 };
const AWARD_MIN: Record<AwardKind, number> = { pots: 2000, top: 1500, assist: 1000, gk: 1200, young: 1000, world: 50000, worldYoung: 10000 };

export function awardBonus(career: Career, player: Player, kind: AwardKind, title: string, date: string): number {
  const wage = player.contract?.wagePerWeek ?? 0;
  const gross = Math.max(AWARD_MIN[kind], wage * AWARD_WEEKS[kind]);
  return payBonus(career, date, `Bonus penghargaan ${title}`, gross);
}

export { eur as bonusEur };
