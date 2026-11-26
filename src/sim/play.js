// PlaySim: simulates a single down (or kick) tick by tick.
import { FIELD_WIDTH, GOAL_LINE_E, GOAL_LINE_W, DT, BALL_CARRY_HEIGHT } from '../core/constants.js';
import { clamp, dist } from '../core/util.js';
import { Entity } from './entity.js';
import { OFF_FORMATIONS, DEF_FORMATIONS } from '../data/formations.js';
import { alignOffense, alignDefense, toField, toFrame, parseAssign, numberReceivers } from './align.js';
import { ROUTES } from '../data/routes.js';
import { updateOffense, setupOffenseTasks } from './ai_offense.js';
import { updateDefense, setupDefenseTasks } from './ai_defense.js';
import { updateEngagements, resolveTackles, separate } from './contact.js';
import { updateBall, updatePendingThrow } from './passing.js';
import { updateUser } from './user.js';
import { setupKick, updateKickRoles } from './kicking.js';

const ROLE_OF = { QB: 'QB', HB: 'RB', FB: 'FB', WR: 'WR', TE: 'TE', OT: 'OL', OG: 'OL', C: 'OL', DE: 'DL', DT: 'DL', OLB: 'LB', MLB: 'LB', CB: 'CB', FS: 'S', SS: 'S', K: 'K', P: 'P' };

export function rosterPick(team, pos, idx, used) {
  const ids = team.depth[pos] || [];
  for (let i = idx; i < ids.length; i++) {
    const p = team.byId.get(ids[i]);
    if (p && !used.has(p.id) && !p.injured) return p;
  }
  // Fallbacks for thin positions
  const alt = { FB: ['TE', 'HB'], TE: ['OT', 'WR'], WR: ['CB', 'HB', 'TE'], HB: ['FB', 'WR'], CB: ['FS', 'SS', 'WR'], FS: ['SS', 'CB'], SS: ['FS', 'CB'], DT: ['DE'], DE: ['OLB', 'DT'], OLB: ['MLB', 'DE'], MLB: ['OLB'], OT: ['OG'], OG: ['C', 'OT'], C: ['OG'], QB: ['HB'], K: ['P'], P: ['K'] }[pos] || [];
  for (const a of alt) {
    for (const id of team.depth[a] || []) {
      const p = team.byId.get(id);
      if (p && !used.has(p.id) && !p.injured) return p;
    }
  }
  for (const p of team.players) if (!used.has(p.id)) return p;
  return team.players[0];
}

export class PlaySim {
  constructor(cfg) {
    this.cfg = cfg;
    this.game = cfg.game;
    this.rng = cfg.rng;
    this.kind = cfg.kind || 'scrimmage';
    this.offIdx = cfg.offIdx;
    this.defIdx = 1 - cfg.offIdx;
    this.teams = cfg.teams; // [teamState0, teamState1]
    this.dir = cfg.dir;
    this.losX = cfg.ballX;
    this.ballY0 = cfg.ballY;
    this.controllers = cfg.controllers || [null, null];
    this.difficulty = cfg.difficulty ?? 1;
    this.weather = cfg.weather || { kind: 'clear', wind: 0, windDir: 0 };
    this.t = 0;
    this.phase = 'presnap';
    this.dead = false;
    this.deadT = 0;
    this.result = null;
    this.ents = [];
    this.events = [];
    this.flags = [];
    this.frames = [];
    this.userEnt = [null, null];
    this.possession = this.offIdx;
    this.carrier = null;
    this.qb = null;
    this.passer = null;
    this.target = null;
    this.thrown = false;
    this.handedOff = false;
    this.runRecognized = false;
    this.passRecognized = false;
    this.lastTouchTeam = this.offIdx;
    this.firstDownX = cfg.firstDownX ?? null;
    this.lineToGain = cfg.firstDownX;
    this.ball = { x: cfg.ballX, y: cfg.ballY, z: 0.15, vx: 0, vy: 0, vz: 0, state: 'ground', carrier: null, spin: 0, tumble: 0, flight: null };
    this.weatherSpeed = this.weather.kind === 'snow' ? 0.93 : this.weather.kind === 'rain' ? 0.97 : 1;
    this.offPlay = cfg.offPlay;
    this.defPlay = cfg.defPlay;
    this.flip = !!cfg.flip;
    this.stats = { passer: null, receiver: null, rusher: null, tacklers: [], sackBy: null, intBy: null, fumbleBy: null, recoveredBy: null, airYards: 0 };
    this.presnapT = 0;
    this.hotRoutes = {};
    this.motion = null;
    this.protection = 'normal';
    if (this.kind === 'scrimmage') this.setupScrimmage();
    else setupKick(this);
    this.pickDefaultUsers();
  }

