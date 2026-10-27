// WebGPU twin of look.js: same presets and public interface, built on three's WebGPURenderer + TSL.
//   sky: TSL port of the GLSL sky (gradient, sun disc + glow, stylised fbm clouds, stars)
//   post: PostProcessing (r170) scene pass -> bloom -> exposure + Neutral tone mapping ->
//         colour grade (sRGB space: vibrance, contrast, S-curve, warm highlights, lifted shadows, vignette) -> FXAA
//   shadows: one sun shadow map that follows the player (cascades: later, via CSMShadowNode)
//   GI: not captured yet (the WebGL build reads a cubemap back synchronously; WebGPU readback is async)
import * as THREE from 'three';
import {
  Fn, uniform, float, vec2, vec3, vec4, positionLocal, normalize, mix, smoothstep, clamp, max, min, dot, pow, floor, fract, sin,
  step, abs, time, pass, screenUV, Loop, neutralToneMapping, sRGBTransferOETF,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';   // (r170's SMAA node compiles to invalid SPIR-V on some drivers)
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PRESETS, ORDER } from './presets.js';
import { surfaceUniforms, charUniforms } from './surface.js';
import { paintUniforms } from './paint.js';

export { PRESETS, ORDER };

// ---- sky (port of SKY_FS in look.js)
const hash2 = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)));
const noise2 = Fn(([p]) => {
  const i = floor(p), f = fract(p).toVar();
  f.assign(f.mul(f).mul(float(3).sub(f.mul(2))));
  return mix(mix(hash2(i), hash2(i.add(vec2(1, 0))), f.x), mix(hash2(i.add(vec2(0, 1))), hash2(i.add(vec2(1, 1))), f.x), f.y);
});
const fbm = Fn(([p0]) => {
  const v = float(0).toVar(), a = float(0.5).toVar(), p = vec2(p0).toVar();
  Loop(5, () => { v.addAssign(a.mul(noise2(p))); p.assign(p.mul(2.03).add(17.1)); a.mulAssign(0.5); });
  return v;
});

function makeSky() {
  const u = {
    uTop: uniform(new THREE.Color()), uHorizon: uniform(new THREE.Color()), uGround: uniform(new THREE.Color()),
    uSunDir: uniform(new THREE.Vector3(0, 1, 0)), uSunColor: uniform(new THREE.Color()), uCloudTint: uniform(new THREE.Color(1, 1, 1)),
    uClouds: uniform(1), uStars: uniform(0),
  };
  const shade = Fn(() => {
    const d = normalize(positionLocal), h = d.y;
    const c = mix(u.uHorizon, u.uTop, pow(clamp(h, 0, 1), 0.55)).toVar();
    c.assign(mix(c, u.uGround, float(1).sub(smoothstep(-0.2, 0.0, h))));
    const sd = max(dot(d, u.uSunDir), 0);
    c.addAssign(u.uSunColor.mul(smoothstep(0.9993, 0.9997, sd).mul(6).add(pow(sd, 10).mul(0.28)).add(pow(sd, 3).mul(0.06))));
    // clouds (above the horizon only)
    const up = step(0.0, h).mul(step(0.0001, u.uClouds));
    const uv = d.xz.div(h.add(0.18)).mul(1.1).add(vec2(time.mul(0.006), time.mul(0.002)));
    const n = fbm(uv.mul(1.4));
    const edge = float(0.62).sub(u.uClouds.mul(0.14));
    const m = smoothstep(edge, edge.add(0.08), n);
    const lit = smoothstep(0.35, 0.85, fbm(uv.mul(1.4).sub(u.uSunDir.xz.mul(0.12))));
    const cc = mix(mix(u.uHorizon, vec3(1), 0.75), vec3(1), lit).mul(u.uCloudTint).add(u.uSunColor.mul(pow(sd, 6)).mul(0.5));
    c.assign(mix(c, cc, m.mul(smoothstep(0.0, 0.18, h)).mul(min(u.uClouds.mul(1.2), 1)).mul(up)));
    // stars
    const sp = floor(d.xz.div(abs(h).add(0.6)).mul(260));
    const s = step(0.9965, hash2(sp)).mul(hash2(sp.add(3.1)).mul(0.5).add(0.5));
    c.addAssign(vec3(s).mul(u.uStars).mul(smoothstep(0.05, 0.35, h)));
    return c;
  });
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  mat.colorNode = shade();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  sky.frustumCulled = false; sky.renderOrder = -1;
  return { sky, u };
}

