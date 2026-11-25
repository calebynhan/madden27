// Procedural, articulated football player model with code-driven animation.
import * as THREE from 'three';

const SKIN = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0x6b3f1f, 0xa0663a, 0x4a2a12];

const geoCache = {};
function geo(key, make) { return geoCache[key] || (geoCache[key] = make()); }

function jerseyTexture(team, num, home) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  const base = home ? team.primary : '#f4f4f4';
  const trim = home ? team.secondary : team.primary;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 128);
  // Sleeve/shoulder stripes
  g.fillStyle = trim;
  g.fillRect(0, 6, 256, 8);
  g.font = '900 78px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7;
  g.strokeStyle = home ? team.accent || '#ffffff' : trim;
  g.fillStyle = home ? '#ffffff' : trim;
  if (!home) g.strokeStyle = team.secondary;
  for (const u of [0.25, 0.75]) {
    g.strokeText(String(num), u * 256, 72);
    g.fillText(String(num), u * 256, 72);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class TeamLook {
  constructor(team, home) {
    this.team = team;
    this.home = home;
    const pant = home ? (team.pants || '#ececec') : team.primary;
    this.mats = {
      helmet: new THREE.MeshStandardMaterial({ color: team.primary, roughness: 0.25, metalness: 0.35 }),
      stripe: new THREE.MeshStandardMaterial({ color: team.secondary, roughness: 0.4 }),
      mask: new THREE.MeshStandardMaterial({ color: home ? team.secondary : 0x888888, roughness: 0.5, metalness: 0.5 }),
      pants: new THREE.MeshStandardMaterial({ color: pant, roughness: 0.8 }),
      sleeve: new THREE.MeshStandardMaterial({ color: home ? team.primary : 0xf4f4f4, roughness: 0.85 }),
      sock: new THREE.MeshStandardMaterial({ color: home ? team.primary : team.secondary, roughness: 0.9 }),
      cleat: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }),
      glove: new THREE.MeshStandardMaterial({ color: home ? team.secondary : team.primary, roughness: 0.7 }),
    };
    this.jerseyMats = new Map();
  }
  jersey(num) {
    if (!this.jerseyMats.has(num)) this.jerseyMats.set(num, new THREE.MeshStandardMaterial({ map: jerseyTexture(this.team, num, this.home), roughness: 0.85 }));
    return this.jerseyMats.get(num);
  }
}

function mesh(g, m, shadow = true) {
  const x = new THREE.Mesh(g, m);
  x.castShadow = shadow;
  return x;
}

