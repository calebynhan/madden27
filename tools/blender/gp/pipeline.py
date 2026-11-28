# Build steps, in order: body volumes -> voxel fuse -> quad retopology -> uniform zones and UVs ->
# (HD) bake UVs and the normal map from a subdivided, sculpted copy -> armature and weights -> rigid
# equipment (helmet, fingers, cleat soles) -> body-type shape keys -> AO in vertex colors ->
# glTF export and a check of the result against the game's contract.
import json
import os
import struct

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from . import bake, body, detail, gear, helmet, rig, uniform
from .util import V, T, activate, apply_mod, join, report, smooth01

GAME_MATS = ['jersey', 'pants', 'belt', 'socks', 'shoes', 'gloves', 'arms', 'skin', 'helmet', 'helmetpad', 'stripe',
             'decal', 'eyes', 'mask', 'strap', 'visor']
NORMAL_MATS = ['jersey', 'pants', 'belt', 'socks', 'shoes', 'gloves', 'arms', 'skin']
TRI_BUDGET = 20000
VERT_BUDGET = 14000   # exported (split) vertices: skinning and morphing cost per vertex


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def fuse(parts, voxel, smooth_iter=6):
    ob = join(parts, 'body')
    rm = ob.modifiers.new('rm', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = voxel
    rm.adaptivity = 0
    apply_mod(ob, rm)
    sm = ob.modifiers.new('sm', 'SMOOTH')
    sm.factor = 0.7
    sm.iterations = smooth_iter
    apply_mod(ob, sm)
    return ob


BODY_FACES_MAX = 5350   # body quads that keep the whole player under TRI_BUDGET


def retopo(ob, faces, max_faces=BODY_FACES_MAX, tries=6):
    """Quad retopology. QuadriFlow's face count doesn't follow its target smoothly, so when the
    result overshoots max_faces it retries from the fused mesh with a proportionally lower
    target (deterministic: same input, same seed)."""
    orig = ob.data.copy()
    target = faces
    for _ in range(tries):
        activate(ob)
        bpy.ops.object.quadriflow_remesh(target_faces=target, use_mesh_symmetry=True, use_preserve_sharp=False,
                                         use_preserve_boundary=False, smooth_normals=False, seed=1)
        ob = bpy.context.view_layer.objects.active
        n = len(ob.data.polygons)
        if n <= max_faces:
            break
        target = int(target * max_faces / n * 0.98)
        print(f'[retopo] {n} faces is over {max_faces}; again with target {target}', flush=True)
        ob.data = orig.copy()
    bpy.data.meshes.remove(orig)
    return ob


def shade_smooth(ob):
    activate(ob)
    bpy.ops.object.shade_smooth()


def triangulate_ngons(ob):
    """The exporter can only compute tangents on triangles and quads (tube end caps are n-gons)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    ng = [f for f in bm.faces if len(f.verts) > 4]
    if ng:
        bmesh.ops.triangulate(bm, faces=ng)
    bm.to_mesh(ob.data)
    bm.free()


def build_high(low, levels=3):
    """Dense copy of the game mesh (Catmull-Clark subdivided) with the procedural sculpt: the
    source of the normal map. Built from the low-poly itself, so the bake holds only the
    sculpted detail, with no shape mismatch or voxel steps."""
    high = low.copy()
    high.data = low.data.copy()
    high.name = 'high'
    bpy.context.collection.objects.link(high)
    sub = high.modifiers.new('sub', 'SUBSURF')
    sub.levels = levels
    sub.render_levels = levels
    sub.uv_smooth = 'NONE'
    apply_mod(high, sub)
    report(high, 'high')
    detail.detail_displace(high)
    shade_smooth(high)
    return high


def face_surface(ob):
    """face_z(x, y): how far forward the body mesh reaches at (x, y), by a ray cast from the front."""
    tree = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())

    def face_z(x, y):
        hit = tree.ray_cast(V(x, y, 0.5), Vector((0, 1, 0)))   # three.js -z is Blender +y
        return T(hit[0])[2] if hit[0] is not None else 0.095
    return face_z


def _set_weights(ob, vi, weights):
    for g in ob.vertex_groups:
        g.remove([vi])
    for name, w in weights.items():
        ob.vertex_groups[name].add([vi], w, 'REPLACE')


def fix_extremity_weights(ob):
    """Cleat uppers ride wholly on the foot (like their rigid soles) and the palm wholly on the
    hand (like the rigid fingers), so the pieces never slide apart."""
    n = 0
    for v in ob.data.vertices:
        x, y, z = T(v.co)
        side = 'R' if x < 0 else 'L'
        if y < 0.06:
            _set_weights(ob, v.index, {'foot_' + side: 1.0})
            n += 1
        elif y < 0.95 and abs(abs(x) - 0.32) < 0.06:
            _set_weights(ob, v.index, {'hand_' + side: 1.0})
            n += 1
        elif y < 0.985 and abs(abs(x) - 0.32) < 0.06:
            w = smooth01((0.985 - y) / 0.035)
            _set_weights(ob, v.index, {'hand_' + side: w, 'elbow_' + side: 1 - w} if w < 1 else {'hand_' + side: 1.0})
            n += 1
    print('[weights] extremity vertices pinned:', n, flush=True)


# ---------------------------------------------------------------- export and checks
def export(path, tangents=False):
    """tangents: MikkTSpace tangents of the active UV map (set it to 'Bake' so they match the
    baked normal map exactly)."""
    props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    kw = dict(filepath=path, export_format='GLB', export_yup=True, export_apply=False, export_texcoords=True,
              export_normals=True, export_materials='EXPORT', export_skins=True, export_morph=True,
              export_morph_normal=False, export_animations=False, use_selection=False, export_tangents=tangents)
    if 'export_vertex_color' in props:      # Blender 4.2+
        kw['export_vertex_color'] = 'ACTIVE'
        kw['export_all_vertex_colors'] = False
    else:
        kw['export_colors'] = True
    if 'export_image_format' in props:
        kw['export_image_format'] = os.environ.get('IMGFMT', 'WEBP')
    if 'export_image_quality' in props:
        kw['export_image_quality'] = int(os.environ.get('IMGQ', '90'))
    if 'export_jpeg_quality' in props:
        kw['export_jpeg_quality'] = int(os.environ.get('IMGQ', '90'))
    if 'export_meshopt_compression_enable' in props and os.environ.get('MESHOPT', '1') == '1':
        # EXT_meshopt_compression: about 2.4x smaller; the game decodes it with three.js's
        # MeshoptDecoder (src/render/athlete.js)
        kw['export_meshopt_compression_enable'] = True
        kw['export_meshopt_extension'] = 'EXT_meshopt_compression'
    for k in ('export_attributes', 'export_morph_tangent', 'export_unused_images'):
        if k in props:
            kw[k] = False
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if k in props or k == 'filepath'})


def read_glb_json(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, _, _ = struct.unpack_from('<III', data, 0)
    if magic != 0x46546C67:
        raise ValueError('not a GLB file')
    ln, kind = struct.unpack_from('<II', data, 12)
    return json.loads(data[20:20 + ln].decode('utf8'))


def verify(path, want_normal):
    """Check the exported file against what src/render/athlete.js needs."""
    g = read_glb_json(path)
    mats = [m['name'] for m in g.get('materials', [])]
    problems = []
    missing = set(GAME_MATS) - set(mats)
    extra = set(mats) - set(GAME_MATS)
    if missing or extra:
        problems.append(f'materials missing {sorted(missing)} extra {sorted(extra)}')
    joints = [g['nodes'][j]['name'] for j in g['skins'][0]['joints']] if g.get('skins') else []
    need = set(rig.J)
    if need - set(joints):
        problems.append(f'joints missing {sorted(need - set(joints))}')
    tris = verts = 0
    per = {}
    for mesh in g['meshes']:
        names = (mesh.get('extras') or {}).get('targetNames', [])
        for prim in mesh['primitives']:
            at = prim['attributes']
            if 'COLOR_0' not in at:
                problems.append('primitive without COLOR_0')
            if len(prim.get('targets', [])) != 2:
                problems.append('primitive without 2 morph targets')
            if want_normal and 'TEXCOORD_1' not in at:
                problems.append('primitive without TEXCOORD_1')
            n = g['accessors'][prim['indices']]['count'] // 3
            tris += n
            verts += g['accessors'][at['POSITION']]['count']
            mname = mats[prim['material']] if 'material' in prim else '?'
            per[mname] = per.get(mname, 0) + n
        if names and sorted(names) != ['heavy', 'lean']:
            problems.append(f'morph targets {names}')
    nmaps = sum(1 for m in g.get('materials', []) if 'normalTexture' in m)
    aomaps = sum(1 for m in g.get('materials', []) if 'occlusionTexture' in m)
    if want_normal and nmaps == 0:
        problems.append('no normalTexture')
    if want_normal and aomaps == 0:
        problems.append('no occlusionTexture')
    if tris > TRI_BUDGET:
        problems.append(f'{tris} triangles (budget {TRI_BUDGET})')
    size = os.path.getsize(path)
    if verts > VERT_BUDGET:
        problems.append(f'{verts} vertices after export splits (budget {VERT_BUDGET})')
    print(f'[verify] {path}: {tris} tris, {verts} verts, {len(mats)} materials, {len(joints)} joints, {nmaps} with normal map, {aomaps} with occlusion map, '
          f'{size / 1e6:.2f} MB, images {[i.get("mimeType") for i in g.get("images", [])]}, '
          f'extensions {g.get("extensionsRequired", [])}', flush=True)
    print('[verify] triangles by material:', ', '.join(f'{k} {v}' for k, v in sorted(per.items(), key=lambda kv: -kv[1])), flush=True)
    for p in problems:
        print('[verify] PROBLEM:', p, flush=True)
    return not problems


# ---------------------------------------------------------------- main
def build(out, hd=False, faces=6000, stage=99, preview_dir=None, bake_size=2048, ship_size=1024, save=None):
    clear()
    parts = body.build_body()
    low = fuse(parts, 0.0062, smooth_iter=4)
    report(low, 'fused')
    low = retopo(low, faces)
    report(low, 'retopo')
    uniform.cut_zones(low)
    uniform.zone_and_uv(low)
    shade_smooth(low)
    report(low, 'zoned')
    nimg = aoimg = None
    if hd:
        bake.bake_uv(low)
        high = build_high(low)
        nimg = bake.bake_normal(low, high, os.path.splitext(out)[0] + '_normal.png', size=bake_size, ship=ship_size)
        aoimg = bake.bake_ao_map(low, high, os.path.splitext(out)[0] + '_ao.png', size=ship_size)
        bpy.data.objects.remove(high, do_unlink=True)
    if stage >= 3:
        arm = rig.build_armature()
        rig.skin(low, arm, uniform.seg_bone)
        rig.pad_weights(low)
        fix_extremity_weights(low)
        hparts = helmet.build_helmet(face_surface(low))
        for o in hparts:
            rig.rigid(o, 'head')
        extra = hparts + gear.build_fingers() + gear.build_cleats()
        for o in extra:
            triangulate_ngons(o)
            shade_smooth(o)
            if hd:
                bake.neutral_bake_uv(o)
        low = join([low] + extra, 'body')
        report(low, 'joined')
        rig.shape_keys(low)
        if stage >= 4:
            bake.bake_ao(low)
    if nimg is not None:
        bake.wire_normal_map(low, nimg, NORMAL_MATS)
    if aoimg is not None:
        bake.wire_ao_map(low, aoimg, NORMAL_MATS)
    # No exported tangents: three.js derives the tangent frame per pixel (src/render/athlete.js
    # flips the green channel for it, as GLTFLoader does). Exported MikkTSpace tangents would
    # unweld every vertex of the parts parked on a single point of the bake UVs (helmet, mask,
    # fingers), more than doubling the vertex count.
    export(out, tangents=False)
    ok = verify(out, want_normal=nimg is not None)
    print('EXPORTED', out, os.path.getsize(out), 'OK' if ok else 'WITH PROBLEMS', flush=True)
    if save:  # the finished scene, to open and inspect in Blender (never over an existing file)
        if os.path.exists(save):
            print('[save] not overwriting existing', save, flush=True)
        else:
            os.makedirs(os.path.dirname(os.path.abspath(save)), exist_ok=True)
            bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(save), check_existing=True)
            print('[save]', save, flush=True)
    if preview_dir:
        from . import preview
        tag = os.environ.get('TAG', 'build')
        preview.render_views(preview_dir, tag, preview.SINGLE)
        preview.lineup(low)
        preview.render_views(preview_dir, tag, preview.GROUP)
    return ok
