// Human control of the selected player.
import { clamp, dist } from '../core/util.js';
import { FIELD_WIDTH } from '../core/constants.js';
import { startMove, runnerAI } from './runner.js';
import { startThrow, throwAway, evalTarget } from './passing.js';
import { updateOffense, optionPitch, rpoPullAndThrow } from './ai_offense.js';
import { updateDefense } from './ai_defense.js';
import { fumble } from './contact.js';

export function passTypeFromHold(sec) {
  return sec < 0.14 ? 'lob' : sec < 0.33 ? 'touch' : 'bullet';
}

// Human pass type: a tap lets the game pick the right touch for the throw (firm on short
// throws, touch over the middle, lofted deep); holding the button throws a bullet; the lob
// modifier (Shift on the keyboard — unless sprinting — or LT) floats it.
export const BULLET_HOLD = 0.25;
export function userPassType(sim, qb, r, hold, ctl, moving) {
  if (ctl.held.has('lobmod') && !(moving && ctl.held.has('sprint'))) return 'lob';
  if (hold >= BULLET_HOLD) return 'bullet';
  const ev = evalTarget(sim, qb, r);
  return ev ? ev.type : 'touch';
}

// One-button passing: the game keeps the best target highlighted (the most open receiver,
// weighted toward a gain and the sticks) and Space throws to him. Q/E switch the highlight
// left/right across the field; a manual pick sticks for a moment. The highlight is sticky so
// it doesn't flicker between near-equal reads.
export function targetScore(sim, qb, r) {
  if (!r || !r.isActive() || !r.eligible || !r.task || r.task.kind !== 'route') return -9;
  const ev = evalTarget(sim, qb, r);
  if (!ev) return -9;
  const toGo = sim.firstDownX !== undefined ? (sim.firstDownX - sim.losX) * sim.dir : 10;
  const p = sim.pressure || 0; // a free rusher closing in: the quick, open throw wins
  if (r.jam > 0) return Math.min(ev.margin, 1.0) * 2.8 - 1.2; // still fighting a press jam
  let s = Math.min(ev.margin, 1.0) * 2.8 + clamp(ev.depth, -4, 30) * 0.022 * (1 - 0.6 * p);
  if (ev.depth >= toGo - 0.5) s += 0.25 * (1 - p);
  s += p * (1.1 - ev.T) * 1.4;
  return s;
}

// How soon an unblocked rusher gets to the QB (0 = no pressure, 1 = he's there)
function pocketPressure(sim, qb) {
  let tt = Infinity;
  for (const d of sim.def) {
    if (!d.isActive() || d.engaged) continue;
    const dd = Math.hypot(d.x - qb.x, d.y - qb.y);
    if (dd > 8) continue;
    tt = Math.min(tt, Math.max(0, dd - 0.9) / Math.max(4, d.topSpeed * 0.9));
  }
  return clamp((0.95 - tt) / 0.6, 0, 1);
}

function updateSuggestion(sim, qb, ctl) {
  const icons = sim.icons || [];
  const cand = icons.filter((e) => e.isActive() && e.eligible && e.task && e.task.kind === 'route');
  if (!cand.length) { sim.suggested = null; return; }
  const step = ctl.pressed.has('target_next') ? 1 : ctl.pressed.has('target_prev') ? -1 : 0;
  if (step) {
    // Screen order from the camera behind the QB: right = +y when going +x
    const order = cand.slice().sort((a, b) => (a.y - b.y) * sim.dir);
    let i = order.indexOf(sim.suggested);
    i = i < 0 ? (step > 0 ? 0 : order.length - 1) : (i + step + order.length) % order.length;
    sim.suggested = order[i];
    sim.suggestLock = sim.t + 1.6;
    return;
  }
  if (sim.suggestLock && sim.t < sim.suggestLock && sim.suggested && sim.suggested.isActive()) return;
  if (sim.suggestT !== undefined && sim.t - sim.suggestT < 0.1 && sim.suggested) return;
  sim.suggestT = sim.t;
  sim.pressure = pocketPressure(sim, qb);
  let best = null, bs = -Infinity;
  for (const r of cand) {
    const sc = targetScore(sim, qb, r);
    if (sc > bs) { bs = sc; best = r; }
  }
  const cur = sim.suggested && cand.includes(sim.suggested) ? sim.suggested : null;
  const cs = cur ? targetScore(sim, qb, cur) : -Infinity;
  sim.suggested = !cur || bs > cs + 0.15 || cs < -0.3 ? best : cur;
}

