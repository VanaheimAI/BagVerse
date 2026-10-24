"""
BagVerse - character prep.
Imports a Mixamo-rigged character (.fbx straight from Mixamo, or a Tripo/other .glb),
authors placeholder animation clips (Idle, Walk, Run, Jump, Fall, Wave, Dance) directly on
the mixamorig bones and exports a game-ready GLB to ../public/assets/<name>.glb.

Run headless:   blender -b -P build_character.py -- king_src.glb king
                blender -b -P build_character.py -- maria_src.fbx maria
or in the Blender Scripting tab (edit SRC/NAME below).

Works with T-pose (Mixamo) and A-pose (Tripo) rest poses: arm poses are measured from the
rest pose, and translation is scaled to the rig's units.

Replace these clips later with real Mixamo animations: name your actions
Idle / Walk / Run / Jump / Fall / Wave / Dance and the game picks them up automatically.
"""
import bpy, math, os
from mathutils import Vector, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() else os.getcwd()
import sys
sys.path.insert(0, HERE)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SRC = os.path.join(HERE, ARGS[0] if ARGS else "king_src.glb")
NAME = ARGS[1] if len(ARGS) > 1 else "king"
OUT = os.path.join(HERE, "..", "public", "assets", NAME + ".glb")
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FPS
if SRC.lower().endswith(".fbx"):
    bpy.ops.import_scene.fbx(filepath=SRC)
    for a in list(bpy.data.actions):          # Mixamo ships a 2-frame T-pose take
        bpy.data.actions.remove(a)
else:
    sys.path.insert(0, HERE)
    import fix_rig  # Tripo rigs ship with identity joint nodes -> rebuild rest pose from bind matrices
    FIXED = os.path.join(HERE, NAME + "_fixed.glb")
    fix_rig.main(SRC, FIXED)
    bpy.ops.import_scene.gltf(filepath=FIXED)

# drop stray helper meshes that aren't skinned to the armature
for o in list(bpy.data.objects):
    if o.type == "MESH" and o.parent is None:
        bpy.data.objects.remove(o, do_unlink=True)

arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm.animation_data_create()
P = arm.pose.bones

# Derive the rig's facing axes from the skeleton itself (armature space).
_b = arm.data.bones
UP = (_b["mixamorig:Head"].head_local - _b["mixamorig:Hips"].head_local).normalized()
_toe = (_b["mixamorig:LeftToeBase"].head_local - _b["mixamorig:LeftFoot"].head_local)
FWD = (_toe - UP * _toe.dot(UP)).normalized()
LEFT = UP.cross(FWD).normalized()
print("rig axes FWD", FWD, "LEFT", LEFT, "UP", UP)
print("left-arm side check (should be > 0):", (_b["mixamorig:LeftArm"].head_local - _b["mixamorig:Hips"].head_local).dot(LEFT))

# rig units (Mixamo FBX = cm, glTF = m): king's hips->head is 0.344 units
UNIT = (_b["mixamorig:Head"].head_local - _b["mixamorig:Hips"].head_local).length / 0.344
# how far the rest-pose arm hangs from vertical (Tripo A-pose ~28deg, Mixamo T-pose ~90deg);
# the poses below were authored for the A-pose, so pre-rotate other rigs to match it
_armdir = (_b["mixamorig:LeftForeArm"].head_local - _b["mixamorig:LeftArm"].head_local).normalized()
REST_ARM = math.degrees(_armdir.angle(-UP))
DROP_ADJ = REST_ARM - 28.0
print(f"units x{UNIT:.2f}, rest arm {REST_ARM:.1f} deg from vertical, arm pre-rotation {DROP_ADJ:.1f}")


def B(n):
    return P.get("mixamorig:" + n)


def rot(bone, *pairs):
    """pairs: (armature_axis, degrees) applied in order, expressed in the bone's rest frame."""
    m = bone.bone.matrix_local.to_3x3().inverted()
    q = Quaternion()
    if bone.name.endswith("LeftArm"):
        pairs = ((FWD, -DROP_ADJ),) + pairs
    elif bone.name.endswith("RightArm"):
        pairs = ((FWD, DROP_ADJ),) + pairs
    elif bone.name.endswith(("LeftForeArm", "LeftHand", "RightForeArm", "RightHand")):
        # lower-arm axes were authored for the A-pose: carry them through the same pre-rotation
        sgn = -1 if "Left" in bone.name else 1
        R = Quaternion(FWD, math.radians(sgn * DROP_ADJ))
        pairs = tuple((R @ ax, deg) for ax, deg in pairs)
    for axis, deg in pairs:
        q = Quaternion((m @ axis).normalized(), math.radians(deg)) @ q
    bone.rotation_mode = "QUATERNION"
    bone.rotation_quaternion = q


