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

export const ARENA = { x: 0, z: 0, y: 215 };       // top floor height (over the plaza; the tallest tower tops out at ~168 m)
const FLOORS = 3, GAP = 11, N = 6, S = 1.55;       // floors, metres between floors, hex rings, hex radius
const DROP = 0.5, FALL_T = 0.7, MAX_T = 150, OUT_Y = ARENA.y - GAP * (FLOORS - 1) - 9;
const COLORS = ['#7cff3d', '#3dfff0', '#ff4fd8'];
const SQ3 = Math.sqrt(3);
const BOT_NAMES = ['DegenDan', 'WAGMI_Wen', 'ApeAnon', 'HodlHana', 'PumpPete', 'RugRita', 'MoonMax', 'FudFiona'];

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
const floorY = (f) => ARENA.y - f * GAP;

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
      const top = floorY(f);
      if (prevY >= top - 0.05 && body.pos.y <= top && this.g.support(f, body.pos.x - ARENA.x, body.pos.z - ARENA.z) >= 0) {
        body.pos.y = top; body.vel.y = 0; body.onGround = true; return;
      }
    }
  }
  raycast() { return Infinity; }
  groundAt() { return floorY(0); }
}

export class TileDrop {
  constructor({ scene, player, progress, quests, sfx, hud, ui, getChars }) {
    Object.assign(this, { scene, player, progress, quests, sfx, hud, ui, getChars });
    this.active = false; this.state = 'idle'; this.phys = new TilePhysics(this);
    this.tiles = [];   // per floor: Float64Array touch time (Infinity = solid)
  }

  get S() { const s = this.progress.s; s.mg ||= {}; s.mg.tiledrop ||= { best: 0, games: 0, wins: 0, weekBest: 0, week: null, today: 0, day: null }; return s.mg.tiledrop; }

