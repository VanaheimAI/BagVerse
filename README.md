# BagVerse — Phase 1 prototype (gameplay + world)

Browser metaverse hub on Solana. This build covers **third-person gameplay and The Bag Square world**.
The blockchain layer (stateful skins, billboard leases, RWA escrow) comes next and has hooks ready.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static build in dist/ (deploy anywhere: Vercel, Netlify, S3, IPFS)
```

**Graphics quality & crash safety:** three tiers, cycled with the **GFX** button in the HUD (the choice is remembered).
- **HIGH:** CSM shadows, AO, GI, LYGIA surfaces, 90k grass, up to 1.5× pixel ratio.
- **MEDIUM:** a single shadow map, no AO, 40k grass, 1× pixel ratio.
- **LOW:** no shadows, bloom, AO or surface layer; 14k grass, 8 NPCs. This is the default on phones.
- **Resolution cap:** internal resolution is capped by total pixel count, so 4K and high-DPI screens don't blow up GPU memory.
- **Shader pre-compile:** all shaders compile in parallel during loading (`compileAsync`), not in one burst on the first frame.
- **Recovery:**
  - A lost WebGL context shows a "graphics reset" screen and reloads one tier lower.
  - A session that ends without closing cleanly (tab crash) makes the next load start one tier lower, with a chat note.
  - A session that stays under ~22 fps sheds effects live and saves the lower tier.
- **Testing:** `tools/crashtest.mjs` exercises the crash-flag and context-loss paths.

URL flags: `?q=high|medium|low` (force a tier), `?low` (same as `q=low`), `?noao`, `?nocsm` (single shadow map), `?nogi` (no scene-captured GI), `?nograss`, `?nosurf` (no procedural surface layer), `?look=day|sunset|night`, `?autostart`.

**Global illumination & shadows:**
- **Scene-captured GI.** After loading (and on every Day/Sunset/Night switch), `Look.captureGI()` renders the lit district into a cubemap from the plaza.
  - The cubemap is pre-filtered (PMREM) into `scene.environment`, so glass, metal and wet surfaces reflect the real buildings and neon.
  - It's also projected into a spherical-harmonics `LightProbe`, giving soft coloured bounce light: warm from sunlit facades, magenta and cyan from the signage at night.
  - The flat hemisphere fill is reduced once the probe is live.
- **Cascaded shadow maps** (3 cascades out to 260 m). Towers cast crisp shadows near the player and long shadows across the district, without the blur of one huge shadow map.

**Procedural surfaces (LYGIA):** shaders use the [LYGIA](https://lygia.xyz) shader library via `#include "lygia/generative/fbm.glsl"` and similar includes.
- **Build-time resolve.** `tools/vite-lygia.js` is a small Vite plugin. It resolves those includes from the `lygia` npm package and inlines each file once, the same way `lygia.xyz/resolve.esm.js` does at runtime. It needs no network, so it works offline and on hosts that block third-party fetches.
- **Surface layer.** `src/shaders/surface.glsl` is injected by `src/surface.js` into every world `MeshStandardMaterial`.
  - Materials get a profile by name: facade, ground, metal, roof, foliage or paint.
  - Each profile adds world-space detail on top of the baked textures: tonal patches, rain streaks, street grime at the base of buildings, worn and patched asphalt with tar seams and hairline cracks, oil stains, rust and smudges on metal, and per-tree colour drift on foliage.
  - It also adds a procedural bump that fades with distance.
  - Puddles go glossy and reflect the captured neon. Wetness is driven by the Look preset: dry by day, soaked at night.
- **Off switch.** `?nosurf` turns the layer off. `__bagverse.surfaceUniforms.uSurfAmt` blends it live.
- **Grass noise.** The grass vertex shader (`src/shaders/grass.vert.glsl`) also uses LYGIA simplex noise.
- **Licence.** LYGIA is dual-licensed: Prosperity 3.0.0 (free non-commercial, 30-day commercial trial) or the paid LYGIA Patron licence for commercial use. See `LICENSES/lygia.md`. BagVerse is commercial, so get a Patron licence before launch, or swap the few noise functions used for MIT-licensed ones.

**Grass:** `src/grass.js` draws up to 90k GPU-instanced blades on a grid that follows the camera, masked to the park lawns with paths cut out.
- Each blade gets its own height, lean and colour, with dry patches.
- Wind combines rolling gusts with small flutter.
- Lighting follows the active Look preset, and blades fade out with distance.
- It costs one draw call and is skipped entirely when no lawn is nearby.
- Edit the `zones` and `holes` in `main.js` to grow grass elsewhere.

**Look (Fortnite-style):** `src/look.js` drives the stylised rendering.
- **Tone mapping:** Khronos PBR Neutral instead of ACES, so saturated colours stay saturated.
- **Light:** a strong warm sun as a 3/4 key light over the default camera's shoulder, at 55° so streets between the towers stay sunlit. Soft cascaded shadows.
- **Shade:** a bright, near-neutral fill (hemisphere + scene-captured GI) keeps shaded areas readable. The GI capture is desaturated per preset (`giChroma`: day 0.12, sunset 0.3, night 0.35), because the plaza's cyan floor neon was tinting all the bounce light blue-green. The grade lifts shadows slightly warm-neutral, so they never go black.
- **Materials:** a stylise curve lifts near-black albedos (asphalt, dark metal, roofs) into the mid-tones.
- **Atmosphere and effects:** a bright saturated sky with crisp clouds and light AO. Bloom only catches real emissives, and a NaN guard runs ahead of it so one bad pixel can't black out the frame.
- **Presets:** press **N** or use the HUD button to cycle Day, Sunset and Night. Each rebalances sun, sky, fog, neon, surface grime, wetness and grade.

**Controls** — WASD / arrows move · Shift walk · Space jump · click or drag to look · wheel zoom ·
E interact · 1 wave · 2 dance · G emotes · I inventory · M map (click a district to fast-travel) · Enter chat.
Mobile: left joystick, drag right side to look, JUMP and E buttons.

## What's in the box

| Area | Status |
|---|---|
| Third-person controller | Capsule physics vs. a BVH of the world collider (slopes, curbs, jumping, coyote time), camera orbit with wall pull-in, shoulder offset |
| Characters | Pick the Golden King or Maria on the loading screen (remembered per browser); the crowd mixes both. The king's rig was repaired and re-weighted (see Characters below). Placeholder Idle/Walk/Run/Jump/Fall/Wave/Dance clips are keyed in Blender |
| World | The Bag Square + Ad Canyon (12 towers), RWA Vault Showroom (glass pavilion, 3 rotating prize holograms, live tournament countdown), 4 arcade portals, the Trading Floor tickers, and districts: HODL Heights, Doge & Bonk Park, Jeet Wastelands / Rekt, FOMO Valley (walkable trench + bridges), Copium Refinery, Chad's Bull Run + rocket + Apex RWA Arena, Pepe's Swamp / Feels Good Man Arcade, Arcade Portals strip, GM Gate |
| Billboards | 20 named screens (`BB_01..20`, 16:9 and 9:16) showing rotating placeholder ads; walk up + E for the rent card; look at one for 10 s → +50 XP (watch-to-earn preview) |
| HUD | Level/XP, proof-of-play timer (pauses after 90 s idle, as in the GDD), holder tier badge, $BAG balance, minimap, full map with fast travel, zone banners, chat with speech bubbles, emotes, inventory showing the GDD skin schema |
| Crowd | 16 wandering NPCs with nameplates, tiers, auras for Lv 50+, chat chatter (stand-ins until multiplayer) |

All progression is **local-only** (localStorage) for now. It mirrors the on-chain schema: `Level`, `Total_XP`, `Playtime_Minutes`, `RWA_Wins`, `Visual_Tier`.

## Detailed architecture & foliage

- `blender/detail_geo.py` holds the shared builders that both world scripts use:
  - buildings: shopfront base, floor ledges, corner quoins, cornice and parapet, setbacks on tall towers, and rooftop AC units, stair huts and water tanks
  - stylised broadleaf and pine trees (smooth-shaded leaf clusters)
  - street lights: octagonal base, collars, curved mast arm, lamp head and street banners
- `gen_textures.py` → `facades()`: realistic facade sets (stone, brick, stucco, sandstone, granite, glass curtain wall), each with albedo, normal, ORM and emissive maps. Lit windows exist only in the emissive map, so they switch on at Sunset and Night and stay off by day.
- `npm run optimize:world` welds and meshopt-compresses the world GLB, taking it from about 16.5 MB to 4.9 MB. The game decodes it with three's MeshoptDecoder.

## Image quality ("clean AAA" pass)
- **Anti-aliasing:** HIGH/MEDIUM render the post stack into a 4× MSAA half-float target. LOW and WebGL1 get SMAA. Post effects disable the canvas's own antialiasing, so before this pass there was none.
- **Grade:** a contrast-adaptive sharpen (clamped, no halos), a gentle filmic S-curve, vibrance, a vignette and dithering (no sky banding).
- **Bloom** on every tier (softer on LOW). LOW also keeps one 1024 sun shadow map. MEDIUM now has GTAO.
- **Graphics reset:** a one-time reset (`bagverse.pipeline = 2`) clears graphics tiers that older crash heuristics had lowered automatically.
- **Textures:** anisotropic filtering (8×, 4× on LOW) on every world texture. Tiling is about 2.6× finer on ground and props (asphalt 3 m, paving 2.85 m, concrete 1.5 m) and 1.3× finer on facades (one 4-storey tile = 10.6 m).
- **Character:** the Tripo metal/roughness maps are replaced with a satin finish (metal ≤ 0.25, rough ≥ 0.62, env ×0.55). It was mirror-shiny.
- **Billboards and tickers:** polygon offset, so they never z-fight with their frames. Mip-mapped 8× anisotropic creatives, so text doesn't shimmer. Brightness is ≤ 1, so bloom can't pulse on them.
- **Cars:** clear-coated metallic paint (`MeshPhysicalMaterial`, clearcoat 1, roughness 0.32) over the kit palette.

