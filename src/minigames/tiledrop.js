// TILE DROP: the second mini-game (TILE DROP portal in the plaza, Doge Park kiosk event).
// Three floors of hex tiles float high above the plaza. A tile you (or anyone) step on flashes and falls half a
// second later; fall through a floor and you land on the next; fall through the last one and you're out.
// Last one standing wins. Solo = you vs 5 bots. Match = everyone who joins in 15 s (same seed, same start), no bots;
// each player's touched tiles go out through multiplayer presence (run.tl), so every screen drops the same tiles.
// Scoring: survival seconds x10, +300 for a win; XP like Bag Run (full value for the first 10 games a day).
import * as THREE from 'three';
import { makeCharacter } from '../player.js';
import { weekKey, dayKey } from '../progression.js';
import { seeded } from './bagrun.js';

export const ARENA = { x: 0, z: 0, y: 215 };       // Tile Drop: top floor height (over the plaza; the tallest tower tops out at ~168 m)
const FLOORS = 3, GAP = 11, N = 6, S = 1.55;       // floors, metres between floors, hex rings, hex radius
const DROP = 0.5, FALL_T = 0.7, MAX_T = 150;
const COLORS = ['#7cff3d', '#3dfff0', '#ff4fd8'];
const SQ3 = Math.sqrt(3);
// GRAVE DROP (Halloween): purple / orange / green rims, moss-grey stone tiles
const GRAVE_COLORS = ['#ff8a00', '#b84dff', '#5dff7a'];
const GRAVE_TINT = ['#c9c3d6', '#b8b1c9', '#a9a3bb'];
const _UP = new THREE.Vector3(0, 1, 0);
let _stone = null;
/** cracked grey stone (shared canvas texture) */
function crackedStone() {
  if (_stone) return _stone;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#7d7a88'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { const v = 90 + Math.random() * 70; g.fillStyle = `rgba(${v},${v - 4},${v + 10},.35)`; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
  g.strokeStyle = 'rgba(25,18,35,.85)'; g.lineWidth = 2.2;
  for (let k = 0; k < 5; k++) { let x = Math.random() * 256, y = Math.random() * 256; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 7; j++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
  g.fillStyle = 'rgba(70,110,60,.35)'; for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 10, 0, 6.3); g.fill(); }   // moss
  _stone = new THREE.CanvasTexture(c); _stone.colorSpace = THREE.SRGBColorSpace; _stone.wrapS = _stone.wrapT = THREE.RepeatWrapping; return _stone;
}

/** after you fall in Grave Drop you float over the graveyard as a ghost until the match ends */
class GhostPhysics {
  constructor(game) { this.g = game; }
  step(body, dt) {
    const g = this.g, R = S * SQ3 * N + 6;
    body.vel.y = 0; body.pos.x += body.vel.x * dt; body.pos.z += body.vel.z * dt;
    const dx = body.pos.x - g.A.x, dz = body.pos.z - g.A.z, d = Math.hypot(dx, dz); if (d > R) { body.pos.x = g.A.x + dx / d * R; body.pos.z = g.A.z + dz / d * R; }
    body.pos.y += (g.fy(0) + 2.6 + Math.sin(g.clock * 2) * 0.3 - body.pos.y) * Math.min(1, dt * 3); body.onGround = true;
  }
  raycast() { return Infinity; }
  groundAt() { return this.g.fy(0); }
}
const BOT_NAMES = ['DegenDan', 'WAGMI_Wen', 'ApeAnon', 'HodlHana', 'PumpPete', 'RugRita', 'MoonMax', 'FudFiona'];
const GRAVE_BOTS = ['GhoulGary', 'Zombae', 'CryptKeeper', 'Banshee', 'Wraith420', 'Skelly', 'VampyVal', 'LichLad'];

// axial hex grid (pointy top)
const HEXES = [];
for (let q = -N; q <= N; q++) for (let r = Math.max(-N, -q - N); r <= Math.min(N, -q + N); r++) HEXES.push([q, r]);
const HEX_INDEX = new Map(HEXES.map(([q, r], i) => [q * 100 + r, i]));
const hexX = (q, r) => S * SQ3 * (q + r / 2), hexZ = (r) => S * 1.5 * r;
function hexAt(x, z) {
  const fq = (SQ3 / 3 * x - z / 3) / S, fr = (2 / 3 * z) / S, fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr); const s = Math.round(fs);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  const i = HEX_INDEX.get(q * 100 + r); return i === undefined ? -1 : i;
}

