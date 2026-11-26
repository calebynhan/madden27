// Empirical completion / INT rate as a function of the QB's estimated margin at release.
import { Game } from '../src/sim/game.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
const teams = defaultLeague();
const bins = new Map();
const grid = new Map();
for (let g = 0; g < +(process.argv[2] || 10); g++) {
  const game = new Game({ teams: [teams[(g * 7) % 32], teams[(g * 3 + 9) % 32]], settings: { quarterLen: 15, accelTo: 7 }, rng: new RNG(2200 + g), headless: true });
  game.on((type, data, gm) => {
    if (type !== 'result') return;
    const s = gm.sim, r = data.result;
    if (s.kind !== 'scrimmage' || s.throwMargin === undefined || s.thrownAway) return;
    const k = Math.max(-0.6, Math.min(0.8, Math.round(s.throwMargin * 10) / 10)).toFixed(1);
    const air = Math.round((s.stats.airYards ?? 0));
    const db = air < 0 ? '<0' : air < 5 ? '0-4' : air < 10 ? '5-9' : air < 15 ? '10-14' : air < 20 ? '15-19' : air < 30 ? '20-29' : '30+';
    const mb = s.throwMargin < 0 ? 'm<0' : s.throwMargin < 0.25 ? 'm0-.25' : 'm.25+';
    const gk = db + '|' + mb;
    const gb = grid.get(gk) || { n: 0, c: 0 }; gb.n++; if (r.stats.receiver && !r.stats.intBy) gb.c++; grid.set(gk, gb);
    const b = bins.get(k) || { n: 0, c: 0, i: 0 };
    b.n++; if (r.stats.receiver && !r.stats.intBy) b.c++; if (r.stats.intBy) b.i++;
    bins.set(k, b);
  });
  game.start(); game.simulateToEnd();
}
for (const k of [...bins.keys()].sort((a, b) => +a - +b)) { const b = bins.get(k); console.log(`margin ${k.padStart(4)}: n ${String(b.n).padStart(4)} cmp ${(100 * b.c / b.n).toFixed(0).padStart(3)}% int ${(100 * b.i / b.n).toFixed(1)}%  `); }
const order = ['<0', '0-4', '5-9', '10-14', '15-19', '20-29', '30+'];
for (const d of order) { const row = ['m<0', 'm0-.25', 'm.25+'].map((m) => { const b = grid.get(d + '|' + m); return b ? `${m}: ${(100 * b.c / b.n).toFixed(0)}% (n${b.n})` : `${m}: -`; }); console.log(`air ${d.padStart(5)}  ${row.join('   ')}`); }
