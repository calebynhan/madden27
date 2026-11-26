// Skinned player model built in Blender (tools/blender/player.py -> assets/player.glb).
// The GLB holds the body, uniform zones, helmet and facemask as one skinned mesh split into
// per-zone primitives, plus "heavy"/"lean" body shapes (morph targets) and baked ambient
// occlusion (vertex colors). Its skeleton is rebuilt here with identity rest rotations at the
// same joints the procedural animation drives, so every pose channel applies exactly as on
// the old rig. Geometry is shared by every player; each one gets its own bones and materials.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import glb from '../../assets/player.glb';

let template = null;

export const athleteReady = new Promise((resolve) => {
  try {
    const buf = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
    new GLTFLoader().parse(buf, '', (gltf) => {
      try { template = buildTemplate(gltf); } catch (e) { console.warn('player model unusable:', e); template = null; }
      resolve(template);
    }, (err) => { console.warn('player model failed to load:', err); resolve(null); });
  } catch (e) {
    console.warn('player model failed to load:', e);
    resolve(null);
  }
});

export function athleteTemplate() { return template; }

function buildTemplate(gltf) {
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  let joints = null;
  gltf.scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    let geo = o.geometry;
    if (!o.matrixWorld.equals(new THREE.Matrix4())) { geo = geo.clone(); geo.applyMatrix4(o.matrixWorld); }
    geo.computeBoundingSphere();
    parts.push({ name: (o.material && o.material.name) || 'jersey', geometry: geo });
    if (!joints) {
      joints = o.skeleton.bones.map((b) => ({
        name: b.name,
        pos: b.getWorldPosition(new THREE.Vector3()),
        parent: b.parent && b.parent.isBone ? b.parent.name : null,
      }));
    }
  });
  if (!parts.length || !joints) throw new Error('no skinned mesh in player.glb');
  const need = ['root', 'hips', 'torso', 'head', 'shoulder_R', 'elbow_R', 'hand_R', 'shoulder_L', 'elbow_L', 'hand_L', 'thigh_R', 'knee_R', 'thigh_L', 'knee_L'];
  for (const n of need) if (!joints.some((j) => j.name === n)) throw new Error(`player.glb is missing joint ${n}`);
  // Height of the shoulder-pad tops (where the shoulder numbers sit): cast a ray down onto
  // the jersey at the pad's crown.
  const jersey = parts.find((p) => p.name === 'jersey');
  let padY = 1.72;
  const padX = 0.25;
  if (jersey) {
    const probe = new THREE.Mesh(jersey.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const hit = new THREE.Raycaster(new THREE.Vector3(padX, 3, -0.012), new THREE.Vector3(0, -1, 0)).intersectObject(probe)[0];
    if (hit) padY = hit.point.y;
  }
  return { parts, joints, padX, padY };
}

// Small or interior parts that would only add cost to the shadow pass
const NO_SHADOW = new Set(['eyes', 'decal', 'visor', 'mask', 'strap', 'helmetpad']);

// Build one player's skeleton and skinned meshes. mats: zone name -> material.
export function makeAthlete(mats, { w = 1, castShadow = true } = {}) {
  const t = template;
  const root = new THREE.Group();
  const bones = {};
  const byName = new Map(t.joints.map((j) => [j.name, j]));
  const list = t.joints.map((j) => { const b = new THREE.Bone(); b.name = j.name; bones[j.name] = b; return b; });
  t.joints.forEach((j, i) => {
    const parent = j.parent ? bones[j.parent] : null;
    const pp = j.parent ? byName.get(j.parent).pos : new THREE.Vector3();
    list[i].position.copy(j.pos).sub(pp);
    (parent || root).add(list[i]);
  });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list); // bind (inverse) matrices from the rest pose
  const meshes = {};
  const heavy = Math.max(0, Math.min(1, (w - 1) / 0.28));
  const lean = Math.max(0, Math.min(1, (1 - w) / 0.15));
  for (const part of t.parts) {
    const m = new THREE.SkinnedMesh(part.geometry, mats[part.name] || mats.jersey);
    m.name = part.name;
    m.castShadow = castShadow && !NO_SHADOW.has(part.name);
    m.frustumCulled = false;
    m.bind(skeleton, new THREE.Matrix4());
    const d = m.morphTargetDictionary;
    if (d) {
      if (d.heavy !== undefined) m.morphTargetInfluences[d.heavy] = heavy;
      if (d.lean !== undefined) m.morphTargetInfluences[d.lean] = lean;
    }
    root.add(m);
    meshes[part.name] = m;
  }
  // Wider (or narrower) frames carry the arms and legs with them
  for (const [n, x] of [['shoulder_R', -1], ['shoulder_L', 1], ['thigh_R', -1], ['thigh_L', 1]]) bones[n].position.x = Math.abs(bones[n].position.x) * x * w;
  return { root, bones, meshes, skeleton };
}

