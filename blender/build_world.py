"""
BagVerse - The Bag Square world builder (Blender 4.2+ / 5.x)

Procedurally builds the hub-and-spoke city from the BagVerse map and exports
../public/assets/bag_square.glb for the browser game.

  blender -b -P blender/build_world.py          (headless)
  or open Blender > Scripting > Run Script      (to inspect / hand-edit the .blend)

Naming contract with the game (src/world.js):
  BB_01..BB_20        billboard screens (UV 0..1, custom prop "aspect")      -> live ad textures
  TICKER_1..6         trading-floor ticker screens                          -> scrolling prices
  PORTAL_FX_<ID>      portal discs (custom props id/label)                  -> animated shader + interaction
  HOLO_1..3           empties above vault pedestals                         -> rotating RWA holograms
  VAULT_COIN, ROCKET  animated props
  SMOKE_*             smoke emitter empties
  ZONE_<id>           empties with props label/radius                       -> HUD location + minimap
  SPAWN               player spawn empty
  COLLIDER            single merged collision mesh (hidden in game)
Everything else is merged per material to keep draw calls low.
"""
import bpy, bmesh, math, os, random
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() else os.getcwd()
OUT = os.path.join(HERE, "..", "public", "assets", os.environ.get("WORLD_OUT", "bag_square.glb"))
BLEND_OUT = os.path.join(HERE, "bag_square.blend")
random.seed(7)
np.random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
FONT = bpy.data.fonts.load("<builtin>")

# ----------------------------------------------------------------------------- palette
CYAN, MAGENTA, PURPLE, LIME, GOLD, RED, ORANGE, WHITE = (
    (0.13, 0.91, 1.0), (1.0, 0.17, 0.84), (0.55, 0.24, 1.0), (0.49, 1.0, 0.24),
    (1.0, 0.78, 0.24), (1.0, 0.12, 0.15), (1.0, 0.45, 0.08), (1, 1, 1))


def srgb2lin(c):
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


# ----------------------------------------------------------------------------- textures
def make_image(name, arr):
    h, w, _ = arr.shape
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.flipud(arr).astype(np.float32).ravel())
    img.pack()
    return img


def facade_tex(name, tint, lit=0.38, cols=8, rows=8, size=512):
    """window grid; one texture repeat == 8x8 windows (24m x 24m)."""
    a = np.zeros((size, size, 4), np.float32)
    base = np.array(srgb2lin(tint)) * 0.06
    a[..., :3] = base; a[..., 3] = 1
    cw, ch = size // cols, size // rows
    palette = [srgb2lin(c) for c in [(1, .85, .55), (.55, .9, 1), (1, .5, .9), (.75, .6, 1), (1, 1, 1)]]
    for i in range(cols):
        for j in range(rows):
            x0, y0 = i * cw + cw // 6, j * ch + ch // 5
            x1, y1 = (i + 1) * cw - cw // 6, (j + 1) * ch - ch // 6
            if random.random() < lit:
                c = np.array(random.choice(palette)) * random.uniform(0.5, 1.0)
            else:
                c = base * 2.2 + 0.015
            a[y0:y1, x0:x1, :3] = c
            # mullion
            a[y0:y1, (x0 + x1) // 2:(x0 + x1) // 2 + 2, :3] = base
    # floor slab lines
    for j in range(rows):
        a[j * ch:j * ch + 3, :, :3] = base * 0.4
    return make_image(name, a)


def tile_tex(name, base, line, size=512, cells=8, line_w=3):
    a = np.zeros((size, size, 4), np.float32)
    a[..., :3] = srgb2lin(base); a[..., 3] = 1
    a[..., :3] *= (1 + 0.15 * (np.random.rand(size, size, 1) - 0.5))
    step = size // cells
    for k in range(cells):
        a[k * step:k * step + line_w, :, :3] = srgb2lin(line)
        a[:, k * step:k * step + line_w, :3] = srgb2lin(line)
    return make_image(name, a)


def blur(a, r):
    for _ in range(3):   # 3x box blur ~ gaussian, wraps so the texture tiles
        a = sum(np.roll(a, k, axis=0) for k in range(-r, r + 1)) / (2 * r + 1)
        a = sum(np.roll(a, k, axis=1) for k in range(-r, r + 1)) / (2 * r + 1)
    return a


def noise_tex(name, c0, c1, size=256, blotch=6):
    up = blur(np.random.rand(size, size), blotch)
    up = (up - up.min()) / (up.max() - up.min() + 1e-6)
    up = 0.8 * up + 0.2 * np.random.rand(size, size)
    a = np.zeros((size, size, 4), np.float32)
    for k in range(3):
        a[..., k] = srgb2lin(c0)[k] * (1 - up) + srgb2lin(c1)[k] * up
    a[..., 3] = 1
    return make_image(name, a)


# ----------------------------------------------------------------------------- materials
MATS = {}


TEXDIR = os.path.join(HERE, "textures")


def png(name, noncolor=False):
    img = bpy.data.images.load(os.path.join(TEXDIR, name + ".png"), check_existing=True)
    if noncolor:
        img.colorspace_settings.name = "Non-Color"
    return img


def mat(name, color=(0.5, 0.5, 0.5), metal=0.0, rough=0.6, emit=None, strength=0.0,
        alpha=1.0, tex=None, emit_tex=False, double=False, maps=None):
    """maps: base name of a PNG set in blender/textures (<maps>_albedo/_normal/_orm/_emissive, any subset)."""
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*srgb2lin(color), 1)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    if maps:
        def has(sfx):
            return os.path.exists(os.path.join(TEXDIR, f"{maps}_{sfx}.png"))
        if has("albedo"):
            t = nt.nodes.new("ShaderNodeTexImage"); t.image = png(maps + "_albedo")
            nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
        if has("normal"):
            t = nt.nodes.new("ShaderNodeTexImage"); t.image = png(maps + "_normal", True)
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(t.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])
        if has("orm"):
            t = nt.nodes.new("ShaderNodeTexImage"); t.image = png(maps + "_orm", True)
            sp = nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(t.outputs["Color"], sp.inputs["Color"])
            nt.links.new(sp.outputs["Green"], p.inputs["Roughness"]); nt.links.new(sp.outputs["Blue"], p.inputs["Metallic"])
        if has("emissive"):
            t = nt.nodes.new("ShaderNodeTexImage"); t.image = png(maps + "_emissive")
            nt.links.new(t.outputs["Color"], p.inputs["Emission Color"])
            p.inputs["Emission Strength"].default_value = strength or 1.0
    if tex is not None:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = tex
        nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
        if emit_tex:
            nt.links.new(t.outputs["Color"], p.inputs["Emission Color"])
            p.inputs["Emission Strength"].default_value = strength or 1.0
    if emit is not None:
        p.inputs["Emission Color"].default_value = (*srgb2lin(emit), 1)
        p.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        p.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            m.blend_method = "BLEND"
    m.use_backface_culling = not double
    MATS[name] = m
    return m


TEX = {}


