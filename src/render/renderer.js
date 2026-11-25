// Three.js renderer: syncs the simulation to 3D models and drives the camera.
import * as THREE from 'three';
import { FIELD_WIDTH, MID_Y } from '../core/constants.js';
import { clamp } from '../core/util.js';
import { buildField, toX, toZ } from './field.js';
import { buildStadium } from './stadium.js';
import { PlayerModel, TeamLook, makeRing, makeBall } from './player.js';
import { ANIM_LIST } from '../sim/play.js';
import { buildRoute } from '../sim/play.js';
import { zoneSpec, zoneLandmark, numberReceivers, resolveManTarget } from '../sim/align.js';

const CAM = {
  standard: { back: 13.5, height: 8.6, ahead: 9 },
  zoom: { back: 9.5, height: 5.6, ahead: 7 },
  wide: { back: 21, height: 15, ahead: 11 },
  high: { back: 6, height: 28, ahead: 2 },
};

export class Renderer {
  constructor(container, settings = {}) {
    this.container = container;
    this.settings = settings;
    const quality = settings.graphics || 'medium';
    this.quality = quality;
    this.r = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' });
    const dpr = window.devicePixelRatio || 1;
    this.r.setPixelRatio(quality === 'low' ? 1 : quality === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 2));
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.05;
    this.r.shadowMap.enabled = quality !== 'low';
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.r.domElement);
    this.r.domElement.className = 'game-canvas';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.3, 1200);
    this.camPos = new THREE.Vector3(-20, 12, 0);
    this.camLook = new THREE.Vector3(0, 0, 0);
    this.models = new Map();
    this.looks = [null, null];
    this.ballModel = makeBall();
    this.scene.add(this.ballModel);
    this.ring = makeRing(0x2fd5ff);
    this.ring2 = makeRing(0xff7a2f);
    this.scene.add(this.ring, this.ring2);
    this.lines = this.makeLines();
    this.artGroup = new THREE.Group();
    this.scene.add(this.artGroup);
    this.weatherFx = null;
    this.camMode = settings.camera || 'standard';
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.r.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  setupGame(game) {
    // Clear previous stadium
    if (this.world) this.scene.remove(this.world);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    const home = game.teams[0].def, away = game.teams[1].def;
    const wx = game.weather.label || game.weather.kind;
    const night = game.settings.time === 'night';
    this.night = night;
    const holder = { add: (o) => this.world.add(o) };
    this.fieldInfo = buildField(holder, home, { weather: game.weather.kind, hi: this.quality === 'high' });
    buildStadium(holder, home, away, { night });
    // Lighting
    const hemi = new THREE.HemisphereLight(night ? 0x8899bb : 0xcfe3ff, 0x2a4a22, night ? 0.55 : 0.75);
    this.world.add(hemi);
    const sun = new THREE.DirectionalLight(night ? 0xfff4e0 : 0xfff2dc, night ? 1.6 : 2.2);
    sun.position.set(-30, 70, 25);
    sun.castShadow = this.quality !== 'low';
    const sm = this.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(sm, sm);
    const sc = sun.shadow.camera;
    sc.left = -35; sc.right = 35; sc.top = 35; sc.bottom = -35; sc.near = 10; sc.far = 200;
    sun.shadow.bias = -0.0008;
    this.sun = sun;
    this.world.add(sun);
    this.world.add(sun.target);
    if (night) { const fill = new THREE.AmbientLight(0xffffff, 0.25); this.world.add(fill); }
    this.scene.fog = wx === 'snow' ? new THREE.Fog(0xcfd6e0, 30, 160) : wx === 'rain' ? new THREE.Fog(0x7d8790, 40, 220) : new THREE.Fog(night ? 0x0b1020 : 0xb8cde0, 250, 900);
    this.looks = [new TeamLook(home, true), new TeamLook(away, false)];
    for (const m of this.models.values()) this.scene.remove(m.root);
    this.models.clear();
    this.setupWeather(wx);
  }

  setupWeather(kind) {
    if (this.weatherFx) { this.scene.remove(this.weatherFx.obj); this.weatherFx = null; }
    if (kind !== 'rain' && kind !== 'snow') return;
    const n = kind === 'rain' ? 4000 : 2500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 80; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: kind === 'rain' ? 0xaabbd0 : 0xffffff, size: kind === 'rain' ? 0.08 : 0.16, transparent: true, opacity: kind === 'rain' ? 0.55 : 0.9, depthWrite: false });
    const obj = new THREE.Points(g, m);
    this.scene.add(obj);
    this.weatherFx = { obj, kind, pos };
  }

  modelFor(e) {
    const key = `${e.team}:${e.id}`;
    let m = this.models.get(key);
    if (!m) {
      const p = e.p;
      const size = clamp((p.ht || 74) / 74, 0.9, 1.12);
      const bulk = clamp(0.85 + ((p.wt || 220) - 190) / 300, 0.85, 1.28);
      m = new PlayerModel(this.looks[e.team], p.num, p.id % 7, size, bulk);
      this.models.set(key, m);
      this.scene.add(m.root);
    }
    return m;
  }

  // Bind models for a new play; hide models not on the field.
  bindPlay(sim) {
    const live = new Set();
    for (const e of sim.ents) { const m = this.modelFor(e); m.root.visible = true; live.add(m); }
    for (const m of this.models.values()) if (!live.has(m)) m.root.visible = false;
    this.boundSim = sim;
    this.camFocus = null;
  }

  makeLines() {
    const mk = (color, w) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, FIELD_WIDTH), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.025;
      m.renderOrder = 1;
      this.scene.add(m);
      return m;
    };
    return { los: mk(0x2f74ff, 0.18), first: mk(0xffd21f, 0.18) };
  }

  // ------------------------------------------------------------------ play art
  clearArt() { while (this.artGroup.children.length) { const c = this.artGroup.children.pop(); c.geometry?.dispose(); } }

  ribbon(points, color, width = 0.22, arrow = true) {
    if (points.length < 2) return;
    const verts = [], idx = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const q = points[Math.min(points.length - 1, i + 1)], o = points[Math.max(0, i - 1)];
      let dx = q.x - o.x, dy = q.y - o.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const nx = -dy * width / 2, ny = dx * width / 2;
      verts.push(toX(p.x + nx), 0.06, toZ(p.y + ny), toX(p.x - nx), 0.06, toZ(p.y - ny));
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 3;
    this.artGroup.add(mesh);
    if (arrow) {
      const a = points[points.length - 1], b = points[points.length - 2];
      const ang = Math.atan2(a.y - b.y, a.x - b.x);
      const tri = new THREE.Mesh(new THREE.CircleGeometry(0.45, 3), mat);
      tri.rotation.x = -Math.PI / 2;
      tri.rotation.z = ang;
      tri.position.set(toX(a.x), 0.065, toZ(a.y));
      tri.renderOrder = 3;
      this.artGroup.add(tri);
    }
  }

  drawPlayArt(sim, team) {
    this.clearArt();
    if (!sim || sim.kind !== 'scrimmage' || sim.phase !== 'presnap') return;
    if (team === sim.offIdx) {
      const reads = sim.offPlay.reads || [];
      for (const e of sim.off) {
        const t = e.task;
        if (!t) continue;
        if (t.kind === 'route' || t.kind === 'pafake') {
          const key = t.key;
          if (!key) continue;
          const route = buildRoute(sim, e, key, {});
          if (!route) continue;
          let pts = [{ x: e.x, y: e.y }, ...route.pts];
          if (!route.sit && pts.length >= 2) { // trim long continuations
            const last = pts[pts.length - 1], prev = pts[pts.length - 2];
            const d = Math.hypot(last.x - prev.x, last.y - prev.y);
            if (d > 12) pts[pts.length - 1] = { x: prev.x + (last.x - prev.x) * 12 / d, y: prev.y + (last.y - prev.y) * 12 / d };
          }
          const primary = reads[0] === e.tag;
          const col = e.hot ? 0x5cff7a : primary ? 0xffd21f : 0xffffff;
          this.ribbon(pts, col);
        } else if (t.kind === 'runpath' && sim.run) {
          const hole = sim.field(2, sim.run.aimL);
          const mesh = sim.field(-3.5, sim.run.aimL * 0.3);
          this.ribbon([{ x: e.x, y: e.y }, mesh, hole, sim.field(6, sim.run.aimL * 1.1)], 0xff9f1c, 0.3);
        } else if (t.kind === 'passblock' || t.kind === 'runblock' || t.kind === 'stalk' || t.kind === 'lead' || t.kind === 'pull') {
          const ahead = sim.field(sim.frame(e.x, e.y).f + (t.kind === 'passblock' ? -1.2 : 1.6), sim.frame(e.x, e.y).l + (t.kind === 'pull' ? (t.toL - sim.frame(e.x, e.y).l) : 0));
          this.ribbon([{ x: e.x, y: e.y }, ahead], 0xe74c3c, 0.16, false);
        }
      }
    } else {
      const nums = numberReceivers(sim.off, sim.losX, sim.ballY0, sim.dir);
      for (const d of sim.def) {
        const a = d.assign;
        if (a.t === 'zone') {
          const zs = zoneSpec(a.zone, nums.strong);
          const lm = zoneLandmark(zs, sim.losX, sim.ballY0, sim.dir);
          const col = zs.deep ? 0x3a7bff : zs.base === 'flat' ? 0x1ec8e8 : zs.base === 'curl' ? 0xb15cff : 0xffd21f;
          const ell = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, depthWrite: false }));
          ell.rotation.x = -Math.PI / 2;
          ell.scale.set(zs.rf * 0.55, zs.rx * 0.55, 1);
          ell.position.set(toX(lm.x), 0.05, toZ(lm.y));
          ell.renderOrder = 2;
          this.artGroup.add(ell);
          this.ribbon([{ x: d.x, y: d.y }, lm], col, 0.14, true);
        } else if (a.t === 'man') {
          const tgt = d.manTarget || resolveManTarget(a.target, nums);
          if (tgt) this.ribbon([{ x: d.x, y: d.y }, { x: tgt.x, y: tgt.y }], 0xff5252, 0.12, false);
        } else if (a.t === 'blitz' || a.t === 'rush') {
          const p = sim.field(-3, sim.frame(d.x, d.y).l * 0.7);
          this.ribbon([{ x: d.x, y: d.y }, p], a.t === 'blitz' ? 0xff3b30 : 0xff8a65, 0.2, true);
        }
      }
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt, game, view) {
    const sim = view.replay ? view.replay.sim : game.sim;
    if (sim && sim !== this.boundSim) this.bindPlay(sim);
    if (sim) {
      if (view.replay) this.applyReplayFrame(sim, view.replay, dt);
      else this.syncEntities(sim, dt);
      this.syncBall(sim, view.replay);
    }
    // Lines
    const showLines = !!(game && sim && sim.kind === 'scrimmage' && !view.replay);
    this.lines.los.visible = showLines;
    this.lines.first.visible = showLines && !game.conversion && game.lineToGain !== undefined;
    if (showLines) {
      this.lines.los.position.x = toX(sim.losX);
      this.lines.first.position.x = toX(game.lineToGain);
    }
    // User rings
    const rings = [this.ring, this.ring2];
    let ri = 0;
    for (const t of [0, 1]) {
      const r = rings[ri];
      const u = sim && !view.replay ? sim.userEnt[t] : null;
      if (u && game.controllers[t]) {
        r.visible = true;
        r.position.set(toX(u.x), 0.04, toZ(u.y));
        r.material.color.set(game.controllers[t].color || (t === 0 ? 0x2fd5ff : 0xff7a2f));
        ri++;
      }
    }
    for (let i = ri; i < 2; i++) rings[i].visible = false;
    // Wind ribbons + weather
    this.updateWeather(dt, game);
    this.updateCamera(dt, game, sim, view);
    if (this.sun) {
      this.sun.position.set(this.camLook.x - 30, 70, this.camLook.z + 25);
      this.sun.target.position.copy(this.camLook);
    }
    this.r.render(this.scene, this.camera);
  }

  syncEntities(sim, dt) {
    for (const e of sim.ents) {
      const m = this.modelFor(e);
      m.root.position.set(toX(e.x), 0, toZ(e.y));
      m.root.rotation.y = Math.PI / 2 - e.face;
      let anim = e.anim;
      const sp = e.speed;
      if ((anim === 'run' || anim === 'carry') && sp < 0.4) anim = e.hasBall ? 'idle' : 'idle';
      if (e.state === 'down') anim = 'down';
      else if (e.state === 'falling') anim = anim === 'tackle' || anim === 'dive' ? anim : 'fall';
      m.animate(anim, sp, dt);
    }
  }

  applyReplayFrame(sim, rp, dt) {
    const f = sim.frames[Math.min(sim.frames.length - 1, Math.floor(rp.idx))];
    if (!f) return;
    let i = 0;
    for (const e of sim.ents) {
      const m = this.modelFor(e);
      const x = f[i++], y = f[i++], face = f[i++], anim = ANIM_LIST[f[i++]] || 'idle', sp = f[i++];
      m.root.position.set(toX(x), 0, toZ(y));
      m.root.rotation.y = Math.PI / 2 - face;
      m.animate(anim === 'run' && sp < 0.4 ? 'idle' : anim, sp, dt * rp.speed);
    }
    rp.ball = { x: f[i++], y: f[i++], z: f[i++], held: f[i++] };
  }

  syncBall(sim, rp) {
    const b = rp && rp.ball ? rp.ball : sim.ball;
    const bm = this.ballModel;
    bm.position.set(toX(b.x), Math.max(0.1, b.z), toZ(b.y));
    if (!rp && (b.state === 'air' || b.state === 'kick')) {
      const yaw = Math.atan2(b.vy, b.vx);
      bm.rotation.set(0, -yaw, 0);
      if (b.state === 'kick' && sim.kind !== 'fg' && sim.kind !== 'xp' && !b.pitch) bm.rotation.z = (b.spin || 0) * 2;
      else { bm.rotation.z = Math.atan2(b.vz || 0, Math.hypot(b.vx, b.vy)); bm.rotateX((b.spin || 0) * 3); }
    } else if (!rp && b.carrier) {
      bm.rotation.set(0, -b.carrier.face, 0.4);
    } else if (!rp && (b.state === 'ground' || b.state === 'placed')) {
      bm.rotation.set(0, sim.dir > 0 ? 0 : Math.PI, b.state === 'placed' ? Math.PI / 2 : 0);
    }
  }

  updateWeather(dt, game) {
    if (!this.weatherFx) return;
    const { pos, kind, obj } = this.weatherFx;
    const n = pos.length / 3;
    const fall = kind === 'rain' ? 22 : 2.5;
    const wind = game ? game.weather.wind * 0.1 : 0;
    for (let i = 0; i < n; i++) {
      pos[i * 3 + 1] -= fall * dt;
      pos[i * 3] += wind * dt * (kind === 'snow' ? 1 : 0.3) + (kind === 'snow' ? Math.sin(i + pos[i * 3 + 1]) * dt * 0.5 : 0);
      if (pos[i * 3 + 1] < 0) { pos[i * 3 + 1] = 30; pos[i * 3] = (Math.random() - 0.5) * 80; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    }
    obj.geometry.attributes.position.needsUpdate = true;
    obj.position.set(this.camLook.x, 0, this.camLook.z);
  }

  // ------------------------------------------------------------------ camera
  updateCamera(dt, game, sim, view) {
    const cfg = CAM[view.camMode || this.camMode] || CAM.standard;
    let fx, fy, dir = view.camDir || 1, back = cfg.back, height = cfg.height, ahead = cfg.ahead;
    if (view.replay) {
      const b = view.replay.ball || { x: 60, y: MID_Y, z: 0 };
      const ang = view.replay.angle;
      const radius = view.replay.radius || 16;
      const target = new THREE.Vector3(toX(b.x), 1, toZ(b.y));
      const desired = new THREE.Vector3(target.x + Math.cos(ang) * radius, 7 + (view.replay.height || 0), target.z + Math.sin(ang) * radius);
      this.camPos.lerp(desired, 1 - Math.exp(-dt * 5));
      this.camLook.lerp(target, 1 - Math.exp(-dt * 6));
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      return;
    }
    if (!sim) {
      fx = 60; fy = MID_Y;
    } else if (sim.phase === 'presnap' || !sim.t) {
      const behindDefense = sim.kind === 'scrimmage' && dir !== sim.dir;
      fx = sim.losX + dir * (behindDefense ? -3 : 2); fy = sim.ballY0;
      if (behindDefense) { back += 2.5; height += 2.2; }
      if (sim.kind === 'kickoff' || sim.kind === 'onside') { back = 16; height = 11; ahead = 18; }
      if (sim.kind === 'punt') { ahead = 14; }
    } else {
      const b = sim.ball;
      fx = b.x; fy = b.y;
      if (b.state === 'air' && b.flight) {
        fx = b.x * 0.5 + b.flight.tx * 0.5; fy = b.y * 0.5 + b.flight.ty * 0.5;
        back += 3; height += 3;
      } else if (b.state === 'kick') {
        back += 6; height += 7;
        if (sim.landing) { fx = b.x * 0.6 + sim.landing.x * 0.4; fy = b.y * 0.6 + sim.landing.y * 0.4; }
      }
      // Kick returns: swing behind the returner
      if (sim.kind !== 'scrimmage' && sim.carrier && sim.carrier.team === sim.recvTeam && view.followReturn) dir = sim.attackDir(sim.carrier.team);
      else if (sim.kind === 'scrimmage' && sim.carrier && sim.carrier.team !== sim.offIdx && view.followReturn) dir = sim.attackDir(sim.carrier.team);
    }
    // Smooth focus
    if (!this.camFocus) this.camFocus = { x: fx, y: fy, dir };
    const kf = 1 - Math.exp(-dt * (sim && sim.phase !== 'presnap' ? 5 : 3));
    this.camFocus.x += (fx - this.camFocus.x) * kf;
    this.camFocus.y += (fy - this.camFocus.y) * kf;
    this.camFocus.dir += (dir - this.camFocus.dir) * (1 - Math.exp(-dt * 2.2));
    const cd = this.camFocus.dir;
    // When the direction is mid-swing, orbit around the side instead of passing through the focus.
    const side = Math.sqrt(Math.max(0, 1 - cd * cd));
    const yFollow = MID_Y + (this.camFocus.y - MID_Y) * 0.82;
    const desired = new THREE.Vector3(toX(this.camFocus.x - cd * back), height, toZ(yFollow + side * back));
    const look = new THREE.Vector3(toX(this.camFocus.x + cd * ahead), 0.5, toZ(MID_Y + (this.camFocus.y - MID_Y) * 0.92));
    const kp = 1 - Math.exp(-dt * 6);
    this.camPos.lerp(desired, kp);
    this.camLook.lerp(look, kp);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  snapCamera() { this.camFocus = null; }

  // Project a field point (x, y, height) to screen pixels.
  project(x, y, h = 0) {
    const v = new THREE.Vector3(toX(x), h, toZ(y));
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, visible: v.z < 1 && v.z > -1 };
  }
}
