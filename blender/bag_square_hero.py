"""
BagVerse - The Bag Square hero district (detailed, textured).

Implements the 3D Asset Specification: hero buildings, signage, plaza/roads and props, organised in
01_HERO_BUILDINGS / 02_SIGNAGE_AND_ADS / 03_PLAZA_AND_ROADS / 04_PROPS_AND_FOLIAGE (+ 05_GAMEPLAY).
1 Blender unit = 1 m. +Y is north. Textures come from blender/textures (run gen_textures.py first).

Two ways to run it:
  * standalone look-dev file (per-asset objects, cel shading, outlines, cameras, preview renders):
        blender -b -P blender/bag_square_hero.py -- --render
  * from build_world.py for the game (merged per material, colliders + gameplay objects):
        import bag_square_hero; bag_square_hero.build(mode="game")

Gameplay naming contract (read by src/world.js): BB_01..BB_20, TICKER_1..6, PORTAL_FX_<ID>,
HOLO_1..3, ZONE_<id>, SPAWN, SMOKE_*, COLLIDER.
"""
import bpy, math, os, random, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() else os.getcwd()
sys.path.insert(0, HERE)
import detail_geo as DG  # noqa: E402
import kitlib as KL  # noqa: E402
TEX = os.path.join(HERE, "textures")
FONTS = os.path.join(HERE, "fonts")
R = random.Random(42)


def hexc(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


# palette from the spec
C_CONCRETE, C_ASPHALT, C_MARBLE, C_GOLD = hexc("#3A3852"), hexc("#1E1D2B"), hexc("#D6D4E0"), hexc("#E6B800")
C_CYAN, C_MAGENTA, C_PURPLE, C_BTC = hexc("#00F0FF"), hexc("#FF007F"), hexc("#B829FF"), hexc("#FFB800")

# ----------------------------------------------------------------------------- materials
# name: dict(color, albedo, normal, emissive, emit, strength, metal, rough, alpha, texel(su,sv), orm)
SPECS = {
    "concrete":   dict(color=C_CONCRETE, albedo="concrete_albedo", normal="concrete_normal", orm="concrete_orm", rough=0.85, texel=(1.52, 1.52)),
    "asphalt":    dict(color=C_ASPHALT, albedo="asphalt_albedo", normal="asphalt_normal", orm="asphalt_orm", rough=0.9, texel=(3.04, 3.04)),
    "marble":     dict(color=C_MARBLE, albedo="marble_albedo", normal="marble_normal", rough=0.25, texel=(1.52, 1.52)),
    "marble_ashlar": dict(color=C_MARBLE, albedo="marble_ashlar_albedo", normal="marble_ashlar_normal", rough=0.3, texel=(1.52, 1.52)),
    "brick":      dict(color=(0.4, 0.15, 0.25), albedo="brick_albedo", normal="brick_normal", rough=0.85, texel=(6.0, 6.0)),
    "curtain":    dict(color=(0.3, 0.35, 0.45), albedo="curtain_albedo", normal="curtain_normal", orm="curtain_orm", emissive="curtain_emissive", strength=1.2, texel=(9.12, 18.24)),
    "deco":       dict(color=(0.42, 0.35, 0.54), albedo="deco_albedo", normal="deco_normal", orm="deco_orm", emissive="deco_emissive", strength=1.2, texel=(7.6, 15.96)),
    "fac_stone":  dict(color=(0.6, 0.57, 0.54), albedo="fac_stone_albedo", normal="fac_stone_normal", orm="fac_stone_orm", emissive="fac_stone_emissive", strength=1.2, texel=(10.64, 10.64)),
    "fac_brick":  dict(color=(0.45, 0.22, 0.2), albedo="fac_brick_albedo", normal="fac_brick_normal", orm="fac_brick_orm", emissive="fac_brick_emissive", strength=1.2, texel=(10.64, 10.64)),
    "fac_glass":  dict(color=(0.3, 0.36, 0.44), albedo="fac_glass_albedo", normal="fac_glass_normal", orm="fac_glass_orm", emissive="fac_glass_emissive", strength=1.2, texel=(11.4, 10.64)),
    "fac_granite": dict(color=(0.3, 0.3, 0.34), albedo="fac_granite_albedo", normal="fac_granite_normal", orm="fac_granite_orm", emissive="fac_granite_emissive", strength=1.2, texel=(10.64, 10.64)),
    "shopfront":  dict(color=(0.2, 0.22, 0.26), albedo="shopfront_albedo", emissive="shopfront_emissive", strength=0.5, texel=(10.64, 4.2)),
    "trim_stone": dict(color=(0.90, 0.91, 0.93), rough=0.8),
    "trim_dark":  dict(color=(0.60, 0.64, 0.70), metal=0.2, rough=0.5),
    "roof":       dict(color=(0.62, 0.64, 0.68), rough=0.85),
    "roof_metal": dict(color=(0.66, 0.69, 0.73), metal=0.4, rough=0.45),
    "water_tank": dict(color=(0.45, 0.32, 0.22), albedo="bark_albedo", rough=0.85, texel=(0.76, 0.76)),
    "pole_paint": dict(color=(0.17, 0.18, 0.21), metal=0.7, rough=0.35),
    "lamp":       dict(color=(1, 0.95, 0.85), emit=(1, 0.9, 0.7), strength=3.0),
    "banner_magenta": dict(color=(0.85, 0.12, 0.55), rough=0.7),
    "banner_cyan": dict(color=(0.05, 0.62, 0.78), rough=0.7),
    "leaf_pine":  dict(color=(0.08, 0.30, 0.16), rough=0.8),
    "hexpaver":   dict(color=(0.16, 0.16, 0.22), albedo="hexpaver_albedo", normal="hexpaver_normal", emissive="hexpaver_emissive", strength=1.1, rough=0.45, texel=(5.0, 5.0)),
    "gold":       dict(color=C_GOLD, albedo="gold_albedo", normal="gold_normal", orm="gold_orm", metal=1.0, rough=0.3, texel=(0.95, 0.95)),
    "gold_glow":  dict(color=C_GOLD, albedo="gold_albedo", orm="gold_orm", metal=1.0, rough=0.25, emit=C_BTC, strength=1.5, texel=(0.76, 0.76)),
    "hull":       dict(color=(0.70, 0.75, 0.82), albedo="hull_albedo", normal="hull_normal", metal=0.15, rough=0.5, texel=(3.0, 3.0)),
    "storefront": dict(color=(1, 0.5, 0.7), albedo="storefront_albedo", emissive="storefront_emissive", strength=1.5, rough=0.1, texel=(4.56, 2.28)),
    "sidewalk":   dict(color=(0.35, 0.34, 0.43), albedo="sidewalk_albedo", normal="sidewalk_normal", orm="sidewalk_orm", rough=0.8, texel=(2.85, 2.85)),
    "curb":       dict(color=(0.80, 0.81, 0.83), rough=0.8),
    "hazard":     dict(color=(0.9, 0.75, 0.05), albedo="hazard_albedo", rough=0.6, texel=(0.76, 0.76)),
    "spire_grad": dict(color=C_MAGENTA, albedo="spire_gradient", emissive="spire_gradient", strength=4.0, rough=0.3),
    "steel":      dict(color=(0.62, 0.66, 0.72), metal=0.6, rough=0.4),
    "darkmetal":  dict(color=(0.42, 0.45, 0.50), metal=0.4, rough=0.45),
    "chrome":     dict(color=(0.85, 0.85, 0.9), metal=1.0, rough=0.12),
    "paint_white": dict(color=(0.9, 0.9, 0.92), rough=0.6),
    "paint_yellow": dict(color=(0.95, 0.75, 0.1), rough=0.6),
    "glass":      dict(color=(0.55, 0.75, 0.95), rough=0.05, alpha=0.25),
    "glass_dark": dict(color=(0.05, 0.07, 0.12), metal=0.3, rough=0.05),
    "glass_magenta": dict(color=C_MAGENTA, emit=C_MAGENTA, strength=0.8, rough=0.05, alpha=0.45),
    "crystal":    dict(color=(0.85, 0.35, 1.0), emit=(0.75, 0.2, 1.0), strength=0.7, rough=0.05, alpha=0.6),
    "portal_cyan": dict(color=C_CYAN, emit=C_CYAN, strength=1.2, alpha=0.55),
    "portal_magenta": dict(color=C_MAGENTA, emit=C_MAGENTA, strength=1.2, alpha=0.55),
    "portal_purple": dict(color=C_PURPLE, emit=C_PURPLE, strength=1.2, alpha=0.55),
    "portal_gold": dict(color=C_BTC, emit=C_BTC, strength=1.2, alpha=0.55),
    "crystal_core": dict(color=C_MAGENTA, emit=C_MAGENTA, strength=2.5),
    "neon_cyan":  dict(color=C_CYAN, emit=C_CYAN, strength=3.2),
    "neon_magenta": dict(color=C_MAGENTA, emit=C_MAGENTA, strength=3.2),
    "neon_purple": dict(color=C_PURPLE, emit=C_PURPLE, strength=3.2),
    "neon_gold":  dict(color=C_BTC, emit=C_BTC, strength=3.0),
    "neon_white": dict(color=(1, 1, 1), emit=(1, 0.97, 0.9), strength=4.0),
    "neon_red":   dict(color=(1, 0.1, 0.1), emit=(1, 0.08, 0.05), strength=4.0),
    "warm_light": dict(color=(1, 0.8, 0.45), emit=(1, 0.75, 0.4), strength=1.3),
    "rubber":     dict(color=(0.03, 0.03, 0.035), rough=0.9),
    "leaf":       dict(color=(0.16, 0.55, 0.22), albedo="leaf_albedo", normal="leaf_normal", rough=0.8, texel=(1.14, 1.14)),
    "leaf_dark":  dict(color=(0.07, 0.26, 0.08), rough=0.8),
    "bark":       dict(color=(0.3, 0.2, 0.14), albedo="bark_albedo", normal="bark_normal", rough=0.9, texel=(0.57, 0.57)),
    "car_red":    dict(color=(0.85, 0.1, 0.12), metal=0.3, rough=0.35),
    "car_yellow": dict(color=(0.98, 0.78, 0.1), metal=0.3, rough=0.35),
    "car_cyan":   dict(color=(0.0, 0.75, 0.85), metal=0.3, rough=0.35),
    "car_purple": dict(color=(0.5, 0.2, 0.85), metal=0.3, rough=0.35),
    "car_white":  dict(color=(0.88, 0.88, 0.9), metal=0.2, rough=0.4),
    "proxy":      dict(color=(0.75, 0.75, 0.85), rough=0.6),
    "screen_off": dict(color=(0.02, 0.02, 0.03), rough=0.3),
    # sign artwork (quad-mapped)
    "sign_adcanyon": dict(color=C_CYAN, albedo="sign_adcanyon", emissive="sign_adcanyon", strength=2.5),
    "sign_adr":   dict(color=C_PURPLE, albedo="sign_adr", emissive="sign_adr", strength=2.5),
    "sign_corner": dict(color=(1, 0.4, 0.1), albedo="sign_corner", emissive="sign_corner", strength=2.5),
    "sign_ticker": dict(color=C_BTC, albedo="sign_ticker", emissive="sign_ticker", strength=2.5, alpha=0.9),
    "screen_tpl": dict(color=C_CYAN, albedo="screen_tpl", emissive="screen_tpl", strength=3.0),
    "screen_crest": dict(color=C_MAGENTA, albedo="screen_crest", emissive="screen_crest", strength=3.0),
    "screen_token": dict(color=C_PURPLE, albedo="screen_token", emissive="screen_token", strength=3.0),
    "screen_side": dict(color=C_MAGENTA, albedo="screen_side", emissive="screen_side", strength=3.0),
}
MATS = {}
IMGS = {}
SMOOTH = {"leaf", "leaf_dark", "leaf_pine", "bark", "water_tank", "pole_paint"}


def _img(name, noncolor=False):
    key = (name, noncolor)
    if key not in IMGS:
        path = os.path.join(TEX, name + ".png")
        img = bpy.data.images.load(path, check_existing=True)
        if noncolor:
            img.colorspace_settings.name = "Non-Color"
        IMGS[key] = img
    return IMGS[key]


def mat(name):
    if name in MATS:
        return MATS[name]
    s = SPECS[name]
    m = bpy.data.materials.new("H_" + name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    col = s.get("color", (0.5, 0.5, 0.5))
    p.inputs["Base Color"].default_value = (*col, 1)
    p.inputs["Metallic"].default_value = s.get("metal", 0.0)
    p.inputs["Roughness"].default_value = s.get("rough", 0.5)
    y = 300
    if s.get("albedo"):
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = _img(s["albedo"]); t.location = (-500, y); y -= 280
        nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
        m["albedo_node"] = t.name
    if s.get("normal"):
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = _img(s["normal"], True); t.location = (-500, y); y -= 280
        nm = nt.nodes.new("ShaderNodeNormalMap"); nm.location = (-220, y + 140)
        nt.links.new(t.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])
    if s.get("orm"):
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = _img(s["orm"], True); t.location = (-500, y); y -= 280
        sep = nt.nodes.new("ShaderNodeSeparateColor"); sep.location = (-220, y + 140)
        nt.links.new(t.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], p.inputs["Roughness"]); nt.links.new(sep.outputs["Blue"], p.inputs["Metallic"])
    if s.get("emissive"):
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = _img(s["emissive"]); t.location = (-500, y); y -= 280
        nt.links.new(t.outputs["Color"], p.inputs["Emission Color"])
        p.inputs["Emission Strength"].default_value = s.get("strength", 1.0)
        m["emissive_node"] = t.name
    elif s.get("emit"):
        p.inputs["Emission Color"].default_value = (*s["emit"], 1)
        p.inputs["Emission Strength"].default_value = s.get("strength", 1.0)
    if s.get("alpha", 1) < 1:
        p.inputs["Alpha"].default_value = s["alpha"]
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            m.blend_method = "BLEND"
        m.use_backface_culling = False
    MATS[name] = m
    return m


