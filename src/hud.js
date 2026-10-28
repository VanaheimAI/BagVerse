// HUD: progression (local preview of on-chain skin stats), minimap, map, chat, prompts, modals.
const $ = (id) => document.getElementById(id);

import { xpToNext, Progress, HOLDER_TIERS, TIERS } from './progression.js';
export { Progress, HOLDER_TIERS };

export class HUD {
  constructor(world, progress) {
    this.world = world; this.p = progress;
    this.mini = $('minimap').getContext('2d');
    this.toastT = 0; this.zoneT = 0; this.lastZone = null;
    this.chatOpen = false;
    this.onSend = null; this.onTravel = null;
    this.modalOpen = false;
    this.bakeMap();

    const chatin = $('chatin');
    chatin.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = chatin.value.trim(); chatin.value = ''; chatin.blur();
        if (v) this.onSend?.(v);
        e.stopPropagation();
      } else if (e.key === 'Escape') chatin.blur();
    });
    chatin.addEventListener('focus', () => $('hud').classList.add('chat-open'));
    chatin.addEventListener('blur', () => $('hud').classList.remove('chat-open'));
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.closeModal(); this.closeMap(); $('emotewheel').hidden = true; return; }
      if (this.modalOpen) { if (e.key === 'Enter' || e.code === 'KeyE') { this.closeModal(); e.preventDefault(); } return; }
      if (e.key === 'Enter' && document.activeElement !== chatin) { chatin.focus(); e.preventDefault(); }
    });
    $('mclose').onclick = () => this.closeModal();
    $('bigmapcv').addEventListener('click', (e) => this.mapClick(e));
    document.querySelectorAll('#actions button').forEach((b) => b.addEventListener('click', () => this.onAction?.(b.dataset.act)));
    document.querySelectorAll('#emotewheel button').forEach((b) => b.addEventListener('click', () => { this.onEmote?.(b.dataset.emote); $('emotewheel').hidden = true; }));
  }

  get typing() { return document.activeElement === $('chatin'); }

  // ---------- map rendering (bake static layer once)
  bakeMap() {
    const S = 900, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), k = S / 400;        // world -200..200
    const X = (x) => (x + 200) * k, Y = (z) => (z + 200) * k;
    g.fillStyle = '#0b0818'; g.fillRect(0, 0, S, S);
    const zoneFill = { doge_park: '#1e4a16', swamp: '#123d10', rekt: '#3a2a1a', bull_run: '#4a3a10', copium: '#262230', hodl_heights: '#1e3a18', arcade: '#2a1238', gm_gate: '#1a1430' };
    for (const z of this.world.zones) {
      const f = zoneFill[z.id]; if (!f) continue;
      g.fillStyle = f; g.beginPath(); g.arc(X(z.pos.x), Y(z.pos.z), z.radius * k * 1.05, 0, Math.PI * 2); g.fill();
    }
    // avenues (4 lanes, |c| < 8 m) + sidewalks
    g.fillStyle = '#2a2440';
    g.fillRect(X(-11), 0, 22 * k, S); g.fillRect(0, Y(-11), S, 22 * k);
    // FOMO valley
    g.strokeStyle = '#ff3b3b'; g.lineWidth = 14 * k; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(X(75), Y(-62)); g.lineTo(X(200), Y(-62)); g.stroke(); g.globalAlpha = 1;
    // The Bag Square: ring road, plaza, hub (world x/z; Blender y = -z)
    const rect = (x0, z0, x1, z1, fill) => { g.fillStyle = fill; g.fillRect(X(x0), Y(z0), (x1 - x0) * k, (z1 - z0) * k); };
    rect(-42, -42, 42, 42, '#3a3550');      // outer sidewalk
    rect(-39, -39, 39, 39, '#1e1c2b');      // ring road
    rect(-23, -23, 23, 23, '#4a4566');      // plaza sidewalk
    rect(-20, -20, 20, 20, '#2b1f4a');      // plaza
    g.strokeStyle = '#ff007f'; g.lineWidth = 2; g.strokeRect(X(-23), Y(-23), 46 * k, 46 * k);
    g.fillStyle = '#00f0ff'; g.beginPath(); g.moveTo(X(0), Y(-12)); g.lineTo(X(12), Y(0)); g.lineTo(X(0), Y(12)); g.lineTo(X(-12), Y(0)); g.closePath(); g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1;
    // hero buildings
    rect(-6.5, -59.5, 6.5, -46.5, '#5d6a86');     // central media tower
    rect(-22, -58, -12, -48, '#6a5a8a'); rect(12, -58, 22, -48, '#6a5a8a');   // spires
    rect(-58, -34, -42, -12, '#6b2440');          // Ad Canyon
    rect(42, -32, 60, -12, '#d6d4e0');            // plinth
    rect(46, -30, 61, -14, '#c8462e');            // Wano Vault (landmarks.js)
    g.save(); g.translate(X(108), Y(133)); g.rotate(Math.atan2(108 / Math.hypot(108, 133), -133 / Math.hypot(108, 133))); g.fillStyle = '#e03a3a'; g.fillRect(-12 * k, -9 * k, 24 * k, 18 * k); g.restore();   // Kanto Vault (Bull Run plaza)
    g.fillStyle = '#ff007f'; g.beginPath(); g.arc(X(0), Y(31), 4 * k, 0, Math.PI * 2); g.fill();   // crystal
    for (const p of this.world.portals) { g.fillStyle = p.userData.color; g.beginPath(); g.arc(X(p.userData.center.x), Y(p.userData.center.z), 4 * k, 0, Math.PI * 2); g.fill(); }
    this.mapBase = c;
    // labelled version for the big map
    const L = document.createElement('canvas'); L.width = L.height = S; const lg = L.getContext('2d');
    lg.drawImage(c, 0, 0);
    lg.textAlign = 'center'; lg.font = '700 22px Rajdhani, sans-serif';
    for (const z of this.world.zones) {
      if (['trading_floor', 'crystal', 'central_tower'].includes(z.id)) continue;
      lg.fillStyle = z.color; lg.shadowColor = '#000'; lg.shadowBlur = 6;
      lg.fillText(z.label, X(z.pos.x), Y(z.pos.z));
    }
    this.mapLabeled = L; this.mapK = k;
  }

  drawMinimap(player, npcs, yaw, car = null, marks = []) {
    const g = this.mini, W = 200, k = this.mapK, scale = 1.6; // px per map px
    g.save(); g.clearRect(0, 0, W, W);
    g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.clip();
    g.translate(W / 2, W / 2); g.rotate(yaw); g.scale(scale, scale);
    g.translate(-(player.x + 200) * k, -(player.z + 200) * k);
    g.drawImage(this.mapBase, 0, 0);
    g.fillStyle = '#ffffff';
    for (const n of npcs) { g.beginPath(); g.arc((n.body.pos.x + 200) * k, (n.body.pos.z + 200) * k, 3, 0, Math.PI * 2); g.fill(); }
    for (const m of marks) {   // points of interest: RWA kiosks (gold diamond), nearby Bags (dot), guide target (ring)
      const x = (m.x + 200) * k, y = (m.z + 200) * k;
      g.fillStyle = m.color; g.strokeStyle = m.color;
      if (m.shape === 'diamond') { g.beginPath(); g.moveTo(x, y - 4.5); g.lineTo(x + 3.5, y); g.lineTo(x, y + 4.5); g.lineTo(x - 3.5, y); g.closePath(); g.fill(); }
      else if (m.shape === 'tag') { g.save(); g.translate(x, y); g.rotate(-0.35); g.fillRect(-4, -2.5, 8, 5); g.strokeStyle = '#120a1e'; g.lineWidth = 1; g.strokeRect(-4, -2.5, 8, 5); g.restore(); }   // Spray Spot (white free, green yours, pink taken)
      else if (m.shape === 'ring') { g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.stroke(); }
      else { g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill(); }
    }
    if (car && !car.driving) {   // the parked car: a gold body outline, so players can find it
      g.save(); g.translate((car.pos.x + 200) * k, (car.pos.z + 200) * k); g.rotate(-car.h);
      g.fillStyle = '#ffc83d'; g.shadowColor = '#ffc83d'; g.shadowBlur = 6;
      g.beginPath(); g.roundRect(-3.4, -6.2, 6.8, 12.4, 2.4); g.fill();
      g.fillStyle = '#0b0618'; g.fillRect(-2.2, 0.8, 4.4, 2.6);   // windscreen toward the nose
      g.restore();
    }
    g.restore();
    // player arrow (camera-up)
    g.save(); g.translate(W / 2, W / 2); g.rotate(-(player.facing - Math.PI) + yaw);
    g.fillStyle = '#7cff3d'; g.shadowColor = '#7cff3d'; g.shadowBlur = 8;
    g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.restore();
  }

  openMap(player, mates = []) {
    $('bigmap').hidden = false;
    const g = $('bigmapcv').getContext('2d'), k = this.mapK;
    g.drawImage(this.mapLabeled, 0, 0);
    this.mates = mates;
    for (const m of mates) {   // teammates: cyan dot + name; click one to travel to them
      const x = (m.x + 200) * k, y = (m.z + 200) * k;
      g.fillStyle = '#3dfff0'; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#071018'; g.lineWidth = 2; g.stroke();
      g.font = '700 20px Rajdhani, sans-serif'; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.8)';
      g.strokeText(m.name, x, y - 14); g.fillStyle = '#3dfff0'; g.fillText(m.name, x, y - 14);
    }
    g.fillStyle = '#7cff3d'; g.beginPath(); g.arc((player.x + 200) * k, (player.z + 200) * k, 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
  }
  closeMap() { $('bigmap').hidden = true; }
  get mapOpen() { return !$('bigmap').hidden; }
  mapClick(e) {
    const r = e.target.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 400 - 200, z = ((e.clientY - r.top) / r.height) * 400 - 200;
    const mate = (this.mates || []).map((m) => [m, Math.hypot(m.x - x, m.z - z)]).sort((a, b) => a[1] - b[1])[0];
    if (mate && mate[1] < 9) { this.closeMap(); this.onGoToMate?.(mate[0]); return; }   // click a teammate: go to them
    let best = null, bd = 1e9;
    for (const zn of this.world.zones) { const d = Math.hypot(zn.pos.x - x, zn.pos.z - z); if (d < bd) { bd = d; best = zn; } }
    if (best && bd < Math.max(best.radius, 25)) { this.closeMap(); this.onTravel?.(best); }
  }

  // ---------- stats
  updateStats(playing) {
    const s = this.p.s;
    const cost = xpToNext(s.level), vt = this.p.visual;
    $('lvl').textContent = 'L' + s.level; $('lvl').style.borderColor = vt.color;
    $('xpfill').style.width = Math.min(100, (s.xp / cost) * 100) + '%';
    const rf = $('restfill');   // rested XP: the stretch of this level that play XP will cover double
    if (rf) { const w = Math.min(100 - (s.xp / cost) * 100, (s.rested / cost) * 100); rf.style.left = Math.min(100, (s.xp / cost) * 100) + '%'; rf.style.width = Math.max(0, w) + '%'; }
    $('ptfill').style.width = (s.playSec / 60) * 100 + '%';
    const [, name, range] = this.p.tier;
    $('tiername').textContent = name; $('tierrange').textContent = `${vt.label} · ${range}`;
    $('bagbal').textContent = s.bag.toLocaleString();
    const ps = $('playstate');
    ps.textContent = playing ? `PROOF-OF-PLAY · ACTIVE · ${s.playMin} MIN` : 'IDLE · PLAYTIME PAUSED';
    ps.classList.toggle('idle', !playing);
  }

  zone(z) {
    $('zonechip').textContent = z.label; $('zonechip').style.color = z.color;
    if (this.lastZone !== z.id) {
      this.lastZone = z.id;
      const el = $('zonetoast'); el.textContent = z.label; el.style.color = z.color;
      el.classList.add('show'); this.zoneT = 2.8;
    }
  }

  /** big centre messages queue up instead of overwriting each other */
  toast(msg) {
    this.toastQ ||= [];
    if (this.toastT > 0) {
      if (/^LEVEL /.test(msg)) this.toastQ = this.toastQ.filter((m) => !/^LEVEL /.test(m));   // only the newest level-up waits
      if (this.toastQ.length < 4 && !this.toastQ.includes(msg)) this.toastQ.push(msg);
      return;
    }
    const el = $('toast'); el.textContent = msg; el.classList.add('show'); this.toastT = 2.2;
  }
  prompt(html) { const el = $('prompt'); if (html) { el.innerHTML = html; el.style.display = 'block'; } else el.style.display = 'none'; }
  watch(frac) {
    const el = $('watch');
    if (frac === null) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    $('watcharc').style.strokeDashoffset = String(94.25 * (1 - frac));
  }

  chat(tag, name, msg, color = '#c37bff') {
    const log = $('chatlog');
    const d = document.createElement('div');
    const n = document.createElement('span'); n.className = 'n'; n.style.color = color; n.textContent = `[${tag}] ${name}: `;
    d.append(n, document.createTextNode(msg));
    log.append(d);
    while (log.children.length > 9) log.firstChild.remove();
  }

  modal(title, html) {
    $('mtitle').textContent = title; $('mbody').innerHTML = html; $('modal').hidden = false; this.modalOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  closeModal() { $('modal').hidden = true; this.modalOpen = false; }

  update(dt) {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) { $('toast').classList.remove('show'); this.toastT = -0.35; }
    else if (this.toastT < 0 && (this.toastT += dt) >= 0) { this.toastT = 0; const m = this.toastQ?.shift(); if (m) this.toast(m); }
    if (this.zoneT > 0 && (this.zoneT -= dt) <= 0) $('zonetoast').classList.remove('show');
  }
}
