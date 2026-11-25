// Special teams: dynamic kickoff, onside kick, punt, field goal and extra point.
import { FIELD_WIDTH, MID_Y, GOAL_LINE_E, GOAL_LINE_W, GRAVITY, GOALPOST_HALF_WIDTH, CROSSBAR_HEIGHT, BALL_CARRY_HEIGHT } from '../core/constants.js';
import { clamp, dist } from '../core/util.js';
import { Entity } from './entity.js';
import { runnerAI } from './runner.js';
import { pursue } from './ai_defense.js';
import { rosterPick } from './play.js';

function pickPlayers(team, specs, used) {
  const out = [];
  for (const [pos, idx] of specs) {
    const p = rosterPick(team, pos, idx, used);
    used.add(p.id);
    out.push(p);
  }
  return out;
}

function bestReturner(team, used) {
  const cands = [];
  for (const pos of ['WR', 'CB', 'HB']) for (const id of (team.depth[pos] || [])) {
    const p = team.byId.get(id);
    if (p && !used.has(p.id) && !p.injured) cands.push(p);
  }
  // Prefer backups with speed and elusiveness (starters at WR1/CB1 are protected a little)
  cands.sort((a, b) => (b.r.spd * 0.6 + b.r.elu * 0.25 + b.r.cth * 0.15 - (b.ovr > 84 ? 4 : 0)) - (a.r.spd * 0.6 + a.r.elu * 0.25 + a.r.cth * 0.15 - (a.ovr > 84 ? 4 : 0)));
  return cands[0] || team.players[0];
}

function mk(sim, p, team, side, tag, role, x, y) {
  const e = new Entity(p, team, side, tag, role);
  e.x = x; e.y = clamp(y, 0.8, FIELD_WIDTH - 0.8);
  e.face = Math.atan2(0, side === 'K' ? sim.dir : -sim.dir);
  e.face = side === 'K' ? (sim.dir > 0 ? 0 : Math.PI) : (sim.dir > 0 ? Math.PI : 0);
  e.anim = 'stance2';
  sim.ents.push(e);
  return e;
}

