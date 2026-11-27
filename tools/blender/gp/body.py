# Body volumes of the player in full uniform (fused later with a voxel remesh). Built around the
# game's joints (rig.J): arms hang from x = +-0.32, legs from x = +-0.12. Shapes are in three.js
# model space, yards. The jersey and pants are modelled as the outer envelope of the athlete
# plus his pads: shoulder pads with a raised arch and capped shoulders, a jersey that drapes from
# the pad's front and back plates and tucks into the belt, thigh and knee pads under the pants.
import math

from .util import loft, muscle_section, lerp_prof, superellipsoid, gauss, smooth01, grid_mesh

PAD_X = 0.45          # outer edge of the shoulder pad caps
PAD_ARCH_X = 0.19     # the raised arch over each shoulder


# ---------------------------------------------------------------- torso and pads
def _torso_section():
    # y (absolute), half-width, front depth, back depth, superellipse exponent
    prof = lerp_prof([
        (1.03, 0.150, 0.110, 0.120, 2.3),
        (1.08, 0.151, 0.112, 0.120, 2.3),
        (1.105, 0.153, 0.115, 0.121, 2.3),
        (1.15, 0.163, 0.123, 0.128, 2.3),   # jersey bloused over the belt
        (1.21, 0.166, 0.125, 0.128, 2.35),
        (1.29, 0.173, 0.128, 0.131, 2.4),
        (1.37, 0.184, 0.132, 0.137, 2.45),
        (1.45, 0.198, 0.142, 0.146, 2.5),
        (1.52, 0.209, 0.152, 0.154, 2.55),
        (1.585, 0.216, 0.164, 0.163, 2.6),  # the pad's front and back plates
        (1.64, 0.218, 0.168, 0.168, 2.6),
        (1.70, 0.190, 0.152, 0.154, 2.6),
    ])
    y0, y1 = 1.03, 1.70

    def f(t, th):
        y = y0 + (y1 - y0) * t
        w, fr, bk, n = prof(y)
        s, c = math.sin(th), math.cos(th)
        depth = fr if c >= 0 else bk
        k = 1.0
        # the front plates of the pads push the jersey forward over each pec, and the jersey
        # falls from the plate edge onto the chest below it
        k += 0.045 * gauss(abs(th) - 0.55, 0.42) * gauss(y - 1.6, 0.05)
        k -= 0.012 * gauss(abs(th) - 0.5, 0.5) * gauss(y - 1.5, 0.03)
        # lats flare under the arms at the back
        k += 0.035 * gauss(abs(th) - 2.25, 0.45) * gauss(y - 1.45, 0.08)
        # spine groove and the back plate
        k -= 0.012 * gauss(abs(th) - math.pi, 0.18) * gauss(y - 1.38, 0.14)
        k += 0.02 * gauss(abs(th) - 2.7, 0.5) * gauss(y - 1.6, 0.05)
        return math.copysign(abs(s) ** (2 / n), s) * w * k, math.copysign(abs(c) ** (2 / n), c) * depth * k
    return loft('torso', (0, y0, 0), (0, y1, 0), f, rings=36, segs=48)


def _pad_top(x, z):
    """Height of the pad top (under the jersey) at (x, z)."""
    s = abs(x)
    h = lerp_prof([(0.0, 1.714), (0.10, 1.722), (PAD_ARCH_X, 1.756), (0.27, 1.743), (0.34, 1.714),
                   (0.40, 1.676), (PAD_X, 1.634)])(s)[0]
    h += 0.006 * gauss(s - 0.412, 0.016)            # rolled lip on the cap rim
    h += 0.008 * gauss(s - PAD_ARCH_X, 0.018)       # crest of the arch (the raised edge)
    depth = 0.17 if s < 0.3 else 0.17 - 0.035 * smooth01((s - 0.3) / 0.15)
    u = min(1.0, abs(z) / depth)
    return h - 0.03 * u ** 2.2


