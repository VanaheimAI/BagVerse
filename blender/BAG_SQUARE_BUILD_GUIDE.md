# The Bag Square: Blender build guide

The Bag Square is a stylised, isometric, cel-shaded cyberpunk district. This guide covers the build scripts, every asset in the spec, the cel shading and outline setup, and the export rules.

The district is built entirely by script, so you can rebuild it at any time:

```bash
python3 blender/gen_textures.py                          # textures -> blender/textures/*.png (numpy + Pillow)
blender -b -P blender/bag_square_hero.py -- --render     # look-dev .blend + preview renders (add --hq for 1600x900)
blender -b -P blender/build_world.py                     # full game world incl. the hero district -> public/assets/bag_square.glb
```

| Output | What it is |
|---|---|
| `blender/bag_square_hero.blend` | Look-dev file. One object per asset, in the spec collections, with the cel material set active, outlines and four cameras. |
| `blender/bag_square_hero.glb` | Standalone hero-district export with PBR materials. |
| `blender/renders/*.png` | Preview renders (Eevee, cel shading, outlines, bloom). |

Scene scale: 1 Blender unit = 1 m = 1 grid tile, and +Y is north. Street lanes are 4 m, sidewalks are 3 m, and curbs are 0.2 m.

## Collections and assets

**`01_HERO_BUILDINGS`**

| Asset | Size (m) | Centre (x, y) | Notes |
|---|---|---|---|
| `SM_BagSquare_CenterHub_01` | 24 × 24 × 6 | (0, 0) | Diamond plinth. Split-wing curved pavilion around a 6 m north–south avenue. Three stepped roof tiers with inset magenta and cyan strips. Recessed cyan floor tracks run to a gold centre emblem. Holo arches stand at both avenue ends. |
| `SM_Skyscraper_CentralTower_01` | 12 × 12 × 48 | (0, 53) | Chamfered shaft with curtain wall and steel fins. Glass lobby podium, crown and antenna. Mounting rails carry the five-screen stack. |
| `SM_Skyscraper_Spire_L_01` / `_R_01` | 10 × 10 × 44 | (±17, 53) | Art-deco setbacks at 24, 31, 35.5 and 38 m. Corner piers, vertical grooves and satellite dishes. Needle spire with a gradient-emissive magenta tip. |
| `SM_Skybridge_Magenta_01` | 6 × 4.4 × 3 | (9, 53), z 30 | Joins the central tower to the right spire. |
| `SM_AdCanyon_Complex_01` | 16 × 22 × 32 | (−50, 23) | Three interconnected blocks (32, 24 and 14 m) in burgundy brick. The south-east corner curves around the intersection. Window bands, ground-floor storefronts with a fake-interior glow, awnings and rooftop HVAC units. |
| `SM_AdCanyon_Scaffold_01` | — | (−51, 11) | Scaffolding on block A's south face. |
| `SM_RWAVault_Main_01` | 18 × 20 × 16 | (51, 22) | Neoclassical marble building on a stepped plinth with a magenta underglow. Four fluted Doric columns with 20 flutes, each with base, echinus and abacus. Recessed grand entrance and stepped cornice. The hall is hollow, with a gold-lit interior and three prize pedestals. |
| `SM_LMK_SouthCrystal_01` | 8 × 8 × 7 | (0, −31) | Tiered hexagonal planter holding nine faceted crystals, each with a translucent shell and an emissive core. |
| `SM_Bldg_Filler_*` | — | corner lots | Six corner-lot blocks carrying most of the rentable ad screens. |

**`02_SIGNAGE_AND_ADS`.** Each sign's origin sits at its backplate centre in the .blend.

| Asset | What it is |
|---|---|
| `SM_Sign_AdCanyon_Banner_01` | Curved cyan lightbox wrapping the corner, reading "THE AD CANYON" |
| `SM_Sign_Billboard_Tall_A` | Double-sided blade reading "THE ADR", with an original cartoon portrait |
| `SM_Sign_Billboard_Tall_B` | Red-orange corner wrap with a yellow emblem |
| `SM_Sign_Billboard_Tall_C` | Gold holographic ticker |
| `SM_Sign_CentralTower_Stack_01` | TPL header, crest screen, circular $BAG token screen and an angled side panel |
| `SM_Sign_RWAVault_Letters_01` | Beveled gold serif lettering on the frieze |
| `SM_Sign_RWAVault_BTCCoin_01` | 8 m gold coin with an extruded ₿ in the roof basin |
| `BB_01`–`BB_20`, `TICKER_1`–`6`, `PORTAL_FX_*` | Live game screens. The game swaps in ad creatives and scrolling prices, and animates the portals. |

**`03_PLAZA_AND_ROADS`**

| Asset | What it is |
|---|---|
| `SM_Plaza_CenterBase_01` | 40 × 40 m. Hex slate pavers with cyan and magenta circuit tracks. |
| `SM_Sidewalk_NeonEdge_Straight_01` / `_Corner_01` | 0.2 m curb with an inset magenta LED tube |
| `SM_Road_Straight_4m` | Dashed lane markings |
| `SM_Road_Crosswalk_4Way_01` (×4) | Zebra crossings at each intersection |

The ring road is four lanes wide (16 m) and runs around the plaza between r = 23 and r = 39 m.

