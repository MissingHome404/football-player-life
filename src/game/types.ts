// Tipe data inti game. Skala atribut, CA/PA, personality, dan hidden attributes
// sengaja dibuat sama dengan Football Manager (1-20, CA/PA 1-200) supaya ekspor
// ke FM tidak butuh konversi.

import type {
  TechnicalAttr,
  MentalAttr,
  PhysicalAttr,
  GoalkeepingAttr,
  PersonalityAttr,
  HiddenAttr,
  Position,
} from './data/attributes';

export type Confederation = 'UEFA' | 'AFC' | 'CONMEBOL' | 'CAF' | 'CONCACAF';

export interface Country {
  id: string; // kode 3 huruf, mis. IDN
  name: string; // nama dalam bahasa Indonesia
  confederation: Confederation;
  nameStyle: string; // kunci pool nama
  footballRep: number; // 1-100, kekuatan sepak bola negara
}

export interface League {
  id: string;
  countryId: string;
  name: string; // nama fiktif
  division: number; // 1 = divisi teratas
  reputation: number; // 1-100
  seasonStartMonth: number; // 1-12
  foreignShare: number; // 0-1, perkiraan porsi pemain asing di skuad senior
  promoted: number;
  relegated: number;
  active: boolean; // dipilih user: disimulasikan penuh atau versi ringan
}

export type BadgeShape = 'shield' | 'round' | 'classic' | 'diamond';

export interface Club {
  id: string;
  name: string;
  realRef: string; // catatan internal: klub asli yang direferensikan, tidak ditampilkan
  leagueId: string;
  countryId: string;
  city: string;
  colors: [string, string];
  badge: { shape: BadgeShape; initials: string };
  reputation: number; // 1-100
  stadiumCapacity: number;
  facilities: { training: number; youth: number }; // bintang 1-5
  finances: { balance: number; wageBudget: number }; // dalam EUR
  fanBase: number; // perkiraan jumlah fans
  playingStyle: PlayingStyle;
  managerId: string;
}

export type PlayingStyle =
  | 'Possession'
  | 'Gegenpress'
  | 'Counter'
  | 'Direct'
  | 'Wing Play'
  | 'Defensive';

export interface Person {
  id: string;
  firstName: string;
  lastName: string; // boleh kosong untuk nama tunggal (umum di Indonesia/Brasil)
  nationalityId: string;
  birthDate: string; // YYYY-MM-DD
}

export type SquadRole = 'Inti' | 'Rotasi' | 'Pelapis' | 'Pemain muda';

export interface Contract {
  clubId: string;
  wagePerWeek: number; // EUR
  expires: string; // YYYY-MM-DD
  role: SquadRole;
  releaseClause?: number;
}

export interface Player extends Person {
  positions: Partial<Record<Position, number>>; // keakraban posisi 1-20
  mainPosition: Position;
  heightCm: number;
  weightKg: number;
  leftFoot: number; // 1-20
  rightFoot: number; // 1-20
  technical: Record<TechnicalAttr, number>;
  mental: Record<MentalAttr, number>;
  physical: Record<PhysicalAttr, number>;
  goalkeeping: Record<GoalkeepingAttr, number>;
  personality: Record<PersonalityAttr, number>;
  hidden: Record<HiddenAttr, number>;
  ca: number; // 1-200, tersembunyi
  pa: number; // 1-200, tersembunyi
  reputation: { home: number; world: number }; // 1-100
  contract: Contract | null;
  isYouth: boolean; // skuad U19/akademi
  isUser?: boolean;
}

export type StaffRole = 'Manager' | 'Agent' | 'Coach';

export interface Staff extends Person {
  role: StaffRole;
  clubId: string | null;
  reputation: number; // 1-100
  manManagement: number; // 1-20
  workingWithYoungsters: number; // 1-20
  tacticalKnowledge: number; // 1-20
  preferredStyle: PlayingStyle;
}

export interface World {
  seed: string;
  version: number;
  startDate: string;
  countries: Country[];
  leagues: League[];
  clubs: Club[];
  players: Player[];
  staff: Staff[];
}
