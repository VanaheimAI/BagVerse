"""
BagVerse - shared detailed geometry (pure Python + mathutils, no scene access).
Every builder returns a list of parts: (material_name, verts[world], faces), so both build_world.py
(material buckets) and bag_square_hero.py (Asset objects) can consume them.

  building_parts(...)   facade body + shopfront base, ledges, quoins, cornice, parapet, setbacks, rooftop clutter
  tree_parts(...)       stylised broadleaf tree: tapered trunk, branches, clustered leaf blobs (smooth shaded)
  pine_parts(...)       stacked-cone conifer
  shrub_parts(...)      low blob cluster
  streetlight_parts(...) octagonal base, tapered pole, collars, curved mast arm, lamp head, street banners
"""
import math, random
from mathutils import Vector, Matrix

UP = Vector((0, 0, 1))


def TRS(loc=(0, 0, 0), rz=0.0, scale=(1, 1, 1)):
    return Matrix.Translation(Vector(loc)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Diagonal((*scale, 1))


BOX_V = [(-.5, -.5, 0), (.5, -.5, 0), (.5, .5, 0), (-.5, .5, 0), (-.5, -.5, 1), (.5, -.5, 1), (.5, .5, 1), (-.5, .5, 1)]
SIDES = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
TOP, BOT = [(4, 5, 6, 7)], [(3, 2, 1, 0)]


def box(m, loc, size, rz=0.0, top=True, sides=True, top_mat=None):
    M = TRS(loc, rz, size)
    vs = [tuple(M @ Vector(v)) for v in BOX_V]
    out = []
    if sides:
        out.append((m, vs, SIDES))
    if top:
        out.append((top_mat or m, vs, TOP))
    return out


def cyl(m, loc, r, h, seg=12, r2=None, cap=True):
    r2 = r if r2 is None else r2
    x, y, z = loc
    vs = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        vs += [(x + r * math.cos(a), y + r * math.sin(a), z), (x + r2 * math.cos(a), y + r2 * math.sin(a), z + h)]
    fs = [(2 * i, 2 * ((i + 1) % seg), 2 * ((i + 1) % seg) + 1, 2 * i + 1) for i in range(seg)]
    if cap:
        fs.append(tuple(2 * i for i in reversed(range(seg))))
        if r2 > 1e-4:
            fs.append(tuple(2 * i + 1 for i in range(seg)))
    return [(m, vs, fs)]


def tube(m, p0, p1, r0, r1=None, seg=8, cap=False):
    """cylinder between two points."""
    r1 = r0 if r1 is None else r1
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0)
    if d.length < 1e-6:
        return []
    d.normalize()
    a = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0))
    u = d.cross(a).normalized(); v = d.cross(u)
    vs = []
    for i in range(seg):
        t = 2 * math.pi * i / seg
        o = u * math.cos(t) + v * math.sin(t)
        vs += [tuple(p0 + o * r0), tuple(p1 + o * r1)]
    fs = [(2 * i, 2 * ((i + 1) % seg), 2 * ((i + 1) % seg) + 1, 2 * i + 1) for i in range(seg)]
    if cap:
        fs.append(tuple(2 * i + 1 for i in range(seg)))
    return [(m, vs, fs)]


def quad(m, center, w, h, rz, double=False):
    M = TRS(center, rz)
    vs = [tuple(M @ Vector(p)) for p in ((w / 2, 0, -h / 2), (-w / 2, 0, -h / 2), (-w / 2, 0, h / 2), (w / 2, 0, h / 2))]
    fs = [(0, 1, 2, 3)] + ([(3, 2, 1, 0)] if double else [])
    return [(m, vs, fs)]


_ICO = None


