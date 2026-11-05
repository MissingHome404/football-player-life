// Web Worker: generate dunia di belakang layar supaya UI tidak macet.
import { generateWorld, type GenerateOptions } from './gen/world';

self.onmessage = (e: MessageEvent<GenerateOptions>) => {
  const t = performance.now();
  const world = generateWorld(e.data);
  (self as unknown as Worker).postMessage({ world, ms: Math.round(performance.now() - t) });
};
