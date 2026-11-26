// Procedural, articulated football player model with code-driven animation.
// Poses are flat vectors so state changes can crossfade smoothly.
import * as THREE from 'three';
import { athleteTemplate, makeAthlete, jerseyAtlas, pantsAtlas, tvNumberTexture, skinMaterial } from './athlete.js';

const SKIN = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0x6b3f1f, 0xa0663a, 0x4a2a12];

const geoCache = {};
function geo(key, make) { return geoCache[key] || (geoCache[key] = make()); }

// Pose vector layout
const HIPY = 0, LEAN = 1, TWIST = 2, TURN = 3, HEAD = 4;
const L0X = 5, L0K = 6, L0Z = 7, L1X = 8, L1K = 9, L1Z = 10; // legs: 0 = right, 1 = left
const A0X = 11, A0Z = 12, A0E = 13, A1X = 14, A1Z = 15, A1E = 16; // arms: 0 = right, 1 = left
const BRX = 17, BRY = 18, BRZ = 19, BPY = 20;
const N = 21;

const BLEND_TIME = { run: 0.16, carry: 0.14, idle: 0.22, stance2: 0.25, stance3: 0.25, block: 0.14, throw: 0.06, catch: 0.08, tackle: 0.08, dive: 0.08, fall: 0.1, down: 0.25, juke: 0.06, spin: 0.05, kick: 0.05, celebrate: 0.2 };

