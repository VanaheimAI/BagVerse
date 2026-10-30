// PUMPKIN RUSH (Halloween Arena, the old APEX arena ring at Chad's Bull Run).
// A 3-minute night round: grab glowing jack-o'-lanterns scattered over the ring. Orange = 1, gold = 5.
// Rotten pumpkins are rug pulls: you freeze for 2 s and drop a quarter of your haul.
// Solo = you vs 4 pumpkin-hungry bots; match = everyone who joins in 15 s (same seed, so the same pumpkins appear
// in the same places for everyone; each player collects their own copy, the board ranks hauls).
// XP like the other mini-games (full value for the first 10 rounds a day).
import * as THREE from 'three';
import { makeCharacter } from '../player.js';
import { weekKey, dayKey } from '../progression.js';
import { seeded } from './bagrun.js';

export const PUMPKIN_SITE = { x: 145, z: 155, r: 26 };
const DURATION = 180, LIVE = 34, RESPAWN = [2.5, 5], FREEZE = 2, REACH = 1.35;
const KINDS = { orange: { w: 0.72, pts: 1 }, gold: { w: 0.1, pts: 5 }, rotten: { w: 0.18, pts: 0 } };
const BOT_NAMES = ['PumpkinPete', 'GhoulGwen', 'CandyCorn', 'BatBoy', 'WitchWendy', 'SpookySam', 'MummyMo', 'CreepCarl'];
const UP = new THREE.Vector3(0, 1, 0);

