// Getting off the scooter sends it back to the garage (no abandoned scooter); fast travel while riding
// gets you off first, so your position (and map marker) is where you travelled to, not where the scooter was.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 800, height: 450 } })).newPage(); p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:4175/?autostart&fixeddt=0.1&q=low&unlockall', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
const state = () => p.evaluate(() => { const B = window.__bagverse, s = B.scooter, P = B.player.body.pos; return `riding=${document.getElementById('hud').classList.contains('driving')} scooterVisible=${s.root.visible} summoned=${s.summoned} player=${P.x.toFixed(1)},${P.z.toFixed(1)} scooter=${s.pos.x.toFixed(1)},${s.pos.z.toFixed(1)}`; });
await p.evaluate(() => window.__bagverse.summonScooter()); await frames(3);
console.log('summoned:', await state());
await p.keyboard.down('KeyW'); await frames(25); await p.keyboard.up('KeyW');
console.log('rode:    ', await state());
await p.keyboard.press('KeyE'); await frames(4);
console.log('got off: ', await state());
// ride again, then fast travel
await p.evaluate(() => window.__bagverse.summonScooter()); await frames(3);
await p.evaluate(() => { const B = window.__bagverse, z = B.world.zones.find((x) => x.id === 'doge_park'); B.hud.onTravel(z); }); await frames(6);
console.log('travelled:', await state(), '| zone:', await p.evaluate(() => window.__bagverse.world.zoneAt(window.__bagverse.player.body.pos)?.id));
await b.close(); console.log('done');
