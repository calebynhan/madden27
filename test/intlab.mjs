import { PlaySim } from '../src/sim/play.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { OFF_PLAYS } from '../src/data/playbook_offense.js';
import { DEF_PLAYS } from '../src/data/playbook_defense.js';
import { DT } from '../src/core/constants.js';
import * as P from '../src/sim/passing.js';
const teams = defaultLeague();
const rng = new RNG(99);
const offs = OFF_PLAYS.filter((p) => p.type === 'pass');
const stats = { att: 0, int: 0, undercut: 0, bad: 0, types: {}, intTypes: {}, margins: [], intMargins: [], depth: [], intDepth: [], defended: 0, drop: 0, over: 0, cmp: 0 };
for (let i = 0; i < 1500; i++) {
  const op = rng.pick(offs), dp = rng.pick(DEF_PLAYS);
  const sim = new PlaySim({ game: { down: 1, wantsOutOfBounds: () => false }, rng, kind: 'scrimmage', offIdx: 0, teams: [teams[rng.int(0, 31)], teams[rng.int(0, 31)]], dir: 1, ballX: 35, ballY: 26.67, offPlay: op, defPlay: dp, flip: rng.chance(0.5), firstDownX: 45, difficulty: 2 });
  sim.snap();
  let ev = null;
  const origThrow = null;
  while (!sim.dead && sim.t < 45) {
    if (!sim.thrown && sim.qb.hasBall) {
      // record evaluation at throw time
    }
    const wasThrown = sim.thrown;
    sim.step(DT);
    if (!wasThrown && sim.thrown && sim.target) ev = { type: sim.ball.flight.type, depth: sim.stats.airYards };
  }
  if (!ev || sim.thrownAway || !sim.result) continue;
  stats.att++;
  stats.types[ev.type] = (stats.types[ev.type] || 0) + 1;
  const r = sim.result;
  const inc = r.events.find((e) => e.type === 'incomplete');
  { const b = ev.depth < 10 ? 's' : ev.depth < 20 ? 'm' : 'd'; stats['a' + b] = (stats['a' + b] || 0) + 1; }
  if (r.stats.intBy) { stats.int++; stats.intTypes[ev.type] = (stats.intTypes[ev.type] || 0) + 1; stats.intDepth.push(ev.depth); }
  else if (r.stats.receiver) { stats.cmp++; const b = ev.depth < 10 ? 's' : ev.depth < 20 ? 'm' : 'd'; stats['c' + b] = (stats['c' + b] || 0) + 1; stats.yac = (stats.yac || 0) + ((r.td === 0 ? 110 : r.endX) - (sim.catchX ?? r.endX)); }
  else if (inc) { const b = ev.depth < 10 ? 's' : ev.depth < 20 ? 'm' : 'd'; stats.why = stats.why || {}; stats.why[b + ':' + inc.why] = (stats.why[b + ':' + inc.why] || 0) + 1; stats[inc.why === 'defended' || inc.why === 'broken_up' ? 'defended' : inc.why === 'drop' ? 'drop' : 'over']++; }
  stats.depth.push(ev.depth);
}
const avg = (a) => (a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)).toFixed(1);
console.log(`att ${stats.att} cmp ${(100 * stats.cmp / stats.att).toFixed(1)}% int ${(100 * stats.int / stats.att).toFixed(1)}% defended ${(100 * stats.defended / stats.att).toFixed(1)}% drop ${(100 * stats.drop / stats.att).toFixed(1)}% overthrown/oob ${(100 * stats.over / stats.att).toFixed(1)}%`);
console.log('types', stats.types, 'intTypes', stats.intTypes, 'avg air', avg(stats.depth), 'int avg air', avg(stats.intDepth));
console.log(`cmp% short ${(100*stats.cs/stats.as).toFixed(1)} (n${stats.as}) mid ${(100*stats.cm/stats.am).toFixed(1)} (n${stats.am}) deep ${(100*stats.cd/stats.ad).toFixed(1)} (n${stats.ad})  avg YAC ${(stats.yac/stats.cmp).toFixed(1)}`);
console.log(stats.why);
