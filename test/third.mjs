// What happens on 3rd & 4-10 in full CPU games?
import { Game } from '../src/sim/game.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
const teams = defaultLeague();
const N = +(process.argv[2] || 8);
const sep = [], misses = [];
const out = { n: 0, conv: 0, sack: 0, inc: 0, incWhy: {}, cmpShort: 0, cmpConv: 0, run: 0, runConv: 0, ta: 0, airVsSticks: [], yac: [], cmpAll: 0, yacAll: [], airAll: [] };
for (let g = 0; g < N; g++) {
  const game = new Game({ teams: [teams[(g * 3) % 32], teams[(g * 11 + 5) % 32]], settings: { quarterLen: 15, accelTo: 7 }, rng: new RNG(4000 + g), headless: true });
  let pre = null;
  game.on((type, data, gm) => {
    if (type === 'phase' && data.phase === 'presnap' && gm.sim && gm.sim.kind === 'scrimmage') pre = { down: gm.down, toGo: (gm.lineToGain - gm.ballX) * gm.attackDir(gm.possession) };
    if (type !== 'result' || !pre) return;
    const s = gm.sim, r = data.result;
    if (s.kind !== 'scrimmage' || gm.conversion) { pre = null; return; }
    const catchEv = r.events.find((e) => e.type === 'catch');
    if (catchEv && r.stats.receiver && !r.turnover) { sep.push(s.catchSep ?? 99); misses.push(r.events.filter((e) => e.t > catchEv.t && ['brokentackle', 'evade', 'stiffarm', 'truck'].includes(e.type)).length); out.cmpAll++; out.yacAll.push(((r.td === s.offIdx ? (s.dir > 0 ? 110 : 10) : r.endX) - catchEv.x) * s.dir); out.airAll.push((catchEv.x - s.losX) * s.dir); }
    if (pre.down === 3 && pre.toGo >= 3.5 && pre.toGo <= 10.5) {
      out.n++;
      const gain = r.turnover ? -99 : (r.endX - s.losX) * s.dir;
      const conv = gain >= pre.toGo || r.td === s.offIdx;
      if (conv) out.conv++;
      if (r.playType === 'sack') out.sack++;
      else if (s.thrown) {
        if (s.thrownAway) out.ta++;
        else if (r.stats.receiver && !r.turnover) { if (conv) out.cmpConv++; else out.cmpShort++; out.airVsSticks.push((catchEv.x - s.losX) * s.dir - pre.toGo); }
        else { const w = r.events.find((e) => e.type === 'incomplete'); const k = r.stats.intBy ? 'int' : w ? w.why : 'other'; out.incWhy[k] = (out.incWhy[k] || 0) + 1; out.inc++; }
      } else { out.run++; if (conv) out.runConv++; }
    }
    pre = null;
  });
  game.start(); game.simulateToEnd();
}
const avg = (a) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(2);
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)].toFixed(1) : '-'; };
console.log(`3rd & 4-10: n ${out.n} conv ${(100 * out.conv / out.n).toFixed(1)}%  sack ${out.sack} throwaway ${out.ta} incomplete ${out.inc} ${JSON.stringify(out.incWhy)}  completions short ${out.cmpShort} / converted ${out.cmpConv}  runs ${out.run} (conv ${out.runConv})`);
console.log(`3rd-down catch depth minus sticks: avg ${avg(out.airVsSticks)} median ${med(out.airVsSticks)}`);
console.log(`All completions: n ${out.cmpAll} avg air ${avg(out.airAll)} median air ${med(out.airAll)} avg YAC ${avg(out.yacAll)} median YAC ${med(out.yacAll)}`);
console.log(`separation at catch: median ${med(sep)} avg ${avg(sep)}  | broken tackles per completion ${avg(misses)}  pct with 1+ miss ${(100 * misses.filter((m) => m > 0).length / Math.max(1, misses.length)).toFixed(1)}%`);
