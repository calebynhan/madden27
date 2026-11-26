# Gridiron 27 player model, built procedurally in Blender (an original design: no scanned or
# downloaded assets). Run headless:
#   blender -b --factory-startup -P tools/blender/player.py -- assets/player.glb
#
# Pipeline: overlapping body volumes (lofted limbs, superellipsoid torso, pads, pelvis,
# head) are fused with a voxel remesh, smoothed, and retopologized to clean quads. The
# uniform is cut into material zones along clean planes, given UVs for runtime team
# textures, rigged to the game's joint layout (same joints the procedural animation
# drives), given "heavy" and "lean" body shape keys, ambient occlusion is baked into the
# vertex colors, and the helmet, facemask, stripe and logo patches are added as rigid parts
# on the head. Units are yards (the game's unit); the model faces +Z in three.js.
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else 'player.glb'
STAGE = int(os.environ.get('STAGE', '99'))
# HD=1: work in progress (untested) - separate gloved fingers, a procedural high-poly sculpt
# and Cycles bakes of its normal + AO maps onto a second UV set. Off by default.
HD = os.environ.get('HD') == '1'
TARGET_FACES = int(os.environ.get('FACES', '7000'))


def V(x, y, z):
    """three.js model space (x, up, forward) -> Blender (x, -forward, up)."""
    return Vector((x, -z, y))


def T(v):
    """Blender -> three.js model space."""
    return (v.x, v.z, -v.y)


# ---------------------------------------------------------------- joints (three.js space)
# Must match src/render/player.js (the procedural animation drives these joints).
J = {
    'root': (0, 0, 0),
    'hips': (0, 1.0, 0),
    'torso': (0, 1.08, 0),
    'head': (0, 1.81, 0),
    'shoulder_R': (-0.32, 1.64, 0), 'elbow_R': (-0.32, 1.32, 0), 'hand_R': (-0.32, 1.0, 0),
    'shoulder_L': (0.32, 1.64, 0), 'elbow_L': (0.32, 1.32, 0), 'hand_L': (0.32, 1.0, 0),
    'thigh_R': (-0.12, 0.92, 0), 'knee_R': (-0.12, 0.46, 0), 'foot_R': (-0.12, 0.03, 0),
    'thigh_L': (0.12, 0.92, 0), 'knee_L': (0.12, 0.46, 0), 'foot_L': (0.12, 0.03, 0),
}
PARENT = {
    'root': None, 'hips': 'root', 'torso': 'hips', 'head': 'torso',
    'shoulder_R': 'torso', 'elbow_R': 'shoulder_R', 'hand_R': 'elbow_R',
    'shoulder_L': 'torso', 'elbow_L': 'shoulder_L', 'hand_L': 'elbow_L',
    'thigh_R': 'hips', 'knee_R': 'thigh_R', 'foot_R': 'knee_R',
    'thigh_L': 'hips', 'knee_L': 'thigh_L', 'foot_L': 'knee_L',
}
# Bone tails (where each bone points), three.js space
TAIL = {
    'root': (0, 0.5, 0), 'hips': (0, 1.08, 0), 'torso': (0, 1.79, 0), 'head': (0, 2.08, 0),
    'shoulder_R': J['elbow_R'], 'elbow_R': J['hand_R'], 'hand_R': (-0.32, 0.86, 0.01),
    'shoulder_L': J['elbow_L'], 'elbow_L': J['hand_L'], 'hand_L': (0.32, 0.86, 0.01),
    'thigh_R': J['knee_R'], 'knee_R': J['foot_R'], 'foot_R': (-0.12, 0.03, 0.17),
    'thigh_L': J['knee_L'], 'knee_L': J['foot_L'], 'foot_L': (0.12, 0.03, 0.17),
}


# ---------------------------------------------------------------- mesh helpers
def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def obj_from_bm(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def activate(ob):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)


