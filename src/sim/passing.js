// Passing: target evaluation, throws, ball flight, catches, interceptions, loose balls.
import { FIELD_WIDTH, GRAVITY, BALL_CARRY_HEIGHT, GOAL_LINE_E, GOAL_LINE_W } from '../core/constants.js';
import { clamp, dist } from '../core/util.js';

const DIFF_USER_ACC = [0.7, 0.85, 1.0, 1.1];
const DIFF_CPU_ACC = [1.4, 1.15, 1.0, 0.9];
const DIFF_USER_CATCH = [0.06, 0.03, 0, -0.03];
const DIFF_CPU_CATCH = [-0.07, -0.03, 0, 0.02];

export function throwSpeed(qb, type) {
  const vb = 15 + (qb.r.thp ?? 70) * 0.13;
  return type === 'bullet' ? vb : type === 'touch' ? vb * 0.72 : vb * 0.55;
}
export function maxThrow(qb) { return 30 + (qb.r.thp ?? 70) * 0.42; }

// Where will a receiver be after T seconds if he keeps running his route?
// Distance covered in T seconds accelerating from v0 toward vmax.
function travel(v0, vmax, a, T) {
  if (v0 >= vmax) return vmax * T;
  const tA = (vmax - v0) / a;
  if (T <= tA) return v0 * T + 0.5 * a * T * T;
  return v0 * tA + 0.5 * a * tA * tA + vmax * (T - tA);
}

export function predictPos(sim, r, T) {
  const route = r.route;
  const vmax = r.topSpeed * (r.jam > 0 ? 0.5 : 0.97);
  if (route && !route.done) {
    const wait = route.delay && sim.t < route.delay ? route.delay - sim.t : 0;
    let x = r.x, y = r.y;
    let remain = travel(r.speed, vmax, r.accel * 0.85, Math.max(0, T - wait));
    for (let i = route.idx; i < route.pts.length; i++) {
      const p = route.pts[i];
      const d = dist(x, y, p.x, p.y);
      if (d >= remain) { x += (p.x - x) / d * remain; y += (p.y - y) / d * remain; remain = 0; break; }
      remain -= d * 1.08; x = p.x; y = p.y; // breaks cost a little time
      if (remain <= 0) break;
    }
    if (remain > 0 && !route.sit && route.pts.length >= 2) {
      const a = route.pts[route.pts.length - 2], b = route.pts[route.pts.length - 1];
      const dd = dist(a.x, a.y, b.x, b.y) || 1;
      x += (b.x - a.x) / dd * remain; y += (b.y - a.y) / dd * remain;
    }
    return { x: clamp(x, 0.5, 119.5), y: clamp(y, 0.4, FIELD_WIDTH - 0.4) };
  }
  if (route && route.done && route.sit) return { x: r.x, y: r.y };
  return { x: clamp(r.x + r.vx * T, 0.5, 119.5), y: clamp(r.y + r.vy * T, 0.4, FIELD_WIDTH - 0.4) };
}

function solveFlight(sim, qb, r, type) {
  const v = throwSpeed(qb, type);
  let T = dist(qb.x, qb.y, r.x, r.y) / v;
  let C = { x: r.x, y: r.y };
  for (let i = 0; i < 4; i++) {
    C = predictPos(sim, r, T + 0.05);
    T = Math.max(0.25, dist(qb.x, qb.y, C.x, C.y) / v);
  }
  return { C, T, v };
}

export function chooseType(d) { return d < 13 ? 'bullet' : d < 30 ? 'touch' : 'lob'; }

