// Third-person player: capsule physics, camera-relative movement, animation state machine.
import * as THREE from 'three';
import { applyCharLight } from './surface.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { nameplate, bubble } from './creatives.js';

export const CHAR_HEIGHT = 1.85;

/** builds an animated character instance from the loaded GLB */
export function makeCharacter(gltf, { tint = null, shadow = true } = {}) {
  const model = skClone(gltf.scene);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const s = CHAR_HEIGHT / (box.max.y - box.min.y);
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = shadow; o.frustumCulled = false;
      o.material = o.material.clone();
      if (tint) o.material.color.multiply(tint);
      // AI-generated character textures come with near-mirror metal/roughness: tame to a satin, painted-figure finish
      const m = o.material;
      if (m.isMeshStandardMaterial) {
        m.metalnessMap = null; m.metalness = Math.min(m.metalness, 0.25);
        m.roughnessMap = null; m.roughness = Math.max(m.roughness, 0.62);
        m.envMapIntensity = 0.55;
        applyCharLight(m);
        m.needsUpdate = true;
      }
    }
  });
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    if (clip.name === 'Jump') { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
    actions[clip.name] = a;
  }
  const addClip = (clip) => { if (!actions[clip.name]) actions[clip.name] = mixer.clipAction(clip); };
  const anim = { current: null };
  const play = (name, fade = 0.2, speed = 1) => {
    const next = actions[name] || actions.Idle;
    if (!next) return;
    next.timeScale = speed;
    if (anim.current === next) return;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (anim.current) anim.current.fadeOut(fade);
    anim.current = next;
  };
  play('Idle', 0);
  return { root, model, mixer, actions, play, anim, addClip, charId: gltf.userData.charId };
}

// ---- long emotes (e.g. the 1:50 Thriller) live in their own animation-only GLBs, one per character
// (assets/<charId>_<clip>.glb, built by blender/build_emote.py) and are fetched the first time they're used.
export const LAZY_EMOTES = new Set(['Thriller', 'Ride']);   // Ride: the scooter loop (blender/build_emote.py, DRIFT=linear)
let emoteLoader = null;
const clipCache = new Map();
export function setEmoteLoader(fn) { emoteLoader = fn; }
/** true when the clip is ready on this character; otherwise starts loading it (and returns false) */
export function ensureClip(c, name) {
  if (c.actions[name]) return true;
  if (!LAZY_EMOTES.has(name) || !emoteLoader || !c.charId) return false;
  const key = c.charId + '/' + name;
  if (!clipCache.has(key)) {
    clipCache.set(key, emoteLoader(`assets/${c.charId}_${name.toLowerCase()}.glb`).then((g) => {
      const clip = g.animations.find((a) => a.name === name) || g.animations[0];
      clip.name = name;
      // rotations drive the dance; only the hips keep translation (bounce/sway). Drops ~2/3 of the tracks.
      clip.tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || /Hips\.position$/.test(t.name));
      return clip;
    }).catch((e) => { console.warn('emote load failed', name, e); clipCache.delete(key); return null; }));
  }
  clipCache.get(key).then((clip) => { if (clip) c.addClip(clip); });
  return false;
}

export function addNameplate(root, tag, name, level, color) {
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameplate(tag, name, level, color), depthWrite: false, toneMapped: false }));
  spr.scale.set(1.9, 0.475, 1);
  spr.position.y = CHAR_HEIGHT + 0.45;
  spr.renderOrder = 10;
  root.add(spr);
  return spr;
}

export function say(root, text, holder) {
  if (holder.bubble) { root.remove(holder.bubble); holder.bubble.material.map.dispose(); }
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubble(text), depthWrite: false, toneMapped: false }));
  spr.scale.set(2.2, 0.55, 1); spr.position.y = CHAR_HEIGHT + 1.05; spr.renderOrder = 11;
  root.add(spr); holder.bubble = spr; holder.bubbleT = 4.5;
}

export class Player {
  constructor(gltf, physics, spawn, profile) {
    this.physics = physics;
    this.c = makeCharacter(gltf);
    this.root = this.c.root;
    this.body = { pos: spawn.clone(), vel: new THREE.Vector3(), onGround: false, radius: 0.38, height: CHAR_HEIGHT };
    this.root.position.copy(spawn);
    this.facing = Math.PI;      // model faces +Z; PI = facing -Z (north, toward the vault)
    this.emote = null;
    this.jumpT = 0;
    this.airT = 0;
    this.speed = 0;
    this.plate = addNameplate(this.root, profile.tag, profile.name, profile.level, '#7cff3d');
    this.lastSafe = spawn.clone();
  }