  get offTeam() { return this.teams[this.offIdx]; }
  get defTeam() { return this.teams[this.defIdx]; }

  // Coach mode: the human calls the plays, the CPU plays them out.
  isUser(team) { return !!this.controllers[team] && !(this.game && this.game.isCoach && this.game.isCoach(team)); }
  ctl(team) { return this.isUser(team) ? this.controllers[team] : null; }

  addEnt(player, team, side, tag, role, f, l) {
    const e = new Entity(player, team, side, tag, role);
    const p = toField(this.losX, this.ballY0, this.dir, f, l);
    e.x = p.x; e.y = p.y;
    e.face = side === 'O' ? (this.dir > 0 ? 0 : Math.PI) : (this.dir > 0 ? Math.PI : 0);
    this.ents.push(e);
    return e;
  }

  setupScrimmage() {
    const form = OFF_FORMATIONS[this.offPlay.form];
    const dform = DEF_FORMATIONS[this.defPlay.form];
    const usedO = new Set(), usedD = new Set();
    const al = alignOffense(form, this.ballY0, this.dir, this.flip);
    this.off = [];
    for (const a of al) {
      const p = rosterPick(this.offTeam, a.slot.pos[0], a.slot.pos[1], usedO);
      usedO.add(p.id);
      let role = ROLE_OF[a.slot.pos[0]] || 'WR';
      if (a.tag === 'QB') role = 'QB';
      const e = this.addEnt(p, this.offIdx, 'O', a.tag, role, a.f, a.l);
      e.slot = a.slot;
      e.alignF = a.f; e.alignL = a.l;
      e.onLine = a.f > -1.0;
      e.anim = role === 'OL' ? 'stance3' : role === 'QB' ? (form.qb === 'center' ? 'qb_uc' : 'qb_gun') : (a.f > -1 ? 'stance3' : 'stance2');
      if (role === 'WR' || (role === 'TE' && Math.abs(a.l) > 5)) e.anim = 'stance2';
      if (role === 'QB') this.qb = e;
      if (a.tag === 'C') this.center = e;
      this.off.push(e);
    }
    this.def = [];
    for (const s of dform.slots) {
      const p = rosterPick(this.defTeam, s.pos[0], s.pos[1], usedD);
      usedD.add(p.id);
      const role = ROLE_OF[s.pos[0]] || 'LB';
      const e = this.addEnt(p, this.defIdx, 'D', s.tag, role, 5, 0);
      e.slot = s;
      e.assign = parseAssign(this.defPlay.assign[s.tag]);
      e.anim = role === 'DL' ? 'stance3' : 'stance2';
      this.def.push(e);
    }
    this.form = form;
    setupOffenseTasks(this);
    this.realignDefense(true);
    // Ball at the center's feet
    this.ball.state = 'ground';
    this.ball.x = this.losX; this.ball.y = this.ballY0; this.ball.z = 0.2;
  }

  // Press coverage: the call's default unless the user adjusted it pre-snap.
  pressOn() { return this.covAdj && typeof this.covAdj.press === 'boolean' ? this.covAdj.press : !!this.defPlay.press; }

  // Defensive hot route for one defender (pre-snap). str uses the playbook shorthand.
  setDefAssign(d, str, manEnt = null) {
    if (this.phase !== 'presnap' || !d || d.side !== 'D') return false;
    d.assign = parseAssign(str);
    d.hotMan = d.assign.t === 'man' ? manEnt : null;
    d.hotAssigned = true;
    this.realignDefense(false);
    return true;
  }

  setCoverageAdjust(key, value) {
    if (this.phase !== 'presnap') return false;
    this.covAdj = { ...(this.covAdj || {}), [key]: value };
    this.realignDefense(false);
    return true;
  }

