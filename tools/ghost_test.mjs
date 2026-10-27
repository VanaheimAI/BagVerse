// Ghost-shadow check: stand + walk on the plaza at a tier, screenshot the ground around the player.
//   node tools/ghost_test.mjs [q=medium] [extra=] [tag=]
import { chromium } from 'playwright';
const q = process.argv[2] || 'medium', extra = process.argv[3] || '', tag = process.argv[4] || '';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1000, height: 560 } })).newPage(); p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:4175/?autostart&fixeddt=0.05&q=${q}${extra}`, { timeout: 900000, waitUntil: 'commit' });
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
await p.evaluate(() => { document.getElementById('hud').hidden = true; const B = window.__bagverse, V = B.player.root.position.constructor; const s = new V(0, 0, 18.5); s.y = B.world.physics.groundAt(s.x, s.z, 8) + 0.1; B.player.teleport(s); B.player.facing = Math.PI; B.player.root.rotation.y = Math.PI; B.cam.yaw = 0; B.cam.pitch = 0.32; B.cam.dist = 8; });
await frames(6); await p.screenshot({ path: `/tmp/claude-0/ghost_${q}${tag}_still.png`, timeout: 600000 });
await p.keyboard.down('KeyD'); await frames(12); await p.keyboard.up('KeyD'); await frames(2);
await p.screenshot({ path: `/tmp/claude-0/ghost_${q}${tag}_moved.png`, timeout: 600000 });
console.log(await p.evaluate(() => { const B = window.__bagverse; let n = 0, hid = []; B.scene.traverse((o) => { if (o.isSkinnedMesh && o.castShadow) { n++; let v = true, x = o; while (x) { if (!x.visible) v = false; x = x.parent; } const m = [].concat(o.material)[0]; if (v && (m.opacity < 0.05 || m.colorWrite === false || !m.visible)) hid.push(o.name + ' op' + m.opacity); } }); return `shadow-casting skinned meshes: ${n}; visible-but-invisible casters: ${hid.join(', ') || 'none'}`; }));
await b.close();
