# Helmet, facemask, chin strap, visor and eyes: rigid parts on the head bone. An original
# modern-style shell (not a copy of any real model): a rounded crown, flared jaw guards that
# reach forward, a molded ridge around the lower back, ear holes with raised rims, a rubber
# bumper over the brow, a multi-bar facemask with top clips, and a four-point chin strap.
import math

import bmesh
from mathutils import Vector

from .util import V, obj_from_bm, set_mat, apply_mod, sweep, superellipsoid, flip_outward, gauss, smooth01, catmull

HC = (0.0, 1.95, -0.008)         # shell center (three.js space)
HR = (0.149, 0.158, 0.175)       # shell radii: side, up, front-back


def _shell_scale(th, ps):
    """Outward scale of the shell at azimuth th (0 front, + left) and elevation ps."""
    a = abs(th)
    k = 1.0
    # jaw guards flare out and forward below the ears
    low = smooth01((-0.38 - ps) / 0.4)
    k += 0.11 * low * gauss(a - 1.15, 0.55)
    # molded ridge around the lower back of the shell, with a shallow groove above it
    back = smooth01((a - 1.85) / 0.45)
    k += (0.045 * gauss(ps + 0.37, 0.055) - 0.012 * gauss(ps + 0.2, 0.05)) * back
    # the back of the crown is fuller than the front
    k += 0.02 * smooth01((a - 1.6) / 1.2) * gauss(ps - 0.25, 0.5)
    return k


def shell_point(th, ps, k=1.0, fwd=0.0):
    """Point on the shell surface (three.js) at azimuth th and elevation ps, scaled by k."""
    s = _shell_scale(th, ps) * k
    x = HR[0] * math.cos(ps) * math.sin(th) * s
    y = HR[1] * math.sin(ps) * k
    z = HR[2] * math.cos(ps) * math.cos(th) * s
    # jaw guards also reach forward toward the chin
    z += 0.018 * smooth01((-0.4 - ps) / 0.35) * gauss(abs(th) - 0.95, 0.35)
    return (HC[0] + x, HC[1] + y, HC[2] + z + fwd)


def psi_bottom(th):
    """Lower edge of the shell: brow over the face opening, the opening's sides, the jaw
    guards, and the back edge at the neck."""
    a = abs(th)
    if a < 0.58:
        return 0.135 + 0.05 * (a / 0.58) ** 2
    if a < 0.86:
        u = smooth01((a - 0.58) / 0.28)
        return 0.185 + (-0.82 - 0.185) * u
    if a < 1.8:
        return -0.82 + 0.22 * (a - 0.86) / 0.94
    return -0.6 + 0.04 * (a - 1.8) / (math.pi - 1.8)


def _shell():
    ths = sorted(set([-math.pi + 2 * math.pi * i / 58 for i in range(58)] +
                     [sg * (0.58 + 0.28 * k / 5) for sg in (-1, 1) for k in range(6)]))
    # rows (fraction of the way from the lower edge to the crown): dense near the edge so the
    # rear ridge, the jaw flare and the brow are sampled
    us = (0.0, 0.035, 0.07, 0.1, 0.13, 0.17, 0.22, 0.3, 0.4, 0.52, 0.65, 0.8, 0.92)
    rows = len(us)
    bm = bmesh.new()
    grid = []
    for th in ths:
        pb = psi_bottom(th)
        grid.append([bm.verts.new(V(*shell_point(th, pb + (math.pi / 2 - pb) * u))) for u in us])
    top = bm.verts.new(V(*shell_point(0, math.pi / 2)))
    n = len(ths)
    for c in range(n):
        c2 = (c + 1) % n
        for i in range(rows - 1):
            bm.faces.new((grid[c][i], grid[c2][i], grid[c2][i + 1], grid[c][i + 1]))
        bm.faces.new((grid[c][rows - 1], grid[c2][rows - 1], top))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    shell = obj_from_bm('shell', bm)
    flip_outward(shell, HC)
    set_mat(shell, 'helmet', 'helmetpad')
    sol = shell.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.015
    sol.offset = -1
    sol.use_rim = True
    sol.material_offset = 1
    sol.material_offset_rim = 1
    apply_mod(shell, sol)
    return shell


def _stripe():
    bm = bmesh.new()
    prev = None
    for i in range(41):
        beta = 0.19 + (math.pi + 0.56 - 0.19) * i / 40
        th = 0.0 if beta <= math.pi / 2 else math.pi
        ps = beta if beta <= math.pi / 2 else math.pi - beta
        p = Vector(shell_point(th, ps, 1.0))
        c = Vector(HC)
        nrm = (p - c).normalized()
        q = p + nrm * 0.0035
        row = [bm.verts.new(V(q.x + sx * 0.022, q.y, q.z)) for sx in (-1, 1)]
        if prev:
            bm.faces.new((prev[0], prev[1], row[1], row[0]))
        prev = row
    stripe = obj_from_bm('stripe', bm)
    flip_outward(stripe, HC)
    set_mat(stripe, 'stripe')
    return stripe


