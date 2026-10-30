// HALLOWEEN ARENA: the old APEX arena ring at Chad's Bull Run (cleared when the Kanto Vault moved in) becomes the
// home of two Halloween mini-games: GRAVE DROP (Tile Drop over a floating graveyard) and PUMPKIN RUSH (a night
// pumpkin haul on the ring). The three towers that stood in the ring are cut out (src/landmarks.js) and the open
// ground is dressed as a graveyard: a stone arch with a "HALLOWEEN ARENA" neon sign facing the city, an iron fence,
// rows of tombstones and crosses, dead trees, a crypt, jack-o'-lanterns, mossy ground and low purple fog.
// Visual only (no collision), so nothing can stop you reaching a pumpkin.
import * as THREE from 'three';
import { pumpkinGeometry, faceTexture, PUMPKIN_SITE } from './minigames/pumpkinrush.js';

export const HALLOWEEN_ON = true;
const C = new THREE.Vector3(PUMPKIN_SITE.x, 0, PUMPKIN_SITE.z);
const TO_CITY = new THREE.Vector3(-C.x, 0, -C.z).normalize();          // the ring faces the plaza (south-west)
const SIDE = new THREE.Vector3(-TO_CITY.z, 0, TO_CITY.x);

function textTexture(lines, { w = 1024, h = 256, color = '#ff8a00', glow = '#ff5a00', font = '"Permanent Marker", cursive', size = 120, bg = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 28); g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    const y = h / 2 + (i - (lines.length - 1) / 2) * size * 1.05, s = i ? size * 0.55 : size;
    g.font = `400 ${s}px ${font}`; g.shadowColor = glow; g.shadowBlur = 28; g.fillStyle = i ? '#ffffff' : color; g.fillText(l, w / 2, y); g.shadowBlur = 0; g.fillText(l, w / 2, y);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/** builds the dressing; returns { pads: [{ id, label, pos }], group, update(t) } */
export function buildHalloween(scene, world) {
  const ph = world.physics, group = new THREE.Group(); group.name = 'HALLOWEEN_ARENA'; scene.add(group);
  const ground = (x, z) => ph.groundAt(x, z, 8);
  const stone = new THREE.MeshStandardMaterial({ color: '#5c5868', roughness: 0.92 });
  // arch: two crooked pillars + a beam with the neon sign, on the ring's edge facing the city
  const archC = C.clone().addScaledVector(TO_CITY, 19), gy = ground(archC.x, archC.z), yaw = Math.atan2(TO_CITY.x, TO_CITY.z);
  const arch = new THREE.Group(); arch.position.set(archC.x, gy, archC.z); arch.rotation.y = yaw; group.add(arch);
  for (const sx of [-5.6, 5.6]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7.5, 1.2), stone); p.position.set(sx, 3.75, 0); p.rotation.z = sx > 0 ? -0.03 : 0.04; p.castShadow = true; arch.add(p);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.4, 4), stone); cap.position.set(sx, 8.2, 0); cap.rotation.y = Math.PI / 4; arch.add(cap);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(13, 1.1, 0.9), stone); beam.position.y = 7.1; arch.add(beam);
  const signTex = textTexture(['HALLOWEEN ARENA'], { size: 132 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 2.8), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  sign.position.set(0, 7.1, 0.48); arch.add(sign);   // the arch's +z points at the city: this side greets you
  const sign2 = sign.clone(); sign2.position.z = -0.48; sign2.rotation.y = Math.PI; arch.add(sign2);   // and the ring side
  // pads: Grave Drop on one side of the ring, Pumpkin Rush on the other
  const padDefs = [
    { id: 'grave', label: '🪦 GRAVE DROP', sub: 'LAST ONE STANDING', color: '#b84dff', at: C.clone().addScaledVector(SIDE, 8).addScaledVector(TO_CITY, 4) },
    { id: 'pumpkin', label: '🎃 PUMPKIN RUSH', sub: '3-MIN NIGHT HAUL', color: '#ff8a00', at: C.clone().addScaledVector(SIDE, -8).addScaledVector(TO_CITY, 4) },
  ];
  const pads = [], spin = [];
  for (const d of padDefs) {
    const y = ground(d.at.x, d.at.z), pos = new THREE.Vector3(d.at.x, y, d.at.z);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.18, 40), new THREE.MeshStandardMaterial({ color: '#1a1026', emissive: d.color, emissiveIntensity: 0.5, roughness: 0.4 }));
    disc.position.set(pos.x, y + 0.09, pos.z); group.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.07, 8, 64), new THREE.MeshBasicMaterial({ color: d.color, toneMapped: false }));
    ring.rotation.x = Math.PI / 2; ring.position.set(pos.x, y + 0.2, pos.z); group.add(ring);
    const beamM = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 7, 32, 1, true), new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beamM.position.set(pos.x, y + 3.6, pos.z); group.add(beamM);
    const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture([d.label, d.sub], { w: 1024, h: 320, color: d.color, glow: d.color, font: 'Rajdhani, sans-serif', size: 120, bg: 'rgba(12,8,24,.72)' }), toneMapped: false, depthWrite: false }));
    lab.scale.set(5.2, 1.62, 1); lab.position.set(pos.x, y + 4.4, pos.z); group.add(lab);
    pads.push({ id: d.id, label: d.label, pos }); spin.push(ring);
  }
  // jack-o'-lanterns around the ring + tombstones + low fog
  const pg = pumpkinGeometry(), pm = new THREE.MeshStandardMaterial({ color: '#ff7a12', roughness: 0.55, emissive: '#ffb030', emissiveMap: faceTexture(false), emissiveIntensity: 2.4 });
  const N = 14, lanterns = new THREE.InstancedMesh(pg, pm, N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, x = C.x + Math.cos(a) * 15.6, z = C.z + Math.sin(a) * 15.6;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(C.x - x, C.z - z) - Math.PI / 2); s.setScalar(1.6); v.set(x, ground(x, z), z); m4.compose(v, q, s); lanterns.setMatrixAt(i, m4);
  }
  lanterns.castShadow = true; group.add(lanterns);
  graveyard(group, ground, stone, pads, archC);
  const fogC = document.createElement('canvas'); fogC.width = fogC.height = 256; { const g = fogC.getContext('2d'), gr = g.createRadialGradient(128, 128, 30, 128, 128, 128); gr.addColorStop(0, 'rgba(150,110,220,.42)'); gr.addColorStop(1, 'rgba(60,30,100,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  const fogT = new THREE.CanvasTexture(fogC); fogT.colorSpace = THREE.SRGBColorSpace;
  const fog = new THREE.Mesh(new THREE.PlaneGeometry(84, 84), new THREE.MeshBasicMaterial({ map: fogT, transparent: true, depthWrite: false, toneMapped: false }));
  fog.rotation.x = -Math.PI / 2; fog.position.set(C.x, ground(C.x, C.z) + 0.25, C.z); fog.renderOrder = 1; group.add(fog);
  // zone: label, minimap, fast travel
  if (!world.zones.some((z) => z.id === 'halloween')) { world.zones.push({ id: 'halloween', label: 'HALLOWEEN ARENA', radius: 24, color: '#ff8a00', pos: C.clone() }); world.zones.sort((a, b) => a.radius - b.radius); }
  return {
    pads, group,
    update(t) { spin.forEach((r, i) => { r.rotation.z = t * (i ? -0.8 : 0.8); }); fog.rotation.z = t * 0.03; },
    /** the pad the player is standing on, or null */
    padAt(p) { for (const d of pads) if (Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < 2.6 && Math.abs(p.y - d.pos.y) < 2.5) return d; return null; },
  };
}

const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
/** tombstones, crosses, dead trees, an iron fence (open at the arch), a crypt and mossy ground over the cleared ring */
function graveyard(group, ground, stone, pads, archC) {
  const R = 34, rnd = rng(1031), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler();
  const cityA = Math.atan2(archC.z - C.z, archC.x - C.x);
  const angGap = (a) => Math.abs(Math.atan2(Math.sin(a - cityA), Math.cos(a - cityA)));
  const clear = (x, z, r = 3.4) => pads.every((p) => Math.hypot(x - p.pos.x, z - p.pos.z) > r) && Math.hypot(x - archC.x, z - archC.z) > 7.5;
  // mossy dirt
  const gc = document.createElement('canvas'); gc.width = gc.height = 512; { const g = gc.getContext('2d');
    g.fillStyle = '#2b2620'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) { const k = rnd(); g.fillStyle = k < 0.5 ? `rgba(48,${70 + rnd() * 40},34,.55)` : k < 0.8 ? 'rgba(70,58,44,.5)' : 'rgba(20,16,14,.5)'; g.fillRect(rnd() * 512, rnd() * 512, 2 + rnd() * 5, 2 + rnd() * 5); }
    const fade = g.createRadialGradient(256, 256, 180, 256, 256, 256); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 0, 512, 512); }
  const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(R + 4, 64), new THREE.MeshStandardMaterial({ map: gt, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  dirt.rotation.x = -Math.PI / 2; dirt.position.set(C.x, ground(C.x, C.z) + 0.03, C.z); dirt.receiveShadow = true; group.add(dirt);
  // tombstones (rounded slabs) + crosses, in loose rows
  const slab = new THREE.BoxGeometry(0.9, 1.0, 0.2).translate(0, 0.5, 0), cap = new THREE.CylinderGeometry(0.45, 0.45, 0.2, 16, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 1.0, 0);
  const crossV = new THREE.BoxGeometry(0.18, 1.6, 0.18).translate(0, 0.8, 0), crossH = new THREE.BoxGeometry(0.8, 0.18, 0.18).translate(0, 1.15, 0);
  const NT = 46, NC = 16, tomb = [slab, cap].map((g) => new THREE.InstancedMesh(g, stone, NT)), cross = [crossV, crossH].map((g) => new THREE.InstancedMesh(g, stone, NC));
  let nt = 0, nc = 0;
  for (let row = 0; row < 7 && (nt < NT || nc < NC); row++) {
    const r = 9 + row * 3.6, n = Math.floor(r * 0.9);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + row * 0.37 + (rnd() - 0.5) * 0.12;
      if (angGap(a) < 0.42) continue;                                   // the path in from the arch
      const x = C.x + Math.cos(a) * (r + (rnd() - 0.5) * 1.2), z = C.z + Math.sin(a) * (r + (rnd() - 0.5) * 1.2);
      if (!clear(x, z) || rnd() < 0.25) continue;
      e.set((rnd() - 0.5) * 0.18, a + Math.PI / 2 + (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.16); q.setFromEuler(e);
      v.set(x, ground(x, z) - 0.05, z);
      if (rnd() < 0.24 && nc < NC) { s.setScalar(0.9 + rnd() * 0.4); m4.compose(v, q, s); cross.forEach((m) => m.setMatrixAt(nc, m4)); nc++; }
      else if (nt < NT) { s.set(0.8 + rnd() * 0.5, 0.8 + rnd() * 0.6, 1); m4.compose(v, q, s); tomb.forEach((m) => m.setMatrixAt(nt, m4)); nt++; }
    }
  }
  for (const m of [...tomb, ...cross]) { m.count = m === tomb[0] || m === tomb[1] ? nt : nc; m.castShadow = true; m.receiveShadow = true; group.add(m); }
  // dead trees: a crooked trunk with a few bare branches
  const bark = new THREE.MeshStandardMaterial({ color: '#2a211c', roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.5; if (angGap(a) < 0.5) continue;
    const r = 27 + rnd() * 5, x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r, t = new THREE.Group(); t.position.set(x, ground(x, z), z); t.rotation.y = rnd() * 6.28;
    const h = 5 + rnd() * 3, trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.42, h, 7), bark); trunk.position.y = h / 2; trunk.rotation.z = (rnd() - 0.5) * 0.2; t.add(trunk);
    for (let b = 0; b < 5; b++) { const L = 1.4 + rnd() * 2, br = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.13, L, 5), bark); const y = h * (0.5 + rnd() * 0.45), ang = rnd() * 6.28;
      br.position.set(Math.cos(ang) * L * 0.35, y + L * 0.3, Math.sin(ang) * L * 0.35); br.rotation.set(Math.sin(ang) * 0.9, 0, -Math.cos(ang) * 0.9); t.add(br); }
    t.traverse((o) => { if (o.isMesh) o.castShadow = true; }); group.add(t);
  }
  // iron fence: spiked posts round the yard, open in front of the arch
  const iron = new THREE.MeshStandardMaterial({ color: '#16131c', roughness: 0.5, metalness: 0.6 });
  const post = new THREE.CylinderGeometry(0.05, 0.05, 1.7, 5).translate(0, 0.85, 0), tip = new THREE.ConeGeometry(0.09, 0.25, 5).translate(0, 1.8, 0);
  const NP = Math.floor(2 * Math.PI * R / 0.7), posts = [post, tip].map((g) => new THREE.InstancedMesh(g, iron, NP)); let np = 0;
  for (let k = 0; k < NP; k++) { const a = (k / NP) * Math.PI * 2; if (angGap(a) < 0.5) continue; const x = C.x + Math.cos(a) * R, z = C.z + Math.sin(a) * R; m4.makeTranslation(x, ground(x, z), z); posts.forEach((m) => m.setMatrixAt(np, m4)); np++; }
  posts.forEach((m) => { m.count = np; group.add(m); });
  for (const y of [0.45, 1.45]) { const rail = new THREE.Mesh(new THREE.TorusGeometry(R, 0.035, 4, 160, Math.PI * 2 - 1.0), iron); rail.rotation.x = Math.PI / 2; rail.rotation.z = cityA + 0.5; rail.position.set(C.x, ground(C.x, C.z) + y, C.z); group.add(rail); }
  // the crypt, across the yard from the arch
  const ca = cityA + Math.PI, cx = C.x + Math.cos(ca) * 24, cz = C.z + Math.sin(ca) * 24, crypt = new THREE.Group();
  crypt.position.set(cx, ground(cx, cz), cz); crypt.rotation.y = Math.atan2(C.x - cx, C.z - cz); group.add(crypt);
  const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3.6, 4), stone); body.position.y = 1.8; crypt.add(body);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 3.4, 1.6, 4, 1), stone); roof.rotation.y = Math.PI / 4; roof.scale.set(1.05, 1, 0.85); roof.position.y = 4.4; crypt.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 0.1), new THREE.MeshStandardMaterial({ color: '#0b0812', emissive: '#5a2a8a', emissiveIntensity: 0.5 })); door.position.set(0, 1.2, 2.02); crypt.add(door);
  for (const sx of [-2.1, 2.1]) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 3.6, 10), stone); col.position.set(sx, 1.8, 2.15); crypt.add(col); }
  crypt.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const glow = new THREE.PointLight('#8a4dff', 10, 14, 2); glow.position.set(cx + Math.cos(cityA) * 3, ground(cx, cz) + 2, cz + Math.sin(cityA) * 3); group.add(glow);
}
