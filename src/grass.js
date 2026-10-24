// GPU-instanced grass: a fixed grid of blades that follows the camera (snapped, so blades never swim),
// masked to the lawn areas, with per-blade height/colour variation, wind sway and distance fade.
import * as THREE from 'three';

import VS from './shaders/grass.vert.glsl';


const FS = `
uniform vec3 uSun, uAmb;
varying float vT; varying vec3 vCol; varying float vShade;
#include <fog_pars_fragment>
void main(){
  vec3 col = vCol * (uAmb + uSun * (0.35 + 0.65 * vT) * vShade);
  col *= mix(0.55, 1.0, vT);                 // self-shadowed roots (cheap AO)
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`;

export class Grass {
  /**
   * zones: [[x0, z0, x1, z1], ...] lawn rectangles (three.js world coords)
   * holes: [{ rect: [x0, z0, x1, z1] } | { circle: [x, z, r0, r1] }] paths / plazas cut out of the lawns
   */
  constructor(scene, { zones, holes = [], count = 90000, radius = 42, worldSize = 400 } = {}) {
    const n = Math.floor(Math.sqrt(count));
    this.spacing = (radius * 2) / n;
    // mask texture: lawns white, cut-outs black
    const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'), k = S / worldSize, X = (x) => (x + worldSize / 2) * k;
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#fff';
    for (const [x0, z0, x1, z1] of zones) g.fillRect(X(x0), X(z0), (x1 - x0) * k, (z1 - z0) * k);
    g.fillStyle = '#000'; g.strokeStyle = '#000';
    for (const h of holes) {
      if (h.rect) { const [x0, z0, x1, z1] = h.rect; g.fillRect(X(x0), X(z0), (x1 - x0) * k, (z1 - z0) * k); }
      if (h.circle) {
        const [x, z, r0, r1] = h.circle;
        g.beginPath(); g.arc(X(x), X(z), r1 * k, 0, Math.PI * 2);
        if (r0 > 0) g.arc(X(x), X(z), r0 * k, 0, Math.PI * 2, true);
        g.fill();
      }
    }
    // soften the lawn edges so blades shrink toward paths
    const soft = document.createElement('canvas'); soft.width = soft.height = S;
    const sg = soft.getContext('2d'); sg.filter = 'blur(2px)'; sg.drawImage(cv, 0, 0);
    const mask = new THREE.CanvasTexture(soft); mask.flipY = false; mask.colorSpace = THREE.NoColorSpace;

    // blade: 3 segments, tapering to a tip (7 verts)
    const blade = new THREE.BufferGeometry();
    const w = 0.07;
    const pos = new Float32Array([-w, 0, 0, w, 0, 0, -w * 0.8, 0.35, 0, w * 0.8, 0.35, 0, -w * 0.5, 0.7, 0, w * 0.5, 0.7, 0, 0, 1, 0]);
    blade.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = blade.index; geo.attributes.position = blade.attributes.position;
    const off = new Float32Array(n * n * 2);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { off[(i * n + j) * 2] = (i - n / 2) * this.spacing; off[(i * n + j) * 2 + 1] = (j - n / 2) * this.spacing; }
    geo.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 2));
    geo.instanceCount = n * n;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uOrigin: { value: new THREE.Vector2() }, uSpacing: { value: this.spacing }, uRadius: { value: radius }, uTime: { value: 0 },
      uMask: { value: mask }, uCam: { value: new THREE.Vector3() }, uWorld: { value: new THREE.Vector4(-worldSize / 2, -worldSize / 2, worldSize, 0) },
      uSun: { value: new THREE.Color(1, 0.95, 0.85) }, uAmb: { value: new THREE.Color(0.45, 0.5, 0.55) },
    }]);
    this.uniforms.uMask.value = mask;
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.uniforms, side: THREE.DoubleSide, fog: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noGI = true;
    this.zones = zones; this.radius = radius;
    scene.add(this.mesh);
  }

  /** lighting follows the active look preset */
  setLight(sunColor, sunI, ambColor, ambI) {
    this.uniforms.uSun.value.copy(sunColor).multiplyScalar(Math.min(1.2, sunI / 3.4));
    this.uniforms.uAmb.value.copy(ambColor).multiplyScalar(ambI * 0.45);
  }

  update(t, cam) {
    const s = this.spacing;
    this.uniforms.uOrigin.value.set(Math.round(cam.x / s) * s, Math.round(cam.z / s) * s);
    this.uniforms.uCam.value.copy(cam);
    this.uniforms.uTime.value = t;
    // skip the draw entirely when no lawn is within reach
    const r = this.radius;
    this.mesh.visible = this.zones.some(([x0, z0, x1, z1]) => cam.x > x0 - r && cam.x < x1 + r && cam.z > z0 - r && cam.z < z1 + r);
  }
}
