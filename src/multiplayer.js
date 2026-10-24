// Multiplayer over the claude.ai artifact `room` capability: everyone who has BagVerse open right now.
// Each page publishes ONE presence object (position, facing, animation, skin, level, scooter, last chat line);
// the platform syncs it (~30/s coalesced), hands it to newcomers and clears it when they leave, so there is no
// server of our own. Everything heard is untrusted display data: clamp numbers, cap strings, render text as text.
// Names come from the `user` capability (profiles by the sender's platform id), falling back to the in-game name.
// Without the room (a saved copy, a public link, signed out) the game runs single-player as before.
import * as THREE from 'three';
import { makeCharacter, addNameplate, say, ensureClip, CHAR_HEIGHT } from './player.js';
import { use } from './net.js';   // claude.ai capabilities, or Supabase when hosted on its own (Vercel)

const SEND_MS = 80;            // presence at most ~12/s while moving (the budget is ~40/s for the page)
const MAX_REMOTE = 24;
const ANIMS = new Set(['Idle', 'Walk', 'Run', 'Jump', 'Fall', 'Ride', 'Thriller', 'Dance', 'Swagger']);
const num = (v, lo, hi, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g, '').slice(0, n) : '');
const r2 = (v) => Math.round(v * 100) / 100;

export class Multiplayer {
  /**
   * opts: { scene, hud, loadChar(id) -> Promise<gltf>, validSkin(id), scooter (local Car, for the deck/grips/model),
   *         getLocal() -> state object, chatColor }
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.room = null; this.user = null; this.remotes = new Map(); this.names = {};
    this.lastSent = 0; this.sent = ''; this.sayId = 0; this.online = false;
    this.chip = document.createElement('button'); this.chip.id = 'mpchip'; this.chip.hidden = true;
    this.chip.onclick = () => this.openList();
    const tr = document.getElementById('topright'), zc = document.getElementById('zonechip');
    if (tr && zc) tr.insertBefore(this.chip, zc); else (tr || document.body).appendChild(this.chip);
  }

  async init() {
    [this.room, this.user] = await Promise.all([use('room').catch(() => null), use('user').catch(() => null)]);
    if (!this.room) return false;
    this.myId = this.user ? await this.user.id().catch(() => null) : null;
    this.room.onPeers((ch) => this.sync(ch), (e) => this.fail(e));
    this.room.onConnection((on) => { this.online = on; this.renderChip(); }, (e) => this.fail(e));
    this.chip.hidden = false; this.renderChip();
    this.push(true);
    console.log('multiplayer: room ready');
    return true;
  }
  fail(e) { console.warn('multiplayer: room unavailable', e?.code); this.room = null; this.chip.hidden = true; for (const id of [...this.remotes.keys()]) this.drop(id); }

  // ---------------------------------------------------------------- sending
  /** call every frame; sends only when something changed, at most every SEND_MS */
  push(force = false) {
    if (!this.room) return;
    const now = performance.now(); if (!force && now - this.lastSent < SEND_MS) return;
    const s = this.getLocal();
    const p = {
      v: 1, n: str(s.name, 16), tag: str(s.tag, 10), lv: s.level | 0, skin: str(s.skin, 24), id: this.myId || null,
      x: r2(s.pos.x), y: r2(s.pos.y), z: r2(s.pos.z), h: r2(s.yaw), a: s.anim, sp: r2(s.speed),
      r: s.ride ? { x: r2(s.ride.x), y: r2(s.ride.y), z: r2(s.ride.z), h: r2(s.ride.h), p: r2(s.ride.p), o: r2(s.ride.o), sp: r2(s.ride.sp) } : null,
      say: this.lastSay || null,
      race: this.myRace || null,   // { id, plan, seed, at, host } while hosting / joined to a race
      run: this.myRun || null,     // { id, s: score, b: bags, d: done } during and after a race
      mob: this.myMob || null,     // { e: emote, t0: epoch ms of clip time 0, of: leader peer or null }
    };
    const key = JSON.stringify(p);
    if (key === this.sent) return;
    this.sent = key; this.lastSent = now;
    this.room.presence(p).catch(() => {});
  }
  setRace(r) { this.myRace = r; this.push(true); }
  setRun(r) { const k = JSON.stringify(r); if (k !== this._run) { this._run = k; this.myRun = r; } }
  setMob(m) { const k = JSON.stringify(m); if (k !== this._mob) { this._mob = k; this.myMob = m; this.push(true); } }
  /** races hosted by others that are still open to join (start at least 1.5 s away) */
  openRaces() {
    const now = Date.now(), out = [];
    for (const r of this.remotes.values()) {
      const x = r.p.race; if (!x || !x.host || typeof x.id !== 'string' || typeof x.at !== 'number') continue;
      if (x.at < now + 1500 || x.at > now + 600000) continue;   // open, and not absurdly far ahead
      out.push({ race: { id: str(x.id, 16), plan: str(x.plan, 16), seed: num(x.seed, 0, 4294967295) >>> 0, at: x.at, host: false }, by: this.displayName(r) });
    }
    return out;
  }
  /** standings for race `id`: everyone whose presence reports that race, plus me */
  raceBoard(id, me) {
    const rows = [];
    for (const r of this.remotes.values()) { const x = r.p.run; if (x && x.id === id && !r.isMe) rows.push({ name: this.displayName(r).slice(0, 14), score: num(x.s, 0, 1e6) | 0, done: !!x.d }); }
    if (me) rows.push({ ...me, me: true });
    return rows.sort((a, b) => b.score - a.score);
  }
  /** a flashmob led by someone else, within `range` of `pos` */
  nearbyMob(pos, range = 30) {
    let best = null, bd = range * range;
    for (const r of this.remotes.values()) {
      const m = r.p.mob; if (!m || m.of || !r.c || typeof m.t0 !== 'number' || !['Thriller', 'Dance'].includes(m.e)) continue;
      const d = r.pos.distanceToSquared(pos); if (d < bd) { bd = d; best = { peer: r.peer, e: m.e, t0: m.t0, name: this.displayName(r) }; }
    }
    return best;
  }
  /** a chat line from this player (shown to everyone in the room) */
  chat(text) { if (!this.room) return; this.lastSay = { i: ++this.sayId + Math.floor(Math.random() * 1e6) * 1000, t: str(text, 120) }; this.push(true); }

