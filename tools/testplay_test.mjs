// Test-play cleanup: Wano Vault shows a floating COMING SOON sign (no showcases, door says coming soon),
// Kaizoku skins are off the roster, the tutorial beacon points at the Kanto Vault.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4175';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1100, height: 620 } })).newPage(); p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(BASE + '/?autostart&fixeddt=0.1&q=low&char=kaizokuguy', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
console.log('skins on screen:', await p.evaluate(() => window.__bagverse.skins.allIds.join(',')));
console.log('kaizoku in roster:', await p.evaluate(() => window.__bagverse.skins.allIds.some((x) => /kaizoku/.test(x))));
console.log('wano showcases:', await p.evaluate(() => Object.keys(window.__bagverse.world.showcases || {}).join(',')));
console.log('tutorial step:', await p.evaluate(() => window.__bagverse.quests.current?.title || '(done)'));
await p.evaluate(() => { document.getElementById('hud').hidden = false; const B = window.__bagverse; const f = B.vaultFront('rwa_vault'), V = B.player.root.position.constructor;
  const s = new V(f.x - 14, 0, f.z); s.y = B.world.physics.groundAt(s.x, s.z, 8) + 0.1; B.player.teleport(s);
  const face = Math.atan2(1, 0); B.player.facing = face; B.player.root.rotation.y = face; B.cam.yaw = face + Math.PI; B.cam.pitch = 0.12; B.cam.dist = 7; });
await frames(6); await p.screenshot({ path: '/tmp/claude-0/wano_soon.png', timeout: 600000 });
await p.evaluate(() => { const B = window.__bagverse; const f = B.vaultFront('rwa_vault'), V = B.player.root.position.constructor; const s = new V(f.x - 1, 0, f.z); s.y = B.world.physics.groundAt(s.x, s.z, 8) + 0.1; B.player.teleport(s); });
await frames(4); console.log('wano prompt:', await p.textContent('#prompt'));
await b.close(); console.log('done');