  realignDefense(snapTo) {
    this.nums = alignDefense(this.def, this.off, this.losX, this.ballY0, this.dir, this.pressOn());
    for (const d of this.def) {
      if (d.presnapShift) { d.alignF += d.presnapShift.f || 0; d.alignL += d.presnapShift.l || 0; }
      const p = toField(this.losX, this.ballY0, this.dir, d.alignF, d.alignL);
      d.homeX = p.x; d.homeY = p.y;
      if (snapTo) { d.x = p.x; d.y = p.y; }
    }
  }

  pickDefaultUsers() {
    for (const team of [0, 1]) {
      if (!this.isUser(team)) continue;
      if (this.kind !== 'scrimmage') { this.userEnt[team] = null; continue; }
      if (team === this.offIdx) this.setUser(team, this.qb);
      else {
        // Default to the middle linebacker / deepest LB, like most football games.
        const pref = this.def.find((e) => e.tag === 'MLB') || this.def.find((e) => e.pos === 'LB') || this.def.find((e) => e.pos === 'S');
        this.setUser(team, pref);
      }
    }
  }

  setUser(team, ent) {
    const prev = this.userEnt[team];
    if (prev) prev.user = false;
    this.userEnt[team] = ent || null;
    if (ent) ent.user = true;
  }

  // ------------------------------------------------------------------ presnap
  presnapStep(dt) {
    this.presnapT += dt;
    // Motion man moves laterally; defense re-aligns gradually.
    if (this.motion && this.motion.active) {
      const e = this.motion.ent;
      const tgt = toField(this.losX, this.ballY0, this.dir, -1.5, this.motion.toL);
      const d = e.seek(tgt.x, tgt.y, 0.55, 0.8);
      e.anim = 'run';
      if (d < 0.25) { this.motion.active = false; e.alignL = this.motion.toL; e.alignF = -1.5; e.stop(); e.anim = 'stance2'; e.vx = 0; e.vy = 0; }
      e.integrate(dt);
      this.realignDefense(false);
    }
    for (const d of this.def) {
      if (d.user && this.ctl(d.team)) continue;
      const dd = d.seek(d.homeX, d.homeY, 0.35, 1.0);
      if (dd > 0.08) d.integrate(dt); else { d.vx = 0; d.vy = 0; }
    }
    // User-controlled defender may roam pre-snap.
    for (const team of [0, 1]) {
      const u = this.userEnt[team];
      const c = this.ctl(team);
      if (!u || !c || u.side !== 'D') continue;
      u.setDesired(c.mx * u.topSpeed * 0.45, c.my * u.topSpeed * 0.45);
      u.integrate(dt);
      // Can't line up in the neutral zone beyond the ball by much.
      // Lined up beyond the ball at the snap -> offside (getting back in time is legal)
      const fr = toFrame(this.losX, this.ballY0, this.dir, u.x, u.y);
      this.userOffside = fr.f < -0.6;
      u.y = clamp(u.y, 0.5, FIELD_WIDTH - 0.5);
      if (u.vx || u.vy) u.anim = 'run'; else u.anim = 'stance2';
    }
    this.recordFrame();
  }

  setMotion(ent, toL) {
    if (this.phase !== 'presnap' || !ent || ent.pos === 'OL' || ent.pos === 'QB') return false;
    this.motion = { ent, toL, active: true };
    return true;
  }

  setHotRoute(tag, routeKey) {
    const e = this.off.find((o) => o.tag === tag);
    if (!e || this.phase !== 'presnap' || !e.eligible) return false;
    this.hotRoutes[tag] = routeKey;
    e.task = routeKey === 'block' ? { kind: 'passblock' } : { kind: 'route', key: routeKey };
    e.hot = true;
    return true;
  }

  snap() {
    if (this.phase !== 'presnap') return;
    if (this.motion && this.motion.active) { this.motion.active = false; }
    this.phase = this.kind === 'scrimmage' ? 'snap' : this.phase === 'presnap' ? 'snap' : this.phase;
    this.t = 0;
    this.events.push({ t: 0, type: 'snap' });
    for (const e of this.ents) { e.state = 'run'; e.anim = e.pos === 'OL' || e.pos === 'DL' ? 'block' : 'run'; e.startX = e.x; e.startY = e.y; }
    if (this.kind === 'scrimmage') {
      // Finalise defensive targets from the alignment at the snap.
      this.nums = numberReceivers(this.off, this.losX, this.ballY0, this.dir);
      setupDefenseTasks(this);
      this.startOffenseAtSnap();
    } else {
      updateKickRoles(this, 0, true);
    }
  }