# ----------------------------------------------------------------------------- geometry
def TRS(loc=(0, 0, 0), rz=0.0, scale=(1, 1, 1), rx=0.0, ry=0.0):
    return (Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(ry, 4, "Y")
            @ Matrix.Rotation(rx, 4, "X") @ Matrix.Diagonal((*scale, 1)))


class Part:
    def __init__(self):
        self.v, self.f, self.uv = [], [], []


class Asset:
    """A named model built from material-separated parts in world space."""
    REG = []

    def __init__(self, name, coll, keep=False, props=None, origin=None):
        self.name, self.coll, self.keep, self.props = name, coll, keep, props or {}
        self.parts = {}
        self.origin = origin
        Asset.REG.append(self)

    def part(self, m):
        return self.parts.setdefault(m, Part())

    # -- core: add polygons with uv mode 'box' (world triplanar) or explicit per-loop uvs
    def add(self, m, verts, faces, M=None, uvs=None):
        P = self.part(m)
        o = len(P.v)
        vs = [(M @ Vector(v)) if M is not None else Vector(v) for v in verts]
        P.v.extend(vs)
        su, sv = SPECS[m].get("texel", (4, 4))
        for k, fc in enumerate(faces):
            P.f.append(tuple(i + o for i in fc))
            if uvs is not None:
                P.uv.append(uvs[k])
                continue
            a, b, c = vs[fc[0]], vs[fc[1]], vs[fc[2]]
            n = (b - a).cross(c - a)
            n = n.normalized() if n.length > 1e-9 else Vector((0, 0, 1))
            if abs(n.z) > 0.7:
                P.uv.append([(vs[i].x / su, vs[i].y / su) for i in fc])
            else:
                h = Vector((-n.y, n.x, 0))
                h = h.normalized() if h.length > 1e-6 else Vector((1, 0, 0))
                P.uv.append([(vs[i].dot(h) / su, vs[i].z / sv) for i in fc])

    def box(self, m, loc, size, rz=0.0, top=None, bottom=False, sides=True, rx=0.0, ry=0.0):
        V = [(-.5, -.5, 0), (.5, -.5, 0), (.5, .5, 0), (-.5, .5, 0), (-.5, -.5, 1), (.5, -.5, 1), (.5, .5, 1), (-.5, .5, 1)]
        M = TRS(loc, rz, size, rx, ry)
        if sides:
            self.add(m, V, [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], M)
        self.add(top or m, V, [(4, 5, 6, 7)], M)
        if bottom:
            self.add(m, V, [(3, 2, 1, 0)], M)

    def prism(self, m, poly, z0, z1, M=None, top=None, bottom=False, side_mats=None):
        """extrude a CCW 2D polygon (local XY) from z0 to z1."""
        n = len(poly)
        vs = [(x, y, z0) for x, y in poly] + [(x, y, z1) for x, y in poly]
        for i in range(n):
            j = (i + 1) % n
            sm = side_mats[i] if side_mats else m
            self.add(sm, vs, [(i, j, n + j, n + i)], M)
        if top is not False:
            self.add(top or m, vs, [tuple(n + i for i in range(n))], M)
        if bottom:
            self.add(m, vs, [tuple(reversed(range(n)))], M)

    def cbox(self, m, loc, w, d, h, ch, rz=0.0, top=None, chamfer_mat=None):
        """chamfered rectangular prism (octagon footprint)."""
        x, y = w / 2, d / 2
        poly = [(-x + ch, -y), (x - ch, -y), (x, -y + ch), (x, y - ch), (x - ch, y), (-x + ch, y), (-x, y - ch), (-x, -y + ch)]
        sm = None
        if chamfer_mat:
            sm = [m, chamfer_mat, m, chamfer_mat, m, chamfer_mat, m, chamfer_mat]
        self.prism(m, poly, 0, h, TRS(loc, rz), top=top, side_mats=sm)

    def cyl(self, m, loc, r, h, seg=16, r2=None, rz=0.0, rx=0.0, ry=0.0, cap=True, uv_v=False):
        r2 = r if r2 is None else r2
        vs = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            vs += [(r * math.cos(a), r * math.sin(a), 0), (r2 * math.cos(a), r2 * math.sin(a), h)]
        fs, uvs = [], []
        for i in range(seg):
            j = (i + 1) % seg
            fs.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
            uvs.append([(i / seg, 0), ((i + 1) / seg, 0), ((i + 1) / seg, 1), (i / seg, 1)])
        M = TRS(loc, rz, (1, 1, 1), rx, ry)
        self.add(m, vs, fs, M, uvs if uv_v else None)
        if cap:
            self.add(m, vs, [tuple(2 * i for i in reversed(range(seg)))], M)
            if r2 > 1e-4:
                self.add(m, vs, [tuple(2 * i + 1 for i in range(seg))], M)

    def sector(self, center, r0, r1, a0, a1, z0, z1, outer, inner, top, seg=24, bottom=None):
        """annular sector prism (curved walls / tiered roofs). angles in radians."""
        cx, cy = center
        pts = []
        for i in range(seg + 1):
            a = a0 + (a1 - a0) * i / seg
            pts.append((math.cos(a), math.sin(a)))
        V = lambda r, k, z: (cx + r * pts[k][0], cy + r * pts[k][1], z)
        for k in range(seg):
            self.add(outer, [V(r1, k, z0), V(r1, k + 1, z0), V(r1, k + 1, z1), V(r1, k, z1)], [(0, 1, 2, 3)])
            self.add(inner, [V(r0, k + 1, z0), V(r0, k, z0), V(r0, k, z1), V(r0, k + 1, z1)], [(0, 1, 2, 3)])
            self.add(top, [V(r0, k, z1), V(r1, k, z1), V(r1, k + 1, z1), V(r0, k + 1, z1)], [(0, 1, 2, 3)])
            if bottom:
                self.add(bottom, [V(r0, k + 1, z0), V(r1, k + 1, z0), V(r1, k, z0), V(r0, k, z0)], [(0, 1, 2, 3)])
        for k, sgn in ((0, 1), (seg, -1)):
            q = [V(r0, k, z0), V(r1, k, z0), V(r1, k, z1), V(r0, k, z1)]
            self.add(outer, q if sgn < 0 else q[::-1], [(0, 1, 2, 3)])

    def torus(self, m, loc, Rr, r, seg=40, tseg=8, rz=0.0, rx=math.pi / 2, arc=2 * math.pi):
        vs, fs = [], []
        segs = seg if arc >= 2 * math.pi - 1e-6 else seg + 1
        for i in range(segs):
            a = arc * i / seg
            for j in range(tseg):
                b = 2 * math.pi * j / tseg
                vs.append(((Rr + r * math.cos(b)) * math.cos(a), (Rr + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
        for i in range(seg):
            i2 = (i + 1) % segs if arc >= 2 * math.pi - 1e-6 else i + 1
            for j in range(tseg):
                fs.append((i * tseg + j, i2 * tseg + j, i2 * tseg + (j + 1) % tseg, i * tseg + (j + 1) % tseg))
        self.add(m, vs, fs, TRS(loc, rz, (1, 1, 1), rx))

    def sphere(self, m, loc, r, seg=12, rings=8, scale=(1, 1, 1), hemi=False):
        vs = []
        k0 = rings // 2 if hemi else 0
        for k in range(k0, rings + 1):
            ph = -math.pi / 2 + math.pi * k / rings
            for i in range(seg):
                a = 2 * math.pi * i / seg
                vs.append((r * math.cos(ph) * math.cos(a), r * math.cos(ph) * math.sin(a), r * math.sin(ph)))
        fs = []
        nr = rings - k0
        for k in range(nr):
            for i in range(seg):
                a = k * seg + i; b = k * seg + (i + 1) % seg
                fs.append((a, b, b + seg, a + seg))
        if hemi:
            fs.append(tuple(reversed(range(seg))))
        self.add(m, vs, fs, TRS(loc, 0, scale))

    def quad(self, m, center, w, h, rz=0.0, back=None, tilt=0.0):
        """vertical plane facing +Y rotated by rz; uv 0..1 left->right as seen from the front."""
        vs = [(w / 2, 0, -h / 2), (-w / 2, 0, -h / 2), (-w / 2, 0, h / 2), (w / 2, 0, h / 2)]
        M = Matrix.Translation(Vector(center)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(tilt, 4, "X")
        self.add(m, vs, [(0, 1, 2, 3)], M, [[(0, 0), (1, 0), (1, 1), (0, 1)]])
        if back:
            self.add(back, vs, [(3, 2, 1, 0)], M, [[(1, 1), (0, 1), (0, 0), (1, 0)]] if back == m else None)

    def disc(self, m, center, r, seg=40, rz=0.0, rx=0.0, uv=True, mirror=False):
        vs = [(0, 0, 0)] + [(r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), 0) for i in range(seg)]
        fs = [(0, 1 + i, 1 + (i + 1) % seg) for i in range(seg)]
        sg = -1 if mirror else 1
        uvs = [[(0.5, 0.5), (0.5 + sg * 0.5 * math.cos(2 * math.pi * i / seg), 0.5 + 0.5 * math.sin(2 * math.pi * i / seg)),
                (0.5 + sg * 0.5 * math.cos(2 * math.pi * (i + 1) / seg), 0.5 + 0.5 * math.sin(2 * math.pi * (i + 1) / seg))] for i in range(seg)]
        self.add(m, vs, fs, TRS(center, rz, (1, 1, 1), rx), uvs if uv else None)

    def ribbon(self, m, path, z0, z1, back=None):
        """vertical strip along a 2D polyline; u runs 0..1 along its length (for curved lightboxes)."""
        L = [0.0]
        for a, b in zip(path, path[1:]):
            L.append(L[-1] + math.dist(a, b))
        tot = L[-1]
        for k in range(len(path) - 1):
            (x0, y0), (x1, y1) = path[k], path[k + 1]
            u0, u1 = L[k] / tot, L[k + 1] / tot
            vs = [(x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1)]
            self.add(m, vs, [(0, 1, 2, 3)], None, [[(u0, 0), (u1, 0), (u1, 1), (u0, 1)]])
            if back:
                self.add(back, vs, [(3, 2, 1, 0)])

    def text(self, m, s, loc, size, rz=0.0, extrude=0.06, bevel=0.0, font="DejaVuSans-Bold.ttf", flat=False, align="CENTER"):
        cu = bpy.data.curves.new("txt", "FONT")
        cu.body = s; cu.size = size; cu.extrude = extrude; cu.bevel_depth = bevel; cu.bevel_resolution = 1
        cu.font = bpy.data.fonts.load(os.path.join(FONTS, font), check_existing=True)
        cu.align_x = align; cu.align_y = "CENTER"
        o = bpy.data.objects.new("txt", cu); bpy.context.scene.collection.objects.link(o)
        dg = bpy.context.evaluated_depsgraph_get()
        me = o.evaluated_get(dg).to_mesh()
        vs = [tuple(v.co) for v in me.vertices]; fs = [tuple(p.vertices) for p in me.polygons]
        o.evaluated_get(dg).to_mesh_clear(); bpy.data.objects.remove(o); bpy.data.curves.remove(cu)
        M = TRS(loc, rz) if flat else TRS(loc, rz + math.pi, (1, 1, 1), math.pi / 2)   # upright text faces +Y at rz=0
        self.add(m, vs, fs, M)


COLS = []      # collider boxes (world)
EMPTIES = []   # (name, loc, props, coll)


def col_box(loc, size, rz=0.0, rx=0.0, ry=0.0):
    V = [(-.5, -.5, 0), (.5, -.5, 0), (.5, .5, 0), (-.5, .5, 0), (-.5, -.5, 1), (.5, -.5, 1), (.5, .5, 1), (-.5, .5, 1)]
    M = TRS(loc, rz, size, rx, ry)
    COLS.append(([M @ Vector(v) for v in V], [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7), (3, 2, 1, 0)]))


def col_poly(poly, z0, z1):
    n = len(poly)
    vs = [Vector((x, y, z0)) for x, y in poly] + [Vector((x, y, z1)) for x, y in poly]
    fs = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)] + [tuple(n + i for i in range(n)), tuple(reversed(range(n)))]
    COLS.append((vs, fs))


