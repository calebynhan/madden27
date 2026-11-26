// Defensive AI: pass rush, man & zone coverage, run fits and pursuit.
import { FIELD_WIDTH } from '../core/constants.js';
import { clamp, dist } from '../core/util.js';
import { TUNE } from './tune.js';
import { runnerAI } from './runner.js';
import { zoneSpec, zoneLandmark, resolveManTarget, gapLateral } from './align.js';

// CPU defensive awareness multiplier vs a human offense (rookie..legend).
const DIFF_DEF = [1.35, 1.12, 1.0, 0.86]; // reaction delay multiplier

export function setupDefenseTasks(sim) {
  const nums = sim.nums;
  const st = nums.strong;
  const taken = new Set();
  const diff = sim.isUser(sim.offIdx) ? DIFF_DEF[sim.difficulty] : 1;
  for (const d of sim.def) {
    const a = d.assign;
    d.react = diff;
    d.reactRun = (0.18 + (99 - (d.r.prc ?? 60)) * 0.011) * diff;
    if (a.t === 'rush') d.task = { kind: 'rush', lane: a.lane };
    else if (a.t === 'blitz') {
      const side = a.side === 'S' ? st : -st;
      d.task = { kind: 'blitz', gapL: gapLateral(a.gap, side, nums, sim.off) };
    } else if (a.t === 'man') {
      let tgt = d.manTarget && !taken.has(d.manTarget) ? d.manTarget : resolveManTarget(a.target, nums);
      if (tgt && taken.has(tgt)) tgt = null;
      if (tgt) { taken.add(tgt); d.task = { kind: 'man', target: tgt }; }
      else {
        // No receiver for this assignment: drop to a short zone (or rob the middle).
        const zname = d.pos === 'CB' ? (a.target[0] === 'S' ? 'deep_third_S' : 'deep_third_W') : (d.pos === 'S' ? 'hole' : 'hook_M');
        d.task = zoneTask(sim, zname, st);
      }
    } else if (a.t === 'zone') d.task = zoneTask(sim, a.zone, st);
    else if (a.t === 'spy') d.task = { kind: 'spy' };
    else d.task = zoneTask(sim, 'hook_M', st);
    if (d.task.kind === 'zone') shadeZone(sim, d.task);
    if (d.task.kind === 'zone' && d.task.zs.deep) d.reactRun += d.pos === 'CB' ? 0.05 : TUNE.deepRunReact;
    if (sim.playAction) d.reactRun += (99 - (d.r.prc ?? 60)) * 0.009;
    // Press jam at the line
    if (d.task.kind === 'man' && sim.pressOn() && d.task.target.pos !== 'RB') {
      const r = d.task.target;
      if (dist(d.x, d.y, r.x, r.y) < 2.2) {
        const contest = ((d.r.prs ?? 50) - (r.r.rls ?? 50)) * 0.012 + (sim.rng.next() - 0.5) * 0.9;
        if (contest > 0.15) r.jam = 0.35 + contest * 0.6;
        else if (contest < -0.35) { d.stun = 0.35; d.beat = true; }
      }
    }
  }
}

// Zone landmarks move with the pre-snap coverage shading.
function shadeZone(sim, task) {
  const shade = sim.covAdj && sim.covAdj.shade;
  if (!shade || !task.lm) return;
  const lf = sim.frame(task.lm.x, task.lm.y);
  let f = lf.f, l = lf.l;
  if (shade === 'over') f += task.zs.deep ? 2.5 : 1.5;
  else if (shade === 'under') f -= task.zs.deep ? 1.5 : 1.2;
  else if (shade === 'inside') l -= Math.sign(l) * Math.min(2, Math.abs(l));
  else if (shade === 'outside') l += Math.sign(l || 1) * 2;
  task.lm = sim.field(Math.max(1, f), l);
}

