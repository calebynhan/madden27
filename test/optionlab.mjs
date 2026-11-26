// Option / RPO lab: run each new play many times (CPU vs CPU) and report how the reads
// break down and what each branch gains (avg/median yards). Usage: node test/optionlab.mjs [n=150] [force]
import { PlaySim } from '../src/sim/play.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { OFF_PLAYS } from '../src/data/playbook_offense.js';
import { DEF_PLAYS } from '../src/data/playbook_defense.js';
import { DT } from '../src/core/constants.js';

const N = parseInt(process.argv[2] || '150', 10);
const forcePull = process.argv.includes('force');  // simulate a human who pulls every RPO
const teams = defaultLeague();
const plays = OFF_PLAYS.filter((p) => p.rpo || (p.run && (p.run.scheme === 'option' || p.run.scheme === 'read')));
const rng = new RNG(7);
const fakeGame = { down: 1, wantsOutOfBounds: () => false };
let errors = 0;
const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) + '/' + a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(1) : '—');
for (const op of plays) {
  const branch = { pull: [], give: [], keep: [], pitch: [] };
  let cmp = 0, att = 0, ints = 0, fumbles = 0, timeouts = 0;
  for (let i = 0; i < N; i++) {
    const dp = rng.pick(DEF_PLAYS);
    const a = rng.int(0, 31); const b = (a + 1 + rng.int(0, 30)) % 32;
    const BX = 35;
    let sim;
    try {
      sim = new PlaySim({ game: fakeGame, rng, kind: 'scrimmage', offIdx: 0, teams: [teams[a], teams[b]], dir: 1, ballX: BX, ballY: 26.67, offPlay: op, defPlay: dp, flip: rng.chance(0.5), firstDownX: BX + 10, difficulty: 2 });
      if (forcePull) sim.rpoForce = 'pull';
      for (let k = 0; k < 30; k++) sim.step(DT);
      sim.snap();
      let steps = 0;
      while (!sim.dead && steps < 3000) {
        sim.step(DT); steps++;
      }
    } catch (e) { errors++; if (errors < 4) console.error(op.name, e.stack); continue; }
    const r = sim.result;
    if (!r || r.reason === 'timeout') { timeouts++; continue; }
    const gain = r.turnover ? 0 : r.td === 0 ? 65 : r.incomplete ? 0 : (r.endX - BX);
    if (r.stats.fumbleBy && r.turnover) fumbles++;
    if (sim.rpoThrown) { att++; if (r.stats.intBy) ints++; else if (!r.incomplete && !r.turnover) cmp++; branch.pull.push(gain); }
    else if (r.events.some((e) => e.type === 'pitch')) branch.pitch.push(gain);
    else if (sim.qb.qbRunner || r.stats.rusher === sim.qb.id) branch.keep.push(gain);
    else branch.give.push(gain);
  }
  const tot = N - timeouts;
  const pct = (a) => `${((100 * a.length) / Math.max(1, tot)).toFixed(0)}%`;
  let line = `${op.name.padEnd(14)} ${op.form.padEnd(12)} `;
  if (op.rpo) line += `pull ${pct(branch.pull)} (cmp ${att ? ((100 * cmp) / att).toFixed(0) : '—'}%, int ${ints}, avg ${avg(branch.pull)})  give ${pct(branch.give)} avg ${avg(branch.give)}`;
  else if (op.run.scheme === 'option') line += `pitch ${pct(branch.pitch)} avg ${avg(branch.pitch)}  keep ${pct(branch.keep)} avg ${avg(branch.keep)}`;
  else line += `keep ${pct(branch.keep)} avg ${avg(branch.keep)}  give ${pct(branch.give)} avg ${avg(branch.give)}`;
  const all = [...branch.pull, ...branch.give, ...branch.keep, ...branch.pitch];
  line += `  | overall ${avg(all)} yds  fumbles lost ${fumbles}  stuck ${timeouts}`;
  console.log(line);
}
console.log('errors', errors);
if (errors) process.exit(1);