export function setupKick(sim) {
  const kt = sim.offIdx, rt = sim.defIdx;
  const K = sim.teams[kt], R = sim.teams[rt];
  const dir = sim.dir;
  const usedK = new Set(), usedR = new Set();
  sim.kickParams = sim.cfg.kickParams || null;
  sim.kickTeam = kt; sim.recvTeam = rt;
  sim.playType = sim.kind;
  sim.off = []; sim.def = [];
  const X = sim.losX;
  if (sim.kind === 'kickoff' || sim.kind === 'onside') {
    const kicker = pickPlayers(K, [['K', 0]], usedK)[0];
    const cover = pickPlayers(K, [['OLB', 2], ['MLB', 1], ['CB', 3], ['CB', 4], ['FS', 1], ['SS', 1], ['WR', 4], ['TE', 1], ['OLB', 3], ['HB', 1]], usedK);
    sim.kicker = mk(sim, kicker, kt, 'K', 'K', 'K', X - dir * 6, MID_Y);
    sim.ball.x = X; sim.ball.y = MID_Y; sim.ball.z = 0.25;
    const onside = sim.kind === 'onside';
    cover.forEach((p, i) => {
      let x, y;
      if (onside) { x = X - dir * 0.8; y = MID_Y + (i < 5 ? -1 : 1) * (2 + (i % 5) * 2.2); }
      else { x = X + dir * 25; y = 4 + i * ((FIELD_WIDTH - 8) / 9); if (Math.abs(y - MID_Y) < 2) y += 2.5; }
      const e = mk(sim, p, kt, 'K', 'C' + i, 'COV', x, y);
      sim.off.push(e);
    });
    const ret1 = bestReturner(R, usedR); usedR.add(ret1.id);
    const ret2 = bestReturner(R, usedR); usedR.add(ret2.id);
    const blockers = pickPlayers(R, [['TE', 0], ['FB', 0], ['MLB', 1], ['OLB', 2], ['TE', 1], ['SS', 1], ['OLB', 3], ['HB', 2], ['WR', 5]], usedR);
    const recvGoal = dir > 0 ? GOAL_LINE_E : GOAL_LINE_W;
    if (onside) {
      // Hands team: 10-15 yards from the ball
      blockers.forEach((p, i) => { const e = mk(sim, p, rt, 'R', 'B' + i, 'BLK', X + dir * (10.5 + (i % 2) * 3), MID_Y + (i - 4) * 3.2); sim.def.push(e); });
      sim.returners = [mk(sim, ret1, rt, 'R', 'KR', 'KR', X + dir * 20, MID_Y - 6), mk(sim, ret2, rt, 'R', 'KR2', 'KR', X + dir * 20, MID_Y + 6)];
    } else {
      blockers.forEach((p, i) => {
        // 5 on the restraining line (their 35), 4 deeper in the setup zone (30-33)
        const onLine = i < 5;
        const x = recvGoal - dir * (onLine ? 35 : 31);
        const y = onLine ? 7 + i * ((FIELD_WIDTH - 14) / 4) : 13 + (i - 5) * ((FIELD_WIDTH - 26) / 3);
        const e = mk(sim, p, rt, 'R', 'B' + i, 'BLK', x, y);
        sim.def.push(e);
      });
      sim.returners = [mk(sim, ret1, rt, 'R', 'KR', 'KR', recvGoal - dir * 3, MID_Y), mk(sim, ret2, rt, 'R', 'KR2', 'KR', recvGoal - dir * 13, MID_Y + 4)];
    }
    sim.def.push(...sim.returners);
    sim.phase = 'presnap';
  } else if (sim.kind === 'punt') {
    const punter = pickPlayers(K, [['P', 0]], usedK)[0];
    const snapper = pickPlayers(K, [['C', 1]], usedK)[0];
    const line = pickPlayers(K, [['OG', 2], ['OT', 2], ['OG', 3], ['TE', 1], ['TE', 2], ['OT', 3]], usedK);
    const gunners = pickPlayers(K, [['CB', 3], ['WR', 4]], usedK);
    const pp = pickPlayers(K, [['FB', 0]], usedK)[0];
    sim.punter = mk(sim, punter, kt, 'K', 'P', 'P', X - dir * 14, sim.ballY0);
    sim.snapper = mk(sim, snapper, kt, 'K', 'LS', 'OL', X - dir * 0.6, sim.ballY0);
    const ls = [-3.9, -2.6, -1.3, 1.3, 2.6, 3.9];
    line.forEach((p, i) => { const e = mk(sim, p, kt, 'K', 'PL' + i, 'OL', X - dir * 0.7, sim.ballY0 + dir * ls[i]); e.anim = 'stance3'; sim.off.push(e); });
    gunners.forEach((p, i) => {
      const side = i === 0 ? -1 : 1;
      const y = side * dir > 0 ? FIELD_WIDTH - 4 : 4;
      const e = mk(sim, p, kt, 'K', 'G' + i, 'GUN', X - dir * 0.6, y); sim.off.push(e);
    });
    sim.pp = mk(sim, pp, kt, 'K', 'PP', 'PP', X - dir * 5.5, sim.ballY0 + 1); sim.off.push(sim.pp);
    sim.off.push(sim.snapper);
    // Return team
    const ret = bestReturner(R, usedR); usedR.add(ret.id);
    const rush = pickPlayers(R, [['DE', 1], ['DT', 1], ['DT', 2], ['OLB', 1], ['MLB', 1], ['DE', 2]], usedR);
    const jam = pickPlayers(R, [['CB', 2], ['CB', 3]], usedR);
    const others = pickPlayers(R, [['SS', 1], ['OLB', 2]], usedR);
    const rl = [-3.3, -1.9, -0.6, 0.6, 1.9, 3.3];
    rush.forEach((p, i) => { const e = mk(sim, p, rt, 'R', 'PR' + i, 'PRUSH', X + dir * 1.0, sim.ballY0 + dir * rl[i]); e.anim = 'stance3'; sim.def.push(e); });
    jam.forEach((p, i) => { const g = sim.off.find((o) => o.tag === 'G' + i); const e = mk(sim, p, rt, 'R', 'J' + i, 'JAM', X + dir * 1.5, g.y); e.jamTarget = g; sim.def.push(e); });
    others.forEach((p, i) => { const e = mk(sim, p, rt, 'R', 'H' + i, 'HOLD', X + dir * 8, sim.ballY0 + (i ? 6 : -6)); sim.def.push(e); });
    const retDepth = clamp(43, 10, Math.abs((dir > 0 ? GOAL_LINE_E : GOAL_LINE_W) - X) + 2);
    sim.returners = [mk(sim, ret, rt, 'R', 'PRT', 'KR', clamp(X + dir * retDepth, 1, 119), MID_Y)];
    sim.def.push(...sim.returners);
    sim.ball.x = X; sim.ball.y = sim.ballY0; sim.ball.z = 0.2;
    sim.phase = 'presnap';
  } else { // fg / xp
    const kicker = pickPlayers(K, [['K', 0]], usedK)[0];
    const holder = pickPlayers(K, [['P', 0]], usedK)[0];
    const snapper = pickPlayers(K, [['C', 1]], usedK)[0];
    const line = pickPlayers(K, [['OT', 0], ['OG', 0], ['OG', 1], ['OT', 1], ['TE', 0], ['TE', 1], ['OT', 2], ['OG', 2]], usedK);
    sim.snapper = mk(sim, snapper, kt, 'K', 'LS', 'OL', X - dir * 0.6, sim.ballY0); sim.off.push(sim.snapper);
    const ls = [-1.3, 1.3, -2.6, 2.6, -3.9, 3.9, -5.0, 5.0];
    line.forEach((p, i) => { const e = mk(sim, p, kt, 'K', 'FL' + i, 'OL', X - dir * (i >= 6 ? 1.4 : 0.7), sim.ballY0 + dir * ls[i]); e.anim = 'stance3'; sim.off.push(e); });
    sim.holder = mk(sim, holder, kt, 'K', 'H', 'HOLD', X - dir * 7, sim.ballY0);
    sim.holder.anim = 'kneel';
    sim.kicker = mk(sim, kicker, kt, 'K', 'K', 'K', X - dir * 9.3, sim.ballY0 - dir * 1.6);
    const rush = pickPlayers(R, [['DE', 0], ['DT', 0], ['DT', 1], ['DE', 1], ['OLB', 0], ['MLB', 0], ['OLB', 1], ['DT', 2], ['DE', 2], ['CB', 0], ['SS', 0]], usedR);
    const rl = [-4.4, -2.0, -0.6, 0.6, 2.0, 4.4, -3.2, 3.2, -6.0, 6.0];
    rush.forEach((p, i) => {
      let e;
      if (i < 10) e = mk(sim, p, rt, 'R', 'FR' + i, 'FRUSH', X + dir * (i < 6 ? 1 : 2.2), sim.ballY0 + dir * rl[i]);
      else e = mk(sim, p, rt, 'R', 'FS', 'SAFE', X + dir * 10, sim.ballY0);
      e.anim = i < 6 ? 'stance3' : 'stance2';
      sim.def.push(e);
    });
    sim.ball.x = X; sim.ball.y = sim.ballY0; sim.ball.z = 0.2;
    sim.phase = 'presnap';
  }
}

