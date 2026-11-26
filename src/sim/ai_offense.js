// Offensive AI: tasks are assigned at play setup and executed every tick.
import { FIELD_WIDTH } from '../core/constants.js';
import { clamp, dist } from '../core/util.js';
import { ROUTES } from '../data/routes.js';
import { runnerAI } from './runner.js';
import { TUNE } from './tune.js';
import { evalTarget, throwBall, throwAway, startThrow } from './passing.js';
import { buildRoute } from './play.js';

const DIFF_QB = [0.78, 0.92, 1.0, 1.08]; // CPU QB processing by difficulty (rookie..legend)

export function setupOffenseTasks(sim) {
  const play = sim.offPlay;
  const flipM = sim.flip ? -1 : 1;
  const type = play.type;
  sim.playType = type === 'run' ? 'run' : type === 'kneel' ? 'kneel' : type === 'spike' ? 'spike' : 'pass';
  const isRun = type === 'run';
  if (isRun) {
    const s = (play.run.side || 1) * flipM;
    sim.run = { scheme: play.run.scheme, side: s, ballTag: play.run.ball || 'RB', handoffDone: false };
    const aims = { dive: 0.7, iz: 2.0, oz: 5.0, iso: 1.3, power: 3.0, counter: 2.6, toss: 6.2, draw: 1.0, sneak: 0.4, qb_draw: 1.2, read: 2.0, option: 6.5 };
    sim.run.aimL = s * (aims[play.run.scheme] ?? 2);
  }
  sim.rpo = isRun && play.rpo ? { tag: play.rpo.tag, route: play.rpo.route } : null;
  if (type === 'pa') sim.playAction = true;
  sim.dropType = play.drop || 'm';
  sim.boot = play.drop === 'boot' ? (play.side || 1) * flipM : 0;
  sim.screenTag = play.screen || null;
  for (const e of sim.off) {
    if (e.pos === 'OL') { e.task = { kind: isRun ? 'runblock' : 'passblock' }; continue; }
    if (e.pos === 'QB') { e.task = { kind: 'qb' }; continue; }
    let rk = sim.hotRoutes[e.tag] || play.routes[e.tag];
    if (isRun) {
      if (sim.rpo && e.tag === sim.rpo.tag && !sim.hotRoutes[e.tag]) e.task = { kind: 'route', key: sim.rpo.route };
      else if (sim.run.scheme === 'option' && e.tag === 'RB') e.task = { kind: 'runpath' };
      else if (e.tag === sim.run.ballTag) e.task = { kind: 'runpath' };
      else if (e.pos === 'FB' || (e.pos === 'RB' && e.tag !== sim.run.ballTag)) e.task = { kind: 'lead' };
      else if (e.pos === 'TE' && Math.abs(e.alignL) < 6) e.task = { kind: 'runblock' };
      else e.task = { kind: 'stalk' };
      continue;
    }
    if (!rk || rk === 'block') {
      e.task = { kind: 'passblock' };
      if (sim.playAction && (e.pos === 'RB' || e.pos === 'FB') && e.tag === 'RB') e.task = { kind: 'pafake', then: 'passblock' };
    } else if (rk === 'run_block') e.task = { kind: 'stalk' };
    else {
      e.task = { kind: 'route', key: rk };
      if (sim.playAction && e.tag === 'RB') e.task = { kind: 'pafake', then: 'route', key: rk };
    }
  }
  // Receiver icons (1-5) in read order, then other route runners, then backs.
  const icons = [];
  const push = (e) => { if (e && e.eligible && !icons.includes(e) && icons.length < 5) icons.push(e); };
  for (const tag of play.reads || []) push(sim.off.find((o) => o.tag === tag));
  for (const o of sim.off) if (o.task && o.task.kind === 'route') push(o);
  for (const o of sim.off) if (o.task && o.task.kind === 'pafake') push(o);
  for (const o of sim.off) push(o);
  sim.icons = icons;
  if (isRun) setupRunBlocking(sim);
}

// Re-run task assignment after pre-snap changes (hot routes, audibles).
export function refreshIcons(sim) {
  const play = sim.offPlay;
  const icons = [];
  const push = (e) => { if (e && e.eligible && !icons.includes(e) && icons.length < 5) icons.push(e); };
  for (const tag of play.reads || []) { const e = sim.off.find((o) => o.tag === tag); if (e && e.task.kind !== 'passblock') push(e); }
  for (const o of sim.off) if (o.task && (o.task.kind === 'route' || o.task.kind === 'pafake')) push(o);
  for (const o of sim.off) push(o);
  sim.icons = icons;
}

// Assign run-blocking targets at the snap (defense positions are final then).
export function setupRunBlocking(sim) {
  const s = sim.run.side;
  const scheme = sim.run.scheme;
  const defs = sim.def.map((d) => ({ d, ...sim.frame(d.x, d.y) }));
  const taken = new Set();
  const blockers = sim.off.filter((e) => e.task.kind === 'runblock').map((e) => ({ e, ...sim.frame(e.x, e.y) }));
  blockers.sort((a, b) => (b.l - a.l) * s); // playside first
  // Pullers
  if (scheme === 'power' || scheme === 'counter') {
    const bsG = blockers.find((b) => b.e.tag === (s > 0 ? 'LG' : 'RG'));
    if (bsG) { bsG.e.task = { kind: 'pull', toL: s * 3.6 }; }
    if (scheme === 'counter') {
      const bsT = blockers.find((b) => b.e.tag === (s > 0 ? 'LT' : 'RT'));
      if (bsT) bsT.e.task = { kind: 'pull', toL: s * 4.4 };
    }
  }
  const zoneBias = scheme === 'oz' || scheme === 'toss' ? 1.6 : scheme === 'power' || scheme === 'counter' ? -0.5 : 0.8;
  for (const b of blockers) {
    if (b.e.task.kind !== 'runblock') continue;
    let best = null, bs = Infinity;
    for (const x of defs) {
      if (taken.has(x.d)) continue;
      if (x.f > 9) continue;
      const lbPen = x.d.pos === 'DL' ? 0 : 1.3;
      const sc = Math.abs(x.l - (b.l + s * zoneBias)) + lbPen + Math.max(0, x.f - 1.5) * 0.35;
      if (sc < bs) { bs = sc; best = x; }
    }
    if (best && bs < 5.5) { taken.add(best.d); b.e.task.target = best.d; }
    else {
      // Climb to the nearest linebacker
      const lb = defs.filter((x) => !taken.has(x.d) && x.d.pos !== 'DL' && x.f < 10).sort((p, q) => Math.abs(p.l - b.l) - Math.abs(q.l - b.l))[0];
      if (lb) { taken.add(lb.d); b.e.task.target = lb.d; }
    }
  }
  sim.runBlockTaken = taken;
}

