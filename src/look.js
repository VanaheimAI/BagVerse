// Stylised "battle-royale" look: bright saturated sky with puffy clouds, strong warm sun with crisp
// shadows, soft ambient occlusion, gentle bloom that only catches true emissives, and a colour grade.
// Three presets (day / sunset / night) re-balance the same scene; neon is an accent, not a floodlight.
import * as THREE from 'three';
import { surfaceUniforms, charUniforms } from './surface.js';
import { paintUniforms } from './paint.js';
// post-processing: pmndrs/postprocessing (the engine behind react-postprocessing) + N8AO
import { RenderPass, EffectPass, Effect, EffectAttribute, BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode,
  ChromaticAberrationEffect, NoiseEffect, SMAAEffect, SMAAPreset } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSM } from 'three/addons/csm/CSM.js';

import { PRESETS, ORDER } from './presets.js';
export { PRESETS, ORDER };

const SKY_VS = `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FS = `
uniform vec3 uTop, uHorizon, uGround, uSunDir, uSunColor, uCloudTint; uniform float uClouds, uStars, uTime;
varying vec3 vD;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+1.0), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p = p*2.03 + 17.1; a *= 0.5; } return v; }
void main(){
  vec3 d = normalize(vD); float h = d.y;
  vec3 c = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
  c = mix(c, uGround, smoothstep(0.0, -0.2, h));
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunColor * (smoothstep(0.9993, 0.9997, sd) * 6.0 + pow(sd, 10.0) * 0.28 + pow(sd, 3.0) * 0.06);
  if (h > 0.0 && uClouds > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.1 + vec2(uTime * 0.006, uTime * 0.002);
    float n = fbm(uv * 1.4);
    float edge = 0.62 - 0.14 * uClouds;
    float m = smoothstep(edge, edge + 0.08, n);                         // crisp stylised cloud edges
    float lit = smoothstep(0.35, 0.85, fbm(uv * 1.4 - uSunDir.xz * 0.12));
    vec3 cc = mix(mix(uHorizon, vec3(1.0), 0.75), vec3(1.0), lit);      // soft blue shadow side
    cc = cc * uCloudTint + uSunColor * pow(sd, 6.0) * 0.5;
    c = mix(c, cc, m * smoothstep(0.0, 0.18, h) * min(uClouds * 1.2, 1.0));
  }
  if (uStars > 0.0) {
    vec2 sp = floor(d.xz / (abs(h) + 0.6) * 260.0);
    float s = step(0.9965, hash(sp)) * (0.5 + 0.5 * hash(sp + 3.1));
    c += vec3(s) * uStars * smoothstep(0.05, 0.35, h);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

// ---- custom effects (pmndrs Effect API: merged into one fullscreen shader with bloom + tone mapping)
// colour grade, in display (sRGB) space after tone mapping: vibrance, contrast, gentle S-curve, warm highlights,
// lifted shadows, vignette. (Tuned on the old sRGB-space ShaderPass, so it converts in and out.)
class GradeEffect extends Effect {
  constructor() {
    super('Grade', `uniform float uSat, uContrast, uVignette, uWarm; uniform vec3 uLift;
      vec3 toS(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      vec3 toL(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = toS(clamp(inputColor.rgb, 0.0, 1.0));
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
        c = mix(vec3(l), c, uSat + (1.0 - sat) * 0.15);
        c = (c - 0.5) * uContrast + 0.5;
        c = clamp(c, 0.0, 1.0);
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
        c += vec3(uWarm, uWarm * 0.4, -uWarm * 0.6) * smoothstep(0.2, 0.8, l);
        c += uLift * (1.0 - smoothstep(0.0, 0.45, l));
        vec2 q = uv - 0.5; c *= 1.0 - uVignette * dot(q, q) * 2.2;
        outputColor = vec4(toL(clamp(c, 0.0, 1.0)), inputColor.a);
      }`, { uniforms: new Map([['uSat', new THREE.Uniform(1.2)], ['uContrast', new THREE.Uniform(1.06)], ['uVignette', new THREE.Uniform(0.2)],
      ['uWarm', new THREE.Uniform(0.02)], ['uLift', new THREE.Uniform(new THREE.Vector3(0.03, 0.045, 0.09))]]) });
  }
}
// scene-referred exposure, applied before tone mapping (the renderer's own tone mapping is off with this composer)
class ExposureEffect extends Effect {
  constructor() {
    super('Exposure', `uniform float uExposure;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) { outputColor = vec4(inputColor.rgb * uExposure, inputColor.a); }`,
    { uniforms: new Map([['uExposure', new THREE.Uniform(1)]]) });
  }
}
// NaN/Inf guard: one bad pixel (any material, any driver) would otherwise be smeared over the frame by bloom
class SanitizeEffect extends Effect {
  constructor() {
    super('Sanitize', `void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
      vec4 c = inputColor; if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); outputColor = min(c, vec4(64.0)); }`);
  }
}
// contrast-adaptive sharpen (cross kernel), clamped against halos: crisper edges + texture detail after AA
class SharpenEffect extends Effect {
  constructor(amount = 0.35) {
    super('Sharpen', `uniform float uSharpen;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        vec3 n = texture2D(inputBuffer, uv + vec2(0.0, texelSize.y)).rgb, s = texture2D(inputBuffer, uv - vec2(0.0, texelSize.y)).rgb;
        vec3 e = texture2D(inputBuffer, uv + vec2(texelSize.x, 0.0)).rgb, w = texture2D(inputBuffer, uv - vec2(texelSize.x, 0.0)).rgb;
        vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
        float amp = clamp(min(min(mn.g, 1.0 - mx.g) / max(mx.g, 1e-3), 1.0), 0.0, 1.0);
        outputColor = vec4(clamp(c + (c * 4.0 - (n + s + e + w)) * 0.25 * uSharpen * sqrt(amp), mn * 0.9, mx * 1.1), inputColor.a);
      }`, { attributes: EffectAttribute.CONVOLUTION, uniforms: new Map([['uSharpen', new THREE.Uniform(amount)]]) });
  }
}


// synchronous cube -> SH3 projection (three's LightProbeGenerator uses async PBO readback, which some
// drivers reject for half-float targets; this reads each face directly and never stalls more than one frame)
const _shBasis = new Array(9).fill(0), _c = new THREE.Vector3(), _col = new THREE.Color();
function projectSH(renderer, rt, sh) {
  const w = rt.width, data = new Uint16Array(w * w * 4), px = 2 / w, flip = -1;
  const half = THREE.DataUtils.fromHalfFloat;
  sh.zero(); let total = 0; const co = sh.coefficients;
  for (let f = 0; f < 6; f++) {
    renderer.readRenderTargetPixels(rt, 0, 0, w, w, data, f);
    for (let i = 0, n = w * w; i < n; i += 3) {           // a third of the pixels is plenty for 9 coefficients
      const k = i * 4;
      _col.setRGB(half(data[k]), half(data[k + 1]), half(data[k + 2]));
      const col = (1 - ((i % w) + 0.5) * px) * flip, row = 1 - (Math.floor(i / w) + 0.5) * px;
      switch (f) {
        case 0: _c.set(-1 * flip, row, col * flip); break;
        case 1: _c.set(1 * flip, row, -col * flip); break;
        case 2: _c.set(col, 1, -row); break;
        case 3: _c.set(col, -1, row); break;
        case 4: _c.set(col, row, 1); break;
        default: _c.set(-col, row, -1);
      }
      const l2 = _c.lengthSq(), wt = 4 / (Math.sqrt(l2) * l2); total += wt;
      THREE.SphericalHarmonics3.getBasisAt(_c.normalize(), _shBasis);
      for (let j = 0; j < 9; j++) { co[j].x += _shBasis[j] * _col.r * wt; co[j].y += _shBasis[j] * _col.g * wt; co[j].z += _shBasis[j] * _col.b * wt; }
    }
  }
  const norm = (4 * Math.PI) / total;
  for (let j = 0; j < 9; j++) co[j].multiplyScalar(norm);
  return sh;
}

const _snapM = new THREE.Matrix4(), _snapInv = new THREE.Matrix4(), _snapV = new THREE.Vector3(), _zero = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Look {
  constructor(renderer, scene, camera, { low = false, ao = true, csm = true, gi = true, smaa = false } = {}) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.low = low; this.smaa = smaa;
    renderer.toneMapping = THREE.NoToneMapping;   // tone mapping happens in the post stack (ToneMappingEffect, Neutral)
    renderer.shadowMap.enabled = true;   // every tier gets sun shadows (LOW: one 1024 map)
    renderer.shadowMap.type = low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;   // LOW: plain PCF (fewer taps per pixel on phones)

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem = pmrem;
    this.roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.roomEnv;
    scene.fog = new THREE.FogExp2(0xb9dcf5, 0.0014);

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uCloudTint: { value: new THREE.Color(1, 1, 1) }, uClouds: { value: 1 }, uStars: { value: 0 }, uTime: { value: 0 } },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), this.skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -1;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
    Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 400 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2.5; this.sun.shadow.intensity = 0.85;
    this.rim = new THREE.DirectionalLight(0xffffff, 0.6);   // cool back/rim light for character pop
    scene.add(this.hemi, this.sun, this.sun.target, this.rim, this.rim.target);
    this.sunDir = new THREE.Vector3();

    // cascaded shadow maps: crisp shadows near the player AND building shadows out to ~260 m
    if (csm && !low) {
      this.csm = new CSM({ maxFar: 260, cascades: 3, mode: 'practical', parent: scene, shadowMapSize: 2048,
        lightDirection: new THREE.Vector3(-1, -1, -1).normalize(), camera, lightIntensity: 3, lightMargin: 160 });
      this.csm.fade = true;
      for (const l of this.csm.lights) { l.shadow.bias = -0.0003; l.shadow.normalBias = 0.04; l.shadow.intensity = 0.85; }   // stylised: shadows lifted, never pitch black
      this.sun.castShadow = false; this.sun.visible = false;
    }
    // image-based GI: a light probe + reflection cubemap captured from the actual scene
    this.giEnabled = gi;
    this.probe = new THREE.LightProbe(); this.probe.intensity = 0;
    scene.add(this.probe);

    // post stack: render -> AO -> bloom -> output (tonemap + sRGB) -> grade
    this.passes = {};
    this.fx = {};
    this.emissives = [];
    this.screens = [];
    this.lamps = [];
    this.aoEnabled = ao && !low;
  }

  /**
   * post stack (pmndrs/postprocessing):
   *   Render -> N8AO (HIGH/MEDIUM) -> sanitize -> [bloom (mipmap blur) + exposure + tone mapping (Neutral) + grade
   *   + chromatic aberration (HIGH) + film grain] -> SMAA (LOW / WebGL1) -> sharpen (dithered output)
   * HIGH/MEDIUM anti-alias with the composer's 4x MSAA render target (see main.js).
   */
  buildComposer(composer, { high = false } = {}) {
    const { renderer, scene, camera } = this;
    const w = innerWidth, h = innerHeight;
    this.high = high;
    composer.addPass(new RenderPass(scene, camera));
    if (this.aoEnabled) {
      const ao = new N8AOPostPass(scene, camera, w, h);
      ao.setQualityMode(high ? 'Medium' : 'Low');
      // full resolution on every tier: half-res AO (MEDIUM used it) upscales into blocky patches and soft dark
      // halos offset from thin objects that trail as the camera moves ("ghost shadows"); 'Low' mode keeps MEDIUM cheap
      Object.assign(ao.configuration, { aoRadius: 2.2, distanceFalloff: 1.0, intensity: 2.2, halfRes: false, depthAwareUpsampling: true,
        transparencyAware: false, gammaCorrection: false, color: new THREE.Color(0x0a0c14) });
      composer.addPass(ao); this.passes.ao = ao;
    }
    composer.addPass(new EffectPass(camera, new SanitizeEffect()));
    const bloom = this.passes.bloom = new BloomEffect({ mipmapBlur: true, intensity: 0.6, luminanceThreshold: 1.0, luminanceSmoothing: 0.25, radius: 0.7, levels: this.low ? 6 : 8 });
    const exposure = this.fx.exposure = new ExposureEffect();
    const tone = this.fx.tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    const grade = this.fx.grade = new GradeEffect();
    const list = [bloom, exposure, tone, grade];
    if (high) {   // lens fringing toward the frame edges only (very subtle)
      const ca = this.fx.ca = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0006, 0.0006), radialModulation: true, modulationOffset: 0.35 });
      list.push(ca);
    }
    const grain = this.fx.grain = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN });
    grain.blendMode.opacity.value = 0.025;
    list.push(grain);
    this.passes.main = new EffectPass(camera, ...list); composer.addPass(this.passes.main);
    if (this.smaa) { this.passes.smaa = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })); composer.addPass(this.passes.smaa); }
    if (!this.low) {
      this.passes.sharpen = new EffectPass(camera, (this.fx.sharpen = new SharpenEffect(0.55)));
      composer.addPass(this.passes.sharpen);
    }
    const last = composer.passes[composer.passes.length - 1]; last.dithering = true;
    // legacy handle: apply() sets grade values through passes.grade.uniforms.<name>.value
    this.passes.grade = { uniforms: Object.fromEntries(grade.uniforms) };
    this.setSize(w, h);
  }

  /** remember base emissive / screen intensities so presets can rescale them */
  collect(world) {
    this.scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.isMeshStandardMaterial && m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b > 0 || m.emissiveMap)) {
          if (m.userData.baseEmissive === undefined) {
            m.userData.baseEmissive = m.emissiveIntensity;
            // lit office windows / shop interiors only switch on as the light fades
            m.userData.facade = /^(H_)?(fac_|curtain|deco|shopfront|storefront)/.test(m.name);
            this.emissives.push(m);
          }
        }
      }
    });
    for (const o of [...world.billboards, ...world.tickers]) this.screens.push(o.material);
    this.lamps = world.lights || [];
  }

  apply(name) {
    const p = PRESETS[name] || PRESETS.day;
    this.preset = name;
    const C = (h) => new THREE.Color(h);
    const u = this.skyMat.uniforms;
    u.uTop.value.copy(C(p.top)); u.uHorizon.value.copy(C(p.horizon)); u.uGround.value.copy(C(p.ground));
    u.uSunColor.value.copy(C(p.sun)); u.uCloudTint.value.copy(C(p.cloudTint || '#ffffff')); u.uClouds.value = p.clouds; u.uStars.value = p.stars;
    const el = THREE.MathUtils.degToRad(p.sunElev), az = THREE.MathUtils.degToRad(p.sunAz);
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    u.uSunDir.value.copy(this.sunDir);
    this.sun.color.copy(C(p.sun)); this.sun.intensity = p.sunI;
    this.rim.color.copy(C(p.rim)); this.rim.intensity = p.rimI;
    this.hemi.color.copy(C(p.hemiSky)); this.hemi.groundColor.copy(C(p.hemiGround));
    const gi = this.giReady && !p.noGI;   // presets can opt out of the captured GI (day: neutral studio light)
    this.hemi.intensity = p.hemiI * (gi ? 0.55 : 1);     // the probe supplies the rest as coloured bounce light
    this.probe.intensity = gi ? p.gi : 0;
    if (this._giEnv) this.scene.environment = gi ? this._giEnv : this.roomEnv;
    if (this._shRaw) {   // desaturate the bounce light toward its luminance (the plaza's cyan floor neon was tinting everything)
      const k = p.giChroma ?? 1;
      this._shRaw.coefficients.forEach((c, i) => {
        const l = c.x * 0.2126 + c.y * 0.7152 + c.z * 0.0722;
        this.probe.sh.coefficients[i].set(l + (c.x - l) * k, l + (c.y - l) * k, l + (c.z - l) * k);
      });
    }
    surfaceUniforms.uSurfWet.value = p.wet ?? 0;
    surfaceUniforms.uSurfAmt.value = this.surfOff ? 0 : (p.surf ?? 1);
    surfaceUniforms.uStylize.value = p.stylize ?? 0;
    // hero lighting on characters: [fill, rim, fill colour, rim colour]
    const ch = p.char || [0.12, 0.12, '#fff6ea', '#ffffff'];
    charUniforms.uCharFill.value = ch[0]; charUniforms.uCharRim.value = ch[1];
    charUniforms.uCharFillCol.value.set(ch[2]); charUniforms.uCharRimCol.value.set(ch[3]);
    if (this.passes.ao) this.passes.ao.configuration.intensity = 1.2 + 2.2 * (p.ao ?? 0.85);
    if (this.passes.grade && p.lift) this.passes.grade.uniforms.uLift.value.set(...p.lift);
    if (this.csm) {
      this.csm.lightDirection.copy(this.sunDir).negate();
      for (const l of this.csm.lights) { l.color.copy(C(p.sun)); l.intensity = p.sunI; }
    }
    this.scene.environmentIntensity = gi ? p.giEnv : p.env;   // the captured env is the real scene, so it can be stronger
    this.scene.fog.color.copy(C(p.fog)); this.scene.fog.density = p.fogD;
    this.renderer.toneMappingExposure = 1;   // exposure is applied in the post stack
    if (this.fx.exposure) this.fx.exposure.uniforms.get('uExposure').value = p.exposure;
    this.exposure = p.exposure;
    for (const m of this.emissives) m.emissiveIntensity = m.userData.baseEmissive * (m.userData.facade ? p.facade : p.emissive);
    for (const m of this.screens) if (m && m.color) m.color.setScalar(p.screens);
    for (const l of this.lamps) { if (l.userData.base === undefined) l.userData.base = l.intensity; l.intensity = l.userData.base * p.lamps; l.visible = p.lamps > 0; }
    if (this.passes.bloom) {   // presets keep the old [strength, radius, threshold]; mipmap bloom wants ~3x the intensity
      const [st, rad, th] = p.bloom, b = this.passes.bloom;
      b.intensity = this._noBloom ? 0 : st * 2.0 * (this.low ? 0.7 : 1);
      b.mipmapBlurPass.radius = THREE.MathUtils.clamp(rad + 0.2, 0.4, 0.9);
      b.luminanceMaterial.threshold = th + 0.1; b.luminanceMaterial.smoothing = 0.3;
    }
    if (this.fx.grain) this.fx.grain.blendMode.opacity.value = p.grain ?? (p.label === 'NIGHT' ? 0.045 : 0.02);
    const g = this.passes.grade.uniforms;
    g.uSat.value = p.sat; g.uContrast.value = p.contrast; g.uVignette.value = p.vignette; g.uWarm.value = p.warm;
  }

  /** lower shadow-map resolution at runtime (slow-device fallback); maps are re-created at the new size on the next frame */
  shrinkShadows(size = 1024) {
    const lights = this.csm ? this.csm.lights : this.sun ? [this.sun] : [];
    for (const l of lights) {
      if (!l.shadow || l.shadow.mapSize.x <= size) continue;
      l.shadow.mapSize.set(size, size);
      if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
    }
    this.renderer.shadowMap.autoUpdate = true; this.renderer.shadowMap.needsUpdate = true;
  }

  /** patch materials so they receive cascaded shadows (call for anything added after load) */
  setupShadows(root) {
    if (!this.csm) return;
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if ((m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial) && !m.userData.csm) {
          const prev = m.onBeforeCompile; this.csm.setupMaterial(m); const csmFn = m.onBeforeCompile;
          m.onBeforeCompile = function (sh, r) { prev.call(this, sh, r); csmFn.call(this, sh, r); };   // keep the surface layer
          m.userData.csm = true; m.needsUpdate = true;
        }
      }
    });
  }

  /** capture the lit scene into a cubemap -> PMREM reflections + spherical-harmonics light probe */
  captureGI(at = new THREE.Vector3(0, 7, 8)) {
    if (!this.giEnabled) return;
    const rt = this._giRT || (this._giRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false }));
    const cam = this._giCam || (this._giCam = new THREE.CubeCamera(0.5, 1000, rt));
    cam.position.copy(at);
    const probeI = this.probe.intensity; this.probe.intensity = 0;   // no feedback from the old probe
    const skyPos = this.sky.position.clone(); this.sky.position.copy(at);
    const hidden = [];
    this.scene.traverse((o) => { if (o.userData.noGI && o.visible) { o.visible = false; hidden.push(o); } });
    // the painted layer is a look, not light: keep it out of the captured bounce/reflections (it would brighten everything)
    const pv = Object.fromEntries(Object.entries(paintUniforms).map(([k, u]) => [k, u.value]));
    for (const u of Object.values(paintUniforms)) u.value = 0;
    const ac = this.renderer.autoClear; this.renderer.autoClear = true;   // the pmndrs composer turns autoClear off; cube faces must clear
    cam.update(this.renderer, this.scene);
    this.renderer.autoClear = ac;
    for (const [k, v] of Object.entries(pv)) paintUniforms[k].value = v;
    hidden.forEach((o) => (o.visible = true));
    this.sky.position.copy(skyPos); this.probe.intensity = probeI;
    projectSH(this.renderer, rt, this.probe.sh);
    this._shRaw = this.probe.sh.clone();          // keep the full-colour capture; apply() sets how much colour is used
    const env = this.pmrem.fromCubemap(rt.texture).texture;
    if (this._giEnv) this._giEnv.dispose();
    this._giEnv = env; this.scene.environment = env;
    this.giReady = true;
  }

  update(t, focus) {
    this.skyMat.uniforms.uTime.value = t;
    if (this.csm) this.csm.update();
    this.sky.position.copy(this.camera.position);
    // shadow frustum + lights follow the player, snapped to whole shadow-map texels: a frustum that slides by
    // fractions of a texel makes every shadow edge crawl and flicker as you walk
    const sc = this.sun.shadow.camera, texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
    _snapM.lookAt(_zero, this.sunDir, _up);  // light-space basis (columns: right, up, toward the sun)
    _snapV.copy(focus).applyMatrix4(_snapInv.copy(_snapM).invert());
    _snapV.x = Math.round(_snapV.x / texel) * texel; _snapV.y = Math.round(_snapV.y / texel) * texel;
    _snapV.applyMatrix4(_snapM);
    this.sun.target.position.copy(_snapV);
    this.sun.position.copy(_snapV).addScaledVector(this.sunDir, 160);
    this.rim.target.position.copy(focus);
    this.rim.position.copy(focus).add(new THREE.Vector3(-this.sunDir.x * 50, 30, -this.sunDir.z * 50));
  }

  /** slow-device fallback: drop bloom (an effect inside the merged pass, so it's zeroed, not disabled) */
  shedBloom() {
    const b = this.passes.bloom; if (!b) return;
    b.intensity = 0; b.mipmapBlurPass.enabled = false; this._noBloom = true;
  }

  setSize(w, h) {
    if (this.passes.ao) this.passes.ao.setSize(w, h);
  }
}
