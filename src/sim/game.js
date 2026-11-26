// Game flow: possessions, downs, clock, scoring, penalties, overtime.
import { RNG } from '../core/rng.js';
import { FIELD_WIDTH, MID_Y, HASH_LEFT_Y, HASH_RIGHT_Y, GOAL_LINE_E, GOAL_LINE_W, DT } from '../core/constants.js';
import { clamp, formatClock, ordinal } from '../core/util.js';
import { PlaySim } from './play.js';
import { BoxScore, entName, yardText } from './stats.js';
import * as AI from './playcaller.js';

export const PHASES = ['coin', 'kick_call', 'playcall', 'presnap', 'live', 'post', 'pat_choice', 'quarter_break', 'final'];

export class Game {
  constructor(opts) {
    this.teams = opts.teams; // [home, away]
    this.settings = Object.assign({ quarterLen: 5, difficulty: 1, accel: true, accelTo: 15, weather: 'clear', playoff: false, gameSpeed: 1 }, opts.settings || {});
    this.controllers = opts.controllers || [null, null];
    this.rng = opts.rng || new RNG((Math.random() * 1e9) >>> 0);
    this.quarterLen = Math.round(this.settings.quarterLen * 60);
    this.difficulty = this.settings.difficulty;
    this.weather = makeWeather(this.settings.weather, this.rng);
    this.score = [0, 0];
    this.quarter = 1;
    this.clock = this.quarterLen;
    this.clockRunning = false;
    this.restartOnSnap = true;
    this.timeouts = [3, 3];
    this.possession = 0;
    this.ballX = 35; this.ballY = MID_Y;
    this.down = 1; this.lineToGain = 45;
    this.phase = 'coin';
    this.phaseT = 0;
    this.playClock = 40;
    this.sim = null;
    this.calls = [null, null];
    this.box = new BoxScore();
    this.log = [];
    this.listeners = [];
    this.next = null;
    this.twoMinWarned = { 2: false, 4: false };
    this.ot = null;
    this.over = false;
    this.lastResult = null;
    this.drive = null;
    this.kickReceivedFirst = null;
    this.realElapsed = 0;
    this.betweenElapsed = 0;
    this.pendingPenalty = null;
    this.presnapWait = 0;
    this.headless = !!opts.headless;
    this.scenario = opts.scenario || null;
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) { for (const fn of this.listeners) fn(type, data, this); }
  isUser(team) { return !!this.controllers[team]; }
  // Coach mode: a human team whose plays are run by the CPU (the human still makes every call).
  isCoach(team) { return !!(this.settings.coachMode && this.controllers[team]); }
  autoSnap(team) { return !this.isUser(team) || this.isCoach(team); }

  attackDir(team, quarter = this.quarter) {
    // Home attacks +x in odd quarters (and odd OT periods).
    const odd = quarter % 2 === 1;
    return (team === 0 ? 1 : -1) * (odd ? 1 : -1);
  }
  ownGoal(team) { return this.attackDir(team) > 0 ? GOAL_LINE_W : GOAL_LINE_E; }
  oppGoal(team) { return this.attackDir(team) > 0 ? GOAL_LINE_E : GOAL_LINE_W; }
  yardLineOf(team, x) { return (x - this.ownGoal(team)) * this.attackDir(team); } // 0..100 from own goal
  xFromYardLine(team, yl) { return this.ownGoal(team) + yl * this.attackDir(team); }

  kicker(team) { const ts = this.teams[team]; return ts.byId.get(ts.depth.K?.[0]); }

  ballSpotText() {
    const yl = this.yardLineOf(this.possession, this.ballX);
    const t = this.teams[this.possession].def.abbr, o = this.teams[1 - this.possession].def.abbr;
    if (Math.abs(yl - 50) < 0.5) return '50';
    return yl < 50 ? `${t} ${Math.round(yl)}` : `${o} ${Math.round(100 - yl)}`;
  }
  downText() {
    const toGo = Math.max(0, (this.lineToGain - this.ballX) * this.attackDir(this.possession));
    const goal = Math.abs(this.lineToGain - this.oppGoal(this.possession)) < 0.01;
    const n = Math.round(toGo);
    return `${ordinal(this.down)} & ${goal ? 'Goal' : (toGo < 0.5 ? 'Inches' : n)}`;
  }

  // ------------------------------------------------------------------ start
  start() {
    if (this.settings.practice) return this.resetPractice();
    if (this.scenario === 'drill') return this.startDrill();
    // Coin toss: winner defers, so the toss loser receives the opening kickoff.
    const winner = this.rng.chance(0.5) ? 0 : 1;
    this.coinWinner = winner;
    this.kickReceivedFirst = 1 - winner;
    this.emit('coin', { winner });
    this.log.push(`${this.teams[winner].def.name} win the toss and defer.`);
    this.setupKickoff(winner);
  }

  setupKickoff(kickTeam, opts = {}) {
    this.kickTeam = kickTeam;
    this.possession = kickTeam;
    this.kickFrom = opts.fromYL ?? 35;
    this.safetyKick = !!opts.safety;
    this.phase = 'kick_call';
    this.phaseT = 0;
    this.calls = [null, null];
    this.sim = null;
    this.presnapFoul = null;
    this.clockRunning = false;
    if (!this.isUser(kickTeam)) this.calls[kickTeam] = { kind: AI.kickoffChoice(this, kickTeam) };
    this.emit('phase', { phase: this.phase });
    this.tryStartKickoff();
  }

  submitKickoffCall(kind) { this.calls[this.kickTeam] = { kind }; this.tryStartKickoff(); }

  tryStartKickoff() {
    if (this.phase !== 'kick_call' || !this.calls[this.kickTeam]) return;
    const kt = this.kickTeam;
    const kind = this.calls[kt].kind === 'onside' ? 'onside' : 'kickoff';
    const dir = this.attackDir(kt);
    this.sim = new PlaySim({
      game: this, rng: this.rng, kind, offIdx: kt, teams: this.teams, dir,
      ballX: this.xFromYardLine(kt, this.kickFrom), ballY: MID_Y,
      controllers: this.controllers, difficulty: this.difficulty, weather: this.weather,
    });
    this.sim.safetyKick = this.safetyKick;
    this.phase = 'presnap';
    this.phaseT = 0;
    this.presnapWait = this.autoSnap(kt) ? 1.2 : Infinity;
    this.emit('phase', { phase: 'presnap', kick: true });
  }

