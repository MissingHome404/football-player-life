import { defineConfig } from 'vitest/config';

// Tes match engine memainkan banyak laga penuh; mesin CI lebih lambat dari komputer biasa,
// jadi batas waktu bawaan 5 detik per tes terlalu ketat.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    // beri jeda event loop di antara tes (lihat file ini)
    setupFiles: ['./src/game/__tests__/setup.ts'],
  },
});
