// Keep only what an emote needs: every bone's rotation + the hips' translation. Usage: node tools/strip_anim.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, resample } from '@gltf-transform/functions';
const [src, dst] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
let removed = 0;
for (const anim of doc.getRoot().listAnimations()) {
  for (const ch of anim.listChannels()) {
    const path = ch.getTargetPath(), node = ch.getTargetNode();
    if (path === 'rotation' || (path === 'translation' && /Hips$/.test(node?.getName() || ''))) continue;
    const s = ch.getSampler(); ch.dispose(); s.dispose(); removed++;
  }
}
await doc.transform(resample({ tolerance: 1e-4 }), prune());
await io.write(dst, doc);
console.log('removed channels', removed);