// ---- colour grade (port of GradeEffect: works in display sRGB after tone mapping)
function gradeNode(colorIn, g) {
  return Fn(() => {
    const c = clamp(colorIn, 0, 1).toVar();
    const l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    const sat = max(max(c.r, c.g), c.b).sub(min(min(c.r, c.g), c.b));
    c.assign(mix(vec3(l), c, g.uSat.add(float(1).sub(sat).mul(0.15))));
    c.assign(c.sub(0.5).mul(g.uContrast).add(0.5));
    c.assign(clamp(c, 0, 1));
    c.assign(mix(c, c.mul(c).mul(float(3).sub(c.mul(2))), 0.22));
    c.addAssign(vec3(g.uWarm, g.uWarm.mul(0.4), g.uWarm.mul(-0.6)).mul(smoothstep(0.2, 0.8, l)));
    c.addAssign(g.uLift.mul(float(1).sub(smoothstep(0.0, 0.45, l))));
    const q = screenUV.sub(0.5);
    c.mulAssign(float(1).sub(g.uVignette.mul(dot(q, q)).mul(2.2)));
    return clamp(c, 0, 1);
  })();
}

export class Look {
  constructor(renderer, scene, camera, { low = false, ao: aoOn = true, gi = true } = {}) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.low = low;
    renderer.toneMapping = THREE.NoToneMapping;   // tone mapping happens in the post chain
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.fog = new THREE.FogExp2(0xb9dcf5, 0.0014);

