import { create } from 'zustand';
import type { World, Player, Club, Career, WeekPlan, AgentTier } from '../game/types';
import type { Position } from '../game/data/attributes';
import type { CharacterRoll } from '../game/gen/character';
import type { GenerateOptions } from '../game/gen/world';
import type { SaveSummary } from '../game/save/codec';
import {
  encodeSave,
  decodeSave,
  writeSave,
  readSave,
  downloadFile,
  newSaveId,
  putHof,
} from '../game/save/storage';
import { retireCareer } from '../game/sim/retire';
import { fullName } from '../game/gen/names';
import { ageOn } from '../game/gen/player';
import { advanceWeek, newCareer, pendingChoices, resolveChoice } from '../game/sim/week';
import { acceptOffer, hireAgent, negotiate, rejectOffer, type Ask } from '../game/sim/transfer';
import { applyWish, initRelations } from '../game/sim/relations';
import { applyLife, type LifeOp } from '../game/sim/life';
import { ENGINE_VERSION } from '../game/sim/engine';
import {
  KIND_LABEL,
  applyNameEdits,
  applyNameFile,
  nameTemplate,
  renameInCareer,
  restoreNames,
  type NameChange,
  type NameEdit,
  type RenameKind,
  type TemplatePlayers,
} from '../game/sim/rename';
import { csvFormat, downloadCsv } from './csv';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type LeagueTab = 'table' | 'cup' | 'clubs' | 'players' | 'stats';

/** Halaman yang sedang dibuka. 'me' = Beranda karier. */
export type View =
  | { kind: 'league'; leagueId: string; tab?: LeagueTab }
  | { kind: 'club'; clubId: string }
  | { kind: 'player'; playerId: string }
  | { kind: 'me' }
  | { kind: 'inbox'; id?: string }
  | { kind: 'plan' }
  | { kind: 'profile' }
  | { kind: 'matches' }
  | { kind: 'transfer' }
  | { kind: 'relations' }
  | { kind: 'awards' }
  | { kind: 'life' }
  | { kind: 'national'; countryId?: string }
  | { kind: 'stats'; leagueId?: string }
  | { kind: 'search' }
  | { kind: 'comps' }
  | { kind: 'settings' }
  | { kind: 'continent'; confed: 'UEFA' | 'AFC' }
  | { kind: 'names'; edit?: { kind: RenameKind; id: string } };

/** Ringkasan impor file nama untuk ditampilkan */
export interface NamesImportSummary {
  changed: number;
  text: string;
  problems: string[];
}

/** "3 klub, 120 pemain" */
function changeText(changes: NameChange[]): string {
  const n = new Map<RenameKind, number>();
  for (const c of changes) n.set(c.kind, (n.get(c.kind) ?? 0) + 1);
  return [...n].map(([k, v]) => `${v} ${KIND_LABEL[k].toLowerCase()}`).join(', ');
}

interface Indexes {
  clubById: Map<string, Club>;
  playerById: Map<string, Player>;
  squadByClub: Map<string, Player[]>;
}