## Night lighting (cinematic)
- **Preset:** `night` in `look.js` has very low ambient (hemi 0.22, GI 0.45), cool moonlight, a cloudy navy sky with a moon and stars, dark fog, and a teal-shadow / warm-highlight grade (contrast 1.12, vignette 0.32).
- **Street lamps** (`src/nightlights.js`):
  - Every kit lamp gets an additive light-pool decal on the road (one instanced draw).
  - 10 real `SpotLight`s (6 on MEDIUM, none on LOW) follow the lamps nearest the camera, lighting characters and cars and putting specular streaks on wet roads.
  - The light count is fixed (no shader recompiles); by day the intensity is 0.
- **Wet roads:** at night (`wet` 0.85) the surface layer makes the whole road glossy, and puddles mirror the neon and captured environment.

## City kit (Cartoon City)

The city is dressed with the **Cartoon City** asset kit (`blender/Cartoon_City_Free.blend`, kept outside the repo; textures in `textures_1.zip`). The map layout is unchanged.
- **Export:** `KIT_SRC=path/to/Cartoon_City_Free.blend npm run build:kit` runs `blender/export_kit.py`.
  - It exports 27 kit pieces to `public/assets/kit.glb` (1.3 MB after meshopt): 4 buildings, 2 lamps, 3 traffic lights, 6 cars, bushes, a palm, a fountain, a bus stop and bins.
  - Each piece's origin goes at its base centre, or at the pole foot for lamps and traffic lights.
  - It writes `blender/kit_assets.json` with sizes, arm directions and car noses.
  - Night-only window meshes get the material `fac_kit_nightlight`, so they light up at sunset and night like the other windows.
- **Placement:** the world scripts place `KIT_<asset>_<n>` empties (props `kit`, `rz`, `sx`, `sy`, `sz`) through `blender/kitlib.py`.
  - **Buildings:** `building()` gives about 75% of lots that suit a kit model (≤ 92 m, aspect within limits) a kit building, scaled to the lot. Repeats are penalised, so the four models spread evenly (38 of 80 lots). The other lots, the tall skyline and the hero district keep generated buildings, now textured in the kit style: white frames, blue glass, pale walls.
  - **Street furniture:** street lamps are kit `Spotlight_01` (96), and traffic lights are `traffic_light_002` (16). Parked and traffic cars and vans are kit cars; buses stay generated. Shrubs are kit bushes, and the avenues get bus stops, bins and bushes between the lamps.
  - **Roads:** flat dark asphalt with white paint, the kit's paving tiles on the sidewalks, and white kerbs instead of the magenta LED edges.
- **Game:** `src/kit.js` merges each asset per material and draws every asset as an `InstancedMesh` (about 50 draw calls for the whole kit).
- **Licence:** check the Cartoon City licence terms before a commercial launch.

## Trees (instanced palm model)

Every tree is one model, `public/assets/tree.glb` (a stylised palm, ~8k tris), drawn as GPU instances.
- **Placement:** the Blender world scripts place `TREE_*` markers with custom props `s` (scale) and `rz` (rotation). Trunk colliders stay in the world collider.
- **Drawing:** `src/trees.js` draws the full mesh within 60 m (48 m on medium, 35 m on low) and a baked impostor (two crossed alpha cards) beyond that.
- **Variety:** each instance gets its own height (8.5 m × `s`, ±12%), width, rotation and a slight colour drift. Swamp trees are tinted murkier.
- **Quantised geometry:** meshopt quantisation moves each mesh's real scale and offset onto its glTF node, so `trees.js` bakes the node transform into float geometry. Without that, trees render at double size and half underground.
- **Replacing the model:** `TREE_SRC=path/to/tree.fbx npm run build:tree`. `blender/process_tree.py` normalises the model to 1 m tall and strips any display base (loose pieces below 12% of the height; set `TREE_BASE_CUT=0` to keep it). It then stands the tree upright: the trunk is found by colour (brown texels), its centreline traced up to 62% of the height (`TREE_TRUNK_TOP`) and straightened to vertical, with the crown following (`TREE_UPRIGHT=0` keeps the original lean). It decimates only if the model is over 24k tris (`TREE_TRIS`), shrinks textures to 1024 px, renders the impostor and exports the GLB.

## Hand-painted textures

Stylised PBR sets live in `blender/textures_src/<set>/` (`color`, `normal` (OpenGL), `rough`, `ao`, `metal`, 1024 px), and `gen_textures.py` builds them into the game textures:

| Set | Used for |
|---|---|
| `brick` (bricks_wall_03) | `fac_brick` facades (behind generated windows), slate-tinted for `fac_granite`, hero `brick` |
| `stoneblock` (stone_bricks_wall_06) | `fac_sand` (as painted); tinted for `fac_stone` and `fac_stucco`; grey-tinted for `concrete` (planters, bases, trench walls, the arch) |
| `road` (old_road_01) | `asphalt`: the cracked tarmac between the baked lane paint and kerbs is cropped out and mirror-tiled |
| `ground` (ground_04) | park lawns (`grass`) |
| `metalplates` (metal_plates_01) | `darkmetal`, `roof_metal`, `steel`, `hull` |
| `metalorange` (metal_02) | `gold` props |

To swap a set, replace its files and run `python3 blender/gen_textures.py && npm run build:world`.
The procedural LYGIA grime and the albedo brightening are dialled down by day (`surf` / `stylize` in `look.js`), so the painted detail stays clean.

## The Bag Square (hero district)

The detailed, textured district (central hub, media tower and spires, Ad Canyon, RWA Vault, south crystal, plaza, roads and props)
is built by `blender/bag_square_hero.py`, using textures from `blender/gen_textures.py`. The look-dev file is
`blender/bag_square_hero.blend`, with cel shading and outlines. See **blender/BAG_SQUARE_BUILD_GUIDE.md** for the asset table,
the cel-shading and Line Art recipe, and the export rules.

## Blender pipeline

The world and character are generated by scripts so they're reproducible and editable:

```bash
blender -b -P blender/build_world.py       # -> public/assets/bag_square.glb + blender/bag_square.blend
blender -b -P blender/build_character.py   # -> public/assets/king.glb (fixes rig + adds clips)
```

Open `blender/bag_square.blend` to hand-edit. Re-export glTF with **+Y up** and **Custom Properties** on.
Object names are the contract with the game:

| Name | Game behaviour |
|---|---|
| `BB_01`…`BB_20` (props `aspect`, `slot`, `tier`) | live ad screens |
| `TICKER_1`…`6` | scrolling marketplace ticker |
| `PORTAL_FX_<ID>` (props `id`, `label`, `color`) | animated portal + E to enter |
| `HOLO_1`…`3` | prize hologram anchors |
| `ZONE_<id>` (props `label`, `radius`, `color`) | HUD location, minimap, fast travel |
| `SMOKE_*`, `VAULT_COIN`, `ROCKET`, `SPAWN` | FX / animated props / spawn |
| `COLLIDER` | merged collision mesh (hidden) |

Anything else gets merged per material to keep draw calls low (~140 draw calls total).

### Characters

```bash
# Golden King (Tripo FBX, T-pose, skeleton aligned) - the default character
blender -b -P blender/build_character.py -- goldenking/tripo_convert_66de0854-3bac-4f6b-b4cd-bf65a23bde5f.fbx goldenking
# Gym Bro (previous default, kept in blender/gymbro)
blender -b -P blender/build_character.py -- gymbro/gymbro_src.fbx gymbro
# King (older Tripo GLB, kept for reference): realign skeleton + re-weight, then add clips
blender -b -P blender/reskin_auto.py -- king_src.glb king_autoskin_src.glb
blender -b -P blender/build_character.py -- king_autoskin_src.glb king
# Any Mixamo FBX (e.g. the Maria test character) goes straight in
blender -b -P blender/build_character.py -- maria_src.fbx maria
```

What was wrong with the king: Tripo exported the joints with identity transforms, and its skeleton sat
rotated 90° and offset from the mesh (skinning only worked because the bind matrices cancelled it).
Its auto-weights were also poor, so trousers and coat smeared when the legs and arms moved.
`fix_rig.py` rebuilds the rest pose and moves the skeleton inside the mesh. `reskin_auto.py` then re-weights the mesh with
Blender's bone-heat weights and binds loose parts (crown, chains) rigidly to the nearest bone.
The Mixamo FBX test (Maria) imported cleanly, which confirmed the pipeline and pointed at the king's rig.

`build_character.py` handles both T-pose (Mixamo) and A-pose (Tripo) rest poses and cm/m units.

**Mixamo animations:** drop clips downloaded "without skin" into `blender/anims/` and rebuild. `retarget.py`
maps them onto each character in world space, so rest-pose differences don't matter. Root motion is
stripped so the clips play in place, and the jump's hip lift is removed because the game's physics does the jumping.
Current mapping (file → clip): Walking→Walk, Sprint→Run, Swagger_Walk→Swagger, Jumping→Jump (trimmed to take-off/landing),
Start_Walking→StartWalk, Stop_Walking→StopWalk, Walking_Turn_180→Turn180. The game doesn't use the last three yet.
Idle→Idle and Gangnam_Style→Dance are wired in too. Add `Falling_Idle.fbx` or `Waving.fbx` and they replace the last hand-keyed clips (Fall, Wave).

Alternative for any new character: upload the mesh (no rig) to mixamo.com's auto-rigger, download the FBX, and run `build_character.py` on it.

## Code map