def empty(name, loc, coll="05_GAMEPLAY", **props):
    EMPTIES.append((name, loc, props, coll))


def facing(x, y):
    """rz for a +Y-facing quad at (x, y) to face the origin."""
    return math.atan2(-x, y) + math.pi


H, S, P, F, G = "01_HERO_BUILDINGS", "02_SIGNAGE_AND_ADS", "03_PLAZA_AND_ROADS", "04_PROPS_AND_FOLIAGE", "05_GAMEPLAY"

# district metrics (spec: 4 m lanes, 2-3 m sidewalks, 0.2 m curbs)
PLAZA, IN_SW, ROAD_IN, ROAD_OUT, OUT_SW = 20.0, 23.0, 23.0, 39.0, 42.0
AVE = 8.0          # avenue half-width (4 lanes x 4 m)
CURB = 0.2


# ============================================================================= 03 PLAZA & ROADS
def plaza_and_roads(mode):
    a = Asset("SM_Plaza_CenterBase_01", P)
    a.box("hexpaver", (0, 0, 0), (2 * PLAZA, 2 * PLAZA, CURB), sides=False)
    col_box((0, 0, 0), (2 * IN_SW, 2 * IN_SW, CURB))

    # inner sidewalk ring with neon edge (4 straights + 4 corners)
    for k, rz in enumerate((0, math.pi / 2, math.pi, -math.pi / 2)):
        s = Asset(f"SM_Sidewalk_NeonEdge_Straight_01.{k:03d}", P)
        Rm = Matrix.Rotation(rz, 4, "Z")
        s.add("sidewalk", [(-PLAZA, -IN_SW, CURB), (PLAZA, -IN_SW, CURB), (PLAZA, -PLAZA, CURB), (-PLAZA, -PLAZA, CURB)], [(0, 1, 2, 3)], Rm)
        s.add("concrete", [(-PLAZA, -IN_SW, 0), (PLAZA, -IN_SW, 0), (PLAZA, -IN_SW, CURB), (-PLAZA, -IN_SW, CURB)], [(0, 1, 2, 3)], Rm)
        s.cyl("curb", (0, 0, 0), 0.05, 2 * PLAZA, seg=6, ry=math.pi / 2, cap=False)
        s.parts["curb"].v[-12:] = [Rm @ (Vector((v.x - PLAZA, v.y - IN_SW - 0.02, v.z + 0.1))) for v in s.parts["curb"].v[-12:]]
        c = Asset(f"SM_Sidewalk_NeonEdge_Corner_01.{k:03d}", P)
        c.add("sidewalk", [(PLAZA, -IN_SW, CURB), (IN_SW, -IN_SW, CURB), (IN_SW, -PLAZA, CURB), (PLAZA, -PLAZA, CURB)], [(0, 1, 2, 3)], Rm)
        c.add("concrete", [(PLAZA, -IN_SW, 0), (IN_SW, -IN_SW, 0), (IN_SW, -IN_SW, CURB), (PLAZA, -IN_SW, CURB)], [(0, 1, 2, 3)], Rm)
        c.add("concrete", [(IN_SW, -IN_SW, 0), (IN_SW, -PLAZA, 0), (IN_SW, -PLAZA, CURB), (IN_SW, -IN_SW, CURB)], [(0, 1, 2, 3)], Rm)
        c.box("curb", (0, 0, 0), (0.1, 0.1, 0.1))   # placeholder vertex block replaced below
        c.parts["curb"] = Part()
        for (x0, y0), (x1, y1) in (((PLAZA, -IN_SW - .02), (IN_SW + .02, -IN_SW - .02)), ((IN_SW + .02, -IN_SW - .02), (IN_SW + .02, -PLAZA))):
            c.add("curb", [(x0, y0, 0.06), (x1, y1, 0.06), (x1, y1, 0.14), (x0, y0, 0.14)], [(0, 1, 2, 3)], Rm)

    # outer sidewalk ring (interrupted by the four avenues)
    for k, rz in enumerate((0, math.pi / 2, math.pi, -math.pi / 2)):
        Rm = Matrix.Rotation(rz, 4, "Z")
        for side in (-1, 1):
            s = Asset(f"SM_Sidewalk_NeonEdge_Straight_01.out{k}{'ab'[side > 0]}", P)
            x0, x1 = (AVE, OUT_SW) if side > 0 else (-OUT_SW, -AVE)
            s.add("sidewalk", [(x0, -OUT_SW, CURB), (x1, -OUT_SW, CURB), (x1, -ROAD_OUT, CURB), (x0, -ROAD_OUT, CURB)], [(0, 1, 2, 3)], Rm)
            s.add("concrete", [(x1, -ROAD_OUT, 0), (x0, -ROAD_OUT, 0), (x0, -ROAD_OUT, CURB), (x1, -ROAD_OUT, CURB)], [(0, 1, 2, 3)], Rm)
            s.add("curb", [(x1, -ROAD_OUT + .02, 0.06), (x0, -ROAD_OUT + .02, 0.06), (x0, -ROAD_OUT + .02, 0.14), (x1, -ROAD_OUT + .02, 0.14)], [(0, 1, 2, 3)], Rm)
            # avenue sidewalk return
            cx = AVE if side > 0 else -AVE
            s.add("concrete", [(cx, -ROAD_OUT, 0), (cx, -OUT_SW, 0), (cx, -OUT_SW, CURB), (cx, -ROAD_OUT, CURB)] if side > 0 else
                  [(cx, -OUT_SW, 0), (cx, -ROAD_OUT, 0), (cx, -ROAD_OUT, CURB), (cx, -OUT_SW, CURB)], [(0, 1, 2, 3)], Rm)
            p0 = Rm @ Vector(((x0 + x1) / 2, -(OUT_SW + ROAD_OUT) / 2, 0))
            col_box(tuple(p0), (abs(x1 - x0), OUT_SW - ROAD_OUT, CURB), rz)

    # road markings: dashed lane dividers on the ring, skipping the intersections
    rm = Asset("SM_Road_Straight_4m", P)
    for rz in (0, math.pi / 2, math.pi, -math.pi / 2):
        Rm = Matrix.Rotation(rz, 4, "Z")
        for lane in (27.0, 31.0, 35.0):
            x = -ROAD_OUT
            while x < ROAD_OUT:
                if not (-AVE - 3.2 < x < AVE + 3.2) and abs(x) < lane - 1.5:
                    rm.add("paint_white" if lane != 31 else "paint_yellow",
                           [(x, -lane - 0.08, 0.012), (x + 2, -lane - 0.08, 0.012), (x + 2, -lane + 0.08, 0.012), (x, -lane + 0.08, 0.012)], [(0, 1, 2, 3)], Rm)
                x += 4
        # stop lines before crosswalks
        for sx in (-1, 1):
            x = sx * (AVE + 3.4)
            rm.add("paint_white", [(x - .2, -ROAD_OUT, 0.012), (x + .2, -ROAD_OUT, 0.012), (x + .2, -ROAD_IN, 0.012), (x - .2, -ROAD_IN, 0.012)], [(0, 1, 2, 3)], Rm)

    # 4-way zebra crosswalks at each ring/avenue intersection
    for k, rz in enumerate((0, math.pi / 2, math.pi, -math.pi / 2)):
        cw = Asset(f"SM_Road_Crosswalk_4Way_01.{k:03d}", P)
        Rm = Matrix.Rotation(rz, 4, "Z")
        for sx in (-1, 1):      # across the ring road
            xa, xb = sorted((sx * AVE * 1.04, sx * (AVE + 3)))
            y = -ROAD_OUT + 0.4
            while y < -ROAD_IN - 0.4:
                cw.add("paint_white", [(xa, y, 0.014), (xb, y, 0.014), (xb, y + 0.5, 0.014), (xa, y + 0.5, 0.014)], [(0, 1, 2, 3)], Rm)
                y += 1.0
        x = -AVE + 0.3        # across the avenue mouth
        while x < AVE - 0.3:
            cw.add("paint_white", [(x, -OUT_SW + 0.3, 0.014), (x + 0.5, -OUT_SW + 0.3, 0.014), (x + 0.5, -ROAD_OUT - 0.3, 0.014), (x, -ROAD_OUT - 0.3, 0.014)], [(0, 1, 2, 3)], Rm)
            x += 1.0

    if mode == "blend":   # standalone ground (the game world provides its own)
        g = Asset("SM_Road_Ground", P)
        g.add("asphalt", [(-90, -90, 0), (90, -90, 0), (90, 90, 0), (-90, 90, 0)], [(0, 1, 2, 3)])
        for rz in (0, math.pi / 2, math.pi, -math.pi / 2):
            Rm = Matrix.Rotation(rz, 4, "Z")
            for sx in (-1, 1):
                x0, x1 = sorted((sx * AVE, sx * (AVE + 3)))
                g.add("sidewalk", [(x0, -90, CURB), (x1, -90, CURB), (x1, -OUT_SW, CURB), (x0, -OUT_SW, CURB)], [(0, 1, 2, 3)], Rm)
                g.add("curb", [(x0 if sx > 0 else x1, -90, 0.14), (x0 if sx > 0 else x1, -OUT_SW, 0.14),
                                       (x0 if sx > 0 else x1, -OUT_SW, 0.06), (x0 if sx > 0 else x1, -90, 0.06)], [(0, 1, 2, 3)], Rm)


# ============================================================================= 01 HERO: center hub
def center_hub():
    a = Asset("SM_BagSquare_CenterHub_01", H, origin=(0, 0, CURB))
    z0 = CURB
    pl = 0.25
    diamond = [(0, -12), (12, 0), (0, 12), (-12, 0)]
    a.prism("hull", diamond, z0, z0 + pl, top="hexpaver")
    col_poly(diamond, 0, z0 + pl)
    zt = z0 + pl
    # magenta perimeter trim
    for (x0, y0), (x1, y1) in zip(diamond, diamond[1:] + diamond[:1]):
        L = math.dist((x0, y0), (x1, y1)); ang = math.atan2(y1 - y0, x1 - x0)
        a.box("neon_magenta", ((x0 + x1) / 2, (y0 + y1) / 2, zt), (L, 0.18, 0.05), ang)
        a.box("neon_magenta", ((x0 + x1) / 2, (y0 + y1) / 2, z0), (L + .2, 0.12, 0.08), ang)
    # recessed cyan floor tracks converging to the center
    for x, y in diamond + [(6, -6), (6, 6), (-6, 6), (-6, -6)]:
        L = math.hypot(x, y) - 1.6; ang = math.atan2(y, x)
        c = Vector((x, y, 0)).normalized() * (1.6 + L / 2)
        a.box("neon_cyan", (c.x, c.y, zt - 0.01), (L, 0.2, 0.03), ang)
    a.torus("neon_cyan", (0, 0, zt + 0.02), 1.6, 0.06, seg=40, tseg=6, rx=0)
    a.torus("neon_magenta", (0, 0, zt + 0.02), 2.3, 0.05, seg=48, tseg=6, rx=0)
    a.disc("gold_glow", (0, 0, zt + 0.015), 1.2, seg=32, uv=False)

    # split-wing curved pavilion (west + east wings framing a 6 m N-S avenue)
    H1 = 4.2
    for a0, a1 in ((math.radians(108), math.radians(252)), (math.radians(-72), math.radians(72))):
        a.sector((0, 0), 6.2, 10.4, a0, a1, zt, zt + H1, outer="hull", inner="storefront", top="hull", seg=28)
        # stepped tiered roof overhangs with inset neon strips
        tiers = ((5.6, 11.3, H1, H1 + 0.45), (6.1, 10.6, H1 + 0.45, H1 + 1.0), (6.8, 9.8, H1 + 1.0, H1 + 1.7))
        for r0, r1, za, zb in tiers:
            a.sector((0, 0), r0, r1, a0 - 0.04, a1 + 0.04, zt + za, zt + zb, outer="hull", inner="hull", top="hull", seg=28, bottom="hull")
            a.sector((0, 0), r1 - 0.02, r1 + 0.04, a0 - 0.04, a1 + 0.04, zt + za + 0.12, zt + za + 0.22, outer="neon_magenta", inner="neon_magenta", top="neon_magenta", seg=28)
            a.sector((0, 0), r0 - 0.04, r0 + 0.02, a0 - 0.04, a1 + 0.04, zt + za + 0.12, zt + za + 0.22, outer="neon_cyan", inner="neon_cyan", top="neon_cyan", seg=28)
        # storefront mullions on the inner curve
        for i in range(9):
            ang = a0 + (a1 - a0) * (i + 0.5) / 9
            p = Vector((math.cos(ang), math.sin(ang), 0)) * 6.15
            a.box("darkmetal", (p.x, p.y, zt), (0.18, 0.18, H1), ang)
        # colliders along the arc
        for i in range(10):
            t0 = a0 + (a1 - a0) * i / 10; t1 = a0 + (a1 - a0) * (i + 1) / 10
            tm = (t0 + t1) / 2; rr = 8.3
            col_box((math.cos(tm) * rr, math.sin(tm) * rr, 0), (4.4, 2 * rr * math.sin((t1 - t0) / 2) + 0.4, zt + H1 + 1.7), tm)
    # holo gateway arches at the avenue ends
    for y in (-11.0, 11.0):
        a.torus("neon_cyan", (0, y, zt), 3.4, 0.09, seg=24, tseg=6, rz=0, rx=math.pi / 2, arc=math.pi)
        a.torus("neon_magenta", (0, y, zt), 3.75, 0.05, seg=24, tseg=6, rz=0, rx=math.pi / 2, arc=math.pi)
        for sx in (-1, 1):
            a.cyl("darkmetal", (sx * 3.6, y, zt), 0.22, 0.4, seg=8)
    empty("ZONE_bag_square", (0, 0, 0), label="THE BAG SQUARE", radius=22, color="#b06bff")