    const { sky, u } = makeSky();
    this.sky = sky; this.skyU = u; scene.add(sky);
    this.skyMat = { uniforms: Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v])) };   // WebGL-style handle (uniforms.uX.value)

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const S = low ? 1024 : 2048;
    this.sun.shadow.mapSize.set(S, S);
    Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 400 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2.5; if ('intensity' in this.sun.shadow) this.sun.shadow.intensity = 0.85;
    this.rim = new THREE.DirectionalLight(0xffffff, 0.6);
    scene.add(this.hemi, this.sun, this.sun.target, this.rim, this.rim.target);
    this.sunDir = new THREE.Vector3();

    this.giEnabled = false;   // not on WebGPU yet (see header)
    this.probe = new THREE.LightProbe(); this.probe.intensity = 0;   // kept for the shared interface, not added to the scene

    this.passes = {}; this.fx = {};
    this.emissives = []; this.screens = []; this.lamps = [];
    // GTAO is off on this build: r170's AO node samples the depth texture with a filtering sampler (strict WebGPU
    // validation rejects it) and its normal MRT breaks materials without a normal output. Fixed in later three.js.
    this.aoEnabled = false; void aoOn;
    this.g = { uSat: uniform(1.14), uContrast: uniform(1.06), uVignette: uniform(0.1), uWarm: uniform(0.025), uLift: uniform(new THREE.Vector3(0.03, 0.028, 0.026)) };
    this.uExposure = uniform(1);
  }

  /** the post chain; returns the composer-shaped object main.js drives: render(dt), setSize(w, h) */
  buildPipeline({ high = false } = {}) {
    const { renderer, scene, camera } = this;
    this.high = high;
    const post = new THREE.PostProcessing(renderer);
    post.outputColorTransform = false;   // the chain ends in display sRGB itself (grade works there)
    const scenePass = pass(scene, camera);
    let col = scenePass.getTextureNode('output');
    const safe = min(col.rgb, vec3(64));   // NaN/Inf-ish guard before bloom
    const b = this.passes.bloom = bloom(vec4(safe, 1), 0.4, 0.6, 1.0);
    const hdr = safe.add(b.rgb);
    const tone = neutralToneMapping(hdr, this.uExposure);
    const display = sRGBTransferOETF(clamp(tone, 0, 1));
    let out = vec4(gradeNode(display, this.g), 1);
    out = fxaa(out);   // edge anti-aliasing on every tier (the scene pass is not multisampled)
    post.outputNode = out;
    this.post = post;
    this.passes.grade = { uniforms: this.g };
    this.fx.exposure = { uniforms: new Map([['uExposure', this.uExposure]]) };
    return { render: () => post.render(), setSize: () => {}, passes: [] };
  }

  collect(world) {
    this.scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      for (const m of [].concat(o.material)) {
        if (m.isMeshStandardMaterial && m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b > 0 || m.emissiveMap) && m.userData.baseEmissive === undefined) {
          m.userData.baseEmissive = m.emissiveIntensity;
          m.userData.facade = /^(H_)?(fac_|curtain|deco|shopfront|storefront)/.test(m.name);
          this.emissives.push(m);
        }
      }
    });
    for (const o of [...world.billboards, ...world.tickers]) this.screens.push(o.material);
    this.lamps = world.lights || [];
  }

  apply(name) {
    const p = PRESETS[name] || PRESETS.day;
    this.preset = name;
    const C = (h) => new THREE.Color(h), u = this.skyU;
    u.uTop.value.copy(C(p.top)); u.uHorizon.value.copy(C(p.horizon)); u.uGround.value.copy(C(p.ground));
    u.uSunColor.value.copy(C(p.sun)); u.uCloudTint.value.copy(C(p.cloudTint || '#ffffff')); u.uClouds.value = p.clouds; u.uStars.value = p.stars;
    const el = THREE.MathUtils.degToRad(p.sunElev), az = THREE.MathUtils.degToRad(p.sunAz);
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    u.uSunDir.value.copy(this.sunDir);
    this.sun.color.copy(C(p.sun)); this.sun.intensity = p.sunI;
    this.rim.color.copy(C(p.rim)); this.rim.intensity = p.rimI;
    this.hemi.color.copy(C(p.hemiSky)); this.hemi.groundColor.copy(C(p.hemiGround)); this.hemi.intensity = p.hemiI;
    surfaceUniforms.uSurfWet.value = p.wet ?? 0;
    surfaceUniforms.uSurfAmt.value = this.surfOff ? 0 : (p.surf ?? 1);
    surfaceUniforms.uStylize.value = p.stylize ?? 0;
    const ch = p.char || [0.12, 0.12, '#fff6ea', '#ffffff'];
    charUniforms.uCharFill.value = ch[0]; charUniforms.uCharRim.value = ch[1];
    charUniforms.uCharFillCol.value.set(ch[2]); charUniforms.uCharRimCol.value.set(ch[3]);
    if (this.aoMix) { this._aoK = 0.35 + 0.45 * (p.ao ?? 0.85); this.aoMix.value = this._aoK; }
    if (p.lift) this.g.uLift.value.set(...p.lift);
    this.scene.environmentIntensity = p.env;
    this.scene.fog.color.copy(C(p.fog)); this.scene.fog.density = p.fogD;
    this.uExposure.value = p.exposure; this.exposure = p.exposure;
    for (const m of this.emissives) m.emissiveIntensity = m.userData.baseEmissive * (m.userData.facade ? p.facade : p.emissive);
    for (const m of this.screens) if (m && m.color) m.color.setScalar(p.screens);
    for (const l of this.lamps) { if (l.userData.base === undefined) l.userData.base = l.intensity; l.intensity = l.userData.base * p.lamps; l.visible = p.lamps > 0; }
    if (this.passes.bloom) {   // presets keep [strength, radius, threshold] (tuned for the WebGL mipmap bloom)
      const [st, rad, th] = p.bloom, b = this.passes.bloom;
      b.strength.value = this._noBloom ? 0 : st * 1.6 * (this.low ? 0.7 : 1);
      b.radius.value = THREE.MathUtils.clamp(rad + 0.2, 0.4, 0.9);
      b.threshold.value = th + 0.1;
    }
    const g = this.g; g.uSat.value = p.sat; g.uContrast.value = p.contrast; g.uVignette.value = p.vignette; g.uWarm.value = p.warm;
  }

  shrinkShadows(size = 1024) {
    const l = this.sun; if (!l.shadow || l.shadow.mapSize.x <= size) return;
    l.shadow.mapSize.set(size, size); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
  }
  setupShadows() {}            // no cascades on this build yet
  captureGI() {}               // see header
  update(t, focus) {
    this.sky.position.copy(this.camera.position);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 160);
    this.rim.target.position.copy(focus);
    this.rim.position.copy(focus).add(new THREE.Vector3(-this.sunDir.x * 50, 30, -this.sunDir.z * 50));
  }
  shedBloom() { if (this.passes.bloom) { this.passes.bloom.strength.value = 0; this._noBloom = true; } }
  setSize() {}
}
