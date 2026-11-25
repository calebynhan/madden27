import { Game } from '../src/sim/game.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
const teams = defaultLeague();
const N = +(process.argv[2] || 4);
const byDef = {}, byKind = {}, puntRes = {};
let kicks = [];
for (let g = 0; g < N; g++) {
  const rng = new RNG(500 + g);
  const game = new Game({ teams: [teams[g % 32], teams[(g * 7 + 3) % 32]], settings: { quarterLen: 15 }, rng, headless: true });
  game.on((type, data, gm) => {
    if (type !== 'result') return;
    const s = gm.sim, r = data.result;
    if (s.kind === 'scrimmage' && !gm.conversion) {
      const key = s.defPlay.cover + (s.defPlay.tags.includes('blitz') ? '+B' : '');
      const o = byDef[key] || (byDef[key] = { n: 0, sacks: 0, runs: 0, ry: 0, pass: 0, py: 0 });
      o.n++;
      const gain = r.turnover ? 0 : (r.endX - s.losX) * s.dir;
      if (r.playType === 'sack') o.sacks++;
      if (s.playType === 'run' || r.playType === 'run') { o.runs++; o.ry += gain; }
      else { o.pass++; o.py += r.incomplete ? 0 : gain; }
    } else if (s.kind === 'punt') {
      puntRes[r.reason] = (puntRes[r.reason] || 0) + 1;
      kicks.push(['punt', s.landing ? Math.round(Math.abs(s.landing.x - s.losX)) : -1, r.reason, Math.round((r.endX - s.losX) * s.dir)]);
    } else if (s.kind === 'kickoff') {
      byKind[r.reason] = (byKind[r.reason] || 0) + 1;
    }
  });
  game.start(); game.simulateToEnd();
}
for (const [k, v] of Object.entries(byDef).sort((a, b) => b[1].n - a[1].n)) console.log(k.padEnd(16), 'n', String(v.n).padStart(4), 'sack%', (100 * v.sacks / Math.max(1, v.pass)).toFixed(1).padStart(5), 'ypc', (v.ry / Math.max(1, v.runs)).toFixed(2).padStart(6), 'runs', v.runs, 'ypp', (v.py / Math.max(1, v.pass)).toFixed(2));
console.log('kickoff results', byKind);
console.log('punt results', puntRes);
console.log('punts sample (gross, result, net):', kicks.slice(0, 25).map((k) => k.slice(1).join('/')).join('  '));
