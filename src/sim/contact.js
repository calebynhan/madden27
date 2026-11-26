// Blocking engagements, tackling, fumbles and body collisions.
import { clamp, dist } from '../core/util.js';
import { BALL_CARRY_HEIGHT } from '../core/constants.js';
import { TUNE } from './tune.js';

const TAU = Math.PI * 2;
function angDist(a, b) { let d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; }
function rotateToward(a, target, rate) {
  let d = target - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + clamp(d, -rate, rate);
}

function goalFor(sim, d) {
  const c = sim.carrier;
  if (c && c.team !== d.team) return c;
  if (sim.ball.state === 'air' && sim.ball.flight) return { x: sim.ball.flight.tx, y: sim.ball.flight.ty };
  return sim.qb || { x: sim.ball.x, y: sim.ball.y };
}

export function updateEngagements(sim, dt) {
  // Form new blocks
  for (const o of sim.ents) {
    if (!o.blocking || o.engaged || !o.isActive() || o.hasBall || (o.user && sim.ctl(o.team))) continue;
    if (o.blockCooldown > 0) continue;
    let best = null, bd = Infinity;
    const pref = (o.task && o.task.target) || o.blockTarget || null;
    for (const d of sim.ents) {
      if (d.team === o.team || d.engaged || !d.isActive() || d.hasBall || d.blockCooldown > 0) continue;
      if (d.side === 'O' && d.team === sim.offIdx && d.route && !d.route.done && sim.kind === 'scrimmage') continue; // don't block receivers running routes
      const dd = dist(o.x, o.y, d.x, d.y);
      const reach = o.radius + d.radius + 0.35;
      if (dd > reach) continue;
      // Only block defenders in front (between us and them is legal contact)
      const g = goalFor(sim, d);
      if (dist(d.x, d.y, g.x, g.y) < dist(o.x, o.y, g.x, g.y) - 0.6) continue;
      const sc = dd - (d === pref ? 1 : 0);
      if (sc < bd) { bd = sc; best = d; }
    }
    if (best) engage(sim, o, best);
  }
  // Update existing blocks
  for (const o of sim.ents) {
    const d = o.engaged;
    if (!d || !o.blocking && o.engagedAsBlocker !== true) continue;
    if (!o.engagedAsBlocker) continue;
    updatePair(sim, o, d, dt);
  }
}

function engage(sim, o, d) {
  o.engaged = d; d.engaged = o;
  o.engagedAsBlocker = true; d.engagedAsBlocker = false;
  o.engageT = 0;
  const passPro = sim.kind === 'scrimmage' && sim.playType !== 'run' && !sim.carrier?.qbRunner && (sim.carrier === sim.qb || !sim.carrier) && !sim.thrown;
  o.passPro = passPro;
  const ob = blockRating(o, passPro), db = shedRating(d, passPro);
  o.blockScore = clamp((ob - db) * 0.01 + (sim.rng.next() - 0.5) * 0.3 + (passPro || sim.kind !== 'scrimmage' ? 0 : TUNE.runFireOut), -0.4, 0.6);
  o.blockAng = Math.atan2(d.y - o.y, d.x - o.x);
  o.anim = 'block'; d.anim = 'block';
  if (o.task && o.task.target === undefined) o.task.target = d;
}

function blockRating(o, pass) {
  const r = o.r;
  return (pass ? r.pbk : r.rbk) * 0.65 + r.str * 0.35 + (o.pos === 'OL' ? 0 : -4);
}
function shedRating(d, pass) {
  const r = d.r;
  const moves = Math.max(r.pmv * 0.55 + r.str * 0.45, r.fmv * 0.8 + r.agi * 0.2);
  return pass ? moves * 0.6 + r.bsh * 0.25 + r.str * 0.15 : r.bsh * 0.6 + r.str * 0.4;
}

export function release(o, d, stunO = 0.25, cdD = 0.7) {
  if (o) { o.engaged = null; o.engagedAsBlocker = false; o.stun = Math.max(o.stun, stunO); o.blockCooldown = 0.5; }
  if (d) { d.engaged = null; d.engagedAsBlocker = false; d.blockCooldown = cdD; }
}

