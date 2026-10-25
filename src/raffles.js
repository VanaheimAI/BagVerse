// Vault raffles (Wano = graded One Piece, Kanto = graded Pokémon): free entry with a verified Solana wallet.
// Reads public.raffles / public.raffle_entries straight from Supabase (read-only for players); entering goes
// through POST /api/raffle/enter and the draw through /api/raffle/draw (see api/_lib/raffle.js for how the winner
// is picked from a Solana block hash). Off Supabase (claude.ai artifact, local build) raffles show as offline.
import { session, tables } from './net.js';

const SEEN = 'bv_raffle_seen';
const load = () => { try { return JSON.parse(localStorage.getItem(SEEN) || '[]'); } catch (_) { return []; } };
const save = (v) => { try { localStorage.setItem(SEEN, JSON.stringify(v.slice(-50))); } catch (_) {} };

export class Raffles {
  constructor() { this.list = []; this.mine = new Set(); this.ready = false; this.offline = false; this.listeners = new Set(); this.drawAsked = 0; }
  onChange(fn) { this.listeners.add(fn); }
  changed() { for (const f of this.listeners) f(this); }

  async refresh() {
    const t = await tables();
    if (!t) { this.offline = true; this.ready = true; return this.changed(); }
    try {
      const { data, error } = await t.from('raffles').select('*').order('draws_at', { ascending: false }).limit(30);
      if (error) throw error;
      this.list = data || [];
      const ses = await session(); this.uid = ses?.uid || null;
      if (this.uid) { const { data: e } = await t.from('raffle_entries').select('raffle_id').eq('user_id', this.uid); this.mine = new Set((e || []).map((x) => x.raffle_id)); }
    } catch (e) { this.offline = /relation|schema cache|does not exist/i.test(String(e?.message)); console.warn('raffles:', e?.message); }
    this.ready = true; this.changed();
    // a raffle past its draw time: ask the server to draw it (anyone may; the result doesn't depend on who asks)
    if (this.list.some((r) => r.status === 'open' && Date.parse(r.draws_at) <= Date.now()) && Date.now() - this.drawAsked > 120e3) {
      this.drawAsked = Date.now();
      fetch('/api/raffle/draw').then(() => setTimeout(() => this.refresh(), 2000)).catch(() => {});
    }
    // my wins I haven't been shown yet, and fresh winners for the chat
    const seen = new Set(load()), fresh = [];
    for (const r of this.list) {
      if (r.status !== 'drawn' || seen.has(r.id)) continue;
      seen.add(r.id); fresh.push(r);
    }
    if (fresh.length) { save([...seen]); for (const r of fresh) this.onDrawn?.(r, r.winner_user && r.winner_user === this.uid); }
  }
  start() { this.refresh(); this.timer = setInterval(() => this.refresh(), 60e3); }

  /** the open raffle for a vault ('wano' | 'kanto'): the one drawing soonest */
  current(vault) { return this.list.filter((r) => r.vault === vault && r.status === 'open').sort((a, b) => Date.parse(a.draws_at) - Date.parse(b.draws_at))[0] || null; }
  /** every open raffle for a vault, in showcase order (prize.slot 1–3 first, then by draw time); max 3 */
  openFor(vault) {
    return this.list.filter((r) => r.vault === vault && r.status === 'open')
      .sort((a, b) => ((a.prize?.slot | 0) || 9) - ((b.prize?.slot | 0) || 9) || Date.parse(a.draws_at) - Date.parse(b.draws_at)).slice(0, 3);
  }
  /** the latest finished raffle for a vault */
  last(vault) { return this.list.filter((r) => r.vault === vault && r.status === 'drawn').sort((a, b) => Date.parse(b.draws_at) - Date.parse(a.draws_at))[0] || null; }
  entered(id) { return this.mine.has(id); }

  async enter(id, name) {
    const ses = await session(); if (!ses) throw new Error('Raffles run on the BagVerse website.');
    let r, j = {};
    try { r = await fetch('/api/raffle/enter', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + ses.token }, body: JSON.stringify({ raffle_id: id, name }) }); j = await r.json().catch(() => ({})); }
    catch (_) { throw new Error('Network error. Try again.'); }
    if (!r.ok) throw new Error(j.error || 'Could not enter.');
    this.mine.add(id);
    const x = this.list.find((q) => q.id === id); if (x && typeof j.entries === 'number') x.entries = j.entries;
    this.changed(); return j;
  }
}

export function countdown(ms) {
  if (ms <= 0) return 'DRAWING NOW';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${sec}s` : `${m}m ${String(sec).padStart(2, '0')}s`;
}
