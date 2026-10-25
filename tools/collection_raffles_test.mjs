// Collection → RAFFLES tab: live raffles from both vaults (view only, countdowns, ENTERED badge); GO TO VAULT takes you to the door.
import { chromium } from 'playwright';
const BASE = 'http://localhost:4175';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = +(process.env.W || 1100), H = +(process.env.H || 620);
const p = await (await b.newContext({ viewport: { width: W, height: H }, hasTouch: !!process.env.TOUCH, isMobile: !!process.env.TOUCH })).newPage(); p.on('pageerror', (e) => console.log('[pageerror]', e.message));
const now = Date.now();
await fetch(BASE + '/__fake/t/raffles', { method: 'POST', body: JSON.stringify([
  { id: 'k1', vault: 'kanto', status: 'open', entries: 4, min_level: 0, draws_at: new Date(now + 2 * 86400e3).toISOString(), prize: { name: 'Charizard ex', grader: 'PSA', grade: '10', slot: 1, model: 'https://broken.invalid/missing.glb' } },
  { id: 'k2', vault: 'kanto', status: 'open', entries: 1, min_level: 0, draws_at: new Date(now + 5 * 3600e3).toISOString(), prize: { name: 'Pikachu Illustrator', grader: 'PSA', grade: '9' } },
  { id: 'w1', vault: 'wano', status: 'open', entries: 12, min_level: 5, draws_at: new Date(now + 3 * 86400e3).toISOString(), prize: { name: 'Luffy Gear 5', grader: 'BGS', grade: '9.5' } },
  { id: 'old', vault: 'kanto', status: 'drawn', entries: 9, min_level: 0, draws_at: new Date(now - 86400e3).toISOString(), prize: { name: 'Old prize' } }]) });
await p.goto(BASE + '/?autostart&fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3 && window.__bagverse.raffles.ready', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
await p.evaluate(() => { const B = window.__bagverse; B.progress.s.name = 'Tester'; B.progress.s.nameSet = true; B.raffles.mine.add('k2'); B.openCollection(); });
await p.waitForFunction(() => !document.getElementById('skins').hidden, null, { timeout: 60000 });
console.log('tabs:', await p.evaluate(() => [...document.querySelectorAll('#sk-filters button')].map((b) => b.textContent).join(' | ')));
console.log('ALL shows raffles?', await p.evaluate(() => [...document.querySelectorAll('.raffle-card')].some((c) => !c.hidden)));
await p.evaluate(() => document.querySelector('#sk-filters [data-f="raffles"]').click());
await p.waitForFunction(() => !document.querySelector('.raffle-card .rf-load'), null, { timeout: 120000, polling: 500 }); await frames(3);
console.log('card art:', await p.evaluate(() => [...document.querySelectorAll('.raffle-card')].map((c) => `${c.querySelector(':scope > b').textContent}=${c.classList.contains('gear-card') ? 'model' : 'slab'}`).join(' | ')));
console.log('stand:', await p.evaluate(() => { const S = window.__bagverse.skins; return S.sel + ' -> ' + (S.slab?.userData.gear ? '3D model' : S.slab ? 'slab' : 'none'); }));
console.log('raffle cards:', await p.evaluate(() => [...document.querySelectorAll('.raffle-card')].filter((c) => !c.hidden).map((c) => `${c.querySelector(':scope > b').textContent} [${c.querySelector('.rf-v').textContent}] ${c.querySelector('.rf-cd').textContent}${c.classList.contains('in') ? ' ENTERED' : ''}`).join(' | ')));
console.log('selected:', await p.evaluate(() => `${document.getElementById('sk-name').textContent} · ${document.getElementById('sk-pill').textContent} · button: ${document.getElementById('sk-equip').textContent} · use hidden: ${document.getElementById('sk-use').hidden}`));
console.log('desc:', await p.textContent('#sk-desc'));
await p.evaluate(() => document.querySelector('.raffle-card.in').click()); await frames(2);
console.log('entered desc:', await p.textContent('#sk-desc'));
await p.evaluate(() => document.querySelector('.raffle-card:not(.in)').click()); await frames(6);
await p.screenshot({ path: '/tmp/claude-0/collection_raffles' + (process.env.TOUCH ? '_phone' : '') + '.png', timeout: 600000 });
// wano card → go to vault
console.log('wano raffle hidden (vault coming soon):', await p.evaluate(() => ![...document.querySelectorAll('.raffle-card')].some((c) => c.querySelector('.rf-v').textContent === 'WANO')));
console.log('button:', await p.textContent('#sk-equip'));
await p.evaluate(() => document.getElementById('sk-equip').click());
await p.waitForFunction(() => document.getElementById('skins').hidden, null, { timeout: 60000 }); await frames(8);
console.log('prompt at vault:', await p.textContent('#prompt'));
await b.close(); console.log('done');
