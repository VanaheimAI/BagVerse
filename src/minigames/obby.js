// GOBBLE OBBY (Thanksgiving Arena, the old APEX arena ring at Chad's Bull Run).
// A floating obstacle course that spirals up round a giant turkey: hay bales, corn-cob balance beams, pies,
// crumbling pie crusts, sliding silver platters, spinning lazy susans, rolling-pin sweepers and cranberry-sauce
// bounce pads, in 5 stages with checkpoints, up to the Thanksgiving feast table ~29 m up.
// The course is always solid (free climb any time); the timed run starts from the pad at the bottom.
// Solo = you vs 4 bots; match = everyone who joins in 15 s, fastest to the feast wins (the course is the same for all).
// XP like the other mini-games (full value for the first 10 runs a day).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCharacter } from '../player.js';
import { weekKey, dayKey } from '../progression.js';
import { seeded } from './bagrun.js';

export const OBBY_SITE = { x: 145, z: 155, r: 33 };
const C = new THREE.Vector3(OBBY_SITE.x, 0, OBBY_SITE.z);
export const TO_CITY = new THREE.Vector3(-C.x, 0, -C.z).normalize();   // the ring faces the plaza (south-west)
const CITY_A = Math.atan2(TO_CITY.z, TO_CITY.x);
const START_A = CITY_A + 0.6;        // the course starts just left of the walk in from the arch
const R0 = 18, R1 = 10;              // spiral radius: start -> finish
const LIMIT = 300;                   // a run ends after 5 minutes
const UP = new THREE.Vector3(0, 1, 0);

// element types: L = length along the path; shape + size for collision (top surface at the element's y)
const TYPES = {
  cp:      { L: 5.2, shape: 'cyl', r: 2.6, depth: 0.32 },
  hay:     { L: 2.4, shape: 'box', hx: 1.2, hz: 0.8, depth: 1.2 },
  hay2:    { L: 2.6, shape: 'box', hx: 1.3, hz: 1.3, depth: 1.2 },
  corn:    { L: 6.0, shape: 'box', hx: 3.0, hz: 0.32, depth: 0.64 },
  pie:     { L: 3.0, shape: 'cyl', r: 1.5, depth: 0.45 },
  crust:   { L: 2.6, shape: 'cyl', r: 1.3, depth: 0.3 },
  platter: { L: 2.8, shape: 'cyl', r: 1.4, depth: 0.2 },
  susan:   { L: 5.0, shape: 'cyl', r: 2.5, depth: 0.36 },
  sweep:   { L: 8.0, shape: 'cyl', r: 4.0, depth: 0.5 },
  jello:   { L: 2.4, shape: 'cyl', r: 1.2, depth: 0.8 },
  table:   { L: 7.0, shape: 'box', hx: 3.5, hz: 2.4, depth: 0.4 },
};
// [type, gap from the previous element's edge (m), rise from the previous top (m)]
// a normal jump clears ~4.5 m at +0.8 m; cranberry sauce launches ~4.5 m up
const COURSE = [
  ['cp', 0, 0.45],
  // stage 1: THE HAY RIDE
  ['hay', 1.4, 0.5], ['hay', 1.6, 0.7], ['hay', 1.8, 0.8], ['hay2', 1.6, 0.8], ['corn', 1.4, 0.4], ['hay', 1.4, 0.8], ['hay', 2.0, 0.7],
  ['cp', 1.6, 0.6],
  // stage 2: PIE HOP
  ['pie', 1.8, 0.5], ['crust', 1.8, 0.3], ['crust', 1.8, 0.3], ['pie', 2.0, 0.6], ['platter', 1.8, 0.5], ['platter', 2.2, 0.3], ['pie', 1.8, 0.6], ['crust', 1.8, 0.4],
  ['cp', 1.8, 0.6],
  // stage 3: LAZY SUSANS
  ['susan', 1.6, 0.6], ['susan', 1.8, 0.6], ['sweep', 1.6, 0.4], ['hay', 1.8, 0.8], ['susan', 1.8, 0.6],
  ['cp', 1.8, 0.6],
  // stage 4: CRANBERRY BOUNCE
  ['jello', 1.8, 0.4], ['pie', 1.4, 3.4], ['corn', 1.4, 0.4], ['crust', 1.8, 0.5], ['jello', 1.8, 0.3], ['pie', 1.4, 3.4], ['platter', 2.0, 0.4], ['platter', 2.2, 0.3],
  ['cp', 1.8, 0.6],
  // stage 5: THE FEAST
  ['crust', 1.8, 0.6], ['sweep', 1.8, 0.5], ['hay', 1.8, 0.8], ['jello', 1.8, 0.3], ['table', 1.6, 3.4],
];
export const STAGES = ['THE HAY RIDE', 'PIE HOP', 'LAZY SUSANS', 'CRANBERRY BOUNCE', 'THE FEAST'];
const BOT_NAMES = ['GobbleGus', 'PilgrimPam', 'CranberryCal', 'StuffingSue', 'GravyDave', 'TurkeyTina', 'PecanPete', 'CornbreadKev', 'YamYasmin', 'DrumstickDee'];
const CRUMBLE = 0.7, CRUMBLE_BACK = 3.2, BOUNCE = 16;

export const fmtTime = (t) => { if (t == null || !isFinite(t)) return '–'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };

// ------------------------------------------------------------------ textures (small canvases: cheap on phones)
function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function hayTex() {
  const r = rng(77);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d9a845'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const x = r() * w, y = r() * h, a = (r() - 0.5) * 0.7, L = 8 + r() * 26; g.strokeStyle = r() < 0.5 ? `rgba(255,${210 + r() * 40},120,.6)` : `rgba(${140 + r() * 40},${95 + r() * 30},30,.55)`; g.lineWidth = 1 + r() * 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); }
  });
}
function crustTex(lattice) {
  const r = rng(lattice ? 31 : 53);
  return canvasTex(256, 256, (g, w, h) => {
    if (lattice) {   // pumpkin pie filling under a lattice
      g.fillStyle = '#c8641e'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(120,50,10,${0.1 + r() * 0.15})`; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 4, 0, 6.3); g.fill(); }
      g.lineCap = 'round';
      for (let k = 0; k < 2; k++) for (let i = 1; i < 6; i++) { const p = (i / 6) * w; g.strokeStyle = '#e9b867'; g.lineWidth = 18; g.beginPath(); k ? (g.moveTo(0, p), g.lineTo(w, p)) : (g.moveTo(p, 0), g.lineTo(p, h)); g.stroke(); g.strokeStyle = 'rgba(160,100,40,.5)'; g.lineWidth = 3; g.stroke(); }
    } else {          // plain golden crust with cracks + fork marks
      g.fillStyle = '#e2ad5c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${160 + r() * 60},${90 + r() * 40},30,${0.1 + r() * 0.2})`; g.fillRect(r() * w, r() * h, 2 + r() * 8, 2 + r() * 8); }
      g.strokeStyle = 'rgba(110,60,20,.55)'; g.lineWidth = 2;
      for (let i = 0; i < 9; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
    }
    // fluted crust edge
    g.strokeStyle = '#c98a3e'; g.lineWidth = 16; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 8, 0, 6.3); g.stroke();
  });
}
function cornTex() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#c99a1c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 12) for (let x = (y / 12) % 2 ? 6 : 0; x < w; x += 12) { const gr = g.createRadialGradient(x + 4, y + 4, 1, x + 5, y + 5, 7); gr.addColorStop(0, '#fff2a0'); gr.addColorStop(1, '#e8b52a'); g.fillStyle = gr; g.beginPath(); g.ellipse(x + 5, y + 6, 5.2, 5.6, 0, 0, 6.3); g.fill(); }
  }, [4, 1]);
}
function woodTex(base = '#8a5a32') {
  const r = rng(9);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const y = r() * h; g.strokeStyle = `rgba(${40 + r() * 30},${20 + r() * 20},10,${0.15 + r() * 0.25})`; g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 14, w * 0.7, y + (r() - 0.5) * 14, w, y); g.stroke(); }
  });
}
function clothTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f3e3c3'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(196,72,32,.55)'; for (let i = 0; i < 8; i += 2) { g.fillRect(i * 32, 0, 32, h); g.fillRect(0, i * 32, w, 32); }
  }, [2, 2]);
}
export function textTexture(lines, { w = 1024, h = 256, color = '#ffb347', glow = '#ff6a00', font = '"Permanent Marker", cursive', size = 120, bg = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 28); g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    const y = h / 2 + (i - (lines.length - 1) / 2) * size * 1.05, s = i ? size * 0.55 : size;
    g.font = `400 ${s}px ${font}`; g.shadowColor = glow; g.shadowBlur = 24; g.fillStyle = i ? '#ffffff' : color; g.fillText(l, w / 2, y); g.shadowBlur = 0; g.fillText(l, w / 2, y);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
/** bakes static meshes under `roots` into one mesh per material (+ shadow flags) under `parent`: far fewer draw calls
 *  on phones. Multi-material / instanced meshes are kept as they are (re-parented with their world transform). */
const _mm = new THREE.Matrix4();
export function mergeStatic(roots, parent) {
  parent.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert(), buckets = new Map(), keep = [];
  for (const r of roots) {
    r.updateMatrixWorld(true);
    r.traverse((o) => {
      if (!o.isMesh) return;
      if (Array.isArray(o.material) || o.isInstancedMesh || o.isSkinnedMesh) { keep.push(o); return; }
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(_mm.multiplyMatrices(inv, o.matrixWorld));
      const k = o.material.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '');
      if (!buckets.has(k)) buckets.set(k, { m: o.material, cs: o.castShadow, rs: o.receiveShadow, geos: [] });
      buckets.get(k).geos.push(g);
    });
  }
  for (const o of keep) parent.attach(o);
  for (const r of roots) if (!keep.includes(r)) r.parent?.remove(r);
  const out = [];
  for (const b of buckets.values()) { const m = new THREE.Mesh(mergeGeometries(b.geos, false), b.m); m.castShadow = b.cs; m.receiveShadow = b.rs; parent.add(m); out.push(m); }
  return out;
}

/** ribbed pumpkin (decoration) */
export function pumpkinGeometry(r0 = 0.42) {
  const g = new THREE.SphereGeometry(r0, 20, 12), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), rib = 1 + 0.07 * Math.cos(a * 8);
    v.x *= rib * 1.12; v.z *= rib * 1.12; v.y *= 0.82;
    p.setXYZ(i, v.x, v.y + r0 * 0.86, v.z);
  }
  g.computeVertexNormals(); return g;
}

