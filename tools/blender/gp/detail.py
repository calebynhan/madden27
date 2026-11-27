# Procedural sculpt of the dense (high-poly) body, baked into the normal map: fabric gathered
# where the jersey tucks into the belt, tension folds from the pads, the jersey dropping off the
# front plates, seams, hems and collar ribbing, folds behind the knees, thigh and knee pad
# outlines, the fly seam, sock ribbing, glove padding, laces and sole edges on the cleats, and
# muscle definition on the arms and neck. Offsets are along the vertex normal, in yards.
import math

from mathutils import Vector, noise

from .body import SHOE_HEEL_Z, SHOE_TOE_Z
from .uniform import (seg_dists, zone_of, BELT_TOP, BELT_BOT, COLLAR_Y, SLEEVE_Y, SOCK_Y, WRIST_Y)
from .util import T, gauss, angd


def _pad_edge(a, b, ca, cb, ra, rb, w, n=4.0):
    """A pad seen through the fabric: a raised rim along a rounded-rectangle outline (centre
    ca, cb, half-sizes ra, rb) and a slightly raised plate inside it."""
    r = ((abs(a - ca) / ra) ** n + (abs(b - cb) / rb) ** n) ** (1 / n)
    rim = gauss((r - 1) * min(ra, rb), w)
    plate = 0.35 * (1 - min(1.0, r) ** 6)
    return rim + plate


def _jersey_torso(x, y, z, nz):
    ph = math.atan2(x, z)
    side = abs(math.sin(ph))
    front = max(0.0, math.cos(ph))
    d = 0.0
    # fabric gathered above the belt: short vertical puckers
    d += 0.0042 * gauss(y - (BELT_TOP + 0.03), 0.032) * math.sin(ph * 23 + 2.5 * math.sin(ph * 4) + nz * 2.2)
    # loose fabric folds over the stomach and lower back
    d += 0.0017 * gauss(y - 1.2, 0.06) * math.sin(ph * 7 + y * 40 + nz)
    # tension folds running from the pads down toward the armpits, front and back
    if side > 0.45 and 1.36 < y < 1.62:
        s = 1 if ph > 0 else -1
        d += 0.0034 * (side - 0.45) / 0.55 * math.sin((y * 46 - abs(x) * 30 * s) + nz) * gauss(y - 1.5, 0.09)
    # the jersey drops off the front and back plates of the pads
    d -= 0.003 * gauss(y - 1.565, 0.012) * (1 - side)
    d += 0.0016 * gauss(y - 1.585, 0.012) * (1 - side)
    # side seams and the yoke seam over the pads
    if y < 1.58:
        d += 0.0012 * (gauss(angd(ph, math.pi / 2), 0.02) + gauss(angd(ph, -math.pi / 2), 0.02))
    if abs(x) < 0.24 and y > 1.6:
        d += 0.001 * gauss(abs(z) - 0.12, 0.004) * front
    # collar ribbing
    if y > COLLAR_Y - 0.06:
        d += 0.0008 * math.sin(ph * 80) * gauss(y - (COLLAR_Y - 0.022), 0.025)
    return d


def _sleeve(k, x, y, z, nz):
    sx = -1 if k.endswith('R') else 1
    pl = math.atan2((x - 0.32 * sx) * sx, z)
    d = 0.0018 * gauss(y - (SLEEVE_Y + 0.012), 0.005)                    # hem
    d -= 0.0012 * gauss(y - (SLEEVE_Y + 0.022), 0.003)                   # hem stitching
    d += 0.0024 * gauss(y - 1.56, 0.035) * math.sin(pl * 3 + y * 42 + nz)  # sleeve folds
    return d


