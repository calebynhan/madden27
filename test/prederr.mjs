import { Game } from '../src/sim/game.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
const teams = defaultLeague();
const rows = [];
for (let g = 0; g < 10; g++) {
  const game = new Game({ teams: [teams[(g * 7) % 32], teams[(g * 3 + 9) % 32]], settings: { quarterLen: 15, accelTo: 7 }, rng: new RNG(2200 + g), headless: true });
  game.on((type, data, gm) => {
    if (type !== 'result') return;
    const s = gm.sim, r = data.result;
    if (s.kind !== 'scrimmage' || s.throwMargin === undefined || s.thrownAway || s.catchErr === undefined) return;
    const tgt = s.ents.find((e) => e.id === r.stats.target);
    rows.push({ m: s.throwMargin, err: s.catchErr, air: s.stats.airYards, cmp: !!(r.stats.receiver && !r.stats.intBy), route: tgt && tgt.route ? tgt.route.key : (tgt && tgt.task ? tgt.task.kind : '?'), jam: tgt && tgt.jam > -1 ? 1 : 0, type: s.ball.flight ? s.ball.flight.type : '?' });
  });
  game.start(); game.simulateToEnd();
}
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)].toFixed(2) : '-'; };
for (const [lo, hi] of [[-9, 0], [0, 0.25], [0.25, 9]]) {
  const b = rows.filter((r) => r.m >= lo && r.m < hi);
  console.log(`margin [${lo},${hi}): n ${b.length} cmp ${(100 * b.filter((r) => r.cmp).length / Math.max(1, b.length)).toFixed(0)}%  median ball-to-receiver ${med(b.map((r) => r.err))}  >1.5yd ${(100 * b.filter((r) => r.err > 1.5).length / Math.max(1, b.length)).toFixed(0)}%`);
}
const byRoute = new Map();
for (const r of rows) { const o = byRoute.get(r.route) || { n: 0, far: 0, cmp: 0, err: [] }; o.n++; if (r.err > 1.5) o.far++; if (r.cmp) o.cmp++; o.err.push(r.err); byRoute.set(r.route, o); }
console.log([...byRoute.entries()].filter(([, o]) => o.n >= 8).sort((a, b) => b[1].far / b[1].n - a[1].far / a[1].n).map(([k, o]) => `${k}: n${o.n} far ${(100 * o.far / o.n).toFixed(0)}% cmp ${(100 * o.cmp / o.n).toFixed(0)}% medErr ${med(o.err)}`).join('\n'));
