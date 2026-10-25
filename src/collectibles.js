// World pickups and points of interest for the progression loop:
//  - 220 hidden green money Bags (20 per district, deterministic spots on open ground) -> +100 XP each, +1,000 per district
//  - RWA prize entry kiosks in the districts (free, level-gated tournament entries; the Vault keeps its showroom)
//  - the guide beacon (a light shaft + spinning diamond) the onboarding tutorial points with
import * as THREE from 'three';
import { DISTRICTS } from './quests.js';

const rnd = (seed) => { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const UP = new THREE.Vector3(0, 1, 0);

/** an open-sky spot on walkable ground near (cx, cz) within radius r, or null */
function openSpot(ph, cx, cz, r, rand, { tries = 60, clear = 1.2, maxY = 7 } = {}) {
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < tries; i++) {
    const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * r, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    const g = ph.groundAt(x, z, maxY + 2);
    if (g > maxY || g < -2) continue;
    o.set(x, g + 0.6, z);
    if (ph.raycast(o, UP, 30) < 30) continue;                       // under a roof / inside a building
    let ok = true;
    for (let k = 0; k < 6 && ok; k++) { const b = (k / 6) * Math.PI * 2; d.set(Math.cos(b), 0, Math.sin(b)); if (ph.raycast(o, d, clear) < clear) ok = false; }
    if (!ok) continue;
    return new THREE.Vector3(x, g, z);
  }
  return null;
}

// test play: the district kiosks are off for now (their prizes aren't real yet); the data stays for later
export const KIOSKS_ON = false;
export const KIOSKS = [
  { id: 'k_bull', zone: 'bull_run', name: "Chad's Bull Run Kiosk", tier: 1, prize: '1 g tokenized gold bar', event: 'Bull Run Sprint Cup', game: 'bagrun', gameName: 'Bag Run' },
  { id: 'k_doge', zone: 'doge_park', name: 'Doge Park Kiosk', tier: 1, prize: 'Graded trading card (PSA 9)', event: 'Doge Park Dash', game: 'tiledrop', gameName: 'Tile Drop' },
  { id: 'k_swamp', zone: 'swamp', name: "Pepe's Swamp Kiosk", tier: 1, prize: 'Tokenized silver coin', event: 'Swamp Stomp Showdown', game: 'tiledrop', gameName: 'Tile Drop' },
  { id: 'k_gm', zone: 'gm_gate', name: 'GM Gate Kiosk', tier: 1, prize: 'Vaulted sneaker grail', event: 'GM Gate Gauntlet', game: 'bagrun', gameName: 'Bag Run' },
  { id: 'k_hodl', zone: 'hodl_heights', name: 'HODL Heights Kiosk', tier: 2, prize: 'Tokenized gold watch', event: 'Heights High Score', game: 'vaultheist', gameName: 'Vault Heist' },
  { id: 'k_copium', zone: 'copium', name: 'Copium Refinery Kiosk', tier: 2, prize: '10 g tokenized gold', event: 'Refinery Rush', game: 'vaultheist', gameName: 'Vault Heist' },
  { id: 'k_arcade', zone: 'arcade', name: 'Arcade Kiosk', tier: 2, prize: 'Graded grail card (PSA 10)', event: 'Arcade Masters', game: 'arcade', gameName: 'Arcade Dance-Off' },
  // (no kiosk in apex_arena: the Kanto Vault stands there, and a kiosk prompt would cover its door)
];
export const TIER_LEVEL = { 1: 25, 2: 50, 3: 100 };

function kioskLabel(k) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#2a1a00'); grd.addColorStop(1, '#0b0618'); g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#ffc83d'; g.lineWidth = 10; g.strokeRect(8, 8, 496, 240);
  g.fillStyle = '#ffc83d'; g.font = '700 54px Rajdhani, sans-serif'; g.textAlign = 'center'; g.fillText('RWA PRIZE ENTRY', 256, 92);
  g.fillStyle = '#ffffff'; g.font = '600 34px Rajdhani, sans-serif'; g.fillText(k.event.toUpperCase(), 256, 150);
  g.fillStyle = '#7cff3d'; g.font = '700 32px Rajdhani, sans-serif'; g.fillText(`FREE ENTRY · LV ${TIER_LEVEL[k.tier]}+`, 256, 206);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function kioskMesh(k) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#1c1630', roughness: 0.5, metalness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: '#ffc83d', emissive: '#ffb000', emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.9 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.25, 32), dark); base.position.y = 0.125; g.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.04, 8, 48), gold); ring.rotation.x = Math.PI / 2; ring.position.y = 0.26; g.add(ring);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.3, 0.22), dark); post.position.y = 1.4; g.add(post);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), new THREE.MeshBasicMaterial({ map: kioskLabel(k), toneMapped: false, side: THREE.DoubleSide }));
  panel.position.y = 2.95; g.add(panel);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.12, 1.12, 0.06), gold); frame.position.set(0, 2.95, -0.04); g.add(frame);
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.03), gold); card.position.y = 1.55; g.add(card);
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 2.0, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#ffc83d', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  halo.position.y = 1.25; g.add(halo);
  g.userData = { card, panel, kiosk: k };
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

