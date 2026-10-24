import * as THREE from 'three';
// fonts ship with the game (no Google Fonts round-trip; also works offline / behind strict hosts)
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/permanent-marker/latin-400.css';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'postprocessing';
import { Look, PRESETS, ORDER } from './look.js';
import { Grass } from './grass.js';
import { Trees } from './trees.js';
import { Kit } from './kit.js';
import { placeBillboardModels } from './standees.js';
import { prepareVaults, placeVaults, vaultFront, VAULTS } from './landmarks.js';
import { NightLights } from './nightlights.js';
import { applySurfaces, surfaceUniforms, charUniforms } from './surface.js';
import { applyPaintTo, paintUniforms } from './paint.js';
import { acceleratedRaycast } from 'three-mesh-bvh';
import { Input } from './input.js';
import { World } from './world.js';
import { RWA_ASSETS, shortMint } from './rwa.js';
import { SkinScreen, SKINS } from './skins.js';
import { Player, FollowCamera, say, setEmoteLoader, ensureClip, twoBoneIK, armChains } from './player.js';
import { Crowd } from './npcs.js';
import { Car } from './vehicle.js';
import { HUD } from './hud.js';
import { Progress, REWARDS, weekKey } from './progression.js';
import { Quests, DISTRICTS } from './quests.js';
import { Collectibles, TIER_LEVEL, setBagModels } from './collectibles.js';
import { MissionsUI } from './missions_ui.js';
import { Audio } from './audio.js';
import { BagRun, RunUI } from './minigames/bagrun.js';
import { TileDrop } from './minigames/tiledrop.js';
import { Multiplayer } from './multiplayer.js';
import { Leaderboard } from './leaderboard.js';
import { Wallet, short as shortAddr, MOBILE as WALLET_MOBILE } from './wallet.js';
import { NFT_GATES, gateFor } from './nft-gates.js';
import { Raffles, countdown } from './raffles.js';
import { fx } from './fx.js';

THREE.Mesh.prototype.raycast = acceleratedRaycast;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const FIXED_DT = params.has('fixeddt') ? (parseFloat(params.get('fixeddt')) || 1 / 30) : 0;   // deterministic stepping for automated tests
fx.enabled = !FIXED_DT && !params.has('nofade');   // screen fades (tests take screenshots straight away)

// ---------------------------------------------------------------- graphics quality + crash safety
// Three tiers. A session that dies (tab crash, GPU reset) leaves a "boot" flag behind, so the next load
// starts one tier lower; a lost WebGL context restarts immediately one tier lower; and a session that runs
// slowly drops a tier live. The GFX button in the HUD cycles tiers by hand.
const QUALITIES = ['low', 'medium', 'high'];
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} },
};
const MOBILE = /Android|iPhone|iPad/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);   // iPadOS reports as a Mac
// one-time reset (v2 render pipeline): tiers that were lowered automatically by older crash heuristics go back to default
if (store.get('bagverse.pipeline') !== '3') { store.set('bagverse.q', null); store.set('bagverse.boot', null); store.set('bagverse.pipeline', '3'); }   // v3: everyone back to the LOW default once
let quality = params.get('q') || (params.has('low') ? 'low' : null) || store.get('bagverse.q') || 'low';   // LOW by default on every device; GFX button raises it
if (!QUALITIES.includes(quality)) quality = 'low';
let crashNote = null;
if (store.get('bagverse.boot') && !params.has('q') && !FIXED_DT) {
  const lower = QUALITIES[Math.max(0, QUALITIES.indexOf(quality) - 1)];
  if (lower !== quality) { crashNote = `The last session didn't close cleanly, so graphics were lowered to ${lower.toUpperCase()}. Use the GFX button to change it.`; quality = lower; store.set('bagverse.q', quality); }
  else if (quality === 'low' && !store.get('bagverse.safe')) {   // already LOW and still dying (iOS Safari memory kills): go lighter
    store.set('bagverse.safe', '1');
    crashNote = 'The last session didn\'t close cleanly, so SAFE MODE is on (fewer effects and NPCs). Pick a GFX tier to leave it.';
  }
}
// SAFE: below LOW for phones that still run out of memory: no grass or shadows, 4 NPCs, one character model, lower resolution
const SAFE = !!store.get('bagverse.safe') && (params.get('q') || quality) === 'low';
const markBoot = () => store.set('bagverse.boot', String(Date.now()));
const clearBoot = () => store.set('bagverse.boot', null);
if (!FIXED_DT) markBoot();
addEventListener('pagehide', clearBoot);
document.addEventListener('visibilitychange', () => (document.hidden ? clearBoot() : FIXED_DT || markBoot()));
const Q = {
  high:   { ao: true,  csm: true,  gi: true,  surf: true,  grass: 90000, grassR: 42, dpr: 1.5, npcs: 16, aa: true },
  medium: { ao: true,  csm: false, gi: true,  surf: true,  grass: 40000, grassR: 32, dpr: 1.0, npcs: 12, aa: true },
  low:    { ao: false, csm: false, gi: false, surf: false, grass: 14000, grassR: 22, dpr: 1.0, npcs: 8,  aa: false },
}[quality];
const LOW = quality === 'low';
if (SAFE) Object.assign(Q, { grass: 0, npcs: 4 });
// LOW loads the phone copies of textured assets (<name>.m.glb: textures capped at 512 px for the world and props,
// 1024 px for characters and the platform; built by `npm run build:mobile`)
const A = (name) => `assets/${name}${LOW ? '.m' : ''}.glb`;

// ---------------------------------------------------------------- renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance' });
// cap the internal resolution by total pixels: the post stack (AO, bloom mips, composer targets) scales with it,
// and a 4K / high-DPI screen at 1.5x would otherwise allocate hundreds of MB of GPU memory
const MAX_PX = SAFE ? 0.7e6 : { high: 2.6e6, medium: 2.0e6, low: 1.2e6 }[quality];
const pixelRatio = () => Math.max(0.5, Math.min(devicePixelRatio, Q.dpr, Math.sqrt(MAX_PX / (innerWidth * innerHeight))));
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight);
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  const lower = QUALITIES[Math.max(0, QUALITIES.indexOf(quality) - 1)];
  store.set('bagverse.q', lower); clearBoot();
  if (quality === 'low') store.set('bagverse.safe', '1');   // already at the bottom: next run in SAFE mode
  const o = document.createElement('div'); o.id = 'gfxcrash';
  o.innerHTML = `<b>GRAPHICS RESET</b><span>Your GPU dropped the game. Restarting at ${lower.toUpperCase()} quality…</span>`;
  document.body.appendChild(o);
  setTimeout(() => location.reload(), 1800);
});
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
const look = new Look(renderer, scene, camera, { smaa: LOW || !renderer.capabilities.isWebGL2, low: LOW, ao: Q.ao && !params.has('noao'), csm: Q.csm && !params.has('nocsm'), gi: Q.gi && !params.has('nogi') });
if (SAFE) { renderer.shadowMap.enabled = false; look.sun.castShadow = false; }
// HIGH / MEDIUM: render the post stack into a 4x MSAA half-float target (clean edges; post-processing otherwise
// disables the canvas' own antialiasing). LOW / WebGL1: SMAA pass at the end instead.
const MSAA = !LOW && renderer.capabilities.isWebGL2;
const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: MSAA ? 4 : 0 });
look.buildComposer(composer, { high: quality === 'high' });
let lookName = params.get('look') || store.get('bagverse.look') || 'day';
if (!PRESETS[lookName]) lookName = 'day';

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); look.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- loading
const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager);
loader.setMeshoptDecoder(MeshoptDecoder);
const prog = {};
// world + boot characters + 3 props + tree + kit (characters are counted once their list is known)
let LOAD_COUNT = 15 + (params.has('car') ? 1 : 0) + (SAFE ? 1 : { low: 3, medium: 5, high: 16 }[quality]);
const onProg = (key) => (e) => {
  prog[key] = e.total ? e.loaded / e.total : 0.5;
  const v = Object.values(prog); const p = v.reduce((a, b) => a + b, 0) / LOAD_COUNT;
  $('loadbar').style.width = (p * 100).toFixed(0) + '%'; $('loadtxt').textContent = (p * 100).toFixed(0) + '%';
};
// Hosts that can't serve .glb (e.g. claude.ai artifacts) get base64 copies: set window.BAGVERSE_B64 = true.
// LOW: once a texture is on the GPU, close its decoded ImageBitmap. iOS Safari counts those decoded copies against
// the tab's memory limit, and three never needs them again (a lost context reloads the page anyway).
function releaseImagesAfterUpload(g) {
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) for (const v of Object.values(m)) {
      if (v && v.isTexture && !v.isCanvasTexture && !v._bvRelease) {
        v._bvRelease = true;
        const prev = v.onUpdate;
        v.onUpdate = (t) => { prev?.(t); const im = t.image; if (im && typeof im.close === 'function') { const w = im.width, h = im.height; im.close(); t.image = { width: w, height: h }; } };
      }
    }
  });
  return g;
}
async function loadModel(url, key, ldr = loader) {
  const g = await loadModelRaw(url, key, ldr);
  return LOW ? releaseImagesAfterUpload(g) : g;
}
async function loadModelRaw(url, key, ldr = loader) {
  const prog = key ? onProg(key) : () => {};
  if (!window.BAGVERSE_B64) return ldr.loadAsync(url, prog);
  const res = await fetch(url + '.txt');
  const total = +res.headers.get('content-length') || 0, reader = res.body.getReader();
  const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; prog({ loaded: got, total }); }
  let txt = new TextDecoder().decode(await new Blob(chunks).arrayBuffer()); chunks.length = 0;
  let raw = atob(txt.trim()); txt = null;
  const bin = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
  raw = null;
  return ldr.parseAsync(bin.buffer, '');
}
// lazy assets (long emotes): own loader, so they never touch the loading screen's progress manager
const lazyLoader = new GLTFLoader(); lazyLoader.setMeshoptDecoder(MeshoptDecoder);
setEmoteLoader((url) => loadModel(url, null, lazyLoader));
// one at a time: keeps peak memory low on phones and integrated GPUs
const worldGltf = await loadModel(A('bag_square'), 'world');
// characters load on demand: the player's skin + a few crowd models up front (fewer on phones), every other
// skin the first time it is picked on the selection screen. LOW also caps character textures at 1024 px.
const CHAR_IDS = ['goldenking', 'habibi', 'shiba', 'solanagirl', 'witch', 'vampire', 'scream', 'frankie', 'kaizokuguy', 'kaizokugirl', 'rizzmas', 'santagirl', 'elf', 'pepe', 'santa', 'undead'];   // Maria retired (Habibi Guy took her slot); Solana Girl replaced Solana Queen
const CHARS = {}, charLoads = {};
let charId = params.get('char') || store.get('bagverse.char') || 'goldenking';
if (charId === 'queen') charId = 'solanagirl';   // Solana Queen retired: her owners get Solana Girl
if (!CHAR_IDS.includes(charId)) charId = 'goldenking';
const CROWD_N = SAFE ? 1 : { low: 3, medium: 5, high: 16 }[quality];
const crowdIds = [charId, ...CHAR_IDS.filter((id) => id !== charId)].slice(0, CROWD_N);
function capTextures(g, max) {
  const done = new Set();
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
      const t = m[k]; const img = t && t.image;
      if (!img || done.has(t) || Math.max(img.width, img.height) <= max) continue;
      const f = max / Math.max(img.width, img.height), c = document.createElement('canvas');
      c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      if (img.close) img.close();          // free the full-size ImageBitmap
      t.image = c; t.needsUpdate = true; done.add(t);
    }
  });
}
function loadChar(id, key = null) {
  return (charLoads[id] ||= loadModel(A(id), key, key ? loader : lazyLoader).then((g) => {
    g.userData.charId = id;   // lazy emote clips are per character
    if (LOW) capTextures(g, 1024);
    CHARS[id] = g;
    return g;
  }).catch((e) => { delete charLoads[id]; throw e; }));
}
for (const id of crowdIds) await loadChar(id, id);   // one at a time: keeps peak memory low on phones
const propGltfs = {
  bull: await loadModel(A('bull'), 'bull'),
  pepe_bust: await loadModel(A('pepe_bust'), 'pepe_bust'),
  platform: await loadModel(A('platform'), 'platform'),
};
const treeGltf = await loadModel(A('tree'), 'tree');
const kitGltf = await loadModel(A('kit'), 'kit');
// the street cars (Black Race Touring, Silver Retro, Flying Transport x paints) are instanced like kit assets
const carsGltf = await loadModel(A('cars'), 'cars');
// vehicles. The Vision 1789 car is parked for now (not enough road in the Square): ?car brings it back.
// Scooters are what players ride: summoned from their garage (the punk scooter is owned by default while testing).
const visionGltf = params.has('car') ? await loadModel(A('vision'), 'vision').catch((e) => { console.warn('vision car failed to load', e); return null; }) : null;
const standeeGltf = await loadModel('assets/standing_billboard.glb', 'standing_billboard').catch((e) => { console.warn('standing billboard failed', e); return null; });
const archGltf = await loadModel('assets/billboard_archway.glb', 'billboard_archway').catch((e) => { console.warn('archway billboard failed', e); return null; });
const vaultGltfs = {};
for (const n of ['wano_vault', 'kanto_vault']) vaultGltfs[n] = await loadModel(`assets/${n}.glb`, n).catch((e) => { console.warn('vault model failed', n, e); return null; });
for (const n of ['gm_arch', 'doge_statue']) vaultGltfs[n] = await loadModel(A(n), n).catch((e) => { console.warn('landmark model failed', n, e); return null; });   // GM arch + Doge statue (src/landmarks.js PROPS)
const bagGltfs = {};
for (const c of ['green', 'gold', 'purple']) bagGltfs[c] = await loadModel(`assets/bag_${c}.glb`, 'bag_' + c).catch((e) => { console.warn('bag model failed', c, e); return null; });
setBagModels(bagGltfs);
const scooterGltf = await loadModel(A('scooter'), 'scooter').catch((e) => { console.warn('scooter failed to load', e); return null; });
for (const r of [...carsGltf.scene.children]) kitGltf.scene.add(r);

