import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 11 Pro'] });
const CH = process.env.CH || 'witch';
await ctx.addInitScript((ch) => { localStorage.setItem('bagverse.safe', '1'); localStorage.setItem('bagverse.q', 'low'); localStorage.setItem('bagverse.char', ch); }, CH);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (/emote|warn|error/i.test(m.text())) console.log('[console]', m.text().slice(0, 200)); });
await p.goto('http://localhost:4173/?autostart&fixeddt');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
for (const em of ['Thriller', 'Dance']) {
  await p.evaluate((em) => { window.__bagverse.player.emote = em; }, em);
  await p.waitForFunction((em) => !!window.__bagverse.player.c.actions[em], em, { timeout: 600000 });
  const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + 40}`, null, { timeout: 600000 });
  const r = await p.evaluate((em) => { const c = window.__bagverse.player.c; const a = c.actions[em]; const clip = a.getClip();
    let bones = new Set(); c.model.traverse((o) => { if (o.isBone) bones.add(o.name); });
    const tn = clip.tracks.map((t) => t.name.split('.')[0]); const miss = tn.filter((n) => !bones.has(n));
    let arm = null; c.model.traverse((o) => { if (o.name === 'mixamorigLeftArm') arm = o.quaternion.toArray().map((v) => +v.toFixed(2)); });
    return { em, running: a.isRunning(), w: a.getEffectiveWeight(), tracks: tn.length, missing: miss.length, sample: miss.slice(0, 3), boneSample: [...bones].slice(0, 3), arm, cur: c.anim.current?.getClip().name };
  }, em);
  console.log(JSON.stringify(r));
  await p.screenshot({ path: `/tmp/claude-0/emote_${CH}_${em}.png` });
}
await b.close();
