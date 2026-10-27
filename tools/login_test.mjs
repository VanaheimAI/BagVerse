// Login screen + X sign-in + cloud save, on the fake Supabase (tools/fake-supabase.js simulates X's redirects):
//   guest plays to Lv 7 -> Sign in with X links the account (name = X handle, cloud save written)
//   -> a "new device" (fresh guest, Lv 1) signs in with the same X -> lands on that account with Lv 7 restored.
import { chromium } from 'playwright';
const BASE = 'http://localhost:4175';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 810 } });
const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('[pageerror]', e.message));
const loginUp = () => p.waitForFunction(() => { const l = document.getElementById('login'); return l && !l.hidden && document.getElementById('lg-body')?.children.length; }, null, { timeout: 900000, polling: 300 });
const state = () => p.evaluate(() => { const B = window.__bagverse; return `uid=${sessionStorage.getItem('fake.uid')} lv=${B?.progress.s.level} name=${B?.progress.s.name} | buttons: ${[...document.querySelectorAll('#lg-body button')].map((x) => x.textContent.trim()).join(' / ')} | err: ${document.getElementById('lg-err')?.hidden ? '-' : document.getElementById('lg-err')?.textContent}`; });
await p.goto(BASE + '/?fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' });
await loginUp(); await p.waitForTimeout(800);
console.log('1 fresh guest:', await state());
await p.screenshot({ path: '/tmp/claude-0/login_desktop.png', timeout: 600000 });
await p.evaluate(() => document.getElementById('lg-guest').click()); await p.waitForFunction(() => window.__bagverse?.skins.isOpen, null, { timeout: 60000 });
console.log('  guest -> skin screen open');
await p.evaluate(() => { const P = window.__bagverse.progress; P.s.level = 7; P.s.totalXp = 4200; P.s.name = 'GuestPlayer'; P.s.nameSet = false; P.save(); });
// in-game X button reopens the login screen; sign in
await p.evaluate(() => { window.__bagverse.skins.closeNow?.(); document.getElementById('hud').hidden = false; });
console.log('  hud X button:', await p.evaluate(() => { const x = document.getElementById('xbtn'); return x.hidden ? 'hidden' : x.textContent; }));
await p.evaluate(() => document.getElementById('xbtn').click()); await loginUp();
await Promise.all([p.waitForNavigation({ timeout: 900000, waitUntil: 'commit' }), p.evaluate(() => document.getElementById('lg-x').click())]);
await loginUp(); await p.waitForTimeout(500);
console.log('2 after linking X:', await state());
console.log('  cloud save:', await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('fake.saves') || '{}'); return Object.values(s).map((r) => `${r.user_id} lv${r.level}`).join(', ') || 'none'; }));
await p.screenshot({ path: '/tmp/claude-0/login_signedin.png', timeout: 600000 });
// "new device": fresh guest at Lv 1 (same fake X account)
await p.goto(BASE + '/terms.html');   // leave the game (it saves on the way out), then wipe this "device"
await p.evaluate(() => { sessionStorage.clear(); const s = JSON.parse(localStorage.getItem('bagverse.skin')); s.level = 1; s.totalXp = 0; s.name = 'NewDevice'; s.nameSet = true; localStorage.setItem('bagverse.skin', JSON.stringify(s)); });
await p.goto(BASE + '/?fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' }); await loginUp(); await p.waitForTimeout(500);
console.log('3 new device guest:', await state());
await p.evaluate(() => document.getElementById('lg-x').click());
await p.waitForFunction(() => { const B = window.__bagverse; return B && B.progress.s.level === 7 && !document.getElementById('login').hidden && document.getElementById('lg-go'); }, null, { timeout: 900000, polling: 500 });
console.log('4 after signing in on new device:', await state());
// phone layout
const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await m.goto(BASE + '/?fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' });
await m.waitForFunction(() => !document.getElementById('login')?.hidden && document.getElementById('lg-body')?.children.length, null, { timeout: 900000, polling: 300 }); await m.waitForTimeout(800);
await m.screenshot({ path: '/tmp/claude-0/login_phone.png', timeout: 600000 });
await b.close(); console.log('done');