const world = new World(scene);
prepareVaults(world, vaultGltfs);   // Wano Vault (old RWA Vault) + Kanto Vault (old APEX Arena): collider, holograms, labels
await world.init(worldGltf);
placeVaults(scene, world, vaultGltfs, { shadows: !LOW });

const kit = new Kit(scene, kitGltf, world.kitSpots, { shadows: !LOW });
world.placeProps(propGltfs, { shadows: !LOW });   // golden bull (Bull Run), Pepe bust (Swamp)
placeBillboardModels(scene, world, { totem: standeeGltf, gantry: archGltf }, { shadows: !LOW });   // the user's billboard models: plaza totems (BB_19/20), avenue gantries (BB_16-18)
const nightLights = new NightLights(scene, world.kitSpots, { count: LOW ? 0 : quality === 'medium' ? 6 : 10 });
// sharp textures at grazing angles (roads, pavements, facades seen edge-on): anisotropic filtering on every map
{
  const aniso = Math.min(LOW ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  const seen = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        const t = m && m[k];
        if (t && !seen.has(t)) { seen.add(t); t.anisotropy = aniso; t.needsUpdate = true; }
      }
    }
  });
}
look.collect(world);
const trees = new Trees(scene, treeGltf, world.treeSpots, { near: LOW ? 35 : quality === 'medium' ? 48 : 60, shadows: !LOW });
trees.update(0, camera, true);
if (Q.surf && !params.has('nosurf')) console.log('surface profiles', applySurfaces(scene));
if (!params.has('nopaint')) console.log('painted materials', applyPaintTo(scene));   // hand-painted layer, all tiers
// lawns (three.js coords: z = -Blender y): Doge & Bonk Park + HODL Heights front yards
const grass = params.has('nograss') ? null : new Grass(scene, {
  count: Q.grass, radius: Q.grassR,
  zones: [[-190, -190, -62, -64], [-48, -188, -13, -112], [13, -188, 48, -112]],
  holes: [{ circle: [-125, -125, 21.5, 26.5] }, { circle: [-125, -125, 0, 7.6] },
          { rect: [-127.2, -190, -122.8, -64] }, { rect: [-190, -127.2, -64, -122.8] }, { rect: [-104.6, -154.6, -95.4, -145.4] }],
});
const setLook = (name) => {
  lookName = name; look.apply(name);
  nightLights.setLevel(PRESETS[name].lamps || 0);
  try { look.captureGI(); if (look.giReady) look.apply(name); } catch (e) { console.warn('GI capture failed', e); }
  if (grass) { const P = PRESETS[name]; grass.setLight(new THREE.Color(P.sun), P.sunI, new THREE.Color(P.hemiSky), P.hemiI); }
  try { localStorage.setItem('bagverse.look', name); } catch (_) {}
  const b = document.getElementById('lookbtn'); if (b) b.textContent = (name === 'day' ? '☀ ' : name === 'sunset' ? '◐ ' : '☾ ') + PRESETS[name].label;
};
document.getElementById('lookbtn')?.addEventListener('click', () => setLook(ORDER[(ORDER.indexOf(lookName) + 1) % ORDER.length]));
Progress.unlockAll = params.has('unlockall');   // testing: every level gate open
const progress = new Progress();
const profile = () => ({ tag: progress.tier[1], name: progress.s.name, level: progress.s.level });
const player = new Player(CHARS[charId], world.physics, world.spawn, profile());
{ const tp = player.teleport.bind(player); player.teleport = (p) => { if (started && player.body.pos.distanceTo(p) > 25) fx.cut(); tp(p); }; }   // long jumps (fast travel, go-to, game exits) fade in
scene.add(player.root);
const cam = new FollowCamera(camera, world.physics);
cam.yaw = 0;
const input = new Input(canvas);
const hud = new HUD(world, progress);
// ---- audio (DailySounds.org files in public/sfx, synth fallbacks until they're added)
const sfx = new Audio();
document.addEventListener('click', (e) => { if (e.target.closest('button')) sfx.play('click'); }, true);
// ---- progression loop: missions (tutorial / dailies / weeklies / awards), hidden Bags + RWA kiosks, missions UI
let missionsUI = null;
const quests = new Quests(progress, { touch: input.touch, onToast: (m, kind) => { if (kind === 'big') hud.toast(m); missionsUI?.feed(m, 'quest'); sfx.play(kind === 'big' ? 'achieve' : 'success'); } });
const collect = new Collectibles(scene, world, progress);
missionsUI = new MissionsUI({ progress, quests, collect, touch: input.touch });
missionsUI.onToast = (m) => { hud.toast(m); sfx.play('gift'); };
{ const o = missionsUI.open.bind(missionsUI); missionsUI.open = (t) => { if (!missionsUI.isOpen) sfx.play('open'); o(t); }; }
// ---- mini-games: BAG RUN (portal in the plaza)
const runUI = new RunUI(() => (tileDrop.active ? tileDrop.finish(true) : bagRun.finish(true)));
const bagRun = new BagRun({ scene, world, player, progress, quests, sfx, hud, collect, ui: runUI });
bagRun.onTrip = () => { player.body.vel.x *= 0.15; player.body.vel.z *= 0.15; if (veh) veh.v *= 0.2; };
const inGame = () => bagRun.active || tileDrop.active;
function startBagRun(race = null) {
  if (inGame()) return;
  fx.through(() => startBagRunNow(race));
}
function startBagRunNow(race) {
  if (inGame()) return;
  runUI.labels(null);
  if (veh) dismount();
  if (crowd.flashmob) crowd.endFlashmob();
  hud.closeModal(); missionsUI.close();
  quests.emit('portal', 1);
  bagRun.begin(showRunResults, race);
  if (bagRun.active && race) { mp.setRace(race); mp.setRun({ id: race.id, s: 0, b: 0, d: 0 }); }
}
// portal: with teammates online you can host a race (same route + start for everyone who joins in 15 s)
function bagRunMenu() {
  if ((!mp.room && !lb.db) || inGame()) return startBagRun();
  const top = lb.top('week', 3);
  hud.modal('BAG RUN', `
    <p>60-second dash for Bags. Solo, or open a <b>race</b>: teammates get a join invite and you all start together on the same route.</p>
    ${top.length ? `<div class="lb-mini"><small>TOP THIS WEEK</small>${top.map((x, i) => `<div class="${x.me ? 'me' : ''}"><span>${i + 1}. ${x.name.replace(/[<>&"]/g, '')}</span><b>${x.score.toLocaleString()}</b></div>`).join('')}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button id="br-solo">SOLO RUN</button>${mp.room ? '<button class="ghost" id="br-race">🏁 HOST A RACE (STARTS IN 15 S)</button>' : ''}<button class="ghost" id="br-lb">🏆 LEADERBOARD</button></div>
    ${mp.room ? `<p style="opacity:.7">${mp.count ? `${mp.count} other player${mp.count > 1 ? 's' : ''} online.` : 'Nobody else is online right now, but your race stays open for 15 s.'}</p>` : ''}`);
  $('br-lb').onclick = () => lb.open('week');
  $('br-solo').onclick = () => startBagRun();
  if ($('br-race')) $('br-race').onclick = () => {
    const race = { id: Math.random().toString(36).slice(2, 10), game: 'bagrun', plan: bagRun.pickPlan(), seed: (Math.random() * 4294967295) >>> 0, at: Date.now() + 15000, host: true };
    startBagRun(race);
    hud.chat('SYSTEM', 'BagVerse', `You opened a Bag Run race. Teammates have 15 s to join.`, '#3dfff0');
  };
}
// race invites from teammates (banner + Y to join)
const invite = document.createElement('button'); invite.id = 'mpinvite'; invite.hidden = true; document.body.appendChild(invite);
const declined = new Set(); let inviteRace = null;
function joinRace(race) {
  if (!race || race.at < Date.now() + 1200) { hud.toast('THAT RACE ALREADY STARTED'); return; }
  invite.hidden = true; inviteRace = null;
  if (race.game === 'tiledrop') startTileDrop({ ...race, host: false }); else startBagRun({ ...race, host: false });
}
invite.onclick = (e) => { if (e.target.dataset.x) { declined.add(inviteRace?.id); invite.hidden = true; return; } joinRace(inviteRace); };
function raceFrame() {
  const open = !inGame() && !skins.isOpen ? mp.openRaces().filter((x) => !declined.has(x.race.id)) : [];
  if (!open.length) { invite.hidden = true; inviteRace = null; }
  else {
    const x = open[0]; inviteRace = x.race;
    const secs = Math.ceil((x.race.at - Date.now()) / 1000);
    invite.innerHTML = '';
    const t = document.createElement('span'); t.textContent = x.race.game === 'tiledrop' ? `🟩 ${x.by.toUpperCase()}'S TILE DROP MATCH · STARTS IN ${secs}s` : `🏁 ${x.by.toUpperCase()}'S BAG RUN RACE · STARTS IN ${secs}s`;
    const k = document.createElement('b'); k.textContent = input.touch ? 'TAP TO JOIN' : 'Y · JOIN';
    const c = document.createElement('i'); c.textContent = '✕'; c.dataset.x = '1';
    invite.append(t, k, c);
    if (invite.hidden) { invite.hidden = false; sfx.play('ping'); }
    if (!hud.typing && input.hit('KeyY')) joinRace(x.race);
  }
  // during a race: live score to the others + standings in the run HUD
  if (bagRun.active && bagRun.race) {
    mp.setRun({ id: bagRun.race.id, s: bagRun.score, b: bagRun.bags, d: 0 });
    if ((raceFrame.t = (raceFrame.t || 0) + 1) % 15 === 0) bagRun.ui.board(mp.raceBoard(bagRun.race.id, { name: progress.s.name.slice(0, 14), score: bagRun.score }));
    if (bagRun.race.host && bagRun.state === 'run') mp.setRace(null);   // started: stop inviting
  }
  // during a Tile Drop match: my tiles + survival out, everyone else's in
  if (tileDrop.active && tileDrop.race) {
    const id = tileDrop.race.id, T = tileDrop.state === 'run' ? tileDrop.clock - tileDrop.startClock : 0;
    mp.setRun({ id, g: 'td', s: Math.floor((tileDrop.me.out || T) * 10), d: tileDrop.me.out ? 1 : 0, tl: tileDrop.mine.map((v) => v.toString(36)).join(',') });
    const rivals = [];
    for (const r of mp.remotes.values()) {
      const x = r.p.run; if (!x || x.id !== id || r.isMe) continue;
      if (typeof x.tl === 'string' && x.tl) tileDrop.remoteTiles(x.tl.split(',').slice(0, 600).map((v) => parseInt(v, 36)).filter((v) => v >= 0 && v < 3000));
      rivals.push({ name: mp.displayName(r).slice(0, 14), out: !!x.d, t: Math.min(150, Math.max(0, +x.s || 0) / 10) });
    }
    tileDrop.rivalList = rivals;
    if (tileDrop.race.host && tileDrop.state === 'run') mp.setRace(null);
  }
}
// ---- mini-game 2: TILE DROP (portal in the plaza; the Doge Park kiosk event)
const tileDrop = new TileDrop({ scene, player, progress, quests, sfx, hud, ui: runUI, getChars: () => Object.values(CHARS) });
function startTileDrop(race = null) {
  if (inGame()) return;
  fx.through(() => startTileDropNow(race));
}
function startTileDropNow(race) {
  if (inGame()) return;
  if (veh) dismount();
  if (crowd.flashmob) crowd.endFlashmob();
  hud.closeModal(); missionsUI.close();
  quests.emit('portal', 1);
  tileDrop.begin(showTileResults, race);
  if (tileDrop.active && race) { mp.setRace(race); mp.setRun({ id: race.id, g: 'td', s: 0, d: 0, tl: '' }); }
}
function tileDropMenu() {
  if (inGame()) return;
  const S = tileDrop.S;
  hud.modal('TILE DROP', `
    <p>Three floors of tiles over the plaza. Every tile you step on falls half a second later. Drop through a floor and you land on the next; fall through the last one and you're out. <b>Last one standing wins.</b></p>
    <div class="row"><span>Your best</span><b>${S.best.toLocaleString()}</b></div>
    <div class="row"><span>Wins</span><b>${S.wins}</b></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button id="td-solo">PLAY VS BOTS</button>${mp.room ? '<button class="ghost" id="td-host">🟩 HOST A MATCH (STARTS IN 15 S)</button>' : ''}</div>
    ${mp.room ? `<p style="opacity:.7">${mp.count ? `${mp.count} other player${mp.count > 1 ? 's' : ''} online: they get a join invite.` : 'Nobody else is online right now, but your match stays open for 15 s.'}</p>` : ''}
    <p style="opacity:.7">Keep moving, jump over holes (Space), and stay near the middle.</p>`);
  $('td-solo').onclick = () => startTileDrop();
  if ($('td-host')) $('td-host').onclick = () => {
    startTileDrop({ id: Math.random().toString(36).slice(2, 10), game: 'tiledrop', seed: (Math.random() * 4294967295) >>> 0, at: Date.now() + 15000, host: true });
    hud.chat('SYSTEM', 'BagVerse', 'You opened a Tile Drop match. Teammates have 15 s to join.', '#3dfff0');
  };
}
function showTileResults(r) {
  if (r.race) { mp.setRace(null); mp.setRun({ id: r.race.id, g: 'td', s: Math.floor(r.time * 10), d: 1, w: r.win ? 1 : 0, tl: tileDrop.mine.map((v) => v.toString(36)).join(',') }); }
  if (r.quit) { hud.toast('LEFT TILE DROP'); return; }
  if (r.win) hud.chat('SYSTEM', 'Tile Drop', `${progress.s.name} won Tile Drop (${Math.floor(r.time)} s)!`, '#7cff3d');
  hud.modal(r.win ? 'TILE DROP · YOU WIN! 🏆' : 'TILE DROP · RESULTS', `
    <div class="rr-score"><small>${r.win ? 'LAST ONE STANDING' : `PLACED #${r.place} OF ${r.of}`}</small><b>${r.score.toLocaleString()}</b>${r.pb ? '<em>NEW PERSONAL BEST!</em>' : ''}</div>
    <div class="row"><span>Survived</span><b>${Math.floor(r.time)} s</b></div>
    <div class="row"><span>Personal best</span><b>${r.best.toLocaleString()}</b></div>
    <div class="row"><span>Wins</span><b>${r.wins}</b></div>
    <div class="row"><span>XP</span><b style="color:#7cff3d">+${r.xp}${r.runsToday > 10 ? ' <small style="opacity:.7">(reduced after 10 games today)</small>' : ''}</b></div>
    <div id="td-stand"></div>
    <div style="display:flex;gap:8px;margin-top:12px"><button id="td-again">PLAY AGAIN</button><button class="ghost" id="td-back">BACK TO THE SQUARE</button></div>`);
  // standings: a match keeps updating while the others are still on the tiles
  const draw = () => {
    const el = $('td-stand'); if (!el) return;
    let rows = r.standings.map((x) => ({ ...x }));
    if (r.race) {
      rows = [{ name: 'You', t: r.time, out: !r.win, w: r.win, me: true }];
      for (const p of mp.remotes.values()) { const x = p.p.run; if (x && x.id === r.race.id && !p.isMe) rows.push({ name: mp.displayName(p).slice(0, 14), t: Math.max(0, +x.s || 0) / 10, out: !!x.d && !x.w, w: !!x.w }); }
      rows.sort((a, b) => (b.w ? 1 : 0) - (a.w ? 1 : 0) || (a.out === b.out ? b.t - a.t : a.out ? 1 : -1));
    }
    el.replaceChildren(...rows.map((x, i) => { const d = document.createElement('div'); d.className = 'row' + (x.me ? ' me' : ''); const a = document.createElement('span'); a.textContent = `${i + 1}. ${x.name}${x.w ? ' · winner 🏆' : x.out ? '' : ' · still standing'}`; const b = document.createElement('b'); b.textContent = Math.floor(x.t) + ' s'; d.append(a, b); return d; }));
  };
  draw();
  if (r.race) {
    let n = 0; const iv = setInterval(() => { draw(); if (++n > 150) clearInterval(iv); }, 1000);
    const humans = r.standings.length;
    if (r.win && humans >= 2) { lb.submit({ score: null, win: true }); hud.toast('🏆 MATCH WON · +1 ON THE LEADERBOARD'); }
  }
  $('td-again').onclick = () => { hud.closeModal(); tileDropMenu(); };
  $('td-back').onclick = () => hud.closeModal();
}
function showRunResults(r) {
  if (r.race) { mp.setRace(null); mp.setRun({ id: r.race.id, s: r.quit ? 0 : r.score, b: r.bags, d: 1 }); }
  if (!r.quit) lb.submit({ score: r.score });
  if (r.quit) { hud.toast('RUN ABANDONED'); return; }
  hud.modal('BAG RUN · RESULTS', `
    <div class="rr-score"><small>${r.route ? r.route + ' · ' : ''}SCORE</small><b>${r.score.toLocaleString()}</b>${r.pb ? '<em>NEW PERSONAL BEST!</em>' : ''}</div>
    <div class="row"><span>Bags</span><b>${r.bags}${r.megas ? ` (${r.megas} mega)` : ''}</b></div>
    <div class="row"><span>Best combo</span><b>x${r.bestCombo}</b></div>
    <div class="row"><span>Trips</span><b>${r.trips}</b></div>
    <div class="row"><span>Personal best</span><b>${r.best.toLocaleString()}</b></div>
    <div class="row"><span>Best this week</span><b>${r.weekBest.toLocaleString()} <small style="opacity:.7">(counts for Bag Run tournaments)</small></b></div>
    <div class="row"><span>XP</span><b style="color:#7cff3d">+${r.xp}${r.runsToday > 10 ? ' <small style="opacity:.7">(reduced after 10 runs today)</small>' : ''}</b></div>
    ${r.race ? `<div id="rr-race"></div>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px"><button id="rr-again">RUN AGAIN</button><button class="ghost" id="rr-lb">🏆 LEADERBOARD</button><button class="ghost" id="rr-back">BACK TO THE SQUARE</button></div>`);
  $('rr-lb').onclick = () => lb.open(r.race ? 'wins' : 'week');
  if (r.race) {   // race standings: refreshed for 20 s while the others finish
    const draw = () => { const el = $('rr-race'); if (!el) return false;
      const rows = mp.raceBoard(r.race.id, { name: progress.s.name.slice(0, 14), score: r.score, done: true });
      el.replaceChildren(...[Object.assign(document.createElement('div'), { className: 'rr-rank', textContent: `RACE · YOU PLACED #${rows.findIndex((x) => x.me) + 1} OF ${rows.length}` })]
        .concat(rows.map((x, i) => { const d = document.createElement('div'); d.className = 'row' + (x.me ? ' me' : ''); const a = document.createElement('span'); a.textContent = `${i + 1}. ${x.name}${x.me ? ' (you)' : ''}${x.done ? '' : ' · still running'}`; const b = document.createElement('b'); b.textContent = x.score.toLocaleString(); d.append(a, b); return d; })));
      return true; };
    // the race is decided when everyone has finished (or after 20 s): a win with at least one rival goes on the board
    let n = 0, settled = false;
    const settle = () => { if (settled) return; settled = true; const rows = mp.raceBoard(r.race.id, { name: progress.s.name, score: r.score, done: true });
      if (rows.length >= 2 && rows[0].me && !r.quit) { lb.submit({ score: null, win: true }); hud.toast('🏆 RACE WON · +1 ON THE LEADERBOARD'); sfx.play('achieve'); } };
    draw(); const iv = setInterval(() => { const still = draw(); const rows = mp.raceBoard(r.race.id, { name: '', score: 0, done: true }); if (rows.every((x) => x.done) || ++n > 20) { settle(); clearInterval(iv); } else if (!still) { /* modal closed: keep counting */ } }, 1000);
  }
  $('rr-again').onclick = () => { hud.closeModal(); bagRunMenu(); };
  $('rr-back').onclick = () => hud.closeModal();
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && bagRun.active) bagRun.finish(true); if (e.key === 'Escape' && tileDrop.active) tileDrop.finish(true); });
const LOCK = (gate, what) => { if (progress.has(gate)) return true; hud.toast(`${what} UNLOCKS AT LV ${progress.gateLevel(gate)}`); sfx.play('error'); return false; };
player.allow = (name) => LOCK('emote:' + name, name.toUpperCase());
progress.on((ev) => {
  if (ev.type === 'xp' && ev.source === 'play') missionsUI.feed(`+${ev.amount} XP · PLAY`);
  if (ev.type === 'xp' && ['bag', 'district', 'billboard', 'flashmob', 'login'].includes(ev.source)) missionsUI.feed(`+${ev.amount} XP · ${ev.source.toUpperCase()}`);
  if (ev.type === 'level') {
    sfx.play(ev.rewards.some((r) => r.big) ? 'tier' : 'levelup');
    const r = ev.rewards.map((x) => x.label + (x.soon ? ' (soon)' : '')).join(' · ');
    hud.toast(`LEVEL ${ev.level}${r ? ' · ' + r.toUpperCase() : ''}`);
    player.refreshPlate(profile());
    if (ev.level >= 10 && ev.level - 1 < 10) hud.chat('SYSTEM', 'BagVerse', 'Lv 10: Thriller (1) and flashmobs (F) unlocked. Dailies are on the Missions tracker.', '#7cff3d');
  }
  if (ev.type === 'freeze') hud.toast('STREAK FREEZE EARNED ❄');
  if (ev.type === 'newday') { quests.refresh(); hud.chat('SYSTEM', 'BagVerse', 'New day: fresh dailies and a login reward are waiting (Missions).', '#ffc83d'); }
});
addEventListener('visibilitychange', () => { progress.hidden = document.hidden; if (document.hidden) progress.save(); });
// parked on the road just behind-left of the spawn, nose down the south avenue (the plaza is ringed by bollards
// and full of portals; tools/car_dbg2.mjs sweeps candidate spots)
const car = visionGltf ? new Car(scene, visionGltf, world.physics, new THREE.Vector3(world.spawn.x - 6, 0, world.spawn.z + 7.5), 0, { shadows: !LOW }) : null;
// scooters the player owns (garage). Built once, hidden until summoned.
const VEHICLES = { punk: { name: 'PUNK SCOOTER', gltf: scooterGltf, spec: 'scooter' } };
const scooter = scooterGltf ? new Car(scene, scooterGltf, world.physics, world.spawn.clone(), 0, { shadows: !LOW, spec: 'scooter' }) : null;
if (scooter) {
  // handlebar grips (scooter-root space), measured from the mesh: the outer ends of the bar, where hands go
  scooter.root.updateMatrixWorld(true);
  const body = scooter.model.getObjectByName('SCT_BODY'), inv = scooter.root.matrixWorld.clone().invert();
  const m = body.matrixWorld.clone().premultiply(inv), pos = body.geometry.attributes.position, v = new THREE.Vector3(), top = [];
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m); if (v.y > 0.88) top.push(v.clone()); }
  const grip = (sgn) => {
    const side = top.filter((p) => p.x * sgn > 0.12), ext = Math.max(...side.map((p) => p.x * sgn));
    const g = side.filter((p) => p.x * sgn > ext - 0.13 && p.x * sgn < ext - 0.015);
    const c = g.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(Math.max(1, g.length));
    return c.add(new THREE.Vector3(-sgn * 0.02, 0.035, -0.05));   // wrist sits just inboard, above and behind the grip centre
  };
  scooter.grips = top.length ? { L: grip(1), R: grip(-1) } : null;   // the rider faces +Z: their left is +X
  console.log('scooter grips', scooter.grips && [scooter.grips.L.toArray(), scooter.grips.R.toArray()].map((a) => a.map((x) => +x.toFixed(2))));
}
if (scooter) { scooter.root.visible = false; scooter.summoned = false; scooter.deck = scooter.model.getObjectByName('SCT_DECK')?.position.clone() || new THREE.Vector3(0, 0.06, -0.04); }
const crowd = new Crowd(scene, crowdIds.map((id) => CHARS[id]), world.physics, Q.npcs, (tag, name, msg, color) => hud.chat(tag, name, msg, color));
look.setupShadows(scene);
look.apply(lookName);
// compile every shader before the first frame, in parallel where the driver supports it
// (KHR_parallel_shader_compile). ~100 programs compiled synchronously on frame one can freeze the tab
// for seconds on some Windows/ANGLE drivers, and the browser may then kill the GPU process.
$('loadtxt').textContent = 'PREPARING GRAPHICS…';
try { await renderer.compileAsync(scene, camera); } catch (e) { console.warn('shader precompile failed', e); }
setLook(lookName);