/** the arena's own physics: gravity + landing on solid tiles (swapped in for the world physics during a game) */
class TilePhysics {
  constructor(game) { this.g = game; }
  step(body, dt, gravity = -28) {
    body.vel.y = Math.max(body.vel.y + gravity * dt, -50);
    const prevY = body.pos.y;
    body.pos.addScaledVector(body.vel, dt);
    body.onGround = false;
    if (body.vel.y > 0) return;
    for (let f = 0; f < FLOORS; f++) {
      const top = this.g.fy(f);
      if (prevY >= top - 0.05 && body.pos.y <= top && this.g.support(f, body.pos.x - this.g.A.x, body.pos.z - this.g.A.z) >= 0) {
        body.pos.y = top; body.vel.y = 0; body.onGround = true; return;
      }
    }
  }
  raycast() { return Infinity; }
  groundAt() { return this.g.fy(0); }
}

export class TileDrop {
  /** opts: arena { x, z, y } (top floor), theme ('neon' | 'grave'), id (save key + race game id), name */
  constructor({ scene, player, progress, quests, sfx, hud, ui, getChars, arena = ARENA, theme = 'neon', id = 'tiledrop', name = 'TILE DROP' }) {
    Object.assign(this, { scene, player, progress, quests, sfx, hud, ui, getChars, theme, id, name });
    this.A = arena; this.outY = arena.y - GAP * (FLOORS - 1) - 9;
    this.active = false; this.state = 'idle'; this.phys = new TilePhysics(this);
    this.tiles = [];   // per floor: Float64Array touch time (Infinity = solid)
  }

  fy(f) { return this.A.y - f * GAP; }
  get S() { const s = this.progress.s; s.mg ||= {}; s.mg[this.id] ||= { best: 0, games: 0, wins: 0, weekBest: 0, week: null, today: 0, day: null }; return s.mg[this.id]; }