  startOffenseAtSnap() {
    const qb = this.qb;
    const gun = this.form.qb !== 'center';
    if (gun) {
      // Shotgun snap travels through the air to the QB.
      this.ball.state = 'snap';
      this.ball.flight = { sx: this.center.x, sy: this.center.y, sz: 0.4, tx: qb.x + this.dir * 0.3, ty: qb.y, tz: 1.2, T: 0.38, t: 0 };
      this.ball.x = this.center.x; this.ball.y = this.center.y;
    } else {
      this.giveBall(qb, false);
    }
    for (const e of this.off) {
      if (e.task && e.task.kind === 'route') e.route = buildRoute(this, e, e.task.key, e.task.opts);
    }
  }

  giveBall(e, isHandoff = true) {
    if (this.carrier) this.carrier.hasBall = false;
    this.carrier = e;
    e.hasBall = true;
    this.ball.state = 'held';
    this.ball.carrier = e;
    this.ball.flight = null;
    this.lastTouchTeam = e.team;
    if (e.team !== this.possession) {
      this.possession = e.team;
    }
    // Auto-switch user control to the ball carrier on that team.
    if (this.ctl(e.team) && (e !== this.qb || this.kind !== 'scrimmage' || isHandoff)) this.setUser(e.team, e);
    if (e === this.qb && this.ctl(e.team)) this.setUser(e.team, e);
  }

  // ------------------------------------------------------------------ main step
  step(dt = DT) {
    // Previous state for render interpolation
    for (const e of this.ents) { e.px = e.x; e.py = e.y; e.pface = e.face; }
    this.ball.px = this.ball.x; this.ball.py = this.ball.y; this.ball.pz = this.ball.z;
    if (this.dead) { this.deadT += dt; this.coastStep(dt); return; }
    if (this.phase === 'presnap') { this.presnapStep(dt); return; }
    this.t += dt;
    // Position history (used for defenders' reaction lag in man coverage)
    for (const e of this.ents) {
      if (!e.eligible && e !== this.carrier) continue;
      const h = e.hist || (e.hist = []);
      h.push({ x: e.x, y: e.y, vx: e.vx, vy: e.vy });
      if (h.length > 40) h.shift();
    }
    // Snap ball flight
    if (this.kind === 'scrimmage' && this.ball.state === 'snap') {
      const fl = this.ball.flight;
      fl.t += dt;
      const k = Math.min(1, fl.t / fl.T);
      this.ball.x = fl.sx + (fl.tx - fl.sx) * k;
      this.ball.y = fl.sy + (fl.ty - fl.sy) * k;
      this.ball.z = fl.sz + (fl.tz - fl.sz) * k + Math.sin(k * Math.PI) * 0.3;
      if (k >= 1) this.giveBall(this.qb, false);
    }
    for (const e of this.ents) e.faceTo = null;
    // Decide desired velocities
    if (this.kind === 'scrimmage') {
      for (const e of this.ents) {
        if (e.engaged || !e.isActive()) continue;
        if (e.user && this.ctl(e.team)) continue;
        if (e.side === 'O') updateOffense(this, e, dt); else updateDefense(this, e, dt);
      }
    } else {
      updateKickRoles(this, dt, false);
    }
    // User-controlled players
    for (const team of [0, 1]) {
      const u = this.userEnt[team];
      if (u && this.ctl(team)) updateUser(this, u, this.ctl(team), dt);
    }
    if (this.pendingThrow) updatePendingThrow(this);
    // Physics
    for (const e of this.ents) if (!e.engaged) e.integrate(dt, this.weatherSpeed);
    updateEngagements(this, dt);
    separate(this, dt);
    updateBall(this, dt);
    if (!this.dead) resolveTackles(this, dt);
    if (!this.dead) this.checkDeadBall();
    if (this.t > 40 && !this.dead) this.endPlay({ reason: 'timeout' });
    this.recordFrame();
  }