const BLOCK_KINDS = new Set(['passblock', 'runblock', 'pull', 'lead', 'stalk', 'screenblock']);

export function updateOffense(sim, e, dt) {
  const t = e.task;
  if (!t) return;
  // Anyone holding the ball (other than a QB still in the pocket) runs with it.
  if (e.hasBall && (e.pos !== 'QB' || e.qbRunner || sim.phase === 'run')) {
    e.blocking = false;
    if (e === sim.qb && sim.run && sim.run.optionLive && optionRead(sim, e, dt)) return;
    return runnerAI(sim, e, dt);
  }
  if (sim.run && sim.run.optionLive && e.tag === 'RB' && t.kind === 'runpath') { e.blocking = false; return runPath(sim, e, dt); }
  e.blocking = BLOCK_KINDS.has(t.kind) && !(t.kind === 'pull' && !t.turned) && !(t.kind === 'lead' && sim.frame(e.x, e.y).f < -1.5);
  if (t.kind === 'screenblock' && sim.t < 1.4) e.blocking = false;
  if (sim.carrier && sim.carrier.team === e.team && sim.carrier !== e && e.pos !== 'QB' && (sim.phase === 'run' || sim.carrier.team !== sim.offIdx)) e.blocking = true;
  // Once someone other than the QB carries the ball (or the QB runs), everybody blocks for him.
  const c = sim.carrier;
  if (c && c.team === e.team && c !== e && (sim.phase === 'run' || c.team !== sim.offIdx)) {
    if (e.pos === 'OL' && e.task.kind === 'runblock' && e.task.target && sim.t < 3) return runBlock(sim, e, dt);
    return escort(sim, e, dt);
  }
  if (c && c.team !== e.team) return pursueAsOffense(sim, e, dt);
  switch (t.kind) {
    case 'qb': return qbThink(sim, e, dt);
    case 'passblock': return passBlock(sim, e, dt);
    case 'runblock': return runBlock(sim, e, dt);
    case 'pull': return pullBlock(sim, e, dt);
    case 'lead': return leadBlock(sim, e, dt);
    case 'stalk': return stalkBlock(sim, e, dt);
    case 'route': return runRoute(sim, e, dt);
    case 'pafake': return paFake(sim, e, dt);
    case 'runpath': return runPath(sim, e, dt);
    case 'screenblock': return screenBlock(sim, e, dt);
    default: e.stop();
  }
}

// --------------------------------------------------------------------- QB
function qbThink(sim, e, dt) {
  if (e.hasBall && (sim.phase === 'run' || e.qbRunner)) return runnerAI(sim, e, dt);
  const pt = sim.playType;
  if (pt === 'kneel') {
    e.stop(); e.anim = 'kneel';
    if (e.hasBall && sim.t > 0.35) sim.endPlay({ reason: 'kneel', x: e.x, y: e.y });
    return;
  }
  if (pt === 'spike') {
    e.stop();
    if (e.hasBall && sim.t > 0.3) { e.anim = 'throw'; sim.spike(); }
    return;
  }
  if (sim.run) return qbRunPlay(sim, e, dt);
  if (sim.thrown) { e.stop(); if (e.animT > 0.5) e.anim = 'idle'; return; }
  if (sim.pendingThrow) { e.setDesired(e.vx * 0.5, e.vy * 0.5); e.anim = 'throw'; return; } // stepping into the throw
  if (!e.hasBall) { e.stop(); return; } // waiting on the shotgun snap
  // Dropback
  const gun = sim.form.qb !== 'center';
  // Drop depths (yards behind the snap point): 1/3/5-step from the gun, 3/5/7-step under center
  const dropDepth = { q: gun ? 1.2 : 3.2, m: gun ? 3.0 : 5.4, d: gun ? 4.4 : 7.2, pa: gun ? 3.0 : 6.5, boot: gun ? 2.0 : 5.5, screen: gun ? 4 : 7 }[sim.dropType] ?? 4;
  if (!sim.qbDrop) {
    sim.qbDrop = { f: gun ? -5 - dropDepth : -dropDepth - 1.0, set: false, setT: 0 };
  }
  const qd = sim.qbDrop;
  // Play-action fake: QB meets the back first.
  if (sim.playAction && sim.t < 0.65) {
    const rb = sim.off.find((o) => o.task.kind === 'pafake');
    if (rb) { const p = sim.field(gun ? -5 : -3.6, (rb.alignL >= 0 ? 0.6 : -0.6)); e.seek(p.x, p.y, 0.6, 0.6); e.anim = 'handoff'; return; }
  }
  if (sim.boot && !qd.set) {
    const p = sim.field(gun ? -7 : -6, sim.boot * 6.5);
    const d = e.seek(p.x, p.y, 0.8, 1);
    e.anim = 'carry';
    if (d < 1.4 || sim.t > 2.0) { qd.set = true; qd.setT = sim.t; }
  } else if (!qd.set) {
    const p = sim.field(qd.f, sim.frame(e.x, e.y).l * 0.9);
    // Dropback footwork is slower than running; the QB plants and resets at the top.
    const d = e.seek(p.x, p.y, TUNE.dropSpeed, 0.4);
    e.anim = 'backpedal';
    if (d < 0.35 || sim.t > 1.9) { qd.set = true; qd.setT = sim.t + TUNE.setHitch; }
  }
  if (sim.boot && qd.set) {
    // Keep rolling toward the sideline while reading.
    const p = sim.field(sim.frame(e.x, e.y).f, sim.boot * 14);
    e.seek(p.x, p.y, 0.45, 2);
  } else if (qd.set) {
    pocketPresence(sim, e, dt);
  }
  if (e.user && sim.ctl(e.team)) return;
  cpuPassDecision(sim, e, dt);
}

function pocketPresence(sim, e, dt) {
  // Slide away from the nearest free rusher, step up if pressured from the edge.
  let px = 0, py = 0, threat = 0;
  for (const d of sim.def) {
    if (!d.isActive() || d.engaged) continue;
    const dd = dist(d.x, d.y, e.x, e.y);
    if (dd < 5) { const w = (5 - dd) / 5; px += (e.x - d.x) / dd * w; py += (e.y - d.y) / dd * w; threat += w; }
  }
  if (threat > 0.15) {
    // Prefer stepping up (toward LOS) and lateral escape over retreating.
    const fx = px, fy = py;
    let ux = fx, uy = fy;
    if ((ux * sim.dir) < 0) ux *= 0.3; // don't drift backward much
    const l = Math.hypot(ux, uy) || 1;
    e.setDesired(ux / l * e.topSpeed * 0.55, uy / l * e.topSpeed * 0.55);
    e.anim = 'shuffle';
  } else {
    e.stop(); e.anim = 'idle';
  }
  sim.pressure = threat;
}

