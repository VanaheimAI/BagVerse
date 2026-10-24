// Instanced trees: every TREE_* marker in the world GLB becomes one instance of public/assets/tree.glb.
// Near trees draw the full mesh (TREE_LOD0); far trees draw the baked impostor (TREE_IMPOSTOR, two crossed
// alpha-tested cards). Each instance gets its own height, lean-free rotation and a slight colour shift.
import * as THREE from 'three';
import { toWorldFloat } from './physics.js';

const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);

export class Trees {
  /**
   * gltf: loaded tree.glb · spots: [{ pos: Vector3, s, rz, swamp }] · opts.height: metres for s = 1
   * opts.near: distance (m) inside which the full mesh is used
   */
  constructor(scene, gltf, spots, { height = 8.5, near = 60, shadows = true } = {}) {
    this.spots = spots; this.near = near; this.t = 0;
    const lod0 = gltf.scene.getObjectByName('TREE_LOD0');
    const imp = gltf.scene.getObjectByName('TREE_IMPOSTOR');
    const n = spots.length;

    // per-instance transform + colour (a little brightness/warmth drift so a park doesn't look cloned)
    const rng = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
    this.mats = spots.map((p, i) => {
      const h = height * p.s * (0.88 + 0.24 * rng(i, 1));
      _q.setFromAxisAngle(_y, p.rz || 0);
      _s.set(h * (0.92 + 0.16 * rng(i, 2)), h, h * (0.92 + 0.16 * rng(i, 3)));
      return new THREE.Matrix4().compose(p.pos, _q, _s);
    });
    this.cols = spots.map((p, i) => {
      const warm = rng(i, 4), lum = 0.9 + 0.18 * rng(i, 5);
      const c = new THREE.Color(lum * (0.97 + 0.08 * warm), lum, lum * (1.0 - 0.08 * warm));
      if (p.swamp) c.multiply(new THREE.Color(0.82, 0.92, 0.74));     // murkier swamp foliage
      return c;
    });

    // meshopt quantization stores each mesh in a normalised -1..1 box and moves the real scale/offset onto the
    // node, so bake the node transform into float geometry (using the raw geometry sinks the tree half underground)
    gltf.scene.updateMatrixWorld(true);
    const bake = (src) => { const g = toWorldFloat(src, ['position', 'normal', 'uv']); g.computeBoundingSphere(); return g; };
    const make = (src, castShadow) => {
      const im = new THREE.InstancedMesh(bake(src), src.material, n);
      im.name = src.name;
      im.castShadow = shadows && castShadow; im.receiveShadow = true;
      im.frustumCulled = false;            // instances span the whole map; culled per instance below
      im.count = 0;
      for (let i = 0; i < n; i++) im.setColorAt(i, this.cols[i]);
      scene.add(im);
      return im;
    };
    lod0.material.metalness = 0;
    this.full = make(lod0, true);
    const im = imp.material;
    im.alphaTest = 0.5; im.transparent = false; im.side = THREE.DoubleSide; im.metalness = 0; im.roughness = 1;
    this.far = make(imp, true);
    this._frustum = new THREE.Frustum(); this._pm = new THREE.Matrix4(); this._sphere = new THREE.Sphere();
  }

  /** reassign instances between the two meshes (cheap: ~100 trees, a few times a second) */
  update(dt, camera, force = false) {
    this.t -= dt;
    if (this.t > 0 && !force) return;
    this.t = 0.2;
    camera.updateMatrixWorld();
    this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._pm);
    const cam = camera.position, near2 = this.near * this.near;
    let nf = 0, nr = 0;
    for (let i = 0; i < this.spots.length; i++) {
      const p = this.spots[i].pos;
      this._sphere.center.set(p.x, p.y + 3, p.z); this._sphere.radius = 6 * this.spots[i].s + 2;
      const d2 = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2;
      // nearby trees outside the view still cast shadows into it, so only cull far ones
      if (d2 > 30 * 30 && !this._frustum.intersectsSphere(this._sphere)) continue;
      if (d2 < near2) { this.full.setMatrixAt(nf, this.mats[i]); this.full.setColorAt(nf, this.cols[i]); nf++; }
      else { this.far.setMatrixAt(nr, this.mats[i]); this.far.setColorAt(nr, this.cols[i]); nr++; }
    }
    this.full.count = nf; this.far.count = nr;
    this.full.instanceMatrix.needsUpdate = true; this.far.instanceMatrix.needsUpdate = true;
    if (this.full.instanceColor) this.full.instanceColor.needsUpdate = true;
    if (this.far.instanceColor) this.far.instanceColor.needsUpdate = true;
  }
}