function updatePair(sim, o, d, dt) {
  if (!o.isActive() || !d.isActive() && d.state !== 'set' && d.state !== 'run') { release(o, d, 0, 0.2); return; }
  o.engageT += dt;
  const pass = o.passPro && !sim.thrown && sim.carrier === sim.qb;
  let ob = blockRating(o, pass), db = shedRating(d, pass);
  if (d.doubled && d.doubled !== o && dist(d.doubled.x, d.doubled.y, d.x, d.y) < 1.8) ob += 14;
  d.doubled = null;
  // Difficulty: small symmetric nudge for CPU line play against a human.
  const diffAdj = [-4, -1.5, 0, 2][sim.difficulty] || 0;
  if (sim.isUser(o.team) && !sim.isUser(d.team)) db += diffAdj;
  if (sim.isUser(d.team) && !sim.isUser(o.team)) ob += diffAdj;
  // User-controlled defender pass-rush moves
  const uc = d.user ? sim.ctl(d.team) : null;
  if (uc && (d.rushCd || 0) <= 0 && (uc.pressed.has('swim') || uc.pressed.has('bull'))) {
    d.rushCd = 0.9;
    const finesse = uc.pressed.has('swim');
    const atk = finesse ? d.r.fmv * 0.75 + d.r.agi * 0.25 : d.r.pmv * 0.6 + d.r.str * 0.4;
    const p = clamp(0.32 + (atk - ob) * 0.012, 0.12, 0.75);
    if (sim.rng.chance(p)) { shed(sim, o, d, finesse ? 'swim' : 'bull'); return; }
    o.blockScore = Math.min(1, o.blockScore + 0.25);
  }
  if (d.rushCd > 0) d.rushCd -= dt;
  o.blockScore = clamp(o.blockScore + ((ob - db) * 0.011 + sim.rng.gauss() * 0.7) * dt, -1, 1);
  const bs = o.blockScore;
  const G = goalFor(sim, d);
  const toG = Math.atan2(G.y - o.y, G.x - o.x);
  // D works around the block when winning; O walls him off when winning.
  const rate = (0.12 + Math.abs(bs) * 0.55) * dt;
  o.blockAng = rotateToward(o.blockAng, bs < 0 ? toG : toG + Math.PI, rate * (bs < 0 ? 1 : 0.6));
  if (uc && (Math.abs(uc.mx) + Math.abs(uc.my) > 0.3)) {
    const want = Math.atan2(uc.my, uc.mx);
    o.blockAng = rotateToward(o.blockAng, want, 0.5 * dt);
  }
  // Pair drift
  let vx = 0, vy = 0;
  if (bs < 0) {
    const sp = -bs * (pass ? 2.2 : 2.6);
    vx = Math.cos(toG) * sp; vy = Math.sin(toG) * sp;
  } else {
    const away = Math.atan2(d.y - G.y, d.x - G.x);
    const sp = bs * (pass ? 0.9 : 2.3);
    vx = Math.cos(away) * sp; vy = Math.sin(away) * sp;
  }
  o.x += vx * dt; o.y += vy * dt;
  o.vx = vx; o.vy = vy;
  const cd = o.radius + d.radius + 0.05;
  d.x = o.x + Math.cos(o.blockAng) * cd;
  d.y = o.y + Math.sin(o.blockAng) * cd;
  d.vx = vx; d.vy = vy;
  o.face = o.blockAng; d.face = o.blockAng + Math.PI;
  o.anim = 'block'; d.anim = 'block';
  // Shed checks
  if (angDist(o.blockAng, toG) < 0.75 && bs < (pass ? 0.2 : -0.15)) { shed(sim, o, d, 'beat'); return; }
  let pShed = TUNE.passShedBase + Math.max(0, -bs) ** 2 * TUNE.passShedK + Math.max(0, db - ob) * 0.002;
  const c = sim.carrier;
  if (c && c.team !== d.team && c !== sim.qb) {
    const dc = dist(c.x, c.y, d.x, d.y);
    if (dc < 2.0 && bs < 0.4) pShed += TUNE.nearShed * (1 - bs);
    // A DB in a receiver's stalk block comes off it to fit the ball carrier heading his way.
    if (o.task && o.task.kind === 'stalk' && dc < 6) pShed += 1.4 * (1 - dc / 7);
    // Ball has gone past this defender: linemen come off blocks to pursue.
    const past = (c.x - d.x) * sim.attackDir(c.team) > 2.0 || Math.abs(c.y - d.y) > 7;
    if (past && sim.t > 1.2) pShed += TUNE.pastShed;
  }
  if (o.engageT > 3.2) pShed += (o.engageT - 3.2) * 0.2;
  if (sim.kind !== 'scrimmage') pShed += 0.45 + o.engageT * 0.3; // open-field return blocks are brief
  else if (o.task && o.task.kind === 'stalk') pShed += 0.25 + o.engageT * 0.2; // receivers' stalk blocks on DBs don't last long
  if (sim.rng.chance(pShed * dt)) { shed(sim, o, d, 'shed'); return; }
  // Pancake
  if (bs > 0.92 && ob - db > 12 && sim.rng.chance(0.12 * dt)) {
    d.knockDown(vx, vy); d.stun = 1.2; release(o, null, 0, 0);
    sim.events.push({ t: sim.t, type: 'pancake', by: o.id, on: d.id });
  }
}

