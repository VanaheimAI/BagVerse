"""Export the Cartoon City kit pieces BagVerse uses into public/assets/kit.glb + blender/kit_assets.json.

    blender -b -P blender/export_kit.py -- <Cartoon_City_Free.blend>

Each exported asset is one root node named after the kit object. Its origin is moved to:
  - the base centre of its bounding box (buildings, cars, bushes, props), or
  - the foot of its pole (street lamps, traffic lights), so the arm can be aimed over the road.
kit_assets.json records each asset's size (Blender axes, metres) and, for poles, the arm direction, and for cars
the direction the nose points - the world scripts (build_world.py / bag_square_hero.py) read it to place markers.
Materials are renamed KIT_<name> (the night-only window meshes get `fac_kit_nightlight`, so the game's Look
switches them on at sunset/night like the other lit windows). Glass is made opaque (cheaper, no sorting).
"""
import bpy, sys, os, json, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'assets', 'kit.glb')
JSON = os.path.join(HERE, 'kit_assets.json')

ASSETS = {
    # name: kind
    'Eco_Building_Grid': 'building', 'Eco_Building_Slope': 'building', 'Eco_Building_Terrace': 'building',
    'Regular_Building_TwistedTower_Large': 'building',
    'Spotlight_01': 'pole', 'Spotlight_02': 'pole',
    'traffic_light_001': 'pole', 'traffic_light_002': 'pole', 'traffic_light_003': 'pole',
    'Car_06': 'car', 'Car_13': 'car', 'Car_16': 'car', 'Car_19': 'car', 'Futuristic_Car_1': 'car', 'Van': 'car',
    'Bush_06': 'prop', 'Bush_07': 'prop', 'Bush_10': 'prop', 'Palm_03': 'prop',
    'Fountain_03': 'prop', 'Bus_Stop_02': 'prop', 'Signboard_01': 'prop',
    'Trash_Can_04': 'prop', 'Trash_Can_06': 'prop', 'Trash_Can_07': 'prop', 'Trash_Can_08': 'prop', 'Trash_06': 'prop',
}

bpy.ops.wm.open_mainfile(filepath=os.path.abspath(argv[0]))
scn = bpy.context.scene


def subtree(o):
    out = [o]
    for c in o.children:
        out += subtree(c)
    return out


# --- materials: prefix, opaque glass, night windows on their own material
seen = set()
night = bpy.data.materials.new('fac_kit_nightlight'); night.use_nodes = True
nb = night.node_tree.nodes['Principled BSDF']
nb.inputs['Base Color'].default_value = (0.05, 0.06, 0.09, 1)
nb.inputs['Emission Color'].default_value = (1.0, 0.72, 0.38, 1); nb.inputs['Emission Strength'].default_value = 2.0
for name in ASSETS:
    for o in subtree(bpy.data.objects[name]):
        if o.type != 'MESH':
            continue
        if 'NightLight' in o.name:
            o.data = o.data.copy()
            o.data.materials.clear(); o.data.materials.append(night)
            continue
        for m in o.data.materials:
            if m and m.name not in seen and not m.name.startswith('KIT_') and m.name != 'fac_kit_nightlight':
                seen.add(m.name)
                p = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m.node_tree else None
                if p and m.name == 'Glass':
                    p.inputs['Alpha'].default_value = 1.0
                    p.inputs['Roughness'].default_value = 0.08
                    if hasattr(m, 'blend_method'): m.blend_method = 'OPAQUE'
                    if hasattr(m, 'surface_render_method'): m.surface_render_method = 'DITHERED'
                m.name = 'KIT_' + m.name

# shrink big textures (palette stays 1024)
for img in bpy.data.images:
    if img.size[0] > 1024 and img.name not in ('Render Result',):
        img.scale(1024, 1024)

