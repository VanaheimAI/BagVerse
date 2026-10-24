# Vision 1789 (driveable hypercar) -> public/assets/vision.glb
# Source: "vision 1789" by amogusstrikesback2 on Sketchfab, CC-BY-4.0 (see LICENSES/).
#   blender -b -P blender/export_vision.py -- <scene.gltf> [out.glb]
# - trims the light-beam cones the glow mesh carries past the front bumper (they render as black streaks)
# - glow atlas material -> emissive VIS_Glow (the game draws it additively; brake / reverse glows get their own nodes)
# - stable node names the game drives: VIS_WHEEL_<FL|FR|BL|BR>_STEER / _SPIN, VIS_DOOR_L/R, VIS_BRAKE, VIS_REVERSE
# Car is 1:1 (4.84 m long, 2.13 m wide, 1.03 m tall); nose points -Y in Blender = +Z in three.js.
import bpy, bmesh, sys, mathutils

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC = argv[0] if argv else 'blender/vision/scene.gltf'
OUT = argv[1] if len(argv) > 1 else 'public/assets/vision.glb'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
objs = bpy.context.scene.objects

# ---- trim the beam cones (glow geometry in front of the bumper)
BUMPER_Y = -2.52
for o in list(objs):
    if o.type != 'MESH' or not o.name.startswith('lights_position_front_and_back'): continue
    bm = bmesh.new(); bm.from_mesh(o.data)
    mw = o.matrix_world
    dead = [v for v in bm.verts if (mw @ v.co).y < BUMPER_Y]
    # take whole connected islands that reach past the bumper: a beam is one island from lamp to tip
    seen, kill = set(), set()
    for v0 in dead:
        if v0 in seen: continue
        stack, isl = [v0], []
        while stack:
            v = stack.pop()
            if v in seen: continue
            seen.add(v); isl.append(v)
            for e in v.link_edges: stack.append(e.other_vert(v))
        kill.update(isl)
    print('beam verts removed', len(kill), 'of', len(bm.verts))
    bmesh.ops.delete(bm, geom=list(kill), context='VERTS')
    bm.to_mesh(o.data); bm.free()

# ---- names the game looks up
REN = {
    'bone_wheel_FL_steer': 'VIS_WHEEL_FL_STEER', 'bone_wheel_FR_steer': 'VIS_WHEEL_FR_STEER',
    'bone_wheel_BL_steer': 'VIS_WHEEL_BL_STEER', 'bone_wheel_BR_steer': 'VIS_WHEEL_BR_STEER',
    'bone_wheel_FL_rotation': 'VIS_WHEEL_FL_SPIN', 'bone_wheel_FR_rotation': 'VIS_WHEEL_FR_SPIN',
    'bone_wheel_BL_rotation': 'VIS_WHEEL_BL_SPIN', 'bone_wheel_BR_rotation': 'VIS_WHEEL_BR_SPIN',
    'detach_door_L_50.002': 'VIS_DOOR_L', 'detach_door_R_50.002': 'VIS_DOOR_R',
    'lights_brakes.005': 'VIS_BRAKE', 'lights_reverse.005': 'VIS_REVERSE',
}
for o in list(objs):
    for k, v in REN.items():
        if o.name == k or (o.name.startswith(k + '.') and k.endswith(('steer', 'rotation'))):
            o.name = v
print('named', sorted(o.name for o in objs if o.name.startswith('VIS_')))

# ---- materials
MAT = {'material_4': 'VIS_Paint', 'material': 'VIS_PaintMatte', '2.001': 'VIS_PaintMetal', 'material_6': 'VIS_Chrome',
       'Material.002': 'VIS_Details', 'Material.006': 'VIS_Tyres', 'Material.010': 'VIS_Glow', 'WheelBL_glass_light__0': 'VIS_Glass'}
for m in bpy.data.materials:
    if m.name in MAT: m.name = MAT[m.name]
g = bpy.data.materials['VIS_Glow']
b = g.node_tree.nodes['Principled BSDF']
tex = b.inputs['Base Color'].links[0].from_node
g.node_tree.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
b.inputs['Emission Strength'].default_value = 3.0
for l in list(b.inputs['Base Color'].links): g.node_tree.links.remove(l)
b.inputs['Base Color'].default_value = (0, 0, 0, 1)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False,
                          export_image_format='AUTO', export_extras=False, export_lights=False, export_cameras=False)
print('wrote', OUT)