export class PlayerModel {
  constructor(look, num, skinIdx = 0, size = 1, bulk = 1) {
    const M = look.mats;
    const skin = new THREE.MeshStandardMaterial({ color: SKIN[skinIdx % SKIN.length], roughness: 0.7 });
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // pitch/roll pivot at feet
    this.root.add(this.body);
    this.hips = new THREE.Group();
    this.hips.position.y = 1.0;
    this.body.add(this.hips);
    const w = bulk;
    const pelvis = mesh(geo('pelvis' + w, () => new THREE.BoxGeometry(0.42 * w, 0.24, 0.28 * w)), M.pants);
    this.hips.add(pelvis);
    // Torso
    this.torso = new THREE.Group();
    this.torso.position.y = 0.08;
    this.hips.add(this.torso);
    const tg = geo('torso' + w, () => new THREE.CylinderGeometry(0.27 * w, 0.21 * w, 0.62, 14, 1, false, Math.PI / 2));
    const torso = mesh(tg, look.jersey(num));
    torso.position.y = 0.33;
    this.torso.add(torso);
    const pads = mesh(geo('pads' + w, () => new THREE.BoxGeometry(0.8 * w, 0.18, 0.42 * w)), M.sleeve);
    pads.position.y = 0.62;
    this.torso.add(pads);
    const neck = mesh(geo('neck', () => new THREE.CylinderGeometry(0.07, 0.08, 0.12, 8)), skin, false);
    neck.position.y = 0.76;
    this.torso.add(neck);
    // Head / helmet
    this.head = new THREE.Group();
    this.head.position.y = 0.9;
    this.torso.add(this.head);
    const helmet = mesh(geo('helmet', () => new THREE.SphereGeometry(0.155, 16, 12)), M.helmet);
    helmet.scale.set(1, 1.02, 1.12);
    this.head.add(helmet);
    const stripe = mesh(geo('hstripe', () => new THREE.BoxGeometry(0.04, 0.02, 0.33)), M.stripe, false);
    stripe.position.set(0, 0.155, 0);
    this.head.add(stripe);
    const maskG = geo('mask', () => new THREE.TorusGeometry(0.12, 0.012, 6, 12, Math.PI));
    for (const yy of [-0.03, -0.08]) {
      const mk = mesh(maskG, M.mask, false);
      mk.rotation.x = Math.PI / 2; mk.rotation.z = Math.PI;
      mk.position.set(0, yy, 0.06);
      mk.scale.set(1, 1.2, 1);
      this.head.add(mk);
    }
    const bar = mesh(geo('maskbar', () => new THREE.BoxGeometry(0.02, 0.1, 0.02)), M.mask, false);
    bar.position.set(0, -0.06, 0.19);
    this.head.add(bar);
    // Arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.36 * s * w, 0.58, 0);
      this.torso.add(shoulder);
      const up = mesh(geo('uarm' + w, () => new THREE.CylinderGeometry(0.075 * w, 0.065 * w, 0.32, 8)), M.sleeve);
      up.position.y = -0.16;
      shoulder.add(up);
      const elbow = new THREE.Group();
      elbow.position.y = -0.32;
      shoulder.add(elbow);
      const fore = mesh(geo('farm', () => new THREE.CylinderGeometry(0.058, 0.05, 0.3, 8)), skin);
      fore.position.y = -0.15;
      elbow.add(fore);
      const hand = mesh(geo('hand', () => new THREE.SphereGeometry(0.058, 8, 6)), M.glove, false);
      hand.position.y = -0.32;
      elbow.add(hand);
      this.arms.push({ shoulder, elbow, hand });
    }
    // Legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.12 * s * w, -0.08, 0);
      this.hips.add(hip);
      const thigh = mesh(geo('thigh' + w, () => new THREE.CylinderGeometry(0.105 * w, 0.085 * w, 0.46, 8)), M.pants);
      thigh.position.y = -0.23;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.46;
      hip.add(knee);
      const shin = mesh(geo('shin', () => new THREE.CylinderGeometry(0.075, 0.06, 0.42, 8)), M.sock);
      shin.position.y = -0.21;
      knee.add(shin);
      const foot = mesh(geo('foot', () => new THREE.BoxGeometry(0.1, 0.07, 0.25)), M.cleat);
      foot.position.set(0, -0.44, 0.06);
      knee.add(foot);
      this.legs.push({ hip, knee });
    }
    this.root.scale.setScalar(size);
    this.phase = Math.random() * 6;
    this.spin = 0;
    this.lastAnim = '';
    this.animClock = 0;
    this.ring = null;
  }

  pose(p) {
    // p: { hipY, lean, roll, legs:[ [hipX, knee], [hipX, knee] ], arms:[ [shX, shZ, elbow], ...], head }
    this.hips.position.y = p.hipY;
    this.torso.rotation.x = p.lean || 0;
    this.torso.rotation.z = p.twist || 0;
    this.torso.rotation.y = p.turn || 0;
    for (let i = 0; i < 2; i++) {
      const L = p.legs[i];
      this.legs[i].hip.rotation.x = L[0];
      this.legs[i].hip.rotation.z = L[2] || 0;
      this.legs[i].knee.rotation.x = L[1];
      const A = p.arms[i];
      this.arms[i].shoulder.rotation.x = A[0];
      this.arms[i].shoulder.rotation.z = A[1];
      this.arms[i].elbow.rotation.x = A[2];
    }
    this.head.rotation.x = p.head || 0;
  }

  // anim: string, speed (yd/s), dt, t (time in anim)
  animate(anim, speed, dt) {
    if (anim !== this.lastAnim) { this.animClock = 0; this.lastAnim = anim; }
    this.animClock += dt;
    const t = this.animClock;
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    const run = (sp, carry = false, back = false) => {
      const k = Math.min(1, sp / 8);
      this.phase += dt * (5 + sp * 1.25) * (back ? -1 : 1);
      const ph = this.phase;
      const amp = 0.25 + k * 0.75;
      const s = Math.sin(ph);
      const lean = back ? -0.05 : 0.08 + k * 0.28;
      this.body.position.y = Math.abs(Math.cos(ph)) * 0.06 * k;
      this.pose({
        hipY: 1.0 - k * 0.04,
        lean,
        legs: [
          [-s * amp - 0.1 * k, Math.max(0, Math.sin(ph + 1.2)) * (0.4 + k * 1.2)],
          [s * amp - 0.1 * k, Math.max(0, Math.sin(ph + Math.PI + 1.2)) * (0.4 + k * 1.2)],
        ],
        arms: [
          carry ? [-0.5, 0.25, -1.9] : [s * amp * 0.9, 0.12, -1.0 - k * 0.4],
          [-s * amp * 0.9, -0.12, -1.0 - k * 0.4],
        ],
        head: -lean * 0.6,
      });
    };
    switch (anim) {
      case 'run': case 'shuffle': run(speed); break;
      case 'carry': run(speed, true); break;
      case 'backpedal': run(speed, false, true); break;
      case 'stance3':
        this.pose({ hipY: 0.72, lean: 1.15, legs: [[1.25, -1.6, 0.12], [0.9, -1.45, -0.12]], arms: [[-1.35, 0.1, -0.05], [-0.4, -0.15, -0.6]], head: -0.9 });
        break;
      case 'stance2':
        this.pose({ hipY: 0.86, lean: 0.55, legs: [[0.75, -1.05, 0.08], [0.45, -0.9, -0.08]], arms: [[-0.55, 0.25, -0.9], [-0.55, -0.25, -0.9]], head: -0.45 });
        break;
      case 'qb_uc':
        this.pose({ hipY: 0.82, lean: 0.55, legs: [[0.8, -1.2, 0.12], [0.8, -1.2, -0.12]], arms: [[-1.0, 0.15, -0.4], [-1.0, -0.15, -0.4]], head: -0.4 });
        break;
      case 'qb_gun': case 'idle': case 'hold': default:
        if (anim === 'qb_gun' || anim === 'idle' || anim === 'hold' || !anim) {
          const br = Math.sin(t * 2) * 0.02;
          this.pose({ hipY: 0.98, lean: 0.12 + br, legs: [[0.15, -0.2, 0.1], [0.1, -0.15, -0.1]], arms: anim === 'qb_gun' ? [[-0.9, 0.2, -1.2], [-0.9, -0.2, -1.2]] : [[0.1, 0.2, -0.4], [0.1, -0.2, -0.4]], head: -0.05 });
          if (speed > 1.5) run(speed);
        } else run(speed);
        break;
      case 'block': {
        const k = Math.min(1, speed / 6);
        this.phase += dt * (3 + speed);
        const s = Math.sin(this.phase) * 0.3 * (0.4 + k);
        this.pose({ hipY: 0.86, lean: 0.5, legs: [[0.55 + s, -0.9, 0.18], [0.55 - s, -0.9, -0.18]], arms: [[-1.45, 0.25, -0.35], [-1.45, -0.25, -0.35]], head: -0.4 });
        break;
      }
      case 'throw': {
        const k = Math.min(1, t / 0.32);
        const arm = k < 0.5 ? [-2.6 + k * 0.8, -0.3, -1.6] : [-2.2 + (k - 0.5) * 4.6, -0.2, -0.3];
        this.pose({ hipY: 0.98, lean: 0.1 + k * 0.25, turn: -0.4 + k * 0.6, legs: [[0.3, -0.25, 0.12], [-0.25, -0.15, -0.1]], arms: [[-0.6, 0.4, -0.9], arm], head: -0.05 });
        break;
      }
      case 'handoff':
        this.pose({ hipY: 0.94, lean: 0.25, turn: 0.4, legs: [[0.3, -0.4, 0.1], [-0.1, -0.2, -0.1]], arms: [[-1.1, 0.3, -0.3], [-1.1, -0.3, -0.3]], head: -0.2 });
        if (speed > 1) run(speed);
        break;
      case 'catch':
        run(speed);
        this.arms[0].shoulder.rotation.x = -2.6; this.arms[1].shoulder.rotation.x = -2.6;
        this.arms[0].elbow.rotation.x = -0.3; this.arms[1].elbow.rotation.x = -0.3;
        break;
      case 'swat': case 'jump': {
        const j = Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.55;
        this.body.position.y = j;
        this.pose({ hipY: 1.0, lean: 0, legs: [[0.4, -0.8, 0.05], [0.2, -0.6, -0.05]], arms: [[-3.0, 0.2, -0.1], [-3.0, -0.2, -0.1]], head: 0.2 });
        break;
      }
      case 'juke':
        run(speed, true);
        this.body.rotation.z = Math.sin(t * 9) * 0.35;
        break;
      case 'spin':
        run(speed, true);
        this.body.rotation.y = -Math.min(1, t / 0.45) * Math.PI * 2;
        break;
      case 'stiff':
        run(speed, true);
        this.arms[0].shoulder.rotation.x = -1.4; this.arms[0].shoulder.rotation.z = 0.5; this.arms[0].elbow.rotation.x = 0;
        break;
      case 'truck':
        run(speed, true);
        this.torso.rotation.x = 0.75; this.head.rotation.x = -0.7;
        break;
      case 'hurdle': {
        run(speed * 0.5, true);
        const j = Math.sin(Math.min(1, t / 0.55) * Math.PI) * 0.9;
        this.body.position.y = j;
        this.legs[0].hip.rotation.x = -1.4; this.legs[0].knee.rotation.x = 0.2;
        this.legs[1].hip.rotation.x = 0.6; this.legs[1].knee.rotation.x = 1.8;
        break;
      }
      case 'dive': case 'tackle': {
        const k = Math.min(1, t / 0.35);
        this.pose({ hipY: 1.0, lean: 0.2, legs: [[-0.3 * k, 0.4, 0.05], [-0.1, 0.2, -0.05]], arms: [[-2.6, 0.3, -0.2], [-2.6, -0.3, -0.2]], head: -0.3 });
        this.body.rotation.x = k * 1.35;
        this.body.position.y = -k * 0.2;
        break;
      }
      case 'fall': case 'down': {
        const k = anim === 'down' ? 1 : Math.min(1, t / 0.4);
        this.pose({ hipY: 1.0, lean: 0.1, legs: [[0.1, 0.5, 0.1], [-0.2, 0.3, -0.1]], arms: [[-2.2, 0.6, -0.4], [-1.6, -0.6, -0.6]], head: 0.1 });
        this.body.rotation.x = k * 1.5;
        this.body.position.y = -k * 0.12 + 0.12 * k;
        break;
      }
      case 'kneel':
        this.pose({ hipY: 0.62, lean: 0.15, legs: [[1.4, -1.5, 0.1], [-0.1, -1.55, -0.1]], arms: [[-0.6, 0.2, -0.8], [-0.6, -0.2, -0.8]], head: -0.1 });
        break;
      case 'kick': {
        const k = Math.min(1, t / 0.4);
        const sw = k < 0.4 ? 0.8 * (k / 0.4) : 0.8 - (k - 0.4) * 4;
        this.pose({ hipY: 0.98, lean: -0.1, legs: [[0.1, -0.2, 0.15], [sw, sw > 0 ? -0.9 : -0.1, -0.1]], arms: [[-0.2, 0.9, -0.3], [0.3, -0.9, -0.3]], head: 0.1 });
        break;
      }
      case 'celebrate': {
        const j = Math.abs(Math.sin(t * 5)) * 0.5;
        this.body.position.y = j;
        this.pose({ hipY: 1.0, lean: -0.1, legs: [[0.2, -0.5, 0.1], [0.2, -0.5, -0.1]], arms: [[-2.9, 0.4, -0.2], [-2.9, -0.4, -0.2]], head: 0.3 });
        break;
      }
    }
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