// Evaluate how open a receiver is (seconds of margin before a defender can contest).
export function evalTarget(sim, qb, r, forceType) {
  if (!r || !r.isActive()) return null;
  const d0 = dist(qb.x, qb.y, r.x, r.y);
  let type = forceType || chooseType(d0 + Math.max(0, r.speed) * 0.6);
  let { C, T } = solveFlight(sim, qb, r, type);
  const dC = dist(qb.x, qb.y, C.x, C.y);
  if (!forceType) {
    const t2 = chooseType(dC);
    if (t2 !== type) { type = t2; ({ C, T } = solveFlight(sim, qb, r, type)); }
  }
  if (dist(qb.x, qb.y, C.x, C.y) > maxThrow(qb)) return null;
  if (C.y < 1 || C.y > FIELD_WIDTH - 1) return null;
  let margin = Infinity;
  for (const d of sim.def) {
    if (!d.isActive()) continue;
    const react = 0.15 + (99 - (d.r.awr ?? 60)) * 0.003;
    let tD = Math.max(0, dist(d.x, d.y, C.x, C.y) - 1.1) / (d.topSpeed * 0.95) + react;
    if (d.engaged) tD += 1.5;
    margin = Math.min(margin, tD - T);
    // Passing-lane check for flatter throws
    if (type !== 'lob') {
      const sx = C.x - qb.x, sy = C.y - qb.y;
      const L2 = sx * sx + sy * sy || 1;
      const k = ((d.x - qb.x) * sx + (d.y - qb.y) * sy) / L2;
      if (k > 0.15 && k < 0.85) {
        const px = qb.x + sx * k, py = qb.y + sy * k;
        const off = dist(px, py, d.x, d.y);
        if (off < 1.3 && !d.engaged) margin -= type === 'bullet' ? 0.45 : 0.2;
      }
    }
  }
  const depth = (C.x - sim.losX) * sim.dir;
  return { margin, type, C, T, depth };
}

export function throwBall(sim, qb, r, type, place) {
  if (!qb.hasBall || sim.thrown) return;
  const { C, T: T0 } = solveFlight(sim, qb, r, type);
  let tx = C.x, ty = C.y;
  // Pass placement (lead) from the stick
  if (place && (Math.abs(place.x) + Math.abs(place.y)) > 0.3) {
    const pl = Math.hypot(place.x, place.y);
    tx += place.x / pl * 1.8; ty += place.y / pl * 1.8;
  }
  let d = dist(qb.x, qb.y, tx, ty);
  const mx = maxThrow(qb);
  if (d > mx) { const k = mx / d; tx = qb.x + (tx - qb.x) * k; ty = qb.y + (ty - qb.y) * k; d = mx; }
  // Accuracy
  const r_ = qb.r;
  const acc = d < 15 ? r_.sac : d < 30 ? r_.sac * (30 - d) / 15 + r_.mac * (d - 15) / 15 : d < 45 ? r_.mac * (45 - d) / 15 + r_.dac * (d - 30) / 15 : r_.dac;
  let sigma = (0.25 + d * 0.024 + Math.max(0, d - 20) * 0.035) * (1.32 - acc / 100) * 1.5;
  const pressured = sim.def.some((x) => x.isActive() && !x.engaged && dist(x.x, x.y, qb.x, qb.y) < 2.6);
  if (pressured) sigma *= 1.55 - (r_.tup ?? 60) * 0.004;
  if (qb.speed > 2.5) sigma *= 1.5 - (r_.tor ?? 60) * 0.0045;
  if (place) sigma *= 1.12;
  if (type === 'bullet' && d > 25) sigma *= 1.1;
  if (type === 'lob' && d < 15) sigma *= 1.15;
  if (type === 'lob' && d > 30) sigma += 0.5;
  if (sim.weather.kind === 'rain' || sim.weather.kind === 'snow') sigma *= 1.12;
  if (sim.thrownAway) sigma *= 0.5;
  const diff = sim.difficulty;
  sigma *= qb.user ? DIFF_USER_ACC[diff] : (sim.isUser(sim.defIdx) ? DIFF_CPU_ACC[diff] : 1);
  tx += sim.rng.gauss() * sigma;
  ty += sim.rng.gauss() * sigma;
  const v = throwSpeed(qb, type);
  const T = Math.max(0.22, dist(qb.x, qb.y, tx, ty) / v);
  // Wind drift
  if (sim.weather.wind) {
    tx += Math.cos(sim.weather.windDir) * sim.weather.wind * 0.02 * T * T * 3;
    ty += Math.sin(sim.weather.windDir) * sim.weather.wind * 0.02 * T * T * 3;
  }
  const sz = 2.0, tz = 1.3 + sim.rng.gauss() * sigma * 0.25;
  launch(sim, qb.x + Math.cos(qb.face) * 0.3, qb.y + Math.sin(qb.face) * 0.3, sz, tx, ty, tz, T);
  sim.ball.flight.target = r;
  sim.ball.flight.type = type;
  qb.hasBall = false;
  sim.carrier = null;
  sim.thrown = true;
  sim.passer = qb;
  sim.target = r;
  sim.phase = 'air';
  sim.stats.passer = qb.id;
  sim.stats.target = r ? r.id : null;
  sim.stats.airYards = (tx - sim.losX) * sim.dir;
  sim.throwT = sim.t;
  sim.throwFromBox = Math.abs(sim.frame(qb.x, qb.y).l) < 3.6;
  qb.anim = 'throw'; qb.animT = 0;
  sim.events.push({ t: sim.t, type: 'pass', from: qb.id, to: r ? r.id : null, ptype: type, air: sim.stats.airYards });
  for (const dd of sim.def) dd.ballReactT = 0;
  // Human offense: take control of the intended receiver.
  if (r && sim.ctl(qb.team)) sim.setUser(qb.team, r);
}