def _icosphere():
    """subdivision-1 icosphere (42 verts / 80 faces), unit radius."""
    global _ICO
    if _ICO:
        return _ICO
    t = (1 + 5 ** 0.5) / 2
    vs = [Vector(v).normalized() for v in ((-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
                                           (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1))]
    fs = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
          (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    cache = {}

    def mid(a, b):
        k = (min(a, b), max(a, b))
        if k not in cache:
            vs.append(((vs[a] + vs[b]) / 2).normalized()); cache[k] = len(vs) - 1
        return cache[k]
    nf = []
    for a, b, c in fs:
        ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
        nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    _ICO = (vs, nf)
    return _ICO


def blob(m, center, r, sz=0.85, jitter=0.1, rng=random):
    vs, fs = _icosphere()
    c = Vector(center)
    out = []
    for v in vs:
        k = 1 + rng.uniform(-jitter, jitter)
        out.append(tuple(c + Vector((v.x * r * k, v.y * r * k, v.z * r * sz * k))))
    return [(m, out, fs)]


# ----------------------------------------------------------------------------- trees
def tree_parts(x, y, s=1.0, leaf="leaf", leaf_dark="leaf_dark", bark="bark", seed=None, base_z=0.0):
    rng = random.Random(seed if seed is not None else hash((round(x, 2), round(y, 2))))
    z0 = base_z
    parts = []
    lean = Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), 0)) * s
    top = Vector((x, y, z0 + 2.7 * s)) + lean
    parts += tube(bark, (x, y, z0), top, 0.26 * s, 0.15 * s, seg=8)
    parts += cyl(bark, (x, y, z0), 0.36 * s, 0.25 * s, seg=8, r2=0.26 * s, cap=False)   # root flare
    crown = top + Vector((0, 0, 1.15 * s))
    blobs = [(crown, 1.55 * s, leaf)]
    a0 = rng.uniform(0, 6.28)
    for k in range(4):
        a = a0 + k * math.pi / 2 + rng.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0)) * rng.uniform(0.95, 1.25) * s
        p = crown + d + Vector((0, 0, rng.uniform(-0.55, 0.15) * s))
        blobs.append((p, rng.uniform(1.0, 1.25) * s, leaf if k % 2 == 0 else leaf_dark))
        parts += tube(bark, top - Vector((0, 0, 0.6 * s)), p - Vector((0, 0, 0.3 * s)), 0.09 * s, 0.05 * s, seg=5)
    blobs.append((crown + Vector((rng.uniform(-0.3, 0.3) * s, rng.uniform(-0.3, 0.3) * s, 1.0 * s)), 1.0 * s, leaf))
    for p, r, m in blobs:
        parts += blob(m, p, r, sz=0.82, jitter=0.12, rng=rng)
    return parts


def pine_parts(x, y, s=1.0, mat="leaf_pine", bark="bark", base_z=0.0):
    parts = tube(bark, (x, y, base_z), (x, y, base_z + 4.6 * s), 0.22 * s, 0.08 * s, seg=7)
    for k, (r, z) in enumerate(((1.9, 1.1), (1.55, 2.2), (1.15, 3.2), (0.75, 4.1))):
        parts += cyl(mat, (x, y, base_z + z * s), r * s, 1.9 * s - k * 0.25 * s, seg=10, r2=0.05 * s)
    return parts


def shrub_parts(x, y, s=1.0, leaf="leaf", leaf_dark="leaf_dark", base_z=0.0):
    rng = random.Random(hash((round(x, 2), round(y, 2), 7)))
    parts = blob(leaf, (x, y, base_z + 0.45 * s), 0.75 * s, sz=0.7, rng=rng)
    parts += blob(leaf_dark, (x + 0.5 * s, y + 0.2 * s, base_z + 0.35 * s), 0.5 * s, sz=0.75, rng=rng)
    parts += blob(leaf, (x - 0.4 * s, y - 0.3 * s, base_z + 0.32 * s), 0.45 * s, sz=0.75, rng=rng)
    return parts


