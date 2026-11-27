# Gridiron 27 player model, built procedurally in Blender: an original design, with no scanned or
# downloaded assets. Run headless (it starts from an empty scene, so never run it inside a
# Blender session whose scene you want to keep):
#   blender -b --factory-startup -P tools/blender/player.py -- assets/player.glb
#
# Environment options:
#   HD=0          skip the high-poly sculpt and normal-map bake (fast preview builds)
#   FACES=6600    quad count of the body retopology
#   PREVIEW=dir   also render Workbench previews (front/side/quarter/back/close-up/far) to dir
#   TAG=name      file name prefix for the previews
#   STAGE=n       stop early: 2 = body only, 3 = no AO bake
#   BAKESIZE=2048 / SHIPSIZE=1024  normal map bake and shipped resolution
#   IMGFMT=WEBP   image format inside the GLB (WEBP or JPEG); IMGQ=90 its quality
#   MESHOPT=0     export without EXT_meshopt_compression (bigger file)
#   SAVE=f.blend  also save the finished scene as a new .blend (refuses to overwrite a file)
#
# The steps live in tools/blender/gp/ (pipeline.py runs them in order).
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gp import pipeline  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGS[0] if ARGS else 'player.glb')

ok = pipeline.build(
    OUT,
    hd=os.environ.get('HD', '1') == '1',
    faces=int(os.environ.get('FACES', '6600')),
    stage=int(os.environ.get('STAGE', '99')),
    preview_dir=os.environ.get('PREVIEW'),
    bake_size=int(os.environ.get('BAKESIZE', '2048')),
    ship_size=int(os.environ.get('SHIPSIZE', '1024')),
    save=os.environ.get('SAVE'),
)
if not ok:
    sys.exit(1)
