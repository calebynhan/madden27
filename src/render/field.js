// Procedurally painted field texture, goalposts, pylons and sideline area.
import * as THREE from 'three';
import { FIELD_LENGTH, FIELD_WIDTH, HASH_LEFT_Y, HASH_RIGHT_Y, GOALPOST_HALF_WIDTH, CROSSBAR_HEIGHT, UPRIGHT_HEIGHT } from '../core/constants.js';

export const toX = (x) => x - FIELD_LENGTH / 2;
export const toZ = (y) => y - FIELD_WIDTH / 2;

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

// Smooth value noise on a coarse grid (cell = size pixels), for natural turf variation.
function valueNoise(W, H, size, rnd) {
  const gw = Math.ceil(W / size) + 2, gh = Math.ceil(H / size) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd() * 2 - 1;
  const cw = gw - 1, ch = gh - 1;
  return (x, y) => {
    const fx = x / size, fy = y / size;
    const fix = Math.floor(fx), fiy = Math.floor(fy);
    let tx = fx - fix, ty = fy - fiy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    // Wrap so any coordinate is valid (scaled lookups go past the canvas)
    const ix = ((fix % cw) + cw) % cw, iy = ((fiy % ch) + ch) % ch;
    const a = grid[iy * gw + ix], b = grid[iy * gw + ix + 1], c = grid[(iy + 1) * gw + ix], d = grid[(iy + 1) * gw + ix + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

// Tileable grass-blade normal map: gives the turf grain where the light catches it.
export function makeGrassNormalMap() {
  const N = 256;
  const h = new Float32Array(N * N);
  let seed = 4242;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // Blades: short random strokes accumulated into a height field (wrapping edges)
  for (let k = 0; k < 2600; k++) {
    const x0 = rnd() * N, y0 = rnd() * N;
    const a = (rnd() - 0.5) * 1.2 + Math.PI / 2;
    const len = 3 + rnd() * 6, amp = 0.5 + rnd() * 0.5;
    for (let t = 0; t < len; t += 0.5) {
      const x = Math.floor(x0 + Math.cos(a) * t + N) % N, y = Math.floor(y0 + Math.sin(a) * t + N) % N;
      h[y * N + x] += amp * (1 - t / len);
    }
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);
  const at = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.9, dy = (at(x, y + 1) - at(x, y - 1)) * 0.9;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * N + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function makeFieldTexture(homeTeam, opts = {}) {
  const PX = opts.hi ? 40 : 30; // pixels per yard
  const W = Math.round(FIELD_LENGTH * PX), H = Math.round(FIELD_WIDTH * PX);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const weather = opts.weather || 'clear';
  const snow = weather === 'snow';
  // Turf: alternating 5-yard mowing stripes, broad patches, fine grain and wear between
  // the hashes, all computed per pixel.
  const A = snow ? [92, 140, 98] : [36, 104, 42], B = snow ? [84, 130, 90] : [46, 122, 52];
  const img = g.createImageData(W, H);
  const d = img.data;
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const big = valueNoise(W, H, PX * 7, rnd), mid = valueNoise(W, H, PX * 1.6, rnd);
  const hashTop = HASH_LEFT_Y * PX, hashBot = HASH_RIGHT_Y * PX;
  for (let y = 0; y < H; y++) {
    // Wear: the middle of the field (between the hashes) is a touch lighter and drier
    const wy = y > hashTop && y < hashBot ? 1 - Math.abs((y - (hashTop + hashBot) / 2) / ((hashBot - hashTop) / 2)) ** 2 : 0;
    for (let x = 0; x < W; x++) {
      const stripe = Math.floor(x / (5 * PX)) % 2;
      const base = stripe ? A : B;
      // Soft stripe edges
      const ex = (x % (5 * PX)) / PX;
      const edge = ex < 0.25 ? 0.5 + ex * 2 : ex > 4.75 ? 0.5 + (5 - ex) * 2 : 1;
      const other = stripe ? B : A;
      const n = big(x, y) * 0.07 + mid(x, y) * 0.05 + (rnd() - 0.5) * 0.09;
      const wear = wy * 0.06 * (0.6 + 0.4 * mid(x * 1.7, y * 1.7));
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        let v = base[c] * edge + other[c] * (1 - edge);
        v *= 1 + n;
        v += wear * (c === 0 ? 60 : c === 1 ? 35 : 10);
        d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // End zones
  const ez = (x0, flip) => {
    g.fillStyle = homeTeam.primary;
    g.fillRect(x0 * PX, 0, 10 * PX, H);
    // Diagonal pattern
    g.save();
    g.beginPath(); g.rect(x0 * PX, 0, 10 * PX, H); g.clip();
    g.strokeStyle = shade(homeTeam.primary, 0.82);
    g.lineWidth = PX * 0.8;
    for (let k = -20; k < 80; k += 2.2) { g.beginPath(); g.moveTo((x0 + k * 0.3) * PX, 0); g.lineTo((x0 + k * 0.3 - 8) * PX, H); g.stroke(); }
    g.restore();
    g.save();
    g.translate((x0 + 5) * PX, H / 2);
    g.rotate(flip ? Math.PI / 2 : -Math.PI / 2);
    g.font = `900 ${PX * 6}px Impact, "Arial Black", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = PX * 0.5;
    g.strokeStyle = homeTeam.secondary;
    g.fillStyle = '#ffffff';
    const name = homeTeam.name.toUpperCase();
    g.strokeText(name, 0, 0);
    g.fillText(name, 0, 0);
    g.restore();
  };
  ez(0, false);
  ez(110, true);
  // Lines
  g.fillStyle = '#f4f4f0';
  const lw = Math.max(3, PX * 0.11);
  const line = (x) => g.fillRect(x * PX - lw / 2, 0, lw, H);
  for (let x = 10; x <= 110; x += 5) line(x);
  g.fillRect(0, 0, W, lw * 2.4); g.fillRect(0, H - lw * 2.4, W, lw * 2.4); // sidelines
  g.fillRect(0, 0, lw * 2.4, H); g.fillRect(W - lw * 2.4, 0, lw * 2.4, H); // end lines
  // Hash marks every yard (sideline, inbounds hashes)
  for (let x = 11; x < 110; x++) {
    if (x % 5 === 0) continue;
    const hx = x * PX - lw / 2;
    const hl = PX * 0.67;
    g.fillRect(hx, PX * 0.67, lw, hl);
    g.fillRect(hx, H - PX * 0.67 - hl, lw, hl);
    g.fillRect(hx, HASH_LEFT_Y * PX - hl / 2, lw, hl);
    g.fillRect(hx, HASH_RIGHT_Y * PX - hl / 2, lw, hl);
  }
  // Two-point conversion marks
  g.fillRect(12 * PX - lw / 2, (FIELD_WIDTH / 2 - 0.5) * PX, lw, PX);
  g.fillRect(108 * PX - lw / 2, (FIELD_WIDTH / 2 - 0.5) * PX, lw, PX);
  // Yard numbers with direction arrows
  g.font = `700 ${PX * 2}px "Arial Black", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let x = 20; x <= 100; x += 10) {
    const n = x <= 60 ? x - 10 : 110 - x;
    const txt = String(n);
    for (const side of [0, 1]) {
      g.save();
      const y = side === 0 ? (FIELD_WIDTH - 10) * PX : 10 * PX;
      g.translate(x * PX, y);
      if (side === 1) g.rotate(Math.PI);
      g.fillStyle = '#f4f4f0';
      g.fillText(txt[0], -PX * 0.95, 0);
      if (txt[1]) g.fillText(txt[1], PX * 0.95, 0);
      // Arrow pointing to the nearer goal
      if (n !== 50) {
        const dirArrow = x < 60 ? -1 : 1;
        const ax = (side === 0 ? dirArrow : -dirArrow) * PX * 2.2;
        g.beginPath();
        g.moveTo(ax + (side === 0 ? dirArrow : -dirArrow) * PX * 0.4, -PX * 0.55);
        g.lineTo(ax - (side === 0 ? dirArrow : -dirArrow) * PX * 0.25, -PX * 0.25);
        g.lineTo(ax + (side === 0 ? dirArrow : -dirArrow) * PX * 0.4, PX * 0.05);
        g.closePath();
        g.fill();
      }
      g.restore();
    }
  }
  // Midfield emblem (original league mark): orientation-neutral star in a ring
  g.save();
  g.translate(60 * PX, (FIELD_WIDTH / 2) * PX);
  g.globalAlpha = 0.92;
  g.fillStyle = homeTeam.primary;
  g.beginPath(); g.arc(0, 0, PX * 4.2, 0, Math.PI * 2); g.fill();
  g.lineWidth = PX * 0.35; g.strokeStyle = '#ffffff'; g.stroke();
  g.lineWidth = PX * 0.18; g.strokeStyle = homeTeam.secondary;
  g.beginPath(); g.arc(0, 0, PX * 3.55, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const r = (k % 2 ? 1.1 : 2.6) * PX;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    if (k === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r); else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  g.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = opts.aniso || 8; // crisp lines all the way down the field
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function buildField(scene, homeTeam, opts) {
  const group = new THREE.Group();
  const tex = makeFieldTexture(homeTeam, opts);
  const grassN = makeGrassNormalMap();
  grassN.repeat.set(FIELD_LENGTH / 1.3, FIELD_WIDTH / 1.3);
  grassN.anisotropy = opts.aniso || 8;
  const fieldMat = new THREE.MeshStandardMaterial({ map: tex, normalMap: grassN, normalScale: new THREE.Vector2(0.55, 0.55), roughness: opts.weather === 'rain' ? 0.5 : 0.95, metalness: 0, envMapIntensity: 0.45 });
  const field = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_LENGTH, FIELD_WIDTH), fieldMat);
  field.rotation.x = -Math.PI / 2;
  field.receiveShadow = true;
  group.add(field);
  // Surrounding turf / sideline area with a white border
  const outerN = grassN.clone();
  outerN.repeat.set((FIELD_LENGTH + 30) / 1.3, (FIELD_WIDTH + 28) / 1.3);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_LENGTH + 30, FIELD_WIDTH + 28), new THREE.MeshStandardMaterial({ color: opts.weather === 'snow' ? 0x6f8f72 : 0x1f5a26, normalMap: outerN, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1, envMapIntensity: 0.4 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  outer.receiveShadow = true;
  group.add(outer);
  // Coaches' box / team areas (painted rectangles)
  for (const side of [-1, 1]) {
    const box = new THREE.Mesh(new THREE.PlaneGeometry(50, 3), new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 1, transparent: true, opacity: 0.35 }));
    box.rotation.x = -Math.PI / 2;
    box.position.set(0, -0.01, side * (FIELD_WIDTH / 2 + 4));
    group.add(box);
  }
  // Goalposts
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf2d22e, roughness: 0.5, metalness: 0.2 });
  for (const gx of [0, FIELD_LENGTH]) {
    const out = gx === 0 ? -1 : 1;
    const X = toX(gx);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, CROSSBAR_HEIGHT, 10), postMat);
    base.position.set(X + out * 1.6, CROSSBAR_HEIGHT / 2, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8), postMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(X + out * 0.8, CROSSBAR_HEIGHT, 0);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GOALPOST_HALF_WIDTH * 2, 10), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(X, CROSSBAR_HEIGHT, 0);
    const upH = UPRIGHT_HEIGHT - CROSSBAR_HEIGHT;
    for (const s of [-1, 1]) {
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, upH, 8), postMat);
      up.position.set(X, CROSSBAR_HEIGHT + upH / 2, s * GOALPOST_HALF_WIDTH);
      up.castShadow = true;
      group.add(up);
      // Wind ribbons
      const rib = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 1.2), new THREE.MeshBasicMaterial({ color: 0xff4400, side: THREE.DoubleSide }));
      rib.position.set(X, UPRIGHT_HEIGHT - 0.6, s * GOALPOST_HALF_WIDTH);
      rib.name = 'ribbon';
      group.add(rib);
    }
    for (const m of [base, arm, bar]) { m.castShadow = true; group.add(m); }
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 12), new THREE.MeshStandardMaterial({ color: homeTeam.primary, roughness: 0.8 }));
    pad.position.set(X + out * 1.6, 1.1, 0);
    group.add(pad);
  }
  // Pylons at the four corners of each end zone
  const pyl = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.6 });
  for (const gx of [0, 10, 110, 120]) for (const gy of [0, FIELD_WIDTH]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.13), pyl);
    p.position.set(toX(gx), 0.25, toZ(gy));
    p.castShadow = true;
    group.add(p);
  }
  scene.add(group);
  return { group, fieldMat, tex };
}