function zoneTask(sim, zname, st) {
  const zs = zoneSpec(zname, st);
  const lm = zoneLandmark(zs, sim.losX, sim.ballY0, sim.dir);
  return { kind: 'zone', zs, lm };
}

export function updateDefense(sim, d, dt) {
  const c = sim.carrier;
  d.blocking = false;
  if (sim.ball.state === 'loose') return chaseBall(sim, d);
  if (c && c.team === d.team) return escortDef(sim, d, dt);
  const t = d.task;
  if (!t) return;
  // Ball in the air on a pass
  if (sim.ball.state === 'air' && sim.thrown) return playBallInAir(sim, d, dt);
  // Second-level read: linebackers / box safeties diagnose run vs pass from the
  // offensive line's first steps (play-action fools them for a moment).
  if (!sim.thrown && (d.pos === 'LB' || (d.pos === 'S' && !(t.kind === 'zone' && t.zs.deep))) && t.kind !== 'blitz' && t.kind !== 'rush' && !(c && c !== sim.qb && sim.phase === 'run' && sim.t > (d.readT || 0) + 0.6)) {
    if (d.readT === undefined) d.readT = (0.2 + (99 - (d.r.prc ?? 60)) * 0.008) * (d.react || 1);
    // Once the QB pulls the ball on an RPO, they see it and get back into coverage.
    const designedRun = !!sim.run && sim.run.scheme !== 'draw' && sim.run.scheme !== 'qb_draw' && !sim.rpoThrown;
    const pa = sim.playAction;
    const biteT = d.readT + 0.35 + (99 - (d.r.prc ?? 60)) * 0.014;
    const manOnWR = t.kind === 'man' && t.target && t.target.pos !== 'RB' && t.target.pos !== 'FB' && t.target.task?.kind === 'route';
    if (sim.t < d.readT) { d.stop(); d.anim = 'stance2'; eyesOnQB(sim, d); return; }
    // RPO: a defender responsible for the read receiver stays honest until the handoff.
    if (rpoHonest(sim, t)) return execTask(sim, d, dt);
    if (!manOnWR && (designedRun || (pa && sim.t < biteT))) {
      const df = sim.frame(d.x, d.y);
      // Key the back: flow with his track (with a read error that shrinks with
      // play recognition) and attack once he commits past the line.
      const back = (c && c !== sim.qb && c.team !== d.team) ? c : (sim.run ? sim.off.find((o) => o.tag === sim.run.ballTag) : sim.qb) || sim.qb;
      const bf = sim.frame(back.x, back.y);
      if (bf.f > -0.5 && back === c) return pursue(sim, d, c, dt);
      if (d.readErr === undefined) d.readErr = sim.rng.gauss() * (1 - (d.r.prc ?? 60) / 100) * 3.2;
      const bvl = (back.vy * sim.dir);
      const trackL = bf.l + bvl * 0.45 + d.readErr;
      const p = sim.field(Math.max(TUNE.lbFillDepth, df.f - 0.9), df.l + clamp(trackL - df.l, -4, 4) * 0.8);
      d.seek(p.x, p.y, 0.8, 0.6);
      d.anim = 'shuffle';
      d.faceTo = Math.atan2(back.y - d.y, back.x - d.x); // keyed on the back
      return;
    }
  }
  // Deep safeties: a read step at the snap, then fit the run downhill (alley players in
  // two-deep shells; the middle-of-field safety stays a little deeper) or bail on a pass
  // read. Play-action pulls them up for a moment before they recover.
  if (!sim.thrown && d.pos === 'S' && t.kind === 'zone' && t.zs.deep) {
    if (d.readT === undefined) d.readT = (0.22 + (99 - (d.r.prc ?? 60)) * 0.008) * (d.react || 1);
    // On an RPO the safeties keep their eyes on the QB until the ball is handed off.
    const designedRun = !!sim.run && sim.run.scheme !== 'draw' && sim.run.scheme !== 'qb_draw' && (!sim.rpo || sim.run.handoffDone);
    const pa = sim.playAction;
    const biteT = d.readT + 0.2 + (99 - (d.r.prc ?? 60)) * 0.012;
    const df = sim.frame(d.x, d.y);
    if (sim.t < d.readT) {
      const p = sim.field(df.f + 0.6, df.l);
      d.seek(p.x, p.y, 0.3, 0.4);
      d.anim = 'backpedal';
      eyesOnQB(sim, d);
      return;
    }
    if (designedRun || (pa && sim.t < biteT)) {
      const back = (c && c !== sim.qb && c.team !== d.team) ? c : (sim.run ? sim.off.find((o) => o.tag === sim.run.ballTag) : sim.qb) || sim.qb;
      const bf = sim.frame(back.x, back.y);
      if (back === c && bf.f > -0.5) return pursue(sim, d, c, dt);
      const post = !t.zs.side;
      const fitF = (post ? TUNE.postFitDepth : TUNE.alleyFitDepth) + (pa && !designedRun ? 1.5 : 0);
      const p = sim.field(Math.max(fitF, df.f - 1.5), df.l + clamp(bf.l - df.l, -5, 5) * 0.6);
      d.seek(p.x, p.y, 0.9, 0.6);
      d.anim = 'run';
      return;
    }
  }
  // Ball carrier is a runner (run play, scramble, after catch)
  const runnerPhase = c && c.team !== d.team && (sim.phase === 'run' || c !== sim.qb || c.qbRunner);
  if (runnerPhase) {
    if (!sim.runRecognizedT) sim.runRecognizedT = sim.t;
    const since = sim.t - sim.runRecognizedT;
    const afterCatch = sim.thrown;
    // Defenders who already broke on the thrown ball keep coming; others need a beat.
    const sawThrow = afterCatch && d.ballReactT && d.ballReactT <= (sim.catchT ?? sim.t);
    const react = afterCatch ? (sawThrow ? 0 : 0.12 + (99 - (d.r.awr ?? 60)) * 0.003) : d.reactRun;
    if (since < react) {
      // Still executing assignment (play-action fooled, coverage carrying receivers)
      return execTask(sim, d, dt);
    }
    // Option responsibility: play-side DBs take the pitch man while the QB still has the ball.
    if (sim.run && sim.run.optionLive && c === sim.qb && (d.pos === 'CB' || d.pos === 'S')) {
      const rb = sim.off.find((o) => o.tag === 'RB' && o.isActive());
      if (rb && (sim.frame(d.x, d.y).l - sim.frame(c.x, c.y).l) * sim.run.side > -3) return pursue(sim, d, rb, dt);
    }
    // Deep defenders hold until the runner crosses the line.
    if (!afterCatch && t.kind === 'zone' && t.zs.deep && d.pos !== 'CB' && sim.frame(c.x, c.y).f < 1.0 && since < react + TUNE.deepRunHold) return execTask(sim, d, dt);
    return pursue(sim, d, c, dt);
  }
  return execTask(sim, d, dt);
}

