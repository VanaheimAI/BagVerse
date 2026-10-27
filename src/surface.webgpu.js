// WebGPU twin of surface.js. Same exports. Uniforms are TSL uniform nodes (they keep the `.value` interface).
//  - character hero light (fill + rim): ported (emissive node on the character materials)
//  - procedural surface layer (grime, cracks, puddles; LYGIA GLSL): not ported yet, so applySurfaces is a no-op here
import * as THREE from 'three';
import { Fn, uniform, clamp, dot, normalize, pow, float, normalView, positionView, materialColor, materialEmissive } from 'three/tsl';

export const surfaceUniforms = { uSurfAmt: uniform(1), uSurfWet: uniform(0), uStylize: uniform(0) };
export const charUniforms = {
  uCharFill: uniform(0.15), uCharFillCol: uniform(new THREE.Color('#ffffff')),
  uCharRim: uniform(0.15), uCharRimCol: uniform(new THREE.Color('#ffffff')),
};

const heroLight = Fn(() => {
  const ndv = clamp(dot(normalView, normalize(positionView.negate())), 0, 1);
  const alb = materialColor.rgb.add(0.035);
  const fill = alb.mul(charUniforms.uCharFillCol).mul(charUniforms.uCharFill).mul(ndv.mul(0.6).add(0.4));
  const rim = charUniforms.uCharRimCol.mul(charUniforms.uCharRim).mul(pow(float(1).sub(ndv), 3)).mul(0.6);
  return materialEmissive.add(fill).add(rim);
});

/** character material (player, NPCs): hero fill + rim on top of its own emissive */
export function applyCharLight(m) {
  if (!m.isMeshStandardMaterial || m.userData.charLit) return;
  m.userData.charLit = true;
  m.emissiveNode = heroLight();
  m.needsUpdate = true;
}

const RULES = [
  [/^(fac_glass|curtain)/, 1, 0.25],
  [/^(fac_|brick|deco|marble|concrete$|trim_stone|house_\d|shopfront|storefront|crate|wood)/, 1, 1.0],
  [/^(asphalt|sidewalk|hexpaver|goldpave|dirt|rubble|grass|concrete)/, 2, 1.0],
  [/^(darkmetal|steel|roof_metal|chrome|rust|hull|water_tank|pole_paint|fence|trim_dark|lamp$|gold$)/, 3, 0.6],
  [/^(roof$|houseroof_)/, 4, 0.8],
  [/^(leaf|bark)/, 5, 1.0],
  [/^(car_|paint_|white_paint|red_paint|tent_|rubber|hazard|banner)/, 6, 0.4],
];
const SKIP = /neon|screen|sign_|portal|crystal|glow|window_lit|warm_light|water_red|swamp|lily|lane_paint|glass_/;
export function profileFor(name) {
  const n = (name || '').replace(/^H_/, '');
  if (SKIP.test(n)) return null;
  for (const [re, profile, bump] of RULES) if (re.test(n)) return { profile, bump };
  return null;
}
export function chainCompile() {}          // GLSL patching: nothing to chain on this renderer
export function applySurfaces() { return { webgpu: 'surface layer not ported yet' }; }