**`04_PROPS_AND_FOLIAGE`**

| Asset | What it is |
|---|---|
| `SM_Prop_StreetLight_01` | Street lights with cyan or magenta heads |
| `SM_Prop_TrafficLight_01` | Traffic lights |
| `SM_Prop_Bollard_Neon_01` | Neon bollards |
| `SM_Prop_Barrier_Hazard_01` | Hazard barriers |
| `SM_Prop_Kiosk_Terminal_01` | Kiosks with cyan screens and a ticker marquee |
| Arcade portals | One at each of the four plaza corners |
| Gantries | Over the S, E and W avenues |
| LED totems | On the plaza corners |
| `SM_Veg_StylizedTree_Round_01`, shrubs | Round stylised trees and shrubs |
| `SM_Veh_Car_Sedan_01`, `SM_Veh_Van_01`, bus | Vehicles in red, yellow, cyan, purple and white |
| `SM_Char_Pedestrian_Proxy_01` | Pedestrian proxies. These appear in the .blend only. |

**`05_GAMEPLAY`.** `SPAWN`, the `ZONE_*` and `HOLO_*` empties, and `COLLIDER`, which is a wireframe that never renders.

## Materials and palette

The base materials use the spec palette:

| Material | Colour |
|---|---|
| Slate concrete | `#3A3852` |
| Asphalt | `#1E1D2B` |
| Marble | `#D6D4E0` |
| Brushed gold | `#E6B800` |

The emissives are cyan `#00F0FF`, magenta `#FF007F`, purple `#B829FF` and Bitcoin gold `#FFB800`.

`gen_textures.py` generates the tileable maps: albedo, plus normal, emissive or ORM where needed. It covers concrete panels, asphalt, marble, marble ashlar, brick, the curtain wall, art-deco stone, hex pavers, brushed gold, the dark hull, storefront interiors, sidewalk, hazard stripes, the spire gradient and all the sign art.

Textures are mapped two ways. Facades and floors use world-space box projection, so windows and pavers stay to scale on any size of building. Signs and screens use 0–1 UVs.

## Cel-shading recipe (Eevee, Blender 4.2 – 5.x)

`setup_cel()` builds this inside every opaque material. To rebuild it by hand:

1. Add a **Diffuse BSDF**. Plug the albedo texture (or the base colour) into its Color input.
2. Feed it into **Shader to RGB**, then into a **ColorRamp** set to **Constant** interpolation, with three stops:

   | Position | Colour |
   |---|---|
   | 0.00 | `#525070` (shadow) |
   | 0.18 | `#B3ADC7` (mid) |
   | 0.55 | white (lit) |

3. Combine the ramp with the albedo using **Mix (Color)** set to **Multiply**.
4. Multiply the emissive texture (or emission colour) by the emission strength. Add the result to step 3 with **Mix (Color)** set to **Add**.
5. Feed the sum into an **Emission** node at strength 1, then into a new **Material Output** set as active (name it `CEL_OUTPUT`).
6. Keep the Principled BSDF and its output (`PBR_OUTPUT`) in the material. This is what the glTF exporter reads.

Leave glass, crystal, portal and ticker materials as Principled with alpha blending.

**Lighting and world.**

| Setting | Value |
|---|---|
| Sun ("Moon") | Energy 2.2, colour `#BFB8FF`, rotation 52° / 0° / 35° |
| Plaza fill | Large magenta area light |
| World | `#0D0820` at strength 0.9 |
| Colour management | AgX, look "Punchy" |

**Bloom.** Add a compositor **Glare** node set to Bloom (High quality, threshold 0.9, strength 0.7, size 0.65). In Blender 5.x the compositor is a node group, so `lookdev_scene()` creates one for you.

## Outlines

There are two methods, and you can use either or both.

**Inverted hull.** Every hero mesh carries a **Solidify** modifier named `Outline`. Thickness is −0.02 to −0.08 m, scaled to the object's size. Flip Normals is on, rim fill is off, and Material Offset points to `H_outline`: a near-black (`#05030A`) Emission material with backface culling. The modifier shows in the viewport and in renders.

**Freestyle.** The line set "BagSquareLines" is turned on. It selects silhouette, border and crease edges by visibility, with absolute thickness 1.4 px and ink colour `#080510`.

For Grease Pencil **Line Art** instead, add a *Scene Line Art* object and set thickness to 1.5–3 px by asset hierarchy:

| Asset type | Thickness |
|---|---|
| Hero buildings | 3 px |
| Props | 2 px |
| Floor decals | 1.5 px |

Set its material to the same ink colour.

## Exporting to the game

1. In the .blend, open the Text Editor and run `toggle_cel.py` with `MODE = "PBR"`. This switches the active outputs back to Principled, mutes the cel emission and hides the outline modifiers.
2. Export glTF Binary with **+Y Up** and **Custom Properties** on, and **Apply Modifiers** off.
3. Alternatively, run `build_world.py`. It builds the hero district in game mode, which merges geometry per material and adds colliders, then exports the whole world.

Keep the object-name contract: `BB_##`, `TICKER_#`, `PORTAL_FX_<ID>`, `HOLO_#`, `ZONE_<id>`, `SPAWN`, `COLLIDER`. The game reads custom properties from these names.
