"""
Retarget Mixamo animation FBX files ("without skin") onto any mixamorig armature in the scene,
even when the target's rest pose differs (Tripo A-pose vs Mixamo T-pose, different bone rolls,
different units/object transforms).

Method, per bone, in world space:
  A        = rotation taking the target's rest bone direction onto the source's rest bone direction
  W_t(f)   = W_s(f) * W_s_rest^-1 * A * W_t_rest
so the target first adopts the source rest pose, then follows the source's motion. Hips translation
is scaled by hip height, and forward root motion is removed for looping clips (in-place).
"""
import bpy
from mathutils import Matrix, Quaternion, Vector

Y = Vector((0, 1, 0))


def _rot(m):
    return m.to_3x3().normalized().to_quaternion()


def _key_bones(arm, frame, basis):
    for name, (loc, q) in basis.items():
        pb = arm.pose.bones[name]
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = q
        pb.location = loc
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.keyframe_insert("location", frame=frame)


def retarget_clip(target, fbx_path, action_name, in_place=True, trim=None, loop=True, no_rise=False,
                  act=None, offset=0, prev=None, finish=True, collect=None, smooth_drift=0):
    """act/offset/prev/finish let several FBX parts be appended into one action (see retarget_sequence)."""
    scene = bpy.context.scene
    before = set(bpy.data.objects)
    acts_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=False)
    new_objs = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new_objs if o.type == "ARMATURE")
    sact = src.animation_data.action
    f0, f1 = int(sact.frame_range[0]), int(sact.frame_range[1])
    if trim:
        f0, f1 = max(f0, trim[0]), min(f1, trim[1])

    names = [b.name for b in target.data.bones if b.name in src.data.bones]
    names.sort(key=lambda n: len(target.data.bones[n].parent_recursive))   # parents first
    Ms, Mt = src.matrix_world.copy(), target.matrix_world.copy()
    Ms_q, Mt_q = _rot(Ms), _rot(Mt)

    ws_rest, wt_rest, A = {}, {}, {}
    for n in names:
        ws_rest[n] = (Ms_q @ _rot(src.data.bones[n].matrix_local)).normalized()
        wt_rest[n] = (Mt_q @ _rot(target.data.bones[n].matrix_local)).normalized()
        ds, dt = ws_rest[n] @ Y, wt_rest[n] @ Y
        A[n] = dt.rotation_difference(ds)

    hips = "mixamorig:Hips"
    src_hips_rest = Ms @ src.data.bones[hips].head_local
    tgt_hips_rest = Mt @ target.data.bones[hips].head_local

    def floor_z(arm, M):
        return min((M @ arm.data.bones[f"mixamorig:{s}ToeBase"].head_local).z for s in ("Left", "Right"))

    k = (tgt_hips_rest.z - floor_z(target, Mt)) / max(1e-6, (src_hips_rest.z - floor_z(src, Ms)))

    # sample source hips path for drift removal
    path = {}
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        path[f] = (Ms @ src.pose.bones[hips].matrix).translation.copy()
    p_first, p_last = path[f0], path[f1]
    if smooth_drift:   # travel = low-passed hips path (moving average); subtracting it keeps sway, drops travel
        fs = list(range(f0, f1 + 1)); w = int(smooth_drift)
        low = {}
        for j, f in enumerate(fs):
            a, b = max(0, j - w), min(len(fs) - 1, j + w)
            acc = Vector()
            for k2 in range(a, b + 1): acc += path[fs[k2]]
            low[f] = acc / (b - a + 1)

    if collect is None:
        if act is None:
            act = bpy.data.actions.new(action_name)
            act.use_fake_user = True
        target.animation_data_create()
        target.animation_data.action = act
    prev = {} if prev is None else prev
    Mt_inv = Mt.inverted()
    for i, f in enumerate(range(f0, f1 + 1)):
        scene.frame_set(f)
        p = path[f].copy()
        if in_place and smooth_drift:
            drift = low[f] - low[f0]
            p.x -= drift.x; p.y -= drift.y
        elif in_place:
            t = (f - f0) / max(1, f1 - f0)
            drift = p_first.lerp(p_last, t) - p_first
            p.x -= drift.x; p.y -= drift.y
        delta = (p - src_hips_rest) * k
        if in_place:   # keep the character centred on its capsule
            c0 = low[f0] if smooth_drift else p_first
            delta.x -= (c0.x - src_hips_rest.x) * k
            delta.y -= (c0.y - src_hips_rest.y) * k
        if no_rise:   # the game's physics does the jumping; keep only the crouch/landing dip
            delta.z = min(delta.z, (path[f0] - src_hips_rest).z * k)
        hips_world = tgt_hips_rest + delta

        pose_arm = {}
        basis = {}
        for n in names:   # bones are ordered parent-first
            ws = (Ms_q @ _rot(src.pose.bones[n].matrix)).normalized()
            wt = ws @ ws_rest[n].inverted() @ A[n] @ wt_rest[n]
            r_arm = (Mt_q.inverted() @ wt).normalized()
            bone = target.data.bones[n]
            if bone.parent is None or bone.parent.name not in pose_arm:
                head = Mt_inv @ hips_world if n == hips else bone.head_local.copy()
                ref = bone.matrix_local
            else:
                P = bone.parent
                ref = pose_arm[P.name] @ P.matrix_local.inverted() @ bone.matrix_local
                head = ref.translation.copy()
            C = Matrix.LocRotScale(head, r_arm, None)
            pose_arm[n] = C
            b = ref.inverted() @ C
            q = b.to_quaternion().normalized()
            if n in prev:
                q.make_compatible(prev[n])
            prev[n] = q
            basis[n] = (b.translation.copy() if n == hips else Vector(), q)
        if collect is not None:
            collect.append(basis)
        else:
            _key_bones(target, offset + i, basis)

    if finish and collect is None:
        tr = target.animation_data.nla_tracks.new()
        tr.name = action_name
        tr.strips.new(action_name, 0, act)
        target.animation_data.action = None

    for o in new_objs:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in set(bpy.data.actions) - acts_before - {act}:
        bpy.data.actions.remove(a)
    print(f"retargeted {fbx_path} -> {action_name} ({f1 - f0 + 1} frames, hip scale {k:.2f})")
    return act, f1 - f0 + 1


