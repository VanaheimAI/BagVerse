"""
BagVerse - texture generator for The Bag Square hero district.
Writes tileable PBR-ish maps (albedo / normal / emissive / ORM) and sign artwork to blender/textures/.
Run with any Python 3 that has numpy + Pillow:   python3 blender/gen_textures.py
All artwork is original. Palette follows the Bag Square spec.
"""
import os, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "textures")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(11)
random.seed(11)

HEX = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255.0
CONCRETE, ASPHALT, MARBLE, GOLD = HEX("#3A3852"), HEX("#1E1D2B"), HEX("#D6D4E0"), HEX("#E6B800")
CYAN, MAGENTA, PURPLE, BTC = HEX("#00F0FF"), HEX("#FF007F"), HEX("#B829FF"), HEX("#FFB800")
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_C = "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf"


# ----------------------------------------------------------------------------- helpers
def blur(a, r):
    for _ in range(3):
        a = sum(np.roll(a, k, 0) for k in range(-r, r + 1)) / (2 * r + 1)
        a = sum(np.roll(a, k, 1) for k in range(-r, r + 1)) / (2 * r + 1)
    return a


def fbm(n, octaves=5, base=4):
    """tileable fractal noise in 0..1: each octave is a periodic random grid, upsampled from a 3x3 tiling
    and cropped to the centre so the result wraps seamlessly."""
    out = np.zeros((n, n), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        g = base * 2 ** o
        grid = np.tile(rng.random((g, g)).astype(np.float32), (3, 3))
        img = Image.fromarray(grid, mode="F").resize((3 * n, 3 * n), Image.BICUBIC)
        a = np.asarray(img, np.float32)[n:2 * n, n:2 * n]
        out += a * amp; tot += amp; amp *= 0.5
    out /= tot
    return (out - out.min()) / (out.max() - out.min() + 1e-6)


def normal_from_height(h, strength=4.0):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack([-dx, dy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def save(name, arr, size=None):
    arr = np.clip(arr, 0, 1)
    if arr.ndim == 2:
        arr = np.dstack([arr] * 3)
    img = Image.fromarray((arr[..., :3] * 255).astype(np.uint8))
    if size:
        img = img.resize((size, size) if isinstance(size, int) else size, Image.LANCZOS)
    img.save(os.path.join(OUT, name + ".png"), optimize=True)


def colorize(t, c0, c1):
    return c0[None, None, :] * (1 - t[..., None]) + c1[None, None, :] * t[..., None]


# ----------------------------------------------------------------------------- hand-painted sets
# Stylised PBR sets in blender/textures_src/<set>/{color,normal,rough,ao,metal}.png (normal = OpenGL, +Y).
# Facades use them as the wall surface behind the generated windows; other materials use them directly.
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "textures_src")


def hp(name, key, size=1024):
    p = os.path.join(SRC, name, key + ".png")
    if not os.path.exists(p):
        return None
    im = Image.open(p).convert("RGB" if key in ("color", "normal") else "L")
    if im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im, np.float32) / 255.0


def tile(arr, rep, S=1024):
    """repeat a (tileable) map rep x rep times inside an S x S texture"""
    u8 = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    k = int(math.ceil(S / rep))
    small = np.asarray(u8.resize((k, k), Image.LANCZOS), np.float32) / 255.0
    t = np.tile(small, (rep, rep) + ((1,) if small.ndim == 3 else ()))
    return t[:S, :S]


def retint(col, target, amount):
    """move a texture's hue toward `target` while keeping its painted light/dark detail"""
    lum = col.mean(axis=2, keepdims=True)
    t = np.array(target, np.float32)
    rec = lum * t[None, None, :] / max(float(t.mean()), 1e-3)
    return col * (1 - amount) + rec * amount


def hp_set(name, rep=1, tint=None, amount=0.0, S=1024):
    """(albedo, normal, roughness, ao, metal) of a hand-painted set, tiled rep x rep"""
    c = hp(name, "color")
    if c is None:
        return None
    if tint is not None:
        c = retint(c, tint, amount)
    get = lambda k, d: tile(hp(name, k) if hp(name, k) is not None else np.full((1024, 1024), d, np.float32), rep, S)
    return tile(c, rep, S), get("normal", 0.5) if hp(name, "normal") is not None else None, get("rough", 0.8), get("ao", 1.0), get("metal", 0.0)


N = 1024

# ----------------------------------------------------------------------------- 1. slate concrete panels
def concrete():
    n = fbm(N, 6, 4)
    grime = blur(rng.random((N, N)).astype(np.float32), 18)
    grime = (grime - grime.min()) / (grime.max() - grime.min())
    col = colorize(n * 0.35 + 0.65, CONCRETE * 0.75, CONCRETE * 1.15)
    col *= (0.85 + 0.15 * grime)[..., None]
    h = n * 0.3
    seam = np.zeros((N, N), np.float32)
    for k in range(0, N, N // 4):
        seam[k:k + 4, :] = 1; seam[:, k:k + 4] = 1
    # tie holes
    for y in range(N // 8, N, N // 4):
        for x in range(N // 8, N, N // 4):
            for dx, dy in ((-60, -60), (60, -60), (-60, 60), (60, 60)):
                yy, xx = np.ogrid[-6:7, -6:7]
                m = (xx ** 2 + yy ** 2) <= 30
                seam[(y + dy - 6):(y + dy + 7), (x + dx - 6):(x + dx + 7)][m] = 0.7
    col *= (1 - 0.45 * seam)[..., None]
    h -= seam * 0.6
    save("concrete_albedo", col); save("concrete_normal", normal_from_height(blur(h, 1), 6), 512)


# ----------------------------------------------------------------------------- 2. asphalt
def asphalt():
    n = fbm(N, 6, 8)
    speck = (rng.random((N, N)) > 0.985).astype(np.float32)
    col = colorize(n * 0.5 + 0.5, ASPHALT * 0.8, ASPHALT * 1.35) + speck[..., None] * 0.08
    cracks = blur(rng.random((N, N)).astype(np.float32), 3)
    cracks = (np.abs(cracks - 0.5) < 0.004).astype(np.float32)
    col *= (1 - 0.4 * cracks)[..., None]
    save("asphalt_albedo", col); save("asphalt_normal", normal_from_height(n * 0.4 + speck * 0.5 - cracks * 0.5, 5), 512)


# ----------------------------------------------------------------------------- 3. marble + ashlar blocks
def marble(ashlar=False):
    y, x = np.mgrid[0:N, 0:N].astype(np.float32) / N
    turb = fbm(N, 6, 2)
    v = np.sin((x * 3 + y * 1.5) * 2 * math.pi + turb * 9)
    veins = np.exp(-np.abs(v) * 9) * 0.55 + np.exp(-np.abs(np.sin((x - y) * 4 * math.pi + turb * 14)) * 22) * 0.35
    col = MARBLE[None, None, :] * (1 - veins[..., None] * 0.35) + np.array([0.55, 0.5, 0.65])[None, None, :] * veins[..., None] * 0.2
    col *= (0.96 + 0.06 * fbm(N, 4, 8))[..., None]
    h = veins * 0.1
    if ashlar:
        rows = 4
        for r in range(rows):
            y0 = r * N // rows
            col[y0:y0 + 4, :] *= 0.62; h[y0:y0 + 4, :] -= 0.8
            off = (N // 4) if r % 2 else 0
            for c in range(2):
                x0 = (off + c * N // 2) % N
                col[y0:y0 + N // rows, x0:x0 + 4] *= 0.62; h[y0:y0 + N // rows, x0:x0 + 4] -= 0.8
    name = "marble_ashlar" if ashlar else "marble"
    save(name + "_albedo", col); save(name + "_normal", normal_from_height(blur(h, 1), 5), 512)


# ----------------------------------------------------------------------------- 4. burgundy brick
def brick():
    col = np.zeros((N, N, 3), np.float32)
    h = np.zeros((N, N), np.float32)
    mortar = HEX("#4a3a4e")
    rows, cols = 16, 4
    bh, bw = N // rows, N // cols
    base = [HEX("#6b2440"), HEX("#5a1f3c"), HEX("#7a2c4a"), HEX("#4f2244"), HEX("#68284e")]
    n = fbm(N, 5, 16)
    for r in range(rows):
        off = bw // 2 if r % 2 else 0
        for c in range(-1, cols + 1):
            x0 = c * bw + off; y0 = r * bh
            b = base[random.randrange(len(base))] * random.uniform(0.85, 1.12)
            xs = slice(max(0, x0 + 3), min(N, x0 + bw - 3)); ys = slice(y0 + 3, y0 + bh - 3)
            col[ys, xs] = b; h[ys, xs] = 0.6
    m = h == 0
    col[m] = mortar
    col *= (0.85 + 0.3 * n)[..., None]
    save("brick_albedo", col); save("brick_normal", normal_from_height(blur(h, 1) + n * 0.15, 4), 512)


# ----------------------------------------------------------------------------- 7. hex pavers with circuit tracks
def hex_paver():
    y, x = np.mgrid[0:N, 0:N].astype(np.float32)
    s = N / 8.0   # 8 hexes across per tile
    # axial hex coordinates (pointy)
    q = (x * math.sqrt(3) / 3 - y / 3) / (s / 1.5)
    r = (y * 2 / 3) / (s / 1.5)
    # cube rounding
    cx, cz = q, r; cy = -cx - cz
    rx, ry, rz = np.round(cx), np.round(cy), np.round(cz)
    dx, dy, dz = np.abs(rx - cx), np.abs(ry - cy), np.abs(rz - cz)
    m1 = (dx > dy) & (dx > dz); m2 = (~m1) & (dy > dz)
    rx = np.where(m1, -ry - rz, rx); ry = np.where(m2, -rx - rz, ry); rz = np.where(~m1 & ~m2, -rx - ry, rz)
    d = np.maximum(np.maximum(np.abs(rx - cx), np.abs(ry - cy)), np.abs(rz - cz))
    edge = d > 0.43
    tone = (np.sin(rx * 12.9898 + rz * 78.233) * 43758.5453) % 1.0
    slate = HEX("#2a2838")
    col = slate[None, None, :] * (0.8 + 0.4 * tone[..., None]) * (0.9 + 0.2 * fbm(N, 4, 8))[..., None]
    col[edge] = HEX("#141320")
    h = np.where(edge, 0.0, 0.6).astype(np.float32)
    # circuit tracks
    em = np.zeros((N, N, 3), np.float32)
    img = Image.new("RGB", (N, N)); dr = ImageDraw.Draw(img)
    for color, count in ((CYAN, 7), (MAGENTA, 5)):
        c = tuple(int(v * 255) for v in color)
        for _ in range(count):
            px, py = random.randrange(N), random.randrange(N)
            pts = [(px, py)]
            for _ in range(random.randint(3, 6)):
                dxv, dyv = random.choice([(1, 0), (0, 1), (1, 1), (1, -1), (-1, 0), (0, -1)])
                L = random.randint(60, 220)
                px, py = px + dxv * L, py + dyv * L
                pts.append((px, py))
            for ox in (-N, 0, N):
                for oy in (-N, 0, N):
                    dr.line([(a + ox, b + oy) for a, b in pts], fill=c, width=5)
                    for a, b in (pts[0], pts[-1]):
                        dr.ellipse([a + ox - 9, b + oy - 9, a + ox + 9, b + oy + 9], outline=c, width=4)
    e = np.asarray(img, np.float32) / 255.0
    em = e
    col = col * (1 - (e.max(axis=2) > 0)[..., None] * 0.7) + e * 0.7
    h = np.where(e.max(axis=2) > 0, 0.3, h)
    save("hexpaver_albedo", col); save("hexpaver_emissive", em); save("hexpaver_normal", normal_from_height(blur(h, 1), 4), 512)


# ----------------------------------------------------------------------------- 8. brushed gold (albedo + ORM: R=AO G=rough B=metal)
def gold():
    streak = blur(rng.random((N, N)).astype(np.float32), 1)
    streak = np.asarray(Image.fromarray((streak * 255).astype(np.uint8)).resize((N * 8, N)).resize((N, N)), np.float32) / 255
    streak = blur(np.repeat(streak.mean(axis=1, keepdims=True), N, 1) * 0.6 + streak * 0.4, 1)
    col = GOLD[None, None, :] * (0.85 + 0.25 * streak[..., None])
    orm = np.dstack([np.ones((N, N)), 0.22 + 0.15 * streak, np.ones((N, N))])
    save("gold_albedo", col, 512); save("gold_orm", orm, 512)


# ----------------------------------------------------------------------------- 9. dark metal hull panels
def metal_hull():
    base = HEX("#22222e")
    n = fbm(N, 5, 8)
    col = colorize(n * 0.4 + 0.6, base * 0.8, base * 1.3)
    h = np.ones((N, N), np.float32) * 0.5
    rects = [(0, 0, 512, 256), (512, 0, 512, 256), (0, 256, 256, 512), (256, 256, 768, 256), (256, 512, 384, 256),
             (640, 512, 384, 256), (0, 768, 512, 256), (512, 768, 512, 256)]
    for x0, y0, w, hh in rects:
        col[y0:y0 + 4, x0:x0 + w] *= 0.4; col[y0:y0 + hh, x0:x0 + 4] *= 0.4
        h[y0:y0 + 4, x0:x0 + w] = 0; h[y0:y0 + hh, x0:x0 + 4] = 0
        for rx in range(x0 + 20, x0 + w - 10, 64):
            for ry in (y0 + 16, y0 + hh - 16):
                yy, xx = np.ogrid[-5:6, -5:6]; m = xx ** 2 + yy ** 2 <= 20
                sub = h[ry - 5:ry + 6, rx - 5:rx + 6]
                if sub.shape == m.shape:
                    sub[m] = 1.0; col[ry - 5:ry + 6, rx - 5:rx + 6][m] = base * 2.2
    save("hull_albedo", col); save("hull_normal", normal_from_height(blur(h, 1), 5), 512)


# ----------------------------------------------------------------------------- 10. storefront interior (fake interior glow)
def storefront():
    W, H = 1024, 512
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    grad = np.clip(1 - y / H, 0, 1)
    pink, orange = np.array([1.0, 0.35, 0.7]), np.array([1.0, 0.6, 0.25])
    col = (pink[None, None, :] * (1 - x[..., None] / W) + orange[None, None, :] * (x[..., None] / W)) * (0.35 + 0.65 * grad[..., None])
    img = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)); dr = ImageDraw.Draw(img)
    # back-wall shelving + racks silhouettes (perspective room)
    dr.polygon([(0, H), (220, 330), (W - 220, 330), (W, H)], fill=(60, 20, 50))
    for i in range(6):
        x0 = 240 + i * 92
        dr.rectangle([x0, 150, x0 + 70, 330], fill=(40, 10, 40))
        for k in range(4):
            dr.rectangle([x0 + 6, 165 + k * 42, x0 + 64, 175 + k * 42], fill=(255, 210, 120))
    for i in range(5):   # arcade cabinets
        x0 = 60 + i * 200
        dr.polygon([(x0, H), (x0 + 20, 300), (x0 + 110, 300), (x0 + 130, H)], fill=(25, 5, 30))
        dr.rectangle([x0 + 35, 320, x0 + 95, 370], fill=random.choice([(0, 240, 255), (255, 0, 127), (184, 41, 255)]))
    dr.rectangle([0, 0, W, 40], fill=(255, 230, 240))   # ceiling light strip
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    img.save(os.path.join(OUT, "storefront_emissive.png"))
    # daytime albedo: the same interior seen through tinted glass (dim, desaturated) with a sky sheen
    e = np.asarray(img, np.float32) / 255.0
    l = e.mean(axis=2, keepdims=True)
    yy = np.linspace(1, 0, e.shape[0])[:, None, None]
    alb = (0.55 * l + 0.45 * e) * 0.32 + np.array([0.20, 0.26, 0.34]) * (0.4 + 0.5 * yy)
    save("storefront_albedo", alb, (1024, 512))


# ----------------------------------------------------------------------------- 11. sidewalk + hazard
def sidewalk():
    n = fbm(N, 5, 8)
    base = HEX("#5a586e")
    col = colorize(n * 0.3 + 0.7, base * 0.85, base * 1.1)
    h = np.ones((N, N), np.float32) * 0.5
    for k in range(0, N, N // 2):
        col[k:k + 6, :] *= 0.5; col[:, k:k + 6] *= 0.5; h[k:k + 6, :] = 0; h[:, k:k + 6] = 0
    save("sidewalk_albedo", col); save("sidewalk_normal", normal_from_height(blur(h, 1) + n * 0.2, 4), 512)
    # hazard stripes (yellow/black 45 deg)
    y, x = np.mgrid[0:256, 0:256]
    s = ((x + y) // 32) % 2
    col = np.where(s[..., None] == 0, np.array([0.95, 0.78, 0.05]), np.array([0.05, 0.05, 0.06]))
    save("hazard_albedo", col)


# ----------------------------------------------------------------------------- 12. needle gradient (spire tips)
def gradient():
    W, H = 64, 512
    t = np.linspace(1, 0, H)[:, None]
    col = (MAGENTA[None, None, :] * (t[..., None] ** 1.5) + PURPLE[None, None, :] * 0.25 * (1 - t[..., None])) * np.ones((1, W, 1))
    save("spire_gradient", col, (W, H))


# ----------------------------------------------------------------------------- signs & screens (emissive artwork)
def font(sz, cond=False):
    return ImageFont.truetype(FONT_C if cond else FONT_B, sz)


def glow_text(img, xy, text, f, fill, glow=None, anchor="mm", blur_r=10):
    if glow:
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).text(xy, text, font=f, fill=glow, anchor=anchor)
        layer = layer.filter(ImageFilter.GaussianBlur(blur_r))
        img.alpha_composite(layer)
    ImageDraw.Draw(img).text(xy, text, font=f, fill=fill, anchor=anchor)


def signs():
    # THE AD CANYON curved banner: cyan lightbox, dark bold text
    W, H = 2048, 384
    img = Image.new("RGBA", (W, H), (0, 240, 255, 255))
    dr = ImageDraw.Draw(img)
    for y in range(H):
        a = int(40 * (1 - abs(y - H / 2) / (H / 2)))
        dr.line([(0, y), (W, y)], fill=(min(255, 0 + a * 3), 240, 255, 255))
    dr.rectangle([10, 10, W - 10, H - 10], outline=(10, 30, 50, 255), width=10)
    glow_text(img, (W // 2, H // 2 + 6), "THE AD CANYON", font(190), (16, 20, 40, 255))
    img.convert("RGB").save(os.path.join(OUT, "sign_adcanyon.png"))

    # Tall A: "THE ADR" + original cartoon portrait (purple/pink)
    W, H = 512, 1536
    img = Image.new("RGBA", (W, H), (30, 6, 50, 255)); dr = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        dr.line([(0, y), (W, y)], fill=(int(120 + 100 * t), int(10 + 20 * t), int(160 + 60 * (1 - t)), 255))
    dr.rounded_rectangle([18, 18, W - 18, H - 18], 40, outline=(255, 120, 230, 255), width=12)
    glow_text(img, (W // 2, 170), "THE", font(120), (255, 255, 255, 255), (255, 0, 160, 255))
    glow_text(img, (W // 2, 320), "ADR", font(190), (255, 255, 255, 255), (255, 0, 160, 255))
    # portrait: original character - round face, visor shades, crown-less cap, grin
    cx, cy = W // 2, 900
    dr.ellipse([cx - 190, cy - 210, cx + 190, cy + 210], fill=(255, 196, 150, 255), outline=(40, 0, 60, 255), width=10)
    dr.pieslice([cx - 200, cy - 260, cx + 200, cy + 60], 180, 360, fill=(0, 220, 255, 255), outline=(40, 0, 60, 255), width=10)
    dr.rectangle([cx - 230, cy - 110, cx + 60, cy - 70], fill=(0, 180, 220, 255), outline=(40, 0, 60, 255), width=8)
    dr.rounded_rectangle([cx - 150, cy - 30, cx + 150, cy + 50], 30, fill=(20, 0, 40, 255))
    dr.line([(cx - 120, cy - 5), (cx - 40, cy - 5)], fill=(255, 0, 160, 255), width=10)
    dr.line([(cx + 40, cy - 5), (cx + 120, cy - 5)], fill=(255, 0, 160, 255), width=10)
    dr.arc([cx - 100, cy + 40, cx + 100, cy + 150], 15, 165, fill=(40, 0, 60, 255), width=14)
    dr.ellipse([cx + 150, cy + 20, cx + 200, cy + 90], fill=(255, 196, 150, 255), outline=(40, 0, 60, 255), width=8)
    glow_text(img, (W // 2, 1300), "OPEN 24/7", font(70), (255, 220, 250, 255), (255, 0, 160, 255))
    img.convert("RGB").save(os.path.join(OUT, "sign_adr.png"))

    # Tall B: red/orange corner wrap, bold text + yellow emblem
    img = Image.new("RGBA", (W, H)); dr = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        dr.line([(0, y), (W, y)], fill=(255, int(60 + 110 * t), int(20 + 20 * t), 255))
    dr.rectangle([14, 14, W - 14, H - 14], outline=(255, 230, 120, 255), width=10)
    ex, ey = W // 2, 260
    dr.ellipse([ex - 170, ey - 170, ex + 170, ey + 170], fill=(255, 210, 0, 255), outline=(120, 30, 0, 255), width=12)
    star = [(ex + math.cos(a) * r, ey + math.sin(a) * r) for k in range(10) for a, r in [(-math.pi / 2 + k * math.pi / 5, 120 if k % 2 == 0 else 50)]]
    dr.polygon(star, fill=(200, 40, 0, 255))
    for i, ch in enumerate("ARCADE"):
        glow_text(img, (W // 2, 560 + i * 160), ch, font(170), (255, 255, 240, 255), (255, 240, 0, 255), blur_r=8)
    img.convert("RGB").save(os.path.join(OUT, "sign_corner.png"))

    # Tall C: gold holographic ticker with abstract token icons
    img = Image.new("RGBA", (W, H), (40, 26, 0, 255)); dr = ImageDraw.Draw(img)
    for y in range(0, H, 6):
        dr.line([(0, y), (W, y)], fill=(70, 46, 0, 255), width=2)
    glow_text(img, (W // 2, 110), "BAG", font(120), (255, 220, 90, 255), (255, 184, 0, 255))
    glow_text(img, (W // 2, 220), "INDEX", font(80), (255, 220, 90, 255), (255, 184, 0, 255))
    shapes = ["hex", "circle", "diamond", "tri", "circle", "hex"]
    for i, sh in enumerate(shapes):
        cy = 380 + i * 185
        c = (255, 196, 40, 255)
        if sh == "hex":
            dr.regular_polygon((110, cy, 55), 6, outline=c, width=10)
        elif sh == "circle":
            dr.ellipse([55, cy - 55, 165, cy + 55], outline=c, width=10); dr.ellipse([85, cy - 25, 135, cy + 25], fill=c)
        elif sh == "diamond":
            dr.regular_polygon((110, cy, 60), 4, outline=c, width=10)
        else:
            dr.regular_polygon((110, cy, 60), 3, outline=c, width=10)
        up = random.random() > 0.35
        dr.text((200, cy - 40), f"{random.uniform(0.5, 99):.2f}", font=font(64), fill=(255, 230, 150, 255))
        dr.text((200, cy + 20), ("▲ " if up else "▼ ") + f"{random.uniform(0.5, 18):.1f}%", font=font(44), fill=(120, 255, 120, 255) if up else (255, 90, 90, 255))
    img.convert("RGB").save(os.path.join(OUT, "sign_ticker.png"))

    # Central tower stack: TPL header / crest / token / side panel
    img = Image.new("RGBA", (1024, 416), (0, 30, 40, 255)); dr = ImageDraw.Draw(img)
    for y in range(0, 416, 5):
        dr.line([(0, y), (1024, y)], fill=(0, 50, 64, 255), width=2)
    dr.rectangle([12, 12, 1011, 403], outline=(0, 240, 255, 255), width=12)
    glow_text(img, (512, 208), "TPL", font(300), (220, 255, 255, 255), (0, 240, 255, 255), blur_r=18)
    img.convert("RGB").save(os.path.join(OUT, "screen_tpl.png"))

    img = Image.new("RGBA", (512, 512), (16, 4, 40, 255)); dr = ImageDraw.Draw(img)
    shield = [(256, 60), (430, 120), (410, 300), (256, 460), (102, 300), (82, 120)]
    lay = Image.new("RGBA", (512, 512), (0, 0, 0, 0)); ImageDraw.Draw(lay).line(shield + [shield[0]], fill=(255, 0, 127, 255), width=30)
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(14)))
    dr = ImageDraw.Draw(img)
    dr.line(shield + [shield[0]], fill=(255, 120, 200, 255), width=12)
    dr.line([(256, 110), (256, 410)], fill=(60, 140, 255, 255), width=12)
    dr.line([(130, 210), (382, 210)], fill=(60, 140, 255, 255), width=12)
    dr.regular_polygon((256, 210, 48), 4, fill=(255, 0, 127, 255))
    img.convert("RGB").save(os.path.join(OUT, "screen_crest.png"))

    img = Image.new("RGBA", (512, 512), (10, 0, 20, 255)); dr = ImageDraw.Draw(img)
    for r in range(250, 0, -6):
        t = r / 250
        dr.ellipse([256 - r, 256 - r, 256 + r, 256 + r], fill=(int(184 * t + 40), int(41 * t), int(255 * t + 20 * (1 - t)), 255))
    dr.ellipse([46, 46, 466, 466], outline=(240, 200, 255, 255), width=12)
    dr.ellipse([96, 96, 416, 416], outline=(240, 200, 255, 255), width=6)
    glow_text(img, (256, 256), "$BAG", font(110), (255, 255, 255, 255), (255, 0, 255, 255))
    img.convert("RGB").save(os.path.join(OUT, "screen_token.png"))

    img = Image.new("RGBA", (512, 1024), (40, 0, 30, 255)); dr = ImageDraw.Draw(img)
    for i in range(14):
        y = 60 + i * 66
        w = random.randint(140, 440)
        dr.rectangle([36, y, 36 + w, y + 34], fill=(255, 0, 127, 255) if i % 3 else (0, 240, 255, 255))
    glow_text(img, (256, 960), "LIVE", font(110), (255, 255, 255, 255), (255, 0, 127, 255))
    img.convert("RGB").save(os.path.join(OUT, "screen_side.png"))


# ----------------------------------------------------------------------------- architectural facades
def _wall_noise(n, tint, amount=0.08, scale=8):
    t = fbm(n, 5, scale)
    return colorize(t, np.array(tint) * (1 - amount), np.array(tint) * (1 + amount))


def facade(name, wall, glass=(0.42, 0.52, 0.62), style="punched", bays=4, floors=4, lit=0.22, frame=(0.12, 0.12, 0.14),
           brickwork=False, size=1024, hp_wall=None, hp_rep=4, hp_tint=None, hp_amount=0.0):
    """Realistic window facade. 1 tile = `bays` window bays x `floors` storeys (~3.5 m each).
    Writes <name>_albedo / _normal / _orm (G=roughness, B=metal) / _emissive. Lit windows live ONLY in the
    emissive map (warm interiors), so the daytime albedo has no coloured squares."""
    S = size
    wall = np.array(wall, np.float32)
    col = _wall_noise(S, wall)
    hpw = hp_set(hp_wall, hp_rep, hp_tint, hp_amount, S) if hp_wall else None
    if hpw is not None:   # hand-painted wall surface; windows, frames and ledges are drawn over it
        col = hpw[0].copy()
        wall = np.clip(col.reshape(-1, 3).mean(0), 0, 1)
        brickwork = False
    if brickwork:   # fine running-bond texture in the wall
        bh = S // (floors * 14)
        for r in range(0, S, bh):
            col[r:r + 2, :] *= 0.86
            off = (r // bh) % 2 * (bh * 2)
            for c in range(off, S, bh * 4):
                col[r:r + bh, c:c + 2] *= 0.88
        col *= (0.92 + 0.16 * rng.random((S // bh + 1, S // (bh * 4) + 1)).repeat(bh, 0).repeat(bh * 4, 1)[:S, :S])[..., None]
    hgt = np.ones((S, S), np.float32) * 0.7
    rough = np.full((S, S), 0.85, np.float32); metal = np.zeros((S, S), np.float32)
    em = np.zeros((S, S, 3), np.float32)
    bw, fh = S // bays, S // floors
    trim = np.clip(wall * 1.18 + 0.05, 0, 1)
    gl = np.array(glass, np.float32); fr = np.array(frame, np.float32)
    for f in range(floors):
        y0 = f * fh
        # floor ledge / spandrel band
        col[y0 + fh - 10:y0 + fh, :] = trim * 0.95; hgt[y0 + fh - 10:y0 + fh, :] = 0.95
        col[y0 + fh:y0 + fh + 3, :] *= 0.7
        for b in range(bays):
            x0 = b * bw
            if style == "curtain":
                wx0, wx1, wy0, wy1 = x0 + 6, x0 + bw - 6, y0 + 8, y0 + fh - 16
            else:
                wx0, wx1, wy0, wy1 = x0 + int(bw * 0.2), x0 + int(bw * 0.8), y0 + int(fh * 0.18), y0 + int(fh * 0.8)
            H, W = wy1 - wy0, wx1 - wx0
            yy = np.linspace(0, 1, H)[:, None]; xx = np.linspace(0, 1, W)[None, :]
            # glass reflecting the sky: light at the top, darker below, a soft diagonal sheen
            g = np.broadcast_to(gl[None, None, :] * (1.15 - 0.55 * yy[..., None]), (H, W, 3)).copy()
            g += 0.10 * np.clip(1 - np.abs((xx - yy * 0.7) - 0.25) * 5, 0, 1)[..., None]
            g *= 0.92 + 0.12 * rng.random()
            blinds = rng.random()
            if blinds < 0.3:      # half-lowered blinds (neutral, not coloured)
                cut = int(H * rng.uniform(0.15, 0.55))
                bl = np.array([0.78, 0.76, 0.70]) * rng.uniform(0.8, 1.0)
                g[:cut] = bl * (0.9 + 0.1 * (np.arange(cut)[:, None, None] % 6 < 3))
            col[wy0:wy1, wx0:wx1] = g
            hgt[wy0:wy1, wx0:wx1] = 0.25
            rough[wy0:wy1, wx0:wx1] = 0.06; metal[wy0:wy1, wx0:wx1] = 0.35
            # frame + mullion + transom
            t = 7
            for (a0, a1, b0, b1) in ((wy0 - t, wy0, wx0 - t, wx1 + t), (wy1, wy1 + t, wx0 - t, wx1 + t),
                                     (wy0, wy1, wx0 - t, wx0), (wy0, wy1, wx1, wx1 + t),
                                     (wy0, wy1, (wx0 + wx1) // 2 - 3, (wx0 + wx1) // 2 + 3),
                                     (wy0 + int(H * 0.28) - 3, wy0 + int(H * 0.28) + 3, wx0, wx1)):
                col[a0:a1, b0:b1] = fr; hgt[a0:a1, b0:b1] = 0.55; rough[a0:a1, b0:b1] = 0.4; metal[a0:a1, b0:b1] = 0.8
            if style != "curtain":   # stone sill + lintel with a soft shadow under the sill
                col[wy1 + t:wy1 + t + 12, wx0 - 16:wx1 + 16] = trim; hgt[wy1 + t:wy1 + t + 12, wx0 - 16:wx1 + 16] = 1.0
                col[wy1 + t + 12:wy1 + t + 20, wx0 - 16:wx1 + 16] *= 0.75
                col[wy0 - t - 10:wy0 - t, wx0 - 10:wx1 + 10] = trim * 0.97; hgt[wy0 - t - 10:wy0 - t, wx0 - 10:wx1 + 10] = 0.95
            if rng.random() < lit:
                warm = np.array([1.0, 0.78, 0.48]) * rng.uniform(0.55, 0.95)
                em[wy0:wy1, wx0:wx1] = warm * (0.75 + 0.25 * yy[..., None])
        if style != "curtain":   # pilasters between bays
            for b in range(bays + 1):
                xc = (b * bw) % S
                if hpw is not None:
                    col[y0:y0 + fh, max(0, xc - 10):xc + 10] = np.clip(col[y0:y0 + fh, max(0, xc - 10):xc + 10] * 1.08, 0, 1)
                else:
                    col[y0:y0 + fh, max(0, xc - 10):xc + 10] = np.clip(wall * 1.06, 0, 1)
                hgt[y0:y0 + fh, max(0, xc - 10):xc + 10] = 0.85
    if style == "curtain":
        col = col * 0.97
    # weathering: subtle vertical streaks below sills, grime at the base of each storey
    streak = blur(rng.random((S, S)).astype(np.float32), 2)
    streak = np.repeat(streak[:1, :], S, 0) * 0.5 + streak * 0.5
    col *= (0.96 + 0.06 * streak)[..., None]
    nrm = normal_from_height(blur(hgt, 1), 3.5)
    if hpw is not None:   # painted wall normals/roughness wherever the generated pass left plain wall
        plain = (np.abs(hgt - 0.7) < 1e-4)
        if hpw[1] is not None:
            nrm = np.where(plain[..., None], hpw[1], nrm)
        rough = np.where(plain, hpw[2], rough)
    save(name + "_albedo", col)
    save(name + "_normal", nrm, None if hpw is not None else 512)
    save(name + "_orm", np.dstack([np.ones((S, S)), rough, metal]), 512)
    save(name + "_emissive", em, 512)


def facades():
    # Cartoon City kit style: clean white / pale frames, bright blue glass, a few warm lit panels at night.
    # 1 facade tile = bays x floors (~3.5 m each)
    KB = (0.20, 0.47, 0.90)                    # kit glass blue
    facade("fac_stone", (0.90, 0.91, 0.93), glass=KB, frame=(0.78, 0.81, 0.86))                          # white office
    facade("fac_brick", (0.93, 0.90, 0.85), glass=(0.22, 0.50, 0.88), frame=(0.95, 0.56, 0.22))          # warm white, orange frames
    facade("fac_stucco", (0.74, 0.83, 0.93), glass=(0.16, 0.40, 0.84), bays=5, frame=(0.92, 0.94, 0.97))  # pale blue
    facade("fac_sand", (0.96, 0.92, 0.80), glass=(0.18, 0.62, 0.78), frame=(0.88, 0.84, 0.72))           # cream, teal glass
    facade("fac_granite", (0.46, 0.51, 0.60), glass=(0.24, 0.50, 0.92), frame=(0.82, 0.85, 0.90))        # slate tower
    facade("fac_glass", (0.85, 0.88, 0.93), glass=(0.20, 0.50, 0.94), style="curtain", bays=6, floors=4, lit=0.18,
           frame=(0.90, 0.92, 0.96))
    # hero district: central tower curtain wall + art-deco stone
    facade("curtain", (0.86, 0.89, 0.94), glass=(0.18, 0.46, 0.92), style="curtain", bays=8, floors=8, lit=0.18,
           frame=(0.92, 0.94, 0.97))
    facade("deco", (0.88, 0.86, 0.94), glass=(0.20, 0.44, 0.88), bays=6, floors=6, lit=0.2, frame=(0.70, 0.62, 0.86))


def shopfront():
    """ground-floor shopfront: framed dark glass, door, blank fascia band (day albedo) + warm interior (emissive)."""
    W, Hh = 1024, 512
    col = np.zeros((Hh, W, 3), np.float32); em = np.zeros_like(col)
    col[:] = np.array([0.86, 0.88, 0.91])                                    # kit style: white frame
    col[0:80] = np.array([0.93, 0.94, 0.96])                                  # fascia
    yy = np.linspace(0, 1, Hh - 110)[:, None, None]
    glass = np.array([0.20, 0.47, 0.90]) * (1.15 - 0.45 * yy)
    for i in range(4):
        x0, x1 = 20 + i * 250, 250 + i * 250 - 20
        col[95:Hh - 15, x0:x1] = glass[:Hh - 110]
        inter = np.array([1.0, 0.8, 0.55]) * (0.35 + 0.5 * (1 - yy[:Hh - 110]))
        em[95:Hh - 15, x0:x1] = inter
        col[95:Hh - 15, (x0 + x1) // 2 - 3:(x0 + x1) // 2 + 3] = np.array([0.80, 0.83, 0.88])
    for x in range(0, W, 250):
        col[:, max(0, x - 10):x + 10] = np.array([0.78, 0.81, 0.86])
    col[Hh - 15:] = np.array([0.62, 0.64, 0.68])
    save("shopfront_albedo", col, (1024, 512)); save("shopfront_emissive", em, (512, 256))


def foliage():
    """stylised leaf clumps (painted look) + bark."""
    S = 512
    big = fbm(S, 4, 4); small = fbm(S, 5, 16)
    clump = np.clip((big * 0.6 + small * 0.4 - 0.35) * 2.2, 0, 1)
    col = colorize(clump, np.array([0.10, 0.30, 0.10]), np.array([0.42, 0.72, 0.22]))
    col += (small[..., None] > 0.72) * np.array([0.06, 0.08, 0.02])
    save("leaf_albedo", col); save("leaf_normal", normal_from_height(blur(clump * 0.7 + small * 0.3, 1), 6))
    y, x = np.mgrid[0:S, 0:S].astype(np.float32) / S
    ridges = np.sin((x * 18 + fbm(S, 4, 4) * 3) * math.pi) * 0.5 + 0.5
    col = colorize(ridges * 0.6 + fbm(S, 5, 8) * 0.4, np.array([0.18, 0.11, 0.07]), np.array([0.40, 0.28, 0.18]))
    save("bark_albedo", col); save("bark_normal", normal_from_height(blur(ridges, 1), 4))


def handpainted():
    """replace the procedural base materials with the hand-painted sets (when present in textures_src)"""
    def orm(ao, r, m): return np.dstack([ao, r, m])
    # asphalt: Cartoon City kit style - flat dark grey with a very soft tonal variation, no cracks
    n = fbm(1024, 5, 6)
    col = colorize(n * 0.5 + 0.25, np.array([0.255, 0.265, 0.285]), np.array([0.31, 0.32, 0.34]))
    save("asphalt_albedo", col)
    save("asphalt_normal", normal_from_height(blur(fbm(1024, 4, 32), 1) * 0.3, 1.5), 512)
    save("asphalt_orm", np.dstack([np.ones((1024, 1024)), np.full((1024, 1024), 0.78), np.zeros((1024, 1024))]), 512)
    # sidewalks: the kit's paving tiles
    kt = hp_set("kit_tiles", 1)
    if kt:
        save("sidewalk_albedo", kt[0]); save("sidewalk_normal", kt[1]); save("sidewalk_orm", orm(kt[3], kt[2], kt[4]))
    # concrete (planters, kerbs, bases): clean light grey
    n = fbm(1024, 4, 8)
    save("concrete_albedo", colorize(n * 0.4 + 0.5, np.array([0.74, 0.76, 0.79]), np.array([0.84, 0.85, 0.88])))
    save("concrete_normal", normal_from_height(blur(n, 1) * 0.2, 1.5), 512)
    save("concrete_orm", np.dstack([np.ones((1024, 1024)), np.full((1024, 1024), 0.82), np.zeros((1024, 1024))]), 512)
    # "brick" (hero Ad Canyon block walls): kit-style white panel cladding
    S = 1024; col = np.ones((S, S, 3), np.float32) * np.array([0.90, 0.91, 0.94]); hh = np.ones((S, S), np.float32)
    for k in range(0, S, S // 4):
        col[k:k + 5, :] *= 0.86; hh[k:k + 5, :] = 0.6
    for k in range(0, S, S // 2):
        col[:, k:k + 5] *= 0.88; hh[:, k:k + 5] = 0.6
    col *= (0.97 + 0.03 * fbm(S, 4, 4))[..., None]
    save("brick_albedo", col); save("brick_normal", normal_from_height(blur(hh, 1), 3), 512)
    save("brick_orm", np.dstack([np.ones((S, S)), np.full((S, S), 0.7), np.zeros((S, S))]), 512)
    gr = hp_set("ground", 1)                                              # park lawns
    if gr:
        save("ground_albedo", gr[0]); save("ground_normal", gr[1]); save("ground_orm", orm(gr[3], gr[2], gr[4]))
    mp = hp_set("metalplates", 1)                                         # dark metal, roofs, hulls
    if mp:
        save("metalplates_albedo", mp[0]); save("metalplates_normal", mp[1]); save("metalplates_orm", orm(mp[3], mp[2], np.maximum(mp[4], 0.35)))
    # "hull" (hub, portals, kiosks, gantries): kit-style light grey-blue panels
    S = 1024; col = np.ones((S, S, 3), np.float32) * np.array([0.70, 0.75, 0.82]); hh = np.ones((S, S), np.float32)
    for k in range(0, S, S // 4):
        col[k:k + 6, :] *= 0.82; hh[k:k + 6, :] = 0.5
    for k in range(0, S, S // 4):
        col[:, k:k + 6] *= 0.85; hh[:, k:k + 6] = 0.5
    col *= (0.96 + 0.04 * fbm(S, 4, 4))[..., None]
    save("hull_albedo", col); save("hull_normal", normal_from_height(blur(hh, 1), 3), 512)
    mo = hp_set("metalorange", 1)                                         # gold / painted metal props
    if mo:
        save("gold_albedo", mo[0]); save("gold_normal", mo[1]); save("gold_orm", orm(mo[3], mo[2], mo[4]))


for f in (concrete, asphalt, lambda: marble(False), lambda: marble(True), brick, facades, shopfront, foliage, hex_paver,
          gold, metal_hull, storefront, sidewalk, gradient, signs, handpainted):
    f()
print("textures ->", OUT, len(os.listdir(OUT)), "files")
