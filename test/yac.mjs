import { PlaySim } from '../src/sim/play.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { OFF_PLAYS } from '../src/data/playbook_offense.js';
import { DEF_PLAYS } from '../src/data/playbook_defense.js';
import { DT } from '../src/core/constants.js';
const teams = defaultLeague();
const rng = new RNG(5);
const offs = OFF_PLAYS.filter((p) => p.type !== 'run' && !p.tags.includes('hailmary'));
const rows = [];
for (let i = 0; i < 600; i++) {
  const sim = new PlaySim({ game: { down: 1, wantsOutOfBounds: () => false }, rng, kind: 'scrimmage', offIdx: 0, teams: [teams[rng.int(0, 31)], teams[rng.int(0, 31)]], dir: 1, ballX: 35, ballY: 26.67, offPlay: rng.pick(offs), defPlay: rng.pick(DEF_PLAYS), flip: rng.chance(0.5), firstDownX: 45, difficulty: 2 });
  sim.snap();
  let catchT = null, nearAtCatch = null, catchX = null, speedAtCatch = null, tgtMargin = null;
  while (!sim.dead && sim.t < 30) {
    const wasCarrier = sim.carrier;
    sim.step(DT);
    if (catchT === null && sim.stats.receiver && sim.carrier && sim.carrier.id === sim.stats.receiver) {
      catchT = sim.t; catchX = sim.carrier.x; speedAtCatch = sim.carrier.speed;
      nearAtCatch = Math.min(...sim.def.filter((d) => d.isActive()).map((d) => Math.hypot(d.x - sim.carrier.x, d.y - sim.carrier.y)));
    }
  }
  if (catchT === null || !sim.result || sim.result.turnover) continue;
  const r = sim.result;
  const yac = ((r.td === 0 ? 110 : r.endX) - catchX);
  rows.push({ yac, near: nearAtCatch, dt: sim.t - catchT, sp: speedAtCatch, reason: r.reason });
}
const q = (arr, p) => { const b = arr.slice().sort((a, c) => a - c); return b[Math.floor(p * (b.length - 1))]; };
const near = rows.map((r) => r.near), yac = rows.map((r) => r.yac), tt = rows.map((r) => r.dt), sp = rows.map((r) => r.sp);
console.log('completions', rows.length);
console.log('nearest defender at catch: p25', q(near, 0.25).toFixed(1), 'med', q(near, 0.5).toFixed(1), 'p75', q(near, 0.75).toFixed(1));
console.log('receiver speed at catch: med', q(sp, 0.5).toFixed(1));
console.log('time catch->dead: med', q(tt, 0.5).toFixed(2), 'YAC p25', q(yac, 0.25).toFixed(1), 'med', q(yac, 0.5).toFixed(1), 'p75', q(yac, 0.75).toFixed(1), 'avg', (yac.reduce((a, b) => a + b, 0) / yac.length).toFixed(1));
const bucket = (lo, hi) => { const b = rows.filter((r) => r.near >= lo && r.near < hi); return `${lo}-${hi}yd: n${b.length} medYAC ${b.length ? q(b.map((r) => r.yac), 0.5).toFixed(1) : '-'}`; };
console.log(bucket(0, 1.5), '|', bucket(1.5, 3), '|', bucket(3, 6), '|', bucket(6, 99));