def _pants(k, x, y, z, nz):
    base = k.split('_')[0]
    d = 0.0
    if base in ('thigh', 'shin'):
        sx = -1 if k.endswith('R') else 1
        lx = x - 0.12 * sx
        pl = math.atan2(lx * sx, z)
        back = max(0.0, -math.cos(pl))
        front = max(0.0, math.cos(pl))
        d += 0.0048 * back * gauss(y - 0.5, 0.05) * math.sin(y * 118 + pl * 2 + nz)      # behind the knee
        d += 0.0016 * gauss(y - (SOCK_Y + 0.012), 0.005)                                # hem
        if front > 0.25:
            d += 0.0017 * front * _pad_edge(lx * sx, y, 0.0, 0.732, 0.064, 0.112, 0.0045)       # thigh pad
            d += 0.0017 * front * _pad_edge(lx * sx, y, 0.0, 0.474, 0.06, 0.068, 0.0045, n=3.0)  # knee pad
        d += 0.0011 * gauss(angd(pl, math.pi / 2), 0.03)                                # outer seam
        d += 0.0016 * gauss(y - 0.6, 0.06) * math.sin(pl * 5 + y * 70 + nz) * (1 - front)
    else:
        ph = math.atan2(x, z)
        if y < 0.98:
            d += 0.0026 * gauss(y - 0.9, 0.05) * math.sin(ph * 9 + y * 60 + nz)          # crotch and hip
        d += 0.0012 * gauss(x, 0.004) * (1 if z > 0 else 0) * (y > 0.9)                 # fly seam
        for u in (-0.09, 0.09, -0.14, 0.14):                                            # belt loops
            d += 0.0016 * gauss(x - u, 0.005) * gauss(y - (BELT_BOT - 0.012), 0.012) * (z > 0)
    return d


def _arms(k, x, y, z):
    base = k.split('_')[0]
    sx = -1 if k.endswith('R') else 1
    lx, lz = (x - 0.32 * sx) * sx, z - 0.005
    pl = math.atan2(lx, lz)
    front, back = max(0.0, math.cos(pl)), max(0.0, -math.cos(pl))
    out = max(0.0, math.sin(pl))
    d = 0.0
    if base == 'upper':
        d += 0.0064 * front * gauss(y - 1.43, 0.045)                                   # biceps
        d -= 0.0022 * gauss(angd(pl, 1.4), 0.25) * gauss(y - 1.42, 0.06)               # groove beside it
        d += 0.0052 * back * (gauss(y - 1.47, 0.04) + 0.6 * gauss(y - 1.40, 0.03))      # triceps
    else:
        d += 0.0048 * front * out * gauss(y - 1.24, 0.04)                              # forearm extensors
        d += 0.003 * front * (1 - out) * gauss(y - 1.25, 0.05)                         # flexors
        d += 0.0032 * back * gauss(y - 1.31, 0.018)                                    # elbow
        d -= 0.0018 * gauss(y - 1.035, 0.022)                                          # wrist
        d += 0.0008 * gauss(math.sin(pl * 4 + 0.6 * math.sin(y * 25)), 0.3) * gauss(y - 1.15, 0.07) * front  # veins along the forearm
    return d


def _neck(x, y, z):
    d = 0.0
    if z > 0:
        for sg in (-1, 1):                     # sternocleidomastoid, behind the ear to the collar
            t = (y - 1.79) / 0.1
            cx = sg * (0.046 - 0.032 * t)
            d += 0.003 * gauss(x - cx, 0.012) * gauss(t - 0.5, 0.6)
        d += 0.0016 * gauss(x, 0.01) * gauss(y - 1.84, 0.012)                         # adam's apple
    else:
        d += 0.0028 * gauss(abs(x) - 0.05, 0.03) * gauss(y - 1.8, 0.04)               # trapezius
    return d


def _gloves(k, x, y, z):
    sx = -1 if k.endswith('R') else 1
    palm_side = (x - 0.32 * sx) * sx < 0
    d = 0.0
    if y < WRIST_Y - 0.004:
        d -= 0.0012 * gauss(math.sin(y * 260), 0.25)                                   # padding lines
        if not palm_side:
            d += 0.0018 * gauss(y - 0.93, 0.03) * gauss(z - 0.012, 0.03)                # knuckle pad
        else:
            d += 0.0008 * noise.noise(Vector((x * 300, y * 300, z * 300)))               # grip
    d += 0.0014 * gauss(y - (WRIST_Y - 0.004), 0.004)                                  # cuff seam
    return d


