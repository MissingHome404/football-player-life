import { create } from 'zustand';
import type { World, Player, Club } from '../game/types';
import type { GenerateOptions } from '../game/gen/world';

export type View =
  | { kind: 'league'; leagueId: string }
  | { kind: 'club'; clubId: string }
  | { kind: 'player'; playerId: string };

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
  generate: (opts) => {
    set({ generating: true });
    const worker = new Worker(new URL('../game/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ world: World; ms: number }>) => {
      const w = e.data.world;
      const first = w.leagues.find((l) => l.active) ?? w.leagues[0];
      set({
        world: w,
        idx: buildIndexes(w),
        genMs: e.data.ms,
        generating: false,
        view: { kind: 'league', leagueId: first.id },
        history: [],
      });
      window.scrollTo(0, 0);
      worker.terminate();
    };
    worker.postMessage(opts);
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
  reset: () => set({ world: null, idx: null, view: null, history: [] }),
  toggleDev: () => set({ devMode: !get().devMode }),
}));
