// HALLOWEEN ARENA: the old APEX arena ring at Chad's Bull Run (cleared when the Kanto Vault moved in) becomes the
// home of two Halloween mini-games: GRAVE DROP (Tile Drop over a floating graveyard) and PUMPKIN RUSH (a night
// pumpkin haul on the ring). This file dresses the site: a stone arch with a "HALLOWEEN ARENA" neon sign facing the
// city, two game pads with floating labels, jack-o'-lanterns, tombstones and low purple fog. Visual only (no
// collision), so nothing can block the vault or the paths.
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
  const slab = new THREE.BoxGeometry(0.9, 1.1, 0.22).translate(0, 0.55, 0), tombs = new THREE.InstancedMesh(slab, stone, 10);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3, r = 22 + (i % 3) * 2.5, x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r;
    if (Math.abs(Math.atan2(Math.sin(a - Math.atan2(TO_CITY.z, TO_CITY.x)), Math.cos(a - Math.atan2(TO_CITY.z, TO_CITY.x)))) < 0.5) { tombs.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); continue; }   // keep the way in clear
    q.setFromEuler(new THREE.Euler(0.08 * ((i % 3) - 1), a, 0.06 * ((i % 2) * 2 - 1))); s.setScalar(1); v.set(x, ground(x, z), z); m4.compose(v, q, s); tombs.setMatrixAt(i, m4);
  }
  tombs.castShadow = true; group.add(tombs);
  const fogC = document.createElement('canvas'); fogC.width = fogC.height = 256; { const g = fogC.getContext('2d'), gr = g.createRadialGradient(128, 128, 30, 128, 128, 128); gr.addColorStop(0, 'rgba(150,110,220,.42)'); gr.addColorStop(1, 'rgba(60,30,100,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  const fogT = new THREE.CanvasTexture(fogC); fogT.colorSpace = THREE.SRGBColorSpace;
  const fog = new THREE.Mesh(new THREE.PlaneGeometry(62, 62), new THREE.MeshBasicMaterial({ map: fogT, transparent: true, depthWrite: false, toneMapped: false }));
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
