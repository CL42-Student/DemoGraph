import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  base: process.env.NODE_ENV === 'production' && process.env.GITHUB_PAGES ? '/DemoGraph/' : '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    open: true,
    port: 5173,
  },
});

