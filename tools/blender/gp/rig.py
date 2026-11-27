# Armature, skin weights and body-type shape keys. The joint layout is a contract with the game
# (src/render/player.js drives these joints; src/render/athlete.js rebuilds the bones from their
# positions), so names and head positions must not change.
import bpy
from mathutils import Vector

from .util import V, T, activate, smooth01

# Joint head positions, three.js space (x, up, forward)
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


def skin(body, arm, fallback_bone):
    """Heat-map weights; vertices the solver misses get fallback_bone(three.js point)."""
    activate(body)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    groups = {g.name: g for g in body.vertex_groups}
    fixed = 0
    for v in body.data.vertices:
        if sum(g.weight for g in v.groups) < 0.01:
            groups[fallback_bone(T(v.co))].add([v.index], 1.0, 'REPLACE')
            fixed += 1
    print('[weights] heat-solver misses fixed:', fixed, flush=True)


def _set_weights(body, vi, weights):
    for g in body.vertex_groups:
        g.remove([vi])
    for name, w in weights.items():
        if w > 1e-4:
            body.vertex_groups[name].add([vi], w, 'REPLACE')


def pad_weights(body):
    """The shoulder pads are one rigid piece of equipment strapped to the chest: keep them on the
    torso, with only the outer cap lifting partly with the arm (as a real cap is hinged). Without
    this the heat solver lets the arm bones drag the pad top and crease it."""
    me = body.data
    names = {g.index: g.name for g in body.vertex_groups}
    changed = 0
    for v in me.vertices:
        x, y, z = T(v.co)
        ax = abs(x)
        if y < 1.585 or ax < 0.12 or ax > 0.47:
            continue
        side = 'R' if x < 0 else 'L'
        # how far out over the shoulder (0 at the pad arch, 1 at the cap rim), and how high on it
        out = smooth01((ax - 0.25) / 0.17)
        up = smooth01((y - 1.585) / 0.06)
        cap = 0.45 * out * (1 - 0.5 * up)
        cur = {names[g.group]: g.weight for g in v.groups if g.weight > 0}
        if not cur:
            continue
        # blend toward (torso 1-cap, shoulder cap) by how high the vertex sits on the pad
        k = up if ax < 0.36 else up * 0.8
        tgt = {'torso': 1 - cap, 'shoulder_' + side: cap}
        out_w = {}
        for n in set(cur) | set(tgt):
            out_w[n] = cur.get(n, 0.0) * (1 - k) + tgt.get(n, 0.0) * k
        tot = sum(out_w.values())
        _set_weights(body, v.index, {n: w / tot for n, w in out_w.items()})
        changed += 1
    print('[weights] pad vertices re-weighted:', changed, flush=True)


def rigid(ob, bone):
    g = ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone)
    g.add([v.index for v in ob.data.vertices], 1.0, 'REPLACE')


# ---------------------------------------------------------------- body types (shape keys)
HEAVY = {'torso': (1.18, 1.24), 'hips': (1.17, 1.2), 'thigh': 1.2, 'knee': 1.12, 'shoulder': 1.17, 'elbow': 1.12,
         'hand': 1.05, 'foot': 1.04, 'head': 1.0}
LEAN = {'torso': (0.93, 0.92), 'hips': (0.93, 0.93), 'thigh': 0.9, 'knee': 0.92, 'shoulder': 0.9, 'elbow': 0.92,
        'hand': 0.97, 'foot': 0.98, 'head': 1.0}


def shape_keys(body):
    """'heavy' (linemen) and 'lean' (skill players): each vertex is pushed out from (or in toward)
    the axis of the bones it is weighted to."""
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
                if bn is None or ge.weight <= 0 or bn not in J:
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
            q = p + (disp / tw if tw > 0 else disp)
            kd[v.index].co = V(q.x, q.y, q.z)
