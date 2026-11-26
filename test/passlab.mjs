// Passing lab: a scripted human QB on pass plays (headless), three ways of choosing:
//   best   - one-button passing: Space throws to the highlighted (best open) receiver
//   random - presses a random receiver's key (someone who doesn't read the field)
//   first  - always the first receiver icon
// The QB throws once the dropback is set (around 2.2 s, earlier under pressure).
// Reports completion %, interceptions, sacks and yards per attempt per difficulty.
// Usage: node test/passlab.mjs [plays=240]
import { PlaySim } from '../src/sim/play.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { OFF_PLAYS } from '../src/data/playbook_offense.js';
import { DEF_PLAYS } from '../src/data/playbook_defense.js';
import { DT } from '../src/core/constants.js';
import { targetScore } from '../src/sim/user.js';

const N = parseInt(process.argv[2] || '240', 10);
const teams = defaultLeague();
const passes = OFF_PLAYS.filter((p) => p.type === 'pass' && !(p.tags || []).includes('screen') && !p.special && !p.rpo);
let errors = 0;
const results = {};
for (const diff of (process.env.DIFFS || '0,1,2').split(',').map(Number)) {
  for (const mode of ['smart', 'best', 'random', 'first']) {
    const rng = new RNG(900 + diff * 31);
    const st = { att: 0, cmp: 0, int: 0, sack: 0, yds: 0, plays: 0, noThrow: 0 };
    for (let n = 0; n < N; n++) {
      const a = rng.int(0, 31); const b = (a + 1 + rng.int(0, 30)) % 32;
      const ctl = { mx: 0, my: 0, sx: 0, sy: 0, sprint: false, held: new Set(), pressed: new Set(), released: new Map() };
      let sim;
      try {
        sim = new PlaySim({ game: { down: 1, wantsOutOfBounds: () => false }, rng, kind: 'scrimmage', offIdx: 0, teams: [teams[a], teams[b]], dir: 1, ballX: 35, ballY: 26.67, offPlay: rng.pick(passes), defPlay: rng.pick(DEF_PLAYS), flip: rng.chance(0.5), firstDownX: 45, difficulty: diff, controllers: [ctl, null] });
        for (let k = 0; k < 30; k++) sim.step(DT);
        sim.snap();
        const throwAt = 1.9 + rng.next() * 0.7;
        let phase = 'wait', steps = 0;
        while (!sim.dead && steps < 3000) {
          ctl.pressed = new Set(); ctl.released = new Map();
          const qb = sim.qb;
          if (phase === 'wait' && qb.hasBall && !sim.thrown && !qb.qbRunner) {
            const pressure = sim.def.some((d) => d.isActive() && Math.hypot(d.x - qb.x, d.y - qb.y) < 2.2);
            // 'smart': a player following the cues - throws when the highlighted man is open
            // or the blitz warning shows, otherwise on rhythm
            const cue = mode === 'smart' && sim.t > 1.15 && ((sim.pressure || 0) > 0.45 || (sim.suggested && targetScore(sim, qb, sim.suggested) > 1.6));
            if (sim.t >= throwAt || (pressure && sim.t > 1.3) || cue) {
              sim.throwPressure = sim.pressure || 0;
              if (mode === 'best' || mode === 'smart') { ctl.pressed.add('passbest'); ctl.held.add('passbest'); phase = 'release'; }
              else {
                const icons = (sim.icons || []).map((e, i) => ({ e, i })).filter(({ e }) => e.isActive() && e.eligible && e.task && e.task.kind === 'route');
                if (icons.length) {
                  const pick = mode === 'random' ? icons[rng.int(0, icons.length - 1)] : icons[0];
                  ctl.released.set('pass' + (pick.i + 1), 0.05);
                }
                phase = 'done';
              }
            }
          } else if (phase === 'release') {
            ctl.held.delete('passbest'); ctl.released.set('passbest', 0.05); phase = 'done';
          }
          sim.step(DT); steps++;
        }
      } catch (e) { errors++; if (errors < 4) console.error(e.stack); continue; }
      const r = sim.result;
      if (!r) continue;
      st.plays++;
      if (r.playType === 'sack') { st.sack++; continue; }
      if (!sim.thrown) { st.noThrow++; continue; }
      st.att++;
      if (r.stats.intBy) st.int++;
      else if (!r.incomplete && !r.turnover) { st.cmp++; st.yds += r.td === 0 ? 65 : (r.endX - 35); }
      if (process.env.WHY) {
        st.why = st.why || {}; st.tt = st.tt || [];
        const inc = r.events.find((e) => e.type === 'incomplete');
        const k = r.stats.intBy ? 'int' : inc ? 'inc:' + inc.why : r.incomplete ? 'inc:other' : 'cmp';
        const tb = (sim.throwT ?? 0) < 1.5 ? '<1.5s' : (sim.throwT ?? 0) < 2.0 ? '<2.0s' : '2.0s+';
        const pr = (sim.throwPressure ?? 0) > 0.45 ? 'press' : 'clean';
        st.why[`${tb} ${pr} ${k}`] = (st.why[`${tb} ${pr} ${k}`] || 0) + 1;
      }
    }
    results[`${diff}:${mode}`] = st;
    if (process.env.WHY && st.why) console.log(mode, JSON.stringify(Object.entries(st.why).sort()));
    const pct = (x, y) => (y ? ((100 * x) / y).toFixed(1) : '—');
    console.log(`${['Rookie', 'Pro', 'All-Pro', 'Legend'][diff].padEnd(8)} ${mode.padEnd(6)} att ${String(st.att).padStart(3)}  cmp ${pct(st.cmp, st.att).padStart(5)}%  int ${pct(st.int, st.att).padStart(4)}%  sack ${pct(st.sack, st.plays).padStart(4)}%  Y/A ${(st.yds / Math.max(1, st.att)).toFixed(2)}`);
  }
}
console.log('errors', errors);
if (errors) process.exit(1);
