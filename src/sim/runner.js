// Ball-carrier AI and special moves (shared by CPU and user-controlled runners).
import { FIELD_WIDTH } from '../core/constants.js';
import { clamp, dist } from '../core/util.js';

const ANGLES = [];
for (let a = -90; a <= 90; a += 12) ANGLES.push((a * Math.PI) / 180);

export function runnerAI(sim, e, dt) {
  e.anim = 'carry';
  if (e.move && updateMove(sim, e, dt)) return;
  const ad = sim.attackDir(e.team);
  const goalX = sim.goalLineFor(e.team);
  const fr = sim.frame(e.x, e.y);
  // QB slide: give himself up past the line when a hit is coming.
  if (e.pos === 'QB' && e.team === sim.offIdx && fr.f > 1 && sim.kind === 'scrimmage') {
    const thr = sim.ents.find((d) => d.team !== e.team && d.isActive() && !d.engaged && dist(d.x, d.y, e.x, e.y) < 2.0);
    if (thr && (fr.f > 4 || (sim.lineToGain !== null && (e.x - sim.lineToGain) * ad > 0))) { startMove(sim, e, 'slide'); return; }
  }
  // Re-evaluate heading every few ticks.
  e.runEvalT = (e.runEvalT || 0) - dt;
  if (e.runEvalT <= 0 || !e.runHeading) {
    e.runEvalT = 0.05;
    e.runHeading = chooseHeading(sim, e, ad, goalX);
  }
  const h = e.runHeading;
  let sp = e.topSpeed;
  if (e.protectBall) sp *= 0.95;
  e.setDesired(Math.cos(h) * sp, Math.sin(h) * sp);
  // CPU special moves
  if (!e.user) cpuMoves(sim, e, dt, ad);
}

function chooseHeading(sim, e, ad, goalX) {
  const base = ad > 0 ? 0 : Math.PI;
  const v = Math.max(e.speed, e.topSpeed * 0.7);
  const opp = sim.ents.filter((d) => d.team !== e.team && d.state !== 'down' && d.state !== 'falling');
  const designed = sim.run && e.team === sim.offIdx && sim.kind === 'scrimmage' && sim.frame(e.x, e.y).f < 0.5 && sim.t < (sim.handoffT ?? 0) + 2;
  let holeAng = null;
  if (designed && sim.run.aimL !== undefined) {
    const hp = sim.field(1.0, sim.run.aimL);
    holeAng = Math.atan2(hp.y - e.y, hp.x - e.x);
  }
  // Late-game clock: trailing team wants the sideline.
  const g = sim.game;
  let wantOOB = false;
  if (g && g.wantsOutOfBounds && g.wantsOutOfBounds(e.team)) wantOOB = true;
  const vision = e.r.bcv ?? 60;
  let best = base, bs = -Infinity;
  const toGoal = (goalX - e.x) * ad;
  for (const a of ANGLES) {
    const ang = base + a * (ad > 0 ? 1 : -1);
    const hx = Math.cos(ang), hy = Math.sin(ang);
    const fwd = hx * ad;
    let free = 0;
    let sidePen = 0;
    for (const s of [1, 2, 3.5, 5, 7, 9.5]) {
      const px = e.x + hx * s, py = e.y + hy * s;
      if (py < 0.6 || py > FIELD_WIDTH - 0.6) { sidePen = wantOOB ? -2.5 : 2 + (9.5 - s) * 0.25; break; }
      const tC = s / v;
      let minM = Infinity;
      for (const d of opp) {
        const dd = Math.hypot(d.x - px, d.y - py);
        let tD = Math.max(0, dd - 1.1) / d.topSpeed;
        if (d.engaged) tD += 0.85;
        if (d.stun > 0) tD += d.stun;
        const m = tD - tC;
        if (m < minM) minM = m;
      }
      if (minM < 0.08) break;
      free = s;
    }
    let sc = free * (0.55 + 0.45 * Math.max(0, fwd)) + fwd * 2.4 - sidePen;
    if (holeAng !== null) {
      let dh = Math.abs(ang - holeAng); if (dh > Math.PI) dh = Math.PI * 2 - dh;
      sc += Math.max(0, 1.5 - dh * 2.2);
    }
    if (toGoal < 6) sc += fwd * 3;
    if (wantOOB) sc += Math.abs(hy) * 1.2;
    // Imperfect vision: lower-rated backs misread lanes a little.
    sc += (sim.rng.next() - 0.5) * (1 - vision / 100) * 2.2;
    if (sc > bs) { bs = sc; best = ang; }
  }
  // Smooth heading changes
  if (e.runHeading !== undefined && e.runHeading !== null) {
    let d = best - e.runHeading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return e.runHeading + d * 0.45;
  }
  return best;
}

