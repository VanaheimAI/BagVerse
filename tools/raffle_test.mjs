// Vault raffles in the browser against the real api/* handlers (tools/wallet_server.mjs on 4175, FAKE_SUPABASE build):
// see the prize, connect a wallet, enter, the draw, the win pop-up and the winner line in chat.
import { chromium } from 'playwright';
import { FAKE } from './fake-wallets.mjs';
const BASE = 'http://localhost:4175';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1100, height: 620 } });
await ctx.addInitScript(FAKE);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (/raffle|error/i.test(m.text()) && !/favicon/.test(m.text())) console.log('[console]', m.text().slice(0, 160)); });
const seed = (t, rows) => fetch(`${BASE}/__fake/t/${t}`, { method: 'POST', body: JSON.stringify(rows) });
const now = Date.now();
await seed('raffle_entries', []); await seed('wallets', []);
await seed('raffles', [
  { id: 'wano-t', vault: 'wano', prize: { name: 'Monkey D. Luffy', set: 'One Piece OP13 · Carrying on His Will #118', grader: 'PSA', grade: '10', cert: '146575703', mint: 'inuRTqXX15NQAS48xZaHgFT4tCV4kdwrHisUhBkTZdD', url: 'https://collectorcrypt.com/assets/solana/inuRTqXX15NQAS48xZaHgFT4tCV4kdwrHisUhBkTZdD' }, min_level: 0, draws_at: new Date(now + 3 * 3600e3).toISOString(), status: 'open', entries: 0 },
  { id: 'kanto-old', vault: 'kanto', prize: { name: 'Charizard Base Set', grader: 'PSA', grade: '9' }, min_level: 0, draws_at: new Date(now - 3600e3).toISOString(), status: 'drawn', entries: 4, winner_name: 'Misty', winner_address: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', winner_user: 'someone', proof: { method: 'solana-block', slot: 312345678, blockhash: 'H' } },
  { id: 'kanto-2', vault: 'kanto', prize: { name: 'Graded Pokémon card · TBA' }, min_level: 100, draws_at: new Date(now + 6 * 86400e3).toISOString(), status: 'open', entries: 0 },
]);
const go = async () => { await p.goto(BASE + '/?autostart&fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3 && window.__bagverse.raffles.ready && window.__bagverse.wallet.ready', null, { timeout: 900000 }); };
await go();
await p.evaluate(() => { const B = window.__bagverse; B.progress.s.name = 'Ada'; B.progress.s.nameSet = true; });
console.log('chat:', await p.evaluate(() => [...document.querySelectorAll('#chatlog > *')].map((e) => e.textContent).filter((t) => /won/.test(t)).join(' / ')));
const vault = async (zid) => { await p.evaluate((z) => { document.getElementById('mclose')?.click(); window.__bagverse.openVault(z, z === 'rwa_vault' ? 'WANO VAULT' : 'KANTO VAULT'); }, zid); await p.waitForTimeout(300);
  return p.evaluate(() => document.getElementById('mtitle').textContent + ' | ' + [...document.querySelectorAll('#mbody .row, #mbody button')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')); };
console.log('wano before:', await vault('rwa_vault'));
await p.screenshot({ path: '/tmp/claude-0/rf_wano.png', timeout: 600000 });
console.log('kanto:', await vault('apex_arena'));
await p.screenshot({ path: '/tmp/claude-0/rf_kanto.png', timeout: 600000 });
// connect from the vault button, then enter
await vault('rwa_vault'); await p.click('#rf-wallet'); await p.waitForTimeout(300); await p.click('[data-wi="0"]');
await p.waitForFunction('window.__bagverse.wallet.status === "verified"', null, { timeout: 60000 });
console.log('wano with wallet:', await vault('rwa_vault'));
await p.click('#rf-enter'); await p.waitForFunction('document.querySelector(".rf-in")', null, { timeout: 60000 });
console.log('wano entered:', await p.evaluate(() => [...document.querySelectorAll('#mbody .row, #mbody button')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')), '| toast:', await p.textContent('#toast'));
await p.screenshot({ path: '/tmp/claude-0/rf_entered.png', timeout: 600000 });
console.log('server entries:', JSON.stringify(await (await fetch(BASE + '/__fake/t/raffle_entries')).json()));
// draw time passes: the game asks the server to draw, then shows the win
const rs = await (await fetch(BASE + '/__fake/t/raffles')).json(); rs[0].draws_at = new Date(Date.now() - 1000).toISOString(); await seed('raffles', rs);
await p.evaluate(() => { document.getElementById('mclose')?.click(); window.__bagverse.raffles.refresh(); });
await p.waitForFunction('document.getElementById("mtitle").textContent.includes("YOU WON")', null, { timeout: 120000, polling: 500 });
console.log('win:', await p.evaluate(() => document.getElementById('mtitle').textContent + ' | ' + document.getElementById('mbody').textContent.replace(/\s+/g, ' ').trim().slice(0, 200)));
await p.screenshot({ path: '/tmp/claude-0/rf_win.png', timeout: 600000 });
console.log('raffle row:', JSON.stringify((await (await fetch(BASE + '/__fake/t/raffles')).json())[0]).slice(0, 300));
// reload: not shown twice; the vault shows the last draw
await go(); await p.waitForTimeout(800);
console.log('after reload modal open?', await p.evaluate(() => !document.getElementById('modal').hidden && document.getElementById('mtitle').textContent));
console.log('wano after draw:', await vault('rwa_vault'));
await b.close(); console.log('done');
