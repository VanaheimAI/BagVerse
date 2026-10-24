// Solana wallet connect with fake Wallet Standard wallets (real Ed25519 keys via WebCrypto, so signatures are checked).
// Build: FAKE_SUPABASE=1 VITE_SUPABASE_URL=x VITE_SUPABASE_ANON_KEY=y VITE_TEST_GATES='[{"skin":"pepe","collection":"TESTCOLL","label":"Hold a Test Pepe NFT"}]' npx vite build --outDir /tmp/dist-wallet
// Serve (real api/wallet handlers, fake table + RPC): TEST_GATES='<same json>' node tools/wallet_server.mjs /tmp/dist-wallet 4175
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const FAKE = () => {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const b58 = (bytes) => { let z = 0; while (z < bytes.length && !bytes[z]) z++; const d = []; for (const x of bytes) { let c = x; for (let i = 0; i < d.length; i++) { c += d[i] * 256; d[i] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } } return '1'.repeat(z) + d.reverse().map((x) => A[x]).join(''); };
  const icon = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="6" fill="#ab9ff2"/></svg>');
  window.__fakeLog = [];
  const make = async (name, withSignIn) => {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    const account = { address: b58(pub), publicKey: pub, chains: ['solana:mainnet'], features: ['solana:signMessage'] };
    const w = { version: '1.0.0', name, icon, chains: ['solana:mainnet'], accounts: [], approved: false, reject: false,
      features: {
        'standard:connect': { version: '1.0.0', connect: async ({ silent } = {}) => { window.__fakeLog.push(name + ':connect' + (silent ? ':silent' : '')); if (silent && !w.approved) return { accounts: [] }; if (w.reject) throw Object.assign(new Error('User rejected the request.'), { code: 4001 }); w.approved = true; w.accounts = [account]; return { accounts: w.accounts }; } },
        'standard:disconnect': { version: '1.0.0', disconnect: async () => { window.__fakeLog.push(name + ':disconnect'); w.accounts = []; } },
        'standard:events': { version: '1.0.0', on: () => () => {} },
        'solana:signMessage': { version: '1.0.0', signMessage: async (...ins) => { window.__fakeLog.push(name + ':signMessage'); if (w.reject) throw new Error('User rejected'); return Promise.all(ins.map(async (i) => ({ signedMessage: i.message, signature: new Uint8Array(await crypto.subtle.sign('Ed25519', kp.privateKey, i.message)) }))); } },
      } };
    if (withSignIn) w.features['solana:signIn'] = { version: '1.0.0', signIn: async (...ins) => { window.__fakeLog.push(name + ':signIn'); w.approved = true; w.accounts = [account];
      return Promise.all(ins.map(async (i) => { const msg = new TextEncoder().encode(`${i.domain} wants you to sign in with your Solana account:\n${account.address}\n\n${i.statement}\n\nURI: ${i.uri}\nVersion: 1\nChain ID: ${i.chainId}\nNonce: ${i.nonce}\nIssued At: ${i.issuedAt}${i.requestId ? `\nRequest ID: ${i.requestId}` : ''}`);
        return { account, signedMessage: msg, signature: new Uint8Array(await crypto.subtle.sign('Ed25519', kp.privateKey, msg)), signatureType: 'ed25519' }; })); } };
    w.verify = async (message, sigB58) => { const s = [...sigB58].reduce((n, ch) => n * 58n + BigInt(A.indexOf(ch)), 0n); const bytes = new Uint8Array(64); let v = s; for (let i = 63; i >= 0; i--) { bytes[i] = Number(v & 255n); v >>= 8n; } return crypto.subtle.verify('Ed25519', kp.publicKey, bytes, new TextEncoder().encode(message)); };
    return w;
  };
  // the same names and keys survive a reload only within this page's life, so keep keys per tab in sessionStorage is overkill: tests re-approve
  (async () => {
    const ws = [await make('Phantom Test', false), await make('SignIn Test', true)]; window.__fakeWallets = ws;
    for (const w of ws) {
      const cb = ({ register }) => register(w);
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: cb }));
      window.addEventListener('wallet-standard:app-ready', ({ detail }) => cb(detail));
    }
  })();
};

