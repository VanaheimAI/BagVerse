// Billboard rental in the game against the real api/ads + api/admin handlers (tools/wallet_server.mjs on 4175):
// book -> Solana Pay QR -> (fake payment) -> check -> upload own image -> live on the screen -> admin pulls it -> house creatives back.
import { chromium } from 'playwright';
const BASE = 'http://localhost:4175';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await fetch(BASE + '/__fake/t/ad_bookings', { method: 'POST', body: '[]' });
await p.goto(BASE + '/?autostart&fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const open = () => p.evaluate(async () => { const B = window.__bagverse, bb = B.world.billboards.find((x) => x.userData.tier === 'totem'); await B.openAdSlot(bb, 120, B.liveAds.get(bb.userData.slot)); return bb.name; });
const slot = await open(); await p.waitForTimeout(300);
console.log('screen', slot, '|', await p.evaluate(() => [...document.querySelectorAll('#mbody .row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
await p.click('#adbook'); await p.waitForSelector('.adqr img'); await p.waitForTimeout(200);
const bk = await p.evaluate(() => JSON.parse(localStorage.getItem('bv_ads')).pop());
console.log('booked:', bk.id, '| pay link:', bk.url.slice(0, 64) + '…', '| key kept on this device:', !!bk.key);
await p.screenshot({ path: '/tmp/claude-0/ads_qr.png', timeout: 600000 });
await p.click('#adcheck'); await p.waitForTimeout(600); console.log('check before paying:', await p.textContent('#aderr'));
const ref = new URL(bk.url.replace('solana:', 'http://x/')).searchParams.get('reference');
await fetch(BASE + '/__fake/pay', { method: 'POST', body: JSON.stringify({ reference: ref, amount: 120, payer: 'Payer1111111111111111111111111111111111111' }) });
await p.click('#adcheck'); await p.waitForSelector('#adfile', { state: 'attached', timeout: 30000 });
console.log('after paying:', await p.evaluate(() => document.getElementById('adpay').textContent.replace(/\s+/g, ' ').trim().slice(0, 120)));
// a 16:9 test image
const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d'); g.fillStyle = '#ff2bd6'; g.fillRect(0, 0, 640, 360); g.fillStyle = '#fff'; g.font = 'bold 80px sans-serif'; g.fillText('MY AD', 170, 210); return c.toDataURL('image/png').split(',')[1]; });
await p.setInputFiles('#adfile', { name: 'ad.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
await p.waitForFunction('document.getElementById("adpay").textContent.includes("LIVE")', null, { timeout: 60000 });
console.log('uploaded:', await p.textContent('#adpay'));
const row = (await (await fetch(BASE + '/__fake/t/ad_bookings')).json())[0];
console.log('booking row:', row.status, row.payer_address?.slice(0, 6), row.creative_url?.slice(0, 50), 'ends', row.ends_at);
await p.screenshot({ path: '/tmp/claude-0/ads_live.png', timeout: 600000 });
console.log('screen shows it:', await p.evaluate((n) => { const bb = window.__bagverse.world.billboards.find((x) => x.name === n); return bb.userData.creativeUrl || null; }, slot));
// admin pulls it
await fetch(BASE + '/__fake/t/ad_bookings', { method: 'POST', body: JSON.stringify([{ ...row, status: 'pulled', pulled_reason: 'Test veto' }]) });
await p.evaluate(() => document.getElementById('mclose').click());
await open(); await p.waitForTimeout(400);
console.log('advertiser view after pull:', await p.evaluate(() => document.getElementById('mbody').textContent.replace(/\s+/g, ' ').trim().slice(0, 260)));
await b.close(); console.log('done');
