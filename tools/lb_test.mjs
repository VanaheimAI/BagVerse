// leaderboard with an in-memory mock of the claude.ai db + user capabilities (plus other players seeded)
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 800, height: 450 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (/leaderboard|error/i.test(m.text())) console.log('[console]', m.text().slice(0, 160)); });
await p.addInitScript(() => {
  const store = new Map(), subs = new Set();
  const snapDoc = (path) => ({ id: path.split('/').pop(), exists: store.has(path), data: () => store.get(path), metadata: { fromCache: false, hasPendingWrites: false } });
  const runQ = (q) => { let docs = [...store.keys()].filter((k) => k.startsWith(q.col + '/') && k.split('/').length === q.col.split('/').length + 1).map(snapDoc);
    for (const [f, op, v] of q.w) docs = docs.filter((d) => (op === '==' ? d.data()[f] === v : true));
    if (q.o) docs.sort((a, b2) => (q.o[1] === 'desc' ? -1 : 1) * ((a.data()[q.o[0]] ?? -1e9) - (b2.data()[q.o[0]] ?? -1e9)));
    docs = docs.slice(0, q.l || 1000); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }; };
  const fire = () => subs.forEach((s) => s());
  const Q = (q) => ({ where: (f, op, v) => Q({ ...q, w: [...q.w, [f, op, v]] }), orderBy: (f, d) => Q({ ...q, o: [f, d] }), limit: (n) => Q({ ...q, l: n }), get: async () => runQ(q),
    onSnapshot: (next) => { const s = () => next(runQ(q)); subs.add(s); setTimeout(s, 0); return () => subs.delete(s); }, doc: (id) => D(q.col + '/' + id) });
  const D = (path) => ({ id: path.split('/').pop(), path, get: async () => snapDoc(path), set: async (d) => { store.set(path, JSON.parse(JSON.stringify(d))); fire(); }, update: async (d) => { store.set(path, { ...store.get(path), ...d }); fire(); }, delete: async () => { store.delete(path); fire(); },
    onSnapshot: (next) => { const s = () => next(snapDoc(path)); subs.add(s); setTimeout(s, 0); return () => subs.delete(s); } });
  const db = { doc: D, collection: (c) => Q({ col: c, w: [] }) };
  window.__mockStore = store;
  const user = { id: async () => 'u-me', can: async () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: i === 'u-me' ? 'Me (claude.ai)' : 'Mate ' + i.slice(-1).toUpperCase() }])) };
  window.claude = { use: async (n) => (n === 'db' ? db : n === 'user' ? user : null) };
});
await p.goto('http://localhost:4173/?autostart&fixeddt=0.1&unlockall&q=low', { timeout: 900000 });
await p.waitForFunction('window.__ready && window.__frames > 3', null, { timeout: 900000 });
const frames = async (n) => { const f0 = await p.evaluate('window.__frames'); await p.waitForFunction(`window.__frames > ${f0 + n}`, null, { timeout: 900000, polling: 300 }); };
// seed two teammates for this week (one also has race wins); a stale entry from an old week must not show
await p.evaluate(async () => { const B = window.__bagverse, { weekKey, dayKey } = await import('/src/progression.js').catch(() => ({})); });
await p.evaluate(() => { const lb = window.__bagverse.lb, wk = lb.period.wk, dk = lb.period.dk, db = lb.db;
  db.doc('lb/u-a').set({ n: 'alice', lv: 12, week: wk, wBest: 900, day: dk, dBest: 900, best: 900, runs: 5, wins: 2, wWins: 1, at: 1 });
  db.doc('lb/u-b').set({ n: 'bob', lv: 30, week: wk, wBest: 150, day: 'old', dBest: 2000, best: 2000, runs: 9, wins: 0, wWins: 0, at: 1 });
  db.doc('lb/u-c').set({ n: 'carl', lv: 3, week: 'old-week', wBest: 99999, day: 'old', dBest: 1, best: 99999, runs: 1, wins: 5, wWins: 0, at: 1 }); });
await frames(2);
// a quick solo run: start, collect a few bags, finish
await p.evaluate(() => window.__bagverse.startBagRun2());
await p.waitForFunction('window.__bagverse.bagRun.state === "run"', null, { timeout: 900000, polling: 300 });
for (let i = 0; i < 8; i++) { await p.evaluate(() => { const B = window.__bagverse, q = B.bagRun.nextBag(B.player.body.pos); B.player.teleport(q.clone().setY(q.y + 0.1)); }); await frames(1); }
await p.evaluate(() => { window.__bagverse.bagRun.left = 0.05; }); await frames(4);
console.log('my doc:', await p.evaluate(() => JSON.stringify(window.__mockStore.get('lb/u-me'))));
await p.click('#rr-lb'); await frames(2);
console.log('week board:', await p.evaluate(() => [...document.querySelectorAll('.lb-row')].map((r) => r.textContent).join(' | ')));
await p.screenshot({ path: '/tmp/claude-0/lb_week.png', timeout: 900000 });
await p.click('[data-lb="wins"]'); await frames(1);
console.log('wins board:', await p.evaluate(() => [...document.querySelectorAll('.lb-row')].map((r) => r.textContent).join(' | ')));
await p.click('[data-lb="day"]'); await frames(1);
console.log('day board:', await p.evaluate(() => [...document.querySelectorAll('.lb-row')].map((r) => r.textContent).join(' | ')));
// race win path
await p.evaluate(() => window.__bagverse.lb.submit({ score: null, win: true })); await frames(2);
console.log('after win:', await p.evaluate(() => { const d = window.__mockStore.get('lb/u-me'); return `wins=${d.wins} wWins=${d.wWins} runs=${d.runs}`; }));
await b.close(); console.log('done');