function rpoHonest(sim, t) {
  if (!sim.rpo || !sim.run || sim.run.handoffDone) return false;
  const rec = sim.off.find((o) => o.tag === sim.rpo.tag);
  if (!rec) return false;
  if (t.kind === 'man') return t.target === rec;
  if (t.kind === 'zone' && !t.zs.deep && t.lm) {
    const lf = sim.frame(t.lm.x, t.lm.y), rf = sim.frame(rec.x, rec.y);
    return Math.sign(lf.l) === Math.sign(rf.l) && Math.abs(lf.l) > 2.5;
  }
  return false;
}

// Coverage footwork: backpedal or shuffle facing the QB; open the hips and run only when
// he has to cover ground away from the QB at speed.
function eyesOnQB(sim, d) {
  if (sim.thrown || !sim.qb || !sim.qb.isActive()) return;
  const qb = sim.carrier && sim.carrier.team !== d.team ? sim.carrier : sim.qb;
  const toQB = Math.atan2(qb.y - d.y, qb.x - d.x);
  const sp = d.speed;
  if (sp < 0.6) { d.faceTo = toQB; return; }
  let diff = Math.abs(Math.atan2(d.vy, d.vx) - toQB);
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  if (sp > 5.6 && diff > 1.9) return;
  d.faceTo = toQB;
  d.anim = diff > 2.1 ? 'backpedal' : diff > 0.9 ? 'shuffle' : 'run';
}

