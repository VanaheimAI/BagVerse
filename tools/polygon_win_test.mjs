// A raffle winner of a Courtyard (Polygon) slab: the win pop-up asks for a Polygon wallet, an EIP-6963 wallet (fake,
// signing with a real key via viem) links it, the server checks it; the vault shows the Courtyard badge; Collection loot.
import { chromium } from 'playwright';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
const BASE = 'http://localhost:4175', acct = privateKeyToAccount(generatePrivateKey());
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1100, height: 640 } });
await ctx.exposeFunction('__evmSign', (hexMsg) => acct.signMessage({ message: { raw: hexMsg } }));
await ctx.addInitScript((addr) => {
  const provider = { request: async ({ method, params }) => { if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr]; if (method === 'personal_sign') return window.__evmSign(params[0]); throw new Error('unsupported ' + method); } };
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: { uuid: '1', name: 'Test MetaMask', icon: 'data:image/svg+xml;base64,PHN2Zy8+', rdns: 'io.metamask.test' }, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce); announce();
}, acct.address);
const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('[pageerror]', e.message));
const seed = (t, rows) => fetch(`${BASE}/__fake/t/${t}`, { method: 'POST', body: JSON.stringify(rows) });
await seed('linked_wallets', []); await seed('raffle_entries', []);
await p.goto(BASE + '/?autostart&fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3 && window.__bagverse.raffles.ready', null, { timeout: 900000 });
const uid = await p.evaluate(() => window.__bagverse.raffles.uid);
const now = Date.now();
await seed('raffles', [
  { id: 'kanto-cy', vault: 'kanto', status: 'drawn', entries: 3, draws_at: new Date(now - 60e3).toISOString(), winner_user: uid, winner_name: 'Ada', winner_address: 'SOLADDR', proof: { method: 'manual' },
    prize: { name: 'Charizard Base Set', grader: 'PSA', grade: '9', chain: 'polygon', issuer: 'courtyard', contract: '0x251be3a17af4892035c37ebf5890f4a4d889dcad', token_id: '58251309559212678585', url: 'https://courtyard.io/asset/x' } },
  { id: 'kanto-open', vault: 'kanto', status: 'open', entries: 0, min_level: 0, draws_at: new Date(now + 86400e3).toISOString(), prize: { name: 'Blastoise', grader: 'PSA', grade: '10', chain: 'polygon', issuer: 'courtyard', contract: '0x251be3a17af4892035c37ebf5890f4a4d889dcad', token_id: '123456789012345' } }]);
await p.evaluate(() => { localStorage.removeItem('bv_raffle_seen'); window.__bagverse.raffles.refresh(); });
await p.waitForFunction('document.getElementById("mtitle")?.textContent.includes("YOU WON")', null, { timeout: 60000, polling: 300 });
console.log('win modal:', await p.evaluate(() => document.getElementById('mbody').textContent.replace(/\s+/g, ' ').trim()));
await p.screenshot({ path: '/tmp/claude-0/poly_win.png', timeout: 600000 });
await p.click('#rf-poly'); await p.waitForTimeout(300);
console.log('picker:', await p.evaluate(() => [...document.querySelectorAll('.wl-w')].map((e) => e.textContent).join(', ')));
await p.click('[data-ev="0"]'); await p.waitForFunction('document.getElementById("modal").hidden', null, { timeout: 60000 });
console.log('toast:', await p.textContent('#toast'));
const rows = await (await fetch(BASE + '/__fake/t/linked_wallets')).json();
console.log('server row:', rows.map((r) => `${r.user_id === uid ? 'me' : r.user_id}:${r.chain}:${r.address}`).join(' '), '| matches key:', rows[0]?.address === acct.address);
// vault: Courtyard badge + token row
await p.evaluate(() => window.__bagverse.openVault('apex_arena', 'KANTO VAULT')); await p.waitForTimeout(300);
console.log('vault:', await p.evaluate(() => [...document.querySelectorAll('#mbody .rwa-k, #mbody .row')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
await p.screenshot({ path: '/tmp/claude-0/poly_vault.png', timeout: 600000 });
// collection loot
await p.evaluate(() => { document.getElementById('mclose').click(); window.__bagverse.openCollection(); }); await p.waitForTimeout(800);
await p.evaluate(() => window.__bagverse.skins.select('card:kanto-cy')); await p.waitForTimeout(1500);
console.log('loot:', await p.textContent('#sk-name'), '|', await p.textContent('#sk-desc'), '| button:', await p.evaluate(() => { const u = document.getElementById('sk-use'); return u.hidden ? '(none)' : u.textContent; }));
await p.screenshot({ path: '/tmp/claude-0/poly_loot.png', timeout: 600000 });
await b.close(); console.log('done');
