// Ambient crowd so the Square feels alive before multiplayer lands.
// When Colyseus is wired in, remote players reuse makeCharacter/addNameplate from player.js.
import * as THREE from 'three';
import { makeCharacter, addNameplate, say, ensureClip, CHAR_HEIGHT } from './player.js';

const NAMES = ['Ravoal', 'Noorpootr', 'Savoel', 'Linyenbe', 'Daads', 'Nomirre', 'MoonMaxi', 'GMGarry', 'VaultRat', 'TileDropTina',
  'ChartWizard', 'JeetJr', 'DiamondDev', 'HodlHana', 'SwampSam', 'CopeCaptain', 'BullBella', 'RektRick'];
const TAGS = [['NORMIE', '#d0d0e0', 3], ['DEGEN', '#c37bff', 18], ['DEGEN', '#c37bff', 31], ['WHALE', '#ffc83d', 54], ['WHALE', '#ffc83d', 82]];
const LINES = ['GM', 'WAGMI!', 'LFG 🚀', "who's raiding the vault?", 'bag run anyone?', 'hold the line', 'that watch tho', 'gm gm', 'just hit Lv 25', 'ngmi lol', 'meet at the portals', 'whale lounge when'];
const TINTS = [null, [0.75, 0.9, 1.1], [1.1, 0.8, 1.0], [0.8, 1.1, 0.8], [1.15, 1.0, 0.75], [0.7, 0.7, 0.8]];

