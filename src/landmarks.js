// Vault landmarks from the user's models, swapped in for generated world structures at load:
//   WANO VAULT  (public/assets/wano_vault.glb)  replaces the RWA Vault hall on its plinth east of the plaza
//                (zone rwa_vault)  -> graded One Piece card raffles (featured: the vault's real Luffy PSA 10, src/rwa.js)
//   KANTO VAULT (public/assets/kanto_vault.glb) replaces the APEX RWA Arena stands and gate in the far south-east
//                (zone apex_arena) -> graded Pokemon card raffles (cards to be announced)
// Both models are solid (not enterable), so each vault gets a forecourt with 3 hologram showcases on pedestals and
// an E prompt at its door. Zone ids stay the same (saves, quests, kiosks, Bag Run plans keep working); only the
// labels change.
//
// Order (main.js): prepareVaults(world, models) BEFORE world.init -> it registers
//   world.colliderEdit (cut the old structures out of the collision mesh, add the models' own triangles + pedestals),
//   world.holoSpecs (hologram positions/kinds/labels) and world.zoneLabels;
// then placeVaults(scene, world, models) AFTER world.init cuts the old visuals and adds the meshes.
// Coordinates are three.js world space (x, up, z) = Blender (x, z, -y).
import * as THREE from 'three';
import { toWorldFloat } from './physics.js';

const KANTO_C = new THREE.Vector2(145, 155);
const KANTO_N = new THREE.Vector2(-145, -155).normalize();          // arena -> plaza (the old gate direction)
const KANTO_GATE = KANTO_C.clone().addScaledVector(KANTO_N, 31);
// Kanto Vault stands in the open middle of Chad's Bull Run plaza (between the golden bull and the sand towers),
// facing the way in from the city; the old arena site is only cleared
const KANTO_SITE = new THREE.Vector2(108, 133);
const KANTO_FACE = KANTO_SITE.clone().negate().normalize();

export const VAULTS = {
  rwa_vault: {
    id: 'wano', label: 'WANO VAULT', theme: 'onepiece', color: '#ff5a3d',
    model: 'wano_vault', k: 16, plate: 0.02, door: 0.13, slab: 0.383,   // on the 1 m model: base-slab height, door + slab-edge depth from centre
    centre: [53.6, -22], ground: 1.2, front: [-1, 0],                // on the old plinth (top 1.2 m), door faces west
    cuts: [{ type: 'box', c: [50.25, -22], n: [-1, 0], halfW: 11.2, halfD: 11.6, y1: 34, floorY: 1.3 }],
    holos: { dist: 6.6, spread: 5.5, y: 0.7 },                       // metres in front of the door: forecourt on the plinth
    comingSoon: true,                                                // test play: no raffles yet; the One Piece slab floats under a COMING SOON sign
    soonText: ['RAFFLE OPENS AFTER $VERSE TOKEN', 'TRADES $250K VOLUME'],   // the sign's details (two lines)
    soonModel: 'assets/wano_slab.glb',
    clearKit: [[40.6, -21.0]],                                       // street lamp right in front of the slab (three.js x, z)                               // the featured slab (main.js loads it into showcase 0)
  },
  apex_arena: {
    id: 'kanto', label: 'KANTO VAULT', theme: 'pokemon', color: '#ff3b3b',
    model: 'kanto_vault', k: 24, plate: 0.014, door: 0.085, slab: 0.38,
    centre: [KANTO_SITE.x, KANTO_SITE.y], ground: 0.01, front: [KANTO_FACE.x, KANTO_FACE.y],
    zone: { pos: [KANTO_SITE.x, KANTO_SITE.y], radius: 22 },         // the zone (label, minimap, fast travel) moves with it
    cuts: [
      { type: 'ring', c: [KANTO_C.x, KANTO_C.y], r0: 15.4, r1: 30.8, y1: 12, floorY: 0.35 },              // stands + glow ring
      { type: 'box', c: [KANTO_GATE.x, KANTO_GATE.y], n: [KANTO_N.x, KANTO_N.y], halfW: 14.5, halfD: 2.4, y1: 17, floorY: 0.35 },   // old arena gate
    ],
    holos: { dist: 9.7, spread: 6, y: 0.7 },                         // just past the base slab
    packs: true,                                                     // showcases: floating booster-pack models (no pedestals), one per raffle
  },
};