function execTask(sim, d, dt) {
  const t = d.task;
  switch (t.kind) {
    case 'rush': return passRush(sim, d, dt, t.lane === 'contain');
    case 'blitz': return blitz(sim, d, dt);
    case 'man': manCover(sim, d, dt); return eyesOnQB(sim, d);
    case 'zone': zoneCover(sim, d, dt); return eyesOnQB(sim, d);
    case 'spy': return spy(sim, d, dt);
    default: d.stop();
  }
}

function qbTarget(sim) {
  const qb = sim.carrier && sim.carrier.side === 'O' ? sim.carrier : sim.qb;
  return qb;
}

function passRush(sim, d, dt, contain) {
  const qb = qbTarget(sim);
  if (!qb) { d.stop(); return; }
  d.anim = 'run';
  const df = sim.frame(d.x, d.y);
  const qf = sim.frame(qb.x, qb.y);
  // Run play before recognition: attack the gap and squeeze.
  let tl = qf.l, tf = qf.f;
  if (contain) {
    const side = Math.sign(df.l || 1);
    tl = qf.l + side * 1.6;
    // Don't let the QB escape outside: stay level-ish if he flushes.
    if (Math.abs(qf.l) > Math.abs(df.l) - 0.5 && Math.sign(qf.l) === side) tl = qf.l + side * 2.2;
  } else {
    // Interior rushers work toward the QB through their lane.
    if (df.f > qf.f + 2) tl = df.l + (qf.l - df.l) * 0.5;
  }
  const p = sim.field(tf, tl);
  d.seek(p.x, p.y, 1, 0.2);
}

function blitz(sim, d, dt) {
  const qb = qbTarget(sim);
  const df = sim.frame(d.x, d.y);
  d.anim = 'run';
  if (df.f > 0.6) {
    const p = sim.field(0.2, d.task.gapL);
    d.seek(p.x, p.y, 1, 0.1);
    return;
  }
  if (qb) d.seek(qb.x, qb.y, 1, 0.1);
}

function spy(sim, d, dt) {
  const qb = qbTarget(sim);
  if (!qb) return d.stop();
  const qf = sim.frame(qb.x, qb.y);
  const p = sim.field(Math.max(4.5, qf.f + 6), qf.l);
  d.seek(p.x, p.y, 0.8, 1);
  d.anim = 'shuffle';
  d.face = Math.atan2(qb.y - d.y, qb.x - d.x);
}

// Look up where a receiver was `delay` seconds ago (reaction lag).
function lagged(r, delay) {
  const h = r.hist;
  if (!h || h.length < 2) return { x: r.x, y: r.y, vx: r.vx, vy: r.vy };
  const n = Math.min(h.length - 1, Math.round(delay * 60));
  return h[h.length - 1 - n];
}

