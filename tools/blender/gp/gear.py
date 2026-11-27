# Rigid equipment on the hands and feet: gloved fingers and thumbs (hand bones) and cleat soles
# with studs (foot bones). They reuse existing materials (gloves; strap for the light sole, eyes
# for the dark studs) so they add no draw calls.
import math

import bmesh
from mathutils import Vector, Matrix

from .body import shoe_outline, SHOE_HEEL_Z, SHOE_TOE_Z
from .rig import rigid
from .util import V, obj_from_bm, set_mat, sweep, catmull, smooth01

# (base z offset from the palm centre, segment lengths, radius, splay toward +z in radians)
FINGERS = (
    (0.043, (0.041, 0.025, 0.02), 0.0104, 0.06),    # index
    (0.018, (0.045, 0.028, 0.022), 0.0106, 0.0),    # middle
    (-0.007, (0.043, 0.026, 0.021), 0.0099, -0.04),  # ring
    (-0.03, (0.034, 0.021, 0.018), 0.0091, -0.09),  # pinky
)
CURL = (0.22, 0.32, 0.24)   # relaxed bend at each knuckle, toward the palm


def _digit(name, base, direction, curl_axis, lengths, curls, r, side, taper=0.82):
    """Polyline digit from base along direction, bending about curl_axis at each joint."""
    pts = [Vector(base)]
    d = Vector(direction).normalized()
    for ln, cu in zip(lengths, curls):
        d = (Matrix.Rotation(cu, 3, curl_axis) @ d).normalized()
        pts.append(pts[-1] + d * ln)
    path = catmull([tuple(p) for p in pts], 5)
    o = sweep(name, path, r=r, segs=7, radius_fn=lambda t: 1.0 - (1 - taper) * t ** 1.5)
    set_mat(o, 'gloves')
    rigid(o, 'hand_' + side)
    return o


def build_fingers():
    parts = []
    for s, side in ((-1, 'R'), (1, 'L')):
        ax = 0.32 * s
        # bending toward the palm (which faces the body: -x on the left hand, +x on the right)
        # is a rotation about -z on the left hand and +z on the right
        axis = Vector((0, 0, -s))
        for zf, lengths, r, splay in FINGERS:
            base = (ax + 0.002 * s, 0.884 + 0.004 * (zf < -0.02), 0.012 + zf)
            direction = (0.0, -math.cos(splay), math.sin(splay))
            parts.append(_digit('finger' + side, base, direction, axis, lengths, CURL, r, side))
        # thumb: rooted in the ball of the thumb inside the palm, lying down along the front of
        # the index finger, a little forward and in, and curling back toward the fingers
        base = (ax - 0.004 * s, 0.95, 0.032)
        direction = (-0.22 * s, -0.86, 0.36)
        parts.append(_digit('thumb' + side, base, direction, Vector((1, 0, 0)), (0.04, 0.03, 0.024),
                            (0.12, 0.28, 0.22), 0.0122, side))
    return parts


def _sole(s):
    """Cleat sole: a plate a little wider than the upper, with toe spring."""
    lx = 0.12 * s
    n = 16
    outline = []
    for i in range(n + 1):           # right edge heel -> toe, then left edge toe -> heel
        u = i / n
        outline.append((u, -1))
    for i in range(n - 1, 0, -1):
        outline.append((i / n, 1))
    bm = bmesh.new()
    top, bot = [], []
    for u, e in outline:
        w, _, dx = shoe_outline(u)
        end = (1 - abs(2 * u - 1) ** 5) ** (1 / 5)
        x = lx + dx * s + e * (w + 0.0035) * max(end, 0.0)
        z = SHOE_HEEL_Z - 0.003 + (SHOE_TOE_Z - SHOE_HEEL_Z + 0.006) * u
        lift = 0.009 * smooth01((u - 0.82) / 0.18)
        top.append(bm.verts.new(V(x, 0.0215 + lift, z)))
        bot.append(bm.verts.new(V(x, 0.0095 + lift, z)))
    m = len(outline)
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    for i in range(m):
        j = (i + 1) % m
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = obj_from_bm('sole', bm)
    set_mat(o, 'strap')
    rigid(o, 'foot_' + ('R' if s < 0 else 'L'))
    return o


STUDS = ((0.6, -0.55), (0.6, 0.55), (0.78, -0.52), (0.78, 0.52), (0.93, 0.0), (0.12, -0.45), (0.12, 0.45))


def _studs(s):
    lx = 0.12 * s
    parts = []
    for u, e in STUDS:
        w, _, dx = shoe_outline(u)
        x = lx + dx * s + e * w
        z = SHOE_HEEL_Z + (SHOE_TOE_Z - SHOE_HEEL_Z) * u
        top = 0.011 + 0.009 * smooth01((u - 0.82) / 0.18)
        pts = [(x, 0.0, z), (x, top, z)]
        o = sweep('stud', pts, r=0.0085, segs=6, radius_fn=lambda t: 0.66 + 0.34 * t)
        set_mat(o, 'eyes')
        rigid(o, 'foot_' + ('R' if s < 0 else 'L'))
        parts.append(o)
    return parts


def build_cleats():
    parts = []
    for s in (-1, 1):
        parts.append(_sole(s))
        parts += _studs(s)
    return parts