def _side_patch(sx, kind, ps_c, th_off, R, nr, ns, lift):
    """Disc on the shell side (logo decal or ear-hole insert) with 0-1 UVs across it."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    thc = sx * (math.pi / 2 + th_off)

    def pt(dy, dz):
        th = thc - sx * dz / HR[0]
        ps = ps_c + dy / HR[1]
        p = Vector(shell_point(th, ps, 1.0))
        q = p + (p - Vector(HC)).normalized() * lift
        return bm.verts.new(V(*q)), dz, dy

    center = pt(0, 0)
    rings = []
    for i in range(1, nr + 1):
        rr = R * i / nr
        rings.append([pt(rr * math.sin(2 * math.pi * j / ns), rr * math.cos(2 * math.pi * j / ns)) for j in range(ns)])

    def uv(item):
        # reads left-to-right from outside on both sides (forward is to the viewer's left on
        # the left side of the helmet)
        _, dz, dy = item
        return (0.5 - sx * dz / (2 * R), 0.5 + dy / (2 * R))
    faces = []
    for j in range(ns):
        items = (center, rings[0][j], rings[0][(j + 1) % ns])
        faces.append((bm.faces.new([it[0] for it in items]), items))
    for i in range(nr - 1):
        for j in range(ns):
            items = (rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % ns], rings[i][(j + 1) % ns])
            faces.append((bm.faces.new([it[0] for it in items]), items))
    for f, items in faces:
        for loop, it in zip(f.loops, items):
            loop[uvl].uv = uv(it)
    o = obj_from_bm(kind, bm)
    flip_outward(o, HC)
    return o


def _side_parts():
    parts = []
    for sx in (-1, 1):
        d = _side_patch(sx, 'decal', 0.03 / HR[1], 0.07, 0.056, 3, 18, 0.003)
        set_mat(d, 'decal')
        parts.append(d)
        # ear hole: dark insert with a molded rim around it
        e = _side_patch(sx, 'earhole', math.asin(-0.062 / HR[1]), 0.02, 0.019, 1, 12, 0.0012)
        set_mat(e, 'eyes')
        parts.append(e)
        ring = []
        thc = sx * (math.pi / 2 + 0.02)
        ps_c = math.asin(-0.062 / HR[1])
        for j in range(13):
            a = 2 * math.pi * j / 12
            th = thc - sx * 0.022 * math.cos(a) / HR[0]
            ps = ps_c + 0.022 * math.sin(a) / HR[1]
            p = Vector(shell_point(th, ps, 1.0))
            ring.append(tuple(p + (p - Vector(HC)).normalized() * 0.002))
        o = sweep('earrim', ring[:-1] + [ring[0]], r=0.0034, segs=5, cap=False)
        set_mat(o, 'helmet')
        parts.append(o)
    return parts


def _vents():
    """Vent slots on the crown (front, side and back pairs): dark capsules half sunk into the
    shell, following its meridians."""
    out = []
    for th, ps0, ps1 in ((0.34, 0.5, 0.82), (1.05, 0.42, 0.7), (2.55, 0.36, 0.62)):
        for sg in (-1, 1):
            pts = [shell_point(sg * th, ps0 + (ps1 - ps0) * i / 4, 1.0) for i in range(5)]
            o = sweep('vent', pts, r=0.0068, segs=6)
            set_mat(o, 'helmetpad')
            out.append(o)
    return out


def _bumper_and_ridge():
    """Rubber bumper along the brow of the face opening."""
    pts = []
    for i in range(11):
        th = -0.6 + 1.2 * i / 10
        pts.append(shell_point(th, psi_bottom(th) + 0.035, 1.012))
    o = sweep('bumper', pts, r=0.0075, segs=6)
    set_mat(o, 'helmetpad')
    return [o]


def _facemask():
    def bar(th0, th1, ps, k, f, n=11):
        return [shell_point(th0 + (th1 - th0) * i / n, ps, k, f) for i in range(n + 1)]

    def vert(th, n=5):
        return [shell_point(th, -0.06 + (-0.6 + 0.06) * i / n, 1.04 + 0.035 * i / n, 0.008 + 0.03 * i / n) for i in range(n + 1)]
    bars = [
        bar(-0.82, 0.82, -0.06, 1.04, 0.008), bar(-0.8, 0.8, -0.33, 1.075, 0.028), bar(-0.62, 0.62, -0.6, 1.075, 0.038),
        vert(0.0), vert(-0.42), vert(0.42),
    ]
    for sg in (-1, 1):
        # side bars run back into the jaw guards; the top clips hold the mask to the brow
        bars.append(catmull([shell_point(sg * 0.82, -0.06, 1.04, 0.008), shell_point(sg * 0.9, -0.1, 1.01, 0.003),
                             shell_point(sg * 0.96, -0.16, 0.995, 0.0)], 4))
        bars.append(catmull([shell_point(sg * 0.8, -0.33, 1.075, 0.028), shell_point(sg * 0.9, -0.42, 1.03, 0.01),
                             shell_point(sg * 0.98, -0.5, 1.0, 0.0)], 4))
        bars.append([shell_point(sg * 0.62, -0.6, 1.075, 0.038), shell_point(sg * 0.8, -0.33, 1.075, 0.028)])
        bars.append(catmull([shell_point(sg * 0.42, -0.06, 1.04, 0.008), shell_point(sg * 0.42, 0.06, 1.035, 0.006),
                             shell_point(sg * 0.42, psi_bottom(0.42) + 0.02, 1.01, 0.0)], 3))
    out = []
    for i, pts in enumerate(bars):
        o = sweep('mask%d' % i, pts, r=0.0068, segs=6)
        set_mat(o, 'mask')
        out.append(o)
    # molded clips holding the mask to the shell (side clips on the jaw guards, top clips on the brow)
    for sg in (-1, 1):
        for th, ps, size in ((0.95, -0.15, (0.009, 0.014, 0.012)), (0.97, -0.49, (0.009, 0.014, 0.012)),
                             (0.42, psi_bottom(0.42) + 0.035, (0.012, 0.009, 0.008))):
            out.append(_clip(sg * th, ps, size))
    return out


def _clip(th, ps, size):
    """Small rounded block sitting on the shell surface at (th, ps)."""
    c = Vector(shell_point(th, ps, 1.0))
    nrm = (c - Vector(HC)).normalized()
    c = c + nrm * size[2] * 0.4
    o = superellipsoid('clip', tuple(c), size, n_vert=2.6, n_horiz=2.6, segs=8, rings=5)
    set_mat(o, 'helmetpad')
    return o


def _outside(p, margin=1.035):
    """Push a three.js point out to just above the shell surface if it is inside the shell."""
    q = Vector(p) - Vector(HC)
    ps = math.asin(max(-1.0, min(1.0, q.y / HR[1])))
    th = math.atan2(q.x / HR[0], q.z / HR[2])
    surf = Vector(shell_point(th, ps, margin)) - Vector(HC)
    return tuple(Vector(HC) + (surf if q.length < surf.length else q))


def _chinstrap():
    parts = []
    cup = superellipsoid('cup', (0, 1.83, 0.106), (0.033, 0.022, 0.02), segs=12, rings=6)
    set_mat(cup, 'strap')
    parts.append(cup)
    for sg in (-1, 1):
        for (th, ps) in ((1.02, -0.62), (0.98, -0.27)):
            end = shell_point(sg * th, ps, 1.02)
            mid = ((sg * 0.03 + end[0]) / 2 + sg * 0.012, (1.832 + end[1]) / 2, (0.104 + end[2]) / 2 + 0.012)
            pts = [_outside(q) for q in catmull([(sg * 0.028, 1.832, 0.104), mid, end], 5)]
            o = sweep('strap', pts, r=0.0042, segs=5)
            set_mat(o, 'strap')
            parts.append(o)
            parts.append(_clip(sg * th, ps, (0.009, 0.009, 0.006)))   # the snap
    return parts


def _visor():
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
        bm2 = bmesh.new()
        bm2.from_mesh(visor.data)
        for f in bm2.faces:
            f.normal_flip()
        bm2.to_mesh(visor.data)
        bm2.free()
    set_mat(visor, 'visor')
    return [visor]


def _eyes(face_z):
    """Eyes and eye black on the face (seen through the mask). face_z(x, y) is the front of the
    face at (x, y), from the finished body mesh."""
    parts = []
    for sg in (-1, 1):
        for x, y, r in ((sg * 0.034, 1.955, (0.015, 0.0075, 0.005)), (sg * 0.036, 1.937, (0.017, 0.005, 0.0035))):
            z = face_z(x, y) - r[2] * 0.35
            o = superellipsoid('eye', (x, y, z), r, segs=8, rings=5)
            set_mat(o, 'eyes')
            parts.append(o)
    return parts


def build_helmet(face_z):
    return ([_shell(), _stripe()] + _side_parts() + _vents() + _bumper_and_ridge() + _facemask() + _chinstrap()
            + _visor() + _eyes(face_z))