function cpuPassDecision(sim, qb, dt) {
  const play = sim.offPlay;
  const qd = sim.qbDrop;
  const diff = sim.isUser(sim.defIdx) ? DIFF_QB[sim.difficulty] : 1.0;
  const awr = qb.r.awr * diff;
  const quick = sim.dropType === 'q';
  const readStart = quick ? TUNE.quickRead : sim.dropType === 'screen' ? 1.0 : (qd.set ? qd.setT : 99);
  if (sim.t < readStart) return;
  if (sim.screenTag) {
    const r = sim.off.find((o) => o.tag === sim.screenTag);
    if (r && sim.t > (r.route?.delay || 0.35) + 0.45) {
      startThrow(sim, qb, r, 'touch', null);
      return;
    }
    if (sim.t > 2.4) throwAway(sim, qb);
    return;
  }
  const reads = (play.reads || []).map((tag) => sim.off.find((o) => o.tag === tag)).filter((r) => r && r.task.kind === 'route');
  if (!reads.length) { const any = sim.off.filter((o) => o.task.kind === 'route'); reads.push(...any); }
  if (!reads.length) { if (sim.t > 2) throwAway(sim, qb); return; }
  // Time to work from one read to the next (NFL starters ~0.45-0.6 s)
  const interval = clamp(0.88 - awr * 0.0048, 0.4, 0.68);
  const elapsed = sim.t - readStart;
  const readIdx = Math.min(reads.length - 1, Math.floor(elapsed / interval));
  qb.readIdx = readIdx;
  const pressure = sim.pressure || 0;
  const underFire = sim.def.some((d) => d.isActive() && !d.engaged && dist(d.x, d.y, qb.x, qb.y) < 2.2);
  // Evaluate current and previous reads (QBs come back to earlier reads quickly).
  // Each option is valued as completion chance x expected yards (air + room to run),
  // with the line to gain dominating on third and fourth down.
  const down = sim.game ? sim.game.down : 1;
  const toGo = sim.lineToGain !== null && sim.lineToGain !== undefined ? Math.max(0.5, (sim.lineToGain - sim.losX) * sim.dir) : 10;
  const hailMary = play.tags.includes('hailmary');
  const lateDown = down >= 3;
  const valueOf = (r, i) => {
    const ev = evalTarget(sim, qb, r);
    if (!ev) return null;
    const m = ev.margin;
    // Fitted to simulated outcomes: depth drives completion odds; separation adds a little,
    // and genuinely covered throws (margin well below zero) fall off sharply.
    const pC = clamp(0.86 - Math.max(0, ev.depth - 5) * 0.012 + clamp(m, -0.25, 0.4) * 0.25 - Math.max(0, -0.25 - m) * 0.9 - (ev.type === 'lob' ? 0.08 : 0), 0.03, 0.95);
    const yac = clamp(m * 2.6 + 1.0, 0, 5);
    const exp = ev.depth + yac;
    let val;
    if (lateDown) {
      const reach = exp >= toGo ? 1 + Math.min(0.4, (exp - toGo) / 25) : clamp((exp - toGo * 0.45) / (toGo * 0.55), 0, 1) * 0.3;
      val = pC * (0.2 + reach) - (1 - pC) * 0.05;
    } else {
      val = pC * clamp(exp / 9, -0.3, 1.7) - (1 - pC) * 0.12;
    }
    if (ev.depth < 0 && !play.tags.includes('screen')) val -= 0.06;
    if (hailMary) val += 0.6;
    val -= i * 0.015;
    return { r, ev, val, pC };
  };
  // Throw on rhythm: a receiver is a live option once he reaches his break (aware QBs
  // anticipate it by a fraction of a second); quick-game and checkdown routes are live early.
  const antic = 0.08 + Math.max(0, awr - 70) * 0.011;
  const atBreak = (r) => {
    const rt = r.route;
    if (!rt || rt.idx > 0 || rt.depthClass === 'short' || rt.depthClass === 'screen' || quick) return true;
    const p0 = rt.pts[0];
    return dist(r.x, r.y, p0.x, p0.y) / Math.max(4, r.speed) < antic;
  };
  let best = null;
  for (let i = 0; i <= readIdx; i++) {
    const r = reads[i];
    if (r.route && r.route.delay && sim.t < r.route.delay + 0.2) continue;
    if (!atBreak(r)) continue;
    const o = valueOf(r, i);
    if (o && (!best || o.val > best.val)) best = o;
  }
  const smart = (awr - 70) * 0.004;
  const thr = Math.max(hailMary ? -1 : 0.14, 0.54 - smart - elapsed * 0.2 - (underFire ? 0.25 : 0));
  if (best && best.val > thr && best.pC > (underFire ? 0.3 : 0.42)) {
    sim.throwMargin = best.ev.margin;
    startThrow(sim, qb, best.r, best.ev.type, null);
    return;
  }
  // Internal clock: experienced QBs get the ball out once the play has run its course.
  const internalClock = elapsed > 1.3 + (awr - 70) * 0.006;
  // Hot: an unblocked rusher bearing down forces the ball out now. Aware QBs see the free
  // man earlier (and with the release time, earlier is what gets the throw off).
  const hotR = 3.4 + Math.max(0, awr - 60) * 0.045;
  const hot = sim.def.some((d) => {
    if (!d.isActive() || d.engaged) return false;
    const dd = dist(d.x, d.y, qb.x, qb.y);
    if (dd > hotR) return false;
    if (((qb.x - d.x) * d.vx + (qb.y - d.y) * d.vy) / Math.max(0.1, dd) < 1.5) return false; // not closing
    return !sim.off.some((o) => o !== qb && o.isActive() && (o.blocking || o.task?.kind === 'passblock') && dist(o.x, o.y, d.x, d.y) < 1.4);
  });
  const allRead = (readIdx >= reads.length - 1 && elapsed > interval * reads.length) || internalClock;
  if (underFire || allRead || hot) {
    // Checkdown: best of everyone
    let cd = null;
    for (let i = 0; i < reads.length; i++) {
      const o = valueOf(reads[i], 0);
      if (o && (!cd || o.pC * 0.6 + o.val * 0.4 > cd.pC * 0.6 + cd.val * 0.4)) cd = o;
    }
    if (cd && cd.pC > (hot || underFire ? 0.26 : internalClock ? 0.38 : 0.5)) { sim.throwMargin = cd.ev.margin; startThrow(sim, qb, cd.r, cd.ev.type, null); return; }
    // Scramble if there is room, otherwise throw it away or take the sack.
    // Nothing open: take off if there is room in front (mobile QBs sooner and more often).
    const mobile = qb.r.spd > 78;
    const room = !sim.def.some((d) => d.isActive() && dist(d.x, d.y, qb.x + sim.dir * 3, qb.y) < 3);
    if ((mobile || elapsed > 2.1) && room && sim.rng.chance(dt * (mobile ? 3.2 : 2.0))) { qb.qbRunner = true; sim.phase = 'run'; sim.playType = 'scramble'; return; }
    // Out of the pocket (bootleg/rollout) or past the internal clock with pressure
    // coming: smart QBs live to play another down.
    const outsidePocket = Math.abs(sim.frame(qb.x, qb.y).l) > 3.2;
    // ...and once the play has clearly broken down, get rid of it rather than hold on.
    const bailRate = (underFire ? 0.7 : hot ? 0.55 : 0) + (internalClock && (outsidePocket || hot) ? 0.85 : 0) + (elapsed > 2.8 ? 0.6 : 0);
    if (bailRate > 0 && elapsed > 0.5 && sim.rng.chance(dt * bailRate * (0.7 + (awr - 60) * 0.02))) {
      const outside = Math.abs(sim.frame(qb.x, qb.y).l) > 3.2;
      // Throw it at the feet of the nearest receiver (no grounding) or out of bounds.
      const nearRec = reads.slice().sort((a, b) => dist(a.x, a.y, qb.x, qb.y) - dist(b.x, b.y, qb.x, qb.y))[0];
      throwAway(sim, qb, outside ? null : nearRec);
      return;
    }
    if (elapsed > 4.8) throwAway(sim, qb);
  }
}

