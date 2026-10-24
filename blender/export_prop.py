"""
BagVerse - static prop export (Tripo FBX with PBR maps -> web GLB).
Centres the model on its footprint with the base at z = 0, keeps the PBR maps (base colour, normal,
roughness, metallic), caps textures for the web, and exports ../public/assets/<name>.glb.

  blender -b -P export_prop.py -- props/bull/<file>.fbx bull 1024
"""
import bpy, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[sys.argv.index("--") + 1:]
SRC, NAME = os.path.join(HERE, ARGS[0]), ARGS[1]
MAX_TEX = int(ARGS[2]) if len(ARGS) > 2 else 1024
OUT = os.path.join(HERE, "..", "public", "assets", NAME + ".glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for o in bpy.data.objects:
    if o.type not in ("MESH",):
        bpy.data.objects.remove(o, do_unlink=True)

# apply transforms, then put the footprint centre at the origin and the base on the ground
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
off = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
for o in meshes:
    o.data.transform(__import__("mathutils").Matrix.Translation(-off))
    o.data.update()
print("SIZE", NAME, [round(v, 3) for v in (hi - lo)])

for img in bpy.data.images:
    if img.size[0] > MAX_TEX or img.size[1] > MAX_TEX:
        f = MAX_TEX / max(img.size)
        img.scale(int(img.size[0] * f), int(img.size[1] * f))

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_image_format="WEBP", export_image_quality=85,
                          export_animations=False)
print("EXPORTED", OUT)
