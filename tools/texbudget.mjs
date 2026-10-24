import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const files = process.argv.slice(2);
let tot = 0, totGeo = 0;
for (const f of files) {
  const doc = await io.read('public/assets/' + f + '.glb');
  let tex = 0, n = 0, big = [];
  for (const t of doc.getRoot().listTextures()) {
    const s = t.getSize() || [0, 0];
    const b = s[0] * s[1] * 4 * 1.33; tex += b; n++; big.push(s[0]);
  }
  let geo = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    for (const a of p.listAttributes()) geo += a.getCount() * a.getElementSize() * 4;   // as float32 after decode (worst case)
    if (p.getIndices()) geo += p.getIndices().getCount() * 4;
  }
  tot += tex; totGeo += geo;
  console.log(f.padEnd(12), 'textures', n, 'max', Math.max(0, ...big), 'GPU tex MB', (tex / 1e6).toFixed(1), 'geo MB', (geo / 1e6).toFixed(1));
}
console.log('TOTAL tex MB', (tot / 1e6).toFixed(0), 'geo MB', (totGeo / 1e6).toFixed(0));
