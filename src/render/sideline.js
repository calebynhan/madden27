// Sideline atmosphere: benches with players and coaches (instanced), and the chain crew.
import * as THREE from 'three';
import { FIELD_WIDTH } from '../core/constants.js';
import { toX, toZ } from './field.js';

function makeBenchTeam(group, team, side, count, seed) {
  // side: -1 = near sideline (y < 0), +1 = far sideline (y > width)
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const bodyG = new THREE.CapsuleGeometry(0.3, 1.05, 4, 8);
  const helmG = new THREE.SphereGeometry(0.17, 10, 8);
  const bodyM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const helmM = new THREE.MeshStandardMaterial({ color: team.primary, roughness: 0.3, metalness: 0.3 });
  const bodies = new THREE.InstancedMesh(bodyG, bodyM, count);
  const helmets = new THREE.InstancedMesh(helmG, helmM, count);
  bodies.castShadow = true;
  const people = [];
  const jersey = new THREE.Color(side < 0 ? team.primary : '#f2f2f2');
  const coach = new THREE.Color('#2b2f36');
  const yBase = side < 0 ? -5.5 : FIELD_WIDTH + 5.5;
  for (let i = 0; i < count; i++) {
    const isCoach = i < 3;
    const x = 38 + r() * 44;
    const y = yBase + side * (isCoach ? -1.2 : r() * 3.5);
    const face = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    people.push({ x, y, face: face + (r() - 0.5) * 0.8, phase: r() * 6, coach: isCoach, h: 0.95 + r() * 0.12 });
    bodies.setColorAt(i, isCoach ? coach : jersey);
  }
  bodies.instanceColor.needsUpdate = true;
  group.add(bodies, helmets);
  return { bodies, helmets, people, teamIdx: side < 0 ? 0 : 1 };
}

export class Sideline {
  constructor(scene, home, away) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.teams = [makeBenchTeam(this.group, home, -1, 26, 11), makeBenchTeam(this.group, away, 1, 26, 29)];
    // Benches
    const benchM = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.7 });
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 0.7), benchM);
      b.position.set(0, 0.25, toZ(side < 0 ? -9.5 : FIELD_WIDTH + 9.5));
      this.group.add(b);
    }
    // Chain crew on the far sideline: down box + two chain poles joined by a chain
    const orange = new THREE.MeshStandardMaterial({ color: 0xff7a00, roughness: 0.5 });
    const poleG = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6);
    this.poles = [0, 1].map(() => {
      const g = new THREE.Group();
      const p = new THREE.Mesh(poleG, orange); p.position.y = 1.3; g.add(p);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.5), orange); flag.position.y = 2.55; g.add(flag);
      this.group.add(g);
      return g;
    });
    this.chain = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6, roughness: 0.4 }));
    this.chain.position.y = 1.1;
    this.group.add(this.chain);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    this.downCanvas = cv;
    this.downTex = new THREE.CanvasTexture(cv);
    this.downTex.colorSpace = THREE.SRGBColorSpace;
    const box = new THREE.Group();
    const dp = new THREE.Mesh(poleG, new THREE.MeshStandardMaterial({ color: 0x222222 })); dp.position.y = 1.3; box.add(dp);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.55), [orange, orange, orange, orange, new THREE.MeshBasicMaterial({ map: this.downTex }), new THREE.MeshBasicMaterial({ map: this.downTex })]);
    sign.position.y = 2.6;
    sign.rotation.y = Math.PI / 2;
    box.add(sign);
    this.downBox = box;
    this.group.add(box);
    this.lastDown = -1;
    this.t = 0;
    this.celebrate = [0, 0];
  }

  paintDown(n) {
    const g = this.downCanvas.getContext('2d');
    g.fillStyle = '#ff7a00'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#111'; g.font = '900 52px Arial Black, Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), 32, 36);
    this.downTex.needsUpdate = true;
  }

  update(dt, game) {
    this.t += dt;
    const tmp = new THREE.Object3D();
    for (const tm of this.teams) {
      const cel = this.celebrate[tm.teamIdx] > 0;
      tm.people.forEach((p, i) => {
        const hop = cel ? Math.max(0, Math.sin(this.t * 7 + p.phase)) * 0.35 : Math.sin(this.t * 1.6 + p.phase) * 0.015;
        tmp.position.set(toX(p.x), 0.55 * p.h + 0.3 + hop, toZ(p.y));
        tmp.rotation.set(0, Math.PI / 2 - p.face, 0);
        tmp.scale.set(p.coach ? 1.05 : 1.35, p.h, p.coach ? 1 : 1.1);
        tmp.updateMatrix();
        tm.bodies.setMatrixAt(i, tmp.matrix);
        tmp.position.y = 1.62 * p.h + hop;
        tmp.scale.set(1, 1, 1);
        tmp.updateMatrix();
        tm.helmets.setMatrixAt(i, tmp.matrix);
      });
      tm.bodies.instanceMatrix.needsUpdate = true;
      tm.helmets.instanceMatrix.needsUpdate = true;
    }
    for (let k = 0; k < 2; k++) if (this.celebrate[k] > 0) this.celebrate[k] -= dt;
    // Chain crew follows the series
    const show = !!(game && game.sim && game.sim.kind === 'scrimmage' && !game.conversion && game.lineToGain !== undefined);
    this.poles[0].visible = this.poles[1].visible = this.chain.visible = this.downBox.visible = show;
    if (!show) return;
    const dir = game.attackDir(game.possession);
    const ltg = game.lineToGain;
    const start = ltg - dir * 10;
    const z = toZ(FIELD_WIDTH + 2.2);
    this.poles[0].position.set(toX(start), 0, z);
    this.poles[1].position.set(toX(ltg), 0, z);
    this.chain.position.set(toX((start + ltg) / 2), 1.1, z);
    this.chain.scale.x = Math.max(0.1, Math.abs(ltg - start));
    this.downBox.position.set(toX(game.sim.losX), 0, z + 0.6);
    if (game.down !== this.lastDown) { this.lastDown = game.down; this.paintDown(game.down); }
  }
}
