// Editor in-game (cheat) ala FM: ubah pemain mana saja (atribut, potensi, posisi, peran, tubuh,
// umur, kewarganegaraan, reputasi, klub & kontrak) plus data karier pemain kita sendiri
// (uang, stres, kebugaran, cedera, skorsing, bonus). Karier yang pernah diedit diberi tanda.

import { POSITIONS, type Position } from '../data/attributes';
import { COUNTRY_BY_ID } from '../data/countries';
import { POSITION_ROLES, ROLES, roleRating } from '../data/roles';
import { addDays } from '../date';
import { ageOn, computeCA } from '../gen/player';
import { clamp } from '../rng';
import type { Career, ContractBonus, Player, SquadRole, World } from '../types';
import { replacePlayer } from './season';
import { bonusOf } from './bonus';
import { clubKey } from './understanding';
import { flatAttrs } from './roleplay';

export const ATTR_GROUPS = ['technical', 'mental', 'physical', 'goalkeeping', 'personality', 'hidden'] as const;
export type AttrGroup = (typeof ATTR_GROUPS)[number];

/** Umur yang boleh dipilih lewat editor */
export const EDIT_AGE: [number, number] = [14, 45];

export interface EditorContract {
  /** null = tanpa klub (bebas transfer); hanya bisa diubah untuk pemain lain */
  clubId: string | null;
  wage: number;
  expires: string;
  role: SquadRole;
  bonus: ContractBonus;
}

/** Data karier yang hanya ada untuk pemain kita */
export interface EditorCareer {
  money: number;
  savings: number;
  stress: number;
  fitness: number;
  familySupport: number;
  /** pemahaman taktik semua pelatih (0-100), null = tidak diubah */
  tactic: number | null;
  healInjury: boolean;
  clearBan: boolean;
}

export interface EditorDraft {
  playerId: string;
  attrs: Record<AttrGroup, Record<string, number>>;
  pa: number;
  mainPosition: Position;
  preferredRole: string;
  positions: Partial<Record<Position, number>>;
  heightCm: number;
  weightKg: number;
  leftFoot: number;
  rightFoot: number;
  birthDate: string;
  nationalityId: string;
  repHome: number;
  repWorld: number;
  /** null untuk pemain lain */
  career: EditorCareer | null;
  contract: EditorContract | null;
}

const NO_BONUS: ContractBonus = { app: 0, unused: 0, goal: 0, assist: 0, cs: 0, trophy: 0 };

export function draftOf(career: Career, p: Player): EditorDraft {
  const attrs = Object.fromEntries(ATTR_GROUPS.map((g) => [g, { ...(p[g] as Record<string, number>) }])) as EditorDraft['attrs'];
  const mine = p.id === career.playerId;
  const contract: EditorContract | null = p.contract
    ? {
        clubId: p.contract.clubId,
        wage: p.contract.wagePerWeek,
        expires: p.contract.expires,
        role: p.contract.role,
        bonus: (mine ? bonusOf(p.contract, p) : p.contract.bonus) ?? { ...NO_BONUS },
      }
    : mine
      ? null
      : // pemain tanpa klub: isian kontrak siap dipakai kalau dia dipindah ke sebuah klub
        { clubId: null, wage: 1000, expires: addDays(career.currentDate, 730), role: 'Rotasi', bonus: { ...NO_BONUS } };
  return {
    playerId: p.id,
    attrs,
    pa: p.pa,
    mainPosition: p.mainPosition,
    preferredRole: p.preferredRole,
    positions: { ...p.positions },
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    leftFoot: p.leftFoot,
    rightFoot: p.rightFoot,
    birthDate: p.birthDate,
    nationalityId: p.nationalityId,
    repHome: p.reputation.home,
    repWorld: p.reputation.world,
    career: mine
      ? {
          money: Math.round(career.money),
          savings: Math.round(career.life.savings),
          stress: Math.round(career.stress),
          fitness: Math.round(career.fitness),
          familySupport: career.family.support,
          tactic: null,
          healInjury: false,
          clearBan: false,
        }
      : null,
    contract,
  };
}

const int = (v: number, lo: number, hi: number) => clamp(Math.round(Number.isFinite(v) ? v : lo), lo, hi);

/** Peran terbaik pemain untuk sebuah posisi (dipakai saat posisi utama diganti) */
export function bestRoleFor(p: Player, pos: Position): string {
  const attrs = flatAttrs(p);
  let best = POSITION_ROLES[pos][0];
  let top = -1;
  for (const id of POSITION_ROLES[pos]) {
    const v = roleRating(attrs, ROLES[id]);
    if (v > top) {
      top = v;
      best = id;
    }
  }
  return best;
}

