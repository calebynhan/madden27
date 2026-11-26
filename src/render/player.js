// Procedural, articulated football player model with code-driven animation.
// Poses are flat vectors so state changes can crossfade smoothly.
import * as THREE from 'three';

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

function decalTexture(team) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
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

export class TeamLook {
  constructor(team, home) {
    this.team = team;
    this.home = home;
    const pant = home ? (team.pants || '#e9e9e4') : team.primary;
    const pantStripe = home ? team.primary : team.secondary;
    this.mats = {
      helmet: new THREE.MeshStandardMaterial({ color: team.primary, roughness: 0.22, metalness: 0.4 }),
      stripe: new THREE.MeshStandardMaterial({ color: team.secondary, roughness: 0.4 }),
      mask: new THREE.MeshStandardMaterial({ color: home ? team.secondary : 0x9a9a9a, roughness: 0.45, metalness: 0.55 }),
      pants: new THREE.MeshStandardMaterial({ color: pant, roughness: 0.75 }),
      pantStripe: new THREE.MeshStandardMaterial({ color: pantStripe, roughness: 0.7 }),
      sleeve: new THREE.MeshStandardMaterial({ color: home ? team.primary : 0xf4f4f4, roughness: 0.85 }),
      sock: new THREE.MeshStandardMaterial({ color: home ? team.primary : team.secondary, roughness: 0.9 }),
      cleat: new THREE.MeshStandardMaterial({ color: home ? 0x111111 : 0xf2f2f2, roughness: 0.55 }),
      glove: new THREE.MeshStandardMaterial({ color: home ? team.secondary : team.primary, roughness: 0.7 }),
      visor: new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.85 }),
      decal: new THREE.MeshStandardMaterial({ map: decalTexture(team), transparent: true, roughness: 0.3, metalness: 0.2 }),
      compression: new THREE.MeshStandardMaterial({ color: home ? 0x151515 : team.primary, roughness: 0.8 }),
      towel: new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.95, side: THREE.DoubleSide }),
    };
    this.jerseyMats = new Map();
    this.shoulderMats = new Map();
  }
  jersey(num) {
    if (!this.jerseyMats.has(num)) this.jerseyMats.set(num, new THREE.MeshStandardMaterial({ map: jerseyTexture(this.team, num, this.home), roughness: 0.85 }));
    return this.jerseyMats.get(num);
  }
  shoulder(num) {
    if (!this.shoulderMats.has(num)) this.shoulderMats.set(num, new THREE.MeshStandardMaterial({ map: smallNumberTexture(this.team, num, this.home), roughness: 0.85 }));
    return this.shoulderMats.get(num);
  }
}

function mesh(g, m, shadow = true) {
  const x = new THREE.Mesh(g, m);
  x.castShadow = shadow;
  return x;
}

