// On-field player entity: physical state + per-play assignment.
import { PLAYER_RADIUS } from '../core/constants.js';
import { clamp } from '../core/util.js';
import { ELIGIBLE_POS } from '../core/constants.js';

export class Entity {
  constructor(player, team, side, tag, pos) {
    this.id = player.id;
    this.p = player;
    this.r = player.r;
    this.team = team; // 0 home, 1 away
    this.side = side; // 'O' offense, 'D' defense
    this.tag = tag;
    this.pos = pos; // in-game role (QB, WR, TE, HB, FB, OL, DL, LB, CB, S, K, P, ...)
    this.rpos = player.pos; // roster position
    this.num = player.num;
    this.eligible = side === 'O' && ELIGIBLE_POS.has(pos === 'RB' ? 'HB' : pos);
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.face = 0; // radians, 0 = +x
    this.radius = PLAYER_RADIUS * (player.wt > 280 ? 1.12 : player.wt < 200 ? 0.95 : 1);
    this.mass = player.wt || 220;
    const r = this.r;
    this.topSpeed = 4.0 + r.spd * 0.064;
    this.accel = 5.6 + r.acc * 0.056;
    this.agility = r.agi;
    // Dynamic state
    this.state = 'set'; // set, run, engaged, down, stunned, falling, celebrate
    this.stun = 0;
    this.downT = 0;
    this.engaged = null;
    this.blockScore = 0;
    this.blockCooldown = 0;
    this.shedFrom = null;
    this.task = null;
    this.assign = null;
    this.user = false;
    this.hasBall = false;
    this.move = null; // active ball-carrier / defender move {type, t, dur, dir}
    this.anim = 'stance'; // animation hint for renderer
    this.animT = 0;
    this.tackleCd = 0;
    this.reactT = 0;
    this.route = null;
    this.desired = { x: 0, y: 0, sprint: true };
    this.speedCap = 1;
    this.contactX = null;
    this.alignF = 0; this.alignL = 0;
    this.lastHistory = [];
  }

  get speed() { return Math.hypot(this.vx, this.vy); }

  isActive() { return this.state !== 'down' && this.state !== 'falling' && this.stun <= 0; }

  // Seek a point at a fraction of top speed. Returns distance remaining.
  seek(tx, ty, speedFrac = 1, arriveDist = 1.5) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) { this.desired.x = 0; this.desired.y = 0; return 0; }
    let sp = this.topSpeed * speedFrac;
    if (d < arriveDist) sp *= d / arriveDist;
    this.desired.x = (dx / d) * sp;
    this.desired.y = (dy / d) * sp;
    return d;
  }

  setDesired(vx, vy) { this.desired.x = vx; this.desired.y = vy; }
  stop() { this.desired.x = 0; this.desired.y = 0; }

  integrate(dt, weatherMul = 1) {
    if (this.stun > 0) this.stun -= dt;
    if (this.tackleCd > 0) this.tackleCd -= dt;
    if (this.lunge > 0) {
      this.lunge -= dt;
      this.desired.x = this.vx; this.desired.y = this.vy;
      if (this.lunge <= 0 && this.state !== 'down' && this.state !== 'falling') { this.knockDown(this.vx * 0.4, this.vy * 0.4); this.stun = 0.6; this.downT = -0.3; }
    }
    if (this.blockCooldown > 0) this.blockCooldown -= dt;
    this.animT += dt;
    if (this.state === 'down' || this.state === 'falling') {
      const drag = this.fallDrag || 6;
      this.vx *= Math.max(0, 1 - drag * dt);
      this.vy *= Math.max(0, 1 - drag * dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.downT += dt;
      if (this.state === 'falling' && this.downT > 0.45) this.state = 'down';
      return;
    }
    let dvx = this.desired.x, dvy = this.desired.y;
    const maxSp = this.topSpeed * this.speedCap * weatherMul;
    const dsp = Math.hypot(dvx, dvy);
    if (dsp > maxSp) { dvx *= maxSp / dsp; dvy *= maxSp / dsp; }
    if (this.stun > 0) { dvx *= 0.25; dvy *= 0.25; }
    const ax = dvx - this.vx, ay = dvy - this.vy;
    const a = Math.hypot(ax, ay);
    // Direction changes at speed cost more; agility softens it.
    const sp = this.speed;
    let acc = this.accel * weatherMul;
    if (sp > 2 && dsp > 0.5) {
      const dot = (this.vx * dvx + this.vy * dvy) / (sp * dsp);
      if (dot < 0.7) acc *= 0.72 + this.agility * 0.0032;
      if (dot < 0) acc *= 1.15; // braking is quicker than accelerating
    }
    const maxDv = acc * dt;
    if (a > maxDv) { this.vx += (ax / a) * maxDv; this.vy += (ay / a) * maxDv; }
    else { this.vx = dvx; this.vy = dvy; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.speed > 0.6) {
      const target = Math.atan2(this.vy, this.vx);
      this.turnToward(target, dt * 10);
    }
  }

  turnToward(angle, rate) {
    let d = angle - this.face;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.face += clamp(d, -rate, rate);
  }

  knockDown(vx = 0, vy = 0) {
    this.fallDrag = 6;
    this.state = 'falling';
    this.downT = 0;
    this.vx = vx; this.vy = vy;
    if (this.engaged) { this.engaged.engaged = null; this.engaged = null; }
  }
}