// ------------------------------------------------------------------ the course
export class Course {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'OBBY'; scene.add(this.group);
    this.T = 0; this.els = []; this.cps = [];
    this.layout();
    this.visuals();
    this.update(0);
  }

  /** places every element on the spiral (arc length -> angle with the radius shrinking towards the finish) */
  layout() {
    let s = 0, y = 0, prevHalf = 0;
    const raw = COURSE.map(([type, gap, rise], i) => { const d = TYPES[type]; s += (i ? prevHalf + gap : 0) + d.L / 2; prevHalf = d.L / 2; y += rise; return { type, s, y }; });
    const total = s + prevHalf, step = 0.2;
    const thetaAt = (target) => { let th = START_A, u = 0; while (u < target) { const R = R0 + (R1 - R0) * (u / total); th += step / R; u += step; } return th; };
    let nSusan = 0, nSweep = 0, nPlat = 0, nCp = 0;
    for (const [i, x] of raw.entries()) {
      const d = TYPES[x.type], th = thetaAt(x.s), R = R0 + (R1 - R0) * (x.s / total);
      const base = new THREE.Vector3(C.x + Math.cos(th) * R, x.y, C.z + Math.sin(th) * R);
      const e = { i, type: x.type, ...d, th, R, base, pos: base.clone(), yaw: Math.atan2(-Math.cos(th), -Math.sin(th)),
        radial: new THREE.Vector3(Math.cos(th), 0, Math.sin(th)), solid: true, cp: -1, touch: 0, wob: -9, br: d.shape === 'box' ? Math.hypot(d.hx, d.hz) : d.r };
      if (x.type === 'cp') { e.cp = nCp++; this.cps.push(e); }
      if (x.type === 'susan') e.spin = [0.7, -0.9, 1.1][nSusan++ % 3];
      if (x.type === 'sweep') { e.spin = [1.4, -1.7][nSweep++ % 2]; e.pin = 3.7; }
      if (x.type === 'platter') { e.amp = 1.8; e.period = 4 + (nPlat % 2) * 0.6; e.phase = nPlat++ * 1.9; }
      if (x.type === 'jello') e.bounce = BOUNCE;
      if (x.type === 'crust') e.crumble = true;
      if (x.type === 'table') e.finish = true;
      e.ang = 0;
      this.els.push(e);
    }
    this.finishEl = this.els[this.els.length - 1];
    this.top = Math.max(...this.els.map((e) => e.base.y));
  }

  /** centre (top) of element e at time T (platters slide in and out across the path) */
  posAt(e, T, out = new THREE.Vector3()) {
    out.copy(e.base);
    if (e.amp) out.addScaledVector(e.radial, e.amp * Math.sin((T / e.period) * Math.PI * 2 + e.phase));
    return out;
  }
  /** surface velocity of element e at world point p (for carrying the player) */
  velAt(e, p, out) {
    out.set(0, 0, 0);
    if (e.amp) { const w = (Math.PI * 2) / e.period; out.copy(e.radial).multiplyScalar(e.amp * w * Math.cos((this.T / e.period) * Math.PI * 2 + e.phase)); }
    if (e.spin && e.type === 'susan') { const rx = p.x - e.pos.x, rz = p.z - e.pos.z; out.x += e.spin * rz; out.z += -e.spin * rx; }
    return out;
  }
  /** where the menu pad sits: on the ground just outside the start plate */
  padPos() { const e = this.cps[0]; return e.base.clone().addScaledVector(e.radial, TYPES.cp.r + 3.2).setY(0); }
  near(p) { return Math.abs(p.x - C.x) < OBBY_SITE.r + 8 && Math.abs(p.z - C.z) < OBBY_SITE.r + 8 && p.y > -5 && p.y < this.top + 20; }

  // ---- collision (the player's capsule as a cylinder: radius r, height h, feet at pos)
  local(e, p) {   // point -> element-local x (along the path) / z (across)
    const dx = p.x - e.pos.x, dz = p.z - e.pos.z, c = Math.cos(e.yaw), s = Math.sin(e.yaw);
    return [dx * c - dz * s, dx * s + dz * c];
  }
  inside(e, p, m) {
    if (e.shape === 'cyl') { const dx = p.x - e.pos.x, dz = p.z - e.pos.z; return dx * dx + dz * dz < (e.r + m) * (e.r + m); }
    const [lx, lz] = this.local(e, p); return Math.abs(lx) < e.hx + m && Math.abs(lz) < e.hz + m;
  }
  /** after the world step: land on / bump into / get pushed off course elements */
  resolve(body, prevY, wasGround) {
    const p = body.pos, r = body.radius, h = body.height;
    for (const e of this.els) {
      if (!e.solid) continue;
      const dx = p.x - e.pos.x, dz = p.z - e.pos.z, reach = e.br + r + 0.6;
      if (dx * dx + dz * dz > reach * reach) continue;
      const top = e.pos.y, bot = top - e.depth;
      if (p.y > top + 0.05 || p.y + h < bot) continue;
      // landing (or stepping up a low edge while walking)
      if (body.vel.y <= 0.01 && p.y <= top && ((prevY >= top - 0.06 && this.inside(e, p, 0.18)) || (wasGround && top - p.y < 0.5 && this.inside(e, p, r)))) {
        p.y = top; body.onGround = true; body._on = e;
        if (e.bounce) { body.vel.y = e.bounce; body.onGround = false; body._on = null; e.wob = this.T; this.onBounce?.(e, body); }
        else body.vel.y = 0;
        if (e.crumble && !e.touch) e.touch = this.T;
        this.onLand?.(e, body);
        continue;
      }
      // head bump from below
      if (body.vel.y > 0 && prevY + h <= bot + 0.05 && p.y + h > bot && this.inside(e, p, 0)) { p.y = bot - h; body.vel.y = 0; continue; }
      // sides: push out horizontally
      if (p.y < top - 0.04 && this.inside(e, p, r)) {
        if (e.shape === 'cyl') {
          const L = Math.hypot(dx, dz) || 1e-4, nx = dx / L, nz = dz / L, push = e.r + r - L;
          p.x += nx * push; p.z += nz * push; const vn = body.vel.x * nx + body.vel.z * nz; if (vn < 0) { body.vel.x -= vn * nx; body.vel.z -= vn * nz; }
        } else {
          const [lx, lz] = this.local(e, p), px = e.hx + r - Math.abs(lx), pz = e.hz + r - Math.abs(lz);
          let ox = 0, oz = 0; if (px < pz) ox = Math.sign(lx) * px; else oz = Math.sign(lz) * pz;
          const c = Math.cos(e.yaw), s = Math.sin(e.yaw), wx = ox * c + oz * s, wz = -ox * s + oz * c, L = Math.hypot(wx, wz) || 1e-4;
          p.x += wx; p.z += wz; const nx = wx / L, nz = wz / L, vn = body.vel.x * nx + body.vel.z * nz; if (vn < 0) { body.vel.x -= vn * nx; body.vel.z -= vn * nz; }
        }
      }
    }
    // rolling pins: sweep you off the pie (jump over them)
    for (const e of this.sweeps) {
      if (!e.solid || (body._bonk && this.T - body._bonk < 0.6)) continue;
      const rx = p.x - e.pos.x, rz = p.z - e.pos.z; if (rx * rx + rz * rz > (e.pin + 1) ** 2) continue;
      const py = e.pos.y + 0.6; if (p.y > py + 0.3 || p.y + h < py - 0.3) continue;
      const dxp = Math.cos(e.ang), dzp = -Math.sin(e.ang), along = rx * dxp + rz * dzp, perp = Math.abs(rx * dzp - rz * dxp);
      if (Math.abs(along) > e.pin || perp > 0.3 + r) continue;
      let tx = e.spin * rz, tz = -e.spin * rx; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
      body.vel.x = tx * 9; body.vel.z = tz * 9; body.vel.y = 6.5; body.onGround = false; body._on = null; body._bonk = this.T;
      this.onBonk?.(e, body);
    }
  }
  /** a body standing on e rides along with it */
  carry(e, body, dt) { this.velAt(e, body.pos, _v); body.pos.addScaledVector(_v, dt); }

  // ---- visuals
  visuals() {
    const G = this.group, els = this.els, byType = (t) => els.filter((e) => e.type === t);
    const hayM = new THREE.MeshStandardMaterial({ map: hayTex(), roughness: 0.95 });
    const twineM = new THREE.MeshStandardMaterial({ color: '#7a4a1e', roughness: 0.9 });
    const lattice = new THREE.MeshStandardMaterial({ map: crustTex(true), roughness: 0.7 });
    const plain = new THREE.MeshStandardMaterial({ map: crustTex(false), roughness: 0.75 });
    const crustSide = new THREE.MeshStandardMaterial({ color: '#c98a3e', roughness: 0.8 });
    const tinM = new THREE.MeshStandardMaterial({ color: '#b9bec6', roughness: 0.25, metalness: 0.85 });
    const wood = new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.75 });
    const cranM = new THREE.MeshStandardMaterial({ color: '#a3122e', roughness: 0.22, emissive: '#3a0010', emissiveIntensity: 0.4 });
    const plateM = new THREE.MeshStandardMaterial({ color: '#f6f1e6', roughness: 0.35 });
    const shadow = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
    const inst = (geo, mat, list, place = (e, m4) => m4.compose(e.pos, _q.setFromAxisAngle(UP, e.yaw), _one)) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((e, k) => { place(e, _m4); m.setMatrixAt(k, _m4); });
      m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); shadow(m); G.add(m); return m;
    };
    // hay bales (+ two twine bands each)
    for (const t of ['hay', 'hay2']) {
      const d = TYPES[t], list = byType(t); if (!list.length) continue;
      inst(new THREE.BoxGeometry(d.hx * 2, d.depth, d.hz * 2).translate(0, -d.depth / 2, 0), hayM, list);
      const band = new THREE.BoxGeometry(0.08, d.depth + 0.02, d.hz * 2 + 0.02).translate(0, -d.depth / 2, 0);
      for (const off of [-d.hx * 0.45, d.hx * 0.45]) inst(band, twineM, list, (e, m4) => { _q.setFromAxisAngle(UP, e.yaw); _v.set(off, 0, 0).applyQuaternion(_q).add(e.pos); m4.compose(_v, _q, _one); });
    }
    // corn cobs (balance beams) + husk tufts at the ends
    { const d = TYPES.corn, list = byType('corn');
      const cob = new THREE.CylinderGeometry(d.hz, d.hz, d.hx * 2, 18).rotateZ(Math.PI / 2).translate(0, -d.hz, 0);
      inst(cob, new THREE.MeshStandardMaterial({ map: cornTex(), roughness: 0.55 }), list);
      const husk = new THREE.ConeGeometry(d.hz * 1.25, 1.4, 6, 1, true).rotateZ(Math.PI / 2).translate(-d.hx - 0.55, -d.hz, 0);
      const huskM = new THREE.MeshStandardMaterial({ color: '#7d9a3a', roughness: 0.9, side: THREE.DoubleSide });
      inst(husk, huskM, list); inst(husk.clone().rotateY(Math.PI), huskM, list); }
    // pies (lattice top) + crusts (plain top: these crumble)
    const pieGeo = (d) => new THREE.CylinderGeometry(d.r, d.r * 0.88, d.depth, 32).translate(0, -d.depth / 2, 0);
    inst(pieGeo(TYPES.pie), [crustSide, lattice, crustSide], byType('pie'));
    this.crusts = byType('crust');
    this.crustMesh = inst(pieGeo(TYPES.crust), [crustSide, plain, crustSide], this.crusts);
    this.crustMesh.frustumCulled = false;
    // cranberry sauce (ridged like it came out of the can): its own mesh so it can wobble
    { const d = TYPES.jello, g = new THREE.CylinderGeometry(d.r, d.r, d.depth, 28, 6), p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const y = p.getY(k), x = p.getX(k), z = p.getZ(k), f = 1 + 0.045 * Math.cos((y / d.depth + 0.5) * Math.PI * 8) * (Math.abs(y) < d.depth / 2 - 0.01 ? 1 : 0); p.setXYZ(k, x * f, y - d.depth / 2, z * f); }
      g.computeVertexNormals();
      for (const e of byType('jello')) { const m = shadow(new THREE.Mesh(g, cranM)); m.position.copy(e.pos); G.add(m); e.obj = m;
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(d.r * 1.35, d.r * 1.2, 0.08, 28), plateM); plate.position.y = -d.depth - 0.04; m.add(plate); } }
    // checkpoints: a dinner plate with a pilgrim-hat flag (turns gold when reached); the start is the first one
    this.flags = [];
    const rimM = new THREE.MeshStandardMaterial({ color: '#c46a1e', roughness: 0.4 }), buckleM = new THREE.MeshBasicMaterial({ color: '#ffd23d', side: THREE.DoubleSide });
    for (const e of this.cps) {
      const d = TYPES.cp, g = new THREE.Group(); g.position.copy(e.pos); G.add(g); e.obj = g;
      const plate = shadow(new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r * 0.82, d.depth, 40).translate(0, -d.depth / 2, 0), plateM)); g.add(plate);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(d.r - 0.15, 0.06, 6, 48), rimM); rim.rotation.x = Math.PI / 2; rim.position.y = 0.01; g.add(rim);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), wood); _v.set(0, 0, 0).addScaledVector(e.radial, d.r - 0.5); pole.position.set(_v.x, 1.3, _v.z); pole.castShadow = true; g.add(pole);
      const flagM = new THREE.MeshStandardMaterial({ color: e.cp === 0 ? '#ffb347' : '#5a4632', roughness: 0.6, side: THREE.DoubleSide, emissive: '#000000' });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), flagM); flag.position.set(_v.x + Math.cos(e.yaw) * 0.55, 2.25, _v.z - Math.sin(e.yaw) * 0.55); flag.rotation.y = e.yaw; g.add(flag);
      const buckle = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), buckleM); buckle.position.copy(flag.position); buckle.position.y -= 0.05; buckle.rotation.y = e.yaw; buckle.translateZ(0.01); g.add(buckle);
      this.flags.push(flagM);
    }
    mergeStatic(this.cps.map((e) => e.obj), G); this.cps.forEach((e) => { e.obj = null; });
    // platters (slide), lazy susans (spin, with little dishes riding on them), pies with rolling pins
    for (const e of byType('platter')) {
      const d = TYPES.platter, m = shadow(new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r * 0.92, d.depth, 32).translate(0, -d.depth / 2, 0), tinM)); G.add(m); e.obj = m;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(d.r - 0.05, 0.05, 6, 40), tinM); rim.rotation.x = Math.PI / 2; m.add(rim);
    }
    const dishM = [new THREE.MeshStandardMaterial({ color: '#f3c34a', roughness: 0.5 }), cranM, new THREE.MeshStandardMaterial({ color: '#e9dcc0', roughness: 0.6 })];
    for (const e of byType('susan')) {
      const d = TYPES.susan, g = new THREE.Group(); g.position.copy(e.pos); G.add(g); e.obj = g;
      g.add(shadow(new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, d.depth, 40).translate(0, -d.depth / 2, 0), wood)));
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 0.5, 16), wood); base.position.y = -d.depth - 0.25; g.add(base);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2, dish = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.14, 14), dishM[k]); dish.position.set(Math.cos(a) * (d.r - 0.55), 0.07, Math.sin(a) * (d.r - 0.55)); g.add(dish); }
      mergeStatic(g.children.slice(), g);   // still one spinning group
    }
    this.sweeps = byType('sweep');
    for (const e of this.sweeps) {
      const d = TYPES.sweep, g = new THREE.Group(); g.position.copy(e.pos); G.add(g); e.obj = g;
      g.add(shadow(new THREE.Mesh(pieGeo(d), [crustSide, lattice, crustSide])));
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.9, 10), wood); hub.position.y = 0.4; g.add(hub);
      const pin = new THREE.Group(); pin.position.y = 0.6; g.add(pin); e.pinObj = pin;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, e.pin * 2 - 1.2, 16).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ map: woodTex('#c79a63'), roughness: 0.6 })); barrel.castShadow = true; pin.add(barrel);
      for (const sx of [-1, 1]) { const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8).rotateZ(Math.PI / 2), wood); hd.position.x = sx * (e.pin - 0.3); pin.add(hd); }
    }
    // the feast table (finish): table cloth, legs, a roast turkey, pies, and a FEAST arch over it
    { const e = this.finishEl, d = TYPES.table, g = new THREE.Group(); g.position.copy(e.pos); g.rotation.y = e.yaw; G.add(g); e.obj = g;
      g.add(shadow(new THREE.Mesh(new THREE.BoxGeometry(d.hx * 2, d.depth, d.hz * 2).translate(0, -d.depth / 2, 0), wood)));
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(d.hx * 2 + 0.2, 0.04, d.hz * 1.4), new THREE.MeshStandardMaterial({ map: clothTex(), roughness: 0.9 })); cloth.position.y = 0.02; cloth.receiveShadow = true; g.add(cloth);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 2.2, 8), wood); leg.position.set(sx * (d.hx - 0.3), -d.depth - 1.1, sz * (d.hz - 0.3)); g.add(leg); }
      const roast = new THREE.Group(); roast.position.set(0, 0.04, 0); g.add(roast);
      const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.85, 0.08, 24), tinM); platter.position.y = 0.04; roast.add(platter);
      const bird = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12), new THREE.MeshStandardMaterial({ color: '#a8571e', roughness: 0.35 })); bird.scale.set(1.1, 0.72, 0.85); bird.position.y = 0.48; bird.castShadow = true; roast.add(bird);
      for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.4, 4, 8), bird.material); leg.position.set(0.55, 0.52, sx * 0.3); leg.rotation.z = -1.1; roast.add(leg);
        const bone = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), plateM); bone.position.set(0.85, 0.66, sx * 0.3); roast.add(bone); }
      for (const [x, z] of [[-2.3, 0.9], [2.3, -0.9], [-2.4, -1.0], [2.2, 1.0]]) { const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.14, 20), [crustSide, lattice, crustSide]); pie.position.set(x, 0.09, z); g.add(pie); }
      const archM = new THREE.MeshStandardMaterial({ color: '#7a4a26', roughness: 0.8 });
      for (const sz of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 0.3), archM); post.position.set(-d.hx + 0.3, 2.1, sz * (d.hz - 0.2)); post.castShadow = true; g.add(post); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, d.hz * 2), archM); beam.position.set(-d.hx + 0.3, 4.2, 0); g.add(beam);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshBasicMaterial({ map: textTexture(['FEAST! 🦃'], { size: 150, color: '#ffd23d', glow: '#ff6a00' }), transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
      sign.position.set(-d.hx + 0.3, 4.95, 0); sign.rotation.y = -Math.PI / 2; g.add(sign);
      mergeStatic([g], G); e.obj = null; }
  }

  /** per frame: move / spin / crumble (only drawn while near; the state still advances with T) */
  update(T) {
    this.T = T;
    for (const e of this.els) {
      if (e.amp) { this.posAt(e, T, e.pos); e.obj.position.copy(e.pos); }
      if (e.spin) { e.ang = e.spin * T; if (e.type === 'susan') e.obj.rotation.y = e.ang; else e.pinObj.rotation.y = e.ang; }
      if (e.bounce && e.obj) { const k = T - e.wob; const w = k < 0.6 ? Math.sin(k * 30) * 0.12 * (1 - k / 0.6) : 0; e.obj.scale.set(1 + w * 0.5, 1 - w, 1 + w * 0.5); }
    }
    // crusts: shake, drop + fade, come back
    let dirty = false;
    this.crusts.forEach((e, k) => {
      const age = e.touch ? T - e.touch : -1;
      if (e.touch && age > CRUMBLE + CRUMBLE_BACK) { e.touch = 0; e.solid = true; }
      const was = e._st, st = !e.touch ? 0 : age < CRUMBLE ? 1 : 2;
      e.solid = st < 2;
      if (st === 0 && was === 0) return;
      e._st = st; dirty = true;
      _v.copy(e.pos); let sc = 1;
      if (st === 1) { _v.x += Math.sin(T * 60) * 0.05; _v.z += Math.cos(T * 53) * 0.05; }
      if (st === 2) { const f = age - CRUMBLE; _v.y -= 9 * f * f; sc = Math.max(0.001, 1 - f * 0.9); }
      _m4.compose(_v, _q.setFromAxisAngle(UP, e.yaw), _s.set(sc, sc, sc)); this.crustMesh.setMatrixAt(k, _m4);
    });
    if (dirty) this.crustMesh.instanceMatrix.needsUpdate = true;
  }
  setFlag(cp, on) { const m = this.flags[cp]; if (!m) return; m.color.set(on ? '#ffd23d' : cp === 0 ? '#ffb347' : '#5a4632'); m.emissive.set(on ? '#7a5200' : '#000000'); }
}
const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();