  // ------------------------------------------------------------------ play calling
  setupScrimmage(opts = {}) {
    this.callId = (this.callId || 0) + 1;
    this.phase = 'playcall';
    this.phaseT = 0;
    this.calls = [null, null];
    this.callAt = [0, 0];
    this.sim = null;
    this.presnapFoul = null;
    this.conversion = !!opts.conversion;
    this.playClock = opts.playClock ?? 40;
    this.betweenElapsed = 0;
    // Ball on the hash
    this.ballY = clamp(this.ballY, HASH_LEFT_Y, HASH_RIGHT_Y);
    if (this.restartOnReady) { this.clockRunning = true; this.restartOnReady = false; }
    const off = this.possession, def = 1 - off;
    // CPU timeouts before the call
    for (const t of [off, def]) if (!this.isUser(t) && !this.conversion && AI.cpuWantsTimeout(this, t)) this.callTimeout(t);
    if (!this.isUser(off)) this.calls[off] = this.cpuOffCall();
    if (!this.isUser(def)) this.calls[def] = { pending: true };
    this.emit('phase', { phase: 'playcall' });
    this.tryStartPlay();
  }

  cpuOffCall() {
    const off = this.possession;
    if (!this.conversion && this.down === 4) {
      const d = AI.fourthDownDecision(this, off);
      if (d === 'punt') return { kind: 'punt' };
      if (d === 'fg') return { kind: 'fg' };
    }
    const c = AI.chooseOffensivePlay(this, off);
    return { kind: 'scrimmage', play: c.play, flip: c.flip };
  }

  submitCall(team, call) {
    if (this.phase !== 'playcall') return false;
    this.calls[team] = call;
    if (this.callAt) this.callAt[team] = this.betweenElapsed;
    this.tryStartPlay();
    return true;
  }

  tryStartPlay() {
    if (this.phase !== 'playcall') return;
    const off = this.possession, def = 1 - off;
    const oc = this.calls[off];
    if (!oc) return;
    let dc = this.calls[def];
    if (oc.kind === 'punt' || oc.kind === 'fg') {
      return this.startKickPlay(oc.kind, oc.kickParams);
    }
    if (!dc) return;
    if (dc.pending) dc = this.calls[def] = { kind: 'scrimmage', ...AI.chooseDefensivePlay(this, def, oc) };
    if (!dc.play) return;
    const dir = this.attackDir(off);
    this.sim = new PlaySim({
      game: this, rng: this.rng, kind: 'scrimmage', offIdx: off, teams: this.teams, dir,
      ballX: this.ballX, ballY: this.ballY, offPlay: oc.play, defPlay: dc.play, flip: oc.flip,
      controllers: this.controllers, difficulty: this.difficulty, weather: this.weather,
      firstDownX: this.lineToGain,
    });
    this.phase = 'presnap';
    this.phaseT = 0;
    const hurry = AI.wantsHurry(this, off);
    this.presnapWait = !this.autoSnap(off) ? Infinity : (hurry ? 0.9 : this.isCoach(off) ? 1.8 + this.rng.next() * 0.8 : this.isUser(def) ? 2.6 + this.rng.next() * 1.6 : 0.8 + this.rng.next() * 0.8);
    // The offense is never charged for time the defense spent choosing its call.
    if (this.callAt && this.callAt[def] > this.callAt[off]) this.playClock = Math.max(this.playClock, this.autoSnap(off) ? this.presnapWait + 1.5 : 15);
    // CPU hard count / false start
    this.presnapFoul = null;
    if (!this.isUser(off) && !this.conversion && this.rng.chance(0.022)) this.presnapFoul = { type: 'false_start', team: off };
    else if (!this.isUser(def) && !this.conversion && this.rng.chance(0.015)) this.presnapFoul = { type: 'offside', team: def };
    this.emit('phase', { phase: 'presnap' });
  }

  startKickPlay(kind, kickParams) {
    const off = this.possession;
    const dir = this.attackDir(off);
    let ballX = this.ballX;
    this.sim = new PlaySim({
      game: this, rng: this.rng, kind, offIdx: off, teams: this.teams, dir, ballX, ballY: kind === 'xp' ? MID_Y : this.ballY,
      controllers: this.controllers, difficulty: this.difficulty, weather: this.weather, kickParams,
    });
    if (kind === 'punt') {
      // Directional punting: aim away from the returner toward the sideline near midfield
      const toGoal = (this.oppGoal(off) - ballX) * dir;
      if (toGoal < 55) this.sim.puntAim = (this.rng.chance(0.5) ? 1 : -1) * 0.12;
    }
    this.phase = 'presnap';
    this.phaseT = 0;
    this.presnapFoul = null;
    this.presnapWait = this.autoSnap(off) ? 1.4 : Infinity;
    this.emit('phase', { phase: 'presnap', kick: true });
  }

  setKickParams(params) { if (this.sim) this.sim.kickParams = params; }

  // User offense snaps the ball.
  snap() {
    if (this.phase !== 'presnap' || !this.sim) return;
    const off = this.sim.offIdx;
    // Accelerated clock runoff
    if (this.clockRunning && this.settings.accel && !this.conversion && this.sim.kind === 'scrimmage') {
      // Clock between snaps: normal tempo uses the accelerated setting; a no-huddle offense
      // (human or CPU) gets to the line in ~15 s, a spike in ~8 s; a CPU team protecting a
      // late lead bleeds most of the play clock.
      const normal = 40 - this.settings.accelTo;
      const spike = this.sim.offPlay && this.sim.offPlay.id === 'spike';
      const target = spike ? 8 : AI.wantsHurry(this, off) ? Math.min(15, normal) : (this.autoSnap(off) && AI.wantsToMilk(this, off)) ? Math.min(38, normal + 8) : normal;
      const extra = Math.max(0, target - this.betweenElapsed);
      this.runClock(extra, true);
      if (this.phase !== 'presnap') return; // quarter ended
    }
    // Defensive offside (user lined up in the neutral zone)
    if (this.sim.userOffside) { this.sim.userOffside = false; return this.presnapPenalty({ type: 'offside', team: 1 - off }); }
    if (this.presnapFoul) { const f = this.presnapFoul; this.presnapFoul = null; if (this.sim.kind === 'scrimmage') return this.presnapPenalty(f); }
    this.clockRunning = true;
    if (this.sim.kind === 'kickoff' || this.sim.kind === 'onside' || this.sim.kind === 'xp') this.clockRunning = false;
    this.sim.snap();
    this.phase = 'live';
    this.phaseT = 0;
    this.liveClockStart = this.clock;
    this.emit('snap', {});
  }

  hardCount() {
    if (this.phase !== 'presnap' || !this.sim || this.sim.kind !== 'scrimmage') return false;
    this.hardCounts = (this.hardCounts || 0) + 1;
    const def = 1 - this.sim.offIdx;
    if (this.isUser(def)) return false;
    const p = this.hardCounts > 2 ? 0.01 : 0.07;
    if (this.rng.chance(p)) { this.presnapPenalty({ type: 'offside', team: def }); return true; }
    return false;
  }