/** jack-o'-lantern face (emissive map) on a ribbed pumpkin */
export function pumpkinGeometry() {
  const g = new THREE.SphereGeometry(0.42, 24, 16), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), rib = 1 + 0.07 * Math.cos(a * 8);
    v.x *= rib * 1.12; v.z *= rib * 1.12; v.y *= 0.82;
    p.setXYZ(i, v.x, v.y + 0.36, v.z);
  }
  g.computeVertexNormals(); return g;
}
export function faceTexture(rotten) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256);
  if (!rotten) {   // the face sits at u ~0.25 (the side facing +x... rotated per instance)
    g.fillStyle = '#ffd25a';
    const cx = 128, cy = 118;
    g.beginPath(); g.moveTo(cx - 44, cy - 10); g.lineTo(cx - 22, cy - 40); g.lineTo(cx - 8, cy - 8); g.fill();
    g.beginPath(); g.moveTo(cx + 44, cy - 10); g.lineTo(cx + 22, cy - 40); g.lineTo(cx + 8, cy - 8); g.fill();
    g.beginPath(); g.moveTo(cx - 54, cy + 14); for (let k = 0; k <= 6; k++) g.lineTo(cx - 54 + k * 18, cy + 14 + (k % 2 ? 22 : 38)); g.lineTo(cx + 54, cy + 14); g.quadraticCurveTo(cx, cy + 34, cx - 54, cy + 14); g.fill();
  } else { g.fillStyle = '#3a5a1a'; for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(Math.random() * 512, Math.random() * 256, 4 + Math.random() * 12, 0, 6.3); g.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class PumpkinRush {
  constructor({ scene, world, player, progress, quests, sfx, hud, ui, getChars }) {
    Object.assign(this, { scene, world, player, progress, quests, sfx, hud, ui, getChars });
    this.active = false; this.state = 'idle'; this.frozen = false;
  }
  get S() { const s = this.progress.s; s.mg ||= {}; s.mg.pumpkin ||= { best: 0, games: 0, wins: 0, weekBest: 0, week: null, today: 0, day: null, golds: 0 }; return s.mg.pumpkin; }

  /** open ground inside the ring (found once; the same list on every client, so a seed means the same layout) */
  spots() {
    if (this._spots) return this._spots;
    const ph = this.world.physics, out = [], o = new THREE.Vector3(), d = new THREE.Vector3(), rnd = seeded(20261031);
    for (let k = 0; k < 2500 && out.length < 260; k++) {
      const a = rnd() * Math.PI * 2, r = 2 + Math.sqrt(rnd()) * (PUMPKIN_SITE.r - 2), x = PUMPKIN_SITE.x + Math.cos(a) * r, z = PUMPKIN_SITE.z + Math.sin(a) * r;
      const g = ph.groundAt(x, z, 8); if (g < -0.5 || g > 1.8) continue;
      o.set(x, g + 0.6, z); if (ph.raycast(o, UP, 6) < 6) continue;
      let ok = true; for (let j = 0; j < 6 && ok; j++) { const b = (j / 6) * Math.PI * 2; d.set(Math.cos(b), 0, Math.sin(b)); if (ph.raycast(o, d, 0.9) < 0.9) ok = false; }
      if (!ok || out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 2.2 * 2.2)) continue;
      out.push(new THREE.Vector3(x, g, z));
    }
    return (this._spots = out);
  }

  build() {
    if (this.group) return;
    this.group = new THREE.Group(); this.group.visible = false; this.scene.add(this.group);
    const geo = pumpkinGeometry(), stemGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.22, 6).translate(0, 0.78, 0);
    const lit = faceTexture(false), rot = faceTexture(true);
    const mats = {
      orange: new THREE.MeshStandardMaterial({ color: '#ff7a12', roughness: 0.55, emissive: '#ffb030', emissiveMap: lit, emissiveIntensity: 2.2 }),
      gold: new THREE.MeshStandardMaterial({ color: '#ffd23d', roughness: 0.25, metalness: 0.7, emissive: '#fff0a0', emissiveMap: lit, emissiveIntensity: 2.6 }),
      rotten: new THREE.MeshStandardMaterial({ color: '#6b5a2a', roughness: 0.9, emissive: '#7cff3d', emissiveMap: rot, emissiveIntensity: 0.6 }),
    };
    const stemMat = new THREE.MeshStandardMaterial({ color: '#3d5a1c', roughness: 0.8 });
    this.mesh = {}; this.stem = {};
    for (const k of Object.keys(KINDS)) {
      this.mesh[k] = new THREE.InstancedMesh(geo, mats[k], LIVE); this.stem[k] = new THREE.InstancedMesh(stemGeo, stemMat, LIVE);
      for (const m of [this.mesh[k], this.stem[k]]) { m.frustumCulled = false; m.castShadow = true; this.group.add(m); }
    }
    // a few lights so the ring glows at night (cheap: 3 warm points)
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2, L = new THREE.PointLight('#ff8a2a', 18, 30, 1.6); L.position.set(PUMPKIN_SITE.x + Math.cos(a) * 12, 4, PUMPKIN_SITE.z + Math.sin(a) * 12); this.group.add(L); }
  }

  kindOf(r) { return r < KINDS.orange.w ? 'orange' : r < KINDS.orange.w + KINDS.gold.w ? 'gold' : 'rotten'; }
  /** place pumpkin slot i at its next spot (deterministic per seed: slot + generation) */
  respawn(p, T) {
    const spots = this.spots(), r = seeded((this.seed ^ Math.imul(p.slot + 1, 2654435761) ^ Math.imul(p.gen + 1, 40503)) >>> 0);
    p.gen++; p.pos = spots[Math.floor(r() * spots.length)]; p.kind = this.kindOf(r()); p.yaw = r() * 6.28; p.alive = true; p.born = T;
  }

  begin(onEnd, race = null) {
    if (this.active) return;
    this.build(); const spots = this.spots();
    if (spots.length < 40) { this.hud.toast('PUMPKIN RUSH IS UNAVAILABLE HERE'); return; }
    this.race = race; this.onEnd = onEnd; this.seed = (race ? race.seed : (Math.random() * 4294967295)) >>> 0;
    this.clock = 0; this.left = DURATION; this.haul = 0; this.golds = 0; this.rotten = 0; this.frozen = false; this.freezeT = 0;
    this.pumps = Array.from({ length: LIVE }, (_, slot) => ({ slot, gen: 0, alive: false, back: 0 }));
    for (const p of this.pumps) this.respawn(p, 0);
    // bots (solo)
    this.bots = [];
    if (!race) {
      const chars = this.getChars().filter(Boolean), rnd = seeded(this.seed ^ 77);
      for (let k = 0; k < 4 && chars.length; k++) {
        const c = makeCharacter(chars[(k * 5 + Math.floor(rnd() * chars.length)) % chars.length], { shadow: true });
        const s = spots[Math.floor(rnd() * spots.length)];
        const body = { pos: s.clone().setY(s.y + 0.2), vel: new THREE.Vector3(), onGround: false, radius: 0.38, height: 1.7 };
        c.root.position.copy(body.pos); this.group.add(c.root);
        this.bots.push({ c, body, name: BOT_NAMES[(k * 3 + Math.floor(rnd() * 8)) % 8], haul: 0, target: null, think: 0, facing: 0, frozen: 0, speed: 4.6 + rnd() * 1.4, sloppy: 0.06 + rnd() * 0.12 });
      }
    }
    this.group.visible = true;
    this.returnTo = this.player.body.pos.clone();
    const s0 = spots[Math.floor(Math.random() * spots.length)];
    this.player.teleport(s0.clone().setY(s0.y + 0.1));
    this.player.facing = Math.atan2(PUMPKIN_SITE.x - s0.x, PUMPKIN_SITE.z - s0.z); this.player.root.rotation.y = this.player.facing; this.player.emote = null;
    this.active = true; this.state = 'countdown'; this.t = race ? Math.max(1, (race.at - Date.now()) / 1000) : 3.2;
    this.ui.show(); this.ui.labels(['HAUL', 'RANK', 'GOLD']); this.ui.set({ time: DURATION, a: 0, b: '–', c: 0 }); this.ui.countdown(Math.ceil(this.t));
    this.ui.route((race ? 'MATCH · ' : 'VS BOTS · ') + 'GRAB PUMPKINS · AVOID THE ROTTEN ONES'); this.ui.board(null);
    this.sfx.play('whoosh'); this.sfx.music?.('bagrun');
    this.render();
  }

  rivals() { return this.race ? this.rivalList || [] : []; }
  standings() {
    return [{ name: 'You', score: this.haul, me: true }].concat(this.bots.map((b) => ({ name: b.name, score: b.haul })), this.rivals().map((r) => ({ name: r.name, score: r.score })))
      .sort((a, b) => b.score - a.score);
  }

  /** someone (me or a bot) reached pumpkin p */
  take(p, who, T) {
    p.alive = false; p.back = T + RESPAWN[0] + Math.random() * (RESPAWN[1] - RESPAWN[0]);
    const k = p.kind;
    if (who === 'me') {
      if (k === 'rotten') {
        const lost = Math.ceil(this.haul * 0.25); this.haul -= lost; this.rotten++; this.frozen = true; this.freezeT = FREEZE;
        this.player.body.vel.set(0, 0, 0); this.sfx.play('error'); this.ui.pop(lost ? `RUG PULL! −${lost} 🎃 · FROZEN` : 'RUG PULL! · FROZEN');
      } else {
        this.haul += KINDS[k].pts; if (k === 'gold') { this.golds++; this.sfx.play('tier'); this.ui.pop('GOLD PUMPKIN +5'); } else this.sfx.play('coin', { rate: 0.9 + Math.random() * 0.2 });
      }
    } else if (k === 'rotten') { who.haul -= Math.ceil(who.haul * 0.25); who.frozen = FREEZE; }
    else who.haul += KINDS[k].pts;
  }

  update(dt) {
    if (!this.active) return;
    const T = (this.clock += dt);
    if (this.state === 'countdown') {
      const before = Math.ceil(this.t); this.t = this.race ? (this.race.at - Date.now()) / 1000 : this.t - dt; const now = Math.ceil(this.t);
      if (now !== before && now > 0) { this.ui.countdown(now); this.sfx.play('tap'); }
      if (this.t <= 0) { this.state = 'run'; this.ui.countdown('GO!'); this.sfx.play('levelup'); }
      this.animBots(dt, true); this.render(); return;
    }
    if (this.state !== 'run') return;
    this.left -= dt;
    if (this.frozen && (this.freezeT -= dt) <= 0) this.frozen = false;
    for (const p of this.pumps) if (!p.alive && T >= p.back) this.respawn(p, T);
    const P = this.player.body.pos;
    if (!this.frozen) for (const p of this.pumps) {
      if (!p.alive || Math.abs(p.pos.y - P.y) > 2 || (p.pos.x - P.x) ** 2 + (p.pos.z - P.z) ** 2 > REACH * REACH) continue;
      this.take(p, 'me', T);
    }
    for (const b of this.bots) this.botStep(b, dt, T);
    this.animBots(dt, false);
    this.render();
    const st = this.standings(), rank = st.findIndex((r) => r.me) + 1;
    this.ui.set({ time: Math.max(0, Math.ceil(this.left)), a: this.haul, b: st.length > 1 ? `#${rank}` : '–', c: this.golds });
    if ((this.boardT = (this.boardT || 0) + dt) > 0.5) { this.boardT = 0; this.ui.board(st.map((r) => ({ name: r.name, score: r.score, me: r.me }))); }
    if (this.left <= 0) this.finish();
  }

  botStep(b, dt, T) {
    const body = b.body;
    if (b.frozen > 0) { b.frozen -= dt; body.vel.x = body.vel.z = 0; this.world.physics.step(body, dt); return; }
    if ((b.think -= dt) <= 0) {
      b.think = 0.4 + Math.random() * 0.5;
      let best = null, bs = 1e9;
      for (const p of this.pumps) {
        if (!p.alive) continue;
        const bad = p.kind === 'rotten' && Math.random() > b.sloppy;   // usually spots the rotten ones
        if (bad) continue;
        const d = Math.hypot(p.pos.x - body.pos.x, p.pos.z - body.pos.z) - (p.kind === 'gold' ? 6 : 0) + Math.random() * 3;
        if (d < bs) { bs = d; best = p; }
      }
      b.target = best;
    }
    let vx = 0, vz = 0;
    if (b.target?.alive) { const dx = b.target.pos.x - body.pos.x, dz = b.target.pos.z - body.pos.z, L = Math.hypot(dx, dz); if (L > 0.2) { vx = dx / L * b.speed; vz = dz / L * b.speed; } if (L < REACH) this.take(b.target, b, T); }
    else b.think = 0;
    const k = 1 - Math.exp(-10 * dt); body.vel.x += (vx - body.vel.x) * k; body.vel.z += (vz - body.vel.z) * k;
    this.world.physics.step(body, dt);
    if (Math.hypot(body.pos.x - PUMPKIN_SITE.x, body.pos.z - PUMPKIN_SITE.z) > PUMPKIN_SITE.r + 6 || body.pos.y < -5) { const s = this.spots()[0]; body.pos.copy(s); body.vel.set(0, 0, 0); }
  }
  animBots(dt, frozen) {
    for (const b of this.bots) {
      const v = b.body.vel, sp = frozen || b.frozen > 0 ? 0 : Math.hypot(v.x, v.z);
      if (sp > 0.3) { const want = Math.atan2(v.x, v.z); let d = want - b.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); b.facing += d * (1 - Math.exp(-10 * dt)); }
      b.c.root.position.copy(b.body.pos); b.c.root.rotation.y = b.facing;
      if (sp > 3) b.c.play('Run', 0.2, THREE.MathUtils.clamp(sp / 6.6, 0.7, 1.3)); else if (sp > 0.3) b.c.play('Walk', 0.25); else b.c.play('Idle', 0.3);
      b.c.mixer.update(dt);
    }
  }

  render() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), T = this.clock, n = { orange: 0, gold: 0, rotten: 0 };
    for (const p of this.pumps) {
      if (!p.alive) continue;
      const k = p.kind, grow = Math.min(1, (T - p.born) / 0.35), bob = k === 'gold' ? Math.sin(T * 3 + p.slot) * 0.08 + 0.15 : 0;
      q.setFromAxisAngle(UP, p.yaw + (k === 'gold' ? T * 1.5 : 0)); s.setScalar((k === 'gold' ? 1.15 : k === 'rotten' ? 0.92 : 1) * grow); v.set(p.pos.x, p.pos.y + bob, p.pos.z);
      if (k === 'rotten') { s.y *= 0.8; }
      m.compose(v, q, s); this.mesh[k].setMatrixAt(n[k], m); this.stem[k].setMatrixAt(n[k], m); n[k]++;
    }
    for (const k of Object.keys(KINDS)) { this.mesh[k].count = this.stem[k].count = n[k]; this.mesh[k].instanceMatrix.needsUpdate = true; this.stem[k].instanceMatrix.needsUpdate = true; }
  }

  /** nearest good pumpkin (guide beacon / tests) */
  nearest(P) { let best = null, bd = 1e9; for (const p of this.pumps || []) { if (!p.alive || p.kind === 'rotten') continue; const d = p.pos.distanceToSquared(P); if (d < bd) { bd = d; best = p; } } return best?.pos || null; }

  finish(quit = false) {
    if (!this.active) return;
    const S = this.S, wk = weekKey(), dk = dayKey();
    if (S.week !== wk) { S.week = wk; S.weekBest = 0; }
    if (S.day !== dk) { S.day = dk; S.today = 0; }
    const st = this.standings(), place = st.findIndex((r) => r.me) + 1, win = !quit && st.length > 1 && place === 1 && this.haul > 0;
    const score = quit ? 0 : this.haul, pb = score > S.best;
    let xp = 0;
    if (!quit) {
      S.games++; S.today++; if (win) S.wins++; S.golds = (S.golds || 0) + this.golds;
      S.best = Math.max(S.best, score); S.weekBest = Math.max(S.weekBest, score);
      const mult = S.today <= 10 ? 1 : S.today <= 20 ? 0.5 : 0.1;
      xp = this.progress.grant(Math.round((20 + Math.min(40, score * 0.8) + (win ? 15 : 0)) * mult), 'minigame');
      this.quests.emit('minigame', 1, { id: 'pumpkin' }); this.quests.emit('pumpkin', score);
      if (win) this.quests.emit('pumpkin_win', 1);
      this.quests.checkAchievements?.(); this.progress.save();
    }
    this.active = false; this.state = 'idle'; this.frozen = false;
    for (const b of this.bots) this.group.remove(b.c.root);
    this.bots = []; this.group.visible = false;
    this.ui.hide(); this.ui.labels(null);
    if (this.returnTo) this.player.teleport(this.returnTo.clone().setY(this.returnTo.y + 0.1));
    this.sfx.stopMusic?.(1.2); this.sfx.play(quit ? 'whoosh' : win ? 'achieve' : 'success');
    this.onEnd?.({ quit, win, race: this.race, score, golds: this.golds, rotten: this.rotten, place, of: st.length, xp, pb, best: S.best, wins: S.wins, runsToday: S.today, standings: st });
  }
}
