"""Turn a scanned/AI tree model (e.g. Tripo FBX) into a game-ready instanced asset.

    blender -b -P blender/process_tree.py -- <tree.fbx> [out.glb]
    (TREE_PREVIEW=/path/preview.png also renders source | LOD0 | impostor side by side)

- normalises the tree: trunk base at the origin, +Z up, height 1.0 (the game scales each instance)
- cleans degenerate geometry, and decimates to TREE_LOD0 only if the model is heavier than LOD0_TRIS
- renders an impostor of LOD0 (orthographic, alpha) onto TREE_IMPOSTOR: two crossed alpha-tested cards for distance
- textures down to 1024 px; the metallic map (if any) is dropped
- exports public/assets/tree.glb; `npm run optimize:tree` then meshopt-compresses it
"""
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC = os.path.abspath(argv[0])
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(argv[1]) if len(argv) > 1 else os.path.join(HERE, '..', 'public', 'assets', 'tree.glb')
LOD0_TRIS = int(os.environ.get('TREE_TRIS', 24000))
TEX = 1024
IMP = 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
src = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# normalise: base centre at origin, height 1
bb = [Vector(c) for c in src.bound_box]
mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
h = mx.z - mn.z
src.location = (-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)
bpy.ops.object.transform_apply(location=True)
src.scale = (1 / h, 1 / h, 1 / h)
bpy.ops.object.transform_apply(scale=True)

def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)

# strip a display base: loose pieces that stay near the ground (plinth disc, pebbles, grass tufts) are removed,
# then the tree is re-seated so the trunk starts at z = 0.  TREE_BASE_CUT=0 disables it.
CUT = float(os.environ.get('TREE_BASE_CUT', 0.12))
if CUT > 0:
    import bmesh
    bm = bmesh.new(); bm.from_mesh(src.data); bm.verts.ensure_lookup_table()
    seen, kill = set(), []
    for v in bm.verts:
        if v.index in seen: continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            x = stack.pop(); comp.append(x)
            for e in x.link_edges:
                o = e.other_vert(x)
                if o.index not in seen: seen.add(o.index); stack.append(o)
        if max(c.co.z for c in comp) < CUT: kill += comp
    if kill and len(kill) < len(bm.verts):
        bmesh.ops.delete(bm, geom=kill, context='VERTS')
        z0 = min(v.co.z for v in bm.verts)
        for v in bm.verts: v.co.z -= z0
        top = max(v.co.z for v in bm.verts)
        for v in bm.verts: v.co *= 1.0 / top
        print('stripped base pieces:', len(kill), 'verts; trunk re-seated by', round(z0, 3))
    bm.to_mesh(src.data); bm.free(); src.data.update()

if tris(src) > LOD0_TRIS:
    # clean: AI meshes ship with duplicate verts / zero-area faces that stall the collapse decimator
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.mesh.dissolve_degenerate(threshold=0.0002)
    bpy.ops.mesh.delete_loose()
    bpy.ops.object.mode_set(mode='OBJECT')