def build_materials():
    TEX["plaza"] = tile_tex("plaza", (0.10, 0.07, 0.17), (0.20, 0.13, 0.33), cells=8)
    TEX["asphalt"] = noise_tex("asphalt", (0.06, 0.055, 0.09), (0.11, 0.10, 0.15))
    TEX["sidewalk"] = tile_tex("sidewalk", (0.17, 0.15, 0.22), (0.10, 0.09, 0.14), cells=4)
    TEX["grass"] = noise_tex("grass", (0.10, 0.30, 0.08), (0.20, 0.48, 0.12), blotch=8)
    TEX["dirt"] = noise_tex("dirt", (0.30, 0.23, 0.16), (0.48, 0.38, 0.26), blotch=10)
    TEX["goldpave"] = tile_tex("goldpave", (0.55, 0.40, 0.12), (0.85, 0.65, 0.25), cells=4)
    TEX["swamp"] = noise_tex("swamp", (0.05, 0.25, 0.08), (0.25, 0.75, 0.18), blotch=12)
    for k in ("fac_stone", "fac_brick", "fac_stucco", "fac_sand", "fac_granite", "fac_glass"):
        mat(k, maps=k, strength=1.2)
    mat("shopfront", maps="shopfront", strength=0.5)
    mat("trim_stone", (0.90, 0.91, 0.93), rough=0.8)                     # kit style: white trims
    mat("trim_dark", (0.60, 0.64, 0.70), metal=0.2, rough=0.5)
    mat("roof_metal", (0.66, 0.69, 0.73), metal=0.4, rough=0.45)
    mat("water_tank", (0.45, 0.32, 0.22), rough=0.85, maps="bark")
    mat("pole_paint", (0.55, 0.58, 0.62), metal=0.5, rough=0.4)
    mat("banner_magenta", (0.85, 0.12, 0.55), rough=0.7)
    mat("banner_cyan", (0.05, 0.62, 0.78), rough=0.7)
    mat("plaza", tex=TEX["plaza"], rough=0.35, metal=0.2)
    mat("asphalt", maps="asphalt", rough=0.8)                     # hand-painted (textures_src/road)
    mat("sidewalk", maps="sidewalk", rough=0.75)                 # kit paving tiles
    mat("grass", maps="ground", rough=0.9)                        # hand-painted (textures_src/ground)
    mat("dirt", tex=TEX["dirt"], rough=1.0)
    mat("goldpave", tex=TEX["goldpave"], rough=0.35, metal=0.6)
    mat("swamp", tex=TEX["swamp"], emit_tex=True, strength=0.6, rough=0.2)
    mat("roof", (0.62, 0.64, 0.68), rough=0.85)
    mat("concrete", maps="concrete", rough=0.85)                  # clean light grey (kit style)
    mat("darkmetal", (0.42, 0.45, 0.50), metal=0.4, rough=0.45)
    mat("chrome", (0.8, 0.8, 0.9), metal=1.0, rough=0.15)
    mat("gold", maps="gold", metal=1.0, rough=0.3)                 # hand-painted orange metal
    mat("goldglow", (1.0, 0.76, 0.3), metal=1.0, rough=0.25, emit=GOLD, strength=1.4)
    mat("glass", (0.6, 0.85, 1.0), metal=0.0, rough=0.05, alpha=0.18, double=True)
    mat("screen_off", (0.02, 0.02, 0.03), rough=0.3)
    for n, c in (("cyan", CYAN), ("magenta", MAGENTA), ("purple", PURPLE), ("lime", LIME),
                 ("goldneon", GOLD), ("red", RED), ("orange", ORANGE), ("white", WHITE)):
        mat("neon_" + n, c, emit=c, strength=2.6)
    mat("lamp", (1, 0.9, 0.7), emit=(1, 0.85, 0.6), strength=3.5)
    mat("wood", (0.36, 0.22, 0.12), rough=0.9)
    mat("lane_paint", (0.93, 0.93, 0.93), rough=0.6)                    # kit style: plain white paint
    mat("curb", (0.80, 0.81, 0.83), rough=0.8)
    mat("bark", (0.25, 0.16, 0.09), rough=1.0, maps="bark")
    mat("leaf", (0.13, 0.42, 0.10), rough=0.8, maps="leaf")
    mat("leaf_dark", (0.07, 0.26, 0.08), rough=0.8)
    mat("leaf_pine", (0.08, 0.30, 0.16), rough=0.8)
    mat("lily", (0.2, 0.6, 0.15), rough=0.6, emit=(0.2, 0.8, 0.1), strength=0.4)
    mat("tent_blue", (0.15, 0.3, 0.7), rough=0.9)
    mat("tent_red", (0.6, 0.12, 0.1), rough=0.9)
    mat("crate", (0.45, 0.32, 0.18), rough=0.9)
    mat("rubble", (0.35, 0.33, 0.32), rough=1.0)
    mat("rust", (0.45, 0.22, 0.12), metal=0.5, rough=0.8)
    mat("white_paint", (0.85, 0.85, 0.88), rough=0.6)
    mat("red_paint", (0.75, 0.08, 0.08), rough=0.5)
    mat("fence", (0.4, 0.25, 0.12), rough=0.9)
    for i, c in enumerate([(0.9, 0.55, 0.4), (0.55, 0.75, 0.9), (0.95, 0.85, 0.5), (0.7, 0.9, 0.6), (0.85, 0.6, 0.9)]):
        mat(f"house_{i}", c, rough=0.8)
    for i, c in enumerate([(0.75, 0.15, 0.12), (0.15, 0.25, 0.55), (0.2, 0.45, 0.2), (0.35, 0.2, 0.15)]):
        mat(f"houseroof_{i}", c, rough=0.7)
    mat("window_lit", (1, 0.85, 0.5), emit=(1, 0.8, 0.45), strength=3.0)
    mat("pedestal", (0.9, 0.9, 0.95), rough=0.2, emit=(0.6, 0.9, 1.0), strength=0.8)
    mat("water_red", (0.4, 0.02, 0.05), emit=(1.0, 0.05, 0.1), strength=1.2, rough=0.1)


WORLD_UV = {  # metres per texture tile; small = fine detail (ground x0.38, facades x0.76 vs. the first pass)
    "fac_stone": 10.64,
    "fac_brick": 10.64,
    "fac_stucco": (13.3, 10.64),
    "fac_sand": 10.64,
    "fac_granite": 10.64,
    "fac_glass": (11.4, 10.64),
    "shopfront": (10.64, 4.2),
    "leaf": 1.14,
    "bark": 0.57,
    "water_tank": 0.76,
    "plaza": 6.08,
    "asphalt": 3.04,
    "sidewalk": 2.85,
    "grass": 2.66,
    "concrete": 1.52,
    "darkmetal": 1.33,
    "roof_metal": 1.33,
    "gold": 0.95,
    "dirt": 6.08,
    "goldpave": 3.8,
    "swamp": 11.4,
    "water_red": 3.8}
SMOOTH = {"leaf", "leaf_dark", "leaf_pine", "bark", "water_tank", "pole_paint", "lily"}

# ----------------------------------------------------------------------------- geometry accumulators
class Acc:
    def __init__(self):
        self.v, self.f = [], []

    def add(self, verts, faces, M=None):
        o = len(self.v)
        if M is not None:
            verts = [M @ Vector(p) for p in verts]
        self.v.extend(tuple(p) for p in verts)
        self.f.extend(tuple(i + o for i in fc) for fc in faces)


BUCKETS = {}     # material -> Acc (merged)
KEEP = []        # (name, material, Acc, props)
COLS = []        # collider boxes (verts, faces) in world space
EMPTIES = []     # (name, location, props)


def acc(m):
    return BUCKETS.setdefault(m, Acc())


def TRS(loc=(0, 0, 0), rz=0.0, scale=(1, 1, 1), rx=0.0, ry=0.0):
    return (Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(ry, 4, "Y")
            @ Matrix.Rotation(rx, 4, "X") @ Matrix.Diagonal((*scale, 1)))


BOX_V = [(-.5, -.5, 0), (.5, -.5, 0), (.5, .5, 0), (-.5, .5, 0), (-.5, -.5, 1), (.5, -.5, 1), (.5, .5, 1), (-.5, .5, 1)]
BOX_SIDES = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
BOX_TOP, BOX_BOT = [(4, 5, 6, 7)], [(3, 2, 1, 0)]


def box(m, loc, size, rz=0.0, collide=False, top=None, bottom=False, target=None, rx=0.0, ry=0.0):
    """box with its base at loc.z. top: optional material for the top face."""
    M = TRS(loc, rz, size, rx, ry)
    a = target if target is not None else acc(m)
    faces = BOX_SIDES + ([] if top else BOX_TOP) + (BOX_BOT if bottom else [])
    a.add(BOX_V, faces, M)
    if top:
        acc(top).add(BOX_V, BOX_TOP, M)
    if collide:
        COLS.append(([M @ Vector(p) for p in BOX_V], BOX_SIDES + BOX_TOP + BOX_BOT))


def col_box(loc, size, rz=0.0):
    M = TRS(loc, rz, size)
    COLS.append(([M @ Vector(p) for p in BOX_V], BOX_SIDES + BOX_TOP + BOX_BOT))


def cyl(m, loc, r, h, seg=16, r2=None, rz=0.0, rx=0.0, ry=0.0, collide=False, cap=True, target=None):
    r2 = r if r2 is None else r2
    vs, fs = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        vs.append((r * math.cos(a), r * math.sin(a), 0))
        vs.append((r2 * math.cos(a), r2 * math.sin(a), h))
    for i in range(seg):
        j = (i + 1) % seg
        fs.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
    if cap:
        fs.append(tuple(2 * i for i in reversed(range(seg))))
        if r2 > 0:
            fs.append(tuple(2 * i + 1 for i in range(seg)))
    M = TRS(loc, rz, (1, 1, 1), rx, ry)
    (target or acc(m)).add(vs, fs, M)
    if collide:
        rr = max(r, r2)
        col_box(loc, (rr * 1.6, rr * 1.6, h), rz)


