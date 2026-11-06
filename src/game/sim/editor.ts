// Editor in-game (cheat) ala FM: ubah atribut, potensi, posisi, uang, stres, kebugaran,
// reputasi, kontrak & bonus pemain kita. Karier yang pernah diedit diberi tanda.

import type { Position } from '../data/attributes';
import { computeCA } from '../gen/player';
import { clamp } from '../rng';
import type { Career, ContractBonus, Player, SquadRole, World } from '../types';
import { replacePlayer } from './season';
import { bonusOf } from './bonus';
import { clubKey } from './understanding';

export const ATTR_GROUPS = ['technical', 'mental', 'physical', 'goalkeeping', 'personality', 'hidden'] as const;
export type AttrGroup = (typeof ATTR_GROUPS)[number];

export interface EditorDraft {
  attrs: Record<AttrGroup, Record<string, number>>;
  pa: number;
  positions: Partial<Record<Position, number>>;
  heightCm: number;
  weightKg: number;
  leftFoot: number;
  rightFoot: number;
  repHome: number;
  repWorld: number;
  money: number;
  savings: number;
  stress: number;
  fitness: number;
  familySupport: number;
  /** pemahaman taktik semua pelatih (0-100), null = tidak diubah */
  tactic: number | null;
  healInjury: boolean;
  clearBan: boolean;
  contract: { wage: number; expires: string; role: SquadRole; bonus: ContractBonus } | null;
}

export function draftOf(career: Career, p: Player): EditorDraft {
  const attrs = Object.fromEntries(ATTR_GROUPS.map((g) => [g, { ...(p[g] as Record<string, number>) }])) as EditorDraft['attrs'];
  const b = bonusOf(p.contract, p);
  return {
    attrs,
    pa: p.pa,
    positions: { ...p.positions },
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    leftFoot: p.leftFoot,
    rightFoot: p.rightFoot,
    repHome: p.reputation.home,
    repWorld: p.reputation.world,
    money: Math.round(career.money),
    savings: Math.round(career.life.savings),
    stress: Math.round(career.stress),
    fitness: Math.round(career.fitness),
    familySupport: career.family.support,
    tactic: null,
    healInjury: false,
    clearBan: false,
    contract: p.contract
      ? {
          wage: p.contract.wagePerWeek,
          expires: p.contract.expires,
          role: p.contract.role,
          bonus: b ?? { app: 0, unused: 0, goal: 0, assist: 0, cs: 0, trophy: 0 },
        }
      : null,
  };
}

const int = (v: number, lo: number, hi: number) => clamp(Math.round(Number.isFinite(v) ? v : lo), lo, hi);

/** Terapkan draft editor. Mengembalikan dunia & karier baru plus catatan. */
export function applyEditor(world: World, prev: Career, d: EditorDraft): { world: World; career: Career; notes: string[] } {
  const career: Career = structuredClone(prev);
  const me = world.players.find((x) => x.id === career.playerId)!;
  const p: Player = structuredClone(me);
  const notes: string[] = [];

  for (const g of ATTR_GROUPS) {
    const grp = p[g] as Record<string, number>;
    for (const [a, v] of Object.entries(d.attrs[g])) if (a in grp) grp[a] = int(v, 1, 20);
  }
  for (const [pos, v] of Object.entries(d.positions)) {
    const n = int(v ?? 1, 1, 20);
    if (pos === p.mainPosition) continue;
    p.positions = { ...p.positions, [pos]: n };
  }
  p.heightCm = int(d.heightCm, 150, 210);
  p.weightKg = int(d.weightKg, 45, 120);
  p.leftFoot = int(d.leftFoot, 1, 20);
  p.rightFoot = int(d.rightFoot, 1, 20);
  p.reputation = { home: int(d.repHome, 1, 100), world: int(d.repWorld, 1, 100) };
  p.ca = clamp(computeCA(p), 1, 200);
  p.pa = int(d.pa, 1, 200);
  if (p.ca > p.pa) {
    p.pa = p.ca;
    notes.push(`Potensi (PA) dinaikkan ke ${p.pa} supaya tidak di bawah kemampuan sekarang.`);
  }

  career.money = Math.round(Number.isFinite(d.money) ? d.money : career.money);
  career.life = { ...career.life, savings: Math.max(0, Math.round(Number.isFinite(d.savings) ? d.savings : 0)) };
  career.stress = int(d.stress, 0, 100);
  career.fitness = int(d.fitness, 0, 100);
  career.family = { ...career.family, support: int(d.familySupport, 1, 20) };
  if (d.tactic !== null) {
    const v = int(d.tactic, 0, 100) / 100;
    career.tacticFam = Object.fromEntries(Object.keys(career.tacticFam ?? {}).map((k) => [k, v]));
    // kunci yang belum ada: dibuat saat dibutuhkan; set klub sekarang juga
    if (p.contract) {
      const club = world.clubs.find((c) => c.id === p.contract!.clubId);
      if (club) career.tacticFam[clubKey(club)] = v;
    }
  }
  if (d.healInjury) {
    career.injury = null;
    career.fragile = undefined;
  }
  if (d.clearBan) career.ban = { club: 0, nat: 0 };
  if (d.contract && p.contract) {
    const b = d.contract.bonus;
    const m = (v: number) => Math.max(0, Math.round(Number.isFinite(v) ? v : 0));
    p.contract = {
      ...p.contract,
      wagePerWeek: m(d.contract.wage),
      expires: /^\d{4}-\d{2}-\d{2}$/.test(d.contract.expires) && d.contract.expires > career.currentDate ? d.contract.expires : p.contract.expires,
      role: d.contract.role,
      bonus: { app: m(b.app), unused: m(b.unused), goal: m(b.goal), assist: m(b.assist), cs: m(b.cs), trophy: m(b.trophy) },
    };
  }
  career.peakCA = Math.max(career.peakCA ?? 0, p.ca);
  career.edited = true;
  return { world: replacePlayer(world, p), career, notes };
}
