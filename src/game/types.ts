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
  /** bonus performa (EUR, sebelum pajak); kontrak lama tidak punya */
  bonus?: ContractBonus;
}

/** Bonus performa di kontrak: per laga, per gol/assist/clean sheet, per trofi */
export interface ContractBonus {
  /** dimainkan (starter atau masuk dari bangku) */
  app: number;
  /** di bangku cadangan tapi tidak dimainkan */
  unused: number;
  goal: number;
  assist: number;
  /** clean sheet (kiper & bek, minimal 60 menit) */
  cs: number;
  /** juara liga, piala, atau kompetisi benua bersama klub ini */
  trophy: number;
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
  /** piala domestik musim berjalan per liga (dibuat saat pertama dibutuhkan) */
  cups?: Record<string, Cup>;
  /** juara piala domestik tiap musim */
  cupHonours?: CupHonour[];
  /** klasemen akhir musim terakhir yang selesai per liga (urutan id klub), untuk jatah kompetisi benua */
  finalTables?: Record<string, { season: string; order: string[] }>;
  /** kompetisi antarklub benua edisi berjalan, per id kompetisi */
  continental?: Record<string, ContComp>;
  /** juara kompetisi antarklub benua */
  contHonours?: CupHonour[];
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
  /** nama kompetisi yang diganti pemain lewat editor nama (id benua mis. EU1, atau `cup:<liga>`) */
  compNames?: Record<string, string>;
  /** nama bawaan game sebelum diganti lewat editor nama, per `<jenis>:<id>`, untuk dikembalikan */
  originalNames?: Record<string, string>;
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

export type AwardKind = 'pots' | 'top' | 'assist' | 'gk' | 'young' | 'world' | 'worldYoung';
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

/** Satu laga piala: skor [kandang, tandang], adu penalti kalau imbang */
export interface CupTie {
  home: string;
  away: string;
  score?: [number, number];
  pens?: [number, number];
}
export interface CupRound {
  name: string;
  date: string;
  ties: CupTie[];
  /** klub yang langsung lolos ke babak berikutnya (hanya babak pertama) */
  byes?: string[];
}
/** Piala domestik satu negara satu musim (sistem gugur, semua klub divisi 1) */
export interface Cup {
  id: string;
  leagueId: string;
  name: string;
  season: string;
  rounds: CupRound[];
  winner?: string;
  runnerUp?: string;
}
/** Satu grup kompetisi benua: 4 klub, 6 matchday (kandang-tandang) */
export interface ContGroup {
  name: string;
  clubs: string[];
  /** per matchday: laga [kandang, tandang] dengan skor */
  fixtures: CupTie[][];
}
/** Laga gugur: dua leg (leg 1 di kandang `home`), final satu laga. Skor tiap leg [home, away]. */
export interface ContTie {
  home: string;
  away: string;
  legs: ([number, number] | null)[];
  pens?: [number, number];
}
export interface ContRound {
  name: string;
  dates: string[];
  ties: ContTie[];
}
/** Satu edisi kompetisi antarklub benua */
export interface ContComp {
  id: string;
  comp: string;
  name: string;
  season: string;
  year: number;
  groupDates: string[];
  groups: ContGroup[];
  ko: ContRound[];
  winner?: string;
  runnerUp?: string;
}
export interface CupHonour {
  leagueId: string;
  name: string;
  season: string;
  winnerId: string;
  runnerUpId: string;
}

export interface Honour {
  leagueId: string;
  season: string;
  championId: string;
  runnerUpId: string;
}

export type Competition = 'Liga' | 'Piala' | 'Kontinental' | 'U19' | 'Amatir' | 'Timnas' | 'Timnas U20';
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
  /** intensitas taktik tim kita di laga ini (0..1) */
  intensity?: number;
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
  /** riwayat cedera (terbaru di depan) */
  injuries?: InjuryRecord[];
  /** media sosial & sponsor (dibuat saat pertama dibutuhkan) */
  social?: Social;
  /** generasi keluarga: 1 = pemain pertama; pendahulu dari yang tertua */
  dynasty?: { generation: number; ancestors: DynastyMember[] };
  /** masa rawan setelah kembali dari cedera: sisa minggu, pengali risiko cedera, bagian tubuh */
  fragile?: { weeks: number; factor: number; part: InjuryPart };
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
  /** pemahaman taktik pelatih 0..1 per "klub:pelatih" atau "nat:negara" (lihat understanding.ts) */
  tacticFam?: Record<string, number>;
  /** karier sudah selesai */
  retired?: Retirement;
  /** riwayat bonus (+) dan denda (-) terbaru, bersih setelah pajak/agent */
  bonusLog?: BonusEntry[];
  /** editor in-game pernah dipakai di karier ini */
  edited?: boolean;
}

