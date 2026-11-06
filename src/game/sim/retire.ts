// Pensiun: ringkasan karier, skor legacy, entri Hall of Fame, dan ekspor CSV untuk Football Manager.
// Pensiun bisa dipilih sendiri kapan saja, atau dipaksa oleh cedera parah di usia tua / usia 41.

import type {
  AwardKind,
  Career,
  HofEntry,
  Legacy,
  LegacyPart,
  Player,
  RetireReason,
  SeasonStat,
  World,
} from '../types';
import { GOALKEEPING, HIDDEN, MENTAL, PERSONALITY, PHYSICAL, TECHNICAL } from '../data/attributes';
import { COUNTRY_BY_ID } from '../data/countries';
import { ageOn } from '../gen/player';
import { fullName } from '../gen/names';
import { personalityLabel } from '../gen/personality';
import { replacePlayer } from './season';
import { groupOf } from './match';
import { RECORD_NAME, ageLabel, type RecordKind } from './awards';

/** Usia saat pensiun dipaksa */
export const MAX_AGE = 41;

// --- ringkasan karier -------------------------------------------------------------------

export interface ClubTotal {
  team: string;
  clubId?: string;
  from: string;
  to: string;
  apps: number;
  goals: number;
  assists: number;
}

export function careerTotals(career: Career) {
  const liga = career.stats.filter((s) => s.comp === 'Liga');
  const sum = (k: keyof Pick<SeasonStat, 'apps' | 'goals' | 'assists' | 'cleanSheets' | 'ratingSum' | 'motm' | 'starts'>) =>
    liga.reduce((a, s) => a + s[k], 0);
  const apps = sum('apps');
  const clubs = new Map<string, ClubTotal>();
  for (const s of liga) {
    if (!s.apps) continue;
    const key = s.clubId ?? s.team;
    const c = clubs.get(key);
    if (c) {
      c.apps += s.apps;
      c.goals += s.goals;
      c.assists += s.assists;
      c.to = s.season;
    } else clubs.set(key, { team: s.team, clubId: s.clubId, from: s.season, to: s.season, apps: s.apps, goals: s.goals, assists: s.assists });
  }
  return {
    apps,
    starts: sum('starts'),
    goals: sum('goals'),
    assists: sum('assists'),
    cleanSheets: sum('cleanSheets'),
    motm: sum('motm'),
    avg: apps ? sum('ratingSum') / apps : 0,
    seasons: new Set(liga.filter((s) => s.apps > 0).map((s) => s.season)).size,
    caps: career.intl?.caps ?? 0,
    natGoals: career.intl?.goals ?? 0,
    clubs: [...clubs.values()],
  };
}

/** Rekor dunia game yang kamu pegang sekarang */
export function heldRecords(world: World, playerId: string): { kind: RecordKind; key: string; value: number }[] {
  const out: { kind: RecordKind; key: string; value: number }[] = [];
  for (const [kind, map] of Object.entries(world.records ?? {}) as [RecordKind, Record<string, { playerId?: string; value: number }>][]) {
    for (const [key, r] of Object.entries(map)) if (r.playerId === playerId) out.push({ kind, key, value: r.value });
  }
  return out;
}

const AWARD_POINTS: Record<AwardKind, number> = { pots: 25, top: 15, young: 8, world: 80, worldYoung: 15 };
const awardKind = (id: string) => /^award-([a-zA-Z]+)-/.exec(id)?.[1] as AwardKind | undefined;

const TIERS: [number, string][] = [
  [1200, 'Legenda Abadi'],
  [800, 'Legenda Dunia'],
  [500, 'Bintang Besar'],
  [280, 'Ikon Klub'],
  [140, 'Pemain Profesional Solid'],
  [50, 'Pemain Profesional'],
  [0, 'Karier Singkat'],
];
export const HOF_MIN = 500;
export const tierOf = (total: number) => TIERS.find(([min]) => total >= min)![1];