# ============================================================================= 01 HERO: central tower + spires + skybridge
TOWER_Y = 53.0


def central_tower():
    cx, cy = 0.0, TOWER_Y
    a = Asset("SM_Skyscraper_CentralTower_01", H, origin=(cx, cy, 0))
    # lobby podium (glass) + canopy
    a.cbox("glass_dark", (cx, cy, 0), 13, 13, 6, 2.0, top="hull")
    a.box("hull", (cx, cy - 7.4, 5.4), (14, 3, 0.4))
    a.box("neon_cyan", (cx, cy - 8.9, 5.35), (14, 0.08, 0.1))
    # main shaft: chamfered 12 x 12 to 48 m, curtain wall + steel chamfers
    a.cbox("curtain", (cx, cy, 6), 12, 12, 40, 1.5, top="hull", chamfer_mat="steel")
    # recessed vertical mullions (fins) on all four faces
    for rz in (0, math.pi / 2, math.pi, -math.pi / 2):
        Rm = Matrix.Rotation(rz, 3, "Z")
        for k in range(-3, 4):
            p = Rm @ Vector((k * 1.5, -6.05, 0))
            a.box("steel", (cx + p.x, cy + p.y, 6), (0.14, 0.35, 40), rz)
    # crown setbacks + mechanical + antenna
    a.cbox("steel", (cx, cy, 46), 10.4, 10.4, 1.4, 1.2, top="hull")
    a.cbox("hull", (cx, cy, 47.4), 8, 8, 0.6, 1.0)
    a.box("neon_cyan", (cx, cy - 5.25, 46.6), (8.2, 0.1, 0.12))
    a.cyl("darkmetal", (cx, cy, 48), 0.35, 8, seg=8, r2=0.1)
    a.sphere("neon_red", (cx, cy, 56.1), 0.35, seg=8, rings=6)
    col_box((cx, cy, 0), (13, 13, 48))
    empty("ZONE_central_tower", (cx, cy, 0), label="TPL MEDIA TOWER", radius=9, color="#00f0ff")

    # billboard stack: mounting rails + 5 screens (header / crest / token / side panel / ad slot)
    fy = cy - 6.0
    for sx in (-4.6, 4.6):
        a.box("darkmetal", (cx + sx, fy - 0.35, 12), (0.3, 0.6, 33))
    for z in (12.6, 20.5, 30.0, 39.0, 44.6):
        a.box("darkmetal", (cx, fy - 0.35, z), (9.6, 0.5, 0.25))
    sig = Asset("SM_Sign_CentralTower_Stack_01", S, origin=(cx, fy - 0.7, 30))
    sig.box("darkmetal", (cx, fy - 0.62, 39.6), (10.4, 0.25, 4.6))
    sig.quad("screen_tpl", (cx, fy - 0.76, 41.9), 10, 4, math.pi)
    sig.box("darkmetal", (cx, fy - 0.62, 30.6), (7.4, 0.25, 7.6))
    sig.quad("screen_crest", (cx, fy - 0.76, 34.4), 7, 7, math.pi)
    sig.cyl("darkmetal", (cx, fy - 0.5, 25.5), 3.7, 0.25, seg=40, rx=math.pi / 2)
    sig.disc("screen_token", (cx, fy - 0.77, 25.5), 3.5, seg=48, rx=math.pi / 2, rz=math.pi, mirror=True)
    sig.torus("neon_purple", (cx, fy - 0.78, 25.5), 3.62, 0.08, seg=48, tseg=6, rz=0)
    # angled side-protruding magenta panel on the east face
    ex = cx + 6.0
    sig.box("darkmetal", (ex + 0.4, fy + 3.0, 24.5), (0.8, 0.3, 0.3))
    sig.box("darkmetal", (ex + 0.4, fy + 3.0, 33.7), (0.8, 0.3, 0.3))
    p = Vector((ex + 1.2, fy + 2.4, 29.3))
    sig.quad("screen_side", tuple(p), 3.0, 9.6, math.radians(150))
    sig.quad("darkmetal", tuple(p + Vector((0.05, 0.08, 0))), 3.1, 9.7, math.radians(150) + math.pi)
    # ad slot (game-rentable) at the bottom of the stack
    bb = Asset("BB_01", S, keep=True, props={"aspect": "16:9", "slot": 1, "tier": "tower"})
    bb.quad("screen_off", (cx, fy - 0.78, 15.4), 8.6, 4.84, math.pi)
    a.box("darkmetal", (cx, fy - 0.62, 12.8), (9.2, 0.25, 5.3))
    bb2 = Asset("BB_15", S, keep=True, props={"aspect": "16:9", "slot": 15, "tier": "podium"})
    bb2.quad("screen_off", (cx, cy - 8.95, 3.3), 6.4, 3.6, math.pi)


def spire(side):
    cx, cy = side * 17.0, TOWER_Y
    name = "SM_Skyscraper_Spire_L_01" if side < 0 else "SM_Skyscraper_Spire_R_01"
    a = Asset(name, H, origin=(cx, cy, 0))
    tiers = ((10.0, 0.0, 24.0), (8.0, 24.0, 31.0), (6.0, 31.0, 35.5), (4.0, 35.5, 38.0))
    for i, (w, z0, z1) in enumerate(tiers):
        a.box("deco", (cx, cy, z0), (w, w, z1 - z0), top="concrete")
        # art-deco corner piers + setback cornice
        for sx in (-1, 1):
            for sy in (-1, 1):
                a.box("concrete", (cx + sx * (w / 2 - 0.2), cy + sy * (w / 2 - 0.2), z0), (0.7, 0.7, z1 - z0 + 0.4))
        a.box("concrete", (cx, cy, z1 - 0.1), (w + 0.4, w + 0.4, 0.3))
        a.box("neon_magenta", (cx, cy - w / 2 - 0.21, z1 - 0.05), (w * 0.8, 0.04, 0.12))
        # vertical grooves (geometry) on the two street-facing faces
        for k in range(-2, 3):
            if w >= 6:
                a.box("concrete", (cx + k * w / 6, cy - w / 2 - 0.12, z0), (0.22, 0.25, z1 - z0))
        # satellite dishes on setbacks
        if i in (1, 2):
            for sx in (-1, 1):
                d = Vector((cx + sx * (w / 2 + 0.6), cy + 0.8, z0 + 0.1))
                a.cyl("darkmetal", tuple(d), 0.08, 0.9, seg=6)
                a.sphere("paint_white", (d.x, d.y, d.z + 1.2), 0.7, seg=12, rings=8, scale=(1, 0.35, 1), hemi=False)
    # needle spire with vertical gradient emission
    a.cyl("spire_grad", (cx, cy, 38.0), 1.0, 6.2, seg=12, r2=0.04, uv_v=True)
    a.torus("neon_magenta", (cx, cy, 38.15), 1.05, 0.08, seg=24, tseg=6, rx=0)
    a.sphere("neon_magenta", (cx, cy, 44.25), 0.18, seg=8, rings=5)
    col_box((cx, cy, 0), (10, 10, 38))
    if side < 0:   # side-mounted vertical ad screens (rentable)
        for k, (ox, slot) in enumerate(((-2.3, 2), (2.3, 3))):
            bb = Asset(f"BB_{slot:02d}", S, keep=True, props={"aspect": "9:16", "slot": slot, "tier": "spire"})
            bb.quad("screen_off", (cx + ox, cy - 5.5, 15.2), 3.4, 6.04, math.pi)
            a.box("darkmetal", (cx + ox, cy - 5.3, 11.9), (3.8, 0.4, 6.6))
            a.box("neon_magenta", (cx + ox, cy - 5.52, 11.9), (3.8, 0.06, 0.1))
            a.box("neon_magenta", (cx + ox, cy - 5.52, 18.4), (3.8, 0.06, 0.1))
    else:
        bb = Asset("BB_04", S, keep=True, props={"aspect": "9:16", "slot": 4, "tier": "spire"})
        bb.quad("screen_off", (cx, cy - 5.5, 15.2), 3.4, 6.04, math.pi)
        a.box("darkmetal", (cx, cy - 5.3, 11.9), (3.8, 0.4, 6.6))


def skybridge():
    a = Asset("SM_Skybridge_Magenta_01", H, origin=(9, TOWER_Y, 30))
    x0, x1, y0, y1, z0, z1 = 6.0, 12.0, TOWER_Y - 2.2, TOWER_Y + 2.2, 30.0, 33.0
    a.box("hull", ((x0 + x1) / 2, TOWER_Y, z0 - 0.4), (x1 - x0, y1 - y0, 0.4))
    a.box("glass_magenta", ((x0 + x1) / 2, TOWER_Y, z0), (x1 - x0, y1 - y0, z1 - z0))
    for y in (y0, y1):
        for z in (z0, z1):
            a.box("neon_magenta", ((x0 + x1) / 2, y, z - 0.06), (x1 - x0, 0.12, 0.12))
    for x in (7.5, 9.0, 10.5):
        a.box("darkmetal", (x, y0, z0), (0.12, 0.12, z1 - z0)); a.box("darkmetal", (x, y1, z0), (0.12, 0.12, z1 - z0))


