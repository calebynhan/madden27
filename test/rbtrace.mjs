import { PlaySim } from '../src/sim/play.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { OFF_PLAYS } from '../src/data/playbook_offense.js';
import { DEF_PLAYS } from '../src/data/playbook_defense.js';
import { DT } from '../src/core/constants.js';
const teams = defaultLeague();
const [, , name, dname, seed] = process.argv;
const op = OFF_PLAYS.find((p) => p.name === name), dp = DEF_PLAYS.find((p) => p.name === dname);
const sim = new PlaySim({ game: { down: 1, wantsOutOfBounds: () => false }, rng: new RNG(+seed), kind: 'scrimmage', offIdx: 0, teams: [teams[3], teams[9]], dir: 1, ballX: 35, ballY: 26.67, offPlay: op, defPlay: dp, flip: false, firstDownX: 45, difficulty: 2 });
sim.snap();
const rb = sim.off.find((e) => e.tag === 'RB');
let n = 0;
while (!sim.dead && n < 900) {
  sim.step(DT); n++;
  if (n % 6 === 0 && sim.t > 0.4) {
    const f = sim.frame(rb.x, rb.y);
    const near = sim.ents.filter((e) => e !== rb && Math.hypot(e.x - rb.x, e.y - rb.y) < 2.2).map((e) => `${e.side}${e.tag}${e.engaged ? 'E' : ''}@${Math.hypot(e.x - rb.x, e.y - rb.y).toFixed(1)}`);
    console.log(`t=${sim.t.toFixed(2)} RB f=${f.f.toFixed(1)} l=${f.l.toFixed(1)} v=${rb.speed.toFixed(1)} hd=${(rb.runHeading ?? 0).toFixed(2)} ball=${rb.hasBall} near: ${near.join(' ')}`);
  }
}
console.log(sim.result.reason, (sim.result.endX - 35).toFixed(1), sim.events.map((e) => e.t.toFixed(2) + e.type).join(' '));
