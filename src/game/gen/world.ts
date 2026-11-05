import { COUNTRIES, COUNTRY_BY_ID } from '../data/countries';
import { LEAGUES, FOREIGN_POOL_ASIA, FOREIGN_POOL_EUROPE } from '../data/leagues';
import type { Position } from '../data/attributes';
import type { Club, League, Player, PlayingStyle, Staff, World, BadgeShape } from '../types';
import { Rng, clamp } from '../rng';
import { generatePlayer } from './player';
import { generateName } from './names';

export const WORLD_VERSION = 1;
export const START_DATE = '2026-07-01';

// Komposisi skuad senior (25 pemain)
const SQUAD: [Position, number][] = [
  ['GK', 3], ['DC', 4], ['DR', 2], ['DL', 2], ['DM', 2], ['MC', 4],
  ['AMR', 1], ['MR', 1], ['AML', 1], ['ML', 1], ['AMC', 1], ['ST', 3],
];

// Komposisi tim U19 (12 pemain)
const YOUTH: Position[] = ['GK', 'DC', 'DC', 'DR', 'DL', 'DM', 'MC', 'MC', 'AMR', 'AML', 'AMC', 'ST'];

const STYLES: PlayingStyle[] = ['Possession', 'Gegenpress', 'Counter', 'Direct', 'Wing Play', 'Defensive'];

// Pengali gaji per negara (liga kaya vs liga kecil)
const WAGE_BONUS: Record<string, number> = { KSA: 3, QAT: 1.6, UAE: 1.5, ENG: 1.2, TUR: 1.2 };