  callTimeout(team) {
    if (this.timeouts[team] <= 0) return false;
    if (!['playcall', 'presnap', 'post'].includes(this.phase)) return false;
    this.timeouts[team]--;
    this.clockRunning = false;
    this.restartOnReady = false;
    this.playClock = 25;
    this.betweenElapsed = 0;
    this.log.push(`Timeout ${this.teams[team].def.name} (${formatClock(this.clock)}).`);
    this.emit('timeout', { team });
    return true;
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    if (this.over) return;
    this.phaseT += dt;
    switch (this.phase) {
      case 'kick_call':
      case 'playcall':
      case 'pat_choice':
        this.betweenTick(dt);
        break;
      case 'presnap':
        this.betweenTick(dt);
        if (this.phase !== 'presnap') break;
        this.sim.step(dt);
        if (this.phaseT >= this.presnapWait) this.snap();
        break;
      case 'live': {
        const s = this.sim;
        s.step(dt);
        // Game clock runs during live action (kicks only once the return starts)
        // Scrimmage kicks (punts, field goals) run the clock from the snap; free kicks once touched.
        const kickLive = (s.kind === 'punt' || s.kind === 'fg') || (s.kind !== 'scrimmage' && s.kind !== 'xp' && (s.returnStartT !== undefined || s.ballTouched));
        if ((s.kind === 'scrimmage' && !this.conversion) || kickLive) this.runClock(dt, false);
        if (s.dead && s.deadT >= 0) this.finishPlay();
        break;
      }
      case 'post':
        this.sim && this.sim.step(dt);
        if (this.phaseT > (this.headless ? 0 : this.postDelay ?? 2.2)) this.advance();
        break;
      case 'quarter_break':
        if (this.phaseT > (this.headless ? 0 : 2.5)) this.advance();
        break;
      default: break;
    }
  }

  betweenTick(dt) {
    this.betweenElapsed += dt;
    if (this.phase === 'playcall' || this.phase === 'presnap') {
      this.playClock -= dt;
      if (this.clockRunning && !this.conversion && this.betweenElapsed <= 40) this.runClock(dt, true);
      if (this.playClock <= 0 && this.phase === 'presnap' && this.sim && this.sim.kind === 'scrimmage') {
        this.presnapPenalty({ type: 'delay', team: this.possession });
      } else if (this.playClock <= -3 && this.phase === 'playcall') {
        // Stuck in play calling: auto-call for the user to keep things moving
        this.playClock = 0;
      }
    }
  }

  // Run the game clock; handles two-minute warning and end of quarter between plays.
  runClock(sec, between) {
    if (this.over || this.settings.practice) return;
    const q = this.quarter;
    const before = this.clock;
    let after = before - sec;
    if ((q === 2 || q === 4) && !this.twoMinWarned[q] && before > 120 && after <= 120) {
      if (between) { after = 120; this.clock = after; this.twoMinuteWarning(); return; }
      this.twoMinPending = true;
    }
    if (between && after <= 0) {
      this.clock = 0;
      this.addTOP(before);
      this.endQuarterBetweenPlays();
      return;
    }
    this.clock = Math.max(0, after);
    this.addTOP(before - this.clock);
  }

  addTOP(sec) { if (sec > 0) this.box.team[this.possession].top += sec; }

  twoMinuteWarning() {
    this.twoMinWarned[this.quarter] = true;
    this.twoMinPending = false;
    this.clockRunning = false;
    this.playClock = 25;
    this.betweenElapsed = 0;
    this.log.push('Two-minute warning.');
    this.emit('twominute', {});
  }

  endQuarterBetweenPlays() {
    this.sim = null;
    this.presnapFoul = null;
    this.next = { type: 'quarter_end', resume: this.lastNextAction || { type: 'scrimmage' } };
    this.phase = 'quarter_break';
    this.phaseT = 0;
    this.emit('quarter_end', { quarter: this.quarter });
  }

  presnapPenalty(f) {
    const off = this.possession;
    const dir = this.attackDir(off);
    const yards = 5;
    const sign = f.team === off ? -1 : 1;
    this.box.team[f.team].penalties++;
    this.box.team[f.team].penYds += yards;
    const names = { offside: 'Offside, defense', false_start: 'False start, offense', delay: 'Delay of game, offense', encroach: 'Encroachment, defense' };
    this.applyYardage(sign * yards, false);
    this.log.push(`PENALTY: ${names[f.type] || f.type}. ${yards} yards.`);
    this.emit('penalty', { type: f.type, team: f.team, yards, text: names[f.type] });
    // 10-second runoff inside the final minute for offensive pre-snap fouls with a running clock
    if (f.team === off && this.clockRunning && (this.quarter === 2 || this.quarter >= 4) && this.clock < 60 && this.clock > 10) this.clock -= 10;
    this.clockRunning = false;
    this.restartOnReady = !(this.quarter === 2 && this.clock < 120) && !(this.quarter >= 4 && this.clock < 300);
    this.setupScrimmage({ playClock: 25, conversion: this.conversion });
  }

  // Move the ball by penalty/gain yards along the offense's direction with half-distance rule.
  applyYardage(yards, autoFirst) {
    const off = this.possession;
    const dir = this.attackDir(off);
    const toOwn = (this.ballX - this.ownGoal(off)) * dir;
    const toOpp = (this.oppGoal(off) - this.ballX) * dir;
    let y = yards;
    if (y < 0 && -y > toOwn / 2) y = -toOwn / 2;
    if (y > 0 && y > toOpp / 2) y = toOpp / 2;
    this.ballX += y * dir;
    if (autoFirst || (this.lineToGain - this.ballX) * dir <= 0) this.firstDown();
  }

  firstDown() {
    const off = this.possession;
    const dir = this.attackDir(off);
    this.down = 1;
    const goal = this.oppGoal(off);
    this.lineToGain = (goal - this.ballX) * dir <= 10 ? goal : this.ballX + 10 * dir;
  }

  // ------------------------------------------------------------------ results
  finishPlay() {
    const s = this.sim;
    const r = s.result;
    this.lastResult = r;
    this.phase = 'post';
    this.phaseT = 0;
    this.postDelay = r.td !== null ? 3.2 : 2.2;
    if (s.kind === 'scrimmage') this.processScrimmage(s, r);
    else if (s.kind === 'kickoff' || s.kind === 'onside') this.processKickoff(s, r);
    else if (s.kind === 'punt') this.processPunt(s, r);
    else if (s.kind === 'fg' || s.kind === 'xp') this.processFG(s, r);
    // Two-minute warning reached during the play
    if (this.twoMinPending && !this.twoMinWarned[this.quarter]) this.twoMinuteWarning();
    // End of quarter after the play (PATs still happen)
    if (this.clock <= 0 && this.next && !['pat', 'conversion', 'final'].includes(this.next.type)) {
      this.next = { type: 'quarter_end', resume: this.next };
    }
    this.checkOTEnd(this.next && this.next.type === 'pat' ? this.next.team : null);
    this.emit('result', { result: r, text: this.lastText });
  }

  hashY(y) { return clamp(y, HASH_LEFT_Y, HASH_RIGHT_Y); }