# stand the tree up: centre on the trunk foot (not the bounding box, which a leaning crown drags sideways) and
# shear so the crown sits above the foot. The trunk keeps its curve; only the overall lean goes.
# TREE_UPRIGHT=0 keeps the original lean.
if os.environ.get('TREE_UPRIGHT', '1') != '0':
    # Find the trunk by colour (brown/orange texels, not the green fronds or grass tufts), trace its centreline in
    # height slices, and shift every vertex so that centreline becomes vertical. The crown rides along with the
    # trunk top. TREE_UPRIGHT=0 keeps the original lean.
    import bmesh
    me = src.data
    img = next((n.image for n in me.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and 'base' in n.image.name.lower()), None) \
        or next((n.image for n in me.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
    W_, H_ = img.size
    px = list(img.pixels)
    uvl = me.uv_layers.active.data
    vuv = {}
    for poly in me.polygons:
        for li in poly.loop_indices:
            vuv.setdefault(me.loops[li].vertex_index, uvl[li].uv)
    def brown(vi):
        u, v = vuv.get(vi, (0, 0))
        x, y = min(W_ - 1, max(0, int(u % 1 * W_))), min(H_ - 1, max(0, int(v % 1 * H_)))
        k = (y * W_ + x) * 4
        r, g, b = px[k], px[k + 1], px[k + 2]
        return r > g * 1.08 and r > b * 1.25 and r > 0.12
    trunk = [v for v in me.vertices if brown(v.index)]
    TOP = float(os.environ.get('TREE_TRUNK_TOP', 0.62)); STEP = 0.04
    zs, cs = [], []
    z = 0.0
    while z < TOP:
        pts = [v.co for v in trunk if z <= v.co.z < z + STEP]
        if len(pts) >= 3:
            zs.append(z + STEP / 2); cs.append(Vector((sum(q.x for q in pts) / len(pts), sum(q.y for q in pts) / len(pts))))
        z += STEP
    sm = [sum(cs[max(0, i - 1):i + 2], Vector((0, 0))) / len(cs[max(0, i - 1):i + 2]) for i in range(len(cs))]
    def centre(zz):
        if zz <= zs[0]: return sm[0]
        if zz >= zs[-1]: return sm[-1]
        i = max(j for j in range(len(zs)) if zs[j] <= zz); j = min(i + 1, len(zs) - 1)
        t = 0 if j == i else (zz - zs[i]) / (zs[j] - zs[i])
        return sm[i].lerp(sm[j], t)
    for v in me.vertices:
        d = centre(v.co.z); v.co.x -= d.x; v.co.y -= d.y
    me.update()
    print('upright: %d trunk verts, centreline' % len(trunk), [(round(zz, 2), round(c.x, 3), round(c.y, 3)) for zz, c in zip(zs, sm)])
print('source tris', tris(src), 'dims', tuple(round(d, 3) for d in src.dimensions))

# textures: downsample, drop metallic, rough dielectric foliage/bark
mat = src.data.materials[0]
for n in list(mat.node_tree.nodes):
    if n.type == 'TEX_IMAGE' and n.image:
        if 'metallic' in n.image.name.lower():
            mat.node_tree.nodes.remove(n); continue
        if max(n.image.size) > TEX: n.image.scale(TEX, TEX)
bsdf = mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Metallic'].default_value = 0.0
if not bsdf.inputs['Roughness'].is_linked: bsdf.inputs['Roughness'].default_value = 0.85
if hasattr(mat, 'blend_method'): mat.blend_method = 'OPAQUE'
mat.name = 'tree'

def decimate(obj, target):
    if tris(obj) <= target: return tris(obj)
    m = obj.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = target / tris(obj)
    m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=m.name)
    return tris(obj)

ref = None
if os.environ.get('TREE_PREVIEW'):   # keep a full-res copy for the comparison render
    ref = src.copy(); ref.data = src.data.copy(); ref.name = 'REF'
    bpy.context.collection.objects.link(ref); ref.location.x = -0.95
if tris(src) > 200000: decimate(src, 200000)
lod0 = src; lod0.name = lod0.data.name = 'TREE_LOD0'
print('TREE_LOD0 tris', decimate(lod0, LOD0_TRIS))
bpy.ops.object.select_all(action='DESELECT'); lod0.select_set(True); bpy.context.view_layer.objects.active = lod0
bpy.ops.object.shade_smooth()

scn = bpy.context.scene
ids = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
scn.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in ids else 'BLENDER_EEVEE'

# ---- impostor: orthographic front render of LOD0 under flat white ambient light (~albedo), transparent film
if ref: ref.hide_render = True
scn.render.film_transparent = True
scn.view_settings.view_transform = 'Standard'
scn.render.resolution_x = scn.render.resolution_y = IMP
scn.render.image_settings.file_format = 'PNG'; scn.render.image_settings.color_mode = 'RGBA'
scn.world = bpy.data.worlds.new('imp'); scn.world.use_nodes = True
bg = scn.world.node_tree.nodes['Background']; bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 1.0
W = 1.04   # card size (world units of the normalised tree)
icam = bpy.data.objects.new('impcam', bpy.data.cameras.new('impcam')); scn.collection.objects.link(icam)
icam.data.type = 'ORTHO'; icam.data.ortho_scale = W
icam.location = (0, -6, W / 2 - 0.02); icam.rotation_euler = (math.radians(90), 0, 0); scn.camera = icam
imp_path = os.path.join(os.path.dirname(OUT), '_tree_impostor.png')
scn.render.filepath = imp_path
bpy.ops.render.render(write_still=True)
img = bpy.data.images.load(imp_path); img.pack(); img.name = 'tree_impostor'
os.remove(imp_path)

# two crossed cards matching the ortho frame; normals point up so every card lights like a canopy
verts, faces, uvs = [], [], []
for ang in (0.0, math.pi / 2):
    c, s_ = math.cos(ang), math.sin(ang)
    b0 = len(verts)
    for (u, z, uv) in ((-W / 2, 0, (0, 0)), (W / 2, 0, (1, 0)), (W / 2, W, (1, 1)), (-W / 2, W, (0, 1))):
        verts.append((u * c, u * s_, z - 0.02)); uvs.append(uv)
    faces.append((b0, b0 + 1, b0 + 2, b0 + 3))
me = bpy.data.meshes.new('TREE_IMPOSTOR'); me.from_pydata(verts, [], faces); me.update()
uvl = me.uv_layers.new(name='UVMap')
for li, loop in enumerate(me.loops): uvl.data[li].uv = uvs[loop.vertex_index]
me.normals_split_custom_set([(0, 0, 1)] * len(me.loops))
imp = bpy.data.objects.new('TREE_IMPOSTOR', me); scn.collection.objects.link(imp)
im = bpy.data.materials.new('tree_impostor'); im.use_nodes = True
nt = im.node_tree; pb = nt.nodes['Principled BSDF']
t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
nt.links.new(t.outputs['Color'], pb.inputs['Base Color']); nt.links.new(t.outputs['Alpha'], pb.inputs['Alpha'])
pb.inputs['Roughness'].default_value = 0.9
if hasattr(im, 'blend_method'): im.blend_method = 'CLIP'
if hasattr(im, 'alpha_threshold'): im.alpha_threshold = 0.5
im.use_backface_culling = False
me.materials.append(im)

if ref: ref.hide_set(True)
bpy.ops.object.select_all(action='DESELECT')
for o in (lod0, imp): o.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True,
                          export_apply=True, export_image_format='WEBP', export_image_quality=85,
                          export_normals=True, export_tangents=False, export_extras=True)
print('exported', OUT, os.path.getsize(OUT) // 1024, 'KB')

# preview: source | LOD0 | impostor
if os.environ.get('TREE_PREVIEW'):
    imp.location.x = 0.95
    if ref: ref.hide_set(False); ref.hide_render = False
    scn.render.film_transparent = False
    bg.inputs[0].default_value = (0.55, 0.7, 0.9, 1); bg.inputs[1].default_value = 0.8
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scn.collection.objects.link(cam)
    cam.location = (0.0, -3.6, 0.5); cam.rotation_euler = (math.radians(88), 0, 0); scn.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 4; scn.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    scn.render.resolution_x, scn.render.resolution_y = 1200, 520
    scn.render.filepath = os.environ['TREE_PREVIEW']
    bpy.ops.render.render(write_still=True)
    print('preview', os.environ['TREE_PREVIEW'])