function qbRunPlay(sim, e, dt) {
  const run = sim.run;
  const gun = sim.form.qb !== 'center';
  const scheme = run.scheme;
  if (sim.pendingThrow) { e.setDesired(e.vx * 0.4, e.vy * 0.4); e.anim = 'throw'; return; } // RPO pull
  if (sim.thrown) { e.stop(); if (e.animT > 0.5) e.anim = 'idle'; return; }
  if (scheme === 'option' && e.hasBall) {
    // Speed option: take the snap and attack the edge with the back in pitch relationship.
    e.qbRunner = true; sim.phase = 'run'; sim.playType = 'run';
    sim.runRecognizedT = sim.runRecognizedT || sim.t;
    sim.stats.rusher = e.id;
    run.optionLive = true;
    run.optionT0 = sim.t;
    return;
  }
  // Bubble/screen RPOs are decided as the snap is caught, off the overhang defender's
  // alignment: if he isn't over the receiver, throw it right away.
  if (sim.rpo && e.hasBall && !e.user && !run.rpoChecked && !run.handoffDone && (ROUTES[sim.rpo.route] || {}).depthClass === 'screen') {
    run.rpoChecked = true;
    const rec = sim.off.find((o) => o.tag === sim.rpo.tag);
    if (rec && rec.isActive()) {
      const pts = rec.route && rec.route.pts;
      const win = pts && pts.length > 1 ? pts[1] : { x: rec.x, y: rec.y };
      // The overhang defender is the one between the box and the receiver (the corner outside
      // is the outside receiver's block).
      let cd = Infinity;
      const wl = Math.abs(sim.frame(win.x, win.y).l);
      for (const d of sim.def) {
        if (!d.isActive() || d.engaged || d.pos === 'DL') continue;
        if (Math.abs(sim.frame(d.x, d.y).l) > wl + 1) continue;
        cd = Math.min(cd, dist(d.x, d.y, win.x, win.y));
      }
      const misread = sim.rng.chance((1 - (e.r.awr ?? 70) / 100) * 0.2);
      const ev = evalTarget(sim, e, rec);
      const open = cd > 8 && ev && ev.margin > 0.25;
      const pull = sim.rpoForce === 'pull' ? true : sim.rpoForce === 'give' ? false : open !== misread;
      if (pull) { rpoPullAndThrow(sim, e, rec, 'bullet'); return; }
    }
  }
  if (!e.hasBall) {
    if (!sim.handedOff) { e.stop(); return; } // shotgun snap still in the air
    // Carry out the fake
    if (sim.t < 1.6) {
      const p = sim.field(gun ? -5.5 : -4.5, -run.side * 3.5);
      e.seek(p.x, p.y, 0.5, 1);
      e.anim = 'run';
    } else e.stop();
    return;
  }
  if (run.ballTag === 'QB') {
    if (scheme === 'qb_draw' && sim.t < 0.7) {
      const p = sim.field(gun ? -5.8 : -3, 0);
      e.seek(p.x, p.y, 0.4, 0.5); e.anim = 'backpedal';
      return;
    }
    if (scheme === 'sneak') e.protectBall = true;
    if (scheme === 'sneak' || scheme === 'qb_draw' || sim.t > 0.7) { e.qbRunner = true; sim.phase = 'run'; sim.runRecognizedT = sim.runRecognizedT || sim.t; sim.stats.rusher = e.id; return runnerAI(sim, e, dt); }
  }
  if (scheme === 'toss') {
    if (sim.t > 0.18 && !run.handoffDone) {
      const rb = sim.off.find((o) => o.tag === run.ballTag);
      if (rb) { pitchBall(sim, e, rb); run.handoffDone = true; }
    }
    e.stop(); e.anim = 'throw';
    return;
  }
  const rb = sim.off.find((o) => o.tag === run.ballTag);
  if (!rb) { e.qbRunner = true; sim.phase = 'run'; return; }
  // Move to the mesh point
  const meshF = gun ? -5 : (scheme === 'dive' || scheme === 'sneak' ? -2.6 : -3.4);
  const meshL = gun ? 0 : run.side * (scheme === 'counter' ? 0.2 : 0.7);
  if (scheme === 'draw') {
    if (sim.t < 0.6) { const p = sim.field(gun ? -5.8 : -4.0, 0); e.seek(p.x, p.y, 0.5, 0.5); e.anim = 'backpedal'; return; }
  }
  let mp = sim.field(meshF, meshL);
  // Meet the back halfway once he is on his way.
  if (sim.t > 0.25 && scheme !== 'draw') {
    const dx = rb.x - mp.x, dy = rb.y - mp.y, dd = Math.hypot(dx, dy);
    if (dd > 0.6) { const k = Math.min(1.2, dd * 0.4) / dd; mp = { x: mp.x + dx * k, y: mp.y + dy * k }; }
  }
  e.seek(mp.x, mp.y, 0.7, 0.4);
  e.anim = 'handoff';
  const minT = scheme === 'draw' ? 0.65 : scheme === 'read' ? 0.42 : 0.3; // zone read rides the mesh while reading the end
  const meshDist = dist(e.x, e.y, rb.x, rb.y);
  if (sim.t > minT && (meshDist < 1.25 || (sim.t > 1.1 && meshDist < 2.6))) {
    // RPO: the CPU QB pulls it and throws if the read receiver is open.
    if (sim.rpo && !e.user) {
      const rec = sim.off.find((o) => o.tag === sim.rpo.tag);
      // (sim.rpoForce lets the test lab model a human who always pulls or always gives)
      const pull = sim.rpoForce === 'pull' ? true : sim.rpoForce === 'give' ? false : rpoRead(sim, e, rec);
      if (rec && rec.isActive() && pull) { const ev = evalTarget(sim, e, rec); rpoPullAndThrow(sim, e, rec, ev ? ev.type : 'bullet'); return; }
    }
    if (scheme === 'read') {
      // Read the unblocked backside end (a human QB keeps it by moving the stick).
      const end = sim.def.filter((d) => d.pos === 'DL' || d.pos === 'LB').sort((a, b) => (sim.frame(a.x, a.y).l - sim.frame(b.x, b.y).l) * run.side)[0];
      let keep = false;
      const uc = e.user ? sim.ctl(e.team) : null;
      if (uc && Math.hypot(uc.mx, uc.my) > 0.5) keep = true;
      else if (end && !end.engaged) {
        // Keep only if the end has committed to the back: squeezing inside or flowing down the line.
        const ef = sim.frame(end.x, end.y);
        const sf = sim.frame(end.startX ?? end.x, end.startY ?? end.y);
        const inward = -Math.sign(ef.l || -run.side) * end.vy * sim.dir;
        const squeezed = Math.abs(ef.l) < Math.abs(sf.l) - 0.8;
        const misread = sim.rng.chance((1 - (e.r.awr ?? 70) / 100) * 0.25);
        keep = (inward > 1.2 || squeezed) !== misread;
        // Second look: the lane outside the end has to be clean (no scraping LB or apex waiting).
        if (keep) {
          const lane = sim.field(1.5, ef.l - run.side * 2.5);
          if (sim.def.some((d) => d !== end && d.isActive() && !d.engaged && dist(d.x, d.y, lane.x, lane.y) < 3.2)) keep = false;
        }
      }
      if (keep) { e.qbRunner = true; sim.phase = 'run'; sim.playType = 'run'; run.ballTag = 'QB'; run.aimL = -run.side * 6.5; sim.stats.rusher = e.id; return; }
    }
    handoff(sim, e, rb);
    return;
  }
  if (sim.t > 2.2) { e.qbRunner = true; sim.phase = 'run'; }
}