```
src/main.js       renderer, post-processing, loop, interactions (portals, billboards, vault)
src/world.js      GLB setup: billboards, tickers, portal shader, holograms, smoke, zones, lights
src/player.js     character factory, Player controller, FollowCamera
src/physics.js    capsule-vs-BVH collision (three-mesh-bvh)
src/npcs.js       ambient crowd
src/hud.js        progression model + all HUD/DOM
src/creatives.js  canvas-drawn ad creatives, tickers, nameplates
src/input.js      keyboard / mouse / touch
```

## Next: blockchain + multiplayer (where it plugs in)

1. **Wallet login** — Privy / Dynamic + Solana Wallet Adapter. Replace `Progress` in `hud.js` with a store that's backed by the wallet's equipped skin.
2. **Stateful skins (Metaplex Core + Attributes plugin)** — read attributes on login; the authoritative server signs `updatePlugin` after validating sessions/matches. The client never writes XP.
3. **Multiplayer (Colyseus)** — the Square room at 20 tick; remote players reuse `makeCharacter()` + `addNameplate()` (see `npcs.js`). Move proof-of-play timing server-side.
4. **Billboard leases (Anchor + SPL USDC)** — on load, fetch active leases → swap `bb.userData.texs` for the advertiser's creative (image or `VideoTexture`). The rent card in `main.js` is where the Solana Pay flow goes.
5. **RWA vault** — replace the demo holograms with the escrowed prize NFTs' metadata; tournament countdown already reads a schedule function.
6. **Mini-games** — portals already hand off by `id` (`BAG_RUN`, `VAULT_HEIST`, `TILE_DROP`, `ARCADE`).

## Notes

- Ad creatives, hologram items and district props are original placeholder art; zone names follow the BagVerse map, but no third-party characters are modelled.
- Ticker prices and the "leased" status are demo data.

## RWA Vault assets
Vault items live in `src/rwa.js` (`RWA_ASSETS`). The featured card is Collector Crypt `inuRTqXX15NQAS48xZaHgFT4tCV4kdwrHisUhBkTZdD`: 2025 One Piece OP13 #118 Monkey D. Luffy, PSA 10.
- **3D slab:** shown on the vault's graded-card hologram.
- **Photo:** loaded from `public/assets/rwa/<mint>.jpg` if present, otherwise from Collector Crypt's CDN. If the image can't be used (CORS), a text-only face is drawn instead.
- **Vault modal (E):** photo, grade, mint and a link to the listing.

## Character hero lighting
Characters (player and NPCs) get a fill light from the camera's side and a soft rim light around the edges, so they stay readable in dark scenes. The code is `applyCharLight` and `charUniforms` in `src/surface.js`, hooked up in `makeCharacter`.

Strength is set per Look preset with `char: [fill, rim, fillColour, rimColour]`:
- day: 0.1 / 0.12
- sunset: 0.35 / 0.4
- night: 0.75 / 0.55, warm fill and cool moonlight rim

The effect is one shader term, so it costs nothing extra on LOW.

## Gotcha: GTAO and sprites
GTAO draws its depth/normal pre-pass with one override material, which ignores sprite billboarding. Labels and nameplates then land in that buffer as flat slabs fixed to the world axes, and cast dark skewed "shadows" on walls. `look.js` hides sprites, points and glow effects that don't write depth (`depthWrite: false`) or use additive blending for that pre-pass only. The list is refreshed every 30 frames, so NPC chat bubbles are covered too. Tests need `?fixeddt`, or the slow-renderer downgrade turns AO off and hides the bug.

## Emotes
- **1 = Thriller.** The user's four Mixamo parts (`blender/anims/Thriller_Part_1..4.fbx`) are stitched into one 1:50 clip.
  - `retarget.retarget_sequence` retargets each part in place.
  - It removes the dancer's travel with a ±1.5 s moving average of the hips path, so the hip sway survives.
  - It cross-fades each seam over 10 frames, because facing jumps by up to about 17° between parts.
- **2 = Dance** (Gangnam Style).
- **Lazy loading:** long emotes aren't baked into the character GLBs. `blender/build_emote.py` exports an animation-only GLB per character (`public/assets/<char>_thriller.glb`, about 1.1 MB after `tools/strip_anim.mjs` + meshopt). It's fetched the first time someone uses the emote (`ensureClip` in `player.js`), so the initial load is unchanged.
- **Rebuild:** `npm run build:emotes`.
- **Adding another long emote:**
  1. Add its name to `LAZY_EMOTES` in `player.js`.
  2. Build it with `build_emote.py`.
  3. Bind a key or an emote-wheel button.

## Characters
There are five skins: Golden King, Maria, Shiba Hoodie, Future Queen and Pumpkin Witch. All of them appear in the NPC crowd too.

The three new ones are Tripo exports with a 65-bone Mixamo rig. Their sources are in `blender/shiba|queen|witch/`, and they're built with the same `build_character.py` + `build_emote.py` pipeline as the Golden King (`npm run build:character`, `npm run build:emotes`).

To add another skin:
1. Unzip it to `blender/<id>/`.
2. Build it.
3. Add a `loadModel` line and a `CHARS` entry in `main.js`.
4. Add a `data-char` button in `index.html`.
5. Bump `LOAD_COUNT`.

## Skin selection screen
`src/skins.js` (`SkinScreen`) opens after loading and in game with K or the Skins button.
- **Left:** skin info panel with name, rarity, description, boosts and a favourite star.
- **Centre:** a live 3D pedestal preview. You can drag it to rotate.
- **Right:** a card grid with All / Owned / Unlocked / Favorites filters.
- **Bottom:** Back / Shop / Equip buttons. The keyboard works too: arrow keys, Enter to equip, Esc to go back.
- **Rendering:** the preview renders with the main renderer into the main canvas while the screen is open, and the world is paused. Card portraits are rendered from the real models at startup. Locked skins show as a silhouette of the closest body type.
- **Locked placeholders:** Santa GM, Pepe Hoodie and Cyber Green have no models yet. When one gets a model: build it like any other character, set `owned: true` in `SKINS`, and register it in `CHARS`.
- **Storage:** favourites are stored in `localStorage` under `bagverse.favs`.
- **Fonts:** Rajdhani and Permanent Marker are bundled with `@fontsource`, with no Google Fonts request.

## Statues and the selection platform
- **Golden bull:** `public/assets/bull.glb` sits on the plinth at Chad's Bull Run.
- **Pepe bust:** `public/assets/pepe_bust.glb` rises out of the Pepe's Swamp toxic pool.
- **Placement:** `build_world.py` places both as `PROP_<name>` markers (props `prop`, `rz`, `s`, plus a collider), and `World.placeProps` instances them. `YAW` in `world.js` holds per-model facing fixes; the Pepe bust's front is −Y, so it gets π.
- **Selection platform:** `public/assets/platform.glb` is the skin screen's pedestal (`SkinScreen.usePlatform`). It's scaled to 2.9 m across, and its deck is found by a downward raycast through the centre so feet land on it.
- **Rebuild:** `npm run build:props`. The exporter (`blender/export_prop.py`) keeps the Tripo PBR maps, caps textures (2048 for the platform, 1024 for the statues) and applies meshopt.
- **Skins:** there are now 8: Undead King (Legendary), Santa GM (Holiday) and Pepe Hoodie (Common) are playable. Cyber Green is the only locked placeholder left.

## Post-processing (pmndrs/postprocessing + N8AO)
The stack is built on `postprocessing`, the engine behind react-postprocessing. The game is plain three.js, so it uses the library directly, with no React layer. The pipeline (`Look.buildComposer`):

1. `RenderPass`. HIGH/MEDIUM use a 4× MSAA half-float frame buffer.
2. `N8AOPostPass` ambient occlusion on HIGH/MEDIUM: quality Medium (HIGH) or Low half-res (MEDIUM). It works from the depth buffer, so sprites don't produce the dark slabs GTAO had.
3. A sanitize `EffectPass` that removes NaN/Inf pixels before bloom.
4. One merged `EffectPass`:
   - `BloomEffect` with mipmap blur.
   - `ExposureEffect`.
   - `ToneMappingEffect` (Neutral).
   - `GradeEffect`: vibrance, contrast, S-curve, warm highlights, lifted shadows, vignette, applied in sRGB space.
   - `ChromaticAberrationEffect` (HIGH only, radial, edges only).
   - `NoiseEffect` film grain (2%, 4.5% at night).
5. `SMAAEffect` on LOW and WebGL1.
6. `SharpenEffect` (contrast-adaptive, 0.55), with dithered output.

Other notes:
- `renderer.toneMapping` is `NoToneMapping`. Anything that renders straight to the screen, like the skin screen preview, sets Neutral tone mapping itself while it draws.
- Bloom presets still use `[strength, radius, threshold]`, mapped to intensity ×2.0, radius +0.2 and threshold +0.1.

## Mobile
- **Skins load on demand.** At boot the game downloads the player's skin plus a few crowd models: 3 on LOW, 5 on MEDIUM, 8 on HIGH (`CROWD_N`). Other skins download the first time they're picked on the selection screen, which shows "Loading skin…" until then. On phones the first download drops from about 29 MB to about 17 MB.
- **Card portraits are pre-rendered.** They're baked into `src/assets/skin_thumbs.js`, so the screen doesn't need every model downloaded. After adding a skin, run `node tools/dump_thumbs.mjs` with `npx vite preview` running.
- **LOW caps character textures at 1024 px** (`capTextures`), which is a quarter of the GPU memory per texture.
- **Touch devices get no backdrop blur.** The panels switch to more opaque backgrounds instead.
- **Test:** `node tools/mobile_test.mjs` emulates a Pixel 7. It checks the tier, the boot downloads, that blur is off, the portraits, the on-demand load and the texture cap.
- **Gotcha:** the pmndrs `EffectComposer` turns `renderer.autoClear` off. Any direct `renderer.render` must clear first: the skin preview calls `renderer.clear()`, and the GI cubemap capture switches autoClear on around `CubeCamera.update`.