const gfxBtn = $('gfxbtn');
if (gfxBtn) gfxBtn.textContent = 'GFX · ' + (SAFE ? 'SAFE' : quality.toUpperCase());
const sndBtn = $('soundbtn');
const sndLabel = () => { if (sndBtn) sndBtn.textContent = sfx.settings.muted ? '🔇 SOUND OFF' : '🔊 SOUND ON'; };
sndLabel(); sndBtn?.addEventListener('click', () => { sfx.toggleMute(); sndLabel(); $('hud').classList.remove('menu-open'); });
gfxBtn?.addEventListener('click', () => {
  // SAFE -> LOW -> MEDIUM -> HIGH -> LOW ... (choosing a tier by hand leaves SAFE mode)
  const next = SAFE ? 'low' : QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length];
  store.set('bagverse.q', next); store.set('bagverse.safe', null); clearBoot();
  const u = new URL(location.href); u.searchParams.delete('q'); u.searchParams.delete('low'); location.replace(u.toString());
});
// ---- Solana wallet: HUD button + connect modal
const wallet = new Wallet();
const walletBtn = $('walletbtn');
const escH = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const walletLabel = () => {
  if (!walletBtn) return;
  const a = wallet.address;
  walletBtn.textContent = a ? '◎ ' + shortAddr(a) : '◎ CONNECT WALLET'; walletBtn.classList.toggle('on', !!a);
  walletBtn.title = a ? 'Wallet linked: ' + a : 'Connect your Solana wallet';
};
wallet.toast = (m) => hud.toast(m);
wallet.onChange(() => { walletLabel(); if (hud.modalOpen && document.querySelector('.wl')) openWallet(); });
walletLabel();
function openWallet() {
  const a = wallet.address;
  const repick = wallet.repick; wallet.repick = false;
  if (a && !repick) {
    const st = wallet.status;
    const stHtml = { verified: '<b style="color:#14f195">VERIFIED ✓</b>', verifying: '<b style="color:#ffc83d">VERIFYING…</b>', offline: '<b style="color:#ffc83d">SIGNED · NOT CHECKED HERE</b>' }[st] || '<b style="color:#ff9f43">NOT VERIFIED</b>';
    const gated = NFT_GATES.map((g) => g.skin);
    const holder = gated.length ? `<div class="row"><span>Holder skins</span><b>${wallet.skins.length ? wallet.skins.map((id) => escH(SKINS.find((k) => k.id === id)?.name || id)).join(', ') : st === 'verified' ? 'None in this wallet' : '—'}</b></div>` : '';
    const note = st === 'verified' ? `Verified by the BagVerse server: this wallet belongs to <b>${escH(progress.s.name || 'you')}</b>. Raffle entries, billboard rentals and skin ownership will use it.`
      : st === 'offline' ? 'This copy of the game has no verification server, so the link only counts here. Open the game on its website to verify.'
      : st === 'verifying' ? 'Checking the signature…'
      : `The server couldn't verify this link${wallet.error ? `: <b>${escH(wallet.error)}</b>` : '.'} Sign again to verify (free, no transaction).`;
    hud.modal('◎ SOLANA WALLET', `<div class="wl">
      <div class="row"><span>Wallet</span><b>${escH(wallet.linked.wallet || 'Linked wallet')}</b></div>
      <div class="row"><span>Address</span><b class="wl-addr" title="${a}">${shortAddr(a)}</b></div>
      <div class="row"><span>Status</span>${stHtml}</div>${holder}
      <p style="opacity:.75">${note}</p>
      <div class="wl-acts">${st === 'signed' ? '<button data-w="again">SIGN AGAIN</button>' : ''}${st === 'verified' && gated.length ? '<button class="ghost" data-w="refresh">REFRESH HOLDINGS</button>' : ''}<button data-w="copy">COPY ADDRESS</button><a class="wl-btn" href="https://solscan.io/account/${a}" target="_blank" rel="noopener">VIEW ON SOLSCAN</a><button class="ghost" data-w="off">DISCONNECT</button></div></div>`);
    document.querySelector('[data-w=copy]').onclick = () => navigator.clipboard?.writeText(a).then(() => hud.toast('ADDRESS COPIED'), () => {});
    document.querySelector('[data-w=off]').onclick = async () => { await wallet.disconnect(); lb.saveProfile(); hud.toast('WALLET DISCONNECTED'); hud.closeModal(); };
    const again = document.querySelector('[data-w=again]'); if (again) again.onclick = () => { wallet.repick = true; openWallet(); };
    const rf = document.querySelector('[data-w=refresh]'); if (rf) rf.onclick = async () => { rf.disabled = true; rf.textContent = 'CHECKING…'; await wallet.refreshHoldings(); hud.toast('HOLDINGS UPDATED'); };
    return;
  }
  const ws = wallet.list();
  const list = ws.length
    ? `<div class="wl-list">${ws.map((w, i) => `<button class="wl-w" data-wi="${i}"><img src="${escH(w.icon)}" alt="" />${escH(w.name)}</button>`).join('')}</div>`
    : WALLET_MOBILE
      ? `<p>No wallet in this browser. Open BagVerse inside your wallet app:</p><div class="wl-list">${Wallet.deepLinks().map((l) => `<a class="wl-w" href="${l.href}">Open in ${l.name}</a>`).join('')}</div>`
      : `<p>No Solana wallet found in this browser. Install one, then reload:</p><div class="wl-list">${Wallet.installLinks().map((l) => `<a class="wl-w" href="${l.href}" target="_blank" rel="noopener">Get ${l.name}</a>`).join('')}</div>`;
  hud.modal('◎ CONNECT WALLET', `<div class="wl">${list}
    <p class="wl-note">You'll sign a free message to prove the wallet is yours. It sends no transaction, costs no SOL and can't move funds.</p>
    <p class="wl-err" hidden></p></div>`);
  document.querySelectorAll('[data-wi]').forEach((b) => (b.onclick = async () => {
    const err = document.querySelector('.wl-err');
    document.querySelectorAll('[data-wi]').forEach((x) => (x.disabled = true)); b.classList.add('busy'); err.hidden = true;
    try {
      const L = await wallet.connect(ws[+b.dataset.wi], progress.s.name || 'Player');
      lb.saveProfile(); sfx.play('ping');
      const v = wallet.status === 'verified', n = wallet.skins.length;
      hud.toast(v ? 'WALLET VERIFIED · ' + shortAddr(L.address) : 'WALLET LINKED · ' + shortAddr(L.address));
      hud.chat('SYSTEM', 'BagVerse', `Wallet ${shortAddr(L.address)} ${v ? 'verified for' : 'linked to'} ${progress.s.name || 'you'}.${n ? ` Holder skins unlocked: ${n}.` : ''}`, '#7cff3d');
      openWallet();
    } catch (e) {
      if (!document.querySelector('.wl-err')) return;
      err.textContent = e.message; err.hidden = false;
      document.querySelectorAll('[data-wi]').forEach((x) => (x.disabled = false)); b.classList.remove('busy');
    }
  }));
}
walletBtn?.addEventListener('click', () => { $('hud').classList.remove('menu-open'); openWallet(); });

