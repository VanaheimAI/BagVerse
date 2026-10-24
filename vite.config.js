import { defineConfig } from 'vite';
import { lygia } from './tools/vite-lygia.js';

export default defineConfig({
  base: './',
  plugins: [lygia()],
  build: { target: 'esnext', chunkSizeWarningLimit: 1500 },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  // tests only: FAKE_SUPABASE=1 swaps the Supabase client for an in-browser fake (tools/fake-supabase.js)
  resolve: process.env.FAKE_SUPABASE ? { alias: { '@supabase/supabase-js': new URL('./tools/fake-supabase.js', import.meta.url).pathname } } : {},
});