/** the world physics plus the course (swapped in for the player; everything else keeps using the world's) */
export class ObbyPhysics {
  constructor(world, course) { this.w = world; this.c = course; }
  step(body, dt, gravity = -28) {
    if (!this.c.near(body.pos)) { body._on = null; return this.w.step(body, dt, gravity); }
    if (body._on && body.onGround) this.c.carry(body._on, body, dt);
    const prevY = body.pos.y, wasGround = body.onGround;
    this.w.step(body, dt, gravity);
    body._on = null;
    this.c.resolve(body, prevY, wasGround);
  }
  raycast(o, d, f) { return this.w.raycast(o, d, f); }
  raycastHit(o, d, f) { return this.w.raycastHit(o, d, f); }
  groundAt(x, z, y) { return this.w.groundAt(x, z, y); }
}

// ------------------------------------------------------------------ the timed run
export class GobbleObby {
  constructor({ scene, player, progress, quests, sfx, hud, ui, getChars, course }) {
    Object.assign(this, { scene, player, progress, quests, sfx, hud, ui, getChars, course });
    this.active = false; this.state = 'idle'; this.id = 'obby';
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    course.onLand = (e, body) => { if (body === this.player.body) this.landed(e); };
    course.onBounce = (e, body) => { if (body === this.player.body) this.sfx.play('jump', { rate: 0.7 }); };
    course.onBonk = (e, body) => { if (body === this.player.body) { this.sfx.play('scratch'); if (this.active) this.ui.pop('BONK! 🥖'); } };
  }
  get S() { const s = this.progress.s; s.mg ||= {}; s.mg.obby ||= { best: null, games: 0, finishes: 0, wins: 0, weekBest: null, week: null, today: 0, day: null }; return s.mg.obby; }
  get start() { return this.course.cps[0]; }
  get padPos() { return this.course.padPos(); }

