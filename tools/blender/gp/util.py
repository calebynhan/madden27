# Geometry helpers shared by the player build. All shape functions take three.js model-space
# coordinates (x, y up, z forward; the player faces +z, his right side is -x) and convert to
# Blender (x, -z, y) only when they write vertices.
import math

import bmesh
import bpy
from mathutils import Vector


def V(x, y, z):
    """three.js model space (x, up, forward) -> Blender (x, -forward, up)."""
    return Vector((x, -z, y))


def T(v):
    """Blender -> three.js model space."""
    return (v.x, v.z, -v.y)


def gauss(v, w):
    return math.exp(-(v / w) ** 2)


def angd(a, b):
    """Smallest absolute difference between two angles."""
    d = (a - b) % (2 * math.pi)
    return min(d, 2 * math.pi - d)


def smooth01(u):
    u = 0.0 if u < 0 else 1.0 if u > 1 else u
    return u * u * (3 - 2 * u)


def sgnpow(v, e):
    return math.copysign(abs(v) ** e, v)


def clamp01(v):
    return 0.0 if v < 0 else 1.0 if v > 1 else v


# ---------------------------------------------------------------- scene helpers
def obj_from_bm(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def activate(ob):
    for o in list(bpy.context.view_layer.objects):
        if o is not None:
            o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)