/** Skor legacy: penampilan, gol, rating, trofi, penghargaan, timnas, rekor, lencana, puncak kemampuan */
export function legacyScore(world: World, career: Career, p: Player): Legacy {
  const t = careerTotals(career);
  const grp = groupOf(p.mainPosition);
  const parts: LegacyPart[] = [];
  const add = (label: string, detail: string, points: number) => {
    if (points > 0) parts.push({ label, detail, points: Math.round(points) });
  };
  add('Penampilan', `${t.apps} laga liga`, t.apps * 0.15);
  const csW = grp === 'GK' ? 0.5 : grp === 'DEF' ? 0.35 : 0;
  add(
    'Gol & assist',
    `${t.goals} gol, ${t.assists} assist${csW ? `, ${t.cleanSheets} clean sheet` : ''}`,
    t.goals * 0.6 + t.assists * 0.4 + t.cleanSheets * csW,
  );
  if (t.apps >= 50) add('Konsistensi', `rating rata-rata ${t.avg.toFixed(2)}`, (t.avg - 6.6) * 80);
  const repOf = (leagueId: string) => world.leagues.find((l) => l.id === leagueId)?.reputation ?? 40;
  let trophyPts = 0;
  for (const tr of career.trophies ?? []) {
    const m = /^league-(.+)-[^-]+$/.exec(tr.id);
    trophyPts += m ? 10 + repOf(m[1]) * 0.25 : tr.id.startsWith('world-') ? 80 : 45;
  }
  add('Trofi', `${career.trophies?.length ?? 0} trofi`, trophyPts);
  let awardPts = 0;
  for (const a of career.awards ?? []) awardPts += AWARD_POINTS[awardKind(a.id) ?? 'young'] ?? 8;
  add('Penghargaan individu', `${career.awards?.length ?? 0} penghargaan`, awardPts);
  add('Timnas', `${t.caps} caps, ${t.natGoals} gol`, t.caps * 0.6 + t.natGoals);
  const recs = heldRecords(world, p.id);
  add('Rekor', `${recs.length} rekor masih kamu pegang`, recs.length * 15);
  add('Lencana', `${career.badges?.length ?? 0} lencana`, (career.badges?.length ?? 0) * 5);
  const peak = Math.max(career.peakCA ?? 0, p.ca);
  add('Puncak kemampuan', `CA tertinggi ${peak}`, (peak - 100) * 0.6);
  add('Nama besar', `reputasi dunia ${p.reputation.world}`, p.reputation.world * 0.5);
  const total = parts.reduce((a, x) => a + x.points, 0);
  return { total, tier: tierOf(total), hallOfFame: total >= HOF_MIN, parts };
}

export function hofEntry(career: Career, p: Player, legacy: Legacy, date: string, reason: RetireReason): HofEntry {
  const t = careerTotals(career);
  const main = [...t.clubs].sort((a, b) => b.apps - a.apps).slice(0, 3).map((c) => c.team);
  return {
    id: `${career.characterSeed}:${career.playerId}:${date}`,
    saveId: career.saveId,
    name: fullName(p),
    countryId: p.nationalityId,
    position: p.mainPosition,
    born: p.birthDate,
    retiredOn: date,
    age: ageOn(p.birthDate, date),
    reason,
    years: `${career.history[0]?.from.slice(0, 4) ?? date.slice(0, 4)}–${date.slice(0, 4)}`,
    clubs: main,
    apps: t.apps,
    goals: t.goals,
    assists: t.assists,
    cleanSheets: t.cleanSheets,
    avg: Math.round(t.avg * 100) / 100,
    caps: t.caps,
    natGoals: t.natGoals,
    trophies: career.trophies?.length ?? 0,
    awards: career.awards?.length ?? 0,
    peakCA: Math.max(career.peakCA ?? 0, p.ca),
    legacy: legacy.total,
    tier: legacy.tier,
    hallOfFame: legacy.hallOfFame,
  };
}

const REASON_TEXT: Record<RetireReason, string> = {
  pilihan: 'Kamu memutuskan gantung sepatu.',
  cedera: 'Cedera parah di usia senja memaksamu gantung sepatu.',
  usia: 'Tubuhmu sudah tidak sanggup lagi bermain di level profesional.',
};

/**
 * Selesaikan karier. Mengubah `career` dan `player` (pemanggil memberi salinan),
 * hasilnya dunia dengan pemain kita sudah tanpa klub.
 */