// Default CPU kick parameters
export function cpuKickParams(sim, kicker) {
  const r = kicker.r;
  const acc = r.kac ?? 70;
  if (sim.kind === 'kickoff') {
    // Aim to land inside the landing zone near the goal line; some go into the end zone.
    return { power: clamp(0.95 + sim.rng.gauss() * 0.035, 0.82, 1.04), acc: sim.rng.gauss() * (1.2 - acc / 100), aim: sim.rng.gauss() * 0.08 };
  }
  if (sim.kind === 'punt') {
    return { power: clamp(0.96 + sim.rng.gauss() * 0.04, 0.75, 1.04), acc: sim.rng.gauss() * (1.2 - acc / 100), aim: sim.puntAim ?? 0 };
  }
  return { power: clamp(0.97 + sim.rng.gauss() * 0.03, 0.85, 1.05), acc: sim.rng.gauss() * (1.08 - acc / 100) * 0.85, aim: 0 };
}

export function updateKickRoles(sim, dt, atSnap) {
  if (atSnap) {
    sim.phase = 'kickrun';
    if (sim.kind === 'punt') {
      sim.ball.state = 'snap';
      sim.ball.flight = { sx: sim.ball.x, sy: sim.ball.y, sz: 0.4, tx: sim.punter.x, ty: sim.punter.y, tz: 1.1, T: 0.75, t: 0 };
    } else if (sim.kind === 'fg' || sim.kind === 'xp') {
      sim.ball.state = 'snap';
      sim.ball.flight = { sx: sim.ball.x, sy: sim.ball.y, sz: 0.4, tx: sim.holder.x, ty: sim.holder.y, tz: 0.5, T: 0.42, t: 0 };
    }
    for (const e of sim.ents) e.state = 'run';
    if (!sim.kickParams) sim.kickParams = cpuKickParams(sim, sim.kicker || sim.punter);
    sim.puntKickT = 2.05 + (sim.rng.next() - 0.5) * 0.15;
    return;
  }
  const b = sim.ball;
  // Snap flight for punts / kicks
  if (b.state === 'snap') {
    const fl = b.flight; fl.t += dt;
    const k = Math.min(1, fl.t / fl.T);
    b.x = fl.sx + (fl.tx - fl.sx) * k; b.y = fl.sy + (fl.ty - fl.sy) * k; b.z = fl.sz + (fl.tz - fl.sz) * k;
    if (k >= 1) {
      if (sim.kind === 'punt') { b.state = 'held'; b.carrier = sim.punter; sim.carrier = sim.punter; sim.punter.hasBall = true; }
      else { b.state = 'placed'; b.carrier = null; }
    }
  }
  const kind = sim.kind;
  if (sim.phase === 'loose') {
    for (const e of sim.ents) {
      if (e.user && sim.ctl(e.team)) continue;
      e.blocking = false; e.seek(b.x, b.y, 1, 0.1); e.anim = 'run';
    }
    return;
  }
  if (kind === 'kickoff' || kind === 'onside') kickoffTick(sim, dt);
  else if (kind === 'punt') puntTick(sim, dt);
  else fgTick(sim, dt);
  // Generic: after the return starts everyone pursues or blocks
  if (sim.phase === 'run' && sim.carrier) {
    const c = sim.carrier;
    for (const e of sim.ents) {
      if (e === c || e.engaged || !e.isActive() || (e.user && sim.ctl(e.team))) continue;
      e.blocking = false;
      if (e.team === c.team) {
        // Return blockers: wall off the nearest cover man
        e.blocking = true;
        const opp = sim.ents.filter((o) => o.team !== e.team && o.isActive() && !o.engaged);
        let best = null, bs = Infinity;
        for (const o of opp) { const sc = dist(o.x, o.y, c.x, c.y) * 0.8 + dist(o.x, o.y, e.x, e.y) * 0.7 + (o.escortedBy && o.escortedBy !== e ? 5 : 0); if (sc < bs) { bs = sc; best = o; } }
        if (best && dist(best.x, best.y, e.x, e.y) < 15) { best.escortedBy = e; e.seek(best.x + (c.x - best.x) * 0.3, best.y + (c.y - best.y) * 0.3, 0.95, 0.3); }
        else e.seek(c.x + sim.attackDir(e.team) * 5, c.y + (e.y - c.y) * 0.5, 0.8, 1);
        e.anim = 'block';
      } else {
        if (sim.t - (sim.returnStartT || 0) < (e.kickReact || 0)) { e.stop(); continue; }
        // Safeties on coverage (outside men, punter/kicker, protector) form a second wave.
        const safety = e.tag === 'C0' || e.tag === 'C9' || e.pos === 'K' || e.pos === 'P' || e.pos === 'PP';
        const ad = sim.attackDir(c.team);
        if (safety && dist(e.x, e.y, c.x, c.y) > 6) {
          const T = clamp(dist(e.x, e.y, c.x, c.y) / e.topSpeed, 0, 1.5);
          e.seek(c.x + c.vx * T * 0.8 + ad * 7, c.y + c.vy * T * 0.6, 1, 0.5);
          e.anim = 'run';
        } else pursue(sim, e, c, dt);
      }
    }
    if (!c.user || !sim.ctl(c.team)) runnerAI(sim, c, dt);
  }
  // Dead-ball checks for returns
  if (sim.phase === 'run' && sim.carrier && !sim.dead) checkReturnDead(sim);
}