function manCover(sim, d, dt) {
  const r = d.task.target;
  if (!r || !r.isActive()) return zoneFallback(sim, d);
  // Receiver stayed in to block: green-dog blitz (LB) or rob the middle.
  if (r.task && (r.task.kind === 'passblock') && sim.t > 0.6) {
    if (d.pos === 'LB') { d.task = { kind: 'blitz', gapL: sim.frame(r.x, r.y).l }; return blitz(sim, d, dt); }
    d.task = zoneTask(sim, 'hole', sim.nums.strong); return zoneCover(sim, d, dt);
  }
  const mcv = d.r.mcv ?? 50;
  let delay = clamp(0.3 - (mcv - 50) * 0.0042 + ((r.r.rte ?? 60) - 70) * 0.0032, 0.07, 0.45) * (d.react || 1) * TUNE.manDelayK;
  if (d.beat) delay += 0.15;
  const L = lagged(r, delay);
  const rf = sim.frame(L.x, L.y);
  const df = sim.frame(d.x, d.y);
  const inside = rf.l > 0 ? -1 : 1;
  const deep = rf.f > 8;
  // Off-man cushion early in the route
  let tf = rf.f + 0.15, tl = rf.l + inside * 0.55;
  // Covering a back who is still in the backfield: sit at linebacker depth and mirror.
  if ((r.pos === 'RB' || r.pos === 'FB') && rf.f < 1) { tf = Math.max(3.2, rf.f + 3); tl = rf.l; }
  if (sim.t < 1.2 && !sim.pressOn() && df.f > rf.f + 1.5) tf = Math.max(rf.f + 2.2, df.f - 0.4);
  if (deep) tf = rf.f + 0.4;
  // Coverage shading called pre-snap: give up one thing to take away another.
  const shade = sim.covAdj && sim.covAdj.shade;
  if (shade === 'inside') tl += inside * 0.8;
  else if (shade === 'outside') tl -= inside * 1.3;
  else if (shade === 'under') tf -= 1.2;
  else if (shade === 'over') tf += 1.5;
  // Predict along lagged velocity
  const lead = delay * 0.9;
  const p = sim.field(tf, tl);
  p.x += L.vx * lead; p.y += L.vy * lead;
  const dd = dist(d.x, d.y, p.x, p.y);
  d.seek(p.x, p.y, 1, 0.35);
  d.anim = df.f > rf.f + 1 && sim.t < 1.5 ? 'backpedal' : 'run';
  void dd;
}

function zoneFallback(sim, d) {
  d.task = zoneTask(sim, d.pos === 'CB' ? 'flat_S' : 'hook_M', sim.nums.strong);
}

function zoneCover(sim, d, dt) {
  const { zs, lm } = d.task;
  const lmf = sim.frame(lm.x, lm.y);
  const qb = qbTarget(sim);
  const dropT = 0.25 + zs.depth / 7;
  d.anim = 'backpedal';
  // Find threats (seen with a reaction lag that depends on zone skill)
  const zlag = clamp(0.32 - ((d.r.zcv ?? 60) - 50) * 0.004, 0.08, 0.4) * (d.react || 1) * TUNE.zoneLagK;
  let threat = null, tscore = -Infinity;
  for (const r of sim.off) {
    if (!r.eligible || !r.route || r.task.kind !== 'route') continue;
    const L = lagged(r, zlag);
    const px = L.x + L.vx * 0.3, py = L.y + L.vy * 0.3;
    const pf = sim.frame(px, py);
    const dx = (pf.l - lmf.l) / (zs.rx * 1.15);
    const dfz = (pf.f - lmf.f) / (zs.rf * 1.1);
    let inZone;
    if (zs.deep) inZone = Math.abs(dx) < 1 && pf.f > lmf.f - zs.rf * 0.9;
    else inZone = dx * dx + dfz * dfz < 1;
    if (!inZone) continue;
    // Underneath defenders sink under the deeper route (high-low stretches them).
    const sc = zs.deep ? pf.f : pf.f * 0.6 - Math.hypot(pf.l - lmf.l, pf.f - lmf.f) * 0.5;
    if (sc > tscore) { tscore = sc; threat = { r, pf }; }
  }
  let tf = lmf.f, tl = lmf.l;
  if (threat) {
    const pf = threat.pf;
    if (zs.deep) {
      tf = Math.max(pf.f + 2.8, lmf.f - 3);
      tl = clamp(pf.l, lmf.l - zs.rx * 1.3, lmf.l + zs.rx * 1.3);
    } else {
      // Sit underneath the route, between receiver and QB.
      const qf = qb ? sim.frame(qb.x, qb.y) : { f: -5, l: 0 };
      const vx = qf.f - pf.f, vy = qf.l - pf.l;
      const vl = Math.hypot(vx, vy) || 1;
      // Blend between the landmark and a spot under the route (zones don't man up).
      tf = (pf.f + (vx / vl) * 1.6) * TUNE.zoneBlend + lmf.f * (1 - TUNE.zoneBlend);
      tl = (pf.l + (vy / vl) * 1.6) * TUNE.zoneBlend + lmf.l * (1 - TUNE.zoneBlend);
      tf = clamp(tf, lmf.f - zs.rf, lmf.f + zs.rf);
      tl = clamp(tl, lmf.l - zs.rx * 1.1, lmf.l + zs.rx * 1.1);
    }
  } else if (qb && qb.readIdx !== undefined && sim.offPlay.reads) {
    // Read the QB's eyes slightly
    const look = sim.off.find((o) => o.tag === sim.offPlay.reads[qb.readIdx]);
    if (look) { const lf = sim.frame(look.x, look.y); tl += clamp(lf.l - tl, -2.5, 2.5) * ((d.r.zcv ?? 60) / 140); }
  }
  const p = sim.field(tf, tl);
  p.y = clamp(p.y, 0.8, FIELD_WIDTH - 0.8);
  const speed = sim.t < dropT ? 0.85 : 0.9;
  d.seek(p.x, p.y, speed, 0.9);
  if (qb) d.face = Math.atan2(qb.y - d.y, qb.x - d.x);
}

