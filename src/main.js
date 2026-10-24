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
import { SkinScreen } from './skins.js';
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
import { Multiplayer } from './multiplayer.js';
import { Leaderboard } from './leaderboard.js';

THREE.Mesh.prototype.raycast = acceleratedRaycast;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const FIXED_DT = params.has('fixeddt') ? (parseFloat(params.get('fixeddt')) || 1 / 30) : 0;   // deterministic stepping for automated tests

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
const runUI = new RunUI(() => bagRun.finish(true));
const bagRun = new BagRun({ scene, world, player, progress, quests, sfx, hud, collect, ui: runUI });
bagRun.onTrip = () => { player.body.vel.x *= 0.15; player.body.vel.z *= 0.15; if (veh) veh.v *= 0.2; };
function startBagRun(race = null) {
  if (bagRun.active) return;
  if (veh) dismount();
  if (crowd.flashmob) crowd.endFlashmob();
  hud.closeModal(); missionsUI.close();
  quests.emit('portal', 1);
  bagRun.begin(showRunResults, race);
  if (bagRun.active && race) { mp.setRace(race); mp.setRun({ id: race.id, s: 0, b: 0, d: 0 }); }
}
// portal: with teammates online you can host a race (same route + start for everyone who joins in 15 s)
function bagRunMenu() {
  if ((!mp.room && !lb.db) || bagRun.active) return startBagRun();
  const top = lb.top('week', 3);
  hud.modal('BAG RUN', `
    <p>60-second dash for Bags. Solo, or open a <b>race</b>: teammates get a join invite and you all start together on the same route.</p>
    ${top.length ? `<div class="lb-mini"><small>TOP THIS WEEK</small>${top.map((x, i) => `<div class="${x.me ? 'me' : ''}"><span>${i + 1}. ${x.name.replace(/[<>&"]/g, '')}</span><b>${x.score.toLocaleString()}</b></div>`).join('')}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button id="br-solo">SOLO RUN</button>${mp.room ? '<button class="ghost" id="br-race">🏁 HOST A RACE (STARTS IN 15 S)</button>' : ''}<button class="ghost" id="br-lb">🏆 LEADERBOARD</button></div>
    ${mp.room ? `<p style="opacity:.7">${mp.count ? `${mp.count} other player${mp.count > 1 ? 's' : ''} online.` : 'Nobody else is online right now, but your race stays open for 15 s.'}</p>` : ''}`);
  $('br-lb').onclick = () => lb.open('week');
  $('br-solo').onclick = () => startBagRun();
  if ($('br-race')) $('br-race').onclick = () => {
    const race = { id: Math.random().toString(36).slice(2, 10), plan: bagRun.pickPlan(), seed: (Math.random() * 4294967295) >>> 0, at: Date.now() + 15000, host: true };
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
  startBagRun({ ...race, host: false });
}
invite.onclick = (e) => { if (e.target.dataset.x) { declined.add(inviteRace?.id); invite.hidden = true; return; } joinRace(inviteRace); };
function raceFrame() {
  const open = !bagRun.active && !skins.isOpen ? mp.openRaces().filter((x) => !declined.has(x.race.id)) : [];
  if (!open.length) { invite.hidden = true; inviteRace = null; }
  else {
    const x = open[0]; inviteRace = x.race;
    const secs = Math.ceil((x.race.at - Date.now()) / 1000);
    invite.innerHTML = '';
    const t = document.createElement('span'); t.textContent = `🏁 ${x.by.toUpperCase()}'S BAG RUN RACE · STARTS IN ${secs}s`;
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
addEventListener('keydown', (e) => { if (e.key === 'Escape' && bagRun.active) bagRun.finish(true); });
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
const lb = new Leaderboard({ hud, getLocal: () => ({ name: progress.s.name, skin: charId, level: progress.s.level }) });
lb.init();
// a name saved online (same account on another device) fills in a browser that has none yet
lb.onMine = (row) => { if (!progress.s.nameSet && row && typeof row.n === 'string' && row.n.length >= 2) { progress.s.name = row.n.replace(/[^\w.-]/g, '').slice(0, 16); progress.s.nameSet = true; progress.save(); player.refreshPlate(profile()); const f = document.getElementById('sk-pname'); if (f && !f.value) f.value = progress.s.name; } };
addEventListener('keydown', (e) => { if (e.code === 'KeyL' && started && !hud.typing && !hud.modalOpen && !skins.isOpen && !bagRun.active) lb.open('week'); });
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
  else if (a === 'inventory') inventory();
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
  const other = !mobJoin && !crowd.flashmob && !veh && !bagRun.active ? mp.nearbyMob(player.body.pos) : null;
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

function inventory() {
  const s = progress.s;
  hud.modal('SKIN · DEFAULT (SOULBOUND)', `
    <div class="row"><span>Level</span><b>${s.level}</b></div>
    <div class="row"><span>Total_XP</span><b>${s.totalXp}</b></div>
    <div class="row"><span>Playtime_Minutes</span><b>${s.playMin}</b></div>
    <div class="row"><span>RWA_Wins</span><b>${s.rwaWins}</b></div>
    <div class="row"><span>Visual_Tier</span><b>${progress.visualTier}</b></div>
    <div class="row"><span>Garage</span><b>${s.vehicles.map((v) => (VEHICLES[v]?.name || v.toUpperCase()) + ' · OWNED').join(', ') || 'EMPTY'}</b></div>
    ${scooter && s.vehicles.includes('punk') ? '<div style="margin:8px 0 4px"><button id="ridebtn">🛴 RIDE PUNK SCOOTER</button></div>' : ''}
    <p style="opacity:.7">These stats are tracked locally for now. When the Metaplex Core contract ships they are written on-chain by the game server.</p>
    <div style="display:flex;gap:8px;margin-top:8px"><input id="newname" maxlength="16" value="${s.name}" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid #8b3dff;background:#0b0618;color:#fff;font:600 16px Rajdhani,sans-serif" /><button class="ghost" id="rename">RENAME</button></div>`);
  if ($('ridebtn')) $('ridebtn').onclick = () => { hud.closeModal(); summonScooter('punk'); };
  $('rename').onclick = () => {
    const n = $('newname').value.trim();
    if (n) { s.name = n.slice(0, 16).replace(/[^\w.-]/g, '_'); s.nameSet = true; progress.save(); player.refreshPlate(profile()); hud.closeModal(); }
  };
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
  sfx.loop('city', { vol: bagRun.active ? 0.35 : 1, rate: 1 });
  sfx.loop('crowd', { vol: bagRun.active ? 0 : THREE.MathUtils.clamp(1 - Math.hypot(P.x, P.z) / 45, 0, 1), rate: 1 });
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
function openVault(zid, label) {
  const L = progress.s.level, onepiece = zid === 'rwa_vault';
  const need = onepiece ? 25 : 100, ok = L >= need || Progress.unlockAll;
  const a = onepiece ? RWA_ASSETS[0] : null;
  sfx.play(ok ? 'scanok' : 'scandeny');
  hud.modal(`${label} · ${onepiece ? 'ONE PIECE' : 'POKÉMON'} RAFFLES`, `
    ${a ? `<div class="rwa">
      <img src="${a.photo || a.image}" alt="${a.name} ${a.grader} ${a.grade}" referrerpolicy="no-referrer" onerror="this.remove()">
      <div>
        <div class="rwa-k">FEATURED RAFFLE · ${a.issuer.toUpperCase()}</div>
        <div class="rwa-t">${a.year} #${a.number} ${a.name}</div>
        <div class="row"><span>Set</span><b>${a.set}</b></div>
        <div class="row"><span>Grade</span><b>${a.grader} ${a.grade} · Gem Mint</b></div>
        ${a.variant ? `<div class="row"><span>Variant</span><b>${a.variant}</b></div>` : ''}
        ${a.cert ? `<div class="row"><span>Cert</span><b>${a.grader} #${a.cert}</b></div>` : ''}
        <div class="row"><span>Mint</span><b title="${a.mint}">${shortMint(a.mint)}</b></div>
        <a class="rwa-link" href="${a.url}" target="_blank" rel="noopener noreferrer">VIEW ON ${a.issuer.toUpperCase()} ↗</a>
      </div></div>` : `<p>Graded <b>Pokémon</b> card raffles. This week's slabs are being vaulted; the line-up is announced here and on the hologram showcases out front.</p>`}
    <div class="row"><span>Vault</span><b>${onepiece ? 'Graded One Piece cards' : 'Graded Pokémon cards'}</b></div>
    <div class="row"><span>More prizes</span><b>${onepiece ? '2 more graded slabs · TBA' : '3 graded slabs · TBA'}</b></div>
    <div class="row"><span>Draw</span><b>Sundays 20:00 UTC</b></div>
    <div class="row"><span>Entry</span><b style="color:${ok ? '#7cff3d' : '#ff6b6b'}">${ok ? `OPEN AT LV ${need}+` : `LV ${need}+ · ${need - L} LEVEL${need - L === 1 ? '' : 'S'} TO GO`}</b></div>
    <p style="opacity:.75">Prizes are real vaulted cards on Solana (display only for now). Raffle entry and escrow arrive with the blockchain phase.</p>
    <button disabled style="opacity:.5">ENTER RAFFLE (SOON)</button>`);
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
    <div class="row"><span>Game</span><b>${k.game === 'bagrun' ? `BAG RUN · your best this week: ${(progress.s.mg?.bagrun?.week === weekKey() ? progress.s.mg.bagrun.weekBest : 0).toLocaleString()}${lb.myRank('week') ? ` · #${lb.myRank('week')} on the board` : ''}` : `${k.gameName} (coming soon)`}</b></div>
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
  if (veh || bagRun.active) { hud.prompt(null); return; }
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
        <button disabled style="opacity:.5">CONNECT WALLET (SOON)</button>`);
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
});
const openSkins = () => { sfx.play('whoosh'); $('loader').hidden = true; $('hud').hidden = true; $('emotewheel').hidden = true; hud.closeModal(); skins.open(); };
if (params.has('autostart')) start(); else openSkins();
window.__bagverse = { paintUniforms, skins, nightLights, kit, trees, quality, surfaceUniforms, charUniforms, player, cam, car, scooter, sfx, bagRun, mp, lb, bagRunMenu, joinRace, startBagRun2: startBagRun, VAULTS, vaultFront, startBagRun, progress, quests, collect, missionsUI, enterCar: () => enterCar(), summonScooter: () => summonScooter(), world, crowd, hud, input, renderer, scene, camera, look, setLook };

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
  input.enabled = started && !hud.typing && !hud.modalOpen && !skins.isOpen && !(bagRun.active && bagRun.state === 'countdown');
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
    if (input.hit('KeyI')) inventory();
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
    if (started && input.hit('KeyR')) summonScooter();
  }
  if (started) { mp.tick(dt); mp.indicators(camera, player.root.position); raceFrame(); if ((frame.lbt = (frame.lbt || 0) + dt) > 30) { frame.lbt = 0; lb.tick(); } }
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