function checkReturnDead(sim) {
  const c = sim.carrier;
  if (c.y < 0 || c.y > FIELD_WIDTH) { sim.endPlay({ reason: 'oob', x: c.x, y: clamp(c.y, 0, FIELD_WIDTH) }); return; }
  const ad = sim.attackDir(c.team);
  const goal = sim.goalLineFor(c.team);
  if ((c.x - goal) * ad >= 0) { sim.endPlay({ reason: 'td', x: c.x, y: c.y, td: c.team }); return; }
  if (c.state === 'down' || (c.state === 'falling' && c.downT > 0.3)) {
    sim.endPlay({ reason: 'tackle', x: c.x, y: c.y });
  }
}

// ------------------------------------------------------------------ kickoff
function kickoffTick(sim, dt) {
  const b = sim.ball;
  const k = sim.kicker;
  const dir = sim.dir;
  const recvGoal = dir > 0 ? GOAL_LINE_E : GOAL_LINE_W;
  if (sim.phase === 'kickrun') {
    // Kicker approach; everyone else holds (dynamic kickoff rule)
    for (const e of sim.ents) if (e !== k) { e.stop(); e.anim = 'stance2'; }
    k.seek(b.x - dir * 0.4, b.y, 0.85, 0.3); k.anim = 'run';
    if (dist(k.x, k.y, b.x, b.y) < 0.8 || sim.t > 1.5) {
      k.anim = 'kick'; k.animT = 0;
      const kp = sim.kickParams;
      if (sim.kind === 'onside') {
        launchKick(sim, b.x, b.y, 0.2, 12.5, 0.18 + kp.aim, 0.42, 9.5);
        sim.onside = true;
      } else {
        const v = (18.3 + (k.r.kpw ?? 80) * 0.1) * kp.power;
        launchKick(sim, b.x, b.y, 0.25, v, kp.aim + kp.acc * 0.05, (45 + kp.acc * 2) * Math.PI / 180, GRAVITY);
      }
      sim.phase = 'kickair';
      sim.events.push({ t: sim.t, type: 'kick', kind: sim.kind });
      // Returners settle under the projected landing spot
      const land = predictLanding(b);
      sim.landing = land;
      userTakeCoverage(sim, land);
    }
    return;
  }
  if (sim.phase === 'kickair' || sim.phase === 'kickloose') {
    // Only returners move until the ball lands or is touched.
    const land = sim.landing;
    const free = sim.ballTouched || sim.phase === 'kickloose';
    for (const e of sim.ents) {
      if (e.user && sim.ctl(e.team) && (e.role === 'KR' || free)) continue;
      if (e.pos === 'KR') {
        const primary = !sim.returners[1] || dist(sim.returners[0].x, sim.returners[0].y, land.x, land.y) <= dist(sim.returners[1].x, sim.returners[1].y, land.x, land.y) ? sim.returners[0] : sim.returners[1];
        if (e === primary) { if (sim.phase === 'kickloose') e.seek(b.x, b.y, 1, 0.1); else e.seek(land.x, land.y, 1, 0.5); e.anim = 'run'; }
        else e.seek(land.x - dir * 6, land.y + (e.y > land.y ? 3 : -3), 0.6, 1);
        continue;
      }
      if (sim.onside || free) {
        e.seek(b.x, b.y, 1, 0.2); e.anim = 'run';
      } else { e.stop(); e.anim = 'stance2'; }
      if (e === k && !free) { e.seek(b.x + dir * 8, MID_Y, 0.5, 1); }
    }
    if (sim.onside) return onsideResolve(sim, dt);
    kickBallPhysics(sim, dt);
  }
}