export function throwAway(sim, qb, nearRec = null) {
  if (!qb.hasBall || sim.thrown) return;
  const fr = sim.frame(qb.x, qb.y);
  let tx, ty;
  if (nearRec) {
    // Throw it at the receiver's feet / past him, away from defenders.
    const away = nearRec.y > qb.y ? 1 : -1;
    tx = nearRec.x + sim.dir * 2.5; ty = clamp(nearRec.y + away * 2.5, -2, FIELD_WIDTH + 2);
  } else {
    const side = fr.l >= 0 ? 1 : -1;
    ty = side * sim.dir > 0 ? FIELD_WIDTH + 3 : -3;
    tx = clamp(sim.losX + sim.dir * 6, 1, 119);
  }
  sim.thrownAway = true;
  const T = dist(qb.x, qb.y, tx, ty) / throwSpeed(qb, 'touch');
  launch(sim, qb.x, qb.y, 2, tx, ty, nearRec ? 0.1 : 1.5, T);
  sim.ball.flight.target = null;
  sim.ball.flight.type = 'away';
  qb.hasBall = false; sim.carrier = null; sim.thrown = true; sim.passer = qb; sim.target = null; sim.phase = 'air';
  sim.stats.passer = qb.id; sim.stats.target = null;
  sim.throwT = sim.t;
  sim.throwFromBox = Math.abs(fr.l) < 3.6;
  qb.anim = 'throw'; qb.animT = 0;
  // Intentional grounding: in the tackle box with no receiver in the area, or not reaching the line.
  const near = sim.off.some((o) => o.eligible && dist(o.x, o.y, tx, ty) < 10);
  const pastLOS = (tx - sim.losX) * sim.dir > 0;
  if (sim.throwFromBox && (!near || (!pastLOS && !nearRec))) sim.flags.push({ type: 'grounding', team: sim.offIdx, spotX: qb.x });
  sim.events.push({ t: sim.t, type: 'throwaway', from: qb.id });
}

function launch(sim, sx, sy, sz, tx, ty, tz, T) {
  const b = sim.ball;
  b.state = 'air';
  b.carrier = null;
  b.x = sx; b.y = sy; b.z = sz;
  b.vx = (tx - sx) / T; b.vy = (ty - sy) / T;
  b.vz = (tz - sz + 0.5 * GRAVITY * T * T) / T;
  b.flight = { sx, sy, sz, tx, ty, tz, T, t: 0 };
  b.pitch = false;
}

