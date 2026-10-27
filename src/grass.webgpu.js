// WebGPU twin of grass.js: the same camera-following instanced lawn, with the GLSL blade shader ported to TSL
// (MaterialX noise stands in for LYGIA's simplex). Same constructor / setLight / update interface.
import * as THREE from 'three';
import {
  Fn, uniform, float, vec2, vec3, positionGeometry, instancedBufferAttribute, texture, floor, fract, sin, cos, dot, mix, smoothstep,
  distance, abs, varying, mx_noise_float,
} from 'three/tsl';

const hash = Fn(([p]) => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453)));
const noise = Fn(([p]) => mx_noise_float(p).mul(0.5).add(0.5));   // 0..1

export class Grass {
  constructor(scene, { zones, holes = [], count = 90000, radius = 42, worldSize = 400 } = {}) {
    const n = Math.floor(Math.sqrt(count));
    this.spacing = (radius * 2) / n;
    const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'), k = S / worldSize, X = (x) => (x + worldSize / 2) * k;
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.fillStyle = '#fff';
    for (const [x0, z0, x1, z1] of zones) g.fillRect(X(x0), X(z0), (x1 - x0) * k, (z1 - z0) * k);
    g.fillStyle = '#000';
    for (const h of holes) {
      if (h.rect) { const [x0, z0, x1, z1] = h.rect; g.fillRect(X(x0), X(z0), (x1 - x0) * k, (z1 - z0) * k); }
      if (h.circle) { const [x, z, r0, r1] = h.circle; g.beginPath(); g.arc(X(x), X(z), r1 * k, 0, Math.PI * 2); if (r0 > 0) g.arc(X(x), X(z), r0 * k, 0, Math.PI * 2, true); g.fill(); }
    }
    const soft = document.createElement('canvas'); soft.width = soft.height = S;
    const sg = soft.getContext('2d'); sg.filter = 'blur(2px)'; sg.drawImage(cv, 0, 0);
    const mask = new THREE.CanvasTexture(soft); mask.flipY = false; mask.colorSpace = THREE.NoColorSpace;

    const w = 0.07;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-w, 0, 0, w, 0, 0, -w * 0.8, 0.35, 0, w * 0.8, 0.35, 0, -w * 0.5, 0.7, 0, w * 0.5, 0.7, 0, 0, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
    const off = new Float32Array(n * n * 2);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { off[(i * n + j) * 2] = (i - n / 2) * this.spacing; off[(i * n + j) * 2 + 1] = (j - n / 2) * this.spacing; }
    const offAttr = new THREE.InstancedBufferAttribute(off, 2);
    geo.setAttribute('offset', offAttr);
    geo.instanceCount = n * n;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    const u = this.u = {
      uOrigin: uniform(new THREE.Vector2()), uSpacing: uniform(this.spacing), uRadius: uniform(radius), uTime: uniform(0),
      uCam: uniform(new THREE.Vector3()), uWorld: uniform(new THREE.Vector4(-worldSize / 2, -worldSize / 2, worldSize, 0)),
      uSun: uniform(new THREE.Color(1, 0.95, 0.85)), uAmb: uniform(new THREE.Color(0.45, 0.5, 0.55)),
    };
    this.uniforms = u;
    const offset = instancedBufferAttribute(offAttr);
    const cell = floor(u.uOrigin.add(offset).div(u.uSpacing));
    const base = cell.mul(u.uSpacing).add(vec2(hash(cell), hash(cell.add(7.3))).sub(0.5).mul(u.uSpacing).mul(1.6));
    const m = texture(mask, base.sub(u.uWorld.xy).div(u.uWorld.z)).level(0).r;   // vertex stage: explicit mip
    const fade = float(1).sub(smoothstep(u.uRadius.mul(0.62), u.uRadius, distance(base, u.uCam.xz)));
    const r = hash(cell.add(3.1));
    const h = m.mul(fade).mul(mix(0.24, 0.52, r)).mul(noise(base.mul(0.15)).mul(0.5).add(0.75));
    const ang = hash(cell.add(1.7)).mul(6.2831);
    const y = positionGeometry.y;
    const px = positionGeometry.x.mul(mix(0.6, 1.2, r)).mul(fade.mul(0.65).add(0.35));
    const c = cos(ang), s = sin(ang);
    const gust = noise(base.mul(0.06).add(vec2(u.uTime.mul(0.35), u.uTime.mul(0.12))));
    const sway = gust.mul(0.9).add(0.25).mul(0.5).add(sin(u.uTime.mul(2.3).add(base.x.mul(0.8)).add(base.y.mul(0.6))).mul(0.08));
    const kk = y.mul(y);
    const lx = px.mul(c), lz = px.mul(s);   // blade rotated about Y (z was 0)
    const world = vec3(
      base.x.add(lx).add(sway.mul(kk).mul(h).mul(1.6)),
      float(0.03).add(y.mul(h)).sub(abs(sway).mul(kk).mul(h).mul(0.25)),
      base.y.add(lz).add(sway.mul(kk).mul(h).mul(0.7)),
    );
    const dark = vec3(0.12, 0.34, 0.06), mid = vec3(0.30, 0.62, 0.12), tip = vec3(0.66, 0.88, 0.30);
    const col0 = mix(mix(dark, mid, smoothstep(0.0, 0.5, y)), tip, smoothstep(0.5, 1.0, y)).mul(hash(cell.add(9.1)).mul(0.36).add(0.82));
    const col = mix(col0, col0.mul(vec3(1.15, 1.05, 0.6)), smoothstep(0.55, 0.9, noise(base.mul(0.05))).mul(0.6));   // dry patches
    const vT = varying(y), vCol = varying(col), vShade = varying(gust.mul(0.4).add(0.6));
    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });   // fog: on (scene fog)
    mat.positionNode = world;
    mat.colorNode = vCol.mul(u.uAmb.add(u.uSun.mul(vT.mul(0.65).add(0.35)).mul(vShade))).mul(mix(0.55, 1.0, vT));
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.count = n * n;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noGI = true;
    this.zones = zones; this.radius = radius;
    scene.add(this.mesh);
  }

  setLight(sunColor, sunI, ambColor, ambI) {
    this.u.uSun.value.copy(sunColor).multiplyScalar(Math.min(1.2, sunI / 3.4));
    this.u.uAmb.value.copy(ambColor).multiplyScalar(ambI * 0.45);
  }

  update(t, cam) {
    const s = this.spacing;
    this.u.uOrigin.value.set(Math.round(cam.x / s) * s, Math.round(cam.z / s) * s);
    this.u.uCam.value.copy(cam);
    this.u.uTime.value = t;
    const r = this.radius;
    this.mesh.visible = this.zones.some(([x0, z0, x1, z1]) => cam.x > x0 - r && cam.x < x1 + r && cam.z > z0 - r && cam.z < z1 + r);
  }
}