export function updateUser(sim, u, ctl, dt) {
  const moving = Math.hypot(ctl.mx, ctl.my) > 0.18;
  if (moving) u.idleT = 0; else u.idleT = (u.idleT || 0) + dt;
  if (u.hitStick > 0) u.hitStick -= dt;
  if (!u.isActive() || u.engaged) return;
  // The receiver of a human throw runs to the ball himself until the player takes over
  if (u.autoTrack) {
    if (u.hasBall || !sim.thrown || sim.ball.state !== 'air') u.autoTrack = null;
    else {
      if (u.autoTrack === true) u.autoTrack = moving ? 'neutral' : 'armed';
      if (u.autoTrack === 'neutral' && !moving) u.autoTrack = 'armed';
      else if (u.autoTrack === 'armed' && moving) u.autoTrack = null;
      if (u.autoTrack) { updateOffense(sim, u, dt); return; }
    }
  }
  const sprint = ctl.sprint;
  const manual = (scale = 1) => {
    const sp = u.topSpeed * (sprint ? 1 : 0.8) * scale * (u.hasBall ? 0.96 : 1);
    u.setDesired(ctl.mx * sp, ctl.my * sp);
  };
  const carrierTeam = sim.carrier ? sim.carrier.team : sim.possession;
  // A Space press made once the QB has the ball arms the one-button pass (the snap press,
  // even if it's released after the snap, never does)
  if (u === sim.qb && u.hasBall && sim.phase !== 'presnap' && sim.t > 0.15 && ctl.pressed.has('passbest')) {
    // The receiver highlighted when the button goes down is the one you get (and the
    // highlight holds still while you're holding it)
    sim.passArm = true;
    sim.passPick = sim.suggested;
    sim.suggestLock = sim.t + 3;
  }
  // ---------------------------------------------------------------- QB in the pocket
  if (sim.kind === 'scrimmage' && u === sim.qb && u.hasBall && !u.qbRunner && sim.phase !== 'run') {
    if (sim.pendingThrow) { u.setDesired(u.vx * 0.5, u.vy * 0.5); u.anim = 'throw'; return; } // in the throwing motion
    if (sim.playType === 'pass' || sim.playType === 'scramble') {
      updateSuggestion(sim, u, ctl);
      // Space: throw to the highlighted receiver (armed only by a press made after the snap,
      // so releasing the snap key doesn't fire a pass). Tap = the right pass, hold = bullet.
      const hb = ctl.released.get('passbest');
      if (hb !== undefined && sim.passArm) {
        sim.passArm = false;
        sim.suggestLock = 0;
        const r = sim.passPick && sim.passPick.isActive() ? sim.passPick : sim.suggested;
        if (r && r.isActive()) {
          startThrow(sim, u, r, userPassType(sim, u, r, hb, ctl, moving), moving ? { x: ctl.mx, y: ctl.my } : null, hb >= BULLET_HOLD ? 0.5 : 1);
          return;
        }
      }
      for (let i = 1; i <= 5; i++) {
        const hold = ctl.released.get('pass' + i);
        if (hold !== undefined) {
          const r = sim.icons ? sim.icons[i - 1] : null;
          if (r && r.isActive()) {
            // Holding the button loads the throw, so the ball comes out quicker on release.
            startThrow(sim, u, r, userPassType(sim, u, r, hold, ctl, moving), moving ? { x: ctl.mx, y: ctl.my } : null, hold >= BULLET_HOLD ? 0.5 : 1);
            return;
          }
        }
      }
      if (ctl.pressed.has('throwaway')) { throwAway(sim, u); return; }
      if (moving) {
        if (sim.qbDrop) sim.qbDrop.set = true;
        manual(0.95);
        u.anim = 'carry';
        // Scramble past the line of scrimmage
        if (sim.frame(u.x, u.y).f > 0.2) { u.qbRunner = true; sim.phase = 'run'; sim.playType = 'scramble'; sim.stats.rusher = u.id; }
        return;
      }
    }
    // RPO: pull it and throw to the read receiver before the handoff happens.
    if (sim.rpo && sim.run && !sim.run.handoffDone && !sim.thrown) {
      for (let i = 1; i <= 5; i++) {
        const hold = ctl.released.get('pass' + i);
        if (hold === undefined) continue;
        const r = sim.icons ? sim.icons[i - 1] : null;
        if (r && r.isActive() && r.tag === sim.rpo.tag) { rpoPullAndThrow(sim, u, r, userPassType(sim, u, r, hold, ctl, moving)); return; }
      }
    }
    updateOffense(sim, u, dt); // auto dropback / handoff / kneel / spike
    return;
  }
  // ---------------------------------------------------------------- Ball carrier
  if (u.hasBall) {
    u.protectBall = ctl.held.has('protect');
    // Speed option: pitch to the trailing back (live until the QB turns it up or crosses the line).
    if (sim.run && sim.run.optionLive && u === sim.qb) {
      if (sim.frame(u.x, u.y).f > 1 || sim.t > 3.2) sim.run.optionLive = false;
      else if (ctl.pressed.has('pitch')) {
        const rb = sim.off.find((o) => o.tag === 'RB' && o.isActive());
        if (rb) { optionPitch(sim, u, rb); return; }
      }
      if (sim.run.optionLive && !moving) {
        // Stick released: keep attacking the edge so the read stays alive.
        const qf = sim.frame(u.x, u.y);
        const p = sim.field(qf.f + 1.2, qf.l + sim.run.side * 3.0);
        u.seek(p.x, p.y, sprint ? 1 : 0.9, 0.2);
        u.anim = 'carry';
        return;
      }
    }
    if (u.move && u.move.t < u.move.dur) { runnerAI(sim, u, dt); if (u.move) return; }
    const ad = sim.attackDir(u.team);
    if (ctl.pressed.has('juke_l')) { if (startMove(sim, u, 'juke', 1)) return; }
    if (ctl.pressed.has('juke_r')) { if (startMove(sim, u, 'juke', -1)) return; }
    if (ctl.pressed.has('spin')) { if (startMove(sim, u, 'spin')) return; }
    if (ctl.pressed.has('stiff')) { if (startMove(sim, u, 'stiff')) return; }
    if (ctl.pressed.has('truck')) { if (startMove(sim, u, 'truck')) return; }
    if (ctl.pressed.has('hurdle')) { if (startMove(sim, u, 'hurdle')) return; }
    if (ctl.pressed.has('stutter')) { if (startMove(sim, u, 'stutter')) return; }
    if (ctl.pressed.has('dive')) {
      if (u.pos === 'QB' && sim.kind === 'scrimmage' && u.team === sim.offIdx) { if (startMove(sim, u, 'slide')) return; }
      else if (startMove(sim, u, 'dive')) return;
    }
    // Kneel in the end zone on kick returns
    if (ctl.pressed.has('kneel') && sim.kind !== 'scrimmage' && sim.returnStartT !== undefined) {
      const recvGoal = sim.goalLineFor(1 - u.team);
      const inEZ = (u.x - (ad > 0 ? 10 : 110)) * ad < 0;
      if (inEZ) { sim.endPlay({ reason: 'touchback', x: u.x, y: u.y, touchback: true, spotOverride: sim.kind === 'kickoff' ? 35 : 20 }); return; }
      void recvGoal;
    }
    if (moving) { manual(); u.anim = 'carry'; }
    else {
      // Keep running forward when the stick is released (assisted running)
      const sp = Math.max(u.speed, u.topSpeed * 0.5);
      u.setDesired(ad * sp * 0.9, u.vy * 0.85);
      u.anim = 'carry';
    }
    return;
  }
  // ---------------------------------------------------------------- Kick returner before the catch
  if (sim.kind !== 'scrimmage' && u.pos === 'KR' && !sim.carrier) {
    if (ctl.pressed.has('stiff') || ctl.pressed.has('fair')) u.fairSignal = true;
    if (moving) manual(); else updateDefenseLikeKR(sim, u);
    return;
  }
  // ---------------------------------------------------------------- Defender (or player without the ball)
  const onDefense = u.team !== carrierTeam || (sim.ball.state === 'air' && u.team !== sim.offIdx);
  if (ctl.pressed.has('switch') && onDefense) { switchPlayer(sim, u.team); return; }
  if (onDefense) {
    const c = sim.carrier;
    if (ctl.pressed.has('tackle') && (u.tackleCd || 0) <= 0 && !u.lunge) {
      u.lunge = 0.32;
      const h = moving ? Math.atan2(ctl.my, ctl.mx) : (c ? Math.atan2(c.y - u.y, c.x - u.x) : u.face);
      u.vx = Math.cos(h) * Math.max(u.speed, u.topSpeed * 0.9) * 1.15;
      u.vy = Math.sin(h) * Math.max(u.speed, u.topSpeed * 0.9) * 1.15;
      u.anim = 'dive';
      u.setDesired(u.vx, u.vy);
      return;
    }
    if (ctl.pressed.has('hitstick')) { u.hitStick = 0.45; u.anim = 'tackle'; }
    if (ctl.pressed.has('strip') && c && c.team !== u.team && dist(c.x, c.y, u.x, u.y) < 1.5 && (u.stripCd || 0) <= 0) {
      u.stripCd = 1.2;
      const p = clamp(0.05 + ((u.r.pow ?? 60) - (c.r.car ?? 60)) * 0.0025, 0.02, 0.16) * (c.protectBall ? 0.3 : 1);
      if (sim.rng.chance(p)) fumble(sim, c, u);
      sim.events.push({ t: sim.t, type: 'strip', by: u.id });
    }
    if (u.stripCd > 0) u.stripCd -= dt;
    if (ctl.pressed.has('swat') || ctl.pressed.has('catch_aggr')) u.anim = 'swat';
  }
  if (onDefense) {
    const c = sim.carrier;
    // Play the ball (hold R / Y while the pass is in the air): run to the spot and go up for it.
    const fl = sim.ball.flight;
    if (ctl.pressed.has('catch_aggr')) u.playBallT = sim.t;
    const playing = fl && sim.thrown && sim.ball.state === 'air' && !fl.resolved && fl.type !== 'away' && (ctl.held.has('catch_aggr') || ctl.pressed.has('catch_aggr'));
    if (playing && !u.lunge) {
      const dd = dist(u.x, u.y, fl.tx, fl.ty);
      // The assist only helps with the last few yards (the break and the leap); getting into
      // the passing lane is up to you, and the stick wins when you steer.
      if (dd < 4.5) {
        let ax = (fl.tx - u.x) / Math.max(0.1, dd), ay = (fl.ty - u.y) / Math.max(0.1, dd);
        if (moving) { const w = dd < 2 ? 0.5 : 0.3; ax = ax * w + ctl.mx * (1 - w); ay = ay * w + ctl.my * (1 - w); }
        const al = Math.hypot(ax, ay) || 1;
        const sp = u.topSpeed * (dd < 0.6 ? 0.3 : 1);
        u.setDesired((ax / al) * sp, (ay / al) * sp);
        u.anim = dd < 2.4 ? 'swat' : 'run';
        u.idleT = 0;
        return;
      }
    }
    // Strafe (hold C / LT): keep facing the QB (or the ball carrier) while moving, at a controlled pace.
    if (ctl.held.has('strafe') && !u.lunge) {
      const tgt = c && c.team !== u.team ? c : sim.qb;
      if (tgt) u.faceTo = Math.atan2(tgt.y - u.y, tgt.x - u.x);
      u.idleT = 0;
      if (moving) {
        const sp = u.topSpeed * 0.68;
        u.setDesired(ctl.mx * sp, ctl.my * sp);
        let diff = Math.abs(Math.atan2(ctl.my, ctl.mx) - (u.faceTo ?? u.face));
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (u.anim !== 'swat') u.anim = diff > 2.1 ? 'backpedal' : diff > 0.9 ? 'shuffle' : 'run';
      } else {
        u.setDesired(u.vx * 0.85, u.vy * 0.85);
        if (u.anim !== 'swat') u.anim = 'stance2';
      }
      return;
    }
  }
  if (u.lunge > 0) { u.setDesired(u.vx, u.vy); return; }
  if (moving) { manual(); if (u.anim !== 'swat') u.anim = 'run'; return; }
  // Stick released: let the AI keep playing this defender's assignment.
  if (u.idleT > 0.35) {
    if (sim.kind === 'scrimmage') { if (u.side === 'O') updateOffense(sim, u, dt); else updateDefense(sim, u, dt); }
    else u.stop();
  } else u.setDesired(u.vx * 0.9, u.vy * 0.9);
}