// ---------------------------------------------------------------- textures for the new UVs
// Jersey atlas (matches the Blender UVs): torso band v 0.22-1 (right side u 0, front 0.25,
// left 0.5, back 0.75), right sleeve v 0-0.1, left sleeve v 0.11-0.21.
export function jerseyAtlas(team, num, home) {
  // Drawn in a 256-unit space onto a 512 canvas (crisp numbers in close-ups)
  const S = 256, PX = 512;
  const cv = document.createElement('canvas');
  cv.width = PX; cv.height = PX;
  const g = cv.getContext('2d');
  g.scale(PX / S, PX / S);
  const base = home ? team.primary : '#f4f4f4';
  const trim = home ? team.secondary : team.primary;
  const numFill = home ? '#ffffff' : team.primary;
  const numEdge = team.secondary;
  const Y = (v) => (1 - v) * S; // canvas row for a v coordinate (textures are flipped)
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  // Collar trim and a thin yoke line
  g.fillStyle = trim;
  g.fillRect(0, Y(1.0), S, Y(0.968) - Y(1.0));
  g.globalAlpha = 0.9;
  // Side panels under the arms
  for (const u of [0, 0.5, 1]) g.fillRect(u * S - 9, Y(0.78), 18, Y(0.22) - Y(0.78));
  g.globalAlpha = 1;
  // Front and back numbers
  const txt = String(num);
  g.font = `900 ${txt.length > 1 ? 66 : 74}px "Arial Black", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 7;
  g.strokeStyle = numEdge;
  g.fillStyle = numFill;
  for (const [u, v] of [[0.25, 0.6], [0.75, 0.64]]) {
    g.strokeText(txt, u * S, Y(v));
    g.fillText(txt, u * S, Y(v));
  }
  // Sleeves: base color with two stripes near the cuff
  for (const [v0, v1] of [[0, 0.1], [0.11, 0.21]]) {
    g.fillStyle = base;
    g.fillRect(0, Y(v1), S, Y(v0) - Y(v1));
    g.fillStyle = trim;
    const h = v1 - v0;
    g.fillRect(0, Y(v0 + h * 0.3), S, Y(v0 + h * 0.18) - Y(v0 + h * 0.3));
    g.fillRect(0, Y(v0 + h * 0.48), S, Y(v0 + h * 0.4) - Y(v0 + h * 0.48));
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.flipY = false; // glTF texture coordinates run top-down
  t.anisotropy = 4;
  return t;
}

// Pants atlas: hips band v 0.5-1 (stripes on both sides), right leg v 0-0.25 (stripe on its
// outer side, u 0), left leg v 0.25-0.5 (outer side u 0.5).
export function pantsAtlas(team, home) {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  const base = home ? (team.pants || '#e9e9e4') : team.primary;
  const stripe = home ? team.primary : team.secondary;
  const edge = home ? team.secondary : '#f4f4f4';
  const Y = (v) => (1 - v) * S;
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  const band = (u, v0, v1) => {
    for (const du of [0, 1, -1]) {
      const x = (u + du) * S;
      g.fillStyle = edge; g.fillRect(x - 4, Y(v1), 8, Y(v0) - Y(v1));
      g.fillStyle = stripe; g.fillRect(x - 2.5, Y(v1), 5, Y(v0) - Y(v1));
    }
  };
  band(0, 0.5, 1); band(0.5, 0.5, 1);
  band(0, 0, 0.25);
  band(0.5, 0.25, 0.5);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.flipY = false;
  return t;
}

// Shoulder ("TV") number with a transparent background, laid on top of the pads.
export function tvNumberTexture(team, num, home) {
  const cv = document.createElement('canvas');
  cv.width = 96; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = '900 46px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 6; g.strokeStyle = team.secondary;
  g.fillStyle = home ? '#ffffff' : team.primary;
  g.strokeText(String(num), 48, 34); g.fillText(String(num), 48, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SKIN_TONES = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0x6b3f1f, 0xa0663a, 0x4a2a12];
const skinMats = new Map();
// Skin with a touch of sheen; vertex colors carry the baked occlusion.
export function skinMaterial(i) {
  const k = ((i % SKIN_TONES.length) + SKIN_TONES.length) % SKIN_TONES.length;
  if (!skinMats.has(k)) skinMats.set(k, new THREE.MeshPhysicalMaterial({ color: SKIN_TONES[k], roughness: 0.55, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x553322), vertexColors: true }));
  return skinMats.get(k);
}