/** Terapkan draft editor ke pemain mana saja. Mengembalikan dunia & karier baru plus catatan. */
export function applyEditor(world: World, prev: Career, d: EditorDraft): { world: World; career: Career; notes: string[] } {
  const career: Career = structuredClone(prev);
  const target = world.players.find((x) => x.id === d.playerId);
  if (!target) return { world, career: prev, notes: ['Pemain tidak ditemukan.'] };
  const mine = target.id === career.playerId;
  const p: Player = structuredClone(target);
  const notes: string[] = [];

  for (const g of ATTR_GROUPS) {
    const grp = p[g] as Record<string, number>;
    for (const [a, v] of Object.entries(d.attrs[g])) if (a in grp) grp[a] = int(v, 1, 20);
  }

  // posisi: posisi utama selalu 20, posisi lain 1-20
  if (POSITIONS.includes(d.mainPosition) && d.mainPosition !== p.mainPosition) {
    notes.push(`Posisi utama diganti ke ${d.mainPosition}.`);
    p.mainPosition = d.mainPosition;
  }
  const positions: Partial<Record<Position, number>> = { ...p.positions };
  for (const [pos, v] of Object.entries(d.positions) as [Position, number | undefined][]) {
    if (pos === p.mainPosition || !POSITIONS.includes(pos)) continue;
    positions[pos] = int(v ?? 1, 1, 20);
  }
  positions[p.mainPosition] = 20;
  p.positions = positions;
  p.preferredRole = POSITION_ROLES[p.mainPosition].includes(d.preferredRole) ? d.preferredRole : bestRoleFor(p, p.mainPosition);

  p.heightCm = int(d.heightCm, 150, 210);
  p.weightKg = int(d.weightKg, 45, 120);
  p.leftFoot = int(d.leftFoot, 1, 20);
  p.rightFoot = int(d.rightFoot, 1, 20);
  p.reputation = { home: int(d.repHome, 1, 100), world: int(d.repWorld, 1, 100) };
  if (/^\d{4}-\d{2}-\d{2}$/.test(d.birthDate) && d.birthDate !== p.birthDate) {
    const age = ageOn(d.birthDate, career.currentDate);
    if (age >= EDIT_AGE[0] && age <= EDIT_AGE[1]) p.birthDate = d.birthDate;
    else notes.push(`Tanggal lahir tidak diubah: umur harus ${EDIT_AGE[0]}-${EDIT_AGE[1]} tahun.`);
  }
  if (COUNTRY_BY_ID[d.nationalityId]) p.nationalityId = d.nationalityId;

  p.ca = clamp(computeCA(p), 1, 200);
  p.pa = int(d.pa, 1, 200);
  if (p.ca > p.pa) {
    p.pa = p.ca;
    notes.push(`Potensi (PA) dinaikkan ke ${p.pa} supaya tidak di bawah kemampuan sekarang.`);
  }

  if (mine && d.career) {
    const c = d.career;
    career.money = Math.round(Number.isFinite(c.money) ? c.money : career.money);
    career.life = { ...career.life, savings: Math.max(0, Math.round(Number.isFinite(c.savings) ? c.savings : 0)) };
    career.stress = int(c.stress, 0, 100);
    career.fitness = int(c.fitness, 0, 100);
    career.family = { ...career.family, support: int(c.familySupport, 1, 20) };
    if (c.tactic !== null) {
      const v = int(c.tactic, 0, 100) / 100;
      career.tacticFam = Object.fromEntries(Object.keys(career.tacticFam ?? {}).map((k) => [k, v]));
      // kunci yang belum ada: dibuat saat dibutuhkan; set klub sekarang juga
      if (p.contract) {
        const club = world.clubs.find((x) => x.id === p.contract!.clubId);
        if (club) career.tacticFam[clubKey(club)] = v;
      }
    }
    if (c.healInjury) {
      career.injury = null;
      career.fragile = undefined;
    }
    if (c.clearBan) career.ban = { club: 0, nat: 0 };
  }

  if (d.contract) {
    const k = d.contract;
    const m = (v: number) => Math.max(0, Math.round(Number.isFinite(v) ? v : 0));
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(k.expires) && k.expires > career.currentDate;
    // klub hanya bisa diganti untuk pemain lain (kariermu sendiri lewat bursa transfer)
    const clubId = mine ? (p.contract?.clubId ?? null) : k.clubId && world.clubs.some((c) => c.id === k.clubId) ? k.clubId : null;
    if (!clubId) {
      if (p.contract) notes.push('Pemain dilepas dan sekarang tanpa klub.');
      p.contract = null;
    } else {
      const before = p.contract;
      if (before?.clubId !== clubId) {
        const club = world.clubs.find((c) => c.id === clubId)!;
        notes.push(`Pemain pindah ke ${club.name}.`);
      }
      p.contract = {
        ...(before && before.clubId === clubId ? before : {}),
        clubId,
        wagePerWeek: m(k.wage),
        expires: validDate ? k.expires : before && before.expires > career.currentDate ? before.expires : addDays(career.currentDate, 730),
        role: k.role,
        bonus: mine || before?.bonus ? { app: m(k.bonus.app), unused: m(k.bonus.unused), goal: m(k.bonus.goal), assist: m(k.bonus.assist), cs: m(k.bonus.cs), trophy: m(k.bonus.trophy) } : undefined,
      };
      if (!p.contract.bonus) delete p.contract.bonus;
    }
  }

  if (mine) career.peakCA = Math.max(career.peakCA ?? 0, p.ca);
  career.edited = true;
  return { world: replacePlayer(world, p), career, notes };
}
