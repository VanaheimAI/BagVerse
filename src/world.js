// Loads the Blender-built Bag Square and wires up everything that moves or reacts.
import * as THREE from 'three';
import { billboardCreatives, tickerTexture, cardTexture, labelTexture, isOpenSlot } from './creatives.js';
import { Physics, toWorldFloat } from './physics.js';
import { RWA_ASSETS, rwaSlabTexture } from './rwa.js';

function bakeToWorld(o) {
  const g = toWorldFloat(o);
  o.geometry = g;
  o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1);
  o.matrixAutoUpdate = false; o.updateMatrix(); o.updateMatrixWorld(true);
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.billboards = [];
    this.tickers = [];
    this.portals = [];
    this.holos = [];
    this.propSpots = [];   // PROP_* markers: statues placed from their own GLBs (see placeProps)
    this.zones = [];
    this.treeSpots = [];
    this.kitSpots = [];    // KIT_* markers -> instanced city-kit assets (src/kit.js)   // TREE_* markers -> instanced trees (src/trees.js)
    this.anim = [];
    this.spawn = new THREE.Vector3(0, 0.3, 36);
    this.spawnYaw = 0;
  }

  async init(gltf) {
    const root = gltf.scene; this.root = root;
    this.scene.add(root);
    let collider = null;
    const smokeAnchors = [];

    root.traverse((o) => {
      const n = o.name || '';
      const ex = o.userData || {};
      if (o.isMesh) {
        o.matrixAutoUpdate = false; o.updateMatrix();
        const m = o.material;
        if (m && m.isMeshStandardMaterial) {
          if (m.transparent) { m.depthWrite = false; m.side = THREE.DoubleSide; m.envMapIntensity = 2; }
          if (/neon|lamp|goldglow|window_lit|pedestal|swamp|water_red|lily/.test(m.name)) m.toneMapped = true;
        }
        // every surface receives the sun; solid geometry also casts (crisp stylised shadows)
        o.receiveShadow = true;
        const flat = /^(M_|HERO_)(plaza|asphalt|sidewalk|grass|dirt|goldpave|swamp|lane_paint|paint_|hexpaver|water_red|lily|neon_|glass|crystal|portal_)/.test(n);
        o.castShadow = !flat && !(m && m.transparent);
      }
      if (o.isMesh && /^(BB_|TICKER_|PORTAL_FX_)/.test(n)) bakeToWorld(o);   // meshopt-quantized -> world-space float
      if (n === 'COLLIDER') collider = o;
      else if (n.startsWith('BB_')) this.billboards.push(o);
      else if (n.startsWith('TICKER_')) this.tickers.push(o);
      else if (n.startsWith('PORTAL_FX_')) this.portals.push(o);
      else if (/^HOLO_\d/.test(n)) this.holos.push(o);
      else if (n.startsWith('KIT_') && ex.kit) this.kitSpots.push({ kit: ex.kit, pos: o.getWorldPosition(new THREE.Vector3()), rz: ex.rz || 0, sx: ex.sx || 1, sy: ex.sy || 1, sz: ex.sz || 1, tint: ex.tint });
      else if (n.startsWith('PROP_') && ex.prop) this.propSpots.push({ prop: ex.prop, pos: o.getWorldPosition(new THREE.Vector3()), rz: ex.rz || 0, s: ex.s || 1 });
      else if (n.startsWith('TREE_')) this.treeSpots.push({ pos: o.getWorldPosition(new THREE.Vector3()), s: ex.s || 1, rz: ex.rz || 0, swamp: !!ex.swamp });
      else if (n.startsWith('ZONE_')) { const id = n.slice(5), mv = this.zoneMoves?.[id];
        this.zones.push({ id, label: this.zoneLabels?.[id] || ex.label, radius: mv?.radius || ex.radius, color: ex.color || '#ffffff', pos: mv ? new THREE.Vector3(mv.pos[0], 0, mv.pos[1]) : o.getWorldPosition(new THREE.Vector3()) }); }
      else if (n.startsWith('SMOKE_')) smokeAnchors.push({ pos: o.getWorldPosition(new THREE.Vector3()), color: ex.color || '#888888', big: n.includes('copium') || n.includes('rocket') });
      else if (n === 'SPAWN') { o.getWorldPosition(this.spawn); }
      else if (n === 'VAULT_COIN') { o.matrixAutoUpdate = true; this.anim.push((t) => { o.rotation.y = t * 0.9; o.position.y = 23.2 + Math.sin(t * 1.3) * 0.25; }); }
      else if (n === 'ROCKET' || n === 'ROCKET_TRIM') { o.matrixAutoUpdate = true; const y0 = o.position.y; this.anim.push((t) => { o.position.y = y0 + Math.max(0, Math.sin(t * 0.35)) ** 8 * 0.6; o.rotation.y = Math.sin(t * 0.2) * 0.05; }); }
    });

    if (!collider) throw new Error('COLLIDER mesh missing from world GLB');
    collider.visible = false;
    if (this.colliderEdit) this.colliderEdit(collider);   // landmarks.js: swap generated structures for model buildings
    this.physics = new Physics(collider);
    this.scene.add(this.physics.mesh);
    this.spawn.y = this.physics.groundAt(this.spawn.x, this.spawn.z, 5) + 0.05;

    this.zones.sort((a, b) => a.radius - b.radius);   // most specific zone first
    this.setupBillboards();
    this.setupTickers();
    this.setupPortals();
    this.setupHolos();
    this.setupSmoke(smokeAnchors);
    this.setupLights();
  }

  setupLights() {
    // a few real lights where it matters; everything else is emissive + bloom
    this.lights = [];
    const add = (c, i, d, p) => { const l = new THREE.PointLight(c, i, d, 1.6); l.position.copy(p); this.scene.add(l); this.lights.push(l); };
    add(0xffb800, 22, 18, new THREE.Vector3(53, 7, -22));   // RWA vault interior bounce
    add(0x00f0ff, 40, 24, new THREE.Vector3(0, 6, 0));      // hub
    add(0xff2bd6, 80, 60, new THREE.Vector3(-30, 12, -30));
    add(0x22e8ff, 80, 60, new THREE.Vector3(30, 12, 30));
    add(0x7cff3d, 50, 40, new THREE.Vector3(-25, 5, 25));
  }

  setupBillboards() {
    for (const bb of this.billboards) {
      const slot = bb.userData.slot || parseInt(bb.name.slice(3), 10);
      const vertical = bb.userData.aspect === '9:16';
      const texs = billboardCreatives(slot, vertical);
      // screens: stable brightness (no >1 values for bloom to pulse on), mip-mapped + anisotropic text (no shimmer),
      // and pulled toward the camera in depth so they never z-fight with the frame/facade behind them
      for (const tx of texs) { tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.anisotropy = 8; tx.needsUpdate = true; }
      const mat = new THREE.MeshBasicMaterial({ map: texs[0], side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      mat.color.setScalar(0.92);
      bb.material = mat;
      bb.geometry.computeBoundingBox();
      const center = bb.geometry.boundingBox.getCenter(new THREE.Vector3());
      const nrm = new THREE.Vector3().fromBufferAttribute(bb.geometry.attributes.normal, 0);
      Object.assign(bb.userData, { slot, texs, idx: 0, next: 6 + Math.random() * 8, center, normal: nrm, open: isOpenSlot(slot), tier: bb.userData.tier || 'canyon' });
    }
  }

  setupTickers() {
    for (const t of this.tickers) {
      const tex = tickerTexture(parseInt(t.name.split('_')[1], 10));
      tex.anisotropy = 8;
      t.material = new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      t.material.color.setScalar(0.92);
      t.userData.tex = tex;
    }
  }

  setupPortals() {
    for (const p of this.portals) {
      const g = p.geometry; g.computeBoundingBox();
      const center = g.boundingBox.getCenter(new THREE.Vector3());
      const normal = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, 0).normalize();
      const u = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
      const color = new THREE.Color(p.userData.color || '#7cff3d');
      p.material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uColor: { value: color }, uCenter: { value: center }, uU: { value: u }, uR: { value: 3.05 } },
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
      Object.assign(p.userData, { center, normal });
      this.anim.push((t) => { p.material.uniforms.uTime.value = t; });
    }
  }

  setupHolos() {
    // a sealed graded slab with a "?" card: raffle prize to be announced (theme: onepiece | pokemon)
    const mysterySlab = (theme) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 400; const g = c.getContext('2d');
      const red = theme === 'pokemon' ? '#e8282b' : '#c8102e', gold = '#ffc83d';
      g.fillStyle = '#eef1f6'; g.fillRect(0, 0, 256, 400);
      g.fillStyle = '#fff'; g.fillRect(10, 10, 236, 62); g.strokeStyle = red; g.lineWidth = 4; g.strokeRect(12, 12, 232, 58);
      g.fillStyle = '#1b1b22'; g.font = '700 22px Rajdhani, sans-serif'; g.textAlign = 'center';
      g.fillText(theme === 'pokemon' ? 'POKÉMON · GRADED' : 'ONE PIECE · GRADED', 128, 38); g.fillText('PRIZE TBA', 128, 62);
      const grd = g.createLinearGradient(0, 90, 0, 390); grd.addColorStop(0, theme === 'pokemon' ? '#1f3a8a' : '#3a0d12'); grd.addColorStop(1, '#0b0b16');
      g.fillStyle = grd; g.fillRect(28, 88, 200, 296); g.strokeStyle = gold; g.lineWidth = 6; g.strokeRect(31, 91, 194, 290);
      g.fillStyle = gold; g.font = '700 150px Rajdhani, sans-serif'; g.fillText('?', 128, 290);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const grp = new THREE.Group(), iw = 0.64, ih = 1.0;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(iw + 0.1, ih + 0.16, 0.07), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false }));
      const front = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), new THREE.MeshBasicMaterial({ map: tex, color: 0xf2f2f2 })); front.position.z = 0.012;
      const back = front.clone(); back.rotation.y = Math.PI; back.position.z = -0.012; slab.renderOrder = 1;
      grp.add(front, back, slab); return grp;
    };
    const holoMat = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.25, transparent: true, opacity: 0.88 });
    const builders = [
      () => { // gold watch
        const g = new THREE.Group();
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 40), holoMat(0xffd27a)); face.rotation.x = Math.PI / 2; g.add(face);
        const dial = new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), new THREE.MeshBasicMaterial({ color: 0x0b1840, toneMapped: false })); dial.position.z = 0.075; g.add(dial);
        for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.01), new THREE.MeshBasicMaterial({ color: 0xffffff })); const a = i / 12 * Math.PI * 2; m.position.set(Math.sin(a) * 0.27, Math.cos(a) * 0.27, 0.08); m.rotation.z = -a; g.add(m); }
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.11, 8, 40, Math.PI * 1.25), holoMat(0xffc83d)); band.rotation.set(Math.PI / 2, 0, Math.PI * 0.87); band.position.y = 0; band.scale.set(0.7, 1.6, 1); g.add(band);
        return g;
      },
      () => { // graded card slab: the vault's real RWA (src/rwa.js), photo + grading label, both faces
        const g = new THREE.Group();
        const a = RWA_ASSETS[0];
        const ph = a && a.photo, iw = ph ? 1.12 * a.aspect : 0.64, ih = ph ? 1.12 : 1.0;   // photo = whole slab, else insert
        const slab = new THREE.Mesh(new THREE.BoxGeometry(iw + (ph ? 0.02 : 0.1), ih + (ph ? 0.02 : 0.16), 0.07), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: ph ? 0.12 : 0.22, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false }));
        const ins = new THREE.MeshBasicMaterial({ map: a ? rwaSlabTexture(a) : cardTexture(), color: 0xf2f2f2 });
        const front = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), ins); front.position.z = 0.012;
        const back = front.clone(); back.rotation.y = Math.PI; back.position.z = -0.012;
        slab.renderOrder = 1;
        g.add(front, back, slab); return g;
      },
      () => { // gold bar stack
        const g = new THREE.Group(); const geo = new THREE.BoxGeometry(0.6, 0.18, 0.28);
        [[0, 0, 0], [0, 0, 0.32], [0, 0.19, 0.16]].forEach(([x, y, z]) => { const b = new THREE.Mesh(geo, holoMat(0xffc83d)); b.position.set(x, y - 0.1, z - 0.16); g.add(b); });
        return g;
      },
    ];
    const card = RWA_ASSETS[0];
    const cardLabel = card ? [`LUFFY · ${card.grader} ${card.grade}`, `OP13 #${card.number} · RAFFLE`] : ['GRADED CARD', 'GEM MINT 10'];
    const names = [['GOLD WATCH', 'TOKENIZED · VAULTED'], cardLabel, ['1 KG GOLD', 'TOKENIZED BULLION']];
    this.holos.sort((a, b) => a.name.localeCompare(b.name));
    // landmarks.js may replace the HOLO_* markers with vault showcases (positions, kinds, labels)
    const specs = this.holoSpecs || this.holos.map((h, i) => ({ pos: h.getWorldPosition(new THREE.Vector3()), kind: i % 3, label: names[i % 3] }));
    specs.forEach((sp, i) => {
      const item = sp.kind === 'slab' ? builders[1]() : sp.kind === 'mystery' ? mysterySlab(sp.theme) : builders[sp.kind]();
      item.scale.setScalar(1.4);
      const pos = sp.pos.clone(); const label = sp.label || cardLabel;
      item.position.copy(pos);
      this.scene.add(item);
      // light beam
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 2.2, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x22e8ff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.set(pos.x, pos.y - 0.9, pos.z); this.scene.add(beam);
      if (sp.kind === 1 || sp.kind === 'slab' || sp.kind === 'mystery') { beam.scale.y = 0.52; beam.position.y = pos.y - 1.43; }   // keep the beam below the card slab
      // label with countdown
      const cv = labelTexture(label);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, toneMapped: false, depthWrite: false }));
      spr.scale.set(2.4, 0.75, 1); spr.position.set(pos.x, pos.y + 1.5, pos.z); this.scene.add(spr);
      this.anim.push((t) => { item.rotation.y = t * 0.8 + i; item.position.y = pos.y + Math.sin(t * 1.5 + i) * 0.12; });
      this.holoLabels = this.holoLabels || [];
      this.holoLabels.push({ cv, tex, name: label[0], raffle: !!this.holoSpecs });
    });
    this.nextLabel = 0;
  }

  setupSmoke(anchors) {
    const PER = 18, N = anchors.length * PER;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), life = new Float32Array(N), seed = new Float32Array(N);
    anchors.forEach((a, k) => {
      const c = new THREE.Color(a.color);
      for (let i = 0; i < PER; i++) { const j = k * PER + i; col.set([c.r, c.g, c.b], j * 3); seed[j] = Math.random(); life[j] = (i / PER); }
    });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('life', new THREE.BufferAttribute(life, 1));
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
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
    this.scene.add(pts);
    this.smoke = { anchors, PER, geo, pos, life, seed };
  }

  update(t, dt) {
    for (const f of this.anim) f(t);
    for (const bb of this.billboards) {
      const u = bb.userData;
      u.next -= dt;
      if (u.next <= 0) { u.idx = (u.idx + 1) % u.texs.length; bb.material.map = u.texs[u.idx]; u.next = 8 + Math.random() * 6; }
    }
    for (const tk of this.tickers) tk.userData.tex.offset.x = (t * 0.04) % 1;
    // smoke
    const s = this.smoke;
    if (s) {
      s.anchors.forEach((a, k) => {
        const rise = a.big ? 7 : 3.5, spread = a.big ? 2.2 : 1.4;
        for (let i = 0; i < s.PER; i++) {
          const j = k * s.PER + i;
          let l = s.life[j] + dt / (a.big ? 6 : 4.5);
          if (l > 1) { l -= 1; s.seed[j] = Math.random(); }
          s.life[j] = l;
          const sd = s.seed[j] * 6.283;
          s.pos[j * 3] = a.pos.x + Math.cos(sd) * spread * l + Math.sin(t * 0.3 + sd) * 0.6 * l;
          s.pos[j * 3 + 1] = a.pos.y + l * rise * (a.big ? 2.5 : 1.5);
          s.pos[j * 3 + 2] = a.pos.z + Math.sin(sd) * spread * l;
        }
      });
      s.geo.attributes.position.needsUpdate = true; s.geo.attributes.life.needsUpdate = true;
    }
    // hologram countdown labels, once per second
    this.nextLabel -= dt;
    if (this.holoLabels && this.nextLabel <= 0) {
      this.nextLabel = 1;
      const cd = countdown();
      for (const L of this.holoLabels) {
        const g = L.cv.getContext('2d');
        g.clearRect(0, 0, 512, 160);
        const fresh = labelTexture([L.name, `${L.raffle ? 'RAFFLE' : 'TOURNAMENT'} IN ${cd}`]);
        g.drawImage(fresh, 0, 0); L.tex.needsUpdate = true;
      }
    }
  }

  /** instance statue models at their PROP_* markers. models: { prop: gltf }, yaw: per-prop facing fix */
  placeProps(models, { shadows = true } = {}) {
    const YAW = { bull: 0, pepe_bust: Math.PI };   // model-front corrections (radians) on top of the marker's facing
    for (const sp of this.propSpots) {
      const g = models[sp.prop]; if (!g) continue;
      const o = g.scene.clone(true);
      o.position.copy(sp.pos); o.rotation.y = sp.rz + (YAW[sp.prop] || 0); o.scale.setScalar(sp.s);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = shadows; m.receiveShadow = true; } });
      o.name = 'PROP_' + sp.prop;
      this.scene.add(o);
    }
  }

  zoneAt(p) {
    for (const z of this.zones) {
      if (Math.hypot(p.x - z.pos.x, p.z - z.pos.z) < z.radius) return z;
    }
    return { id: 'streets', label: 'BAGVERSE CITY', color: '#ffffff' };
  }
}

/** time to next Sunday 20:00 UTC (weekly RWA tournament placeholder) */
export function countdown() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 20, 0, 0));
  const add = (7 - now.getUTCDay()) % 7;
  next.setUTCDate(next.getUTCDate() + add);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7);
  let s = Math.floor((next - now) / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
}