if (crashNote) hud.chat('SYSTEM', 'BagVerse', crashNote, '#ffc83d');
hud.chat('SYSTEM', 'BagVerse', 'Welcome to The Bag Square. Visit the Wano Vault for graded One Piece card raffles; Kanto Vault (far south-east) holds the Pokémon ones.', '#7cff3d');
if (car) hud.chat('SYSTEM', 'BagVerse', 'A Vision 1789 is parked on the road behind you (gold on the minimap). Walk up and press E to drive.', '#ffc83d');
if (scooter) hud.chat('SYSTEM', 'BagVerse', `Your PUNK SCOOTER is in your garage. Press ${input.touch ? 'the 🛴 button' : 'R'} to ride.`, '#ffc83d');
// ---------------------------------------------------------------- multiplayer (claude.ai room: everyone with the page open)
const mp = new Multiplayer({
  scene, hud, loadChar: (id) => loadChar(id), validSkin: (id) => CHAR_IDS.includes(id), scooter, chatColor: '#3dfff0',
  getLocal: () => ({
    name: progress.s.name, tag: profile().tag, level: progress.s.level, skin: charId,
    pos: player.root.position, yaw: player.facing, speed: player.speed || 0,
    vel: veh ? { x: Math.sin(veh.h) * veh.v, z: Math.cos(veh.h) * veh.v } : { x: player.body.vel.x, z: player.body.vel.z },
    anim: veh === scooter && veh ? 'Ride' : player.c.anim.current?.getClip().name || 'Idle',
    ride: veh && veh === scooter ? { x: veh.pos.x, y: veh.pos.y, z: veh.pos.z, h: veh.h, p: veh.pitch, o: veh.roll, sp: veh.v } : null,
  }),
});
hud.onGoToMate = (m) => mp.goTo(m.peer);
mp.onGoTo = (p) => {
  if (veh) dismount();
  p.x += 1.6; p.y = world.physics.groundAt(p.x, p.z, p.y + 3) + 0.1;
  player.teleport(p); hud.toast('TELEPORTED TO PLAYER');
};
// shared Bag Run leaderboard (claude.ai db: one row per player, everyone reads, each writes their own)
const lb = new Leaderboard({ hud, getLocal: () => ({ name: progress.s.name, skin: charId, level: progress.s.level, wallet: wallet.status === 'verified' ? wallet.linked : null }) });
lb.init();
// a name saved online (same account on another device) fills in a browser that has none yet
lb.onMine = (row) => { if (!progress.s.nameSet && row && typeof row.n === 'string' && row.n.length >= 2) { progress.s.name = row.n.replace(/[^\w.-]/g, '').slice(0, 16); progress.s.nameSet = true; progress.save(); player.refreshPlate(profile()); const f = document.getElementById('sk-pname'); if (f && !f.value) f.value = progress.s.name; } };
addEventListener('keydown', (e) => { if (e.code === 'KeyL' && started && !hud.typing && !hud.modalOpen && !skins.isOpen && !inGame()) lb.open('week'); });
mp.init().then((ok) => { if (ok) hud.chat('SYSTEM', 'BagVerse', 'Multiplayer on: everyone with this page open is here with you (👥 at the top right).', '#3dfff0'); });
hud.onSend = (msg) => {
  hud.chat(profile().tag, progress.s.name, msg, '#7cff3d'); say(player.root, msg, player); player.bubbleT = 4.5;
  mp.chat(msg);
  quests.emit('chat', 1, { text: msg });
  if (/\bgm\b/i.test(msg)) progress.grant(25, 'gm');   // the day's first GM (capped at 25 XP/day)
};
hud.onTravel = (z) => {
  const p = z.pos.clone(); p.z += Math.min(10, z.radius * 0.4);
  p.y = world.physics.groundAt(p.x, p.z, 60) + 0.1;
  player.teleport(p); hud.toast(`FAST TRAVEL · ${z.label}`);
};
hud.onEmote = (e) => { if (player.allow(e)) player.emote = e; };
hud.onAction = (a) => {
  if (a === 'missions') { missionsUI.open(); return; }
  if (a === 'ride') { summonScooter(); return; }
  if (a === 'map') hud.mapOpen ? hud.closeMap() : hud.openMap(player.body.pos, mp.mapMates());
  else if (a === 'emotes') $('emotewheel').hidden = !$('emotewheel').hidden;
  else if (a === 'inventory') openCollection();
  else if (a === 'skins') openSkins();
  else if (a === 'chat') { $('hud').classList.add('chat-open'); $('chatin').focus(); }
  else if (a === 'menu') $('hud').classList.toggle('menu-open');
  if (a !== 'menu') $('hud').classList.remove('menu-open');
  if (a !== 'emotes') $('emotewheel').hidden = true;
};
// touch HUD: tapping the world closes the settings menu and the emote wheel
$('game').addEventListener('touchstart', () => { $('hud').classList.remove('menu-open'); $('emotewheel').hidden = true; }, { passive: true });
$('lookbtn')?.addEventListener('click', () => $('hud').classList.remove('menu-open'));

