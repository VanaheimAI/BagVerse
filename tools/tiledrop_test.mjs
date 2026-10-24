// Tile Drop solo vs bots: start from the portal menu, screenshots, falling through floors, bots, results.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1000, height: 562 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (/error|tile/i.test(m.text())) console.log('[console]', m.text().slice(0, 200)); });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&unlockall&q=low');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
console.log('world top:', await p.evaluate(() => { const B = window.__bagverse; const bb = new (B.player.root.position.constructor)(); let max = 0; B.world.root.traverse((o) => { if (o.isMesh && o.geometry) { o.geometry.computeBoundingBox(); const y = o.geometry.boundingBox.max.y * o.matrixWorld.elements[5] + o.matrixWorld.elements[13]; if (y > max) max = y; } }); return max.toFixed(1); }));
const portal = await p.evaluate(() => { const B = window.__bagverse; const pt = B.world.portals.find((x) => x.userData.label === 'TILE DROP'); return pt ? pt.userData.center.toArray() : null; });
console.log('portal', portal);
await p.evaluate(([x, y, z]) => { const B = window.__bagverse, V = B.player.root.position.constructor; B.player.teleport(new V(x + 2, B.world.physics.groundAt(x + 2, z, 10) + 0.1, z)); }, portal);
await frames(3);
console.log('prompt:', await p.evaluate(() => document.getElementById('prompt').textContent));
await p.keyboard.press('KeyE'); await frames(2);
console.log('menu:', await p.evaluate(() => document.getElementById('mtitle').textContent));
await p.screenshot({ path: '/tmp/claude-0/td_menu.png', timeout: 600000 });
await p.click('#td-solo'); await frames(2);
const st = () => p.evaluate(() => { const T = window.__bagverse.tileDrop, P = window.__bagverse.player.body.pos; return `${T.state} t=${(T.clock - (T.startClock || 0)).toFixed(1)} me=(${P.x.toFixed(1)},${P.y.toFixed(1)},${P.z.toFixed(1)}) floor=${T.floorOf(P.y)} alive=${T.alive()} bots=${T.bots.map((b) => b.out ? 'X' : T.floorOf(b.body.pos.y)).join('')}`; });
console.log('countdown:', await st());
await p.evaluate(() => { document.getElementById('hud').hidden = true; const B = window.__bagverse; B.cam.pitch = 0.45; B.cam.dist = 11; });
await p.waitForFunction('window.__bagverse.tileDrop.state === "run"', null, { timeout: 900000, polling: 200 });
await frames(30); console.log('run 1.5s:', await st());
await p.screenshot({ path: '/tmp/claude-0/td_play1.png', timeout: 600000 });
// stand still: my tile drops -> fall to floor 2
await frames(40); console.log('after standing:', await st());
// walk around for a while (hold W)
await p.keyboard.down('KeyW'); await frames(60); await p.keyboard.up('KeyW');
console.log('after walking:', await st());
await p.screenshot({ path: '/tmp/claude-0/td_play2.png', timeout: 600000 });
await p.waitForFunction('!window.__bagverse.tileDrop.active', null, { timeout: 900000, polling: 300 });
console.log('results:', await p.evaluate(() => document.getElementById('mtitle').textContent), '|', await p.evaluate(() => [...document.querySelectorAll('#mbody .row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
console.log('back at:', await p.evaluate(() => window.__bagverse.player.body.pos.toArray().map((v) => v.toFixed(1)).join(',')), 'physics restored:', await p.evaluate(() => window.__bagverse.player.physics === window.__bagverse.world.physics));
await p.screenshot({ path: '/tmp/claude-0/td_results.png', timeout: 600000 });
await b.close(); console.log('done');
