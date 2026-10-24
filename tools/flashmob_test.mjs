import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.addInitScript(() => { localStorage.setItem('bagverse.q', 'low'); localStorage.setItem('bagverse.char', 'goldenking'); });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 }); console.log('ready');
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000 }); };
const EM = process.env.EM || 'Dance';
await p.keyboard.press(EM === 'Dance' ? 'Digit2' : 'Digit1');
await p.waitForFunction((em) => { const c = window.__bagverse.player.c; return c.anim.current === c.actions[em]; }, EM, { timeout: 900000 });
await frames(3);
console.log('prompt', await p.evaluate(`document.getElementById('prompt').textContent`));
await p.keyboard.press('KeyF');
await frames(2);
const stat = () => p.evaluate((em) => { const B = window.__bagverse, c = B.crowd, pl = B.player;
  const la = pl.c.actions[em];
  const m = c.list.filter((n) => n.mob).map((n) => { const a = n.c.actions[em]; return [n.mob.state, +n.body.pos.distanceTo(n.mob.slot).toFixed(1), a && n.c.anim.current === a ? +(a.time - la.time).toFixed(2) : null]; });
  return { mob: !!c.flashmob, n: m.length, dancing: m.filter((x) => x[0] === 'dance').length, synced: m.filter((x) => x[2] !== null && Math.abs(x[2]) < 0.1).length, sample: m.slice(0, 5), toast: document.getElementById('toast').textContent }; }, EM);
console.log('start', JSON.stringify(await stat()));
for (let i = 0; i < 8; i++) { await frames(15); const s = await stat(); console.log('t+', (i + 1) * 15, JSON.stringify(s)); if (s.n && s.synced === s.n) break; }
// camera in front of the leader, looking back at the mob
await p.evaluate(() => { const B = window.__bagverse, P = B.player.body.pos, f = B.player.facing; window.__camOverride = { pos: [P.x + Math.sin(f) * 9, P.y + 3.5, P.z + Math.cos(f) * 9], at: [P.x - Math.sin(f) * 3, P.y + 1, P.z - Math.cos(f) * 3] }; });
await frames(3);
await p.screenshot({ path: `/tmp/claude-0/flashmob_${EM}.png`, timeout: 900000 });
await p.evaluate(() => { window.__camOverride = null; });
await p.keyboard.down('KeyW'); await frames(4); await p.keyboard.up('KeyW'); await frames(2);
console.log('after move', JSON.stringify(await stat()), 'waving', await p.evaluate(`window.__bagverse.crowd.list.filter(n=>n.act==='Wave'&&n.wait>0).length`));
await b.close();