def sphere(m, loc, r, seg=10, rings=7, scale=(1, 1, 1), target=None):
    vs, fs = [(0, 0, -r)], []
    for k in range(1, rings):
        ph = -math.pi / 2 + math.pi * k / rings
        for i in range(seg):
            a = 2 * math.pi * i / seg
            vs.append((r * math.cos(ph) * math.cos(a), r * math.cos(ph) * math.sin(a), r * math.sin(ph)))
    vs.append((0, 0, r))
    top = len(vs) - 1
    for i in range(seg):
        fs.append((0, 1 + (i + 1) % seg, 1 + i))
    for k in range(rings - 2):
        for i in range(seg):
            a = 1 + k * seg + i; b = 1 + k * seg + (i + 1) % seg
            fs.append((a, b, b + seg, a + seg))
    base = 1 + (rings - 2) * seg
    for i in range(seg):
        fs.append((base + i, base + (i + 1) % seg, top))
    (target or acc(m)).add(vs, fs, TRS(loc, 0, scale))


def torus(m, loc, R, r, seg=40, tseg=8, rz=0.0, rx=math.pi / 2, target=None):
    vs, fs = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for j in range(tseg):
            b = 2 * math.pi * j / tseg
            vs.append(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
    for i in range(seg):
        for j in range(tseg):
            a = i * tseg + j; b = ((i + 1) % seg) * tseg + j
            c = ((i + 1) % seg) * tseg + (j + 1) % tseg; d = i * tseg + (j + 1) % tseg
            fs.append((a, b, c, d))
    (target or acc(m)).add(vs, fs, TRS(loc, rz, (1, 1, 1), rx))


def disc(m, loc, r, seg=32, rz=0.0, rx=0.0, target=None, z_up=True):
    vs = [(0, 0, 0)] + [(r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), 0) for i in range(seg)]
    fs = [(0, 1 + i, 1 + (i + 1) % seg) for i in range(seg)]
    (target or acc(m)).add(vs, fs, TRS(loc, rz, (1, 1, 1), rx))


def ring(m, loc, r_in, r_out, h, seg=48, a0=0.0, a1=2 * math.pi, target=None):
    """annular prism (arena tiers, plaza rings)."""
    vs, fs = [], []
    n = seg + 1
    for i in range(n):
        a = a0 + (a1 - a0) * i / seg
        c, s = math.cos(a), math.sin(a)
        vs += [(r_in * c, r_in * s, 0), (r_out * c, r_out * s, 0), (r_out * c, r_out * s, h), (r_in * c, r_in * s, h)]
    for i in range(seg):
        a, b = 4 * i, 4 * (i + 1)
        fs += [(a + 1, b + 1, b + 2, a + 2), (a + 2, b + 2, b + 3, a + 3), (a + 3, b + 3, b, a)]
    (target or acc(m)).add(vs, fs, TRS(loc))


def quad(m, center, w, h, rz, target=None):
    """vertical plane facing +Y rotated by rz (normal = (-sin rz, cos rz)). UV 0..1 left->right as seen from front."""
    vs = [(w / 2, 0, -h / 2), (-w / 2, 0, -h / 2), (-w / 2, 0, h / 2), (w / 2, 0, h / 2)]
    (target or acc(m)).add(vs, [(0, 1, 2, 3)], TRS(center, rz))


def text(m, s, loc, size=2.0, rz=0.0, flat=False, extrude=0.06, target=None, align="CENTER"):
    cu = bpy.data.curves.new("txt", "FONT")
    cu.body = s; cu.font = FONT; cu.size = size; cu.extrude = extrude
    cu.align_x = align; cu.align_y = "CENTER"
    o = bpy.data.objects.new("txt", cu)
    scene.collection.objects.link(o)
    dg = bpy.context.evaluated_depsgraph_get()
    me = o.evaluated_get(dg).to_mesh()
    vs = [tuple(v.co) for v in me.vertices]
    fs = [tuple(p.vertices) for p in me.polygons]
    o.evaluated_get(dg).to_mesh_clear()
    bpy.data.objects.remove(o); bpy.data.curves.remove(cu)
    # upright text faces +Y at rz=0 (same convention as quad()/facing())
    M = TRS(loc, rz) if flat else TRS(loc, rz + math.pi, (1, 1, 1), math.pi / 2)
    (target or acc(m)).add(vs, fs, M)


def empty(name, loc, **props):
    EMPTIES.append((name, loc, props))


def keep(name, m, props=None):
    a = Acc()
    KEEP.append((name, m, a, props or {}))
    return a


def facing(x, y):
    """rz so a +Y-facing quad at (x,y) faces the world origin."""
    return math.atan2(-x, y) + math.pi


# ----------------------------------------------------------------------------- building blocks
FACADES = ["fac_stone", "fac_glass", "fac_stucco", "fac_granite"]


import sys as _sys
_sys.path.insert(0, HERE)
import detail_geo as DG
import kitlib as KL
KIT_SHARE = 0.75   # fraction of fitting lots that get a kit building


def add_parts(parts):
    for m, vs, fs in parts:
        acc(m).add(vs, fs)


def building(x, y, w, d, h, rz=0.0, fac=None, trims=True, antenna=True, neon=None, kit=True):
    """A city building on a w x d lot. Most lots get a Cartoon City kit model (instanced in the game, see
    kitlib.py); the rest - and anything too tall or oddly shaped for the kit - get a generated building with
    kit-style facades (white frames, blue glass)."""
    fac = fac or random.choice(FACADES)
    if os.environ.get("BLOG"): open(os.environ["BLOG"], "a").write(f"{x:.1f},{y:.1f},{w:.1f},{d:.1f},{h:.1f},{rz:.3f},{fac}\n")
    accent = neon or (random.choice(["neon_cyan", "neon_magenta", "neon_purple"]) if trims and random.random() < 0.25 else None)
    rng_parts = random.Random(random.random())        # same global-random use as before, so the layout doesn't shift
    # string seed (sha512-based) is stable across runs; hash() of a tuple with a str is randomised per process
    local = random.Random(f"{round(x, 1)},{round(y, 1)},kit")
    fit = KL.fit_building(w, d, h, rz, local) if kit and local.random() < KIT_SHARE else None
    if fit:
        name, krz, sx, sy, sz, size = fit
        KL.marker(empty, name, x, y, 0.0, krz, sx, sy, sz)
        col_box((x, y, 0), (size[0] * 0.92, size[1] * 0.92, size[2]), krz)
        return
    parts, cols = DG.building_parts(x, y, w, d, h, rz, fac, rng=rng_parts, neon=accent)
    add_parts(parts)
    for loc, size, r in cols:
        col_box(loc, size, r)


_lamp_n = [0]


def street_lamp(x, y, rz=0.0):
    """Cartoon City street lamp (kit Spotlight_01), arm reaching along local +Y rotated by rz"""
    _lamp_n[0] += 1
    KL.pole(empty, "Spotlight_01", x, y, rz, z=0.2)
    col_box((x, y, 0), (0.5, 0.5, 8.3))


_tree_n = [0]


def tree(x, y, s=1.0, leaf="leaf", kind="auto"):
    """placement marker for the instanced tree model (public/assets/tree.glb, made by process_tree.py).
    The game draws every TREE_* marker as one GPU instance (full mesh up close, impostor far away)."""
    # consume the same random numbers the old procedural trees did, so the rest of the layout is unchanged
    if kind == "pine" or (kind == "auto" and random.random() < 0.3):
        pass
    else:
        random.random()
    _tree_n[0] += 1
    rz = random.Random(hash((round(x, 2), round(y, 2)))).uniform(0, 2 * math.pi)
    empty(f"TREE_{_tree_n[0]:03d}", (x, y, 0), s=round(s, 3), rz=round(rz, 3))
    col_box((x, y, 0), (0.5 * s, 0.5 * s, 3.0 * s))


def neon_sign(label, x, y, z, rz, size=3.0, color="neon_cyan", backing=True):
    if backing:
        w = len(label) * size * 0.62 + size
        R = Matrix.Rotation(rz, 3, "Z")
        back = R @ Vector((0, -0.35, 0))
        box("darkmetal", (x + back.x, y + back.y, z - size * 0.75), (w, 0.4, size * 1.5), rz)
    R = Matrix.Rotation(rz, 3, "Z")
    off = R @ Vector((0, 0.05, 0))
    text(color, label, (x + off.x, y + off.y, z), size=size, rz=rz)


# ----------------------------------------------------------------------------- ground + roads
TRENCH = ((75.0, 62.0), (196.0, 62.0))   # FOMO Valley line (Blender XY)


