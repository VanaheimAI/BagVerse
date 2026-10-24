// Injects the LYGIA-based procedural surface layer (src/shaders/surface.glsl) into the world's
// MeshStandardMaterials: per-material profiles add world-space tonal variation, grime, cracks,
// puddles, rust and a procedural bump on top of the baked textures, so nothing reads as a flat colour.
import * as THREE from 'three';
import SURFACE from './shaders/surface.glsl';

export const surfaceUniforms = { uSurfAmt: { value: 1 }, uSurfWet: { value: 0 }, uStylize: { value: 0 } };

// Character key/fill + rim ("hero lighting"): a view-facing fill that lifts the character's own albedo and a soft
// rim that separates the silhouette from dark backgrounds. Strength is set per Look preset (strongest at night).
export const charUniforms = {
  uCharFill: { value: 0.15 }, uCharFillCol: { value: new THREE.Color('#ffffff') },
  uCharRim: { value: 0.15 }, uCharRimCol: { value: new THREE.Color('#ffffff') },
};

/** patch a character material (player, NPCs) with the hero fill/rim */
export function applyCharLight(m) {
  if (!m.isMeshStandardMaterial || m.userData.charLit) return;
  m.userData.charLit = true;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, charUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCharFill; uniform vec3 uCharFillCol; uniform float uCharRim; uniform vec3 uCharRimCol;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          // fill: camera-side soft light on the albedo (wrapped, never fully flat); albedo is lifted a little so
          // black outfits still show folds and trims
          vec3 alb = diffuseColor.rgb + 0.035;
          totalEmissiveRadiance += alb * uCharFillCol * uCharFill * (0.4 + 0.6 * ndv);
          totalEmissiveRadiance += uCharRimCol * uCharRim * pow(1.0 - ndv, 3.0) * 0.6;
        }`);
  };
  m.customProgramCacheKey = () => 'charlit';
  m.needsUpdate = true;
}

// material name (without the hero "H_" prefix) -> [profile, bump strength]
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

/** chain an onBeforeCompile hook after any existing one (CSM and others also patch materials) */
export function chainCompile(m, fn) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = function (shader, renderer) { prev.call(this, shader, renderer); fn.call(this, shader, renderer); };
}

function patch(m, { profile, bump }) {
  m.defines = { ...(m.defines || {}), SURF_PROFILE: profile };
  m.userData.surf = profile;
  chainCompile(m, (shader) => {
    Object.assign(shader.uniforms, surfaceUniforms);
    shader.uniforms.uSurfBump = { value: bump };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfW;\nvarying vec3 vSurfN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 surfP = vec4(transformed, 1.0); vec3 surfN = objectNormal;
        #ifdef USE_INSTANCING
          surfP = instanceMatrix * surfP; surfN = mat3(instanceMatrix) * surfN;
        #endif
        vSurfW = (modelMatrix * surfP).xyz; vSurfN = normalize(mat3(modelMatrix) * surfN);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uSurfBump;\nuniform float uStylize;\n${SURFACE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 surfNrm = dot(vSurfN, vSurfN) > 1e-12 ? normalize(vSurfN) : vec3(0.0, 1.0, 0.0);
        float surfH; vec4 surfL = surfaceLayer(vSurfW, surfNrm, surfH);
        float surfLod = 1.0 - smoothstep(10.0, 60.0, length(vSurfW - cameraPosition));   // bump only up close
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * surfL.rgb + surfLift, uSurfAmt);
        // stylised albedo: lift near-black materials to readable mid-tones (Fortnite palettes live in the mids)
        diffuseColor.rgb = mix(diffuseColor.rgb, pow(max(diffuseColor.rgb, 0.0), vec3(0.78)) * 1.04, uStylize);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + surfL.a * uSurfAmt, 0.04, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = surfBump(-vViewPosition, normal, surfH * surfLod * uSurfAmt, uSurfBump * 0.035, faceDirection);`);
  });
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + '|surf' + profile;
  m.needsUpdate = true;
}

/** walk a loaded scene and patch every recognised world material once */
export function applySurfaces(root) {
  const stats = {};
  root.traverse((o) => {
    if (!o.isMesh || !o.material || o.isSkinnedMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m.isMeshStandardMaterial || m.userData.surf !== undefined) continue;
      const rule = profileFor(m.name);
      m.userData.surf = rule ? rule.profile : 0;
      if (rule) { patch(m, rule); stats[rule.profile] = (stats[rule.profile] || 0) + 1; }
    }
  });
  return stats;
}
