// Daftar atribut mengikuti urutan layar Football Manager, supaya gampang
// dicocokkan saat ekspor CSV ke FM.

export const TECHNICAL = [
  'Corners',
  'Crossing',
  'Dribbling',
  'Finishing',
  'First Touch',
  'Free Kick Taking',
  'Heading',
  'Long Shots',
  'Long Throws',
  'Marking',
  'Passing',
  'Penalty Taking',
  'Tackling',
  'Technique',
] as const;

export const MENTAL = [
  'Aggression',
  'Anticipation',
  'Bravery',
  'Composure',
  'Concentration',
  'Decisions',
  'Determination',
  'Flair',
  'Leadership',
  'Off the Ball',
  'Positioning',
  'Teamwork',
  'Vision',
  'Work Rate',
] as const;

export const PHYSICAL = [
  'Acceleration',
  'Agility',
  'Balance',
  'Jumping Reach',
  'Natural Fitness',
  'Pace',
  'Stamina',
  'Strength',
] as const;

export const GOALKEEPING = [
  'Aerial Reach',
  'Command of Area',
  'Communication',
  'Eccentricity',
  'Handling',
  'Kicking',
  'One on Ones',
  'Punching (Tendency)',
  'Reflexes',
  'Rushing Out (Tendency)',
  'Throwing',
] as const;

// Personality tersembunyi (sama dengan FM)
export const PERSONALITY = [
  'Adaptability',
  'Ambition',
  'Controversy',
  'Loyalty',
  'Pressure',
  'Professionalism',
  'Sportsmanship',
  'Temperament',
] as const;

// Hidden attributes lain (sama dengan FM), ditambah Creativity (khusus game ini, paling akhir supaya save lama tetap terbaca)
export const HIDDEN = [
  'Consistency',
  'Dirtiness',
  'Important Matches',
  'Injury Proneness',
  'Versatility',
  'Creativity',
] as const;

export type TechnicalAttr = (typeof TECHNICAL)[number];
export type MentalAttr = (typeof MENTAL)[number];
export type PhysicalAttr = (typeof PHYSICAL)[number];
export type GoalkeepingAttr = (typeof GOALKEEPING)[number];
export type PersonalityAttr = (typeof PERSONALITY)[number];
export type HiddenAttr = (typeof HIDDEN)[number];
export type VisibleAttr = TechnicalAttr | MentalAttr | PhysicalAttr | GoalkeepingAttr;

// Posisi ala FM
export const POSITIONS = [
  'GK',
  'DR',
  'DC',
  'DL',
  'WBR',
  'WBL',
  'DM',
  'MR',
  'MC',
  'ML',
  'AMR',
  'AMC',
  'AML',
  'ST',
] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABEL: Record<Position, string> = {
  GK: 'Kiper',
  DR: 'Bek kanan',
  DC: 'Bek tengah',
  DL: 'Bek kiri',
  WBR: 'Wing back kanan',
  WBL: 'Wing back kiri',
  DM: 'Gelandang bertahan',
  MR: 'Gelandang kanan',
  MC: 'Gelandang tengah',
  ML: 'Gelandang kiri',
  AMR: 'Sayap kanan',
  AMC: 'Gelandang serang',
  AML: 'Sayap kiri',
  ST: 'Penyerang',
};

// Bobot atribut per posisi untuk menghitung CA.
// 5 = kunci, 3 = penting, 1 = berguna, tidak disebut = 0,5.
// Atribut kiper hanya dihitung untuk GK; atribut teknik menyerang hampir tidak dihitung untuk GK.
type Weights = Partial<Record<VisibleAttr, number>>;

const OUTFIELD_BASE: Weights = {
  'Natural Fitness': 2,
  Stamina: 2,
  Decisions: 3,
  Composure: 2,
  Anticipation: 2,
  Concentration: 2,
  Teamwork: 2,
  'Work Rate': 2,
  'First Touch': 2,
  Passing: 2,
  Pace: 2,
  Acceleration: 3,
};

const W = (extra: Weights): Weights => ({ ...OUTFIELD_BASE, ...extra });