function onsideResolve(sim, dt) {
  const b = sim.ball;
  kickBallPhysics(sim, dt);
  const traveled = (b.x - sim.losX) * sim.dir;
  if (traveled >= 10 && !sim.dead) {
    // Declared onside recovery rate is low in the modern game.
    const kt = sim.kickTeam;
    const kHands = avg(sim.ents.filter((e) => e.team === kt), (e) => e.r.cth);
    const rHands = avg(sim.ents.filter((e) => e.team !== kt), (e) => e.r.cth);
    const p = clamp(0.11 + (kHands - rHands) * 0.004, 0.05, 0.2);
    const team = sim.rng.chance(p) ? kt : 1 - kt;
    const rec = sim.nearestEnt(b.x, b.y, (e) => e.team === team);
    sim.giveBall(rec, true);
    rec.knockDown(0, 0);
    sim.events.push({ t: sim.t, type: 'onside', recovered: team });
    sim.endPlay({ reason: 'onside', x: b.x, y: b.y });
  }
}

function userTakeCoverage(sim, land) {
  const kt = sim.kickTeam, rt = sim.recvTeam;
  if (sim.ctl(kt)) {
    const cov = sim.nearestEnt(land.x, land.y, (e) => e.team === kt && e.pos !== 'K' && e.pos !== 'P');
    if (cov) sim.setUser(kt, cov);
  }
  if (sim.ctl(rt) && sim.returners && sim.returners[0]) {
    const r = sim.returners.slice().sort((a, c) => dist(a.x, a.y, land.x, land.y) - dist(c.x, c.y, land.x, land.y))[0];
    sim.setUser(rt, r);
  }
}

const avg = (arr, f) => arr.reduce((s, x) => s + f(x), 0) / Math.max(1, arr.length);

function launchKick(sim, x, y, z, v, aim, angle, g) {
  const b = sim.ball;
  const dir = sim.dir;
  const hx = Math.cos(aim) * dir, hy = Math.sin(aim);
  b.state = 'kick';
  b.carrier = null;
  sim.carrier = null;
  b.x = x; b.y = y; b.z = z;
  b.vx = hx * v * Math.cos(angle); b.vy = hy * v * Math.cos(angle); b.vz = v * Math.sin(angle);
  b.g = g;
  b.kickT = 0;
  b.bounces = 0;
  b.windAx = sim.weather.wind ? Math.cos(sim.weather.windDir) * sim.weather.wind * 0.035 : 0;
  b.windAy = sim.weather.wind ? Math.sin(sim.weather.windDir) * sim.weather.wind * 0.035 : 0;
}

function predictLanding(b) {
  const g = b.g || GRAVITY;
  const disc = b.vz * b.vz + 2 * g * (b.z - 1.2);
  const T = (b.vz + Math.sqrt(Math.max(0, disc))) / g;
  return { x: b.x + (b.vx + b.windAx * T * 0.5) * T, y: clamp(b.y + (b.vy + b.windAy * T * 0.5) * T, 1, FIELD_WIDTH - 1), T };
}

