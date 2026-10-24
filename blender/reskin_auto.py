"""Re-skin a rigged mesh with Blender's automatic (bone heat) weights.
blender -b -P reskin_auto.py -- in.glb out.glb"""
import bpy, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
args = sys.argv[sys.argv.index("--") + 1:]
src, dst = args[0], args[1]
import fix_rig
tmp = os.path.join(HERE, "_reskin_fixed.glb"); fix_rig.main(src, tmp)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=tmp)
for o in list(bpy.data.objects):
    if o.type == "MESH" and o.parent is None: bpy.data.objects.remove(o, do_unlink=True)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
me = next(o for o in bpy.data.objects if o.type == "MESH" and o.parent)
# Bake the bind pose into the mesh first: Tripo's raw vertex space doesn't line up with the
# skeleton (only the bind matrices do), so evaluate through the old skin, then drop it.
dg = bpy.context.evaluated_depsgraph_get()
baked = bpy.data.meshes.new_from_object(me.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
mw = me.matrix_world.copy()
me.parent = None; me.matrix_world = mw
old = me.data; me.data = baked; bpy.data.meshes.remove(old)
me.modifiers.clear(); me.vertex_groups.clear()

bpy.context.view_layer.objects.active = me
bpy.ops.object.select_all(action="DESELECT"); me.select_set(True)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.object.mode_set(mode="OBJECT")
# finger/end bones produce noisy heat weights on a coarse mesh; they still get weights but that's fine
me.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
empty = [g.name for g in me.vertex_groups if not any(g.index in [x.group for x in v.groups] for v in me.data.vertices[:1])]
print("groups", len(me.vertex_groups), "verts", len(me.data.vertices))
# loose parts the heat solver can't reach (crown, chains) -> bind rigidly to the nearest bone
from mathutils.geometry import intersect_point_line
segs = []
for bn in arm.data.bones:
    if bn.name.endswith(("_End", "4")) or "Hand" in bn.name and bn.name[-1].isdigit():
        continue
    h = arm.matrix_world @ bn.head_local; t = arm.matrix_world @ bn.tail_local
    segs.append((bn.name, h, t))
fixed = 0
for v in me.data.vertices:
    if v.groups and max(g.weight for g in v.groups) > 0.01:
        continue
    co = me.matrix_world @ v.co
    best, bd = None, 1e9
    for name, h, t in segs:
        pt, f = intersect_point_line(co, h, t)
        f = min(1, max(0, f)); d = (co - (h + (t - h) * f)).length
        if d < bd: bd, best = d, name
    me.vertex_groups[best].add([v.index], 1.0, "REPLACE"); fixed += 1
print("rigidly bound loose verts", fixed)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_animations=False, export_image_format="WEBP")
print("EXPORTED", dst)
