import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [dev, tag] of [['iPhone 11 Pro', 'port'], ['iPhone 11 Pro landscape', 'land']]) {
  const ctx = await b.newContext({ ...devices[dev] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&q=low');
  await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
  await p.evaluate(() => document.body.classList.add('embedded'));
  const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 500 }); };
  if (tag === 'port') { await frames(3); await p.screenshot({ path: `/tmp/claude-0/carm_spawn.png`, timeout: 900000 }); }
  await p.evaluate(() => window.__bagverse.enterCar());
  await p.evaluate(() => { window.__bagverse.input.joy.y = -1; });
  await frames(30);
  await p.evaluate(() => { window.__bagverse.input.joy.y = 0; });
  const ov = await p.evaluate(() => {
    const els = [...document.querySelectorAll('#topleft, #minimap, #balance, #speedo, #actions button, #joy, #jumpbtn, #usebtn, #chatlog')].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0);
    const R = els.map((e) => [e.id || e.dataset.act, e.getBoundingClientRect()]);
    const bad = [];
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i][1], c = R[j][1]; if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) bad.push(R[i][0] + ' x ' + R[j][0]); }
    return { bad, kmh: window.__bagverse.car.kmh, jump: document.getElementById('jumpbtn').textContent, emoteShown: getComputedStyle(document.querySelector('[data-act=emotes]')).display };
  });
  console.log(tag, JSON.stringify(ov));
  await p.screenshot({ path: `/tmp/claude-0/carm_${tag}.png`, timeout: 900000 });
  await ctx.close();
}
await b.close(); console.log('done');