def loc(bone, vec):
    bone.location = bone.bone.matrix_local.to_3x3().inverted() @ (vec * UNIT)


def reset():
    for b in P:
        b.rotation_mode = "QUATERNION"
        b.rotation_quaternion = Quaternion()
        b.location = Vector()


def key_all(frame):
    for b in P:
        b.keyframe_insert("rotation_quaternion", frame=frame)
        b.keyframe_insert("location", frame=frame)


def arms_relaxed(l=0.0, r=0.0, elbow=-12):
    # bring A-pose arms closer to the body; l/r = forward(-)/back(+) swing degrees
    rot(B("LeftArm"), (FWD, -16), (LEFT, l))
    rot(B("RightArm"), (FWD, 16), (LEFT, r))
    rot(B("LeftForeArm"), (LEFT, elbow))
    rot(B("RightForeArm"), (LEFT, elbow))


def make_action(name, frames, pose_fn, loop=True):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    for f in range(frames + (1 if loop else 0)):
        reset()
        pose_fn((f % frames) / frames if loop else f / max(frames - 1, 1))
        key_all(f)
    # park it on an NLA track so the exporter keeps it as its own clip
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 0, act)
    arm.animation_data.action = None
    return act


S = math.sin
TAU = math.tau


def idle(t):
    b = S(t * TAU)
    rot(B("Spine"), (LEFT, 1.5 * b))
    rot(B("Spine2"), (LEFT, 1.0 * b))
    rot(B("Head"), (UP, 3 * S(t * TAU * 0.5 + 0.3)), (LEFT, -1.5 * b))
    arms_relaxed(l=2 * b, r=-2 * b, elbow=-10 - 3 * b)
    loc(B("Hips"), UP * (0.003 * b))


def gait(t, stride, knee, armsw, bob, lean, elbow):
    p = t * TAU
    sl, sr = S(p), S(p + math.pi)
    rot(B("LeftUpLeg"), (LEFT, -stride * sl))
    rot(B("RightUpLeg"), (LEFT, -stride * sr))
    # knee bends while the leg swings forward (passing / recovery)
    rot(B("LeftLeg"), (LEFT, knee * max(0.0, math.cos(p) * 0.8 + 0.35)))
    rot(B("RightLeg"), (LEFT, knee * max(0.0, math.cos(p + math.pi) * 0.8 + 0.35)))
    rot(B("LeftFoot"), (LEFT, 8 * sl))
    rot(B("RightFoot"), (LEFT, 8 * sr))
    arms_relaxed(l=-armsw * sr, r=-armsw * sl, elbow=elbow)
    rot(B("Spine"), (LEFT, lean), (UP, 6 * sl))
    rot(B("Spine2"), (UP, -4 * sl))
    rot(B("Head"), (LEFT, -lean * 0.6))
    rot(B("Hips"), (UP, -5 * sl))
    loc(B("Hips"), UP * (bob * abs(math.cos(p))))


def walk(t):
    gait(t, stride=24, knee=40, armsw=22, bob=0.012, lean=3, elbow=-15)


def run(t):
    gait(t, stride=40, knee=85, armsw=28, bob=0.025, lean=12, elbow=-65)


def jump(t):
    k = math.sin(min(t, 1) * math.pi)  # tuck toward apex
    rot(B("LeftUpLeg"), (LEFT, -35 * k - 10))
    rot(B("RightUpLeg"), (LEFT, -10 * k))
    rot(B("LeftLeg"), (LEFT, 70 * k + 10))
    rot(B("RightLeg"), (LEFT, 35 * k + 10))
    # NB: Tripo auto-weights pull the coat with the upper arms, keep arm moves modest
    rot(B("LeftArm"), (FWD, -4 - 14 * k), (LEFT, -15))
    rot(B("RightArm"), (FWD, 4 + 14 * k), (LEFT, 10))
    rot(B("LeftForeArm"), (LEFT, -35))
    rot(B("RightForeArm"), (LEFT, -35))
    rot(B("Spine"), (LEFT, 6 * k))


