"""Procedural build of the Gridiron 27 player model (run through tools/blender/player.py).

body      the athlete in pads as overlapping volumes
uniform   uniform zones, cut lines and the runtime UV layout (a contract with athlete.js)
rig       joints (a contract with player.js), weights and the heavy/lean shape keys
helmet    shell, facemask, chin strap, visor and eyes
gear      gloved fingers, cleat soles and studs
detail    the procedural sculpt baked into the normal map
bake      ambient occlusion, bake UVs and the normal-map bake
pipeline  runs the steps, exports the GLB and checks it
preview   Workbench preview renders
util      geometry helpers
"""