// money-bag models (public/assets/bag_<green|gold|purple>.glb, 1 m tall, ~1.6k tris): set from main.js after loading.
// bagAsset(color) gives { geometry, material } sized like the old procedural sack (0.45 m), or that sack if a model is missing.
const BAG_MODELS = {};
const FALLBACK_COL = { green: '#3ddc6a', gold: '#ffc83d', purple: '#b84dff' };
export function setBagModels(gltfs) {
  for (const [name, g] of Object.entries(gltfs)) {
    if (!g) continue;
    let mesh = null; g.scene.updateMatrixWorld(true); g.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
    if (!mesh) continue;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); geometry.scale(0.45, 0.45, 0.45);
    const material = mesh.material.clone();
    if (material.map) { material.emissive = new THREE.Color('#ffffff'); material.emissiveMap = material.map; material.emissiveIntensity = 0.28; }
    BAG_MODELS[name] = { geometry, material };
  }
}
export function bagAsset(color = 'green') {
  const m = BAG_MODELS[color]; if (m) return m;
  const c = FALLBACK_COL[color] || '#ffc83d';
  return { geometry: bagGeometry(), material: new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.8 }) };
}

export function bagGeometry() {
  // fallback sack: lathe body + tied neck
  const pts = [[0, 0], [0.16, 0.02], [0.22, 0.12], [0.2, 0.24], [0.1, 0.32], [0.06, 0.36], [0.1, 0.42], [0.0, 0.43]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 14);
}

export class Collectibles {
  constructor(scene, world, progress) {
    this.scene = scene; this.world = world; this.p = progress;
    const ph = world.physics, zones = Object.fromEntries(world.zones.map((z) => [z.id, z]));
    // ---- bags
    this.bags = [];
    for (const zid of DISTRICTS) {
      const z = zones[zid]; if (!z) continue;
      const rand = rnd('bags:' + zid), r = Math.max(z.radius, 18) * 0.95;
      const mine = [];
      const spaced = (q) => q && mine.every((m) => m.distanceToSquared(q) > 6 * 6);   // keep Bags at least 6 m apart
      for (let i = 0; i < 20; i++) {
        let p = null;
        for (let k = 0; k < 12 && !spaced(p); k++) p = openSpot(ph, z.pos.x, z.pos.z, r * (k < 4 ? 1 : k < 8 ? 1.4 : 1.8), rand, { tries: 60, clear: k < 4 ? 1.2 : 0.8 });
        if (spaced(p)) { mine.push(p); this.bags.push({ id: `${zid}:${i}`, zone: zid, pos: p, phase: rand() * 6.28 }); }
      }
    }
    const found = new Set(progress.s.bags);
    const bag = bagAsset('green');
    this.mesh = new THREE.InstancedMesh(bag.geometry, bag.material, this.bags.length);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    // soft glow under each bag
    const gp = new Float32Array(this.bags.length * 3);
    this.glowGeo = new THREE.BufferGeometry(); this.glowGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
    this.glow = new THREE.Points(this.glowGeo, new THREE.PointsMaterial({ color: '#5dff7a', size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, map: glowDot() }));
    this.glow.frustumCulled = false; scene.add(this.glow);
    for (const b of this.bags) b.found = found.has(b.id);
    this.districtTotal = Object.fromEntries(DISTRICTS.map((d) => [d, this.bags.filter((b) => b.zone === d).length]));
    // ---- kiosks
    this.kiosks = [];
    for (const k of KIOSKS_ON ? KIOSKS : []) {
      const z = zones[k.zone]; if (!z) continue;
      const pos = openSpot(ph, z.pos.x, z.pos.z, Math.min(16, z.radius * 0.5), rnd('kiosk:' + k.id), { tries: 120, clear: 2.2 })
        || openSpot(ph, z.pos.x, z.pos.z, z.radius, rnd('kiosk2:' + k.id), { tries: 160, clear: 1.6 });
      if (!pos) continue;
      const m = kioskMesh(k); m.position.copy(pos);
      m.rotation.y = Math.atan2(z.pos.x - pos.x, z.pos.z - pos.z);   // the sign faces the district centre, where players come from
      scene.add(m);
      this.kiosks.push({ ...k, pos, mesh: m });
    }
    // ---- guide beacon
    this.beacon = beaconMesh(); this.beacon.visible = false; scene.add(this.beacon);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._v = new THREE.Vector3();
    this.update(0, new THREE.Vector3(1e9, 0, 0));
    console.log('collectibles', this.bags.length, 'bags,', this.kiosks.length, 'kiosks');
  }