export interface BonusEntry {
  date: string;
  label: string;
  amount: number;
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
  subs: Partial<Record<'suplemen' | 'gizi' | 'fisio', CoachLevel>>;
  savings: number;
  /** perubahan atribut dari barang yang sedang dipakai: id barang -> atribut -> selisih */
  mods?: Record<string, Record<string, number>>;
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
  bonus?: ContractBonus;
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

export type TrainingFocus = 'seimbang' | 'teknik' | 'mental' | 'fisik' | 'peran' | 'taktik' | 'istirahat';
export type Intensity = 'ringan' | 'normal' | 'berat';
export type Activity = 'rumah' | 'keluarga' | 'nongkrong' | 'kencan' | 'pesta' | 'video' | 'kerja';
export type CoachKind = 'teknik' | 'fisik' | 'mental' | 'psikolog';
/** 0 tidak ada, 1 amatir, 2 profesional, 3 world class (save lama: true = profesional) */
export type CoachLevel = 0 | 1 | 2 | 3;

export interface WeekPlan {
  focus: TrainingFocus;
  intensity: Intensity;
  activity: Activity;
  coaches: Record<CoachKind, CoachLevel>;
  /** peran yang dilatih saat fokus latihan "Peran" (harus peran dari posisi utama / posisi yang sedang dilatih) */
  trainRole?: string | null;
  /** posisi baru yang sedang dipelajari (keakraban naik tiap minggu latihan) */
  learnPos?: Position | null;
  /** jenis postingan media sosial minggu ini */
  post?: PostType;
}

export type PostType = 'tidak' | 'latihan' | 'pribadi' | 'fans' | 'provokatif';
export interface SocialPost {
  date: string;
  type: PostType;
  text: string;
  likes: number;
  viral?: boolean;
}
export interface SponsorDeal {
  brand: string;
  category: string;
  /** bayaran per minggu (EUR) */
  weekly: number;
  until: string;
  /** 0 lokal, 1 nasional, 2 global */
  tier: number;
}
/** Pendahulu di keluarga (generasi berikutnya) */
export interface DynastyMember {
  name: string;
  years: string;
  legacy: number;
  tier: string;
  position: string;
  relation: 'orang tua' | 'paman';
  peakFollowers?: number;
}
/** Media sosial dan sponsor pemain kita */
export interface Social {
  followers: number;
  peak: number;
  /** citra di mata publik 0-100 (sponsor menghindari citra buruk) */
  image: number;
  posts: SocialPost[];
  deals: SponsorDeal[];
  scandals: number;
}

export type InjuryPart =
  | 'paha'
  | 'pergelangan kaki'
  | 'punggung'
  | 'hamstring'
  | 'betis'
  | 'pangkal paha'
  | 'lutut'
  | 'kaki';
/** Rencana pemulihan: sesuai jadwal, dipaksakan lebih cepat, atau fisioterapi intensif */
export type InjuryPlan = 'aman' | 'cepat' | 'fisio';

export interface Injury {
  name: string;
  weeksLeft: number;
  /** perkiraan awal lama absen (minggu) */
  weeks?: number;
  part?: InjuryPart;
  severity?: 'ringan' | 'sedang' | 'berat';
  plan?: InjuryPlan;
}

/** Riwayat cedera pemain kita */
export interface InjuryRecord {
  name: string;
  part: InjuryPart;
  date: string;
  weeks: number;
  where: 'latihan' | 'pertandingan';
  severity: 'ringan' | 'sedang' | 'berat';
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