  build() {
    if (this.group) return;
    this.group = new THREE.Group(); this.group.visible = false; this.scene.add(this.group);
    const geo = new THREE.CylinderGeometry(S * 0.93, S * 0.93, 0.5, 6).translate(0, -0.25, 0);
    this.meshes = [];
    for (let f = 0; f < FLOORS; f++) {
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.15, emissive: COLORS[f], emissiveIntensity: 0.35 });
      const m = new THREE.InstancedMesh(geo, mat, HEXES.length); m.frustumCulled = false; m.receiveShadow = true;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(HEXES.length * 3), 3);
      this.group.add(m); this.meshes.push(m);
      // neon rim around each floor
      const rim = new THREE.Mesh(new THREE.TorusGeometry(S * SQ3 * (N + 0.6), 0.12, 6, 72), new THREE.MeshBasicMaterial({ color: COLORS[f], toneMapped: false }));
      rim.rotation.x = Math.PI / 2; rim.position.set(ARENA.x, floorY(f) - 0.25, ARENA.z); this.group.add(rim);
    }
    this.base = COLORS.map((c) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.35));
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
  floorOf(y) { for (let f = 0; f < FLOORS; f++) if (Math.abs(y - floorY(f)) < 0.3) return f; return -1; }
  alive() { return (this.me.out ? 0 : 1) + this.bots.filter((b) => !b.out).length + this.rivals().filter((r) => !r.out).length; }

  /** race: { id, seed, at, host, game: 'tiledrop' } or null for solo vs bots */
  begin(onEnd, race = null) {
    if (this.active) return;
    this.build();
    this.race = race; this.onEnd = onEnd; this.clock = 0;
    this.tiles = Array.from({ length: FLOORS }, () => new Float64Array(HEXES.length).fill(Infinity));
    this.mine = []; this.seen = new Set(); this.peers = new Map();
    const rnd = seeded(race ? race.seed : (Math.random() * 4294967295) >>> 0);
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
        const body = { pos: new THREE.Vector3(ARENA.x + hexX(q, r) + (rnd() - 0.5), floorY(0) + 0.2, ARENA.z + hexZ(r) + (rnd() - 0.5)), vel: new THREE.Vector3(), onGround: false };
        c.root.position.copy(body.pos); this.group.add(c.root);
        this.bots.push({ c, body, name: BOT_NAMES[(k + Math.floor(rnd() * 8)) % BOT_NAMES.length], out: 0, target: null, think: 0, facing: rnd() * 6.28,
          speed: 5.2 + rnd() * 1.6, sloppy: 0.08 + rnd() * 0.22 });
      }
    }
    this.paint();
    this.group.visible = true;
    // move the player up
    this.returnTo = this.player.body.pos.clone();
    this.worldPhys = this.player.physics; this.player.physics = this.phys;
    const [q, r] = mySpot;
    this.player.teleport(new THREE.Vector3(ARENA.x + hexX(q, r), floorY(0) + 0.1, ARENA.z + hexZ(r)));
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
      this.paint(); this.animBots(dt, true); return;
    }
    if (this.state !== 'run') return;
    const T = this.clock - this.startClock;
    // my feet
    const P = this.player.body.pos, f = this.floorOf(P.y);
    if (f >= 0 && this.player.body.onGround) { const i = this.support(f, P.x - ARENA.x, P.z - ARENA.z); if (i >= 0) this.touch(f, i); }
    if (P.y < OUT_Y && !this.me.out) { this.me.out = T; this.sfx.play('error'); this.ui.pop('OUT!'); }
    this.bots.forEach((b) => this.botStep(b, dt, T));
    this.animBots(dt, false);
    this.paint();
    const alive = this.alive(), floor = f >= 0 ? f + 1 : '–';
    this.ui.set({ time: Math.floor(T), a: alive, b: floor, c: Math.floor(T * 10) });
    // standings board
    if ((this.boardT = (this.boardT || 0) + dt) > 0.5) { this.boardT = 0; this.ui.board(this.standings().map((r) => ({ name: r.name, score: Math.floor(r.t), me: r.me, done: r.out }))); }
    // end: I'm out, or I'm the last one standing (with at least one rival), or time
    const others = this.bots.length + this.rivals().length;
    if (this.me.out) return this.finish(false);
    if (others && alive === 1 && T > 2) return this.finish(false, true);
    if (T >= MAX_T) return this.finish(false, alive === 1 && others > 0);
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
    const body = b.body, x = body.pos.x - ARENA.x, z = body.pos.z - ARENA.z, f = this.floorOf(body.pos.y);
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
    if (body.pos.y < OUT_Y) { b.out = T; b.c.root.visible = false; this.hud.chat?.('SYSTEM', 'Tile Drop', `${b.name} is out (${Math.floor(T)} s)`, '#9aa7b5'); }
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
    const T = this.clock, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color(), hot = new THREE.Color('#ff3b5c');
    for (let f = 0; f < FLOORS; f++) {
      const mesh = this.meshes[f], tl = this.tiles[f];
      for (let i = 0; i < HEXES.length; i++) {
        const [hq, hr] = HEXES[i], age = T - tl[i];
        let y = floorY(f), sc = 1; c.copy(this.base[f]);
        if (age >= 0 && age < DROP) { const flash = 0.5 + 0.5 * Math.sin(age * 40); c.lerp(hot, 0.35 + 0.5 * flash); y += Math.sin(age * 70) * 0.04; }
        else if (age >= DROP) { const k = (age - DROP) / FALL_T; y -= 12 * k * k; sc = Math.max(0, 1 - k); if (k >= 1) sc = 0; }
        v.set(ARENA.x + hexX(hq, hr), y, ARENA.z + hexZ(hr)); s.setScalar(sc); m4.compose(v, q, s);
        mesh.setMatrixAt(i, m4); mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    }
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
      this.quests.emit('minigame', 1, { id: 'tiledrop' });
      this.quests.checkAchievements?.();
      this.progress.save();
    }
    this.active = false; this.state = 'idle';
    for (const b of this.bots) this.group.remove(b.c.root);
    this.bots = []; this.group.visible = false;
    this.player.physics = this.worldPhys;
    this.ui.hide(); this.ui.labels(null);
    if (this.returnTo) this.player.teleport(this.returnTo.clone().setY(this.returnTo.y + 0.1));
    this.sfx.stopMusic?.(1.2);
    this.sfx.play(quit ? 'whoosh' : win ? 'achieve' : 'success');
    this.onEnd?.({ quit, win, race: this.race, time: T, score, place, of: standings.length, xp, pb, best: S.best, wins: S.wins, runsToday: S.today, standings });
  }
}