  build() {
    if (this.group) return;
    this.group = new THREE.Group(); this.group.visible = false; this.scene.add(this.group);
    const geo = new THREE.CylinderGeometry(S * 0.93, S * 0.93, 0.5, 6).translate(0, -0.25, 0);
    const grave = this.theme === 'grave', colors = grave ? GRAVE_COLORS : COLORS;
    this.meshes = [];
    const stone = grave ? crackedStone() : null;
    for (let f = 0; f < FLOORS; f++) {
      const mat = grave ? new THREE.MeshStandardMaterial({ color: '#ffffff', map: stone, roughness: 0.95, metalness: 0, emissive: colors[f], emissiveIntensity: 0.12 })
        : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.15, emissive: COLORS[f], emissiveIntensity: 0.35 });
      const m = new THREE.InstancedMesh(geo, mat, HEXES.length); m.frustumCulled = false; m.receiveShadow = true;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(HEXES.length * 3), 3);
      this.group.add(m); this.meshes.push(m);
      // neon rim around each floor
      const rim = new THREE.Mesh(new THREE.TorusGeometry(S * SQ3 * (N + 0.6), 0.12, 6, 72), new THREE.MeshBasicMaterial({ color: colors[f], toneMapped: false }));
      rim.rotation.x = Math.PI / 2; rim.position.set(this.A.x, this.fy(f) - 0.25, this.A.z); this.group.add(rim);
    }
    this.base = grave ? GRAVE_TINT.map((c) => new THREE.Color(c)) : COLORS.map((c) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.35));
    if (grave) this.buildGrave();
  }

  // ---- GRAVE DROP dressing: tombstones on a third of the tiles, a fog pit below, hands from the gaps, lightning
  buildGrave() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#8d8a99', roughness: 0.9, map: crackedStone() });
    const slab = new THREE.BoxGeometry(0.62, 0.62, 0.16).translate(0, 0.31, 0), cap = new THREE.CylinderGeometry(0.31, 0.31, 0.16, 16, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0.62, 0);
    this.graveIdx = HEXES.map((_, i) => i).filter((i) => (i * 7919) % 3 === 0);   // which tiles carry a tombstone (same on every floor)
    this.stones = [slab, cap].map((g) => { const m = new THREE.InstancedMesh(g, stoneMat, this.graveIdx.length * FLOORS); m.frustumCulled = false; m.castShadow = true; this.group.add(m); return m; });
    // fog pit under the bottom floor
    const fogTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
      gr.addColorStop(0, 'rgba(160,120,220,.75)'); gr.addColorStop(0.6, 'rgba(90,60,140,.45)'); gr.addColorStop(1, 'rgba(40,20,70,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    this.fog = [];
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(S * SQ3 * N * 3.4, S * SQ3 * N * 3.4), new THREE.MeshBasicMaterial({ map: fogTex, transparent: true, depthWrite: false, opacity: 0.8 - k * 0.2, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(this.A.x, this.outY + 4 + k * 1.6, this.A.z); this.group.add(m); this.fog.push(m);
    }
    // skeletal hands that reach up out of fresh holes
    const bone = new THREE.MeshStandardMaterial({ color: '#d9d2bf', roughness: 0.7, emissive: '#3a2a55', emissiveIntensity: 0.4 });
    this.hands = [];
    for (let k = 0; k < 10; k++) {
      const h = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.12), bone); palm.position.y = 0.2; h.add(palm);
      for (let j = 0; j < 4; j++) { const fg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.06), bone); fg.position.set(-0.12 + j * 0.08, 0.55, 0); fg.rotation.z = (j - 1.5) * 0.12; h.add(fg); }
      const th = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), bone); th.position.set(0.21, 0.28, 0); th.rotation.z = -0.8; h.add(th);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.1), bone); arm.position.y = -0.45; h.add(arm);
      h.visible = false; this.group.add(h); this.hands.push({ g: h, t: -1, x: 0, z: 0, y: 0 });
    }
    // lightning: a bright flash from above + an on-screen flash
    this.bolt = new THREE.PointLight('#cfd8ff', 0, 160, 1.2); this.bolt.position.set(this.A.x, this.A.y + 30, this.A.z); this.group.add(this.bolt);
  }

  /** tile index under (x, z) on floor f that can hold weight (solid or still flashing), else -1 */
  support(f, x, z) {
    const T = this.clock, tl = this.tiles[f];
    for (const [ox, oz] of [[0, 0], [0.28, 0], [-0.28, 0], [0, 0.28], [0, -0.28]]) {
      const i = hexAt(x + ox, z + oz); if (i >= 0 && T - tl[i] < DROP) return i;
    }
    return -1;
  }
  touch(f, i, by = 'me') {
    const tl = this.tiles[f]; if (tl[i] !== Infinity) return false;
    tl[i] = this.clock;
    if (by === 'me') { this.mine.push(f * 1000 + i); this.sfx.play('tap', { vol: 0.5, rate: 1.4 + f * 0.15 }); }
    return true;
  }
  floorOf(y) { for (let f = 0; f < FLOORS; f++) if (Math.abs(y - this.fy(f)) < 0.3) return f; return -1; }
  alive() { return (this.me.out ? 0 : 1) + this.bots.filter((b) => !b.out).length + this.rivals().filter((r) => !r.out).length; }

  /** race: { id, seed, at, host, game: 'tiledrop' } or null for solo vs bots */
  begin(onEnd, race = null) {
    if (this.active) return;
    this.build();
    this.race = race; this.onEnd = onEnd; this.clock = 0;
    this.tiles = Array.from({ length: FLOORS }, () => new Float64Array(HEXES.length).fill(Infinity));
    this.mine = []; this.seen = new Set(); this.peers = new Map(); this.handed = new Set(); this.ghost = false;
    const rnd = seeded(race ? race.seed : (Math.random() * 4294967295) >>> 0);
    this.rnd = seeded(((race ? race.seed : Math.random() * 4294967295) ^ 0x9e3779b9) >>> 0); this.nextBolt = 4;   // lightning: same strikes for everyone in a match
    // spawn: a random tile within 3 rings of the centre on the top floor
    const spot = () => { const i = Math.floor(rnd() * HEXES.length); const [q, r] = HEXES[i]; return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 3 ? i : spot(); };
    const mySpot = race ? HEXES[(spot() + Math.floor(Math.random() * 7)) % HEXES.length] : HEXES[spot()];
    this.me = { out: 0 };
    // bots (solo only)
    this.bots = [];
    if (!race) {
      const chars = this.getChars().filter(Boolean);
      for (let k = 0; k < 5 && chars.length; k++) {
        const g = chars[(k * 3 + Math.floor(Math.random() * chars.length)) % chars.length];
        const c = makeCharacter(g, { shadow: true });
        const [q, r] = HEXES[spot()];
        const body = { pos: new THREE.Vector3(this.A.x + hexX(q, r) + (rnd() - 0.5), this.fy(0) + 0.2, this.A.z + hexZ(r) + (rnd() - 0.5)), vel: new THREE.Vector3(), onGround: false };
        c.root.position.copy(body.pos); this.group.add(c.root);
        const names = this.theme === 'grave' ? GRAVE_BOTS : BOT_NAMES; this.botOff ??= Math.floor(Math.random() * 8);
        this.bots.push({ c, body, name: names[(k + this.botOff) % names.length], out: 0, target: null, think: 0, facing: rnd() * 6.28,
          speed: 5.2 + rnd() * 1.6, sloppy: 0.08 + rnd() * 0.22 });
      }
    }
    this.paint();
    this.group.visible = true;
    // move the player up
    this.returnTo = this.player.body.pos.clone();
    this.worldPhys = this.player.physics; this.player.physics = this.phys;
    const [q, r] = mySpot;
    this.player.teleport(new THREE.Vector3(this.A.x + hexX(q, r), this.fy(0) + 0.1, this.A.z + hexZ(r)));
    this.player.facing = Math.atan2(-hexX(q, r), -hexZ(r)) || 0; this.player.root.rotation.y = this.player.facing; this.player.emote = null;
    this.active = true; this.state = 'countdown'; this.t = race ? Math.max(1, (race.at - Date.now()) / 1000) : 3.2;
    this.ui.show(); this.ui.labels(['ALIVE', 'FLOOR', 'SCORE']); this.ui.set({ time: 0, a: 1 + this.bots.length, b: 1, c: 0 }); this.ui.countdown(Math.ceil(this.t));
    this.ui.route((race ? 'MATCH · ' : 'VS BOTS · ') + 'LAST ONE STANDING WINS'); this.ui.board(null);
    this.sfx.play('whoosh'); this.sfx.music?.('bagrun');
  }

  /** other players in this match (from multiplayer presence): [{ name, out, t, tl }] -> set by main each frame */
  rivals() { return this.race ? this.rivalList || [] : []; }
  /** tiles other players stepped on (ids f*1000+i), fed from their presence */
  remoteTiles(ids) { for (const id of ids) { if (this.seen.has(id)) continue; this.seen.add(id); const f = Math.floor(id / 1000), i = id % 1000; if (f < FLOORS && i < HEXES.length) this.touch(f, i, 'peer'); } }

  update(dt) {
    if (!this.active) return;
    this.clock += dt;
    if (this.state === 'countdown') {
      const before = Math.ceil(this.t); this.t = this.race ? (this.race.at - Date.now()) / 1000 : this.t - dt; const now = Math.ceil(this.t);
      if (now !== before && now > 0) { this.ui.countdown(now); this.sfx.play('tap'); }
      if (this.t <= 0) { this.state = 'run'; this.startClock = this.clock; this.ui.countdown('GO!'); this.sfx.play('levelup'); }
      this.paint(); this.animBots(dt, true); if (this.theme === 'grave') this.graveFrame(dt, false); return;
    }
    if (this.state !== 'run') return;
    const T = this.clock - this.startClock;
    // my feet
    const P = this.player.body.pos, f = this.floorOf(P.y);
    if (f >= 0 && this.player.body.onGround) { const i = this.support(f, P.x - this.A.x, P.z - this.A.z); if (i >= 0) this.touch(f, i); }
    if (P.y < this.outY && !this.me.out) { this.me.out = T; this.sfx.play('error'); this.ui.pop(this.theme === 'grave' ? 'OUT! · YOU ARE A GHOST 👻' : 'OUT!'); }
    if (this.theme === 'grave') this.graveFrame(dt, true);
    this.bots.forEach((b) => this.botStep(b, dt, T));
    this.animBots(dt, false);
    this.paint();
    const alive = this.alive(), floor = f >= 0 ? f + 1 : '–';
    this.ui.set({ time: Math.floor(T), a: alive, b: floor, c: Math.floor(T * 10) });
    // standings board
    if ((this.boardT = (this.boardT || 0) + dt) > 0.5) { this.boardT = 0; this.ui.board(this.standings().map((r) => ({ name: r.name, score: Math.floor(r.t), me: r.me, done: r.out }))); }
    // end: I'm out, or I'm the last one standing (with at least one rival), or time
    const others = this.bots.length + this.rivals().length;
    if (this.me.out) {
      // Grave Drop: haunt the match as a ghost while at least two others are still on the tiles
      if (this.theme === 'grave' && alive >= 2 && T < MAX_T) { if (!this.ghost) this.becomeGhost(); this.ghostFrame(dt); return; }
      return this.finish(false);
    }
    if (others && alive === 1 && T > 2) return this.finish(false, true);
    if (T >= MAX_T) return this.finish(false, alive === 1 && others > 0);
  }
  becomeGhost() {
    this.ghost = true; this.player.physics = new GhostPhysics(this);
    const P = this.player.body.pos; P.y = this.fy(0) + 2.6; this.player.body.vel.set(0, 0, 0);
    if (!this.ghostMesh) {
      const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: '#f4f0ff', emissive: '#b8a8ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.82, roughness: 0.6, side: THREE.DoubleSide });
      const sheet = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 1.2, 18, 3, true), mat); sheet.position.y = 0.6; g.add(sheet);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat); head.position.y = 1.2; g.add(head);
      const eyeM = new THREE.MeshBasicMaterial({ color: '#120a1e' });
      for (const x of [-0.14, 0.14]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), eyeM); e.scale.set(1, 1.5, 0.6); e.position.set(x, 1.32, 0.36); g.add(e); }
      const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), eyeM); mouth.scale.set(1, 1.3, 0.5); mouth.position.set(0, 1.12, 0.39); g.add(mouth);
      this.ghostMesh = g; this.group.add(g);
    }
    this.ghostMesh.visible = true; this.player.root.visible = false;
    this.ui.route('YOU FELL · HAUNT THEM UNTIL THE END (✕ TO LEAVE)');
    this.sfx.play('poof');
  }
  ghostFrame(dt) {
    const P = this.player.body.pos, g = this.ghostMesh, v = this.player.body.vel;
    g.position.set(P.x, P.y - 0.4, P.z);
    if (Math.hypot(v.x, v.z) > 0.3) g.rotation.y = Math.atan2(v.x, v.z);
    g.rotation.z = Math.sin(this.clock * 3) * 0.08; g.children[0].scale.x = 1 + Math.sin(this.clock * 7) * 0.05;
  }

  standings() {
    const T = this.state === 'run' ? this.clock - this.startClock : 0;
    const rows = [{ name: 'You', t: this.me.out || T, out: !!this.me.out, me: true }]
      .concat(this.bots.map((b) => ({ name: b.name, t: b.out || T, out: !!b.out })))
      .concat(this.rivals().map((r) => ({ name: r.name, t: r.out ? r.t : Math.max(r.t, T), out: r.out })));
    return rows.sort((a, b) => (a.out === b.out ? b.t - a.t : a.out ? 1 : -1));
  }

  // ---- bots: hop between solid tiles, preferring ones with solid neighbours; jump over holes
  botStep(b, dt, T) {
    if (b.out) return;
    const body = b.body, x = body.pos.x - this.A.x, z = body.pos.z - this.A.z, f = this.floorOf(body.pos.y);
    if (f >= 0 && body.onGround) { const i = this.support(f, x, z); if (i >= 0) this.touch(f, i, 'bot'); }
    if ((b.think -= dt) <= 0 && f >= 0) {
      b.think = 0.25 + Math.random() * 0.35;
      const tl = this.tiles[f], solid = (i) => i >= 0 && tl[i] === Infinity;
      let best = -1, bs = -1e9;
      for (let k = 0; k < 14; k++) {
        const ang = Math.random() * 6.28, d = 1.5 + Math.random() * 4.5, i = hexAt(x + Math.cos(ang) * d, z + Math.sin(ang) * d);
        if (!solid(i)) continue;
        const [q, r] = HEXES[i]; let n = 0;
        for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) n += solid(HEX_INDEX.get((q + dq) * 100 + r + dr) ?? -1) ? 1 : 0;
        const edge = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) / N;
        const sc = n - d * 0.25 - edge * 2 + Math.random() * 1.5;
        if (sc > bs) { bs = sc; best = i; }
      }
      if (Math.random() < b.sloppy * (1 + T / 60)) best = -1;   // hesitates; worse as the game drags on
      b.target = best >= 0 ? new THREE.Vector2(hexX(...HEXES[best]), hexZ(HEXES[best][1])) : null;
    }
    // steer
    let vx = 0, vz = 0;
    if (b.target) { const dx = b.target.x - x, dz = b.target.y - z, L = Math.hypot(dx, dz); if (L > 0.3) { vx = dx / L * b.speed; vz = dz / L * b.speed; } }
    const k = 1 - Math.exp(-(body.onGround ? 12 : 3) * dt);
    body.vel.x += (vx - body.vel.x) * k; body.vel.z += (vz - body.vel.z) * k;
    // hole ahead: jump
    if (body.onGround && (vx || vz) && f >= 0) {
      const ax = x + body.vel.x * 0.18, az = z + body.vel.z * 0.18, i = hexAt(ax, az);
      if (i < 0 || this.clock - this.tiles[f][i] >= DROP * 0.6) { if (Math.random() < 0.85) { body.vel.y = 10.5; body.onGround = false; } }
    }
    for (let s = 0; s < 4; s++) this.phys.step(body, dt / 4);
    if (body.pos.y < this.outY) { b.out = T; b.c.root.visible = false; this.hud.chat?.('SYSTEM', this.theme === 'grave' ? 'Grave Drop' : 'Tile Drop', `${b.name} is out (${Math.floor(T)} s)`, '#9aa7b5'); }
  }
  animBots(dt, frozen) {
    for (const b of this.bots) {
      if (b.out) continue;
      const v = b.body.vel, sp = frozen ? 0 : Math.hypot(v.x, v.z);
      if (frozen) { b.body.vel.set(0, 0, 0); }
      if (sp > 0.3) { const want = Math.atan2(v.x, v.z); let d = want - b.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); b.facing += d * (1 - Math.exp(-12 * dt)); }
      b.c.root.position.copy(b.body.pos); b.c.root.rotation.y = b.facing;
      if (!b.body.onGround && !frozen) b.c.play(v.y > 0 ? 'Jump' : 'Fall', 0.15);
      else if (sp > 3) b.c.play('Run', 0.2, THREE.MathUtils.clamp(sp / 6.6, 0.7, 1.3));
      else if (sp > 0.3) b.c.play('Walk', 0.25);
      else b.c.play('Idle', 0.3);
      b.c.mixer.update(dt);
    }
  }

  paint() {
    const T = this.clock, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color(), hot = new THREE.Color('#ff3b5c'), doom = new THREE.Color('#b84dff');
    const grave = this.theme === 'grave'; let si = 0;
    for (let f = 0; f < FLOORS; f++) {
      const mesh = this.meshes[f], tl = this.tiles[f];
      for (let i = 0; i < HEXES.length; i++) {
        const [hq, hr] = HEXES[i], age = T - tl[i];
        let y = this.fy(f), sc = 1; c.copy(this.base[f]);
        if (age < 0 && age > -3) { c.lerp(doom, 0.45 + 0.35 * Math.sin(T * 14)); y += Math.sin(T * 50 + i) * 0.02; }   // struck by lightning: crumbles soon
        else if (age >= 0 && age < DROP) { const flash = 0.5 + 0.5 * Math.sin(age * 40); c.lerp(hot, 0.35 + 0.5 * flash); y += Math.sin(age * 70) * 0.04; }
        else if (age >= DROP) { const k = (age - DROP) / FALL_T; y -= 12 * k * k; sc = Math.max(0, 1 - k); if (k >= 1) sc = 0; }
        v.set(this.A.x + hexX(hq, hr), y, this.A.z + hexZ(hr)); s.setScalar(sc); m4.compose(v, q, s);
        mesh.setMatrixAt(i, m4); mesh.setColorAt(i, c);
        if (grave && (i * 7919) % 3 === 0) {   // tombstone rides its tile (set back from the centre, a little crooked)
          const yaw = ((i * 37) % 7 - 3) * 0.06; q.setFromAxisAngle(_UP, yaw); v.set(v.x + 0.35, y, v.z - 0.2); s.setScalar(sc); m4.compose(v, q, s);
          this.stones[0].setMatrixAt(si, m4); this.stones[1].setMatrixAt(si, m4); si++; q.identity();
        }
        if (grave && age >= DROP && age - DROP < 0.05 && !this.handed.has(f * 1000 + i)) { this.handed.add(f * 1000 + i); this.hand(this.A.x + hexX(hq, hr), this.fy(f), this.A.z + hexZ(hr)); }
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    }
    if (grave) { for (const m of this.stones) m.instanceMatrix.needsUpdate = true; }
  }

  /** a skeletal hand reaches up out of a fresh hole (pool of 10, oldest reused) */
  hand(x, y, z) {
    if (!this.hands) return;
    const h = this.hands.reduce((a, b) => (a.t < 0 ? a : b.t < 0 ? b : a.t > b.t ? a : b));
    Object.assign(h, { t: 0, x, y, z }); h.g.rotation.y = Math.random() * 6.28; h.g.visible = true;
  }
  /** grave extras per frame: hands, lightning (marks tiles that crumble), fog drift */
  graveFrame(dt, running) {
    for (const h of this.hands) {
      if (h.t < 0) continue; h.t += dt;
      const k = h.t < 0.5 ? h.t / 0.5 : h.t < 1.8 ? 1 : Math.max(0, 1 - (h.t - 1.8) / 0.6);
      h.g.position.set(h.x, h.y - 1.3 + k * 1.05, h.z); h.g.rotation.z = Math.sin(h.t * 6) * 0.15;
      if (h.t > 2.4) { h.t = -1; h.g.visible = false; }
    }
    this.fog.forEach((m, k) => { m.rotation.z += dt * (0.02 + k * 0.015) * (k % 2 ? -1 : 1); });
    this.bolt.intensity = Math.max(0, this.bolt.intensity - dt * 900);
    if (!running) return;
    if ((this.nextBolt -= dt) > 0) return;
    this.nextBolt = 5 + this.rnd() * 4;
    // strike: 5-9 solid tiles across the floors light up purple and crumble 1.6 s later
    const T = this.clock, n = 5 + Math.floor(this.rnd() * 5);
    for (let k = 0; k < n; k++) {
      const f = Math.floor(this.rnd() * FLOORS), i = Math.floor(this.rnd() * HEXES.length), tl = this.tiles[f];
      if (tl[i] === Infinity) tl[i] = T + 1.6;
    }
    this.bolt.intensity = 260; this.ui.flash?.(); this.sfx.play('thunder');
  }

  finish(quit = false, win = false) {
    if (!this.active) return;
    const T = this.state === 'run' ? (this.me.out || this.clock - this.startClock) : 0;
    const S = this.S, wk = weekKey(), dk = dayKey();
    if (S.week !== wk) { S.week = wk; S.weekBest = 0; }
    if (S.day !== dk) { S.day = dk; S.today = 0; }
    const standings = this.standings(), place = quit ? standings.length : standings.findIndex((r) => r.me) + 1;
    const score = quit ? 0 : Math.floor(T * 10) + (win ? 300 : 0);
    const pb = score > S.best;
    let xp = 0;
    if (!quit) {
      S.games++; S.today++; if (win) S.wins++;
      S.best = Math.max(S.best, score); S.weekBest = Math.max(S.weekBest, score);
      const mult = S.today <= 10 ? 1 : S.today <= 20 ? 0.5 : 0.1;
      xp = this.progress.grant(Math.round((15 + Math.min(35, T / 3) + (win ? 15 : 0)) * mult), 'minigame');
      this.quests.emit('minigame', 1, { id: this.id });
      this.quests.checkAchievements?.();
      this.progress.save();
    }
    this.active = false; this.state = 'idle';
    for (const b of this.bots) this.group.remove(b.c.root);
    this.bots = []; this.group.visible = false;
    this.player.physics = this.worldPhys; this.player.root.visible = true; if (this.ghostMesh) this.ghostMesh.visible = false; this.ghost = false;
    for (const h of this.hands || []) { h.t = -1; h.g.visible = false; }
    this.ui.hide(); this.ui.labels(null);
    if (this.returnTo) this.player.teleport(this.returnTo.clone().setY(this.returnTo.y + 0.1));
    this.sfx.stopMusic?.(1.2);
    this.sfx.play(quit ? 'whoosh' : win ? 'achieve' : 'success');
    this.onEnd?.({ game: this, quit, win, race: this.race, time: T, score, place, of: standings.length, xp, pb, best: S.best, wins: S.wins, runsToday: S.today, standings });
  }
}
