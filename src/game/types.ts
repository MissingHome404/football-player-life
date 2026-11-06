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
import type { Origin, FamilyWealth } from './gen/character';
import type { EngineInput } from './sim/engine';

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
  preferredRole: string; // id peran favorit (lihat data/roles.ts)
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
  seasons: Record<string, LeagueSeason>; // musim berjalan / berikutnya per liga
  honours: Honour[]; // juara liga tiap musim
  /** sepak bola internasional: kualifikasi & turnamen (dibuat saat pertama dibutuhkan) */
  intl?: IntlState;
  /** statistik musim berjalan semua pemain per liga (untuk penghargaan & rekor) */
  ledger?: Record<string, SeasonLedger>;
  records?: WorldRecords;
  tallies?: Tallies;
  /** penghargaan individu terbaru (semua liga + dunia), terbaru di depan */
  awards?: AwardEntry[];
  /** kandidat penghargaan dunia dari musim terakhir tiap liga */
  candidates?: Record<string, Candidate[]>;
  /** peringkat penghargaan dunia terakhir */
  worldAward?: { year: string; top: Candidate[]; young: Candidate[] };
}

/** [main, gol, assist, total rating, id klub, clean sheet] */
export type LedgerRow = [number, number, number, number, string, number];
export interface SeasonLedger {
  season: string;
  rows: Record<string, LedgerRow>;
  /** dimulai di tengah musim (awal game): tidak dipakai untuk penghargaan */
  partial?: boolean;
}

export interface RecordEntry {
  name: string;
  playerId?: string;
  value: number;
  year: string;
}
export interface WorldRecords {
  seasonGoals: Record<string, RecordEntry>; // per liga: gol liga terbanyak dalam semusim
  youngest: Record<string, RecordEntry>; // per liga: pencetak gol termuda (nilai = umur dalam hari)
  clubGoals: Record<string, RecordEntry>; // per klub: gol liga terbanyak sepanjang masa
  natGoals: Record<string, RecordEntry>; // per negara
  natCaps: Record<string, RecordEntry>;
}
export interface Tallies {
  club: Record<string, number>; // "klub|pemain" -> gol liga
  natGoals: Record<string, number>;
  natCaps: Record<string, number>;
}

export type AwardKind = 'pots' | 'top' | 'young' | 'world' | 'worldYoung';
export interface AwardEntry {
  kind: AwardKind;
  scope: string; // id liga atau 'world'
  season: string;
  playerId: string;
  name: string;
  clubId?: string;
  value?: string;
}
export interface Candidate {
  playerId: string;
  name: string;
  clubId?: string;
  leagueId?: string;
  apps: number;
  goals: number;
  assists: number;
  avg: number;
  score: number;
}

