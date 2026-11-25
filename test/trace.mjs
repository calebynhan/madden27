import { PlaySim } from '../src/sim/play.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { OFF_PLAYS } from '../src/data/playbook_offense.js';
import { DEF_PLAYS } from '../src/data/playbook_defense.js';
import { DT } from '../src/core/constants.js';
const [, , offName, defName, seed = '1', form = ''] = process.argv;
const teams = defaultLeague();
const op = OFF_PLAYS.find((p) => p.name === offName && (!form || p.form === form));
const dp = DEF_PLAYS.find((p) => p.name === defName);
const rng = new RNG(+seed);
const sim = new PlaySim({ game: { down: 1, wantsOutOfBounds: () => false }, rng, kind: 'scrimmage', offIdx: 0, teams: [teams[0], teams[5]], dir: 1, ballX: 35, ballY: 26.67, offPlay: op, defPlay: dp, flip: false, firstDownX: 45, difficulty: 2 });
sim.snap();
const fmt = (e) => { const f = sim.frame(e.x, e.y); return `${e.tag}(${f.f.toFixed(1)},${f.l.toFixed(1)}${e.engaged ? 'E' : ''}${e.state === 'down' || e.state === 'falling' ? 'D' : ''})`; };
let n = 0;
while (!sim.dead && n < 1500) {
  sim.step(DT); n++;
  if (n % 12 === 0) {
    const c = sim.carrier;
    console.log(`t=${sim.t.toFixed(2)} ${sim.phase} carrier=${c ? fmt(c) : '-'} DEF: ${sim.def.map(fmt).join(' ')}`);
  }
}
console.log(sim.result.reason, sim.result.playType, (sim.result.endX - 35).toFixed(1));
console.log(sim.events.filter((e) => !['move'].includes(e.type)).map((e) => `${e.t.toFixed(2)}:${e.type}`).join(' '));
