// Run a single play type many times and report outcomes (tuning lab).
import { PlaySim } from '../src/sim/play.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { OFF_PLAYS } from '../src/data/playbook_offense.js';
import { DEF_PLAYS } from '../src/data/playbook_defense.js';
import { DT } from '../src/core/constants.js';
import { TUNE } from '../src/sim/tune.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const N = parseInt(args.n || '200', 10);
for (const k in args) if (k in TUNE) TUNE[k] = parseFloat(args[k]);
const teams = defaultLeague();
const offFilter = args.off || '';
const defFilter = args.def || '';
const trace = !!args.trace;
const offs = OFF_PLAYS.filter((p) => (offFilter ? (p.name + '|' + p.form + '|' + p.type).includes(offFilter) : p.type !== 'kneel'));
const defs = DEF_PLAYS.filter((p) => (defFilter ? (p.name + '|' + p.form).includes(defFilter) : true));
const rng = new RNG(42);
const fakeGame = { down: 1, wantsOutOfBounds: () => false };
const gains = { run: [], pass: [] };
const byPlay = new Map();
const conv1 = { n: 0, c: 0 };
const agg = { n: 0, pass: 0, cmp: 0, inc: 0, int: 0, sack: 0, run: 0, yds: 0, passYds: 0, runYds: 0, ttt: 0, tttN: 0, td: 0, fum: 0, sheds: 0, firstShed: 0, firstShedN: 0, scr: 0, timeouts: 0, len: 0 };
for (let i = 0; i < N; i++) {
  const op = rng.pick(offs), dp = rng.pick(defs);
  const a = rng.int(0, 31); let b = (a + 1 + rng.int(0, 30)) % 32;
  const DIR = +(args.dir || 1); const BX = DIR > 0 ? 35 : 85;
  const sim = new PlaySim({ game: fakeGame, rng, kind: 'scrimmage', offIdx: 0, teams: [teams[a], teams[b]], dir: DIR, ballX: BX, ballY: 26.67, offPlay: op, defPlay: dp, flip: rng.chance(0.5), firstDownX: BX + DIR * 10, difficulty: 2 });
  for (let k = 0; k < 30; k++) sim.step(DT);
  sim.snap();
  let steps = 0;
  while (!sim.dead && steps < 3000) {
    sim.step(DT); steps++;
    if (trace && i === 0 && steps % 15 === 0) {
      const qb = sim.qb;
      const ol = sim.off.filter((e) => e.pos === 'OL').map((e) => (e.engaged ? 'E' : '-')).join('');
      const nearest = Math.min(...sim.def.map((d) => Math.hypot(d.x - qb.x, d.y - qb.y)));
      console.log(`t=${sim.t.toFixed(2)} phase=${sim.phase} qb=(${qb.x.toFixed(1)},${qb.y.toFixed(1)}) OL=${ol} nearestDef=${nearest.toFixed(1)} ball=${sim.ball.state}`);
    }
  }
  const r = sim.result;
  if (!r) { agg.timeouts++; continue; }
  agg.n++;
  agg.len += sim.t;
  if (r.reason === 'timeout') agg.timeouts++;
  const gain = r.turnover ? 0 : r.td === 0 ? 75 : r.incomplete ? 0 : (r.endX - BX) * DIR;
  const sheds = r.events.filter((e) => e.type === 'shed');
  for (const e of r.events) if (['brokentackle','evade','truck','stiffarm'].includes(e.type)) { agg.mk = agg.mk || {}; agg.mk[e.type + (e.move ? ':' + e.move : '')] = (agg.mk[e.type + (e.move ? ':' + e.move : '')] || 0) + 1; }
  agg.tkl = (agg.tkl || 0) + r.events.filter((e) => e.type === 'tackle' || e.type === 'sack').length; agg.miss = (agg.miss || 0) + r.events.filter((e) => e.type === 'brokentackle' || e.type === 'evade' || e.type === 'truck' || e.type === 'stiffarm').length;
  agg.sheds += sheds.length;
  if (sheds.length) { agg.firstShed += sheds[0].t; agg.firstShedN++; }
  if (r.td === 0) agg.td++;
  if (r.stats.fumbleBy) agg.fum++;
  conv1.n++; if (gain >= 1 || r.td === 0) conv1.c++;
  if (args.v) console.log(op.name.padEnd(18), dp.name.padEnd(16), r.reason.padEnd(10), r.playType, gain.toFixed(1), sim.t.toFixed(1), 'handed=' + sim.handedOff, 'qbRunner=' + !!sim.qb.qbRunner);
  if (r.playType === 'sack') { agg.sack++; agg.pass++; agg.yds += gain; continue; }
  if (sim.thrown) {
    agg.pass++;
    agg.ttt += sim.throwT || 0; agg.tttN++;
    if (r.stats.intBy) agg.int++;
    else if (r.stats.receiver) { agg.cmp++; agg.passYds += gain; gains.pass.push(gain); }
    else agg.inc++;
    agg.yds += gain;
  } else { const sk = op.run ? op.run.scheme : 'scramble'; const bp = byPlay.get(sk) || { n: 0, y: 0, neg: 0 }; bp.n++; bp.y += gain; if (gain < 0) bp.neg++; byPlay.set(sk, bp); gains.run.push(gain); agg.run++; agg.runYds += gain; agg.yds += gain; if (r.playType === 'scramble') agg.scr++; }
}
const f = (x, d = 1) => x.toFixed(d);
console.log(`plays ${agg.n} pass ${agg.pass} run ${agg.run} (scrambles ${agg.scr}) timeouts ${agg.timeouts} avgLen ${f(agg.len / agg.n, 2)}s`);
console.log(`PASS: cmp% ${f(100 * agg.cmp / Math.max(1, agg.pass - agg.sack))} int% ${f(100 * agg.int / Math.max(1, agg.pass - agg.sack), 2)} sack% ${f(100 * agg.sack / Math.max(1, agg.pass))} Y/att ${f(agg.passYds / Math.max(1, agg.pass - agg.sack), 2)} timeToThrow ${f(agg.ttt / Math.max(1, agg.tttN), 2)}`);
console.log(`missed tackle rate ${f(100 * agg.miss / Math.max(1, agg.miss + agg.tkl))}%`, JSON.stringify(agg.mk || {}), 'tackles', agg.tkl);
console.log(`RUN: YPC ${f(agg.runYds / Math.max(1, agg.run), 2)}  TD ${agg.td} fumbles ${agg.fum}  sheds/play ${f(agg.sheds / agg.n, 2)} firstShed ${f(agg.firstShed / Math.max(1, agg.firstShedN), 2)}s`);

for (const k of ['run', 'pass']) {
  const g = gains[k].sort((a, b) => a - b);
  if (!g.length) continue;
  const q = (p) => g[Math.floor(p * (g.length - 1))].toFixed(1);
  const pct = (fn) => (100 * g.filter(fn).length / g.length).toFixed(1);
  console.log(`${k.toUpperCase()} gains: p10 ${q(0.1)} p25 ${q(0.25)} med ${q(0.5)} p75 ${q(0.75)} p90 ${q(0.9)}  neg ${pct((x) => x < 0)}%  20+ ${pct((x) => x >= 20)}%`);
}

if (args.by) for (const [k, v] of byPlay) console.log(k.padEnd(10), 'n', v.n, 'ypc', (v.y / v.n).toFixed(2), 'neg%', (100 * v.neg / v.n).toFixed(0));
console.log(`gained 1+ yard: ${(100 * conv1.c / conv1.n).toFixed(1)}%`);
