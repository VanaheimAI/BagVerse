import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1200, height: 675 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.addInitScript(() => { localStorage.setItem('bagverse.char', 'queen'); });
await p.goto('http://localhost:4173/?fixeddt=0.05&q=low');
await p.waitForFunction('window.__ready && window.__frames > 3 && window.__bagverse.skins.isOpen', null, { timeout: 900000 });
console.log('equipped (was queen)', await p.evaluate('window.__bagverse.player.c.charId'), 'cards', await p.evaluate(`[...document.querySelectorAll('.sk-card')].map(c=>c.dataset.skin).join(',')`));
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 500 }); };
for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ['solanagirl', 'vampire', 'scream']) {
  await p.evaluate((id) => document.querySelector(`[data-skin="${id}"]`).click(), id);
  await p.waitForFunction((id) => !!window.__bagverse.skins.chars[id], id, { timeout: 900000, polling: 1000 });
  await p.evaluate((id) => document.querySelector(`[data-skin="${id}"]`).click(), id);
  await frames(4);
  console.log(id, await p.evaluate(() => document.getElementById('sk-name').textContent + ' / ' + document.getElementById('sk-equip').textContent));
  await p.screenshot({ path: `/tmp/claude-0/ns_${id}.png`, timeout: 900000 });
}
await b.close(); console.log('done');
