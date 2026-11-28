# Uniform material zones and UV0 for the runtime team textures. The UV layout is a contract with
# src/render/athlete.js (jerseyAtlas / pantsAtlas, flipY = false):
#   jersey: torso band v 0.22-1 wrapping around (u 0 right side, 0.25 front, 0.5 left, 0.75
#           back), collar trim at v 0.97-1; right sleeve v 0-0.1, left sleeve v 0.11-0.21
#   pants:  hip band v 0.5-1 (stripes at u 0 and 0.5); right leg v 0-0.25 (outer side u 0),
#           left leg v 0.25-0.5 (outer side u 0.5)
import math

import bmesh
from mathutils import Vector

from .rig import J
from .util import V, T, set_mat, clamp01

# Heights (three.js y) of the uniform's cut lines
SLEEVE_Y = 1.530     # sleeve hem
WRIST_Y = 1.008      # glove cuff
SOCK_Y = 0.399       # pants hem
SHOE_Y = 0.10        # top of the cleats
BELT_TOP, BELT_BOT = 1.102, 1.064
COLLAR_Y = 1.758     # jersey collar / neck (at the back and sides)
V_DEPTH, V_HALF = 0.06, 0.08   # the V-neck dips this far below the collar at the front, this wide
V_FRONT_Z = 0.035    # front of the neck (where the V opens)
SLEEVE_TOP = 1.74    # top of the sleeve texture band (over the pad cap)
CUTS = (SLEEVE_Y, WRIST_Y, SOCK_Y, SHOE_Y, BELT_TOP, BELT_BOT, COLLAR_Y)

BODY_MATS = ['jersey', 'pants', 'belt', 'socks', 'shoes', 'gloves', 'arms', 'skin']

SEGS = {
    'head': ((0, 1.83, 0.01), (0, 2.03, 0.01)),
    'neck': ((0, 1.72, 0.0), (0, 1.84, 0.0)),
    'torso': ((0, 1.10, 0.0), (0, 1.70, 0.0)),
    'pelvis': ((0, 0.92, 0.0), (0, 1.10, 0.0)),
}
for _sd, _sx in (('R', -1), ('L', 1)):
    SEGS['upper_' + _sd] = (J['shoulder_' + _sd], J['elbow_' + _sd])
    SEGS['fore_' + _sd] = (J['elbow_' + _sd], J['hand_' + _sd])
    SEGS['hand_' + _sd] = (J['hand_' + _sd], (0.32 * _sx, 0.88, 0.015))
    SEGS['thigh_' + _sd] = (J['thigh_' + _sd], J['knee_' + _sd])
    SEGS['shin_' + _sd] = (J['knee_' + _sd], (0.12 * _sx, 0.08, 0.0))
    SEGS['foot_' + _sd] = ((0.12 * _sx, 0.05, -0.05), (0.12 * _sx, 0.04, 0.19))
SEG_R = {'head': 0.1, 'neck': 0.085, 'torso': 0.2, 'pelvis': 0.17, 'upper': 0.085, 'fore': 0.06, 'hand': 0.05,
         'thigh': 0.11, 'shin': 0.065, 'foot': 0.05}
SEG_BONE = {'head': 'head', 'neck': 'torso', 'torso': 'torso', 'pelvis': 'hips'}
for _sd in 'RL':
    SEG_BONE.update({'upper_' + _sd: 'shoulder_' + _sd, 'fore_' + _sd: 'elbow_' + _sd, 'hand_' + _sd: 'hand_' + _sd,
                     'thigh_' + _sd: 'thigh_' + _sd, 'shin_' + _sd: 'knee_' + _sd, 'foot_' + _sd: 'foot_' + _sd})


def seg_dist(p, a, b):
    A, B, P = Vector(a), Vector(b), Vector(p)
    d = B - A
    L2 = d.length_squared
    t = max(0.0, min(1.0, (P - A).dot(d) / L2)) if L2 > 0 else 0.0
    return (P - (A + d * t)).length, t


def seg_dists(p):
    """Distance from p to every body segment's axis, relative to that part's thickness."""
    return {k: seg_dist(p, a, b)[0] / SEG_R[k.split('_')[0]] for k, (a, b) in SEGS.items()}


def nearest_seg(p):
    """Body segment a surface point belongs to: nearest axis relative to that part's thickness."""
    d = seg_dists(p)
    return min(d, key=d.get)


def seg_bone(p):
    return SEG_BONE[nearest_seg(p)]


def collar_y(p):
    """Height of the jersey's neckline at p: the collar line, dipping into a V at the front."""
    x, _, z = p
    if z <= V_FRONT_Z:
        return COLLAR_Y
    return COLLAR_Y - V_DEPTH * max(0.0, 1.0 - abs(x) / V_HALF)


