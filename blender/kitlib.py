"""Shared helpers for placing Cartoon City kit assets (see export_kit.py) from the world scripts.

Markers are empties named KIT_<asset>_<n> with custom props kit / rz / sx / sy / sz (Blender axes); the game's
src/kit.js draws each one as a GPU instance. Conventions of our generators that these helpers translate:
  - street lamps / traffic lights: `rz` is the direction the arm reaches (local +Y rotated by rz)
  - cars: nose along local +X rotated by rz
"""
import json, math, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
INFO = json.load(open(os.path.join(HERE, "kit_assets.json")))
# the user's car models (blender/export_cars.py -> public/assets/cars.glb): same conventions as kit cars (nose -Y)
_cars_json = os.path.join(HERE, "cars_assets.json")
if os.path.exists(_cars_json):
    INFO.update(json.load(open(_cars_json)))
_n = [0]

BUILDINGS = ["Eco_Building_Grid", "Eco_Building_Slope", "Eco_Building_Terrace", "Regular_Building_TwistedTower_Large"]
CARS = sorted(k for k in INFO if k.startswith("CAR_"))   # Black Race Touring, Silver Retro, Flying Transport x paints
if not CARS:
    CARS = ["Car_13", "Car_16", "Futuristic_Car_1", "Car_19"]


def marker(empty, asset, x, y, z=0.0, rz=0.0, sx=1.0, sy=1.0, sz=1.0, **extra):
    _n[0] += 1
    empty(f"KIT_{asset}_{_n[0]:04d}", (x, y, z), kit=asset, rz=round(rz % (2 * math.pi), 4),
          sx=round(sx, 4), sy=round(sy, 4), sz=round(sz, 4), **extra)


def _arm_angle(asset):
    ax, ay = INFO[asset]["arm"]
    return math.atan2(ay, ax)   # direction of the arm in the asset's own space


def pole(empty, asset, x, y, rz_arm, z=0.0, scale=1.0):
    """place a lamp / traffic light so its arm reaches along local +Y rotated by rz_arm"""
    want = rz_arm + math.pi / 2           # +Y rotated by rz_arm, as an angle from +X
    marker(empty, asset, x, y, z, want - _arm_angle(asset), scale, scale, scale)


def car(empty, asset, x, y, rz_nose_x, z=0.0):
    """place a kit car with its nose along local +X rotated by rz_nose_x"""
    nose = math.pi / 2 if INFO[asset].get("nose", -1) > 0 else -math.pi / 2   # nose angle in asset space
    marker(empty, asset, x, y, z, rz_nose_x - nose)


_uses = {}


def fit_building(w, d, h, rz, rng=random, max_h=92.0):
    """Pick a kit building for a w x d footprint of height h (local axes rotated by rz).
    Returns (asset, rz, sx, sy, sz, (sizex, sizey, sizez)) or None when no kit model fits without visible distortion.
    Footprint scale may differ by up to 25% between x and y; repeats of the same model are penalised."""
    if h > max_h:
        return None
    best = []
    for name in BUILDINGS:
        kw, kd, kh = INFO[name]["size"]
        for turn in (0.0, math.pi / 2):
            a, b = (kw, kd) if turn == 0 else (kd, kw)
            sx, sy = w / a, d / b
            aspect = max(sx, sy) / min(sx, sy)
            if aspect > 1.9:
                continue
            g = math.sqrt(sx * sy)
            k = min(aspect, 1.25) ** 0.5                     # allowed squash, split between the two axes
            fx, fy = (g * k, g / k) if sx > sy else (g / k, g * k)
            fx, fy = min(fx, sx * 1.05), min(fy, sy * 1.05)  # never spill far past the lot
            sz = h / kh
            ratio = sz / math.sqrt(fx * fy)
            if not 0.62 <= ratio <= 1.6:
                continue
            score = abs(math.log(aspect)) * 0.6 + abs(math.log(ratio)) * 0.7 + 0.22 * _uses.get(name, 0)
            best.append((score, name, turn, fx, fy, sz, (a * fx, b * fy, kh * sz)))
    if not best:
        return None
    best.sort()
    pool = [b for b in best if b[0] < best[0][0] + 0.2]
    score, name, turn, fx, fy, sz, size = rng.choice(pool)
    _uses[name] = _uses.get(name, 0) + 1
    flip = math.pi if rng.random() < 0.5 else 0.0
    return name, rz + turn + flip, fx, fy, sz, size
