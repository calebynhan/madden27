// User interception check: when the CPU throws, the human takes the defender nearest the
// catch point. Compare holding "play the ball" (R / Y) against doing nothing.
import { PlaySim } from '../src/sim/play.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { OFF_PLAYS } from '../src/data/playbook_offense.js';
import { DEF_PLAYS } from '../src/data/playbook_defense.js';
import { DT } from '../src/core/constants.js';
const N = parseInt(process.argv[2] || '300', 10);
const teams = defaultLeague();
const passes = OFF_PLAYS.filter((p) => p.type === 'pass' || p.type === 'pa');
function run(playBall, seed) {
  const rng = new RNG(seed);
  const out = { att: 0, int: 0, cmp: 0, inc: 0, near: 0, nearInt: 0 };
  for (let i = 0; i < N; i++) {
    const ctl = { mx: 0, my: 0, sx: 0, sy: 0, sprint: false, held: new Set(), pressed: new Set(), released: new Map() };
    const a = rng.int(0, 31); const b = (a + 1 + rng.int(0, 30)) % 32;
    const sim = new PlaySim({ game: { down: 1, wantsOutOfBounds: () => false }, rng, kind: 'scrimmage', offIdx: 0, teams: [teams[a], teams[b]], dir: 1, ballX: 35, ballY: 26.67, offPlay: rng.pick(passes), defPlay: rng.pick(DEF_PLAYS), flip: rng.chance(0.5), firstDownX: 45, difficulty: 1, controllers: [null, ctl] });
    for (let k = 0; k < 30; k++) sim.step(DT);
    sim.snap();
    let picked = false, nearDist = 99, throwT = null;
    const REACT = 0.3; // a human needs a moment to see the throw, switch and press
    for (let s = 0; s < 3000 && !sim.dead; s++) {
      ctl.pressed = new Set();
      if (sim.thrown && throwT === null) throwT = sim.t;
      if (!picked && sim.thrown && sim.ball.state === 'air' && sim.ball.flight && sim.ball.flight.type !== 'away' && sim.t - throwT >= REACT) {
        const fl = sim.ball.flight;
        let best = null, bd = Infinity;
        for (const d of sim.def) { if (!d.isActive()) continue; const dd = Math.hypot(d.x - fl.tx, d.y - fl.ty); if (dd < bd) { bd = dd; best = d; } }
        sim.setUser(1, best); picked = true; nearDist = bd;
        if (playBall) { ctl.held.add('catch_aggr'); ctl.pressed.add('catch_aggr'); }
      }
      sim.step(DT);
    }
    if (!picked) continue;
    const r = sim.result;
    out.att++;
    const near = nearDist < 5;
    if (near) out.near++;
    if (r.stats.intBy) { out.int++; if (near) out.nearInt++; }
    else if (r.incomplete) out.inc++;
    else out.cmp++;
  }
  return out;
}
const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
for (const pb of [false, true]) {
  const o = run(pb, 77);
  console.log(`${pb ? 'HOLD R (play ball)' : 'no input          '}  passes ${o.att}  INT ${pct(o.int, o.att)}  cmp ${pct(o.cmp, o.att)}  | when within 5 yds of the throw: INT ${pct(o.nearInt, o.near)} (${o.near} passes)`);
}
