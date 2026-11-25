// CPU coaching: play calls, 4th-down decisions, PAT choices, onside kicks.
import { OFF_PLAYS, STYLE_FORMATIONS, STYLE_RUN_RATE, SPECIAL_OFF } from '../data/playbook_offense.js';
import { DEF_PLAYS, DEF_STYLE_FORMATIONS } from '../data/playbook_defense.js';
import { OFF_FORMATIONS } from '../data/formations.js';
import { clamp } from '../core/util.js';

export function situation(game, team) {
  const opp = 1 - team;
  const dir = game.attackDir(team);
  const goal = dir > 0 ? 110 : 10;
  const toGoal = (goal - game.ballX) * dir;
  const toGo = Math.max(0.5, (game.lineToGain - game.ballX) * dir);
  const diff = game.score[team] - game.score[opp];
  const q = game.quarter;
  const clock = game.clock;
  const half2 = q >= 3;
  const endHalf = (q === 2 || q >= 4);
  const secsLeftHalf = endHalf ? clock : clock + game.quarterLen;
  return { team, opp, dir, toGoal, toGo, diff, q, clock, secsLeftHalf, half2, down: game.down, timeouts: game.timeouts[team], oppTimeouts: game.timeouts[opp] };
}

function kickRange(game, team) {
  const k = game.kicker(team);
  const kpw = k ? k.r.kpw : 80;
  const base = 46 + (kpw - 70) * 0.5; // ~46 (70 kpw) .. ~60 (99 kpw)
  const w = game.weather.kind === 'snow' ? -4 : game.weather.kind === 'rain' ? -2 : 0;
  return base + w;
}

// Returns 'go' | 'punt' | 'fg'
export function fourthDownDecision(game, team) {
  const s = situation(game, team);
  const fgDist = s.toGoal + 17;
  const range = kickRange(game, team);
  const late = s.q >= 4 && s.clock < 300;
  const veryLate = s.q >= 4 && s.clock < 120;
  // Must-score situations
  if (late && s.diff < 0) {
    if (s.diff >= -3 && fgDist <= range && (veryLate || s.toGo > 3)) return 'fg';
    if (s.diff < -3 || veryLate) return 'go';
  }
  if (veryLate && s.diff > 0 && s.toGoal > 45) return 'punt';
  if (s.q === 2 && s.clock < 10 && fgDist <= range + 3) return 'fg';
  if (s.toGo <= 1 && s.toGoal <= 75 && !(late && s.diff > 0)) return 'go';
  if (s.toGo <= 2 && s.toGoal <= 45 && s.toGoal > 3 && fgDist > range - 6) return 'go';
  if (s.toGoal <= 4 && s.toGo <= 3 && s.diff <= 3) return game.rng.chance(0.55) ? 'go' : 'fg';
  if (fgDist <= range) return 'fg';
  if (s.toGoal < 42 && s.toGo <= 4) return 'go';
  return 'punt';
}

export function patDecision(game, team) {
  const opp = 1 - team;
  const diff = game.score[team] - game.score[opp];
  const late = game.quarter >= 4 || (game.quarter === 3 && game.clock < 120);
  if (late && [-2, -5, -9, -10, -12, -13, -16, 1, 5, 12].includes(diff)) return 'two';
  if (game.rng.chance(0.06)) return 'two';
  return 'xp';
}

export function onsideDecision(game, team) {
  const diff = game.score[team] - game.score[1 - team];
  if (game.quarter >= 4 && game.clock < 200 && diff < 0 && diff >= -16) return true;
  return false;
}

export function shouldKneel(game, team) {
  const s = situation(game, team);
  if (s.diff <= 0) return false;
  if (!(s.q === 4 || s.q === 2 || s.q >= 5)) return false;
  if (s.q === 2 && s.diff >= 0 && s.clock < 25 && s.toGoal > 50) return true;
  const downsLeft = 4 - s.down + 1;
  // Each kneel burns ~40s unless the defense has timeouts.
  const burn = (downsLeft - s.oppTimeouts) * 40 + Math.min(downsLeft, s.oppTimeouts) * 2;
  return game.clockRunning !== false && s.clock <= burn && s.q >= 4;
}

