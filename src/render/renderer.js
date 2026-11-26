// Three.js renderer: syncs the simulation to 3D models and drives the camera.
import * as THREE from 'three';
import { FIELD_WIDTH, MID_Y } from '../core/constants.js';
import { clamp } from '../core/util.js';
import { buildField, toX, toZ } from './field.js';
import { buildStadium, paintBoard } from './stadium.js';
import { Sideline } from './sideline.js';
import { PlayerModel, TeamLook, makeRing, makeBall } from './player.js';
import { createPost, buildEnvironment, makeBlobShadows } from './post.js';
import { ANIM_LIST } from '../sim/play.js';
import { buildRoute } from '../sim/play.js';
import { zoneSpec, zoneLandmark, numberReceivers, resolveManTarget } from '../sim/align.js';

const CAM = {
  standard: { back: 13.5, height: 8.6, ahead: 9 },
  zoom: { back: 9.5, height: 5.6, ahead: 7 },
  wide: { back: 21, height: 15, ahead: 11 },
  high: { back: 6, height: 28, ahead: 2 },
};

// Free the GPU memory held by a subtree that is no longer drawn (a previous game's
// stadium, sideline and weather, or a team's uniforms). three.js re-uploads anything
// disposed here if it is ever drawn again, so shared cached resources stay safe.
function disposeTree(root, geometries = true) {
  const seen = new Set();
  const tex = (v) => { if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } };
  root.traverse((o) => {
    if (geometries && o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    if (geometries && o.isInstancedMesh) o.dispose();
    if (o.isLight && o.dispose) o.dispose(); // frees a shadow-casting light's shadow map
    const mats = !o.material ? [] : Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const k of Object.keys(m)) tex(m[k]);
      if (m.uniforms) for (const k of Object.keys(m.uniforms)) tex(m.uniforms[k] && m.uniforms[k].value);
      m.dispose();
    }
  });
}

