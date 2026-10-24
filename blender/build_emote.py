"""
BagVerse - long emote clips, exported separately from the character GLBs so they load on first use.

Imports a character's rig exactly like build_character.py (so rest pose and node names match the game GLB),
retargets one Mixamo clip, or several consecutive parts stitched into one, and exports an animation-only GLB
(armature nodes + one animation, no mesh) to ../public/assets/<name>_<clip>.glb.

Run headless:
  blender -b -P build_emote.py -- <character src> <name> <Clip> <part1.fbx> [part2.fbx ...]
e.g.
  blender -b -P build_emote.py -- maria_src.fbx maria Thriller anims/Thriller_Part_1.fbx ... anims/Thriller_Part_4.fbx
"""
import bpy, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import retarget

ARGS = sys.argv[sys.argv.index("--") + 1:]
SRC, NAME, CLIP, PARTS = os.path.join(HERE, ARGS[0]), ARGS[1], ARGS[2], [os.path.join(HERE, p) for p in ARGS[3:]]
OUT = os.path.join(HERE, "..", "public", "assets", f"{NAME}_{CLIP.lower()}.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30
if SRC.lower().endswith(".fbx"):
    bpy.ops.import_scene.fbx(filepath=SRC)
else:
    import fix_rig
    FIXED = os.path.join(HERE, NAME + "_fixed.glb")
    fix_rig.main(SRC, FIXED)
    bpy.ops.import_scene.gltf(filepath=FIXED)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)

arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
# keep the skinned meshes until after retargeting (harmless), then drop every mesh: animation only
if len(PARTS) == 1:
    # DRIFT=linear: steady travel (e.g. the scooter Ride loop) is removed exactly, so the loop seam stays put
    retarget.retarget_clip(arm, PARTS[0], CLIP, in_place=True, smooth_drift=0 if os.environ.get("DRIFT") == "linear" else 45)
else:
    retarget.retarget_sequence(arm, PARTS, CLIP)
for o in list(bpy.data.objects):
    if o.type != "ARMATURE":
        bpy.data.objects.remove(o, do_unlink=True)
for p in arm.pose.bones:
    p.location = (0, 0, 0); p.rotation_quaternion = (1, 0, 0, 0); p.rotation_euler = (0, 0, 0); p.scale = (1, 1, 1)

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_force_sampling=True,
    export_optimize_animation_size=True,
    export_def_bones=False,
)
print("EXPORTED", OUT)
