// Hand-painted shading layer for buildings, trims and props (every quality tier; a few ALU ops per pixel).
//  - edge highlights / crevice shading: surface curvature from screen-space derivatives of the world normal.
//    The world's bevelled edges (blender bevel pass, hardened normals) are the only places the normal bends,
//    so convex edges pick up a soft painted highlight and inner corners a soft shade, like brushed edge wear.
//  - vertical gradient: walls a touch darker / cooler at street level, warmer toward the top.
//  - wrapped diffuse: light wraps past the terminator, so shading falls off in soft bands, not hard plastic cuts.
//  - softer sheen: roughness floor on painted surfaces, so highlights spread instead of glinting.
import * as THREE from 'three';
import { profileFor, chainCompile } from './surface.js';

export const paintUniforms = {
  uPaintEdge: { value: 0.26 },   // edge highlight strength
  uPaintCav: { value: 0.22 },    // crevice shade strength
  uPaintGrad: { value: 0.14 },   // street-level -> rooftop gradient
  uPaintWrap: { value: 0.14 },   // diffuse wrap (0 = physical)
  uPaintSoft: { value: 0.3 },   // roughness floor blend
};

const VARY = 'varying vec3 vPntW;\nvarying vec3 vPntN;';
const FRAG = /* glsl */`
  {
    vec3 pN = dot(vPntN, vPntN) > 1e-12 ? normalize(vPntN) : vec3(0.0, 1.0, 0.0);
    vec3 dPx = dFdx(vPntW), dPy = dFdy(vPntW), dNx = dFdx(pN), dNy = dFdy(pN);
    // signed curvature (1/m): >0 where the surface bends away (convex edge), <0 in inner corners
    float cx = dot(dNx, dPx) / max(dot(dPx, dPx), 1e-6), cy = dot(dNy, dPy) / max(dot(dPy, dPy), 1e-6);
    float curv = 0.5 * (cx + cy);
    float dist = length(vPntW - cameraPosition);
    float near = 1.0 - smoothstep(18.0, 60.0, dist);                       // sub-pixel bevels would only sparkle
    float edge = smoothstep(1.5, 8.0, curv) * near, cav = smoothstep(1.5, 8.0, -curv) * near;
    vec3 warm = diffuseColor.rgb * vec3(1.08, 1.04, 0.96) + 0.04;
    diffuseColor.rgb = mix(diffuseColor.rgb, warm, clamp(edge * uPaintEdge * 2.2, 0.0, 1.0));
    diffuseColor.rgb *= 1.0 - cav * uPaintCav;
    float wall = 1.0 - abs(pN.y);
    float h = smoothstep(0.0, 34.0, vPntW.y);
    vec3 grad = mix(vec3(0.88, 0.92, 1.0), vec3(1.05, 1.03, 0.98), h);    // cool street level, warm rooftops
    diffuseColor.rgb *= mix(vec3(1.0), grad, uPaintGrad * wall * 2.0);
    pntEdge = edge;
  }`;

/** add the painted layer to one MeshStandardMaterial (chains after the surface layer / CSM hooks) */
export function applyPaint(m, { lite = false } = {}) {
  if (!m.isMeshStandardMaterial || m.userData.paint) return false;
  m.userData.paint = lite ? 'lite' : true;
  if (lite) m.defines = { ...(m.defines || {}), PAINT_LITE: 1 };   // reflective: specular AA only
  chainCompile(m, (shader) => {
    Object.assign(shader.uniforms, paintUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VARY}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 pP = vec4(transformed, 1.0); vec3 pNo = objectNormal;
          #ifdef USE_INSTANCING
            pP = instanceMatrix * pP; pNo = mat3(instanceMatrix) * pNo;
          #endif
          vPntW = (modelMatrix * pP).xyz; vPntN = mat3(modelMatrix) * pNo;
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${VARY}\nuniform float uPaintEdge, uPaintCav, uPaintGrad, uPaintWrap, uPaintSoft;\nfloat pntEdge = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n#ifndef PAINT_LITE\n${FRAG}\n#endif`)
            .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        {
          // softer painted sheen (edges rougher, not shinier) + geometric specular anti-aliasing: where the normal
          // bends faster than a pixel can resolve (small bevels far away) the surface turns rough instead of
          // sparkling (bloom would otherwise turn those glints into fireflies)
          vec3 aN = dot(vPntN, vPntN) > 1e-12 ? normalize(vPntN) : vec3(0.0, 1.0, 0.0);
          float specAA = clamp(length(fwidth(aN)) * 1.8, 0.0, 1.0);
          #ifdef PAINT_LITE
            roughnessFactor = max(roughnessFactor, specAA);
          #else
            float soft = max(roughnessFactor, 0.5 + 0.3 * pntEdge);
            roughnessFactor = max(mix(roughnessFactor, soft, uPaintSoft * (1.0 - metalnessFactor * 0.7)), specAA);
            roughnessFactor = max(roughnessFactor, pntEdge * 0.6);
          #endif
        }`)
      .replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        // wrap the DIFFUSE term only: wrapping the shared irradiance would leak sun specular onto faces that point
        // away from the light (tiny bevel facets then sparkle)
        'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
        `float dotNLw = saturate( ( dot( geometryNormal, directLight.direction ) + uPaintWrap * PAINT_WRAP_ON ) / ( 1.0 + uPaintWrap * PAINT_WRAP_ON ) );
        reflectedLight.directDiffuse += dotNLw * directLight.color * BRDF_Lambert( material.diffuseColor );`));
    shader.fragmentShader = (lite ? '#define PAINT_WRAP_ON 0.0\n' : '#define PAINT_WRAP_ON 1.0\n') + shader.fragmentShader;
  });
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + (lite ? '|paintlite' : '|paint');
  m.needsUpdate = true;
  return true;
}

// buildings, trims, metal, roofs, paint/plastic props (surface profiles 1, 3, 4, 6) and every kit material except
// glass / night windows; ground, foliage, neon, screens and glass keep their own look
const KIT = /^KIT_/, KIT_SKIP = /Glass|NightLight|nightlight|Emissive|Headlights|Taillights|Leaves|Leaf/i;
export function applyPaintTo(root) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.material || o.isSkinnedMesh || o.isSprite) return;
    for (const m of [].concat(o.material)) {
      if (!m.isMeshStandardMaterial || m.transparent) continue;
      const name = (m.name || '').replace(/^H_/, '');
      const rule = profileFor(name);
      if (/glass|curtain|chrome/i.test(name) || (KIT.test(m.name) && /Glass/i.test(m.name))) {   // reflective: keep reflections, lose sparkle
        if (applyPaint(m, { lite: true })) n++;
        continue;
      }
      const ok = KIT.test(m.name) ? !KIT_SKIP.test(m.name) : !!rule && rule.profile !== 2 && rule.profile !== 5;
      if (ok && applyPaint(m)) n++;
    }
  });
  return n;
}
