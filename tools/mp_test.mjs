// Two players in one browser context; window.claude.use('room'/'user') is mocked with a BroadcastChannel
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 450 } });
await ctx.addInitScript(() => {
  const me = 'p' + Math.random().toString(36).slice(2, 8), bc = new BroadcastChannel('mockroom'), peers = new Map(), ph = [], ch = [];
  let mine = {};
  const snap = () => [...peers.entries()].map(([peer, presence]) => Object.freeze({ peer, by: 'u-' + peer, isMe: peer === me, sameTab: peer === me, kind: 'viewer', guest: false, presence, updatedAt: Date.now() }));
  const fire = () => { const ps = snap(); ph.forEach((f) => f({ peers: ps, joined: [], left: [], updated: [] })); };
  bc.onmessage = (e) => { const m = e.data; if (m.t === 'p') peers.set(m.peer, m.presence); if (m.t === 'bye') peers.delete(m.peer); if (m.t === 'hello' && m.peer !== me) bc.postMessage({ t: 'p', peer: me, presence: mine }); fire(); };
  addEventListener('beforeunload', () => bc.postMessage({ t: 'bye', peer: me }));
  const room = { presence: async (patch) => { mine = { ...mine, ...patch }; peers.set(me, mine); bc.postMessage({ t: 'p', peer: me, presence: mine }); fire(); },
    onPeers: (f) => { ph.push(f); setTimeout(fire, 0); return () => {}; }, onConnection: (f) => { setTimeout(() => f(true), 0); return () => {}; }, peers: snap, connected: () => true, emit: async () => {}, on: () => () => {} };
  const user = { id: async () => 'u-' + me, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: 'Tester ' + i.slice(-3).toUpperCase() }])) };
  window.claude = { use: async (n) => (n === 'room' ? room : n === 'user' ? user : null) };
  setTimeout(() => bc.postMessage({ t: 'hello', peer: me }), 500);
});
const open = async () => { const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('[pageerror]', e.message)); p.on('console', (m) => { if (/multiplayer|error/i.test(m.text())) console.log('[console]', m.text().slice(0, 160)); });
  await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&unlockall&q=low', { timeout: 900000, waitUntil: 'commit' }); await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 }); return p; };
const frames = async (p, n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
const A = await open(), B = await open();
await A.evaluate(() => { window.__bagverse.progress.s.name = 'Alice'; }); await B.evaluate(() => { window.__bagverse.progress.s.name = 'Bob'; });
// B stands 4 m in front of A, A looks at B; B runs, then chats, then rides
const pa = await A.evaluate(() => window.__bagverse.player.root.position.toArray());
await B.evaluate(([x, y, z]) => { const B = window.__bagverse, V = B.player.root.position.constructor; B.player.teleport(new V(x + 2.5, y + 0.1, z + 5)); }, pa);
await A.evaluate(() => { const B = window.__bagverse; B.player.facing = 0; B.player.root.rotation.y = 0; B.cam.yaw = Math.PI; B.cam.pitch = 0.1; });
await frames(B, 4); await frames(A, 6);
console.log('A sees', await A.evaluate(() => [...window.__bagverse.mp.remotes.values()].map((r) => window.__bagverse.mp.displayName(r) + ' skin=' + r.skin + ' at ' + r.pos.toArray().map((v) => v.toFixed(1))).join(' | ')), 'chip:', await A.evaluate(() => document.getElementById('mpchip').textContent));
await B.evaluate(() => window.__bagverse.hud.onSend('gm team!')); await frames(B, 2); await frames(A, 4);
console.log('A chat log tail:', await A.evaluate(() => document.getElementById('chatlog').lastElementChild?.textContent));
await A.screenshot({ path: '/tmp/claude-0/mp_a.png', timeout: 900000 });
await B.evaluate(() => window.__bagverse.summonScooter()); await frames(B, 6); await frames(A, 6);
console.log('A sees ride', await A.evaluate(() => { const r = [...window.__bagverse.mp.remotes.values()][0]; return JSON.stringify({ a: r.p.a, ride: !!r.p.r, board: !!r.board?.visible }); }));
await A.screenshot({ path: '/tmp/claude-0/mp_ride.png', timeout: 900000 });
await B.close(); await frames(A, 6);
console.log('after B left', await A.evaluate(() => window.__bagverse.mp.remotes.size), await A.evaluate(() => document.getElementById('mpchip').textContent));
await b.close(); console.log('done');