# ============================================================================= 01 HERO: Ad Canyon complex
def ad_canyon():
    a = Asset("SM_AdCanyon_Complex_01", H, origin=(-50, 23, 0))
    # block A with curved SE corner wrapping the intersection
    arc = [(-46 + 4 * math.cos(t), 16 + 4 * math.sin(t)) for t in [-math.pi / 2 + i * (math.pi / 2) / 8 for i in range(9)]]
    polyA = [(-54, 12)] + arc + [(-42, 22), (-54, 22)]
    a.prism("brick", polyA, 0, 32, top="concrete")
    col_poly(polyA, 0, 32)
    polyB = [(-58, 22), (-46, 22), (-46, 34), (-58, 34)]
    a.prism("brick", polyB, 0, 24, top="concrete"); col_poly(polyB, 0, 24)
    polyC = [(-46, 22), (-42, 22), (-42, 34), (-46, 34)]
    a.prism("brick", polyC, 0, 14, top="concrete"); col_poly(polyC, 0, 14)
    # coping / cornices
    for poly, h in ((polyA, 32), (polyB, 24), (polyC, 14)):
        n = len(poly)
        for i in range(n):
            (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
            L = math.dist((x0, y0), (x1, y1)); ang = math.atan2(y1 - y0, x1 - x0)
            if L < 0.01:
                continue
            nx, ny = math.sin(ang), -math.cos(ang)
            a.box("darkmetal", ((x0 + x1) / 2 + nx * 0.15, (y0 + y1) / 2 + ny * 0.15, h - 0.6), (L + 0.3, 0.5, 0.8), ang)
            a.box("concrete", ((x0 + x1) / 2 + nx * 0.1, (y0 + y1) / 2 + ny * 0.1, 4.4), (L + 0.2, 0.35, 0.35), ang)

    # window bands per floor on the street-facing faces (south + east + corner)
    def windows_along(path, zfrom, zto, floor=3.6, out=0.04):
        z = zfrom
        while z + 2.0 <= zto:
            for (x0, y0), (x1, y1) in zip(path, path[1:]):
                L = math.dist((x0, y0), (x1, y1)); ang = math.atan2(y1 - y0, x1 - x0)
                nx, ny = math.sin(ang), -math.cos(ang)
                if L > 0.4:
                    a.add("curtain", [(x0 + nx * out, y0 + ny * out, z), (x1 + nx * out, y1 + ny * out, z),
                                      (x1 + nx * out, y1 + ny * out, z + 2.1), (x0 + nx * out, y0 + ny * out, z + 2.1)], [(0, 1, 2, 3)])
            z += floor
    windows_along([(-53.2, 12)] + arc + [(-42, 21.4)], 5.4, 31)
    windows_along([(-42, 22.6), (-42, 33.4)], 5.4, 13.5)
    windows_along([(-46, 22.2), (-46, 33.6)], 15.4, 23.5)   # B's east face above the annex
    windows_along([(-57.6, 22), (-54.2, 22)], 5.4, 23.5)

    # ground-floor storefronts (fake-interior glow) with frames + awnings
    def storefront(x0, y0, x1, y1, bays):
        L = math.dist((x0, y0), (x1, y1)); ang = math.atan2(y1 - y0, x1 - x0)
        nx, ny = math.sin(ang), -math.cos(ang)
        for b in range(bays):
            t0, t1 = b / bays, (b + 1) / bays
            p0 = (x0 + (x1 - x0) * t0 + nx * 0.05, y0 + (y1 - y0) * t0 + ny * 0.05)
            p1 = (x0 + (x1 - x0) * t1 + nx * 0.05, y0 + (y1 - y0) * t1 + ny * 0.05)
            a.add("storefront", [(p0[0], p0[1], 0.3), (p1[0], p1[1], 0.3), (p1[0], p1[1], 3.6), (p0[0], p0[1], 3.6)], [(0, 1, 2, 3)],
                  uvs=[[(0, 0), (1, 0), (1, 1), (0, 1)]])
            a.box("darkmetal", (p0[0] + nx * 0.05, p0[1] + ny * 0.05, 0), (0.25, 0.25, 4.0), ang)
            awn = R.choice(["neon_magenta", "neon_cyan", "neon_purple"])
            mid = ((p0[0] + p1[0]) / 2 + nx * 0.8, (p0[1] + p1[1]) / 2 + ny * 0.8)
            a.box("hull", (mid[0], mid[1], 3.85), (L / bays - 0.3, 1.6, 0.12), ang, rx=-0.25 if False else 0)
            a.box(awn, (mid[0] + nx * 0.8, mid[1] + ny * 0.8, 3.78), (L / bays - 0.3, 0.06, 0.12), ang)
        a.box("darkmetal", (x1 + nx * 0.1, y1 + ny * 0.1, 0), (0.25, 0.25, 4.0), ang)
        a.box("darkmetal", ((x0 + x1) / 2 + nx * 0.1, (y0 + y1) / 2 + ny * 0.1, 3.6), (L, 0.3, 0.3), ang)
    storefront(-53.5, 12, -46.2, 12, 2)
    storefront(-42, 16.3, -42, 21.8, 1)
    storefront(-42, 22.4, -42, 33.6, 2)

    # rooftop HVAC units
    for (x, y, z) in ((-50, 17, 32), (-47.5, 19.5, 32), (-55, 27, 24), (-50, 31, 24), (-44, 28, 14)):
        a.box("steel", (x, y, z), (2.2, 1.6, 1.2), top="hull")
        a.cyl("darkmetal", (x - 0.45, y, z + 1.2), 0.5, 0.15, seg=14)
        a.cyl("darkmetal", (x + 0.55, y, z + 1.2), 0.5, 0.15, seg=14)
        a.box("darkmetal", (x, y - 1.2, z), (0.3, 0.8, 0.8))
    a.cyl("steel", (-56, 24, 24), 0.25, 3.5, seg=8)
    # exterior scaffolding on A's south face (upper floors)
    sc = Asset("SM_AdCanyon_Scaffold_01", H, origin=(-51, 10.6, 16))
    y0 = 10.8
    for x in (-53.6, -51.6, -49.6, -47.6):
        sc.cyl("paint_yellow", (x, y0, 14), 0.05, 16, seg=6)
        sc.cyl("paint_yellow", (x, y0 + 1.0, 14), 0.05, 16, seg=6)
    for z in range(14, 31, 2):
        sc.box("paint_yellow", (-50.6, y0, z), (6.2, 0.08, 0.08))
        sc.box("paint_yellow", (-50.6, y0 + 1.0, z), (6.2, 0.08, 0.08))
        if z % 4 == 2:
            sc.box("hull", (-50.6, y0 + 0.5, z), (6.2, 1.1, 0.06))
    for k in range(3):
        sc.box("paint_yellow", (-52.6 + k * 2, y0, 14 + k * 2 + 1), (0.08, 0.08, 2.9), ry=0.7)
    for x in (-52.4, -48.8):   # ground hazard barriers
        hz = Asset(f"SM_Prop_Barrier_Hazard_01.{int(-x)}", F)
        hz.box("hazard", (x, 9.4, 0.7), (1.8, 0.12, 0.35))
        for sx in (-0.75, 0.75):
            hz.box("darkmetal", (x + sx, 9.4, 0), (0.08, 0.6, 0.75), ry=0)
        col_box((x, 9.4, 0), (1.8, 0.6, 1.0))

    # ---------------- signage (02_SIGNAGE_AND_ADS)
    ban = Asset("SM_Sign_AdCanyon_Banner_01", S, origin=(-43.3, 13.3, 5.7))
    path = [(-49.5, 11.6)] + [(-46 + 4.4 * math.cos(t), 16 + 4.4 * math.sin(t)) for t in [-math.pi / 2 + i * (math.pi / 2) / 10 for i in range(11)]] + [(-41.6, 19.5)]
    ban.ribbon("sign_adcanyon", path, 4.7, 6.9)
    back = [(x + 0.0, y) for x, y in path]
    for (x0, y0), (x1, y1) in zip(back, back[1:]):
        L = math.dist((x0, y0), (x1, y1)); ang = math.atan2(y1 - y0, x1 - x0)
        nx, ny = math.sin(ang), -math.cos(ang)
        ban.box("darkmetal", ((x0 + x1) / 2 - nx * 0.2, (y0 + y1) / 2 - ny * 0.2, 4.55), (L + 0.05, 0.35, 2.5), ang)
    ta = Asset("SM_Sign_Billboard_Tall_A", S, origin=(-40.5, 19.6, 13.5))
    ta.quad("sign_adr", (-40.4, 19.6 - 0.06, 13.5), 2.8, 8.4, 0, back="sign_adr")
    ta.box("darkmetal", (-40.4, 19.6, 9.1), (3.0, 0.1, 0.2)); ta.box("darkmetal", (-40.4, 19.6, 17.8), (3.0, 0.1, 0.2))
    for z in (10, 17):
        ta.box("darkmetal", (-41.6, 19.6, z), (0.8, 0.12, 0.12))
    tb = Asset("SM_Sign_Billboard_Tall_B", S, origin=(-42, 34, 8.3))
    tb.quad("sign_corner", (-41.85, 32.85, 8.3), 2.2, 6.6, -math.pi / 2)        # east face
    tb.quad("sign_corner", (-43.15, 34.15, 8.3), 2.2, 6.6, 0)                   # north face
    tb.box("darkmetal", (-42, 34, 4.8), (0.4, 0.4, 7.2))
    tc = Asset("SM_Sign_Billboard_Tall_C", S, origin=(-41.7, 28.3, 8.3))
    tc.quad("sign_ticker", (-41.75, 28.3, 8.3), 2.5, 7.5, -math.pi / 2)
    tc.box("darkmetal", (-41.95, 28.3, 4.4), (0.2, 2.7, 0.2)); tc.box("darkmetal", (-41.95, 28.3, 12.1), (0.2, 2.7, 0.2))
    for slot, c, z, w in ((5, (-45.7, 28.0), 18.6, 8.6), (6, (-41.7, 17.0), 26.0, 7.2)):
        bb = Asset(f"BB_{slot:02d}", S, keep=True, props={"aspect": "16:9", "slot": slot, "tier": "canyon"})
        bb.quad("screen_off", (c[0], c[1], z), w, w * 9 / 16, -math.pi / 2)
        a.box("darkmetal", (c[0] - 0.15, c[1], z - w * 9 / 32 - 0.3), (0.25, w + 0.5, w * 9 / 16 + 0.6))
    empty("ZONE_ad_canyon", (-50, 23, 0), label="THE AD CANYON", radius=16, color="#00f0ff")


# ============================================================================= 01 HERO: RWA Vault
def rwa_vault():
    a = Asset("SM_RWAVault_Main_01", H, origin=(51, 22, 0))
    # stepped plinth + magenta underglow
    a.box("marble", (51.25, 22, 0), (17.5, 20, 1.2))
    for k, (x0, zt) in enumerate(((39.5, 0.4), (40.5, 0.8), (41.5, 1.2))):
        a.box("marble", ((x0 + 42.5) / 2, 22, 0), (42.5 - x0, 14, zt))
    for (cx, cy, w, d) in ((51.25, 11.9, 17.6, 0.12), (51.25, 32.1, 17.6, 0.12), (60.05, 22, 0.12, 20.1)):
        a.box("neon_magenta", (cx, cy, 0.04), (w, d, 0.1))
    a.box("neon_magenta", (39.4, 22, 0.04), (0.12, 14.2, 0.1))
    col_box((51.25, 22, 0), (17.5, 20, 1.2))
    col_box((41.0, 22, -0.6), (3.6, 14, 1.0), ry=-0.36)    # walkable ramp over the steps
    # hollow hall: walls with a grand door opening + tall windows
    z0, z1, t = 1.2, 11.4, 0.6
    a.box("marble_ashlar", (59.7, 22, z0), (t, 18, z1 - z0))                       # east
    a.box("marble_ashlar", (53.0, 30.7, z0), (14, t, z1 - z0))                     # north
    a.box("marble_ashlar", (53.0, 13.3, z0), (14, t, z1 - z0))                     # south
    a.box("marble_ashlar", (46.3, 16.5, z0), (t, 7.6, z1 - z0))                    # west (left of door)
    a.box("marble_ashlar", (46.3, 27.5, z0), (t, 7.6, z1 - z0))                    # west (right of door)
    a.box("marble_ashlar", (46.3, 22, 8.2), (t, 3.6, z1 - 8.2))                    # lintel
    for c in ((59.7, 22, 18, t), (53.0, 30.7, 14, t), (53.0, 13.3, 14, t)):
        pass
    col_box((59.7, 22, z0), (t, 18, z1)); col_box((53, 30.7, z0), (14, t, z1)); col_box((53, 13.3, z0), (14, t, z1))
    col_box((46.3, 16.5, z0), (t, 7.6, z1)); col_box((46.3, 27.5, z0), (t, 7.6, z1)); col_box((46.3, 22, 8.2), (t, 3.6, 4))
    a.box("marble", (53, 22, z0 - 0.02), (13.2, 17.2, 0.04), sides=False)
    a.box("hull", (53, 22, z1), (14.2, 18.2, 0.6))
    a.add("warm_light", [(48, 15, z1 - 0.02), (58.8, 15, z1 - 0.02), (58.8, 29, z1 - 0.02), (48, 29, z1 - 0.02)][::-1], [(0, 1, 2, 3)])
    # gold door frame + warm spill
    a.box("gold", (45.95, 22, 1.2), (0.25, 4.4, 0.35))
    for sy in (-1, 1):
        a.box("gold", (45.95, 22 + sy * 2.05, 1.2), (0.3, 0.3, 7.0))
    a.box("gold", (45.95, 22, 8.0), (0.3, 4.4, 0.35))
    a.add("warm_light", [(46.9, 20.2, 1.25), (46.9, 23.8, 1.25), (46.9, 23.8, 7.9), (46.9, 20.2, 7.9)][::-1], [(0, 1, 2, 3)])
    # tall vertical windows: gold interior bounce
    for (x, y, rz) in ((45.98, 16.6, math.pi / 2), (45.98, 27.4, math.pi / 2)):
        a.quad("warm_light", (x, y, 5.4), 1.4, 6.0, rz)
        a.box("gold", (x - 0.05, y, 2.25), (0.15, 1.7, 0.2)); a.box("gold", (x - 0.05, y, 8.4), (0.15, 1.7, 0.2))
    for x in (49.5, 53.0, 56.5):
        a.quad("warm_light", (x, 12.98, 5.4), 1.4, 6.0, math.pi)
        a.quad("warm_light", (x, 31.02, 5.4), 1.4, 6.0, 0)
    # recessed portico: 4 fluted Doric columns
    for y in (15.2, 18.6, 25.4, 28.8):
        x = 43.4
        flutes = 20
        poly = []
        for i in range(flutes * 2):
            ang = 2 * math.pi * i / (flutes * 2)
            rr = 0.72 if i % 2 == 0 else 0.66
            poly.append((math.cos(ang) * rr, math.sin(ang) * rr))
        a.prism("marble", poly, 1.55, 9.9, TRS((x, y, 0)), top=False)
        a.box("marble", (x, y, 1.2), (1.9, 1.9, 0.35))                      # base plinth
        a.cyl("marble", (x, y, 9.9), 0.72, 0.35, seg=24, r2=0.95)          # echinus
        a.box("marble", (x, y, 10.25), (2.1, 2.1, 0.35))                    # abacus
        col_box((x, y, 1.2), (1.5, 1.5, 9.4))
    # entablature + frieze
    a.box("marble", (44.5, 22, 10.6), (4.2, 19.2, 0.7))
    a.box("marble_ashlar", (44.5, 22, 11.3), (4.2, 19.2, 1.1))
    a.box("hull", (46.5, 22, 1.18), (0.2, 19, 0.04), sides=False)
    # thick stepped cornice + attic
    for (dx, z, h) in ((0.4, 12.4, 0.5), (0.9, 12.9, 0.45), (0.3, 13.35, 0.5)):
        a.box("marble", (51.0, 22, z), (18.4 + 2 * dx, 19.4 + 2 * dx, h))
    a.box("marble_ashlar", (51.6, 22, 13.85), (16.4, 17.4, 1.2), top="concrete")
    # circular recessed rooftop emblem basin + 8 m coin with extruded B-symbol
    cx, cy = 51.6, 22.0
    a.sector((cx, cy), 4.25, 4.75, 0, 2 * math.pi, 14.4, 15.15, outer="marble", inner="marble", top="marble", seg=48)
    a.disc("darkmetal", (cx, cy, 14.6), 4.3, seg=48, uv=False)
    coin = Asset("SM_Sign_RWAVault_BTCCoin_01", S, origin=(cx, cy, 14.8))
    coin.cyl("gold", (cx, cy, 14.62), 4.0, 0.3, seg=64)
    coin.torus("gold_glow", (cx, cy, 14.92), 3.75, 0.1, seg=64, tseg=8, rx=0)
    coin.text("gold_glow", "₿", (cx, cy, 14.92), 5.0, rz=math.radians(90), extrude=0.12, bevel=0.03, font="Inter-Bold.otf", flat=True)
    # frieze letters
    let = Asset("SM_Sign_RWAVault_Letters_01", S, origin=(42.3, 22, 11.85))
    let.text("gold", "THE RWA VAULT", (42.28, 22, 11.85), 0.95, rz=math.pi / 2, extrude=0.08, bevel=0.015, font="DejaVuSerif-Bold.ttf")
    # interior showroom: pedestals + hologram anchors
    for i, (px, py) in enumerate(((54.5, 17.5), (56.0, 22.0), (54.5, 26.5)), start=1):
        a.cyl("marble", (px, py, z0), 0.9, 1.1, seg=24)
        a.cyl("gold", (px, py, z0 + 1.1), 0.95, 0.08, seg=24)
        a.disc("neon_cyan", (px, py, z0 + 1.19), 0.8, seg=24, uv=False)
        col_box((px, py, z0), (1.8, 1.8, 1.2))
        empty(f"HOLO_{i}", (px, py, z0 + 2.4), slot=i)
    a.text("gold_glow", "RWA", (52.5, 22, z0 + 0.03), 1.6, rz=-math.pi / 2, extrude=0.01, flat=True)
    empty("ZONE_rwa_vault", (51, 22, 0), label="THE RWA VAULT SHOWROOM", radius=12, color="#ffb800")
    # lollipop trees + shrubs around the perimeter
    for x in (45.5, 49.5, 53.5, 57.5):
        for y in (9.6, 34.4):
            tree(x, y, 0.95)
    for x in (47.5, 51.5, 55.5):
        for y in (9.6, 34.4):
            shrub(x, y)


# ============================================================================= 01 HERO: South crystal monument
def south_crystal():
    cx, cy = 0.0, -(ROAD_IN + ROAD_OUT) / 2
    a = Asset("SM_LMK_SouthCrystal_01", H, origin=(cx, cy, 0))
    hexp = lambda r: [(math.cos(math.pi / 6 + i * math.pi / 3) * r, math.sin(math.pi / 6 + i * math.pi / 3) * r) for i in range(6)]
    for r, z0, z1 in ((4.0, 0, 0.6), (3.3, 0.6, 1.2), (2.6, 1.2, 1.8)):
        a.prism("concrete", hexp(r), z0, z1, TRS((cx, cy, 0)), top="concrete")
        a.prism("neon_magenta", hexp(r + 0.03), z1 - 0.12, z1 - 0.04, TRS((cx, cy, 0)), top=False)
    col_box((cx, cy, 0), (7.2, 7.2, 2.2))
    crystals = [(0, 0, 5.2, 0.85, 0, 0), (0.9, 0.5, 3.8, 0.6, 0.3, 0.5), (-0.9, 0.4, 3.4, 0.55, -0.35, 0.2),
                (0.3, -1.0, 3.0, 0.5, 0.15, -0.4), (-0.6, -0.8, 2.6, 0.45, -0.3, -0.3), (1.4, -0.4, 2.2, 0.4, 0.45, -0.2),
                (-1.5, 0.9, 2.0, 0.38, -0.5, 0.4), (0.5, 1.4, 2.4, 0.42, 0.2, 0.55), (-0.2, 1.1, 1.8, 0.35, -0.1, 0.6)]
    for (ox, oy, h, r, tx, ty) in crystals:
        M = TRS((cx + ox, cy + oy, 1.75), R.uniform(0, 1), (1, 1, 1), tx, ty)
        for mat_, rr, hh in (("crystal", r, h), ("crystal_core", r * 0.4, h * 0.82)):
            pts = [(math.cos(i * math.pi / 3) * rr, math.sin(i * math.pi / 3) * rr) for i in range(6)]
            vs = [(x, y, 0) for x, y in pts] + [(x, y, hh * 0.78) for x, y in pts] + [(0, 0, hh)]
            fs = [(i, (i + 1) % 6, 6 + (i + 1) % 6, 6 + i) for i in range(6)] + [(6 + i, 6 + (i + 1) % 6, 12) for i in range(6)]
            a.add(mat_, vs, fs, M)
    empty("ZONE_crystal", (cx, cy, 0), label="SOUTH CRYSTAL", radius=6, color="#ff007f")


# ============================================================================= fillers (corner lots) with ad slots
def fillers():
    specs = (("SM_Bldg_Filler_SW1", -30, -52, 16, 14, 20, "fac_glass", ((7, "N"), (8, "E"))),
             ("SM_Bldg_Filler_SW2", -54, -30, 14, 16, 18, "fac_stone", ((9, "E"),)),
             ("SM_Bldg_Filler_SE1", 30, -52, 16, 14, 21, "fac_brick", ((10, "N"), (11, "W"))),
             ("SM_Bldg_Filler_SE2", 54, -30, 14, 16, 18, "fac_granite", ((12, "W"),)),
             ("SM_Bldg_Filler_NW", -34, 54, 10, 14, 24, "deco", ((13, "S"),)),
             ("SM_Bldg_Filler_NE", 34, 54, 10, 14, 26, "fac_brick", ((14, "S"),)))
    face = {"N": (0, 1, 0.0), "S": (0, -1, math.pi), "E": (1, 0, -math.pi / 2), "W": (-1, 0, math.pi / 2)}
    for name, x, y, w, d, h, m, bbs in specs:
        a = Asset(name, H, origin=(x, y, 0))
        parts, cols = DG.building_parts(x, y, w, d, h, 0.0, m, rng=random.Random(name), roof="roof")
        _add_parts(a, parts)
        for loc, size, r in cols:
            col_box(loc, size, r)
        for slot, f in bbs:
            fx, fy, rz = face[f]
            bw = 9.0 if slot % 2 else 7.2
            bx = x + fx * (w / 2 + 0.75); byy = y + fy * (d / 2 + 0.75)
            bb = Asset(f"BB_{slot:02d}", S, keep=True, props={"aspect": "16:9", "slot": slot, "tier": "canyon"})
            bb.quad("screen_off", (bx, byy, 10 + bw * 9 / 32 + 2), bw, bw * 9 / 16, rz)
            a.box("darkmetal", (x + fx * (w / 2 + 0.6), y + fy * (d / 2 + 0.6), 11.5), (bw + 0.6 if fy else 0.3, 0.3 if fy else bw + 0.6, bw * 9 / 16 + 0.6))


# ============================================================================= 04 props
def _add_parts(a, parts):
    for m, vs, fs in parts:
        a.add(m, vs, fs)


_tree_n = [0]


def tree(x, y, s=1.0):
    """tree in a stone planter. The planter is geometry; the tree itself is a TREE_* marker that the game
    draws as an instance of public/assets/tree.glb (see process_tree.py)."""
    a = Asset(f"SM_Prop_TreePlanter_01.{len(Asset.REG):04d}", F)
    a.cyl("concrete", (x, y, 0), 0.75 * s, 0.5, seg=12)
    a.cyl("trim_dark", (x, y, 0.5), 0.78 * s, 0.06, seg=12)
    _tree_n[0] += 1
    rz = random.Random(_tree_n[0] * 7919).uniform(0, 2 * math.pi)
    empty(f"TREE_H{_tree_n[0]:03d}", (x, y, 0.53), s=round(s * 0.85, 3), rz=round(rz, 3))
    col_box((x, y, 0), (1.0, 1.0, 2.5))


def shrub(x, y):
    KL.marker(empty, "Bush_06" if int(abs(x * 7 + y * 3)) % 2 else "Bush_07", x, y, 0.0,
              random.Random(int(x * 13 + y * 7)).uniform(0, 6.28))


def street_light(x, y, rz, color="neon_cyan"):
    """Cartoon City street lamp (kit Spotlight_01); arm reaches along local +Y rotated by rz"""
    KL.pole(empty, "Spotlight_01", x, y, rz, z=CURB)
    col_box((x, y, 0), (0.5, 0.5, 8.3))


def traffic_light(x, y, rz):
    """Cartoon City traffic light (kit traffic_light_002, with road sign); arm along local +Y rotated by rz"""
    KL.pole(empty, "traffic_light_002", x, y, rz, z=CURB)
    col_box((x, y, 0), (0.4, 0.4, 5.9))


def bollard(x, y):
    a = Asset(f"SM_Prop_Bollard_Neon_01.{len(Asset.REG):04d}", F)
    a.cyl("darkmetal", (x, y, CURB), 0.16, 0.85, seg=10)
    a.cyl("neon_magenta", (x, y, CURB + 0.85), 0.165, 0.1, seg=10)
    a.cyl("darkmetal", (x, y, CURB + 0.95), 0.16, 0.06, seg=10, r2=0.1)
    col_box((x, y, 0), (0.34, 0.34, 1.1))


def kiosk(x, y, rz, slot):
    a = Asset(f"SM_Prop_Kiosk_Terminal_01.{slot:03d}", F, origin=(x, y, CURB))
    Rm = Matrix.Rotation(rz, 3, "Z")
    a.box("hull", (x, y, CURB), (1.2, 0.7, 2.3), rz, top="darkmetal")
    n = Rm @ Vector((0, 0.36, 0))
    a.quad("neon_cyan", (x + n.x, y + n.y, CURB + 1.35), 0.8, 1.5, rz)
    a.quad("screen_tpl", (x - n.x, y - n.y, CURB + 1.35), 0.8, 0.32, rz + math.pi)
    a.box("darkmetal", (x, y, CURB + 2.3), (0.15, 0.15, 0.5), rz)
    t = Asset(f"TICKER_{slot}", S, keep=True, props={"slot": slot})
    t.quad("screen_off", (x + n.x * 1.05, y + n.y * 1.05, CURB + 3.05), 2.6, 0.5, rz)
    a.box("darkmetal", (x, y, CURB + 2.75), (2.8, 0.25, 0.65), rz)
    col_box((x, y, 0), (1.3, 0.9, 3.2), rz)


def portal(pid, label, matname, hexcol, x, y):
    a = Asset(f"SM_Prop_ArcadePortal_{pid}", F, origin=(x, y, CURB))
    rz = facing(x, y)
    a.box("hull", (x, y, CURB), (8.0, 3.0, 0.45), rz, top="darkmetal")
    a.torus(matname, (x, y, CURB + 4.1), 3.3, 0.3, seg=48, tseg=8, rz=rz)
    a.torus("darkmetal", (x, y, CURB + 4.1), 3.72, 0.24, seg=48, tseg=6, rz=rz)
    for s in (-1, 1):
        side = Vector((math.cos(rz), math.sin(rz), 0)) * s * 3.85
        a.box("hull", (x + side.x, y + side.y, CURB + 0.45), (0.8, 1.2, 3.4), rz)
        col_box((x + side.x, y + side.y, 0), (0.9, 1.3, 4.0), rz)
    fx = Asset(f"PORTAL_FX_{pid}", S, keep=True, props={"id": pid, "label": label, "color": hexcol})
    fx.disc("portal_" + matname.split("_")[1], (x, y, CURB + 4.1), 3.05, seg=40, rz=rz, rx=math.pi / 2, uv=False)
    n = Vector((-math.sin(rz), math.cos(rz), 0))
    a.text(matname, label, (x + n.x * 0.35, y + n.y * 0.35, CURB + 8.4), 0.75, rz=rz, extrude=0.05)
    col_box((x, y, 0), (8.0, 3.0, 0.65), rz)


_car_n = [0]
# interleave models and paints so neighbouring cars never match: BRT / SRC / FTV x Default, Red, White, Black
_CAR_ORDER = [f"CAR_{m}_{p}" for p in ("Default", "Red", "White", "Black") for m in ("BRT", "SRC", "FTV")]
_CAR_ORDER = [c for c in _CAR_ORDER if c in KL.INFO] or KL.CARS


def car(x, y, rz, kind="sedan", paint="car_red"):
    """traffic car: one of the user's car models (public/assets/cars.glb), nose along local +X rotated by rz.
    Vans/trucks and buses were removed."""
    # buses and vans/trucks were removed: their lane spots get cars too, so traffic density stays the same
    _car_n[0] += 1
    pick = _CAR_ORDER[_car_n[0] % len(_CAR_ORDER)]
    KL.car(empty, pick, x, y, rz)
    col_box((x, y, 0), (4.6, 2.2, 1.6), rz)


def _car_generated(x, y, rz, kind="sedan", paint="car_red"):
    a = Asset(f"SM_Veh_{'Car_Sedan' if kind == 'sedan' else 'Van' if kind == 'van' else 'Bus'}_01.{len(Asset.REG):04d}", F, origin=(x, y, 0))
    M = TRS((x, y, 0), rz)
    dims = {"sedan": (4.4, 1.9, 0.75, 2.4, 0.62), "van": (5.2, 2.1, 1.0, 3.6, 1.15), "bus": (10.5, 2.6, 1.1, 9.6, 1.6)}[kind]
    L, W, hb, Lc, hc = dims
    zb = 0.35
    a.add(paint, *_boxv(L, W, hb, zb), M)
    # cabin (tapered prism) + windows
    w2 = W * 0.86
    off = -0.2 if kind == "sedan" else 0.4
    cab = [(-Lc / 2 + off, -w2 / 2), (Lc / 2 + off - (0.5 if kind == "sedan" else 0.2), -w2 / 2),
           (Lc / 2 + off - (0.5 if kind == "sedan" else 0.2), w2 / 2), (-Lc / 2 + off, w2 / 2)]
    a.prism("glass_dark", cab, zb + hb, zb + hb + hc, M, top=paint if kind != "sedan" else paint)
    a.prism(paint, [(cx * 0.98, cy * 0.98) for cx, cy in cab], zb + hb + hc - 0.08, zb + hb + hc, M)
    for wx in (-L / 2 + 0.85, L / 2 - 0.85) if kind != "bus" else (-L / 2 + 1.2, L / 2 - 1.8):
        for wy in (-W / 2 + 0.15, W / 2 + 0.15):   # cylinder runs along local -Y from this point
            c = M @ Vector((wx, wy, 0.36))
            a.cyl("rubber", tuple(c), 0.36, 0.3, seg=12, rz=rz, rx=math.pi / 2)
    for sy in (-1, 1):
        a.add("neon_white", *_quadv((L / 2 + 0.01, sy * (W / 2 - 0.35), zb + hb * 0.65), 0.4, 0.15, -math.pi / 2), M)
        a.add("neon_red", *_quadv((-L / 2 - 0.01, sy * (W / 2 - 0.35), zb + hb * 0.65), 0.4, 0.15, math.pi / 2), M)
    col_box((x, y, 0), (L, W, zb + hb + hc), rz)


def _boxv(L, W, h, z):
    V = [(-L / 2, -W / 2, z), (L / 2, -W / 2, z), (L / 2, W / 2, z), (-L / 2, W / 2, z),
         (-L / 2, -W / 2, z + h), (L / 2, -W / 2, z + h), (L / 2, W / 2, z + h), (-L / 2, W / 2, z + h)]
    return V, [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)]