function initials(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function roundNice(v: number): number {
  if (v < 100) return Math.round(v / 5) * 5;
  if (v < 1000) return Math.round(v / 10) * 10;
  if (v < 10000) return Math.round(v / 100) * 100;
  return Math.round(v / 1000) * 1000;
}

export function leagueWageMultiplier(league: Pick<League, 'reputation' | 'countryId'>): number {
  return 0.08 * Math.exp(league.reputation * 0.035) * (WAGE_BONUS[league.countryId] ?? 1);
}

export function wageFor(
  ca: number,
  league: Pick<League, 'reputation' | 'countryId'>,
  clubRep: number,
): number {
  return roundNice(50 * Math.exp((ca / 200) * 8) * leagueWageMultiplier(league) * (0.5 + clubRep / 100));
}

export interface GenerateOptions {
  seed: string;
  /** id liga yang aktif (disimulasikan penuh). Kosong = semua aktif. */
  activeLeagues?: string[];
}

export function generateWorld(opts: GenerateOptions): World {
  const root = new Rng(opts.seed);
  const active = new Set(opts.activeLeagues ?? LEAGUES.map((l) => l.id));
  const leagues: League[] = [];
  const clubs: Club[] = [];
  const players: Player[] = [];
  const staff: Staff[] = [];
  let pid = 0;
  let sid = 0;

  for (const ls of LEAGUES) {
    const rng = root.fork(ls.id);
    const league: League = {
      id: ls.id,
      countryId: ls.countryId,
      name: ls.name,
      division: 1,
      reputation: ls.reputation,
      seasonStartMonth: ls.seasonStartMonth,
      foreignShare: ls.foreignShare,
      promoted: ls.promoted,
      relegated: ls.relegated,
      active: active.has(ls.id),
    };
    leagues.push(league);

    const reps = ls.clubs.map((c) => c[5]);
    const minRep = Math.min(...reps);
    const maxRep = Math.max(...reps);
    const isEurope = COUNTRY_BY_ID[ls.countryId].confederation === 'UEFA';
    const foreignPool = (isEurope ? FOREIGN_POOL_EUROPE : FOREIGN_POOL_ASIA).filter(
      ([c]) => c !== ls.countryId,
    );
    const wageMult = leagueWageMultiplier(league);

    ls.clubs.forEach(([name, realRef, city, c1, c2, rep], idx) => {
      const clubId = `${ls.id}-${String(idx + 1).padStart(2, '0')}`;
            // Kekuatan skuad: gabungan reputasi liga dan reputasi klub
      const starterCA = clamp(15 + ls.reputation * 0.6 + rep + rng.normal(0, 3), 40, 192);

      // Manajer
      const mgrCountry = rng.chance(isEurope ? 0.3 : 0.45)
        ? rng.weighted(foreignPool)
        : ls.countryId;
      const mgrName = generateName(rng, mgrCountry);
      const mgrAge = rng.int(38, 66);
      const managerId = `S${sid++}`;
      const s = maxRep === minRep ? 0.5 : (rep - minRep) / (maxRep - minRep);
      const mgrQuality = clamp(Math.round(6 + s * 8 + ls.reputation / 20 + rng.normal(0, 2)), 1, 20);
      staff.push({
        id: managerId,
        ...mgrName,
        nationalityId: mgrCountry,
        birthDate: `${2026 - mgrAge}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`,
        role: 'Manager',
        clubId,
        reputation: clamp(Math.round(rep * 0.8 + rng.normal(0, 6)), 1, 100),
        manManagement: clamp(mgrQuality + rng.int(-3, 3), 1, 20),
        workingWithYoungsters: clamp(mgrQuality + rng.int(-5, 4), 1, 20),
        tacticalKnowledge: clamp(mgrQuality + rng.int(-2, 3), 1, 20),
        preferredStyle: rng.pick(STYLES),
      });

      const training = clamp(Math.round(1 + (rep - 40) / 14 + rng.normal(0, 0.4)), 1, 5);
      const youth = clamp(Math.round(1 + (rep - 40) / 14 + rng.normal(0, 0.7)), 1, 5);
      const shape: BadgeShape = rng.pick(['shield', 'round', 'classic', 'diamond'] as const);

      const club: Club = {
        id: clubId,
        name,
        realRef,
        leagueId: ls.id,
        countryId: ls.countryId,
        city,
        colors: [c1, c2],
        badge: { shape, initials: initials(name) },
        reputation: rep,
        stadiumCapacity: roundNice(clamp(Math.round(4000 + Math.pow(rep / 100, 2.2) * 75000 * rng.float(0.7, 1.2)), 3000, 90000)),
        facilities: { training, youth },
        finances: {
          balance: roundNice(Math.pow(rep / 10, 3) * 40000 * wageMult * rng.float(0.5, 1.6)),
          wageBudget: 0, // diisi setelah gaji pemain dihitung
        },
        fanBase: roundNice(Math.round(Math.pow(rep / 10, 3.2) * 2000 * rng.float(0.6, 1.5))),
        playingStyle: rng.pick(STYLES),
        managerId,
      };

      // Skuad senior
      const squad: Player[] = [];
      for (const [pos, count] of SQUAD) {
        for (let k = 0; k < count; k++) {
          const depthDrop = pos === 'GK' ? [0, 18, 30][k] : [0, 11, 20, 26][k];
          const ca = Math.round(starterCA - depthDrop + rng.normal(0, 6));
          const ageMean = pos === 'GK' ? 28 : 26;
          let age = clamp(Math.round(rng.normal(ageMean, 4.2)), 17, pos === 'GK' ? 39 : 36);
          // Pelapis lebih sering pemain muda
          if (k >= 2 && rng.chance(0.35)) age = rng.int(18, 21);
          const isForeign = rng.chance(ls.foreignShare * (k === 0 ? 1.2 : 0.8));
          const countryId = isForeign ? rng.weighted(foreignPool) : ls.countryId;
          squad.push(
            generatePlayer(rng, {
              id: `P${pid++}`,
              countryId,
              position: pos,
              age,
              targetCA: age <= 21 ? ca - rng.int(0, 15) : ca,
              refDate: START_DATE,
            }),
          );
        }
      }

      // Tim U19
      for (const pos of YOUTH) {
        const age = rng.int(16, 18);
        const ca = clamp(Math.round(starterCA * 0.4 + youth * 4 + rng.normal(0, 8)), 20, 130);
        const p = generatePlayer(rng, {
          id: `P${pid++}`,
          countryId: rng.chance(0.08) ? rng.weighted(foreignPool) : ls.countryId,
          position: pos,
          age,
          targetCA: ca,
          refDate: START_DATE,
          isYouth: true,
        });
        // Akademi bagus = peluang talenta besar
        p.pa = clamp(Math.round(p.pa + youth * 1.5 + (rng.chance(0.02) ? rng.int(10, 30) : 0)), p.ca, 200);
        squad.push(p);
      }

      // Peran di skuad: urutkan dari CA tertinggi (khusus senior)
      const seniors = squad.filter((p) => !p.isYouth).sort((a, b) => b.ca - a.ca);
      let wageTotal = 0;
      seniors.forEach((p, rank) => {
        const age = 2026 - Number(p.birthDate.slice(0, 4));
        const role = rank < 11 ? 'Inti' : rank < 18 ? 'Rotasi' : age <= 21 ? 'Pemain muda' : 'Pelapis';
        const wage = wageFor(p.ca, league, rep);
        wageTotal += wage;
        p.contract = {
          clubId,
          wagePerWeek: wage,
          expires: `${2027 + rng.int(0, 4)}-06-30`,
          role,
        };
      });
      for (const p of squad.filter((x) => x.isYouth)) {
        const wage = roundNice(Math.max(20, wageFor(p.ca, league, rep) * 0.3));
        p.contract = { clubId, wagePerWeek: wage, expires: `${2027 + rng.int(0, 2)}-06-30`, role: 'Pemain muda' };
      }
      club.finances.wageBudget = roundNice(wageTotal * rng.float(1.02, 1.15));

      // Reputasi pemain
      for (const p of squad) {
        p.reputation.home = clamp(Math.round(rep * 0.5 + (p.ca / 200) * 50 - (p.isYouth ? 25 : 0)), 1, 100);
        p.reputation.world = clamp(
          Math.round(((p.ca / 200) * 60 + ls.reputation * 0.4) * (p.isYouth ? 0.4 : 1) - 20),
          1,
          100,
        );
      }

      clubs.push(club);
      players.push(...squad);
    });
  }

  return {
    seed: opts.seed,
    version: WORLD_VERSION,
    startDate: START_DATE,
    countries: COUNTRIES,
    leagues,
    clubs,
    players,
    staff,
  };
}