function playBallInAir(sim, d, dt) {
  const fl = sim.ball.flight;
  if (!fl) return execTask(sim, d, dt);
  // Screens and bubbles develop right in front of the second level: nearby defenders see
  // them immediately and attack the spot where the receiver will turn upfield.
  const screenThrow = !!(fl.target && fl.target.route && fl.target.route.depthClass === 'screen');
  const nearScreen = screenThrow && dist(d.x, d.y, fl.tx, fl.ty) < 15;
  if (!d.ballReactT) d.ballReactT = sim.t + (nearScreen ? 0.03 + (99 - (d.r.prc ?? 60)) * 0.0015 : 0.08 + (99 - (d.r.awr ?? 60)) * 0.0035 + (d.task.kind === 'man' ? 0.08 : 0)) * (d.react || 1);
  if (nearScreen && sim.t >= d.ballReactT && d.task.kind !== 'rush') {
    const ad = sim.attackDir(sim.offIdx);
    d.seek(fl.tx + ad * 1.6, fl.ty, 1, 0.3);
    d.anim = 'run';
    return;
  }
  if (sim.t < d.ballReactT || d.task.kind === 'rush' || d.task.kind === 'blitz') {
    if (d.task.kind === 'rush' || d.task.kind === 'blitz') { // rushers peel back toward the catch
      if (sim.t > d.ballReactT + 0.3) return d.seek(fl.tx, fl.ty, 0.9, 1);
    }
    return execTask(sim, d, dt);
  }
  const remain = Math.max(0.02, fl.T - fl.t);
  const dd = dist(d.x, d.y, fl.tx, fl.ty);
  const canReach = (dd - 1.2) / d.topSpeed < remain + 0.2;
  if (canReach || dd < 6) d.seek(fl.tx, fl.ty, 1, 0.3);
  else {
    // Converge on the receiver to make the tackle
    const tgt = fl.target || sim.target;
    if (tgt) d.seek(tgt.x + (fl.tx - tgt.x) * 0.6, tgt.y + (fl.ty - tgt.y) * 0.6, 1, 0.5);
  }
  d.anim = remain < 0.3 && dd < 2 ? 'swat' : 'run';
}