  begin(onEnd, race = null) {
    if (this.active) return;
    this.race = race; this.onEnd = onEnd; this.seed = (race ? race.seed : (Math.random() * 4294967295)) >>> 0;
    this.clock = 0; this.cp = 0; this.maxIdx = 0; this.falls = 0; this.done = false; this.time = null;
    this.course.cps.forEach((_, i) => this.course.setFlag(i, i === 0));
    // bots (solo): 4 distinct names
    this.bots = [];
    if (!race) {
      const chars = this.getChars().filter(Boolean), rnd = seeded(this.seed ^ 0x7e7);
      const names = BOT_NAMES.slice().sort(() => rnd() - 0.5);
      for (let k = 0; k < 4 && chars.length; k++) {
        const c = makeCharacter(chars[(k * 5 + Math.floor(rnd() * chars.length)) % chars.length], { shadow: true });
        const a = (k / 4) * Math.PI * 2 + 0.4, off = new THREE.Vector3(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3);
        const b = { c, name: names[k], idx: 0, cp: 0, state: 'wait', t: 0.4 + rnd() * 0.6, off, pos: this.start.pos.clone().add(off), from: new THREE.Vector3(), to: new THREE.Vector3(),
          dur: 0, u: 0, arc: 0, miss: false, vy: 0, facing: this.start.yaw + Math.PI / 2, done: false, time: null, prog: 0, rnd: seeded(this.seed + k * 977),
          speed: 4.6 + rnd() * 1.4, pause: [0.55 + rnd() * 0.3, 1.15 + rnd() * 0.45], skill: 0.75 + rnd() * 0.5 };
        c.root.position.copy(b.pos); this.group.add(c.root); this.bots.push(b);
      }
    }
    this.group.visible = true;
    this.returnTo = this.padPos;
    this.respawn(false);
    this.active = true; this.state = 'countdown'; this.t = race ? Math.max(1, (race.at - Date.now()) / 1000) : 3.2;
    this.ui.show(); this.ui.labels(['STAGE', 'RANK', 'FALLS']); this.ui.set({ time: '0:00.0', a: '1/5', b: '–', c: 0 }); this.ui.countdown(Math.ceil(this.t));
    this.ui.route((race ? 'MATCH · ' : 'VS BOTS · ') + 'RACE UP TO THE FEAST'); this.ui.board(null);
    this.sfx.play('whoosh'); this.sfx.music?.('bagrun');
  }
  /** back to the current checkpoint */
  respawn(count = true) {
    const e = this.course.cps[this.cp], a = e.yaw;
    this.player.teleport(e.pos.clone().setY(e.pos.y + 0.05)); this.player.body._on = e;
    this.player.facing = a + Math.PI / 2; this.player.root.rotation.y = this.player.facing; this.player.emote = null;   // face along the path
    if (count) { this.falls++; this.sfx.play('poof'); this.ui.pop(this.cp ? `BACK TO CHECKPOINT ${this.cp}` : 'BACK TO THE START'); }
  }
  landed(e) {
    if (!this.active || this.state !== 'run') return;
    if (e.i > this.maxIdx) this.maxIdx = e.i;
    if (e.cp > this.cp) { this.cp = e.cp; this.course.setFlag(e.cp, true); this.sfx.play('tier'); this.ui.pop(`CHECKPOINT ${e.cp}/4 · ${STAGES[e.cp]}`); this.ui.route(`STAGE ${e.cp + 1} · ${STAGES[e.cp]}`); }
    if (e.finish && !this.done) { this.done = true; this.time = this.elapsed; this.sfx.play('levelup'); this.ui.pop(`FEAST! ${fmtTime(this.time)}`); this.endAt = this.clock + 1.2; }
  }
  get elapsed() { return this.state === 'run' || this.state === 'end' ? this.clock - this.startClock : 0; }

