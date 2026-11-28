# Bakes: ambient occlusion into the vertex colors (COLOR_0, multiplied into every material by the
# game), a second UV set ("Bake", TEXCOORD_1) and the tangent-space normal map of the high-poly
# sculpt onto the game mesh.
import math
import os

import bmesh
import bpy

from .util import activate


def _cycles(scn, samples):
    scn.render.engine = 'CYCLES'
    scn.cycles.device = 'CPU'
    scn.cycles.samples = samples
    if scn.world is None:
        scn.world = bpy.data.worlds.new('world')


def bake_ao(body, samples=48, floor=0.42):
    """Cycles AO into a point color attribute, softened so creases darken without crushing the
    team colors."""
    scn = bpy.context.scene
    _cycles(scn, samples)
    scn.world.light_settings.distance = 0.09
    me = body.data
    ca = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
    activate(body)
    res = bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    print('[ao] bake', res, flush=True)
    data = me.color_attributes['Col'].data
    lo, hi, tot = 1.0, 0.0, 0.0
    for d in data:
        a = floor + (1 - floor) * d.color[0]
        lo, hi, tot = min(lo, a), max(hi, a), tot + a
        d.color = (a, a, a, 1.0)
    print(f'[ao] min {lo:.2f} max {hi:.2f} mean {tot / max(1, len(data)):.2f}', flush=True)


def _uv_ratios(bm, lay):
    """Per-face ratio of UV area to surface area on UV layer `lay`."""
    out = []
    for f in bm.faces:
        pts = [l[lay].uv for l in f.loops]
        a = 0.0
        for i in range(len(pts)):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % len(pts)]
            a += x1 * y2 - x2 * y1
        out.append(abs(a) / 2 / max(f.calc_area(), 1e-12))
    return out


def _select_bad_islands(ob, lay_name):
    """Select the faces the unwrap failed on (collapsed or blown up); returns how many."""
    bm = bmesh.from_edit_mesh(ob.data)
    lay = bm.loops.layers.uv[lay_name]
    r = _uv_ratios(bm, lay)
    med = sorted(r)[len(r) // 2]
    bad = 0
    for f, x in zip(bm.faces, r):
        f.select = x < med * 0.05 or x > med * 20
        bad += f.select
    bmesh.update_edit_mesh(ob.data)
    return bad


def _coverage(ob, lay_name):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    lay = bm.loops.layers.uv[lay_name]
    tot = sum(x * f.calc_area() for f, x in zip(bm.faces, _uv_ratios(bm, lay)))
    bm.free()
    return tot


def _pack(margin):
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    try:
        bpy.ops.uv.pack_islands(rotate=True, rotate_method='ANY', scale=True, shape_method='CONCAVE',
                                margin_method='FRACTION', margin=margin)
    except TypeError:  # older Blender
        bpy.ops.uv.pack_islands(rotate=True, margin=margin)


def bake_uv(ob, margin=0.004):
    """Non-overlapping UVs for the baked maps: the islands of the runtime UVs (one per uniform
    zone and limb, already cut along a single seam) unwrapped with low distortion (angle based,
    which is deterministic) and packed. Any island the unwrap can't solve is smart-projected on
    its own, and the whole mesh falls back to a smart projection if the packing still comes out
    too sparse. The strip at u > 0.975 stays unbaked (flat normals) for parts that don't use
    the maps."""
    me = ob.data
    activate(ob)
    me.uv_layers.active = me.uv_layers['UVMap']
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.seams_from_islands(mark_seams=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    me.uv_layers.active = me.uv_layers.new(name='Bake')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=margin)
    bad = _select_bad_islands(ob, 'Bake')
    if bad:
        print(f'[bake uv] re-projecting {bad} faces the unwrap could not solve', flush=True)
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)
    _pack(margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    cov = _coverage(ob, 'Bake')
    if cov < 0.45:
        print(f'[bake uv] packing too sparse ({cov:.2f}); smart projection instead', flush=True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)
        _pack(margin)
        bpy.ops.object.mode_set(mode='OBJECT')
        cov = _coverage(ob, 'Bake')
    print(f'[bake uv] coverage {cov:.2f}', flush=True)
    uv = me.uv_layers['Bake']   # re-fetch: edit-mode round trips reallocate the layers
    for d in uv.data:
        d.uv = (d.uv[0] * 0.975, d.uv[1])
    me.uv_layers.active = me.uv_layers['UVMap']
    me.uv_layers['UVMap'].active_render = True


def neutral_bake_uv(ob):
    """Parts that don't use the baked maps sample the flat strip at the right edge (one shared
    point, so the second UV set adds no vertex splits on them)."""
    me = ob.data
    if 'UVMap' not in me.uv_layers:
        # a new layer starts as a separate unit square per face: collapse it to one point, or
        # the exporter unwelds every vertex (the decal keeps its own 0-1 layout)
        for d in me.uv_layers.new(name='UVMap').data:
            d.uv = (0.0, 0.0)
    uv = me.uv_layers.get('Bake') or me.uv_layers.new(name='Bake')
    for d in uv.data:
        d.uv = (0.99, 0.5)


def _image_node(m, img):
    nt = m.node_tree
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = img
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'Bake'
    nt.links.new(uvn.outputs['UV'], n.inputs['Vector'])
    for o in nt.nodes:
        o.select = False
    n.select = True
    nt.nodes.active = n
    return n


def bake_normal(low, high, out_path, size=2048, ship=1024):
    """Selected-to-active tangent-space normal bake of high onto low's 'Bake' UVs. Saves the map
    (scaled to ship x ship) and returns the image."""
    scn = bpy.context.scene
    _cycles(scn, 1)
    img = bpy.data.images.new('player_normal', size, size, alpha=False, float_buffer=False)
    img.generated_color = (0.5, 0.5, 1.0, 1.0)
    img.colorspace_settings.name = 'Non-Color'
    added = []
    for m in low.data.materials:
        if hasattr(m, 'use_nodes'):
            try:
                m.use_nodes = True
            except Exception:  # Blender 5 always uses nodes and may refuse the legacy toggle
                pass
        added.append((m, _image_node(m, img)))
    me = low.data
    me.uv_layers.active = me.uv_layers['Bake']
    activate(high)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    res = bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_selected_to_active=True,
                              cage_extrusion=0.008, max_ray_distance=0.02, margin=12, target='IMAGE_TEXTURES')
    print('[bake] normal', res, flush=True)
    for m, n in added:
        nt = m.node_tree
        for x in [n] + [l.from_node for l in n.inputs['Vector'].links]:
            nt.nodes.remove(x)
    me.uv_layers.active = me.uv_layers['UVMap']
    if ship and ship != size:
        img.scale(ship, ship)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    img.filepath_raw = out_path
    img.file_format = 'PNG'
    img.save()
    return img


