import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&unlockall&q=low');
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
console.log(await p.evaluate(() => { const B = window.__bagverse, ph = B.world.physics, o = [];
  for (const zid of ['rwa_vault', 'apex_arena']) { const V = B.VAULTS[zid], f = B.vaultFront(zid), V3 = f.constructor, n = new V3(V.front[0], 0, V.front[1]).normalize();
    for (const h of [0.3, 1, 2, 4]) { const org = f.clone().addScaledVector(n, 3); org.y = V.ground + h; o.push(zid + ' h' + h + ' hit ' + ph.raycast(org, n.clone().negate(), 40).toFixed(2)); }
    const vm = B.world.root.parent.getObjectByName('VAULT_' + V.id); o.push('mesh ' + (vm && vm.position.toArray().map((v) => v.toFixed(1)) + ' s' + vm.scale.x));
    o.push('ground at centre ' + ph.groundAt(V.centre[0], V.centre[1], 60).toFixed(2));
  }
  return o.join('\n'); }));
await b.close();
