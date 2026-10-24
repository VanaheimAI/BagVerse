import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 800, height: 450 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (/vault|failed|error/i.test(m.text())) console.log('[console]', m.text().slice(0, 200)); });
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&unlockall&q=' + (process.argv[2] || 'low'));
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
console.log(await p.evaluate(() => window.__bagverse.world.zones.filter((z) => ['rwa_vault', 'apex_arena'].includes(z.id)).map((z) => z.id + '=' + z.label).join(', ')));
console.log('kanto kiosk', await p.evaluate(() => { const k = window.__bagverse.collect.kiosks.find((k) => k.id === 'k_apex'); return k ? k.name + ' @ ' + k.pos.toArray().map((v) => v.toFixed(1)) : 'none'; }));
for (const [tag, zid, back] of [['kanto2', 'apex_arena', 20], ['kanto3', 'apex_arena', 8]]) {
  // stand out front, look at the door
  await p.evaluate(([zid, back]) => { const B = window.__bagverse, V = B.VAULTS[zid], f = B.vaultFront(zid), n = new f.constructor(V.front[0], 0, V.front[1]).normalize();
    const s = f.clone().addScaledVector(n, back); s.y = B.world.physics.groundAt(s.x, s.z, V.ground + 3) + 0.1; B.player.teleport(s); B.player.facing = Math.atan2(-n.x, -n.z); B.player.root.rotation.y = B.player.facing; B.cam.yaw = B.player.facing + Math.PI; B.cam.pitch = 0.12; B.cam.dist = 7; }, [zid, back]);
  await frames(5); await p.screenshot({ path: `/tmp/claude-0/v_${tag}.png`, timeout: 900000 });
  // walk into the door for 4 s: must stop at the facade, and the E prompt must show
  const r = await p.evaluate(async ([zid]) => { const B = window.__bagverse, V = B.VAULTS[zid], f = B.vaultFront(zid), n = new f.constructor(V.front[0], 0, V.front[1]).normalize();
    const s = f.clone().addScaledVector(n, 3); s.y = B.world.physics.groundAt(s.x, s.z, V.ground + 2) + 0.1; B.player.teleport(s);
    for (let i = 0; i < 160; i++) { B.player.body.vel.x = -n.x * 5; B.player.body.vel.z = -n.z * 5; for (let k = 0; k < 4; k++) B.world.physics.step(B.player.body, 0.025 / 4); }
    const P = B.player.body.pos; return { at: P.toArray().map((v) => v.toFixed(2)).join(','), intoFacade: ((P.x - f.x) * -n.x + (P.z - f.z) * -n.z).toFixed(2) }; }, [zid]);
  await frames(3);
  console.log(tag, JSON.stringify(r), 'prompt:', await p.evaluate(() => document.getElementById('prompt').textContent));
}
await p.evaluate(() => { const B = window.__bagverse, f = B.vaultFront('apex_arena'); B.player.teleport(f.clone().setY(f.y + 0.2)); }); await frames(3);
console.log('prompt at kanto door', await p.evaluate(() => document.getElementById('prompt').textContent));
await p.keyboard.press('KeyE'); await frames(2);
console.log('modal', await p.evaluate(() => document.getElementById('mtitle').textContent));
await p.screenshot({ path: '/tmp/claude-0/v_modal.png', timeout: 900000 });
await b.close(); console.log('done');