  get foundCount() { return this.bags.filter((b) => b.found).length; }
  nearestBag(p) { let best = null, bd = 1e9; for (const b of this.bags) { if (b.found) continue; const d = b.pos.distanceToSquared(p); if (d < bd) { bd = d; best = b; } } return best; }
  nearestKiosk(p) { let best = null, bd = 1e9; for (const k of this.kiosks) { const d = k.pos.distanceToSquared(p); if (d < bd) { bd = d; best = k; } } return best; }
  kioskNear(p, r = 3.2) { return this.kiosks.find((k) => Math.hypot(k.pos.x - p.x, k.pos.z - p.z) < r && Math.abs(k.pos.y - p.y) < 2.5) || null; }
  districtProgress(zid) { return { found: this.bags.filter((b) => b.zone === zid && b.found).length, total: this.districtTotal[zid] || 0 }; }

  /** collect any bag within reach of p; returns the collected bags */
  collect(p) {
    const got = [];
    for (const b of this.bags) {
      if (b.found || Math.abs(b.pos.y - p.y) > 2.2) continue;
      if ((b.pos.x - p.x) ** 2 + (b.pos.z - p.z) ** 2 < 1.6 * 1.6) { b.found = true; this.p.s.bags.push(b.id); got.push(b); }
    }
    if (got.length) this.p.save();
    return got;
  }

  setBeacon(pos, color = '#7cff3d') {
    if (!pos) { this.beacon.visible = false; return; }
    this.beacon.visible = true; this.beacon.position.copy(pos);
    this.beacon.userData.mats.forEach((m) => m.color.set(color));
  }

  update(t, camPos) {
    const m = this._m, q = this._q, s = this._s, gp = this.glowGeo.attributes.position;
    this.bags.forEach((b, i) => {
      if (b.found) { s.set(0, 0, 0); m.compose(b.pos, q.identity(), s); this.mesh.setMatrixAt(i, m); gp.setXYZ(i, 0, -999, 0); return; }
      const far = camPos.distanceToSquared(b.pos) > 90 * 90;
      const y = b.pos.y + 0.35 + (far ? 0 : Math.sin(t * 2 + b.phase) * 0.08);
      q.setFromAxisAngle(_Y, far ? b.phase : t * 1.4 + b.phase); s.setScalar(1.25);
      this._v.set(b.pos.x, y, b.pos.z); m.compose(this._v, q, s); this.mesh.setMatrixAt(i, m);
      gp.setXYZ(i, b.pos.x, b.pos.y + 0.55, b.pos.z);
    });
    this.mesh.instanceMatrix.needsUpdate = true; gp.needsUpdate = true;
    for (const k of this.kiosks) { const u = k.mesh.userData; u.card.rotation.y = t * 1.2; u.card.position.y = 1.55 + Math.sin(t * 1.6) * 0.08; }
    if (this.beacon.visible) { const u = this.beacon.userData; u.gem.rotation.y = t * 2; u.gem.position.y = 4.2 + Math.sin(t * 2.4) * 0.25; u.shaft.material.opacity = 0.22 + Math.sin(t * 3) * 0.06; }
  }
}
const _Y = new THREE.Vector3(0, 1, 0);

function glowDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function beaconMesh() {
  const g = new THREE.Group();
  const shaftMat = new THREE.MeshBasicMaterial({ color: '#7cff3d', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 40, 20, 1, true), shaftMat); shaft.position.y = 20; g.add(shaft);
  const gemMat = new THREE.MeshBasicMaterial({ color: '#7cff3d', toneMapped: false });
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), gemMat); gem.position.y = 4.2; g.add(gem);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#7cff3d', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 40), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring);
  g.userData = { shaft, gem, mats: [shaftMat, gemMat, ringMat] };
  g.renderOrder = 5;
  return g;
}