// Ball physics during a kick (flight, bounces, roll) + fielding by the returner.
function kickBallPhysics(sim, dt) {
  const b = sim.ball;
  if (b.state === 'held') return;
  const g = b.g || GRAVITY;
  b.kickT += dt;
  b.vz -= g * dt;
  b.vx += (b.windAx || 0) * dt; b.vy += (b.windAy || 0) * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  b.spin += dt * 12;
  const dir = sim.dir;
  const recvGoal = dir > 0 ? GOAL_LINE_E : GOAL_LINE_W;
  const recvTeam = sim.recvTeam;
  // Fielding in the air
  if (b.z < 2.6 && b.z > 0.3 && b.vz < 0 && !sim.onside) {
    const ret = sim.ents.find((e) => e.team === recvTeam && e.isActive() && dist(e.x, e.y, b.x, b.y) < 1.2);
    if (ret) return fieldKick(sim, ret, true);
  }
  if (b.z <= 0.12) {
    b.z = 0.12;
    if (b.bounces === 0) {
      sim.ballTouched = true;
      if (sim.kind === 'kickoff') {
        // Dynamic kickoff landing rules
        const intoEZ = (b.x - recvGoal) * dir > 0;
        const lzStart = recvGoal - dir * 20;
        if (intoEZ) { sim.possession = recvTeam; sim.endPlay({ reason: 'touchback', x: b.x, y: b.y, touchback: true, spotOverride: 35 }); return; }
        if ((b.x - lzStart) * dir < 0) { sim.possession = recvTeam; sim.endPlay({ reason: 'short_kick', x: b.x, y: b.y, spotOverride: 40 }); return; }
      }
      sim.phase = 'kickloose';
    }
    b.bounces++;
    if (Math.abs(b.vz) > 1.2) {
      b.vz = -b.vz * 0.42;
      const a = sim.rng.range(-0.7, 0.7); const c = Math.cos(a), s = Math.sin(a);
      const vx = b.vx * c - b.vy * s, vy = b.vx * s + b.vy * c;
      b.vx = vx * 0.62; b.vy = vy * 0.62;
    } else { b.vz = 0; b.vx *= 1 - 1.8 * dt; b.vy *= 1 - 1.8 * dt; }
  }
  // Out of bounds
  if (b.y < 0 || b.y > FIELD_WIDTH) {
    sim.possession = recvTeam;
    if (sim.kind === 'kickoff') sim.endPlay({ reason: 'kick_oob', x: b.x, y: b.y, spotOverride: 40 });
    else sim.endPlay({ reason: 'punt_oob', x: clamp(b.x, 0, 120), y: clamp(b.y, 0, FIELD_WIDTH) });
    return;
  }
  // Rolls into the end zone
  if ((b.x - recvGoal) * dir > 0 && b.z < 0.5 && sim.phase === 'kickloose') {
    sim.possession = recvTeam;
    sim.endPlay({ reason: 'touchback', x: b.x, y: b.y, touchback: true, spotOverride: 20 });
    return;
  }
  // Loose ball pick-up
  if (sim.phase === 'kickloose' && b.z < 0.9) {
    const near = sim.ents.filter((e) => e.isActive() && dist(e.x, e.y, b.x, b.y) < 0.9);
    const ret = near.find((e) => e.team === recvTeam);
    if (ret && sim.kind === 'kickoff') return fieldKick(sim, ret, false);
    const speed = Math.hypot(b.vx, b.vy);
    if (sim.kind === 'punt') {
      // Coverage downs a rolling punt; returner may scoop it if it's still bouncing slowly.
      const cov = near.find((e) => e.team !== recvTeam);
      if (cov && (speed < 3 || b.bounces > 2)) { sim.possession = recvTeam; sim.endPlay({ reason: 'downed', x: b.x, y: b.y }); return; }
      if (ret && speed < 4 && sim.rng.chance(0.5)) return fieldKick(sim, ret, false);
    }
    if (speed < 0.25 && b.bounces > 1 && sim.kind === 'punt') { sim.possession = recvTeam; sim.endPlay({ reason: 'downed', x: b.x, y: b.y }); }
  }
}

function fieldKick(sim, ret, inAir) {
  const b = sim.ball;
  const dir = sim.dir;
  const recvGoal = dir > 0 ? GOAL_LINE_E : GOAL_LINE_W;
  const depthInEZ = (b.x - recvGoal) * dir;
  // Muff chance on punts
  if (sim.kind === 'punt' && inAir && sim.rng.chance(clamp(0.025 - (ret.r.cth - 70) * 0.0006, 0.004, 0.04))) {
    b.state = 'loose'; b.vz = 1.5; b.vx = sim.rng.range(-2, 2); b.vy = sim.rng.range(-2, 2); b.fumbledBy = ret.team; b.looseT = 0;
    sim.phase = 'loose'; sim.carrier = null; sim.events.push({ t: sim.t, type: 'muff', by: ret.id });
    return;
  }
  // Fair catch decision on punts
  if (sim.kind === 'punt' && inAir) {
    const uc = ret.user ? sim.ctl(ret.team) : null;
    const nearest = Math.min(...sim.ents.filter((e) => e.team !== ret.team && e.isActive()).map((e) => dist(e.x, e.y, ret.x, ret.y)));
    const fair = uc ? !!ret.fairSignal : nearest < 5.5 || depthInEZ > -6 && depthInEZ < 0 && nearest < 9;
    if (fair) {
      sim.giveBall(ret, true);
      sim.possession = ret.team;
      sim.events.push({ t: sim.t, type: 'faircatch', by: ret.id });
      sim.endPlay({ reason: 'faircatch', x: ret.x, y: ret.y });
      return;
    }
  }
  sim.giveBall(ret, true);
  sim.possession = ret.team;
  sim.ballTouched = true;
  sim.returnStartT = sim.t;
  sim.catchX = ret.x;
  sim.phase = 'run';
  sim.stats.returner = ret.id;
  sim.events.push({ t: sim.t, type: 'return', by: ret.id });
  // Caught in the end zone: kneel for a touchback if deep (CPU) or user chooses
  if (depthInEZ > 0) {
    const uc = ret.user ? sim.ctl(ret.team) : null;
    const kneel = uc ? false : (sim.kind === 'kickoff' ? depthInEZ > 1.5 : true);
    if (kneel) {
      sim.endPlay({ reason: 'touchback', x: ret.x, y: ret.y, touchback: true, spotOverride: sim.kind === 'kickoff' ? (inAir ? 35 : 20) : 20 });
      return;
    }
    sim.possessionChangedInEndzone = true;
  }
  for (const e of sim.ents) if (e.team !== ret.team) e.kickReact = 0.1 + sim.rng.next() * 0.3;
}