RAY_VIS = ('visible_camera', 'visible_diffuse', 'visible_glossy', 'visible_transmission', 'visible_volume_scatter',
           'visible_shadow')


def bake_ao_map(low, high, out_path, size=1024, distance=0.05, samples=64):
    """Ambient occlusion of the sculpted high-poly (fabric folds, creases under the pads, between
    fingers of fabric) on low's 'Bake' UVs: finer than the per-vertex occlusion. The low-poly
    is kept out of the occlusion rays (it nearly coincides with the high-poly)."""
    scn = bpy.context.scene
    _cycles(scn, samples)
    scn.world.light_settings.distance = distance
    img = bpy.data.images.new('player_ao', size, size, alpha=False, float_buffer=False)
    img.generated_color = (1.0, 1.0, 1.0, 1.0)
    img.colorspace_settings.name = 'Non-Color'
    added = [(m, _image_node(m, img)) for m in low.data.materials]
    me = low.data
    me.uv_layers.active = me.uv_layers['Bake']
    vis = {k: getattr(low, k) for k in RAY_VIS if hasattr(low, k)}
    for k in vis:
        setattr(low, k, False)
    activate(high)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    # keep the white background (no clear): mipmaps blend it into island edges at a distance
    res = bpy.ops.object.bake(type='AO', use_selected_to_active=True, cage_extrusion=0.008, max_ray_distance=0.02,
                              margin=12, use_clear=False, target='IMAGE_TEXTURES')
    print('[bake] ao map', res, flush=True)
    for k, v in vis.items():
        setattr(low, k, v)
    for m, n in added:
        nt = m.node_tree
        for x in [n] + [l.from_node for l in n.inputs['Vector'].links]:
            nt.nodes.remove(x)
    me.uv_layers.active = me.uv_layers['UVMap']
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    img.filepath_raw = out_path
    img.file_format = 'PNG'
    img.save()
    return img


def _gltf_output_group():
    """The node group the glTF exporter reads extra outputs from (here: Occlusion)."""
    name = 'glTF Material Output'
    g = bpy.data.node_groups.get(name)
    if g is None:
        g = bpy.data.node_groups.new(name, 'ShaderNodeTree')
        g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        g.nodes.new('NodeGroupOutput')
        g.nodes.new('NodeGroupInput')
    return g


def wire_ao_map(body, img, mats):
    """Hook the baked occlusion up as each body material's glTF occlusion (red channel, 'Bake'
    UVs), exported as occlusionTexture with texCoord 1."""
    grp = _gltf_output_group()
    for m in body.data.materials:
        if m.name not in mats:
            continue
        nt = m.node_tree
        tex = _image_node(m, img)
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(tex.outputs['Color'], sep.inputs['Color'])
        gn = nt.nodes.new('ShaderNodeGroup')
        gn.node_tree = grp
        nt.links.new(sep.outputs['Red'], gn.inputs['Occlusion'])


def wire_normal_map(body, img, mats):
    """Hook the baked map up as each body material's normal map on the 'Bake' UVs, so the glTF
    exporter writes it as normalTexture with texCoord 1. The game keeps only the texture."""
    for m in body.data.materials:
        if m.name not in mats:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
            outn = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
            nt.links.new(bsdf.outputs['BSDF'], outn.inputs['Surface'])
        tex = _image_node(m, img)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.space = 'TANGENT'
        nm.uv_map = 'Bake'
        nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