// riding: the car (E at it) or a summoned scooter (R / 🛴). One vehicle at a time in `veh`.
//  car: the player is hidden inside; scooter: the player stands on the deck and plays the Ride clip.
let veh = null, lookIdle = 0;
function mount(v) {
  if (crowd.flashmob) crowd.endFlashmob();
  player.emote = null;
  veh = v; v.driving = true; v.cool = 0.5; lookIdle = 2;
  if (v.kind === 'car') player.root.visible = false;
  cam.dist = Math.max(cam.dist, v.kind === 'car' ? 8 : 6); cam.yaw = v.h + Math.PI;
  $('hud').classList.add('driving'); $('hud').classList.remove('can-mob'); $('emotewheel').hidden = true;
  $('jumpbtn').textContent = 'BRAKE';
  hud.toast(input.touch ? `STICK ${v.kind === 'car' ? 'DRIVES' : 'RIDES'} · BRAKE · E TO GET OFF` : `W/S ${v.kind === 'car' ? 'DRIVE' : 'RIDE'} · A/D STEER · SPACE BRAKE · E GET OFF`);
  if (v.kind === 'car' && !mount.credited) { mount.credited = true; hud.chat('SYSTEM', 'BagVerse', 'Vision 1789 model by amogusstrikesback2 (Sketchfab, CC BY 4.0)', '#7cff3d'); }
}
function dismount() {
  const v = veh; if (!v) return;
  if (v === scooter) sfx.play('poof', { vol: 0.5 });
  v.driving = false; v.cool = 0.6; v.braking = true; veh = null;
  const p = v.exitSpot();
  player.teleport(p); player.facing = v.h; player.root.rotation.set(0, v.h, 0); player.root.visible = true;
  player.c.play('Idle', 0.25);
  cam.dist = Math.min(cam.dist, 6.5);
  $('hud').classList.remove('driving'); $('jumpbtn').textContent = 'JUMP';
}
const enterCar = () => car && mount(car);
/** R / 🛴: summon your scooter under you and hop on (again: get off) */
function summonScooter(id = 'punk') {
  if (veh) { if (veh === scooter) dismount(); return; }
  if (!LOCK('scooter', 'THE PUNK SCOOTER')) return;
  if (!scooter || !progress.s.vehicles.includes(id)) { hud.toast('NO SCOOTER IN YOUR GARAGE'); return; }
  const P = player.body.pos;
  scooter.pos.copy(P); scooter.h = player.facing; scooter.v = 0; scooter.steer = 0;
  scooter.settle(); scooter.root.visible = true; scooter.summoned = true; sfx.play('poof');
  if (!summonScooter.told) { summonScooter.told = true; hud.chat('SYSTEM', 'BagVerse', `${VEHICLES[id].name} summoned from your garage 🛴`, '#ffc83d'); }
  mount(scooter);
}
function driveFrame(dt) {
  const v = veh;
  $('speed').textContent = v.kmh;
  if (!v.cool && (input.hit('KeyE') || (v === scooter && input.hit('KeyR')))) { dismount(); return; }
  if (v.kind === 'scooter') {
    // stand on the deck, lean with the board; the kick cycle runs with speed and freezes when stopped
    // SCT_DECK is the rider-root point (blender/export_scooter.py): hands on the grips, front foot on the deck
    const d = scooter.deck, base = v.local(d.x, d.z);
    player.root.position.set(base.x, v.pos.y + d.y, base.z);
    player.root.rotation.set(-v.pitch, v.h, v.roll, 'YXZ');
    const c = player.c;
    if (ensureClip(c, 'Ride')) { c.play('Ride', 0.25); c.actions.Ride.timeScale = THREE.MathUtils.clamp(Math.abs(v.v) / 5, 0, 1.25); }
    else c.play('Idle', 0.25);
    c.mixer.update(dt);
    // hands on the grips: the Ride clip was made for a smaller scooter, so IK the arms onto this one's handlebar
    const arms = armChains(c);
    if (arms && v.grips) {
      player.root.updateMatrixWorld(true); v.root.updateMatrixWorld(true);
      for (const [k, side] of [['L', 1], ['R', -1]]) {
        const t = v.root.localToWorld(v.grips[k].clone());
        const pole = v.local(side * 0.9, -0.5).sub(v.pos).setY(-0.8).normalize();   // elbows out, down and back
        twoBoneIK(arms[k][0], arms[k][1], arms[k][2], t, pole);
      }
    }
  }
  // the camera swings in behind unless you've just been looking around
  lookIdle = input.look.dx || input.look.dy ? 0 : lookIdle + dt;
  if (lookIdle > 1.2 && Math.abs(v.v) > 1.5) {
    const want = v.h + (v.v < 0 ? 0 : Math.PI);
    let d = want - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    cam.yaw += d * (1 - Math.exp(-2.2 * dt));
  }
}