// Plain landmark swaps (no raffle, no holograms): the user's models replace generated structures the same way.
//   GM ARCH      (public/assets/gm_arch.glb)     replaces the "WELCOME TO BAGVERSE / GM" arch over the south avenue;
//                GM! sign faces the plaza, players walk through the opening (Pepe and Doge sit on the side plinths)
//   DOGE STATUE  (public/assets/doge_statue.glb) replaces the blue pillar + orb on the Doge & Bonk Park fountain;
//                stands on the old basin (top 1.0 m), facing the city
export const PROPS = {
  gm_arch: {
    id: 'gm_arch', model: 'gm_arch', k: 24, door: 0, slab: 0.203,
    centre: [0, 92], ground: 0, front: [0, -1],
    cuts: [{ type: 'box', c: [0, 92], n: [0, 1], halfW: 12.6, halfD: 1.7, y1: 20, floorY: 0.3 }],
  },
  doge_statue: {
    id: 'doge_statue', model: 'doge_statue', k: 12, door: 0, slab: 0.431,
    centre: [-125, -125], ground: 1.0, front: [Math.SQRT1_2, Math.SQRT1_2],
    cuts: [{ type: 'ring', c: [-125, -125], r0: 0, r1: 6.8, y1: 9, floorY: 0.85 }],   // pillar, orb, glow disc; the basin stays
  },
};
const ALL = { ...VAULTS, ...PROPS };

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x, z, y = 0) => new THREE.Vector3(x, y, z);

/** door-facing frame of a vault: n (front normal), t (tangent), door point at ground level */
function frame(V) {
  const n = v3(V.front[0], V.front[1]).normalize(), t = new THREE.Vector3().crossVectors(UP, n);
  const door = v3(V.centre[0], V.centre[1], V.ground).addScaledVector(n, V.door * V.k);   // the recessed doors (measured)
  return { n, t, door };
}
/** where the E prompt and the guide beacon point: in front of the door */
export function vaultFront(zoneId) { const V = VAULTS[zoneId]; if (!V) return null; const { n, door } = frame(V); return door.clone().addScaledVector(n, 1.6).setY(V.ground + 0.15); }

function holoSpots(V) {
  const { n, t, door } = frame(V), h = V.holos, out = [];
  const base = door.clone().addScaledVector(n, h.dist);
  for (const s of [-1, 0, 1]) out.push(base.clone().addScaledVector(t, s * h.spread));
  return out;
}

function inside(cut, x, y, z) {
  if (y > cut.y1) return false;
  const dx = x - cut.c[0], dz = z - cut.c[1];
  if (cut.type === 'ring') { const r = Math.hypot(dx, dz); return r >= cut.r0 && r <= cut.r1; }
  const nx = cut.n[0], nz = cut.n[1], L = Math.hypot(nx, nz), ux = nx / L, uz = nz / L;
  return Math.abs(dx * ux + dz * uz) <= cut.halfD && Math.abs(-dx * uz + dz * ux) <= cut.halfW;
}
/** keep triangles unless all three corners are inside a cut (and the triangle is not ground-level) */
function filterIndex(pos, index, cuts) {
  const keep = []; let removed = 0;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    let cut = false;
    for (const C of cuts) {
      const ya = pos.getY(a), yb = pos.getY(b), yc = pos.getY(c);
      if (ya < C.floorY && yb < C.floorY && yc < C.floorY) continue;     // ground, plinths, curbs, paint: never cut
      if (inside(C, pos.getX(a), ya, pos.getZ(a)) && inside(C, pos.getX(b), yb, pos.getZ(b)) && inside(C, pos.getX(c), yc, pos.getZ(c))) { cut = true; break; }
    }
    if (cut) removed++; else keep.push(a, b, c);
  }
  return { keep, removed };
}

function modelSource(gltf) {
  let src = null; gltf.scene.updateMatrixWorld(true); gltf.scene.traverse((o) => { if (!src && o.isMesh) src = o; });
  return src && { geo: toWorldFloat(src), mat: src.material };
}
function modelMatrix(V) {
  const { n } = frame(V), sink = V.plate != null ? V.plate * V.k - 0.15 : V.sink || 0;   // vaults: base slab top ends up 15 cm above the ground (climbable)
  return new THREE.Matrix4().compose(v3(V.centre[0], V.centre[1], V.ground - sink), new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(n.x, n.z)), new THREE.Vector3(V.k, V.k, V.k));
}
const PED = { r: 0.9, h: 1.1 };