export function retire(world: World, career: Career, player: Player, reason: RetireReason, date: string): World {
  const age = ageOn(player.birthDate, date);
  const lastClub = player.contract ? world.clubs.find((c) => c.id === player.contract!.clubId)?.name : undefined;
  player.contract = null;
  player.isYouth = false;
  const w = replacePlayer(world, player);
  const legacy = legacyScore(w, career, player);
  const entry = hofEntry(career, player, legacy, date, reason);
  career.retired = { date, age, reason, legacy, entry };
  career.offers = [];
  career.loan = null;
  career.listed = false;
  career.wantsLoan = false;
  const last = career.history[career.history.length - 1];
  if (last && !last.to) last.to = date;
  const t = careerTotals(career);
  career.inbox.unshift({
    id: `retired-${date}`,
    date,
    from: 'Football Player Life',
    title: `Pensiun di usia ${age}`,
    body:
      `${REASON_TEXT[reason]}${lastClub ? ` Klub terakhirmu: ${lastClub}.` : ''} ` +
      `Kariermu: ${t.apps} laga liga, ${t.goals} gol, ${t.assists} assist, ${t.caps} caps timnas, ${career.trophies?.length ?? 0} trofi. ` +
      `Skor legacy ${legacy.total} (${legacy.tier})${legacy.hallOfFame ? ', dan namamu masuk Hall of Fame!' : '.'}`,
  });
  return w;
}

/** Pensiun atas pilihan sendiri (dari tombol di layar karier) */
export function retireCareer(world: World, prev: Career): { world: World; career: Career } {
  if (prev.retired) return { world, career: prev };
  const career: Career = structuredClone(prev);
  const player: Player = structuredClone(world.players.find((p) => p.id === career.playerId)!);
  const w = retire(world, career, player, 'pilihan', career.currentDate);
  return { world: w, career };
}

// --- ekspor CSV ---------------------------------------------------------------------------

export interface CsvOptions {
  /** pemisah kolom; ';' supaya Excel berbahasa Indonesia langsung memisah kolom */
  sep?: string;
  /** pemisah desimal untuk rating */
  decimal?: string;
}

/**
 * Statistik karier dalam CSV (dibuka di Excel) untuk diketik manual ke save Football Manager.
 * Atribut memakai skala dan urutan yang sama dengan layar FM.
 */