export const POSITION_WEIGHTS: Record<Position, Weights> = {
  GK: {
    Reflexes: 5,
    Handling: 5,
    'One on Ones': 4,
    'Aerial Reach': 4,
    'Command of Area': 3,
    Communication: 3,
    Kicking: 2,
    Throwing: 2,
    'Rushing Out (Tendency)': 1,
    'Punching (Tendency)': 1,
    Eccentricity: 0.5,
    Positioning: 4,
    Concentration: 3,
    Decisions: 3,
    Anticipation: 2,
    Composure: 2,
    Agility: 4,
    'Jumping Reach': 1,
    Passing: 1,
    'First Touch': 1,
    Bravery: 2,
    Acceleration: 1,
  },
  DC: W({
    Marking: 5,
    Tackling: 5,
    Heading: 4,
    Positioning: 5,
    'Jumping Reach': 4,
    Strength: 4,
    Bravery: 3,
    Concentration: 3,
    Anticipation: 4,
    Aggression: 1,
  }),
  DR: W({
    Tackling: 4,
    Marking: 4,
    Positioning: 4,
    Crossing: 3,
    Pace: 4,
    Stamina: 3,
    'Work Rate': 3,
    Dribbling: 1,
    Agility: 1,
  }),
  DL: W({
    Tackling: 4,
    Marking: 4,
    Positioning: 4,
    Crossing: 3,
    Pace: 4,
    Stamina: 3,
    'Work Rate': 3,
    Dribbling: 1,
    Agility: 1,
  }),
  WBR: W({
    Crossing: 4,
    Dribbling: 3,
    Tackling: 3,
    Stamina: 5,
    'Work Rate': 4,
    Pace: 4,
    'Off the Ball': 2,
    Technique: 2,
    Marking: 2,
  }),
  WBL: W({
    Crossing: 4,
    Dribbling: 3,
    Tackling: 3,
    Stamina: 5,
    'Work Rate': 4,
    Pace: 4,
    'Off the Ball': 2,
    Technique: 2,
    Marking: 2,
  }),
  DM: W({
    Tackling: 4,
    Positioning: 4,
    Passing: 4,
    Anticipation: 4,
    Marking: 3,
    Teamwork: 3,
    'Work Rate': 3,
    Strength: 2,
    Composure: 3,
    Technique: 1,
  }),
  MC: W({
    Passing: 5,
    Vision: 4,
    'First Touch': 3,
    Technique: 4,
    Decisions: 4,
    'Off the Ball': 2,
    Tackling: 2,
    Teamwork: 3,
    Stamina: 3,
    'Long Shots': 1,
    Dribbling: 1,
  }),
  MR: W({
    Crossing: 4,
    Dribbling: 4,
    Passing: 3,
    Technique: 3,
    'Off the Ball': 3,
    Pace: 4,
    Stamina: 3,
    'Work Rate': 3,
    Agility: 2,
  }),
  ML: W({
    Crossing: 4,
    Dribbling: 4,
    Passing: 3,
    Technique: 3,
    'Off the Ball': 3,
    Pace: 4,
    Stamina: 3,
    'Work Rate': 3,
    Agility: 2,
  }),
  AMR: W({
    Dribbling: 5,
    Crossing: 3,
    Technique: 4,
    Flair: 3,
    'Off the Ball': 4,
    Pace: 5,
    Acceleration: 5,
    Agility: 3,
    Finishing: 2,
    'Long Shots': 1,
  }),
  AML: W({
    Dribbling: 5,
    Crossing: 3,
    Technique: 4,
    Flair: 3,
    'Off the Ball': 4,
    Pace: 5,
    Acceleration: 5,
    Agility: 3,
    Finishing: 2,
    'Long Shots': 1,
  }),
  AMC: W({
    Passing: 4,
    Vision: 5,
    Technique: 5,
    'First Touch': 4,
    Flair: 4,
    Dribbling: 3,
    'Off the Ball': 3,
    'Long Shots': 2,
    Finishing: 2,
    Agility: 2,
  }),
  ST: W({
    Finishing: 5,
    'Off the Ball': 5,
    Composure: 4,
    'First Touch': 4,
    Heading: 3,
    Dribbling: 2,
    Technique: 3,
    Pace: 3,
    Acceleration: 4,
    Strength: 2,
    'Jumping Reach': 2,
  }),
};

export const ALL_VISIBLE: VisibleAttr[] = [
  ...TECHNICAL,
  ...MENTAL,
  ...PHYSICAL,
  ...GOALKEEPING,
];
