import { PlaySim } from '../src/sim/play.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { DT } from '../src/core/constants.js';
const teams = defaultLeague();
const kind = process.argv[2] || 'punt';
const N = +(process.argv[3] || 200);
const res = {}; let ret = 0, retN = 0, gross = 0, gN = 0;
for (let i = 0; i < N; i++) {
  const rng = new RNG(i + 1);
  const sim = new PlaySim({ game: { down: 4, wantsOutOfBounds: () => false }, rng, kind, offIdx: 0, teams: [teams[i % 32], teams[(i * 5 + 1) % 32]], dir: 1, ballX: kind === 'kickoff' ? 45 : 40, ballY: 26.67, difficulty: 2 });
  sim.snap();
  let n = 0;
  while (!sim.dead && n < 3000) {
    sim.step(DT); n++;
    if (process.argv[4] && i === 0 && n % 20 === 0) {
      const c = sim.carrier;
      const cov = sim.ents.filter((e) => e.team === 0).map((e) => `${e.tag}${e.engaged ? 'E' : ''}${e.state === 'down' || e.state === 'falling' ? 'D' : ''}@${c ? Math.hypot(e.x - c.x, e.y - c.y).toFixed(0) : '-'}`);
      console.log(sim.t.toFixed(1), sim.phase, c ? `${c.tag}(${c.x.toFixed(1)},${c.y.toFixed(1)}) v=${c.speed.toFixed(1)}` : `ball(${sim.ball.x.toFixed(1)},${sim.ball.z.toFixed(1)})`, cov.join(' '));
    }
  }
  const r = sim.result;
  res[r.reason] = (res[r.reason] || 0) + 1;
  if (sim.landing) { gross += sim.landing.x - 40; gN++; }
  if (r.reason === 'tackle' || r.reason === 'td' || r.reason === 'oob') { ret += (sim.catchX ?? r.endX) - r.endX; retN++; }
}
console.log(kind, res, 'avg return', (ret / Math.max(1, retN)).toFixed(1), 'avg landing dist', (gross / Math.max(1, gN)).toFixed(1));
