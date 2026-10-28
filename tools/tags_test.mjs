// Spray Spots end to end on the fake Supabase + the real api/tag.js (tools/wallet_server.mjs):
// alice (X, Lv 9) tags a wall -> share card; bob sprays over it after the lock -> alice's "sprayed over" inbox.
//   build: FAKE_SUPABASE=1 VITE_SUPABASE_URL=x VITE_SUPABASE_ANON_KEY=y npx vite build --outDir /tmp/dist-fake
//   node tools/wallet_server.mjs /tmp/dist-fake 4175 &  node tools/tags_test.mjs [outDir]
import fs from 'node:fs';
import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp/tags_test'; fs.mkdirSync(out, { recursive: true });
const base = 'http://localhost:4175';
const post = (p, b) => fetch(base + p, { method: 'POST', body: JSON.stringify(b) });
await post('/__fake/t/tags', []); await post('/__fake/t/tag_log', []); await post('/__fake/t/tag_reports', []); await post('/__fake/now', {});
await post('/__fake/t/saves', [{ user_id: 'alice', level: 9 }, { user_id: 'bob', level: 14 }]);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function player(uid, handle) {
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.addInitScript(([uid, handle]) => { if (!sessionStorage.getItem('fake.uid')) { sessionStorage.setItem('fake.uid', uid); localStorage.setItem('fake.xhandle', handle);
    sessionStorage.setItem('fake.x', JSON.stringify({ provider: 'x', provider_id: 'x-' + handle, identity_data: { user_name: handle, full_name: handle, avatar_url: '' } })); } }, [uid, handle]);
  const p = await ctx.newPage(); p.on('pageerror', (e) => console.log(`[${uid} pageerror]`, e.message)); p.on('console', (m) => { if (/tags:|error/i.test(m.text())) console.log(`[${uid}]`, m.text()); });
  await p.goto(base + '/?autostart&fixeddt=0.1&q=low', { timeout: 900000, waitUntil: 'commit' });
  await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
  await p.evaluate(() => { const B = window.__bagverse; B.progress.s.level = 9; B.progress.save(); });
  return p;
}
const frames = async (p, n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
const spot = 'swamp_1';
const goTo = (p) => p.evaluate((id) => window.__bagverse.tags.arrive(id), spot);
const prompt = (p) => p.evaluate(() => document.getElementById('prompt').textContent);

const A = await player('alice', 'alice');
await A.waitForFunction('window.__bagverse.tags.enabled && window.__bagverse.tags.lastFetch > 0', null, { timeout: 60000 });
await goTo(A); await frames(A, 6);
console.log('alice prompt:', await prompt(A));
await A.keyboard.press('KeyE'); await frames(A, 2);
console.log('alice modal:', await A.evaluate(() => document.getElementById('mtitle').textContent), '| button:', await A.evaluate(() => document.getElementById('tg-go')?.textContent));
await A.evaluate(() => { document.querySelector('[data-f="block"]').click(); document.querySelector('[data-c="1"]').click(); });
await A.screenshot({ path: `${out}/1_spray_card.png` });
await A.evaluate(() => document.getElementById('tg-go').click());
console.log('no consent ->', await A.evaluate(() => document.getElementById('tg-err').textContent));
await A.evaluate(() => { document.getElementById('tg-ok').checked = true; document.getElementById('tg-go').click(); });
await frames(A, 6); await A.screenshot({ path: `${out}/2_spraying.png` });
await A.waitForFunction(() => document.querySelector('.tg-card'), null, { timeout: 120000 });
await frames(A, 2); await A.screenshot({ path: `${out}/3_share_modal.png` });
const card = await A.evaluate(async () => { const im = document.querySelector('.tg-card'); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); return c.toDataURL('image/png'); });
fs.writeFileSync(`${out}/4_card.png`, Buffer.from(card.split(',')[1], 'base64'));
console.log('toast/state:', await A.evaluate(() => { const B = window.__bagverse; const r = B.tags.rows.get('swamp_1'); return { owner: r?.owner, handle: r?.handle, xp: B.progress.s.totalXp, share: B.tags.shareText }; }));
// the X intent the share button opens (desktop: no file share)
await A.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; document.getElementById('tg-share').click(); });
await frames(A, 3); console.log('intent:', await A.evaluate(() => window.__opened[0]));
await A.evaluate(() => window.__bagverse.hud.closeModal());
await A.evaluate(() => { const B = window.__bagverse; B.camera.position; window.__camOverride = null; });
await frames(A, 4); await A.screenshot({ path: `${out}/5_wall_after.png` });

// bob: locked for 10 minutes, then sprays over
const Bp = await player('bob', 'bob');
await Bp.waitForFunction('window.__bagverse.tags.rows.size > 0', null, { timeout: 60000 });
await goTo(Bp); await frames(Bp, 6);
console.log('bob prompt (locked):', await prompt(Bp));
await post('/__fake/now', { now: Date.now() + 11 * 60e3 });
await Bp.evaluate(() => { const r = window.__bagverse.tags.rows.get('swamp_1'); r.sprayed_at = new Date(Date.now() - 11 * 60e3).toISOString(); });
console.log('bob prompt (unlocked):', await prompt(Bp));
await Bp.keyboard.press('KeyE'); await frames(Bp, 2);
await Bp.evaluate(() => { const ok = document.getElementById('tg-ok'); if (ok) ok.checked = true; document.querySelector('[data-f="drip"]').click(); document.querySelector('[data-c="3"]').click(); document.getElementById('tg-go').click(); });
await Bp.waitForFunction(() => document.querySelector('.tg-card'), null, { timeout: 120000 });
const card2 = await Bp.evaluate(async () => { const im = document.querySelector('.tg-card'); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); return c.toDataURL('image/png'); });
fs.writeFileSync(`${out}/6_card_overwrite.png`, Buffer.from(card2.split(',')[1], 'base64'));
console.log('bob share text:', await Bp.evaluate(() => window.__bagverse.tags.shareText));
// alice gets the inbox on her next refresh
await A.evaluate(() => window.__bagverse.tags.refresh(true));
await A.waitForFunction(() => /SPRAYED OVER/.test(document.getElementById('mtitle').textContent) && !document.getElementById('modal').hidden, null, { timeout: 30000 }).catch(() => {});
console.log('alice inbox:', await A.evaluate(() => document.getElementById('mtitle').textContent + ' | ' + document.getElementById('mbody').innerText.slice(0, 120)));
await A.screenshot({ path: `${out}/7_inbox.png` });
console.log('minimap marks:', await A.evaluate(() => window.__bagverse.tags.marks().filter((m) => m.color !== '#ffffff').length));
await b.close(); console.log('done');