// ------------------------------------------------------------------ punt
function puntTick(sim, dt) {
  const b = sim.ball;
  const P = sim.punter;
  const dir = sim.dir;
  if (sim.phase === 'kickrun') {
    // Blocking up front, gunners release, rushers attack the punter
    for (const e of sim.ents) {
      if (e === P || (e.user && sim.ctl(e.team))) continue;
      e.blocking = false;
      if (e.pos === 'GUN') { e.seek(e.x + dir * 8, e.y, 1, 0.1); e.anim = 'run'; continue; }
      if (e.pos === 'OL' || e.pos === 'PP') {
        e.blocking = true; e.anim = 'block';
        const r = sim.ents.filter((d) => d.team !== e.team && d.pos === 'PRUSH' && !d.engaged).sort((a, c) => dist(a.x, a.y, e.x, e.y) - dist(c.x, c.y, e.x, e.y))[0];
        if (r && dist(r.x, r.y, e.x, e.y) < 4) e.seek(r.x - dir * 0.8, r.y, 0.6, 0.4); else e.stop();
        continue;
      }
      if (e.pos === 'PRUSH') { e.seek(P.x, P.y, 1, 0.1); e.anim = 'run'; continue; }
      if (e.pos === 'JAM') { const g = e.jamTarget; e.blocking = true; e.seek(g.x + dir * 0.9, g.y, 1, 0.2); e.anim = 'block'; continue; }
      if (e.pos === 'HOLD') { e.seek(e.x + dir * 0.5, e.y, 0.4, 1); continue; }
      if (e.pos === 'KR') { e.stop(); e.anim = 'idle'; }
    }
    if (P.hasBall) { P.stop(); P.anim = 'hold'; }
    // Blocked punt?
    const rusher = sim.ents.find((d) => d.team !== P.team && d.isActive() && !d.engaged && dist(d.x, d.y, P.x, P.y) < 1.6);
    if (rusher && P.hasBall && sim.t > sim.puntKickT - 0.3 && sim.rng.chance(0.45)) {
      P.hasBall = false; sim.carrier = null;
      b.state = 'loose'; b.x = P.x; b.y = P.y; b.z = 1; b.vx = -dir * sim.rng.range(3, 8); b.vy = sim.rng.range(-3, 3); b.vz = 2; b.fumbledBy = P.team; b.looseT = 0;
      sim.phase = 'loose';
      sim.events.push({ t: sim.t, type: 'blocked', by: rusher.id });
      return;
    }
    if (P.hasBall && sim.t >= sim.puntKickT) {
      const kp = sim.kickParams;
      const v = (17.5 + (P.r.kpw ?? 80) * 0.1) * kp.power;
      P.hasBall = false; sim.carrier = null;
      P.anim = 'kick'; P.animT = 0;
      launchKick(sim, P.x + dir * 0.8, P.y, 1.1, v, kp.aim + kp.acc * 0.06, (54 + kp.acc * 3) * Math.PI / 180, GRAVITY * 0.92);
      for (const o of sim.ents) if (o.engaged && o.engagedAsBlocker) { const d = o.engaged; o.engaged = null; o.engagedAsBlocker = false; d.engaged = null; d.engagedAsBlocker = false; d.blockCooldown = 0.8; }
      sim.phase = 'kickair';
      sim.landing = predictLanding(b);
      sim.puntFrom = P.x;
      userTakeCoverage(sim, sim.landing);
      sim.events.push({ t: sim.t, type: 'punt' });
    }
    return;
  }
  if (sim.phase === 'kickair' || sim.phase === 'kickloose') {
    const land = sim.landing;
    for (const e of sim.ents) {
      if (e.user && sim.ctl(e.team)) continue;
      e.blocking = false;
      if (e.pos === 'KR') {
        if (sim.phase === 'kickloose') {
          // Stay away from a bouncing ball near the goal line
          const recvGoal = dir > 0 ? GOAL_LINE_E : GOAL_LINE_W;
          if ((b.x - recvGoal) * -dir < 10) e.seek(b.x - dir * 4, b.y, 0.5, 1); else e.seek(b.x, b.y, 1, 0.1);
        } else e.seek(land.x, land.y, 1, 0.5);
        e.anim = 'run';
        continue;
      }
      if (e.team === sim.kickTeam) {
        if (e === P) { e.stop(); continue; }
        const tgt = sim.phase === 'kickloose' ? b : land;
        e.seek(tgt.x, tgt.y, 1, 0.5); e.anim = 'run';
      } else {
        // Return team: retreat and set up a wall; only engage cover men who are
        // closing on the landing spot.
        const cov = sim.ents.filter((o) => o.team === sim.kickTeam && o.isActive() && !o.engaged && dist(o.x, o.y, land.x, land.y) < 14).sort((a, c) => dist(a.x, a.y, e.x, e.y) - dist(c.x, c.y, e.x, e.y))[0];
        if (cov && dist(cov.x, cov.y, e.x, e.y) < 6) { e.blocking = true; e.seek(cov.x + dir * 1, cov.y, 0.9, 0.3); e.anim = 'block'; }
        else { e.blocking = false; e.seek(land.x - dir * 14, MID_Y + (e.y - MID_Y) * 0.6, 0.75, 1); e.anim = 'run'; }
      }
    }
    kickBallPhysics(sim, dt);
  }
}