### iPhone / iOS Safari memory
iOS Safari kills a tab long before Android does. Before this fix, LOW asked for about 510 MB of GPU textures, plus decoded copies held in page memory, and an iPhone 11 Pro crash-looped.
- **Phone copies:** LOW now loads `<name>.m.glb`. Textures are capped at 512 px for the world and statues and 1024 px for characters, the kit and the platform, re-encoded as WebP and compressed with meshopt. Build them with `npm run build:mobile`. Boot GPU textures drop from about 509 MB to about 178 MB, and the first phone download from about 17 MB to about 7.6 MB. Check with `node tools/texbudget.mjs <names>`.
- **Decoded images are released:** on LOW, each texture's ImageBitmap is closed right after it uploads to the GPU (`releaseImagesAfterUpload`).
- **SAFE mode:** if a LOW session dies (leftover boot flag, or WebGL context loss), the next run sets `bagverse.safe`. That means no grass or shadows, 4 NPCs, one character model at boot and a 0.7 MP resolution cap. The GFX button reads "SAFE" in this mode, and picking any tier leaves it.
- **iPadOS detection:** iPadOS identifies itself as a Mac, so it's detected by `maxTouchPoints`.
- **Test:** `DEV="iPhone 11 Pro" node tools/mobile_test.mjs`. Add `CRASHED=1` to simulate a crashed previous session.

## Street cars
- **Models:** the user's Black Race Touring, Silver Retro Car and Flying Transport Vehicle, each with its PBR pack. Sources are in `blender/cars/`.
- **Export:** `blender/export_cars.py` writes `public/assets/cars.glb` plus `blender/cars_assets.json`. There are 12 roots, `CAR_<BRT|SRC|FTV>_<Default|Red|White|Black>`: each model with its default paint and the pack's red, white and black kits. Every car is 4.6 m long, nose −Y, wheels on z = 0, and the flying vehicle hovers 0.6 m up. Each variant has its own mesh copy, because glTF keeps materials on meshes. With shared data, every variant would export the same paint.
- **Texture gotcha:** the packs' roughness and metallic maps are 16-bit grayscale PNGs. PIL's `convert('L')` misreads them as solid white, but Blender reads them correctly.
- **Placement:** `kitlib` merges `cars_assets.json` into its asset info, and the hero ring road cycles through models and paints (`_CAR_ORDER`), so neighbouring cars never match.
- **Buses and vans/trucks are removed.** Their lane spots get cars, so traffic density stays the same: 12 cars.
- **Game:** `main.js` loads `cars(.m).glb` and appends its roots to the kit scene, so `Kit` instances them. `kit.js` gives `CAR_*_Body` materials a clear coat (clearcoat 1, roughness 0.06).
- **Rebuild:** `npm run build:cars`, then `npm run build:world` and `npm run build:mobile`.

### Skin card art
The owner-supplied 3:4 portraits live in `src/assets/skin_art/<id>.webp`. They're resized to 360×480 WebP and registered in `src/assets/skin_art/index.js`. They take priority over the rendered portraits in `skin_thumbs.js`, which still cover Maria and the locked Cyber Green. Cards use `aspect-ratio: 3 / 4`. To add art for another skin, drop in `<id>.webp` and add it to `index.js`.

The display names come from `SKINS` in `skins.js`: SHIB GIRL, PEPE GUY and SANTA GUY.

## Hand-painted look (soft edges + painted shading)
- **Rounded edges (geometry):** `build_world.py` runs `bevel_pass()` before export. Every solid building, trim, metal, roof and prop mesh gets a bevel with hardened normals (9 cm by default). Flat ground, decals, glass, neon, screens, text and foliage are skipped.
  - `BEVEL_SEG=2` (rounded) is used for the desktop build and `BEVEL_SEG=1` (chamfer) for the phone build `bag_square.m.glb`. `BEVEL_W` sets the width.
  - `export_kit.py` does the same for kit towers (12 cm), props (3 cm) and poles (1.5 cm).
  - World triangles go from about 196k to about 410k on desktop and about 280k on phones.
- **Painted shading (`src/paint.js`, all tiers):**
  - Edge highlights and crevice shading come from screen-space curvature of the world normal. The bevels are the only places the normal bends, and the effect fades out past about 60 m.
  - Walls get a cool street-level to warm rooftop gradient.
  - Wrapped diffuse light.
  - Softer roughness, with geometric specular anti-aliasing.
  - Glass, chrome and kit glass get a lite version (specular AA only), so they keep their reflections without sparkling.
  - Tuning lives in `paintUniforms` (`window.__bagverse.paintUniforms`). `?nopaint` turns the layer off.
- **Gotchas:**
  - Wrap only the *diffuse* term. Wrapping the shared irradiance leaks sun specular onto faces turned away from the light, and small bevel facets then sparkle under bloom.
  - The paint uniforms are zeroed during `Look.captureGI`. Otherwise the painted look is captured as bounce light and brightens the whole scene, including unpainted floors.
- **Deterministic builds:** `building()` used `hash((x, y, "kit"))`. Python randomises string hashing per process, so every world build reshuffled which lots got kit towers. It now seeds from a string, which is stable across runs, and desktop and phone builds produce identical layouts.

## Skins update (Oct 21)
- **Idle:** the Warrior Idle (user-supplied Mixamo clip, 11.4 s loop) is now `blender/anims/Idle.fbx` (the old one is in `Idle_old_backup.fbx`). Every character was rebuilt, so the in-game idle and the skin-screen pedestal idle both use it.
- **New skins:** Habibi Guy (`habibi`, Legendary) replaces Maria, who is retired from `CHAR_IDS` and `SKINS`. Saved selections of `maria` fall back to the Golden King. Rizzmas Guy (`rizzmas`, Holiday) is new. Both have Thriller clips, phone copies and portrait card art.
- **Skin screen layout:** the card panel is 560 px wide (440 px under 1100 px), so cards show the full portraits. The 3D stage is narrower (left 268, right 606), so the character sits further left. The dark fade over the card art now covers only the bottom 14%.
- **Skin screen zoom:** the default framing is closer. The character fills about 86% of the stage, with the top of the pedestal still in view. Zoom with the mouse wheel or trackpad, two-finger pinch, or double-click/double-tap (toggles about 2.1×), up to 2.6×. As you zoom, the camera eases from a full-body view to a chest-up portrait (`frameCamera` aim and height follow a smoothstep of the zoom). Zoom resets each time the screen opens.

## Santa Girl + vault backdrop (Oct 21)
- **New skin:** Santa Girl (`santagirl`, Holiday). Source is in `blender/santagirl/`. She has a Thriller clip, a phone copy and card art (`src/assets/skin_art/santagirl.webp`). `CROWD_N` on high is now 10, so every skin can appear in the crowd.
- **Backdrop:** the user's 2576x1438 vault-room painting (`src/assets/skin_bg/vault_room.webp`, plus the phone copy `vault_room_m.webp`) is drawn as a full-screen cover quad behind the preview. Each frame the quad is pinned so the painted rune pedestal (image px 1288,1095, about 830 px wide, treated as 2.6 m) lands under the character's feet at any zoom or aspect. The 3D platform, panel and fog are hidden on this screen.
- **Lighting:** the cyan/teal hologram rig was replaced with a warm-neutral key (2.7), a white fill, a hemisphere light, and a soft green rim and under-light that match the pedestal glow. Skins keep their true albedo colours, and the green rim ties them into the painting.

## Mobile HUD (Oct 21)
- **Touch layout** (`body.touch`, bottom of `src/style.css`): every control has its own slot, sized by CSS variables (`--mm`, `--btn`, `--joy`, `--jump`...) and kept clear of safe areas (`viewport-fit=cover` + `env(safe-area-inset-*)`).
  - Portrait: level and tier top-left; minimap and $BAG top-right with a column of round buttons under it (Skins, Inventory, Map, Chat, Settings); joystick bottom-left with a light chat feed above it; Jump, Use (E) and Emote bottom-right. The emote picker opens as a column to the left of the Emote button.
  - Landscape phones (`max-height: 540px`): the round buttons become a row beside the minimap, and all controls shrink. Tablets get a larger version.
