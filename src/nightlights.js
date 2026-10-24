// Street-lamp lighting for dusk / night.
//  - every kit street lamp gets a soft additive light-pool decal on the road under its head (all ~100, one draw call)
//  - a small pool of real SpotLights follows the lamps nearest the camera, so characters, cars and the wet asphalt
//    pick up real light and specular streaks. The light count never changes (no shader recompiles); by day the
//    intensity is simply 0.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _y = new THREE.Vector3(0, 1, 0), _one = new THREE.Vector3(1, 1, 1);

function poolTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.7)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.04)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class NightLights {
  /** spots: kit markers; uses Spotlight_01 entries (pole foot + rz). count: real spot lights (0 = decals only) */
  constructor(scene, spots, { count = 10, color = '#ffe0b8' } = {}) {
    this.heads = [];
    for (const s of spots) {
      if (s.kit !== 'Spotlight_01') continue;
      _q.setFromAxisAngle(_y, s.rz || 0);
      _m.compose(s.pos, _q, _one);
      // lamp head in the asset's space: arm reaches 2.06 m along Blender -Y (three +Z), head ~7.9 m up
      this.heads.push(new THREE.Vector3(0, 7.9, 2.05).applyMatrix4(_m));
    }
    this.color = new THREE.Color(color);
    this.level = 0;

    // light-pool decals
    const n = this.heads.length;
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: this.color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, fog: true });
    this.pools = new THREE.InstancedMesh(geo, this.poolMat, n);
    this.pools.name = 'LAMP_POOLS'; this.pools.renderOrder = 2; this.pools.userData.noGI = true;
    const S = new THREE.Vector3(10.5, 1, 10.5);
    this.heads.forEach((h, i) => { _m.compose(new THREE.Vector3(h.x, 0.035, h.z), new THREE.Quaternion(), S); this.pools.setMatrixAt(i, _m); });
    this.pools.instanceMatrix.needsUpdate = true; this.pools.computeBoundingSphere();
    this.pools.visible = false;
    scene.add(this.pools);

    // real lights following the camera
    this.lights = [];
    for (let i = 0; i < Math.min(count, n); i++) {
      const l = new THREE.SpotLight(this.color, 0, 20, THREE.MathUtils.degToRad(52), 0.85, 1.7);
      l.castShadow = false;
      scene.add(l, l.target);
      this.lights.push(l);
    }
    this.t = 0;
    this._order = this.heads.map((_, i) => i);
  }

  /** 0 = day (off) … 1 = full night */
  setLevel(k) {
    this.level = k;
    this.poolMat.opacity = 0.32 * k;
    this.pools.visible = k > 0.01;
    for (const l of this.lights) l.intensity = 0;   // set properly on the next update
    this.t = 0;
  }

  update(dt, camPos) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    if (!this.lights.length) return;
    const d2 = (i) => this.heads[i].distanceToSquared(camPos);
    this._order.sort((a, b) => d2(a) - d2(b));
    this.lights.forEach((l, k) => {
      const h = this.heads[this._order[k]];
      l.position.copy(h);
      l.target.position.set(h.x, 0, h.z);
      l.target.updateMatrixWorld();
      // fade the farthest assigned light so swaps are not visible as pops
      const fade = k < this.lights.length - 2 ? 1 : 0.5;
      l.intensity = 170 * this.level * fade;
    });
  }
}