export function pursue(sim, d, c, dt) {
  d.anim = 'run';
  const dd = dist(d.x, d.y, c.x, c.y);
  const csp = Math.hypot(c.vx, c.vy);
  const ad = sim.attackDir(c.team);
  // Is this defender trailing the play (behind the carrier relative to his path)?
  const behind = csp > 2 && ((d.x - c.x) * c.vx + (d.y - c.y) * c.vy) / (csp * Math.max(0.01, dd)) < -0.35;
  let tx, ty;
  if (behind) {
    // Chase straight down the carrier's line; leading him from behind only loses ground.
    tx = c.x + c.vx * 0.12; ty = c.y + c.vy * 0.12;
  } else {
    let T = dd / Math.max(1, d.topSpeed);
    T = clamp(T, 0, 1.6);
    const pur = d.r.pur ?? 60;
    const angleQual = 0.35 + pur * 0.0065; // 0.35..1.0 of the ideal lead
    // Forward lead is always taken; lateral lead only when the runner is coming
    // toward us — backside pursuers stay square to take away the cutback.
    const latTowardUs = Math.sign(c.vy) === Math.sign(d.y - c.y);
    const latLead = latTowardUs ? angleQual : angleQual * 0.35;
    tx = c.x + c.vx * T * angleQual;
    ty = c.y + c.vy * T * latLead;
    // Keep inside-out leverage: aim a little toward the carrier's goal side
    tx += ad * Math.min(1.5, dd * 0.08);
  }
  ty = clamp(ty, -1, FIELD_WIDTH + 1);
  // Rally: defenders close hard on a fresh catch (effort and angles).
  const rally = sim.catchT !== undefined && sim.t - sim.catchT < 2.0 && dd < 14 ? 1.05 : 1;
  d.speedCap = rally;
  d.seek(tx, ty, rally, 0.15);
  // Dive at a runner who is about to get away (only from realistic range).
  if (!d.lunge && d.tackleCd <= 0 && dd > 1.25 && dd < 1.85 && !d.user) {
    const closing = ((c.x - d.x) * (d.vx - c.vx) + (c.y - d.y) * (d.vy - c.vy)) / dd;
    if (closing < 0.8 && closing > -2.5 && sim.rng.chance(0.55)) {
      d.lunge = 0.28;
      const a = Math.atan2(c.y + c.vy * 0.15 - d.y, c.x + c.vx * 0.15 - d.x);
      const sp = Math.max(d.speed, d.topSpeed * 0.9) * 1.15;
      d.vx = Math.cos(a) * sp; d.vy = Math.sin(a) * sp;
      d.setDesired(d.vx, d.vy);
      d.anim = 'dive';
    }
  }
}

function chaseBall(sim, d) {
  const b = sim.ball;
  d.seek(b.x, b.y, 1, 0.1);
  d.anim = 'run';
}

function escortDef(sim, d, dt) {
  // Defense has the ball (interception/fumble return): block the nearest pursuer.
  const c = sim.carrier;
  if (d === c) { d.blocking = false; return runnerAI(sim, d, dt); }
  d.blocking = true;
  const opp = sim.ents.filter((o) => o.team !== d.team && o.isActive() && !o.engaged);
  let best = null, bs = Infinity;
  for (const o of opp) {
    const sc = dist(o.x, o.y, c.x, c.y) + dist(o.x, o.y, d.x, d.y) * 0.5;
    if (sc < bs) { bs = sc; best = o; }
  }
  const react = 0.3 + (99 - (d.r.awr ?? 60)) * 0.006;
  if (sim.t - (sim.turnoverT || 0) < react) { d.stop(); return; }
  if (best && dist(best.x, best.y, d.x, d.y) < 12) d.seek(best.x + (c.x - best.x) * 0.25, best.y + (c.y - best.y) * 0.25, 1, 0.3);
  else { const ad = sim.attackDir(d.team); d.seek(c.x + ad * 4, c.y, 0.8, 1); }
}