def trench_depth(x, y):
    (ax, ay), (bx, by) = TRENCH
    t = max(0.0, min(1.0, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
    px, py = ax + t * (bx - ax), ay + t * (by - ay)
    d = math.hypot(x - px, y - py)
    if x < ax - 14:
        return 0.0
    if d < 6:
        return -6.0
    if d < 16:
        return -6.0 * (1 - (d - 6) / 10) ** 1.4
    return 0.0


def build_ground():
    # base ground grid (also the walkable collider) with the FOMO Valley carved in
    N, S = 120, 480.0
    a = acc("asphalt")
    col = Acc()
    o = len(a.v)
    vs = []
    for j in range(N + 1):
        for i in range(N + 1):
            x = -S / 2 + S * i / N; y = -S / 2 + S * j / N
            vs.append((x, y, trench_depth(x, y)))
    fs = []
    for j in range(N):
        for i in range(N):
            k = j * (N + 1) + i
            fs.append((k, k + 1, k + N + 2, k + N + 1))
    a.add(vs, fs)
    COLS.append(([Vector(v) for v in vs], fs))

    # FOMO valley floor glow + bridge
    (ax, ay), (bx, by) = TRENCH
    box("water_red", ((ax + bx) / 2, ay, -6.0), (bx - ax, 9, 0.3))
    for bxp in (118.0, 165.0):
        box("darkmetal", (bxp, ay, -0.6), (8, 34, 0.6), collide=True)
        for sx in (-1, 1):
            box("neon_red", (bxp + sx * 3.9, ay, 0), (0.2, 34, 1.0))
            box("darkmetal", (bxp + sx * 4.1, ay, 0), (0.3, 34, 1.1), collide=True)
        for sy in (-1, 1):
            cyl("concrete", (bxp, ay + sy * 9, -6), 1.2, 5.4, seg=8)
    neon_sign("FOMO VALLEY", 98, 78, 5.5, rz=math.pi, size=3.2, color="neon_red")

    # The plaza, ring road and hero buildings come from bag_square_hero.py (out to r = 42 m).
    # Avenues continue outward: 4 lanes x 4 m (|c| < 8), 3 m sidewalks with 0.2 m curb + magenta LED edge.
    for ang in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        R = Matrix.Rotation(ang, 3, "Z")
        horiz = ang in (0, math.pi)
        for k in range(14):
            for lane in (-4.0, 0.0, 4.0):
                c = R @ Vector((44 + k * 11 + 1.5, lane, 0))
                box("lane_paint", (c.x, c.y, 0.012), (3.0 if horiz else 0.16, 0.16 if horiz else 3.0, 0.01))
        for side in (-1, 1):
            c = R @ Vector((42 + 79, side * 9.5, 0))
            box("sidewalk", (c.x, c.y, 0.0), (158, 3, 0.2) if horiz else (3, 158, 0.2), top=None)
            c2 = R @ Vector((42 + 79, side * 8.1, 0))
            box("curb", (c2.x, c2.y, 0.0), (158, 0.25, 0.22) if horiz else (0.25, 158, 0.22))
            for k in range(9):
                p = R @ Vector((52 + k * 17, side * 10.4, 0))
                street_lamp(p.x, p.y, ang + (math.pi if side > 0 else 0))
                # street furniture between lamps: bus stops, bins, bushes (kit props)
                q = R @ Vector((60.5 + k * 17, side * 10.3, 0))
                face = ang + (math.pi if side > 0 else 0)          # +Y of the prop faces the road
                pick = (k * 7 + (side > 0) * 3 + int(ang * 10)) % 6
                if pick == 0:
                    KL.marker(empty, "Bus_Stop_02", q.x, q.y, 0.2, face + math.pi)
                    col_box((q.x, q.y, 0), (4.6, 1.9, 2.5), face)
                elif pick in (1, 4):
                    KL.marker(empty, random.Random(k).choice(["Trash_Can_04", "Trash_Can_07", "Trash_Can_06"]), q.x, q.y, 0.2, face + math.pi)
                    col_box((q.x, q.y, 0), (2.0, 1.1, 1.6), face)
                else:
                    for dk in (-1.0, 1.0):
                        b = R @ Vector((60.5 + k * 17 + dk * 1.7, side * 10.3, 0))
                        KL.marker(empty, "Bush_06" if dk < 0 else "Bush_07", b.x, b.y, 0.2, face)

    # world edge walls
    for sx, sy, w, d in ((0, 200, 420, 2), (0, -200, 420, 2), (200, 0, 2, 420), (-200, 0, 2, 420)):
        col_box((sx, sy, -10), (w, d, 60))


def overlay(m, x0, y0, x1, y1, z=0.04):
    a = acc(m)
    a.add([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [(0, 1, 2, 3)])


def welcome_arch():
    for s in (-1, 1):
        box("darkmetal", (s * 11, -92, 0), (1.5, 1.5, 13), collide=True)
        box("neon_lime", (s * 11, -92.8, 0), (1.6, 0.2, 13))
    box("darkmetal", (0, -92, 11.5), (23.5, 1.5, 3.2))
    text("neon_lime", "WELCOME TO BAGVERSE", (0, -92.8, 13.1), size=1.9, rz=math.pi)
    text("neon_magenta", "GM", (0, -91.2, 13.1), size=2.4, rz=0)


def hero_district():
    """The detailed Bag Square (bag_square_hero.py), merged per material for the game."""
    import sys
    sys.path.insert(0, HERE)
    import bag_square_hero
    _, cols, _ = bag_square_hero.build(mode="game")
    COLS.extend(cols)


# ----------------------------------------------------------------------------- legacy square (pre-spec, unused)
def build_square():
    empty("SPAWN", (0, -36, 0.2), facing=0.0)
    empty("ZONE_bag_square", (0, 0, 0), label="THE BAG SQUARE", radius=46, color="#b06bff")
    empty("ZONE_ad_canyon", (0, 0, 0), label="THE AD CANYON", radius=80, color="#22e8ff")

    # --- RWA Vault Showroom (center glass pavilion)
    W, H, PL = 18.0, 8.0, 0.3
    empty("ZONE_rwa_vault", (0, 0, 0), label="THE RWA VAULT SHOWROOM", radius=11, color="#ffc83d")
    box("darkmetal", (0, 0, 0), (W + 2, W + 2, PL), collide=True)             # plinth (low enough to walk onto)
    box("plaza", (0, -W / 2 - 3.2, 0), (8, 4.5, 0.15))                           # entry step
    for sx in (-1, 0, 1):
        for sy in (-1, 0, 1):
            if sx == 0 and sy == 0:
                continue
            if sx == 0 and sy == -1:
                continue
            box("gold", (sx * W / 2, sy * W / 2, PL), (0.6, 0.6, H), collide=True)
    box("gold", (-3.3, -W / 2, PL), (0.6, 0.6, H), collide=True)
    box("gold", (3.3, -W / 2, PL), (0.6, 0.6, H), collide=True)
    # glass walls (south wall has a 6m door gap)
    box("glass", (0, W / 2, PL), (W, 0.12, H), collide=True)
    box("glass", (W / 2, 0, PL), (0.12, W, H), collide=True)
    box("glass", (-W / 2, 0, PL), (0.12, W, H), collide=True)
    box("glass", (-6.15, -W / 2, PL), (5.7, 0.12, H), collide=True)
    box("glass", (6.15, -W / 2, PL), (5.7, 0.12, H), collide=True)
    box("glass", (0, -W / 2, 6.0), (6.6, 0.12, H - 5.5))
    # roof + gold edge
    box("darkmetal", (0, 0, H + 0.5), (W + 1.2, W + 1.2, 0.8), collide=True)
    for s in (-1, 1):
        box("goldglow", (0, s * (W / 2 + 0.6), H + 0.5), (W + 1.4, 0.2, 0.8))
        box("goldglow", (s * (W / 2 + 0.6), 0, H + 0.5), (0.2, W + 1.4, 0.8))
    neon_sign("THE RWA VAULT", 0, -W / 2 - 0.7, H - 0.6, rz=math.pi, size=1.3, color="neon_goldneon", backing=False)
    # pedestals + hologram anchors
    for i, (px, py) in enumerate(((-5, 1), (0, 3), (5, 1)), start=1):
        cyl("chrome", (px, py, PL), 1.0, 1.2, seg=20)
        disc("pedestal", (px, py, PL + 1.21), 0.9, seg=20)
        ring("neon_cyan", (px, py, PL), 1.0, 1.1, 0.05, seg=24)
        col_box((px, py, PL), (2, 2, 1.2))
        empty(f"HOLO_{i}", (px, py, 3.0), slot=i)
    # crown tower with 4 hero screens + coin
    box("darkmetal", (0, 0, H + 1.3), (9, 9, 8))
    for k, rz in enumerate((math.pi, 0, -math.pi / 2, math.pi / 2)):
        n = Vector((-math.sin(rz), math.cos(rz), 0))
        a = keep(f"BB_{17 + k:02d}", "screen_off", {"aspect": "16:9", "slot": 17 + k, "tier": "hero"})
        quad(None, tuple(n * 4.56 + Vector((0, 0, H + 5.3))), 8.2, 4.6, rz, target=a)
        box("neon_magenta", tuple(n * 4.52 + Vector((0, 0, H + 2.85))), (8.8, 0.15, 0.15) if k < 2 else (0.15, 8.8, 0.15))
        box("neon_magenta", tuple(n * 4.52 + Vector((0, 0, H + 7.75))), (8.8, 0.15, 0.15) if k < 2 else (0.15, 8.8, 0.15))
    cyl("darkmetal", (0, 0, H + 9.3), 0.6, 3, seg=10)
    coin = keep("VAULT_COIN", "goldglow")
    cyl(None, (0, 0.4, 0), 3.2, 0.8, seg=40, rx=math.pi / 2, target=coin)
    text(None, "$", (0, 0, 0), size=3.6, rz=0, flat=False, extrude=0.55, target=coin)
    KEEP[-1][3]["loc"] = (0, 0, H + 15.2)

    # big floor lettering in front of the vault
    text("neon_purple", "THE BAG SQUARE", (0, -17.5, 0.08), size=3.0, rz=0, flat=True, extrude=0.02)

    # --- Ad Canyon towers: 3 per quadrant facing the vault, each with a billboard
    bb = 1
    tower_specs = []
    for q in range(4):
        for off, r, h in ((-25, 68, 72), (0, 70, 96), (25, 68, 60)):
            a = math.radians(45 + q * 90 + off)
            tower_specs.append((math.cos(a) * r, math.sin(a) * r, h))
    for i, (x, y, h) in enumerate(tower_specs):
        rz = facing(x, y)
        w, d = random.choice(((20, 18), (18, 18), (22, 16)))
        building(x, y, w, d, h, rz, fac=random.choice(["fac_stone", "fac_glass", "fac_stucco"]))
        n = Vector((-math.sin(rz), math.cos(rz), 0))
        front = Vector((x, y, 0)) + n * (d / 2 + 0.25)
        vertical = (i % 3 == 1)
        bw, bh = (9.5, 16.9) if vertical else (17.0, 9.56)
        zc = 13 + bh / 2 + random.uniform(0, 6)
        a = keep(f"BB_{bb:02d}", "screen_off", {"aspect": "9:16" if vertical else "16:9", "slot": bb, "tier": "canyon"})
        quad(None, (front.x, front.y, zc), bw, bh, rz, target=a)
        frame = front - n * 0.12
        box("darkmetal", (frame.x, frame.y, zc - bh / 2 - 0.4), (bw + 0.8, 0.3, bh + 0.8), rz)
        trim = random.choice(["neon_cyan", "neon_magenta", "neon_lime"])
        box(trim, (front.x, front.y, zc - bh / 2 - 0.55), (bw + 0.9, 0.2, 0.2), rz)
        box(trim, (front.x, front.y, zc + bh / 2 + 0.35), (bw + 0.9, 0.2, 0.2), rz)
        bb += 1
        # small neon blade signs on the side
        side = Vector((math.cos(rz), math.sin(rz), 0)) * (w / 2 + 0.6)
        for s in (1, -1):
            p = Vector((x, y, 0)) + side * s + n * (d / 2 - 2)
            box(random.choice(["neon_cyan", "neon_magenta", "neon_purple", "neon_lime"]), (p.x, p.y, 5), (0.25, 1.4, 7), rz)
    neon_sign("THE AD CANYON", -45.4, 45.4, 9.5, rz=facing(-45.4, 45.4), size=2.0, color="neon_cyan", backing=False)

    # --- avenue gantries with billboards (BB_13..16) at the plaza mouths
    for k, ang in enumerate((math.pi / 2, 0, -math.pi / 2, math.pi)):
        d = 50.0
        c = Vector((math.cos(ang) * d, math.sin(ang) * d, 0))
        rz = facing(c.x, c.y)
        sidev = Vector((math.cos(rz), math.sin(rz), 0))
        for s in (-1, 1):
            p = c + sidev * s * 10.5
            box("darkmetal", (p.x, p.y, 0), (1.2, 1.2, 15), rz, collide=True)
            box("neon_cyan", (p.x, p.y, 0), (1.3, 0.2, 15), rz)
        box("darkmetal", (c.x, c.y, 14), (22.2, 1.4, 1.2), rz)
        a = keep(f"BB_{13 + k:02d}", "screen_off", {"aspect": "16:9", "slot": 13 + k, "tier": "gantry"})
        n = Vector((-math.sin(rz), math.cos(rz), 0))
        p = c + n * 0.75
        quad(None, (p.x, p.y, 10.0), 12.0, 6.75, rz, target=a)
        box("darkmetal", (c.x, c.y, 6.3), (12.8, 1.0, 7.5), rz)
    # welcome arch over the south avenue
    for s in (-1, 1):
        box("darkmetal", (s * 11, -92, 0), (1.5, 1.5, 13), collide=True)
        box("neon_lime", (s * 11, -92.8, 0), (1.6, 0.2, 13))
    box("darkmetal", (0, -92, 11.5), (23.5, 1.5, 3.2))
    text("neon_lime", "WELCOME TO BAGVERSE", (0, -92.8, 13.1), size=1.9, rz=math.pi)
    text("neon_magenta", "GM", (0, -91.2, 13.1), size=2.4, rz=0)

    # --- Arcade portals (plaza perimeter, diagonals)
    portals = (("BAG_RUN", "BAG RUN", "neon_lime", LIME, 225),
               ("VAULT_HEIST", "VAULT HEIST", "neon_goldneon", GOLD, 315),
               ("TILE_DROP", "TILE DROP", "neon_magenta", MAGENTA, 45),
               ("ARCADE", "ARCADE", "neon_cyan", CYAN, 135))
    for pid, label, nm, col, deg in portals:
        a = math.radians(deg)
        x, y = math.cos(a) * 36, math.sin(a) * 36
        rz = facing(x, y)
        box("darkmetal", (x, y, 0), (8.5, 3.2, 0.5), rz, collide=True)
        torus(nm, (x, y, 4.1), 3.3, 0.32, seg=48, tseg=8, rz=rz)
        torus("darkmetal", (x, y, 4.1), 3.75, 0.25, seg=48, tseg=6, rz=rz)
        for s in (-1, 1):
            side = Vector((math.cos(rz), math.sin(rz), 0)) * s * 3.9
            box("darkmetal", (x + side.x, y + side.y, 0.5), (0.8, 1.2, 3.6), rz, collide=True)
        fx = keep(f"PORTAL_FX_{pid}", nm, {"id": pid, "label": label, "color": "#%02x%02x%02x" % tuple(int(c * 255) for c in col)})
        disc(None, (x, y, 4.1), 3.05, seg=40, rz=rz, rx=math.pi / 2, target=fx)
        n = Vector((-math.sin(rz), math.cos(rz), 0))
        neon_sign(label, x + n.x * 0.3, y + n.y * 0.3, 8.6, rz=rz, size=0.95, color=nm)
    empty("ZONE_trading_floor", (0, -27, 0), label="THE TRADING FLOOR", radius=9, color="#7cff3d")

    # --- Trading floor kiosks with tickers
    for i, deg in enumerate((-55, -68, -80, -100, -112, -125), start=1):
        a = math.radians(deg)
        x, y = math.cos(a) * 28, math.sin(a) * 28
        rz = facing(x, y) + math.pi       # screens face outward toward arriving players
        box("darkmetal", (x, y, 0), (3.4, 1.6, 1.1), rz, collide=True, top="neon_lime")
        box("darkmetal", (x, y, 1.1), (0.25, 0.25, 1.8), rz)
        n = Vector((-math.sin(rz), math.cos(rz), 0))
        t = keep(f"TICKER_{i}", "screen_off", {"slot": i})
        quad(None, (x + n.x * 0.16, y + n.y * 0.16, 3.4), 3.6, 1.4, rz, target=t)
        box("darkmetal", (x, y, 2.6), (3.9, 0.25, 1.6), rz)

    # --- benches, planters, lamps around the plaza ring
    for i in range(16):
        a = 2 * math.pi * (i + 0.5) / 16
        if any(abs(((a - b + math.pi) % (2 * math.pi)) - math.pi) < 0.2 for b in (0, math.pi / 2, math.pi, 3 * math.pi / 2)):
            continue
        x, y = math.cos(a) * 41.5, math.sin(a) * 41.5
        rz = facing(x, y)
        if i % 2:
            cyl("concrete", (x, y, 0), 1.6, 1.0, seg=12, collide=True)
            tree(x, y, 0.7)
        else:
            box("wood", (x, y, 0.45), (3.2, 0.9, 0.12), rz)
            box("darkmetal", (x, y, 0), (3.0, 0.7, 0.45), rz, collide=True)
            box("neon_purple", (x, y, 0.0), (3.2, 0.9, 0.05), rz)


# ----------------------------------------------------------------------------- districts
def filler_blocks():
    """mid-rise blocks lining the avenues between the canyon ring and the districts."""
    for ang in (0, math.pi / 2, math.pi, -math.pi / 2):
        R = Matrix.Rotation(ang, 3, "Z")
        for side in (-1, 1):
            for k, along in enumerate((86, 101)):
                p = R @ Vector((along, side * 27, 0))
                if ang == 0 and side > 0:
                    continue   # FOMO valley approach stays open
                building(p.x, p.y, 13, 22, random.uniform(18, 36), ang, fac=random.choice(FACADES))


def skyline():
    """tall backdrop towers just outside the playable edge."""
    for i in range(48):
        a = 2 * math.pi * i / 48 + random.uniform(-0.03, 0.03)
        r = random.uniform(214, 236)
        x, y = math.cos(a) * r, math.sin(a) * r
        building(x, y, random.uniform(18, 30), random.uniform(18, 30), random.uniform(50, 150),
                 facing(x, y), fac=random.choice(FACADES + ["fac_granite", "fac_granite"]), trims=random.random() < 0.6)


def hodl_heights():
    empty("ZONE_hodl_heights", (0, 150, 0), label="HODL HEIGHTS", radius=42, color="#ff9b4a")
    overlay("grass", -48, 112, -13, 188); overlay("grass", 13, 112, 48, 188)
    neon_sign("HODL HEIGHTS", -20, 113, 5, rz=math.pi, size=2.2, color="neon_orange")
    for sx in (-1, 1):
        for j in range(4):
            for i in range(2):
                x = sx * (20 + i * 15); y = 125 + j * 17
                w, d, h = 9, 8, 4.5
                rz = -sx * math.pi / 2
                hm = f"house_{random.randrange(5)}"
                box(hm, (x, y, 0), (w, d, h), rz, collide=True)
                # gable roof: prism along the house length
                rm = f"houseroof_{random.randrange(4)}"
                rw, rd = w + 0.8, d + 0.8
                prism = [(-rw / 2, -rd / 2, 0), (rw / 2, -rd / 2, 0), (rw / 2, rd / 2, 0), (-rw / 2, rd / 2, 0),
                         (-rw / 2, 0, 2.8), (rw / 2, 0, 2.8)]
                acc(rm).add(prism, [(0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (3, 2, 1, 0)], TRS((x, y, h), rz))
                R = Matrix.Rotation(rz, 3, "Z")
                front = R @ Vector((0, -d / 2 - 0.05, 0))
                box("wood", (x + front.x, y + front.y, 0), (1.3, 0.1, 2.3), rz)
                for wx in (-2.8, 2.8):
                    p = R @ Vector((wx, -d / 2 - 0.05, 0))
                    box("window_lit", (x + p.x, y + p.y, 1.6), (1.4, 0.1, 1.2), rz)
                tree(x + sx * 6.5, y + 6, 0.8)
                # "HODL" flag on every other house
                if (i + j) % 2 == 0:
                    cyl("chrome", (x - sx * 5.5, y - 5, 0), 0.06, 5, seg=6)
                    box("neon_orange", (x - sx * 5.5, y - 5 + 0.6, 4.0), (0.05, 1.2, 0.8))


def park():
    empty("ZONE_doge_park", (-125, 125, 0), label="DOGE & BONK PARK", radius=60, color="#ffd23d")
    overlay("grass", -190, 64, -62, 190)
    neon_sign("DOGE & BONK PARK", -78, 70, 5.5, rz=facing(-78, 70) + math.pi * 0.0, size=2.2, color="neon_goldneon")
    # circular path + fountain
    ring("sidewalk", (-125, 125, 0.0), 22, 26, 0.08, seg=64)
    box("sidewalk", (-125, 125, 0.0), (4, 120, 0.08))
    box("sidewalk", (-125, 125, 0.0), (120, 4, 0.08))
    cyl("concrete", (-125, 125, 0), 7, 1.0, seg=24, collide=True)
    disc("neon_cyan", (-125, 125, 0.9), 6.5, seg=24)
    cyl("concrete", (-125, 125, 1.0), 1.2, 3.0, seg=12)
    sphere("neon_cyan", (-125, 125, 4.2), 1.0, seg=10, rings=6)
    # giant "BONK" bat monument
    box("concrete", (-100, 150, 0), (8, 8, 2.5), collide=True)
    bat = Matrix.Translation((-100, 150, 2.5)) @ Matrix.Rotation(0.5, 4, "Y")
    cyl("wood", (0, 0, 0), 0.5, 14, seg=12, r2=1.3)
    BUCKETS["wood"].v[-24:] = [tuple(bat @ Vector(p)) for p in BUCKETS["wood"].v[-24:]]
    text("neon_goldneon", "BONK", (-100, 145.9, 1.25), size=1.6, rz=math.pi)
    # dog houses + "no bonk zone" sign
    for i, (x, y) in enumerate(((-150, 95), (-160, 110), (-145, 160), (-90, 100))):
        box("wood", (x, y, 0), (3, 3.5, 2.2), random.uniform(0, 3), collide=True)
        sphere("neon_red", (x, y, 2.6), 0.35, seg=6, rings=4)
    neon_sign("NO BONK ZONE", -125, 100, 3.2, rz=math.pi, size=1.0, color="neon_red")
    # fences around dog run
    for i in range(10):
        box("fence", (-170 + i * 4, 80, 0), (3.8, 0.15, 1.1), collide=True)
    for _ in range(70):
        x, y = random.uniform(-188, -66), random.uniform(68, 188)
        if math.hypot(x + 125, y - 125) < 30 or math.hypot(x + 100, y - 150) < 8:
            continue
        tree(x, y, random.uniform(0.8, 1.4))
    # dog-bone sculptures (original park mascots)
    for x, y in ((-140, 145), (-108, 118)):
        box("white_paint", (x, y, 0.8), (4, 0.9, 0.9))
        for s in (-1, 1):
            sphere("white_paint", (x + s * 2.1, y + 0.4, 1.25), 0.65, seg=8, rings=6)
            sphere("white_paint", (x + s * 2.1, y - 0.4, 1.25), 0.65, seg=8, rings=6)
        col_box((x, y, 0), (5.5, 2, 2))


def rekt_district():
    empty("ZONE_rekt", (125, 135, 0), label="JEET WASTELANDS / REKT DISTRICT", radius=55, color="#ff3b3b")
    overlay("dirt", 62, 82, 192, 192)
    neon_sign("REKT DISTRICT", 90, 88, 5, rz=math.pi, size=2.0, color="neon_red")
    for _ in range(22):
        x, y = random.uniform(70, 185), random.uniform(95, 185)
        m = random.choice(["tent_blue", "tent_red", "tent_blue"])
        cyl(m, (x, y, 0), 2.4, 2.6, seg=4, r2=0.01, rz=random.uniform(0, 1.5), collide=True)
    for _ in range(45):
        x, y = random.uniform(66, 188), random.uniform(88, 188)
        s = random.uniform(1, 2.2)
        box("crate", (x, y, 0), (s, s, s), random.uniform(0, 3), collide=s > 1.4)
    for _ in range(25):
        x, y = random.uniform(66, 188), random.uniform(88, 188)
        sphere("rubble", (x, y, 0), random.uniform(1, 2.5), seg=6, rings=4, scale=(1.2, 1, 0.5))
    # crashing-chart billboard (red neon zig-zag down)
    box("darkmetal", (150, 170, 0), (1, 1, 10), collide=True)
    box("darkmetal", (150, 170, 10), (22, 1, 12))
    pts = [(-9, 10), (-6, 7.5), (-4, 9), (-1, 4.5), (1.5, 6), (4, 1.5), (8, -3)]
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, z1 - z0)
        ang = math.atan2(z1 - z0, x1 - x0)
        M = Matrix.Translation((150 + (x0 + x1) / 2, 169.4, 15 + (z0 + z1) / 2 - 2)) @ Matrix.Rotation(-ang, 4, "Y") @ Matrix.Diagonal((L, 0.2, 0.35, 1))
        acc("neon_red").add([(p[0], p[1], p[2] - 0.5) for p in BOX_V], BOX_SIDES + BOX_TOP + BOX_BOT, M)
    text("neon_red", "REKT", (150, 169.3, 19.6), size=2.2, rz=math.pi)
    # toppled statue plinth (generic)
    box("rubble", (110, 160, 0), (7, 7, 3), collide=True)
    cyl("rubble", (110, 160, 3), 1.4, 6, seg=8, r2=1.0, rx=1.3)
    # burning barrels + warning beacons so the wasteland reads at night
    for i in range(14):
        x, y = random.uniform(70, 182), random.uniform(92, 182)
        cyl("rust", (x, y, 0), 0.6, 1.3, seg=10, collide=True)
        disc("neon_orange", (x, y, 1.31), 0.55, seg=10)
        sphere("neon_orange", (x, y, 1.6), 0.4, seg=6, rings=4, scale=(1, 1, 1.6))
        empty(f"SMOKE_fire_{i}", (x, y, 1.8), color="#ff7a2a")
    for i in range(6):
        x, y = random.uniform(70, 182), random.uniform(92, 182)
        cyl("darkmetal", (x, y, 0), 0.15, 5, seg=6)
        sphere("neon_red", (x, y, 5.2), 0.4, seg=8, rings=5)
    for i in range(5):
        empty(f"SMOKE_rekt_{i}", (random.uniform(80, 180), random.uniform(100, 180), 1), color="#555060")


def copium_refinery():
    empty("ZONE_copium", (150, 0, 0), label="COPIUM REFINERY", radius=42, color="#7cff3d")
    overlay("concrete", 108, -48, 192, -13); overlay("concrete", 108, 13, 192, 48)
    neon_sign("COPIUM REFINERY", 112, 19, 5.5, rz=math.pi / 2, size=2.0, color="neon_lime")
    for sy in (-1, 1):
        box("fac_granite", (150, sy * 31, 0), (36, 22, 18), collide=True, top="roof")
        text("neon_lime", "COPIUM", (131.9, sy * 31, 12), size=3.0, rz=math.pi / 2)
        for i in range(3):
            x = 140 + i * 10
            cyl("white_paint", (x, sy * 38, 18), 1.6, 22, seg=12)
            for k in range(3):
                cyl("red_paint", (x, sy * 38, 22 + k * 6), 1.65, 1.6, seg=12)
            ring("neon_red", (x, sy * 38, 40), 1.5, 1.8, 0.4, seg=16)
            empty(f"SMOKE_copium_{sy}_{i}", (x, sy * 38, 41), color="#a0ffa0")
        for i in range(3):
            cyl("chrome", (176, sy * (20 + i * 9), 0), 3.5, 9, seg=16, collide=True)
            ring("neon_lime", (176, sy * (20 + i * 9), 6), 3.5, 3.7, 0.4, seg=24)
        cyl("rust", (125, sy * 20, 4), 0.8, 50, seg=8, rx=0, ry=math.pi / 2)


def bull_run():
    empty("ZONE_bull_run", (125, -125, 0), label="CHAD'S BULL RUN", radius=60, color="#ffc83d")
    overlay("goldpave", 62, -192, 192, -62)
    neon_sign("CHAD'S BULL RUN", 80, -70, 6, rz=facing(80, -70), size=2.2, color="neon_goldneon")
    for x, y, w, h in ((75, -150, 16, 55), (98, -180, 18, 70), (180, -90, 16, 80), (180, -120, 18, 50), (75, -110, 14, 38), (125, -185, 16, 62)):
        building(x, y, w, w, h, facing(x - 125, y + 125), fac="fac_sand", neon="neon_goldneon")
    # bull statue: the golden bull sculpture model (public/assets/bull.glb) on a dark plinth
    bx, by = 110, -95
    box("darkmetal", (bx, by, 0), (10, 6, 2), collide=True)
    empty("PROP_bull", (bx, by, 2), prop="bull", rz=round(facing(bx, by), 4), s=9.6)
    col_box((bx, by, 2), (9.0, 4.0, 5.2), facing(bx, by))
    # to-the-moon rocket on pad
    rx, ry = 150, -100
    cyl("darkmetal", (rx, ry, 0), 6, 1.2, seg=24, collide=True)
    ring("neon_goldneon", (rx, ry, 1.2), 5.4, 6, 0.1, seg=32)
    rk = keep("ROCKET", "white_paint", {"loc": (rx, ry, 1.2)})
    cyl(None, (0, 0, 1.5), 1.8, 14, seg=20, target=rk)
    cyl(None, (0, 0, 15.5), 1.8, 5, seg=20, r2=0.02, target=rk)
    rkr = keep("ROCKET_TRIM", "red_paint", {"loc": (rx, ry, 1.2), "follow": "ROCKET"})
    for k in range(4):
        a = k * math.pi / 2
        box(None, (math.cos(a) * 2.0, math.sin(a) * 2.0, 0), (0.25, 2.2, 4.5), a + math.pi / 2, target=rkr)
    cyl(None, (0, 0, 9), 1.85, 1.2, seg=20, target=rkr)
    cyl(None, (0, 0, 0.3), 1.3, 1.2, seg=16, r2=1.6, target=rkr)
    for s in (-1, 1):
        box("darkmetal", (rx + s * 4.5, ry, 1.2), (0.8, 0.8, 18), collide=True)
    col_box((rx, ry, 1.2), (4, 4, 20))
    empty("SMOKE_rocket", (rx, ry, 1.5), color="#ffd27a")
    # Apex RWA Arena
    ax, ay = 145, -155
    empty("ZONE_apex_arena", (ax, ay, 0), label="APEX RWA ARENA", radius=24, color="#ffc83d")
    gap = math.atan2(-ay, -ax)            # entrance faces the plaza
    a0, a1 = gap + 0.4, gap - 0.4 + 2 * math.pi
    for t in range(4):
        ring("concrete", (ax, ay, 0), 16 + t * 2.5, 30, 2 + t * 2.4, seg=40, a0=a0, a1=a1)
    ring("goldglow", (ax, ay, 0), 29.6, 30.2, 11, seg=40, a0=a0, a1=a1)
    disc("goldpave", (ax, ay, 0.1), 16, seg=40)
    ring("neon_goldneon", (ax, ay, 0.12), 15.6, 16, 0.05, seg=48)
    for i in range(40):
        a = a0 + (a1 - a0) * (i + 0.5) / 40
        col_box((ax + math.cos(a) * 23, ay + math.sin(a) * 23, 0), (14, 4.6, 11), a + math.pi / 2)
    gx, gy = ax + math.cos(gap) * 31, ay + math.sin(gap) * 31
    for s_ in (-1, 1):
        px, py = ax + math.cos(gap + s_ * 0.42) * 31, ay + math.sin(gap + s_ * 0.42) * 31
        box("darkmetal", (px, py, 0), (1.5, 1.5, 14), collide=True)
        box("neon_goldneon", (px, py, 0), (1.6, 1.6, 0.3))
    box("darkmetal", (gx, gy, 12), (26, 1.5, 3.4), facing(gx, gy))
    text("neon_goldneon", "APEX RWA ARENA", (gx + math.cos(gap) * 0.8, gy + math.sin(gap) * 0.8, 13.7), size=2.0, rz=facing(gx, gy))


def swamp():
    empty("ZONE_swamp", (-125, -125, 0), label="PEPE'S SWAMP", radius=60, color="#7cff3d")
    overlay("swamp", -192, -192, -62, -62)
    neon_sign("FEELS GOOD MAN ARCADE", -125, -78, 7.5, rz=0, size=1.8, color="neon_lime")
    # arcade hall
    box("fac_granite", (-125, -86, 0), (34, 14, 10), math.pi, collide=True, top="roof")
    box("neon_lime", (-125, -78.9, 0), (34, 0.2, 0.3))
    for i in range(6):
        x = -140 + i * 6
        box("darkmetal", (x, -76, 0), (1.6, 1.4, 2.6), collide=True)
        box(random.choice(["neon_lime", "neon_magenta", "neon_cyan"]), (x, -75.25, 1.4), (1.2, 0.08, 0.9))
    # boardwalks
    box("wood", (-125, -125, 0.15), (6, 80, 0.3))
    box("wood", (-125, -125, 0.15), (80, 6, 0.3))
    # toxic fountain
    cyl("darkmetal", (-125, -125, 0), 6, 1.2, seg=24, collide=True)
    disc("neon_lime", (-125, -125, 1.1), 5.6, seg=24)
    # Pepe bust statue rising out of the toxic pool (public/assets/pepe_bust.glb)
    empty("PROP_pepe_bust", (-125, -125, 1.2), prop="pepe_bust", rz=round(facing(-125, -125), 4), s=8.0)
    col_box((-125, -125, 1.2), (4.6, 4.6, 6.2))
    for _ in range(80):
        x, y = random.uniform(-188, -66), random.uniform(-188, -96)
        if abs(x + 125) < 5 or abs(y + 125) < 5:
            continue
        disc("lily", (x, y, 0.08), random.uniform(0.6, 1.4), seg=8)
    for _ in range(40):
        x, y = random.uniform(-188, -66), random.uniform(-188, -100)
        if abs(x + 125) < 8 or abs(y + 125) < 8 or math.hypot(x + 125, y + 125) < 10:
            continue
        s = random.uniform(1.0, 1.6)
        _tree_n[0] += 1   # swamp trees use the same instanced tree model (TREE_* marker)
        empty(f"TREE_{_tree_n[0]:03d}", (x, y, 0), s=round(s * 1.05, 3), rz=round(random.Random(hash((round(x, 2), round(y, 2)))).uniform(0, 6.283), 3), swamp=1)
        col_box((x, y, 0), (0.6 * s, 0.6 * s, 4 * s))
        sphere("neon_lime", (x + 1.5, y, 3.2 * s), 0.18, seg=5, rings=3)
    for i in range(4):
        empty(f"SMOKE_swamp_{i}", (random.uniform(-180, -70), random.uniform(-180, -100), 0.5), color="#7cff3d")


def arcade_strip():
    empty("ZONE_arcade", (-150, 0, 0), label="ARCADE PORTALS", radius=40, color="#22e8ff")
    neon_sign("ARCADE PORTALS", -112, 19, 5.5, rz=-math.pi / 2, size=2.0, color="neon_cyan")
    for sy in (-1, 1):
        for i in range(3):
            x = -130 - i * 20
            y = sy * 30
            h = random.uniform(16, 28)
            building(x, y, 16, 18, h, 0, fac="fac_stucco", neon="neon_cyan")
            # cabinet-shaped facade screen
            box("darkmetal", (x, y - sy * 9.6, 3), (10, 1.2, 10))
            quad("neon_" + random.choice(["cyan", "magenta", "lime", "purple"]), (x, y - sy * 10.25, 9), 8, 5, 0 if sy < 0 else math.pi)
            box(random.choice(["neon_magenta", "neon_cyan"]), (x, y - sy * 10.3, 3.5), (9, 0.2, 0.3))
    # extra portal ring decoration
    torus("neon_magenta", (-185, 0, 7), 6, 0.5, seg=48, rz=math.pi / 2)
    torus("darkmetal", (-185, 0, 7), 6.6, 0.4, seg=48, rz=math.pi / 2)
    box("darkmetal", (-185, 0, 0), (3, 16, 1), collide=True)


def south_gate():
    empty("ZONE_gm_gate", (0, -140, 0), label="GM GATE", radius=40, color="#7cff3d")
    for sx in (-1, 1):
        for j in range(3):
            building(sx * 30, -125 - j * 22, 16, 18, random.uniform(14, 34), 0, fac=random.choice(FACADES))
    cyl("darkmetal", (0, -150, 0), 5, 0.6, seg=24, collide=True)
    text("neon_lime", "GM", (0, -150, 4), size=6, rz=0, extrude=0.6)
    col_box((0, -150, 0), (8, 2, 7))


# ----------------------------------------------------------------------------- assemble
def world_uv(me, scale):
    su, sv = scale if isinstance(scale, tuple) else (scale, scale)
    me.uv_layers.new(name="UVMap")
    uv = me.uv_layers[0].data
    for p in me.polygons:
        n = p.normal
        if abs(n.z) > 0.6:
            for li in p.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                uv[li].uv = (co.x / su, co.y / su)
        else:
            h = Vector((-n.y, n.x, 0))
            h = h.normalized() if h.length > 1e-6 else Vector((1, 0, 0))
            for li in p.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                uv[li].uv = (co.dot(h) / su, co.z / sv)


def quad_uv(me):
    me.uv_layers.new(name="UVMap")
    uv = me.uv_layers[0].data
    for p in me.polygons:
        for k, li in enumerate(p.loop_indices):
            uv[li].uv = [(0, 0), (1, 0), (1, 1), (0, 1)][k % 4]


def make_obj(name, a, m, coll, uvmode="world"):
    me = bpy.data.meshes.new(name)
    me.from_pydata(a.v, [], a.f)
    me.validate(clean_customdata=False)
    if m:
        me.materials.append(MATS[m])
        if m in WORLD_UV:
            world_uv(me, WORLD_UV[m])
        elif uvmode == "quad":
            quad_uv(me)
        if m in SMOOTH:
            for poly in me.polygons:
                poly.use_smooth = True
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


def assemble():
    root = bpy.data.collections.new("BagSquare"); scene.collection.children.link(root)
    for m, a in BUCKETS.items():
        if a.f:
            make_obj(f"M_{m}", a, m, root)
    for name, m, a, props in KEEP:
        o = make_obj(name, a, m, root, uvmode="quad" if name.startswith(("BB_", "TICKER_")) else "world")
        for k, v in props.items():
            if k == "loc":
                o.location = v
            else:
                o[k] = v
    cv, cf = [], []
    for vs, fs in COLS:
        off = len(cv)
        cv.extend(tuple(v) for v in vs)
        cf.extend(tuple(i + off for i in f) for f in fs)
    c = make_obj("COLLIDER", Acc(), None, root)
    c.data.from_pydata(cv, [], cf)
    c["collider"] = True
    for name, loc, props in EMPTIES:
        e = bpy.data.objects.new(name, None)
        e.location = loc
        e.empty_display_size = 1.5
        for k, v in props.items():
            e[k] = v
        root.objects.link(e)
    return root


build_materials()
build_ground()
hero_district()
welcome_arch()
filler_blocks()
skyline()
hodl_heights()
park()
rekt_district()
copium_refinery()
bull_run()
swamp()
arcade_strip()
south_gate()
assemble()

# ----------------------------------------------------------------------------- soft, hand-painted edges
# Every solid building/trim/prop mesh gets a small rounded bevel with hardened normals: faces stay flat-shaded,
# corners turn into soft curved highlights instead of razor edges. Flat ground, decals, glass, neon, text and
# screens are left alone. BEVEL_SEG=0 disables, 1 = chamfer (phones), 2 = rounded (default).
import re as _re
BEVEL_SEG = int(os.environ.get("BEVEL_SEG", "2"))
BEVEL_W = float(os.environ.get("BEVEL_W", "0.09"))
_BEVEL_SKIP_OBJ = _re.compile(r"^(COLLIDER|BB_|TICKER_|PORTAL_FX_|HOLO_|VAULT_COIN)")
_BEVEL_SKIP_MAT = _re.compile(r"(plaza|asphalt|sidewalk|grass|dirt|goldpave|swamp|lane_paint|paint_line|hexpaver|water|lily|"
                              r"neon|glass|crystal|portal|screen|sign|glow|window_lit|warm_light|leaf|bark|text|decal|ticker|"
                              r"pedestal|lamp_glow|rubble|led)", _re.I)


def bevel_pass():
    if BEVEL_SEG <= 0:
        return
    done, before, after = 0, 0, 0
    for o in list(bpy.data.objects):
        if o.type != "MESH" or not o.data.polygons or _BEVEL_SKIP_OBJ.match(o.name):
            continue
        mats = [m.name for m in o.data.materials if m]
        if not mats or any(_BEVEL_SKIP_MAT.search(n) for n in mats):
            continue
        me = o.data
        before += sum(len(p.vertices) - 2 for p in me.polygons)
        # merge coincident corners of each box so the bevel sees real edges (boxes never touch each other here)
        import bmesh
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
        bm.to_mesh(me); bm.free()
        for poly in me.polygons:
            poly.use_smooth = True
        md = o.modifiers.new("soft_edges", "BEVEL")
        md.width = BEVEL_W; md.segments = BEVEL_SEG; md.limit_method = "ANGLE"; md.angle_limit = math.radians(35)
        md.harden_normals = True; md.use_clamp_overlap = True; md.miter_outer = "MITER_ARC"; md.profile = 0.5
        bpy.context.view_layer.objects.active = o
        with bpy.context.temp_override(object=o, active_object=o):
            bpy.ops.object.modifier_apply(modifier=md.name)
        after += sum(len(p.vertices) - 2 for p in o.data.polygons)
        done += 1
    print(f"BEVEL objects={done} tris {before} -> {after} (x{after / max(1, before):.2f}) seg={BEVEL_SEG} w={BEVEL_W}")


import time as _t
_t0 = _t.time(); bevel_pass(); print(f"BEVEL time {_t.time() - _t0:.1f}s")
tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == "MESH" for p in o.data.polygons)
print(f"objects={len(bpy.data.objects)} materials={len(MATS)} tris~{tris}")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT, compress=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_extras=True, export_apply=False,
                          export_image_format="WEBP", export_image_quality=88, export_yup=True)
print("EXPORTED", OUT)