interface State {
  world: World | null;
  idx: Indexes | null;
  genMs: number;
  generating: boolean;
  view: View | null;
  history: View[];
  devMode: boolean;
  career: Career | null;
  startCareer: (roll: CharacterRoll, rerolls: number) => void;
  /** setelah pensiun: lanjutkan sebagai anak/keponakan di dunia beberapa tahun kemudian */
  startNextGen: (position?: Position) => Promise<void>;
  /** names: isi file nama (CSV) yang langsung dipakai di dunia baru */
  generate: (opts: GenerateOptions, names?: string) => void;
  go: (v: View) => void;
  back: () => void;
  reset: () => void;
  toggleDev: () => void;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  message: string | null; // pesan error/info untuk ditampilkan
  busy: string | null; // teks saat sedang memuat
  saveNow: () => Promise<void>;
  loadSave: (id: string) => Promise<void>;
  exportSave: (id?: string) => Promise<void>;
  importSave: (file: File) => Promise<void>;
  clearMessage: () => void;
  setPlan: (patch: Partial<WeekPlan>) => void;
  nextWeek: (weeks?: number) => void;
  choose: (msgId: string, choice: number) => void;
  acceptOffer: (offerId: string) => void;
  rejectOffer: (offerId: string) => void;
  /** Hasilnya teks jawaban klub */
  negotiate: (offerId: string, ask: Ask) => string;
  hireAgent: (tier: AgentTier) => void;
  fireAgent: () => void;
  setWish: (patch: Partial<Pick<Career, 'listed' | 'wantsLoan'>>) => void;
  /** Aksi halaman Kehidupan; hasilnya teks untuk ditampilkan */
  lifeOp: (op: LifeOp) => string;
  /** Layar pertandingan 2D sedang terbuka */
  watching: boolean;
  /** Buka layar pertandingan otomatis setelah lanjut 1 minggu */
  autoWatch: boolean;
  watch: () => void;
  closeMatch: () => void;
  setAutoWatch: (on: boolean) => void;
  /** Pensiun atas pilihan sendiri */
  retire: () => void;
  /** Editor nama: ganti (atau kembalikan) satu nama */
  renameOne: (edit: NameEdit) => void;
  /** Impor file nama milik pemain sendiri */
  importNames: (file: File) => Promise<NamesImportSummary | null>;
  /** Unduh template file nama dari dunia ini */
  exportNames: (players: TemplatePlayers) => void;
  /** Kembalikan semua nama bawaan game; hasilnya jumlah nama yang dikembalikan */
  restoreAllNames: () => number;
}

const AUTO_KEY = 'fpl:autoWatch';
function readAutoWatch(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== '0';
  } catch {
    return true;
  }
}

// Kalau autosave masih berjalan, simpan sekali lagi setelah selesai
let saving = false;
let saveAgain = false;

function summaryOf(career: Career, idx: Indexes): SaveSummary {
  const p = idx.playerById.get(career.playerId)!;
  const club = p.contract ? idx.clubById.get(p.contract.clubId) : undefined;
  return {
    playerName: fullName(p),
    age: ageOn(p.birthDate, career.currentDate),
    position: p.mainPosition,
    countryId: p.nationalityId,
    team: career.retired ? 'Pensiun' : (club?.name ?? career.teamLabel),
    gameDate: career.currentDate,
    ...(career.retired ? { retired: true, legacy: career.retired.legacy.total } : {}),
  };
}

function fileName(summary: SaveSummary): string {
  const safe = summary.playerName.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'karier';
  return `${safe}-${summary.gameDate}.fplsave`;
}

function buildIndexes(w: World): Indexes {
  const clubById = new Map(w.clubs.map((c) => [c.id, c]));
  const playerById = new Map(w.players.map((p) => [p.id, p]));
  const squadByClub = new Map<string, Player[]>();
  for (const p of w.players) {
    const cid = p.contract?.clubId;
    if (!cid) continue;
    if (!squadByClub.has(cid)) squadByClub.set(cid, []);
    squadByClub.get(cid)!.push(p);
  }
  return { clubById, playerById, squadByClub };
}

