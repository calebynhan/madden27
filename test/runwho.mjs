import { PlaySim } from '../src/sim/play.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { OFF_PLAYS } from '../src/data/playbook_offense.js';
import { DEF_PLAYS } from '../src/data/playbook_defense.js';
import { DT } from '../src/core/constants.js';
const teams = defaultLeague();
const scheme = process.argv[2] || 'iz';
const offs = OFF_PLAYS.filter((p) => p.type === 'run' && p.run.scheme === scheme);
const rng = new RNG(7);
const who = {}; const tt = []; const hand = []; const losT = [];
let unblocked = 0, shedT = 0, n = 0;
for (let i = 0; i < 300; i++) {
  const op = rng.pick(offs), dp = rng.pick(DEF_PLAYS.filter((d) => !d.tags.includes('goalline') && !d.tags.includes('prevent')));
  const sim = new PlaySim({ game: { down: 1, wantsOutOfBounds: () => false }, rng, kind: 'scrimmage', offIdx: 0, teams: [teams[rng.int(0, 31)], teams[rng.int(0, 31)]], dir: 1, ballX: 35, ballY: 26.67, offPlay: op, defPlay: dp, flip: rng.chance(0.5), firstDownX: 45, difficulty: 2 });
  sim.snap();
  let crossed = null;
  while (!sim.dead && sim.t < 20) { sim.step(DT); if (crossed === null && sim.carrier && sim.carrier !== sim.qb && sim.carrier.x > 35) crossed = sim.t; }
  const r = sim.result; if (!r || r.turnover) continue;
  n++;
  const tk = r.events.find((e) => e.type === 'tackle');
  if (tk) {
    const d = sim.ents.find((e) => e.id === tk.by);
    const key = d.pos + (d.tag.startsWith('DT') || d.tag === 'LE' || d.tag === 'RE' ? '' : '');
    who[key] = (who[key] || 0) + 1;
    tt.push(tk.t);
    const shed = r.events.find((e) => e.type === 'shed' && e.by === d.id);
    if (!shed) unblocked++; else shedT++;
  }
  if (sim.handoffT) hand.push(sim.handoffT);
  if (crossed !== null) losT.push(crossed);
}
const avg = (a) => (a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)).toFixed(2);
console.log('tackler pos', who, 'unblocked tacklers', unblocked, 'shed-then-tackle', shedT, 'n', n);
console.log('avg tackle t', avg(tt), 'avg handoff t', avg(hand), 'avg cross LOS t', avg(losT), 'crossed', losT.length);
