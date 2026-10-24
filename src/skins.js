// Skin selection screen: 3D pedestal preview (drag to rotate), skin info, card grid with live-rendered portraits,
// filters (All / Owned / Unlocked / Favorites) and Back / Shop / Equip. Shown after loading and in game (K).
// The preview renders with the main renderer into the main canvas while the screen is open (no second GL context).
import { gateFor } from './nft-gates.js';
import { SKIN_GRADE, makeSlab, loadImage, labelCanvas } from './slab.js';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeCharacter } from './player.js';
import { charUniforms } from './surface.js';
import THUMBS from './assets/skin_thumbs.js';   // pre-rendered card portraits (tools/dump_thumbs.mjs)
import ART from './assets/skin_art/index.js';
import BG_URL from './assets/skin_bg/vault_room.webp';
import BG_URL_M from './assets/skin_bg/vault_room_m.webp';   // owner-supplied 3:4 card art (wins over the rendered portraits)

export const RARITY = {
  legendary: { label: 'Legendary', color: '#ffc83d', bg: ['#4a3410', '#1a1206'] },
  epic: { label: 'Epic', color: '#c77dff', bg: ['#3b1a5e', '#140a24'] },
  rare: { label: 'Rare', color: '#5fb8ff', bg: ['#14345e', '#08121f'] },
  common: { label: 'Common', color: '#b9c2d0', bg: ['#2a3140', '#0e1219'] },
  holiday: { label: 'Holiday', color: '#ff8a3d', bg: ['#4a2210', '#1a0c06'] },
};

// id = character GLB in public/assets (owned skins); locked skins have no model yet
export const SKINS = [
  { id: 'shiba', name: 'SHIB GIRL', rarity: 'epic', owned: true,
    desc: 'Doge-pack streetwear for trench runners. Ears up, bags packed, never selling the dip.',
    boosts: [['speed', 'Dash Trail · Shiba Sparks'], ['shield', 'Diamond Hands Aura']] },
  { id: 'solanagirl', name: 'SOLANA GIRL', rarity: 'epic', owned: true,
    desc: 'Sub-second vibes: holo visor, beaded locs and a jacket that settles faster than your trades.',
    boosts: [['speed', 'Dash Trail · Neon Wake'], ['crown', 'Glow Nameplate']] },
  { id: 'vampire', name: 'VAMPIRE GIRL', rarity: 'epic', owned: true,
    desc: 'Bat-wing tiara, corset and chains. Only comes out at night, only bites bears.',
    boosts: [['speed', 'Dash Trail · Bat Swarm'], ['shield', 'Night Ward Aura']] },
  { id: 'scream', name: 'SCREAM GUY', rarity: 'holiday', owned: true,
    desc: 'Hood up, mask on, chain swinging. Your portfolio is the real horror story.',
    boosts: [['speed', 'Dash Trail · Fog Wisps'], ['shield', 'Jump-Scare Aura']] },
  { id: 'kaizokuguy', name: 'KAIZOKU GUY', rarity: 'legendary', owned: true,
    desc: 'Straw hat, red vest, zero fear. Sails the bear market grinning and never jumps ship.',
    boosts: [['speed', 'Dash Trail · Sea Spray'], ['crown', 'Captain Nameplate']] },
  { id: 'kaizokugirl', name: 'KAIZOKU GIRL', rarity: 'legendary', owned: true,
    desc: 'First mate of the degen fleet. Shades on, hat tipped, charting a course to the next treasure drop.',
    boosts: [['speed', 'Dash Trail · Sea Spray'], ['shield', 'Treasure Map Aura']] },
  { id: 'frankie', name: 'FRANKIE', rarity: 'holiday', owned: true,
    desc: 'Stitched together from spare parts and pure conviction. Bolts in the neck, diamond hands in the chart.',
    boosts: [['speed', 'Dash Trail · Lightning Arcs'], ['shield', 'Bolt Shock Aura']] },
  { id: 'witch', name: "WITCH'S COVEN", rarity: 'epic', owned: true,
    desc: 'Pumpkin-hexed cosplay from Pepe’s Swamp. Brews FOMO, casts rug-proof spells.',
    boosts: [['speed', 'Dash Trail · Ember Wisps'], ['shield', 'Hex Ward Aura']] },
  { id: 'goldenking', name: 'GOLDEN KING', rarity: 'legendary', owned: true,
    desc: 'Whale-tier drip. Black-and-gold fit, heavy chains and a crown that never left the vault.',
    boosts: [['crown', 'Whale Crown Nameplate'], ['shield', 'Gold Aura']] },
  { id: 'habibi', name: 'HABIBI GUY', rarity: 'legendary', owned: true,
    desc: 'White-and-gold royalty straight off the Dubai yacht deck. Chains heavy, vibes immaculate, habibi.',
    boosts: [['crown', 'Gold Crown Nameplate'], ['speed', 'Dash Trail · Desert Gold']] },
  { id: 'rizzmas', name: 'RIZZMAS GUY', rarity: 'holiday', owned: true,
    desc: 'Ugly-sweater gains and a sack full of airdrops. Says GM to the whole server every December.',
    boosts: [['gift', 'Gift Trail'], ['speed', 'Dash Trail · Candy Cane']] },
  { id: 'santagirl', name: 'SANTA GIRL', rarity: 'holiday', owned: true,
    desc: 'Candy-cane goggles, ugly-sweater crop and a sleigh full of bags. Naughty list? Never heard of it.',
    boosts: [['gift', 'Gift Trail'], ['speed', 'Dash Trail · Snowfall']] },
  { id: 'elf', name: 'CHRISTMAS ELF', rarity: 'holiday', owned: true,
    desc: "Santa's fastest helper: jingle-bell cargos, candy-cane belt and a scooter licence nobody issued.",
    boosts: [['speed', 'Sleigh Rush'], ['gift', 'Present Drop']] },
  { id: 'undead', name: 'UNDEAD KING', rarity: 'legendary', owned: true,
    desc: 'Rose from the Jeet Wastelands after the last rug. Bone crown, cursed armour, unbreakable diamond hands.',
    boosts: [['crown', 'Bone Crown Nameplate'], ['shield', 'Soul Fire Aura']] },
  { id: 'santa', name: 'SANTA GUY', rarity: 'holiday', owned: true,
    desc: 'Seasonal drip. Says GM to every wallet on the nice list and airdrops coal to jeets.',
    boosts: [['gift', 'Gift Trail'], ['shield', 'Snow Aura']] },
  { id: 'pepe', name: 'PEPE GUY', rarity: 'common', owned: true,
    desc: 'Swamp-green comfort fit straight out of Pepe’s Swamp. Feels good, man.',
    boosts: [['speed', 'Dash Trail · Swamp'], ['shield', 'Comfy Aura']] },
  { id: 'cyber_green', name: 'CYBER GREEN', rarity: 'rare', owned: false, level: 25,
    desc: 'Neon-lime tech wear for degen runners. Unlocks at level 25.', boosts: [['speed', 'Dash Trail · Glitch'], ['shield', 'Circuit Aura']] },
];

