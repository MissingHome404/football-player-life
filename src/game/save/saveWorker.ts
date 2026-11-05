// Kompres / buka file save di Web Worker supaya game tidak macet saat menyimpan.
import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import { buildSaveFile, readSaveFile, type SaveSummary } from './codec';
import type { Career, World } from '../types';

export type SaveRequest =
  | { type: 'encode'; id: string; world: World; career: Career; summary: SaveSummary }
  | { type: 'decode'; bytes: Uint8Array };

self.onmessage = (e: MessageEvent<SaveRequest>) => {
  const post = (msg: unknown, transfer: Transferable[] = []) =>
    (self as unknown as Worker).postMessage(msg, transfer);
  try {
    if (e.data.type === 'encode') {
      const { id, world, career, summary } = e.data;
      const file = buildSaveFile(id, world, career, summary);
      const bytes = gzipSync(strToU8(JSON.stringify(file)), { level: 6 });
      post({ ok: true, bytes, savedAt: file.savedAt }, [bytes.buffer]);
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(strFromU8(gunzipSync(e.data.bytes)));
      } catch {
        throw new Error('Ini bukan file save Football Player Life, atau filenya rusak.');
      }
      const { file, world, career } = readSaveFile(parsed);
      post({ ok: true, world, career, summary: file.summary, savedAt: file.savedAt });
    }
  } catch (err) {
    post({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
