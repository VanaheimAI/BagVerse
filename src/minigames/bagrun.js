// BAG RUN: the first mini-game (BAG RUN portal in the plaza).
// A 60-second dash along a route that changes every run (around the square, or out through the districts and back): a chain of teal run-Bags (each respawns 12 s after pickup, so you
// can keep lapping), combo multiplier for quick pickups (x1..x5), corner Mega Bags (+50, +3 s), barriers that trip
// you (speed and combo lost). On foot or on your scooter. Results: score, best combo, personal best, XP
// (20–60 per run, full value for the first 10 runs a day). Weekly best feeds the RWA kiosk tournaments.
import * as THREE from 'three';
import { bagAsset } from '../collectibles.js';
import { weekKey, dayKey } from '../progression.js';

const DURATION = 60, RESPAWN = 12, COMBO_WINDOW = 2.5, RING = 31, STEP = 5.5;
const MAX_BAGS = 160, MAX_BARRIERS = 30, CELL = 2, HALF = 178;
const UP = new THREE.Vector3(0, 1, 0);

// Route plans. Each run picks one at random (never the same plan twice in a row), then pathfinds it over the
// live world so it always follows open, walkable ground. 'stops' are district ids looked up in world.zones.
const PLANS = [
  { id: 'square',  name: 'SQUARE SPRINT',      w: 3, kind: 'square' },
  { id: 'bowtie',  name: 'PLAZA BOW-TIE',      w: 2, kind: 'bowtie' },
  { id: 'near',    name: 'DOWNTOWN LOOP',      w: 2, stops: ['ad_canyon', 'central_tower', 'rwa_vault'] },
  { id: 'gm',      name: 'GM GATE DASH',       w: 2, stops: ['gm_gate'] },
  { id: 'hodl',    name: 'HODL HEIGHTS HAUL',  w: 2, stops: ['hodl_heights'] },
  { id: 'arcade',  name: 'ARCADE RUN',         w: 2, stops: ['arcade'] },
  { id: 'copium',  name: 'COPIUM COMMUTE',     w: 2, stops: ['copium'] },
  { id: 'vault',   name: 'VAULT & TOWER',      w: 1, stops: ['rwa_vault', 'central_tower'] },
  { id: 'canyon',  name: 'AD CANYON CIRCUIT',  w: 1, stops: ['ad_canyon', 'arcade'] },
  { id: 'bull',    name: 'BULL RUN STAMPEDE',  w: 1, stops: ['bull_run'] },
  { id: 'swamp',   name: 'SWAMP SCRAMBLE',     w: 1, stops: ['swamp'] },
  { id: 'doge',    name: 'DOGE PARK PURSUIT',  w: 1, stops: ['doge_park'] },
];