  // After the whistle players slow down and celebrate.
  coastStep(dt) {
    for (const e of this.ents) {
      if (e.state === 'down' || e.state === 'falling') { e.integrate(dt); continue; }
      e.desired.x *= 0.9; e.desired.y *= 0.9;
      if (this.result && this.result.td !== null && this.result.td !== undefined && e.team === this.result.td && dist(e.x, e.y, this.ball.x, this.ball.y) < 12) e.anim = 'celebrate';
      else if (e.speed < 0.5) e.anim = 'idle';
      e.integrate(dt);
    }
    if (this.ball.state === 'held' && this.ball.carrier) {
      const c = this.ball.carrier;
      this.ball.x = c.x; this.ball.y = c.y; this.ball.z = c.state === 'down' ? 0.3 : BALL_CARRY_HEIGHT;
    } else if (this.ball.state === 'air' || this.ball.state === 'loose') {
      // Incomplete pass keeps falling
      this.ball.vz -= 10.72 * dt;
      this.ball.x += this.ball.vx * dt; this.ball.y += this.ball.vy * dt; this.ball.z += this.ball.vz * dt;
      if (this.ball.z < 0.12) { this.ball.z = 0.12; this.ball.vz = -this.ball.vz * 0.3; this.ball.vx *= 0.5; this.ball.vy *= 0.5; }
    }
    this.recordFrame();
  }

  goalLineFor(team) {
    // The goal line team `team` is attacking.
    const attackDir = team === this.offIdx ? this.dir : -this.dir;
    return attackDir > 0 ? GOAL_LINE_E : GOAL_LINE_W;
  }
  attackDir(team) { return team === this.offIdx ? this.dir : -this.dir; }

  checkDeadBall() {
    const c = this.carrier;
    if (!c || this.ball.state !== 'held') return;
    // Out of bounds
    if (c.y < 0 || c.y > FIELD_WIDTH) {
      this.endPlay({ reason: 'oob', x: c.x, y: clamp(c.y, 0, FIELD_WIDTH) });
      return;
    }
    const ad = this.attackDir(c.team);
    const goal = this.goalLineFor(c.team);
    // Touchdown: ball crosses the plane in possession.
    if ((ad > 0 && c.x >= goal) || (ad < 0 && c.x <= goal)) {
      if (c.x > 120 || c.x < 0) { this.endPlay({ reason: 'oob_endzone', x: c.x, y: c.y }); return; }
      this.endPlay({ reason: 'td', x: c.x, y: c.y, td: c.team });
      return;
    }
    // Carrier down
    if (c.state === 'down' || (c.state === 'falling' && c.downT > 0.3)) {
      this.endPlay({ reason: 'tackle', x: c.x, y: c.y });
    }
  }

  endPlay(info) {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 0;
    this.phase = 'dead';
    this.events.push({ t: this.t, type: 'whistle', reason: info.reason });
    this.result = buildResult(this, info);
  }

  recordFrame() {
    // Store every other tick for instant replay.
    this._fc = (this._fc || 0) + 1;
    if (this._fc % 2) return;
    if (this.frames.length > 2400) return;
    const f = new Float32Array(this.ents.length * 5 + 4);
    let i = 0;
    for (const e of this.ents) { f[i++] = e.x; f[i++] = e.y; f[i++] = e.face; f[i++] = ANIM_CODES[e.anim] ?? 0; f[i++] = e.speed; }
    f[i++] = this.ball.x; f[i++] = this.ball.y; f[i++] = this.ball.z; f[i++] = this.ball.state === 'held' ? 1 : 0;
    this.frames.push(f);
  }

  spike() {
    const qb = this.qb;
    if (!qb || !qb.hasBall) return;
    qb.hasBall = false;
    this.carrier = null;
    this.thrown = true;
    this.playType = 'spike';
    const b = this.ball;
    b.state = 'air'; b.carrier = null;
    b.x = qb.x; b.y = qb.y; b.z = 1.5; b.vx = 0; b.vy = 0; b.vz = -8;
    b.flight = null;
    this.events.push({ t: this.t, type: 'spike' });
    this.endPlay({ reason: 'spike', x: this.losX, y: this.ballY0 });
  }