  // ---------------------------------------------------------------- receiving
  sync({ peers }) {
    const seen = new Set();
    for (const peer of peers) {
      if (peer.sameTab || peer.kind !== 'viewer') continue;
      const pr = peer.presence; if (!pr || pr.v !== 1 || typeof pr.x !== 'number') continue;
      if (!this.remotes.has(peer.peer) && this.remotes.size >= MAX_REMOTE) continue;
      seen.add(peer.peer);
      this.update(peer);
    }
    for (const id of [...this.remotes.keys()]) if (!seen.has(id)) this.drop(id, true);
    this.renderChip();
    this.resolveNames(peers);
  }
  async resolveNames(peers) {
    if (!this.user?.profiles) return;
    const ids = [...new Set(peers.map((p) => p.by || p.presence?.id).filter((x) => typeof x === 'string' && !this.names[x]))];
    if (!ids.length) return;
    try { const ps = await this.user.profiles(ids); for (const id of ids) if (ps?.[id]?.name) this.names[id] = ps[id].name; } catch (_) { return; }
    for (const r of this.remotes.values()) this.refreshPlate(r, true);
    this.renderChip();
  }
  displayName(r) { const id = r.by || r.p.id; return str((id && this.names[id]) || r.p.n || 'Player', 24); }

  update(peer) {
    const pr = peer.presence;
    let r = this.remotes.get(peer.peer);
    if (!r) { r = { peer: peer.peer, by: peer.by, guest: peer.guest, isMe: peer.isMe, p: {}, pos: new THREE.Vector3(), yaw: 0, holder: {}, born: performance.now(), sayI: pr.say?.i ?? null }; this.remotes.set(peer.peer, r);   // sayI: never replay a line said before we arrived
      if (!peer.isMe) this.hud.toast?.(`${str(pr.n, 16) || 'A PLAYER'} JOINED · FOLLOW THEIR MARKER OR PRESS M`); }
    const prev = r.p; r.p = pr; r.by = peer.by;
    r.target = new THREE.Vector3(num(pr.x, -400, 400), num(pr.y, -20, 200), num(pr.z, -400, 400));
    r.tyaw = num(pr.h, -50, 50);
    const skin = this.validSkin(pr.skin) ? pr.skin : 'goldenking';
    if (skin !== r.skin) this.setSkin(r, skin);
    if (r.c && (prev.n !== pr.n || prev.lv !== pr.lv || prev.tag !== pr.tag)) this.refreshPlate(r);
    if (pr.say && typeof pr.say.i === 'number' && pr.say.i !== r.sayI) {
      r.sayI = pr.say.i;
      const text = str(pr.say.t, 120);
      if (text) { this.hud.chat(str(pr.tag, 10) || 'PLAYER', this.displayName(r), text, this.chatColor || '#3dfff0'); if (r.c) say(r.c.root, text, r.holder); }
    }
  }
  async setSkin(r, skin) {
    r.skin = skin;
    let g; try { g = await this.loadChar(skin); } catch (_) { return; }
    if (r.skin !== skin || !this.remotes.has(r.peer)) return;
    if (r.c) { this.scene.remove(r.c.root); if (r.board) this.scene.remove(r.board); }
    r.c = makeCharacter(g, { shadow: true });
    r.c.root.position.copy(r.target); r.pos.copy(r.target); r.yaw = r.tyaw;
    this.scene.add(r.c.root);
    this.refreshPlate(r);
  }
  refreshPlate(r) {
    if (!r.c) return;
    if (r.plate) { r.c.root.remove(r.plate); r.plate.material.map?.dispose(); }
    const lv = num(r.p.lv, 1, 999, 1);
    r.plate = addNameplate(r.c.root, r.isMe ? 'YOU·TAB' : r.guest ? 'GUEST' : 'TEAM', this.displayName(r).slice(0, 16), lv, r.guest ? '#ffc83d' : '#3dfff0');
  }
  drop(id, left = false) {
    const r = this.remotes.get(id); if (!r) return;
    if (r.c) this.scene.remove(r.c.root); if (r.board) this.scene.remove(r.board); r.mark?.remove();
    this.remotes.delete(id);
    if (left && !r.isMe) this.hud.toast?.(`${this.displayName(r).toUpperCase()} LEFT`);
  }

