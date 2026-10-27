// Small custom-shader effects, WebGPU build: TSL ports of fxmats.js with the same exports and `.value` handles.
import * as THREE from 'three';
import {
  Fn, uniform, float, vec2, vec3, vec4, positionLocal, positionView, positionGeometry, uv, texture, length, dot, atan2, sin, mix,
  smoothstep, clamp, instancedBufferAttribute,
} from 'three/tsl';

/** swirling portal disc. Returns { material, time } */
export function portalMaterial({ color, center, u, r = 3.05 }) {
  const uTime = uniform(0), uColor = uniform(color), uCenter = uniform(center), uU = uniform(u), uR = uniform(r);
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  const shade = Fn(() => {
    const d = positionLocal.sub(uCenter);
    const q = vec2(dot(d, uU), d.y).div(uR);
    const rr = length(q), a = atan2(q.y, q.x);
    const swirl = sin(a.mul(5).add(rr.mul(14)).sub(uTime.mul(4))).mul(0.5).add(0.5);
    const core = float(1).sub(smoothstep(0.0, 0.9, rr));
    const rim = smoothstep(0.75, 1.0, rr);
    const col = mix(uColor.mul(0.35), vec3(1), core.mul(0.35)).add(uColor.mul(swirl).mul(0.9).mul(float(1).sub(rr))).add(uColor.mul(rim).mul(1.5));
    const near = smoothstep(2.0, 9.0, positionView.z.negate());   // fade when the camera gets close
    const alpha = swirl.mul(0.5).add(0.3).mul(near).mul(float(1).sub(smoothstep(0.96, 1.02, rr)));
    return vec4(col.mul(near.mul(0.6).add(0.5)), alpha);
  })();
  material.colorNode = shade.rgb; material.opacityNode = shade.a;
  return { material, time: uTime };
}

/** smoke puffs as instanced billboards (WebGPU draws points at 1 px). Returns { object, flush } */
export function createSmoke(geo) {
  const P = geo.attributes.position, Cc = geo.attributes.color, L = geo.attributes.life, n = P.count;
  const iP = new THREE.InstancedBufferAttribute(P.array, 3), iC = new THREE.InstancedBufferAttribute(Cc.array, 3), iL = new THREE.InstancedBufferAttribute(L.array, 1);
  iP.setUsage(THREE.DynamicDrawUsage); iL.setUsage(THREE.DynamicDrawUsage);
  const life = instancedBufferAttribute(iL), col = instancedBufferAttribute(iC);
  const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
  mat.positionNode = instancedBufferAttribute(iP);
  mat.scaleNode = life.mul(7).add(2).mul(0.9);                   // same on-screen growth as the WebGL point sprites
  const d = length(uv().sub(0.5));
  mat.colorNode = col.mul(0.9);
  mat.opacityNode = float(1).sub(smoothstep(0.0, 0.5, d)).mul(float(1).sub(life)).mul(smoothstep(0.0, 0.15, life)).mul(0.45);
  const object = new THREE.Sprite(mat); object.count = n; object.frustumCulled = false;
  return { object, flush: () => { iP.needsUpdate = true; iL.needsUpdate = true; } };
}

/** full-screen backdrop image for the skin / Collection screen. Returns { material, screen, anchor, scale } */
export function backdropMaterial(tex, { img = new THREE.Vector2(2576, 1438), deck = new THREE.Vector2(1288, 1095) } = {}) {
  const uScreen = uniform(new THREE.Vector2(1, 1)), uAnchor = uniform(new THREE.Vector2()), uScale = uniform(1), uImg = uniform(img), uDeck = uniform(deck);
  const material = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, fog: false });
  material.vertexNode = vec4(positionGeometry.xy, 1, 1);          // full-screen quad
  const shade = Fn(() => {
    const vUv = uv();
    const px = vec2(vUv.x, float(1).sub(vUv.y)).mul(uScreen);     // screen px, y down
    const ip = px.sub(uAnchor).div(uScale).add(uDeck);           // image px
    const t = clamp(ip.div(uImg), vec2(0.0005), vec2(0.9995));
    const c = texture(tex, vec2(t.x, float(1).sub(t.y))).rgb;
    const q = vUv.sub(0.5);
    return c.mul(float(1).sub(dot(q, q).mul(0.7)));               // gentle vignette
  })();
  material.colorNode = shade;
  return { material, screen: uScreen, anchor: uAnchor, scale: uScale };
}