def fall(t):
    w = S(t * TAU)
    rot(B("LeftUpLeg"), (LEFT, -20 + 4 * w))
    rot(B("RightUpLeg"), (LEFT, 5 - 4 * w))
    rot(B("LeftLeg"), (LEFT, 35))
    rot(B("RightLeg"), (LEFT, 20))
    rot(B("LeftArm"), (FWD, -18 - 4 * w))
    rot(B("RightArm"), (FWD, 18 + 4 * w))
    rot(B("LeftForeArm"), (LEFT, -40))
    rot(B("RightForeArm"), (LEFT, -40))


def wave(t):
    w = S(t * TAU * 2)
    arms_relaxed(elbow=-10)
    rot(B("RightArm"), (LEFT, -40), (FWD, 8))
    rot(B("RightForeArm"), (LEFT, -100), (UP, 25 * w))
    rot(B("RightHand"), (FWD, 15 * w))
    rot(B("Spine2"), (FWD, -3))
    rot(B("Head"), (UP, -8), (FWD, 4))


def dance(t):
    p = t * TAU
    b = S(p * 2)
    rot(B("Hips"), (UP, 18 * S(p)))
    loc(B("Hips"), UP * (0.02 * abs(b)) + LEFT * (0.015 * S(p)))
    rot(B("Spine"), (FWD, 6 * S(p)), (UP, -10 * S(p)))
    rot(B("Head"), (LEFT, 10 * b))
    rot(B("LeftUpLeg"), (LEFT, -15 * max(0, b)))
    rot(B("RightUpLeg"), (LEFT, -15 * max(0, -b)))
    rot(B("LeftLeg"), (LEFT, 30 * max(0, b)))
    rot(B("RightLeg"), (LEFT, 30 * max(0, -b)))
    rot(B("LeftArm"), (FWD, -12), (LEFT, -25 - 10 * b))
    rot(B("RightArm"), (FWD, 12), (LEFT, -25 + 10 * b))
    rot(B("LeftForeArm"), (LEFT, -95))
    rot(B("RightForeArm"), (LEFT, -95))


# Real Mixamo clips in blender/anims/ (downloaded "without skin") replace the hand-keyed ones.
# file name -> (game clip name, options)
MIXAMO = {
    "Walking.fbx": ("Walk", {}),
    "Sprint.fbx": ("Run", {}),
    "Swagger_Walk.fbx": ("Swagger", {}),
    "Jumping.fbx": ("Jump", {"jump": True, "loop": False}),
    "Start_Walking.fbx": ("StartWalk", {"loop": False}),
    "Stop_Walking.fbx": ("StopWalk", {"loop": False}),
    "Walking_Turn_180.fbx": ("Turn180", {"loop": False}),
    "Idle.fbx": ("Idle", {}),
    "Falling_Idle.fbx": ("Fall", {}),
    "Waving.fbx": ("Wave", {}),
    "Hip_Hop_Dancing.fbx": ("Dance", {}),
    "Gangnam_Style.fbx": ("Dance", {}),
}
ANIM_DIR = os.path.join(HERE, "anims")
have = {}
if os.path.isdir(ANIM_DIR) and "--no-mixamo" not in sys.argv:
    for fn, (clip, opt) in MIXAMO.items():
        if os.path.exists(os.path.join(ANIM_DIR, fn)):
            have[clip] = (os.path.join(ANIM_DIR, fn), opt)

procedural = [("Idle", 72, idle, True), ("Walk", 32, walk, True), ("Run", 20, run, True), ("Jump", 14, jump, False),
              ("Fall", 30, fall, True), ("Wave", 40, wave, True), ("Dance", 48, dance, True)]
for name, n, fn, lp in procedural:
    if name not in have:
        make_action(name, n, fn, loop=lp)

if have:
    import retarget
    reset()
    for clip, (path, opt) in have.items():
        trim = retarget.find_jump_window(path) if opt.get("jump") else None
        retarget.retarget_clip(arm, path, clip, in_place=True, trim=trim, loop=opt.get("loop", True), no_rise=bool(opt.get("jump")))

reset()
# web budget: cap textures (Tripo ships 4K-8K maps)
MAX_TEX = 2048
for img in bpy.data.images:
    if img.size[0] > MAX_TEX or img.size[1] > MAX_TEX:
        f = MAX_TEX / max(img.size)
        img.scale(int(img.size[0] * f), int(img.size[1] * f))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_force_sampling=True,
    export_optimize_animation_size=True,
    export_image_format="WEBP",
    export_image_quality=85,
)
print("EXPORTED", OUT)
