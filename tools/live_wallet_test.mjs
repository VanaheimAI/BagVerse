// Live: connect a fake wallet on the deployed site -> real Supabase auth -> real /api/wallet/verify -> public.wallets.
// node tools/live_wallet_test.mjs [url]
import { chromium } from 'playwright';
import { FAKE } from './fake-wallets.mjs';
const URL0 = (process.argv[2] || 'https://bag-verse-ten.vercel.app/') + '?autostart&q=low';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 560 } });
await ctx.addInitScript(FAKE);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('response', (r) => { if (r.url().includes('/api/wallet')) console.log('API', r.status(), r.url().split('/api/')[1]); });
await p.goto(URL0, { timeout: 900000, waitUntil: 'commit' });
await p.waitForFunction('window.__ready && window.__bagverse?.wallet?.ready', null, { timeout: 900000 });
await p.evaluate(() => { const B = window.__bagverse; B.progress.s.name = 'QA_Wallet'; B.progress.s.nameSet = true; });
const st = () => p.evaluate(() => { const W = window.__bagverse.wallet; return JSON.stringify({ status: W.status, err: W.error, skins: W.skins, addr: W.address?.slice(0, 6) }); });
console.log('start', await st());
await p.evaluate(() => window.__bagverse.openWallet()); await p.waitForTimeout(300);
await p.click('[data-wi="0"]');
await p.waitForFunction('["verified","signed","offline"].includes(window.__bagverse.wallet.status)', null, { timeout: 120000 });
console.log('after connect', await st());
await p.reload({ waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__bagverse?.wallet?.ready', null, { timeout: 900000 });
console.log('after reload', await st());
await p.evaluate(() => window.__bagverse.openWallet()); await p.waitForTimeout(300);
console.log('modal:', await p.$$eval('#mbody .row', (r) => r.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
await p.click('[data-w=off]'); await p.waitForTimeout(1500);
console.log('after disconnect', await st());
await b.close(); console.log('done');