// flashmob: F while emoting calls the nearby crowd over to dance the same emote in sync; stopping ends it
// flashmobs are shared: the leader publishes { emote, t0 } (epoch of clip time 0); teammates within 30 m get
// "F · JOIN", dance the same emote on the same clock, and each one's NPCs fall in behind them
let mobJoin = null;   // { of, e, t0, name } while dancing in someone else's flashmob
function flashmob() {
  const pa = player.emote && player.c.actions[player.emote];
  const emoting = !!pa && player.c.anim.current === pa;
  if (mobJoin) {
    const lead = mp.remotes.get(mobJoin.of)?.p.mob;
    if (player.emote !== mobJoin.e) { mobJoin = null; mp.setMob(null); if (crowd.flashmob) crowd.endFlashmob(); hud.toast('LEFT THE FLASHMOB'); }
    else {
      if (pa && emoting) { const dur = pa.getClip().duration || 1; pa.time = (((Date.now() - mobJoin.t0) / 1000) % dur + dur) % dur; }
      if (emoting && !crowd.flashmob && !mobJoin.npcs) { mobJoin.npcs = true; crowd.startFlashmob(player); }
      if (!lead) { hud.toast('FLASHMOB OVER · GG'); player.emote = null; }
    }
  } else if (crowd.flashmob) {
    if (!player.emote) { crowd.endFlashmob(); mp.setMob(null); hud.toast('FLASHMOB OVER · GG'); }
  } else if (emoting && input.hit('KeyF') && LOCK('emote:Thriller', 'FLASHMOBS')) {
    const n = crowd.startFlashmob(player);
    const mates = mp.room ? mp.count : 0;
    if (n || mates) { sfx.play('scratch'); mp.setMob({ e: player.emote, t0: Date.now() - (pa.time / (pa.timeScale || 1)) * 1000, of: null }); }
    if (n) { quests.emit('flashmob', 1, { n }); progress.grant(50, 'flashmob'); }
    hud.toast(n ? `FLASHMOB! ${n} DANCER${n > 1 ? 'S' : ''} JOINING${mates ? ' · TEAMMATES CAN JOIN' : ''}` : mates ? 'FLASHMOB! TEAMMATES NEARBY CAN JOIN' : 'NOBODY CLOSE ENOUGH TO JOIN');
    if (n || mates) hud.chat('SYSTEM', 'BagVerse', `${progress.s.name} started a ${player.emote} flashmob 🕺`, '#ff3db4');
    if (!n && mates) crowd.flashmob = { player, emote: player.emote, facing: player.facing, solo: true };
  }
  // someone else's flashmob nearby: offer to join (F)
  const other = !mobJoin && !crowd.flashmob && !veh && !inGame() ? mp.nearbyMob(player.body.pos) : null;
  if (other && progress.has('emote:Dance') && (other.e !== 'Thriller' || progress.has('emote:Thriller'))) {
    flashmob.offer = other;
    if (input.hit('KeyF')) {
      mobJoin = { of: other.peer, e: other.e, t0: other.t0, name: other.name };
      player.emote = other.e; ensureClip(player.c, other.e);
      mp.setMob({ e: other.e, t0: other.t0, of: other.peer });
      sfx.play('scratch'); hud.toast(`JOINED ${other.name.toUpperCase()}'S FLASHMOB · MOVE TO LEAVE`);
      quests.emit('flashmob_join', 1);
    }
  } else flashmob.offer = null;
  $('hud').classList.toggle('can-mob', !!flashmob.offer || (emoting && !crowd.flashmob && !mobJoin && progress.has('emote:Thriller')));
  const mb = $('mobbtn'); if (mb) mb.textContent = flashmob.offer ? '🕺 JOIN FLASHMOB' : '🕺 FLASHMOB';
}

// ---------------------------------------------------------------- progression events from play
const lastPos = new THREE.Vector3().copy(player.body.pos);
let brakeWas = false;
let distAcc = 0, rideAcc = 0, lookAcc = 0, lookSent = false, lastZone = null, lastEmote = null, bagT = 0;
function progressFrame(dt, t) {
  const P = player.body.pos;
  // walking / riding distance (metres, sent in whole metres)
  const d = Math.hypot(P.x - lastPos.x, P.z - lastPos.z); lastPos.copy(P);
  if (d < 20) { if (veh === scooter && veh) rideAcc += d; else if (!veh) distAcc += d; }
  if (distAcc >= 1) { const n = Math.floor(distAcc); distAcc -= n; quests.emit('walk', n); }
  if (rideAcc >= 1) { const n = Math.floor(rideAcc); rideAcc -= n; quests.emit('ride', n); }
  if (!veh && input.hit('Space')) { quests.emit('jump', 1); if (player.body.onGround || player.airT < 0.12) sfx.play('jump'); }
  // continuous sound: footsteps, scooter motor, city + plaza crowd ambience
  const sp = Math.hypot(player.body.vel.x, player.body.vel.z);
  const walking = !veh && player.body.onGround && sp > 0.4;
  sfx.loop('steps', { vol: walking ? Math.min(1, 0.35 + sp / 5) : 0, rate: THREE.MathUtils.clamp(sp / 2.4, 0.8, 1.6) });
  const sv = veh === scooter && veh ? Math.abs(veh.v) : 0;
  sfx.loop('scooter', { vol: veh === scooter && veh ? 0.25 + Math.min(1, sv / 6) * 0.75 : 0, rate: 0.6 + Math.min(1, sv / 11) * 0.9 });
  if (veh === scooter && veh?.braking && !brakeWas && sv > 3) sfx.play('brake');
  brakeWas = !!(veh?.braking);
  sfx.loop('city', { vol: tileDrop.active ? 0 : bagRun.active ? 0.35 : 1, rate: 1 });
  sfx.loop('crowd', { vol: inGame() ? 0 : THREE.MathUtils.clamp(1 - Math.hypot(P.x, P.z) / 45, 0, 1), rate: 1 });
  sfx.loop('pad', { vol: 0, rate: 1 });
  if (!lookSent) { lookAcc += Math.abs(input.look.dx) + Math.abs(input.look.dy); if (lookAcc > 500) { lookSent = true; quests.emit('look', 1); } }
  if (player.emote && player.emote !== lastEmote) quests.emit('emote', 1, { name: player.emote });
  lastEmote = player.emote;
  const z = world.zoneAt(P); if (z.id !== lastZone) { lastZone = z.id; quests.emit('zone', 1, { id: z.id }); }
  // hidden Bags
  bagT -= dt;
  if (bagT <= 0) {
    bagT = 0.1;
    for (const b of collect.collect(P)) {
      progress.grant(100, 'bag'); quests.emit('bag', 1, { zone: b.zone }); sfx.play('coin');
      const dp = collect.districtProgress(b.zone);
      hud.toast(`BAG FOUND · ${b.zone.replace(/_/g, ' ').toUpperCase()} ${dp.found}/${dp.total}`);
      if (dp.found === dp.total) { progress.grant(1000, 'district'); quests.emit('districtsDone', 1); hud.toast(`DISTRICT CLEARED · +1,000 XP`); sfx.play('tier'); }
    }
  }
  // guide beacon: the tutorial's target, else nothing
  const step = quests.current;
  let target = null, color = '#7cff3d';
  if (step?.target === 'vault') { const f = vaultFront('rwa_vault'); const vz = world.zones.find((x) => x.id === 'rwa_vault'); if (f) { target = f.clone(); color = '#ffc83d'; } else if (vz) { target = vz.pos.clone(); target.y = world.physics.groundAt(vz.pos.x, vz.pos.z + 9, 8); target.z += 9; color = '#ffc83d'; } }
  else if (step?.target === 'bag') { const b = collect.nearestBag(P); if (b) target = b.pos; }
  if (bagRun.active) { target = bagRun.nextBag(P); color = '#ffc83d'; }
  collect.setBeacon(target, color);
  beaconTarget = target;
  collect.update(t, camera.position);
}
let beaconTarget = null;
function mapMarks() {
  const P = player.body.pos;
  if (bagRun.active) {   // during a run: only the course (teal bags, pink megas) and the next-bag ring
    const m = bagRun.points.filter((p) => !p.taken).map((p) => ({ x: p.pos.x, z: p.pos.z, color: p.mega ? '#b84dff' : '#ffc83d' }));
    if (beaconTarget) m.push({ x: beaconTarget.x, z: beaconTarget.z, color: '#ffc83d', shape: 'ring' });
    return m.concat(mp.marks());
  }
  const m = collect.kiosks.map((k) => ({ x: k.pos.x, z: k.pos.z, color: '#ffc83d', shape: 'diamond' }));
  for (const b of collect.bags) if (!b.found && Math.abs(b.pos.x - P.x) < 40 && Math.abs(b.pos.z - P.z) < 40) m.push({ x: b.pos.x, z: b.pos.z, color: '#5dff7a' });
  if (beaconTarget) m.push({ x: beaconTarget.x, z: beaconTarget.z, color: '#7cff3d', shape: 'ring' });
  return m.concat(mp.marks());
}

