// THANKSGIVING ARENA: the old APEX arena ring at Chad's Bull Run (the Halloween Arena before it) is dressed as a
// harvest yard round the GOBBLE OBBY (src/minigames/obby.js): a giant pilgrim turkey in the middle with the course
// spiralling up round it, a wooden arch with a "THANKSGIVING ARENA" sign facing the city, a split-rail fence, hay
// bales, corn shocks, pumpkins, autumn trees, leaf-littered ground and falling leaves.
// Decoration has no collision (only the course is solid), so nothing blocks the walk in.
import * as THREE from 'three';
import { Course, OBBY_SITE, TO_CITY, pumpkinGeometry, textTexture, mergeStatic } from './minigames/obby.js';

export const THANKSGIVING_ON = true;
const C = new THREE.Vector3(OBBY_SITE.x, 0, OBBY_SITE.z);
const CITY_A = Math.atan2(TO_CITY.z, TO_CITY.x);
const R = 33;   // fence radius
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const angGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** builds the yard + the course; returns { course, pads, group, update(dt, camPos), padAt(p) } */
export function buildThanksgiving(scene, world, { light = false } = {}) {
  const ph = world.physics, group = new THREE.Group(); group.name = 'THANKSGIVING_ARENA'; scene.add(group);
  const ground = (x, z) => ph.groundAt(x, z, 8);
  const course = new Course(scene);
  const pad0 = course.padPos();
  const padA = Math.atan2(pad0.z - C.z, pad0.x - C.x);
  const wood = new THREE.MeshStandardMaterial({ color: '#7a4a26', roughness: 0.85 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const rnd = rng(1126);

  // ---- arch with the sign, on the fence line facing the city
  // inside the fence (26 m) and a bit oversized, so the sign shows over the Kanto Vault from the city side
  const archC = C.clone().addScaledVector(TO_CITY, 26), yaw = Math.atan2(TO_CITY.x, TO_CITY.z);
  const arch = new THREE.Group(); arch.position.set(archC.x, ground(archC.x, archC.z), archC.z); arch.rotation.y = yaw; arch.scale.setScalar(1.25); group.add(arch);
  const shockM = new THREE.MeshStandardMaterial({ color: '#c9a443', roughness: 0.95 });
  for (const sx of [-5.6, 5.6]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 7.6, 0.9), wood); p.position.set(sx, 3.8, 0); p.castShadow = true; arch.add(p);
    const shock = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.4, 9, 1, true), shockM); shock.position.set(sx, 1.7, 0.9); arch.add(shock);   // corn shocks at the feet
    const pk = new THREE.Mesh(pumpkinGeometry(0.55), new THREE.MeshStandardMaterial({ color: '#e8761a', roughness: 0.6 })); pk.position.set(sx + (sx > 0 ? -1.2 : 1.2), 0, 1.3); arch.add(pk);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(13, 1.2, 0.7), wood); beam.position.y = 7.2; beam.castShadow = true; arch.add(beam);
  const signTex = textTexture(['THANKSGIVING ARENA'], { size: 118, color: '#ffb347', glow: '#ff5a00' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 2.9), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
  sign.position.set(0, 7.2, 0.4); arch.add(sign);
  const sign2 = sign.clone(); sign2.position.z = -0.4; sign2.rotation.y = Math.PI; arch.add(sign2);
  mergeStatic([arch], group);

  // ---- the start pad (menu): at the foot of the course
  const pads = [], spin = [];
  { const d = { id: 'obby', label: '🦃 GOBBLE OBBY', sub: 'RACE TO THE FEAST', color: '#ff9a2e' }, pos = pad0.clone(); pos.y = ground(pos.x, pos.z);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.18, 40), new THREE.MeshStandardMaterial({ color: '#2a1a0e', emissive: d.color, emissiveIntensity: 0.45, roughness: 0.4 }));
    disc.position.set(pos.x, pos.y + 0.09, pos.z); group.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.07, 8, 64), new THREE.MeshBasicMaterial({ color: d.color, toneMapped: false }));
    ring.rotation.x = Math.PI / 2; ring.position.set(pos.x, pos.y + 0.2, pos.z); group.add(ring); spin.push(ring);
    const beamM = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 7, 32, 1, true), new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beamM.position.set(pos.x, pos.y + 3.6, pos.z); group.add(beamM);
    const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture([d.label, d.sub], { w: 1024, h: 320, color: d.color, glow: d.color, font: 'Rajdhani, sans-serif', size: 120, bg: 'rgba(30,16,6,.72)' }), toneMapped: false, depthWrite: false }));
    lab.scale.set(5.2, 1.62, 1); lab.position.set(pos.x, pos.y + 4.4, pos.z); group.add(lab);
    pads.push({ id: d.id, label: d.label, pos }); }

  // ---- ground: grass with leaf litter, fading out at the edge
  { const gc = document.createElement('canvas'); gc.width = gc.height = 512; const g = gc.getContext('2d');
    g.fillStyle = '#5a6b2e'; g.fillRect(0, 0, 512, 512);
    const leaf = ['#c0451f', '#d9761c', '#e8a83a', '#8a3a1a', '#a8622a'];
    for (let i = 0; i < 2200; i++) { const k = rnd(); g.fillStyle = k < 0.45 ? `rgba(${70 + rnd() * 30},${95 + rnd() * 40},40,.6)` : leaf[Math.floor(rnd() * leaf.length)]; const x = rnd() * 512, y = rnd() * 512; if (k < 0.45) g.fillRect(x, y, 2 + rnd() * 4, 2 + rnd() * 4); else { g.beginPath(); g.ellipse(x, y, 2 + rnd() * 3, 1 + rnd() * 2, rnd() * 3, 0, 6.3); g.fill(); } }
    const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
    // opaque and a few cm up: a transparent lawn lost the depth fight with the old arena floor under it
    const dirt = new THREE.Mesh(new THREE.CircleGeometry(R + 1.2, 64), new THREE.MeshStandardMaterial({ map: gt, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    dirt.rotation.x = -Math.PI / 2; dirt.position.set(C.x, ground(C.x, C.z) + 0.07, C.z); dirt.receiveShadow = true; group.add(dirt); }

  // ---- split-rail fence (open at the arch)
  { const post = new THREE.BoxGeometry(0.22, 1.5, 0.22).translate(0, 0.75, 0), NP = Math.floor((2 * Math.PI * R) / 3), posts = new THREE.InstancedMesh(post, wood, NP); let np = 0;
    for (let k = 0; k < NP; k++) { const a = (k / NP) * Math.PI * 2; if (angGap(a, CITY_A) < 0.22) continue; const x = C.x + Math.cos(a) * R, z = C.z + Math.sin(a) * R; m4.makeTranslation(x, ground(x, z), z); posts.setMatrixAt(np++, m4); }
    posts.count = np; posts.castShadow = true; group.add(posts);
    for (const y of [0.55, 1.2]) { const rail = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 4, 140, Math.PI * 2 - 0.44), wood); rail.rotation.x = Math.PI / 2; rail.rotation.z = -(CITY_A + 0.22); rail.position.set(C.x, ground(C.x, C.z) + y, C.z); group.add(rail); } }

  // ---- harvest props round the fence: hay bales, corn shocks, pumpkins (instanced)
  const clear = (a) => angGap(a, CITY_A) > 0.3 && angGap(a, padA) > 0.2;
  { const hay = new THREE.MeshStandardMaterial({ color: '#d9a845', roughness: 0.95 });
    const box = new THREE.BoxGeometry(2.0, 1.0, 1.2).translate(0, 0.5, 0), N = 16, bales = new THREE.InstancedMesh(box, hay, N * 2); let n = 0;
    for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2 + 0.2; if (!clear(a)) continue; const r = R - 2.2 - rnd() * 1.5, x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r, gy = ground(x, z);
      q.setFromAxisAngle(Y, -a + (rnd() - 0.5) * 0.4); m4.compose(v.set(x, gy, z), q, s.set(1, 1, 1)); bales.setMatrixAt(n++, m4);
      if (rnd() < 0.5) { q.setFromAxisAngle(Y, -a + (rnd() - 0.5) * 0.6); m4.compose(v.set(x + (rnd() - 0.5) * 0.4, gy + 1, z + (rnd() - 0.5) * 0.4), q, s.set(0.9, 1, 0.9)); bales.setMatrixAt(n++, m4); } }
    bales.count = n; bales.castShadow = bales.receiveShadow = true; group.add(bales);
    const shock = new THREE.ConeGeometry(0.9, 2.8, 8, 1, true).translate(0, 1.4, 0), NS = 12, shocks = new THREE.InstancedMesh(shock, shockM, NS); let ns = 0;
    for (let k = 0; k < NS; k++) { const a = (k / NS) * Math.PI * 2 + 0.45; if (!clear(a)) continue; const r = R - 1.4, x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r; m4.compose(v.set(x, ground(x, z), z), q.setFromAxisAngle(Y, rnd() * 6), s.set(1, 0.85 + rnd() * 0.3, 1)); shocks.setMatrixAt(ns++, m4); }
    shocks.count = ns; shocks.castShadow = true; group.add(shocks);
    const NPK = 28, pks = new THREE.InstancedMesh(pumpkinGeometry(0.42), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), NPK); let npk = 0;
    const pkCol = ['#e8761a', '#f09a2a', '#d9661a', '#efe6cf', '#c95a14'];
    for (let k = 0; k < NPK; k++) { const a = rnd() * Math.PI * 2; if (!clear(a)) continue; const r = 24 + rnd() * 7, x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r;
      m4.compose(v.set(x, ground(x, z), z), q.setFromAxisAngle(Y, rnd() * 6), s.setScalar(0.8 + rnd() * 1.4)); pks.setMatrixAt(npk, m4); pks.setColorAt(npk, col.set(pkCol[Math.floor(rnd() * pkCol.length)])); npk++; }
    pks.count = npk; pks.castShadow = true; group.add(pks); }

  // ---- autumn trees outside the course (trunks + 3 canopy blobs each, instanced)
  { const NT = 9, trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.5, 5, 7).translate(0, 2.5, 0), new THREE.MeshStandardMaterial({ color: '#4a2f1c', roughness: 1 }), NT);
    const blobs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.8, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), NT * 3);
    const leafCol = ['#d9541e', '#e8892a', '#f2b43a', '#b8361a', '#c96a1e']; let nt = 0, nb = 0;
    for (let k = 0; k < NT; k++) { const a = (k / NT) * Math.PI * 2 + 0.9; if (!clear(a)) continue; const r = 28 + rnd() * 3, x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r, gy = ground(x, z), h = 0.9 + rnd() * 0.4;
      m4.compose(v.set(x, gy, z), q.identity(), s.set(1, h, 1)); trunks.setMatrixAt(nt++, m4);
      for (let j = 0; j < 3; j++) { const ja = j * 2.1 + rnd(); m4.compose(v.set(x + Math.cos(ja) * 1.1, gy + 5 * h + 0.6 + j * 0.5, z + Math.sin(ja) * 1.1), q.identity(), s.setScalar(0.8 + rnd() * 0.5)); blobs.setMatrixAt(nb, m4); blobs.setColorAt(nb, col.set(leafCol[Math.floor(rnd() * leafCol.length)])); nb++; } }
    trunks.count = nt; blobs.count = nb; trunks.castShadow = blobs.castShadow = true; group.add(trunks, blobs); }

  // ---- the giant pilgrim turkey in the middle (faces the city)
  { const t = turkey(C, ground(C.x, C.z), Math.atan2(TO_CITY.x, TO_CITY.z)); group.add(t); mergeStatic([t], group); }

  // ---- falling leaves (one Points draw; moved on the CPU only while you're near)
  const NL = light ? 80 : 150, lp = new Float32Array(NL * 3), lc = new Float32Array(NL * 3), seeds = [];
  const leafCols = ['#d9541e', '#e8892a', '#f2b43a', '#b8361a'].map((h) => new THREE.Color(h));
  for (let i = 0; i < NL; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R; seeds.push({ x: C.x + Math.cos(a) * r, z: C.z + Math.sin(a) * r, y: rnd() * 32, sp: 0.6 + rnd() * 0.7, ph: rnd() * 6.28 }); const c = leafCols[i % 4]; lc.set([c.r, c.g, c.b], i * 3); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  lg.boundingSphere = new THREE.Sphere(new THREE.Vector3(C.x, 16, C.z), R + 10);
  const leafTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 4); g.quadraticCurveTo(62, 30, 32, 60); g.quadraticCurveTo(2, 30, 32, 4); g.fill(); const t = new THREE.CanvasTexture(c); return t; })();
  const leaves = new THREE.Points(lg, new THREE.PointsMaterial({ size: 0.45, map: leafTex, vertexColors: true, transparent: true, alphaTest: 0.4, depthWrite: false }));
  group.add(leaves);

  // zone: label, minimap, fast travel (replaces the Halloween Arena's)
  { const k = world.zones.findIndex((z) => z.id === 'halloween'); if (k >= 0) world.zones.splice(k, 1); }
  if (!world.zones.some((z) => z.id === 'thanksgiving')) { world.zones.push({ id: 'thanksgiving', label: 'THANKSGIVING ARENA', radius: 24, color: '#ff9a2e', pos: C.clone() }); world.zones.sort((a, b) => a.radius - b.radius); }

  let leafT = 0, ct = 0;
  return {
    course, pads, group,
    /** dt: the game's frame step (the course runs on its own clock, so moving parts match the physics) */
    update(dt, camPos) {
      ct += dt; const t = ct;
      spin.forEach((r) => { r.rotation.z = t * 0.8; });
      const near = !camPos || Math.hypot(camPos.x - C.x, camPos.z - C.z) < 150;
      if (!near) return;
      course.update(t);
      leafT += dt;
      for (let i = 0; i < NL; i++) { const L = seeds[i]; let y = L.y - ((leafT * L.sp) % 34); if (y < 0) y += 34; lp[i * 3] = L.x + Math.sin(leafT * 0.9 + L.ph) * 1.2; lp[i * 3 + 1] = y; lp[i * 3 + 2] = L.z + Math.cos(leafT * 0.7 + L.ph) * 1.2; }
      lg.attributes.position.needsUpdate = true;
    },
    /** the pad the player is standing on, or null */
    padAt(p) { for (const d of pads) if (Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < 2.6 && Math.abs(p.y - d.pos.y) < 2.5) return d; return null; },
  };
}