def retarget_sequence(target, fbx_paths, action_name, seam=10, smooth_drift=45):
    """Stitch consecutive Mixamo parts (a long dance split into Part_1..N) into ONE action.
    Each part is retargeted in place; travel is removed with a moving average of the hips path
    (+-smooth_drift frames) so hip sway survives. Neighbouring parts overlap by `seam` frames and are
    cross-faded there (slerp per bone), so facing/pose differences between parts don't pop."""
    frames = []
    for path in fbx_paths:
        part = []
        retarget_clip(target, path, action_name, in_place=True, collect=part, smooth_drift=smooth_drift)
        if frames and seam:
            n = min(seam, len(frames), len(part))
            for j in range(n):
                t = (j + 1) / (n + 1); t = t * t * (3 - 2 * t)
                a, b = frames[len(frames) - n + j], part[j]
                mix = {}
                for name in a:
                    la, qa = a[name]; lb, qb = b.get(name, a[name])
                    qb = qb.copy(); qb.make_compatible(qa)
                    mix[name] = (la.lerp(lb, t), qa.slerp(qb, t))
                frames[len(frames) - n + j] = mix
            part = part[n:]
        frames.extend(part)
    act = bpy.data.actions.new(action_name)
    act.use_fake_user = True
    target.animation_data_create()
    target.animation_data.action = act
    prev = {}
    for i, basis in enumerate(frames):
        for name, (loc, q) in basis.items():
            if name in prev: q.make_compatible(prev[name])
            prev[name] = q
        _key_bones(target, i, basis)
    tr = target.animation_data.nla_tracks.new()
    tr.name = action_name
    tr.strips.new(action_name, 0, act)
    target.animation_data.action = None
    print(f"stitched {len(fbx_paths)} parts -> {action_name} ({len(frames)} frames)")
    return act, len(frames)


def find_jump_window(fbx_path, pad_before=4, pad_after=6):
    """frames from just before lift-off to just after landing (hips above standing height)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=fbx_path)
    src = next(o for o in bpy.data.objects if o not in before and o.type == "ARMATURE")
    a = src.animation_data.action
    f0, f1 = int(a.frame_range[0]), int(a.frame_range[1])
    zs = {}
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        zs[f] = (src.matrix_world @ src.pose.bones["mixamorig:Hips"].matrix).translation.z
    stand = zs[f0]
    air = [f for f in zs if zs[f] > stand + 0.05]
    for o in [o for o in bpy.data.objects if o not in before]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.actions.remove(a)
    if not air:
        return f0, f1
    return max(f0, air[0] - pad_before), min(f1, air[-1] + pad_after)
