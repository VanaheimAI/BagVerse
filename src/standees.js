// Billboard models from the user, swapped in for generated ad structures at load:
//   totem  - standing digital-signage model (public/assets/standing_billboard.glb) on the plaza's south-corner LED
//            totems (ad slots BB_19 / BB_20); 2.2 m screen -> model about 6.2 m tall
//   gantry - archway billboard (public/assets/billboard_archway.glb) on the avenue gantries at the plaza mouths
//            (BB_16 / 17 / 18); 11.6 m screen -> model about 20.3 m wide, posts on the old collider posts
// For each ad screen of that tier we:
//   1. cut the old generated structure out of the merged world meshes (triangles inside its footprint, sparing the
//      ground, curbs and road paint),
//   2. stand the model behind the screen, scaled so its screen frame fits the ad's width,
//   3. fit the ad quad to the model's screen (same width, the model's screen height, moved to its screen centre).
// The models face +Z with their base at y = 0 (export_prop.py). bag_square_hero.py no longer builds the old
// structures, so after a world rebuild step 1 simply finds nothing.
import * as THREE from 'three';
import { toWorldFloat } from './physics.js';

// screen: rectangle on the exported model (from an orthographic front render): centre, size, surface depth.
// old: the generated structure it replaces (bag_square_hero.py): width, depth, height, screen offset from its centre.
export const KINDS = {
  totem:  { screen: { cx: 0.0025, cy: 0.583, w: 0.355, h: 0.61, z: 0.0896 }, old: { w: 2.6, d: 0.7, h: 6.4, screenOff: 0.36 } },
  gantry: { screen: { cx: -0.002, cy: 0.426, w: 0.57, h: 0.288, z: 0.0168 }, old: { w: 21.2, d: 1.4, h: 14.4, screenOff: 0.42 } },
};

/** models: { totem: gltf, gantry: gltf } (either may be missing) */
export function placeBillboardModels(scene, world, models, opts = {}) {
  let n = 0;
  for (const [tier, gltf] of Object.entries(models)) if (gltf && KINDS[tier]) n += placeTier(scene, world, gltf, tier, KINDS[tier], opts);
  return n;
}
export const placeStandingBillboards = (scene, world, gltf, opts) => placeBillboardModels(scene, world, { totem: gltf }, opts);

function placeTier(scene, world, gltf, tier, { screen: SCREEN, old: OLD }, { shadows = true } = {}) {
  const totems = world.billboards.filter((b) => b.userData.tier === tier);
  if (!totems.length) return 0;
  // the model: one mesh (take the first), baked into its own space
  let src = null; gltf.scene.updateMatrixWorld(true); gltf.scene.traverse((o) => { if (!src && o.isMesh) src = o; });
  if (!src) return 0;
  const geo = toWorldFloat(src); geo.computeBoundingBox();
  const mat = src.material;
  const up = new THREE.Vector3(0, 1, 0);
  let placed = 0;
  for (const bb of totems) {
    if (bb.userData.modelled) continue; bb.userData.modelled = true;
    const u = bb.userData, n = u.normal.clone().setY(0).normalize(), tan = new THREE.Vector3().crossVectors(up, n);
    bb.geometry.computeBoundingBox();
    const box = bb.geometry.boundingBox, c = box.getCenter(new THREE.Vector3());
    const ground = world.physics.groundAt(c.x + n.x * 1.5, c.z + n.z * 1.5, c.y);   // the pavement in front of the screen
    const quadW = Math.abs((box.max.x - box.min.x) * tan.x) + Math.abs((box.max.z - box.min.z) * tan.z);
    const k = quadW / SCREEN.w;

    // 1. remove the old housing
    const foot = c.clone().addScaledVector(n, -OLD.screenOff);
    cutBox(world, foot, n, tan, OLD.w / 2 + 0.05, OLD.d / 2 + 0.05, ground - 0.05, ground + OLD.h + 0.3, bb, ground + 0.35);

    // 2. the model, base on the ground, screen just behind the ad quad
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(k);
    m.rotation.y = Math.atan2(n.x, n.z);
    const screenCentre = new THREE.Vector3(c.x, ground + SCREEN.cy * k, c.z);
    m.position.copy(screenCentre).addScaledVector(n, -(SCREEN.z * k + 0.02)).addScaledVector(tan, -SCREEN.cx * k);
    m.position.y = ground;
    m.castShadow = shadows; m.receiveShadow = true; m.name = 'STANDEE_' + bb.name;
    scene.add(m);

    // 3. fit the ad quad to the model's screen: keep its width, set the height, move it to the screen centre
    const pos = bb.geometry.attributes.position, h0 = box.max.y - box.min.y, h1 = SCREEN.h * k, cy0 = c.y;
    for (let i = 0; i < pos.count; i++) pos.setY(i, screenCentre.y + (pos.getY(i) - cy0) * (h1 / h0));
    pos.needsUpdate = true; bb.geometry.computeBoundingBox(); bb.geometry.computeBoundingSphere();
    u.center = bb.geometry.boundingBox.getCenter(new THREE.Vector3());
    placed++;
  }
  console.log('billboard models', tier, placed);
  return placed;
}

/** delete world triangles whose three corners sit inside an oriented box (footprint around `foot`) */
function cutBox(world, foot, n, tan, halfW, halfD, y0, y1, skip, floorY = -Infinity) {
  const inside = (x, y, z) => {
    if (y < y0 || y > y1) return false;
    const dx = x - foot.x, dz = z - foot.z;
    return Math.abs(dx * tan.x + dz * tan.z) <= halfW && Math.abs(dx * n.x + dz * n.z) <= halfD;
  };
  const reach = Math.hypot(halfW, halfD) + 0.1, probe = new THREE.Box3(new THREE.Vector3(foot.x - reach, y0, foot.z - reach), new THREE.Vector3(foot.x + reach, y1, foot.z + reach));
  let removed = 0;
  world.root.traverse((o) => {
    if (!o.isMesh || o === skip || o.name === 'COLLIDER' || !o.visible || !o.geometry.index) return;
    if (/^(BB_|TICKER_|PORTAL_FX_|KIT_|STANDEE_)/.test(o.name)) return;
    o.geometry.computeBoundingBox();
    const wb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    if (!wb.intersectsBox(probe)) return;
    // bake to world floats once so the triangle test is simple, then filter the index
    if (!o.userData.baked) {
      o.geometry = toWorldFloat(o); o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1);
      o.matrixAutoUpdate = false; o.updateMatrix(); o.updateMatrixWorld(true); o.userData.baked = true;
    }
    const p = o.geometry.attributes.position, idx = o.geometry.index.array, keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], cc = idx[t + 2];
      const ya = p.getY(a), yb = p.getY(b), yc = p.getY(cc);
      const low = ya < floorY && yb < floorY && yc < floorY;   // ground, curbs, road paint: never cut
      if (!low && inside(p.getX(a), ya, p.getZ(a)) && inside(p.getX(b), yb, p.getZ(b)) && inside(p.getX(cc), yc, p.getZ(cc))) { removed++; continue; }
      keep.push(a, b, cc);
    }
    if (keep.length !== idx.length) { o.geometry.setIndex(keep); o.geometry.computeBoundingSphere(); }
  });
  return removed;
}
