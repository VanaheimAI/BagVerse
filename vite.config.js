import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { lygia } from './tools/vite-lygia.js';

const src = (p) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

// Two builds share the same source:
//   `vite build`               the game on three's WebGLRenderer (index.html, admin.html)
//   `vite build --mode webgpu` the same game on three's WebGPURenderer + TSL (webgpu.html, served as /webgpu).
//     `three` resolves to three's WebGPU build (one copy of the core classes for the game, addons and libraries),
//     and the few renderer-specific modules are swapped for their *.webgpu.js twins with the same exports.
//     It is added to the same dist/ (no public/ copy: it shares /assets with the main build).
export default defineConfig(({ mode }) => {
  const gpu = mode === 'webgpu';
  const alias = [];
  if (process.env.FAKE_SUPABASE) alias.push({ find: '@supabase/supabase-js', replacement: fileURLToPath(new URL('./tools/fake-supabase.js', import.meta.url)) });   // tests only
  if (gpu) {
    alias.push({ find: /^three$/, replacement: fileURLToPath(new URL('./node_modules/three/build/three.webgpu.js', import.meta.url)) });
    for (const m of ['gfx', 'grass', 'surface', 'paint', 'fxmats']) alias.push({ find: new RegExp(`^\\./${m}\\.js$`), replacement: src(`${m}.webgpu.js`) });
  }
  return {
    base: './',
    plugins: [lygia()],
    publicDir: gpu ? false : 'public',
    define: { __WEBGPU__: JSON.stringify(gpu) },
    build: {
      target: 'esnext', chunkSizeWarningLimit: 1500,
      emptyOutDir: !gpu,
      rollupOptions: { input: gpu ? { webgpu: 'webgpu.html' } : { main: 'index.html', admin: 'admin.html' } },   // /admin = the admin dashboard
    },
    optimizeDeps: { esbuildOptions: { target: 'esnext' } },
    resolve: { alias },
  };
});
