// Collection (inventory) screen: slabs grid, 3D slab on the stand, card + skin items, close-up, phone layout, fades.
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [tag, opts] of [['desk', { viewport: { width: 1376, height: 768 } }], ['phone', { ...devices['iPhone 11 Pro'] }]]) {
  const p = await (await b.newContext(opts)).newPage();
  p.on('pageerror', (e) => console.log(`[${tag} pageerror]`, e.message));
  await p.goto('http://localhost:4173/?autostart&fixeddt=0.05&q=low', { timeout: 900000 });
  await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
  const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 200 }); };
  await p.evaluate(() => { const B = window.__bagverse; B.progress.s.name = 'Kobi_Maru'; B.progress.s.nameSet = true; });
  if (tag === 'desk') { await p.keyboard.press('KeyI'); } else await p.evaluate(() => window.__bagverse.openCollection());
  await frames(3);
  console.log(tag, 'open:', await p.evaluate(() => window.__bagverse.skins.isOpen + ' ' + window.__bagverse.skins.mode), '| title:', await p.textContent('#sk-h1'), '| items:', await p.evaluate(() => window.__bagverse.skins.items.map((x) => x.id + (x.owned ? '' : '(locked)')).join(' ')));
  await p.evaluate(() => { const S = window.__bagverse.skins; S.select('gear:punk'); }); await frames(8);
  console.log(tag, 'card:', await p.textContent('#sk-name'), '|', await p.textContent('#sk-pill'), '| use:', await p.textContent('#sk-use'), '| stats:', await p.evaluate(() => document.getElementById('sk-stats').textContent));
  await p.screenshot({ path: `/tmp/claude-0/col_${tag}_card.png`, timeout: 600000 });
  await p.evaluate(() => { const S = window.__bagverse.skins; S.select('gear:hoverboard'); }); await frames(8);
  await p.screenshot({ path: `/tmp/claude-0/col_${tag}_skin.png`, timeout: 600000 });
  if (tag === 'desk') {
    await p.click('#sk-equip'); await frames(12); console.log('view slab ->', await p.textContent('#sk-equip'));
    await p.screenshot({ path: '/tmp/claude-0/col_desk_zoom.png', timeout: 600000 });
    await p.click('[data-f="loot"]'); await frames(2); console.log('cards filter visible:', await p.evaluate(() => [...document.querySelectorAll('.sk-card:not([hidden])')].map((c) => c.dataset.skin).join(' ')));
    await p.click('#sk-back'); await frames(3); console.log('closed:', !(await p.evaluate(() => window.__bagverse.skins.isOpen)), 'hud shown:', await p.evaluate(() => !document.getElementById('hud').hidden));
    // skin screen still the skin screen
    await p.keyboard.press('KeyK'); await frames(3); console.log('K ->', await p.textContent('#sk-h1'), await p.evaluate(() => document.querySelectorAll('#sk-grid .sk-card:not(.slab-card)').length + ' skin cards'));
    await p.click('#sk-back'); await frames(3);
    // fades on: sample the veil
    await p.evaluate(() => { window.__bagverse.fx.enabled = true; window.__samples = []; const f = document.getElementById('fader'); const t0 = performance.now(); const iv = setInterval(() => { window.__samples.push([Math.round(performance.now() - t0), +getComputedStyle(f).opacity]); if (performance.now() - t0 > 1200) clearInterval(iv); }, 60); window.__bagverse.openCollection(); });
    await p.waitForTimeout(1500);
    console.log('fade samples:', await p.evaluate(() => window.__samples.map(([t, o]) => `${t}:${o.toFixed(2)}`).join(' ')), '| open:', await p.evaluate(() => window.__bagverse.skins.isOpen));
  }
}
await b.close(); console.log('done');
