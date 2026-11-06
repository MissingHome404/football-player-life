// Penyimpanan save di browser (IndexedDB lewat Dexie) + jembatan ke save worker.
import Dexie, { type Table } from 'dexie';
import type { Career, HofEntry, World } from '../types';
import type { SaveSummary } from './codec';
import type { SaveRequest } from './saveWorker';

export interface SaveRecord {
  id: string;
  savedAt: string;
  summary: SaveSummary;
  data: Uint8Array; // isi file .fplsave (JSON terkompresi gzip)
}

class SaveDb extends Dexie {
  saves!: Table<SaveRecord, string>;
  hof!: Table<HofEntry, string>;
  constructor() {
    super('football-player-life');
    this.version(1).stores({ saves: '&id, savedAt' });
    // Hall of Fame: ringkasan karier yang sudah pensiun (tetap ada walau save-nya dihapus)
    this.version(2).stores({ saves: '&id, savedAt', hof: '&id, legacy' });
  }
}

let db: SaveDb | null = null;
function getDb(): SaveDb {
  if (!db) db = new SaveDb();
  return db;
}

function runWorker<T>(req: SaveRequest, transfer: Transferable[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./saveWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data as T);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Worker save gagal dijalankan.'));
    };
    worker.postMessage(req, transfer);
  });
}

export async function encodeSave(world: World, career: Career, summary: SaveSummary) {
  return runWorker<{ bytes: Uint8Array; savedAt: string }>({
    type: 'encode',
    id: career.saveId,
    world,
    career,
    summary,
  });
}

export async function decodeSave(bytes: Uint8Array) {
  return runWorker<{ world: World; career: Career; summary: SaveSummary; savedAt: string }>({
    type: 'decode',
    bytes,
  });
}

export async function writeSave(rec: SaveRecord): Promise<void> {
  await getDb().saves.put(rec);
}

export async function listSaves(): Promise<Omit<SaveRecord, 'data'>[]> {
  try {
    const all = await getDb().saves.orderBy('savedAt').reverse().toArray();
    return all.map(({ id, savedAt, summary }) => ({ id, savedAt, summary }));
  } catch {
    return []; // IndexedDB diblokir (mis. mode privat)
  }
}

export async function readSave(id: string): Promise<SaveRecord | undefined> {
  return getDb().saves.get(id);
}

export async function deleteSave(id: string): Promise<void> {
  await getDb().saves.delete(id);
}

export async function putHof(entry: HofEntry): Promise<void> {
  try {
    await getDb().hof.put(entry);
  } catch {
    /* IndexedDB diblokir */
  }
}

export async function listHof(): Promise<HofEntry[]> {
  try {
    return await getDb().hof.orderBy('legacy').reverse().toArray();
  } catch {
    return [];
  }
}

export async function deleteHof(id: string): Promise<void> {
  await getDb().hof.delete(id);
}

/** Unduh bytes sebagai file */
export function downloadFile(bytes: Uint8Array, filename: string, type = 'application/octet-stream') {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const newSaveId = () => `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