function shed(sim, o, d, how) {
  release(o, d, 0.3, 0.6);
  d.tackleCd = Math.max(d.tackleCd, TUNE.shedRecover); // needs a beat to get off the block
  // Nudge the defender past the blocker toward his goal
  const G = goalFor(sim, d);
  const a = Math.atan2(G.y - d.y, G.x - d.x);
  d.x += Math.cos(a) * 0.25; d.y += Math.sin(a) * 0.25;
  d.vx = Math.cos(a) * 2.5; d.vy = Math.sin(a) * 2.5;
  sim.events.push({ t: sim.t, type: 'shed', by: d.id, from: o.id, how });
}

// ---------------------------------------------------------------------- tackles
const DIFF_TACKLE_CPU = [0.86, 0.95, 1.0, 1.06]; // CPU defenders vs human carriers
const DIFF_TACKLE_USER = [1.12, 1.05, 1.0, 0.96]; // human defenders vs CPU carriers

export function resolveTackles(sim, dt) {
  const c = sim.carrier;
  if (!c || sim.ball.state !== 'held' || c.state === 'down' || c.state === 'falling') return;
  if (c.hurdleImmune > 0) c.hurdleImmune -= dt;
  const ad = sim.attackDir(c.team);
  for (const d of sim.ents) {
    if (d.team === c.team || !d.isActive() || d.engaged || d.tackleCd > 0) continue;
    const reach = c.radius + d.radius + 0.38 + (d.lunge ? 0.6 : 0);
    const dd = dist(c.x, c.y, d.x, d.y);
    if (dd > reach) continue;
    if (attemptTackle(sim, c, d, ad)) return;
  }
}

