// Capsule-vs-BVH character physics (after the three-mesh-bvh characterMovement example).
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const _box = new THREE.Box3();
const _seg = new THREE.Line3();
const _tri = new THREE.Vector3();
const _cap = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _ray = new THREE.Raycaster();

/** copy of a mesh's geometry with (possibly quantized) attributes decoded to float and baked to world space */
export function toWorldFloat(mesh, names = null) {
  const src = mesh.geometry, geo = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) {
    if (names && !names.includes(name)) continue;
    const n = attr.count, k = attr.itemSize, arr = new Float32Array(n * k);
    const get = ['getX', 'getY', 'getZ', 'getW'];   // denormalises quantized (meshopt) data
    for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) arr[i * k + c] = attr[get[c]](i);
    geo.setAttribute(name, new THREE.BufferAttribute(arr, k));
  }
  if (src.index) geo.setIndex(src.index.clone());
  mesh.updateWorldMatrix(true, false);
  geo.applyMatrix4(mesh.matrixWorld);
  return geo;
}

export class Physics {
  constructor(colliderMesh) {
    colliderMesh.updateWorldMatrix(true, false);
    const geo = toWorldFloat(colliderMesh, ['position']);
    geo.boundsTree = new MeshBVH(geo, { maxLeafTris: 6 });
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ wireframe: true, color: 0x00ff88 }));
    this.mesh.visible = false;
    this.bvh = geo.boundsTree;
  }

  /**
   * Moves a body (feet position + velocity) by dt with gravity and capsule collision.
   * body: { pos: Vector3 (feet), vel: Vector3, onGround: bool, radius, height }
   */
  step(body, dt, gravity = -28) {
    const r = body.radius;
    if (!body.onGround || body.vel.y > 0) body.vel.y += gravity * dt;
    else body.vel.y = Math.max(body.vel.y + gravity * dt, -2); // keep feet glued on slopes
    body.vel.y = Math.max(body.vel.y, -50);

    const start = body.pos.clone().addScaledVector(body.vel, dt);
    _seg.start.set(start.x, start.y + r, start.z);
    _seg.end.set(start.x, start.y + body.height - r, start.z);
    _box.makeEmpty().expandByPoint(_seg.start).expandByPoint(_seg.end);
    _box.min.addScalar(-r); _box.max.addScalar(r);

    let pushedUp = 0;
    this.bvh.shapecast({
      intersectsBounds: (b) => b.intersectsBox(_box),
      intersectsTriangle: (tri) => {
        const d = tri.closestPointToSegment(_seg, _tri, _cap);
        if (d < r) {
          const depth = r - d;
          const dir = _cap.sub(_tri).normalize();
          _seg.start.addScaledVector(dir, depth);
          _seg.end.addScaledVector(dir, depth);
        }
      },
    });

    const newFeet = _delta.set(_seg.start.x, _seg.start.y - r, _seg.start.z);
    const corr = newFeet.clone().sub(start);
    pushedUp = corr.y;
    body.onGround = pushedUp > Math.abs(dt * body.vel.y * 0.25) || (pushedUp > 1e-4 && body.vel.y <= 0);
    body.pos.copy(newFeet);
    if (body.onGround && body.vel.y < 0) body.vel.y = 0;
    else if (corr.lengthSq() > 1e-10) {
      const n = corr.normalize();
      body.vel.addScaledVector(n, -Math.min(0, n.dot(body.vel)));
    }
  }

  /** first hit distance along a ray (for camera collision), or Infinity */
  raycast(origin, dir, far) {
    _ray.set(origin, dir); _ray.far = far; _ray.firstHitOnly = true;
    const hit = this.bvh.raycastFirst(_ray.ray, THREE.DoubleSide);
    return hit && hit.distance <= far ? hit.distance : Infinity;
  }

  /** first hit along a ray with its world point and face normal, or null (spot finding / tools) */
  raycastHit(origin, dir, far) {
    _ray.set(origin, dir); _ray.far = far; _ray.firstHitOnly = true;
    const hit = this.bvh.raycastFirst(_ray.ray, THREE.DoubleSide);
    if (!hit || hit.distance > far) return null;
    const n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(-dir.x, -dir.y, -dir.z);
    if (n.dot(dir) > 0) n.negate();
    return { distance: hit.distance, point: hit.point.clone(), normal: n };
  }

  /** first VISIBLE mesh hit under `root` (not the collider): tools check a wall is really there. Slow; offline use. */
  visibleHit(root, origin, dir, far, camera = null) {
    _ray.set(origin, dir); _ray.far = far; _ray.firstHitOnly = false; _ray.camera = camera;   // sprites need a camera
    const hits = _ray.intersectObject(root, true).filter((h) => { for (let o = h.object; o; o = o.parent) if (!o.visible) return false; return h.object.isMesh && !h.object.isSkinnedMesh && !/^TAG_|^SMOKE|^HOLO|^PORTAL/.test(h.object.name) && !(h.object.material?.transparent && h.object.material.opacity < 0.9); });
    return hits[0] ? { distance: hits[0].distance, name: hits[0].object.name } : null;
  }

  /** ground height under a point (for spawning / teleport) */
  groundAt(x, z, fromY = 200) {
    _ray.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
    const hit = this.bvh.raycastFirst(_ray.ray, THREE.DoubleSide);
    return hit ? hit.point.y : 0;
  }
}
