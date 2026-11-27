// Deformation check for the skinned athlete: builds players with the game's own skeleton code
// (src/render/athlete.js) and poses them through the same rotation channels the animation
// drives (hip/knee, shoulder/elbow, torso), so shoulders, elbows and knees can be inspected in
// extreme poses. Used by tools/viewer/posecheck.cjs.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { athleteReady, makeAthlete, applyDetail } from '../../src/render/athlete.js';

const W = 1600, H = 800;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setPixelRatio(1);
r.setSize(W, H);
r.toneMapping = THREE.ACESFilmicToneMapping;
r.outputColorSpace = THREE.SRGBColorSpace;
r.shadowMap.enabled = true;
document.body.style.margin = '0';
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7f97b0);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;
const sun = new THREE.DirectionalLight(0xfff1d8, 2.4);
sun.position.set(-3, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 4, bottom: -4, near: 1, far: 20 });
scene.add(sun, new THREE.HemisphereLight(0xcfe3ff, 0x2a4a22, 0.3));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x2e7034, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 100);

const COLORS = { jersey: 0x1d3f9e, pants: 0xe9e7df, belt: 0x111111, socks: 0x1d3f9e, shoes: 0x111111, gloves: 0xf2c230, arms: 0x8d5524,
  skin: 0x8d5524, helmet: 0x1d3f9e, helmetpad: 0x222222, stripe: 0xf2c230, decal: 0xf2c230, eyes: 0x1a1110, mask: 0xd8d8d8, strap: 0xeeeeee, visor: 0x222222 };
const BODY = new Set(['jersey', 'pants', 'belt', 'socks', 'shoes', 'gloves', 'arms', 'skin']);

function mats() {
  const out = {};
  for (const [k, c] of Object.entries(COLORS)) {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: k === 'mask' ? 0.35 : 0.7, metalness: k === 'mask' ? 0.6 : 0, vertexColors: true });
    out[k] = BODY.has(k) ? applyDetail(m) : m;
  }
  out.visor.visible = false;
  return out;
}

// Pose channels as in src/render/player.js: arms [x, z, elbow], legs [hipX, knee, hipZ]
const POSES = {
  rest: {},
  overhead: { arms: [[-2.6, -0.1, -0.3], [-2.6, 0.1, -0.3]] },
  throw: { lean: 0.2, turn: -0.3, arms: [[2.62, -0.35, -1.6], [-1.0, 0.3, -0.6]], legs: [[-0.25, 0.15, -0.1], [0.3, 0.25, 0.12]] },
  sprint: { lean: 0.25, arms: [[0.8, -0.1, -1.6], [-0.9, 0.1, -1.4]], legs: [[-1.1, 1.4, 0], [0.6, 0.5, 0]] },
  stance: { lean: 0.9, hipY: -0.3, arms: [[-1.2, -0.1, -0.1], [-0.2, 0.15, -0.3]], legs: [[-1.4, 1.9, -0.15], [-1.2, 1.7, 0.15]] },
  wings: { arms: [[0, -1.35, -0.2], [0, 1.35, -0.2]] },
};

function apply(a, p) {
  const B = a.bones;
  if (p.lean) B.torso.rotation.x = p.lean;
  if (p.turn) B.torso.rotation.y = p.turn;
  if (p.hipY) B.hips.position.y += p.hipY;
  (p.arms || []).forEach(([x, z, e], i) => {
    const s = i === 0 ? 'R' : 'L';
    B['shoulder_' + s].rotation.set(x, 0, z);
    B['elbow_' + s].rotation.x = e;
  });
  (p.legs || []).forEach(([x, k, z], i) => {
    const s = i === 0 ? 'R' : 'L';
    B['thigh_' + s].rotation.set(x, 0, z);
    B['knee_' + s].rotation.x = k;
  });
}

window.render = async (opts) => {
  await athleteReady;
  const names = opts.poses || Object.keys(POSES);
  names.forEach((n, i) => {
    const a = makeAthlete(mats(), { w: opts.w ?? 1 });
    a.root.position.x = (i - (names.length - 1) / 2) * 1.25;
    a.root.rotation.y = opts.yaw ?? 0.5;
    apply(a, POSES[n]);
    scene.add(a.root);
  });
  cam.position.set(...opts.pos);
  cam.lookAt(...opts.look);
  r.render(scene, cam);
  return names;
};
