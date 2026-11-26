// Human control of the selected player.
import { clamp, dist } from '../core/util.js';
import { FIELD_WIDTH } from '../core/constants.js';
import { startMove, runnerAI } from './runner.js';
import { startThrow, throwAway } from './passing.js';
import { updateOffense, optionPitch, rpoPullAndThrow } from './ai_offense.js';
import { updateDefense } from './ai_defense.js';
import { fumble } from './contact.js';

export function passTypeFromHold(sec) {
  return sec < 0.14 ? 'lob' : sec < 0.33 ? 'touch' : 'bullet';
}

export function updateUser(sim, u, ctl, dt) {
  const moving = Math.hypot(ctl.mx, ctl.my) > 0.18;
  if (moving) u.idleT = 0; else u.idleT = (u.idleT || 0) + dt;
  if (u.hitStick > 0) u.hitStick -= dt;
  if (!u.isActive() || u.engaged) return;
  const sprint = ctl.sprint;
  const manual = (scale = 1) => {
    const sp = u.topSpeed * (sprint ? 1 : 0.8) * scale * (u.hasBall ? 0.96 : 1);
    u.setDesired(ctl.mx * sp, ctl.my * sp);
  };
  const carrierTeam = sim.carrier ? sim.carrier.team : sim.possession;
  // ---------------------------------------------------------------- QB in the pocket
  if (sim.kind === 'scrimmage' && u === sim.qb && u.hasBall && !u.qbRunner && sim.phase !== 'run') {
    if (sim.pendingThrow) { u.setDesired(u.vx * 0.5, u.vy * 0.5); u.anim = 'throw'; return; } // in the throwing motion
    if (sim.playType === 'pass' || sim.playType === 'scramble') {
      for (let i = 1; i <= 5; i++) {
        const hold = ctl.released.get('pass' + i);
        if (hold !== undefined) {
          const r = sim.icons ? sim.icons[i - 1] : null;
          if (r && r.isActive()) {
            startThrow(sim, u, r, passTypeFromHold(hold), moving ? { x: ctl.mx, y: ctl.my } : null);
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
        if (r && r.isActive() && r.tag === sim.rpo.tag) { rpoPullAndThrow(sim, u, r, passTypeFromHold(hold)); return; }
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
