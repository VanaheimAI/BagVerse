// Small custom-shader effects, WebGL build (GLSL ShaderMaterial). The WebGPU build swaps this module for
// fxmats.webgpu.js (TSL node materials) with the same exports and the same `.value` handles.
import * as THREE from 'three';

/** swirling portal disc (Bag Run / Tile Drop gates). Returns { material, time } (time.value = seconds) */
export function portalMaterial({ color, center, u, r = 3.05 }) {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: color }, uCenter: { value: center }, uU: { value: u }, uR: { value: r } },
    vertexShader: `varying vec3 vP; varying float vD; void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform vec3 uCenter; uniform vec3 uU; uniform float uR; varying vec3 vP; varying float vD;
      void main(){
        vec3 d = vP - uCenter; vec2 q = vec2(dot(d, uU), d.y) / uR;
        float r = length(q); float a = atan(q.y, q.x);
        float swirl = sin(a * 5.0 + r * 14.0 - uTime * 4.0) * 0.5 + 0.5;
        float core = smoothstep(0.9, 0.0, r);
        float rim = smoothstep(0.75, 1.0, r);
        vec3 col = mix(uColor * 0.35, vec3(1.0), core * 0.35) + uColor * swirl * 0.9 * (1.0 - r);
        col += uColor * rim * 1.5;
        float near = smoothstep(2.0, 9.0, vD);   // fade when the camera gets close so it doesn't blow out the bloom
        gl_FragColor = vec4(col * (0.5 + 0.6 * near), (0.3 + 0.5 * swirl) * near * smoothstep(1.02, 0.96, r));
      }`,
  });
  return { material, time: material.uniforms.uTime };
}

/**
 * chimney / refinery smoke puffs. geo carries position (vec3), color (vec3) and life (0..1) per puff, rewritten on
 * the CPU every frame; call flush() after changing them. Returns { object, flush }
 */
export function createSmoke(geo) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 600 } },
    vertexShader: `attribute float life; attribute vec3 color; varying float vL; varying vec3 vC;
      void main(){ vL = life; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = (2.0 + life * 7.0) * 600.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vL; varying vec3 vC;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d) * (1.0 - vL) * smoothstep(0.0, 0.15, vL) * 0.45;
        gl_FragColor = vec4(vC * 0.9, a); }`,
  });
  const object = new THREE.Points(geo, mat); object.frustumCulled = false;
  return { object, flush: () => { geo.attributes.position.needsUpdate = true; geo.attributes.life.needsUpdate = true; } };
}

/**
 * full-screen backdrop image for the skin / Collection screen, placed so the painted pedestal's deck (deck px in an
 * img-sized picture) sits at anchor (screen px, y down), scaled by scale. Returns { material, screen, anchor, scale }
 */
export function backdropMaterial(tex, { img = new THREE.Vector2(2576, 1438), deck = new THREE.Vector2(1288, 1095) } = {}) {
  const material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uTex: { value: tex }, uScreen: { value: new THREE.Vector2(1, 1) }, uAnchor: { value: new THREE.Vector2() },
      uScale: { value: 1 }, uImg: { value: img }, uDeck: { value: deck } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: `uniform sampler2D uTex; uniform vec2 uScreen, uAnchor, uImg, uDeck; uniform float uScale; varying vec2 vUv;
      void main(){
        vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uScreen;                 // screen px, y down
        vec2 ip = (px - uAnchor) / uScale + uDeck;                     // image px
        vec2 uv = clamp(ip / uImg, vec2(0.0005), vec2(0.9995)); uv.y = 1.0 - uv.y;
        vec3 c = texture2D(uTex, uv).rgb;
        vec2 q = vUv - 0.5; c *= 1.0 - 0.35 * dot(q, q) * 2.0;         // gentle vignette so the HUD panels sit well
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }` });
  const u = material.uniforms;
  return { material, screen: u.uScreen, anchor: u.uAnchor, scale: u.uScale };
}