def zone_of(p, k=None):
    """Uniform zone by body chain (which part of the body) and height (where the cut lines are)."""
    k = k or nearest_seg(p)
    y = p[1]
    base = k.split('_')[0]
    if base in ('head', 'neck'):
        return 'skin' if y > collar_y(p) else 'jersey'
    if base in ('upper', 'fore', 'hand'):
        return 'jersey' if y > SLEEVE_Y else ('arms' if y > WRIST_Y else 'gloves')
    if y > collar_y(p):
        return 'skin'
    if y > BELT_TOP:
        return 'jersey'
    if y > BELT_BOT:
        return 'belt'
    if y > SOCK_Y:
        return 'pants'
    return 'socks' if y > SHOE_Y else 'shoes'


def cut_zones(ob):
    """Clean horizontal cuts along every uniform boundary (so color edges are straight)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for y in CUTS:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=V(0, y, 0), plane_no=Vector((0, 0, 1)), dist=1e-5)
    # the two sides of the V-neck, each a plane through the bottom of the V, cutting only the
    # front of the neck on its own side
    for side in (-1, 1):
        sel = []
        for f in bm.faces:
            x, y, z = T(f.calc_center_median())
            if z > V_FRONT_Z - 0.01 and side * x > -0.006 and abs(x) < V_HALF + 0.02 and COLLAR_Y - V_DEPTH - 0.02 < y < COLLAR_Y + 0.01:
                sel.append(f)
        if not sel:
            continue
        verts = {v for f in sel for v in f.verts}
        edges = {e for f in sel for e in f.edges}
        nx, ny = -side * V_DEPTH, V_HALF          # normal of the line from the V's bottom up to its side
        bmesh.ops.bisect_plane(bm, geom=list(verts) + list(edges) + sel, plane_co=V(0, COLLAR_Y - V_DEPTH, 0),
                               plane_no=Vector((nx, 0, ny)).normalized(), dist=1e-5)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(ob.data)
    bm.free()


def ang(x, z):
    """Around-the-axis texture coordinate: right side 0, front 0.25, left 0.5, back 0.75."""
    return ((math.atan2(x, z) + math.pi / 2) % (2 * math.pi)) / (2 * math.pi)


def _torso_v(p):
    v = 0.22 + 0.78 * clamp01((p[1] - BELT_TOP) / (collar_y(p) - BELT_TOP))
    # only the collar itself reaches the trim band; the pad tops beside it stay body color
    r = math.hypot(p[0], p[2] + 0.014)
    if r > 0.112:
        v = min(v, 0.955 + 0.013 * clamp01((0.125 - r) / 0.013))
    return v


def _uv_for(z, k, pts):
    if z == 'jersey' and k.startswith('upper'):
        sx = -1 if k.endswith('R') else 1
        v0, v1 = (0.0, 0.1) if sx < 0 else (0.11, 0.21)
        return ([ang(p[0] - 0.32 * sx, p[2]) for p in pts],
                [v0 + (v1 - v0) * clamp01((p[1] - SLEEVE_Y) / (SLEEVE_TOP - SLEEVE_Y)) for p in pts])
    if z == 'jersey':
        return [ang(p[0], p[2]) for p in pts], [_torso_v(p) for p in pts]
    if z == 'pants' and (k.startswith('thigh') or k.startswith('shin')):
        sx = -1 if k.endswith('R') else 1
        v0, v1 = (0.0, 0.25) if sx < 0 else (0.25, 0.5)
        return ([ang(p[0] - 0.12 * sx, p[2]) for p in pts],
                [v0 + (v1 - v0) * clamp01((p[1] - SOCK_Y) / (1.0 - SOCK_Y)) for p in pts])
    if z == 'pants':
        return [ang(p[0], p[2]) for p in pts], [0.5 + 0.5 * clamp01((p[1] - 0.86) / (BELT_BOT - 0.86)) for p in pts]
    a = SEGS[k][0]
    return [ang(p[0] - a[0], p[2] - a[2]) for p in pts], [p[1] * 2.0 for p in pts]


def zone_and_uv(ob):
    me = ob.data
    set_mat(ob, *BODY_MATS)
    idx = {n: i for i, n in enumerate(BODY_MATS)}
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        c = T(poly.center)
        k = nearest_seg(c)
        z = zone_of(c, k)
        poly.material_index = idx[z]
        pts = [T(me.vertices[me.loops[li].vertex_index].co) for li in poly.loop_indices]
        us, vs = _uv_for(z, k, pts)
        u0 = us[0]
        us = [u + 1 if u - u0 < -0.5 else (u - 1 if u - u0 > 0.5 else u) for u in us]
        for li, u, v in zip(poly.loop_indices, us, vs):
            uv.data[li].uv = (u, v)