function attemptTackle(sim, c, d, ad) {
  const rng = sim.rng;
  d.tackleCd = 0.85;
  const cr = c.r, dr = d.r;
  const m = c.move && c.move.t < c.move.dur ? c.move : null;
  const uc = d.user ? sim.ctl(d.team) : null;
  const hitStick = !!(d.hitStick && d.hitStick > 0);
  // Evasive moves can make the defender whiff entirely.
  if (m && m.evade && (m.type === 'juke' || m.type === 'spin' || m.type === 'hurdle' || m.type === 'stutter')) {
    const awr = (dr.awr ?? 60) * 0.5 + (dr.tak ?? 60) * 0.5;
    const pe = clamp(m.evade - (awr - 70) * 0.006, 0.05, 0.9);
    if (rng.chance(pe)) {
      d.stun = 0.55; d.anim = 'dive';
      if (sim.rng.chance(0.4)) d.knockDown(d.vx * 0.6, d.vy * 0.6);
      sim.events.push({ t: sim.t, type: 'evade', move: m.type, by: c.id, on: d.id });
      return false;
    }
  }
  if (m && (m.type === 'stiff' || m.type === 'truck')) {
    const atk = m.type === 'stiff' ? cr.sfa * 0.6 + cr.str * 0.4 : cr.trk * 0.6 + cr.str * 0.25 + (c.mass / 320) * 15;
    const def = m.type === 'stiff' ? dr.tak * 0.5 + dr.str * 0.5 : dr.tak * 0.35 + dr.pow * 0.3 + dr.str * 0.35;
    const pb = clamp((m.type === 'stiff' ? 0.38 : 0.3) + (atk - def) * 0.013, 0.08, 0.8);
    if (rng.chance(pb)) {
      if (m.type === 'truck') { d.knockDown(c.vx * 0.5, c.vy * 0.5); d.stun = 1.4; c.vx *= 0.6; c.vy *= 0.6; }
      else { d.stun = 1.0; d.vx = (d.x - c.x) * 3; d.vy = (d.y - c.y) * 3; }
      sim.events.push({ t: sim.t, type: m.type === 'truck' ? 'truck' : 'stiffarm', by: c.id, on: d.id });
      c.move.t = c.move.dur; // move consumed
      return false;
    }
  }
  let p = TUNE.tackleBase + ((dr.tak ?? 60) - 70) * 0.009 - ((cr.btk ?? 60) - 70) * 0.0075;
  // Approach angle
  const sp = c.speed;
  const toD = Math.atan2(d.y - c.y, d.x - c.x);
  const heading = sp > 0.5 ? Math.atan2(c.vy, c.vx) : (ad > 0 ? 0 : Math.PI);
  const dot = Math.cos(toD - heading);
  if (dot > 0.5) p += 0.07;
  else if (dot < -0.3) p -= sp > 6.5 ? 0.12 : 0.03;
  if (sp > 7 && dot < 0.5) p -= 0.06;
  // Small carriers vs big tacklers
  p += (d.mass - c.mass) * 0.0004;
  // Gang tackling
  let help = 0;
  for (const o of sim.ents) {
    if (o === d || o.team === c.team || !o.isActive() || o.engaged) continue;
    if (dist(o.x, o.y, c.x, c.y) < 1.7) help++;
  }
  p += Math.min(0.3, help * 0.15);
  if (m && m.type === 'stiff') p += 0.08;
  if (m && m.type === 'truck') p += 0.1;
  if (m && m.type === 'spin') p -= 0.05;
  if (c.protectBall) p += 0.04;
  if (d.lunge) p += 0.05;
  if (hitStick) p -= 0.08;
  if (sim.weather.kind === 'rain' || sim.weather.kind === 'snow') p -= 0.03;
  // QBs in the pocket go down easily once a rusher gets home.
  if (c === sim.qb && !sim.thrown && !c.qbRunner) p += 0.12;
  if (c.user && !d.user) p *= DIFF_TACKLE_CPU[sim.difficulty] ?? 1;
  if (d.user && !c.user) p *= DIFF_TACKLE_USER[sim.difficulty] ?? 1;
  p = clamp(p, 0.12, 0.97);
  if (rng.chance(p)) {
    tackle(sim, c, d, help, hitStick, m);
    return true;
  }
  // Missed
  d.stun = 0.45;
  if (d.lunge) { d.knockDown(d.vx * 0.5, d.vy * 0.5); d.stun = 1; }
  c.vx *= 0.82; c.vy *= 0.82;
  sim.events.push({ t: sim.t, type: 'brokentackle', by: c.id, on: d.id });
  return false;
}

