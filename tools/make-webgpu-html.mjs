// The WebGPU build's page: a copy of index.html (one source of truth), retitled. Built to dist/webgpu.html, served as /webgpu.
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace('<title>BagVerse</title>', '<title>BagVerse · WebGPU preview</title>');
fs.writeFileSync(new URL('../webgpu.html', import.meta.url), html);
