// YAC tail in full games + trace of one big catch-and-run
import { Game } from '../src/sim/game.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
const teams = defaultLeague();
const yacs = [];
let traced = 0;
for (let g = 0; g < 8; g++) {
  const game = new Game({ teams: [teams[(g * 5) % 32], teams[(g * 13 + 7) % 32]], settings: { quarterLen: 15, accelTo: 7 }, rng: new RNG(800 + g), headless: true });
  game.on((type, data, gm) => {
    if (type !== 'result') return;
    const s = gm.sim, r = data.result;
    if (s.kind !== 'scrimmage' || !r.stats.receiver || r.turnover || s.catchX === undefined) return;
    const end = r.td === s.offIdx ? (s.dir > 0 ? 110 : 10) : r.endX;
    const yac = (end - s.catchX) * s.dir;
    yacs.push(yac);
    if (yac > 25 && traced < 3) {
      traced++;
      const rec = s.ents.find((e) => e.id === r.stats.receiver);
      const tk = r.events.filter((e) => ['brokentackle', 'evade', 'stiffarm', 'truck', 'tackle'].includes(e.type) && e.t > s.catchT);
      console.log(`BIG YAC ${yac.toFixed(0)} by ${rec.pos} on ${s.offPlay.name} vs ${s.defPlay.name} (${s.defPlay.cover}); sep at catch ${s.catchSep.toFixed(1)}; air ${((s.catchX - s.losX) * s.dir).toFixed(1)}; events after catch: ${tk.map((e) => e.type).join(',') || 'none'}; ended ${r.reason}`);
      // where were the defenders at catch? approximate from frames
      const fi = Math.floor(s.catchT * 30);
      const f = s.frames[Math.min(s.frames.length - 1, fi)];
      if (f) {
        const parts = [];
        s.ents.forEach((e, i) => { if (e.team === s.defIdx) { const x = f[i * 5], y = f[i * 5 + 1]; const fx = (x - s.losX) * s.dir; parts.push(`${e.tag}(${fx.toFixed(0)},${((y - s.ballY0) * s.dir).toFixed(0)})`); } });
        const ri = s.ents.indexOf(rec);
        console.log(`   receiver at (${((f[ri * 5] - s.losX) * s.dir).toFixed(0)},${((f[ri * 5 + 1] - s.ballY0) * s.dir).toFixed(0)}) defenders: ${parts.join(' ')}`);
      }
    }
  });
  game.start(); game.simulateToEnd();
}
const b = yacs.slice().sort((a, c) => a - c);
const q = (p) => b[Math.floor(p * (b.length - 1))].toFixed(1);
console.log(`completions ${b.length} YAC p25 ${q(0.25)} med ${q(0.5)} p75 ${q(0.75)} p90 ${q(0.9)} avg ${(b.reduce((x, y) => x + y, 0) / b.length).toFixed(1)}  20+: ${(100 * b.filter((x) => x >= 20).length / b.length).toFixed(1)}%`);