  scoreTD(team, desc) {
    this.score[team] += 6;
    this.box.addScore(team, this.quarter, 6);
    this.clockRunning = false;
    this.emit('touchdown', { team });
    this.next = { type: 'pat', team };
    this.lastNextAction = this.next;
    void desc;
  }

  scoreSafety(team) {
    this.score[team] += 2;
    this.box.addScore(team, this.quarter, 2);
    this.clockRunning = false;
    this.emit('safety', { team });
    this.next = { type: 'kickoff', team: 1 - team, safety: true };
  }

  changePossession(team, x, y) {
    this.endDrive();
    if (this.ot) this.ot.poss[1 - team]++;
    this.possession = team;
    this.ballX = clamp(x, GOAL_LINE_W + 0.5, GOAL_LINE_E - 0.5);
    this.ballY = this.hashY(y);
    this.firstDown();
    this.clockRunning = false;
    this.startDrive();
  }

  startDrive() { this.drive = { team: this.possession, startX: this.ballX, plays: 0, startClock: this.clock, startQ: this.quarter }; }
  endDrive() { this.drive = null; }

  applySimPenalties(s, r) {
    // Returns { handled: bool } if a penalty replaced the play result.
    const off = s.offIdx, def = 1 - off;
    const dir = s.dir;
    const flags = [...r.flags];
    // Random line-play penalties (holding) tied to what happened on the play
    const sheds = r.events.filter((e) => e.type === 'shed').length;
    if (r.td === null || this.rng.chance(0.5)) {
      const pHold = (s.playType === 'run' ? 0.024 : 0.02) + sheds * 0.003;
      if (this.rng.chance(pHold)) flags.push({ type: 'holding', team: off });
      if (s.playType !== 'run' && this.rng.chance(0.012)) flags.push({ type: 'def_holding', team: def });
      if (this.rng.chance(0.005)) flags.push({ type: 'facemask', team: def });
    }
    if (!flags.length) return false;
    const f = flags[0];
    const playGain = r.turnover ? -99 : r.incomplete ? 0 : (r.endX - s.losX) * dir;
    let yards = 0, auto1st = false, lossOfDown = false, fromSpot = null, desc = '';
    if (f.type === 'dpi') {
      const spotGain = (f.spotX - s.losX) * dir;
      // Offense declines if the play was better (a catch for more, or a TD)
      if (r.td === off || (!r.incomplete && !r.turnover && playGain >= spotGain)) return false;
      yards = Math.max(1, spotGain); auto1st = true; desc = 'Defensive pass interference';
      const goal = this.oppGoal(off);
      if ((s.losX + yards * dir - goal) * dir >= 0) yards = (goal - s.losX) * dir - 1;
    } else if (f.type === 'holding') {
      if (r.turnover || r.td === def || playGain < -2 || r.sack) return false; // defense declines
      yards = -10; desc = 'Offensive holding';
    } else if (f.type === 'def_holding') {
      if (r.td === off || playGain >= 5 || r.turnover && false) return false;
      if (r.turnover) return false;
      yards = 5; auto1st = true; desc = 'Defensive holding';
    } else if (f.type === 'facemask') {
      if (r.turnover || r.td === off) return false;
      fromSpot = r.endX; yards = 15; auto1st = true; desc = 'Face mask';
    } else if (f.type === 'grounding') {
      if (r.turnover) return false;
      lossOfDown = true; fromSpot = f.spotX; yards = Math.min(-10, (f.spotX - s.losX) * dir); desc = 'Intentional grounding';
      if ((f.spotX - this.ownGoal(off)) * dir < 0) { this.box.team[f.team].penalties++; this.scoreSafety(def); this.lastText = `Intentional grounding in the end zone. SAFETY.`; this.log.push(this.lastText); return true; }
      yards = (f.spotX - s.losX) * dir < -10 ? (f.spotX - s.losX) * dir : -10;
      fromSpot = null;
    } else return false;
    // Enforce
    this.box.team[f.team].penalties++;
    this.box.team[f.team].penYds += Math.abs(Math.round(yards));
    this.ballX = fromSpot ?? s.losX;
    if (fromSpot !== null && fromSpot !== undefined) this.ballX = clamp(fromSpot, GOAL_LINE_W + 1, GOAL_LINE_E - 1);
    if (f.type === 'dpi') { this.ballX = s.losX + yards * dir; this.firstDown(); }
    else this.applyYardage(yards, auto1st);
    if (lossOfDown) { this.down++; }
    this.ballY = this.hashY(s.ballY0);
    if (this.down > 4) { this.turnoverOnDowns(); }
    this.clockRunning = false;
    this.restartOnReady = !(this.quarter === 2 && this.clock < 120) && !(this.quarter >= 4 && this.clock < 300);
    this.lastText = `PENALTY: ${desc} (${this.teams[f.team].def.abbr}), ${Math.abs(Math.round(yards))} yards.${auto1st ? ' Automatic first down.' : ''}`;
    this.log.push(this.lastText);
    this.emit('penalty', { type: f.type, team: f.team, yards, text: desc });
    if (!this.next || this.next.type !== 'kickoff') this.next = { type: 'scrimmage' };
    return true;
  }

  turnoverOnDowns() {
    const off = this.possession;
    this.lastText = (this.lastText ? this.lastText + ' ' : '') + 'Turnover on downs.';
    this.changePossession(1 - off, this.ballX, this.ballY);
    this.next = { type: 'scrimmage' };
  }