export function handoff(sim, qb, rb) {
  sim.run.handoffDone = true;
  sim.handedOff = true;
  sim.giveBall(rb, true);
  sim.phase = 'run';
  sim.handoffT = sim.t;
  sim.runRecognizedT = sim.runRecognizedT || sim.t;
  sim.events.push({ t: sim.t, type: 'handoff', from: qb.id, to: rb.id });
  sim.stats.rusher = rb.id;
  qb.anim = 'handoff';
}

// Speed option read (CPU QB): pitch when the edge defender attacks the QB, keep and turn
// upfield when he widens to take the back. Returns true while the read is still live.
function optionRead(sim, qb, dt) {
  const run = sim.run;
  const s = run.side;
  if (qb.user) return false; // a human QB steers himself and pitches with the pitch button
  const qf = sim.frame(qb.x, qb.y);
  const rb = sim.off.find((o) => o.tag === 'RB' && o.isActive());
  let key = null, kd = Infinity;
  for (const d of sim.def) {
    if (!d.isActive() || d.engaged) continue;
    const df = sim.frame(d.x, d.y);
    if ((df.l - qf.l) * s < -1.5 || df.f > 6 || df.f < -3) continue;
    const dd = dist(d.x, d.y, qb.x, qb.y);
    if (dd < kd) { kd = dd; key = d; }
  }
  const rbOk = rb && !rb.engaged && (sim.frame(rb.x, rb.y).l - qf.l) * s > 1.5 && dist(rb.x, rb.y, qb.x, qb.y) < 7.5;
  if (key && rbOk) {
    const kf = sim.frame(key.x, key.y);
    // Misreads happen: less aware QBs pitch late or keep into a defender.
    const err = (1 - (qb.r.awr ?? 70) / 100) * 1.2;
    const attacking = kd < 3.0 + err * 0.5 || ((kf.l - qf.l) * s < 1.0 && kd < 4.2);
    if (attacking) { optionPitch(sim, qb, rb); return true; }
    if ((kf.l - qf.l) * s > 3.2 && kd > 3.5 && sim.t > 0.9) { run.optionLive = false; return false; }
  }
  if (!key || Math.abs(qf.l) > 7.5 || qf.f > 1 || sim.t > 2.6) { run.optionLive = false; return false; }
  // A short ride step first so the back can get into pitch relationship.
  const ride = sim.t - (run.optionT0 ?? 0) < 0.3;
  const p = sim.field(qf.f + (ride ? 0.2 : 1.2), qf.l + s * 3.0);
  qb.seek(p.x, p.y, ride ? 0.5 : 0.95, 0.2);
  qb.anim = 'carry';
  return true;
}

export function optionPitch(sim, qb, rb) {
  pitchBall(sim, qb, rb);
  sim.run.optionLive = false;
  sim.run.pitched = true;
  sim.events.push({ t: sim.t, type: 'pitch', from: qb.id, to: rb.id });
}

// RPO read: watch the conflict defender nearest the throwing window. If he steps up to play
// the run (or there is nobody there) the window behind him is open; if he stays home, hand off.
function rpoRead(sim, qb, rec) {
  const ev = evalTarget(sim, qb, rec);
  if (!ev || ev.depth > 16) return false;
  const screen = (ROUTES[sim.rpo.route] || {}).depthClass === 'screen';
  // Quick routes: the corner on the receiver only matters if he is blanketing him;
  // the read is the conflict defender inside. Screens need real space.
  if (ev.margin < (screen ? 0.1 : -0.45)) return false;
  const pts = rec.route && rec.route.pts;
  const win = pts && pts.length ? pts[Math.min(1, pts.length - 1)] : { x: rec.x, y: rec.y };
  let conflict = null, cd = Infinity;
  for (const d of sim.def) {
    if (!d.isActive() || d.engaged || d.pos === 'DL') continue;
    if (!screen && dist(d.x, d.y, rec.x, rec.y) < 2.4) continue;
    const dd = dist(d.x, d.y, win.x, win.y);
    if (dd < cd) { cd = dd; conflict = d; }
  }
  if (!conflict || cd > 8) return screen || ev.margin > 0.1;
  const towardLOS = -conflict.vx * sim.dir; // closing on the line of scrimmage = playing run
  const awr = qb.r.awr ?? 70;
  const misread = sim.rng.chance((1 - awr / 100) * 0.2);
  return (towardLOS > 1.3 && cd > 2.2) !== misread;
}

// RPO: pull the ball from the mesh and throw to the read receiver; the back carries out the fake.
export function rpoPullAndThrow(sim, qb, rec, type = 'bullet') {
  sim.playType = 'pass';
  sim.rpoThrown = true;
  sim.run.handoffDone = true;
  sim.events.push({ t: sim.t, type: 'rpo', by: qb.id, to: rec.id });
  startThrow(sim, qb, rec, type, null);
}