export function shouldSpike(game, team) {
  const s = situation(game, team);
  if (!game.clockRunning || s.down >= 4) return false;
  if (!((s.q === 2 || s.q >= 4) && s.clock < 40 && s.clock > 3)) return false;
  if (s.timeouts > 0) return false;
  return s.diff <= 0 || s.q === 2;
}

export function wantsHurry(game, team) {
  const s = situation(game, team);
  return ((s.q === 2 && s.clock < 120) || (s.q >= 4 && s.clock < 300 && s.diff < 0) || (s.q >= 4 && s.clock < 150 && s.diff <= 0));
}

export function chooseOffensivePlay(game, team) {
  const s = situation(game, team);
  const ts = game.teams[team];
  const style = ts.def.offStyle;
  const rng = game.rng;
  if (shouldKneel(game, team)) return { play: SPECIAL_OFF.kneel, flip: false };
  if (shouldSpike(game, team) && rng.chance(0.85)) return { play: SPECIAL_OFF.spike, flip: false };
  const forms = STYLE_FORMATIONS[style] || STYLE_FORMATIONS.balanced;
  let runRate = STYLE_RUN_RATE[style] ?? 0.45;
  const hurry = wantsHurry(game, team);
  const protect = s.q >= 4 && s.diff > 0 && s.clock < 360;
  if (s.down === 3 || s.down === 4) runRate = s.toGo <= 1.5 ? 0.62 : s.toGo <= 3 ? 0.4 : s.toGo <= 6 ? 0.15 : 0.06;
  else if (s.down === 2 && s.toGo >= 9) runRate *= 0.7;
  else if (s.down === 2 && s.toGo <= 3) runRate = Math.max(runRate, 0.55);
  if (s.toGoal <= 4) runRate = Math.max(runRate, 0.55);
  if (hurry) runRate = Math.min(runRate, 0.12);
  if (protect) runRate = Math.max(runRate, 0.78);
  const run = rng.chance(runRate);
  const hail = s.toGoal > 38 && s.clock <= 8 && (s.q === 2 || (s.q >= 4 && s.diff < 0 && s.diff >= -8));
  // Candidate plays from the team's playbook
  let cands = OFF_PLAYS.filter((p) => forms.includes(p.form));
  if (hail) {
    const hm = cands.find((p) => p.tags.includes('hailmary')) || OFF_PLAYS.find((p) => p.tags.includes('hailmary'));
    return { play: hm, flip: rng.chance(0.5) };
  }
  cands = cands.filter((p) => !p.tags.includes('hailmary'));
  const shortYd = s.toGo <= 1.5 && (s.down >= 3 || s.toGoal <= 3);
  const goalLine = s.toGoal <= 3;
  cands = cands.filter((p) => {
    const f = OFF_FORMATIONS[p.form];
    if (f.shortYardage && !(shortYd || goalLine)) return false;
    if (run !== (p.type === 'run')) return false;
    return true;
  });
  const weight = (p) => {
    let w = 1;
    const fi = forms.indexOf(p.form);
    w *= 1.6 - fi * 0.08;
    const tg = p.tags;
    if (shortYd && (tg.includes('short') || tg.includes('sneak'))) w *= 2.2;
    if (tg.includes('sneak') && !(s.toGo <= 1 && (s.down >= 3))) w *= 0.05;
    if (OFF_FORMATIONS[p.form].shortYardage && (shortYd || goalLine)) w *= 2.5;
    if (!run) {
      const need = s.toGo;
      if (need >= 12 && tg.includes('deep')) w *= 2.2;
      if (need >= 7 && tg.includes('medium')) w *= 1.6;
      if (need <= 5 && (tg.includes('short') || tg.includes('quick'))) w *= 1.8;
      if (need >= 9 && tg.includes('screen')) w *= 0.35;
      if (s.toGoal <= 20 && tg.includes('redzone')) w *= 2;
      if (s.toGoal <= 12 && tg.includes('deep')) w *= 0.25;
      if (hurry && (tg.includes('sideline') || tg.includes('medium'))) w *= 1.5;
      if (tg.includes('pa') && s.down === 1) w *= 1.4;
      if (tg.includes('pa') && s.down >= 3 && need > 4) w *= 0.4;
    } else {
      if (tg.includes('draw') && s.toGo > 6) w *= 1.6;
      if (tg.includes('option') && (ts.players.find((x) => x.id === ts.depth.QB[0])?.r.spd ?? 60) < 78) w *= 0.25;
    }
    return w;
  };
  if (!cands.length) cands = OFF_PLAYS.filter((p) => forms.includes(p.form) && p.type !== 'run');
  const play = rng.weighted(cands, weight);
  return { play, flip: rng.chance(0.5) };
}

