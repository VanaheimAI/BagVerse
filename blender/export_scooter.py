# Punk scooter (Tripo model) -> public/assets/scooter.glb
#   blender -b -P blender/export_scooter.py -- <punk_scooter_3d_model.fbx> [out.glb]
# The source sits diagonally in a unit cube with one wheel lifted. This script:
#  - finds the long axis (PCA of the low geometry), turns it so the handlebar end points -Y (= +Z in three.js)
#  - levels it so both wheels touch the ground, centres it between the wheel contacts
#  - scales it to a ~1.42 m stylised kick scooter (handlebar ~1.05 m up) and adds SCT_DECK (rider stand point)
import bpy, sys, math, mathutils
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC = argv[0] if argv else 'blender/scooter/punk_scooter_3d_model.fbx'
OUT = argv[1] if len(argv) > 1 else 'public/assets/scooter.glb'
LENGTH = 1.42   # metres, front wheel tip to rear tip (handlebar grips end up ~1.05 m: right for 1.85 m riders)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)
o = next(x for x in bpy.context.scene.objects if x.type == 'MESH')
o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)   # bake the import transform
me = o.data

def verts(): return [v.co.copy() for v in me.vertices]

# ---- long axis from the low geometry (deck + wheels), handlebar end = front
V = verts()
low = [v for v in V if v.z < 0.35]
c = sum((v.xy for v in low), Vector((0, 0))) / len(low)
sxx = sum((v.x - c.x) ** 2 for v in low); syy = sum((v.y - c.y) ** 2 for v in low); sxy = sum((v.x - c.x) * (v.y - c.y) for v in low)
ang = 0.5 * math.atan2(2 * sxy, sxx - syy)          # principal axis angle
axis = Vector((math.cos(ang), math.sin(ang)))
hb = [v for v in V if v.z > 0.75]; hc = sum((v.xy for v in hb), Vector((0, 0))) / len(hb)
if (hc - c).dot(axis) > 0: axis = -axis               # axis now points from the front (handlebar) to the back
# rotate so axis -> +Y (back = +Y, front = -Y)
rot = math.atan2(axis.x, axis.y)                      # angle from +Y to axis (clockwise)
me.transform(Matrix.Rotation(rot, 4, 'Z'))
print('turned', round(math.degrees(rot), 1), 'deg')

# ---- level: lowest point near each end should both sit on z = 0
V = verts()
ymin, ymax = min(v.y for v in V if v.z < 0.35), max(v.y for v in V if v.z < 0.35)
span = ymax - ymin
front = [v for v in V if v.y < ymin + span * 0.3 and v.z < 0.3]
back = [v for v in V if v.y > ymax - span * 0.45 and v.z < 0.3]
pf = min(front, key=lambda v: v.z); pb = min(back, key=lambda v: v.z)
tilt = math.atan2(pb.z - pf.z, pb.y - pf.y)          # rear lifted by this angle
me.transform(Matrix.Translation(-pf) )
me.transform(Matrix.Rotation(-tilt, 4, 'X'))
V = verts(); z0 = min(v.z for v in V)
me.transform(Matrix.Translation((0, 0, -z0)))
print('levelled', round(math.degrees(tilt), 2), 'deg; contacts y', round(pf.y, 3), round(pb.y, 3))

# ---- centre between the ends of the low geometry, then scale to LENGTH
V = verts()
lowv = [v for v in V if v.z < 0.3]
y0, y1 = min(v.y for v in lowv), max(v.y for v in lowv)
xs = [v.x for v in lowv]
me.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(y0 + y1) / 2, 0)))
k = LENGTH / (y1 - y0)
me.transform(Matrix.Scale(k, 4))
V = verts()
print('dims', [round(max(v[i] for v in V) - min(v[i] for v in V), 3) for i in range(3)], 'scale', round(k, 3))

# ---- deck top behind the stem: the rider's stand point
deck = [v for v in V if abs(v.x) < 0.06 and -0.4 < v.y < -0.02 and v.z < 0.4]   # between the stem and the rear fin
dz = max(v.z for v in deck) if deck else 0.15
hbz = max(v.z for v in V)
print('deck top', round(dz, 3), 'handlebar top', round(hbz, 3))
# SCT_DECK = where the RIDER ROOT goes (feet origin), measured against the retargeted Ride loop: its hands sit
# 0.25-0.47 m ahead of the root at ~1.0 m, the deck foot 0.04-0.3 m ahead, the kick foot behind. The grips span
# 0.16-0.49 m ahead of centre (the stem leans back), so the root sits 0.04 m behind centre (Blender +Y), a touch up.
e = bpy.data.objects.new('SCT_DECK', None); bpy.context.scene.collection.objects.link(e)
e.location = (0, 0.04, 0.06)
o.name = 'SCT_BODY'; me.name = 'SCT_BODY'
for m in me.materials: m.name = 'SCT_Paint'

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_extras=False)
print('wrote', OUT)
