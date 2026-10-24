// Driveable vehicles: the Vision 1789 hypercar (blender/export_vision.py, off for now) and the punk kick scooter
// (blender/export_scooter.py). One arcade model drives both; SPECS sets size, speed, grip and lean.
// Arcade handling: a bicycle model (speed along the heading, yaw = v / wheelbase * tan(steer)), speed-sensitive
// steering, rays from the body centre to the bumper corners for walls, ground sampled under both axles for
// height + pitch. The wheels steer and spin on their own nodes; brake / reverse glows follow the pedals.
import * as THREE from 'three';
import { say } from './player.js';

export const SPECS = {
  // wb wheelbase, r wheel radius, max fwd / rev m/s, acc / brake / roll m/s², drag, steer max rad, soft = speed at
  // which steering halves, half width / length, ray height, tallest climbable step, lean = max body roll
  car: { wb: 2.84, r: 0.36, maxF: 36, maxR: 9, acc: 12, brake: 26, roll: 2.2, drag: 0.012, steer: 0.6, soft: 13, hw: 1.0, hl: 2.45, rayH: 0.6, step: 0.9, lean: 0.07, leanK: 0.012 },
  scooter: { wb: 1.0, r: 0.12, maxF: 11, maxR: 2.5, acc: 5.5, brake: 13, roll: 1.4, drag: 0.02, steer: 0.55, soft: 7, hw: 0.36, hl: 0.72, rayH: 0.45, step: 0.45, lean: 0.3, leanK: 0.045 },
};
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _o = new THREE.Vector3();

/** an axis given in the car's own space, expressed in `node`'s parent space (car root at identity) */
function axisIn(node, axis) {
  if (!node || !node.parent) return axis.clone();
  const q = node.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  return axis.clone().applyQuaternion(q).normalize();
}

