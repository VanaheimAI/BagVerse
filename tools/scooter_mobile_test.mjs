import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const check = () => {
  const els = [...document.querySelectorAll('#topleft, #minimap, #balance, #speedo, #actions button, #joy, #jumpbtn, #usebtn, #mobbtn, #chatlog')].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0 && getComputedStyle(e.closest('#chat') || e).opacity !== '0');
  const R = els.map((e) => [e.id || e.dataset.act, e.getBoundingClientRect()]);
  const bad = [];
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i][1], c = R[j][1]; if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) bad.push(R[i][0] + ' x ' + R[j][0]); }
  const off = R.filter(([, r]) => r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight).map(([n]) => n);
  return { bad, off };
};
for (const [dev, tag] of [['iPhone 11 Pro', 'port'], ['iPhone 11 Pro landscape', 'land']]) {
  const ctx = await b.newContext({ ...devices[dev] });
  await ctx.addInitScript(() => { localStorage.setItem('bagverse.char', 'elf'); });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&q=low');
  await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
  await p.evaluate(() => document.body.classList.add('embedded'));
  const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 500 }); };
  console.log(tag, 'char', await p.evaluate('window.__bagverse.player.c.charId'), 'walk', JSON.stringify(await p.evaluate(check)));
  // emoting: flashmob pill + scooter button together
  await p.evaluate(() => { window.__bagverse.player.emote = 'Dance'; }); await frames(4);
  console.log(tag, 'emoting', JSON.stringify(await p.evaluate(check)), 'canmob', await p.evaluate(`document.getElementById('hud').classList.contains('can-mob')`));
  if (tag === 'port') await p.screenshot({ path: '/tmp/claude-0/scm_emote.png', timeout: 900000 });
  await p.tap('#actions [data-act=ride]'); await frames(4);
  await p.evaluate(() => { window.__bagverse.input.joy.y = -1; }); await frames(24); await p.evaluate(() => { window.__bagverse.input.joy.y = 0; });
  console.log(tag, 'riding', JSON.stringify(await p.evaluate(check)), 'kmh', await p.evaluate('window.__bagverse.scooter.kmh'), 'anim', await p.evaluate('window.__bagverse.player.c.anim.current?.getClip().name'));
  await p.screenshot({ path: `/tmp/claude-0/scm_${tag}.png`, timeout: 900000 });
  await p.tap('#actions [data-act=ride]'); await frames(3);
  console.log(tag, 'off', await p.evaluate('window.__bagverse.scooter.driving'), await p.evaluate(`document.getElementById('hud').classList.contains('driving')`));
  await ctx.close();
}
await b.close(); console.log('done');
