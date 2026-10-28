// Spray Spots: walls around the city that signed-in players tag with their X handle (+ avatar sticker).
//   - a tag fades over 72 h unless its owner comes back to touch it up; anyone can spray over it (after a 10-min lock)
//   - spraying gives XP (capped); sharing never does (X's rules forbid rewarding posts)
//   - every spray makes a share card (in-world photo + handle + district + link), shared by the player themselves:
//     the phone share sheet, or "copy image + open X with the text", or save the image. No X API.
//   - "you got sprayed over" inbox from tag_log, so losing a wall pulls you back
// Server rules: api/tag.js (same TAG_RULES). Website only (needs Sign in with X); off Supabase the walls stay blank.
import * as THREE from 'three';
import '@fontsource/sedgwick-ave-display/latin-400.css';
import '@fontsource/bungee/latin-400.css';
import '@fontsource/rubik-wet-paint/latin-400.css';
import { TAG_SPOTS, TAG_RULES as R, TAG_FONTS, TAG_COLORS, cleanStyle, tagState, spotById } from './tagspots.js';
import { tables, session } from './net.js';

const W = 1024, H = 576, PW = 4.0, PH = 2.25;   // texture px, wall plane metres
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ls = { get: (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
const ago = (ms) => { const m = Math.round(ms / 60e3); return m < 60 ? `${Math.max(1, m)} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
const seeded = (str) => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const fontOf = (f) => (TAG_FONTS.find((x) => x.id === f) || TAG_FONTS[0]).family;
const dark = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) < 70; };

const avatarCache = new Map();
/** an X avatar as a drawable image (CORS-clean), or null */
function loadAvatar(url) {
  if (!url) return Promise.resolve(null);
  if (!avatarCache.has(url)) avatarCache.set(url, new Promise((ok) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer'; im.onload = () => ok(im); im.onerror = () => ok(null); im.src = url; setTimeout(() => ok(null), 8000); }));
  return avatarCache.get(url);
}
let fontsReady = null;
const loadFonts = () => (fontsReady ||= Promise.all(TAG_FONTS.map((f) => document.fonts?.load(`120px "${f.family}"`).catch(() => null))).then(() => true));

/** paint a tag (or the empty-wall stencil) onto a 2D context of W x H */
export function paintTag(g, tag, { avatarImg = null, district = '' } = {}) {
  g.clearRect(0, 0, W, H);
  if (!tag) {   // empty wall: a stencilled frame inviting a tag
    g.save(); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 8; g.setLineDash([34, 22]); g.beginPath(); g.roundRect(40, 40, W - 80, H - 80, 40); g.stroke(); g.restore();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.textAlign = 'center'; g.font = '400 92px "Permanent Marker", cursive'; g.fillText('TAG THIS WALL', W / 2, H / 2 + 10);
    g.font = '700 40px Rajdhani, sans-serif'; g.fillStyle = 'rgba(124,255,61,.85)'; g.fillText(`SPRAY SPOT · ${district.toUpperCase()}`, W / 2, H / 2 + 80);
    return;
  }
  const st = cleanStyle(tag.style), col = TAG_COLORS[st.c], fam = fontOf(st.f), rnd = seeded(tag.handle + tag.sprayed_at);
  const outline = dark(col) ? '#ffffff' : '#120a1e';
  const text = '@' + tag.handle;
  // overspray mist behind the letters
  for (let i = 0; i < 14; i++) {
    const x = 120 + rnd() * (W - 240), y = 170 + rnd() * 240, r = 90 + rnd() * 140, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col + '26'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // fit the handle across the wall
  let size = 230; g.font = `400 ${size}px "${fam}"`;
  while (g.measureText(text).width > W - 150 && size > 60) { size -= 8; g.font = `400 ${size}px "${fam}"`; }
  const cx = W / 2 - 40, cy = H / 2 + size * 0.28;
  g.save(); g.translate(cx, cy); g.rotate(-0.06 + rnd() * 0.04); g.textAlign = 'center'; g.lineJoin = 'round';
  g.fillStyle = outline; g.fillText(text, 12, 12);                     // 3D drop
  g.lineWidth = Math.max(10, size * 0.11); g.strokeStyle = outline; g.strokeText(text, 0, 0);
  g.fillStyle = col; g.fillText(text, 0, 0);
  // drips under the letters
  const wTxt = g.measureText(text).width;
  g.fillStyle = col;
  for (let i = 0; i < 9; i++) { const x = -wTxt / 2 + rnd() * wTxt, len = 20 + rnd() * 70, w = 5 + rnd() * 7; g.fillRect(x, 4, w, len); g.beginPath(); g.arc(x + w / 2, 4 + len, w * 0.75, 0, Math.PI * 2); g.fill(); }
  g.restore();
  // avatar sticker (top right), slightly rotated, with a white die-cut border
  const ax = W - 170, ay = 120, ar = 86;
  g.save(); g.translate(ax, ay); g.rotate(0.12);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, ar + 10, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(0, 0, ar, 0, Math.PI * 2); g.clip();
  if (avatarImg) g.drawImage(avatarImg, -ar, -ar, ar * 2, ar * 2);
  else { g.fillStyle = col; g.fillRect(-ar, -ar, ar * 2, ar * 2); g.fillStyle = outline; g.textAlign = 'center'; g.font = '700 96px Rajdhani, sans-serif'; g.fillText((tag.handle[0] || '?').toUpperCase(), 0, 34); }
  g.restore();
  // small print: BAGVERSE + date
  g.fillStyle = 'rgba(255,255,255,.8)'; g.textAlign = 'left'; g.font = '400 34px "Permanent Marker", cursive';
  const d = new Date(tag.sprayed_at); g.fillText(`BAGVERSE '${String(d.getUTCFullYear()).slice(2)} · ${district.toUpperCase()}`, 70, H - 60);
}

export class Tags {
  /**
   * deps: { scene, world, progress, hud, sfx, quests, player, camera, input, account(): {linked, handle} | null,
   *         signIn(), capture(spot, from, at): HTMLCanvasElement | null, travel(zone), enabled }
   */
  constructor(deps) {
    Object.assign(this, deps);
    this.enabled = !!deps.enabled;
    this.rows = new Map();            // spot -> tag row
    this.walls = new Map();           // spot -> { mesh, tex, ctx, key }
    this.busy = false; this.lastFetch = 0; this.uid = null; this.anim = null;
    if (!this.enabled) return;
    const root = this.root = new THREE.Group(); root.name = 'TAG_SPOTS'; this.scene.add(root);
    for (const s of TAG_SPOTS) this.addWall(s);
    loadFonts().then(() => { for (const s of TAG_SPOTS) this.paint(s.id, true); });
    this.refresh();
    setInterval(() => this.refresh(), 30e3);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
  }

  zoneLabel(id) { const z = this.world.zones.find((q) => q.id === id); return z?.label || id.replace(/_/g, ' '); }
  zoneName(id) { return this.zoneLabel(id).toLowerCase().replace(/(^|[\s/&-])([a-z])/g, (m, p, c) => p + c.toUpperCase()).replace(/\bGm\b/, 'GM').replace(/\bHodl\b/, 'HODL'); }   // for posts: "Pepe's Swamp"

  addWall(s) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.08, transparent: true, roughness: 0.85, metalness: 0,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat);
    mesh.position.set(s.x + s.nx * 0.035, s.y, s.z + s.nz * 0.035);
    mesh.lookAt(s.x + s.nx * 5, s.y, s.z + s.nz * 5);
    mesh.renderOrder = 2; mesh.name = 'TAG_' + s.id;
    this.root.add(mesh);
    this.walls.set(s.id, { mesh, tex, ctx: c.getContext('2d'), key: '' });
    this.paint(s.id);
  }

  /** redraw a wall when its tag changes; opacity follows the fade */
  async paint(id, force = false) {
    const w = this.walls.get(id), s = spotById(id); if (!w || !s) return;
    const row = this.rows.get(id), st = tagState(row), tag = st.live ? row : null;
    const key = tag ? `${tag.handle}|${tag.sprayed_at}|${JSON.stringify(tag.style)}|${tag.avatar}` : 'empty';
    if (key !== w.key || force) {
      w.key = key;
      const img = tag ? await loadAvatar(tag.avatar) : null;
      if (w.key !== key) return;   // changed while the avatar loaded
      paintTag(w.ctx, tag, { avatarImg: img, district: this.zoneLabel(s.zone) });
      w.tex.needsUpdate = true;
    }
    w.mesh.material.opacity = tag ? 0.35 + 0.65 * Math.min(1, st.fade * 1.5) : 0.55;   // full strength for the first day, then fading
  }

  // ---------------------------------------------------------------- data
  async refresh(force = false) {
    if (!this.enabled || (!force && Date.now() - this.lastFetch < 5e3)) return;
    this.lastFetch = Date.now();
    const t = await tables(); if (!t) return;
    try {
      const { data } = await t.from('tags').select('*');
      const seen = new Set();
      for (const r of data || []) { seen.add(r.spot); this.rows.set(r.spot, r); }
      for (const id of [...this.rows.keys()]) if (!seen.has(id)) this.rows.delete(id);
      for (const s of TAG_SPOTS) this.paint(s.id);
      this.uid ||= (await session())?.uid || null;
      this.checkInbox(t);
    } catch (e) { console.warn('tags:', e.message); }
  }

  /** "you got sprayed over": overwrites of my walls since I last looked */
  async checkInbox(t) {
    if (!this.uid || !this.account()?.linked) return;
    const seenKey = 'bv_tag_seen', seen = ls.get(seenKey, null);
    if (seen == null) { ls.set(seenKey, new Date().toISOString()); return; }   // first time: start from now
    const { data } = await t.from('tag_log').select('*').eq('prev_owner', this.uid).order('at', { ascending: false }).limit(20);
    const fresh = (data || []).filter((r) => r.at > seen && r.owner !== this.uid);
    if (!fresh.length) return;
    ls.set(seenKey, fresh[0].at);
    this.inbox = fresh;
    if (this.hud.modalOpen || this.anim) { this.hud.toast(`🎨 @${fresh[0].handle} SPRAYED OVER YOUR TAG · ${this.zoneLabel(spotById(fresh[0].spot)?.zone || '').toUpperCase()}`); return; }
    this.openInbox(fresh);
  }

  openInbox(list = this.inbox || []) {
    this.sfx.play('scratch');
    const rows = list.slice(0, 6).map((r, i) => { const s = spotById(r.spot); return `<div class="tg-in"><b>@${esc(r.handle)}</b> sprayed over you at <b>${esc(this.zoneName(s?.zone || ''))}</b><small>${ago(Date.now() - Date.parse(r.at))} ago</small>
      <span><button data-go="${i}">GO TAKE IT BACK</button><button class="ghost" data-call="${i}">CALL IT OUT ON 𝕏</button></span></div>`; }).join('');
    this.hud.modal('🎨 YOU GOT SPRAYED OVER', `${rows}<p class="tg-note">Walk (or scooter) up to the wall and spray it back. Tags fade after ${R.fadeH} h unless you touch them up.</p>`);
    document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { const s = spotById(list[+b.dataset.go].spot); this.hud.closeModal(); const z = this.world.zones.find((q) => q.id === s?.zone); if (z) this.travel(z); }));
    document.querySelectorAll('[data-call]').forEach((b) => (b.onclick = () => { const r = list[+b.dataset.call], s = spotById(r.spot);
      this.openIntent(`@${r.handle} just sprayed over my tag at ${this.zoneName(s?.zone || '')} in BagVerse. Taking it back 🎨`, r.spot); }));
  }

  // ---------------------------------------------------------------- in the world
  /** the wall the player is standing at (close, in front of it), or null */
  near(p) {
    if (!this.enabled) return null;
    let best = null, bd = 4.6;
    for (const s of TAG_SPOTS) {
      const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz);
      if (d < bd && dx * s.nx + dz * s.nz > 0.4 && Math.abs(p.y + 1.9 - s.y) < 2.5) { bd = d; best = s; }
    }
    return best;
  }
  promptFor(s) {
    const row = this.rows.get(s.id), st = tagState(row), a = this.account();
    if (st.live && row.owner === this.uid) return `<kbd>E</kbd> YOUR TAG · ${st.fade > 0.67 ? 'FRESH' : 'TOUCH IT UP'}`;
    if (st.live) return `<kbd>E</kbd> @${esc(row.handle).toUpperCase()}'S WALL · ${st.locked ? 'FRESH PAINT' : 'SPRAY OVER IT'}`;
    if (!a?.linked) return '<kbd>E</kbd> TAG THIS WALL · SIGN IN WITH 𝕏';
    return `<kbd>E</kbd> TAG THIS WALL${this.progress.s.level < R.minLevel ? ` · LV ${R.minLevel}` : ''}`;
  }

  /** E at a wall: sign-in / level gates, then the spray card (style picker, consent, report) */
  open(s) {
    const a = this.account(), row = this.rows.get(s.id), st = tagState(row), zone = this.zoneLabel(s.zone);
    const mine = st.live && row.owner === this.uid;
    const holder = st.live ? `<div class="tg-holder">${row.avatar ? `<img alt="" src="${esc(row.avatar)}" referrerpolicy="no-referrer">` : ''}<div><b>@${esc(row.handle)}</b> ${mine ? '(you)' : ''} holds this wall<small>sprayed ${ago(Date.now() - Date.parse(row.sprayed_at))} ago · fades in ${ago(R.fadeH * 3600e3 - (Date.now() - Date.parse(row.touched_at)))}${st.locked ? ` · locked ${ago(st.lockLeftMs)}` : ''}</small></div></div>` : '';
    if (!a?.linked) {
      this.hud.modal(`🎨 SPRAY SPOT · ${zone.toUpperCase()}`, `${holder}<p>Tags carry your <b>𝕏 handle</b> and profile picture, so tagging needs Sign in with X.</p><p class="tg-note">Your progress comes with you.</p><div class="tg-btns"><button id="tg-x">𝕏 SIGN IN WITH X</button></div>`);
      document.getElementById('tg-x').onclick = () => { this.hud.closeModal(); this.signIn(); };
      return;
    }
    if (this.progress.s.level < R.minLevel) { this.sfx.play('scandeny'); this.hud.toast(`TAGGING OPENS AT LV ${R.minLevel}`); return; }
    const consent = ls.get('bv_tag_consent', false);
    let style = cleanStyle(ls.get('bv_tag_style', { f: 'hand', c: 0 }));
    const busyMsg = mine ? (Date.now() - Date.parse(row.touched_at) < R.touchH * 3600e3 ? `Fresh. You can touch it up in ${ago(R.touchH * 3600e3 - (Date.now() - Date.parse(row.touched_at)))}.` : '')
      : st.locked ? `Fresh paint: you can spray over it in ${ago(st.lockLeftMs)}.` : '';
    const heldN = [...this.rows.values()].filter((r) => r.owner === this.uid && tagState(r).live).length;
    const capMsg = !mine && heldN >= R.maxHeld ? `You hold ${R.maxHeld} walls already. Let one fade first.` : '';
    this.hud.modal(`🎨 SPRAY SPOT · ${zone.toUpperCase()}`, `
      ${holder}
      <canvas id="tg-prev" width="${W}" height="${H}"></canvas>
      <div class="tg-pick"><div class="tg-fonts">${TAG_FONTS.map((f) => `<button class="ghost" data-f="${f.id}" style="font-family:'${f.family}'">${f.name}</button>`).join('')}</div>
      <div class="tg-cols">${TAG_COLORS.map((c, i) => `<button data-c="${i}" style="background:${c}" aria-label="colour ${i + 1}"></button>`).join('')}</div></div>
      ${consent ? '' : `<label class="tg-consent"><input type="checkbox" id="tg-ok"> Show my 𝕏 handle and profile picture on this wall to everyone in BagVerse. It stays until it fades (${R.fadeH} h) or someone sprays over it.</label>`}
      <p class="tg-err" id="tg-err" ${busyMsg || capMsg ? '' : 'hidden'}>${esc(busyMsg || capMsg)}</p>
      <div class="tg-btns"><button id="tg-go" ${busyMsg || capMsg ? 'disabled' : ''}>${mine ? 'TOUCH UP' : st.live ? 'SPRAY OVER IT' : 'SPRAY MY TAG'}</button>
        ${st.live && !mine ? '<button class="ghost" id="tg-rep">REPORT</button>' : ''}</div>
      <p class="tg-note">+75 XP per spray. Hold a wall: come back to touch it up. ${heldN ? `<a href="#" id="tg-rm">Take down my tags</a>` : ''}</p>`);
    const prev = document.getElementById('tg-prev'), pg = prev.getContext('2d');
    const draw = () => {
      paintTag(pg, { handle: a.handle || 'you', avatar: a.avatar, style, sprayed_at: new Date().toISOString() }, { avatarImg: this.myAvatar || null, district: zone });
      document.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('ghost', b.dataset.f !== style.f));
      document.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('on', +b.dataset.c === style.c));
    };
    loadFonts().then(draw); draw();
    loadAvatar(a.avatar).then((im) => { this.myAvatar = im; draw(); });
    document.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { style = { ...style, f: b.dataset.f }; ls.set('bv_tag_style', style); draw(); }));
    document.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { style = { ...style, c: +b.dataset.c }; ls.set('bv_tag_style', style); draw(); }));
    document.getElementById('tg-go').onclick = () => {
      const ok = document.getElementById('tg-ok');
      if (ok && !ok.checked) { const e = document.getElementById('tg-err'); e.textContent = 'Tick the box to show your handle on the wall.'; e.hidden = false; return; }
      ls.set('bv_tag_consent', true); this.hud.closeModal(); this.spray(s, style);
    };
    const rep = document.getElementById('tg-rep');
    if (rep) rep.onclick = async () => { rep.disabled = true; const r = await this.api({ op: 'report', spot: s.id }); this.hud.closeModal(); this.hud.toast(r.error ? r.error.toUpperCase() : r.hidden ? 'REPORTED · TAG HIDDEN FOR REVIEW' : 'REPORTED · THANKS'); this.refresh(true); };
    const rm = document.getElementById('tg-rm');
    if (rm) rm.onclick = async (e) => { e.preventDefault(); const r = await this.api({ op: 'remove_mine' }); this.hud.closeModal(); this.hud.toast(r.error ? r.error.toUpperCase() : `TOOK DOWN ${r.removed} TAG${r.removed === 1 ? '' : 'S'}`); this.refresh(true); };
  }

  async api(body) {
    const s = await session(); if (!s) return { error: 'Sign in first (reload the game).' };
    try {
      const r = await fetch('/api/tag', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.token }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({})); return r.ok ? j : { error: j.error || `Tagging failed (${r.status}).` };
    } catch (_) { return { error: 'No connection. Try again.' }; }
  }

  /** the spray: walk-up pose + hiss + the tag painting itself in, while the server checks and stores it */
  async spray(s, style) {
    if (this.busy) return; this.busy = true;
    const P = this.player.body.pos, tan = new THREE.Vector3(-s.nz, 0, s.nx);
    // stand just right of the tag, facing the wall (so the share photo shows you next to your work)
    const stand = new THREE.Vector3(s.x + s.nx * 1.5 + tan.x * 1.95, 0, s.z + s.nz * 1.5 + tan.z * 1.95);
    stand.y = this.world.physics.groundAt(stand.x, stand.z, s.y + 1) + 0.02;
    if (Math.abs(stand.y - (s.y - 1.9)) < 1.2 && P.distanceTo(stand) < 6) { P.copy(stand); this.player.body.vel.set(0, 0, 0); }
    this.face(s);
    this.sfx.play('spray');
    const pos = { x: P.x, z: P.z };
    const req = (async () => { try { await this.beforeSpray?.(); } catch (_) {} return this.api({ op: 'spray', spot: s.id, style, pos }); })();   // cloud save first: the server reads your level from it
    // reveal: the new tag sprays in left to right over ~1.6 s (a preview until the server answers)
    const a = this.account(), w = this.walls.get(s.id), prevRow = this.rows.get(s.id);
    const temp = { spot: s.id, owner: this.uid, handle: a.handle, avatar: a.avatar, style, sprayed_at: new Date().toISOString(), touched_at: new Date().toISOString() };
    const full = document.createElement('canvas'); full.width = W; full.height = H;
    paintTag(full.getContext('2d'), temp, { avatarImg: await loadAvatar(a.avatar), district: this.zoneLabel(s.zone) });
    const before = document.createElement('canvas'); before.width = W; before.height = H; before.getContext('2d').drawImage(w.ctx.canvas, 0, 0);
    const mist = this.mist(s, TAG_COLORS[style.c]);
    const t0 = performance.now(), DUR = 1700;
    await new Promise((done) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / DUR), x = Math.round(W * k);
        w.ctx.clearRect(0, 0, W, H); w.ctx.drawImage(before, 0, 0);
        w.ctx.clearRect(0, 0, x, H); w.ctx.drawImage(full, 0, 0, x, H, 0, 0, x, H);
        w.tex.needsUpdate = true; w.mesh.material.opacity = 1;
        mist.update(k, tan);
        if (k < 1) requestAnimationFrame(step); else done();
      };
      step();
    });
    const r = await req;
    mist.done();
    this.busy = false;
    if (r.error) { this.sfx.play('scandeny'); this.hud.toast(r.error.toUpperCase()); w.key = ''; if (prevRow) this.rows.set(s.id, prevRow); this.paint(s.id, true); return; }
    this.rows.set(s.id, r.tag); w.key = ''; await this.paint(s.id, true);
    const got = this.progress.grant(75, 'tag');
    this.quests.emit('tag', 1, { id: s.id }); if (r.overwrote) this.quests.emit('tag_over', 1); this.quests.checkAchievements?.();
    this.sfx.play('success');
    this.hud.toast(`${r.touched ? 'TOUCHED UP' : r.overwrote ? `SPRAYED OVER @${r.overwrote.toUpperCase()}` : 'TAGGED'} · ${this.zoneLabel(s.zone).toUpperCase()}${got ? ` · +${got} XP` : ''}`);
    setTimeout(() => this.shareCard(s, r.tag, r.overwrote, r.touched), 350);
  }

  face(s) { const a = Math.atan2(-s.nx, -s.nz); this.player.facing = a; this.player.root.rotation.y = a; if (this.cam) this.cam.yaw = a + Math.PI; }

  /** spray-paint particles from the can to the wall */
  mist(s, color) {
    const N = 160, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), seeds = new Float32Array(N);
    for (let i = 0; i < N; i++) seeds[i] = Math.random();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; this.scene.add(pts);
    const hand = this.player.body.pos.clone(); hand.y += 1.45;
    return {
      update: (k, tan) => {
        const tx = s.x + tan.x * (k - 0.5) * PW, tz = s.z + tan.z * (k - 0.5) * PW;
        for (let i = 0; i < N; i++) {
          const f = (seeds[i] + performance.now() / 380) % 1, sp = 0.35 * f;
          pos[i * 3] = hand.x + (tx - hand.x) * f + (Math.sin(i * 12.9) * sp);
          pos[i * 3 + 1] = hand.y + (s.y + Math.sin(i * 3.1 + k * 9) * 0.5 - hand.y) * f + Math.cos(i * 7.7) * sp * 0.6;
          pos[i * 3 + 2] = hand.z + (tz - hand.z) * f + (Math.cos(i * 5.3) * sp);
        }
        geo.attributes.position.needsUpdate = true; mat.opacity = 0.85 * (1 - Math.max(0, k - 0.85) / 0.15);
      },
      done: () => { this.scene.remove(pts); geo.dispose(); mat.dispose(); },
    };
  }

  // ---------------------------------------------------------------- the share card (no X API: the player posts it)
  shareUrl(spot) { return `${location.origin}/?spot=${encodeURIComponent(spot)}&utm_source=x&utm_medium=share&utm_campaign=spray`; }

  async makeCard(s, tag, overwrote, touched) {
    const tan = new THREE.Vector3(-s.nz, 0, s.nx);
    const from = new THREE.Vector3(s.x + s.nx * 5.6 - tan.x * 0.9, s.y + 0.05, s.z + s.nz * 5.6 - tan.z * 0.9);
    const at = new THREE.Vector3(s.x + tan.x * 0.55, s.y - 0.1, s.z + tan.z * 0.55);
    const cw = 1200, chh = 628, c = document.createElement('canvas'); c.width = cw; c.height = chh; const g = c.getContext('2d');
    let shot = null; try { shot = this.capture(from, at); } catch (_) { shot = null; }
    let ok = false;
    if (shot) { g.drawImage(shot, 0, 0, cw, chh); try { const d = g.getImageData(0, 0, cw, chh).data; let sum = 0; for (let i = 0; i < d.length; i += 4 * 997) sum += d[i] + d[i + 1] + d[i + 2]; ok = sum / (d.length / (4 * 997)) > 20; } catch (_) { ok = true; } }
    if (!ok) {   // couldn't photograph the scene: a painted wall instead
      const gr = g.createLinearGradient(0, 0, 0, chh); gr.addColorStop(0, '#2a1a4a'); gr.addColorStop(1, '#0b0618'); g.fillStyle = gr; g.fillRect(0, 0, cw, chh);
      g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 3; for (let y = 40; y < chh; y += 46) { g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke(); for (let x = (y / 46) % 2 ? 0 : 60; x < cw; x += 120) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 46); g.stroke(); } }
      const art = document.createElement('canvas'); art.width = W; art.height = H; paintTag(art.getContext('2d'), tag, { avatarImg: await loadAvatar(tag.avatar), district: this.zoneLabel(s.zone) });
      g.drawImage(art, (cw - 1000) / 2, 40, 1000, 562);
    }
    // overlay: logo top-left, handle + district bottom-left, link bottom-right
    const fade = g.createLinearGradient(0, chh - 210, 0, chh); fade.addColorStop(0, 'rgba(7,4,15,0)'); fade.addColorStop(1, 'rgba(7,4,15,.92)'); g.fillStyle = fade; g.fillRect(0, chh - 210, cw, 210);
    const top = g.createLinearGradient(0, 0, 0, 110); top.addColorStop(0, 'rgba(7,4,15,.75)'); top.addColorStop(1, 'rgba(7,4,15,0)'); g.fillStyle = top; g.fillRect(0, 0, cw, 110);
    g.save(); g.translate(36, 70); g.transform(1, 0, -0.1, 1, 0, 0); g.font = '400 52px "Permanent Marker", cursive'; g.fillStyle = '#7cff3d'; g.shadowColor = 'rgba(124,255,61,.8)'; g.shadowBlur = 18; g.fillText('BAGVERSE', 0, 0);
    const lw = g.measureText('BAGVERSE').width; g.shadowBlur = 0; g.font = '700 22px Rajdhani, sans-serif'; g.fillStyle = '#fff'; g.fillText('ALPHA', lw + 14, -26); g.restore();
    const av = await loadAvatar(tag.avatar), ax = 92, ay = chh - 92;
    g.save(); g.fillStyle = '#fff'; g.beginPath(); g.arc(ax, ay, 56, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(ax, ay, 50, 0, Math.PI * 2); g.clip();
    if (av) g.drawImage(av, ax - 50, ay - 50, 100, 100); else { const cc = TAG_COLORS[cleanStyle(tag.style).c]; g.fillStyle = cc; g.fillRect(ax - 50, ay - 50, 100, 100); g.fillStyle = dark(cc) ? '#fff' : '#120a1e'; g.textAlign = 'center'; g.font = '700 60px Rajdhani, sans-serif'; g.fillText((tag.handle[0] || '?').toUpperCase(), ax, ay + 21); } g.restore();
    g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = '700 58px Rajdhani, sans-serif'; g.fillText('@' + tag.handle, 168, chh - 92);
    g.font = '700 28px Rajdhani, sans-serif'; g.fillStyle = '#7cff3d';
    g.fillText((touched ? 'STILL HOLDING ' : overwrote ? `TOOK THIS WALL FROM @${overwrote} · ` : 'TAGGED ') + this.zoneLabel(s.zone).toUpperCase(), 168, chh - 50);
    g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '700 26px Rajdhani, sans-serif'; g.fillText(touched || overwrote ? 'YOUR MOVE →' : 'COME TAKE IT →', cw - 36, chh - 92);
    g.fillStyle = '#fff'; g.font = '700 30px Rajdhani, sans-serif'; g.fillText(location.host, cw - 36, chh - 50);
    return c;
  }

  async shareCard(s, tag, overwrote, touched) {
    const canvas = await this.makeCard(s, tag, overwrote, touched);
    const blob = await new Promise((ok) => { try { canvas.toBlob(ok, 'image/png'); } catch (_) { ok(null); } });
    const url = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
    const zone = this.zoneName(s.zone);
    const lines = touched ? [`Still holding ${zone} in BagVerse 🎨`, `Touched up my tag at ${zone}. Still mine.`]
      : overwrote ? [`Sprayed over @${overwrote} at ${zone} 😤 Your move.`, `${zone} is mine now. Sorry @${overwrote} 🎨`]
      : [`Just tagged ${zone} in BagVerse 🎨 Come take it.`, `My name's on the wall at ${zone}. Spray over me if you can.`, `Left my mark in ${zone} 🎨 Who's taking it?`];
    this.shareText = lines[Math.floor(Math.random() * lines.length)];
    const file = blob ? new File([blob], `bagverse-${s.id}.png`, { type: 'image/png' }) : null;
    const canShareFile = !!(file && navigator.canShare?.({ files: [file] }));
    this.hud.modal('🎨 YOUR TAG', `
      <img class="tg-card" alt="Your tag" src="${url}">
      <div class="tg-btns"><button id="tg-share">${canShareFile ? 'SHARE' : 'POST ON 𝕏'}</button><button class="ghost" id="tg-save">SAVE IMAGE</button><button class="ghost" id="tg-link">COPY LINK</button></div>
      <p class="tg-note" id="tg-hint">${canShareFile ? 'Share the picture to 𝕏 or anywhere.' : 'Opens 𝕏 with your post ready. The picture is copied too: paste it in (Ctrl/⌘ + V).'} You post it yourself; nothing is posted for you.</p>`);
    const hint = document.getElementById('tg-hint');
    document.getElementById('tg-share').onclick = async () => {
      if (canShareFile) { try { await navigator.share({ files: [file], text: this.shareText, url: this.shareUrl(s.id) }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
      let copied = false;
      if (blob && navigator.clipboard?.write && window.ClipboardItem) { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); copied = true; } catch (_) {} }
      this.openIntent(this.shareText, s.id);
      hint.textContent = copied ? 'Picture copied: paste it into your post (Ctrl/⌘ + V).' : 'Save the image and add it to your post.';
    };
    document.getElementById('tg-save').onclick = () => { const a = document.createElement('a'); a.href = url; a.download = `bagverse-${s.id}.png`; document.body.appendChild(a); a.click(); a.remove(); };
    document.getElementById('tg-link').onclick = async () => { try { await navigator.clipboard.writeText(this.shareUrl(s.id)); hint.textContent = 'Link copied.'; } catch (_) { hint.textContent = this.shareUrl(s.id); } };
  }

  openIntent(text, spot) {
    const u = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(this.shareUrl(spot))}`;
    window.open(u, '_blank', 'noopener');
  }

  // ---------------------------------------------------------------- per frame / map
  update() {
    if (!this.enabled) return;
    const now = Date.now();
    if (!this.fadeT || now - this.fadeT > 60e3) { this.fadeT = now; for (const s of TAG_SPOTS) if (!this.busy) this.paint(s.id); }
  }
  marks() {
    if (!this.enabled) return [];
    return TAG_SPOTS.map((s) => { const r = this.rows.get(s.id), st = tagState(r); return { x: s.x, z: s.z, shape: 'tag', color: !st.live ? '#ffffff' : r.owner === this.uid ? '#7cff3d' : '#ff3dd2' }; });
  }
  /** ?spot=<id>: arrive in front of that wall (share-card links) */
  arrive(id) {
    const s = spotById(id); if (!s || !this.enabled) return false;
    const x = s.x + s.nx * 4.5, z = s.z + s.nz * 4.5, y = this.world.physics.groundAt(x, z, s.y + 1);
    this.player.teleport(new THREE.Vector3(x, y + 0.05, z));
    this.face(s);
    const r = this.rows.get(s.id);
    setTimeout(() => { const rr = this.rows.get(s.id), st = tagState(rr); this.hud.toast(st.live ? `@${rr.handle.toUpperCase()}'S WALL · ${this.zoneLabel(s.zone).toUpperCase()} · SPRAY OVER IT (E)` : `SPRAY SPOT · ${this.zoneLabel(s.zone).toUpperCase()} · TAG IT (E)`); }, r ? 400 : 2500);
    return true;
  }
}