export function chooseDefensivePlay(game, team, offCall) {
  const s = situation(game, 1 - team); // offense's situation
  const ts = game.teams[team];
  const style = ts.def.defStyle;
  const rng = game.rng;
  const forms = DEF_STYLE_FORMATIONS[style] || DEF_STYLE_FORMATIONS['43'];
  const of = offCall ? OFF_FORMATIONS[offCall.play.form] : null;
  const pers = of ? of.personnel : '11';
  const wr = of ? of.slots.filter((x) => x.pos[0] === 'WR' || (x.align === 'slot' || x.align === 'slot2' || x.align === 'wide')).length : 3;
  let group;
  if (s.toGoal <= 3 || (of && of.shortYardage)) group = 'Goal Line';
  else if (s.toGoal > 40 && s.clock < 12 && (s.q === 2 || s.q >= 4) && s.diff <= 0 && s.diff >= -8) group = 'Prevent';
  else if ((of && of.empty) || wr >= 4) group = 'Dime';
  else if (wr === 3 || pers === '10' || pers === '11') group = 'Nickel';
  else group = 'Base';
  if (group === 'Nickel' && s.down === 3 && s.toGo >= 8 && rng.chance(0.4)) group = 'Dime';
  const groupForms = {
    'Goal Line': ['goal_line_d'],
    Prevent: ['quarter_317'],
    Dime: ['dime_416'],
    Nickel: ['nickel_425', 'nickel_335'],
    Base: ['d43_over', 'd43_under', 'd34_odd'],
  }[group];
  let fcands = forms.filter((f) => groupForms.includes(f));
  if (!fcands.length) fcands = groupForms;
  const form = rng.pick(fcands);
  let plays = DEF_PLAYS.filter((p) => p.form === form);
  const blitzRate = s.down === 3 && s.toGo >= 3 && s.toGo <= 8 ? 0.38 : s.down === 1 ? 0.18 : 0.24;
  const runDown = s.toGo <= 2 || (s.down <= 2 && s.toGo <= 5 && s.toGoal > 5);
  const passDown = s.toGo >= 8 || (s.q >= 4 && s.diff < 0 && s.clock < 240);
  const weight = (p) => {
    const tg = p.tags;
    let w = 1;
    if (tg.includes('blitz')) w *= blitzRate / 0.25;
    if (tg.includes('allout')) w *= passDown ? 0.35 : 0.6;
    if (tg.includes('run')) w *= runDown ? 2.4 : 0.25;
    if (tg.includes('deep')) w *= passDown ? 1.8 : 0.8;
    if (tg.includes('man') && s.toGoal < 15) w *= 1.3;
    if (tg.includes('base')) w *= 1.25;
    return w;
  };
  return { play: rng.weighted(plays, weight), flip: false };
}

export function kickoffChoice(game, team) {
  return onsideDecision(game, team) ? 'onside' : 'kickoff';
}

export function cpuWantsTimeout(game, team) {
  // Defense trailing late with the clock running; offense in the two-minute drill.
  const s = situation(game, team);
  if (game.timeouts[team] <= 0 || !game.clockRunning) return false;
  const off = game.possession === team;
  if (s.q >= 4 && s.clock < 150 && s.diff < 0 && !off && s.clock > 5) return true;
  if (s.q >= 4 && s.clock < 100 && s.diff <= 0 && off && s.clock > 3) return true;
  if (s.q === 2 && s.clock < 50 && off && s.toGoal < 60 && s.clock > 3) return true;
  return false;
}

export { clamp };