function pitchBall(sim, qb, rb) {
  const T = 0.42;
  const tx = rb.x + rb.vx * T + sim.dir * 0.2, ty = rb.y + rb.vy * T;
  qb.hasBall = false;
  sim.carrier = null;
  sim.ball.state = 'air';
  sim.ball.pitch = true;
  sim.ball.flight = { sx: qb.x, sy: qb.y, sz: 1.2, tx, ty, tz: 1.1, T, t: 0, target: rb, type: 'pitch' };
  sim.ball.vx = (tx - qb.x) / T; sim.ball.vy = (ty - qb.y) / T; sim.ball.vz = (1.1 - 1.2 + 0.5 * 10.72 * T * T) / T;
  sim.ball.x = qb.x; sim.ball.y = qb.y; sim.ball.z = 1.2;
  sim.target = rb;
  sim.handedOff = true;
  sim.handoffT = sim.t;
  sim.runRecognizedT = sim.t;
  sim.stats.rusher = rb.id;
  sim.phase = 'run';
}

// --------------------------------------------------------------------- Runners
function runPath(sim, e, dt) {
  const run = sim.run;
  if (e.hasBall) return runnerAI(sim, e, dt);
  const gun = sim.form.qb !== 'center';
  const scheme = run.scheme;
  const s = run.side;
  let p;
  if (scheme === 'toss') {
    p = sim.field(-4.5, s * 5.5);
    e.seek(p.x, p.y, 1, 0.5); e.anim = 'run';
    return;
  }
  if (scheme === 'option') {
    const qb = sim.qb;
    if (qb && qb.hasBall && run.optionLive) {
      // Pitch relationship: a few yards outside and a step behind the QB.
      const qf = sim.frame(qb.x, qb.y);
      p = sim.field(qf.f - 1.6, qf.l + s * 4.2);
      e.seek(p.x, p.y, 1, 0.3); e.anim = 'run';
      return;
    }
    if (!run.pitched) { p = sim.field(2, s * 7); e.seek(p.x, p.y, 0.8, 0.5); e.anim = 'run'; return; }
    e.anim = 'run';
    return;
  }
  if (sim.rpoThrown) { p = sim.field(1.5, run.aimL); e.seek(p.x, p.y, 0.8, 0.3); e.anim = 'run'; return; } // carry out the fake
  if (scheme === 'draw' && sim.t < 0.42) { e.stop(); e.anim = 'block'; return; }
  if (scheme === 'counter' && sim.t < 0.22) { p = sim.field(sim.frame(e.x, e.y).f + 0.2, -s * 0.9); e.seek(p.x, p.y, 0.6, 0.5); e.anim = 'run'; return; }
  if (!run.handoffDone) {
    const qb = sim.qb;
    const qf = qb ? sim.frame(qb.x, qb.y) : { f: -5, l: 0 };
    // Mesh point just in front of the QB (shotgun) or beside him (under center).
    const mesh = gun ? { f: qf.f + 0.6, l: qf.l + s * 0.45 } : { f: -3.4, l: s * 1.15 };
    const rf = sim.frame(e.x, e.y);
    if (!e.task.meshed) {
      const mp = sim.field(mesh.f, mesh.l);
      e.seek(mp.x, mp.y, 0.62, 0.3);
      if (dist(e.x, e.y, mp.x, mp.y) < 0.55 || rf.f > mesh.f + 0.4) e.task.meshed = true;
    } else {
      const h = sim.field(0.5, run.aimL);
      e.seek(h.x, h.y, 0.55, 0.1);
    }
    e.anim = 'run';
    return;
  }
  e.stop();
}

function paFake(sim, e, dt) {
  const t = e.task;
  if (sim.t < 0.9) {
    const p = sim.field(-1.5, (sim.frame(e.startX, e.startY).l >= 0 ? 1 : -1) * 1.8);
    e.seek(p.x, p.y, 0.8, 0.5);
    e.anim = 'run';
    return;
  }
  if (t.then === 'route') {
    e.task = { kind: 'route', key: t.key };
    e.route = buildRoute(sim, e, t.key, {});
    return runRoute(sim, e, dt);
  }
  e.task = { kind: 'passblock' };
  passBlock(sim, e, dt);
}

// --------------------------------------------------------------------- Receivers
function runRoute(sim, e, dt) {
  const r = e.route;
  // Targeted receiver tracks the ball.
  if (sim.ball.state === 'air' && sim.target === e && sim.ball.flight && (sim.ball.flight.T - sim.ball.flight.t < 1.1 || !r || r.done)) {
    const fl = sim.ball.flight;
    const remain = Math.max(0.05, fl.T - fl.t);
    const d = dist(e.x, e.y, fl.tx, fl.ty);
    const need = d / remain;
    const frac = clamp(need / e.topSpeed + 0.15, 0.25, 1);
    e.seek(fl.tx, fl.ty, frac, 0.3);
    e.anim = remain < 0.35 ? 'catch' : 'run';
    return;
  }
  if (sim.thrown && sim.ball.state === 'air') {
    // Others keep running but drift toward the ball area to block after the catch.
    if (r && !r.done) followRoute(sim, e, r, dt); else e.stop();
    return;
  }
  if (!r) { e.stop(); return; }
  if (r.delay && sim.t < r.delay) { e.stop(); e.anim = 'block'; return; }
  // Press jam at the line
  if (e.jam > 0) { e.jam -= dt; e.speedCap = 0.35; } else e.speedCap = 1;
  // Scramble drill: break off routes and work back toward the QB when he runs.
  if (sim.qb && sim.qb.hasBall && (sim.qb.qbRunner || sim.qbScramble) && r.done) {
    const qf = sim.frame(sim.qb.x, sim.qb.y);
    const ef = sim.frame(e.x, e.y);
    const p = sim.field(Math.max(ef.f - 1, 3), ef.l + (qf.l - ef.l) * 0.25);
    e.seek(p.x, p.y, 0.7, 1);
    return;
  }
  followRoute(sim, e, r, dt);
}