  processScrimmage(s, r) {
    const off = s.offIdx, def = 1 - off;
    const dir = s.dir;
    const box = this.box;
    const ts = box.team[off];
    const byId = (id) => s.ents.find((e) => e.id === id);
    if (this.drive) this.drive.plays++;
    const passer = byId(r.stats.passer), recv = byId(r.stats.receiver), rusher = byId(r.stats.rusher), target = byId(r.stats.target);
    const tackler = r.stats.tacklers?.length ? byId(r.stats.tacklers[0]) : null;
    const losYL = this.yardLineOf(off, s.losX);
    const wasThird = this.down === 3, wasFourth = this.down === 4;
    if (this.conversion) return this.processConversion(s, r);
    // Penalties may wipe out the play
    if (r.kind === 'scrimmage' && this.applySimPenalties(s, r)) { this.lastNextAction = this.next; return; }
    let gain = r.turnover ? 0 : (r.endX - s.losX) * dir;
    if (r.td === off) gain = (this.oppGoal(off) - s.losX) * dir;
    let text = '';
    const pt = r.playType;
    ts.plays++;
    if (wasThird) ts.third++;
    if (wasFourth) ts.fourth++;
    if (losYL >= 80) { if (!this.drive || !this.drive.rz) { ts.redZone++; if (this.drive) this.drive.rz = true; } }
    // ---------------------------------------- stats
    if (pt === 'kneel') { text = `${entName(s.qb)} takes a knee.`; ts.rushAtt++; ts.rushYds += Math.round(gain); ts.yards += Math.round(gain); const p = box.p(s.qb.id, s.qb); p.ratt++; p.ryds += Math.round(gain); }
    else if (pt === 'spike') { text = `${entName(s.qb)} spikes the ball to stop the clock.`; ts.passAtt++; box.p(s.qb.id, s.qb).att++; }
    else if (pt === 'sack') {
      const sk = byId(r.stats.sackBy);
      text = `${entName(s.qb)} sacked by ${entName(sk)} for ${yardText(gain)}.`;
      ts.sacks++; ts.sackYds += Math.round(-gain); ts.yards += Math.round(gain); ts.passYds += Math.round(gain);
      box.p(s.qb.id, s.qb).sk++;
      if (sk) { const p = box.p(sk.id, sk); p.sacks++; p.tkl++; }
    } else if (s.thrown && passer) {
      const pp = box.p(passer.id, passer);
      if (r.stats.target || s.thrownAway) { pp.att++; ts.passAtt++; }
      if (target) box.p(target.id, target).tgt++;
      if (recv && !r.stats.intBy) {
        const yards = Math.round(r.td === off ? gain : (r.turnover ? (r.events.find((e) => e.type === 'catch')?.x - s.losX) * dir : gain));
        pp.cmp++; pp.pyds += yards; ts.passCmp++; ts.passYds += yards; ts.yards += yards;
        const rp = box.p(recv.id, recv); rp.rec++; rp.recyds += yards; rp.reclong = Math.max(rp.reclong, yards);
        if (r.td === off) { pp.ptd++; rp.rectd++; }
        text = `${entName(passer)} pass complete to ${entName(recv)} for ${yardText(yards)}.`;
      } else if (r.stats.intBy) {
        const ip = byId(r.stats.intBy);
        pp.int++; ts.ints++; ts.turnovers++;
        if (ip) box.p(ip.id, ip).defint++;
        text = `${entName(passer)} pass INTERCEPTED by ${entName(ip)}!`;
      } else {
        const why = r.events.find((e) => e.type === 'incomplete');
        const dfd = why && why.by ? byId(why.by) : null;
        if (dfd) box.p(dfd.id, dfd).pd++;
        text = s.thrownAway ? `${entName(passer)} throws it away.` : `${entName(passer)} pass incomplete${target ? ' intended for ' + entName(target) : ''}${dfd ? ', broken up by ' + entName(dfd) : ''}.`;
      }
    } else if (rusher || pt === 'scramble' || pt === 'run') {
      const ru = rusher || (s.qb.qbRunner ? s.qb : s.carrier);
      if (ru) {
        const yards = Math.round(gain);
        const rp = box.p(ru.id, ru);
        rp.ratt++; rp.ryds += yards; rp.rlong = Math.max(rp.rlong, yards);
        ts.rushAtt++; ts.rushYds += yards; ts.yards += yards;
        if (r.td === off) rp.rtd++;
        const dirTxt = Math.abs(sideOf(s, r.endY)) > 6 ? (sideOf(s, r.endY) > 0 ? 'right end' : 'left end') : 'up the middle';
        text = `${entName(ru)} rushes ${dirTxt} for ${yardText(yards)}.`;
      }
    }
    if (tackler && r.td === null && pt !== 'sack') { box.p(tackler.id, tackler).tkl++; text += ` Tackle by ${entName(tackler)}.`; }
    if (r.stats.fumbleBy) {
      const fb = byId(r.stats.fumbleBy);
      if (fb) box.p(fb.id, fb).fum++;
      const ff = byId(r.stats.forcedBy); if (ff) box.p(ff.id, ff).ff++;
      if (r.turnover && !r.stats.intBy) { ts.fumLost++; ts.turnovers++; const rec = byId(r.stats.recoveredBy); if (rec) box.p(rec.id, rec).fr++; text += ` FUMBLE! Recovered by ${this.teams[def].def.abbr}.`; }
      else if (r.stats.fumbleBy) text += ' Fumble, recovered by the offense.';
    }
    if (r.oob) text += ' Out of bounds.';
    // ---------------------------------------- outcome
    if (r.td !== null) {
      if (r.td === def) {
        const ret = byId(r.stats.intBy || r.stats.recoveredBy);
        if (ret) box.p(ret.id, ret).deftd++;
        text += ` ${this.teams[def].def.name} return it for a TOUCHDOWN!`;
        this.endDrive();
        if (this.ot) this.ot.poss[off]++;
      } else {
        text += ' TOUCHDOWN!';
        if (this.ot) this.ot.poss[off]++;
        if (this.drive?.rz) ts.redZoneTD++;
        if (wasThird) ts.thirdConv++;
        if (wasFourth) ts.fourthConv++;
        ts.firstDowns++;
      }
      this.scoreTD(r.td);
    } else if (r.safety !== null) {
      text += ' SAFETY!';
      if (this.ot) this.ot.poss[off]++;
      this.scoreSafety(r.safety);
    } else if (r.turnover) {
      if (r.touchback) {
        const x = this.xFromYardLine(def, 20);
        this.changePossession(def, x, MID_Y);
        text += ' Touchback.';
      } else this.changePossession(def, r.endX, r.endY);
      this.next = { type: 'scrimmage' };
    } else {
      // Normal play
      if (!r.incomplete) { this.ballX = clamp(r.endX, GOAL_LINE_W + 0.5, GOAL_LINE_E - 0.5); this.ballY = this.hashY(r.endY); }
      else this.ballY = this.hashY(s.ballY0);
      const reached = (this.ballX - this.lineToGain) * dir >= -0.001;
      if (reached && !r.incomplete) {
        ts.firstDowns++;
        if (wasThird) ts.thirdConv++;
        if (wasFourth) ts.fourthConv++;
        this.firstDown();
        text += ' FIRST DOWN!';
        this.emit('firstdown', {});
      } else {
        this.down++;
        if (this.down > 4) { this.turnoverOnDowns(); text = (text + ' Turnover on downs.').trim(); }
      }
      this.next = { type: 'scrimmage' };
    }
    // ---------------------------------------- clock
    if (r.td === null && r.safety === null) {
      if (r.incomplete || r.turnover || pt === 'spike') { this.clockRunning = false; this.restartOnReady = false; }
      else if (r.oob) {
        this.clockRunning = false;
        const late = (this.quarter === 2 && this.clock <= 120) || (this.quarter >= 4 && this.clock <= 300);
        this.restartOnReady = !late;
      } else { this.clockRunning = true; }
    }
    this.lastText = text.trim();
    this.log.push(`[${ordinal(Math.min(this.quarter, 5))} ${formatClock(this.clock)}] ${this.lastText}`);
    this.lastNextAction = this.next;
  }

