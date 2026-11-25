// Stadium bowl, crowd, lights and sky.
import * as THREE from 'three';
import { FIELD_LENGTH, FIELD_WIDTH } from '../core/constants.js';

function crowdTexture(home, away, seed = 7) {
  const W = 1024, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#1b1d22';
  g.fillRect(0, 0, W, H);
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const palette = [home.primary, home.primary, home.secondary, home.primary, '#d9d9d9', '#3a3a3a', '#8a6a4a', away.primary, '#c9b18a', '#222'];
  for (let row = 0; row < 32; row++) {
    for (let col = 0; col < 128; col++) {
      const x = col * 8 + (row % 2) * 4 + r() * 2;
      const y = row * 8 + r() * 2;
      g.fillStyle = palette[Math.floor(r() * palette.length)];
      g.fillRect(x, y + 2, 5, 6);
      g.fillStyle = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#ffdbac'][Math.floor(r() * 5)];
      g.fillRect(x + 1, y, 3, 3);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function skyTexture(night) {
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 256;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  if (night) { grd.addColorStop(0, '#02040b'); grd.addColorStop(0.6, '#0b1430'); grd.addColorStop(1, '#2a3550'); }
  else { grd.addColorStop(0, '#2a6fd1'); grd.addColorStop(0.65, '#8fbef0'); grd.addColorStop(1, '#dfeaf5'); }
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildStadium(scene, home, away, opts) {
  const group = new THREE.Group();
  const night = !!opts.night;
  // Sky dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), new THREE.MeshBasicMaterial({ map: skyTexture(night), side: THREE.BackSide, fog: false }));
  group.add(sky);
  const crowd = crowdTexture(home, away);
  const standMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 1 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x55595f, roughness: 1 });
  const wallMat = new THREE.MeshStandardMaterial({ color: home.primary, roughness: 0.8 });
  const L = FIELD_LENGTH + 24, Wd = FIELD_WIDTH + 24;
  const tiers = [{ d: 0, h: 2.5, depth: 22, rise: 11 }, { d: 24, h: 15, depth: 18, rise: 12 }];
  const addSide = (len, rotY, off) => {
    for (const t of tiers) {
      const slope = Math.atan2(t.rise, t.depth);
      const sl = Math.hypot(t.rise, t.depth);
      const geo = new THREE.PlaneGeometry(len + t.d * 1.6, sl);
      const tex = crowd.clone();
      tex.needsUpdate = true;
      tex.repeat.set((len + t.d) / 30, sl / 10);
      const mat = standMat.clone();
      mat.map = tex;
      const m = new THREE.Mesh(geo, mat);
      const holder = new THREE.Group();
      holder.rotation.y = rotY;
      m.rotation.x = -(Math.PI / 2 - slope);
      m.position.set(0, t.h + t.rise / 2, -(off + t.d + t.depth / 2));
      holder.add(m);
      // Back facade
      const back = new THREE.Mesh(new THREE.BoxGeometry(len + t.d * 1.6, 3, 1), concrete);
      back.position.set(0, t.h + t.rise + 1.5, -(off + t.d + t.depth + 0.5));
      holder.add(back);
      group.add(holder);
    }
    // Padded wall at field level
    const holder = new THREE.Group();
    holder.rotation.y = rotY;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 2.5, 0.6), wallMat);
    wall.position.set(0, 1.25, -off + 0.3);
    holder.add(wall);
    group.add(holder);
  };
  addSide(L, 0, Wd / 2);
  addSide(L, Math.PI, Wd / 2);
  addSide(Wd, Math.PI / 2, L / 2);
  addSide(Wd, -Math.PI / 2, L / 2);
  // Light towers
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
  const lampMat = new THREE.MeshBasicMaterial({ color: night ? 0xfffbe8 : 0xdddddd });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 50, 8), towerMat);
    pole.position.set(sx * (L / 2 + 30), 25, sz * (Wd / 2 + 30));
    group.add(pole);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 1), lampMat);
    panel.position.set(sx * (L / 2 + 30), 52, sz * (Wd / 2 + 30));
    panel.lookAt(0, 0, 0);
    group.add(panel);
  }
  // Video boards behind each end zone
  for (const sx of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 34), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x0a2a55, emissiveIntensity: 0.6 }));
    board.position.set(sx * (L / 2 + 44), 36, 0);
    group.add(board);
  }
  scene.add(group);
  return group;
}
