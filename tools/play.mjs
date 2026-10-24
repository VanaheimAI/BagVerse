// drive the game headlessly: node tools/play.mjs <url> <outprefix> [script-json]
import { chromium } from 'playwright';
const [url, out, script = '[]'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +(process.env.W||1280), height: +(process.env.H||720) } });
p.on('console', m => { if (m.type() !== 'debug') console.log('[console]', m.type(), m.text().slice(0, 300)); });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto(url);
await p.waitForFunction('window.__ready && window.__frames > 5', null, { timeout: 900000 });
let i = 0;
for (const step of JSON.parse(script)) {
  if (step.eval) console.log('eval:', JSON.stringify(await p.evaluate(step.eval)));
  if (step.hold) { for (const k of step.hold) await p.keyboard.down(k); }
  if (step.release) { for (const k of step.release) await p.keyboard.up(k); }
  if (step.press) await p.keyboard.press(step.press);
  if (step.wait) await p.waitForTimeout(step.wait);
  if (step.frames) { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + step.frames}`, null, { timeout: 900000 }); }
  if (step.shot) { await p.screenshot({ path: `${out}_${step.shot}.png`, timeout: 900000 }); console.log('shot', step.shot); }
}
console.log('fps', await p.evaluate('window.__fps'));
await b.close();