  rivals() { return this.race ? this.rivalList || [] : []; }
  standings() {
    const me = { name: 'You', me: true, done: this.done, time: this.time, prog: this.maxIdx };
    return [me].concat(this.bots.map((b) => ({ name: b.name, done: b.done, time: b.time, prog: b.prog })), this.rivals())
      .sort((a, b) => (b.done - a.done) || (a.done ? a.time - b.time : b.prog - a.prog));
  }
  stageOf(idx) { let s = 0; for (const e of this.course.cps) if (e.i <= idx) s = e.cp; return s; }

  update(dt) {
    if (!this.active) return;
    this.clock += dt;
    if (this.state === 'countdown') {
      const before = Math.ceil(this.t); this.t = this.race ? (this.race.at - Date.now()) / 1000 : this.t - dt; const now = Math.ceil(this.t);
      if (now !== before && now > 0) { this.ui.countdown(now); this.sfx.play('tap'); }
      if (this.t <= 0) { this.state = 'run'; this.startClock = this.clock; this.ui.countdown('GO!'); this.sfx.play('levelup'); this.ui.route(`STAGE 1 · ${STAGES[0]}`); }
      this.animBots(dt); return;
    }
    if (this.state === 'run') {
      const P = this.player.body.pos, cpEl = this.course.cps[this.cp];
      if (!this.done) {
        // fell: well below the checkpoint, or back on the ground after leaving the start
        if (P.y < cpEl.pos.y - 7 || (this.player.body.onGround && !this.player.body._on && P.y < 1 && this.maxIdx > 0)) this.respawn();
        if (this.elapsed >= LIMIT) { this.finish(); return; }
      }
      for (const b of this.bots) this.botStep(b, dt);
      const st = this.standings(), rank = st.findIndex((r) => r.me) + 1;
      this.ui.set({ time: fmtTime(this.done ? this.time : this.elapsed), a: `${this.stageOf(this.maxIdx) + 1}/5`, b: st.length > 1 ? `#${rank}` : '–', c: this.falls });
      if ((this.boardT = (this.boardT || 0) + dt) > 0.5) { this.boardT = 0; this.ui.board(st.map((r) => ({ name: r.name, me: r.me, done: r.done, score: r.done ? fmtTime(r.time) : `stage ${this.stageOf(r.prog) + 1}` }))); }
      if (this.done && this.clock >= this.endAt) this.finish();
    }
    this.animBots(dt);
  }