function followRoute(sim, e, r, dt) {
  if (r.done) {
    if (r.sit) {
      // Settle into open space facing the QB
      const qb = sim.qb;
      const nd = sim.nearestEnt(e.x, e.y, (d) => d.side === 'D' && d.isActive());
      if (nd && dist(nd.x, nd.y, e.x, e.y) < 2.5) {
        const away = Math.atan2(e.y - nd.y, e.x - nd.x);
        e.setDesired(Math.cos(away) * 1.6, Math.sin(away) * 1.6);
      } else e.stop();
      if (qb) e.face = Math.atan2(qb.y - e.y, qb.x - e.x);
      e.anim = 'idle';
      return;
    }
    // Continue straight; stay inbounds
    const sp = e.speed > 1 ? e.speed : e.topSpeed;
    let vx = e.vx, vy = e.vy;
    if (Math.hypot(vx, vy) < 0.5) { vx = sim.dir; vy = 0; }
    const l = Math.hypot(vx, vy);
    vx /= l; vy /= l;
    if (e.y < 2 && vy < 0) vy = 0;
    if (e.y > FIELD_WIDTH - 2 && vy > 0) vy = 0;
    const ex = e.x + vx;
    if (ex > 119 || ex < 1) { e.stop(); return; }
    e.setDesired(vx * sp, vy * sp);
    return;
  }
  const wp = r.pts[r.idx];
  if (r.pause && r.pause[r.idx] && r.pauseT < r.pause[r.idx] && dist(e.x, e.y, wp.x, wp.y) < 0.7) {
    r.pauseT += dt; e.stop(); e.anim = 'juke';
    if (r.pauseT >= r.pause[r.idx]) { r.idx++; r.pauseT = 0; }
    return;
  }
  const d = dist(e.x, e.y, wp.x, wp.y);
  // Look ahead to the next waypoint to decide how hard the cut is.
  const next = r.pts[r.idx + 1];
  let arrive = 0.1;
  if (next) {
    const a1 = Math.atan2(wp.y - e.y, wp.x - e.x);
    const a2 = Math.atan2(next.y - wp.y, next.x - wp.x);
    let da = Math.abs(a2 - a1); if (da > Math.PI) da = Math.PI * 2 - da;
    if (da > 0.8) arrive = 1.2 + (da / Math.PI) * 1.6 - e.r.rte * 0.012; // better route runners carry speed into breaks
    arrive = Math.max(0.1, arrive);
  } else if (r.sit) arrive = 1.0;
  e.seek(wp.x, wp.y, 1, arrive);
  e.anim = 'run';
  if (d < 0.65 || passedWaypoint(sim, e, r)) {
    r.idx++;
    if (next) e.vx *= 1, e.cutBoost = 0.3;
    if (r.idx >= r.pts.length) r.done = true;
  }
  if (e.cutBoost > 0) { e.cutBoost -= dt; e.accel = (5.6 + e.r.acc * 0.056) * (1 + e.r.rte / 99 * 0.6); }
  else e.accel = 5.6 + e.r.acc * 0.056;
}

function passedWaypoint(sim, e, r) {
  const wp = r.pts[r.idx];
  const prev = r.idx > 0 ? r.pts[r.idx - 1] : { x: e.startX, y: e.startY };
  const sx = wp.x - prev.x, sy = wp.y - prev.y;
  const px = e.x - wp.x, py = e.y - wp.y;
  return sx * px + sy * py > 0 && dist(e.x, e.y, wp.x, wp.y) < 2.5;
}

// --------------------------------------------------------------------- Blocking
function passBlock(sim, e, dt) {
  const qb = sim.qb;
  if (!qb) { e.stop(); return; }
  e.anim = 'block';
  // Screen: linemen release downfield after a short sell.
  if (sim.screenTag && sim.t > 1.0 && e.pos === 'OL' && !sim.thrown) { e.task = { kind: 'screenblock' }; return; }
  if (sim.screenTag && sim.thrown && e.pos === 'OL') { e.task = { kind: 'screenblock' }; return; }
  const home = sim.field(-1.2 + (e.pos === 'OL' ? 0 : -2.5), e.alignL * 1.05);
  // Pick most threatening unblocked rusher in our lane.
  let best = null, bs = Infinity;
  const lane = e.alignL + (sim.protection === 'slide_left' ? -1.2 : sim.protection === 'slide_right' ? 1.2 : 0);
  for (const d of sim.def) {
    if (!d.isActive()) continue;
    const fr = sim.frame(d.x, d.y);
    const rushing = d.task && (d.task.kind === 'rush' || d.task.kind === 'blitz');
    if (!rushing && fr.f > 2.5) continue;
    if (d.engaged && d.engaged !== e) continue;
    const claimed = d.blockedBy && d.blockedBy !== e && d.blockedBy.task && d.blockedBy.task.kind === 'passblock' && !d.blockedBy.engaged;
    const laneDist = Math.abs(fr.l - lane);
    let sc = laneDist + Math.max(0, fr.f) * 0.25 + (claimed ? 3 : 0);
    if (e.pos !== 'OL') sc = dist(d.x, d.y, qb.x, qb.y) * 0.6 + (claimed ? 4 : 0) + (d.engaged ? 6 : 0);
    if (sc < bs) { bs = sc; best = d; }
  }
  const maxLane = e.pos === 'OL' ? 4.2 : 9;
  if (best && bs < maxLane) {
    best.blockedBy = e;
    e.blockTarget = best;
    // Set up between rusher and QB
    const dx = best.x - qb.x, dy = best.y - qb.y;
    const dd = Math.hypot(dx, dy) || 1;
    const back = Math.max(0.9, dd - 1.0);
    let tx = qb.x + (dx / dd) * back, ty = qb.y + (dy / dd) * back;
    const fr = sim.frame(tx, ty);
    if (fr.f > 0.3) { const p = sim.field(0.3, fr.l); tx = p.x; ty = p.y; }
    e.seek(tx, ty, 0.75, 0.6);
  } else {
    // Help: double the nearest engaged defensive lineman.
    const eng = sim.def.filter((d) => d.engaged && dist(d.x, d.y, e.x, e.y) < 3.5)[0];
    if (eng && e.pos === 'OL') { e.seek(eng.x - sim.dir * 0.8, eng.y + (e.y > eng.y ? 0.6 : -0.6), 0.6, 0.5); eng.doubled = e; }
    else e.seek(home.x, home.y, 0.5, 0.6);
  }
}

function runBlock(sim, e, dt) {
  e.anim = 'block';
  // RPO line rules: linemen block at the line (no climbing past a yard) while the pass is
  // still an option, so the QB can legally throw.
  const rpoHold = !!(sim.rpo && sim.run && (!sim.run.handoffDone || sim.rpoThrown));
  const tgt = e.task.target;
  if (!tgt || !tgt.isActive() || (tgt.engaged && tgt.engaged !== e)) {
    // Find a new man near the play
    const c = sim.carrier || sim.qb;
    const cand = sim.def.filter((d) => d.isActive() && !d.engaged && dist(d.x, d.y, e.x, e.y) < 6);
    cand.sort((a, b) => dist(a.x, a.y, e.x, e.y) + dist(a.x, a.y, c.x, c.y) * 0.5 - dist(b.x, b.y, e.x, e.y) - dist(b.x, b.y, c.x, c.y) * 0.5);
    e.task.target = cand[0] || null;
    if (!e.task.target) { const ef0 = sim.frame(e.x, e.y); const p = sim.field(rpoHold ? Math.min(0.6, ef0.f + 1.5) : ef0.f + 1.5, ef0.l); e.seek(p.x, p.y, 0.5, 1); return; }
  }
  const d = e.task.target;
  // Get to the play-side shoulder of the defender.
  const s = sim.run ? sim.run.side : 1;
  const df = sim.frame(d.x, d.y);
  const p = sim.field(rpoHold ? Math.min(0.7, df.f - 0.7) : df.f - 0.7, df.l + s * 0.35);
  e.seek(p.x, p.y, 0.9, 0.4);
}

