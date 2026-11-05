import { create } from 'zustand';
import type { World, Player, Club, Career } from '../game/types';
import type { CharacterRoll } from '../game/gen/character';
import type { GenerateOptions } from '../game/gen/world';

export type View =
  | { kind: 'league'; leagueId: string }
  | { kind: 'club'; clubId: string }
  | { kind: 'player'; playerId: string }
  | { kind: 'me' };

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
    set({
      world,
      idx: buildIndexes(world),
      career: {
        characterSeed: roll.seed,
        rerolls,
        playerId: roll.player.id,
        origin: roll.origin,
        family: roll.family,
        money: roll.money,
        stress: roll.stress,
        teamLabel: roll.teamLabel,
        scoutPA: roll.scoutPA,
        currentDate: world.startDate,
      },
      view: { kind: 'me' },
      history: [],
    });
    window.scrollTo(0, 0);
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
  reset: () => set({ world: null, idx: null, view: null, history: [], career: null }),
  toggleDev: () => set({ devMode: !get().devMode }),
}));