function cpuMoves(sim, e, dt, ad) {
  if ((e.moveCd || 0) > 0) { e.moveCd -= dt; return; }
  let threat = null, td = 2.6;
  for (const d of sim.ents) {
    if (d.team === e.team || !d.isActive() || d.engaged) continue;
    const dd = dist(d.x, d.y, e.x, e.y);
    if (dd > td) continue;
    const toD = Math.atan2(d.y - e.y, d.x - e.x);
    let da = Math.abs(toD - Math.atan2(e.vy, e.vx)); if (da > Math.PI) da = Math.PI * 2 - da;
    if (da > 1.3) continue;
    threat = d; td = dd;
  }
  if (!threat || threat.id === e.lastMoveVs) return;
  e.lastMoveVs = threat.id;
  const r = e.r;
  const best = Math.max(r.jkm ?? 50, r.spm ?? 50, r.trk ?? 50, r.sfa ?? 50);
  const diff = sim.isUser(1 - e.team) ? [0.6, 0.85, 1.0, 1.15][sim.difficulty] : 1;
  const p = clamp((0.08 + (best - 60) * 0.006) * diff, 0.03, 0.35);
  if (!sim.rng.chance(p)) { e.moveCd = 0.6; return; }
  const type = sim.rng.weighted(['juke', 'spin', 'stiff', 'truck', 'hurdle'], (k) => ({
    juke: (r.jkm ?? 50) ** 2, spin: (r.spm ?? 50) ** 2 * 0.6, stiff: (r.sfa ?? 50) ** 2 * 0.8,
    truck: (r.trk ?? 50) ** 2 * (e.mass > 220 ? 1 : 0.4), hurdle: ((r.agi ?? 50) - 60) * 30,
  }[k]));
  const side = Math.sign((threat.y - e.y) * (ad > 0 ? 1 : -1)) || 1;
  startMove(sim, e, type, -side, threat);
}

// Begin a special move. dirSign for jukes: +1 = to carrier's left (field +y when attacking +x)
export function startMove(sim, e, type, dirSign = 1, vs = null) {
  if (e.move && e.move.t < e.move.dur) return false;
  const r = e.r;
  const ad = sim.attackDir(e.team);
  const m = { type, t: 0, dur: 0.4, dir: dirSign, vs: vs ? vs.id : null };
  switch (type) {
    case 'juke': {
      m.dur = 0.34;
      m.evade = 0.18 + (r.jkm ?? 50) * 0.0042;
      const sp = Math.max(e.speed, 3);
      const fx = ad, fy = 0;
      // lateral burst
      e.vx = fx * sp * 0.55; e.vy = (dirSign * ad) * (2.6 + (r.agi ?? 60) * 0.022) + fy;
      e.anim = 'juke';
      break;
    }
    case 'spin': m.dur = 0.5; m.evade = 0.14 + (r.spm ?? 50) * 0.0042; e.anim = 'spin'; e.vx *= 0.8; e.vy *= 0.8; break;
    case 'stiff': m.dur = 0.6; e.anim = 'stiff'; break;
    case 'truck': m.dur = 0.5; e.anim = 'truck'; break;
    case 'hurdle': m.dur = 0.6; m.evade = 0.25 + (r.agi ?? 60) * 0.003; e.anim = 'hurdle'; break;
    case 'stutter': m.dur = 0.35; m.evade = 0.15 + (r.elu ?? 50) * 0.003; e.vx *= 0.45; e.vy *= 0.45; e.anim = 'juke'; break;
    case 'dive': m.dur = 0.4; e.anim = 'dive'; e.vx = ad * Math.max(4, e.speed); e.vy *= 0.5; break;
    case 'slide': m.dur = 0.35; e.anim = 'dive'; break;
    default: return false;
  }
  e.move = m;
  e.moveCd = 0.9;
  sim.events.push({ t: sim.t, type: 'move', move: type, id: e.id });
  return true;
}

// Returns true while the move overrides normal steering.
function updateMove(sim, e, dt) {
  const m = e.move;
  m.t += dt;
  const ad = sim.attackDir(e.team);
  if (m.t >= m.dur) {
    if (m.type === 'dive') { e.knockDown(e.vx * 0.5, e.vy * 0.5); e.contactX = e.x; e.move = null; return true; }
    if (m.type === 'slide') { e.knockDown(e.vx * 0.3, e.vy * 0.3); e.move = null; sim.endPlay({ reason: 'tackle', x: e.x, y: e.y, slide: true }); return true; }
    e.move = null;
    return false;
  }
  switch (m.type) {
    case 'juke': case 'stutter':
      e.setDesired(e.vx, e.vy); e.anim = 'juke'; return true;
    case 'spin':
      e.setDesired(ad * e.topSpeed * 0.75, e.vy * 0.5); e.anim = 'spin'; return true;
    case 'dive': case 'slide':
      e.setDesired(e.vx, e.vy); e.anim = 'dive'; return true;
    case 'hurdle':
      e.setDesired(ad * e.topSpeed * 0.85, e.vy); e.anim = 'hurdle'; return true;
    default:
      e.anim = m.type; return false; // stiff/truck: steer normally while the move is active
  }
}
