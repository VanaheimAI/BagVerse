// City-kit instancer: every KIT_* marker in the world GLB (extras: kit, rz, sx, sy, sz) becomes one GPU instance of
// the matching asset in public/assets/kit.glb (Cartoon City kit, exported by blender/export_kit.py).
// Each asset is merged per material, so a whole street of lamps or cars is a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toWorldFloat } from './physics.js';

const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);

export class Kit {
  constructor(scene, gltf, spots, { shadows = true } = {}) {
    gltf.scene.updateMatrixWorld(true);
    this.meshes = [];
    // asset -> [{ geometry, material }] (merged per material, baked to the asset's own space)
    const assets = {};
    for (const root of gltf.scene.children) {
      const byMat = new Map();
      root.traverse((o) => {
        if (!o.isMesh) return;
        const g = toWorldFloat(o, ['position', 'normal', 'uv']);   // meshopt: real scale/offset live on the nodes
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (!g.attributes.normal) g.computeVertexNormals();
        const k = o.material.uuid;
        if (!byMat.has(k)) byMat.set(k, { material: o.material, geos: [] });
        byMat.get(k).geos.push(g.index ? g.toNonIndexed() : g);
      });
      assets[root.name] = [...byMat.values()].map(({ material, geos }) => ({ material, geometry: mergeGeometries(geos, false) }));
    }
    this.assets = assets;

    // materials: rough painted plastic look, consistent with the rest of the world
    const mats = new Set();
    Object.values(assets).forEach((parts) => parts.forEach((p) => mats.add(p.material)));
    for (const m of mats) {
      if (!m.isMeshStandardMaterial) continue;
      m.side = THREE.FrontSide;
      if (/Glass/.test(m.name)) { m.transparent = false; m.opacity = 1; m.roughness = 0.08; m.metalness = 0.1; m.envMapIntensity = 1.4; }
      if (/Emissive|Headlights|Taillights/.test(m.name)) m.emissiveIntensity = 1.2;

    }

    // car paint: clear-coated metallic finish (crisp reflections over the palette colour)
    for (const parts of Object.values(assets)) for (const p of parts) {
      if (p.material.name !== 'KIT_Car_Color') continue;
      if (!this._paint) {
        const o = p.material;
        this._paint = new THREE.MeshPhysicalMaterial({ name: 'KIT_Car_Paint', map: o.map, color: 0xffffff, metalness: 0.35, roughness: 0.32,
          clearcoat: 1.0, clearcoatRoughness: 0.05, envMapIntensity: 1.6 });
      }
      p.material = this._paint;
    }
    // user car bodies: clear-coated paint over the PBR maps (headlight emissive kept)
    const coat = new Map();
    for (const parts of Object.values(assets)) for (const p of parts) {
      const o = p.material;
      if (!/^CAR_.*_Body$/.test(o.name) || !o.isMeshStandardMaterial) continue;
      if (!coat.has(o)) {
        const m = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(m, o);
        Object.assign(m, { clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 1.5 });
        m.name = o.name; coat.set(o, m);
      }
      p.material = coat.get(o);
    }
    // group markers by asset
    const groups = {};
    for (const s of spots) (groups[s.kit] ||= []).push(s);
    this.counts = {};
    for (const [name, list] of Object.entries(groups)) {
      const parts = assets[name];
      if (!parts) { console.warn('kit asset missing', name); continue; }
      this.counts[name] = list.length;
      const mats4 = list.map((s) => {
        _q.setFromAxisAngle(_y, s.rz || 0);
        _s.set(s.sx || 1, s.sz || 1, s.sy || 1);   // Blender x / y / z scale -> three x / z / y
        return new THREE.Matrix4().compose(s.pos, _q, _s);
      });
      for (const { geometry, material } of parts) {
        const im = new THREE.InstancedMesh(geometry, material, list.length);
        im.name = 'KIT_' + name;
        const night = material.name === 'fac_kit_nightlight';
        im.castShadow = shadows && !night && !/^(Bush|Trash)/.test(name);
        im.receiveShadow = !night;
        list.forEach((s, i) => im.setMatrixAt(i, mats4[i]));
        if (list.some((s) => s.tint)) {
          list.forEach((s, i) => im.setColorAt(i, new THREE.Color(s.tint || '#ffffff')));
        }
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        scene.add(im);
        this.meshes.push(im);
      }
    }
  }
}