def _pads():
    """The shoulder pads as a slab whose top follows _pad_top and whose footprint is a broad
    rounded rectangle, narrower front-to-back at the caps."""
    rows = []
    segs, rings = 64, 26
    m = 3.6
    for i in range(rings + 1):
        v = -math.pi / 2 + math.pi * i / rings      # -pi/2 bottom .. pi/2 top
        cv, sv = math.cos(v), math.sin(v)
        row = []
        for j in range(segs):
            u = 2 * math.pi * j / segs
            ex = math.copysign(abs(math.sin(u)) ** (2 / m), math.sin(u))
            ez = math.copysign(abs(math.cos(u)) ** (2 / m), math.cos(u))
            r = abs(cv) ** (2 / 4.0)                 # flat top and bottom, rounded edge
            x = PAD_X * ex * r
            depth = 0.178 if ez >= 0 else 0.18
            depth *= 1 - 0.2 * smooth01((abs(x) - 0.3) / 0.14)
            z = depth * ez * r - 0.004
            top = _pad_top(x, z)
            bot = 1.6 - 0.012 * smooth01((abs(x) - 0.22) / 0.1) + 0.02 * smooth01((abs(x) - 0.38) / 0.07)
            a = math.copysign(abs(sv) ** (2 / 4.0), sv)
            y = bot + (top - bot) * (a + 1) / 2
            row.append((x, y, z))
        rows.append(row)
    return grid_mesh('pads', rows[1:-1])


def _collar():
    """Jersey collar standing on the pads around the neck."""
    return loft('collar', (0, 1.705, -0.012), (0, 1.758, -0.014),
                muscle_section(lerp_prof([(0, 0.106, 0.102), (0.6, 0.1, 0.096), (1, 0.097, 0.093)])), rings=6, segs=32)


def _belt_and_pelvis():
    parts = []
    # belt: a snug band (the jersey is tucked in above it)
    parts.append(loft('belt', (0, 1.064, -0.003), (0, 1.102, -0.003),
                      muscle_section(lerp_prof([(0, 0.153, 0.117), (1, 0.154, 0.118)]), n=2.3), rings=3, segs=48))
    # seat of the pants with hip pads at the sides and the glutes behind
    parts.append(superellipsoid('pelvis', (0, 0.975, -0.012), (0.192, 0.128, 0.132), n_vert=2.3, n_horiz=2.5))
    for s in (-1, 1):
        parts.append(superellipsoid('glute', (0.07 * s, 0.94, -0.058), (0.088, 0.095, 0.078), segs=24, rings=16))
        parts.append(superellipsoid('hippad', (0.178 * s, 0.985, -0.004), (0.03, 0.065, 0.075), segs=20, rings=12))
    return parts


# ---------------------------------------------------------------- neck and head
def _neck_and_head():
    parts = []
    parts.append(loft('neck', (0, 1.70, -0.012), (0, 1.92, 0.0), muscle_section(
        lerp_prof([(0, 0.098, 0.092), (0.25, 0.088, 0.083), (0.7, 0.082, 0.078), (1, 0.074, 0.071)]),
        bumps=((0.06, 0.6, 0.35, 0.45, 0.25), (0.06, -0.6, 0.35, 0.45, 0.25), (0.05, math.pi, 0.8, 0.2, 0.2))), rings=12, segs=28))
    head = superellipsoid('head', (0, 1.945, 0.004), (0.084, 0.104, 0.099), n_vert=2.1, n_horiz=2.15,
                          fn=lambda x, y, z: (x * (1 - 0.18 * max(0, -y / 0.104)), y, z + 0.01 * max(0, -y / 0.104)))
    parts.append(head)
    parts.append(superellipsoid('jaw', (0, 1.875, 0.038), (0.066, 0.042, 0.066), n_vert=2.2, n_horiz=2.3, segs=24, rings=14))
    parts.append(superellipsoid('chin', (0, 1.86, 0.086), (0.03, 0.026, 0.024), segs=16, rings=10))
    parts.append(superellipsoid('nose', (0, 1.925, 0.098), (0.014, 0.025, 0.021), segs=16, rings=10,
                                fn=lambda x, y, z: (x * (1 + 0.5 * max(0, -y / 0.025)), y, z)))
    parts.append(superellipsoid('brow', (0, 1.968, 0.084), (0.064, 0.015, 0.022), segs=20, rings=8))
    for s in (-1, 1):
        parts.append(superellipsoid('cheek', (0.048 * s, 1.918, 0.068), (0.026, 0.018, 0.02), segs=14, rings=8))
    return parts