  /** swap the visible character (skin) while keeping physics, plate and facing */
  setModel(gltf) {
    const old = this.c;
    const c = makeCharacter(gltf);
    old.root.remove(old.model);
    old.mixer.stopAllAction();
    c.root.remove(c.model);
    old.root.add(c.model);
    this.c = { ...c, root: old.root };
  }

  refreshPlate(profile) {
    this.root.remove(this.plate);
    this.plate = addNameplate(this.root, profile.tag, profile.name, profile.level, '#7cff3d');
  }

  teleport(p) { this.body.pos.copy(p); this.body.vel.set(0, 0, 0); this.root.position.copy(p); }

  update(dt, input, camYaw) {
    const mv = input.move();
    const walking = input.down('ShiftLeft', 'ShiftRight');
    const maxSpeed = walking ? 2.0 : 7.0;
    const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const wish = fwd.multiplyScalar(mv.y).addScaledVector(right, mv.x);
    const moving = wish.lengthSq() > 0.0004;

    if (moving) this.emote = null;
    // emotes unlock with level (progression REWARDS); `allow` is set by the game, true when unset
    for (const [k, name] of [['Digit1', 'Thriller'], ['Digit2', 'Dance']]) if (input.hit(k) && (!this.allow || this.allow(name))) this.emote = name;

    // horizontal velocity with acceleration (less control in the air)
    const target = wish.clone().setLength(moving ? maxSpeed * Math.max(mv.mag, 0.35) : 0);
    const accel = this.body.onGround ? 14 : 4;
    const hv = new THREE.Vector3(this.body.vel.x, 0, this.body.vel.z);
    hv.lerp(target, 1 - Math.exp(-accel * dt));
    this.body.vel.x = hv.x; this.body.vel.z = hv.z;

    if (input.hit('Space') && (this.body.onGround || this.airT < 0.12)) {
      this.body.vel.y = 10.5; this.body.onGround = false; this.jumpT = 0.45; this.emote = null; this.airT = 1;
      this.jumped = true; this.c.actions.Jump?.reset();
    }

    // physics in sub-steps
    const steps = 4;
    for (let i = 0; i < steps; i++) this.physics.step(this.body, dt / steps);
    if (this.body.onGround) { this.airT = 0; this.jumped = false; this.lastSafe.copy(this.body.pos); } else this.airT += dt;
    if (this.body.pos.y < -30) this.teleport(this.lastSafe.clone().add(new THREE.Vector3(0, 2, 0)));

    this.root.position.copy(this.body.pos);
    this.speed = Math.hypot(this.body.vel.x, this.body.vel.z);
    if (moving && this.speed > 0.3) {
      const want = Math.atan2(this.body.vel.x, this.body.vel.z);
      let d = want - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-12 * dt));
    }
    this.root.rotation.y = this.facing;

    // animation state
    this.jumpT -= dt;
    const c = this.c;
    // clip speeds are matched to the Mixamo strides (walk ~1.8 m/s, sprint ~6.6 m/s at 1.85 m tall)
    if (!this.body.onGround && this.jumped && this.airT < 1.4) c.play('Jump', 0.08, 1.15);
    else if (!this.body.onGround && this.airT > 0.35) c.play('Fall', 0.25);
    else if (this.speed > 3.2) c.play('Run', 0.2, THREE.MathUtils.clamp(this.speed / 6.6, 0.7, 1.3));
    else if (this.speed > 0.3) c.play('Walk', 0.25, THREE.MathUtils.clamp(this.speed / 1.8, 0.6, 1.4));
    else if (this.emote) { ensureClip(c, this.emote); c.play(this.emote, 0.25); }
    else c.play('Idle', 0.3);
    c.mixer.update(dt);

    if (this.bubbleT !== undefined && this.bubble) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) { this.root.remove(this.bubble); this.bubble = null; }
    }
    return { moving, active: moving || !!this.emote || !this.body.onGround };
  }
}