export class Car {
  constructor(scene, gltf, physics, pos, heading, { shadows = true, spec = 'car' } = {}) {
    this.physics = physics;
    this.S = SPECS[spec]; this.kind = spec;
    this.root = new THREE.Group();
    this.model = gltf.scene;
    this.root.add(this.model);
    scene.add(this.root);
    this.root.updateMatrixWorld(true);
    this.wheels = ['FL', 'FR', 'BL', 'BR'].map((k) => {
      const steer = this.model.getObjectByName(`VIS_WHEEL_${k}_STEER`), spin = this.model.getObjectByName(`VIS_WHEEL_${k}_SPIN`);
      return { front: k[0] === 'F', steer, spin, steer0: steer?.quaternion.clone(), spin0: spin?.quaternion.clone(), steerAxis: axisIn(steer, Y), spinAxis: axisIn(spin, X) };
    });
    this.brakeMats = []; this.reverse = this.model.getObjectByName('VIS_REVERSE');
    const brakeNode = this.model.getObjectByName('VIS_BRAKE');
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m.name === 'VIS_Glow') {
        // the glow atlas is black where there is no light: add it on top instead of covering the body
        let inBrake = false; for (let p = o; p; p = p.parent) if (p === brakeNode) inBrake = true;
        const mm = inBrake ? m.clone() : m;
        Object.assign(mm, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        mm.color?.set(0x000000);
        if (inBrake) { o.material = mm; this.brakeMats.push(mm); }
        o.renderOrder = 2; o.castShadow = false;
        return;
      }
      if (m.name === 'VIS_Glass') { m.depthWrite = false; o.renderOrder = 1; o.castShadow = false; return; }
      if (m.isMeshPhysicalMaterial || m.isMeshStandardMaterial) m.envMapIntensity = 1.2;
      o.castShadow = shadows; o.receiveShadow = shadows;
    });
    if (this.reverse) this.reverse.visible = false;

    this.pos = pos.clone(); this.h = heading;
    this.v = 0; this.steer = 0; this.vy = 0; this.pitch = 0; this.roll = 0; this.spin = 0;
    this.driving = false; this.braking = false; this.cool = 0; this.bumpT = 0;
    this.settle();
  }

  get forward() { return _v.set(Math.sin(this.h), 0, Math.cos(this.h)); }

  /** car-space point (x left, z forward) -> world */
  local(x, z, out = new THREE.Vector3()) {
    const s = Math.sin(this.h), c = Math.cos(this.h);
    return out.set(this.pos.x + x * c + z * s, this.pos.y, this.pos.z - x * s + z * c);
  }

  /** world -> car space {x, z} */
  toLocal(p) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, s = Math.sin(this.h), c = Math.cos(this.h);
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }

  axleGround() {
    const W = this.S.wb, f = this.local(0, W / 2), r = this.local(0, -W / 2), from = this.pos.y + 1.6;
    return [this.physics.groundAt(f.x, f.z, from), this.physics.groundAt(r.x, r.z, from)];
  }

  settle() {
    const [fy, ry] = this.axleGround();
    this.pos.y = (fy + ry) / 2; this.pitch = Math.atan2(fy - ry, this.S.wb);
    this.pose();
  }

  pose() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(-this.pitch, this.h, this.roll, 'YXZ');
    for (const w of this.wheels) {
      if (w.steer && w.front) w.steer.quaternion.copy(_q.setFromAxisAngle(w.steerAxis, this.steer)).multiply(w.steer0);
      if (w.spin) w.spin.quaternion.copy(_q.setFromAxisAngle(w.spinAxis, this.spin)).multiply(w.spin0);
    }
    for (const m of this.brakeMats) m.emissiveIntensity = this.braking ? 4.5 : 1.0;
    if (this.reverse) this.reverse.visible = this.v < -0.3;
  }

  /** true when nothing solid is between the body centre and the bumper corners after moving `step` metres */
  blocked(step) {
    const S = this.S, dir = Math.sign(step) || 1, c = _o.copy(this.pos); c.y += S.rayH;
    for (const x of [-S.hw * 0.9, 0, S.hw * 0.9]) {
      const t = this.local(x, dir * S.hl); t.y = c.y;
      const d = t.sub(c), len = d.length();
      if (this.physics.raycast(c, d.normalize(), len + Math.abs(step) + 0.05) < len + Math.abs(step)) return true;
    }
    return false;
  }

  update(dt, input, { crowd = null } = {}) {
    this.cool = Math.max(0, this.cool - dt);
    if (!this.driving) {          // parked: coast to a stop
      this.v *= Math.exp(-3 * dt); if (Math.abs(this.v) < 0.05) this.v = 0;
      this.braking = false; this.steer *= Math.exp(-4 * dt);
      if (this.v) this.move(dt, crowd); else this.pose();
      return { active: false };
    }
    const k = (a, b) => (input.down(...a) ? 1 : 0) - (input.down(...b) ? 1 : 0);
    let thr = k(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']), str = k(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
    if (input.joy.x || input.joy.y) { thr = -input.joy.y; str = input.joy.x; }
    const hand = input.down('Space');

    const S = this.S;
    let a = 0;
    if (thr > 0.05) a = this.v < -0.5 ? S.brake * thr : S.acc * thr * (1 - 0.55 * this.v / S.maxF);
    else if (thr < -0.05) a = this.v > 0.5 ? S.brake * thr : S.acc * 0.7 * thr;
    else a = -Math.sign(this.v) * S.roll;
    if (hand) a -= Math.sign(this.v) * S.brake * 1.1;
    a -= S.drag * this.v * Math.abs(this.v);
    const before = this.v;
    this.v += a * dt;
    if ((thr <= 0.05 && thr >= -0.05 || hand) && Math.sign(this.v) !== Math.sign(before)) this.v = 0;   // brakes stop, never reverse
    this.v = THREE.MathUtils.clamp(this.v, -S.maxR, S.maxF);
    this.braking = hand || (thr < -0.05 && this.v > 0.5) || (thr > 0.05 && this.v < -0.5);

    // speed-sensitive steering, D / right = turn right (negative angle)
    const want = -str * S.steer / (1 + Math.abs(this.v) / S.soft);
    this.steer += (want - this.steer) * (1 - Math.exp(-9 * dt));
    this.move(dt, crowd);
    return { active: true };
  }

  move(dt, crowd) {
    const S = this.S;
    const yawRate = (this.v / S.wb) * Math.tan(this.steer) * (this.braking && Math.abs(this.v) > 8 ? 1.25 : 1);
    this.h += yawRate * dt;
    const step = this.v * dt;
    this.bumpT = Math.max(0, this.bumpT - dt);
    if (step && this.blocked(step)) {
      if (Math.abs(this.v) > 6 && !this.bumpT) { this.bumpT = 0.6; this.onBump?.(Math.abs(this.v)); }
      this.v = -this.v * 0.25;     // bounce off walls
    } else {
      const f = this.forward;
      this.pos.x += f.x * step; this.pos.z += f.z * step;
    }
    // ground under both axles: height, pitch, a little air off drops
    const [fy, ry] = this.axleGround(), gy = (fy + ry) / 2;
    if (gy > this.pos.y + S.step) {   // a step too tall to climb: treat as a wall
      const f = this.forward; this.pos.x -= f.x * step; this.pos.z -= f.z * step; this.v = -this.v * 0.25;
    } else if (gy >= this.pos.y - 0.04) { this.pos.y += (gy - this.pos.y) * Math.min(1, 18 * dt); this.vy = 0; }
    else { this.vy -= 28 * dt; this.pos.y = Math.max(gy, this.pos.y + this.vy * dt); }
    const p = Math.atan2(fy - ry, S.wb);
    this.pitch += (p - this.pitch) * Math.min(1, 10 * dt);
    this.roll += (THREE.MathUtils.clamp(-yawRate * this.v * S.leanK, -S.lean, S.lean) - this.roll) * Math.min(1, 6 * dt);   // into the turn
    this.spin += step / S.r;
    this.pose();
    // people jump out of the way
    if (crowd && Math.abs(this.v) > 1) for (const n of crowd.list) {
      const l = this.toLocal(n.body.pos);
      if (Math.abs(l.x) > S.hw + 0.5 || Math.abs(l.z) > S.hl + 0.6) continue;
      const side = Math.sign(l.x) || 1, push = S.hw + 0.55 - Math.abs(l.x);
      const s = Math.sin(this.h), c = Math.cos(this.h);
      n.body.pos.x += side * push * c; n.body.pos.z -= side * push * s;
      if (Math.abs(this.v) > (this.kind === 'scooter' ? 5 : 7) && !n.holder.dodgeT) { n.holder.dodgeT = 1; say(n.c.root, ['watch it!', 'WHOA', 'nice whip tho', 'road rage much?'][Math.floor(Math.random() * 4)], n.holder); n.holder.bubbleT = 2.5; setTimeout(() => { n.holder.dodgeT = 0; }, 4000); }
    }
  }

  /** keep a walker out of the car body (the car isn't in the static collision mesh) */
  pushOut(body) {
    const l = this.toLocal(body.pos), r = body.radius || 0.38;
    const px = this.S.hw + r - Math.abs(l.x), pz = this.S.hl + r - Math.abs(l.z);
    if (px <= 0 || pz <= 0 || body.pos.y > this.pos.y + 1.3) return;
    const s = Math.sin(this.h), c = Math.cos(this.h);
    if (px < pz) { const d = (Math.sign(l.x) || 1) * px; body.pos.x += d * c; body.pos.z -= d * s; }
    else { const d = (Math.sign(l.z) || 1) * pz; body.pos.x += d * s; body.pos.z += d * c; }
  }

  /** a free spot beside the car to step out to: driver side (left), then right, then behind */
  exitSpot() {
    const c = this.pos.clone(); c.y += 0.9;
    const { hw, hl } = this.S, side = hw + (this.kind === 'scooter' ? 0.55 : 0.9);
    for (const [x, z] of [[side, 0.2], [-side, 0.2], [0, -(hl + 1.0)], [0, hl + 1.0]]) {
      const t = this.local(x, z); t.y = c.y;
      const d = t.clone().sub(c), len = d.length();
      if (this.physics.raycast(c, d.normalize(), len + 0.4) < len + 0.3) continue;
      t.y = this.physics.groundAt(t.x, t.z, this.pos.y + 2) + 0.05;
      if (Math.abs(t.y - this.pos.y) < 1.2) return t;
    }
    return this.local(0, 0).setY(this.pos.y + 1.4);   // roof as a last resort
  }

  get kmh() { return Math.round(Math.abs(this.v) * 3.6); }
}