export function updateBall(sim, dt) {
  const b = sim.ball;
  if (b.state === 'held' && b.carrier) {
    const c = b.carrier;
    const off = 0.35;
    b.x = c.x + Math.cos(c.face) * off * 0.6;
    b.y = c.y + Math.sin(c.face) * off * 0.6;
    b.z = c.state === 'down' ? 0.3 : c.state === 'falling' ? 0.7 : BALL_CARRY_HEIGHT;
    return;
  }
  if (b.state === 'air' && b.flight) {
    const fl = b.flight;
    fl.t += dt;
    b.x = fl.sx + b.vx * fl.t;
    b.y = fl.sy + b.vy * fl.t;
    b.z = fl.sz + b.vz * fl.t - 0.5 * GRAVITY * fl.t * fl.t;
    b.spin += dt * 25;
    if (b.pitch) {
      if (fl.t >= fl.T) {
        const r = fl.target;
        if (r && r.isActive() && dist(r.x, r.y, b.x, b.y) < 1.8 && sim.rng.chance(0.985)) { sim.giveBall(r, true); sim.phase = 'run'; sim.handoffT = sim.t; }
        else { b.state = 'loose'; b.vx *= 0.3; b.vy *= 0.3; b.vz = 0; b.fumbledBy = sim.offIdx; b.looseT = 0; sim.phase = 'loose'; sim.events.push({ t: sim.t, type: 'fumble', by: r ? r.id : null }); }
      }
      return;
    }
    if (fl.type !== 'away' && !fl.resolved) {
      // Undercut: a defender jumping the route before the ball reaches the receiver.
      if (fl.t > fl.T * 0.7 && fl.t < fl.T - 0.03 && b.z < 3.2) {
        const tgt = fl.target;
        for (const d of sim.def) {
          if (!d.isActive() || d.engaged) continue;
          if (dist(d.x, d.y, b.x, b.y) >= 0.8 || b.z >= 2.4 + (d.r.jmp ?? 60) * 0.006) continue;
          // Must be in front of the receiver along the ball's path
          if (tgt) {
            const toRx = tgt.x - fl.sx, toRy = tgt.y - fl.sy;
            const toDx = d.x - fl.sx, toDy = d.y - fl.sy;
            if (toDx * toRx + toDy * toRy >= toRx * toRx + toRy * toRy - 0.5) continue;
          }
          resolveCatch(sim, d); break;
        }
      }
      if (!fl.resolved && fl.t >= fl.T) resolveCatch(sim, null);
    }
    if (b.z <= 0.12 && b.state === 'air') {
      // Hit the ground: incomplete
      b.z = 0.12;
      if (!sim.dead) sim.endPlay({ reason: 'incomplete', x: sim.losX, y: sim.ballY0 });
    }
    return;
  }
  if (b.state === 'loose') {
    b.looseT = (b.looseT || 0) + dt;
    b.vz -= GRAVITY * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.z < 0.12) {
      b.z = 0.12;
      b.vz = Math.abs(b.vz) > 1 ? -b.vz * 0.35 : 0;
      // Random football bounce
      if (Math.abs(b.vz) > 0.5) { const a = sim.rng.range(-0.9, 0.9); const c = Math.cos(a), s = Math.sin(a); const vx = b.vx * c - b.vy * s, vy = b.vx * s + b.vy * c; b.vx = vx; b.vy = vy; }
      b.vx *= 1 - 2.2 * dt; b.vy *= 1 - 2.2 * dt;
    }
    // Out of bounds
    if (b.y < 0 || b.y > FIELD_WIDTH || b.x < 0 || b.x > 120) {
      const team = b.fumbledBy ?? sim.possession;
      sim.possession = team;
      const ad = sim.attackDir(team);
      const ownGoal = ad > 0 ? GOAL_LINE_W : GOAL_LINE_E;
      const oppGoal = ad > 0 ? GOAL_LINE_E : GOAL_LINE_W;
      if ((b.x - oppGoal) * ad > 0) { // out through the opponent's end zone: touchback to them
        sim.possession = 1 - team;
        sim.endPlay({ reason: 'fumble_tb', x: b.x, y: b.y, touchback: true });
      } else if ((b.x - ownGoal) * ad < 0) {
        sim.endPlay({ reason: 'oob', x: b.x, y: clamp(b.y, 0, FIELD_WIDTH) });
      } else sim.endPlay({ reason: 'oob', x: clamp(b.x, 0, 120), y: clamp(b.y, 0, FIELD_WIDTH) });
      return;
    }
    // Recovery
    if (b.z < 0.9) {
      let best = null, bd = 0.9;
      for (const e of sim.ents) {
        if (!e.isActive()) continue;
        const d = dist(e.x, e.y, b.x, b.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best && sim.rng.chance(dt * 9)) {
        const team = best.team;
        const changed = team !== b.fumbledBy;
        sim.stats.recoveredBy = best.id;
        sim.events.push({ t: sim.t, type: 'recover', by: best.id, team });
        sim.giveBall(best, true);
        if (changed) sim.turnoverT = sim.t;
        sim.phase = 'run';
        // Pile: most recoveries are smothered immediately.
        const crowd = sim.ents.filter((o) => o.team !== team && o.isActive() && dist(o.x, o.y, best.x, best.y) < 3).length;
        if (crowd > 0 || sim.rng.chance(0.55)) {
          best.knockDown(0, 0);
          best.contactX = best.x;
        }
      }
    }
    if (b.looseT > 6) {
      sim.endPlay({ reason: 'tackle', x: b.x, y: b.y });
    }
  }
}