  processConversion(s, r) {
    const off = s.offIdx;
    const ts = this.box.team[off];
    if (r.flags.length && r.flags[0].type === 'dpi' && r.td !== off) {
      // Spot foul in the end zone: the try is replayed from the 1 (half the distance if already inside it).
      const dir = this.attackDir(off), goal = this.oppGoal(off);
      const toGoal = (goal - s.losX) * dir;
      const spot = toGoal > 2 ? 1 : toGoal / 2;
      this.box.team[1 - off].penalties++;
      this.box.team[1 - off].penYds += Math.max(1, Math.round(toGoal - spot));
      this.ballX = goal - dir * spot; this.ballY = MID_Y;
      this.down = 1; this.lineToGain = goal;
      this.lastText = 'PENALTY: Defensive pass interference. The try will be replayed.';
      this.log.push(this.lastText);
      this.emit('penalty', { type: 'dpi', team: 1 - off, yards: toGoal - spot, text: 'Defensive pass interference' });
      this.next = { type: 'conversion' };
      this.lastNextAction = this.next;
      return;
    }
    ts.twoAtt++;
    const good = r.td === off;
    if (good) { this.score[off] += 2; this.box.addScore(off, this.quarter, 2); ts.twoConv++; this.lastText = 'Two-point conversion is GOOD!'; }
    else if (r.td === 1 - off) { this.score[1 - off] += 2; this.box.addScore(1 - off, this.quarter, 2); this.lastText = 'Two-point try fails — returned for two points by the defense!'; }
    else this.lastText = 'Two-point conversion fails.';
    this.log.push(this.lastText);
    this.conversion = false;
    this.next = { type: 'kickoff', team: off };
    this.lastNextAction = this.next;
  }

  processKickoff(s, r) {
    const kt = s.kickTeam, rt = s.recvTeam;
    const box = this.box;
    let text = '';
    const returner = s.ents.find((e) => e.id === s.stats.returner);
    if (r.reason === 'onside') {
      const rec = r.possession;
      text = rec === kt ? `ONSIDE KICK RECOVERED by ${this.teams[kt].def.name}!` : `Onside kick recovered by ${this.teams[rt].def.name}.`;
      this.possession = rec;
      if (this.ot && rec !== kt) { /* receiving team's possession begins */ }
      this.ballX = clamp(r.endX, GOAL_LINE_W + 1, GOAL_LINE_E - 1);
      this.ballY = this.hashY(r.endY);
      this.firstDown();
      this.startDrive();
      this.next = { type: 'scrimmage' };
    } else if (r.td === rt) {
      text = `${entName(returner)} returns the kick for a TOUCHDOWN!`;
      if (returner) { const p = box.p(returner.id, returner); p.kr++; p.kryds += Math.max(0, Math.round(this.yardLineOf(rt, r.endX) - this.yardLineOf(rt, s.catchX ?? r.endX))); p.rettd++; }
      if (this.ot) this.ot.poss[rt]++;
      this.possession = rt;
      this.scoreTD(rt);
    } else if (r.td === kt) {
      text = `Fumble on the return — recovered and taken in for a TOUCHDOWN by ${this.teams[kt].def.name}!`;
      this.possession = kt;
      this.scoreTD(kt);
    } else {
      let x;
      if (r.spotOverride !== null && r.spotOverride !== undefined) {
        x = this.xFromYardLine(rt, r.spotOverride);
        text = r.reason === 'touchback' ? `Touchback. Ball at the ${r.spotOverride}.` : r.reason === 'short_kick' ? 'Kick short of the landing zone — ball at the 40.' : r.reason === 'kick_oob' ? 'Kickoff out of bounds — ball at the 40.' : '';
        if (r.reason === 'touchback') box.team[kt].touchbacks++;
        this.possession = rt;
        this.ballX = x; this.ballY = MID_Y;
      } else {
        this.possession = r.possession;
        this.ballX = clamp(r.endX, GOAL_LINE_W + 0.5, GOAL_LINE_E - 0.5);
        this.ballY = this.hashY(r.endY);
        if (returner && r.possession === rt) {
          const p = box.p(returner.id, returner); p.kr++;
          const retYds = Math.max(0, Math.round(this.yardLineOf(rt, r.endX) - this.yardLineOf(rt, s.catchX ?? r.endX)));
          p.kryds += retYds; box.team[rt].kr++; box.team[rt].krYds += retYds;
          text = `${entName(returner)} returns the kickoff to the ${this.yardTextFor(rt, r.endX)}.`;
        } else if (r.possession === kt) text = `Fumble on the return! Recovered by ${this.teams[kt].def.name}.`;
        if (r.safety !== null) { this.scoreSafety(r.safety); this.lastText = text + ' Safety.'; return; }
      }
      if (r.touchback && r.spotOverride === null) { this.ballX = this.xFromYardLine(rt, 20); this.ballY = MID_Y; }
      this.firstDown();
      this.startDrive();
      this.next = { type: 'scrimmage' };
    }
    this.clockRunning = false;
    this.lastText = text;
    this.log.push(`[${ordinal(Math.min(this.quarter, 5))} ${formatClock(this.clock)}] ${text}`);
    this.lastNextAction = this.next;
  }

  yardTextFor(team, x) {
    const yl = this.yardLineOf(team, x);
    if (Math.abs(yl - 50) < 0.5) return '50';
    return yl < 50 ? `${this.teams[team].def.abbr} ${Math.round(yl)}` : `${this.teams[1 - team].def.abbr} ${Math.round(100 - yl)}`;
  }