/** Baris klasemen kualifikasi timnas */
export interface IntlRow {
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

/** Laga timnas (kualifikasi atau turnamen) */
export interface IntlFixture {
  date: string;
  stage: string; // 'A'..'H' = grup, 'R16' | 'QF' | 'SF' | 'F'
  home: string; // id negara
  away: string;
  score?: [number, number];
  pens?: [number, number];
}

export type TournamentKind = 'world' | 'euro' | 'asia';
export interface Tournament {
  id: string; // mis. 'world-2030'
  kind: TournamentKind;
  name: string; // mis. 'Piala Dunia 2030'
  year: number;
  teams: string[];
  groups: string[][];
  fixtures: IntlFixture[];
  champion?: string;
  runnerUp?: string;
}

export interface IntlState {
  /** tahun turnamen yang sedang diperebutkan lewat kualifikasi */
  cycle: number;
  table: Record<string, IntlRow>;
  tournament?: Tournament; // turnamen berjalan / terakhir
  history: { id: string; name: string; champion: string; runnerUp: string }[];
}

/** Satu musim liga: jadwal kandang-tandang dan hasilnya */
export interface LeagueSeason {
  leagueId: string;
  year: number; // tahun mulai
  label: string; // "2026/27" atau "2027"
  startDate: string; // tanggal pekan 1
  clubs: string[]; // id klub; jadwal memakai indeks array ini
  rounds: [number, number][][]; // per pekan: [kandang, tandang]
  results: ([number, number] | null)[][];
}

export interface Honour {
  leagueId: string;
  season: string;
  championId: string;
  runnerUpId: string;
}

export type Competition = 'Liga' | 'U19' | 'Amatir' | 'Timnas' | 'Timnas U20';
export type MatchStatus = 'Inti' | 'Cadangan' | 'Tidak masuk skuad' | 'Cedera' | 'Skorsing';

/** Satu pertandingan pemain kita */
export interface MatchRecord {
  date: string;
  comp: Competition;
  season: string;
  team: string;
  opponent: string;
  opponentId?: string;
  home: boolean;
  score: [number, number]; // [tim kita, lawan]
  status: MatchStatus;
  minutes: number;
  rating?: number;
  goals: number;
  assists: number;
  cleanSheet?: boolean;
  motm?: boolean;
  /** dari match engine: [menit, 0 = tim kita / 1 = lawan, nama pencetak] */
  scorers?: [number, 0 | 1, string][];
  shots?: [number, number];
  possession?: [number, number];
  /** laga timnas: babak/kompetisi, mis. "Kualifikasi Piala Asia 2028" atau "Piala Dunia 2030 · Grup B" */
  stage?: string;
  pens?: [number, number];
  /** kartu: kuning, merah langsung, atau merah karena dua kuning */
  card?: 'Y' | 'R' | 'YR';
  /** cedera di laga ini */
  injured?: boolean;
}

/** Statistik pemain kita per musim, tim, dan kompetisi */
export interface SeasonStat {
  season: string;
  team: string;
  clubId?: string;
  comp: Competition;
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  ratingSum: number;
  motm: number;
  /** kartu kuning (tidak termasuk kuning kedua yang jadi merah) dan kartu merah */
  yellow?: number;
  red?: number;
}

/** Karier pemain kita (data yang nanti disimpan di save) */
export interface Career {
  /** Laga terakhir yang dimainkan match engine, untuk ditonton (ulang) */
  /** input match engine laga terakhir (v = versi engine; replay hanya bila versinya sama) */
  lastSim?: { date: string; input: EngineInput; v?: number };
  saveId: string; // id slot save di browser
  characterSeed: string;
  rerolls: number;
  playerId: string;
  origin: Origin;
  family: { wealth: FamilyWealth; support: number };
  money: number; // EUR
  stress: number; // 0-100
  teamLabel: string; // tim tempat main sekarang (bisa tim amatir)
  scoutPA: [number, number];
  currentDate: string;
  week: number; // jumlah minggu yang sudah dijalani
  fitness: number; // kebugaran 0-100
  injury: Injury | null;
  /** sisa laga skorsing: klub (liga/U19/amatir) dan timnas */
  ban?: { club: number; nat: number };
  plan: WeekPlan;
  progress: Record<string, number>; // akumulasi latihan per atribut (naik 1 saat >= 1)
  inbox: Message[];
  lastReport: WeekReport | null;
  cooldowns: Record<string, number>; // eventId -> minggu terakhir muncul
  matches: MatchRecord[]; // pertandingan terakhir (terbaru di depan)
  stats: SeasonStat[]; // statistik semua musim
  agent: Agent | null;
  offers: Offer[]; // tawaran klub yang masih berlaku
  loan: Loan | null; // sedang dipinjamkan
  history: ClubSpell[]; // riwayat klub
  listed: boolean; // minta dijual
  wantsLoan: boolean; // minta dipinjamkan
  joined: string; // tanggal bergabung dengan klub sekarang
  renewalNoted?: string; // tanggal habis kontrak yang sudah diberi tahu "tidak diperpanjang"
  signed?: string; // tanggal terakhir tanda tangan kontrak (pindah, bebas transfer, perpanjangan)
  rel: Relations;
  life: Life;
  /** karier timnas (dibuat saat pertama dibutuhkan) */
  intl?: NationalCareer;
  /** penghargaan individu yang kamu menangkan */
  awards?: { id: string; name: string; season: string; detail?: string }[];
  /** trofi tim (juara liga, turnamen timnas) */
  trophies?: { id: string; name: string; season: string; team: string }[];
  /** lencana (special abilities) yang sudah terbuka */
  badges?: string[];
  /** jenis gol dari match engine: dari luar kotak, bola mati, sundulan */
  feats?: { long: number; set: number; head: number };
  /** CA tertinggi sepanjang karier */
  peakCA?: number;
  /** karier sudah selesai */
  retired?: Retirement;
}

export type RetireReason = 'pilihan' | 'cedera' | 'usia';
export interface LegacyPart {
  label: string;
  detail: string;
  points: number;
}
export interface Legacy {
  total: number;
  tier: string;
  hallOfFame: boolean;
  parts: LegacyPart[];
}
/** Ringkasan satu karier yang sudah selesai (untuk Hall of Fame lintas save) */
export interface HofEntry {
  id: string;
  saveId: string;
  name: string;
  countryId: string;
  position: string;
  born: string;
  retiredOn: string;
  age: number;
  reason: RetireReason;
  years: string;
  clubs: string[];
  apps: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  avg: number;
  caps: number;
  natGoals: number;
  trophies: number;
  awards: number;
  peakCA: number;
  legacy: number;
  tier: string;
  hallOfFame: boolean;
}
export interface Retirement {
  date: string;
  age: number;
  reason: RetireReason;
  legacy: Legacy;
  entry: HofEntry;
}

export type NatTeam = 'senior' | 'u20';
export interface NationalCareer {
  caps: number;
  goals: number;
  u20Caps: number;
  u20Goals: number;
  debut?: string;
  /** skuad terakhir yang memanggilmu dan untuk acara apa (id jeda internasional / turnamen) */
  called: NatTeam | null;
  calledFor?: string;
  tournaments: { id: string; name: string; stage: string; apps: number; goals: number }[];
}

/** Kehidupan dan barang milik pemain (lihat sim/life.ts) */
export interface Life {
  house: 'ortu' | 'kos' | 'apartemen' | 'rumah' | 'mewah';
  houseSince: string;
  shockUntil?: string; // stres karena turun gaya hidup
  owned: string[];
  boots: string;
  car: string | null;
  wear: string[];
  subs: Partial<Record<'suplemen' | 'gizi' | 'fisio', boolean>>;
  savings: number;
}

/** Relasi bernilai -100 sampai 100 */
export type MateTag = 'sahabat' | 'mentor' | 'rival';
export interface Mate {
  playerId: string;
  name: string;
  tag: MateTag;
  value: number;
  clubId?: string; // klub si rekan saat terakhir dicek
}
export interface Partner {
  name: string;
  since: string;
  value: number;
  stage: 'pacaran' | 'tunangan' | 'menikah';
  stageSince: string;
}
export interface Relations {
  clubId?: string; // klub yang dipakai untuk manajer dan rekan setim di bawah
  manager: { staffId: string; value: number; since: string } | null;
  fans: Record<string, number>; // per klub
  media: number;
  partner: Partner | null;
  mates: Mate[];
}

export type AgentTier = 'lokal' | 'regional' | 'super';
export interface Agent {
  tier: AgentTier;
  name: string;
  fee: number; // potongan dari gaji dan bonus, 0-1
  since: string;
}

export type OfferType = 'transfer' | 'bebas' | 'pinjaman' | 'perpanjangan';
export interface Offer {
  id: string;
  clubId: string;
  type: OfferType;
  date: string;
  expires: string; // tawaran berlaku sampai tanggal ini
  wage: number; // per minggu
  years: number; // durasi kontrak (0 = pinjaman sampai akhir musim)
  until?: string; // pinjaman: tanggal kembali
  role: SquadRole; // janji menit bermain
  signOn: number; // bonus tanda tangan
  fee: number; // biaya transfer yang dibayar klub (info)
  negotiated?: boolean;
}

export interface Loan {
  parentClubId: string;
  parentContract: Contract;
  until: string;
}

export interface ClubSpell {
  clubId?: string;
  team: string;
  from: string;
  to?: string;
  kind: 'Amatir' | 'Akademi' | 'Senior' | 'Pinjaman';
}

export type TrainingFocus = 'seimbang' | 'teknik' | 'mental' | 'fisik' | 'peran' | 'istirahat';
export type Intensity = 'ringan' | 'normal' | 'berat';
export type Activity = 'rumah' | 'keluarga' | 'nongkrong' | 'kencan' | 'pesta' | 'video' | 'kerja';
export type CoachKind = 'teknik' | 'fisik' | 'mental' | 'psikolog';

export interface WeekPlan {
  focus: TrainingFocus;
  intensity: Intensity;
  activity: Activity;
  coaches: Record<CoachKind, boolean>;
}

export interface Injury {
  name: string;
  weeksLeft: number;
}

export interface MessageChoice {
  label: string;
  hint?: string; // perkiraan efek
}

export interface Message {
  id: string;
  date: string;
  from: string;
  title: string;
  body: string;
  eventId?: string;
  data?: Record<string, string | number>; // konteks event (mis. id klub)
  choices?: MessageChoice[];
  chosen?: number; // pilihan yang diambil
  result?: string; // teks hasil setelah memilih
}

export interface WeekReport {
  date: string;
  attrChanges: Record<string, number>;
  caBefore: number;
  caAfter: number;
  moneyDelta: number;
  stressDelta: number;
  fitness: number;
  notes: string[];
}
