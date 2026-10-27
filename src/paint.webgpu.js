// WebGPU twin of paint.js: the hand-painted shading layer as TSL nodes on the same materials.
//  ported: edge highlights / crevice shade (curvature from screen-space derivatives of the world normal),
//          street-level -> rooftop gradient, softer painted sheen (roughness floor) + specular anti-aliasing
//  not yet: wrapped diffuse (needs a custom lighting model)
import * as THREE from 'three';
import {
  Fn, uniform, float, vec3, vec4, dFdx, dFdy, dot, max, clamp, mix, smoothstep, length, abs, fwidth, normalize,
  positionWorld, normalWorld, cameraPosition, materialColor, materialRoughness, materialMetalness,
} from 'three/tsl';
import { profileFor } from './surface.js';

export const paintUniforms = {
  uPaintEdge: uniform(0.26), uPaintCav: uniform(0.22), uPaintGrad: uniform(0.14), uPaintWrap: uniform(0.14), uPaintSoft: uniform(0.3),
};
const U = paintUniforms;

const curvature = Fn(() => {
  const pN = normalize(normalWorld), P = positionWorld;
  const dPx = dFdx(P), dPy = dFdy(P), dNx = dFdx(pN), dNy = dFdy(pN);
  const cx = dot(dNx, dPx).div(max(dot(dPx, dPx), 1e-6)), cy = dot(dNy, dPy).div(max(dot(dPy, dPy), 1e-6));
  const near = float(1).sub(smoothstep(18.0, 60.0, length(P.sub(cameraPosition))));   // sub-pixel bevels would only sparkle
  const curv = cx.add(cy).mul(0.5);
  return vec3(smoothstep(1.5, 8.0, curv).mul(near), smoothstep(1.5, 8.0, curv.negate()).mul(near), 0);   // (edge, cavity)
});

const paintColor = Fn(() => {
  const k = curvature(), edge = k.x, cav = k.y;
  const base = materialColor;
  const c = base.rgb.toVar();
  const warm = c.mul(vec3(1.08, 1.04, 0.96)).add(0.04);
  c.assign(mix(c, warm, clamp(edge.mul(U.uPaintEdge).mul(2.2), 0, 1)));
  c.mulAssign(float(1).sub(cav.mul(U.uPaintCav)));
  const wall = float(1).sub(abs(normalize(normalWorld).y));
  const grad = mix(vec3(0.88, 0.92, 1.0), vec3(1.05, 1.03, 0.98), smoothstep(0.0, 34.0, positionWorld.y));   // cool street, warm rooftops
  c.mulAssign(mix(vec3(1), grad, U.uPaintGrad.mul(wall).mul(2)));
  return vec4(c, base.a);
});

const specAA = Fn(() => clamp(length(fwidth(normalize(normalWorld))).mul(1.8), 0, 1));
const paintRough = Fn(() => {
  const edge = curvature().x;
  const soft = max(materialRoughness, edge.mul(0.3).add(0.5));
  const r = max(mix(materialRoughness, soft, U.uPaintSoft.mul(float(1).sub(materialMetalness.mul(0.7)))), specAA());
  return max(r, edge.mul(0.6));
});
const liteRough = Fn(() => max(materialRoughness, specAA()));

export function applyPaint(m, { lite = false } = {}) {
  if (!m.isMeshStandardMaterial || m.userData.paint) return false;
  m.userData.paint = lite ? 'lite' : true;
  if (lite) m.roughnessNode = liteRough();
  else { m.colorNode = paintColor(); m.roughnessNode = paintRough(); }
  m.needsUpdate = true;
  return true;
}

const KIT = /^KIT_/, KIT_SKIP = /Glass|NightLight|nightlight|Emissive|Headlights|Taillights|Leaves|Leaf/i;
export function applyPaintTo(root) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.material || o.isSkinnedMesh || o.isSprite) return;
    for (const m of [].concat(o.material)) {
      if (!m.isMeshStandardMaterial || m.transparent) continue;
      const name = (m.name || '').replace(/^H_/, '');
      const rule = profileFor(name);
      if (/glass|curtain|chrome/i.test(name) || (KIT.test(m.name) && /Glass/i.test(m.name))) { if (applyPaint(m, { lite: true })) n++; continue; }
      const ok = KIT.test(m.name) ? !KIT_SKIP.test(m.name) : !!rule && rule.profile !== 2 && rule.profile !== 5;
      if (ok && applyPaint(m)) n++;
    }
  });
  return n;
}
