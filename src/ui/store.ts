import { create } from 'zustand';
import type { World, Player, Club, Career, WeekPlan, AgentTier } from '../game/types';
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

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type View =
  | { kind: 'league'; leagueId: string }
  | { kind: 'club'; clubId: string }
  | { kind: 'player'; playerId: string }
  | { kind: 'me' }
  | { kind: 'life' };

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
  generate: (opts: GenerateOptions) => void;
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
  generate: (opts) => {
    set({ generating: true });
    const done = (w: World, ms: number) => {
      const first = w.leagues.find((l) => l.active) ?? w.leagues[0];
      set({
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
}));

/** Tanggal game sekarang (tanggal karier, atau tanggal awal dunia) */
export const useToday = () => useGame((s) => s.career?.currentDate ?? s.world?.startDate ?? '2026-07-01');