function catchProb(sim, r, err, contest) {
  const rr = r.r;
  let p = 0.635 + (rr.cth ?? 60) * 0.0042;
  if (err > 0.6) p *= Math.max(0.1, 1 - (err - 0.6) * 0.45 * (1.15 - (rr.spc ?? 50) / 200));
  // Contest from nearby defenders (catch in traffic mitigates)
  const cit = (rr.cit ?? 55) / 100;
  p *= 1 - contest * (1 - cit * 0.5);
  const uc = r.user ? sim.ctl(r.team) : null;
  if (uc && uc.held.has('catch_aggr')) p += contest > 0.15 ? 0.07 : -0.02;
  if (uc && uc.held.has('catch_poss')) p += 0.03;
  if (sim.weather.kind === 'rain') p -= 0.03;
  if (sim.weather.kind === 'snow') p -= 0.02;
  p += sim.ctl(r.team) ? DIFF_USER_CATCH[sim.difficulty] : (sim.isUser(1 - r.team) ? DIFF_CPU_CATCH[sim.difficulty] : 0);
  return clamp(p, 0.03, 0.985);
}

export function resolveCatch(sim, undercutter) {
  const b = sim.ball;
  const fl = b.flight;
  fl.resolved = true;
  const r = fl.target;
  const R = 1.5;
  const recIn = r && r.isActive() && dist(r.x, r.y, b.x, b.y) < R && b.z < 3.3 ? r : null;
  const recD = recIn ? dist(recIn.x, recIn.y, b.x, b.y) : 99;
  const defs = sim.def.filter((d) => d.isActive() && !d.engaged && dist(d.x, d.y, b.x, b.y) < R && b.z < 2.6 + (d.r.jmp ?? 60) * 0.009);
  if (undercutter && !defs.includes(undercutter)) defs.push(undercutter);
  defs.sort((a, c) => dist(a.x, a.y, b.x, b.y) - dist(c.x, c.y, b.x, b.y));
  // How tightly is the receiver covered?
  let contest = 0;
  if (recIn) for (const d of defs) {
    const dd = dist(d.x, d.y, recIn.x, recIn.y);
    const cov = Math.max(d.r.mcv ?? 50, d.r.zcv ?? 50);
    contest += clamp((1.4 - dd) / 1.4, 0, 1) * (0.2 + cov * 0.0022 + (d.r.jmp ?? 60) * 0.0008);
  }
  contest = clamp(contest, 0, 0.7);
  const typeK = fl.type === 'lob' ? 1.0 : fl.type === 'bullet' ? 0.75 : 0.85;
  for (const d of defs) {
    const dd = dist(d.x, d.y, b.x, b.y);
    const better = !recIn || dd < recD - 0.3 || d === undercutter;
    const uc = d.user ? sim.ctl(d.team) : null;
    const playBall = uc && (uc.held.has('catch_aggr') || uc.pressed.has('catch_aggr'));
    const swat = uc && (uc.held.has('swat') || uc.pressed.has('swat'));
    if (!better && !playBall && !swat) continue;
    const prox = clamp(1.15 - dd * 0.5, 0.25, 1.1);
    let pInt = (0.035 + (d.r.cth ?? 50) * 0.0026) * typeK * prox * (better ? 1 : 0.45);
    let pDef = (0.38 + Math.max(d.r.mcv ?? 50, d.r.zcv ?? 50) * 0.002) * prox * (better ? 1 : 0.6);
    if (d === undercutter) pInt *= 0.8;
    if (playBall) { pInt *= 1.5; pDef *= 0.85; }
    if (swat) { pInt *= 0.4; pDef *= 1.35; }
    if (sim.isUser(sim.offIdx) && !d.user) pInt *= [0.5, 0.8, 1.0, 1.15][sim.difficulty];
    if (sim.rng.chance(clamp(pInt, 0, 0.6))) return intercept(sim, d);
    if (sim.rng.chance(clamp(pDef, 0, 0.85))) return incompletion(sim, 'defended', d);
    break; // only the best-positioned defender gets a clean shot at the ball
  }
  if (!recIn) return incompletion(sim, 'overthrown', null);
  const p = catchProb(sim, recIn, recD, contest);
  // DPI: early contact from a trailing defender who didn't play the ball
  for (const d of defs) {
    const dd = dist(d.x, d.y, recIn.x, recIn.y);
    if (dd < 0.8 && dist(d.x, d.y, b.x, b.y) > recD + 0.25 && sim.rng.chance(0.12)) {
      sim.flags.push({ type: 'dpi', team: d.team, spotX: b.x, by: d.id });
      break;
    }
  }
  if (sim.rng.chance(p)) return completeCatch(sim, recIn);
  // Tipped ball can occasionally pop up for a pick
  if (defs.length && contest > 0.25 && sim.rng.chance(0.04)) return intercept(sim, defs[0]);
  return incompletion(sim, contest > 0.2 ? 'broken_up' : 'drop', contest > 0.2 ? defs[0] || null : null);
}

