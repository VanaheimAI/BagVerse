// Map export (tools only, loaded on demand): the static Bag Square as one GLB, exactly as the game builds it:
// the world GLB with the landmark cuts applied, the vault / statue / arch models, the city kit props (instanced),
// billboards and every tree (full mesh, all instances). Characters, traffic, collectibles, lights, effects and UI
// are left out. Used by tools/export_map.mjs → blender/export_map_blend.py (bagverse_map.blend).
import * as THREE from 'three';

export async function exportMap({ scene, trees }) {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const root = new THREE.Group(); root.name = 'BagVerse_Map';
  const groups = {};
  const bucket = (name) => { if (!groups[name]) { groups[name] = new THREE.Group(); groups[name].name = name; root.add(groups[name]); } return groups[name]; };
  // fully cut meshes (index emptied by the landmark cuts) would export as every vertex drawn: drop them
  const keepWorld = (o) => !(o.isSprite || o.isPoints || o.isLight || o.material?.isShaderMaterial || (o.isMesh && o.geometry.index && o.geometry.index.count === 0));
  for (const o of scene.children) {
    const n = o.name || '';
    if (n === 'Scene') {   // the Blender-built city (already cut around the vaults)
      const c = o.clone(true); const drop = [];
      c.traverse((x) => { if (x !== c && !keepWorld(x)) drop.push(x); });
      for (const x of drop) x.removeFromParent();
      c.name = 'City'; bucket('Map').add(c);
    } else if (/^VAULT_/.test(n)) bucket('Landmarks').add(o.clone());
    else if (/^PROP_/.test(n)) bucket('Landmarks').add(o.clone(true));
    else if (/^STANDEE_/.test(n)) bucket('Billboards').add(o.clone());
    else if (/^KIT_/.test(n) && !/^KIT_CAR_/.test(n) && o.isInstancedMesh) {
      const m = new THREE.InstancedMesh(o.geometry, o.material, o.count); m.name = n;
      for (let i = 0; i < o.count; i++) { const M = new THREE.Matrix4(); o.getMatrixAt(i, M); m.setMatrixAt(i, M); }
      m.matrix.copy(o.matrix); m.matrixAutoUpdate = false; bucket('Props').add(m);
    }
  }
  if (trees) {   // every tree at full detail (the game swaps far ones for impostors)
    const t = new THREE.InstancedMesh(trees.full.geometry, trees.full.material, trees.mats.length); t.name = 'Trees';
    trees.mats.forEach((M, i) => t.setMatrixAt(i, M));
    bucket('Trees').add(t);
  }
  root.updateMatrixWorld(true);
  const glb = await new GLTFExporter().parseAsync(root, { binary: true, maxTextureSize: 2048 });
  return glb;
}
