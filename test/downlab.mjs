import { Game } from '../src/sim/game.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
const teams = defaultLeague();
const N = +(process.argv[2] || 6);
const by = {};
for (let g = 0; g < N; g++) {
  const game = new Game({ teams: [teams[g % 32], teams[(g * 7 + 3) % 32]], settings: { quarterLen: 15, accelTo: 7 }, rng: new RNG(900 + g), headless: true });
  let pre = null;
  game.on((type, data, gm) => {
    if (type === 'phase' && data.phase === 'presnap' && gm.sim && gm.sim.kind === 'scrimmage') pre = { down: gm.down, toGo: Math.round((gm.lineToGain - gm.ballX) * gm.attackDir(gm.possession)) };
    if (type !== 'result' || !pre) return;
    const s = gm.sim, r = data.result;
    if (s.kind !== 'scrimmage' || gm.conversion) return;
    const key = `${pre.down}&${pre.toGo <= 3 ? 'short' : pre.toGo <= 7 ? 'med' : 'long'}`;
    const o = by[key] || (by[key] = { n: 0, pass: 0, cmp: 0, sack: 0, ta: 0, run: 0, ry: 0, py: 0, conv: 0 });
    o.n++;
    const gain = r.turnover ? 0 : (r.endX - s.losX) * s.dir;
    if (gain >= pre.toGo || r.td === s.offIdx) o.conv++;
    if (r.playType === 'sack') { o.sack++; o.pass++; }
    else if (s.thrown) { o.pass++; if (r.stats.receiver) { o.cmp++; o.py += gain; } if (s.thrownAway) o.ta++; }
    else { o.run++; o.ry += gain; }
    pre = null;
  });
  game.start(); game.simulateToEnd();
}
for (const k of Object.keys(by).sort()) { const o = by[k]; console.log(k.padEnd(9), 'n', String(o.n).padStart(4), 'run%', (100 * o.run / o.n).toFixed(0).padStart(3), 'ypc', (o.ry / Math.max(1, o.run)).toFixed(1).padStart(5), 'cmp%', (100 * o.cmp / Math.max(1, o.pass - o.sack)).toFixed(0).padStart(3), 'sack%', (100 * o.sack / Math.max(1, o.pass)).toFixed(0).padStart(3), 'throwaway', o.ta, 'conv%', (100 * o.conv / o.n).toFixed(0)); }