info = {}
roots = []
for name, kind in ASSETS.items():
    o = bpy.data.objects[name]
    for c in o.children_recursive:   # unparent nothing; just make sure everything is visible / selectable
        c.hide_set(False); c.hide_viewport = False
    o.location = (0, 0, 0); o.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    vs = []
    for m in subtree(o):
        if m.type == 'MESH' and 'NightLight' not in m.name:
            mw = m.matrix_world
            vs += [mw @ v.co for v in m.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    rec = {'kind': kind, 'size': [round(mx.x - mn.x, 3), round(mx.y - mn.y, 3), round(mx.z - mn.z, 3)]}
    if kind == 'pole':
        foot = [v for v in vs if v.z < mn.z + 0.4]
        org = Vector((sum(v.x for v in foot) / len(foot), sum(v.y for v in foot) / len(foot), mn.z))
        top = [v for v in vs if v.z > mn.z + (mx.z - mn.z) * 0.6]
        tc = Vector((sum(v.x for v in top) / len(top), sum(v.y for v in top) / len(top), 0))
        arm = Vector((tc.x - org.x, tc.y - org.y, 0))
        rec['arm'] = [round(arm.x, 3), round(arm.y, 3)]
        rec['reach'] = round(max(abs(mn.x - org.x), abs(mx.x - org.x), abs(mn.y - org.y), abs(mx.y - org.y)), 3)
    else:
        org = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    if kind == 'car':
        # nose = side with the headlights (emissive material nearer that end) -> fall back to -Y
        lights = []
        for m in subtree(o):
            if m.type != 'MESH':
                continue
            for poly in m.data.polygons:
                mat = m.data.materials[poly.material_index] if m.data.materials else None
                if mat and ('Headlights' in mat.name or 'Emissive' in mat.name):
                    lights.append((m.matrix_world @ poly.center).y)
        tail = []
        for m in subtree(o):
            if m.type != 'MESH':
                continue
            for poly in m.data.polygons:
                mat = m.data.materials[poly.material_index] if m.data.materials else None
                if mat and 'Taillights' in mat.name:
                    tail.append((m.matrix_world @ poly.center).y)
        cy = (mn.y + mx.y) / 2
        if 'Headlights' in str([mm.name for mm in o.data.materials]) and lights:
            nose = 1 if sum(lights) / len(lights) > cy else -1
        elif tail:
            nose = -1 if sum(tail) / len(tail) > cy else 1
        else:
            nose = -1
        rec['nose'] = nose   # +1: nose points +Y, -1: nose points -Y (Blender axes)
    o.location = -org
    info[name] = rec
    roots.append(o)

# soft, hand-painted edges (same idea as build_world.bevel_pass): rounded bevel + hardened normals, applied on export
import math
BEVEL_SEG = int(os.environ.get('BEVEL_SEG', '2'))
BEVEL_W = {'building': 0.12, 'prop': 0.03, 'pole': 0.015}
nbev = 0
if BEVEL_SEG > 0:
    for name, kind in ASSETS.items():
        if kind not in BEVEL_W or name.startswith(('Bush', 'Palm')):
            continue
        for m in subtree(bpy.data.objects[name]):
            if m.type != 'MESH' or 'NightLight' in m.name or not m.data.polygons:
                continue
            for poly in m.data.polygons:
                poly.use_smooth = True
            md = m.modifiers.new('soft_edges', 'BEVEL')
            md.width = BEVEL_W[kind]; md.segments = BEVEL_SEG; md.limit_method = 'ANGLE'; md.angle_limit = math.radians(35)
            md.harden_normals = True; md.use_clamp_overlap = True; md.miter_outer = 'MITER_ARC'
            nbev += 1
print('KIT BEVEL meshes', nbev)

bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for o in roots:
    for m in subtree(o):
        m.hide_set(False)
        m.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_image_format='AUTO', export_normals=True, export_tangents=False, export_extras=True,
                          export_animations=False, export_lights=False, export_cameras=False)
json.dump(info, open(JSON, 'w'), indent=1)
print('exported', OUT, os.path.getsize(OUT) // 1024, 'KB;', len(roots), 'assets')
for k, v in info.items():
    print(k, v)