  // Helpers
  nearestEnt(x, y, filter) {
    let best = null, bd = Infinity;
    for (const e of this.ents) {
      if (!filter(e)) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  frame(x, y) { return toFrame(this.losX, this.ballY0, this.dir, x, y); }
  field(f, l) { return toField(this.losX, this.ballY0, this.dir, f, l); }
}

export const ANIM_LIST = ['idle', 'stance2', 'stance3', 'qb_uc', 'qb_gun', 'run', 'backpedal', 'block', 'throw', 'catch', 'carry', 'tackle', 'fall', 'down', 'celebrate', 'kneel', 'kick', 'juke', 'spin', 'stiff', 'truck', 'hurdle', 'dive', 'handoff', 'hold', 'shuffle', 'jump', 'swat'];
export const ANIM_CODES = Object.fromEntries(ANIM_LIST.map((a, i) => [a, i]));

// Build absolute route waypoints for a receiver.
export function buildRoute(sim, e, key, opts = {}) {
  const def = ROUTES[key];
  if (!def || def.block || def.runBlock) return null;
  const fr = sim.frame(e.x, e.y);
  let inside = -Math.sign(fr.l);
  if (Math.abs(fr.l) < 2.5) {
    // Backs release toward the side they are offset to; centred backs release
    // to the play side. "inside" always points opposite the release side.
    let release = opts.releaseSide || 0;
    if (!release) release = fr.l < -0.3 ? -1 : fr.l > 0.3 ? 1 : (sim.offPlay.side || 1) * (sim.flip ? -1 : 1);
    inside = -release;
  }
  const pts = def.pts.map(([d, i]) => {
    let f = fr.f + d;
    let l = fr.l + i * inside;
    const p = sim.field(f, l);
    p.y = clamp(p.y, 0.8, FIELD_WIDTH - 0.8);
    return p;
  });
  return { key, pts, idx: 0, sit: !!def.sit, pause: def.pause || null, delay: def.delay || 0, pauseT: 0, done: false, depthClass: def.depthClass };
}

function buildResult(sim, info) {
  const b = sim.ball;
  const r = {
    kind: sim.kind,
    reason: info.reason,
    endX: info.x ?? b.x,
    endY: info.y ?? b.y,
    possession: sim.possession,
    offIdx: sim.offIdx,
    turnover: sim.possession !== sim.offIdx,
    td: info.td ?? null,
    safety: null,
    touchback: !!info.touchback,
    incomplete: info.reason === 'incomplete' || info.reason === 'spike',
    oob: info.reason === 'oob',
    fg: info.fg ?? null,
    t: sim.t,
    playType: sim.playType || (sim.thrown ? 'pass' : 'run'),
    stats: sim.stats,
    events: sim.events,
    flags: sim.flags,
    sack: !!info.sack,
    kneel: info.reason === 'kneel',
    spotOverride: info.spotOverride ?? null,
  };
  // Forward progress: if the carrier was pushed back after contact, use contact spot.
  const c = sim.carrier;
  if (info.reason === 'tackle' && c && c.contactX !== null && c.contactX !== undefined) {
    const ad = sim.attackDir(c.team);
    if ((c.contactX - r.endX) * ad > 0) r.endX = c.contactX;
  }
  // Safety / touchback in own end zone
  if (r.td === null && !r.incomplete && (info.reason === 'tackle' || info.reason === 'oob' || info.reason === 'oob_endzone')) {
    const team = sim.possession;
    const ad = sim.attackDir(team);
    const ownGoal = ad > 0 ? GOAL_LINE_W : GOAL_LINE_E;
    if ((r.endX - ownGoal) * ad < 0) {
      if (sim.kind === 'scrimmage') {
        if (sim.possessionChangedInEndzone || r.turnover) r.touchback = true;
        else r.safety = 1 - team;
      } else if (team === sim.offIdx) {
        r.safety = 1 - team; // kicking team (blocked punt) downed or out behind its own goal line
      } else if (sim.possessionChangedInEndzone) {
        r.touchback = true; // fielded in the end zone
      } else {
        // Fielded in the field of play and carried back in: a safety, except for the
        // momentum exception (caught just outside the goal line), which keeps the catch spot.
        const caught = sim.catchX ?? r.endX;
        const depth = (caught - ownGoal) * ad;
        if (depth < 4 && sim.returnStartT !== undefined && sim.t - sim.returnStartT < 1.2) r.endX = ownGoal + ad * Math.max(0.5, depth);
        else r.safety = 1 - team;
      }
    }
  }
  return r;
}