/** call before world.init: registers the collider edit, hologram specs and zone labels */
export function prepareVaults(world, models) {
  const active = Object.entries(ALL).filter(([, V]) => models[V.model]);
  if (!active.length) return;
  world.zoneLabels = Object.fromEntries(active.filter(([, V]) => V.label).map(([zid, V]) => [zid, V.label]));
  world.zoneMoves = Object.fromEntries(active.filter(([, V]) => V.zone).map(([zid, V]) => [zid, V.zone]));
  // holograms: Wano = the real Luffy slab between two mystery One Piece slabs; Kanto = three mystery Pokemon slabs
  world.holoSpecs = [];
  for (const [zid, V] of active) {
    if (!V.holos) continue;
    if (V.comingSoon) {   // one floating showcase in the middle of the forecourt (no label: the sign above says it all)
      const { n } = frame(V), p = holoSpots(V)[1];
      world.holoSpecs.push({ pos: p.clone().setY(V.ground + 2.45), facing: Math.atan2(n.x, n.z), kind: 'pack', slot: 0, theme: V.theme, label: [V.label, ''], zone: zid, noLabel: true, color: V.color });
      continue;
    }
    const spots = holoSpots(V), { n } = frame(V);
    spots.forEach((p, i) => {
      if (V.packs) { world.holoSpecs.push({ pos: p.clone().setY(V.ground + 2.45), facing: Math.atan2(n.x, n.z), kind: 'pack', slot: i, theme: V.theme, label: ['POKÉMON RAFFLE', 'GRADED CARD · TBA'], zone: zid }); return; }
      const featured = V.theme === 'onepiece' && i === 1;
      world.holoSpecs.push({ pos: p.clone().setY(V.ground + PED.h + V.holos.y), facing: Math.atan2(n.x, n.z), kind: featured ? 'slab' : 'mystery', theme: V.theme,
        label: featured ? null : V.theme === 'onepiece' ? ['ONE PIECE RAFFLE', 'GRADED CARD · TBA'] : ['POKÉMON RAFFLE', 'GRADED CARD · TBA'], zone: zid });
    });
  }
  world.colliderEdit = (collider) => {
    const g = toWorldFloat(collider, ['position']);
    const idx = g.index ? Array.from(g.index.array) : [...Array(g.attributes.position.count).keys()];
    const cuts = active.flatMap(([, V]) => V.cuts);
    const { keep, removed } = filterIndex(g.attributes.position, idx, cuts);
    // add each model's own triangles and the pedestals
    const pos = Array.from(g.attributes.position.array), index = keep.slice();
    const addGeo = (geo, m) => {
      const p = geo.attributes.position, base = pos.length / 3, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); }
      const gi = geo.index ? geo.index.array : [...Array(p.count).keys()];
      for (let i = 0; i < gi.length; i++) index.push(base + gi[i]);
    };
    for (const [, V] of active) {
      const src = modelSource(models[V.model]); if (src) addGeo(src.geo, modelMatrix(V));
      if (!V.holos || V.packs || V.comingSoon) continue;
      const ped = new THREE.CylinderGeometry(PED.r, PED.r, PED.h, 12).translate(0, PED.h / 2, 0);
      for (const p of holoSpots(V)) addGeo(ped, new THREE.Matrix4().makeTranslation(p.x, V.ground, p.z));
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setIndex(index);
    collider.geometry = out;
    collider.removeFromParent(); collider.position.set(0, 0, 0); collider.quaternion.identity(); collider.scale.set(1, 1, 1); collider.updateMatrix(); collider.updateMatrixWorld(true);   // matrixAutoUpdate is off for world meshes
    console.log('landmarks: collider', removed, 'old triangles cut');
  };
}

/** a vault that isn't open yet: a big COMING SOON sign floating over its forecourt, always facing the player */
function comingSoonSign(scene, world, V) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 448; const g = c.getContext('2d');
  g.fillStyle = 'rgba(12,8,14,.88)'; g.beginPath(); g.roundRect(14, 14, 996, 420, 36); g.fill();
  g.shadowColor = V.color; g.shadowBlur = 28; g.strokeStyle = V.color; g.lineWidth = 10; g.beginPath(); g.roundRect(14, 14, 996, 420, 36); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ffffff'; g.shadowBlur = 18; g.fillStyle = '#ffffff'; g.font = '800 140px Rajdhani, "Arial Black", sans-serif'; g.fillText('COMING SOON', 512, 138);
  const lines = V.soonText || [`${V.label} · ONE PIECE RAFFLES`];
  g.shadowColor = V.color; g.shadowBlur = 12; g.fillStyle = '#ffc83d';
  lines.forEach((t, i) => { let s = 58; do { g.font = `700 ${s}px Rajdhani, sans-serif`; s -= 2; } while (g.measureText(t).width > 920 && s > 24); g.fillText(t, 512, 268 + i * 76); });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, toneMapped: false, depthWrite: false }));
  const { n, door } = frame(V), base = door.clone().addScaledVector(n, V.holos.dist).setY(V.ground + 5.9);   // above the floating slab
  sign.scale.set(7.2, 3.15, 1); sign.position.copy(base); scene.add(sign);
  world.anim?.push((t) => { sign.position.y = base.y + Math.sin(t * 1.1) * 0.18; });
  const L = new THREE.PointLight(V.color, 14, 16, 2); L.position.copy(door).addScaledVector(n, 2).setY(V.ground + 4); scene.add(L);
}