# ---------------------------------------------------------------- arms
def _arm(s):
    """Arm on side s (-1 right, +1 left): short sleeve over the pad cap, muscled upper arm,
    forearm, glove cuff and palm. Fingers are separate pieces (gear.py)."""
    ax = 0.32 * s
    parts = []
    m = s  # bump angles are given for the left arm (+x outward = +pi/2)
    parts.append(loft('uarm', (ax, 1.675, 0.0), (ax, 1.30, 0.006), muscle_section(
        lerp_prof([(0, 0.094, 0.096), (0.15, 0.096, 0.098), (0.45, 0.086, 0.091), (0.75, 0.074, 0.078), (1.0, 0.064, 0.066)]),
        bumps=((0.10, 0.0, 0.75, 0.58, 0.17),             # biceps
               (0.08, math.pi, 0.9, 0.45, 0.2),           # triceps
               (0.05, 2.2, 0.6, 0.38, 0.14),              # triceps lateral head
               (0.06, math.pi / 2, 0.7, 0.3, 0.12)),      # deltoid insertion
        mirror=m), rings=22, segs=28))
    # sleeve: loose over the deltoid, ending in a hem above the biceps
    parts.append(loft('sleeve', (ax, 1.67, -0.004), (ax, 1.527, 0.0), muscle_section(
        lerp_prof([(0, 0.116, 0.118), (0.5, 0.106, 0.11), (1.0, 0.099, 0.104)]), n=2.1), rings=8, segs=32))
    parts.append(loft('farm', (ax, 1.33, 0.006), (ax, 0.992, 0.013), muscle_section(
        lerp_prof([(0, 0.064, 0.064), (0.2, 0.068, 0.066), (0.55, 0.055, 0.054), (0.85, 0.041, 0.045), (1.0, 0.036, 0.044)]),
        bumps=((0.08, 0.9, 0.55, 0.22, 0.16),             # extensors (outer front)
               (0.06, -0.7, 0.6, 0.25, 0.16),             # flexors (inner front)
               (0.10, math.pi, 0.5, 0.0, 0.08)),          # point of the elbow
        mirror=m), rings=18, segs=24))
    # glove cuff and palm (the palm faces the thigh; thumb side forward)
    parts.append(loft('cuff', (ax, 1.008, 0.012), (ax, 0.975, 0.013),
                      muscle_section(lerp_prof([(0, 0.042, 0.05), (1, 0.041, 0.049)])), rings=3, segs=24))
    parts.append(superellipsoid('palm', (ax + 0.003 * s, 0.924, 0.012), (0.027, 0.06, 0.049), n_vert=2.4, n_horiz=2.8,
                                segs=24, rings=14,
                                fn=lambda x, y, z: (x - s * 0.006 * (1 - (z / 0.046) ** 2) * max(0.0, -x * s / 0.025), y, z)))
    return parts


