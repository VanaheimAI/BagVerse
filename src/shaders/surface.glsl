// Procedural "non-flat" surface layer injected into the world's MeshStandardMaterials (see src/surface.js).
// Everything is in world space, so it breaks up texture tiling across merged meshes and never stretches.
// SURF_PROFILE (per material, compile-time): 1 facade, 2 ground, 3 metal, 4 roof, 5 foliage, 6 paint/plastic

#define FBM_OCTAVES 3
#include "lygia/generative/snoise.glsl"
#include "lygia/generative/fbm.glsl"

uniform float uSurfAmt;   // global strength (0 = off)
uniform float uSurfWet;   // puddles / wet sheen, driven by the Look preset (night is wettest)
varying vec3 vSurfW;
varying vec3 vSurfN;
vec3 surfLift = vec3(0.0);   // additive part, for near-black albedos (asphalt) where multiplying shows nothing

// planar projection on the dominant axis (a cheap triplanar)
vec2 surfUV(vec3 p, vec3 n) {
  vec3 a = abs(n);
  return a.y > max(a.x, a.z) ? p.xz : (a.x > a.z ? p.zy : p.xy);
}

// rgb = albedo multiplier, a = roughness offset; h = height for bump
vec4 surfaceLayer(vec3 p, vec3 n, out float h) {
  vec2 uv = surfUV(p, n);
  float wall = 1.0 - abs(n.y);
  vec3 tint = vec3(1.0);
  float rough = 0.0;
  h = 0.0;

#if SURF_PROFILE == 1
  // facades: big tonal patches, vertical rain streaks, street grime at the base, fine pitting
  tint *= 1.0 + fbm(uv * 0.03) * 0.18;
  float streak = smoothstep(0.45, 0.95, snoise(vec2(uv.x * 1.4, p.y * 0.06)) * 0.5 + 0.5) * wall;
  streak *= 0.6 + 0.4 * fbm(uv * 0.2);
  tint *= 1.0 - streak * 0.2; rough += streak * 0.1;
  float grime = (1.0 - smoothstep(0.0, 2.6 + 1.6 * fbm(uv * 0.25), p.y)) * wall;
  tint *= 1.0 - grime * 0.32; rough += grime * 0.12;
  h = snoise(uv * 1.8) * 0.3 + fbm(uv * 0.6) * 0.25;   // low frequencies only: no shimmer at distance

#elif SURF_PROFILE == 2
  // ground: dirt patches, hairline cracks, oil stains, puddles that turn glossy when wet
  float macro = fbm(p.xz * 0.035);
  tint *= 1.0 + macro * 0.28;
  float worn = smoothstep(0.0, 0.55, fbm(p.xz * 0.09 + 13.0));          // sun-bleached, worn-in lighter areas
  tint *= mix(1.0, 1.45, worn);
  surfLift = vec3(0.034, 0.033, 0.031) * worn * (1.0 - wall) + vec3(0.012) * (fbm(p.xz * 3.0) * 0.5 + 0.5);   // exposed grey aggregate
  float patches = smoothstep(0.15, 0.6, fbm(p.xz * 0.2 + 3.0));         // patched repairs, darker and smoother
  tint *= mix(1.0, 0.72, patches); rough -= patches * 0.08;
  float seam = 1.0 - smoothstep(0.0, 0.02, abs(snoise(vec2(p.x * 0.04, p.z * 0.9))));   // tar seams
  tint *= 1.0 - seam * 0.35;
  float crack = 1.0 - smoothstep(0.0, 0.03, abs(snoise(p.xz * 0.32)));
  crack *= smoothstep(-0.1, 0.4, snoise(p.xz * 0.05 + 4.0));          // cracks only in some areas
  tint *= 1.0 - crack * 0.45;
  float stain = smoothstep(0.55, 0.8, snoise(p.xz * 0.18 + 31.0)) * 0.35;
  tint *= 1.0 - stain;
  float puddle = smoothstep(0.12, 0.32, fbm(p.xz * 0.06 + 7.0)) * uSurfWet * (1.0 - wall);
  surfLift *= 1.0 - puddle;
  tint *= 1.0 - puddle * 0.45; rough -= puddle * 0.9;
  tint *= 1.0 - uSurfWet * 0.12 * (1.0 - wall);                       // everything a bit darker when damp
  rough -= uSurfWet * 0.42 * (1.0 - wall);                            // wet: the whole road goes glossy, puddles mirror
  h = (fbm(p.xz * 1.2) * 0.3 - crack * 0.8 - seam * 0.4) * (1.0 - puddle);

#elif SURF_PROFILE == 3
  // metal: smudges and wear, slightly uneven tone
  tint *= 1.0 + fbm(uv * 0.5) * 0.12;
  rough += fbm(uv * 1.8 + 5.0) * 0.22;
  float rust = smoothstep(0.55, 0.85, fbm(uv * 0.35 + 2.0)) * (1.0 - smoothstep(0.0, 4.0, p.y) * 0.5);
  tint = mix(tint, tint * vec3(1.05, 0.72, 0.5), rust * 0.45); rough += rust * 0.25;
  h = snoise(uv * 3.0) * 0.12 + rust * snoise(uv * 7.0) * 0.3;

#elif SURF_PROFILE == 4
  // roofs: weathering, soot, dirt collecting in streaks
  tint *= 1.0 + fbm(uv * 0.07) * 0.24;
  float soot = smoothstep(0.2, 0.7, fbm(uv * 0.2 + 9.0));
  tint *= 1.0 - soot * 0.25; rough += 0.08;
  h = snoise(uv * 4.0) * 0.3;

#elif SURF_PROFILE == 5
  // foliage: each tree drifts warmer/cooler, clumps get darker inside, leafy bump
  float hue = fbm(p.xz * 0.05) * 0.5 + 0.5;
  tint *= mix(vec3(0.85, 1.02, 0.92), vec3(1.15, 1.05, 0.72), hue);
  float clump = snoise(p * 1.6) * 0.5 + 0.5;
  tint *= mix(0.72, 1.12, clump);
  h = snoise(p * 5.0) * 0.6 + clump * 0.4;

#elif SURF_PROFILE == 6
  // paint / plastic: very subtle unevenness and dust on top faces
  tint *= 1.0 + fbm(uv * 0.15) * 0.06;
  float dust = smoothstep(0.6, 1.0, n.y) * (fbm(uv * 0.8) * 0.5 + 0.5);
  tint = mix(tint, tint * vec3(0.92, 0.9, 0.86), dust * 0.4); rough += dust * 0.15;
  h = snoise(uv * 5.0) * 0.06;
#endif

  return vec4(tint, rough);
}

// bump from a scalar height field using screen-space derivatives (Mikkelsen, as in three's bumpmap chunk)
vec3 surfBump(vec3 viewPos, vec3 nrm, float h, float scale, float faceDir) {
  vec3 sx = dFdx(viewPos), sy = dFdy(viewPos);
  vec3 r1 = cross(sy, nrm), r2 = cross(nrm, sx);
  float det = dot(sx, r1) * faceDir;
  vec2 dh = vec2(dFdx(h), dFdy(h)) * scale;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  vec3 r = abs(det) * nrm - grad;
  return dot(r, r) > 1e-20 ? normalize(r) : nrm;   // degenerate derivatives (distant / sliver pixels) would give NaN
}
