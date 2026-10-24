"""
Fixes Tripo-exported rigs whose joint nodes have identity transforms (the skeleton only
exists in inverseBindMatrices). Sets each joint's local TRS so its world matrix equals
inverse(IBM) -> rest pose == bind pose, so engines and Blender see a valid A-pose.
usage: python3 fix_rig.py in.glb out.glb
"""
import json, struct, sys
import numpy as np


def read_glb(p):
    d = open(p, "rb").read()
    jl = struct.unpack("<I", d[12:16])[0]
    j = json.loads(d[20:20 + jl])
    o = 20 + jl
    bl = struct.unpack("<I", d[o:o + 4])[0]
    return j, bytearray(d[o + 8:o + 8 + bl])


def write_glb(p, j, b):
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    b = bytes(b) + b"\0" * ((4 - len(b) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(b)
    with open(p, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(b), 0x004E4942) + b)


def mat_to_trs(m):
    t = m[:3, 3].copy()
    r = m[:3, :3].copy()
    s = np.linalg.norm(r, axis=0)
    r = r / s
    if np.linalg.det(r) < 0:
        s[0] *= -1; r[:, 0] *= -1
    # rotation matrix -> quaternion (x,y,z,w)
    tr = np.trace(r)
    if tr > 0:
        S = np.sqrt(tr + 1.0) * 2
        w = 0.25 * S; x = (r[2, 1] - r[1, 2]) / S; y = (r[0, 2] - r[2, 0]) / S; z = (r[1, 0] - r[0, 1]) / S
    elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
        S = np.sqrt(1.0 + r[0, 0] - r[1, 1] - r[2, 2]) * 2
        w = (r[2, 1] - r[1, 2]) / S; x = 0.25 * S; y = (r[0, 1] + r[1, 0]) / S; z = (r[0, 2] + r[2, 0]) / S
    elif r[1, 1] > r[2, 2]:
        S = np.sqrt(1.0 + r[1, 1] - r[0, 0] - r[2, 2]) * 2
        w = (r[0, 2] - r[2, 0]) / S; x = (r[0, 1] + r[1, 0]) / S; y = 0.25 * S; z = (r[1, 2] + r[2, 1]) / S
    else:
        S = np.sqrt(1.0 + r[2, 2] - r[0, 0] - r[1, 1]) * 2
        w = (r[1, 0] - r[0, 1]) / S; x = (r[0, 2] + r[2, 0]) / S; y = (r[1, 2] + r[2, 1]) / S; z = 0.25 * S
    q = np.array([x, y, z, w]); q /= np.linalg.norm(q)
    return t.tolist(), q.tolist(), s.tolist()


def node_local(n):
    if "matrix" in n:
        return np.array(n["matrix"]).reshape(4, 4).T
    m = np.eye(4)
    if "rotation" in n:
        x, y, z, w = n["rotation"]
        m[:3, :3] = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    if "scale" in n:
        m[:3, :3] = m[:3, :3] @ np.diag(n["scale"])
    if "translation" in n:
        m[:3, 3] = n["translation"]
    return m


def main(src, dst, align=True):
    j, b = read_glb(src)
    nodes = j["nodes"]
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            parent[c] = i

    def world(i):
        m = node_local(nodes[i])
        return world(parent[i]) @ m if i in parent else m

    skin = j["skins"][0]
    acc = j["accessors"][skin["inverseBindMatrices"]]
    bv = j["bufferViews"][acc["bufferView"]]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    ibm = np.frombuffer(bytes(b[off:off + 64 * acc["count"]]), dtype="<f4").reshape(-1, 4, 4).transpose(0, 2, 1)
    joints = skin["joints"]
    bindw = {jn: np.linalg.inv(ibm[k].astype(np.float64)) for k, jn in enumerate(joints)}

    if align:
        # Some exporters (Tripo) leave the skeleton rotated/offset from the mesh; skinning still
        # cancels out, but DCC tools (weight painting, bone heat) need bones inside the mesh.
        # Find C mapping skeleton space onto the mesh: up -> +Y, toes -> +Z, feet on the mesh floor.
        name = {jn: nodes[jn].get("name", "") for jn in joints}
        byname = {v.split(":")[-1]: k for k, v in name.items()}
        P = lambda n: bindw[byname[n]][:3, 3]
        up = P("Head") - P("Hips"); up /= np.linalg.norm(up)
        fw = P("LeftToeBase") - P("LeftFoot"); fw = fw - up * fw.dot(up); fw /= np.linalg.norm(fw)
        lf = np.cross(up, fw)
        Rs = np.stack([lf, up, fw], axis=1)            # skeleton basis (cols: left, up, fwd)
        Rt = np.stack([[1, 0, 0], [0, 1, 0], [0, 0, 1]], axis=1).astype(float)  # glTF: +X left, +Y up, +Z fwd
        R = Rt @ Rs.T
        # mesh bounds (POSITION accessor of the skinned primitive)
        pa = j["accessors"][j["meshes"][0]["primitives"][0]["attributes"]["POSITION"]]
        mn, mx = np.array(pa["min"]), np.array(pa["max"])
        feet = min((R @ P(n))[1] for n in ("LeftToeBase", "RightToeBase", "LeftFoot", "RightFoot"))
        hips = R @ P("Hips")
        t = np.array([(mn[0] + mx[0]) / 2 - hips[0], mn[1] - feet + 0.0, (mn[2] + mx[2]) / 2 - hips[2]])
        C = np.eye(4); C[:3, :3] = R; C[:3, 3] = t
        if np.abs(C - np.eye(4)).max() > 1e-3:
            bindw = {jn: C @ m for jn, m in bindw.items()}
            new_ibm = np.stack([np.linalg.inv(bindw[jn]) for jn in joints]).astype("<f4").transpose(0, 2, 1)
            b[off:off + 64 * acc["count"]] = new_ibm.tobytes()
            print("realigned skeleton to mesh (rotation + offset)")

    # the skinned mesh node's world transform is ignored by glTF skinning, but joints live
    # under the armature: local = inv(parentWorld) @ bindWorld, processed top-down
    def depth(i):
        d = 0
        while i in parent:
            i = parent[i]; d += 1
        return d

    order = sorted(joints, key=depth)
    done = {}

    def pworld(i):
        p = parent.get(i)
        if p is None:
            return np.eye(4)
        if p in done:
            return done[p]
        return world(p)

    for jn in order:
        pw = pworld(jn)
        local = np.linalg.inv(pw) @ bindw[jn]
        t, q, s = mat_to_trs(local)
        n = nodes[jn]
        n.pop("matrix", None)
        n["translation"], n["rotation"], n["scale"] = t, q, s
        done[jn] = pw @ node_local(n)
    write_glb(dst, j, b)
    hips = joints[0]
    print("fixed", len(joints), "joints; hips world pos", np.round(done[hips][:3, 3], 3))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
