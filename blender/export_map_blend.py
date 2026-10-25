"""Turn the exported map GLB (tools/export_map.mjs) into an organised .blend.
   python3 blender/export_map_blend.py <in.glb> <out.blend>
Collections: Map (the city), Landmarks (vaults, GM arch, Doge statue, bull, Pepe bust), Props (city kit:
buildings, lights, bus stops, bushes, bins), Billboards, Trees. Instanced props/trees come in as linked
duplicates (one mesh shared by many objects). Textures are packed into the file. 1 Blender unit = 1 m, Z up."""
import sys, bpy

src, out = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src, merge_vertices=False)
scene = bpy.context.scene
root = bpy.data.objects.get('BagVerse_Map')
groups = [c for c in root.children] if root else []
for g in groups:
    col = bpy.data.collections.new(g.name.split('.')[0]); scene.collection.children.link(col)
    stack = [g]
    while stack:
        o = stack.pop(); stack.extend(o.children)
        for c in list(o.users_collection): c.objects.unlink(o)
        col.objects.link(o)
# tidy: drop empty-only leftovers? keep the hierarchy (parents keep the transforms); report counts
for col in scene.collection.children:
    meshes = sum(1 for o in col.all_objects if o.type == 'MESH')
    print(f'{col.name}: {len(col.all_objects)} objects, {meshes} meshes')
for img in bpy.data.images:
    if not img.packed_file and img.size[0]: img.pack()
scene.unit_settings.system = 'METRIC'
# a camera and sun so it opens looking at the plaza
cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')); scene.collection.objects.link(cam)
cam.location = (0, -140, 110); cam.rotation_euler = (0.95, 0, 0); cam.data.clip_end = 2000; scene.camera = cam
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); scene.collection.objects.link(sun)
sun.rotation_euler = (0.8, 0.2, 0.6); sun.data.energy = 4
for area in []: pass
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print('saved', out)
