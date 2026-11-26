import { PlaySim } from '../src/sim/play.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { OFF_PLAYS } from '../src/data/playbook_offense.js';
import { DEF_PLAYS } from '../src/data/playbook_defense.js';
import { DT } from '../src/core/constants.js';
const teams = defaultLeague();
const rng = new RNG(5);
const offs = OFF_PLAYS.filter((p) => p.type !== 'run' && !p.tags.includes('hailmary'));
let shown = 0;
for (let i = 0; i < 300 && shown < 2; i++) {
  const sim = new PlaySim({ game: { down: 1, wantsOutOfBounds: () => false }, rng, kind: 'scrimmage', offIdx: 0, teams: [teams[rng.int(0, 31)], teams[rng.int(0, 31)]], dir: 1, ballX: 35, ballY: 26.67, offPlay: rng.pick(offs), defPlay: rng.pick(DEF_PLAYS), flip: rng.chance(0.5), firstDownX: 45, difficulty: 2 });
  sim.snap();
  const log = [];
  let catchX = null;
  while (!sim.dead && sim.t < 30) {
    sim.step(DT);
    const c = sim.carrier;
    if (c && sim.stats.receiver === c.id) {
      if (catchX === null) catchX = c.x;
      if (Math.round(sim.t * 60) % 9 === 0) {
        const ds = sim.def.map((d) => ({ d, dd: Math.hypot(d.x - c.x, d.y - c.y) })).sort((a, b) => a.dd - b.dd).slice(0, 3);
        log.push(`t=${sim.t.toFixed(2)} carrier ${c.tag}(${(c.x - 35).toFixed(1)},${c.y.toFixed(1)}) v=${c.speed.toFixed(1)} hd=${(Math.atan2(c.vy, c.vx) * 57).toFixed(0)}° | ` + ds.map(({ d, dd }) => `${d.tag}@${dd.toFixed(1)} v${d.speed.toFixed(1)} ${d.engaged ? 'ENG' : ''}${d.stun > 0 ? 'STUN' : ''}${d.state === 'falling' || d.state === 'down' ? 'DOWN' : ''} task=${d.task?.kind}`).join('  '));
      }
    }
  }
  if (catchX === null || !sim.result) continue;
  const yac = (sim.result.td === 0 ? 110 : sim.result.endX) - catchX;
  if (yac < 18) continue;
  shown++;
  console.log(`--- ${sim.offPlay.name} vs ${sim.defPlay.name}: YAC ${yac.toFixed(1)} result ${sim.result.reason}`);
  console.log(log.slice(0, 16).join('\n'));
  console.log(sim.result.events.filter((e) => ['catch', 'brokentackle', 'evade', 'tackle', 'stiffarm', 'truck'].includes(e.type)).map((e) => `${e.t.toFixed(2)}:${e.type}`).join(' '));
}
