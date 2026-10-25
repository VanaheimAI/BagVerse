// The /admin dashboard in a browser against the real api/admin handlers (tools/wallet_server.mjs on 4175):
// sign in with the admin wallet, create a raffle with an uploaded image, see entries, pick a winner, players, ads.
import { chromium } from 'playwright';
import { FAKE } from './fake-wallets.mjs';
const BASE = 'http://localhost:4175';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const ctx = await b.newContext({ viewport: { width: 1300, height: 860 } }); await ctx.addInitScript(FAKE);
const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('[pageerror]', e.message)); p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '2030-01-05 20:00' : undefined));
const seed = (t, rows) => fetch(`${BASE}/__fake/t/${t}`, { method: 'POST', body: JSON.stringify(rows) });
await seed('raffles', []); await seed('raffle_entries', []); await seed('ad_bookings', []);
await seed('lb', [{ id: 'u1', doc: { n: 'Kobi_Maru', lv: 41, skin: 'kaizokuguy', best: 1820, wins: 3 }, updated_at: new Date().toISOString() }, { id: 'u2', doc: { n: 'Ada', lv: 27, skin: 'witch', best: 600 }, updated_at: new Date(Date.now() - 7200e3).toISOString() }]);
await seed('wallets', [{ user_id: 'u1', address: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', verified_at: new Date().toISOString(), skins: [] }, { user_id: 'u2', address: '7SW11q8XkHtim92uBuh1VDjUW5SELMUqwuLdWyaRbt82', verified_at: new Date().toISOString(), skins: [] }]);
await p.goto(BASE + '/admin.html'); await p.waitForSelector('.wbtn');
const addr = await p.evaluate(async () => { const w = window.__fakeWallets[0]; const { accounts } = await w.features['standard:connect'].connect(); return accounts[0].address; });
// first with the wrong admin wallet
await p.click('.wbtn >> nth=0'); await p.waitForTimeout(500); console.log('wrong wallet:', await p.textContent('.err'));
await fetch(BASE + '/__fake/env', { method: 'POST', body: JSON.stringify({ ADMIN_WALLET: addr }) });
// the page checks the address against the built-in admin wallet first: point it at the fake one for the test
await p.evaluate((a) => { sessionStorage.clear(); }, addr);
await p.addInitScript(() => {}); 
const tokenRes = await p.evaluate(async (a) => { const w = window.__fakeWallets[0]; const { accounts } = await w.features['standard:connect'].connect(); const acc = accounts[0];
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; const b58 = (bytes) => { let z = 0; while (z < bytes.length && !bytes[z]) z++; const d = []; for (const x of bytes) { let c = x; for (let i = 0; i < d.length; i++) { c += d[i] * 256; d[i] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } } return '1'.repeat(z) + d.reverse().map((x) => A[x]).join(''); };
  const message = `BagVerse admin sign-in\nDomain: ${location.host}\nWallet: ${acc.address}\nIssued At: ${new Date().toISOString()}\nNonce: test`;
  const [res] = await w.features['solana:signMessage'].signMessage({ account: acc, message: new TextEncoder().encode(message) });
  const r = await fetch('/api/admin?op=login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: acc.address, message, signature: b58(res.signature) }) }); return r.json(); }, addr);
console.log('server login with the admin key:', tokenRes.token ? 'token ok' : JSON.stringify(tokenRes));
await p.evaluate(([t, a]) => { sessionStorage.setItem('bv_admin', t); sessionStorage.setItem('bv_admin_who', a); }, [tokenRes.token, addr]);
await p.reload(); await p.waitForSelector('#rform'); await p.waitForTimeout(600);
console.log('chips:', await p.textContent('#chips'));
await p.screenshot({ path: '/tmp/claude-0/adm_raffles_empty.png' });
// create a raffle with an uploaded image
await p.fill('#fn', 'Monkey D. Luffy'); await p.fill('#fs', 'One Piece OP13 · Carrying on His Will #118'); await p.fill('#fgr', '10'); await p.fill('#fva', 'Alternate Art'); await p.fill('#fc', '146575703');
await p.setInputFiles('#ff', { name: 'card.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
await p.waitForTimeout(800); console.log('upload:', await p.textContent('#fmsg'), '| image field:', (await p.inputValue('#fi')).slice(0, 60));
await p.click('#fsave'); await p.waitForTimeout(800);
console.log('raffle list:', await p.evaluate(() => [...document.querySelectorAll('.rf')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' || ')));
const rid = (await (await fetch(BASE + '/__fake/t/raffles')).json())[0]?.id;
await seed('raffle_entries', [{ raffle_id: rid, user_id: 'u1', address: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', name: 'Kobi_Maru', created_at: new Date(Date.now() - 60000).toISOString() }, { raffle_id: rid, user_id: 'u2', address: '7SW11q8XkHtim92uBuh1VDjUW5SELMUqwuLdWyaRbt82', name: 'Ada', created_at: new Date().toISOString() }]);
await p.screenshot({ path: '/tmp/claude-0/adm_raffles.png' });
// entries & winners
await p.click('[data-ent]'); await p.waitForSelector('#ebody table'); await p.waitForTimeout(300);
console.log('entries:', await p.evaluate(() => [...document.querySelectorAll('#ebody tbody tr')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
await p.click('[data-win][data-name="Kobi_Maru"]'); await p.waitForTimeout(800);
console.log('winner banner:', await p.evaluate(() => document.querySelector('#ebody .banner')?.textContent.replace(/\s+/g, ' ').trim()));
await p.screenshot({ path: '/tmp/claude-0/adm_entries.png' });
// players
await p.click('[data-t="players"]'); await p.waitForSelector('#pbody table'); await p.waitForTimeout(300);
console.log('players:', await p.evaluate(() => [...document.querySelectorAll('#pbody tbody tr')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
await p.screenshot({ path: '/tmp/claude-0/adm_players.png' });
// ads: a booking from the game, then the admin view
const bk = await (await fetch(BASE + '/api/ads?op=book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slot: 'BB_19', tier: 'totem', name: 'Ada' }) })).json();
console.log('booking:', bk.id, bk.amount, bk.url.slice(0, 70) + '…');
await p.click('[data-t="ads"]'); await p.waitForSelector('#abody table'); await p.waitForTimeout(300);
console.log('ads:', await p.evaluate(() => [...document.querySelectorAll('#abody tbody tr')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
await p.screenshot({ path: '/tmp/claude-0/adm_ads.png' });
await b.close(); console.log('done');
