// Generasi berikutnya: setelah pensiun, lanjutkan sebagai anakmu (kalau sudah menikah) atau
// keponakanmu. Dunianya maju bertahun-tahun (klub sama, pemain generasi baru), sejarah juara tetap,
// dan sang pewaris membawa nama keluarga plus sebagian bakat, tubuh, dan watak pendahulunya.

import type { Career, DynastyMember, Player, World } from '../types';
import type { Position } from '../data/attributes';
import { Rng, clamp } from '../rng';
import { generateWorld } from '../gen/world';
import { rollCharacter, type CharacterRoll, type FamilyWealth } from '../gen/character';
import { fullName } from '../gen/names';
import { emptySocial } from './social';
import { carryNames } from './rename';

export type HeirKind = 'anak' | 'keponakan';

/** Anak kalau kamu menikah saat pensiun, selain itu keponakan */
export function heirKind(career: Career): HeirKind {
  return career.rel?.partner?.stage === 'menikah' ? 'anak' : 'keponakan';
}

/** Berapa tahun dunia maju sampai sang pewaris mulai berkarier (sekitar umur 15) */
export function heirGap(career: Career): number {
  const r = career.retired!;
  const age = heirKind(career) === 'anak' ? Math.max(0, r.age - 29) : 9;
  return Math.max(1, 15 - age);
}

/** Kekayaan keluarga dari uang dan tabungan saat pensiun */
export function heirWealth(career: Career): FamilyWealth {
  const total = career.money + (career.life?.savings ?? 0);
  return total >= 1_000_000 ? 'kaya' : total >= 100_000 ? 'menengah' : 'miskin';
}

const blend = (child: number, parent: number, w: number, rng: Rng, sd = 1) =>
  clamp(Math.round(child * (1 - w) + parent * w + rng.normal(0, sd)), 1, 20);

/** Wariskan nama, bakat, tubuh, dan watak ke pemain hasil undian */
export function inherit(roll: CharacterRoll, parent: Player, career: Career, kind: HeirKind, rng: Rng) {
  const c = roll.player;
  const w = kind === 'anak' ? 1 : 0.6;
  c.lastName = parent.lastName;
  c.nationalityId = parent.nationalityId;
  // bakat: sebagian dari puncak kemampuan pendahulu, tetap ada regresi ke rata-rata
  const peak = career.peakCA ?? parent.ca;
  c.pa = clamp(Math.round(c.pa * (1 - 0.45 * w) + peak * 0.45 * w + rng.normal(0, 8)), c.ca, 200);
  // tubuh dan kaki
  c.heightCm = clamp(Math.round(c.heightCm * (1 - 0.5 * w) + parent.heightCm * 0.5 * w + rng.normal(0, 3)), 160, 205);
  if (rng.chance(0.6 * w)) {
    const strong = Math.max(c.leftFoot, c.rightFoot);
    const weak = Math.min(c.leftFoot, c.rightFoot);
    const left = parent.leftFoot > parent.rightFoot;
    c.leftFoot = left ? strong : weak;
    c.rightFoot = left ? weak : strong;
  }
  // watak dan hal tersembunyi
  c.mental.Determination = blend(c.mental.Determination, parent.mental.Determination, 0.3 * w, rng);
  for (const k of ['Professionalism', 'Ambition'] as const) c.personality[k] = blend(c.personality[k], parent.personality[k], 0.3 * w, rng);
  c.hidden['Injury Proneness'] = blend(c.hidden['Injury Proneness'], parent.hidden['Injury Proneness'], 0.3 * w, rng);
  // nama besar keluarga
  const legacy = career.retired?.legacy.total ?? 0;
  c.reputation.home = clamp(c.reputation.home + Math.round(Math.min(20, legacy / 120) * w), 1, 100);
  roll.family = {
    wealth: heirWealth(career),
    support: clamp(kind === 'anak' ? 15 + rng.int(0, 5) : 11 + rng.int(0, 5), 1, 20),
  };
  const gift = Math.min(20_000, Math.max(0, (career.money + (career.life?.savings ?? 0)) * (kind === 'anak' ? 0.05 : 0.02)));
  roll.money = Math.round((roll.money + gift) * 100) / 100;
  // perkiraan scout ikut melihat bakat warisan
  const spread = roll.scoutPA[1] - roll.scoutPA[0];
  const mid = clamp(c.pa + Math.round(rng.normal(0, 6)), 1, 200);
  roll.scoutPA = [clamp(mid - Math.round(spread / 2), 1, 200), clamp(mid + Math.round(spread / 2), 1, 200)];
}

/** Ringkasan pendahulu untuk silsilah */
export function memberOf(career: Career, player: Player, relation: DynastyMember['relation']): DynastyMember {
  const r = career.retired!;
  return {
    name: fullName(player),
    years: r.entry.years,
    legacy: r.legacy.total,
    tier: r.legacy.tier,
    position: player.mainPosition,
    relation,
    peakFollowers: career.social?.peak,
  };
}

/**
 * Buat dunia generasi berikutnya dan undi sang pewaris. Dunia memakai seed yang sama (klub sama)
 * tapi dimulai `heirGap` tahun setelah pensiun dengan pemain generasi baru; sejarah juara dibawa.
 */
export function nextGeneration(
  world: World,
  career: Career,
  player: Player,
  position?: Position,
): { world: World; roll: CharacterRoll; dynasty: NonNullable<Career['dynasty']> } {
  if (!career.retired) throw new Error('Pemain belum pensiun');
  const kind = heirKind(career);
  const gen = (career.dynasty?.generation ?? 1) + 1;
  const year = Number(career.retired.date.slice(0, 4)) + heirGap(career);
  const fresh = generateWorld({
    seed: world.seed,
    activeLeagues: world.leagues.filter((l) => l.active).map((l) => l.id),
    startDate: `${year}-07-01`,
    era: gen,
  });
  // nama klub, liga, dan kompetisi yang kamu ganti tetap dipakai
  const w = carryNames(world, fresh);
  // sejarah tetap: juara liga, piala, dan kompetisi benua dari generasi sebelumnya
  w.honours = [...world.honours];
  if (world.cupHonours) w.cupHonours = [...world.cupHonours];
  if (world.contHonours) w.contHonours = [...world.contHonours];
  const seed = `${career.characterSeed}:gen${gen}`;
  const roll = rollCharacter(w, { countryId: player.nationalityId, position }, seed);
  inherit(roll, player, career, kind, new Rng(`${seed}:inherit`));
  const dynasty = {
    generation: gen,
    ancestors: [...(career.dynasty?.ancestors ?? []), memberOf(career, player, kind === 'anak' ? 'orang tua' : 'paman')],
  };
  return { world: w, roll, dynasty };
}

/** Media sosial pewaris: nama keluarga yang terkenal membawa sebagian pengikut */
export function heirSocial(parentCareer: Career, heir: Player) {
  const s = emptySocial(heir);
  const share = heirKind(parentCareer) === 'anak' ? 0.05 : 0.02;
  s.followers = Math.max(s.followers, Math.round((parentCareer.social?.peak ?? 0) * share));
  s.peak = s.followers;
  return s;
}