- **Hidden on touch:** the logo, the proof-of-play line, the zone chip (the zone toast still shows), keyboard hints and the always-on chat input. The ⚙ button opens Time of day and GFX. 💬 opens a full-width chat bar with a 16 px input, so iOS doesn't zoom. The chat feed fades while a popup is open.
- **Embedded:** inside an iframe (the Claude app's viewer), `body.embedded` moves the top row down so the host's close and menu buttons don't cover it.
- **Test:** `node tools/hud_test.mjs` (preview server on :4173) checks iPhone 11 Pro portrait and landscape for overlapping or off-screen controls and saves screenshots.

## Mobile skin screen (Oct 21)
- **Touch layout** (`body.touch #skins`, end of `src/style.css`):
  - Portrait stacks the stage, a one-line info strip (name, rarity, boosts, favourite), a swipeable row of cards with the filters above it, and the actions.
  - Landscape phones split the screen: stage and strip on the left (46vw), cards and actions on the right.
  - The title sits centred between the host viewer's corner buttons. The rotate hint, the description and the decorations are hidden on touch.
- **Card sizing:** cards size themselves from the row's real height with container query units (`100cqh`): 3:4 art plus a 40 px label, so names never clip. Older browsers fall back to `--cw`. The selected card scrolls into view.
- **Test:** `node tools/skins_mobile_test.mjs` checks iPhone 11 Pro (portrait and landscape), iPhone SE and Pixel 7 landscape for overlaps and saves screenshots.

## Flashmob (Oct 21)
- **Use:** while your emote is playing (1 Thriller, 2 Dance), press **F**, or tap the pulsing 🕺 FLASHMOB button above E on touch. Desktop shows an `F START A FLASHMOB` prompt.
- **Gathering:** NPCs within 75 m (up to 14) run over and fill a wedge behind you: rows of 2, 3, 4, 5 and 6, 1.7 m apart, 1.5 m between rows. A slot is dropped if it's off a ledge or behind a wall (ground and ray checks). The front rows fill first, each taking the nearest free NPC.
- **Sync:** dancers face your way and play the same clip. Their action time follows yours, aimed one mixer step behind it because the crowd updates after the player, and snaps back if it drifts more than 40 ms. Thriller streams in per character through `ensureClip`, so a dancer idles until their copy has loaded. Changing emote mid-mob makes everyone switch.
- **Stuck dancers:** if a dancer makes no progress for 3 s (walls, the vault), they slip straight into their slot.
- **Ending:** moving or jumping stops your emote and ends the mob. Dancers wave or idle for a moment, then go back to wandering.
- **Code:** `Crowd.startFlashmob`, `endFlashmob` and `mobStep` in `src/npcs.js`; `flashmob()` in `src/main.js`.
- **Test:** `node tools/flashmob_test.mjs` (preview on :4173; `?fixeddt=<seconds>` sets the test time step) checks that dancers join, sync within 0.1 s and leave.

## Driveable car: Vision 1789 (Oct 21)
- **Asset:** "vision 1789" by amogusstrikesback2 on Sketchfab, **CC BY 4.0** (`LICENSES/vision_1789.txt`). The credit is shown on the loading screen and in chat the first time you drive.
- **Build** (`npm run build:vision`): `blender/export_vision.py` trims the headlight beam cones (they rendered as black streaks), turns the glow atlas into an emissive `VIS_Glow`, and names the nodes the game drives (`VIS_WHEEL_<FL|FR|BL|BR>_STEER/_SPIN`, `VIS_BRAKE`, `VIS_REVERSE`, `VIS_DOOR_L/R`). The car is 1:1 scale (4.84 m long). Desktop GLB is 663 KB; the phone copy is 485 KB (512 px textures).
- **Handling** (`src/vehicle.js`): arcade bicycle model with about 130 km/h top speed, speed-sensitive steering, a brake that never turns into reverse, and S to reverse once stopped.
  - **Walls:** three rays from the body centre to the bumper corners; the car bounces off at a quarter of its speed.
  - **Ground:** sampled under both axles for ride height and pitch, with a little air off drops. Steps over 0.9 m count as walls.
  - **Feel:** body roll in turns. The wheels steer and spin on their own nodes, and the brake and reverse lights follow the pedals.
  - **People:** NPCs are shoved aside and sometimes shout. Walkers can't pass through the parked car (`Car.pushOut`).
- **Controls:** walk up to the car and press **E** to get in. W/S or the stick drive, A/D steer, Space or the held BRAKE button brakes, and **E** steps out on the driver's side, or the other side or behind if that's blocked. The chase camera swings in behind the car when you haven't looked around for 1.2 s. A speedometer shows while driving (bottom centre on desktop, top centre on touch), and the emote and flashmob controls hide.
- **Parking:** on the road 6 m left of and 7.5 m behind the spawn, nose down the south avenue. The plaza is ringed by bollards; `tools/car_dbg2.mjs` sweeps candidate spots.
- **Tests:** `tools/car_test.mjs` (drive, steer, brake, exit) and `tools/car_mobile_test.mjs` (touch HUD overlaps while driving).

## Scooters + Christmas Elf (Oct 21)
- **The car is parked:** the Square doesn't have enough road for it yet. The Vision 1789 only loads with `?car`; its code and asset stay in place.
- **Punk scooter** (`npm run build:scooter`): `blender/export_scooter.py` straightens the Tripo model, which sits about 53° off-axis with one wheel lifted. It levels the scooter on both wheels, scales it to 1.42 m (handlebar 1.05 m) and adds `SCT_DECK`, the rider's stand point. The 4K texture is cut to 1024 px: 382 KB desktop, 216 KB phone.
- **Garage:** `progress.s.vehicles` (saved with the profile) defaults to `['punk']` while testing. Inventory lists the garage and has a RIDE button.
- **Riding:**
  - **Summon:** **R**, the 🛴 action button, or Inventory → Ride puts the scooter under you and you hop on. R, E or 🛴 again gets you off, leaving it parked; E next to a parked scooter rides it again.
  - **Handling:** the same arcade model as the car with the `scooter` spec in `src/vehicle.js`: 40 km/h top speed, light reverse, leans up to 0.3 rad into turns, and climbs steps up to 0.45 m.
  - **Rider:** stands on the deck, leans with the board and plays the **Ride** clip. Its kick cycle runs at speed / 5 and freezes when you stop.
  - **Touch:** the 🛴 button sits above E (red while riding), the BRAKE button brakes, and the flashmob pill moves up above it.
- **Ride clip** (`npm run build:ride`): the Mixamo "riding a 2 wheel scooter" loop that came with the elf (`blender/anims/Ride.fbx`), retargeted to every skin by `build_emote.py` with `DRIFT=linear` (steady travel removed exactly). About 47 KB per character, streamed on first ride (`LAZY_EMOTES`).
- **Christmas Elf skin** (`elf`, Holiday): built from `blender/elf/`, with Thriller and Ride clips, a phone copy, and a placeholder card rendered from the model (`src/assets/skin_art/elf.webp`; replace it with illustrated art like the other cards). `CROWD_N` on HIGH is 11.
- **Tests:** `tools/scooter_test.mjs` (summon, ride, lean, dismount), `tools/scooter_shots.mjs` (rider close-ups) and `tools/scooter_mobile_test.mjs` (touch overlaps on foot, emoting and riding).
- **Hands on the grips (Oct 21):** the Ride clip was authored for a smaller scooter, so the hands floated above the bar. After the mixer runs, an analytic two-bone IK (`twoBoneIK` / `armChains` in `src/player.js`) bends each arm so the wrist lands on its grip, with the elbows bent out, down and back. The grips are measured once from the scooter mesh: the outer ends of the bar above 0.88 m. Test: `tools/scooter_hands.mjs` reports the hand-to-grip error (0 mm) and saves views. The rider root sits at `SCT_DECK` (0.04 m behind centre), so the stem is in front of the body.

## Solana Girl, Vampire Girl, Scream Guy (Oct 22)
- **Solana Girl** (`solanagirl`, Epic) replaces **Solana Queen**: `queen` is gone from `CHAR_IDS` and `SKINS`, and a saved `queen` selection becomes `solanagirl`. The locked Cyber skin's fallback silhouette uses her model. The queen files stay in `public/assets` but are no longer loaded.
- **Vampire Girl** (`vampire`, Epic) and **Scream Guy** (`scream`, Holiday) are new.
- Each has a character GLB, a phone copy, Thriller and Ride clips, and the user's portrait card art (896x1200, cut to 360x480 webp). `CROWD_N` on HIGH is 13.
- **Test:** `tools/new_skins_test.mjs [ids]` selects and loads each skin on the selection screen and screenshots it.
## Progression: Level 1 → 250 (as built, Oct 22)

Implements the "long grind" blueprint (research report, Oct 22), plus the onboarding tutorial, missions and RWA prize entry kiosks.

## Curve
- **Formula:** `xpToNext(L) = 50 + 4000·L²/(L²+45²) + 12·max(0, L−100)`. Total XP to Lv 250 is about 894K. After that come **Legend levels** at a flat 6,000 XP each.
- **Milestones (cumulative XP):** Lv 10 ≈ 1.0K · 25 ≈ 9.5K · 50 ≈ 50K · 100 ≈ 197K · 150 ≈ 390K · 200 ≈ 625K · 250 ≈ 894K.
- **Modelled pace:** engaged players reach Lv 250 in about 16 months, hardcore in about 8.5 months; casual players reach Lv 100 in about 8 months. These are model estimates; re-baseline after 4–6 weeks of telemetry.
- **Tiers:** BASE 1 · CHROME 25 · HOLO 50 · APEX 100 · PRISM 150 · ECLIPSE 200 · GENESIS 250. Each band shows I/II/III sub-steps.
- **Migration:** old saves keep every XP point and are re-levelled on the new curve. XP no longer mints $BAG, and the old 3× multiplier is gone.

## XP sources (caps per day)
| Source | XP | Guard |
|---|---|---|
| Proof-of-play | 10/min for the first 60 min, 5/min up to 180, then 0 | Idle 90 s or a hidden tab pauses the clock |
| Rested XP | Doubles play XP | Builds 5% of a level per 8 h offline, max 150% of a level |
| Login calendar | 25 → 150 over 7 days | A missed day pauses the calendar, never resets it |
| Dailies (3) | 150 each + 150 for all three | 1 reroll a day. Missed days bank up to 3 catch-up payouts. Streak bonus +10/20/30% at 7/14/30 days; a freeze every 7 days (hold up to 2) |
| Weeklies (7) | 300 each + 1,000 at 5 done | Reset Monday |
| Tutorial (12 steps) | about 1,400 incl. 300 completion bonus | Once |
| Hidden Bags | 100 each, +1,000 per district | 220 total (20 × 11 districts), at least 6 m apart, open sky |
| Billboards | 50 per new screen | 250/day |
| Flashmob host | 50 | 200/day |
| GM | 25 | Once a day |
| Achievements | 100–5,000 | 37 awards, once each |
| $BAG holders | APE +5% · DEGEN +10% · WHALE +15% | Play XP only |

## Onboarding flow (session 1 → about Lv 10–13)
1. **Welcome card:** what levelling, missions, RWA prizes and unlocks are, then Start the guide or Skip.
2. **Guide:** walk → look → jump → say GM → Dance (unlocks at Lv 2) → ride the scooter (Lv 5) → visit the RWA Vault (gold beacon) → view prizes → find a hidden Bag (beacon on the nearest) → watch a billboard → equip a skin → start a flashmob (Thriller + F, Lv 10).
3. **The tracker** on the HUD shows the current step, its hint and progress. Tap it, or press J, to open Missions.
4. **After the guide:** dailies, weeklies, streaks and the login calendar open. From the next day, the login reward pops up when the game opens.

## Gates
Dance Lv 2 · portals Lv 3 · Punk Scooter Lv 5 · Thriller and flashmobs Lv 10 · RWA Tier-1 Lv 25 · Tier-2 Lv 50 · APEX Arena Lv 100. Locked actions show a toast saying the level they unlock at. `?unlockall` opens everything for testing.

## RWA prize entry kiosks (free, skill-based, one entry per week)
| Kiosk | District | Tier | Event | Prize |
|---|---|---|---|---|
| Chad's Bull Run | bull_run | 1 · Lv 25 | Bull Run Sprint Cup | 1 g tokenized gold |
| Doge Park | doge_park | 1 · Lv 25 | Doge Park Dash | Graded card (PSA 9) |
| Pepe's Swamp | swamp | 1 · Lv 25 | Swamp Stomp Showdown | Tokenized silver coin |
| GM Gate | gm_gate | 1 · Lv 25 | GM Gate Gauntlet | Vaulted sneaker grail |
| HODL Heights | hodl_heights | 2 · Lv 50 | Heights High Score | Tokenized gold watch |
| Copium Refinery | copium | 2 · Lv 50 | Refinery Rush | 10 g tokenized gold |
| Arcade | arcade | 2 · Lv 50 | Arcade Masters | Graded grail (PSA 10) |
| APEX RWA Arena | apex_arena | 3 · Lv 100 | APEX Grand Final | 1 kg tokenized gold |

The prize names are placeholders until real vault inventory is assigned. The RWA Vault keeps its featured-asset showroom. Kiosks are gold diamonds on the minimap. Entries are stored locally for now. Before real prizes run, get legal review covering free entry, KYC, region rules and 1099s at $2,000+.

## Code
- `src/progression.js`: curve, tiers, `REWARDS` / gates, capped `grant()`, rested XP, streaks, login.
- `src/quests.js`: tutorial, daily/weekly pools (seeded per day/week), achievements, and the `emit()` event stream.
- `src/collectibles.js`: Bags, kiosks, beacon.
- `src/missions_ui.js`: panel, tracker, welcome, login, XP feed.
- Events emitted from `main.js`: walk/ride metres, jump, look, chat, gm, emote, zone, bag, billboard, flashmob, rwa_view, rwa_enter, skin, portal, playMin.

## Not built yet (marked SOON on the reward road)
Hoverboard, Legendary scooter, apartment, trails, auras, PRISM-and-up hubs and statues, mini-games (Bag Run etc., so tournaments have scores to rank), server-authoritative XP, anti-bot reputation score, soulbound Passport, telemetry dashboards.
- **Logo (Oct 22):** the BagVerse PNG (`src/assets/logo.webp`, cropped to the lettering, transparent) replaces the old text logo on the loader, HUD and skin screen via `.logo` (no glow; the text stays for screen readers).

## Audio (Oct 22)
- **Engine** (`src/audio.js`): WebAudio with sfx / ambience / music buses. It unlocks on the first tap or key (iOS), suspends while the tab is hidden, and has a 🔊 Sound toggle in settings (on touch it's in the ⚙ menu; the choice is saved).
- **Slots:** every sound is a named slot with a DailySounds.org source and a synthesised fallback, so the game has sound before the files are added and keeps it if one fails.
- **Hooks:**
  - **UI:** button clicks; opening Missions; locked features (error).
  - **Progress:** quest done (success); awards (sparkle); level-ups; tier milestones and district clears (chest power-up).
  - **World:** Bag pickup (coins); login gift; RWA kiosk scan accept/deny and entry; billboard watched (ping); skin equip and skin screen (whoosh); jump; scooter summon/dismount (poof), brake, motor loop pitched by speed; flashmob (record scratch).
  - **Loops:** footsteps paced by speed; city ambience everywhere; crowd chatter near the plaza; an ambient pad on the skin screen.
- **Adding the real files:** download the mp3s listed in `SLOTS`, then run `python3 tools/import_sfx.py <folder|zip>`. It writes trimmed, mono, loudness-normalised `public/sfx/<slot>.mp3`.
- **Credit:** "Sound effects from DailySounds.org" on the loading screen. Licence notes are in `LICENSES/dailysounds.txt`.
- **Test:** `tools/audio_test.mjs`.
- **Frankie (Oct 22):** `frankie` (Holiday), built from `blender/frankie/` with Thriller and Ride clips, a phone copy and the user's portrait card. `CROWD_N` on HIGH is 14.

## Mini-games: Bag Run
`src/minigames/bagrun.js`. Enter via the **BAG RUN** portal in the plaza (opens at Lv 3, with the portals).
- A 60 s dash along a **route that changes every run** (never the same plan twice in a row). There are 12 plans (`PLANS` in bagrun.js): Square Sprint and Plaza Bow-tie stay in the plaza; Downtown Loop, Vault & Tower and Ad Canyon Circuit go to nearby districts; GM Gate, HODL Heights, Arcade, Copium, Bull Run, Swamp and Doge Park leave the plaza and come back. Routes are roughly 250–480 m with 44–90 bags.
- Each route is pathfound live. A 2 m walkability grid is built from the collision mesh (ground height, 3.2 m headroom, 1 m side clearance, no ledges over 0.32 m). It is flood-filled from the square a few ms per frame (`warm()`, about 25k cells) and only the biggest connected area is used. A* links the waypoints, and cells already on the route cost more, so the way back takes different streets. The path is then string-pulled, and a bag is placed every 5.5 m with a random weave.
- 4 mega bags per route, at the start and every quarter (+50 × combo, +3 s). Drop-barriers sit about every 4th gap, always with room to pass (−15 score, 0.9 s stun, combo reset). The guide beacon points to the next bag in route order.
- Music: `public/sfx/bagrun.mp3` ("Final Countdown", a BagVerse original made with Suno, loudness-normalised and looping). It plays on the music bus from the countdown and fades out at the end; city ambience is ducked during a run. `Audio.music(name)` and `stopMusic(fade)` handle it.
- The combo grows for each bag picked up within 2.5 s of the last; the guide beacon points at the nearest bag. Esc or ✕ quits the run.
- XP = 20 + min(40, score/75), at full value for the first 10 runs a day, ×0.5 for runs 11–20 and ×0.1 after that. The game keeps a personal best and a weekly best (for future tournaments) in `save.mg.bagrun`.
- Hooks into missions: dailies (2 runs, 800+), weeklies (10 runs, 2,000+), achievements at 1,500 and 3,000 points and 4 achievements. The RWA kiosks list their linked game and your weekly best.
- Tests: `node tools/bagrun_test.mjs [m]` (gameplay) and `node tools/bagrun_routes.mjs` (builds all 12 plans and reports length, bags and timing) against `vite preview --port 4173`.
- **Kaizoku Guy and Kaizoku Girl (Oct 23):** `kaizokuguy` and `kaizokugirl` (Legendary), built from `blender/kaizokuguy/` and `blender/kaizokugirl/` with Thriller and Ride clips, phone copies and the user's portrait cards. `CROWD_N` on HIGH is now 16, so every skin appears in the plaza crowd.

## Money-bag models (Oct 23)
`public/assets/bag_green.glb`, `bag_gold.glb` and `bag_purple.glb` come from the user's Tripo models in `blender/props/bag_*/`, exported with `blender/export_bag.py` (1 m tall, decimated from 9.7k to 1.6k triangles, 512 px WebP texture, meshopt). `setBagModels()` and `bagAsset(color)` in `collectibles.js` turn them into instanced geometry scaled to 0.45 m, with a faint self-glow from the texture; the procedural sack is the fallback.
- **Green:** the 220 hidden world Bags (green minimap dots and glow).
- **Gold:** Bag Run's regular Bags (gold on the minimap; gold guide beacon during a run).
- **Purple:** Bag Run Mega Bags.
- **Retextured (Oct 23, later):** the user sent new green and gold textures. `bag_green` and `bag_gold` were re-exported the same way; purple is unchanged.

## Standing billboards (Oct 23)
The two freestanding LED totems at the plaza's south corners (ad slots `BB_19` and `BB_20`, tier `totem`) now use the user's standing digital-signage model: `public/assets/standing_billboard.glb`, from `blender/props/standing_billboard/` via `export_prop.py` (1 m tall, 1024 px textures).
- `src/standees.js` does three things at load:
  1. Cuts the old box housing out of the merged world meshes (triangles inside the old 2.6 × 0.7 × 6.4 m footprint).
  2. Stands the model behind each screen, scaled about 6.2× so its screen frame matches the 2.2 m-wide ad.
  3. Fits the ad quad to the model's screen (measured screen rect on the 1 m model: centre (0.0025, 0.583), 0.355 × 0.61, surface at z 0.0896).
- The ads, rotation and watch-to-earn work as before. The old collider is kept.
- `bag_square_hero.py` no longer builds the housing, so after a world rebuild the cut finds nothing.
- Test: `node tools/standee_test.mjs`.

## Archway billboards (Oct 23)
The avenue gantries at the plaza mouths (S / E / W, ad slots `BB_16`–`BB_18`, tier `gantry`) now use the user's archway billboard model: `public/assets/billboard_archway.glb`, from `blender/props/billboard_archway/` via `export_prop.py` (2048 px texture, meshopt).
- `src/standees.js` handles both kinds through one function, `placeBillboardModels(scene, world, { totem, gantry })`, with per-tier `KINDS`.
- The archway is scaled about 20.3× so its screen frame matches the 11.6 m ad. It ends up about 20 m wide and 12.8 m tall, and its posts land on the old ±9.6 m post colliders.
- Measured screen rect on the exported model: centre (−0.002, 0.426), 0.57 × 0.288, surface at z 0.0168.
- The old darkmetal posts, beam and backing and the cyan post strips are cut out at load. The ground, curbs and road paint (anything below 0.35 m) are never cut.
- `bag_square_hero.py` now only builds the screen and post colliders for the gantries.

## Wano Vault and Kanto Vault (Oct 23)
Two user models replace generated landmarks: `public/assets/wano_vault.glb` and `kanto_vault.glb`, from `blender/props/{wano,kanto}_vault/` via `export_prop.py` (2048 px, about 9k triangles each). `src/landmarks.js` (`VAULTS`) runs in two steps: `prepareVaults()` before `world.init` and `placeVaults()` after.
- **Wano Vault** replaces the RWA Vault hall on its plinth east of the plaza (zone `rwa_vault`, now labelled WANO VAULT). It is scaled to 16 m wide with the door facing west. The theme is **graded One Piece card raffles**: the featured prize is the real Luffy PSA 10 from `src/rwa.js`, with two "prize TBA" One Piece slabs.
- **Kanto Vault** stands in the open middle of Chad's Bull Run plaza at (108, 133), between the golden bull and the sand towers. It is 24 m wide and faces the way in from the city. Zone `apex_arena`, now labelled KANTO VAULT, moves with it (radius 22) via `world.zoneMoves`. Street props and trees under its footprint are dropped. The old APEX RWA Arena site south-east of it is cleared: stands, glow ring and gate are cut; the gold floor stays. The theme is **graded Pokémon card raffles**, with three "prize TBA" slabs until real cards are added. Kiosk `k_apex` is now the Kanto Vault Kiosk (Kanto Pokémon Raffle, tier 3).
- **At load:**
  - The old structures' triangles are cut from the merged world meshes and from the collision mesh. Anything below the plinth/ground level is kept (plinth, steps, gold floor and its neon ring, roads).
  - Each model's own triangles and the pedestals are added to the collision mesh, so the buildings are solid. Players stop at the facades and recessed doors.
  - The base slabs sit 15 cm above the ground so players can step onto them.
- **Not enterable:** each vault has a forecourt with 3 hologram slabs on pedestals (countdown "RAFFLE IN …"), a door light and an **E** prompt at the door. The prompt opens the raffle card: prize, grade, cert and mint (Wano), draw time (Sundays 20:00 UTC), level gate (Wano Lv 25+, Kanto Lv 100+) and "Enter raffle (soon)".
- **Kept as before:** zone ids, saves, the tutorial "Visit the Wano Vault" step (the beacon points at the door), kiosks, Bag Run plans and bag placement (open spots avoid the new buildings).
- **Measured on the 1 m models:** door depth from centre (Wano 0.13, Kanto 0.085), base-slab edge (0.38) and slab height (0.02 / 0.014).
- **Test:** `node tools/vault_test.mjs` (front views, walking into each door, prompt, modal).

## Multiplayer (Oct 23)
`src/multiplayer.js` runs on the claude.ai artifact **`room`** capability, so there is no game server: everyone who has the published page open at the same time is in one shared world. The artifact declares `capabilities: { room: {}, user: { scopes: ['profile'] } }`.
- **Presence:** each page publishes one presence object, re-sent at most about 12×/s and only when it changes (the platform budget is about 40/s). It carries: name, tier tag, level, skin, position, facing, animation (Idle / Walk / Run / Jump / Fall / Dance / Thriller / Ride), speed, the scooter's pose when riding, and the last chat line with an id. The platform hands it to newcomers and clears it when a player leaves.
- **Remote players:** each one shows in their own skin (loaded lazily) with a **TEAM** nameplate (**GUEST** for people invited from outside the org) using their claude.ai name via `user.profiles()`, falling back to the in-game name. Movement and facing are smoothed, and long jumps snap. Scooter riders get a cloned scooter with the rider on the deck playing Ride. Chat lines show as bubbles and in the chat log, and joins and leaves show as toasts.
- **HUD:** the **👥 N ONLINE** chip (top right) lists who is here, each with **GO TO** (teleport next to them). Teammates are cyan rings on the minimap.
- **Safety:** everything received is untrusted. Numbers are clamped, strings are capped and stripped of control/invisible characters, text is rendered as text, and the room is capped at 24 remote avatars.
- **Without the room** (signed out, public link, a saved copy, local dev) the game runs single-player as before.
- **What is per player:** progress, Bags, quests, Bag Run scores and the NPC crowd stay local.
- **Test:** `node tools/mp_test.mjs` opens two tabs with `window.claude.use('room'|'user')` mocked over a BroadcastChannel.
- **Races (Bag Run):** with teammates online, **E** at the Bag Run portal offers **SOLO RUN** or **HOST A RACE**.
  - A race publishes `race: { id, plan, seed, at }` in the host's presence, where `at` is the shared start time 15 s ahead. Teammates see a banner "🏁 NAME'S BAG RUN RACE · STARTS IN Ns", and **Y** or a tap joins.
  - Every racer builds the identical course from the plan + seed (`seeded()` in bagrun.js), lines up side by side and counts down to the same wall-clock start.
  - During the race each racer publishes `run: { id, s, b, d }`. The run HUD shows live standings (top 5), and the results card ranks everyone in that race, refreshing for 20 s while others finish.
  - Pickups are per player (it's a score race). XP and quests are as for a solo run.
- **Shared flashmobs:** a player who starts one (emote + **F**) publishes `mob: { e, t0 }`, the emote plus the epoch time of clip time 0.
  - Teammates within 30 m get **F · JOIN NAME'S FLASHMOB**. Joining dances the same emote on the leader's clock, and that player's own NPCs fall in behind them.
  - Remote dancers in a flashmob are clock-synced on every screen.
  - Moving leaves; the mob ends when the leader stops.
- **Test:** `node tools/mp2_test.mjs` (race host/join/same course/board/ranking, then flashmob join), using the same BroadcastChannel room mock.

## Shared leaderboard (Oct 23)
`src/leaderboard.js` runs on the artifact **`db`** capability with rules `{ path: "lb", read: "view", write: "owner" }, { path: "lb/{self}", write: "interact" }`: everyone admitted reads, and each viewer at Contributor or above writes only their own row.
- **Row:** one document per player, `lb/<user id>`: `n` (in-game name), `skin`, `lv`, `week`, `wBest`, `wAt`, `day`, `dBest`, `best`, `runs`, `wins`, `wWins`, `at`.
- **Boards:** live queries for this week (`week == current`, by `wBest`), today (`day == current`, by `dBest`) and race wins (`wins`, all time, with this week's count shown). A new week or day starts empty with no reset job; the page re-subscribes when the period rolls over.
- **Writes:** one per finished run (`submit({ score })`), plus a race win (`submit({ score: null, win: true })`) when you finish first of at least 2 racers. The win is settled when every racer is done, or after 20 s.
- **Names:** resolved from claude.ai profiles, falling back to the in-game name.
- **Where it shows:**
  - The **🏆 LEADERBOARD** card with tabs This week / Today / Race wins.
  - The Bag Run results card.
  - The portal menu, which shows the top 3 this week.
  - Bag Run kiosks, which show your rank.
  - The **L** key.
- **Access:** view-only viewers read but cannot post, and the card says so. Without the db capability the card says the board needs the claude.ai page.
- **Trust:** scores are self-reported by each page. That's fine for a team board, not for prizes.
- **Test:** `node tools/lb_test.mjs` (in-memory db/user mock, seeded rivals, stale-week filtering, a run and a race win).

## Hosting on Vercel (own website)
The same build runs inside claude.ai (the artifact) and as a normal website. `src/net.js` picks the online services:
- **claude.ai:** the artifact's `room`, `user` and `db` capabilities.
- **Own website:** Supabase, when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set at build time.
  - Multiplayer runs on a Realtime channel `bagverse-world`. Slow-changing state (name, skin, level, chat, race, run, flashmob) goes in **presence**. Movement goes as **broadcast** at 6 Hz.
  - The leaderboard is the `lb` table with row-level security: everyone reads, and each player upserts only their own row. Each browser gets an anonymous Supabase account.
- **Neither:** single-player, as before.

**Setup**
1. **Supabase** (free tier):
   - Create a project.
   - Run `supabase/schema.sql` in the SQL Editor.
   - Under Authentication → Sign In / Providers, turn on **Allow anonymous sign-ins**.
   - Copy the Project URL and the `anon` public key (Project Settings → API).
2. **Vercel:**
   - Import the GitHub repo (framework: Vite; `vercel.json` sets the build command to `npm run build` and the output to `dist`).
   - Add the env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production and Preview.
   - Deploy. Every push to `main` redeploys.
3. **Optional:** add your own domain in Vercel → Domains.

**Notes**
- Realtime usage counts against Supabase quotas. The free tier is enough for team testing; a public launch needs the Pro plan or a dedicated game server.
- Off claude.ai there are no account names, so players show by their in-game name.
- The anon key is public by design. Row-level security is what protects the data.
- **Test the Supabase path without a project:** `FAKE_SUPABASE=1 VITE_SUPABASE_URL=x VITE_SUPABASE_ANON_KEY=y npx vite build --outDir /tmp/dist-fake`, then `npx vite preview --outDir /tmp/dist-fake --port 4174` and `node tools/supa_test.mjs`. `tools/fake-supabase.js` stands in for the client: tabs are players, and the table keeps the same own-row rule.

## Solana wallet connect (Oct 24)
- **Button:** `◎ CONNECT WALLET` in the top-right column (desktop) or the ⚙ menu (touch). Once linked it shows the short address in Solana green; click it for address, copy, Solscan and DISCONNECT. The billboard rent card's CONNECT WALLET button opens the same modal.
- **Wallets:** any Wallet Standard wallet in the browser (Phantom, Solflare, Backpack, Glow, ...) via `@wallet-standard/app`. On Android Chrome, Mobile Wallet Adapter (`@solana-mobile/wallet-standard-mobile`, loaded only on Android) adds a wallet that opens the installed wallet app. On iPhone / phones with no wallet the modal offers "Open in Phantom / Solflare / Backpack", which opens BagVerse in the wallet's in-app browser.
- **Sign-in:** linking asks for a free signature, never a transaction. Wallets with `solana:signIn` get a Sign In With Solana request; others sign the same SIWS-format message with `solana:signMessage` (domain, address, statement naming the player, URI, nonce, issued-at).
- **Where it's kept:** `localStorage.bv_wallet` (`{address, wallet, message, signature, at}`; a reload re-attaches silently), and, once the server has verified it, in `public.wallets` and as `w` on the player's leaderboard row. Disconnecting clears all three.
- Code: `src/wallet.js` (`Wallet`: `list`, `connect`, `reconnect`, `disconnect`, `deepLinks`), UI in `main.js` (`openWallet`). Test: `tools/wallet_test.mjs` (fake Wallet Standard wallets with real Ed25519 keys; signatures are verified).

## Verified wallets + holder skins (Oct 24)
- **Server check:** after the wallet signs, the game posts the message to `POST /api/wallet/verify` (Vercel function, `api/wallet/verify.js`) with the player's Supabase token. The server checks: SIWS format, the address in the message, **domain = the site's host** (a signature made for another site is useless), **Request ID = the caller's account id** (a copied signature can't link the wallet to someone else), issued within 10 minutes, the Ed25519 signature, and a nonce not used before. Then it writes `public.wallets` with the service_role key. Players can read the table and delete their own row (unlink); only the server can write.
- **One player per wallet:** verifying the same wallet from another account (another device) moves it there.
- **Holder skins:** `src/nft-gates.js` lists gated skins: `{ skin, collection | creator | mint+min, label }`. The server reads the wallet's assets with the DAS `getAssetsByOwner` call (`SOLANA_RPC_URL`, e.g. Helius) and stores the unlocked skin ids in `wallets.skins`. `POST /api/wallet/holdings` refreshes it (cached 1 minute). In the game a gated skin shows the lock label and a CONNECT WALLET / HOLDERS ONLY button; wearing one without the NFT switches you to Golden King once the wallet check finishes. The list is empty until collections are chosen, so nothing is locked yet.
- **Status in the wallet window:** VERIFIED ✓ / VERIFYING… / NOT VERIFIED (with the reason and SIGN AGAIN) / SIGNED · NOT CHECKED HERE (claude.ai artifact or a host with no API).
- **Setup (once):** run the `wallets` part of `supabase/schema.sql`; in Vercel add `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API keys → service_role / secret; never a `VITE_` variable) and `SOLANA_RPC_URL` (a DAS-capable RPC URL with its key), then redeploy.
- **Tests:** `node tools/api_wallet_test.mjs` (server rules: replay, other player, other site, wrong key, expiry, wallet moving, holdings refresh). `tools/wallet_test.mjs` + `tools/wallet_server.mjs` run the whole flow in a browser against the real handlers (commands at the top of the test).

## GM Arch and Doge statue (Oct 24)
Two more user models swap out generated structures through the same code as the vaults (`src/landmarks.js`, `PROPS`; cut old triangles from visuals and collider, add the model's own triangles):
- **GM Arch** (`public/assets/gm_arch.glb`, `.m.glb` for LOW) replaces the "WELCOME TO BAGVERSE / GM" arch over the south avenue (z = 92). 24 m wide, 14.4 m tall, the GM! bubble faces the plaza; the road under it stays open and the Pepe / Doge plinths are solid.
- **Doge statue** (`public/assets/doge_statue.glb`, `.m.glb`) replaces the blue pillar and orb on the Doge & Bonk Park fountain at (-125, -125). 12 m tall on the old 1 m basin, facing the city.
- Source FBX in `blender/props/{gm_arch,doge_statue}/`, exported with `export_prop.py` at 2048 px (LOW copies at 1024). Check: `node tools/landmark_shot.mjs` (screenshots plus walk-through / collision checks). `tools/modelview.html` + `tools/modelshot.mjs` render a single GLB.

## Tile Drop (Oct 24)
The second mini-game (`src/minigames/tiledrop.js`), from the **TILE DROP** portal in the plaza (E). The Doge Park kiosk shows your Tile Drop best and wins.
- **Arena:** three floors of 127 hex tiles (lime, cyan, magenta) 215 / 204 / 193 m above the plaza (the tallest tower is ~168 m). A tile flashes red when stepped on and falls 0.5 s later. Fall through a floor and you land on the next; below the last floor you're out. Last one standing wins; 150 s cap.
- **Physics:** while playing, the player's physics is swapped for the arena's own (`TilePhysics`: gravity and landing on tiles that still hold), so normal movement, jumping and animations work unchanged; the world physics comes back at the end.
- **Solo:** you vs 5 bots (random skins and names). Bots pick nearby solid tiles with solid neighbours, avoid the edge, jump over holes, and get sloppier as the game goes on.
- **Match:** "Host a match" opens a 15 s invite (same banner as Bag Run races, Y / tap to join). Same seed and start for everyone, no bots. Each player's fallen tiles go out in their presence (`run.tl`, base-36 ids), so every screen drops the same tiles; `run.s` (survival x10), `run.d` (out) and `run.w` (won) drive the live standings. A match win with at least one rival counts on the leaderboard's wins tab.
- **Score / XP:** survival seconds x10, +300 for a win. XP 15 + up to 35 for time + 15 for a win, full value for the first 10 games a day. Personal best and wins in `progress.s.mg.tiledrop`.
- Tests: `tools/tiledrop_test.mjs` (solo), `tools/tiledrop_mp_test.mjs` (match on the fake Supabase build, port 4174).

## Vault raffles (Oct 24)
The Wano Vault (graded One Piece) and Kanto Vault (graded Pokémon) now run real, free raffles.
- **In game:** E at a vault door shows this week's prize (photo, set, grade, cert, mint, link), a live countdown to the draw, the entry count and one button: ENTER FREE, CONNECT WALLET TO ENTER, ENTERED ✓ or LOCKED · LV n. Below it, the last draw (winner name and short address, and the Solana block it was drawn from, linked on Solscan). Recent winners are announced in chat; the winner gets a "YOU WON" pop-up the next time they play (once).
- **Rules:** one free entry per player and per verified wallet (`wallets` table); entries close at `draws_at`; the level gate (`min_level`, Wano 25 / Kanto 100) is checked in the game only.
- **Tables** (`supabase/schema.sql`): `raffles` (id, vault, prize json, min_level, draws_at, status, entries, winner_*, proof) and `raffle_entries` (raffle_id, user_id, address, name). Players can read both; only the server writes. Add next week's raffle in Supabase's Table Editor (prize json: name, set, grader, grade, variant, cert, image, url, mint; a mint that matches `src/rwa.js` uses the bundled slab photo).
- **Entering:** `POST /api/raffle/enter` (`api/raffle/enter.js`).
- **Draw:** `/api/raffle/draw` (`api/raffle/draw.js`), run by the Vercel cron in `vercel.json` (Sundays 20:05 UTC) and also triggered by any game that sees a raffle past its draw time. Winner = entries sorted by (created_at, user_id), index `sha256(blockhash + ':' + raffle id) mod entries`, where blockhash is the first finalized Solana block at or after `draws_at` (found with `SOLANA_RPC_URL`). The result can't depend on who calls the draw or when, and anyone can recompute it from `proof`. Without an RPC URL the server falls back to a random seed and marks the proof `server-random`.
- **Tests:** `node tools/api_raffle_test.mjs` (entry rules, block search on a fake chain, recomputing the winner), `tools/raffle_test.mjs` (browser flow on `tools/wallet_server.mjs`).

## Collection screen and fades (Oct 24)
- **Collection (I / the 🎒 button)** replaces the old inventory pop-up. It reuses the skin screen's vault room in a second mode (`SkinScreen.setMode('collection')`): header COLLECTION, ITEM INFO on the left, SELECT SLAB grid on the right, BACK / MARKET / VIEW SLAB below.
- **Every item is a graded slab** (`src/slab.js`): a 3D acrylic case floating over the pedestal (drag to rotate, scroll / pinch or VIEW SLAB for a close-up) and a slab-shaped card in the grid.
  - Skins are graded **BVG** (BagVerse Grading, our own in-game scale, black and gold label): Legendary 10 Gem Mint, Epic 10 Pristine, Holiday 9.5 Mint+, Rare 9 Mint, Common 8.5 NM-MT+. Skins aren't real graded cards, so they don't carry PSA / CGC labels.
  - Real cards keep their real grader and use the photo of the actual slab: raffle prizes you won (owned), and this week's raffle prizes (locked, with "SEE THE PRIZE" / "HOW TO WIN IT").
  - Owned skins can be equipped from the Collection (EQUIP THIS SKIN).
  - Filters: ALL / OWNED / CARDS / FAVORITES. Stats under the info: slabs owned, level, playtime, raffle wins, Bag Run best, Tile Drop wins.
- **Fades** (`src/fx.js`): a veil above everything. `fx.through(fn)` fades out, runs fn, fades in; used for opening and closing the skin screen and the Collection and for starting Bag Run / Tile Drop. `fx.cut()` fades in after any teleport longer than 25 m (fast travel, go-to-teammate, leaving a mini-game). Modals and the big map fade and rise in. Fades are off in tests (`fixeddt`) and with `?nofade`.
- Test: `tools/collection_test.mjs`.