  processPunt(s, r) {
    const kt = s.kickTeam, rt = s.recvTeam;
    const box = this.box;
    const P = s.punter;
    let text = '';
    const puntYds = s.landing ? Math.round(Math.abs((s.landing.x) - s.losX)) : 0;
    if (this.drive) this.drive.plays++;
    if (s.events.some((e) => e.type === 'punt')) {
      box.team[kt].punts++; box.team[kt].puntYds += puntYds;
      const pp = box.p(P.id, P); pp.punts++; pp.puntyds += puntYds;
    }
    const returner = s.ents.find((e) => e.id === s.stats.returner);
    if (r.td === rt) {
      text = `${entName(returner)} returns the punt for a TOUCHDOWN!`;
      if (returner) { const p = box.p(returner.id, returner); p.pr++; p.rettd++; }
      if (this.ot) { this.ot.poss[kt]++; this.ot.poss[rt]++; }
      this.endDrive();
      this.possession = rt;
      this.scoreTD(rt);
    } else if (r.td === kt) {
      text = `Muffed punt recovered in the end zone by ${this.teams[kt].def.name} — TOUCHDOWN!`;
      this.scoreTD(kt);
    } else if (r.safety !== null) {
      const blocked = s.events.some((e) => e.type === 'blocked');
      text = blocked && r.possession === kt ? 'Punt BLOCKED! Downed in the end zone — SAFETY!' : `${entName(returner)} is brought down in the end zone — SAFETY!`;
      if (this.ot) { this.ot.poss[kt]++; if (r.possession === rt) this.ot.poss[rt]++; }
      this.endDrive();
      this.scoreSafety(r.safety);
    } else if (r.possession === kt && !r.touchback) {
      text = s.events.some((e) => e.type === 'blocked') ? 'Punt BLOCKED! Recovered by the kicking team.' : `Muffed punt! Recovered by ${this.teams[kt].def.name}.`;
      this.ballX = clamp(r.endX, GOAL_LINE_W + 0.5, GOAL_LINE_E - 0.5); this.ballY = this.hashY(r.endY);
      const reached = (this.ballX - this.lineToGain) * s.dir >= 0;
      if (s.events.some((e) => e.type === 'blocked') && !reached) { this.changePossession(rt, this.ballX, this.ballY); text = 'Punt BLOCKED! Turnover on downs.'; }
      else { this.firstDown(); }
      this.next = { type: 'scrimmage' };
    } else {
      let x, y = MID_Y;
      if (r.touchback || r.spotOverride === 20) { x = this.xFromYardLine(rt, 20); text = `${entName(P)} punts ${puntYds} yards. Touchback.`; }
      else {
        x = r.endX; y = r.endY;
        if (r.reason === 'faircatch') text = `${entName(P)} punts ${puntYds} yards. Fair catch by ${entName(returner || s.returners[0])}.`;
        else if (r.reason === 'downed') text = `${entName(P)} punts ${puntYds} yards, downed at the ${this.yardTextFor(rt, x)}.`;
        else if (r.reason === 'punt_oob') text = `${entName(P)} punts ${puntYds} yards, out of bounds at the ${this.yardTextFor(rt, x)}.`;
        else if (returner) {
          const retYds = Math.max(0, Math.round(this.yardLineOf(rt, r.endX) - this.yardLineOf(rt, s.catchX ?? r.endX)));
          const p = box.p(returner.id, returner); p.pr++; p.pryds += retYds; box.team[rt].pr++; box.team[rt].prYds += retYds;
          text = `${entName(P)} punts ${puntYds} yards. ${entName(returner)} returns it to the ${this.yardTextFor(rt, x)}.`;
        } else text = `${entName(P)} punts ${puntYds} yards.`;
        if (r.safety !== null) { this.scoreSafety(r.safety); this.lastText = text; return; }
      }
      this.changePossession(rt, x, y);
      this.next = { type: 'scrimmage' };
    }
    this.clockRunning = false;
    this.lastText = text;
    this.log.push(`[${ordinal(Math.min(this.quarter, 5))} ${formatClock(this.clock)}] ${text}`);
    this.lastNextAction = this.next;
  }

  processFG(s, r) {
    const kt = s.kickTeam;
    const box = this.box;
    const K = s.kicker;
    const dist = Math.round(Math.abs((s.dir > 0 ? 110 : 10) - s.losX) + 17);
    const kp = box.p(K.id, K);
    let text = '';
    if (s.kind === 'xp') {
      box.team[kt].xpa++; kp.xpa++;
      if (r.fg) { this.score[kt] += 1; this.box.addScore(kt, this.quarter, 1); box.team[kt].xpm++; kp.xpm++; text = `${entName(K)} extra point is GOOD.`; }
      else text = `${entName(K)} extra point is NO GOOD.`;
      this.next = { type: 'kickoff', team: kt };
    } else {
      if (this.drive) this.drive.plays++;
      box.team[kt].fga++; kp.fga++;
      if (r.fg) {
        this.score[kt] += 3; this.box.addScore(kt, this.quarter, 3);
        box.team[kt].fgm++; kp.fgm++; kp.fglong = Math.max(kp.fglong, dist);
        text = `${entName(K)} ${dist}-yard field goal is GOOD!`;
        if (this.ot) this.ot.poss[kt]++;
        this.endDrive();
        this.next = { type: 'kickoff', team: kt };
      } else {
        text = `${entName(K)} ${dist}-yard field goal is NO GOOD${r.reason === 'fg_blocked' ? ' — BLOCKED!' : '.'}`;
        // Defense takes over at the spot of the kick (or the 20 if closer).
        const spot = s.losX - s.dir * 7;
        const def = 1 - kt;
        let x = spot;
        if (this.yardLineOf(def, spot) < 20) x = this.xFromYardLine(def, 20);
        this.changePossession(def, x, MID_Y);
        this.next = { type: 'scrimmage' };
      }
    }
    this.clockRunning = false;
    this.lastText = text;
    this.log.push(`[${ordinal(Math.min(this.quarter, 5))} ${formatClock(this.clock)}] ${text}`);
    this.lastNextAction = this.next;
  }

  // ------------------------------------------------------------------ practice & scenarios
  resetPractice() {
    const pr = this.settings.practice;
    const userTeam = this.controllers[0] ? 0 : 1;
    this.possession = pr.side === 'defense' ? 1 - userTeam : userTeam;
    this.quarter = 1; this.clock = this.quarterLen; this.clockRunning = false;
    this.score = [0, 0];
    this.ballX = this.xFromYardLine(this.possession, pr.yardLine ?? 35);
    this.ballY = MID_Y;
    this.down = pr.down ?? 1;
    this.firstDown();
    this.down = pr.down ?? 1;
    this.conversion = false;
    this.next = null;
    this.setupScrimmage({ playClock: 40 });
  }

  startDrill() {
    const user = this.controllers[0] ? 0 : 1;
    this.quarter = 4; this.clock = 120; this.twoMinWarned[4] = true; this.twoMinWarned[2] = true;
    this.score[user] = 17; this.score[1 - user] = 21;
    this.box.addScore(user, 1, 7); this.box.addScore(user, 2, 10); this.box.addScore(1 - user, 1, 14); this.box.addScore(1 - user, 3, 7);
    this.timeouts = [3, 3]; this.timeouts[user] = 1;
    this.possession = user;
    this.ballX = this.xFromYardLine(user, 25); this.ballY = MID_Y;
    this.firstDown();
    this.startDrive();
    this.log.push('Two-minute drill: down 4, 2:00 left, ball on your own 25.');
    this.setupScrimmage({ playClock: 25 });
  }

  // Pre-snap audibles rebuild the play keeping the opponent's call.
  audible(team, play, flip) {
    if (this.phase !== 'presnap' || !this.sim || this.sim.kind !== 'scrimmage' || team !== this.possession) return false;
    const old = this.sim;
    this.calls[team] = { kind: 'scrimmage', play, flip };
    this.sim = new PlaySim({ ...old.cfg, offPlay: play, flip, defPlay: old.defPlay });
    this.sim.userEnt = [null, null];
    this.sim.pickDefaultUsers();
    return true;
  }

  audibleDefense(team, play) {
    if (this.phase !== 'presnap' || !this.sim || this.sim.kind !== 'scrimmage' || team === this.possession) return false;
    const old = this.sim;
    this.calls[team] = { kind: 'scrimmage', play };
    this.sim = new PlaySim({ ...old.cfg, defPlay: play });
    this.sim.pickDefaultUsers();
    return true;
  }