def apply_mod(ob, mod):
    activate(ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def join(parts, name=None):
    activate(parts[0])
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    if name:
        ob.name = name
    return ob


def mat(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    return m


def set_mat(ob, *names):
    ob.data.materials.clear()
    for n in names:
        ob.data.materials.append(mat(n))


def flip_outward(ob, inside_point):
    """Make face normals point away from inside_point (three.js coordinates)."""
    me = ob.data
    c = V(*inside_point)
    if sum(((p.center - c).dot(p.normal) for p in me.polygons)) < 0:
        bm = bmesh.new()
        bm.from_mesh(me)
        for f in bm.faces:
            f.normal_flip()
        bm.to_mesh(me)
        bm.free()


# ---------------------------------------------------------------- primitives
def grid_mesh(name, rows, close_u=True, cap_ends=True):
    """Quad mesh from a rows x cols grid of three.js points; rows[i][j]. Closes around j when
    close_u, and caps the first and last rows with fans to their centroids when cap_ends."""
    bm = bmesh.new()
    vs = [[bm.verts.new(V(*p)) for p in row] for row in rows]
    n = len(rows[0])
    jmax = n if close_u else n - 1
    for i in range(len(rows) - 1):
        for j in range(jmax):
            j2 = (j + 1) % n
            try:
                bm.faces.new((vs[i][j], vs[i][j2], vs[i + 1][j2], vs[i + 1][j]))
            except ValueError:
                pass
    if cap_ends:
        for row, rev in ((vs[0], True), (vs[-1], False)):
            c = sum((v.co for v in row), Vector()) / len(row)
            cv = bm.verts.new(c)
            for j in range(n):
                tri = (row[j], row[(j + 1) % n], cv)
                try:
                    bm.faces.new(tuple(reversed(tri)) if rev else tri)
                except ValueError:
                    pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm)


def limb_frame(a, b):
    """Orthonormal frame for a limb from a to b (three.js): axis d, side fx (~+x), front fz (~+z)."""
    A, B = Vector(a), Vector(b)
    d = (B - A).normalized()
    Z = Vector((0, 0, 1))
    if abs(d.dot(Z)) > 0.95:
        Z = Vector((0, -1, 0))
    fz = (Z - d * Z.dot(d)).normalized()
    fx = fz.cross(d).normalized()
    if fx.x < 0:
        fx = -fx
    return A, B, d, fx, fz


def loft(name, a, b, section, rings=24, segs=32):
    """Closed tube from a to b (three.js). section(t, th) -> (side, front) offset of the surface
    point at fraction t along the axis and angle th (0 = front, pi/2 = +x side)."""
    A, B, d, fx, fz = limb_frame(a, b)
    L = (B - A).length
    rows = []
    for i in range(rings + 1):
        t = i / rings
        c = A + d * (L * t)
        row = []
        for j in range(segs):
            th = 2 * math.pi * j / segs
            sx, sz = section(t, th)
            p = c + fx * sx + fz * sz
            row.append((p.x, p.y, p.z))
        rows.append(row)
    return grid_mesh(name, rows)


def muscle_section(prof, bumps=(), n=2.0, mirror=1):
    """Section function for loft(): a superellipse with radii prof(t) -> (rx, rz[, dz]) plus
    gaussian bumps (amp, th_center, th_width, t_center, t_width) as a fraction of the radius.
    mirror=-1 flips the side the bumps sit on (th -> -th) for the right-hand limb."""
    def f(t, th):
        p = prof(t)
        rx, rz = p[0], p[1]
        dz = p[2] if len(p) > 2 else 0.0
        k = 1.0
        for amp, thc, thw, tc, tw in bumps:
            k += amp * gauss(angd(th, thc * mirror), thw) * gauss(t - tc, tw)
        s, c = math.sin(th), math.cos(th)
        return sgnpow(s, 2 / n) * rx * k, sgnpow(c, 2 / n) * rz * k + dz
    return f


def lerp_prof(points):
    """Profile through (t, a, b, ...) points, eased with smoothstep between them."""
    width = max(len(p) for p in points)
    points = [tuple(p) + (0.0,) * (width - len(p)) for p in points]

    def f(t):
        for k in range(len(points) - 1):
            t0, t1 = points[k][0], points[k + 1][0]
            if t <= t1 or k == len(points) - 2:
                u = smooth01(0 if t1 == t0 else (t - t0) / (t1 - t0))
                a, b = points[k], points[k + 1]
                return tuple(a[i] + (b[i] - a[i]) * u for i in range(1, width))
        return points[-1][1:]
    return f


def superellipsoid(name, c, r, n_vert=2.0, n_horiz=2.0, segs=40, rings=24, fn=None):
    """Superellipsoid centered at c (three.js), radii r = (x, up, fwd). n > 2 is boxier.
    fn(x, y, z) -> (x, y, z) optional per-vertex shaping in local three.js coordinates."""
    rows = []
    for i in range(1, rings):
        v = -math.pi / 2 + math.pi * i / rings
        row = []
        for j in range(segs):
            u = -math.pi + 2 * math.pi * j / segs
            cv, sv, cu, su = math.cos(v), math.sin(v), math.cos(u), math.sin(u)
            x = r[0] * sgnpow(cv, 2 / n_vert) * sgnpow(su, 2 / n_horiz)
            y = r[1] * sgnpow(sv, 2 / n_vert)
            z = r[2] * sgnpow(cv, 2 / n_vert) * sgnpow(cu, 2 / n_horiz)
            if fn:
                x, y, z = fn(x, y, z)
            row.append((c[0] + x, c[1] + y, c[2] + z))
        rows.append(row)
    return grid_mesh(name, rows)


def sweep(name, pts, r=0.0062, segs=8, cap=True, radius_fn=None):
    """Round tube along a polyline of three.js points. radius_fn(t) scales r along it."""
    P = [V(*p) for p in pts]
    bm = bmesh.new()
    rings = []
    ref = Vector((0, 0, 1))
    for i, c in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        if abs(t.dot(ref)) > 0.9:
            ref = Vector((1, 0, 0))
        a = t.cross(ref).normalized()
        b = t.cross(a).normalized()
        rr = r * (radius_fn(i / max(1, len(P) - 1)) if radius_fn else 1.0)
        rings.append([bm.verts.new(c + (a * math.cos(2 * math.pi * j / segs) + b * math.sin(2 * math.pi * j / segs)) * rr)
                      for j in range(segs)])
    for i in range(len(rings) - 1):
        for j in range(segs):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % segs], rings[i + 1][(j + 1) % segs], rings[i + 1][j]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm)


def catmull(points, n):
    """n+1 points along a Catmull-Rom spline through the given three.js points."""
    P = [Vector(p) for p in points]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    segs = len(P) - 3
    for k in range(n + 1):
        u = k / n * segs
        i = min(int(u), segs - 1)
        f = u - i
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        q = 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3)
        out.append((q.x, q.y, q.z))
    return out


def report(ob, label):
    me = ob.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    print(f'[{label}] verts {len(me.vertices)} faces {len(me.polygons)} bbox x {min(xs):.3f}..{max(xs):.3f} '
          f'fwd {-max(ys):.3f}..{-min(ys):.3f} up {min(zs):.3f}..{max(zs):.3f}', flush=True)