# ----------------------------------------------------------------------------- street lights
def streetlight_parts(x, y, rz, base_z=0.0, head="lamp", pole="pole_paint", trim="trim_dark", banner=None, height=7.0):
    """rz: direction the mast arm points (local +Y rotated by rz)."""
    parts = []
    z = base_z
    dirv = Matrix.Rotation(rz, 3, "Z") @ Vector((0, 1, 0))
    side = Matrix.Rotation(rz, 3, "Z") @ Vector((1, 0, 0))
    parts += cyl(pole, (x, y, z), 0.34, 0.42, seg=8, r2=0.3)                 # octagonal base
    parts += cyl(trim, (x, y, z + 0.42), 0.22, 0.14, seg=8)                  # flange
    top = Vector((x, y, z + height))
    parts += tube(pole, (x, y, z + 0.5), top, 0.13, 0.085, seg=10, cap=True)
    for hz in (2.6, 4.9):
        parts += cyl(trim, (x, y, z + hz), 0.165, 0.1, seg=10, r2=0.15)
    # curved mast arm (quarter arc) + straight run
    Ra = 0.9
    c = top + dirv * Ra
    pts = [c - dirv * Ra * math.cos(t) + UP * Ra * math.sin(t) for t in [i * (math.pi / 2) / 6 for i in range(7)]]
    end = pts[-1] + dirv * 1.1
    pts.append(end)
    for a, b in zip(pts, pts[1:]):
        parts += tube(pole, a, b, 0.065, seg=6)
    parts += tube(pole, top - UP * 0.6, pts[3], 0.035, seg=5)                 # brace
    # lamp head: housing + sloped cap + glowing diffuser
    hp = end + dirv * 0.35
    parts += box(pole, tuple(hp - UP * 0.2), (0.46, 1.05, 0.2), rz)
    parts += box(pole, tuple(hp - UP * 0.0), (0.34, 0.85, 0.09), rz)
    parts += box(head, tuple(hp - UP * 0.235), (0.38, 0.92, 0.04), rz)
    parts += cyl(trim, tuple(top), 0.1, 0.25, seg=8, r2=0.03)                 # finial
    if banner:
        for hz in (5.7, 3.9):
            parts += tube(trim, (x, y, z + hz), tuple(Vector((x, y, z + hz)) + side * 0.85), 0.03, seg=5)
        bc = Vector((x, y, z + 4.8)) + side * 0.48
        parts += quad(banner, tuple(bc), 0.62, 1.7, rz + math.pi / 2, double=True)
    return parts


# ----------------------------------------------------------------------------- buildings
TRIM_FOR = {"fac_stone": "trim_stone", "fac_brick": "trim_stone", "fac_stucco": "trim_stone", "fac_sand": "trim_stone",
            "fac_granite": "trim_dark", "fac_glass": "trim_dark"}