/** call after world.init: cut the old visuals, add the vault meshes, pedestals and door lights */
export function placeVaults(scene, world, models, { shadows = true } = {}) {
  const active = Object.entries(ALL).filter(([, V]) => models[V.model]);
  if (!active.length) return 0;
  const cuts = active.flatMap(([, V]) => V.cuts);
  let removed = 0;
  world.root.traverse((o) => {
    if (!o.isMesh || o.name === 'COLLIDER' || !o.geometry.index || /^(BB_|TICKER_|PORTAL_FX_|KIT_|STANDEE_|VAULT_)/.test(o.name)) return;
    o.geometry.computeBoundingBox();
    const wb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    const near = cuts.some((C) => { const r = C.type === 'ring' ? C.r1 : Math.hypot(C.halfW, C.halfD); return wb.min.x < C.c[0] + r && wb.max.x > C.c[0] - r && wb.min.z < C.c[1] + r && wb.max.z > C.c[1] - r; });
    if (!near) return;
    if (!o.userData.baked) { o.geometry = toWorldFloat(o); o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1); o.matrixAutoUpdate = false; o.updateMatrix(); o.updateMatrixWorld(true); o.userData.baked = true; }
    const r = filterIndex(o.geometry.attributes.position, o.geometry.index.array, cuts);
    if (r.removed) { o.geometry.setIndex(r.keep); o.geometry.computeBoundingSphere(); removed += r.removed; }
  });
  // street props and trees standing where a vault now is
  const covered = (x, z) => active.some(([, V]) => { const { n, t } = frame(V), dx = x - V.centre[0], dz = z - V.centre[1];
    return Math.abs(dx * n.x + dz * n.z) <= V.slab * V.k + 1 && Math.abs(dx * t.x + dz * t.z) <= V.k * 0.5 + 1; });
  const k0 = world.kitSpots.length, t0 = world.treeSpots.length;
  const cleared = (x, z) => active.some(([, V]) => (V.clearKit || []).some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 1.5));   // props a vault asks to remove
  world.kitSpots = world.kitSpots.filter((s) => !covered(s.pos.x, s.pos.z) && !cleared(s.pos.x, s.pos.z));
  world.treeSpots = world.treeSpots.filter((s) => !covered(s.pos.x, s.pos.z));
  if (k0 - world.kitSpots.length || t0 - world.treeSpots.length) console.log('vaults: cleared', k0 - world.kitSpots.length, 'kit props,', t0 - world.treeSpots.length, 'trees');
  const pedMat = new THREE.MeshStandardMaterial({ color: '#efe9e0', roughness: 0.35, metalness: 0.1 });
  for (const [, V] of active) {
    const src = modelSource(models[V.model]); if (!src) continue;
    const m = new THREE.Mesh(src.geo, src.mat); m.name = 'VAULT_' + V.id;
    modelMatrix(V).decompose(m.position, m.quaternion, m.scale);
    m.castShadow = shadows; m.receiveShadow = true; scene.add(m);
    if (!V.holos) continue;
    if (V.comingSoon) { comingSoonSign(scene, world, V); continue; }
    if (V.packs) { const { n, door } = frame(V), L = new THREE.PointLight(V.color, 14, 16, 2); L.position.copy(door).addScaledVector(n, 2).setY(V.ground + 4); scene.add(L); continue; }   // no pedestals: the packs float
    const rim = new THREE.MeshStandardMaterial({ color: V.color, emissive: V.color, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.6 });
    for (const p of holoSpots(V)) {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(PED.r, PED.r * 1.15, PED.h, 24), pedMat); ped.position.set(p.x, V.ground + PED.h / 2, p.z);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(PED.r + 0.05, PED.r + 0.05, 0.08, 24), rim); ring.position.set(p.x, V.ground + PED.h, p.z);
      ped.castShadow = ring.castShadow = shadows; ped.receiveShadow = true; scene.add(ped, ring);
    }
    // warm light spilling from the door onto the forecourt
    const { n, door } = frame(V), L = new THREE.PointLight(V.color, 14, 16, 2); L.position.copy(door).addScaledVector(n, 2).setY(V.ground + 4); scene.add(L);
  }
  console.log('landmarks placed', active.map(([, V]) => V.id).join(', '), '·', removed, 'old triangles cut');
  return active.length;
}