def apply_mod(ob, mod):
    activate(ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def sgnpow(v, e):
    return math.copysign(abs(v) ** e, v)


def tube(name, a, b, prof, segs=24, rings=18, n=2.0, side=None):
    """Lofted tube from a to b (three.js space). prof(t) -> (r_side, r_front[, front_offset])."""
    A, B = V(*a), V(*b)
    d = B - A
    L = d.length
    d.normalize()
    s = V(1, 0, 0) if side is None else V(*side)
    if abs(d.dot(s)) > 0.95:
        s = V(0, 0, 1)
    fx = (s - d * s.dot(d)).normalized()   # side-to-side axis
    fy = fx.cross(d).normalized()          # front axis (three +Z when the tube points down)
    bm = bmesh.new()
    rings_v = []
    for i in range(rings + 1):
        t = i / rings
        p = prof(t)
        rx, rz = p[0], p[1]
        off = p[2] if len(p) > 2 else 0.0
        c = A + d * (L * t) + fy * off
        ring = []
        for j in range(segs):
            th = 2 * math.pi * j / segs
            px = sgnpow(math.cos(th), 2 / n) * rx
            py = sgnpow(math.sin(th), 2 / n) * rz
            ring.append(bm.verts.new(c + fx * px + fy * py))
        rings_v.append(ring)
    for i in range(rings):
        for j in range(segs):
            a1, a2 = rings_v[i][j], rings_v[i][(j + 1) % segs]
            b1, b2 = rings_v[i + 1][j], rings_v[i + 1][(j + 1) % segs]
            bm.faces.new((a1, a2, b2, b1))
    bm.faces.new(list(reversed(rings_v[0])))
    bm.faces.new(rings_v[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm)


def superellipsoid(name, c, r, n_vert=2.0, n_horiz=2.0, segs=40, rings=24, fn=None):
    """Superellipsoid centered at c (three.js), radii r = (x, up, fwd). n > 2 is boxier.
    fn(x, y, z) -> (x, y, z) optional per-vertex shaping in local three.js coordinates."""
    bm = bmesh.new()
    verts = []
    for i in range(rings + 1):
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
            row.append(bm.verts.new(V(c[0] + x, c[1] + y, c[2] + z)))
        verts.append(row)
    for i in range(rings):
        for j in range(segs):
            q = (verts[i][j], verts[i][(j + 1) % segs], verts[i + 1][(j + 1) % segs], verts[i + 1][j])
            try:
                bm.faces.new(q)
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm)


def lerp_prof(points):
    """Piecewise-linear profile through (t, rx, rz[, off]) points, smoothed with smoothstep."""
    points = [tuple(p) + (0.0,) * (4 - len(p)) for p in points]
    def f(t):
        for k in range(len(points) - 1):
            t0, t1 = points[k][0], points[k + 1][0]
            if t <= t1 or k == len(points) - 2:
                u = 0 if t1 == t0 else max(0.0, min(1.0, (t - t0) / (t1 - t0)))
                u = u * u * (3 - 2 * u)
                a, b = points[k], points[k + 1]
                return tuple(a[i] + (b[i] - a[i]) * u for i in range(1, len(a)))
        return points[-1][1:]
    return f


# ---------------------------------------------------------------- body volumes
def build_body():
    parts = []
    # Torso (waist to collar): V-shape from a trim waist up to the pads
    parts.append(tube('torso', (0, 0.99, 0.0), (0, 1.74, 0.0), lerp_prof([
        (0.0, 0.15, 0.112, 0.0), (0.12, 0.152, 0.114, 0.0), (0.33, 0.165, 0.12, 0.006), (0.6, 0.192, 0.134, 0.012),
        (0.84, 0.21, 0.14, 0.01), (0.95, 0.19, 0.128, 0.0), (1.0, 0.12, 0.1, -0.01)]), segs=32, rings=22, n=2.3))
    # Shoulder pads under the jersey: a yoke arching around the neck and a rounded cap over
    # each shoulder (the classic broad, sloped football silhouette)
    parts.append(superellipsoid('yoke', (0, 1.676, -0.006), (0.232, 0.064, 0.142), n_vert=2.4, n_horiz=2.8))
    for s in (-1, 1):
        parts.append(superellipsoid('cap', (0.262 * s, 1.652, -0.008), (0.112, 0.07, 0.136), n_vert=2.3, n_horiz=2.4, segs=28, rings=16,
                                    fn=lambda x, y, z, s=s: (x, y - 0.034 * max(0.0, x * s / 0.112) ** 2, z)))
    # Jersey collar around the neck
    parts.append(tube('collar', (0, 1.72, -0.008), (0, 1.805, -0.014), lerp_prof([(0, 0.098, 0.096), (1, 0.086, 0.082)]), segs=24, rings=4))
    # Jersey tucked into the pants: a slight ridge at the waistband
    parts.append(tube('waistband', (0, 1.062, -0.002), (0, 1.098, -0.002), lerp_prof([(0, 0.157, 0.119), (1, 0.158, 0.12)]), segs=32, rings=3))
    # Pelvis / seat
    parts.append(superellipsoid('pelvis', (0, 0.985, -0.01), (0.19, 0.128, 0.13), n_vert=2.3, n_horiz=2.5))
    # Neck and head (the face shows through the facemask)
    parts.append(tube('neck', (0, 1.70, -0.005), (0, 1.9, 0.0), lerp_prof([(0, 0.075, 0.072), (1, 0.066, 0.066)]), segs=20, rings=8))
    parts.append(superellipsoid('head', (0, 1.943, 0.006), (0.086, 0.106, 0.1), n_vert=2.1, n_horiz=2.1,
                                fn=lambda x, y, z: (x * (1 - 0.2 * max(0, -y / 0.106)), y, z + 0.012 * max(0, -y / 0.106))))
    # Nose and brow (the face shows through the facemask)
    parts.append(superellipsoid('nose', (0, 1.927, 0.098), (0.013, 0.024, 0.02), segs=16, rings=10))
    parts.append(superellipsoid('brow', (0, 1.969, 0.086), (0.06, 0.014, 0.02), segs=20, rings=8))
    for s, side in ((-1, 'R'), (1, 'L')):
        hx = 0.118 * s
        # Thigh (hip to knee), widest high up
        parts.append(tube('thigh' + side, (hx * 0.98, 0.97, -0.005), (0.12 * s, 0.46, 0.005), lerp_prof([
            (0.0, 0.088, 0.094), (0.12, 0.11, 0.116, 0.004), (0.3, 0.107, 0.112, 0.006), (0.66, 0.09, 0.094, 0.004), (1.0, 0.07, 0.072)]), segs=24, rings=16))
        # Knee pad bulge (inside the pants)
        parts.append(superellipsoid('kneepad' + side, (0.12 * s, 0.47, 0.03), (0.07, 0.072, 0.055), n_vert=2.2, n_horiz=2.2, segs=20, rings=12))
        # Lower leg: calf swells high, slim ankle
        parts.append(tube('shin' + side, (0.12 * s, 0.47, 0.0), (0.12 * s, 0.06, 0.0), lerp_prof([
            (0.0, 0.062, 0.062), (0.22, 0.066, 0.074, -0.01), (0.55, 0.054, 0.056, -0.004), (1.0, 0.04, 0.042)]), segs=20, rings=16))
        # Cleat: low, long shoe with a flat sole
        def shoe(x, y, z):
            if y < -0.012:
                y = -0.012 + (y + 0.012) * 0.25
            return x, y, z
        parts.append(superellipsoid('shoe' + side, (0.12 * s, 0.045, 0.045), (0.047, 0.042, 0.125), n_vert=2.4, n_horiz=2.3, segs=24, rings=14, fn=shoe))
        # Upper arm (deltoid/biceps) and forearm
        ax = 0.32 * s
        parts.append(tube('uarm' + side, (ax * 0.97, 1.66, 0.0), (ax, 1.31, 0.005), lerp_prof([
            (0.0, 0.085, 0.085), (0.3, 0.076, 0.08, 0.006), (0.7, 0.066, 0.066), (1.0, 0.054, 0.054)]), segs=20, rings=14))
        parts.append(tube('farm' + side, (ax, 1.33, 0.005), (ax, 1.0, 0.012), lerp_prof([
            (0.0, 0.054, 0.054), (0.25, 0.058, 0.056), (0.75, 0.045, 0.042), (1.0, 0.037, 0.034)]), segs=18, rings=12))
        # Gloved hand: a slightly cupped mitten with a thumb
        if HD:  # palm only; separate fingers are added later
            parts.append(superellipsoid('hand' + side, (ax, 0.952, 0.02), (0.032, 0.05, 0.05), n_vert=2.3, n_horiz=2.6, segs=20, rings=12))
        else:   # gloved mitten
            parts.append(superellipsoid('hand' + side, (ax, 0.935, 0.02), (0.034, 0.07, 0.05), n_vert=2.2, n_horiz=2.6, segs=20, rings=12,
                                        fn=lambda x, y, z: (x, y, z + 0.016 * max(0.0, -y / 0.07) ** 2 + 0.008 * (1 - (y / 0.07) ** 2))))
        parts.append(tube('thumb' + side, (ax - 0.014 * s, 0.975, 0.044), (ax - 0.02 * s, 0.925, 0.07), lerp_prof([(0, 0.018, 0.018), (1, 0.013, 0.013)]), segs=12, rings=6))
    return parts



# ---------------------------------------------------------------- materials
def mat(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = False
    return m


def set_mat(ob, *names):
    ob.data.materials.clear()
    for n in names:
        ob.data.materials.append(mat(n))


# ---------------------------------------------------------------- helmet and face
HC = (0.0, 1.95, -0.008)         # helmet center (three.js space)
HR = (0.149, 0.158, 0.175)       # shell radii: side, up, front-back


def shell_point(th, ps, k=1.0, fwd=0.0):
    """Point on the (virtual) helmet shell at azimuth th (0 = front, + = left) and elevation ps."""
    flare = 1.0 + max(0.0, -0.42 - ps) * 0.07
    x = HR[0] * math.cos(ps) * math.sin(th) * k * flare
    y = HR[1] * math.sin(ps) * k
    z = HR[2] * math.cos(ps) * math.cos(th) * k * flare
    return (HC[0] + x, HC[1] + y, HC[2] + z + fwd)


def psi_bottom(th):
    """Lower edge of the shell: brow over the face opening, the opening's sides, the jaw
    flaps, and the back edge at the neck."""
    a = abs(th)
    if a < 0.58:
        return 0.135 + 0.05 * (a / 0.58) ** 2
    if a < 0.86:
        u = (a - 0.58) / 0.28
        u = u * u * (3 - 2 * u)
        return 0.185 + (-0.79 - 0.185) * u
    if a < 1.8:
        return -0.79 + 0.2 * (a - 0.86) / 0.94
    return -0.59 + 0.03 * (a - 1.8) / (math.pi - 1.8)


def sweep(name, pts, r=0.0062, segs=8, cap=True):
    """Tube along a polyline (three.js points)."""
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
        rings.append([bm.verts.new(c + (a * math.cos(2 * math.pi * j / segs) + b * math.sin(2 * math.pi * j / segs)) * r) for j in range(segs)])
    for i in range(len(rings) - 1):
        for j in range(segs):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % segs], rings[i + 1][(j + 1) % segs], rings[i + 1][j]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(name, bm)


def build_helmet():
    parts = []
    # Shell: a grid between the lower edge curve and the crown
    ths = sorted(set([-math.pi + 2 * math.pi * i / 64 for i in range(64)] +
                     [sg * (0.58 + 0.28 * k / 6) for sg in (-1, 1) for k in range(7)]))
    rows = 13
    bm = bmesh.new()
    grid = []
    for th in ths:
        pb = psi_bottom(th)
        col = []
        for i in range(rows):
            u = i / rows
            ps = pb + (math.pi / 2 - pb) * (u ** 0.95)
            col.append(bm.verts.new(V(*shell_point(th, ps))))
        grid.append(col)
    top = bm.verts.new(V(*shell_point(0, math.pi / 2)))
    n = len(ths)
    for c in range(n):
        c2 = (c + 1) % n
        for i in range(rows - 1):
            bm.faces.new((grid[c][i], grid[c2][i], grid[c2][i + 1], grid[c][i + 1]))
        bm.faces.new((grid[c][rows - 1], grid[c2][rows - 1], top))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Normals must point outward
    shell = obj_from_bm('shell', bm)
    me = shell.data
    me.update()
    out = sum(((p.center - V(*HC)).dot(p.normal) for p in me.polygons))
    if out < 0:
        bm = bmesh.new(); bm.from_mesh(me)
        for f in bm.faces:
            f.normal_flip()
        bm.to_mesh(me); bm.free()
    set_mat(shell, 'helmet', 'helmetpad')
    sol = shell.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.014
    sol.offset = -1
    sol.use_rim = True
    sol.material_offset = 1
    sol.material_offset_rim = 1
    apply_mod(shell, sol)
    parts.append(shell)
    # Center stripe over the crown
    bm = bmesh.new()
    prev = None
    steps = 40
    for i in range(steps + 1):
        beta = 0.19 + (math.pi + 0.56 - 0.19) * i / steps
        y = HR[1] * math.sin(beta); z = HR[2] * math.cos(beta)
        nrm = Vector((0, math.sin(beta) / HR[1], math.cos(beta) / HR[2])).normalized()
        c = Vector((0, HC[1] + y, HC[2] + z)) + nrm * 0.0035
        row = [bm.verts.new(V(c.x + sx * 0.022, c.y, c.z)) for sx in (-1, 1)]
        if prev:
            bm.faces.new((prev[0], prev[1], row[1], row[0]))
        prev = row
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    stripe = obj_from_bm('stripe', bm)
    me = stripe.data
    if sum(((p.center - V(*HC)).dot(p.normal) for p in me.polygons)) < 0:
        bm = bmesh.new(); bm.from_mesh(me)
        for f in bm.faces: f.normal_flip()
        bm.to_mesh(me); bm.free()
    set_mat(stripe, 'stripe')
    parts.append(stripe)
    # Logo patches on both sides (UVs read correctly from each side) and ear holes
    for sx in (-1, 1):
        for kind, yc, zc, R in (('decal', 0.0, -0.012, 0.06), ('earhole', -0.06, -0.004, 0.017)):
            bm = bmesh.new()
            uvl = bm.loops.layers.uv.new('UVMap')
            nr, ns = (4, 20) if kind == 'decal' else (2, 12)
            center = None
            ringsv = []
            def surf(dy, dz):
                yy, zz = yc + dy, zc + dz
                q = 1 - ((yy) / HR[1]) ** 2 - ((zz) / HR[2]) ** 2
                xx = HR[0] * math.sqrt(max(q, 0.0)) * (1.0 + max(0.0, -0.42 - math.asin(max(-1, min(1, yy / HR[1])))) * 0.07)
                nrm = Vector((xx / HR[0] ** 2, yy / HR[1] ** 2, zz / HR[2] ** 2)).normalized()
                p = Vector((sx * xx, HC[1] + yy, HC[2] + zz)) + Vector((sx * nrm.x, nrm.y, nrm.z)) * 0.003
                return bm.verts.new(V(p.x, p.y, p.z)), dz, dy
            center = surf(0, 0)
            for i in range(1, nr + 1):
                rr = R * i / nr
                ringsv.append([surf(rr * math.sin(2 * math.pi * j / ns), rr * math.cos(2 * math.pi * j / ns)) for j in range(ns)])
            def uv(item):
                _, dz, dy = item
                u = 0.5 + (dz if sx < 0 else -dz) / (2 * R)
                return (u, 0.5 + dy / (2 * R))
            faces = []
            for j in range(ns):
                f = bm.faces.new((center[0], ringsv[0][j][0], ringsv[0][(j + 1) % ns][0]))
                faces.append((f, (center, ringsv[0][j], ringsv[0][(j + 1) % ns])))
            for i in range(nr - 1):
                for j in range(ns):
                    a1, a2, b1, b2 = ringsv[i][j], ringsv[i][(j + 1) % ns], ringsv[i + 1][j], ringsv[i + 1][(j + 1) % ns]
                    f = bm.faces.new((a1[0], b1[0], b2[0], a2[0]))
                    faces.append((f, (a1, b1, b2, a2)))
            for f, items in faces:
                for loop, it in zip(f.loops, items):
                    loop[uvl].uv = uv(it)
            o = obj_from_bm(kind, bm)
            me = o.data
            if sum(((p.center - V(0, HC[1] + yc, HC[2] + zc)).dot(p.normal) * (1 if True else 1) for p in me.polygons)) * 0 == 0:
                # outward = +x on the left side, -x on the right side
                if sum((p.normal.x * sx for p in me.polygons)) < 0:
                    bm2 = bmesh.new(); bm2.from_mesh(me)
                    for f in bm2.faces: f.normal_flip()
                    bm2.to_mesh(me); bm2.free()
            set_mat(o, 'decal' if kind == 'decal' else 'eyes')
            parts.append(o)
    # Facemask: three bars, a center bar and two side bars, tied into the shell
    def bar(th0, th1, ps, k, f, n=14):
        return [shell_point(th0 + (th1 - th0) * i / n, ps, k, f) for i in range(n + 1)]
    def vert(th, n=6):
        return [shell_point(th, -0.06 + (-0.58 + 0.06) * i / n, 1.035 + 0.035 * i / n, 0.008 + 0.03 * i / n) for i in range(n + 1)]
    mask_parts = [
        bar(-0.8, 0.8, -0.06, 1.035, 0.008), bar(-0.78, 0.78, -0.33, 1.07, 0.028), bar(-0.62, 0.62, -0.58, 1.07, 0.038),
        vert(0.0), vert(-0.46), vert(0.46),
    ]
    for sg in (-1, 1):
        mask_parts.append([shell_point(sg * 0.8, -0.06, 1.035, 0.008), shell_point(sg * 0.9, -0.08, 0.99, 0.0)])
        mask_parts.append([shell_point(sg * 0.78, -0.33, 1.07, 0.028), shell_point(sg * 0.92, -0.42, 0.99, 0.0)])
        mask_parts.append([shell_point(sg * 0.62, -0.58, 1.07, 0.038), shell_point(sg * 0.78, -0.33, 1.07, 0.028)])
    for i, pts in enumerate(mask_parts):
        o = sweep('mask%d' % i, pts, r=0.0064, segs=6)
        set_mat(o, 'mask')
        parts.append(o)
    # Chin strap: cup and straps
    cup = superellipsoid('cup', (0, 1.822, 0.108), (0.035, 0.022, 0.023), segs=12, rings=8)
    set_mat(cup, 'strap'); parts.append(cup)
    for sg in (-1, 1):
        o = sweep('strap', [(sg * 0.031, 1.826, 0.104), (sg * 0.078, 1.846, 0.078), (sg * 0.117, 1.866, 0.036)], r=0.0045, segs=5)
        set_mat(o, 'strap'); parts.append(o)
    # Visor (shown on some players): tinted shield just inside the top bar
    bm = bmesh.new()
    gv = []
    for i in range(4):
        ps = -0.07 + 0.21 * i / 3
        gv.append([bm.verts.new(V(*shell_point(-0.62 + 1.24 * j / 12, ps, 0.99))) for j in range(13)])
    for i in range(3):
        for j in range(12):
            bm.faces.new((gv[i][j], gv[i][j + 1], gv[i + 1][j + 1], gv[i + 1][j]))
    visor = obj_from_bm('visor', bm)
    if sum((p.normal.y for p in visor.data.polygons)) > 0:  # face forward (three +Z = Blender -Y)
        bm2 = bmesh.new(); bm2.from_mesh(visor.data)
        for f in bm2.faces: f.normal_flip()
        bm2.to_mesh(visor.data); bm2.free()
    set_mat(visor, 'visor'); parts.append(visor)
    # Eyes and eye black, seen through the mask
    for sg in (-1, 1):
        for c, r in (((sg * 0.034, 1.955, 0.088), (0.016, 0.008, 0.006)), ((sg * 0.036, 1.937, 0.093), (0.018, 0.0055, 0.004))):
            o = superellipsoid('eye', c, r, segs=10, rings=6)
            set_mat(o, 'eyes'); parts.append(o)
    return parts


# ---------------------------------------------------------------- uniform zones and UVs
SLEEVE_Y, WRIST_Y, SOCK_Y, SHOE_Y = 1.50, 1.005, 0.40, 0.095
BELT_TOP, BELT_BOT, COLLAR_Y = 1.10, 1.066, 1.805
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
    SEGS['foot_' + _sd] = ((0.12 * _sx, 0.05, -0.04), (0.12 * _sx, 0.04, 0.17))
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


SEG_R = {'head': 0.1, 'neck': 0.08, 'torso': 0.2, 'pelvis': 0.17, 'upper': 0.075, 'fore': 0.055, 'hand': 0.05, 'thigh': 0.1, 'shin': 0.06, 'foot': 0.05}


def nearest_seg(p):
    """Body segment a surface point belongs to: nearest axis relative to that part's thickness."""
    best = None
    for k, (a, b) in SEGS.items():
        dd, t = seg_dist(p, a, b)
        dd /= SEG_R[k.split('_')[0]]
        if best is None or dd < best[0]:
            best = (dd, k, t)
    return best[1]


def zone_of(p):
    """Uniform zone by body chain (which part of the body) and height (where the cut lines are)."""
    k = nearest_seg(p)
    y = p[1]
    if k in ('head', 'neck'):
        return 'skin' if y > COLLAR_Y else 'jersey'
    if k.split('_')[0] in ('upper', 'fore', 'hand'):
        return 'jersey' if y > SLEEVE_Y else ('arms' if y > WRIST_Y else 'gloves')
    if y > COLLAR_Y: return 'skin'
    if y > BELT_TOP: return 'jersey'
    if y > BELT_BOT: return 'belt'
    if y > SOCK_Y: return 'pants'
    return 'socks' if y > SHOE_Y else 'shoes'


def cut_zones(ob):
    """Clean horizontal cuts along every uniform boundary (so color edges are straight)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for y in (SLEEVE_Y, WRIST_Y, SOCK_Y, SHOE_Y, BELT_TOP, BELT_BOT, COLLAR_Y):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=V(0, y, 0), plane_no=Vector((0, 0, 1)), dist=1e-5)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(ob.data)
    bm.free()


def ang(x, z):
    """Around-the-axis texture coordinate: right side 0, front 0.25, left 0.5, back 0.75."""
    return ((math.atan2(x, z) + math.pi / 2) % (2 * math.pi)) / (2 * math.pi)


def clamp01(v):
    return 0.0 if v < 0 else 1.0 if v > 1 else v


def zone_and_uv(ob):
    me = ob.data
    set_mat(ob, *BODY_MATS)
    idx = {n: i for i, n in enumerate(BODY_MATS)}
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        c = T(poly.center)
        z = zone_of(c)
        poly.material_index = idx[z]
        k = nearest_seg(c)
        pts = [T(me.vertices[me.loops[li].vertex_index].co) for li in poly.loop_indices]
        if z == 'jersey' and k.startswith('upper'):
            sx = -1 if k.endswith('R') else 1
            v0, v1 = (0.0, 0.1) if sx < 0 else (0.11, 0.21)
            us = [ang(p[0] - 0.32 * sx, p[2]) for p in pts]
            vs = [v0 + (v1 - v0) * clamp01((p[1] - SLEEVE_Y) / (1.74 - SLEEVE_Y)) for p in pts]
        elif z == 'jersey':
            us = [ang(p[0], p[2]) for p in pts]
            vs = [0.22 + 0.78 * clamp01((p[1] - BELT_TOP) / (COLLAR_Y - BELT_TOP)) for p in pts]
        elif z == 'pants' and (k.startswith('thigh') or k.startswith('shin')):
            sx = -1 if k.endswith('R') else 1
            v0, v1 = (0.0, 0.25) if sx < 0 else (0.25, 0.5)
            us = [ang(p[0] - 0.12 * sx, p[2]) for p in pts]
            vs = [v0 + (v1 - v0) * clamp01((p[1] - SOCK_Y) / (1.0 - SOCK_Y)) for p in pts]
        elif z == 'pants':
            us = [ang(p[0], p[2]) for p in pts]
            vs = [0.5 + 0.5 * clamp01((p[1] - 0.86) / (BELT_BOT - 0.86)) for p in pts]
        else:
            a = SEGS[k][0]
            us = [ang(p[0] - a[0], p[2] - a[2]) for p in pts]
            vs = [p[1] * 2.0 for p in pts]
        u0 = us[0]
        us = [u + 1 if u - u0 < -0.5 else (u - 1 if u - u0 > 0.5 else u) for u in us]
        for li, u, v in zip(poly.loop_indices, us, vs):
            uv.data[li].uv = (u, v)


# ---------------------------------------------------------------- rig and weights
def build_armature():
    data = bpy.data.armatures.new('rig')
    arm = bpy.data.objects.new('rig', data)
    bpy.context.collection.objects.link(arm)
    activate(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = data.edit_bones
    for name in J:
        b = eb.new(name)
        b.head = V(*J[name])
        b.tail = V(*TAIL[name])
        if PARENT[name]:
            b.parent = eb[PARENT[name]]
        b.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    data.bones['root'].use_deform = False
    return arm


def skin(body, arm):
    activate(body)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    # Any vertex the heat solver missed goes to the bone of its nearest body segment
    me = body.data
    groups = {g.name: g for g in body.vertex_groups}
    fixed = 0
    for v in me.vertices:
        tot = sum(g.weight for g in v.groups)
        if tot < 0.01:
            bone = SEG_BONE[nearest_seg(T(v.co))]
            groups[bone].add([v.index], 1.0, 'REPLACE')
            fixed += 1
    print('[weights] heat-solver misses fixed:', fixed, flush=True)


def rigid_head(parts, body):
    """Helmet, mask, face details: one object, fully weighted to the head bone, joined to the body."""
    activate(parts[0])
    for p in parts:
        p.select_set(True)
    bpy.ops.object.join()
    h = bpy.context.view_layer.objects.active
    g = h.vertex_groups.get('head') or h.vertex_groups.new(name='head')
    # everything not already rigged to a hand (the fingers) rides on the head
    g.add([v.index for v in h.data.vertices if len(v.groups) == 0], 1.0, 'REPLACE')
    activate(h)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    return body


# ---------------------------------------------------------------- body types (shape keys)
HEAVY = {'torso': (1.18, 1.24), 'hips': (1.17, 1.2), 'thigh': 1.2, 'knee': 1.12, 'shoulder': 1.17, 'elbow': 1.12, 'hand': 1.05, 'foot': 1.04, 'head': 1.0}
LEAN = {'torso': (0.93, 0.92), 'hips': (0.93, 0.93), 'thigh': 0.9, 'knee': 0.92, 'shoulder': 0.9, 'elbow': 0.92, 'hand': 0.97, 'foot': 0.98, 'head': 1.0}


def shape_keys(body):
    me = body.data
    names = {g.index: g.name for g in body.vertex_groups}
    body.shape_key_add(name='Basis')
    keys = {'heavy': body.shape_key_add(name='heavy'), 'lean': body.shape_key_add(name='lean')}
    for kname, table in (('heavy', HEAVY), ('lean', LEAN)):
        kd = keys[kname].data
        for v in me.vertices:
            p = Vector(T(v.co))
            disp = Vector((0, 0, 0))
            tw = 0.0
            for ge in v.groups:
                bn = names.get(ge.group)
                if bn is None or ge.weight <= 0:
                    continue
                base = bn.split('_')[0]
                f = table.get(base, 1.0)
                a, b = Vector(J[bn]), Vector(TAIL[bn])
                d = b - a
                t = max(0.0, min(1.0, (p - a).dot(d) / d.length_squared))
                off = p - (a + d * t)
                if isinstance(f, tuple):
                    dd = Vector((off.x * (f[0] - 1), 0, off.z * (f[1] - 1)))
                    if kname == 'heavy' and base in ('torso', 'hips') and off.z > 0:
                        dd.z += 0.032 * max(0.0, 1 - abs(p.y - 1.2) / 0.22)  # belly
                else:
                    dd = off * (f - 1)
                disp += dd * ge.weight
                tw += ge.weight
            q = Vector(T(v.co)) + (disp / tw if tw > 0 else disp)
            kd[v.index].co = V(q.x, q.y, q.z)


# ---------------------------------------------------------------- baked ambient occlusion
def bake_ao(body, samples=48):
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'
    scn.cycles.device = 'CPU'
    scn.cycles.samples = samples
    if scn.world is None:
        scn.world = bpy.data.worlds.new('world')
    scn.world.light_settings.distance = 0.09
    me = body.data
    ca = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
    activate(body)
    scn.render.bake.target = 'VERTEX_COLORS'
    res = bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    print('[ao] bake', res, flush=True)
    # Soften: keep creases dark without crushing the uniform colors
    data = me.color_attributes['Col'].data
    lo, hi, tot = 1.0, 0.0, 0.0
    for d in data:
        a = d.color[0]
        a = 0.42 + 0.58 * a
        lo, hi, tot = min(lo, a), max(hi, a), tot + a
        d.color = (a, a, a, 1.0)
    print(f'[ao] min {lo:.2f} max {hi:.2f} mean {tot / max(1, len(data)):.2f}', flush=True)


# ---------------------------------------------------------------- sculpted detail (high poly)
def _gauss(v, w):
    return math.exp(-(v / w) ** 2)


def _angd(a, b):
    d = (a - b) % (2 * math.pi)
    return min(d, 2 * math.pi - d)


def detail_displace(ob):
    """A procedural sculpt on the dense fused body: fabric gathering where the jersey tucks in,
    flank folds, the dip under the pad edge, side/yoke seams, sleeve hems, collar ribbing,
    folds behind the knees, knee/thigh pad outlines, sock ribbing, glove padding, and muscle
    definition on the arms and neck. Offsets along the normal, in yards."""
    me = ob.data
    disp = []
    for v in me.vertices:
        p = T(v.co)
        x, y, z = p
        k = nearest_seg(p)
        zone = zone_of(p)
        base = k.split('_')[0]
        d = 0.0
        nz = noise.noise(Vector((x * 60, y * 60, z * 60)))
        if zone == 'jersey' and base in ('torso', 'pelvis', 'neck'):
            ph = math.atan2(x, z)
            # fabric gathered above the belt: short vertical puckers
            d += 0.0048 * _gauss(y - (BELT_TOP + 0.035), 0.035) * math.sin(ph * 21 + 2.5 * math.sin(ph * 4) + nz * 1.5)
            # diagonal folds on the flanks under the arms
            side = abs(math.sin(ph))
            if side > 0.55 and 1.2 < y < 1.56:
                d += 0.0032 * (side - 0.55) / 0.45 * math.sin(y * 52 + z * 28 + nz) * _gauss(y - 1.38, 0.12)
            # the jersey dips under the front/back plate edge of the pads
            d -= 0.0026 * _gauss(y - 1.585, 0.012) * (1 - side)
            # side seams and the shoulder yoke seam
            if y < 1.56:
                d += 0.0013 * (_gauss(_angd(ph, math.pi / 2), 0.022) + _gauss(_angd(ph, -math.pi / 2), 0.022))
            if abs(x) < 0.21:
                d += 0.0011 * _gauss(y - 1.668, 0.004)
            # collar ribbing
            if y > COLLAR_Y - 0.05:
                d += 0.0007 * math.sin(ph * 72) * _gauss(y - (COLLAR_Y - 0.02), 0.03)
        elif zone == 'jersey' and base == 'upper':
            sx = -1 if k.endswith('R') else 1
            ax = 0.32 * sx
            pl = math.atan2((x - ax) * sx, z)
            d += 0.0017 * _gauss(y - (SLEEVE_Y + 0.012), 0.0055)                     # hem
            d += 0.0022 * _gauss(y - 1.57, 0.035) * math.sin(pl * 3 + y * 40 + nz)    # sleeve folds
        elif zone == 'pants':
            if base in ('thigh', 'shin'):
                sx = -1 if k.endswith('R') else 1
                lx, lz = x - 0.12 * sx, z
                pl = math.atan2(lx * sx, lz)
                back = max(0.0, -math.cos(pl))
                front = max(0.0, math.cos(pl))
                # folds behind the knee
                d += 0.0045 * back * _gauss(y - 0.49, 0.05) * math.sin(y * 115 + pl * 2 + nz)
                # knee pad and thigh pad outlines (raised borders on the front)
                for y0, y1, wdt in ((0.41, 0.56, 0.055), (0.62, 0.84, 0.07)):
                    if front > 0.2:
                        inside = y0 < y < y1 and abs(lx) < wdt
                        edge = min(abs(y - y0), abs(y - y1), abs(abs(lx) - wdt)) if inside else min(abs(y - y0) if abs(lx) < wdt else 9, abs(y - y1) if abs(lx) < wdt else 9, abs(abs(lx) - wdt) if y0 < y < y1 else 9)
                        d += 0.0016 * front * _gauss(edge, 0.004)
                # outer side seam
                d += 0.0010 * _gauss(_angd(pl, math.pi / 2), 0.03)
            else:
                ph = math.atan2(x, z)
                # crotch folds and the hip
                if y < 0.98:
                    d += 0.0025 * _gauss(y - 0.9, 0.05) * math.sin(ph * 9 + y * 60 + nz)
        elif zone == 'belt':
            d += 0.0009 * math.sin((y - BELT_BOT) / (BELT_TOP - BELT_BOT) * math.pi * 3)
        elif zone == 'socks':
            sx = -1 if k.endswith('R') else 1
            pl = math.atan2((x - 0.12 * sx), z)
            d += 0.0006 * math.sin(pl * 46)
        elif zone == 'arms' and base in ('upper', 'fore'):
            sx = -1 if k.endswith('R') else 1
            ax = 0.32 * sx
            lx, lz = (x - ax) * sx, z - 0.005
            pl = math.atan2(lx, lz)
            front, back = max(0.0, math.cos(pl)), max(0.0, -math.cos(pl))
            out = max(0.0, math.sin(pl))
            if base == 'upper':
                d += 0.0062 * front * _gauss(y - 1.43, 0.045)                                 # biceps
                d += 0.0050 * back * (_gauss(y - 1.47, 0.04) + 0.6 * _gauss(y - 1.40, 0.03)) # triceps
            else:
                d += 0.0045 * front * out * _gauss(y - 1.24, 0.04)                            # forearm
                d += 0.0030 * back * _gauss(y - 1.31, 0.018)                                  # elbow
                d -= 0.0018 * _gauss(y - 1.04, 0.025)                                         # wrist
        elif zone == 'skin' and base in ('neck', 'torso') and z > 0:
            # neck muscles running from behind the ears down to the collarbone
            for sg in (-1, 1):
                t = (y - 1.80) / 0.1
                cx = sg * (0.045 - 0.03 * t)
                d += 0.0028 * _gauss(x - cx, 0.012) * _gauss(t - 0.5, 0.6)
        elif zone == 'gloves':
            d -= 0.0012 * _gauss(math.sin(y * 260), 0.25)                                    # padding lines
        elif zone == 'shoes':
            d += 0.0014 * _gauss(y - 0.018, 0.004)                                           # sole edge
        disp.append(d)
    for v, d in zip(me.vertices, disp):
        v.co += v.normal * d
    me.update()


def build_fingers():
    """Gloved fingers (separate pieces, rigid on each hand), slightly curled toward the palm."""
    parts = []
    for s, side in ((-1, 'R'), (1, 'L')):
        ax = 0.32 * s
        for zf, ln in ((0.05, 0.072), (0.024, 0.078), (-0.002, 0.074), (-0.026, 0.06)):
            pts = []
            for i in range(7):
                u = i / 6
                curl = 0.22 + 0.9 * u
                px = ax - s * (0.004 + ln * 0.42 * (1 - math.cos(curl)) * u)
                py = 0.912 - ln * math.sin(min(1.2, 0.3 + curl)) * u * 0.95
                pts.append((px, py, 0.02 + zf))
            o = sweep('finger' + side, pts, r=0.0102, segs=8)
            g = o.vertex_groups.new(name='hand_' + side)
            g.add([v.index for v in o.data.vertices], 1.0, 'REPLACE')
            set_mat(o, 'gloves')
            parts.append(o)
    return parts


def bake_uv(ob):
    """Second UV layout (non-overlapping) for the baked detail and occlusion maps."""
    me = ob.data
    uv = me.uv_layers.new(name='Bake')
    me.uv_layers.active = uv
    activate(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    # keep a strip at u > 0.98 unbaked (neutral) for parts that don't use the maps
    for d in uv.data:
        d.uv = (d.uv[0] * 0.975, d.uv[1])


def neutral_bake_uv(ob):
    me = ob.data
    if 'UVMap' not in me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.get('Bake') or me.uv_layers.new(name='Bake')
    for d in uv.data:
        d.uv = (0.99, 0.5)


def bake_maps(low, high, out_dir, size=2048):
    """Bake the sculpt (tangent-space normals) and its ambient occlusion onto the game mesh."""
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'
    scn.cycles.device = 'CPU'
    if scn.world is None:
        scn.world = bpy.data.worlds.new('world')
    nimg = bpy.data.images.new('bake_normal', size, size, alpha=False)
    nimg.generated_color = (0.5, 0.5, 1.0, 1.0)
    nimg.colorspace_settings.name = 'Non-Color'
    aimg = bpy.data.images.new('bake_ao', size // 2, size // 2, alpha=False)
    aimg.generated_color = (1.0, 1.0, 1.0, 1.0)
    nodes = []
    for m in low.data.materials:
        m.use_nodes = True
        n = m.node_tree.nodes.new('ShaderNodeTexImage')
        n.image = nimg
        m.node_tree.nodes.active = n
        n.select = True
        nodes.append(n)
    rb = scn.render.bake
    rb.use_selected_to_active = True
    rb.cage_extrusion = 0.012
    rb.max_ray_distance = 0.05
    rb.normal_space = 'TANGENT'
    rb.target = 'IMAGE_TEXTURES'
    rb.margin = 8
    activate(high)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    scn.cycles.samples = 4
    print('[bake] normal', bpy.ops.object.bake(type='NORMAL'), flush=True)
    for n in nodes:
        n.image = aimg
    scn.cycles.samples = 48
    scn.world.light_settings.distance = 0.07
    print('[bake] ao', bpy.ops.object.bake(type='AO'), flush=True)
    os.makedirs(out_dir, exist_ok=True)
    for img, name in ((nimg, 'player_normal.png'), (aimg, 'player_ao.png')):
        img.filepath_raw = os.path.join(out_dir, name)
        img.file_format = 'PNG'
        img.save()
    for m in low.data.materials:
        m.use_nodes = False
    low.data.uv_layers.active = low.data.uv_layers['UVMap']

def fuse(parts, voxel=0.0065):
    activate(parts[0])
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = 'body'
    rm = ob.modifiers.new('rm', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = voxel
    rm.adaptivity = 0
    apply_mod(ob, rm)
    sm = ob.modifiers.new('sm', 'SMOOTH')
    sm.factor = 0.7
    sm.iterations = 6
    apply_mod(ob, sm)
    return ob


def retopo(ob, faces):
    activate(ob)
    bpy.ops.object.quadriflow_remesh(target_faces=faces, use_mesh_symmetry=True, use_preserve_sharp=False, use_preserve_boundary=False, smooth_normals=False, seed=1)
    return bpy.context.view_layer.objects.active


def report(ob, label):
    me = ob.data
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    print(f'[{label}] verts {len(me.vertices)} faces {len(me.polygons)} bbox x {min(xs):.3f}..{max(xs):.3f} fwd {-max(ys):.3f}..{-min(ys):.3f} up {min(zs):.3f}..{max(zs):.3f}', flush=True)


def export(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=False,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT',
                              export_colors=True, export_skins=True, export_morph=True, export_morph_normal=False,
                              export_animations=False, use_selection=False)


def main():
    clear()
    parts = build_body()
    # Dense copy of the volumes for the sculpted detail (baked onto the game mesh)
    high = None
    if HD and STAGE >= 5:
        dup = []
        for p in parts:
            c = p.copy(); c.data = p.data.copy(); bpy.context.collection.objects.link(c); dup.append(c)
        high = fuse(dup, voxel=float(os.environ.get('HIVOXEL', '0.0042')))
        high.name = 'high'
        report(high, 'high')
        detail_displace(high)
        activate(high)
        bpy.ops.object.shade_smooth()
    body = fuse(parts)
    report(body, 'fused')
    body = retopo(body, TARGET_FACES)
    report(body, 'retopo')
    cut_zones(body)
    zone_and_uv(body)
    activate(body)
    bpy.ops.object.shade_smooth()
    report(body, 'zoned')
    if high is not None:
        bake_uv(body)
        bake_maps(body, high, os.path.dirname(os.path.abspath(OUT)), size=int(os.environ.get('BAKESIZE', '2048')))
        bpy.data.objects.remove(high, do_unlink=True)
    if STAGE >= 3:
        arm = build_armature()
        skin(body, arm)
        hparts = build_helmet() + (build_fingers() if HD else [])
        for o in hparts:
            activate(o)
            bpy.ops.object.shade_smooth()
            if high is not None or 'Bake' in body.data.uv_layers:
                neutral_bake_uv(o)
        body = rigid_head(hparts, body)
        report(body, 'joined')
        shape_keys(body)
        if STAGE >= 4:
            bake_ao(body)
    export(OUT)
    print('EXPORTED', OUT, os.path.getsize(OUT), flush=True)


main()