function updateDefenseLikeKR(sim, u) {
  const land = sim.landing;
  if (land) u.seek(land.x, land.y, 1, 0.5);
  else u.stop();
}

export function switchPlayer(sim, team) {
  const b = sim.ball;
  const tx = sim.carrier ? sim.carrier.x : (b.flight ? b.flight.tx : b.x);
  const ty = sim.carrier ? sim.carrier.y : (b.flight ? b.flight.ty : b.y);
  const cur = sim.userEnt[team];
  let best = null, bd = Infinity;
  for (const e of sim.ents) {
    if (e.team !== team || e === cur || e.state === 'down') continue;
    if (sim.carrier && e === sim.carrier) continue;
    const d = dist(e.x, e.y, tx, ty) + (e.engaged ? 3 : 0);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) sim.setUser(team, best);
}

// Pre-snap: cycle the controlled defender (closest-to-ball order).
export function cyclePresnapDefender(sim, team) {
  const defs = sim.ents.filter((e) => e.team === team);
  defs.sort((a, b) => dist(a.x, a.y, sim.losX, sim.ballY0) - dist(b.x, b.y, sim.losX, sim.ballY0));
  const cur = sim.userEnt[team];
  const idx = defs.indexOf(cur);
  sim.setUser(team, defs[(idx + 1) % defs.length]);
}

export { FIELD_WIDTH };