def _quadv(c, w, h, rz):
    M = TRS(c, rz)
    vs = [M @ Vector(v) for v in ((w / 2, 0, -h / 2), (-w / 2, 0, -h / 2), (-w / 2, 0, h / 2), (w / 2, 0, h / 2))]
    return [tuple(v) for v in vs], [(0, 1, 2, 3)]


def pedestrian(x, y, color="proxy"):
    a = Asset(f"SM_Char_Pedestrian_Proxy_01.{len(Asset.REG):04d}", F)
    a.cyl(color, (x, y, CURB), 0.24, 1.15, seg=10, r2=0.2)
    a.sphere(color, (x, y, CURB + 1.55), 0.22, seg=10, rings=6)


def props(mode):
    # street lights: plaza sidewalk ring + outer sidewalk ring
    for rz in (0, math.pi / 2, math.pi, -math.pi / 2):
        Rm = Matrix.Rotation(rz, 3, "Z")
        for t in (-16, -4, 4, 16):
            if abs(t) < 5:
                continue
            p = Rm @ Vector((t, -21.6, 0)); street_light(p.x, p.y, rz + math.pi, "neon_cyan")
        for t in (-33, -21, 21, 33):
            p = Rm @ Vector((t, -40.6, 0)); street_light(p.x, p.y, rz, "neon_magenta")
        # traffic lights at intersection corners
        for sx in (-1, 1):
            p = Rm @ Vector((sx * (AVE + 1.0), -22.4, 0)); traffic_light(p.x, p.y, rz + (math.pi if sx > 0 else math.pi))
            p = Rm @ Vector((sx * (AVE + 1.0), -40.0, 0)); traffic_light(p.x, p.y, rz)
        # bollards along the plaza edge (gaps at the crosswalks and portals)
        t = -21.0
        while t <= 21.0:
            if not (AVE - 0.3 < abs(t) < AVE + 3.4):
                p = Rm @ Vector((t, -22.6, 0)); bollard(p.x, p.y)
            t += 2.5
    # kiosks (tickers) along the plaza edges
    for slot, (x, y, rz) in enumerate(((-18.2, -4, -math.pi / 2), (-18.2, 4, -math.pi / 2), (18.2, -4, math.pi / 2),
                                       (18.2, 4, math.pi / 2), (-8, -18.2, 0), (8, -18.2, 0)), start=1):
        kiosk(x, y, rz + math.pi, slot)
    # arcade portals on the plaza corners
    for pid, label, m, hx, x, y in (("BAG_RUN", "BAG RUN", "neon_cyan", "#00f0ff", -14.5, -14.5),
                                    ("VAULT_HEIST", "VAULT HEIST", "neon_gold", "#ffb800", 14.5, -14.5),
                                    ("TILE_DROP", "TILE DROP", "neon_magenta", "#ff007f", 14.5, 14.5),
                                    ("ARCADE", "ARCADE", "neon_purple", "#b829ff", -14.5, 14.5)):
        portal(pid, label, m, hx, x, y)
    # plaza corner trees
    for sx in (-1, 1):
        for sy in (-1, 1):
            tree(sx * 19.0, sy * 9.5, 0.9); tree(sx * 9.5, sy * 19.0, 0.9)
    # gantries with ad slots over the S / E / W avenues
    for slot, ang in ((16, -math.pi / 2), (17, 0.0), (18, math.pi)):
        c = Vector((math.cos(ang) * 46, math.sin(ang) * 46, 0))
        rz = facing(c.x, c.y)
        # structure: the user's archway billboard model (public/assets/billboard_archway.glb) is placed by
        # src/standees.js around this screen at runtime; only the screen and the post colliders are built here
        side = Vector((math.cos(rz), math.sin(rz), 0))
        for s in (-1, 1):
            p = c + side * s * 9.6
            col_box((p.x, p.y, 0), (1, 1, 14), rz)
        n = Vector((-math.sin(rz), math.cos(rz), 0))
        bb = Asset(f"BB_{slot:02d}", S, keep=True, props={"aspect": "16:9", "slot": slot, "tier": "gantry"})
        bb.quad("screen_off", tuple(c + n * 0.42 + Vector((0, 0, 10.0))), 11.6, 6.52, rz)
    # freestanding LED totems on the plaza corners (south)
    for slot, x in ((19, -21.5), (20, 21.5)):
        y = -21.5
        rz = facing(x, y)
        # housing: the user's standing-screen model (public/assets/standing_billboard.glb) is placed by src/standees.js
        # behind this screen at runtime, so only the screen and the collider are built here
        bb = Asset(f"BB_{slot:02d}", S, keep=True, props={"aspect": "9:16", "slot": slot, "tier": "totem"})
        n = Vector((-math.sin(rz), math.cos(rz), 0))
        bb.quad("screen_off", (x + n.x * 0.36, y + n.y * 0.36, CURB + 3.3), 2.2, 3.9, rz)
        col_box((x, y, 0), (2.6, 0.7, 6.6), rz)
    # vehicles on the ring road (static traffic)
    paints = ["car_red", "car_yellow", "car_cyan", "car_purple", "car_white"]
    lanes = (25.0, 29.0, 33.0, 37.0)
    spots = [(-30, 0, "sedan"), (-14, 1, "van"), (18, 2, "sedan"), (28, 3, "sedan"), (-24, 2, "bus"), (14, 0, "sedan")]
    for k, rz in enumerate((0, math.pi / 2, math.pi, -math.pi / 2)):
        Rm = Matrix.Rotation(rz, 3, "Z")
        for j, (t, lane, kind) in enumerate(spots):
            if (j + k) % 2:
                continue
            p = Rm @ Vector((t, -lanes[lane], 0))
            heading = rz + (0 if lane < 2 else math.pi)
            car(p.x, p.y, heading, kind, paints[(j + k) % len(paints)])
    if mode == "blend":
        for i in range(24):
            ang = R.uniform(0, 2 * math.pi); rr = R.uniform(13, 19)
            pedestrian(math.cos(ang) * rr, math.sin(ang) * rr, R.choice(["proxy", "car_cyan", "car_purple", "car_yellow"]))
    empty("SPAWN", (0, -18.5, CURB + 0.05), facing=0.0)
    empty("ZONE_trading_floor", (0, -18, 0), label="THE TRADING FLOOR", radius=5, color="#7cff3d")