function completeCatch(sim, r) {
  // Sideline: need feet in bounds
  if (r.y < 0.15 || r.y > FIELD_WIDTH - 0.15) {
    const toe = r.y > -0.5 && r.y < FIELD_WIDTH + 0.5 && sim.rng.chance(0.25 + (r.r.awr ?? 60) * 0.004);
    if (!toe) return incompletion(sim, 'oob', null);
    r.y = clamp(r.y, 0.2, FIELD_WIDTH - 0.2);
  }
  sim.giveBall(r, true);
  sim.phase = 'run';
  sim.stats.receiver = r.id;
  sim.catchT = sim.t;
  sim.catchX = r.x;
  r.anim = 'catch';
  // Securing the catch costs speed (less for crossing routes caught in stride).
  const inStride = r.route && !r.route.sit && r.speed > r.topSpeed * 0.7;
  const k = inStride ? 0.8 : 0.6;
  r.vx *= k; r.vy *= k;
  sim.events.push({ t: sim.t, type: 'catch', by: r.id, x: r.x });
  // Big hit at the catch point can jar it loose — handled as a normal tackle/fumble.
}

function incompletion(sim, why, d) {
  const b = sim.ball;
  sim.events.push({ t: sim.t, type: 'incomplete', why, by: d ? d.id : null });
  sim.stats.defendedBy = d ? d.id : null;
  // Let the ball fall naturally; play ends when it hits the ground (or now if deflected low).
  b.vx *= 0.35; b.vy *= 0.35;
  if (why === 'defended' || why === 'broken_up') { b.vz = Math.abs(b.vz) * 0.2 + 1.5; b.flight.sx = b.x; b.flight.sy = b.y; b.flight.sz = b.z; b.flight.t = 0; }
  if (!sim.dead) sim.endPlay({ reason: 'incomplete', x: sim.losX, y: sim.ballY0 });
  b.state = 'air';
}

function intercept(sim, d) {
  sim.stats.intBy = d.id;
  sim.events.push({ t: sim.t, type: 'int', by: d.id });
  sim.giveBall(d, true);
  sim.turnoverT = sim.t;
  sim.phase = 'run';
  d.anim = 'catch';
  // Caught in his own end zone?
  const ad = sim.attackDir(d.team);
  const ownGoal = ad > 0 ? GOAL_LINE_W : GOAL_LINE_E;
  if ((d.x - ownGoal) * ad < 0) sim.possessionChangedInEndzone = true;
}