# ---------------------------------------------------------------- legs
def _leg(s):
    lx = 0.12 * s
    m = s
    parts = []
    parts.append(loft('thigh', (0.115 * s, 0.99, -0.01), (lx, 0.45, 0.01), muscle_section(
        lerp_prof([(0, 0.11, 0.115), (0.15, 0.118, 0.124), (0.4, 0.11, 0.116), (0.7, 0.094, 0.1), (1.0, 0.072, 0.074)]),
        bumps=((0.05, 0.0, 0.8, 0.45, 0.25),              # quads
               (0.08, -0.65, 0.45, 0.8, 0.1),             # teardrop above the knee (inside)
               (0.04, math.pi, 0.9, 0.3, 0.25),           # hamstrings
               (0.035, 1.3, 0.6, 0.35, 0.2)),             # outer quad
        mirror=m), rings=24, segs=32))
    # thigh pad (a flat plate inside the pants) and the knee pad
    parts.append(superellipsoid('thighpad', (lx + 0.004 * s, 0.735, 0.072), (0.066, 0.108, 0.034), n_vert=3.0, n_horiz=3.0,
                                segs=24, rings=14))
    parts.append(superellipsoid('kneepad', (lx, 0.472, 0.034), (0.068, 0.074, 0.05), n_vert=2.8, n_horiz=2.6, segs=24, rings=14))
    # pants hem: a little looser than the sock below it
    parts.append(loft('hem', (lx, 0.43, -0.004), (lx, 0.398, -0.004),
                      muscle_section(lerp_prof([(0, 0.071, 0.074), (1, 0.069, 0.072)])), rings=3, segs=28))
    parts.append(loft('shin', (lx, 0.47, 0.0), (lx, 0.065, 0.0), muscle_section(
        lerp_prof([(0, 0.066, 0.068), (0.18, 0.068, 0.072, -0.006), (0.35, 0.066, 0.068, -0.01), (0.65, 0.051, 0.053),
                   (1.0, 0.041, 0.044)]),
        bumps=((0.15, math.pi, 0.8, 0.3, 0.13),           # calf
               (0.06, -2.4, 0.5, 0.28, 0.1),              # inner head of the calf
               (0.04, 0.35, 0.4, 0.4, 0.3)),              # shin (tibialis)
        mirror=m), rings=20, segs=28))
    parts.append(_shoe_upper(s))
    return parts


SHOE_HEEL_Z, SHOE_TOE_Z = -0.078, 0.214


def shoe_outline(u):
    """Cleat footprint along its length (u 0 heel .. 1 toe): half-width, top height, centre x offset."""
    w, top, dx = lerp_prof([(0.0, 0.04, 0.112, 0.0), (0.28, 0.047, 0.11, 0.0), (0.45, 0.051, 0.094, 0.002),
                            (0.68, 0.054, 0.068, 0.004), (0.88, 0.048, 0.05, 0.003), (1.0, 0.034, 0.04, 0.002)])(u)
    return w, top, dx


def _shoe_upper(s):
    """Low-cut cleat upper: heel counter, laced instep, rounded toe box with a little toe spring."""
    lx = 0.12 * s
    rows = []
    nu, segs = 26, 28
    for i in range(nu + 1):
        u = i / nu
        w, top, dx = shoe_outline(u)
        end = (1 - abs(2 * u - 1) ** 5) ** (1 / 5)   # round the heel and toe
        z = SHOE_HEEL_Z + (SHOE_TOE_Z - SHOE_HEEL_Z) * u
        bot = 0.017 + 0.009 * smooth01((u - 0.82) / 0.18)
        yc = (top + bot) / 2
        ry = (top - bot) / 2
        row = []
        for j in range(segs):
            th = 2 * math.pi * j / segs
            sn, cs = math.sin(th), math.cos(th)
            n = 2.4 if cs > 0 else 5.0                # flat sole, domed top
            px = math.copysign(abs(sn) ** (2 / n), sn) * w * end
            py = math.copysign(abs(cs) ** (2 / n), cs) * ry * (end if cs > 0 else 1.0)
            row.append((lx + dx * s + px, yc + py, z))
        rows.append(row)
    return grid_mesh('shoe', rows)


def build_body():
    """All volumes that fuse into the single skin of the body."""
    parts = [_torso_section(), _pads(), _collar()]
    parts += _belt_and_pelvis()
    parts += _neck_and_head()
    for s in (-1, 1):
        parts += _arm(s)
        parts += _leg(s)
    return parts
