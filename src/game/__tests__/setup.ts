import { afterEach } from 'vitest';

// Tes simulasi berjalan sinkron dan lama. Tanpa jeda, pesan antara worker dan Vitest baru diproses
// setelah satu FILE tes selesai; file yang lebih dari 60 detik (di CI yang lambat) memicu error
// "[vitest-worker]: Timeout calling onTaskUpdate" walaupun semua tes lulus. Jeda singkat setelah
// setiap tes membuat pesan itu diproses tepat waktu.
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