function randomPoint() {
  // plaza ring outside the vault, or a short way up an avenue
  if (Math.random() < 0.75) {
    const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 25;
    return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  const k = Math.floor(Math.random() * 4), along = 48 + Math.random() * 40, side = (Math.random() - 0.5) * 12;
  return [new THREE.Vector3(side, 0, -along), new THREE.Vector3(along, 0, side), new THREE.Vector3(side, 0, along), new THREE.Vector3(-along, 0, side)][k];
}

export class Crowd {
  constructor(scene, gltfs, physics, count, chatSink) {
    gltfs = Array.isArray(gltfs) ? gltfs : [gltfs];
    this.list = [];
    this.physics = physics;
    this.chatSink = chatSink;
    for (let i = 0; i < count; i++) {
      const t = TINTS[i % TINTS.length];
      const c = makeCharacter(gltfs[i % gltfs.length], { tint: t ? new THREE.Color(...t) : null, shadow: i < 8 });
      const p = randomPoint();
      p.y = physics.groundAt(p.x, p.z, 4);
      c.root.position.copy(p);
      const [tag, col, lvl] = TAGS[i % TAGS.length];
      const name = NAMES[i % NAMES.length];
      addNameplate(c.root, tag, name, lvl + (i % 7), col);
      if (lvl >= 50) c.root.add(aura(col));
      scene.add(c.root);
      const npc = {
        c, name, tag, color: col,
        body: { pos: p.clone(), vel: new THREE.Vector3(), onGround: true, radius: 0.38, height: CHAR_HEIGHT },
        target: randomPoint(), wait: Math.random() * 4, act: 'Idle',
        ...(i % 3 === 0 && c.actions.Swagger ? { walkClip: 'Swagger', stride: 0.9, speed: 0.85 + Math.random() * 0.25 } : { walkClip: 'Walk', stride: 1.8, speed: 1.5 + Math.random() * 0.5 }),
        stuck: 0, lastPos: p.clone(), chatIn: 6 + Math.random() * 40, holder: {},
      };
      c.mixer.setTime(Math.random() * 3);
      this.list.push(npc);
    }
  }

  // ---------- flashmob: NPCs near an emoting player run over, form a wedge behind them and dance the same emote
  // in sync (their clip time follows the player's). Ends when the player stops emoting.
  /** returns how many NPCs are joining */
  startFlashmob(player, { radius = 75, max = 14 } = {}) {
    const P = player.body.pos, f = player.facing;
    const fwd = new THREE.Vector3(Math.sin(f), 0, Math.cos(f)), right = new THREE.Vector3(Math.cos(f), 0, -Math.sin(f));
    // wedge rows behind the leader: 2, 3, 4, 5, 6 dancers, 1.7 m apart, 1.5 m between rows
    const slots = [], eye = P.clone().add(new THREE.Vector3(0, 1.0, 0));
    for (let k = 1; k <= 5 && slots.length < max; k++) {
      for (let i = 0; i <= k && slots.length < max; i++) {
        const s = P.clone().addScaledVector(right, (i - k / 2) * 1.7).addScaledVector(fwd, -1.5 * k);
        const gy = this.physics.groundAt(s.x, s.z, P.y + 3);
        if (Math.abs(gy - P.y) > 1.2) continue;                                       // off a ledge / into a step
        const to = new THREE.Vector3(s.x - eye.x, 0, s.z - eye.z), d = to.length();
        if (this.physics.raycast(eye, to.normalize(), d + 0.5) < d + 0.4) continue;   // wall in the way
        s.y = gy; slots.push(s);
      }
    }
    const free = this.list.filter((n) => n.body.pos.distanceTo(P) < radius);
    let joined = 0;
    for (const s of slots) {                     // front rows first, each takes the nearest free dancer
      if (!free.length) break;
      let bi = 0; for (let i = 1; i < free.length; i++) if (free[i].body.pos.distanceToSquared(s) < free[bi].body.pos.distanceToSquared(s)) bi = i;
      const n = free.splice(bi, 1)[0];
      n.mob = { slot: s, state: 'go', t: 0 };
      if (joined < 3 && Math.random() < 0.8) say(n.c.root, MOB_LINES[Math.floor(Math.random() * MOB_LINES.length)], n.holder);
      joined++;
    }
    this.flashmob = joined ? { player, emote: player.emote, facing: f } : null;
    return joined;
  }

  endFlashmob() {
    for (const n of this.list) {
      if (!n.mob) continue;
      const danced = n.mob.state === 'dance';
      n.mob = null;
      n.wait = 1.2 + Math.random() * 2.5; n.act = danced && Math.random() < 0.6 ? 'Wave' : 'Idle';   // applause, then back to wandering
    }
    this.flashmob = null;
  }

  /** one flashmob dancer: run to the slot, face the leader's way, then mirror the leader's emote */
  mobStep(n, dt) {
    const b = n.body, m = n.mob, fm = this.flashmob;
    m.t += dt;
    const to = new THREE.Vector3(m.slot.x - b.pos.x, 0, m.slot.z - b.pos.z), d = to.length();
    if (m.state === 'go') {
      // progress check: no real gain for 3 s means a wall or the vault is in the way, so slip into place
      if (m.best === undefined || d < m.best - 0.3) { m.best = d; m.stall = 0; } else m.stall += dt;
      if (d < 0.6) m.state = 'dance';
      else if (m.stall > 3 || m.t > 20) { b.pos.copy(m.slot); b.vel.set(0, 0, 0); m.state = 'dance'; }
      else {
        if (Math.hypot(b.pos.x, b.pos.z) < 15.5) { const out = new THREE.Vector3(b.pos.x, 0, b.pos.z).normalize(); to.normalize().addScaledVector(out, 1.2); }
        const run = d > 4, sp = run ? 5.4 : Math.max(1.8, Math.min(2.6, d * 1.6));
        to.setLength(sp);
        b.vel.x = THREE.MathUtils.lerp(b.vel.x, to.x, 1 - Math.exp(-8 * dt));
        b.vel.z = THREE.MathUtils.lerp(b.vel.z, to.z, 1 - Math.exp(-8 * dt));
        if (run) n.c.play('Run', 0.2, sp / 6.6); else n.c.play('Walk', 0.25, sp / 1.8);
        turnTo(n.c.root, Math.atan2(b.vel.x, b.vel.z), 10 * dt);
        return;
      }
    }
    // dancing: settle onto the slot, face the same way as the leader, same clip at the same time
    b.vel.x = to.x * 2; b.vel.z = to.z * 2;
    turnTo(n.c.root, fm.facing, 6 * dt);
    const em = fm.emote, lead = fm.player.c, la = lead.actions[em];
    if (!ensureClip(n.c, em)) { n.c.play('Idle', 0.3); return; }       // long emotes stream in per character
    n.c.play(em, 0.35);
    const a = n.c.actions[em];
    if (la && lead.anim.current === la) {
      // the leader's mixer already ran this frame and ours runs right after, so aim one step behind it
      const dur = a.getClip().duration || 1, want = ((la.time - dt * la.timeScale) % dur + dur) % dur;
      let off = (want - a.time) % dur; if (off > dur / 2) off -= dur; if (off < -dur / 2) off += dur;
      if (Math.abs(off) > 0.04) a.time = want;                        // snap into step (drift or a fresh join)
      a.timeScale = la.timeScale;
    }
  }

  update(dt, t, camPos) {
    if (this.flashmob) this.flashmob.emote = this.flashmob.player.emote || this.flashmob.emote;
    for (const n of this.list) {
      const b = n.body;
      const far = !n.mob && camPos.distanceToSquared(b.pos) > 140 * 140;
      if (n.mob && this.flashmob) this.mobStep(n, dt);
      else if (n.wait > 0) {
        n.wait -= dt;
        b.vel.x = b.vel.z = 0;
        n.c.play(n.act, 0.3);
        if (n.wait <= 0) { n.target = randomPoint(); n.act = 'Idle'; }
      } else {
        const to = new THREE.Vector3(n.target.x - b.pos.x, 0, n.target.z - b.pos.z);
        const d = to.length();
        // steer around the vault pavilion
        if (Math.hypot(b.pos.x, b.pos.z) < 15.5) { const out = new THREE.Vector3(b.pos.x, 0, b.pos.z).normalize(); to.normalize().addScaledVector(out, 1.2); }
        if (d < 1.2) {
          n.wait = 2 + Math.random() * 6;
          const r = Math.random(); n.act = r < 0.18 ? 'Dance' : r < 0.32 ? 'Wave' : 'Idle';
        } else {
          to.setLength(n.speed);
          b.vel.x = THREE.MathUtils.lerp(b.vel.x, to.x, 1 - Math.exp(-6 * dt));
          b.vel.z = THREE.MathUtils.lerp(b.vel.z, to.z, 1 - Math.exp(-6 * dt));
          n.c.play(n.walkClip, 0.25, n.speed / n.stride);
          const want = Math.atan2(b.vel.x, b.vel.z);
          let dd = want - n.c.root.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
          n.c.root.rotation.y += dd * (1 - Math.exp(-6 * dt));
        }
      }
      if (!far) this.physics.step(b, dt);
      else b.pos.addScaledVector(b.vel, dt);
      n.c.root.position.copy(b.pos);
      // unstick
      n.stuck += dt;
      if (n.stuck > 2.5) {
        if (n.wait <= 0 && n.lastPos.distanceTo(b.pos) < 0.8) n.target = randomPoint();
        n.lastPos.copy(b.pos); n.stuck = 0;
      }
      if (!far) n.c.mixer.update(dt);
      // chatter
      n.chatIn -= dt;
      if (n.chatIn <= 0) {
        n.chatIn = 20 + Math.random() * 50;
        const line = LINES[Math.floor(Math.random() * LINES.length)];
        if (!far) say(n.c.root, line, n.holder);
        this.chatSink?.(n.tag, n.name, line, n.color);
      }
      if (n.holder.bubble) { n.holder.bubbleT -= dt; if (n.holder.bubbleT <= 0) { n.c.root.remove(n.holder.bubble); n.holder.bubble = null; } }
    }
  }
}

const MOB_LINES = ['FLASHMOB!', 'say less 🕺', 'LFG!!', 'dance break!', 'ayyy', "i know this one"];
function turnTo(root, want, k) {
  let d = want - root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  root.rotation.y += d * (1 - Math.exp(-k));
}

function aura(color) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.2, 24, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  col.position.y = 1.1; g.add(col);
  return g;
}