# ============================================================================= assembly
def _ensure_coll(name, parent):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        parent.children.link(c)
    return c


def _mesh_from_parts(name, parts, origin=None):
    me = bpy.data.meshes.new(name)
    verts, faces, loops_uv, mat_idx = [], [], [], []
    mats = list(parts.keys())
    for mi, m in enumerate(mats):
        P_ = parts[m]
        o = len(verts)
        verts.extend(P_.v)
        for f, uv in zip(P_.f, P_.uv):
            faces.append(tuple(i + o for i in f)); loops_uv.append(uv); mat_idx.append(mi)
    org = Vector(origin) if origin else Vector((0, 0, 0))
    me.from_pydata([tuple(v - org) for v in verts], [], faces)
    uvl = me.uv_layers.new(name="UVMap")
    li = 0
    for p, uv, mi in zip(me.polygons, loops_uv, mat_idx):
        p.material_index = mi
        p.use_smooth = mats[mi] in SMOOTH
        for k, loop in enumerate(p.loop_indices):
            uvl.data[loop].uv = uv[k] if k < len(uv) else (0, 0)
    for m in mats:
        me.materials.append(mat(m))
    me.validate(clean_customdata=False)
    return me


def assemble(mode, root):
    colls = {n: _ensure_coll(n, root) for n in (H, S, P, F, G)}
    objs = []
    merged = {}
    for a in Asset.REG:
        if not a.parts:
            continue
        if a.keep or mode == "blend":
            # game objects stay in world space (the game reads their geometry bounds as world positions)
            origin = a.origin if mode == "blend" else None
            if origin is None and a.coll == S and mode == "blend":   # signage: origin at backplate center
                allv = [v for p_ in a.parts.values() for v in p_.v]
                origin = tuple(sum((v for v in allv), Vector()) / len(allv))
            me = _mesh_from_parts(a.name, a.parts, origin)
            o = bpy.data.objects.new(a.name, me)
            if origin:
                o.location = origin
            for k, v in a.props.items():
                o[k] = v
            colls[a.coll].objects.link(o)
            objs.append(o)
        else:
            for m, p_ in a.parts.items():
                M_ = merged.setdefault(m, Part())
                o_ = len(M_.v)
                M_.v.extend(p_.v); M_.uv.extend(p_.uv)
                M_.f.extend(tuple(i + o_ for i in f) for f in p_.f)
    for m, p_ in merged.items():
        me = _mesh_from_parts("HERO_" + m, {m: p_})
        o = bpy.data.objects.new("HERO_" + m, me)
        colls[H].objects.link(o)
        objs.append(o)
    for name, loc, props, coll in EMPTIES:
        e = bpy.data.objects.new(name, None)
        e.location = loc; e.empty_display_size = 1.2
        for k, v in props.items():
            e[k] = v
        colls[coll].objects.link(e)
    return objs, colls


