import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' supaya bisa jalan di GitHub Pages (subfolder /nama-repo/)
export default defineConfig({
  base: './',
  plugins: [react()],
});