export class Renderer {
  constructor(container, settings = {}) {
    this.container = container;
    this.settings = settings;
    const quality = settings.graphics || 'auto';
    this.quality = quality;
    // No canvas MSAA: medium/high/auto anti-alias inside the post chain's own multisampled
    // HDR target (cheaper than also multisampling the backbuffer), low skips it entirely.
    this.r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    // Resolution: fixed per quality level, or adaptive ('auto') to hold a smooth frame rate.
    this.resScale = 1;
    this.fps = 60; this.fpsAcc = 0; this.fpsN = 0; this.slowT = 0; this.fastT = 0; this.autoDrop = 0;
    this.setQuality(quality, true);
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.05;
    this.r.shadowMap.enabled = quality !== 'low';
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.r.domElement);
    this.r.domElement.className = 'game-canvas';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.3, 1600);
    this.blobs = makeBlobShadows(this.scene);
    this.post = null;
    this.camPos = new THREE.Vector3(-20, 12, 0);
    this.camLook = new THREE.Vector3(0, 0, 0);
    this.models = new Map();
    this.looks = [null, null];
    this.ballModel = makeBall();
    this.scene.add(this.ballModel);
    this.ring = makeRing(0x2fd5ff);
    this.ring2 = makeRing(0xff7a2f);
    this.scene.add(this.ring, this.ring2);
    // Where a pass will come down (shown to a human playing the ball or the catch)
    this.landRing = makeRing(0xfff1a8);
    this.landRing.visible = false;
    this.scene.add(this.landRing);
    this.lines = this.makeLines();
    this.artGroup = new THREE.Group();
    this.scene.add(this.artGroup);
    // Ball trail for passes and kicks
    this.trailN = 36;
    this.trailPos = new Float32Array(this.trailN * 3);
    this.trailCol = new Float32Array(this.trailN * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 3));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false }));
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    this.scene.add(this.trail);
    this.trailPts = [];
    this.weatherFx = null;
    this.camMode = settings.camera || 'standard';
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q, init = false) {
    const dpr = window.devicePixelRatio || 1;
    this.quality = q;
    this.autoQ = q === 'auto';
    this.autoDrop = 0;
    this.baseRatio = q === 'low' ? 1 : q === 'high' ? Math.min(dpr, 2) : q === 'auto' ? Math.min(dpr, 1.5) : Math.min(dpr, 1.25);
    this.resScale = 1;
    this.r.setPixelRatio(this.baseRatio);
    const shadows = q !== 'low';
    if (this.r.shadowMap.enabled !== shadows) {
      this.r.shadowMap.enabled = shadows;
      if (!init && this.scene) this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    }
    if (!init) { this.rebuildPost(); this.resize(); }
  }

  // Effects chain for medium/high/auto (low renders straight to the screen).
  rebuildPost() {
    if (this.post) {
      for (const p of this.post.composer.passes) if (p.dispose) p.dispose();
      this.post.composer.dispose();
      this.post = null;
    }
    if (!this.scene) return;
    const q = this.quality === 'auto' ? 'medium' : this.quality;
    this.postNight = !!this.night;
    this.post = createPost(this.r, this.scene, this.camera, q, this.postNight);
    if (this.post && this.autoDrop >= 1) this.post.bloom.enabled = false;
    if (this.post && this.w) { this.post.composer.setPixelRatio(this.r.getPixelRatio()); this.post.composer.setSize(this.w, this.h); }
  }

  // Frame-rate tracking; in 'auto' mode the render resolution steps down when frames
  // run slow and back up when there is headroom.
  trackFrame(dt) {
    this.fpsAcc += this.rawDt || dt; this.fpsN++;
    if (this.fpsAcc < 0.5) return;
    this.fps = this.fpsN / this.fpsAcc;
    this.fpsAcc = 0; this.fpsN = 0;
    if (!this.autoQ || document.hidden) return;
    this.slowT = this.fps < 45 ? this.slowT + 0.5 : 0;
    this.fastT = this.fps > 57 ? this.fastT + 0.5 : 0;
    if (this.slowT >= 2 && this.resScale > 0.55) { this.resScale = Math.max(0.55, this.resScale - 0.15); this.slowT = 0; this.applyScale(); }
    else if (this.slowT >= 4 && this.autoDrop < 2) { this.autoDrop++; this.slowT = 0; this.applyDrop(); }
    else if (this.fastT >= 10 && this.resScale < 1) { this.resScale = Math.min(1, this.resScale + 0.1); this.fastT = 0; this.applyScale(); }
  }

  // Still slow at the lowest resolution: shed the costliest effects (bloom, then the
  // shadow map; the soft contact shadows under players stay on).
  applyDrop() {
    if (this.autoDrop >= 1 && this.post) this.post.bloom.enabled = false;
    if (this.autoDrop >= 2 && this.r.shadowMap.enabled) {
      this.r.shadowMap.enabled = false;
      this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    }
  }

  applyScale() { this.r.setPixelRatio(Math.max(0.5, this.baseRatio * this.resScale)); this.resize(); }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.r.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
    if (this.post) { this.post.composer.setPixelRatio(this.r.getPixelRatio()); this.post.composer.setSize(w, h); }
  }

  setupGame(game) {
    // Clear the previous stadium and free its GPU memory
    if (this.world) { this.scene.remove(this.world); disposeTree(this.world); }
    this.world = new THREE.Group();
    this.scene.add(this.world);
    const home = game.teams[0].def, away = game.teams[1].def;
    const wx = game.weather.label || game.weather.kind;
    const night = game.settings.time === 'night';
    this.night = night;
    const holder = { add: (o) => this.world.add(o) };
    this.fieldInfo = buildField(holder, home, { weather: game.weather.kind, hi: this.quality === 'high', aniso: this.r.capabilities.getMaxAnisotropy() });
    this.stadium = buildStadium(holder, home, away, { night, lite: this.quality === 'low' });
    this.sideline = new Sideline(holder, home, away);
    this.boardT = 0;
    this.boardFlash = null;
    this.game = game;
    // Lighting: image-based light from a procedural stadium probe (reflections + bounce)
    // plus a key light that casts the shadows (the sun, or the light banks at night).
    if (this.envTex) this.envTex.dispose();
    this.envTex = buildEnvironment(this.r, night);
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = night ? 0.8 : 0.95;
    this.r.toneMappingExposure = night ? 1.0 : 0.9;
    const hemi = new THREE.HemisphereLight(night ? 0x8899bb : 0xcfe3ff, 0x2a4a22, night ? 0.22 : 0.3);
    this.world.add(hemi);
    const sun = new THREE.DirectionalLight(night ? 0xfff6e8 : 0xfff1d8, night ? 2.3 : 2.7);
    sun.position.set(-30, 70, 25);
    sun.castShadow = this.quality !== 'low';
    const sm = this.quality === 'high' ? 4096 : 2048;
    sun.shadow.mapSize.set(sm, sm);
    const sc = sun.shadow.camera;
    sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 10; sc.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.sun = sun;
    this.world.add(sun);
    this.world.add(sun.target);
    if (night) {
      // Second light bank from the far side: the classic multi-shadow night-game look.
      const bank = new THREE.DirectionalLight(0xe8f0ff, 0.9);
      bank.position.set(35, 60, -30);
      this.world.add(bank);
    }
    this.scene.fog = wx === 'snow' ? new THREE.Fog(0xcfd6e0, 30, 160) : wx === 'rain' ? new THREE.Fog(0x7d8790, 40, 220) : new THREE.Fog(night ? 0x0b1020 : 0xb8cde0, 250, 900);
    // Previous uniforms: free materials and number textures (geometry is cached and shared)
    for (const m of this.models.values()) { this.scene.remove(m.root); disposeTree(m.root, false); }
    this.models.clear();
    this.looks = [new TeamLook(home, true), new TeamLook(away, false)];
    this.setupWeather(wx);
    if (!this.post || this.postNight !== night) this.rebuildPost();
  }

  setupWeather(kind) {
    if (this.weatherFx) { this.scene.remove(this.weatherFx.obj); disposeTree(this.weatherFx.obj); this.weatherFx = null; }
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
      const id = p.id;
      const skill = ['QB', 'HB', 'WR', 'CB', 'FS', 'SS', 'TE'].includes(p.pos);
      m = new PlayerModel(this.looks[e.team], p.num, {
        skin: id % 7,
        size: clamp((p.ht || 74) / 74, 0.9, 1.12),
        bulk: Math.round(clamp(0.85 + ((p.wt || 220) - 190) / 300, 0.85, 1.28) * 50) / 50, // stepped: shared cached body meshes
        visor: id % 5 === 0 || (skill && id % 3 === 1),
        sleeves: id % 3 === 0,
        towel: skill && id % 4 === 1,
      });
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
      else this.syncEntities(sim, dt, view.alpha ?? 1);
      this.syncBall(sim, view.replay, view.alpha ?? 1);
    }
    this.updateTrail(sim, view);
    if (this.sideline) this.sideline.update(dt, game);
    if (this.stadium && game) {
      this.boardT -= dt;
      if (this.boardFlash) { this.boardFlash.t -= dt; if (this.boardFlash.t <= 0) { this.boardFlash = null; this.boardT = 0; } }
      if (this.boardT <= 0) { this.boardT = 0.5; for (const b of this.stadium.boards) paintBoard(b, game, this.boardFlash); }
      // Crowd bounces with excitement
      const ex = view.excite || 0;
      const tt = performance.now() / 1000;
      const st = this.stadium;
      if (st.crowdMat) { st.crowdMat.uniforms.uTime.value = tt; st.crowdMat.uniforms.uExcite.value = ex; st.crowdMat.uniforms.uCut.value = this.post ? 0.02 : 0.5; }
      for (const rt of st.ribbons || []) rt.offset.x = (rt.offset.x + dt * 0.02) % 1;
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
    const fl = sim && sim.thrown && sim.ball.state === 'air' && sim.ball.flight && !sim.ball.pitch && sim.ball.flight.type !== 'away' && !sim.ball.flight.resolved ? sim.ball.flight : null;
    if (fl && view.userTeam !== null && view.userTeam !== undefined && sim.kind === 'scrimmage') {
      this.landRing.visible = true;
      this.landRing.position.set(toX(fl.tx), 0.05, toZ(fl.ty));
      this.landRing.scale.setScalar(1.1 + 0.18 * Math.sin(performance.now() / 85));
    } else this.landRing.visible = false;
    // Wind ribbons + weather
    this.updateWeather(dt, game);
    this.updateCamera(dt, game, sim, view);
    if (this.sun) {
      this.sun.position.set(this.camLook.x - 30, 70, this.camLook.z + 25);
      this.sun.target.position.copy(this.camLook);
    }
    this.updateBlobs(sim, view);
    if (this.post) this.post.composer.render(dt);
    else this.r.render(this.scene, this.camera);
    this.trackFrame(dt);
  }

  // Contact shadows under every visible player, and a small one under a ball in flight.
  updateBlobs(sim) {
    const im = this.blobs;
    if (!im) return;
    const mtx = this._blobM || (this._blobM = new THREE.Matrix4());
    const q = this._blobQ || (this._blobQ = new THREE.Quaternion());
    const pos = this._blobP || (this._blobP = new THREE.Vector3());
    const scl = this._blobS || (this._blobS = new THREE.Vector3());
    let n = 0;
    if (sim) {
      for (const m of this.models.values()) {
        if (!m.root.visible) continue;
        const down = m.lastAnim === 'down' || m.lastAnim === 'fall' || m.lastAnim === 'dive';
        const k = (m.root.scale.x || 1) * (down ? 1.75 : 1.2);
        pos.set(m.root.position.x, 0.03, m.root.position.z);
        scl.set(k, 1, down ? k * 0.75 : k);
        mtx.compose(pos, q, scl);
        im.setMatrixAt(n++, mtx);
        if (n >= 63) break;
      }
      const b = this.ballModel;
      if (b && b.visible && b.position.y > 0.6 && n < 64) {
        const k = Math.max(0.25, 0.7 - b.position.y * 0.02);
        pos.set(b.position.x, 0.03, b.position.z);
        scl.set(k, 1, k);
        mtx.compose(pos, q, scl);
        im.setMatrixAt(n++, mtx);
      }
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
  }

  syncEntities(sim, dt, alpha = 1) {
    for (const e of sim.ents) {
      const m = this.modelFor(e);
      // Interpolate between the last two simulation steps for smooth motion.
      const x = e.px !== undefined ? e.px + (e.x - e.px) * alpha : e.x;
      const y = e.py !== undefined ? e.py + (e.y - e.py) * alpha : e.y;
      let face = e.face;
      if (e.pface !== undefined) {
        let d = e.face - e.pface;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        face = e.pface + d * alpha;
      }
      m.root.position.set(toX(x), 0, toZ(y));
      m.root.rotation.y = Math.PI / 2 - face;
      let dFace = m.lastFace === undefined ? 0 : face - m.lastFace;
      while (dFace > Math.PI) dFace -= Math.PI * 2;
      while (dFace < -Math.PI) dFace += Math.PI * 2;
      m.lastFace = face;
      m.turnRate = (m.turnRate || 0) * 0.82 + (dt > 0 ? dFace / dt : 0) * 0.18;
      let anim = e.anim;
      const sp = e.speed;
      if (e.state === 'down') anim = 'down';
      else if (e.state === 'falling') anim = anim === 'tackle' || anim === 'dive' ? anim : 'fall';
      if ((anim === 'fall' || anim === 'down') && !m.fallSet) {
        // Remember which way this player went down (backward if pushed opposite his facing).
        const fx = Math.cos(e.face), fy = Math.sin(e.face);
        const vs = Math.hypot(e.vx, e.vy) || 1;
        m.fallBack = (e.vx * fx + e.vy * fy) / vs < -0.3;
        m.fallSide = Math.max(-1, Math.min(1, (fx * e.vy - fy * e.vx) / vs));
        m.fallSet = true;
      } else if (anim !== 'fall' && anim !== 'down') m.fallSet = false;
      m.animate(anim, sp, dt, { turnRate: m.turnRate, fallBack: m.fallBack, fallSide: m.fallSide, windup: e.windup });
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
      m.animate(anim, sp, dt * rp.speed, { turnRate: 0, fallBack: m.fallBack, fallSide: m.fallSide });
    }
    rp.ball = { x: f[i++], y: f[i++], z: f[i++], held: f[i++] };
  }

  syncBall(sim, rp, alpha = 1) {
    const b = rp && rp.ball ? rp.ball : sim.ball;
    const bm = this.ballModel;
    const ia = !rp && b.px !== undefined ? alpha : 1;
    const bx = ia < 1 ? b.px + (b.x - b.px) * ia : b.x;
    const by = ia < 1 ? b.py + (b.y - b.py) * ia : b.y;
    const bz = ia < 1 ? b.pz + (b.z - b.pz) * ia : b.z;
    bm.position.set(toX(bx), Math.max(0.1, bz), toZ(by));
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

  updateTrail(sim, view) {
    const b = sim && !view.replay ? sim.ball : null;
    const flying = b && (b.state === 'air' || b.state === 'kick') && !b.pitch && !(sim.thrownAway);
    if (!flying) {
      if (this.trailPts.length) { this.trailPts.length = 0; this.trail.visible = false; }
      return;
    }
    this.trailPts.push([toX(b.x), Math.max(0.1, b.z), toZ(b.y)]);
    if (this.trailPts.length > this.trailN) this.trailPts.shift();
    const n = this.trailPts.length;
    for (let i = 0; i < this.trailN; i++) {
      const p = this.trailPts[Math.max(0, n - this.trailN + i)] || this.trailPts[n - 1];
      this.trailPos[i * 3] = p[0]; this.trailPos[i * 3 + 1] = p[1]; this.trailPos[i * 3 + 2] = p[2];
      const a = n >= this.trailN ? i / (this.trailN - 1) : Math.max(0, (i - (this.trailN - n)) / Math.max(1, n - 1));
      this.trailCol[i * 3] = 0.2 + a * 0.8; this.trailCol[i * 3 + 1] = 0.25 + a * 0.75; this.trailCol[i * 3 + 2] = 0.3 + a * 0.7;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.color.needsUpdate = true;
    this.trail.visible = n > 2;
  }

  flashBoard(text, color, team) {
    this.boardFlash = { text, color, t: 3.5 };
    this.boardT = 0;
    if (this.sideline && team !== undefined && team !== null) this.sideline.celebrate[team] = 4;
  }

  // ------------------------------------------------------------------ camera
  updateCamera(dt, game, sim, view) {
    const cfg = CAM[view.camMode || this.camMode] || CAM.standard;
    let fx, fy, dir = view.camDir || 1, back = cfg.back, height = cfg.height, ahead = cfg.ahead;
    if (view.intro) {
      // Pre-game flyover: sweep around the bowl and settle on the field.
      const u = Math.min(1, view.intro.t / view.intro.dur);
      const e = u * u * (3 - 2 * u);
      const ang = Math.PI * (1.15 + e * 0.85);
      const rad = 105 - e * 62;
      const hgt = 42 - e * 30;
      this.camera.position.set(Math.cos(ang) * rad, hgt, Math.sin(ang) * rad * 0.62);
      this.camera.lookAt(0, 2 + (1 - e) * 6, 0);
      this.camPos.copy(this.camera.position);
      this.camLook.set(0, 0, 0);
      return;
    }
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
      // Frame the whole formation: sit behind the quarterback (offense) or the
      // second level (defense), a little higher than the in-play view.
      fx = sim.losX + dir * (behindDefense ? -3 : -3.5); fy = sim.ballY0;
      back += 1.5; height += behindDefense ? 2.4 : 1.6;
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
    // Defense (Madden-style): sit high behind your defense with a wider lens and keep both
    // the ball and the defender you control in the frame, so deep coverage never drops
    // out of view behind the camera.
    const ut = view.userTeam;
    const defView = !!(sim && sim.kind === 'scrimmage' && ut !== null && ut !== undefined && ut !== sim.offIdx && !(sim.carrier && sim.carrier.team === ut));
    let fovT = 46;
    if (defView && cfg !== CAM.high) {
      const u = sim.userEnt ? sim.userEnt[ut] : null;
      const sdir = sim.dir;
      const wide = cfg === CAM.wide ? 1.25 : cfg === CAM.zoom ? 0.82 : 1;
      if (sim.phase === 'presnap' || !sim.t) {
        fx = sim.losX + sdir * 5.5; fy = sim.ballY0;
        back = 20 * wide; height = 16 * wide; ahead = 4.5;
      } else {
        const b = sim.ball;
        let bx = b.x, by = b.y;
        if (b.state === 'air' && b.flight) { bx = b.x * 0.35 + b.flight.tx * 0.65; by = b.y * 0.35 + b.flight.ty * 0.65; }
        let spread = 0;
        if (u && u.isActive()) {
          fx = bx * 0.55 + u.x * 0.45; fy = by * 0.6 + u.y * 0.4;
          spread = Math.hypot(bx - u.x, (by - u.y) * 0.6);
        } else { fx = bx; fy = by; }
        // Never let the focus drift into the offensive backfield past the line early in the play.
        if ((fx - sim.losX) * sdir < 2 && !sim.carrier) fx = fx * 0.5 + (sim.losX + sdir * 2) * 0.5;
        back = Math.min(26, 17.5 + spread * 0.3) * wide; height = Math.min(17, 12.5 + spread * 0.16) * wide; ahead = 3.5;
      }
      fovT = 54;
    }
    if (Math.abs(this.camera.fov - fovT) > 0.05) { this.camera.fov += (fovT - this.camera.fov) * (1 - Math.exp(-dt * 3)); this.camera.updateProjectionMatrix(); }
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