/** a ~10.5 m cartoon turkey in a pilgrim hat, built from primitives */
function turkey(C, gy, yaw) {
  const g = new THREE.Group(); g.position.set(C.x, gy, C.z); g.rotation.y = yaw; g.name = 'GIANT_TURKEY';
  const mats = new Map(), M = (color, o = {}) => { const k = color + JSON.stringify(o); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o })); return mats.get(k); };
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const sph = new THREE.SphereGeometry(1, 24, 16);
  // tail fan (behind: local -z)
  const feather = ['#b5361f', '#d9761c', '#f2b43a', '#8a4e24', '#d9761c', '#b5361f'];
  for (let k = 0; k < 11; k++) {
    const a = -1.35 + (k / 10) * 2.7, m = add(sph, M(feather[k % feather.length]), Math.sin(a) * 3.9, 4.8 + Math.cos(a) * 3.9, -2.4 - Math.abs(Math.sin(a)) * 0.2, 1.05, 3.2, 0.22);
    m.rotation.z = -a; m.rotation.x = -0.18;
    const tip = add(sph, M('#f3e3c3'), Math.sin(a) * 6.6, 4.8 + Math.cos(a) * 6.6, -2.55, 0.62, 0.62, 0.2); tip.rotation.z = -a;
  }
  add(sph, M('#6b3f1f'), 0, 4.6, 0, 3.0, 2.8, 3.3);                       // body
  add(sph, M('#8a5428'), 0, 4.3, 1.6, 2.2, 2.2, 1.9);                     // breast
  for (const sx of [-1, 1]) { const w = add(sph, M('#53301a'), sx * 2.7, 4.7, -0.1, 0.55, 1.35, 1.9); w.rotation.z = sx * 0.25; }   // wings
  const neck = add(new THREE.CylinderGeometry(0.62, 0.9, 2.6, 14), M('#d8b48a'), 0, 7.2, 2.1); neck.rotation.x = 0.35;
  add(sph, M('#d8b48a'), 0, 8.7, 2.7, 1.05, 1.05, 1.05);                  // head
  for (const sx of [-1, 1]) { add(sph, M('#ffffff', { roughness: 0.3 }), sx * 0.42, 9.0, 3.55, 0.3, 0.34, 0.2); add(sph, M('#111111', { roughness: 0.2 }), sx * 0.42, 9.0, 3.72, 0.14, 0.16, 0.08); }
  const beak = add(new THREE.ConeGeometry(0.3, 0.8, 10), M('#f2b43a'), 0, 8.55, 3.95); beak.rotation.x = Math.PI / 2;
  add(new THREE.CapsuleGeometry(0.16, 0.6, 4, 8), M('#c8182a', { roughness: 0.5 }), 0.16, 8.0, 3.75);   // wattle
  // pilgrim hat
  const hatM = M('#1c1a1e', { roughness: 0.6 }), hat = new THREE.Group(); hat.position.set(0, 9.6, 2.55); hat.rotation.set(-0.12, 0, 0.1); g.add(hat);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.82, 1.35, 20), hatM); crown.position.y = 0.72; crown.castShadow = true; hat.add(crown);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.1, 24), hatM); brim.position.y = 0.06; hat.add(brim);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.83, 0.26, 20), M('#5a4632')); band.position.y = 0.32; hat.add(band);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.06), M('#ffd23d', { metalness: 0.8, roughness: 0.3 })); buckle.position.set(0, 0.32, 0.82); hat.add(buckle);
  // legs + feet
  const legM = M('#e08a2a');
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.28, 0.34, 2.4, 10), legM, sx * 1.15, 1.2, 0.3);
    for (const a of [-0.5, 0, 0.5]) { const toe = add(new THREE.BoxGeometry(0.22, 0.16, 1.3), legM, sx * 1.15 + Math.sin(a) * 0.55, 0.08, 0.3 + Math.cos(a) * 0.55); toe.rotation.y = a; }
  }
  return g;
}
