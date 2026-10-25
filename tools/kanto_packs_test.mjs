// Kanto Vault showcases: three floating booster packs (no pedestals), labels from the open raffles, E on a pack opens its raffle.
import { chromium } from 'playwright';
const BASE = 'http://localhost:4175';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1100, height: 620 } })).newPage(); p.on('pageerror', (e) => console.log('[pageerror]', e.message));
const now = Date.now();
await fetch(BASE + '/__fake/t/raffles', { method: 'POST', body: JSON.stringify([
  { id: 'k1', vault: 'kanto', status: 'open', entries: 4, min_level: 0, draws_at: new Date(now + 2 * 86400e3).toISOString(), prize: { name: 'Charizard ex', grader: 'PSA', grade: '10', slot: 1 } },
  { id: 'k2', vault: 'kanto', status: 'open', entries: 1, min_level: 0, draws_at: new Date(now + 5 * 3600e3).toISOString(), prize: { name: 'Pikachu Illustrator', grader: 'PSA', grade: '9' } },
  { id: 'k3', vault: 'kanto', status: 'open', entries: 0, min_level: 0, draws_at: new Date(now + 6 * 86400e3).toISOString(), prize: { name: 'Umbreon VMAX', grader: 'CGC', grade: '10', chain: 'polygon', issuer: 'courtyard', token_id: '42' } }]) });
await p.goto(BASE + '/?autostart&fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3 && window.__bagverse.raffles.ready', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
await p.waitForFunction('window.__bagverse.world.showcases.apex_arena.every((s) => s.holder.children.length)', null, { timeout: 120000, polling: 500 });
console.log('showcases:', await p.evaluate(() => window.__bagverse.world.showcases.apex_arena.map((s) => `${s.slot}:${s.label.name}:${s.holder.children.length ? 'model' : 'empty'}`).join(' | ')));
await p.evaluate(() => { document.getElementById('hud').hidden = true; const B = window.__bagverse, sc = B.world.showcases.apex_arena, V = B.player.root.position.constructor;
  const mid = sc[1].pos, f = B.vaultFront('apex_arena'); const dx = mid.x - f.x, dz = mid.z - f.z, L = Math.hypot(dx, dz);
  const s = new V(mid.x + dx / L * 5, 0, mid.z + dz / L * 5); s.y = B.world.physics.groundAt(s.x, s.z, 5) + 0.1; B.player.teleport(s);
  const face = Math.atan2(-dx, -dz); B.player.facing = face; B.player.root.rotation.y = face; B.cam.yaw = face + Math.PI; B.cam.pitch = 0.05; B.cam.dist = 6; });
await frames(6); await p.screenshot({ path: '/tmp/claude-0/kanto_packs.png', timeout: 600000 });
// walk up to the left pack: prompt + E opens that raffle
await p.evaluate(() => { const B = window.__bagverse, sc = B.world.showcases.apex_arena[0], V = B.player.root.position.constructor; const s = new V(sc.pos.x + 1.2, 0, sc.pos.z + 1.2); s.y = B.world.physics.groundAt(s.x, s.z, 5) + 0.1; B.player.teleport(s); document.getElementById('hud').hidden = false; });
await frames(4); console.log('prompt at pack 1:', await p.textContent('#prompt'));
await p.keyboard.press('KeyE'); await frames(3);
console.log('modal:', await p.evaluate(() => document.getElementById('mtitle').textContent + ' | tabs: ' + [...document.querySelectorAll('[data-rf]')].map((e) => e.textContent).join(', ') + ' | shown: ' + document.querySelector('#mbody .rwa-t')?.textContent));
await p.screenshot({ path: '/tmp/claude-0/kanto_modal.png', timeout: 600000 });
await b.close(); console.log('done');
