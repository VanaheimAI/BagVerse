// Shared Bag Run leaderboard on the claude.ai artifact `db` capability.
// One document per player at `lb/<their user id>` (rules: everyone reads `lb`, each viewer writes only their own
// `lb/{self}`; view-only viewers read but cannot post). Fields:
//   n (in-game name, display fallback), skin, lv, week, wBest, wAt, day, dBest, best, runs, wins, wWins, at
// The week / day fields say which period wBest / dBest belong to; the boards query the current period, so a new
// week starts empty without anyone resetting anything. Names shown are resolved from the user capability
// (profiles by id), falling back to `n`. Scores are self-reported by each player's page: fine for a team board,
// not for prizes (that needs a server that replays runs).
import { weekKey, dayKey } from './progression.js';
import { use } from './net.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// verified Solana wallet address (proof lives server-side in public.wallets), null when none
const walletFields = (L) => ({ w: L.wallet?.address ? String(L.wallet.address).slice(0, 44) : null, wp: undefined });
const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1e7, v)) : 0);

export class Leaderboard {
  constructor({ hud, getLocal }) {
    Object.assign(this, { hud, getLocal });
    this.db = null; this.uid = null; this.canWrite = null; this.rows = { week: [], day: [], wins: [] }; this.mine = null; this.names = {};
    this.queue = Promise.resolve(); this.listeners = new Set();
  }