const URL0 = 'http://localhost:4175/?autostart&fixeddt=0.1&q=low';
const ctx = await b.newContext({ viewport: { width: 1200, height: 675 } });
await ctx.addInitScript(FAKE);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (/wallet|error/i.test(m.text()) && !/favicon/.test(m.text())) console.log('[console]', m.text().slice(0, 160)); });
const go = async () => { await p.goto(URL0, { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3 && window.__bagverse.wallet.ready', null, { timeout: 900000 }); };
const st = () => p.evaluate(() => { const W = window.__bagverse.wallet; return `${W.status} skins=${JSON.stringify(W.skins)} pepeOwned=${window.__bagverse.skins.skin('pepe').owned}`; });
const rows = () => p.evaluate(() => fetch('/__fake/wallets').then((r) => r.json()).then((r) => r.map((x) => `${x.user_id}:${x.address.slice(0, 6)}:[${x.skins}]`).join(' ')));
const shot = (n) => p.screenshot({ path: `/tmp/claude-0/${n}.png`, timeout: 600000 });
await go();
await p.evaluate(() => { const B = window.__bagverse; B.progress.s.name = 'Ada'; B.progress.s.nameSet = true; });
console.log('start:', await st(), '| pepe lock:', await p.evaluate(() => window.__bagverse.skins.skin('pepe').lock));
await p.click('#walletbtn'); await p.waitForTimeout(300);
console.log('wallets:', await p.$$eval('.wl-w', (els) => els.map((e) => e.textContent.trim())));
await p.evaluate(() => { window.__fakeWallets[0].reject = true; });
await p.click('[data-wi="0"]'); await p.waitForTimeout(400);
console.log('reject ->', await p.textContent('.wl-err'));
await p.evaluate(() => { window.__fakeWallets[0].reject = false; });
await p.click('[data-wi="0"]'); await p.waitForFunction('window.__bagverse.wallet.status === "verified" || window.__bagverse.wallet.status === "signed"', null, { timeout: 60000 })
  .catch(async () => { console.log('STUCK:', await p.evaluate(() => { const W = window.__bagverse.wallet; return JSON.stringify({ st: W.status, err: W.error, linked: !!W.linked, log: window.__fakeLog, werr: document.querySelector('.wl-err')?.textContent }); })); process.exit(1); });
const L = await p.evaluate(() => window.__bagverse.wallet.linked);
console.log('after connect:', await st(), '| err:', await p.evaluate(() => window.__bagverse.wallet.error), '| server rows:', await rows());
console.log('message has Request ID:', /Request ID: uid-/.test(L.message), '| lb w:', await p.evaluate(async () => { const B = window.__bagverse; return (await B.lb.db.doc('lb/' + B.lb.uid).get()).data()?.w?.slice(0, 6); }));
console.log('modal:', await p.$$eval('#mbody .row', (r) => r.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
await shot('wallet_verified');
// buy the NFT -> refresh holdings
await p.evaluate((a) => fetch('/__fake/owned', { method: 'POST', body: JSON.stringify({ [a]: [{ id: 'nft1', grouping: [{ group_key: 'collection', group_value: 'TESTCOLL' }] }] }) }), L.address);
await p.click('[data-w=refresh]'); await p.waitForFunction('window.__bagverse.wallet.skins.length > 0', null, { timeout: 60000 });
console.log('after buying:', await st(), '| modal holder row:', await p.$$eval('#mbody .row', (r) => r.at(-1).textContent.replace(/\s+/g, ' ').trim()));
await p.evaluate(async () => { document.getElementById('mclose').click(); const S = window.__bagverse.skins; await S.loadChar('pepe'); S.onEquip('pepe'); });
console.log('wearing before reload:', await p.evaluate(() => window.__bagverse.skins.getEquipped()));
// reload: verified wallet + holder skin come back from the server
await go(); await p.waitForTimeout(800);
console.log('after reload:', await st(), '| wearing:', await p.evaluate(() => window.__bagverse.skins.getEquipped()));
// sell the NFT -> next load takes the skin off
await p.evaluate(() => fetch('/__fake/owned', { method: 'POST', body: '{}' }));
await go(); await p.waitForFunction('window.__bagverse.wallet.skins.length === 0', null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(500);
console.log('after selling:', await st(), '| wearing:', await p.evaluate(() => window.__bagverse.skins.getEquipped()), '| toast:', await p.textContent('#toast'));
// locked holder skin in the skin screen
await p.evaluate(() => { const S = window.__bagverse.skins; S.open(); S.select('pepe'); }); await p.waitForTimeout(500);
console.log('skin screen pepe button:', await p.textContent('#sk-equip'));
await shot('wallet_holder_locked');
await p.evaluate(() => window.__bagverse.skins.close()); await p.waitForTimeout(300);
// disconnect: row removed on the server
await p.click('#walletbtn'); await p.waitForTimeout(300); await p.click('[data-w=off]'); await p.waitForTimeout(800);
console.log('after disconnect:', await st(), '| server rows:', JSON.stringify(await rows()), '| btn:', await p.textContent('#walletbtn'));
// SIWS wallet path
await p.click('#walletbtn'); await p.waitForTimeout(300); await p.click('[data-wi="1"]');
await p.waitForFunction('["verified","signed"].includes(window.__bagverse.wallet.status)', null, { timeout: 60000 });
console.log('signIn wallet:', await st(), '| server rows:', await rows());
await shot('wallet_siws');

// phone with no wallet: deep links
const ph = await (await b.newContext({ ...devices['iPhone 11 Pro'] })).newPage();
ph.on('pageerror', (e) => console.log('[phone pageerror]', e.message));
await ph.goto(URL0, { timeout: 900000, waitUntil: 'commit' }); await ph.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
await ph.evaluate(() => document.getElementById('hud').classList.add('menu-open')); await ph.waitForTimeout(200);
await ph.screenshot({ path: '/tmp/claude-0/wallet_phone_menu.png', timeout: 600000 });
await ph.click('#walletbtn'); await ph.waitForTimeout(300);
console.log('phone links:', await ph.$$eval('.wl-w', (els) => els.map((e) => e.textContent)));
await b.close(); console.log('done');