/** tiny binary min-heap of [f, x, z] */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(f, x, z) { const a = this.a; a.push([f, x, z]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
}

export { PLANS };
/** small seeded RNG: the same seed gives every racer the same route */
export function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export class BagRun {
  constructor({ scene, world, player, progress, quests, sfx, hud, collect, ui }) {
    Object.assign(this, { scene, world, player, progress, quests, sfx, hud, collect, ui });
    this.active = false; this.state = 'idle';
    this.built = false; this.points = []; this.barriers = []; this.walk = new Map(); this.edges = new Map(); this.lastPlan = null;
  }

  // ---- walkability (lazy 2 m grid, cached for the session)
  cellKey(ix, iz) { return ix * 4096 + iz; }
  cell(ix, iz) {
    const k = this.cellKey(ix, iz); let c = this.walk.get(k);
    if (c !== undefined) return c;
    const x = ix * CELL, z = iz * CELL; c = null;
    if (Math.abs(x) <= HALF && Math.abs(z) <= HALF) {
      const ph = this.world.physics, g = ph.groundAt(x, z, 4);
      if (g > -1.5 && g < 3) {
        const o = this._o.set(x, g + 0.6, z); let open = ph.raycast(o, UP, 3.2) >= 3.2;
        for (let k2 = 0; open && k2 < 8; k2++) { const a = (k2 / 8) * Math.PI * 2; this._d.set(Math.cos(a), 0, Math.sin(a)); if (ph.raycast(o, this._d, 1.0) < 1.0) open = false; }
        if (open) c = g;
      }
    }
    this.walk.set(k, c); return c;
  }
  /** can you walk from one cell centre to its neighbour without a ledge? (cached) */
  edge(ix, iz, dx, dz) {
    const k = this.cellKey(ix, iz) * 9 + (dx + 1) * 3 + (dz + 1); let e = this.edges.get(k);
    if (e !== undefined) return e;
    const h0 = this.cell(ix, iz), h1 = this.cell(ix + dx, iz + dz); e = false;
    if (h0 !== null && h1 !== null && Math.abs(h1 - h0) < 1.0 && (!(dx && dz) || (this.cell(ix + dx, iz) !== null && this.cell(ix, iz + dz) !== null))) {
      const ph = this.world.physics; let prev = h0; e = true;
      for (const t of [0.25, 0.5, 0.75, 1]) { const g = t === 1 ? h1 : ph.groundAt((ix + dx * t) * CELL, (iz + dz * t) * CELL, 4); if (Math.abs(g - prev) > 0.32) { e = false; break; } prev = g; }
    }
    this.edges.set(k, e); return e;
  }
  /** flood-fill the streets reachable from the square, a few ms per frame (finished on demand by begin()) */
  warm(budgetMs = 2.5) {
    if (this.reachDone) return true;
    this._o ||= new THREE.Vector3(); this._d ||= new THREE.Vector3();
    if (!this.seeds) { this.seeds = [[RING, 0], [-RING, 0], [0, RING], [0, -RING], [RING, RING], [-RING, -RING]]; this.comps = []; this.queue = null; }
    const t0 = performance.now(); let n = 0;
    for (;;) {
      if (!this.queue) {   // start the next seed that is not already inside a filled area
        let c = null;
        while (this.seeds.length && !c) { const [x, z] = this.seeds.shift(); c = this.snapAny(x, z); if (c && this.comps.some((s) => s.has(this.cellKey(c[0], c[1])))) c = null; }
        if (!c) break;
        this.cur = new Set([this.cellKey(c[0], c[1])]); this.queue = [c];
      }
      while (this.queue.length) {
        const [ix, iz] = this.queue.pop();
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dz) continue;
          const k = this.cellKey(ix + dx, iz + dz); if (this.cur.has(k) || !this.edge(ix, iz, dx, dz)) continue;
          this.cur.add(k); this.queue.push([ix + dx, iz + dz]);
        }
        if ((++n & 31) === 0 && performance.now() - t0 > budgetMs) return false;
      }
      this.comps.push(this.cur); this.queue = null;
    }
    // the biggest connected area is the street network
    this.reach = this.comps.reduce((a, b) => (b.size > a.size ? b : a), new Set());
    this.comps = null; this.reachDone = true; console.log('bagrun reach', this.reach.size, 'cells'); return true;
  }
  ok(x, z) { const g = this.cell(Math.round(x / CELL), Math.round(z / CELL)); if (g === null) return null; const gg = this.world.physics.groundAt(x, z, 4); return Math.abs(gg - g) < 0.6 ? new THREE.Vector3(x, gg, z) : null; }
  /** nearest walkable cell to a point (spiral search) */
  snapAny(x, z, r = 8, test = (ix, iz) => this.cell(ix, iz) !== null) {
    const cx = Math.round(x / CELL), cz = Math.round(z / CELL);
    for (let d = 0; d <= r; d++) for (let a = -d; a <= d; a++) for (const [ix, iz] of [[cx + a, cz - d], [cx + a, cz + d], [cx - d, cz + a], [cx + d, cz + a]]) if (test(ix, iz)) return [ix, iz];
    return null;
  }
  /** nearest cell on the connected street network */
  snap(x, z, r = 12) { return this.snapAny(x, z, r, (ix, iz) => this.reach.has(this.cellKey(ix, iz))); }
  /** A* between two cells; cells in `used` cost more so the way back takes different streets */
  astar(a, b, used) {
    const key = (c) => this.cellKey(c[0], c[1]), goal = key(b);
    const open = new Heap(), g = new Map([[key(a), 0]]), from = new Map(), closed = new Set(); let n = 0;
    open.push(0, a[0], a[1]);
    const H = (ix, iz) => Math.hypot(ix - b[0], iz - b[1]);
    const dec = (c) => { const ix = Math.round(c / 4096); return [ix, c - ix * 4096]; };
    while (open.size && n++ < 400000) {
      const [, ix, iz] = open.pop();
      const k = this.cellKey(ix, iz); if (closed.has(k)) continue; closed.add(k);
      if (k === goal) { const path = [[ix, iz]]; let c = k; while (from.has(c)) { c = from.get(c); path.push(dec(c)); } return path.reverse(); }
      const g0 = g.get(k);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const jx = ix + dx, jz = iz + dz; if (!this.edge(ix, iz, dx, dz)) continue;
        const kk = this.cellKey(jx, jz), cost = g0 + Math.hypot(dx, dz) * (used?.has(kk) ? 3.5 : 1);
        if (cost < (g.get(kk) ?? 1e9)) { g.set(kk, cost); from.set(kk, k); open.push(cost + H(jx, jz), jx, jz); }
      }
    }
    return null;
  }
  /** straight-line shortcut test over walkable cells */
  los(a, b) {
    const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(L / 0.5), ph = this.world.physics; let prev = ph.groundAt(a.x, a.z, 4);
    for (let i = 1; i <= n; i++) { const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (!this.reach.has(this.cellKey(Math.round(x / CELL), Math.round(z / CELL))) || !this.ok(x, z)) return false;
      const g = ph.groundAt(x, z, 4); if (Math.abs(g - prev) > 0.3) return false; prev = g; }
    return true;
  }

  /** pick a plan and lay out this run's bags and barriers */
  /** a plan id for a race host to share (any usable plan, not the last one) */
  pickPlan() { const zones = Object.fromEntries(this.world.zones.map((z) => [z.id, z])); const pool = PLANS.filter((p) => p.id !== this.lastPlan && (!p.stops || p.stops.every((s) => zones[s]))); return pool[Math.floor(Math.random() * pool.length)].id; }
  makeCourse(race = null) {
    this.warm(Infinity);
    const zones = Object.fromEntries(this.world.zones.map((z) => [z.id, z]));
    const pool = PLANS.filter((p) => p.id !== this.lastPlan && (!p.stops || p.stops.every((s) => zones[s])));
    if (race) {   // races: the host's plan and seed, so every racer builds the identical course
      const plan = PLANS.find((p) => p.id === race.plan) || PLANS[0];
      const pts = this.planPoints(plan, zones, seeded(race.seed));
      if (pts && pts.length >= 24) { this.lastPlan = plan.id; this.plan = plan; return pts; }
      const p0 = this.planPoints(PLANS[0], zones, seeded(race.seed)); if (p0) { this.plan = PLANS[0]; return p0; }
      return null;
    }
    const rnd = Math.random, pickW = () => { let t = rnd() * pool.reduce((a, p) => a + p.w, 0); for (const p of pool) if ((t -= p.w) <= 0) return p; return pool[0]; };
    for (let attempt = 0; attempt < 4; attempt++) {
      const plan = this.forcePlan ? PLANS.find((p) => p.id === this.forcePlan) : attempt < 3 ? pickW() : PLANS[0];
      const pts = this.planPoints(plan, zones, rnd);
      if (pts && pts.length >= 24) { this.lastPlan = plan.id; this.plan = plan; return pts; }
    }
    return null;
  }
  planPoints(plan, zones, rnd) {
    const dir = rnd() < 0.5 ? 1 : -1, R = RING;
    const corners = [[R, R], [-R, R], [-R, -R], [R, -R]];
    const rot = Math.floor(rnd() * 4); let wps;
    if (plan.kind === 'square') wps = corners.map((_, i) => corners[(rot + i * dir + 8) % 4]);
    else if (plan.kind === 'bowtie') { const c = corners.map((_, i) => corners[(rot + i) % 4]); wps = [c[0], c[1], [0, 0], c[3], c[2], [0, 0]].map(([x, z]) => [x, z]); if (dir < 0) wps.reverse(); }
    else {
      // leave the square by the side facing the first stop, visit each stop (a small loop around its centre), come back another way
      const stops = plan.stops.map((id) => zones[id]);
      const exitFor = (p) => { const a = Math.atan2(p.z, p.x); const k = Math.round(a / (Math.PI / 2)); return [Math.round(Math.cos(k * Math.PI / 2)) * R, Math.round(Math.sin(k * Math.PI / 2)) * R]; };
      const first = stops[0].pos, last = stops[stops.length - 1].pos;
      const out = exitFor(first), back = exitFor(last);
      const side = (e, s) => [e[0] + (e[0] ? 0 : s * R * 0.6), e[1] + (e[1] ? 0 : s * R * 0.6)];   // slide along that side of the ring road
      wps = [side(out, -dir), out];
      for (const z of stops) {
        const r = Math.min(14, Math.max(6, z.radius * 0.35)), a0 = Math.atan2(z.pos.z, z.pos.x) + Math.PI;
        for (let k = 0; k < 4; k++) { const a = a0 + dir * (k / 4) * Math.PI * 2; wps.push([z.pos.x + Math.cos(a) * r, z.pos.z + Math.sin(a) * r]); }
      }
      const backSide = back[0] === out[0] && back[1] === out[1] ? side(back, dir) : back;
      wps.push(backSide);
    }
    // pathfind the closed loop
    const cells = wps.map(([x, z]) => this.snap(x, z)); if (cells.some((c) => !c)) return null;
    const used = new Set(), poly = [];
    for (let i = 0; i < cells.length; i++) {
      const seg = this.astar(cells[i], cells[(i + 1) % cells.length], used); if (!seg) return null;
      for (const [ix, iz] of seg) { for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) used.add(this.cellKey(ix + dx, iz + dz)); }
      if (i) seg.shift();
      for (const [ix, iz] of seg) poly.push(new THREE.Vector3(ix * CELL, 0, iz * CELL));
    }
    // string-pull the grid path into straight runs
    const smooth = [poly[0]];
    for (let i = 1; i < poly.length; ) { let j = Math.min(poly.length - 1, i + 14); while (j > i && !this.los(smooth[smooth.length - 1], poly[j])) j--; smooth.push(poly[j]); i = j + 1; }
    // bags every STEP along the loop, weaving gently left/right
    const pts = [], amp = 1 + rnd() * 2.2, ph0 = rnd() * 6.28;
    let carry = 0, k = 0;
    for (let i = 0; i < smooth.length && pts.length < MAX_BAGS; i++) {
      const a = smooth[i], b = smooth[(i + 1) % smooth.length], L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.01) continue;
      const nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
      let d = carry;
      for (; d < L && pts.length < MAX_BAGS; d += STEP) {
        const t = d / L, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, w = Math.sin(k * 0.9 + ph0) * amp; k++;
        let p = null; for (const off of [w, w * 0.5, 0]) { p = this.ok(x + nx * off, z + nz * off); if (p) break; }
        if (p) pts.push({ pos: p, mega: false, dir: new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize() });
      }
      carry = d - L;
    }
    // mega bags at the start and at each quarter
    for (let q = 0; q < 4; q++) { const p = pts[Math.floor((q / 4) * pts.length)]; if (p) p.mega = true; }
    return pts;
  }

  /** meshes are made once; each run fills them from its course */
  buildMeshes() {
    if (this.built) return; this.built = true;
    const gold = bagAsset('gold'), purple = bagAsset('purple');   // run Bags are gold, Mega Bags purple
    this.bagMesh = new THREE.InstancedMesh(gold.geometry, gold.material, MAX_BAGS); this.bagMesh.frustumCulled = false;
    this.megaMesh = new THREE.InstancedMesh(purple.geometry, purple.material, MAX_BAGS); this.megaMesh.frustumCulled = false;
    const bar = new THREE.Group();
    const stripe = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d'); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#111' : '#ffb000'; g.beginPath(); g.moveTo(i * 20 - 10, 32); g.lineTo(i * 20 + 6, 0); g.lineTo(i * 20 + 22, 0); g.lineTo(i * 20 + 6, 32); g.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.32, 0.12), new THREE.MeshStandardMaterial({ map: stripe, emissive: '#ff8a00', emissiveMap: stripe, emissiveIntensity: 0.6 }));
    plank.position.y = 0.72; bar.add(plank);
    const legMat = new THREE.MeshStandardMaterial({ color: '#2a2a33' });
    for (const x of [-0.75, 0.75]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), legMat); l.position.set(x, 0.4, 0); bar.add(l); }
    this.group = new THREE.Group(); this.group.visible = false;
    this.group.add(this.bagMesh, this.megaMesh);
    this.barrierPool = []; for (let i = 0; i < MAX_BARRIERS; i++) { const m = bar.clone(); m.visible = false; this.group.add(m); this.barrierPool.push(m); }
    this.scene.add(this.group);
  }
  build() { this.buildMeshes(); }

  layout(pts) {
    this.points = pts; this.barriers = [];
    for (let i = 3; i < pts.length - 1 && this.barriers.length < MAX_BARRIERS; i += 4) {
      if (pts[i].mega || pts[i + 1].mega) continue;
      const a = pts[i].pos, b = pts[i + 1].pos, m = a.clone().lerp(b, 0.5), dir = b.clone().sub(a).setY(0).normalize(), sd = new THREE.Vector3(-dir.z, 0, dir.x), s = (i % 8 ? 1 : -1) * 2.2;
      const p = this.ok(m.x + sd.x * s, m.z + sd.z * s); if (!p || !this.ok(m.x - sd.x * s, m.z - sd.z * s)) continue;   // always leave a way past
      this.barriers.push({ pos: p, yaw: Math.atan2(dir.x, dir.z) });
    }
    this.barrierPool.forEach((m, i) => { const b = this.barriers[i]; m.visible = !!b; if (b) { m.position.copy(b.pos); m.rotation.set(0, b.yaw, 0); b.mesh = m; } });
    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_BAGS; i++) { this.bagMesh.setMatrixAt(i, hide); this.megaMesh.setMatrixAt(i, hide); }
    this.bagMesh.count = this.megaMesh.count = pts.length;
    this.start0 = pts[0].pos.clone();
  }

  get S() { const s = this.progress.s; s.mg ||= {}; s.mg.bagrun ||= { best: 0, runs: 0, weekBest: 0, week: null, today: 0, day: null }; return s.mg.bagrun; }

  /** race: { id, plan, seed, at (epoch ms start), host } shared through multiplayer presence, or null for a solo run */
  begin(onEnd, race = null) {
    if (this.active) return;
    this.buildMeshes();
    this.race = race;
    const pts = this.makeCourse(race);
    if (!pts) { this.hud.toast('BAG RUN COURSE UNAVAILABLE'); return; }
    this.layout(pts);
    this.onEnd = onEnd;
    this.active = true; this.state = 'countdown'; this.t = 3.2; this.left = DURATION;
    this.score = 0; this.bags = 0; this.combo = 0; this.bestCombo = 0; this.lastPick = -99; this.stun = 0; this.clock = 0; this.megas = 0; this.trips = 0; this.lastIdx = -1;
    for (const p of this.points) { p.taken = false; p.back = 0; }
    for (const b of this.barriers) { b.down = 0; }
    this.group.visible = true;
    const s = this.start0.clone(), n = this.points[1]?.pos || s;
    if (race) {   // racers line up side by side, and the countdown follows the shared start time
      this.t = Math.max(1, (race.at - Date.now()) / 1000);
      const side = new THREE.Vector3(-(n.z - s.z), 0, n.x - s.x).normalize(), off = (Math.random() - 0.5) * 3.2, q = this.ok(s.x + side.x * off, s.z + side.z * off);
      if (q) s.copy(q);
    }
    this.returnTo = this.player.body.pos.clone();
    this.player.teleport(s.clone().setY(s.y + 0.1));
    this.player.facing = Math.atan2(n.x - s.x, n.z - s.z); this.player.root.rotation.y = this.player.facing;
    this.player.emote = null;
    this.ui.show(); this.ui.countdown(Math.ceil(this.t)); this.ui.route((race ? 'RACE · ' : '') + this.plan.name); this.ui.board(null);
    this.sfx.play('whoosh');
    this.sfx.music?.('bagrun');
    console.log('bagrun route', this.plan.id, pts.length, 'bags', this.barriers.length, 'barriers');
  }

  /** returns true while the run owns the frame (player input is frozen during the countdown) */
  update(dt, P, ridingV) {
    if (!this.active) return false;
    const T = (this.clock += dt);
    if (this.state === 'countdown') {
      const before = Math.ceil(this.t); this.t = this.race ? (this.race.at - Date.now()) / 1000 : this.t - dt; const now = Math.ceil(this.t);
      if (now !== before && now > 0) { this.ui.countdown(now); this.sfx.play('tap'); }
      if (this.t <= 0) { this.state = 'run'; this.ui.countdown('GO!'); this.sfx.play('levelup'); }
      this.render(T); return true;
    }
    if (this.state !== 'run') return true;
    this.left -= dt;
    this.stun = Math.max(0, this.stun - dt);
    // pickups
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      if (p.taken) { if (T >= p.back) p.taken = false; continue; }
      if (Math.abs(p.pos.y - P.y) > 2.2 || (p.pos.x - P.x) ** 2 + (p.pos.z - P.z) ** 2 > 1.7 * 1.7) continue;
      p.taken = true; p.back = T + RESPAWN; this.lastIdx = i;
      this.combo = T - this.lastPick <= COMBO_WINDOW ? Math.min(5, this.combo + 1) : 1; this.lastPick = T;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.bags++;
      if (p.mega) { this.score += 50 * this.combo; this.left += 3; this.megas++; this.sfx.play('tier'); this.ui.pop(`MEGA +${50 * this.combo} · +3s`); }
      else { this.score += 10 * this.combo; this.sfx.play('coin', { rate: 1 + (this.combo - 1) * 0.08 }); }
    }
    if (T - this.lastPick > COMBO_WINDOW && this.combo) this.combo = 0;
    // barriers
    for (const b of this.barriers) {
      if (b.down > T) continue;
      if ((b.pos.x - P.x) ** 2 + (b.pos.z - P.z) ** 2 < 1.15 * 1.15 && Math.abs(b.pos.y - P.y) < 1.5 && !this.stun) {
        b.down = T + 6; this.stun = 0.9; this.combo = 0; this.trips++;
        this.score = Math.max(0, this.score - 15);
        this.onTrip?.(); this.sfx.play('error'); this.ui.pop('TRIPPED! −15');
      }
    }
    this.render(T);
    this.ui.hud({ left: Math.max(0, this.left), score: this.score, combo: this.combo, bags: this.bags });
    if (this.left <= 0) this.finish();
    return false;
  }

  render(T) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    this.points.forEach((p, i) => {
      const show = !p.taken;
      q.setFromAxisAngle(UP, T * 2 + i); s.setScalar(show ? (p.mega ? 1.9 : 1.35) : 0);
      v.set(p.pos.x, p.pos.y + 0.45 + Math.sin(T * 3 + i) * 0.1, p.pos.z); m.compose(v, q, s);
      (p.mega ? this.megaMesh : this.bagMesh).setMatrixAt(i, m);
      s.setScalar(0); m.compose(v, q, s); (p.mega ? this.bagMesh : this.megaMesh).setMatrixAt(i, m);
    });
    this.bagMesh.instanceMatrix.needsUpdate = true; this.megaMesh.instanceMatrix.needsUpdate = true;
    for (const b of this.barriers) { const down = b.down > T; b.mesh.rotation.x += ((down ? -1.45 : 0) - b.mesh.rotation.x) * 0.25; }
  }

  /** the next bag ahead (for the guide beacon) */
  nextBag(P) {
    const pts = this.points, n = pts.length; if (!n) return null;
    if (this.lastIdx < 0) { let best = null, bd = 1e9; for (const p of pts) { if (p.taken) continue; const d = p.pos.distanceToSquared(P); if (d < bd) { bd = d; best = p; } } return best?.pos || null; }
    for (let k = 1; k <= n; k++) { const p = pts[(this.lastIdx + k) % n]; if (!p.taken) return p.pos; }
    return null;
  }

  finish(quit = false) {
    if (!this.active) return;
    const S = this.S, wk = weekKey(), dk = dayKey();
    if (S.week !== wk) { S.week = wk; S.weekBest = 0; }
    if (S.day !== dk) { S.day = dk; S.today = 0; }
    const score = quit ? 0 : this.score;
    const pb = score > S.best, wb = score > S.weekBest;
    let xp = 0;
    if (!quit) {
      S.runs++; S.today++;
      S.best = Math.max(S.best, score); S.weekBest = Math.max(S.weekBest, score);
      const mult = S.today <= 10 ? 1 : S.today <= 20 ? 0.5 : 0.1;   // full value for the first 10 runs a day
      xp = this.progress.grant(Math.round((20 + Math.min(40, score / 75)) * mult), 'minigame');
      this.quests.emit('minigame', 1, { id: 'bagrun' });
      this.quests.emit('bagrun', 1);
      if (score >= 800) this.quests.emit('bagrun_300', 1);
      if (score >= 2000) this.quests.emit('bagrun_600', 1);
      this.progress.s.stats.bagrunBest = S.best;
      this.quests.checkAchievements();
      this.progress.save();
    }
    this.active = false; this.state = 'idle'; this.group.visible = false;
    this.ui.hide();
    if (this.returnTo) this.player.teleport(this.returnTo.clone().setY(this.returnTo.y + 0.1));
    this.sfx.stopMusic?.(1.2);
    this.sfx.play(quit ? 'whoosh' : pb ? 'achieve' : 'success');
    this.onEnd?.({ quit, race: this.race, route: this.plan?.name, score, bags: this.bags, bestCombo: this.bestCombo, megas: this.megas, trips: this.trips, xp, pb, wb, best: S.best, weekBest: S.weekBest, runsToday: S.today });
  }
}

