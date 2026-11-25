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

export function makeFieldTexture(homeTeam, opts = {}) {
  const PX = opts.hi ? 40 : 30; // pixels per yard
  const W = Math.round(FIELD_LENGTH * PX), H = Math.round(FIELD_WIDTH * PX);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const weather = opts.weather || 'clear';
  const grassA = weather === 'snow' ? '#5f8f63' : '#2f7d36';
  const grassB = weather === 'snow' ? '#58875c' : '#2a7131';
  // Mowing stripes every 5 yards
  for (let i = 0; i < 24; i++) {
    g.fillStyle = i % 2 ? grassA : grassB;
    g.fillRect(i * 5 * PX, 0, 5 * PX + 1, H);
  }
  // Grass noise
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 18;
    d[i] = Math.max(0, Math.min(255, d[i] + n * 0.6));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.5));
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
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function buildField(scene, homeTeam, opts) {
  const group = new THREE.Group();
  const tex = makeFieldTexture(homeTeam, opts);
  const fieldMat = new THREE.MeshStandardMaterial({ map: tex, roughness: opts.weather === 'rain' ? 0.45 : 0.92, metalness: 0 });
  const field = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_LENGTH, FIELD_WIDTH), fieldMat);
  field.rotation.x = -Math.PI / 2;
  field.receiveShadow = true;
  group.add(field);
  // Surrounding turf / sideline area with a white border
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_LENGTH + 30, FIELD_WIDTH + 28), new THREE.MeshStandardMaterial({ color: opts.weather === 'snow' ? 0x6f8f72 : 0x24602a, roughness: 1 }));
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