def build(mode="game", root=None):
    """Build the hero district. Returns (objects, collider_list, collections)."""
    Asset.REG.clear(); COLS.clear(); EMPTIES.clear()
    root = root or bpy.context.scene.collection
    plaza_and_roads(mode)
    center_hub()
    central_tower(); spire(-1); spire(1); skybridge()
    ad_canyon()
    rwa_vault()
    south_crystal()
    fillers()
    props(mode)
    hero_root = _ensure_coll("THE_BAG_SQUARE", root)
    objs, colls = assemble(mode, hero_root)
    return objs, list(COLS), colls


# ============================================================================= look-dev: cel shading, outlines, cameras
def setup_cel(objs):
    """Convert materials to an Eevee toon network (Shader to RGB -> constant ColorRamp). The Principled node is
    kept (muted from the output path) so `toggle_cel.py` can flip back to PBR before glTF export."""
    outline = bpy.data.materials.new("H_outline")
    outline.use_nodes = True
    nt = outline.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    em = nt.nodes.new("ShaderNodeEmission"); em.inputs["Color"].default_value = (0.02, 0.01, 0.04, 1)
    out = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(em.outputs[0], out.inputs[0])
    outline.use_backface_culling = True
    for m in list(MATS.values()):
        if SPECS[m.name[2:]].get("alpha", 1) < 1:
            continue
        nt = m.node_tree
        p = nt.nodes["Principled BSDF"]
        out_pbr = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        base_src = p.inputs["Base Color"].links[0].from_socket if p.inputs["Base Color"].links else None
        em_src = p.inputs["Emission Color"].links[0].from_socket if p.inputs["Emission Color"].links else None
        diff = nt.nodes.new("ShaderNodeBsdfDiffuse"); diff.location = (300, -400)
        s2r = nt.nodes.new("ShaderNodeShaderToRGB"); s2r.location = (480, -400)
        ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.location = (660, -400)
        ramp.color_ramp.interpolation = "CONSTANT"
        els = ramp.color_ramp.elements
        els[0].position = 0.0; els[0].color = (0.32, 0.3, 0.42, 1)
        els[1].position = 0.18; els[1].color = (0.7, 0.68, 0.78, 1)
        e3 = els.new(0.55); e3.color = (1.05, 1.03, 1.08, 1)
        mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.location = (900, -400)
        mul.inputs[0].default_value = 1.0
        if base_src:
            nt.links.new(base_src, diff.inputs["Color"]); nt.links.new(base_src, mul.inputs[6])
        else:
            col = p.inputs["Base Color"].default_value
            diff.inputs["Color"].default_value = col; mul.inputs[6].default_value = col
        nt.links.new(diff.outputs[0], s2r.inputs[0]); nt.links.new(s2r.outputs["Color"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], mul.inputs[7])
        add = nt.nodes.new("ShaderNodeMix"); add.data_type = "RGBA"; add.blend_type = "ADD"; add.location = (1080, -400)
        add.inputs[0].default_value = 1.0
        nt.links.new(mul.outputs[2], add.inputs[6])
        strength = p.inputs["Emission Strength"].default_value
        emc = nt.nodes.new("ShaderNodeMix"); emc.data_type = "RGBA"; emc.blend_type = "MULTIPLY"; emc.location = (900, -650)
        emc.inputs[0].default_value = 1.0; emc.inputs[7].default_value = (strength, strength, strength, 1)
        if em_src:
            nt.links.new(em_src, emc.inputs[6])
        else:
            emc.inputs[6].default_value = p.inputs["Emission Color"].default_value
        nt.links.new(emc.outputs[2], add.inputs[7])
        emi = nt.nodes.new("ShaderNodeEmission"); emi.location = (1260, -400); emi.name = "CEL_EMISSION"
        nt.links.new(add.outputs[2], emi.inputs["Color"])
        out_cel = nt.nodes.new("ShaderNodeOutputMaterial"); out_cel.location = (1440, -400); out_cel.name = "CEL_OUTPUT"
        nt.links.new(emi.outputs[0], out_cel.inputs[0])
        out_cel.is_active_output = True
        out_pbr.name = "PBR_OUTPUT"
    # inverted-hull outlines on hero buildings
    for o in objs:
        if o.type != "MESH" or not (o.name.startswith("SM_") or o.name.startswith("HERO_")):
            continue
        if any(o.name.startswith(p) for p in ("SM_Road", "SM_Plaza", "SM_Sidewalk")):
            continue
        dims = max(o.dimensions)
        o.data.materials.append(outline)
        mod = o.modifiers.new("Outline", "SOLIDIFY")
        mod.thickness = -min(0.08, 0.02 + dims * 0.0012)
        mod.use_flip_normals = True
        mod.material_offset = len(o.data.materials) - 1
        mod.use_rim = False


TOGGLE = '''# BagVerse look-dev toggle: run in Blender's Text Editor.
# CEL = Eevee toon network + outlines (for renders); PBR = Principled path (run before exporting glTF).
import bpy
MODE = "PBR"   # or "CEL"
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree
    pbr, cel = nt.nodes.get("PBR_OUTPUT"), nt.nodes.get("CEL_OUTPUT")
    if pbr and cel:
        (cel if MODE == "CEL" else pbr).is_active_output = True
        e = nt.nodes.get("CEL_EMISSION")
        if e: e.mute = MODE != "CEL"
for o in bpy.data.objects:
    for md in o.modifiers:
        if md.name == "Outline": md.show_render = md.show_viewport = MODE == "CEL"
print("Bag Square materials ->", MODE)
'''


def lookdev_scene():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    try:
        sc.eevee.taa_render_samples = 32
    except Exception:
        pass
    sc.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in sc.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
    sc.view_settings.look = "AgX - Punchy" if sc.view_settings.view_transform == "AgX" else "None"
    world = bpy.data.worlds.new("BagSquareNight"); sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.05, 0.03, 0.12, 1); bg.inputs[1].default_value = 0.9
    sun = bpy.data.lights.new("Moon", "SUN"); sun.energy = 2.2; sun.color = (0.75, 0.72, 1.0); sun.angle = 0.1
    so = bpy.data.objects.new("Moon", sun); so.rotation_euler = (math.radians(52), 0, math.radians(35))
    sc.collection.objects.link(so)
    fill = bpy.data.lights.new("PlazaGlow", "AREA"); fill.energy = 9000; fill.size = 40; fill.color = (1.0, 0.4, 0.9)
    fo = bpy.data.objects.new("PlazaGlow", fill); fo.location = (0, 0, 30); sc.collection.objects.link(fo)
    # Freestyle outlines in addition to the inverted hull
    try:
        sc.render.use_freestyle = True
        sc.render.line_thickness_mode = "ABSOLUTE"; sc.render.line_thickness = 1.4
        fs = sc.view_layers[0].freestyle_settings
        ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new("BagSquareLines")
        if ls.linestyle is None:
            ls.linestyle = bpy.data.linestyles.new("BagSquareInk")
        ls.select_by_visibility = True; ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True
        ls.linestyle.color = (0.03, 0.02, 0.06); ls.linestyle.thickness = 1.4
    except Exception as e:
        print("freestyle unavailable:", e)
    # bloom via compositor glare (Blender 5.x node-group compositor, fallback to 4.x scene tree)
    try:
        if hasattr(sc, "compositing_node_group"):
            ng = bpy.data.node_groups.new("BagSquareComp", "CompositorNodeTree")
            ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
            rl = ng.nodes.new("CompositorNodeRLayers")
            gl = ng.nodes.new("CompositorNodeGlare")
            out = ng.nodes.new("NodeGroupOutput")
            for name, val in (("Type", "Bloom"), ("Quality", "High"), ("Threshold", 0.9), ("Strength", 0.7), ("Size", 0.65)):
                try:
                    gl.inputs[name].default_value = val
                except Exception as e:
                    print("glare", name, e)
            ng.links.new(rl.outputs["Image"], gl.inputs["Image"]); ng.links.new(gl.outputs["Image"], out.inputs[0])
            sc.compositing_node_group = ng
        else:
            sc.use_nodes = True
            tree = sc.node_tree
            rl = tree.nodes.get("Render Layers"); comp = tree.nodes.get("Composite")
            gl = tree.nodes.new("CompositorNodeGlare"); gl.glare_type = "BLOOM"
            tree.links.new(rl.outputs["Image"], gl.inputs["Image"]); tree.links.new(gl.outputs["Image"], comp.inputs["Image"])
    except Exception as e:
        print("bloom unavailable:", e)
    # cameras
    cams = {}
    def cam(name, loc, rot, ortho=None, lens=35):
        cd = bpy.data.cameras.new(name)
        if ortho:
            cd.type = "ORTHO"; cd.ortho_scale = ortho
        else:
            cd.lens = lens
        cd.clip_end = 1000
        co = bpy.data.objects.new(name, cd); co.location = loc; co.rotation_euler = [math.radians(v) for v in rot]
        sc.collection.objects.link(co); cams[name] = co
        return co
    # isometric from the south-south-east, looking north like the district map
    tgt, dist, yaw, pitch = Vector((2, 12, 8)), 160, 25.0, 54.736
    d = Vector((-math.sin(math.radians(yaw)) * math.sin(math.radians(pitch)), math.cos(math.radians(yaw)) * math.sin(math.radians(pitch)), -math.cos(math.radians(pitch))))
    cam("CAM_Isometric", tuple(tgt - d * dist), (pitch, 0, yaw), ortho=138)
    cam("CAM_Hub_North", (9, -24.6, 3.4), (84, 0, 14), lens=20)
    cam("CAM_Plaza_Street", (-6, -34, 2.2), (86, 0, -8), lens=24)
    cam("CAM_RWA_Vault", (26, 2, 3.0), (84, 0, -58), lens=28)
    cam("CAM_AdCanyon_Tower", (-20, -8, 2.0), (80, 0, 32), lens=22)
    sc.camera = cams["CAM_Isometric"]
    txt = bpy.data.texts.new("toggle_cel.py"); txt.write(TOGGLE)
    return cams


def render_all(cams, outdir, res=(1600, 900)):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"
    paths = []
    for name, co in cams.items():
        sc.camera = co
        sc.render.filepath = os.path.join(outdir, name + ".png")
        bpy.ops.render.render(write_still=True)
        paths.append(sc.render.filepath)
        print("rendered", sc.render.filepath)
    sc.camera = cams["CAM_Isometric"]
    return paths


if __name__ == "__main__":
    import sys
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs, cols, colls = build(mode="blend")
    # standalone collider object
    cv, cf = [], []
    for vs, fs in cols:
        o_ = len(cv); cv.extend(tuple(v) for v in vs); cf.extend(tuple(i + o_ for i in f) for f in fs)
    me = bpy.data.meshes.new("COLLIDER"); me.from_pydata(cv, [], cf)
    co = bpy.data.objects.new("COLLIDER", me); co.display_type = "WIRE"; co.hide_render = True; co["collider"] = True
    colls[G].objects.link(co)
    out_glb = os.path.join(HERE, "bag_square_hero.glb")
    bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", export_extras=True, export_apply=False,
                              export_image_format="WEBP", export_image_quality=88)
    setup_cel(objs)
    cams = lookdev_scene()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "bag_square_hero.blend"), compress=True)
    print("SAVED blend + glb", len(objs), "objects")
    if "--render" in args:
        render_all(cams, os.path.join(HERE, "renders"), (1600, 900) if "--hq" in args else (1280, 720))
