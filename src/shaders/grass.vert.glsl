// grass blades: camera-following instanced grid (see src/grass.js); noise from LYGIA
uniform vec2 uOrigin; uniform float uSpacing, uRadius, uTime; uniform sampler2D uMask; uniform vec3 uCam;
uniform vec4 uWorld;          // mask covers x0, z0, size, -
attribute vec2 offset;
varying float vT; varying vec3 vCol; varying float vShade;
#include <fog_pars_vertex>
#include "lygia/generative/random.glsl"
#include "lygia/generative/snoise.glsl"
#define hash(P) random(P)
float noise(vec2 p) { return snoise(p) * 0.5 + 0.5; }   // LYGIA simplex, remapped to 0..1
void main(){
  vec2 cell = floor((uOrigin + offset) / uSpacing);
  vec2 base = cell * uSpacing + (vec2(hash(cell), hash(cell + 7.3)) - 0.5) * uSpacing * 1.6;
  float mask = texture2D(uMask, (base - uWorld.xy) / uWorld.z).r;
  float d = distance(base, uCam.xz);
  float fade = smoothstep(uRadius, uRadius * 0.62, d);
  float r = hash(cell + 3.1);
  float h = mask * fade * mix(0.24, 0.52, r) * (0.75 + 0.5 * noise(base * 0.15));
  float ang = hash(cell + 1.7) * 6.2831;
  vec3 p = position;                         // blade in local space: x across, y up (0..1)
  p.x *= mix(0.6, 1.2, r) * (0.35 + 0.65 * fade);
  p.y *= h;
  float c = cos(ang), s = sin(ang);
  p.xz = mat2(c, -s, s, c) * p.xz;
  // wind: big rolling gusts + small flutter, bend grows with height^2
  float gust = noise(base * 0.06 + vec2(uTime * 0.35, uTime * 0.12));
  float sway = (gust * 0.9 + 0.25) * 0.5 + sin(uTime * 2.3 + base.x * 0.8 + base.y * 0.6) * 0.08;
  float k = position.y * position.y;
  p.x += sway * k * h * 1.6; p.z += sway * k * h * 0.7;
  p.y -= abs(sway) * k * h * 0.25;
  vec3 world = vec3(base.x, 0.03, base.y) + p;
  vT = position.y;
  vec3 dark = vec3(0.12, 0.34, 0.06), mid = vec3(0.30, 0.62, 0.12), tip = vec3(0.66, 0.88, 0.30);   // bright stylised lawn
  vCol = mix(mix(dark, mid, smoothstep(0.0, 0.5, vT)), tip, smoothstep(0.5, 1.0, vT)) * (0.82 + 0.36 * hash(cell + 9.1));
  vCol = mix(vCol, vCol * vec3(1.15, 1.05, 0.6), smoothstep(0.55, 0.9, noise(base * 0.05)) * 0.6);   // dry patches
  vShade = 0.6 + 0.4 * gust;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