  // ------------------------------------------------------------------ transitions
  advance() {
    const n = this.next || { type: 'scrimmage' };
    this.next = null;
    if (this.over) return;
    if (this.settings.practice) { this.endDrive(); return this.resetPractice(); }
    switch (n.type) {
      case 'scrimmage': this.setupScrimmage(); break;
      case 'kickoff': this.setupKickoff(n.team, { fromYL: n.safety ? 20 : 35, safety: n.safety }); break;
      case 'pat': this.setupPAT(n.team); break;
      case 'conversion': this.setupScrimmage({ conversion: true }); break;
      case 'quarter_end': this.endQuarter(n.resume); break;
      case 'final': this.finalize(); break;
      default: this.setupScrimmage();
    }
  }

  setupPAT(team) {
    if (this.checkOTEnd(team, true)) return;
    this.possession = team;
    this.phase = 'pat_choice';
    this.phaseT = 0;
    this.sim = null;
    this.emit('phase', { phase: 'pat_choice', team });
    if (!this.isUser(team)) this.choosePAT(AI.patDecision(this, team));
  }

  choosePAT(kind) {
    const team = this.possession;
    const dir = this.attackDir(team);
    const goal = this.oppGoal(team);
    if (kind === 'two') {
      this.ballX = goal - dir * 2; this.ballY = MID_Y;
      this.down = 1; this.lineToGain = goal;
      this.setupScrimmage({ conversion: true });
    } else {
      this.ballX = goal - dir * 15; this.ballY = MID_Y;
      this.conversion = false;
      this.startKickPlay('xp', null);
    }
  }

  endQuarter(resume) {
    const q = this.quarter;
    this.emit('quarter_end', { quarter: q });
    if (q === 2) return this.halftime();
    if (q >= 4) {
      if (this.ot && !this.settings.playoff) return this.finalize();
      if (q === 4 && this.score[0] === this.score[1]) return this.startOT();
      if (q >= 5 && this.settings.playoff && !this.otDecided()) return this.nextOTPeriod(resume);
      return this.finalize();
    }
    // Q1 -> Q2, Q3 -> Q4: switch ends, keep possession/down/distance
    this.quarter++;
    this.clock = this.quarterLen;
    this.mirrorField();
    this.log.push(`End of ${ordinal(q)} quarter.`);
    this.resumeAfterBreak(resume);
  }

  mirrorField() {
    this.ballX = 120 - this.ballX;
    this.lineToGain = 120 - this.lineToGain;
    this.ballY = FIELD_WIDTH - this.ballY;
  }

  resumeAfterBreak(resume) {
    this.clockRunning = false;
    this.restartOnReady = false;
    const r = resume || { type: 'scrimmage' };
    if (r.type === 'kickoff') this.setupKickoff(r.team, { fromYL: r.safety ? 20 : 35, safety: r.safety });
    else if (r.type === 'pat') this.setupPAT(r.team);
    else this.setupScrimmage({ playClock: 25 });
  }

  halftime() {
    this.quarter = 3;
    this.clock = this.quarterLen;
    this.timeouts = [3, 3];
    this.log.push('Halftime.');
    this.emit('halftime', {});
    this.endDrive();
    // Team that received the opening kick now kicks.
    this.setupKickoff(this.kickReceivedFirst);
  }

  startOT() {
    this.quarter = 5;
    const len = Math.max(60, Math.round(this.quarterLen * (this.settings.playoff ? 1 : 2 / 3)));
    this.clock = len;
    this.timeouts = this.settings.playoff ? [3, 3] : [2, 2];
    const winner = this.rng.chance(0.5) ? 0 : 1;
    this.ot = { poss: [0, 0], receiver: winner, sudden: false };
    this.log.push(`Overtime! ${this.teams[winner].def.name} win the toss and will receive.`);
    this.emit('overtime', { winner });
    this.setupKickoff(1 - winner);
  }

  nextOTPeriod(resume) {
    this.quarter++;
    this.clock = this.quarterLen;
    if ((this.quarter - 5) % 2 === 0) this.timeouts = [3, 3];
    this.mirrorField();
    this.resumeAfterBreak(resume);
  }

  // Overtime end conditions (2025+ rules): the game ends as soon as one team
  // leads and the trailing team has already had a possession (this covers
  // both-teams-possess, sudden death, and defensive scores on the first drive).
  // A try still to come for the trailing team can tie or win the game, so it is played.
  checkOTEnd(patTeam = null, now = false) {
    if (!this.otDecided(patTeam)) return false;
    this.next = { type: 'final' };
    if (now) this.finalize();
    return true;
  }

  otDecided(patTeam = null) {
    if (!this.ot || this.over) return false;
    const [a, b] = this.score;
    if (a === b) return false;
    const trailing = a > b ? 1 : 0;
    if (patTeam === trailing) return false;
    return this.ot.poss[trailing] >= 1;
  }

  finalize() {
    this.over = true;
    this.phase = 'final';
    this.sim = this.sim || null;
    const [a, b] = this.score;
    const txt = a === b ? 'Final — the game ends in a tie.' : `Final: ${this.teams[0].def.name} ${a}, ${this.teams[1].def.name} ${b}.`;
    this.log.push(txt);
    this.emit('final', { score: this.score.slice() });
  }

  // Late-game clock tactic for runners.
  wantsOutOfBounds(team) {
    const diff = this.score[team] - this.score[1 - team];
    if (this.quarter >= 4 && this.clock < 150 && diff <= 0 && this.timeouts[team] < 2) return true;
    if (this.quarter === 2 && this.clock < 60) return true;
    return false;
  }

  // Run a whole game with no rendering (tests / quick sim of user games).
  simulateToEnd(maxSteps = 4e6) {
    let steps = 0;
    while (!this.over && steps < maxSteps) {
      // Auto-calls for any user teams
      if (this.phase === 'playcall') {
        for (const t of [0, 1]) if (!this.calls[t]) {
          if (t === this.possession) this.calls[t] = this.cpuOffCall();
          else this.calls[t] = { pending: true };
        }
        this.tryStartPlay();
      }
      if (this.phase === 'kick_call' && !this.calls[this.kickTeam]) this.submitKickoffCall(AI.kickoffChoice(this, this.kickTeam));
      if (this.phase === 'pat_choice') this.choosePAT(AI.patDecision(this, this.possession));
      if (this.phase === 'presnap' && this.presnapWait === Infinity) this.presnapWait = 0.5;
      this.update(DT);
      steps++;
    }
    return steps;
  }
}

function sideOf(s, y) { return (y - s.ballY0) * s.dir; }

export function makeWeather(kind, rng) {
  let k = kind;
  if (k === 'random') k = rng.weighted(['clear', 'clear', 'clear', 'rain', 'snow', 'wind'], () => 1);
  const wind = k === 'wind' ? rng.range(12, 22) : k === 'clear' ? rng.range(0, 6) : rng.range(3, 12);
  return { kind: k === 'wind' ? 'clear' : k, label: k, wind, windDir: rng.range(0, Math.PI * 2) };
}
