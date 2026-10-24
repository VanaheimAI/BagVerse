import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1376, height: 768 } });
await p.goto('http://localhost:4173/?q=low&fixeddt');
await p.waitForFunction('window.__ready && window.__frames > 3 && window.__bagverse.skins', null, { timeout: 900000 });
const thumbs = await p.evaluate('window.__bagverse.skins.regenThumbs()');
writeFileSync('/home/claude/bagverse/src/assets/skin_thumbs.js',
  '// card portraits rendered from the real models (SkinScreen.makeThumbs) so the screen does not need every skin downloaded.\n' +
  '// Regenerate after adding a skin: node tools/dump_thumbs.mjs (with `npx vite preview` running).\nexport default ' + JSON.stringify(thumbs, null, 1) + ';\n');
console.log(Object.entries(thumbs).map(([k, v]) => k + ':' + v.length).join(' '));
await b.close();
