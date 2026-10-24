// node tools/modelshot.mjs <model> <yaw> <pitch> <out.png>   (needs `npx vite --port 5199` running)
import { chromium } from 'playwright';
const [m, yaw, pitch, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 700, height: 500 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:5199/tools/modelview.html?m=${m}&yaw=${yaw}&pitch=${pitch}`); await p.waitForFunction('window.__done', null, { timeout: 300000 });
console.log(m, await p.evaluate('window.__done')); await p.screenshot({ path: out }); await b.close();