  // bots: scripted hops from element to element (they misjudge some jumps and go back to their checkpoint)
  botStep(b, dt) {
    if (b.done) return;
    const els = this.course.els, T = this.course.T;
    if (b.state === 'wait') {
      const e = els[b.idx]; this.course.posAt(e, T, b.pos).add(b.off);
      if ((b.t -= dt) > 0) return;
      const n = els[b.idx + 1]; if (!n) return;
      b.from.copy(b.pos); const dist = Math.hypot(n.base.x - e.base.x, n.base.z - e.base.z);
      b.dur = THREE.MathUtils.clamp(dist / b.speed, 0.45, 1.15); this.course.posAt(n, T + b.dur, b.to);
      b.off.set((b.rnd() - 0.5) * 0.8, 0, (b.rnd() - 0.5) * 0.8); if (n.type === 'corn') b.off.multiplyScalar(0.3);
      b.to.add(b.off);
      const risky = n.crumble || n.amp || n.spin || n.bounce ? 1.9 : n.type === 'corn' ? 1.5 : 1;
      b.miss = b.rnd() < (0.045 * risky) / b.skill;
      if (b.miss) { const side = b.rnd() < 0.5 ? -1 : 1; b.to.addScaledVector(n.radial, side * (n.br + 1.6)); }
      const hi = Math.max(b.from.y, b.to.y), mid = (b.from.y + b.to.y) / 2; b.arc = hi - mid + (e.bounce ? 1.6 : 0.8);
      b.u = 0; b.state = 'hop'; b.facing = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z); b.c.play('Jump', 0.08, 1.15);
      return;
    }
    if (b.state === 'hop') {
      b.u = Math.min(1, b.u + dt / b.dur);
      b.pos.lerpVectors(b.from, b.to, b.u); b.pos.y += 4 * b.arc * b.u * (1 - b.u);
      if (b.u < 1) return;
      if (b.miss) { b.state = 'fall'; b.vy = 0; b.t = 0; return; }
      b.idx++; b.prog = Math.max(b.prog, b.idx); const e = els[b.idx];
      if (e.cp > b.cp) b.cp = e.cp;
      if (e.bounce) e.wob = T;
      if (e.finish) { b.done = true; b.time = this.elapsed; b.state = 'wait'; this.hud.chat?.('SYSTEM', 'Gobble Obby', `${b.name} reached the feast (${fmtTime(b.time)})`, '#ffb347'); return; }
      b.off.copy(b.pos).sub(this.course.posAt(e, T, _v)); b.off.y = 0;
      b.state = 'wait'; b.t = b.pause[0] + b.rnd() * (b.pause[1] - b.pause[0]) * (e.spin || e.amp ? 0.5 : 1);
      return;
    }
    if (b.state === 'fall') {
      b.vy -= 28 * dt; b.pos.y = Math.max(0, b.pos.y + b.vy * dt);
      if (b.pos.y > 0) return;
      if ((b.t += dt) < 0.9) return;
      const cpEl = this.course.cps[b.cp]; b.idx = cpEl.i; b.off.set((b.rnd() - 0.5) * 2, 0, (b.rnd() - 0.5) * 2); b.pos.copy(cpEl.pos).add(b.off);
      b.state = 'wait'; b.t = 0.6;
    }
  }
  animBots(dt) {
    for (const b of this.bots) {
      b.c.root.position.copy(b.pos); b.c.root.rotation.y = b.facing;
      if (b.state === 'fall') b.c.play('Fall', 0.2); else if (b.state === 'wait') b.c.play('Idle', 0.25);
      b.c.mixer.update(dt);
    }
  }

  finish(quit = false) {
    if (!this.active) return;
    const S = this.S, wk = weekKey(), dk = dayKey();
    if (S.week !== wk) { S.week = wk; S.weekBest = null; }
    if (S.day !== dk) { S.day = dk; S.today = 0; }
    const st = this.standings(), place = st.findIndex((r) => r.me) + 1, done = this.done && !quit;
    const win = done && st.length > 1 && place === 1;
    const pb = done && (S.best == null || this.time < S.best);
    const stage = this.stageOf(this.maxIdx) + 1;
    let xp = 0;
    if (!quit) {
      S.games++; S.today++; if (done) S.finishes++; if (win) S.wins++;
      if (done) { S.best = S.best == null ? this.time : Math.min(S.best, this.time); S.weekBest = S.weekBest == null ? this.time : Math.min(S.weekBest, this.time); }
      const mult = S.today <= 10 ? 1 : S.today <= 20 ? 0.5 : 0.1;
      const base = 15 + stage * 6 + (done ? 20 + Math.max(0, Math.round((180 - this.time) / 6)) : 0) + (win ? 15 : 0);
      xp = this.progress.grant(Math.round(Math.min(110, base) * mult), 'minigame');
      this.quests.emit('minigame', 1, { id: 'obby' }); this.quests.emit('thanksgiving', 1);
      if (done) { this.quests.emit('obby_finish', 1); if (this.time < 120) this.quests.emit('obby_fast', 1); }
      if (win) this.quests.emit('obby_win', 1);
      this.quests.checkAchievements?.(); this.progress.save();
    }
    this.active = false; this.state = 'idle';
    for (const b of this.bots) this.group.remove(b.c.root);
    this.bots = []; this.group.visible = false;
    this.ui.hide(); this.ui.labels(null);
    if (this.returnTo) this.player.teleport(this.returnTo.clone().setY(this.returnTo.y + 0.1));
    this.sfx.stopMusic?.(1.2); this.sfx.play(quit ? 'whoosh' : win || pb ? 'achieve' : 'success');
    this.onEnd?.({ quit, done, win, race: this.race, time: this.time, stage, falls: this.falls, place, of: st.length, xp, pb, best: S.best, wins: S.wins, finishes: S.finishes, runsToday: S.today, standings: st });
  }
}