const ICONS = {
  speed: '<svg viewBox="0 0 24 24"><path d="M3 15c4-1 7-3 9-7l2 1c-1 2-1 4 0 5 2-2 5-3 8-3-3 2-5 4-6 7-3 1-8 0-13-3z"/><path d="M2 11l6-1M3 8l5 0" stroke-width="1.6"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" fill="none" stroke-width="1.8"/><path d="M9 12c1 0 2-2 3-2s2 2 3 2-1 3-3 3-4-2-3-3z"/></svg>',
  crown: '<svg viewBox="0 0 24 24"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/></svg>',
  gift: '<svg viewBox="0 0 24 24"><path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13" fill="none" stroke-width="1.8"/><path d="M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0" fill="none" stroke-width="1.6"/></svg>',
};
const LOCK = '<svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3h1v11H6V10zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>';
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
const ROTATE = '<svg viewBox="0 0 96 96" fill="none" stroke-width="3.4" stroke-linecap="round"><path d="M48 10v22M48 64v22M10 48h22M64 48h22"/><path d="M41 17l7-7 7 7M41 79l7 7 7-7M17 41l-7 7 7 7M79 41l7 7-7 7"/><path d="M24 30a30 30 0 0 1 48 0M72 66a30 30 0 0 1-48 0" stroke-dasharray="4 5"/></svg>';

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
};

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
const radial = (stops) => canvasTex(256, 256, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

export class SkinScreen {
  /**
   * chars: { id: gltf } · getEquipped(): id · onEquip(id) · onClose() · getLevel(): number
   * getName(): current player name · needName(): true until the player has chosen one · setName(name)
   */
  /** chars: loaded gltfs by id (filled in as skins load) · loadChar(id): Promise<gltf> · allIds: every skin with a model */
  constructor({ renderer, chars, loadChar, allIds, platform, getEquipped, onEquip, onClose, getLevel, getName, needName, setName, getCards, getStats, transition, onMarket, onUse }) {
    Object.assign(this, { renderer, chars, loadChar, allIds, getEquipped, onEquip, onClose, getLevel, getName, needName, setName, getCards, getStats, onMarket, onUse });
    this.transition = transition || ((fn) => fn());
    this.mode = 'skins'; this.items = [];
    this.platformGltf = platform;
    this.isOpen = false;
    this.favs = new Set(store.get('bagverse.favs', []));
    this.filter = 'all';
    this.yaw = 0; this.yawV = 0; this.t = 0; this.pop = 1;
    this.instances = {};
    this.thumbs = {};
    this.buildScene();
    this.buildDom();
  }

  // ------------------------------------------------------------------ 3D
  buildScene() {
    const s = this.scene = new THREE.Scene();
    s.background = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#070b12'; g.fillRect(0, 0, w, h);
      const gr = g.createRadialGradient(w * 0.42, h * 0.48, 0, w * 0.42, h * 0.48, w * 0.75);
      gr.addColorStop(0, '#16303a'); gr.addColorStop(0.45, '#0c1822'); gr.addColorStop(1, '#05070c');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const pm = new THREE.PMREMGenerator(this.renderer);
    s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();

    // vibrant, true-colour character light: warm-white key + neutral fill; rims tinted to the room (teal / green)
    s.add(new THREE.HemisphereLight('#e6eeff', '#26302a', 0.75));
    const key = new THREE.DirectionalLight('#fff2e2', 2.7); key.position.set(2.0, 3.2, 4.4); s.add(key);
    const fill = new THREE.DirectionalLight('#ffffff', 0.9); fill.position.set(-3.2, 1.6, 3.0); s.add(fill);
    const rimC = new THREE.DirectionalLight('#8affe6', 1.15); rimC.position.set(-3, 2.6, -3.2); s.add(rimC);
    const rimG = new THREE.DirectionalLight('#a6ff7c', 0.9); rimG.position.set(3.2, 2.2, -3); s.add(rimG);
    const up = new THREE.PointLight('#5dff9a', 1.6, 2.6, 1.8); up.position.set(0, 0.15, 0.7); s.add(up);
    this.lights = { key, fill, rimC, rimG, up };

    // backdrop image (the vault room): a full-screen quad drawn behind everything; frame() positions it so the
    // painted pedestal's deck sits exactly under the character's feet (and follows zoom / window size)
    const bgTex = new THREE.TextureLoader().load(matchMedia('(pointer: coarse)').matches ? BG_URL_M : BG_URL);
    bgTex.colorSpace = THREE.SRGBColorSpace; bgTex.generateMipmaps = true; bgTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { uTex: { value: bgTex }, uScreen: { value: new THREE.Vector2(1, 1) }, uAnchor: { value: new THREE.Vector2() },
        uScale: { value: 1 }, uImg: { value: new THREE.Vector2(2576, 1438) }, uDeck: { value: new THREE.Vector2(1288, 1095) } },
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
        }` }));
    this.bg.frustumCulled = false; this.bg.renderOrder = -100;
    s.add(this.bg);
    s.background = null;

    // backdrop: tech grid panel with faded edges
    const grid = canvasTex(1024, 640, (g, w, h) => {
      g.strokeStyle = 'rgba(120,220,235,0.16)'; g.lineWidth = 1;
      for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
      for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
      g.strokeStyle = 'rgba(120,220,235,0.3)';
      for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
      for (let y = 0; y <= h; y += 128) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
      // fade to the edges
      g.globalCompositeOperation = 'destination-in';
      const gr = g.createRadialGradient(w / 2, h * 0.5, h * 0.15, w / 2, h * 0.5, w * 0.55);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 4.5),
      new THREE.MeshBasicMaterial({ map: grid, transparent: true, depthWrite: false, fog: false }));
    panel.position.set(0, 1.25, -2.6); s.add(panel); this.panel = panel;
    panel.visible = false;   // replaced by the vault-room backdrop

    // floor + pedestal
    const floorTex = canvasTex(1024, 1024, (g, w, h) => {
      const c = w / 2;
      const gr = g.createRadialGradient(c, c, 0, c, c, c);
      gr.addColorStop(0, '#1b2731'); gr.addColorStop(0.55, '#0e151c'); gr.addColorStop(1, 'rgba(7,11,18,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(140,200,220,0.10)';
      for (const r of [180, 260, 340, 420]) { g.lineWidth = r === 260 ? 6 : 2; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = 'rgba(95,240,255,0.18)'; g.lineWidth = 3;
      for (let a = 0; a < 6; a++) { g.beginPath(); g.arc(c, c, 300, a * 1.05, a * 1.05 + 0.5); g.stroke(); }
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 64), new THREE.MeshStandardMaterial({ map: floorTex, transparent: true, roughness: 0.55, metalness: 0.4 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.36; s.add(floor);
    floor.visible = false;

    const metal = new THREE.MeshStandardMaterial({ color: '#1d2630', metalness: 0.85, roughness: 0.32 });
    const metal2 = new THREE.MeshStandardMaterial({ color: '#2a3542', metalness: 0.8, roughness: 0.28 });
    const ped = this.pedestal = new THREE.Group(); s.add(ped);
    const proc = this.procPed = new THREE.Group(); ped.add(proc);   // fallback pedestal (replaced by the platform model)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.42, 0.2, 72), metal); base.position.y = -0.26; proc.add(base);
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.2, 0.12, 72), metal2); mid.position.y = -0.1; proc.add(mid);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 1.02, 0.06, 72), metal); top.position.y = -0.03; proc.add(top);
    const glow = (r, tube, y, col) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 120), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
      m.rotation.x = Math.PI / 2; m.position.y = y; proc.add(m); return m;
    };
    this.rings = [glow(0.86, 0.022, 0.004, '#8ff9ff'), glow(1.17, 0.018, -0.04, '#4fe6ff'), glow(1.38, 0.02, -0.17, '#5dffc0')];
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.98, 64), new THREE.MeshBasicMaterial({
      map: radial([[0, 'rgba(140,255,190,0.22)'], [0.55, 'rgba(70,230,140,0.08)'], [0.8, 'rgba(80,255,160,0.16)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.002; ped.add(disc);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 48), new THREE.MeshBasicMaterial({
      map: radial([[0, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.004; ped.add(shadow);
    // light beam + rising motes
    const beamTex = canvasTex(4, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.88, 2.4, 64, 1, true), new THREE.MeshBasicMaterial({
      map: beamTex, color: '#3fe9ff', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, toneMapped: false }));
    beam.position.y = 1.2;   // BackSide: only the far wall of the beam shows, behind the character (never washes it out) ped.add(beam);
    const N = 46, pos = new Float32Array(N * 3); this.motes = { N, seed: [] };
    for (let i = 0; i < N; i++) { this.motes.seed.push([Math.random() * 6.28, 0.3 + Math.random() * 0.6, Math.random()]); }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes.pts = new THREE.Points(mg, new THREE.PointsMaterial({ color: '#9ffcff', size: 0.025, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.motes.pts.frustumCulled = false; ped.add(this.motes.pts);

    this.stand = new THREE.Group(); s.add(this.stand);
    this.cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    if (this.platformGltf) this.usePlatform(this.platformGltf);
  }

  /** the futuristic platform model as the pedestal: ~2.9 m across, its deck at y = 0 where the character stands */
  usePlatform(gltf) {
    const p = gltf.scene.clone(true);
    p.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(p), size = box.getSize(new THREE.Vector3());
    const k = 2.9 / Math.max(size.x, size.z);
    p.scale.setScalar(k);
    // the deck: ray down through the centre (the rim can stand higher than where the feet go)
    p.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(p, true)[0];
    const deck = hit ? hit.point.y : box.max.y * k;
    p.position.y = -deck;
    p.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.envMapIntensity = 1.2; } });
    this.procPed.visible = false;
    this.pedestal.add(p);
    this.platform = p;
    p.visible = false;   // the vault-room backdrop has its own pedestal (perspective-matched); flip to true to use the 3D model
    // glow and beam sit on the deck; motes and contact shadow stay
    this.rings = [this.rings[0]];
    this.rings[0].visible = false;
  }

  instance(id) {
    if (!this.instances[id] && this.chars[id]) {
      const c = makeCharacter(this.chars[id], { shadow: false });
      c.play('Idle', 0);
      this.instances[id] = c;
    }
    return this.instances[id];
  }

  showModel(id) {
    const want = this.chars[id] ? id : null;
    if (this.shown === want) return;
    this.stand.clear();
    this.shown = want;
    if (want) { this.stand.add(this.instance(want).root); this.pop = 0; }
  }

  /** hero lighting for the characters while the preview is on screen (restored by onClose -> Look.apply) */
  setCharLight() {
    charUniforms.uCharFill.value = 0.08; charUniforms.uCharFillCol.value.set('#fff6ee');
    charUniforms.uCharRim.value = 0.2; charUniforms.uCharRimCol.value.set('#d4ffec');   // soft, near-white rim (cyan rims read as hologram)
  }

  /** frame the stage element: character centred in it, ~74% of its height */
  frameCamera(cam, W, H, rect, fit = 0.7, aim = 0.82, height = 2.25) {
    const fov = THREE.MathUtils.degToRad(cam.fov);
    const d = (height * H) / (2 * Math.tan(fov / 2) * fit * rect.height);
    cam.aspect = W / H;
    cam.position.set(0, aim + 0.25, d); cam.lookAt(0, aim, 0);
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    cam.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    cam.updateProjectionMatrix();
  }

  /** card portraits rendered from the real models (upper body, 3/4 view) into data URLs */
  useThumbs(t) {
    this.thumbs = { ...t };
    for (const s of SKINS) { const img = this.el.querySelector(`[data-skin="${s.id}"] img`); if (img && t[s.id]) img.src = t[s.id]; }
  }

  /** dev tool: load every skin and re-render the card portraits from the real models (tools/dump_thumbs.mjs) */
  async regenThumbs() {
    for (const id of this.allIds) await this.loadChar(id);
    this.makeThumbs();
    return this.thumbs;
  }

  makeThumbs() {
    const r = this.renderer, cv = r.domElement;
    const W = cv.width, H = cv.height, pr = r.getPixelRatio();
    const tw = 216, th = 252;
    const bg0 = this.scene.background, fog = this.scene.fog;
    this.scene.fog = null; this.pedestal.visible = false; this.bg.visible = false;
    const cam = new THREE.PerspectiveCamera(24, W / H, 0.1, 50);
    const out = document.createElement('canvas'); out.width = tw; out.height = th;
    const g = out.getContext('2d');
    const prevExp = r.toneMappingExposure, prevTM = r.toneMapping; r.toneMappingExposure = 1.0; r.toneMapping = THREE.NeutralToneMapping;   // the game's post stack tone-maps; this renders straight to screen
    this.setCharLight();
    const shoot = (id, rarity, silhouette) => {
      const R = RARITY[rarity];
      this.scene.background = canvasTex(256, 300, (q, w, h) => {
        const gr = q.createRadialGradient(w / 2, h * 0.38, 10, w / 2, h * 0.45, h * 0.75);
        gr.addColorStop(0, silhouette ? R.color : R.bg[0]); gr.addColorStop(silhouette ? 0.55 : 1, R.bg[silhouette ? 0 : 1]);
        if (silhouette) gr.addColorStop(1, R.bg[1]);
        q.fillStyle = gr; q.fillRect(0, 0, w, h);
      });
      // locked skins: a dark silhouette of the closest existing body type
      const srcId = this.chars[id] ? id : ({ cyber_green: 'solanagirl' }[id] || 'goldenking');
      const c = this.instance(srcId);
      this.stand.clear(); this.stand.add(c.root);
      c.root.rotation.y = -0.32; c.mixer.setTime(0.6);
      // silhouette by swapping the body's materials (scene.overrideMaterial would also paint over the background)
      const sil = this._sil ||= new THREE.MeshBasicMaterial({ color: '#03050a' });
      const saved = [];
      if (silhouette) c.model.traverse((o) => { if (o.isMesh) { saved.push([o, o.material]); o.material = sil; } });
      // aim at the chest: visible window ~ knees to above the head, sized to the card's aspect
      const crop = { w: Math.round(Math.min(W, H * tw / th) * 0.5), h: 0 }; crop.h = Math.round(crop.w * th / tw);
      const rect = { left: (W - crop.w) / 2 / pr, top: (H - crop.h) / 2 / pr, width: crop.w / pr, height: crop.h / pr };
      this.frameCamera(cam, W / pr, H / pr, rect, 0.98, 1.32, 1.2);
      r.setRenderTarget(null); r.clear(); r.render(this.scene, cam);   // the pmndrs composer turns autoClear off
      g.clearRect(0, 0, tw, th);
      g.drawImage(cv, (W - crop.w) / 2, (H - crop.h) / 2, crop.w, crop.h, 0, 0, tw, th);
      for (const [o, m] of saved) o.material = m;
      this.scene.background.dispose();
      return out.toDataURL('image/webp', 0.86);
    };
    for (const s of SKINS) this.thumbs[s.id] = shoot(s.id, s.rarity, !s.owned);
    for (const c of Object.values(this.instances)) c.root.rotation.y = 0;
    this.scene.background = bg0; this.scene.fog = fog; this.pedestal.visible = true; this.bg.visible = true;
    r.toneMappingExposure = prevExp; r.toneMapping = prevTM;
    this.shown = undefined; this.stand.clear();
    for (const s of SKINS) { const img = this.el.querySelector(`[data-skin="${s.id}"] img`); if (img) img.src = this.thumbs[s.id]; }
  }

  // ------------------------------------------------------------------ DOM
  buildDom() {
    const el = this.el = document.createElement('div');
    el.id = 'skins'; el.hidden = true;
    el.innerHTML = `
      <header class="sk-head"><div class="logo small" role="img" aria-label="BagVerse">BAGVERSE</div><span class="sk-div"></span><h1 id="sk-h1">SKIN SELECTION</h1></header>
      <div class="sk-stage" id="sk-stage">
        <svg class="sk-deco" viewBox="0 0 600 600" preserveAspectRatio="none" aria-hidden="true">
          <g class="ln"><path d="M40 70 h70 M40 70 v40 M60 150 h-20 v360 h18"/><path d="M80 210 h120 l30 30"/><circle cx="74" cy="210" r="7"/><circle cx="74" cy="210" r="2.5" class="f"/>
          <path d="M520 60 h50 v50 M570 470 v60 h-40"/><circle cx="545" cy="150" r="26"/><circle cx="545" cy="150" r="14"/><path d="M500 210 h70 M500 222 h44 M500 234 h58"/></g>
          <g class="tx"><text x="78" y="64">ID // BV-SKN</text><text x="44" y="128">OPS:LINK</text><text x="44" y="140">SYNC 98%</text><text x="500" y="256">34</text><text x="540" y="256">NO</text></g>
        </svg>
        <div class="sk-rotate">${ROTATE}<span>DRAG TO ROTATE</span><small>SCROLL / PINCH TO ZOOM</small></div>
      </div>
      <aside class="sk-info">
        <div class="sk-player"><label for="sk-pname">PLAYER NAME</label><div class="sk-prow"><input id="sk-pname" maxlength="16" placeholder="Enter your name" autocomplete="nickname" spellcheck="false" enterkeyhint="done" /><button id="sk-psave" type="button" disabled>SAVE</button></div></div>
        <div class="sk-k" id="sk-k1">SKIN INFO</div>
        <div class="sk-name" id="sk-name"></div>
        <span class="sk-pill" id="sk-pill"></span>
        <p class="sk-desc" id="sk-desc"></p>
        <div class="sk-sep"></div>
        <div class="sk-boosts">
          <div><div class="sk-k">BOOSTS</div><div class="sk-icons" id="sk-icons"></div></div>
          <button class="sk-fav" id="sk-fav" title="Add to favorites">${STAR}<span>FAVORITE</span></button>
        </div>
        <button class="sk-use" id="sk-use" hidden></button>
        <div class="sk-stats" id="sk-stats" hidden></div>
      </aside>
      <section class="sk-panel">
        <div class="sk-ptitle" id="sk-ptitle">SELECT SKIN</div>
        <div class="sk-grid" id="sk-grid">${SKINS.map((s) => this.cardHtml(s)).join('')}</div>
        <div class="sk-filters" id="sk-filters">
          <button data-f="all" class="on">ALL</button><button data-f="owned">OWNED</button><button data-f="unlocked">UNLOCKED</button><button data-f="favorites">FAVORITES</button>
        </div>
      </section>
      <footer class="sk-actions">
        <button class="sk-btn" id="sk-back">BACK</button><button class="sk-btn" id="sk-shop">SHOP</button><button class="sk-btn go" id="sk-equip">EQUIP SKIN</button>
      </footer>
      <div class="sk-toast" id="sk-toast"></div>`;
    document.body.appendChild(el);
    const $ = (id) => el.querySelector('#' + id);
    this.$ = $;
    $('sk-grid').addEventListener('click', (e) => { const c = e.target.closest('[data-skin]'); if (c) this.select(c.dataset.skin); });
    $('sk-grid').addEventListener('dblclick', (e) => { const c = e.target.closest('[data-skin]'); if (c) { this.select(c.dataset.skin); this.equip(); } });
    $('sk-filters').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) this.setFilter(b.dataset.f); });
    $('sk-fav').onclick = () => this.toggleFav();
    $('sk-back').onclick = () => this.close();
    $('sk-shop').onclick = () => this.toast(this.mode === 'collection' ? 'MARKET OPENS WITH THE BLOCKCHAIN PHASE' : 'SKIN SHOP OPENS WITH THE BLOCKCHAIN PHASE');
    $('sk-use').onclick = () => { const it = this.item(this.sel); if (it) this.useItem(it); };
    $('sk-equip').onclick = () => this.equip();
    $('sk-psave').onclick = () => this.saveName();
    $('sk-pname').addEventListener('input', () => { $('sk-pname').classList.remove('bad'); this.nameState(); });
    // drag to rotate; wheel / pinch / double-tap to zoom (mouse + touch)
    const stage = $('sk-stage'); let drag = null;
    const pts = new Map(); let pinch0 = 0, zoom0 = 1;
    const ZMAX = 2.6;
    const setZoom = (z) => { this.zoomT = Math.max(1, Math.min(ZMAX, z)); stage.classList.toggle('zoomed', this.zoomT > 1.05); };
    this.zoom = this.zoomT = 1;
    stage.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); stage.setPointerCapture(e.pointerId);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; zoom0 = this.zoomT; drag = null; }
      else { drag = { x: e.clientX }; stage.classList.add('drag'); }
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) { const [a, b] = [...pts.values()]; setZoom(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0); return; }
      if (!drag) return;
      const dx = e.clientX - drag.x; drag.x = e.clientX; this.yaw += dx * 0.012; this.yawV = dx * 0.012 * 60;
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; if (!pts.size) { drag = null; stage.classList.remove('drag'); } };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(this.zoomT * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false });
    stage.addEventListener('dblclick', () => setZoom(this.zoomT > 1.3 ? 1 : 2.1));
    this.setZoom = setZoom;
    this.dragging = () => !!drag;
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      const typing = e.target && e.target.id === 'sk-pname';
      if (typing && e.key !== 'Enter' && e.key !== 'Escape') return;   // letters and arrows belong to the name field
      if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
      if (e.key === 'Enter') { e.preventDefault(); if (typing) this.saveName(); else this.equip(); }
      if (/^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
        const vis = this.visibleSkins(); const i = vis.findIndex((s) => s.id === this.sel);
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key];
        const n = vis[Math.max(0, Math.min(vis.length - 1, (i < 0 ? 0 : i) + step))];
        if (n) this.select(n.id); e.preventDefault();
      }
    }, true);
  }

  cardHtml(s) {
    const R = RARITY[s.rarity];
    return `<button class="sk-card ${s.owned ? '' : 'locked'}" data-skin="${s.id}" style="--rc:${R.color};--rb0:${R.bg[0]};--rb1:${R.bg[1]}">
      <span class="art"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">${s.owned ? '' : `<i class="lk">${LOCK}</i>`}<em class="eq">EQUIPPED</em></span>
      <b>${s.name}</b><small class="rar">${R.label}</small><small class="selt">SELECTED</small></button>`;
  }

  skin(id) { return SKINS.find((s) => s.id === id); }
  /** holder skins (src/nft-gates.js): unlocked only for the skins the server says this player's verified wallet holds */
  setHolderSkins(list = [], walletReady = false) {
    this.walletReady = walletReady;
    for (const s of SKINS) {
      const g = gateFor(s.id); if (!g) continue;
      s.gate = g; s.baseOwned ??= s.owned;
      s.owned = s.baseOwned && list.includes(s.id);
      s.lock = s.owned ? null : g.label || 'HOLDER SKIN';
      const c = this.mode === 'skins' && this.el?.querySelector(`[data-skin="${s.id}"]`);
      if (c) { c.outerHTML = this.cardHtml(s); const img = this.el.querySelector(`[data-skin="${s.id}"] img`); if (img && this.thumbs[s.id]) img.src = this.thumbs[s.id]; }
    }
    if (this.isOpen) { this.setFilter(this.filter); this.select(this.sel); }
  }
  unlocked(s) { return s.owned || (s.level != null && this.getLevel() >= s.level); }
  visibleSkins() {
    if (this.mode === 'collection') return this.items.filter((it) => this.filter === 'all' || (this.filter === 'owned' && it.owned) || (this.filter === 'cards' && it.kind === 'card') || (this.filter === 'favorites' && this.favs.has(it.id)));
    return SKINS.filter((s) => this.filter === 'all' || (this.filter === 'owned' && s.owned)
      || (this.filter === 'unlocked' && this.unlocked(s)) || (this.filter === 'favorites' && this.favs.has(s.id)));
  }

  setFilter(f) {
    this.filter = f;
    this.el.querySelectorAll('#sk-filters button').forEach((b) => b.classList.toggle('on', b.dataset.f === f));
    const vis = new Set(this.visibleSkins().map((s) => s.id));
    this.el.querySelectorAll('.sk-card').forEach((c) => { c.hidden = !vis.has(c.dataset.skin); });
    this.$('sk-grid').classList.toggle('empty', vis.size === 0);
    this.$('sk-grid').dataset.empty = f === 'favorites' ? 'Tap ★ FAVORITE on an item to pin it here' : f === 'cards' ? 'No cards yet. Win one in the Wano or Kanto Vault raffles.' : 'Nothing here yet';
  }

  select(id) {
    if (this.mode === 'collection') return this.selectItem(id);
    const s = this.skin(id); if (!s) return;
    this.sel = id;
    const R = RARITY[s.rarity];
    this.$('sk-name').textContent = s.name;
    const pill = this.$('sk-pill'); pill.textContent = R.label.toUpperCase(); pill.style.setProperty('--rc', R.color);
    this.$('sk-desc').textContent = s.desc;
    this.$('sk-icons').innerHTML = s.boosts.map(([ic, label], i) => `<span class="${i === 0 ? 'on' : ''}" title="${label}">${ICONS[ic]}</span>`).join('');
    this.$('sk-fav').classList.toggle('on', this.favs.has(id));
    const eq = this.getEquipped();
    this.el.querySelectorAll('.sk-card').forEach((c) => {
      c.classList.toggle('sel', c.dataset.skin === id);
      c.classList.toggle('equipped', c.dataset.skin === eq);
    });
    this.el.querySelector(`[data-skin="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    const btn = this.$('sk-equip');
    if (!s.owned && s.gate) {   // holder skin: the button leads to the wallet
      btn.disabled = false; btn.textContent = this.walletReady ? 'HOLDERS ONLY' : 'CONNECT WALLET';
    } else if (!s.owned) {
      btn.disabled = true;
      btn.textContent = s.lock ? 'LOCKED' : this.unlocked(s) ? 'COMING SOON' : `LOCKED · LV ${s.level}`;
    } else { btn.disabled = false; btn.textContent = id === eq ? 'EQUIPPED ✓' : 'EQUIP SKIN'; }
    const stage = this.$('sk-stage');
    const loading = s.owned && !this.chars[id];
    this.showModel(s.owned ? id : null);
    stage.classList.toggle('nomodel', !s.owned || loading);
    stage.dataset.lock = loading ? 'LOADING SKIN…' : s.owned ? '' : (s.lock || (this.unlocked(s) ? 'COMING SOON' : `UNLOCKS AT LV ${s.level}`));
    if (loading) {   // fetch the model on first pick; the equip button waits for it
      btn.disabled = true; btn.textContent = 'LOADING…';
      this.loadChar(id).then(() => { if (this.sel === id && this.isOpen) this.select(id); })
        .catch(() => { if (this.sel === id) { stage.dataset.lock = 'COULD NOT LOAD · PRESS RETRY'; btn.disabled = false; btn.textContent = 'RETRY'; } });
    }
  }

  toggleFav() {
    if (!this.sel) return;
    this.favs.has(this.sel) ? this.favs.delete(this.sel) : this.favs.add(this.sel);
    store.set('bagverse.favs', [...this.favs]);
    this.$('sk-fav').classList.toggle('on', this.favs.has(this.sel));
    if (this.filter === 'favorites') this.setFilter('favorites');
  }

  /** the typed name, cleaned (letters, digits, _ . -; 2–16 chars), or null when it is not valid yet */
  typedName() {
    const v = (this.$('sk-pname').value || '').trim().replace(/\s+/g, '_').replace(/[^\w.-]/g, '').slice(0, 16);
    return v.length >= 2 ? v : null;
  }
  /** keep the name: required the first time; later an empty field just keeps the old name */
  commitName() {
    const n = this.typedName();
    if (n) { if (n !== this.getName?.()) this.setName?.(n); return true; }
    if (this.needName?.()) {
      this.toast('ENTER YOUR PLAYER NAME (2–16 LETTERS)');
      const f = this.$('sk-pname'); f.classList.remove('bad'); void f.offsetWidth; f.classList.add('bad'); f.focus();
      return false;
    }
    return true;
  }

  /** SAVE button: store the typed name now, without equipping or closing */
  saveName() {
    const n = this.typedName();
    if (!n) { this.commitName() && this.toast('ENTER YOUR PLAYER NAME (2–16 LETTERS)'); return; }
    const same = n === this.getName?.() && !this.needName?.();
    if (!this.commitName()) return;
    const f = this.$('sk-pname'); f.value = n; f.blur();
    this.toast(same ? 'NAME ALREADY SAVED' : 'NAME SAVED: ' + n);
    this.nameState();
  }
  /** button reads SAVE while the field differs from the stored name, SAVED ✓ once it matches */
  nameState() {
    const b = this.$('sk-psave'); if (!b) return;
    const n = this.typedName(), saved = !!n && n === this.getName?.() && !this.needName?.();
    b.disabled = !n || saved; b.textContent = saved ? 'SAVED ✓' : 'SAVE'; b.classList.toggle('ok', saved);
  }

  equip() {
    if (this.mode === 'collection') { this.setZoom(this.zoomT > 1.3 ? 1 : 2.1); this.$('sk-equip').textContent = this.zoomT > 1.3 ? 'BACK TO STAND' : 'VIEW SLAB'; return; }
    if (!this.commitName()) return;
    const s = this.skin(this.sel);
    if (s && !s.owned && s.gate) { this.toast(String(s.lock).toUpperCase()); this.onGate?.(s); return; }
    if (!s || !s.owned) { this.toast(s?.lock ? s.lock.toUpperCase() : 'SKIN LOCKED'); return; }
    if (!this.chars[s.id]) { this.select(s.id); return; }   // still loading (or retry after a failed load)
    this.onEquip(s.id);
    this.close();
  }

  // ------------------------------------------------------------------ COLLECTION (inventory): every item as a graded slab
  setMode(mode) {
    const col = mode === 'collection';
    this.mode = col ? 'collection' : 'skins';
    this.el.classList.toggle('collection', col);
    this.$('sk-h1').textContent = col ? 'COLLECTION' : 'SKIN SELECTION';
    this.$('sk-k1').textContent = col ? 'ITEM INFO' : 'SKIN INFO';
    this.$('sk-ptitle').textContent = col ? 'SELECT SLAB' : 'SELECT SKIN';
    this.$('sk-shop').textContent = col ? 'MARKET' : 'SHOP';
    this.$('sk-filters').innerHTML = col
      ? '<button data-f="all">ALL</button><button data-f="owned">OWNED</button><button data-f="cards">CARDS</button><button data-f="favorites">FAVORITES</button>'
      : '<button data-f="all">ALL</button><button data-f="owned">OWNED</button><button data-f="unlocked">UNLOCKED</button><button data-f="favorites">FAVORITES</button>';
    if (col && this.filter === 'unlocked') this.filter = 'all';
    if (!col && this.filter === 'cards') this.filter = 'all';
    this.$('sk-use').hidden = !col; this.$('sk-stats').hidden = !col;
    this.stand.clear(); this.shown = undefined; this.slab = null;
    if (col) {
      this.items = this.collectionItems();
      this.$('sk-grid').innerHTML = this.items.map((it) => this.slabCardHtml(it)).join('');
      this.renderStats();
    } else {
      this.$('sk-grid').innerHTML = SKINS.map((x) => this.cardHtml(x)).join('');
      this.useThumbs(Object.keys(this.thumbs).length ? this.thumbs : { ...THUMBS, ...ART });
    }
  }
  collectionItems() {
    const skins = SKINS.filter((x) => x.owned || x.gate).map((x) => {
      const R = RARITY[x.rarity], gr = SKIN_GRADE[x.rarity] || SKIN_GRADE.common;
      return { id: 'skin:' + x.id, kind: 'skin', skin: x.id, name: x.name, sub: `BagVerse Skin · ${R.label}`, rarity: x.rarity, color: R.color,
        cert: 'BV-' + [...x.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7).toString().slice(-8).padStart(8, '0'),
        grade: { co: 'BVG', ...gr }, img: ART[x.id] || this.thumbs[x.id] || THUMBS[x.id], owned: !!x.owned, lock: x.owned ? null : x.lock, desc: x.desc, boosts: x.boosts };
    });
    const cards = (this.getCards?.() || []).map((c) => ({ kind: 'card', rarity: 'legendary', color: RARITY.legendary.color, ...c }));
    return [...cards.filter((c) => c.owned), ...skins.filter((x) => x.owned), ...cards.filter((c) => !c.owned), ...skins.filter((x) => !x.owned)];
  }
  item(id) { return this.items.find((x) => x.id === id); }
  slabCardHtml(it) {
    const R = RARITY[it.rarity] || RARITY.common;
    const lbl = `<span class="sl-lbl ${it.grade.co === 'BVG' ? 'bvg' : ''}"><i>${it.grade.co}</i><em>${it.name}</em><b>${it.grade.n}</b></span>`;
    return `<button class="sk-card slab-card ${it.owned ? '' : 'locked'}" data-skin="${it.id}" style="--rc:${R.color};--rb0:${R.bg[0]};--rb1:${R.bg[1]}">
      <span class="art slab">${it.slabPhoto ? '' : lbl}<img alt="" src="${it.thumb || it.img}" class="${it.slabPhoto ? 'photo' : ''}">${it.owned ? '' : `<i class="lk">${LOCK}</i>`}<em class="eq">EQUIPPED</em></span>
      <b>${it.name}</b><small class="rar">${it.owned ? `${it.grade.co} ${it.grade.n}` : it.kind === 'card' ? 'RAFFLE PRIZE' : 'LOCKED'}</small><small class="selt">SELECTED</small></button>`;
  }
  renderStats() {
    const st = this.getStats?.() || [];
    const owned = this.items.filter((x) => x.owned).length;
    this.$('sk-stats').innerHTML = [['SLABS', `${owned} / ${this.items.length}`], ...st].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
  }
  selectItem(id) {
    const it = this.item(id); if (!it) return;
    this.sel = id;
    const R = RARITY[it.rarity] || RARITY.common;
    this.$('sk-name').textContent = it.name;
    const pill = this.$('sk-pill'); pill.innerHTML = `${it.grade.co} ${it.grade.n}<span class="pl-r"> ${`${it.grade.word} / ${R.label}`.toUpperCase()}</span>`; pill.style.setProperty('--rc', R.color);
    this.$('sk-desc').textContent = it.owned ? it.desc : `${it.lock ? it.lock + '. ' : ''}${it.desc || ''}`;
    this.$('sk-icons').innerHTML = (it.boosts || []).map(([ic, label], i) => `<span class="${i === 0 ? 'on' : ''}" title="${label}">${ICONS[ic]}</span>`).join('');
    this.$('sk-fav').classList.toggle('on', this.favs.has(id));
    const eq = this.getEquipped();
    this.el.querySelectorAll('.sk-card').forEach((c) => { c.classList.toggle('sel', c.dataset.skin === id); c.classList.toggle('equipped', c.dataset.skin === 'skin:' + eq); });
    this.el.querySelector(`[data-skin="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    const btn = this.$('sk-equip'); btn.disabled = false; btn.textContent = this.zoomT > 1.3 ? 'BACK TO STAND' : 'VIEW SLAB';
    const use = this.$('sk-use');
    if (it.kind === 'skin' && it.owned) { use.hidden = false; use.disabled = it.skin === eq; use.textContent = it.skin === eq ? 'EQUIPPED ✓' : 'EQUIP THIS SKIN'; }
    else if (it.url) { use.hidden = false; use.disabled = false; use.textContent = it.owned ? 'VIEW ON-CHAIN ↗' : 'SEE THE PRIZE ↗'; }
    else if (!it.owned && it.kind === 'card') { use.hidden = false; use.disabled = false; use.textContent = 'HOW TO WIN IT'; }
    else use.hidden = true;
    const stage = this.$('sk-stage'); stage.classList.remove('nomodel'); stage.dataset.lock = '';
    stage.classList.toggle('lockedslab', !it.owned);
    loadImage(it.img).then((img) => {
      if (this.sel !== id || this.mode !== 'collection') return;
      if (this.slab) { this.stand.remove(this.slab); this.slab.userData.dispose?.(); }
      this.slab = makeSlab(it, img); this.stand.add(this.slab); this.pop = 0;
    }).catch(() => {});
  }
  useItem(it) {
    if (it.kind === 'skin' && it.owned) { if (!this.chars[it.skin]) { this.loadChar(it.skin).then(() => this.useItem(it)); return; } this.onEquip(it.skin); this.toast('SKIN EQUIPPED · ' + it.name); this.selectItem(it.id); return; }
    this.onUse?.(it);
  }

  toast(msg) {
    const t = this.$('sk-toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 2200);
  }

  open(mode = 'skins') {
    if (this.isOpen) return;
    this.transition(() => this.openNow(mode));
  }
  openNow(mode) {
    if (this.isOpen) return;
    this.setMode(mode);
    // the world's per-preset character lighting is restored on close
    this._char = Object.fromEntries(Object.entries(charUniforms).map(([k, u]) => [k, u.value.clone ? u.value.clone() : u.value]));
    if (!Object.keys(this.thumbs).length) this.useThumbs({ ...THUMBS, ...ART });
    this.isOpen = true; this.el.hidden = false;
    const f = this.$('sk-pname'); f.classList.remove('bad');
    f.value = this.needName?.() ? '' : this.getName?.() || '';
    this.nameState();
    if (this.needName?.()) setTimeout(() => { if (this.isOpen && !matchMedia('(pointer: coarse)').matches) f.focus(); }, 300);   // phones: no keyboard pop-up until they tap
    this.setFilter(this.filter);
    this.select(this.mode === 'collection' ? (this.items.find((x) => x.skin === this.getEquipped()) || this.items[0])?.id : this.getEquipped());
    this.yaw = 0; this.yawV = 0; this.setZoom?.(1);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  close() {
    if (!this.isOpen) return;
    if (!this.commitName()) return;   // first entry: a name is required before playing
    this.transition(() => this.closeNow());
  }
  closeNow() {
    if (!this.isOpen) return;
    this.isOpen = false; this.el.hidden = true;
    for (const [k, v] of Object.entries(this._char || {})) { const u = charUniforms[k]; if (u.value.copy) u.value.copy(v); else u.value = v; }
    this.onClose?.();
  }

  /** advance + draw the preview (called by the game loop instead of the world render while open) */
  frame(dt) {
    this.t += dt;
    if (!this.dragging()) { this.yaw += this.yawV * dt; this.yawV *= Math.exp(-4 * dt); }
    const c = this.mode === 'skins' && this.shown && this.instances[this.shown];
    if (this.mode === 'collection' && this.slab) {
      this.pop = Math.min(1, this.pop + dt * 3.5);
      const k = 1 - Math.pow(1 - this.pop, 3);
      this.slab.rotation.y = this.yaw + Math.sin(this.t * 0.7) * 0.18 * (this.dragging() ? 0 : 1);
      this.slab.position.y = 1.2 + Math.sin(this.t * 1.3) * 0.035 + (1 - k) * 0.25;
      this.slab.scale.setScalar(0.85 + 0.15 * k);
    }
    if (c) {
      c.root.rotation.y = this.yaw;
      this.pop = Math.min(1, this.pop + dt * 4);
      const k = 1 - Math.pow(1 - this.pop, 3);
      c.root.scale.setScalar(0.92 + 0.08 * k); c.root.position.y = (1 - k) * 0.12;
      c.mixer.update(dt);
    }
    // motes rising through the beam
    const m = this.motes, p = m.pts.geometry.attributes.position;
    m.seed.forEach(([a, r, ph], i) => {
      const y = ((this.t * 0.16 + ph) % 1) * 2.2;
      p.setXYZ(i, Math.cos(a + this.t * 0.25) * r, 0.05 + y, Math.sin(a + this.t * 0.25) * r);
    });
    p.needsUpdate = true;
    m.pts.material.opacity = 0.75;
    const pulse = 0.8 + 0.2 * Math.sin(this.t * 2.2);
    this.rings[0].material.color.setRGB(0.56 * pulse + 0.2, 0.98 * pulse, pulse);
    // camera follows the stage box (between the panels)
    const r = this.renderer, size = r.getSize(new THREE.Vector2());
    const rect = this.$('sk-stage').getBoundingClientRect();
    // closer default framing (full body, pedestal top) easing toward a chest-up portrait as you zoom in
    this.zoom += (this.zoomT - this.zoom) * (1 - Math.exp(-10 * dt));
    const zt = (this.zoom - 1) / 1.6, ez = zt * zt * (3 - 2 * zt);
    if (this.mode === 'collection') { const h0 = this.touch ??= matchMedia('(pointer: coarse)').matches; this.frameCamera(this.cam, size.x, size.y, rect, 0.86, 1.14 + 0.08 * ez, (h0 ? 1.75 : 2.05) - 0.7 * ez); }
    else this.frameCamera(this.cam, size.x, size.y, rect, 0.86, 0.98 + 0.5 * ez, 2.05 - 1.15 * ez);
    // pin the painted pedestal deck (image px 1288,1095; ~830 px across) under the feet: px-per-metre at the deck
    this.cam.updateMatrixWorld();
    const pr = r.getPixelRatio();
    const P0 = new THREE.Vector3(0, 0, 0).project(this.cam), P1 = new THREE.Vector3(1.3, 0, 0).project(this.cam);
    const sx = (v) => (v.x * 0.5 + 0.5) * size.x, sy = (v) => (0.5 - v.y * 0.5) * size.y;
    const pxPerM = Math.abs(sx(P1) - sx(P0)) / 1.3;
    const u = this.bg.material.uniforms;
    const cover = Math.max(size.x / 2576, size.y / 1438) * 1.02;
    u.uScale.value = Math.max(cover, pxPerM * 2.6 / 830) * pr;
    u.uAnchor.value.set(sx(P0) * pr, sy(P0) * pr);
    u.uScreen.value.set(size.x * pr, size.y * pr);
    this.setCharLight();
    const exp = r.toneMappingExposure, tm = r.toneMapping; r.toneMappingExposure = 1.0; r.toneMapping = THREE.NeutralToneMapping;
    r.setRenderTarget(null); r.clear(); r.render(this.scene, this.cam);   // the pmndrs composer turns autoClear off
    r.toneMappingExposure = exp; r.toneMapping = tm;
  }
}
