# Preview renders of the model in Blender (Workbench, team-like colors), run in the same
# background process as the build: front, side, three-quarter and back views, a close-up of the
# head and shoulders, and a far shot at broadcast distance (about 20 yards) to judge the
# silhouette the way the game shows it.
import os

import bpy
from mathutils import Vector

from .util import V

COLORS = {
    'jersey': (0.03, 0.09, 0.42), 'pants': (0.82, 0.8, 0.74), 'belt': (0.02, 0.02, 0.02), 'socks': (0.03, 0.09, 0.42),
    'shoes': (0.02, 0.02, 0.02), 'gloves': (0.85, 0.85, 0.85), 'arms': (0.27, 0.12, 0.05), 'skin': (0.27, 0.12, 0.05),
    'helmet': (0.03, 0.09, 0.42), 'helmetpad': (0.03, 0.03, 0.03), 'stripe': (0.9, 0.62, 0.05), 'decal': (0.9, 0.62, 0.05),
    'eyes': (0.01, 0.008, 0.006), 'mask': (0.7, 0.7, 0.7), 'strap': (0.92, 0.92, 0.92), 'visor': (0.05, 0.05, 0.05),
}
DEFAULT = (0.6, 0.6, 0.6)


def _setup(scene, res):
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    sh = scene.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_cavity = True
    sh.cavity_type = 'BOTH'
    sh.show_shadows = True
    sh.shadow_intensity = 0.4
    sh.show_specular_highlight = True
    sh.background_type = 'VIEWPORT'
    sh.background_color = (0.45, 0.55, 0.65)
    scene.display.shadow_focus = 0.2
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    for m in bpy.data.materials:
        if m.name.startswith('preview_'):
            continue
        c = COLORS.get(m.name, DEFAULT)
        m.diffuse_color = (*c, 1.0)
        m.roughness = 0.35 if m.name in ('helmet', 'stripe', 'mask', 'shoes') else 0.8


def _camera(scene, pos, look, lens=50.0):
    cam = bpy.data.objects.get('preview_cam')
    if cam is None:
        cam = bpy.data.objects.new('preview_cam', bpy.data.cameras.new('preview_cam'))
        scene.collection.objects.link(cam)
    cam.data.lens = lens
    cam.data.clip_start = 0.05
    cam.data.clip_end = 200
    cam.location = V(*pos)
    d = V(*look) - V(*pos)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam


VIEWS = {
    # name: camera position, look-at (three.js space), focal length, resolution
    'front': ((0.0, 1.1, 4.4), (0, 1.06, 0), 50, (900, 1200)),
    'side': ((-4.4, 1.1, 0.0), (0, 1.06, 0), 50, (900, 1200)),
    'quarter': ((-3.0, 1.4, 3.4), (0, 1.06, 0), 50, (900, 1200)),
    'back': ((0.0, 1.3, -4.4), (0, 1.06, 0), 50, (900, 1200)),
    'closeup': ((-1.0, 1.9, 2.2), (0, 1.72, 0), 70, (1100, 900)),
    'far': ((-8.0, 7.5, 18.0), (0, 1.0, 0), 35, (1280, 720)),
    'lineup': ((-1.2, 1.3, 6.2), (0, 1.05, 0), 50, (1500, 1000)),
}
SINGLE = ('front', 'side', 'quarter', 'back', 'closeup')
GROUP = ('lineup', 'far')


def ground(scene):
    if bpy.data.objects.get('preview_ground'):
        return
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    g = bpy.context.active_object
    g.name = 'preview_ground'
    m = bpy.data.materials.new('preview_turf')
    m.diffuse_color = (0.12, 0.3, 0.1, 1)
    g.data.materials.append(m)


def render_views(out_dir, tag, views=None):
    scene = bpy.context.scene
    os.makedirs(out_dir, exist_ok=True)
    ground(scene)
    outs = []
    for name in (views or VIEWS.keys()):
        pos, look, lens, res = VIEWS[name]
        _setup(scene, res)
        _camera(scene, pos, look, lens)
        path = os.path.join(out_dir, f'{tag}-{name}.png')
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        outs.append(path)
    print('[preview]', ' '.join(outs), flush=True)
    return outs


def lineup(body, offsets=(-0.95, 0.95)):
    """Linked copies of the finished model beside the original (lean on the left, heavy on the
    right when shape keys exist) for side-by-side previews."""
    out = []
    for i, dx in enumerate(offsets):
        c = body.copy()
        c.location = body.location + Vector((dx, 0, 0))
        bpy.context.collection.objects.link(c)
        if c.data.shape_keys:
            c.data = body.data.copy()
            kb = c.data.shape_keys.key_blocks
            if 'lean' in kb and i == 0:
                kb['lean'].value = 1.0
            if 'heavy' in kb and i == len(offsets) - 1:
                kb['heavy'].value = 1.0
        out.append(c)
    return out