// ---------------------------------------------------------------- vaults (raffles)
const raffles = new Raffles();
const escR = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
raffles.onDrawn = (r, mine) => {
  const vault = r.vault === 'wano' ? 'WANO VAULT' : 'KANTO VAULT', prize = r.prize?.name || 'graded card';
  if (mine) {
    sfx.play('achieve');
    hud.modal(`🏆 YOU WON THE ${vault} RAFFLE!`, `
      <p>Your entry was drawn for <b>${escR(prize)}</b>${r.prize?.grade ? ` (${escR(r.prize.grader || '')} ${escR(r.prize.grade)})` : ''}.</p>
      <div class="row"><span>Your wallet</span><b class="wl-addr">${escR(shortAddr(r.winner_address))}</b></div>
      <div class="row"><span>Entries</span><b>${r.entries | 0}</b></div>
      <p style="opacity:.8">The BagVerse team will send the prize to this verified wallet. Keep it linked until it arrives.</p>`);
  } else if (r.winner_name && Date.now() - Date.parse(r.draws_at) < 3 * 86400e3) {
    hud.chat('SYSTEM', vault, `${r.winner_name} won ${prize} (${r.entries | 0} entries).`, '#ffc83d');
  }
};
raffles.start();
function openVault(zid, label) {
  const L = progress.s.level, onepiece = zid === 'rwa_vault', vault = onepiece ? 'wano' : 'kanto';
  const r = raffles.current(vault), last = raffles.last(vault);
  const need = r ? r.min_level | 0 : onepiece ? 25 : 100, lvOk = L >= need || Progress.unlockAll;
  const pz = r?.prize || {}, local = RWA_ASSETS.find((x) => x.mint && x.mint === pz.mint);
  const img = local?.photo || pz.image || null;
  sfx.play(lvOk ? 'scanok' : 'scandeny');
  const prizeHtml = r ? `<div class="rwa">
      ${img ? `<img src="${escR(img)}" alt="${escR(pz.name)}" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <div>
        <div class="rwa-k">THIS WEEK'S RAFFLE${local ? ' · ' + local.issuer.toUpperCase() : ''}</div>
        <div class="rwa-t">${escR(pz.name || 'Graded card · TBA')}</div>
        ${pz.set ? `<div class="row"><span>Set</span><b>${escR(pz.set)}</b></div>` : ''}
        ${pz.grade ? `<div class="row"><span>Grade</span><b>${escR(pz.grader || '')} ${escR(pz.grade)}</b></div>` : ''}
        ${pz.variant ? `<div class="row"><span>Variant</span><b>${escR(pz.variant)}</b></div>` : ''}
        ${pz.cert ? `<div class="row"><span>Cert</span><b>${escR(pz.grader || '')} #${escR(pz.cert)}</b></div>` : ''}
        ${pz.mint ? `<div class="row"><span>Mint</span><b title="${escR(pz.mint)}">${escR(shortMint(pz.mint))}</b></div>` : ''}
        ${/^https:\/\//.test(pz.url || '') ? `<a class="rwa-link" href="${escR(pz.url)}" target="_blank" rel="noopener noreferrer">VIEW THE CARD ↗</a>` : ''}
      </div></div>` : `<p>${raffles.offline ? 'Raffles run on the BagVerse website (bag-verse-ten.vercel.app).' : raffles.ready ? `No ${onepiece ? 'One Piece' : 'Pokémon'} raffle is open right now. The next slab is announced here.` : 'Loading raffles…'}</p>`;
  const w = wallet.status === 'verified', entered = r && raffles.entered(r.id);
  let action = '';
  if (r) {
    if (!lvOk) action = `<button disabled style="opacity:.5">LOCKED · LV ${need}+ (${need - L} TO GO)</button>`;
    else if (entered) action = `<button disabled class="rf-in">ENTERED ✓</button>`;
    else if (!w) action = `<button id="rf-wallet">CONNECT WALLET TO ENTER</button>`;
    else action = `<button id="rf-enter">ENTER FREE</button>`;
  }
  const lastHtml = last ? `<div class="rf-last"><small>LAST DRAW · ${escR(last.prize?.name || '')}</small>
      <div class="row"><span>Winner</span><b>${last.winner_name ? `${escR(last.winner_name)} · ${escR(shortAddr(last.winner_address))}` : 'No entries'}</b></div>
      ${last.proof?.blockhash ? `<div class="row"><span>Drawn from</span><b><a href="https://solscan.io/block/${last.proof.slot | 0}" target="_blank" rel="noopener">Solana block #${(last.proof.slot | 0).toLocaleString()} ↗</a></b></div>` : ''}</div>` : '';
  hud.modal(`${label} · ${onepiece ? 'ONE PIECE' : 'POKÉMON'} RAFFLE`, `
    ${prizeHtml}
    ${r ? `<div class="row"><span>Draw</span><b id="rf-count">${countdown(Date.parse(r.draws_at) - Date.now())}</b></div>
    <div class="row"><span>Entries</span><b>${r.entries | 0}</b></div>
    <div class="row"><span>Entry</span><b style="color:${lvOk ? '#7cff3d' : '#ff6b6b'}">FREE · one per verified wallet · LV ${need}+</b></div>
    ${action}<p class="wl-err" id="rf-err" hidden></p>` : ''}
    ${lastHtml}
    <p style="opacity:.7;font-size:13px">The winner is picked from the hash of the first Solana block after the draw time, so anyone can check it. Prizes go to the winner's verified wallet.</p>`);
  const cd = $('rf-count');
  if (cd && r) { const iv = setInterval(() => { if (!document.body.contains(cd)) return clearInterval(iv); cd.textContent = countdown(Date.parse(r.draws_at) - Date.now()); }, 1000); }
  if ($('rf-wallet')) $('rf-wallet').onclick = () => openWallet();
  if ($('rf-enter')) $('rf-enter').onclick = async () => {
    const b = $('rf-enter'); b.disabled = true; b.textContent = 'ENTERING…';
    try { await raffles.enter(r.id, progress.s.name); sfx.play('success'); hud.toast(`RAFFLE ENTERED · ${(pz.name || 'GRADED CARD').toUpperCase()}`); openVault(zid, label); }
    catch (e) { b.disabled = false; b.textContent = 'ENTER FREE'; const er = $('rf-err'); if (er) { er.textContent = e.message; er.hidden = false; } }
  };
}

// ---------------------------------------------------------------- RWA kiosks
function openKiosk(k) {
  quests.emit('rwa_view', 1, { id: k.id });
  const need = TIER_LEVEL[k.tier], L = progress.s.level, wk = quests.S.q.weekKey, entered = progress.s.rwa[k.id] === wk;
  const ok = L >= need || Progress.unlockAll;
  sfx.play(ok ? 'scanok' : 'scandeny');
  hud.modal(k.name.toUpperCase(), `
    <div class="row"><span>Tournament</span><b>${k.event}</b></div>
    <div class="row"><span>Prize</span><b>${k.prize}</b></div>
    <div class="row"><span>Tier</span><b>TIER ${k.tier} · LV ${need}+</b></div>
    <div class="row"><span>Game</span><b>${k.game === 'bagrun' ? `BAG RUN · your best this week: ${(progress.s.mg?.bagrun?.week === weekKey() ? progress.s.mg.bagrun.weekBest : 0).toLocaleString()}${lb.myRank('week') ? ` · #${lb.myRank('week')} on the board` : ''}` : k.game === 'tiledrop' ? `TILE DROP · your best: ${tileDrop.S.best.toLocaleString()} · wins: ${tileDrop.S.wins}` : `${k.gameName} (coming soon)`}</b></div>
    <div class="row"><span>Entry</span><b style="color:#7cff3d">FREE · skill-based · one per week</b></div>
    <div class="row"><span>Status</span><b style="color:${entered ? '#7cff3d' : ok ? '#ffc83d' : '#ff6b6b'}">${entered ? 'ENTERED THIS WEEK ✓' : ok ? 'OPEN' : `LOCKED · ${need - L} LEVEL${need - L === 1 ? '' : 'S'} TO GO`}</b></div>
    <p style="opacity:.75">Entries rank on this week's mini-game scores. Prize administration (KYC, eligibility, region rules) arrives with the blockchain phase; this preview records your entry locally.</p>
    ${ok && !entered ? '<button id="kioskenter">ENTER FREE</button>' : ''}`);
  const b = $('kioskenter');
  if (b) b.onclick = () => {
    sfx.play('success');
    progress.s.rwa[k.id] = wk; progress.count('rwaEntries'); progress.save();
    quests.emit('rwa_enter', 1, { id: k.id }); quests.checkAchievements();
    hud.closeModal(); hud.toast(`ENTERED · ${k.event.toUpperCase()}`);
  };
}

// ---------------------------------------------------------------- interactions
let watchT = 0;
const watched = new Set();
function interactions(dt) {
  const p = player.body.pos;
  let promptHtml = null, action = null;
  if (veh || inGame()) { hud.prompt(null); return; }
  if (car && !car.cool && Math.hypot(p.x - car.pos.x, p.z - car.pos.z) < 3.8 && Math.abs(p.y - car.pos.y) < 1.5) {
    promptHtml = '<kbd>E</kbd> DRIVE · VISION 1789'; action = enterCar;
  }
  if (!promptHtml && scooter?.summoned && !scooter.cool && Math.hypot(p.x - scooter.pos.x, p.z - scooter.pos.z) < 2 && Math.abs(p.y - scooter.pos.y) < 1.2) {
    promptHtml = '<kbd>E</kbd> RIDE · PUNK SCOOTER'; action = () => mount(scooter);
  }

  for (const portal of world.portals) {
    const c = portal.userData.center;
    if (!promptHtml && Math.hypot(p.x - c.x, p.z - c.z) < 5.5) {
      promptHtml = progress.has('portals') ? `<kbd>E</kbd> ENTER ${portal.userData.label}` : `${portal.userData.label} · OPENS AT LV ${progress.gateLevel('portals')}`;
      if (progress.has('portals') && portal.userData.label === 'BAG RUN') { promptHtml = '<kbd>E</kbd> PLAY BAG RUN · 60 S DASH'; action = bagRunMenu; }
      else if (progress.has('portals') && portal.userData.label === 'TILE DROP') { promptHtml = '<kbd>E</kbd> PLAY TILE DROP · LAST ONE STANDING'; action = tileDropMenu; }
      else if (progress.has('portals')) action = () => quests.emit('portal', 1) || hud.modal(portal.userData.label, `
        <p>Matchmaking into a 3–5 minute <b>${portal.userData.label}</b> instance.</p>
        <p style="opacity:.75">The mini-game is next on the roadmap (Phase 1: Bag Run). Wins and playtime will feed your skin's on-chain XP.</p>`);
    }
  }
  // RWA prize entry kiosks: free, level-gated tournament entries
  const kiosk = !promptHtml && collect.kioskNear(p);
  if (kiosk) { promptHtml = `<kbd>E</kbd> RWA ENTRY · ${kiosk.event.toUpperCase()}`; action = () => openKiosk(kiosk); }
  // billboards: rent prompt when close, and watch-to-earn when looking at one
  let bestBB = null, bestD = 1e9;
  const look = new THREE.Vector3(); camera.getWorldDirection(look);
  for (const bb of world.billboards) {
    const u = bb.userData;
    const d = Math.hypot(p.x - u.center.x, p.z - u.center.z);
    if (d < bestD) { bestD = d; bestBB = bb; }
  }
  if (bestBB) {
    const u = bestBB.userData;
    const toBB = u.center.clone().sub(camera.position).normalize();
    const facingScreen = toBB.dot(look) > 0.93 && u.normal.dot(toBB) < -0.3;
    if (bestD < 45 && facingScreen && !watched.has(bestBB.name)) {
      watchT += dt; hud.watch(Math.min(1, watchT / 10));
      if (watchT >= 10) {
        watched.add(bestBB.name); watchT = 0; hud.watch(null);
        const got = progress.grant(50, 'billboard');   // capped at 5 screens' worth (250 XP) a day
        hud.toast(got ? `+${got} XP · AD VIEWED` : 'AD VIEWED · DAILY AD XP CAP REACHED'); sfx.play('ping');
        quests.emit('billboard', 1);
      }
    } else { watchT = Math.max(0, watchT - dt * 2); if (!watchT) hud.watch(null); else hud.watch(watchT / 10); }
    if (!promptHtml && bestD < 10 && u.tier !== 'hero') {
      promptHtml = u.open ? `<kbd>E</kbd> RENT THIS SCREEN · $250 / 7 DAYS` : '<kbd>E</kbd> VIEW AD SLOT';
      action = () => hud.modal(`SCREEN ${bestBB.name.replace('_', ' #')}`, `
        <div class="row"><span>Tier</span><b>${u.tier.toUpperCase()}</b></div>
        <div class="row"><span>Format</span><b>${bestBB.userData.aspect || '16:9'} · image / MP4 / WebM</b></div>
        <div class="row"><span>Price</span><b>250 USDC · 7 days</b></div>
        <div class="row"><span>Status</span><b style="color:${u.open ? '#7cff3d' : '#ffc83d'}">${u.open ? 'AVAILABLE' : 'LEASED (DEMO)'}</b></div>
        <p style="opacity:.75">Self-serve rentals via Solana Pay + Billboard Lease NFT come with the blockchain phase.</p>
        ${wallet.address ? `<p style="opacity:.75">Wallet ${shortAddr(wallet.address)} is linked and will pay for rentals when they open.</p>` : '<button data-w="link">CONNECT WALLET</button>'}`);
      setTimeout(() => { const b = document.querySelector('[data-w=link]'); if (b) b.onclick = () => openWallet(); });
    }
  }
  // vaults: Wano (graded One Piece raffles) and Kanto (graded Pokemon raffles); prompt at each door
  for (const zid of ['rwa_vault', 'apex_arena']) {
    if (promptHtml) break;
    const vz = world.zones.find((z) => z.id === zid); if (!vz) continue;
    const f = vaultFront(zid) || vz.pos;
    if (Math.hypot(p.x - f.x, p.z - f.z) > 7 || Math.abs(p.y - f.y) > 4) continue;
    promptHtml = `<kbd>E</kbd> ${vz.label} · THIS WEEK'S RAFFLE`;
    action = () => { quests.emit('rwa_view', 1, { id: zid === 'rwa_vault' ? 'vault' : 'kanto' }); openVault(zid, vz.label); };
  }
  if (!promptHtml && !input.touch && $('hud').classList.contains('can-mob')) promptHtml = flashmob.offer ? `<kbd>F</kbd> JOIN ${flashmob.offer.name.replace(/[<>&"]/g, '').toUpperCase()}'S FLASHMOB` : '<kbd>F</kbd> START A FLASHMOB';
  hud.prompt(hud.modalOpen ? null : promptHtml);
  if (action && input.hit('KeyE')) action();
}

// ---------------------------------------------------------------- loop
let started = false;
const pickChar = (id) => {
  if (!CHARS[id]) return;
  charId = id; player.setModel(CHARS[id]); look.setupShadows(player.root);
  try { localStorage.setItem('bagverse.char', id); } catch (_) {}
  document.querySelectorAll('#enter button').forEach((b) => b.classList.toggle('on', b.dataset.char === id));
};
pickChar(charId);
const start = () => {
  if (started) return;
  started = true;
  $('loader').hidden = true; $('hud').hidden = false;
  hud.zone(world.zoneAt(player.body.pos));
  missionsUI.updateTracker();
  const login = () => { if (progress.loginPending && quests.tutorialDone) missionsUI.open('daily'); };
  if (!progress.s.tut.seenWelcome && !params.has('autostart')) missionsUI.welcome(login); else login();
};
// skin selection: shown once loading is done, and in game with K / the Skins button
const skins = new SkinScreen({
  renderer, chars: CHARS, loadChar, allIds: CHAR_IDS, platform: propGltfs.platform,
  getEquipped: () => charId,
  getLevel: () => progress.s.level,
  getName: () => progress.s.name,
  needName: () => !progress.s.nameSet,
  setName: (n) => { progress.s.name = n; progress.s.nameSet = true; progress.save(); player.refreshPlate(profile()); lb.saveProfile(); },
  onEquip: (id) => { if (id !== charId) { pickChar(id); hud.toast?.(`SKIN EQUIPPED · ${id.toUpperCase()}`); sfx.play('whoosh'); quests.emit('skin', 1, { id }); } },
  onClose: () => { $('hud').hidden = false; start(); },
  transition: (fn) => fx.through(fn, 220, 450),
  getCards: () => collectionCards(),
  getStats: () => { const s = progress.s, rw = raffles.list.filter((r) => r.winner_user && r.winner_user === raffles.uid).length;
    return [['LEVEL', s.level], ['PLAYTIME', `${s.playMin | 0}m`], ['RAFFLE WINS', rw], ['BAG RUN PB', (s.mg?.bagrun?.best | 0).toLocaleString()], ['TILE WINS', tileDrop.S.wins]]; },
  onUse: (it) => {
    if (it.url) { window.open(it.url, '_blank', 'noopener'); return; }
    skins.toast(it.vault === 'wano' ? 'ENTER FREE AT THE WANO VAULT (EAST OF THE PLAZA) WITH A VERIFIED WALLET' : 'ENTER FREE AT THE KANTO VAULT (BULL RUN) WITH A VERIFIED WALLET');
  },
});
// cards for the Collection: raffle slabs you won, and this week's prizes (locked) as something to play for
function cardArt(vault) {
  const c = document.createElement('canvas'); c.width = 300; c.height = 400; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 300, 400); gr.addColorStop(0, vault === 'wano' ? '#ff5a3d' : '#ffcb05'); gr.addColorStop(1, vault === 'wano' ? '#3a0d1a' : '#1a2a6e');
  g.fillStyle = gr; g.fillRect(0, 0, 300, 400); g.fillStyle = 'rgba(255,255,255,.9)'; g.textAlign = 'center';
  g.font = '800 170px Rajdhani, sans-serif'; g.fillText('?', 150, 250); g.font = '700 30px Rajdhani, sans-serif'; g.fillText('PRIZE TBA', 150, 330);
  return c.toDataURL('image/png');
}
function collectionCards() {
  const out = [], seen = new Set();
  for (const r of raffles.list) {
    const mine = !!r.winner_user && r.winner_user === raffles.uid;
    if (!mine && r.status !== 'open') continue;
    const pz = r.prize || {}, local = RWA_ASSETS.find((a) => a.mint && a.mint === pz.mint), V = r.vault === 'wano' ? 'Wano' : 'Kanto';
    if (local) seen.add(local.mint);
    out.push({ id: 'card:' + r.id, vault: r.vault, name: pz.name || 'Graded card', sub: pz.set || (r.vault === 'wano' ? 'Graded One Piece card' : 'Graded Pokémon card'),
      cert: pz.cert ? `${pz.grader || ''} #${pz.cert}` : '', grade: { co: pz.grader || 'TBA', n: pz.grade || '?', word: pz.grade === '10' ? 'GEM MINT' : pz.grade ? 'GRADED' : 'TBA' },
      img: local?.photo || cardArt(r.vault), slabPhoto: !!local?.photo, owned: mine, url: /^https:\/\//.test(pz.url || '') ? pz.url : null,
      lock: mine ? null : `${V} Vault raffle prize · draw ${new Date(r.draws_at).toUTCString().slice(0, 22)} UTC`,
      desc: mine ? 'You won this slab in the vault raffle. The team sends it to your verified wallet.' : `A real graded card in the ${V} Vault raffle. Entry is free with a verified wallet.` });
  }
  for (const a of RWA_ASSETS) if (!seen.has(a.mint)) out.push({ id: 'card:' + a.mint, vault: 'wano', name: a.name, sub: `${a.set} #${a.number}`, cert: `${a.grader} #${a.cert}`,
    grade: { co: a.grader, n: a.grade, word: 'GEM MINT' }, img: a.photo, slabPhoto: true, owned: false, url: a.url, lock: 'Wano Vault raffle prize', desc: `Real ${a.grader} ${a.grade} slab vaulted on Solana by ${a.issuer}. Raffled at the Wano Vault.` });
  return out;
}
const openCollection = () => {
  if (skins.isOpen || inGame()) return;
  sfx.play('whoosh');
  fx.through(() => { $('hud').hidden = true; $('emotewheel').hidden = true; hud.closeModal(); skins.openNow('collection'); }, 220, 450);
};
// holder skins follow the verified wallet; a gated skin that's no longer held is taken off
skins.onGate = () => { if (wallet.status !== 'verified') { skins.close(); if (!skins.isOpen) openWallet(); } };
const syncHolder = () => {
  skins.setHolderSkins(wallet.skins, wallet.status === 'verified');
  if (wallet.ready && wallet.status !== 'verifying' && gateFor(charId) && !(wallet.status === 'verified' && wallet.skins.includes(charId))) {
    pickChar('goldenking'); hud.toast('HOLDER SKIN NEEDS ITS NFT · SWITCHED TO GOLDEN KING');
  }
};
wallet.onChange(syncHolder); syncHolder();
const openSkins = () => { if (skins.isOpen) return; sfx.play('whoosh'); fx.through(() => { $('loader').hidden = true; $('hud').hidden = true; $('emotewheel').hidden = true; hud.closeModal(); skins.openNow('skins'); }, 220, 450); };
if (params.has('autostart')) start(); else openSkins();
window.__bagverse = { fx, openCollection, raffles, openVault, tileDrop, startTileDrop, tileDropMenu, wallet, openWallet, paintUniforms, skins, nightLights, kit, trees, quality, surfaceUniforms, charUniforms, player, cam, car, scooter, sfx, bagRun, mp, lb, bagRunMenu, joinRace, startBagRun2: startBagRun, VAULTS, vaultFront, startBagRun, progress, quests, collect, missionsUI, enterCar: () => enterCar(), summonScooter: () => summonScooter(), world, crowd, hud, input, renderer, scene, camera, look, setLook };