// ------------------------------------------------------------------ field goal / PAT
function fgTick(sim, dt) {
  const b = sim.ball;
  const K = sim.kicker, H = sim.holder;
  const dir = sim.dir;
  for (const e of sim.ents) {
    if (e === K || e === H || (e.user && sim.ctl(e.team))) continue;
    if (e.pos === 'OL') { e.blocking = true; e.stop(); e.anim = 'block'; }
    else if (e.pos === 'FRUSH') { e.seek(H.x + dir * 1.5, H.y, 1, 0.1); e.anim = 'run'; }
    else if (e.pos === 'SAFE') { e.stop(); }
  }
  if (sim.phase === 'kickrun') {
    H.stop(); H.anim = 'kneel';
    if (b.state === 'placed' || b.state === 'snap') {
      if (sim.t > 0.6) { K.seek(H.x + dir * 0.2, H.y, 0.6, 0.2); K.anim = 'run'; }
      if (sim.t >= 1.28 && b.state === 'placed') {
        K.anim = 'kick'; K.animT = 0;
        const kp = sim.kickParams;
        const r = K.r;
        // Block chance from interior penetration
        const pen = sim.ents.filter((d) => d.team !== K.team && d.isActive() && !d.engaged && dist(d.x, d.y, H.x, H.y) < 3.2).length;
        const dist2post = Math.abs((dir > 0 ? 120 : 0) - b.x);
        const pBlock = 0.006 + pen * 0.03 + Math.max(0, dist2post - 45) * 0.0008;
        if (sim.rng.chance(pBlock)) {
          b.state = 'loose'; b.z = 1; b.vx = -dir * sim.rng.range(2, 6); b.vy = sim.rng.range(-3, 3); b.vz = 3; b.fumbledBy = K.team; b.looseT = 0;
          sim.events.push({ t: sim.t, type: 'blocked' });
          sim.endPlay({ reason: 'fg_blocked', x: b.x, y: b.y, fg: false });
          return;
        }
        const vmax = 17.5 + (r.kpw ?? 80) * 0.1;
        let power = kp.power;
        const v = vmax * Math.min(power, 1.08);
        // Aim at the middle of the uprights; accuracy error becomes an angle offset.
        const postX = dir > 0 ? 120 : 0;
        const aimAng = Math.atan2(MID_Y - b.y, (postX - b.x) * dir) + kp.aim;
        let errDeg = kp.acc * 6.6 + (power > 1.0 ? (power - 1) * 25 * Math.sign(kp.acc || 1) : 0);
        const ang = aimAng + errDeg * Math.PI / 180;
        launchKick(sim, b.x, b.y, 0.15, v, ang, 38 * Math.PI / 180, GRAVITY);
        sim.phase = 'kickair';
        sim.events.push({ t: sim.t, type: 'fgkick' });
      }
    }
    return;
  }
  if (sim.phase === 'kickair') {
    const prevX = b.x, prevY = b.y, prevZ = b.z;
    b.kickT += dt;
    b.vz -= GRAVITY * dt;
    b.vx += (b.windAx || 0) * dt; b.vy += (b.windAy || 0) * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.spin += dt * 10;
    const postX = dir > 0 ? 120 : 0;
    if ((prevX - postX) * dir < 0 && (b.x - postX) * dir >= 0) {
      const k = (postX - prevX) / (b.x - prevX);
      const y = prevY + (b.y - prevY) * k, z = prevZ + (b.z - prevZ) * k;
      const off = Math.abs(y - MID_Y);
      let good = off < GOALPOST_HALF_WIDTH && z > CROSSBAR_HEIGHT;
      if (Math.abs(off - GOALPOST_HALF_WIDTH) < 0.12 && z > CROSSBAR_HEIGHT) good = sim.rng.chance(0.5); // doink
      sim.events.push({ t: sim.t, type: good ? 'fg_good' : 'fg_miss', off, z });
      sim.endPlay({ reason: good ? 'fg_good' : 'fg_miss', x: b.x, y: b.y, fg: good });
      return;
    }
    if (b.z < 0.1) {
      sim.events.push({ t: sim.t, type: 'fg_miss', short: true });
      sim.endPlay({ reason: 'fg_miss', x: b.x, y: b.y, fg: false });
    }
  }
}

export { BALL_CARRY_HEIGHT };