function tackle(sim, c, d, help, hitStick, m) {
  const rng = sim.rng;
  c.contactX = c.x;
  // Fall direction blends momentum of both players; runners lean forward for
  // extra yardage (more for strong backs, less vs big hitters).
  const ad = sim.attackDir(c.team);
  const fwd = (c.vx * ad) > 1.5 ? Math.max(0, 2.6 + ((c.r.trk ?? 60) - (d.r.pow ?? 60)) * 0.04 + (c.mass - d.mass) * 0.008 - help * 0.8) : 0;
  const fvx = c.vx * 0.35 + d.vx * 0.3 + ad * fwd, fvy = c.vy * 0.35 + d.vy * 0.3;
  sim.stats.tacklers = [d.id];
  for (const o of sim.ents) if (o !== d && o.team !== c.team && o.isActive() && dist(o.x, o.y, c.x, c.y) < 1.6) { sim.stats.tacklers.push(o.id); break; }
  const isSack = c === sim.qb && !sim.thrown && !c.qbRunner && sim.kind === 'scrimmage' && (c.x - sim.losX) * sim.dir < 0.5 && c.team === sim.offIdx;
  // Fumble?
  const cr = c.r, dr = d.r;
  let pf = 0.0055 + ((dr.pow ?? 60) - (cr.car ?? 60)) * 0.00022;
  if (hitStick) pf += 0.05;
  if (help) pf += 0.004;
  if (m && (m.type === 'spin' || m.type === 'truck' || m.type === 'hurdle')) pf *= 1.5;
  if (isSack) pf += 0.04;
  if (c.protectBall) pf *= 0.3;
  if (sim.weather.kind === 'rain') pf *= 1.35;
  if (c.pos === 'QB' && c.move && c.move.type === 'slide') pf = 0;
  pf = clamp(pf, 0.002, 0.18);
  d.anim = 'tackle';
  d.knockDown(d.vx * 0.5 + fvx * 0.3, d.vy * 0.5 + fvy * 0.3);
  d.downT = -0.15; // tacklers get up slower
  c.knockDown(fvx, fvy);
  c.fallDrag = 3.0; // runners drive forward through contact
  c.anim = 'fall';
  if (isSack) {
    sim.stats.sackBy = d.id;
    sim.playType = 'sack';
    sim.events.push({ t: sim.t, type: 'sack', by: d.id });
  } else sim.events.push({ t: sim.t, type: 'tackle', by: d.id, on: c.id, hit: hitStick });
  if (rng.chance(pf)) fumble(sim, c, d);
}

export function fumble(sim, c, d) {
  c.hasBall = false;
  sim.carrier = null;
  const b = sim.ball;
  b.state = 'loose';
  b.carrier = null;
  b.x = c.x; b.y = c.y; b.z = BALL_CARRY_HEIGHT * 0.8;
  const a = sim.rng.range(0, TAU);
  const sp = sim.rng.range(1.5, 5);
  b.vx = Math.cos(a) * sp + c.vx * 0.3; b.vy = Math.sin(a) * sp + c.vy * 0.3; b.vz = sim.rng.range(0.5, 3);
  b.fumbledBy = c.team;
  b.looseT = 0;
  sim.stats.fumbleBy = c.id;
  sim.stats.forcedBy = d ? d.id : null;
  sim.phase = 'loose';
  sim.events.push({ t: sim.t, type: 'fumble', by: c.id, forced: d ? d.id : null });
}

// Push overlapping bodies apart (blocked pairs are handled by the engagement solver).
export function separate(sim, dt) {
  const ents = sim.ents;
  for (let i = 0; i < ents.length; i++) {
    const a = ents[i];
    if (a.state === 'down' || a.state === 'falling') continue;
    for (let j = i + 1; j < ents.length; j++) {
      const b = ents[j];
      if (b.state === 'down' || b.state === 'falling') continue;
      if (a.engaged === b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = (a.radius + b.radius) * 0.92;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (min - d);
      const nx = dx / d, ny = dy / d;
      const wa = b.mass / (a.mass + b.mass), wb = 1 - wa;
      // Engaged players are anchored more firmly.
      const fa = a.engaged ? 0.3 : 1, fb = b.engaged ? 0.3 : 1;
      a.x -= nx * push * wa * fa; a.y -= ny * push * wa * fa;
      b.x += nx * push * wb * fb; b.y += ny * push * wb * fb;
    }
  }
}