// slow-frame guard: after a short warm-up, a few seconds under ~22 fps sheds the heaviest effects live
// and remembers the lower tier for next time
let slowSecs = 0, adaptT = 0, shed = 0;
function adapt(fps) {
  if (FIXED_DT || !started || document.hidden) return;
  adaptT += 1; if (adaptT < 6) return;
  slowSecs = fps < 22 ? slowSecs + 1 : Math.max(0, slowSecs - 1);
  if (slowSecs < 4 || shed >= 2) return;
  slowSecs = 0; shed++;
  if (shed === 1) {
    if (look.passes.ao) look.passes.ao.enabled = false;
    const pr = Math.min(1, renderer.getPixelRatio() * 0.8); renderer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
    surfaceUniforms.uSurfAmt.value = 0;
  } else {
    look.shedBloom();
    // cheaper shadows, still live (a frozen shadow map left a stale "ghost" of every moving character behind)
    look.shrinkShadows(1024);
    for (const n of crowd.list) n.c.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  }
  const lower = QUALITIES[Math.max(0, QUALITIES.indexOf(quality) - shed)];
  store.set('bagverse.q', lower);
  hud.toast(`RUNNING SLOW · GRAPHICS LOWERED (${lower.toUpperCase()} NEXT TIME)`);
}

const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, statsT = 0;
function frame() {
  const realDt = clock.getDelta();
  const dt = FIXED_DT || Math.min(realDt, 1 / 20);
  const t = clock.elapsedTime;
  input.enabled = started && !hud.typing && !hud.modalOpen && !skins.isOpen && !(bagRun.active && bagRun.state === 'countdown') && !(tileDrop.active && tileDrop.state === 'countdown');
  if (skins.isOpen) {   // the selection screen owns the canvas: no world update / render while it is up
    sfx.loop('pad', { vol: 1, rate: 1 }); sfx.loop('city', { vol: 0, rate: 1 }); sfx.loop('crowd', { vol: 0, rate: 1 }); sfx.loop('steps', { vol: 0 }); sfx.loop('scooter', { vol: 0 });
    input.endFrame();
    skins.frame(dt);
    fpsAcc += realDt; fpsN++;
    if (fpsAcc > 1) { window.__fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    window.__frames = (window.__frames || 0) + 1;
    requestAnimationFrame(frame);
    return;
  }

  if (started) {
    if (input.hit('KeyK')) openSkins();
    if (input.hit('KeyM')) hud.mapOpen ? hud.closeMap() : hud.openMap(player.body.pos, mp.mapMates());
    if (input.hit('KeyI')) openCollection();
    if (input.hit('KeyJ')) missionsUI.isOpen ? missionsUI.close() : missionsUI.open();
    if (input.hit('KeyG')) $('emotewheel').hidden = !$('emotewheel').hidden;
    if (input.hit('KeyN')) setLook(ORDER[(ORDER.indexOf(lookName) + 1) % ORDER.length]);
    if (input.hit('Escape')) { hud.closeMap(); hud.closeModal(); }
  }
  let st;
  if (veh) {
    st = veh.update(dt, input, { crowd });
    player.body.pos.copy(veh.pos); player.root.position.copy(veh.pos);
    for (const o of [car, scooter]) if (o && o !== veh && (o !== scooter || o.summoned)) o.update(dt, input, { crowd });
    if (started) driveFrame(dt);
  } else {
    st = player.update(dt, input, cam.yaw);
    for (const o of [car, scooter]) if (o && (o !== scooter || o.summoned)) { o.update(dt, input, { crowd }); o.pushOut(player.body); }
    player.root.position.copy(player.body.pos);
    if (started) flashmob();
    if (started && input.hit('KeyR') && !inGame()) summonScooter();
  }
  if (started) { mp.tick(dt); mp.indicators(camera, player.root.position); raceFrame(); if ((frame.lbt = (frame.lbt || 0) + dt) > 30) { frame.lbt = 0; lb.tick(); } }
  if (started && tileDrop.active) tileDrop.update(dt);
  if (started && bagRun.active) bagRun.update(dt, player.body.pos);
  else if (started && progress.has('portals')) bagRun.warm(2);
  cam.update(dt, input, veh ? veh.pos : player.root.position);
  crowd.update(dt, t, camera.position);
  world.update(t, dt);

  if (window.__camOverride) { const o = window.__camOverride; camera.position.set(...o.pos); camera.lookAt(...o.at); }   // test/screenshot hook
  look.update(t, player.root.position);
  if (grass) grass.update(t, camera.position);
  trees.update(dt, camera);
  nightLights.update(dt, camera.position);

  if (started) {
    interactions(dt);
    progressFrame(dt, t);
    const playing = progress.tick(dt, st.active);
    statsT -= dt;
    if (statsT <= 0) {
      statsT = 0.25;
      hud.updateStats(playing);
      hud.zone(world.zoneAt(player.body.pos));
      hud.drawMinimap(player.body.pos, crowd.list, cam.yaw, car, mapMarks());
      missionsUI.updateTracker();
      if (hud.mapOpen) hud.openMap(player.body.pos, mp.mapMates());
    }
    hud.update(dt);
  }
  input.endFrame();
  composer.render(dt);
  fpsAcc += realDt; fpsN++;
  if (fpsAcc > 1) { window.__fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; adapt(window.__fps); }
  window.__frames = (window.__frames || 0) + 1;
  requestAnimationFrame(frame);
}
frame();
window.__ready = true;