/** orbit camera with collision pull-in */
export class FollowCamera {
  constructor(camera, physics) {
    this.cam = camera; this.physics = physics;
    this.yaw = 0; this.pitch = 0.32; this.dist = 6.5; this.curDist = 6.5;
    this.target = new THREE.Vector3();
  }

  update(dt, input, focus) {
    this.yaw -= input.look.dx * 0.0032;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.look.dy * 0.0026, -0.35, 1.2);
    this.dist = THREE.MathUtils.clamp(this.dist + input.wheel * 0.8, 2.5, 14);
    const desiredT = focus.clone().add(new THREE.Vector3(0, 1.55, 0));
    this.target.lerp(desiredT, 1 - Math.exp(-18 * dt));
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const hit = this.physics.raycast(this.target, dir, this.dist + 0.3);
    const want = Math.min(this.dist, hit - 0.35);
    this.curDist = want < this.curDist ? want : THREE.MathUtils.lerp(this.curDist, want, 1 - Math.exp(-4 * dt));
    this.curDist = Math.max(0.8, this.curDist);
    this.cam.position.copy(this.target).addScaledVector(dir, this.curDist);
    // shoulder offset so the character sits slightly left of center
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.cam.position.addScaledVector(right, 0.45);
    this.cam.lookAt(this.target.clone().addScaledVector(right, 0.45));
  }
}

// ---- two-bone IK (arm: upper -> lower -> end): bends the chain so `end` reaches `target` (world), elbow toward
// `pole` (world direction). Rewrites the bones' local quaternions after the mixer, so it layers on any clip.
const _ik = { s: new THREE.Vector3(), e: new THREE.Vector3(), w: new THREE.Vector3(), d: new THREE.Vector3(), p: new THREE.Vector3(),
  ne: new THREE.Vector3(), q: new THREE.Quaternion(), pq: new THREE.Quaternion(), bq: new THREE.Quaternion(), a: new THREE.Vector3(), b: new THREE.Vector3() };
function aimBone(bone, from, to, childWorld) {
  // rotate `bone` (world) so the direction bone->child goes from `from` to `to`
  _ik.a.copy(from).normalize(); _ik.b.copy(to).normalize();
  _ik.q.setFromUnitVectors(_ik.a, _ik.b);
  bone.getWorldQuaternion(_ik.bq); _ik.bq.premultiply(_ik.q);
  bone.parent.getWorldQuaternion(_ik.pq);
  bone.quaternion.copy(_ik.pq.invert().multiply(_ik.bq));
  bone.updateMatrixWorld(true);
}
export function twoBoneIK(upper, lower, end, target, pole, weight = 1) {
  const { s, e, w, d, p, ne } = _ik;
  upper.getWorldPosition(s); lower.getWorldPosition(e); end.getWorldPosition(w);
  const a = s.distanceTo(e), b = e.distanceTo(w);
  d.copy(target).sub(s); let len = d.length();
  len = THREE.MathUtils.clamp(len, Math.abs(a - b) + 1e-3, a + b - 1e-3); d.normalize();
  const cosA = THREE.MathUtils.clamp((a * a + len * len - b * b) / (2 * a * len), -1, 1);
  p.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();                // pole, orthogonal to the reach line
  ne.copy(s).addScaledVector(d, a * cosA).addScaledVector(p, a * Math.sqrt(1 - cosA * cosA));
  if (weight < 1) ne.lerp(e, 1 - weight);
  aimBone(upper, _ik.a.copy(e).sub(s), _ik.b.copy(ne).sub(s));
  lower.getWorldPosition(e); end.getWorldPosition(w);
  const tgt = _ik.ne.copy(target); if (weight < 1) tgt.lerp(w, 1 - weight);
  aimBone(lower, _ik.a.copy(w).sub(e), _ik.b.copy(tgt).sub(e));
}
/** the rider's arm chains (Mixamo rig), cached on the character */
export function armChains(c) {
  if (c._arms) return c._arms;
  const find = (n) => { let r = null; c.model.traverse((o) => { if (!r && o.isBone && o.name.replace(/[:_]/g, '').endsWith(n)) r = o; }); return r; };
  const L = ['LeftArm', 'LeftForeArm', 'LeftHand'].map(find), R = ['RightArm', 'RightForeArm', 'RightHand'].map(find);
  c._arms = L.every(Boolean) && R.every(Boolean) ? { L, R } : null;
  return c._arms;
}