export function careerCsv(world: World, career: Career, p: Player, o: CsvOptions = {}): string {
  const sep = o.sep ?? ';';
  const dec = o.decimal ?? ',';
  const cell = (v: string | number) => {
    const s = String(v);
    return /[";\n,]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const num = (v: number, d = 2) => v.toFixed(d).replace('.', dec);
  const rows: (string | number)[][] = [];
  const row = (...c: (string | number)[]) => rows.push(c);
  const blank = () => rows.push([]);
  const country = COUNTRY_BY_ID[p.nationalityId]?.name ?? p.nationalityId;
  const date = career.retired?.date ?? career.currentDate;
  const t = careerTotals(career);

  row('Football Player Life - statistik karier');
  row('Nama', fullName(p));
  row('Negara', country);
  row('Tanggal lahir', p.birthDate);
  row('Posisi utama', p.mainPosition);
  row('Posisi lain', Object.entries(p.positions).filter(([k, v]) => k !== p.mainPosition && (v ?? 0) >= 15).map(([k]) => k).join(' ') || '-');
  row('Kaki kiri / kanan (1-20)', `${p.leftFoot} / ${p.rightFoot}`);
  row('Tinggi / berat', `${p.heightCm} cm / ${p.weightKg} kg`);
  row('Status', career.retired ? `Pensiun ${career.retired.date} (umur ${career.retired.age})` : `Masih aktif (${date})`);
  if (career.retired) row('Skor legacy', career.retired.legacy.total, career.retired.legacy.tier);
  blank();

  row('RIWAYAT PER MUSIM');
  row('Musim', 'Tim', 'Kompetisi', 'Main', 'Inti', 'Menit', 'Gol', 'Assist', 'Clean sheet', 'Rating rata-rata', 'Man of the Match', 'Kartu kuning', 'Kartu merah');
  const stats = [...career.stats].sort((a, b) => a.season.localeCompare(b.season));
  for (const s of stats) {
    if (!s.apps) continue;
    row(s.season, s.team, s.comp, s.apps, s.starts, s.minutes, s.goals, s.assists, s.cleanSheets, num(s.ratingSum / s.apps), s.motm, s.yellow ?? 0, s.red ?? 0);
  }
  blank();

  row('TOTAL KARIER');
  row('Kompetisi', 'Main', 'Gol', 'Assist', 'Clean sheet', 'Rating rata-rata', 'Kartu kuning', 'Kartu merah');
  const comps = [...new Set(career.stats.map((s) => s.comp))];
  for (const c of comps) {
    const list = career.stats.filter((s) => s.comp === c);
    const apps = list.reduce((a, s) => a + s.apps, 0);
    if (!apps) continue;
    const g = (k: 'goals' | 'assists' | 'cleanSheets' | 'ratingSum' | 'yellow' | 'red') => list.reduce((a, s) => a + (s[k] ?? 0), 0);
    row(c, apps, g('goals'), g('assists'), g('cleanSheets'), num(g('ratingSum') / apps), g('yellow'), g('red'));
  }
  row('Caps timnas senior', t.caps, 'Gol timnas', t.natGoals);
  blank();
  row('KLUB');
  row('Tim', 'Musim', 'Main liga', 'Gol', 'Assist');
  for (const c of t.clubs) row(c.team, c.from === c.to ? c.from : `${c.from} - ${c.to}`, c.apps, c.goals, c.assists);
  blank();
  row('TROFI');
  if (career.trophies?.length) for (const x of career.trophies) row(x.season, x.name, x.team);
  else row('-');
  blank();
  row('PENGHARGAAN');
  if (career.awards?.length) for (const a of career.awards) row(a.season, a.name, a.detail ?? '');
  else row('-');
  blank();
  const recs = heldRecords(world, p.id);
  if (recs.length) {
    row('REKOR YANG DIPEGANG');
    for (const r of recs) {
      const where =
        r.kind === 'clubGoals'
          ? world.clubs.find((c) => c.id === r.key)?.name
          : r.kind === 'seasonGoals' || r.kind === 'youngest'
            ? world.leagues.find((l) => l.id === r.key)?.name
            : COUNTRY_BY_ID[r.key]?.name;
      row(RECORD_NAME[r.kind], where ?? r.key, r.kind === 'youngest' ? ageLabel(r.value) : r.value);
    }
    blank();
  }

  row('ATRIBUT AKHIR (skala 1-20, urutan seperti layar FM)');
  row('CA', p.ca, 'PA', p.pa);
  const gk = p.mainPosition === 'GK';
  const first: [string, readonly string[], Record<string, number>] = gk
    ? ['Goalkeeping', GOALKEEPING, p.goalkeeping]
    : ['Technical', TECHNICAL, p.technical];
  const cols: [string, readonly string[], Record<string, number>][] = [first, ['Mental', MENTAL, p.mental], ['Physical', PHYSICAL, p.physical]];
  row(...cols.flatMap(([h]) => [h, '']));
  const n = Math.max(...cols.map(([, keys]) => keys.length));
  for (let i = 0; i < n; i++) row(...cols.flatMap(([, keys, rec]) => (keys[i] ? [keys[i], rec[keys[i]]] : ['', ''])));
  if (gk) {
    blank();
    row('Technical', '');
    for (const k of TECHNICAL) row(k, p.technical[k]);
  }
  blank();

  row('PERSONALITY DAN HIDDEN ATTRIBUTES');
  row('Tipe personality', personalityLabel(p));
  row('Determination', p.mental.Determination);
  for (const k of PERSONALITY) row(k, p.personality[k]);
  for (const k of HIDDEN) row(k, p.hidden[k]);

  return rows.map((r) => r.map(cell).join(sep)).join('\r\n') + '\r\n';
}

export const csvFileName = (p: Player) =>
  `${fullName(p).normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'karier'}-statistik.csv`;
