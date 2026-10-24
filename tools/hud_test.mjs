import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = process.env.OUT || '/tmp/claude-0/hud';
for (const [dev, tag] of [['iPhone 11 Pro', 'port'], ['iPhone 11 Pro landscape', 'land']]) {
  const ctx = await b.newContext({ ...devices[dev] });
  await ctx.addInitScript(() => { localStorage.setItem('bagverse.safe', '1'); localStorage.setItem('bagverse.q', 'low'); localStorage.setItem('bagverse.char', 'witch'); });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto('http://localhost:4173/?autostart&fixeddt');
  await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
  await p.evaluate(() => document.body.classList.add('embedded'));
  // T-pose check: does a bone rotate over time?
  const bone = () => p.evaluate(() => { let q = null; window.__bagverse.player.c.model.traverse((o) => { if (!q && o.isBone && /Spine1|LeftArm$/.test(o.name)) q = [o.name, ...o.quaternion.toArray().map((v) => +v.toFixed(3))]; }); return q; });
  const a0 = await bone(); const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + 20}`, null, { timeout: 600000 }); const a1 = await bone();
  console.log(tag, 'char', await p.evaluate('window.__bagverse.player.c.charId'), 'clips', await p.evaluate('Object.keys(window.__bagverse.player.c.actions).join(",")'), 'bone', JSON.stringify(a0), JSON.stringify(a1));
  await p.evaluate(() => { document.getElementById('emotewheel').hidden = false; });
  const ov = await p.evaluate(() => {
    const els = [...document.querySelectorAll('#topleft, #minimap, #balance, #actions button, #joy, #jumpbtn, #usebtn, #emotewheel, #chatlog')].filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');
    const R = els.map((e) => { const r = e.getBoundingClientRect(); return [e.id || e.dataset.act || e.className, r]; }).filter(([, r]) => r.width > 0);
    const bad = [];
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i][1], c = R[j][1]; if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) bad.push(R[i][0] + ' x ' + R[j][0]); }
    const off = R.filter(([, r]) => r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight).map(([n]) => n);
    return { vw: innerWidth, vh: innerHeight, bad, off };
  });
  console.log(tag, JSON.stringify(ov));
  await p.screenshot({ path: `${out}_${tag}.png` });
  await p.evaluate(() => { document.getElementById('emotewheel').hidden = true; document.getElementById('hud').classList.add('menu-open'); });
  await p.screenshot({ path: `${out}_${tag}_menu.png` });
  await p.evaluate(() => { document.getElementById('hud').classList.remove('menu-open'); document.getElementById('hud').classList.add('chat-open'); });
  await p.screenshot({ path: `${out}_${tag}_chat.png` });
  await ctx.close();
}
await b.close();