/** the run's HUD: timer / score / combo strip, countdown, pop-ups, quit button */
export class RunUI {
  constructor(onQuit) {
    const el = document.createElement('div'); el.id = 'runhud'; el.hidden = true;
    el.innerHTML = `<div class="rh-bar"><b id="rh-time">60</b><span><small>SCORE</small><em id="rh-score">0</em></span><span><small>COMBO</small><em id="rh-combo">–</em></span><span><small>BAGS</small><em id="rh-bags">0</em></span><button id="rh-quit" aria-label="Quit run">✕</button></div>
      <div id="rh-board"></div><div id="rh-route"></div><div id="rh-count"></div><div id="rh-pop"></div>`;
    document.body.appendChild(el); this.el = el;
    el.querySelector('#rh-quit').onclick = () => onQuit?.();
  }
  show() { this.el.hidden = false; document.body.classList.add('in-run'); }
  hide() { this.el.hidden = true; document.body.classList.remove('in-run'); }
  countdown(v) { const c = this.el.querySelector('#rh-count'); c.textContent = v; c.classList.remove('go'); void c.offsetWidth; c.classList.add('go'); }
  /** live race standings: rows [{name, score, me, done}] or null to hide */
  board(rows) {
    const el = this.el.querySelector('#rh-board'); if (!rows || rows.length < 2) { el.hidden = true; return; }
    el.hidden = false; el.replaceChildren(...rows.slice(0, 5).map((r, i) => { const d = document.createElement('div'); d.className = r.me ? 'me' : ''; d.textContent = `${i + 1}. ${r.name}${r.done ? ' ✓' : ''}`; const b = document.createElement('b'); b.textContent = r.score.toLocaleString(); d.append(b); return d; }));
  }
  route(t) { const c = this.el.querySelector('#rh-route'); c.textContent = 'ROUTE · ' + t; c.classList.remove('go'); void c.offsetWidth; c.classList.add('go'); }
  pop(t) { const c = this.el.querySelector('#rh-pop'); c.textContent = t; c.classList.remove('go'); void c.offsetWidth; c.classList.add('go'); }
  hud({ left, score, combo, bags }) {
    const q = (id) => this.el.querySelector(id);
    q('#rh-time').textContent = Math.ceil(left); q('#rh-time').classList.toggle('low', left < 10);
    q('#rh-score').textContent = score.toLocaleString(); q('#rh-combo').textContent = combo > 1 ? 'x' + combo : '–'; q('#rh-bags').textContent = bags;
  }
}
