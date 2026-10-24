// first-time entry: skin screen asks for a player name (required), default graphics = LOW
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [tag, opts] of [['desk', { viewport: { width: 1200, height: 675 } }], ['phone', { ...devices['iPhone 11 Pro'] }], ['land', { ...devices['iPhone 11 Pro landscape'] }]]) {
  const p = await (await b.newContext(opts)).newPage();
  p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message));
  await p.goto('http://localhost:4173/?fixeddt=0.1', { timeout: 900000 });
  await p.waitForFunction('window.__ready && window.__bagverse.skins.isOpen', null, { timeout: 900000 });
  const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + 2}`, null, { timeout: 900000, polling: 500 });
  console.log(tag, 'quality:', await p.evaluate(() => window.__bagverse.quality), '| field:', JSON.stringify(await p.evaluate(() => document.getElementById('sk-pname').value)));
  await p.screenshot({ path: `/tmp/claude-0/name_${tag}.png`, timeout: 900000 });
  if (tag !== 'desk') { await p.evaluate(() => document.querySelector('.sk-player')?.closest('#skins')); continue; }
  await p.click('#sk-equip'); await p.waitForTimeout(400);
  console.log('equip without name -> still open:', await p.evaluate(() => window.__bagverse.skins.isOpen), '| toast:', await p.evaluate(() => document.getElementById('sk-toast').textContent));
  await p.fill('#sk-pname', 'Ada Lovelace!');
  console.log('save btn before:', await p.evaluate(() => [document.getElementById('sk-psave').textContent, document.getElementById('sk-psave').disabled]));
  await p.click('#sk-psave'); await p.waitForTimeout(400);
  console.log('after SAVE -> open:', await p.evaluate(() => window.__bagverse.skins.isOpen), '| name:', await p.evaluate(() => window.__bagverse.progress.s.name), '| btn:', await p.evaluate(() => document.getElementById('sk-psave').textContent), '| toast:', await p.evaluate(() => document.getElementById('sk-toast').textContent));
  await p.screenshot({ path: `/tmp/claude-0/name_saved.png` });
  await p.click('#sk-equip'); await p.waitForTimeout(800);
  console.log('after name -> open:', await p.evaluate(() => window.__bagverse.skins.isOpen), '| saved name:', await p.evaluate(() => window.__bagverse.progress.s.name), '| nameSet:', await p.evaluate(() => window.__bagverse.progress.s.nameSet));
  await p.evaluate(() => window.__bagverse.skins.open()); await p.waitForTimeout(400);
  console.log('reopen prefill:', await p.evaluate(() => document.getElementById('sk-pname').value));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400); console.log('esc closes once named:', !(await p.evaluate(() => window.__bagverse.skins.isOpen)));
}
await b.close(); console.log('done');
