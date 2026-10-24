"""
BagVerse - street cars (user-supplied low-poly models + PBR texture packs) -> ../public/assets/cars.glb

Every paint variant becomes its own root object (CAR_<model>_<paint>) so the game's kit instancer can place it
from KIT_* markers like any other kit asset. Each variant has its own mesh copy (glTF keeps materials on meshes); only the body material differs.
Conventions match the Cartoon City kit cars: origin at the footprint centre, wheels on z = 0, nose along -Y.
The flying vehicle floats HOVER metres above the road.

  blender -b -P export_cars.py
"""
import bpy, json, math, os
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "cars")
OUT = os.path.join(HERE, "..", "public", "assets", "cars.glb")
INFO_OUT = os.path.join(HERE, "cars_assets.json")
LENGTH = 4.6        # target body length (m)
HOVER = 0.6
MAX_TEX = 1024

MODELS = {
    "BRT": {"fbx": "BlackRaceTouring.fbx", "tex": "tex_BRT/PBR Textures", "body": "Black Race Touring",
            "paints": ["Black", "Red", "White"]},
    "SRC": {"fbx": "SilverRetroCar.fbx", "tex": "tex_SRC/PBR Textures", "body": "Silver Retro Car",
            "paints": ["Black", "Red", "White"]},
    "FTV": {"fbx": "FlyingTransportVehicle.fbx", "tex": "tex_FTV/PBR Textures", "body": "Flying Vehicle",
            "paints": ["Black", "Red", "White"], "hover": True},
}


def img(path, data=False):
    if not os.path.exists(path):
        return None
    im = bpy.data.images.load(path, check_existing=True)
    if data:
        im.colorspace_settings.name = "Non-Color"
    if max(im.size) > MAX_TEX:
        f = MAX_TEX / max(im.size)
        im.scale(int(im.size[0] * f), int(im.size[1] * f))
    return im


def find(folder, *names):
    for n in names:
        p = os.path.join(folder, n)
        if os.path.exists(p):
            return p
    return None


def pbr_material(name, base, normal=None, rough=None, metal=None, emissive=None, emissive_strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    def tex(path, data, socket, x):
        im = img(path, data) if path else None
        if not im:
            return None
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = im; n.location = (x, 0)
        if socket:
            nt.links.new(n.outputs["Color"], socket)
        return n
    tex(base, False, b.inputs["Base Color"], -600)
    tex(rough, True, b.inputs["Roughness"], -600)
    tex(metal, True, b.inputs["Metallic"], -600)
    if normal:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        t = tex(normal, True, None, -900)
        if t:
            nt.links.new(t.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    if emissive:
        e = tex(emissive, False, b.inputs["Emission Color"], -600)
        if e:
            b.inputs["Emission Strength"].default_value = emissive_strength
    return m


bpy.ops.wm.read_factory_settings(use_empty=True)
info = {}
for key, M in MODELS.items():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, M["fbx"]))
    objs = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    for o in [o for o in bpy.data.objects if o not in before and o.type != "MESH"]:
        bpy.data.objects.remove(o, do_unlink=True)
    # bake transforms, then centre / ground / scale / turn the nose from +Y to -Y
    for o in objs:
        o.data = o.data.copy()
        o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)
    pts = [v.co for o in objs for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    k = LENGTH / (hi.y - lo.y)
    lift = HOVER if M.get("hover") else 0.0
    T = (Matrix.Translation((0, 0, lift)) @ Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Scale(k, 4)
         @ Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))))
    for o in objs:
        o.data.transform(T); o.data.update()
    size = [round((hi.x - lo.x) * k, 3), round((hi.y - lo.y) * k, 3), round((hi.z - lo.z) * k + lift, 3)]

    td = os.path.join(SRC, M["tex"])
    p = lambda *n: find(td, *n)
    body_maps = dict(normal=p(f"{key}_Normal.png"), rough=p(f"{key}_Roughness.png"), metal=p(f"{key}_Metallic.png"),
                     emissive=p(f"{key}_Emissive.png"))
    tire = pbr_material(f"CAR_{key}_Tire", p(f"Tires/{key}_Tire_BaseColor.png"), p(f"Tires/{key}_Tire_Normal.png"),
                        p(f"Tires/{key}_Tire_Roughness.png"), p(f"Tires/{key}_Tire_Metallic.png"))
    wheel = pbr_material(f"CAR_{key}_Wheel", p(f"Wheels/{key}_Wheel_BaseColor.png", f"Wheels/{key} Wheel_BaseColor.png"),
                         p(f"Wheels/{key}_Wheel_Normal.png", f"Wheels/{key} Wheel_Normal.png"),
                         p(f"Wheels/{key}_Wheel_Roughness.png", f"Wheels/{key} Wheel_Roughness.png"),
                         p(f"Wheels/{key}_Wheel_Metallic.png", f"Wheels/{key} Wheel_Metallic.png"))
    for paint in ["Default"] + M["paints"]:
        base = p(f"{key}_BaseColor.png") if paint == "Default" else \
            p(f"Additional Paint Colors/Color/{key}_{paint}Paint_BaseColor.png", f"Additional Paint Colors/Color/{key}_{paint}Paint_Base Color.png")
        if not base:
            continue
        body = pbr_material(f"CAR_{key}_{paint}_Body", base, emissive_strength=2.0, **body_maps)
        name = f"CAR_{key}_{paint}"
        root = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(root)
        for o in objs:
            # own mesh copy per variant: glTF stores materials on the mesh, so shared data would export one paint
            c = bpy.data.objects.new(f"{name}_{o.name}", o.data.copy())
            bpy.context.scene.collection.objects.link(c)
            c.parent = root
            low = o.name.lower()
            mat = tire if "tire" in low else wheel if "wheel" in low else body
            c.data.materials.clear(); c.data.materials.append(mat)
        info[name] = {"kind": "car", "size": size, "nose": -1, "model": key, "paint": paint, "hover": lift}
        print("VARIANT", name, size)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_image_format="WEBP", export_image_quality=85,
                          export_animations=False, export_apply=True)
json.dump(info, open(INFO_OUT, "w"), indent=1)
print("EXPORTED", OUT, len(info), "variants")