  // ---------------------------------------------------------------- per frame
  tick(dt) {
    this.push();
    const k = 1 - Math.exp(-12 * dt);
    for (const r of this.remotes.values()) {
      if (!r.c || !r.target) continue;
      const ride = r.p.r && typeof r.p.r === 'object' ? r.p.r : null;
      if (ride) { this.tickRide(r, ride, dt, k); continue; }
      if (r.board) r.board.visible = false;
      if (r.pos.distanceToSquared(r.target) > 15 * 15) r.pos.copy(r.target); else r.pos.lerp(r.target, k);
      let d = r.tyaw - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); r.yaw += d * k;
      r.c.root.position.copy(r.pos); r.c.root.rotation.set(0, r.yaw, 0);
      const a = ANIMS.has(r.p.a) ? r.p.a : 'Idle', sp = num(r.p.sp, 0, 20);
      if (a === 'Thriller' || a === 'Dance') {
        if (ensureClip(r.c, a)) {
          r.c.play(a, 0.25);
          const m = r.p.mob, act = r.c.actions[a];   // flashmob dancers share one clock: clip time from the leader's t0
          if (m && m.e === a && typeof m.t0 === 'number' && act) { const dur = act.getClip().duration || 1; act.time = (((Date.now() - m.t0) / 1000) % dur + dur) % dur; }
        } else r.c.play('Idle', 0.3);
      }
      else if (a === 'Run') r.c.play('Run', 0.2, THREE.MathUtils.clamp(sp / 6.6, 0.7, 1.3));
      else if (a === 'Walk') r.c.play('Walk', 0.25, THREE.MathUtils.clamp(sp / 1.8, 0.6, 1.4));
      else r.c.play(a, a === 'Jump' ? 0.08 : 0.25, a === 'Jump' ? 1.15 : 1);
      r.c.mixer.update(dt);
      this.tickBubble(r, dt);
    }
  }
  tickRide(r, ride, dt, k) {
    const sc = this.scooter;
    if (!r.board && sc) { r.board = sc.root.clone(true); r.board.visible = true; this.scene.add(r.board); }
    const tp = new THREE.Vector3(num(ride.x, -400, 400), num(ride.y, -20, 200), num(ride.z, -400, 400));
    if (!r.bpos || r.bpos.distanceToSquared(tp) > 15 * 15) r.bpos = tp.clone(); else r.bpos.lerp(tp, k);
    let d = num(ride.h, -50, 50) - (r.bh ?? ride.h); d = Math.atan2(Math.sin(d), Math.cos(d)); r.bh = (r.bh ?? ride.h) + d * k;
    const pitch = num(ride.p, -1, 1), roll = num(ride.o, -1, 1);
    if (r.board) { r.board.visible = true; r.board.position.copy(r.bpos); r.board.rotation.set(-pitch, r.bh, roll, 'YXZ'); }
    const deck = sc?.deck || new THREE.Vector3(0, 0.06, 0), s = Math.sin(r.bh), c = Math.cos(r.bh);
    r.c.root.position.set(r.bpos.x + deck.x * c + deck.z * s, r.bpos.y + deck.y, r.bpos.z - deck.x * s + deck.z * c);
    r.c.root.rotation.set(-pitch, r.bh, roll, 'YXZ');
    r.pos.copy(r.c.root.position); r.yaw = r.bh;
    if (ensureClip(r.c, 'Ride')) { r.c.play('Ride', 0.25); r.c.actions.Ride.timeScale = THREE.MathUtils.clamp(Math.abs(num(ride.sp, -30, 30)) / 5, 0, 1.25); } else r.c.play('Idle', 0.25);
    r.c.mixer.update(dt);
    this.tickBubble(r, dt);
  }
  tickBubble(r, dt) {
    const h = r.holder; if (!h.bubble) return;
    h.bubbleT -= dt; if (h.bubbleT <= 0) { r.c.root.remove(h.bubble); h.bubble.material.map?.dispose(); h.bubble = null; }
  }

  // ---------------------------------------------------------------- finding each other
  /** teammates for the big map: [{ peer, x, z, name }] */
  mapMates() { return [...this.remotes.values()].filter((r) => r.c && !r.isMe).map((r) => ({ peer: r.peer, x: r.pos.x, z: r.pos.z, name: this.displayName(r) })); }
  goTo(peer) { const r = this.remotes.get(peer); if (r) this.onGoTo?.(r.pos.clone()); }
  /** on-screen markers: a name + distance tag over each teammate, pinned to the screen edge with an arrow when they are
   *  off-screen or behind you; hidden when they are close enough to see their nameplate */
  indicators(camera, from) {
    const box = this.ind ||= Object.assign(document.createElement('div'), { id: 'mpmarks' });
    if (!box.isConnected) (document.getElementById('hud') || document.body).appendChild(box);
    const W = innerWidth, H = innerHeight, pad = 46, seen = new Set(), v = new THREE.Vector3();
    for (const r of this.remotes.values()) {
      if (!r.c || r.isMe) continue;
      seen.add(r.peer);
      let el = r.mark;
      if (!el) { el = r.mark = document.createElement('button'); el.className = 'mpmark'; el.innerHTML = '<i>▲</i><b></b><small></small>'; el.onclick = () => this.goTo(r.peer); box.appendChild(el); }
      const d = r.pos.distanceTo(from);
      if (d < 14) { el.hidden = true; continue; }
      el.hidden = false;
      v.copy(r.pos).setY(r.pos.y + 2.3).project(camera);
      const behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      if (behind) { x = W - x; y = H - pad; }
      const off = behind || x < pad || x > W - pad || y < pad || y > H - pad;
      x = Math.min(W - pad, Math.max(pad, x)); y = Math.min(H - pad, Math.max(pad, y));
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      el.classList.toggle('edge', off);
      const ang = Math.atan2(y - H / 2, x - W / 2) + Math.PI / 2;
      el.firstChild.style.transform = off ? `rotate(${ang}rad)` : 'none';
      el.children[1].textContent = this.displayName(r).slice(0, 14);
      el.children[2].textContent = d > 999 ? '' : Math.round(d) + ' m';
    }
    for (const r of [...box.children]) if (![...this.remotes.values()].some((x) => x.mark === r)) r.remove();
  }

  // ---------------------------------------------------------------- HUD
  get count() { return [...this.remotes.values()].filter((r) => !r.isMe).length; }
  marks() { return [...this.remotes.values()].filter((r) => r.c).map((r) => ({ x: r.pos.x, z: r.pos.z, color: '#3dfff0', shape: 'ring' })); }
  renderChip() {
    if (this.chip.hidden) return;
    const n = this.count;
    this.chip.textContent = `👥 ${n + 1} ONLINE`;
    this.chip.classList.toggle('off', !this.online);
    this.chip.title = this.online ? 'Players in BagVerse right now' : 'Reconnecting…';
  }
  openList() {
    const rows = [...this.remotes.values()].filter((r) => r.c);
    const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    this.hud.modal(`ONLINE · ${rows.filter((r) => !r.isMe).length + 1}`, `
      <div class="row"><span>You</span><b>${esc(str(this.getLocal().name, 16))}</b></div>
      ${rows.map((r) => `<div class="row"><span>${esc(this.displayName(r))}${r.isMe ? ' (your other tab)' : r.guest ? ' · guest' : ''} · LV ${num(r.p.lv, 1, 999, 1)}</span><button class="ghost mp-go" data-peer="${esc(r.peer)}">GO TO</button></div>`).join('') || '<p style="opacity:.75">Nobody else is here yet. Share this page with your team (Share menu) and they will appear here when they open it.</p>'}
      <p style="opacity:.7">Everyone with BagVerse open sees each other move, ride, emote and chat. Progress and Bags stay per player.</p>`);
    document.querySelectorAll('.mp-go').forEach((b) => (b.onclick = () => { const r = this.remotes.get(b.dataset.peer); if (r) { this.onGoTo?.(r.pos.clone()); this.hud.closeModal(); } }));
  }
}