function jerseyTexture(team, num, home) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  const base = home ? team.primary : '#f4f4f4';
  const trim = home ? team.secondary : team.primary;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 128);
  // Collar trim and side panels
  g.fillStyle = trim;
  g.fillRect(0, 4, 256, 7);
  g.globalAlpha = 0.85;
  g.fillRect(0, 0, 10, 128); g.fillRect(118, 0, 20, 128); g.fillRect(246, 0, 10, 128);
  g.globalAlpha = 1;
  g.font = '900 76px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = home ? team.secondary : team.secondary;
  g.fillStyle = home ? '#ffffff' : trim;
  for (const u of [0.25, 0.75]) {
    g.strokeText(String(num), u * 256, 74);
    g.fillText(String(num), u * 256, 74);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function smallNumberTexture(team, num, home) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 48;
  const g = cv.getContext('2d');
  g.fillStyle = home ? team.primary : '#f4f4f4';
  g.fillRect(0, 0, 64, 48);
  g.font = '900 34px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 4; g.strokeStyle = team.secondary;
  g.fillStyle = home ? '#ffffff' : team.primary;
  g.strokeText(String(num), 32, 26); g.fillText(String(num), 32, 26);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function decalTexture(team, size = 64) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const g = cv.getContext('2d');
  g.scale(size / 64, size / 64);
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = team.secondary;
  g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = team.primary;
  g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.fill();
  g.font = '900 34px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.fillText(team.name[0], 32, 35);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Knit jersey fabric: a fine tiled mesh pattern as a normal map.
let knitTex = null;
function fabricNormalMap() {
  if (knitTex) return knitTex;
  const N = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // Rows of small raised cells (athletic mesh)
    const cx = (x % 8) - 3.5, cy = (y % 6) - 2.5;
    const dx = -cx / 4, dy = cy / 3;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * N + x) * 4;
    img.data[i] = (dx / l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  knitTex = new THREE.CanvasTexture(cv);
  knitTex.wrapS = knitTex.wrapT = THREE.RepeatWrapping;
  knitTex.repeat.set(6, 4);
  knitTex.colorSpace = THREE.NoColorSpace;
  return knitTex;
}

export class TeamLook {
  constructor(team, home) {
    this.team = team;
    this.home = home;
    const pant = home ? (team.pants || '#e9e9e4') : team.primary;
    const pantStripe = home ? team.primary : team.secondary;
    // PBR materials: clearcoat helmets reflect the stadium; fabrics are matte with a knit grain.
    const knit = fabricNormalMap();
    this.mats = {
      helmet: new THREE.MeshPhysicalMaterial({ color: team.primary, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06 }),
      stripe: new THREE.MeshPhysicalMaterial({ color: team.secondary, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
      mask: new THREE.MeshStandardMaterial({ color: home ? team.secondary : 0x9a9a9a, roughness: 0.32, metalness: 0.7 }),
      pants: new THREE.MeshStandardMaterial({ color: new THREE.Color(pant).multiplyScalar(0.92), roughness: 0.62, metalness: 0, normalMap: knit, normalScale: new THREE.Vector2(0.15, 0.15) }),
      pantStripe: new THREE.MeshStandardMaterial({ color: pantStripe, roughness: 0.5 }),
      sleeve: new THREE.MeshStandardMaterial({ color: home ? team.primary : 0xf4f4f4, roughness: 0.72, normalMap: knit, normalScale: new THREE.Vector2(0.25, 0.25) }),
      sock: new THREE.MeshStandardMaterial({ color: home ? team.primary : team.secondary, roughness: 0.85 }),
      cleat: new THREE.MeshStandardMaterial({ color: home ? 0x111111 : 0xf2f2f2, roughness: 0.32, metalness: 0.05 }),
      glove: new THREE.MeshStandardMaterial({ color: home ? team.secondary : team.primary, roughness: 0.55 }),
      visor: new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.88 }),
      decal: new THREE.MeshStandardMaterial({ map: decalTexture(team), transparent: true, roughness: 0.25, metalness: 0.1 }),
      compression: new THREE.MeshStandardMaterial({ color: home ? 0x151515 : team.primary, roughness: 0.6 }),
      towel: new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.95, side: THREE.DoubleSide }),
      earhole: new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.6 }),
    };
    this.knit = knit;
    this.jerseyMats = new Map();
    this.shoulderMats = new Map();
  }
  // Materials for the skinned athlete (vertex colors carry its baked occlusion, so these are
  // separate from the primitive model's materials).
  athleteMats(num, opts = {}) {
    if (!this.am) {
      const t = this.team, home = this.home;
      const vc = { vertexColors: true };
      const decal = decalTexture(t, 128);
      decal.flipY = false; // glTF texture coordinates run top-down
      this.am = {
        pants: new THREE.MeshStandardMaterial({ ...vc, map: pantsAtlas(t, home), roughness: 0.5, normalMap: this.knit, normalScale: new THREE.Vector2(0.12, 0.12) }),
        belt: new THREE.MeshStandardMaterial({ ...vc, color: home ? 0x161616 : t.secondary, roughness: 0.55 }),
        socks: new THREE.MeshStandardMaterial({ ...vc, color: home ? t.primary : t.secondary, roughness: 0.85, normalMap: this.knit, normalScale: new THREE.Vector2(0.2, 0.2) }),
        shoes: new THREE.MeshStandardMaterial({ ...vc, color: home ? 0x141414 : 0xf0f0f0, roughness: 0.35, metalness: 0.05 }),
        gloves: new THREE.MeshStandardMaterial({ ...vc, color: home ? t.secondary : t.primary, roughness: 0.5 }),
        compression: new THREE.MeshStandardMaterial({ ...vc, color: home ? 0x161616 : t.primary, roughness: 0.6 }),
        helmet: new THREE.MeshPhysicalMaterial({ ...vc, color: t.primary, roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
        helmetpad: new THREE.MeshStandardMaterial({ ...vc, color: 0x1b1c1f, roughness: 0.85 }),
        stripe: new THREE.MeshPhysicalMaterial({ ...vc, color: t.secondary, roughness: 0.33, clearcoat: 1, clearcoatRoughness: 0.07 }),
        decal: new THREE.MeshStandardMaterial({ map: decal, transparent: true, alphaTest: 0.05, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }),
        eyes: new THREE.MeshStandardMaterial({ color: 0x120c0a, roughness: 0.55 }),
        mask: new THREE.MeshStandardMaterial({ ...vc, color: home ? t.secondary : 0x9a9a9a, roughness: 0.3, metalness: 0.7 }),
        strap: new THREE.MeshStandardMaterial({ ...vc, color: 0xefefef, roughness: 0.5 }),
        visor: new THREE.MeshPhysicalMaterial({ color: 0x0c0e12, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.86, clearcoat: 1 }),
      };
      this.jerseyAtlasMats = new Map();
      this.tvMats = new Map();
    }
    if (!this.jerseyAtlasMats.has(num)) {
      this.jerseyAtlasMats.set(num, new THREE.MeshStandardMaterial({ vertexColors: true, map: jerseyAtlas(this.team, num, this.home), roughness: 0.72, normalMap: this.knit, normalScale: new THREE.Vector2(0.25, 0.25) }));
    }
    const skin = skinMaterial(opts.skin ?? 0);
    return { ...this.am, jersey: this.jerseyAtlasMats.get(num), skin, arms: opts.sleeves ? this.am.compression : skin };
  }
  tvMat(num) {
    if (!this.tvMats) this.athleteMats(num);
    if (!this.tvMats.has(num)) this.tvMats.set(num, new THREE.MeshStandardMaterial({ map: tvNumberTexture(this.team, num, this.home), transparent: true, alphaTest: 0.35, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
    return this.tvMats.get(num);
  }
  jersey(num) {
    if (!this.jerseyMats.has(num)) this.jerseyMats.set(num, new THREE.MeshStandardMaterial({ map: jerseyTexture(this.team, num, this.home), roughness: 0.7, normalMap: this.knit, normalScale: new THREE.Vector2(0.28, 0.28) }));
    return this.jerseyMats.get(num);
  }
  shoulder(num) {
    if (!this.shoulderMats.has(num)) this.shoulderMats.set(num, new THREE.MeshStandardMaterial({ map: smallNumberTexture(this.team, num, this.home), roughness: 0.75 }));
    return this.shoulderMats.get(num);
  }
}

function mesh(g, m, shadow = true) {
  const x = new THREE.Mesh(g, m);
  x.castShadow = shadow;
  return x;
}

const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

const TV_GEO = new THREE.PlaneGeometry(0.13, 0.087);
const TOWEL_GEO = new THREE.PlaneGeometry(0.11, 0.24);

export class PlayerModel {
  // opts: { skin, size, bulk, visor, sleeves, towel }
  constructor(look, num, opts = {}) {
    // The Blender-built skinned athlete when it's loaded; the primitive model otherwise
    if (athleteTemplate() && !opts.primitive) this.buildSkinned(look, num, opts);
    else this.buildPrimitive(look, num, opts);
    this.root.scale.setScalar(opts.size ?? 1);
    this.phase = Math.random() * 6;
    this.celeb = Math.floor(Math.random() * 6);
    this.lastAnim = '';
    this.animClock = 0;
    this.blendT = 1;
    this.cur = new Float32Array(N);
    this.from = new Float32Array(N);
    this.tgt = new Float32Array(N);
    this.cur[HIPY] = 1;
    this.moving = false;
  }

  // Skinned athlete: the bones stand in for the old rig's joint groups, so the pose code
  // below drives both models the same way.
  buildSkinned(look, num, opts) {
    const w = opts.bulk ?? 1;
    const a = makeAthlete(look.athleteMats(num, opts), { w });
    this.skinned = a;
    const B = a.bones;
    this.root = a.root;
    this.body = B.root;
    this.hips = B.hips;
    this.torso = B.torso;
    this.head = B.head;
    this.arms = [{ shoulder: B.shoulder_R, elbow: B.elbow_R, hand: B.hand_R }, { shoulder: B.shoulder_L, elbow: B.elbow_L, hand: B.hand_L }];
    this.legs = [{ hip: B.thigh_R, knee: B.knee_R }, { hip: B.thigh_L, knee: B.knee_L }];
    if (a.meshes.visor) a.meshes.visor.visible = !!opts.visor;
    // Shoulder numbers on top of the pads (readable from the broadcast camera behind the play)
    const tpl = athleteTemplate();
    const heavy = Math.max(0, Math.min(1, (w - 1) / 0.28)), lean = Math.max(0, Math.min(1, (1 - w) / 0.15));
    for (const s of [-1, 1]) {
      const holder = new THREE.Group();
      holder.position.set(s * tpl.padX * (1 + 0.18 * heavy - 0.07 * lean), tpl.padY - B.torso.position.y - B.hips.position.y + 0.004, -0.012);
      holder.rotation.z = -s * 0.22;
      const tv = new THREE.Mesh(TV_GEO, look.tvMat(num));
      tv.rotation.set(-Math.PI / 2, 0, Math.PI);
      holder.add(tv);
      this.torso.add(holder);
    }
    if (opts.towel) {
      const towel = new THREE.Mesh(TOWEL_GEO, look.mats.towel);
      towel.position.set(-0.14 * w, -0.13, 0.17 * w);
      this.hips.add(towel);
    }
  }

  buildPrimitive(look, num, opts) {
    const M = look.mats;
    const w = opts.bulk ?? 1;
    const skin = new THREE.MeshStandardMaterial({ color: SKIN[(opts.skin ?? 0) % SKIN.length], roughness: 0.7 });
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // pitch/roll pivot at the feet
    this.root.add(this.body);
    this.hips = new THREE.Group();
    this.hips.position.y = 1.0;
    this.body.add(this.hips);
    const pelvis = mesh(geo('pelvis' + w, () => { const g = new THREE.SphereGeometry(0.215 * w, 18, 12); g.scale(1, 0.62, 0.72); return g; }), M.pants);
    this.hips.add(pelvis);
    if (opts.towel) {
      const towel = mesh(geo('towel', () => new THREE.PlaneGeometry(0.11, 0.24)), M.towel, false);
      towel.position.set(-0.12 * w, -0.2, 0.15 * w);
      this.hips.add(towel);
    }
    // Torso
    this.torso = new THREE.Group();
    this.torso.position.y = 0.08;
    this.hips.add(this.torso);
    const torso = mesh(geo('torso' + w, () => {
      const prof = [[0.19, 0], [0.205, 0.1], [0.225, 0.22], [0.255, 0.36], [0.278, 0.48], [0.282, 0.56], [0.24, 0.62], [0.13, 0.655]].map(([r, y]) => new THREE.Vector2(r * w, y));
      const g = new THREE.LatheGeometry(prof, 22, Math.PI / 2);
      g.scale(1, 1, 0.78); // deeper side-to-side than front-to-back
      return g;
    }), look.jersey(num));
    torso.position.y = 0.02;
    this.torso.add(torso);
    // Shoulder pads: two domes over a collar block, with TV numbers on top
    const collar = mesh(geo('collar' + w, () => new THREE.BoxGeometry(0.34 * w, 0.12, 0.36 * w)), M.sleeve);
    collar.position.y = 0.6;
    this.torso.add(collar);
    const domeG = geo('dome' + w, () => new THREE.SphereGeometry(0.215 * w, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2));
    for (const s of [-1, 1]) {
      const dome = mesh(domeG, M.sleeve);
      dome.scale.set(1.08, 0.66, 1.0);
      dome.position.set(0.21 * s * w, 0.57, 0);
      this.torso.add(dome);
      const tv = mesh(geo('tvnum', () => new THREE.PlaneGeometry(0.15, 0.11)), look.shoulder(num), false);
      tv.rotation.x = -Math.PI / 2 + 0.25;
      tv.rotation.z = s * -0.25;
      tv.position.set(0.24 * s * w, 0.705, -0.02);
      this.torso.add(tv);
    }
    const neck = mesh(geo('neck', () => new THREE.CylinderGeometry(0.07, 0.08, 0.12, 8)), skin, false);
    neck.position.y = 0.76;
    this.torso.add(neck);
    // Head / helmet
    this.head = new THREE.Group();
    this.head.position.y = 0.9;
    this.torso.add(this.head);
    const helmet = mesh(geo('helmet', () => new THREE.SphereGeometry(0.165, 32, 20)), M.helmet);
    helmet.scale.set(1, 1.02, 1.12);
    this.head.add(helmet);
    for (const s of [-1, 1]) {
      const ear = mesh(geo('earhole', () => new THREE.CircleGeometry(0.022, 12)), M.earhole, false);
      ear.position.set(0.162 * s, -0.025, 0.035);
      ear.rotation.y = s * Math.PI / 2;
      this.head.add(ear);
    }
    const stripe = mesh(geo('hstripe', () => new THREE.BoxGeometry(0.045, 0.016, 0.35)), M.stripe, false);
    stripe.position.set(0, 0.16, -0.005);
    this.head.add(stripe);
    for (const s of [-1, 1]) {
      const decal = mesh(geo('decal', () => new THREE.CircleGeometry(0.068, 18)), M.decal, false);
      decal.position.set(0.158 * s, 0.02, -0.02);
      decal.rotation.y = s * Math.PI / 2;
      this.head.add(decal);
    }
    // Facemask: two arcs, a center bar and side connectors
    const maskG = geo('mask', () => new THREE.TorusGeometry(0.128, 0.0135, 8, 20, Math.PI));
    for (const yy of [-0.035, -0.085]) {
      const mk = mesh(maskG, M.mask, false);
      mk.rotation.x = Math.PI / 2; mk.rotation.z = Math.PI;
      mk.position.set(0, yy, 0.06);
      mk.scale.set(1, 1.22, 1);
      this.head.add(mk);
    }
    const bar = mesh(geo('maskbar', () => new THREE.CylinderGeometry(0.011, 0.011, 0.11, 8)), M.mask, false);
    bar.position.set(0, -0.06, 0.205);
    this.head.add(bar);
    for (const s of [-1, 1]) {
      const side = mesh(geo('maskside', () => new THREE.CylinderGeometry(0.01, 0.01, 0.1, 6)), M.mask, false);
      side.position.set(0.105 * s, -0.06, 0.15);
      this.head.add(side);
    }
    if (opts.visor) {
      const visor = mesh(geo('visor', () => new THREE.BoxGeometry(0.2, 0.055, 0.012)), M.visor, false);
      visor.position.set(0, 0.0, 0.178);
      this.head.add(visor);
    }
    // Arms (0 = right, 1 = left; the model faces +Z so its right is -X)
    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.36 * s * w, 0.56, 0);
      this.torso.add(shoulder);
      const up = mesh(geo('uarm' + w, () => new THREE.CapsuleGeometry(0.074 * w, 0.2, 4, 12)), M.sleeve);
      up.position.y = -0.16;
      shoulder.add(up);
      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      shoulder.add(elbow);
      const fore = mesh(geo('farm' + w, () => new THREE.CapsuleGeometry(0.055 * w, 0.2, 4, 12)), opts.sleeves ? M.compression : skin);
      fore.position.y = -0.15;
      elbow.add(fore);
      const hand = mesh(geo('hand', () => { const g = new THREE.SphereGeometry(0.056, 12, 8); g.scale(0.85, 1.25, 0.7); return g; }), M.glove, false);
      hand.position.y = -0.32;
      elbow.add(hand);
      this.arms.push({ shoulder, elbow, hand });
    }
    // Legs (0 = right, 1 = left)
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.12 * s * w, -0.08, 0);
      this.hips.add(hip);
      // Thigh (hip to knee): full through the thigh pads, slimming above the knee; the
      // calf swells below the knee and narrows to the ankle. Pants run just past the knee.
      const thigh = mesh(geo('thigh' + w, () => {
        const prof = [[0.001, 0], [0.058, 0.004], [0.062, 0.05], [0.072, 0.15], [0.084, 0.27], [0.09, 0.37], [0.088, 0.44], [0.07, 0.48], [0.001, 0.485]].map(([r, y]) => new THREE.Vector2(r * w, y));
        const g = new THREE.LatheGeometry(prof, 16);
        g.translate(0, -0.47, 0);
        return g;
      }), M.pants);
      hip.add(thigh);
      // Side stripe hugging the outside of the thigh
      const ps = mesh(geo('pstripe' + w + s, () => {
        const prof = [[0.062, 0.05], [0.072, 0.15], [0.084, 0.27], [0.09, 0.37], [0.088, 0.44]].map(([r, y]) => new THREE.Vector2(r * w * 1.03 + 0.002, y));
        const g = new THREE.LatheGeometry(prof, 2, (s > 0 ? Math.PI / 2 : Math.PI * 1.5) - 0.13, 0.26);
        g.translate(0, -0.47, 0);
        return g;
      }), M.pantStripe, false);
      hip.add(ps);
      const knee = new THREE.Group();
      knee.position.y = -0.46;
      hip.add(knee);
      const cw = 0.85 + 0.15 * w;
      const shin = mesh(geo('shin' + w, () => {
        const prof = [[0.001, 0], [0.036, 0.01], [0.04, 0.06], [0.048, 0.16], [0.059, 0.27], [0.061, 0.32], [0.055, 0.38], [0.047, 0.42], [0.001, 0.43]].map(([r, y]) => new THREE.Vector2(r * cw, y));
        const g = new THREE.LatheGeometry(prof, 14);
        g.translate(0, -0.43, 0);
        return g;
      }), M.sock);
      const kneeCap = mesh(geo('kneecap' + w, () => { const g = new THREE.SphereGeometry(0.064 * w, 12, 8); g.scale(1, 0.92, 1); return g; }), M.pants, false);
      kneeCap.position.z = 0.012;
      knee.add(kneeCap);
      knee.add(shin);
      const foot = mesh(geo('foot', () => { const g = new THREE.CapsuleGeometry(0.048, 0.17, 4, 10); g.rotateX(Math.PI / 2); g.scale(1.05, 0.75, 1); return g; }), M.cleat);
      foot.position.set(0, -0.44, 0.06);
      knee.add(foot);
      this.legs.push({ hip, knee });
    }
  }

  // Write a pose description into the target vector.
  pose(p) {
    const t = this.tgt;
    t[HIPY] = p.hipY; t[LEAN] = p.lean || 0; t[TWIST] = p.twist || 0; t[TURN] = p.turn || 0; t[HEAD] = p.head || 0;
    t[L0X] = p.legs[0][0]; t[L0K] = p.legs[0][1]; t[L0Z] = p.legs[0][2] || 0;
    t[L1X] = p.legs[1][0]; t[L1K] = p.legs[1][1]; t[L1Z] = p.legs[1][2] || 0;
    t[A0X] = p.arms[0][0]; t[A0Z] = p.arms[0][1]; t[A0E] = p.arms[0][2];
    t[A1X] = p.arms[1][0]; t[A1Z] = p.arms[1][1]; t[A1E] = p.arms[1][2];
  }

  apply(v) {
    this.hips.position.y = v[HIPY];
    this.torso.rotation.set(v[LEAN], v[TURN], v[TWIST]);
    this.head.rotation.x = v[HEAD];
    this.legs[0].hip.rotation.set(v[L0X], 0, v[L0Z]); this.legs[0].knee.rotation.x = v[L0K];
    this.legs[1].hip.rotation.set(v[L1X], 0, v[L1Z]); this.legs[1].knee.rotation.x = v[L1K];
    this.arms[0].shoulder.rotation.set(v[A0X], 0, v[A0Z]); this.arms[0].elbow.rotation.x = v[A0E];
    this.arms[1].shoulder.rotation.set(v[A1X], 0, v[A1Z]); this.arms[1].elbow.rotation.x = v[A1E];
    this.body.rotation.set(v[BRX], v[BRY], v[BRZ]);
    this.body.position.y = v[BPY];
  }

  // anim: animation hint, speed (yd/s), dt, ctx: { turnRate, fallBack, fallSide }
  animate(anim, speed, dt, ctx = {}) {
    // Hysteresis between idle and running to avoid flicker at low speeds
    if (anim === 'run' || anim === 'carry' || anim === 'idle') {
      if (this.moving && speed < 0.35) this.moving = false;
      else if (!this.moving && speed > 0.7) this.moving = true;
      if (!this.moving) anim = 'idle';
      else if (anim === 'idle') anim = 'run';
    }
    if (anim !== this.lastAnim) {
      this.from.set(this.cur);
      this.blendT = 0;
      this.blendDur = BLEND_TIME[anim] ?? 0.15;
      this.lastAnim = anim;
      this.animClock = 0;
    }
    this.animClock += dt;
    this.blendT += dt;
    const t = this.animClock;
    const T = this.tgt;
    T[BRX] = 0; T[BRY] = 0; T[BRZ] = 0; T[BPY] = 0;
    const run = (sp, carry = false, back = false) => {
      const k = Math.min(1, sp / 8);
      this.phase += dt * (5 + sp * 1.25) * (back ? -1 : 1);
      const ph = this.phase;
      const amp = 0.25 + k * 0.75;
      const s = Math.sin(ph);
      const lean = back ? -0.05 : 0.08 + k * 0.28;
      T[BPY] = Math.abs(Math.cos(ph)) * 0.06 * k;
      // Lean into turns
      T[BRZ] = Math.max(-0.32, Math.min(0.32, (ctx.turnRate || 0) * 0.07 * k));
      this.pose({
        hipY: 1.0 - k * 0.04,
        lean,
        legs: [
          [-s * amp - 0.1 * k, Math.max(0, Math.sin(ph + 1.2)) * (0.4 + k * 1.2)],
          [s * amp - 0.1 * k, Math.max(0, Math.sin(ph + Math.PI + 1.2)) * (0.4 + k * 1.2)],
        ],
        arms: [
          carry ? [-0.45, -0.28, -1.95] : [s * amp * 0.9, -0.12, -1.0 - k * 0.4],
          [-s * amp * 0.9, 0.12, -1.0 - k * 0.4],
        ],
        head: -lean * 0.6,
      });
    };
    // Side shuffle: athletic stance, short lateral steps (defenders mirroring while facing the QB).
    const shuffle = (sp) => {
      const k = Math.min(1, sp / 4.5);
      this.phase += dt * (8 + sp * 1.5);
      const s = Math.sin(this.phase);
      T[BPY] = Math.abs(Math.cos(this.phase)) * 0.05 * k;
      this.pose({ hipY: 0.9, lean: 0.42, legs: [[0.62, -0.95 + Math.max(0, s) * 0.35 * k, -0.12 - s * 0.24 * k], [0.62, -0.95 + Math.max(0, -s) * 0.35 * k, 0.12 - s * 0.24 * k]], arms: [[-0.55, -0.3, -1.0], [-0.55, 0.3, -1.0]], head: -0.25 });
    };
    switch (anim) {
      case 'run': run(speed); break;
      case 'shuffle': if (speed > 5) run(speed); else shuffle(speed); break;
      case 'carry': run(speed, true); break;
      case 'backpedal': run(speed, false, true); break;
      case 'stance3':
        this.pose({ hipY: 0.72, lean: 1.15, legs: [[1.25, -1.6, -0.12], [0.9, -1.45, 0.12]], arms: [[-1.35, -0.1, -0.05], [-0.4, 0.15, -0.6]], head: -0.9 });
        break;
      case 'stance2':
        this.pose({ hipY: 0.86, lean: 0.55, legs: [[0.75, -1.05, -0.08], [0.45, -0.9, 0.08]], arms: [[-0.55, -0.25, -0.9], [-0.55, 0.25, -0.9]], head: -0.45 });
        break;
      case 'qb_uc':
        this.pose({ hipY: 0.82, lean: 0.55, legs: [[0.8, -1.2, -0.12], [0.8, -1.2, 0.12]], arms: [[-1.0, -0.15, -0.4], [-1.0, 0.15, -0.4]], head: -0.4 });
        break;
      case 'block': {
        const k = Math.min(1, speed / 6);
        this.phase += dt * (3 + speed);
        const s = Math.sin(this.phase) * 0.3 * (0.4 + k);
        this.pose({ hipY: 0.86, lean: 0.5, legs: [[0.55 + s, -0.9, -0.18], [0.55 - s, -0.9, 0.18]], arms: [[-1.45, -0.25, -0.35], [-1.45, 0.25, -0.35]], head: -0.4 });
        break;
      }
      case 'throw': {
        // Right arm cocks up and back, then whips forward over the top.
        // The ball leaves the hand ~60% of the way through (mid-whip) after the sim's windup.
        const k = Math.min(1, t / (ctx.windup ? ctx.windup / 0.6 : 0.34));
        const arm = k < 0.45 ? [2.4 + k * 0.5, -0.35, -1.6] : [2.62 - (k - 0.45) * 6.8, -0.25, -1.6 + (k - 0.45) * 2.5];
        this.pose({ hipY: 0.98, lean: 0.08 + k * 0.28, turn: -0.45 + k * 0.7, legs: [[-0.25, -0.15, -0.1], [0.3, -0.25, 0.12]], arms: [arm, [-1.0, 0.3, -0.6]], head: -0.05 });
        break;
      }
      case 'handoff':
        if (speed > 1) run(speed);
        else this.pose({ hipY: 0.94, lean: 0.25, turn: -0.4, legs: [[0.3, -0.4, -0.1], [-0.1, -0.2, 0.1]], arms: [[-1.1, -0.3, -0.3], [-1.1, 0.3, -0.3]], head: -0.2 });
        break;
      case 'catch':
        run(speed);
        T[A0X] = -2.6; T[A1X] = -2.6; T[A0E] = -0.3; T[A1E] = -0.3; T[A0Z] = -0.1; T[A1Z] = 0.1;
        break;
      case 'swat': case 'jump': {
        T[BPY] = Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.55;
        this.pose({ hipY: 1.0, lean: 0, legs: [[0.4, -0.8, -0.05], [0.2, -0.6, 0.05]], arms: [[-3.0, -0.2, -0.1], [-3.0, 0.2, -0.1]], head: 0.2 });
        break;
      }
      case 'juke':
        run(speed, true);
        T[BRZ] = Math.sin(t * 9) * 0.35;
        break;
      case 'spin':
        run(speed, true);
        T[BRY] = -smooth01(t / 0.45) * Math.PI * 2;
        break;
      case 'stiff':
        run(speed, true);
        T[A1X] = -1.45; T[A1Z] = -0.55; T[A1E] = 0;
        break;
      case 'truck':
        run(speed, true);
        T[LEAN] = 0.8; T[HEAD] = -0.75;
        break;
      case 'hurdle': {
        run(speed * 0.5, true);
        T[BPY] = Math.sin(Math.min(1, t / 0.55) * Math.PI) * 0.9;
        T[L0X] = -1.4; T[L0K] = 0.2; T[L1X] = 0.6; T[L1K] = 1.8;
        break;
      }
      case 'dive': case 'tackle': {
        const k = smooth01(t / 0.32);
        this.pose({ hipY: 1.0, lean: 0.2, legs: [[-0.3 * k, 0.4, -0.05], [-0.1, 0.2, 0.05]], arms: [[-2.6, -0.3, -0.2], [-2.6, 0.3, -0.2]], head: -0.3 });
        T[BRX] = k * 1.35;
        T[BPY] = -k * 0.2;
        break;
      }
      case 'fall': case 'down': {
        const k = anim === 'down' ? 1 : smooth01(t / 0.4);
        const back = !!ctx.fallBack;
        this.pose({ hipY: 1.0, lean: back ? -0.1 : 0.1, legs: [[0.1, back ? 0.9 : 0.5, -0.1], [-0.2, back ? 0.7 : 0.3, 0.1]], arms: [[-2.2, -0.6, -0.4], [-1.6, 0.6, -0.6]], head: back ? -0.3 : 0.1 });
        T[BRX] = (back ? -1.45 : 1.5) * k;
        T[BRZ] = (ctx.fallSide || 0) * 0.35 * k;
        T[BPY] = 0.05 * k;
        break;
      }
      case 'kneel':
        this.pose({ hipY: 0.62, lean: 0.15, legs: [[1.4, -1.5, -0.1], [-0.1, -1.55, 0.1]], arms: [[-0.6, -0.2, -0.8], [-0.6, 0.2, -0.8]], head: -0.1 });
        break;
      case 'kick': {
        const k = Math.min(1, t / 0.4);
        const sw = k < 0.4 ? 0.8 * (k / 0.4) : 0.8 - (k - 0.4) * 4;
        this.pose({ hipY: 0.98, lean: -0.1, legs: [[sw, sw > 0 ? -0.9 : -0.1, -0.1], [0.1, -0.2, 0.15]], arms: [[0.3, 0.9, -0.3], [-0.2, -0.9, -0.3]], head: 0.1 });
        break;
      }
      case 'celebrate': {
        // Each player has his own celebration (picked when the model is made)
        const st = this.celeb;
        if (st === 1) {
          // Points to the sky, chest out
          T[BPY] = Math.abs(Math.sin(t * 4)) * 0.03;
          this.pose({ hipY: 1.0, lean: -0.12, legs: [[-0.08, 0.12, -0.08], [0.06, 0.08, 0.08]], arms: [[-2.95, -0.12, -0.05], [0.12, 0.25, -0.35]], head: -0.45 });
        } else if (st === 2) {
          // Alternating arm pumps with a hip sway
          const a = Math.sin(t * 7.5), u0 = Math.max(0, a), u1 = Math.max(0, -a);
          T[BRZ] = Math.sin(t * 3.75) * 0.12;
          T[BPY] = Math.abs(a) * 0.04;
          this.pose({ hipY: 0.96 - Math.abs(a) * 0.04, lean: 0.05, legs: [[-0.18, 0.35 + u1 * 0.2, -0.1], [-0.18, 0.35 + u0 * 0.2, 0.1]], arms: [[-0.7 - u0 * 2.0, -0.3, -1.3 + u0 * 1.0], [-0.7 - u1 * 2.0, 0.3, -1.3 + u1 * 1.0]], head: -0.2 });
        } else if (st === 3) {
          // Double flex, turning to show the crowd
          const p = Math.sin(t * 5) * 0.15;
          this.pose({ hipY: 0.97, lean: -0.18, turn: Math.sin(t * 1.6) * 0.25, legs: [[-0.1, 0.2, -0.16], [-0.1, 0.2, 0.16]], arms: [[-1.57, -1.4, -1.6 + p], [-1.57, 1.4, -1.6 + p]], head: -0.15 });
        } else if (st === 4) {
          // Arms out, banking side to side
          T[BRZ] = Math.sin(t * 2.4) * 0.35;
          T[BPY] = Math.abs(Math.sin(t * 4.8)) * 0.04;
          this.pose({ hipY: 0.98, lean: 0.15, legs: [[-0.25, 0.4, -0.08], [0.2, 0.3, 0.08]], arms: [[0, -1.5, -0.05], [0, 1.5, -0.05]], head: -0.1 });
        } else if (st === 5) {
          // Big fist pump with a knee lift (pulls down fast, recovers slowly)
          const c = (t * 1.6) % 1, k = c < 0.35 ? c / 0.35 : 1 - (c - 0.35) / 0.65;
          this.pose({ hipY: 0.97 - k * 0.06, lean: 0.1 + k * 0.2, legs: [[-0.1, 0.25 + k * 0.2, -0.1], [-0.15 - k * 0.9, 0.3 + k * 1.1, 0.1]], arms: [[-2.5 + k * 2.0, -0.25, -0.4 - k * 1.5], [0.1, 0.3, -0.6]], head: -0.3 + k * 0.4 });
        } else {
          // Leaps with both arms up, tucking the legs
          const j = Math.abs(Math.sin(t * 5));
          T[BPY] = j * 0.5;
          this.pose({ hipY: 1.0, lean: -0.1, legs: [[0.2, 0.2 + j * 0.6, -0.1], [0.2, 0.2 + j * 0.6, 0.1]], arms: [[-2.9, -0.4, -0.2], [-2.9, 0.4, -0.2]], head: -0.3 });
        }
        break;
      }
      case 'qb_gun': case 'idle': case 'hold': default: {
        const br = Math.sin(t * 2 + this.phase) * 0.02;
        const qb = anim === 'qb_gun';
        this.pose({ hipY: 0.98, lean: 0.12 + br, legs: [[0.15, -0.2, -0.1], [0.1, -0.15, 0.1]], arms: qb ? [[-0.9, -0.2, -1.2], [-0.9, 0.2, -1.2]] : [[0.1, -0.2, -0.4], [0.1, 0.2, -0.4]], head: -0.05 });
        break;
      }
    }
    // Crossfade from the previous pose into the new one
    const wgt = smooth01(this.blendT / (this.blendDur || 0.15));
    const c = this.cur, f = this.from;
    if (wgt >= 1) c.set(T);
    else for (let i = 0; i < N; i++) c[i] = f[i] + (T[i] - f[i]) * wgt;
    this.apply(c);
  }
}

// Ground ring that marks the user-controlled player.
export function makeRing(color = 0x2fd5ff) {
  const g = new THREE.RingGeometry(0.62, 0.82, 32);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
  const r = new THREE.Mesh(g, m);
  r.rotation.x = -Math.PI / 2;
  r.position.y = 0.04;
  r.renderOrder = 2;
  return r;
}

export function makeBall() {
  const g = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: 0x7a3d17, roughness: 0.55 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 10), leather);
  body.scale.set(1.62, 1, 1);
  body.castShadow = true;
  g.add(body);
  const lace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.018), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  lace.position.set(0, 0.093, 0);
  g.add(lace);
  for (let i = -2; i <= 2; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.04), lace.material);
    c.position.set(i * 0.018, 0.094, 0);
    g.add(c);
  }
  return g;
}