def building_parts(x, y, w, d, h, rz=0.0, fac="fac_stone", rng=None, neon=None, roof="roof", shop=True):
    """Returns (parts, collider_boxes). collider_boxes: list of (loc, size, rz)."""
    rng = rng or random.Random(hash((round(x, 1), round(y, 1))))
    trim = TRIM_FOR.get(fac, "trim_stone")
    R = Matrix.Rotation(rz, 3, "Z")
    P = lambda lx, ly, lz: tuple(Vector((x, y, 0)) + R @ Vector((lx, ly, lz)))
    parts, cols = [], [((x, y, 0), (w, d, h), rz)]
    base_h = 4.2 if shop else 0.0
    if shop:
        parts += box("shopfront", (x, y, 0), (w - 0.5, d - 0.5, base_h), rz, top=False)
        parts += box(trim, (x, y, base_h), (w + 0.3, d + 0.3, 0.45), rz)
        for sx in (-1, 1):   # canopy over the long faces
            parts += box("trim_dark", P(0, sx * (d / 2 + 0.55), base_h - 0.55), (w * 0.8, 1.1, 0.12), rz)
    tiers = [(w, d, base_h + 0.45, h)]
    if h > 46 and rng.random() < 0.7:
        h1 = round(h * 0.62)
        tiers = [(w, d, base_h + 0.45, h1), (w * 0.76, d * 0.76, h1 + 0.6, h)]
        if h > 90 and rng.random() < 0.6:
            h2 = round(h * 0.84)
            tiers = [(w, d, base_h + 0.45, h1), (w * 0.76, d * 0.76, h1 + 0.6, h2), (w * 0.52, d * 0.52, h2 + 0.6, h)]
    for i, (tw, td, z0, z1) in enumerate(tiers):
        parts += box(fac, (x, y, z0), (tw, td, z1 - z0), rz, top_mat=roof)
        # floor ledges every 14 m (one facade tile)
        zz = (math.floor(z0 / 14) + 1) * 14
        while zz < z1 - 3:
            parts += box(trim, (x, y, zz - 0.14), (tw + 0.22, td + 0.22, 0.28), rz)
            zz += 14
        # corner quoins / pilasters
        for sx in (-1, 1):
            for sy in (-1, 1):
                parts += box(trim, P(sx * (tw / 2 - 0.35), sy * (td / 2 - 0.35), z0), (0.95, 0.95, z1 - z0), rz)
        # cornice + parapet
        parts += box(trim, (x, y, z1 - 0.15), (tw + 0.7, td + 0.7, 0.5), rz)
        parts += box(trim, (x, y, z1 + 0.35), (tw + 0.35, td + 0.35, 0.22), rz)
        for sx, sy, ww, dd in ((0, 1, tw, 0.3), (0, -1, tw, 0.3), (1, 0, 0.3, td), (-1, 0, 0.3, td)):
            parts += box(trim, P(sx * (tw / 2 - 0.15), sy * (td / 2 - 0.15), z1 + 0.57), (ww, dd, 0.9), rz)
    # rooftop clutter on the top tier
    tw, td, _, zt = tiers[-1]
    zr = zt + 0.57
    for k in range(rng.randint(2, 3)):
        lx, ly = rng.uniform(-tw * 0.3, tw * 0.3), rng.uniform(-td * 0.3, td * 0.3)
        parts += box("roof_metal", P(lx, ly, zr), (1.7, 1.1, 0.95), rz)
        parts += cyl("trim_dark", P(lx + 0.35, ly, zr + 0.95), 0.36, 0.08, seg=12)
        parts += cyl("trim_dark", P(lx - 0.4, ly, zr + 0.95), 0.36, 0.08, seg=12)
    bx, by = -tw * 0.25, td * 0.22
    parts += box(trim, P(bx, by, zr), (2.4, 2.0, 2.6), rz, top_mat=roof)      # stair bulkhead
    if zt < 46 and rng.random() < 0.55:   # timber water tank on legs
        tx, ty = tw * 0.22, -td * 0.18
        for lx, ly in ((-0.9, -0.9), (0.9, -0.9), (0.9, 0.9), (-0.9, 0.9)):
            parts += box("trim_dark", P(tx + lx, ty + ly, zr), (0.14, 0.14, 2.3), rz)
        parts += cyl("water_tank", P(tx, ty, zr + 2.3), 1.35, 2.6, seg=16)
        parts += cyl("roof_metal", P(tx, ty, zr + 4.9), 1.42, 0.9, seg=16, r2=0.08)
        for hz in (0.6, 1.9):
            parts += cyl("trim_dark", P(tx, ty, zr + 2.3 + hz), 1.38, 0.08, seg=16, cap=False)
    if zt >= 46:
        parts += cyl("trim_dark", P(0, 0, zr), 0.18, zt * 0.12, seg=6, r2=0.06)
        parts += blob("neon_red", P(0, 0, zr + zt * 0.12 + 0.2), 0.35, sz=1.0, jitter=0.0)
    if neon:   # one restrained accent: vertical strips on the two street-facing corners
        for sx in (-1, 1):
            parts += box(neon, P(sx * (w / 2 + 0.06), -d / 2 - 0.06, base_h + 0.5), (0.12, 0.12, min(h, tiers[0][3]) - base_h - 1.0), rz)
    return parts, cols