const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export class PlayerModel {
  // opts: { skin, size, bulk, visor, sleeves, towel }
  constructor(look, num, opts = {}) {
    const M = look.mats;
    const w = opts.bulk ?? 1;
    const skin = new THREE.MeshStandardMaterial({ color: SKIN[(opts.skin ?? 0) % SKIN.length], roughness: 0.7 });
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // pitch/roll pivot at the feet
    this.root.add(this.body);
    this.hips = new THREE.Group();
    this.hips.position.y = 1.0;
    this.body.add(this.hips);
    const pelvis = mesh(geo('pelvis' + w, () => new THREE.BoxGeometry(0.42 * w, 0.24, 0.28 * w)), M.pants);
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
    const torso = mesh(geo('torso' + w, () => new THREE.CylinderGeometry(0.27 * w, 0.21 * w, 0.62, 16, 1, false, Math.PI / 2)), look.jersey(num));
    torso.position.y = 0.33;
    this.torso.add(torso);
    // Shoulder pads: two domes over a collar block, with TV numbers on top
    const collar = mesh(geo('collar' + w, () => new THREE.BoxGeometry(0.34 * w, 0.12, 0.36 * w)), M.sleeve);
    collar.position.y = 0.6;
    this.torso.add(collar);
    const domeG = geo('dome' + w, () => new THREE.SphereGeometry(0.2 * w, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2));
    for (const s of [-1, 1]) {
      const dome = mesh(domeG, M.sleeve);
      dome.scale.set(1.05, 0.62, 1.08);
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
    const helmet = mesh(geo('helmet', () => new THREE.SphereGeometry(0.16, 20, 14)), M.helmet);
    helmet.scale.set(1, 1.0, 1.14);
    this.head.add(helmet);
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
    const maskG = geo('mask', () => new THREE.TorusGeometry(0.125, 0.011, 6, 14, Math.PI));
    for (const yy of [-0.035, -0.085]) {
      const mk = mesh(maskG, M.mask, false);
      mk.rotation.x = Math.PI / 2; mk.rotation.z = Math.PI;
      mk.position.set(0, yy, 0.06);
      mk.scale.set(1, 1.22, 1);
      this.head.add(mk);
    }
    const bar = mesh(geo('maskbar', () => new THREE.BoxGeometry(0.018, 0.11, 0.018)), M.mask, false);
    bar.position.set(0, -0.06, 0.205);
    this.head.add(bar);
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
      const up = mesh(geo('uarm' + w, () => new THREE.CylinderGeometry(0.078 * w, 0.066 * w, 0.32, 8)), M.sleeve);
      up.position.y = -0.16;
      shoulder.add(up);
      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      shoulder.add(elbow);
      const fore = mesh(geo('farm' + w, () => new THREE.CylinderGeometry(0.06 * w, 0.05, 0.3, 8)), opts.sleeves ? M.compression : skin);
      fore.position.y = -0.15;
      elbow.add(fore);
      const hand = mesh(geo('hand', () => new THREE.SphereGeometry(0.058, 8, 6)), M.glove, false);
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
      const thigh = mesh(geo('thigh' + w, () => new THREE.CylinderGeometry(0.105 * w, 0.085 * w, 0.46, 8)), M.pants);
      thigh.position.y = -0.23;
      hip.add(thigh);
      const ps = mesh(geo('pstripe' + w, () => new THREE.BoxGeometry(0.022, 0.44, 0.04)), M.pantStripe, false);
      ps.position.set(0.098 * s * w, -0.23, 0);
      hip.add(ps);
      const knee = new THREE.Group();
      knee.position.y = -0.46;
      hip.add(knee);
      const shin = mesh(geo('shin', () => new THREE.CylinderGeometry(0.075, 0.06, 0.42, 8)), M.sock);
      shin.position.y = -0.21;
      knee.add(shin);
      const foot = mesh(geo('foot', () => new THREE.BoxGeometry(0.1, 0.07, 0.26)), M.cleat);
      foot.position.set(0, -0.44, 0.06);
      knee.add(foot);
      this.legs.push({ hip, knee });
    }
    this.root.scale.setScalar(opts.size ?? 1);
    this.phase = Math.random() * 6;
    this.lastAnim = '';
    this.animClock = 0;
    this.blendT = 1;
    this.cur = new Float32Array(N);
    this.from = new Float32Array(N);
    this.tgt = new Float32Array(N);
    this.cur[HIPY] = 1;
    this.moving = false;
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
    switch (anim) {
      case 'run': case 'shuffle': run(speed); break;
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
        const k = Math.min(1, t / 0.34);
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
        T[BPY] = Math.abs(Math.sin(t * 5)) * 0.5;
        this.pose({ hipY: 1.0, lean: -0.1, legs: [[0.2, -0.5, -0.1], [0.2, -0.5, 0.1]], arms: [[-2.9, -0.4, -0.2], [-2.9, 0.4, -0.2]], head: 0.3 });
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