def _shoes(k, x, y, z):
    sx = -1 if k.endswith('R') else 1
    lx = x - 0.12 * sx
    u = (z - SHOE_HEEL_Z) / (SHOE_TOE_Z - SHOE_HEEL_Z)
    d = 0.0016 * gauss(y - 0.024, 0.004)                                               # sole edge
    if 0.36 < u < 0.66 and abs(lx) < 0.02 and y > 0.06:                                # laces
        d += 0.0016 * gauss(math.sin((u - 0.36) * 70), 0.4) * gauss(lx, 0.014)
    d += 0.0012 * gauss(u - 0.3, 0.012) * (y > 0.03)                                    # heel counter seam
    d += 0.001 * gauss(u - 0.74, 0.01) * (y > 0.03)                                     # toe cap seam
    return d


def _part_detail(k, zone, x, y, z, nz):
    """Sculpted offset for the point as part of body segment k in uniform zone `zone`."""
    base = k.split('_')[0]
    if zone == 'jersey' and base in ('torso', 'pelvis', 'neck'):
        return _jersey_torso(x, y, z, nz)
    if zone == 'jersey' and base == 'upper':
        return _sleeve(k, x, y, z, nz)
    if zone == 'pants':
        return _pants(k, x, y, z, nz)
    if zone == 'belt':
        return 0.0009 * math.sin((y - BELT_BOT) / (BELT_TOP - BELT_BOT) * math.pi * 3)
    if zone == 'socks' and base in ('shin', 'foot'):
        sx = -1 if k.endswith('R') else 1
        return 0.0007 * math.sin(math.atan2(x - 0.12 * sx, z) * 46)
    if zone == 'arms' and base in ('upper', 'fore'):
        return _arms(k, x, y, z)
    if zone == 'skin' and base in ('neck', 'torso'):
        return _neck(x, y, z)
    if zone == 'gloves' and base in ('hand', 'fore'):
        return _gloves(k, x, y, z)
    if zone == 'shoes' and base in ('foot', 'shin'):
        return _shoes(k, x, y, z)
    return 0.0


BLEND = 0.12   # width (in relative distance) of the blend between neighbouring body parts


def detail_displace(ob):
    """Each vertex takes a weighted blend of the detail of the body parts it is near, so the
    sculpt has no steps where one part's axis takes over from another's (those would bake into
    ridges). The uniform zone itself (the hem and cut lines) still switches sharply."""
    me = ob.data
    disp = []
    for v in me.vertices:
        p = T(v.co)
        x, y, z = p
        dists = seg_dists(p)
        dmin = min(dists.values())
        k0 = min(dists, key=dists.get)
        zone = zone_of(p, k0)
        nz = noise.noise(Vector((x * 60, y * 60, z * 60)))
        tot = wsum = 0.0
        for k, dd in dists.items():
            if dd - dmin > 2.5 * BLEND:
                continue
            w = math.exp(-((dd - dmin) / BLEND) ** 2)
            tot += w * _part_detail(k, zone, x, y, z, nz)
            wsum += w
        disp.append(tot / wsum)
    # move every vertex along its (original) normal in one pass: reading v.normal after moving
    # vertices would recompute all normals on every read
    n = len(me.vertices)
    co = [0.0] * (3 * n)
    nr = [0.0] * (3 * n)
    me.vertices.foreach_get('co', co)
    me.vertex_normals.foreach_get('vector', nr)
    for i, d in enumerate(disp):
        if d:
            co[3 * i] += nr[3 * i] * d
            co[3 * i + 1] += nr[3 * i + 1] * d
            co[3 * i + 2] += nr[3 * i + 2] * d
    me.vertices.foreach_set('co', co)
    me.update()
