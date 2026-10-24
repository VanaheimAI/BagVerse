import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1024, height: 576 } });
await p.addInitScript(() => { localStorage.setItem('bagverse.q', 'low'); localStorage.setItem('bagverse.char', 'goldenking'); });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000 }); };
await p.keyboard.press('Digit2');
await p.waitForFunction(() => { const c = window.__bagverse.player.c; return c.anim.current === c.actions.Dance; }, null, { timeout: 900000 });
await frames(2); await p.keyboard.press('KeyF');
await p.waitForFunction(() => { const l = window.__bagverse.crowd.list.filter((n) => n.mob); return l.length && l.every((n) => n.mob.state === 'dance'); }, null, { timeout: 1500000, polling: 2000 });
await frames(8);
await p.evaluate(() => { document.getElementById('hud').style.visibility = 'hidden'; const B = window.__bagverse, P = B.player.body.pos, f = B.player.facing;
  window.__camOverride = { pos: [P.x + Math.sin(f) * 7.5 + Math.cos(f) * 2.5, P.y + 2.6, P.z + Math.cos(f) * 7.5 - Math.sin(f) * 2.5], at: [P.x - Math.sin(f) * 3, P.y + 1.1, P.z - Math.cos(f) * 3] }; });
for (const k of [0, 1]) { await frames(k ? 6 : 3); await p.screenshot({ path: `/tmp/claude-0/flashmob_shot${k}.png`, timeout: 900000 }); }
await b.close(); console.log('done');
