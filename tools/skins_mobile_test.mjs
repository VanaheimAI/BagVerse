import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const DEVS = (process.env.DEVS || 'iPhone 11 Pro:port,iPhone 11 Pro landscape:land,iPhone SE:se,Pixel 7 landscape:pland').split(',').map((s) => s.split(':'));
for (const [dev, tag] of DEVS) {
  const ctx = await b.newContext({ ...devices[dev] });
  await ctx.addInitScript(() => { localStorage.setItem('bagverse.safe', '1'); localStorage.setItem('bagverse.q', 'low'); localStorage.setItem('bagverse.char', 'witch'); });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto('http://localhost:4173/?fixeddt');
  await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
  if (tag !== 'se') await p.evaluate(() => document.body.classList.add('embedded'));
  const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + 4}`, null, { timeout: 600000 });
  const r = await p.evaluate(() => {
    const q = (s) => document.querySelector(s).getBoundingClientRect();
    const names = ['.sk-head h1', '.sk-stage', '.sk-info', '.sk-panel', '.sk-actions'];
    const R = names.map((n) => [n, q(n)]);
    const bad = [];
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i][1], c = R[j][1]; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) bad.push(R[i][0] + ' x ' + R[j][0]); }
    const off = R.filter(([, r]) => r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1).map(([n]) => n);
    const card = q('.sk-card'); const g = document.querySelector('.sk-grid');
    return { vw: innerWidth, vh: innerHeight, bad, off, stage: [Math.round(q('.sk-stage').width), Math.round(q('.sk-stage').height)], card: [Math.round(card.width), Math.round(card.height)], gridH: g.clientHeight, scrollW: g.scrollWidth };
  });
  console.log(tag, JSON.stringify(r));
  await p.screenshot({ path: `/tmp/claude-0/skm_${tag}.png` });
  await ctx.close();
}
await b.close();