  async init() {
    const [db, user] = await Promise.all([use('db').catch(() => null), use('user').catch(() => null)]);
    if (!db) return false;
    this.db = db; this.user = user;
    this.uid = user ? await user.id().catch(() => null) : null;
    try { this.canWrite = user?.can ? await user.can('data.write') : null; } catch (_) { this.canWrite = null; }
    this.subscribe();
    if (this.uid) db.doc('lb/' + this.uid).onSnapshot((s) => { this.mine = s.exists ? s.data() : null; this.onMine?.(this.mine); }, () => {});
    console.log('leaderboard: db ready', this.canWrite === false ? '(read-only)' : '');
    return true;
  }
  subscribe() {
    this.unsub?.forEach((u) => u());
    const col = this.db.collection('lb'), wk = weekKey(), dk = dayKey();
    this.period = { wk, dk };
    const on = (key) => (snap) => { this.rows[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() })); this.resolveNames(); this.changed(); };
    const err = () => {};
    this.unsub = [
      col.where('week', '==', wk).orderBy('wBest', 'desc').limit(25).onSnapshot(on('week'), err),
      col.where('day', '==', dk).orderBy('dBest', 'desc').limit(25).onSnapshot(on('day'), err),
      col.where('wins', '>', 0).orderBy('wins', 'desc').limit(25).onSnapshot(on('wins'), err),   // only players with a win
    ];
  }
  /** call now and then: re-subscribes when the day or week rolls over */
  tick() { if (this.db && (this.period?.wk !== weekKey() || this.period?.dk !== dayKey())) this.subscribe(); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const f of this.listeners) f(); if (this.showing()) this.render(this.openTab); }
  showing() { const m = document.getElementById('modal'); return !!(this.openTab && m && !m.hidden && m.querySelector('.lb-tabs')); }

  async resolveNames() {
    if (!this.user?.profiles) return;
    const ids = [...new Set(Object.values(this.rows).flat().map((r) => r.id))].filter((id) => !(id in this.names));
    if (!ids.length) return;
    for (const id of ids) this.names[id] = null;
    try { const ps = await this.user.profiles(ids); for (const id of ids) this.names[id] = ps?.[id]?.name || null; } catch (_) { return; }
    if (this.showing()) this.render(this.openTab);
  }
  nameOf(r) { return (this.names[r.id] || (typeof r.n === 'string' ? r.n : '') || 'Player').slice(0, 24); }

  // ---------------------------------------------------------------- writing (own document only)
  /** record a finished run: { score, race: { placed, of } | null } */
  submit({ score, win = false }) {
    if (!this.db || !this.uid || this.canWrite === false) return Promise.resolve(false);
    this.queue = this.queue.then(async () => {
      const ref = this.db.doc('lb/' + this.uid);
      const cur = this.mine || (await ref.get().catch(() => null))?.data?.() || {};
      const L = this.getLocal(), wk = weekKey(), dk = dayKey(), s = Math.round(num(score ?? 0)), now = Date.now();
      const sameWeek = cur.week === wk, sameDay = cur.day === dk;
      const next = {
        n: String(L.name || 'Player').slice(0, 16), skin: String(L.skin || '').slice(0, 24), lv: L.level | 0,
        week: wk, wBest: Math.max(sameWeek ? num(cur.wBest) : 0, s), wAt: sameWeek && num(cur.wBest) >= s ? num(cur.wAt) : now,
        day: dk, dBest: Math.max(sameDay ? num(cur.dBest) : 0, s),
        best: Math.max(num(cur.best), s), runs: num(cur.runs) + (score == null ? 0 : 1),   // score null: a race win only
        wins: num(cur.wins) + (win ? 1 : 0), wWins: (sameWeek ? num(cur.wWins) : 0) + (win ? 1 : 0), at: now, ...walletFields(L),
      };
      try { await ref.set(next); this.mine = next; return true; }
      catch (e) { if (e?.code === 'invalid_argument') this.canWrite = false; console.warn('leaderboard: write failed', e?.code); return false; }
    });
    return this.queue;
  }
  /** store the player's name (and skin / level) on their own row, keeping any scores already there */
  saveProfile() {
    if (!this.db || !this.uid || this.canWrite === false) return Promise.resolve(false);
    this.queue = this.queue.then(async () => {
      const ref = this.db.doc('lb/' + this.uid);
      const cur = this.mine || (await ref.get().catch(() => null))?.data?.() || {};
      const L = this.getLocal();
      const next = { ...cur, n: String(L.name || 'Player').slice(0, 16), skin: String(L.skin || '').slice(0, 24), lv: L.level | 0, at: Date.now(), ...walletFields(L) };
      try { await ref.set(next); this.mine = next; return true; } catch (e) { if (e?.code === 'invalid_argument') this.canWrite = false; return false; }
    });
    return this.queue;
  }
  /** my place on this week's board (1-based) or 0 */
  myRank(key = 'week') { const i = this.rows[key].findIndex((r) => r.id === this.uid); return i + 1; }
  top(key = 'week', n = 3) { return this.rows[key].slice(0, n).map((r) => ({ name: this.nameOf(r), score: key === 'wins' ? num(r.wins) : num(key === 'day' ? r.dBest : r.wBest), me: r.id === this.uid })); }

  // ---------------------------------------------------------------- UI
  open(tab = 'week') { this.openTab = tab; this.render(tab); }
  render(tab) {
    const head = { week: 'THIS WEEK', day: 'TODAY', wins: 'RACE WINS' };
    const rows = this.rows[tab] || [], col = tab === 'wins' ? 'wins' : tab === 'day' ? 'dBest' : 'wBest';
    const body = !this.db
      ? '<p style="opacity:.8">The shared leaderboard is offline here. Your personal best is still saved on this device.</p>'
      : rows.length
        ? `<div class="lb-list">${rows.map((r, i) => `<div class="lb-row${r.id === this.uid ? ' me' : ''}"><span class="lb-n">${i + 1}</span><span class="lb-name">${esc(this.nameOf(r))}${r.id === this.uid ? ' (you)' : ''}</span><span class="lb-sub">LV ${r.lv | 0}${tab === 'wins' ? ` · ${num(r.wWins)} this week` : ` · ${num(r.runs)} runs`}</span><b>${num(r[col]).toLocaleString()}</b></div>`).join('')}</div>`
        : `<p style="opacity:.8">${tab === 'wins' ? 'No race wins yet. Host a race at the Bag Run portal (E) and beat a teammate.' : 'No runs yet ' + (tab === 'day' ? 'today' : 'this week') + '. Be the first: Bag Run portal, east of the crystal.'}</p>`;
    const ro = this.db && this.canWrite === false ? '<p class="lb-note">You can view the board, but your view-only access cannot post scores. Ask the owner to make you a Contributor in the Share menu.</p>' : '';
    this.hud.modal(`🏆 BAG RUN LEADERBOARD · ${head[tab]}`, `
      <div class="lb-tabs">${['week', 'day', 'wins'].map((t) => `<button class="${t === tab ? '' : 'ghost'}" data-lb="${t}">${head[t]}</button>`).join('')}</div>
      ${body}${ro}
      <p class="lb-note">Weekly board resets every Monday (UTC). Scores are reported by each player's game.</p>`);
    document.querySelectorAll('[data-lb]').forEach((b) => (b.onclick = () => this.open(b.dataset.lb)));
  }
}