export const useGame = create<State>((set, get) => ({
  world: null,
  idx: null,
  genMs: 0,
  generating: false,
  view: null,
  history: [],
  devMode: false,
  career: null,
  startCareer: (roll, rerolls) => {
    const w = get().world!;
    const world: World = { ...w, players: [...w.players.filter((p) => !p.isUser), roll.player] };
    const career = newCareer(roll, rerolls, newSaveId(), world.startDate);
    career.rel = initRelations(world, career, roll.player);
    set({
      world,
      idx: buildIndexes(world),
      career,
      view: { kind: 'me' },
      history: [],
      watching: false,
    });
    window.scrollTo(0, 0);
    void get().saveNow(); // simpan otomatis di awal karier
  },
  startNextGen: async (position) => {
    const { world, career } = get();
    if (!world || !career?.retired) return;
    set({ busy: 'Menyiapkan generasi berikutnya…' });
    try {
      // dunia baru dibuat di thread utama (sekali saja); beri waktu layar menampilkan teks "memuat"
      await new Promise((r) => setTimeout(r, 30));
      const { nextGeneration, heirSocial } = await import('../game/sim/dynasty');
      const parent = world.players.find((p) => p.id === career.playerId)!;
      const r = nextGeneration(world, career, parent, position);
      const w: World = { ...r.world, players: [...r.world.players, r.roll.player] };
      const c = newCareer(r.roll, 0, newSaveId(), w.startDate);
      c.rel = initRelations(w, c, r.roll.player);
      c.dynasty = r.dynasty;
      c.social = heirSocial(career, r.roll.player);
      set({ world: w, idx: buildIndexes(w), career: c, view: { kind: 'me' }, history: [], watching: false, busy: null });
      window.scrollTo(0, 0);
      void get().saveNow();
    } catch (e) {
      set({ busy: null, message: `Gagal membuat generasi berikutnya: ${(e as Error).message}` });
    }
  },
  generate: (opts, names) => {
    set({ generating: true });
    const done = (generated: World, ms: number) => {
      let w = generated;
      let message: string | null = null;
      if (names) {
        const r = applyNameFile(w, names);
        w = r.world;
        message = r.changes.length
          ? `File nama dipakai: ${changeText(r.changes)} diganti.${r.problems.length ? ` ${r.problems.length} baris dilewati.` : ''}`
          : `File nama tidak mengganti apa pun.${r.problems[0] ? ` ${r.problems[0]}` : ''}`;
      }
      const first = w.leagues.find((l) => l.active) ?? w.leagues[0];
      set({
        message,
        world: w,
        idx: buildIndexes(w),
        genMs: ms,
        generating: false,
        view: { kind: 'league', leagueId: first.id },
        history: [],
        career: null,
      });
      window.scrollTo(0, 0);
    };
    // Cadangan kalau Web Worker tidak tersedia: generate di thread utama
    const fallback = async () => {
      const { generateWorld } = await import('../game/gen/world');
      const t = performance.now();
      const w = generateWorld(opts);
      done(w, Math.round(performance.now() - t));
    };
    try {
      const worker = new Worker(new URL('../game/worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ world: World; ms: number }>) => {
        done(e.data.world, e.data.ms);
        worker.terminate();
      };
      worker.onerror = () => {
        worker.terminate();
        void fallback();
      };
      worker.postMessage(opts);
    } catch {
      void fallback();
    }
  },
  go: (v) => {
    const cur = get().view;
    set({ view: v, history: cur ? [...get().history, cur] : get().history });
    window.scrollTo(0, 0);
  },
  back: () => {
    const h = get().history;
    if (!h.length) return;
    set({ view: h[h.length - 1], history: h.slice(0, -1) });
  },
  reset: () =>
    set({ world: null, idx: null, view: null, history: [], career: null, watching: false, saveStatus: 'idle', lastSavedAt: null }),
  toggleDev: () => set({ devMode: !get().devMode }),
  saveStatus: 'idle',
  lastSavedAt: null,
  message: null,
  busy: null,
  clearMessage: () => set({ message: null }),
  saveNow: async () => {
    if (saving) {
      saveAgain = true;
      return;
    }
    saving = true;
    try {
      do {
        saveAgain = false;
        const { world, career, idx } = get();
        if (!world || !career || !idx) return;
        set({ saveStatus: 'saving' });
        const summary = summaryOf(career, idx);
        const { bytes, savedAt } = await encodeSave(world, career, summary);
        await writeSave({ id: career.saveId, savedAt, summary, data: bytes });
        set({ saveStatus: 'saved', lastSavedAt: savedAt });
      } while (saveAgain);
    } catch (e) {
      set({
        saveStatus: 'error',
        message: `Gagal menyimpan di browser: ${e instanceof Error ? e.message : e}. Gunakan Ekspor file supaya kariermu tetap aman.`,
      });
    } finally {
      saving = false;
    }
  },
  setPlan: (patch) => {
    const c = get().career;
    if (!c) return;
    set({ career: { ...c, plan: { ...c.plan, ...patch, coaches: { ...c.plan.coaches, ...patch.coaches } } } });
  },
  watching: false,
  autoWatch: readAutoWatch(),
  watch: () => {
    if (get().career?.lastSim?.v === ENGINE_VERSION) set({ watching: true });
  },
  closeMatch: () => set({ watching: false }),
  setAutoWatch: (on) => {
    try {
      localStorage.setItem(AUTO_KEY, on ? '1' : '0');
    } catch {
      /* penyimpanan browser tidak tersedia */
    }
    set({ autoWatch: on });
  },
  retire: () => {
    const { world, career } = get();
    if (!world || !career || career.retired) return;
    const r = retireCareer(world, career);
    set({ world: r.world, career: r.career, idx: buildIndexes(r.world), view: { kind: 'me' }, history: [] });
    if (r.career.retired) void putHof(r.career.retired.entry);
    window.scrollTo(0, 0);
    void get().saveNow();
  },
  nextWeek: (weeks = 1) => {
    let { world, career } = get();
    if (!world || !career || career.retired) return;
    const simBefore = career.lastSim;
    try {
      for (let i = 0; i < weeks; i++) {
        if (pendingChoices(career).length) break;
        const injured = !!career.injury;
        const r = advanceWeek(world, career);
        world = r.world;
        career = r.career;
        // berhenti lebih awal kalau ada kejadian penting
        if (pendingChoices(career).length || (!injured && career.injury) || career.retired) break;
      }
    } catch (e) {
      set({ message: e instanceof Error ? e.message : String(e) });
      return;
    }
    const watching = weeks === 1 && get().autoWatch && !!career.lastSim && career.lastSim.date !== simBefore?.date;
    set({ world, career, idx: buildIndexes(world), watching });
    if (career.retired) {
      void putHof(career.retired.entry);
      window.scrollTo(0, 0);
    }
    void get().saveNow();
  },
  choose: (msgId, choice) => {
    const { world, career } = get();
    if (!world || !career) return;
    const r = resolveChoice(world, career, msgId, choice);
    set({ world: r.world, career: r.career, idx: buildIndexes(r.world) });
    void get().saveNow();
  },
  acceptOffer: (offerId) => {
    const { world, career } = get();
    if (!world || !career) return;
    const r = acceptOffer(world, career, offerId);
    set({ world: r.world, career: r.career, idx: buildIndexes(r.world) });
    void get().saveNow();
  },
  rejectOffer: (offerId) => {
    const c = get().career;
    if (!c) return;
    set({ career: rejectOffer(c, offerId) });
    void get().saveNow();
  },
  negotiate: (offerId, ask) => {
    const { world, career } = get();
    if (!world || !career) return '';
    const r = negotiate(world, career, offerId, ask);
    set({ career: r.career });
    void get().saveNow();
    return r.result;
  },
  hireAgent: (tier) => {
    const { career, idx } = get();
    if (!career || !idx) return;
    set({ career: hireAgent(career, idx.playerById.get(career.playerId)!, tier, career.characterSeed) });
    void get().saveNow();
  },
  fireAgent: () => {
    const c = get().career;
    if (!c) return;
    set({ career: { ...c, agent: null } });
    void get().saveNow();
  },
  setWish: (patch) => {
    const { career: c, idx } = get();
    if (!c || !idx) return;
    set({ career: applyWish(c, patch, idx.playerById.get(c.playerId)?.contract?.clubId) });
    void get().saveNow();
  },
  lifeOp: (op) => {
    const { world, career } = get();
    if (!world || !career) return '';
    const r = applyLife(world, career, op);
    if (r.career === career) return r.result;
    set({ world: r.world, career: r.career, ...(r.world !== world ? { idx: buildIndexes(r.world) } : {}) });
    void get().saveNow();
    return r.result;
  },
  loadSave: async (id) => {
    set({ busy: 'Memuat karier…', message: null });
    try {
      const rec = await readSave(id);
      if (!rec) throw new Error('Save tidak ditemukan.');
      const { world, career } = await decodeSave(rec.data);
      const c = { ...career, saveId: rec.id };
      if (c.retired) void putHof(c.retired.entry);
      set({
        world,
        career: c,
        idx: buildIndexes(world),
        view: { kind: 'me' },
        history: [],
        watching: false,
        busy: null,
        saveStatus: 'saved',
        lastSavedAt: rec.savedAt,
        genMs: 0,
      });
      window.scrollTo(0, 0);
    } catch (e) {
      set({ busy: null, message: `Gagal memuat save: ${e instanceof Error ? e.message : e}` });
    }
  },
  exportSave: async (id) => {
    try {
      if (id) {
        const rec = await readSave(id);
        if (!rec) throw new Error('Save tidak ditemukan.');
        downloadFile(rec.data, fileName(rec.summary));
        return;
      }
      const { world, career, idx } = get();
      if (!world || !career || !idx) return;
      set({ busy: 'Menyiapkan file…' });
      const summary = summaryOf(career, idx);
      const { bytes } = await encodeSave(world, career, summary);
      set({ busy: null });
      downloadFile(bytes, fileName(summary));
    } catch (e) {
      set({ busy: null, message: `Gagal mengekspor: ${e instanceof Error ? e.message : e}` });
    }
  },
  importSave: async (file) => {
    set({ busy: 'Membaca file save…', message: null });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { summary, savedAt } = await decodeSave(bytes.slice()); // validasi isi file
      const id = newSaveId();
      await writeSave({ id, savedAt, summary, data: bytes });
      set({ busy: null });
      await get().loadSave(id);
    } catch (e) {
      set({ busy: null, message: `File tidak bisa dibuka: ${e instanceof Error ? e.message : e}` });
    }
  },
  renameOne: (edit) => {
    const { world, career } = get();
    if (!world) return;
    const r = applyNameEdits(world, [edit]);
    if (!r.changes.length) return;
    set({ world: r.world, idx: buildIndexes(r.world), ...(career ? { career: renameInCareer(career, r.changes) } : {}) });
    if (career) void get().saveNow();
  },
  importNames: async (file) => {
    const { world, career } = get();
    if (!world) return null;
    let text: string;
    try {
      text = await file.text();
    } catch {
      set({ message: 'File nama tidak bisa dibaca.' });
      return null;
    }
    const r = applyNameFile(world, text, career?.currentDate);
    if (r.changes.length) {
      set({ world: r.world, idx: buildIndexes(r.world), ...(career ? { career: renameInCareer(career, r.changes) } : {}) });
      if (career) void get().saveNow();
    }
    return {
      changed: r.changes.length,
      text: r.changes.length ? `${r.changes.length} nama diganti (${changeText(r.changes)}).` : 'Tidak ada nama yang diganti.',
      problems: r.problems,
    };
  },
  exportNames: (players) => {
    const { world, career } = get();
    if (!world) return;
    downloadCsv(nameTemplate(world, { players, sep: csvFormat().sep, today: career?.currentDate }), `nama-${world.seed}.csv`);
  },
  restoreAllNames: () => {
    const { world, career } = get();
    if (!world) return 0;
    const r = restoreNames(world);
    if (r.changes.length) {
      set({ world: r.world, idx: buildIndexes(r.world), ...(career ? { career: renameInCareer(career, r.changes) } : {}) });
      if (career) void get().saveNow();
    }
    return r.changes.length;
  },
}));

/** Tanggal game sekarang (tanggal karier, atau tanggal awal dunia) */
export const useToday = () => useGame((s) => s.career?.currentDate ?? s.world?.startDate ?? '2026-07-01');