function pullBlock(sim, e, dt) {
  e.anim = 'run';
  const ef = sim.frame(e.x, e.y);
  const toL = e.task.toL;
  if (!e.task.turned) {
    const p = sim.field(-1.8, toL);
    e.seek(p.x, p.y, 0.95, 0.5);
    if (Math.abs(ef.l - toL) < 1.2) e.task.turned = true;
    return;
  }
  // Turn up and block the first defender in the hole.
  if (!e.task.target || !e.task.target.isActive() || e.task.target.engaged) {
    const cand = sim.def.filter((d) => d.isActive() && !d.engaged && dist(d.x, d.y, e.x, e.y) < 7);
    cand.sort((a, b) => dist(a.x, a.y, e.x, e.y) - dist(b.x, b.y, e.x, e.y));
    e.task.target = cand[0] || null;
  }
  if (e.task.target) e.seek(e.task.target.x, e.task.target.y, 0.95, 0.2);
  else { const p = sim.field(ef.f + 3, toL); e.seek(p.x, p.y, 0.8, 1); }
}

function leadBlock(sim, e, dt) {
  e.anim = 'run';
  const s = sim.run ? sim.run.side : 1;
  const aim = sim.run ? sim.run.aimL : 0;
  const ef = sim.frame(e.x, e.y);
  if (ef.f < -0.8) {
    const p = sim.field(0.5, aim * 0.9);
    e.seek(p.x, p.y, 0.95, 0.3);
    return;
  }
  if (!e.task.target || !e.task.target.isActive() || e.task.target.engaged) {
    const cand = sim.def.filter((d) => d.isActive() && !d.engaged && dist(d.x, d.y, e.x, e.y) < 8 && d.pos !== 'DL');
    const all = cand.length ? cand : sim.def.filter((d) => d.isActive() && !d.engaged && dist(d.x, d.y, e.x, e.y) < 6);
    all.sort((a, b) => dist(a.x, a.y, e.x, e.y) - dist(b.x, b.y, e.x, e.y));
    e.task.target = all[0] || null;
  }
  if (e.task.target) e.seek(e.task.target.x, e.task.target.y, 1, 0.2);
  else { const p = sim.field(ef.f + 3, aim); e.seek(p.x, p.y, 0.8, 1); }
  void s;
}

function stalkBlock(sim, e, dt) {
  e.anim = 'block';
  // Block the nearest defensive back in front of us.
  if (!e.task.target || !e.task.target.isActive() || (e.task.target.engaged && e.task.target.engaged !== e)) {
    const cand = sim.def.filter((d) => d.isActive() && !d.engaged && (d.pos === 'CB' || d.pos === 'S' || d.pos === 'LB'));
    cand.sort((a, b) => dist(a.x, a.y, e.x, e.y) - dist(b.x, b.y, e.x, e.y));
    e.task.target = cand[0] && dist(cand[0].x, cand[0].y, e.x, e.y) < 12 ? cand[0] : null;
  }
  const d = e.task.target;
  if (!d) { e.stop(); return; }
  const c = sim.carrier;
  // Stay between the defender and the ball
  let tx = d.x, ty = d.y;
  if (c) { tx = d.x + (c.x - d.x) * 0.15; ty = d.y + (c.y - d.y) * 0.15; }
  const dd = dist(e.x, e.y, d.x, d.y);
  e.seek(tx, ty, dd > 4 ? 0.85 : 0.55, 0.3);
}

function screenBlock(sim, e, dt) {
  e.anim = 'run';
  const tgtE = sim.off.find((o) => o.tag === sim.screenTag);
  const rf = tgtE ? sim.frame(tgtE.x, tgtE.y) : { f: 0, l: 0 };
  if (!e.task.target || !e.task.target.isActive() || e.task.target.engaged) {
    const cand = sim.def.filter((d) => d.isActive() && !d.engaged && dist(d.x, d.y, tgtE ? tgtE.x : e.x, tgtE ? tgtE.y : e.y) < 12);
    cand.sort((a, b) => dist(a.x, a.y, e.x, e.y) - dist(b.x, b.y, e.x, e.y));
    e.task.target = cand[0] || null;
  }
  if (e.task.target && sim.t > 1.4) { e.seek(e.task.target.x, e.task.target.y, 0.9, 0.2); return; }
  const p = sim.field(Math.max(rf.f + 2, 1), rf.l + (e.alignL - rf.l) * 0.3);
  e.seek(p.x, p.y, 0.85, 0.5);
}

// Escort the ball carrier: block the most dangerous unblocked pursuer.
function escort(sim, e, dt) {
  const c = sim.carrier;
  if (e.engaged) return;
  e.anim = 'block';
  const opp = sim.ents.filter((d) => d.team !== e.team && d.isActive() && !d.engaged);
  let best = null, bs = Infinity;
  for (const d of opp) {
    const dc = dist(d.x, d.y, c.x, c.y);
    if (dc > 14) continue;
    const de = dist(d.x, d.y, e.x, e.y);
    // Prefer defenders between us and the carrier or closing on him
    const sc = dc * 0.8 + de * 0.6 + (d.escortedBy && d.escortedBy !== e ? 4 : 0);
    if (sc < bs) { bs = sc; best = d; }
  }
  if (!best || dist(best.x, best.y, e.x, e.y) > 9) {
    // Run with the play
    const ad = sim.attackDir(e.team);
    e.seek(c.x + ad * 3, c.y + (e.y - c.y) * 0.5, 0.75, 2);
    return;
  }
  best.escortedBy = e;
  const tx = best.x + (c.x - best.x) * 0.3, ty = best.y + (c.y - best.y) * 0.3;
  e.seek(tx, ty, 1, 0.3);
}

function pursueAsOffense(sim, e, dt) {
  // After a turnover, offensive players chase the new ball carrier.
  const c = sim.carrier;
  const react = 0.4 + (99 - e.r.awr) * 0.008;
  if (sim.t - (sim.turnoverT || 0) < react) { e.stop(); return; }
  const T = clamp(dist(e.x, e.y, c.x, c.y) / e.topSpeed, 0, 1.2);
  e.seek(c.x + c.vx * T * 0.7, c.y + c.vy * T * 0.7, 1, 0.2);
  e.anim = 'run';
}

export { ROUTES };
