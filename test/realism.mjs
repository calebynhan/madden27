// Per-play realism dashboard: CPU-vs-CPU games, play-level distributions next to
// NFL references (2023-2025 league averages, rounded).
// Usage: node test/realism.mjs [games=8] [seed=1]   TUNE='{"key":value}' to override tuning.
import { Game } from '../src/sim/game.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { TUNE } from '../src/sim/tune.js';
import { PlaySim } from '../src/sim/play.js';
if (process.env.TUNE) Object.assign(TUNE, JSON.parse(process.env.TUNE));

const N = parseInt(process.argv[2] || '8', 10);
const seed = parseInt(process.argv[3] || '1', 10);
const teams = defaultLeague();
const runs = [], yac = [], air = [], sep = [], depthT = [];
const c = { att: 0, cmp: 0, int: 0, sack: 0, dropbacks: 0, scr: 0, made: 0, missed: 0, plays: 0, pts: 0, drives: 0, tdDrives: 0, fgDrives: 0, firstDowns: 0, compl20: 0 };
const missMoves = new Set(['brokentackle', 'evade', 'stiffarm', 'truck']);
const contactTypes = new Set(['brokentackle', 'evade', 'stiffarm', 'truck', 'tackle']);
// Per-tick probes: first pressure on the QB, and where a run carrier is first touched.
const ttt = [], pressured = { n: 0, of: 0 }, contactDepth = [], pressT = [], deep = { att: 0, cmp: 0 };
const step0 = PlaySim.prototype.step;
PlaySim.prototype.step = function (dt) {
  step0.call(this, dt);
  if (this.kind !== 'scrimmage' || this.phase === 'presnap') return;
  const qb = this.qb;
  if (qb && qb.hasBall && !this.thrown && !qb.qbRunner && this.playType !== 'run' && this.pressT0 === undefined && this.t > 0.5) {
    if (this.def.some((d) => d.isActive() && !d.engaged && Math.hypot(d.x - qb.x, d.y - qb.y) < 2.5)) this.pressT0 = this.t;
  }
  if (this.thrown && this.throwT0 === undefined) this.throwT0 = this.t;
  const c = this.carrier;
  if (c && this.playType === 'run' && this.contactF === undefined && this.events.some((e) => contactTypes.has(e.type))) this.contactF = (c.x - this.losX) * this.dir;
};
for (let g = 0; g < N; g++) {
  const rng = new RNG(seed * 1000 + g * 7919);
  const a = rng.int(0, 31); let b = rng.int(0, 31); if (b === a) b = (a + 1) % 32;
  const game = new Game({ teams: [teams[a], teams[b]], settings: { quarterLen: 15, difficulty: 2, accel: true, accelTo: 5 }, rng, headless: true });
  game.on((type, data, gm) => {
    if (type !== 'result') return;
    const s = gm.sim, r = data.result;
    if (!s || s.kind !== 'scrimmage' || gm.conversion || r.kneel || r.playType === 'spike') return;
    c.plays++;
    for (const e of r.events) if (missMoves.has(e.type)) c.missed++;
    if (r.events.some((e) => e.type === 'tackle' || e.type === 'sack')) c.made++;
    const pt = r.playType;
    if (pt === 'run') {
      const end = r.td === s.offIdx ? (s.dir > 0 ? 110 : 10) : r.endX;
      const g0 = (end - s.losX) * s.dir;
      runs.push(g0);
      if (g0 >= 10) contactDepth.push(s.contactF ?? 99);
      return;
    }
    c.dropbacks++;
    pressured.of++; if (s.pressT0 !== undefined && (s.throwT0 === undefined || s.pressT0 < s.throwT0)) { pressured.n++; pressT.push(s.pressT0); }
    if (s.throwT0 !== undefined) ttt.push(s.throwT0);
    if (pt === 'sack') { c.sack++; return; }
    if (pt === 'scramble' && !s.thrown) { c.scr++; return; }
    if (!s.thrown || s.thrownAway) { if (s.thrownAway) c.att++; return; }
    c.att++;
    const tgt = Number.isFinite(r.stats.airYards) ? r.stats.airYards : null;
    if (tgt !== null && Number.isFinite(tgt)) { depthT.push(tgt); if (tgt >= 20) { deep.att++; if (r.stats.receiver && !r.stats.intBy && !r.turnover) deep.cmp++; } }
    if (r.stats.intBy) { c.int++; return; }
    const catchEv = r.events.find((e) => e.type === 'catch');
    if (!catchEv || !r.stats.receiver || r.turnover) return;
    c.cmp++;
    const end = r.td === s.offIdx ? (s.dir > 0 ? 110 : 10) : r.endX;
    const total = (end - s.losX) * s.dir;
    if (total >= 20) c.compl20++;
    air.push((catchEv.x - s.losX) * s.dir);
    yac.push((end - catchEv.x) * s.dir);
    sep.push(s.catchSep ?? 99);
  });
  game.start();
  game.simulateToEnd(3e6);
  c.pts += game.score[0] + game.score[1];
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
const pct = (a, f) => (100 * a.filter(f).length) / Math.max(1, a.length);
const f1 = (v) => v.toFixed(1);
console.log(`=== ${N} games (seed ${seed}) — sim [NFL] ===`);
console.log(`Points/team ${f1(c.pts / N / 2)} [23]   Scrimmage plays/team ${f1(c.plays / N / 2)} [~62]`);
console.log(`RUN   YPC ${f1(avg(runs))} [4.4]  median ${f1(med(runs))} [3]  stuffed<=0 ${f1(pct(runs, (v) => v <= 0))}% [18]  10+ ${f1(pct(runs, (v) => v >= 10))}% [11]  20+ ${f1(pct(runs, (v) => v >= 20))}% [2.5]`);
console.log(`PASS  Cmp ${f1((100 * c.cmp) / Math.max(1, c.att))}% [64.5]  aDOT ${f1(avg(depthT))} [8.0]  air/cmp ${f1(avg(air))} [5.9]  YAC/cmp ${f1(avg(yac))} [5.2] median ${f1(med(yac))} [3.3]  YAC 10+ ${f1(pct(yac, (v) => v >= 10))}% [~15]`);
console.log(`      Y/cmp ${f1(avg(air) + avg(yac))} [11.0]  20+ completions ${f1((100 * c.compl20) / Math.max(1, c.cmp))}% [15]  sep@catch median ${f1(med(sep))} [~3.0]`);
console.log(`      Sack ${f1((100 * c.sack) / Math.max(1, c.dropbacks))}% of dropbacks [6.8]  INT ${f1((100 * c.int) / Math.max(1, c.att))}% of att [2.2]  scrambles ${f1((100 * c.scr) / Math.max(1, c.dropbacks))}% [~4]`);
console.log(`      time to throw ${(avg(ttt)).toFixed(2)}s [2.8] median ${med(ttt).toFixed(2)}  pressured before throw/sack ${f1((100 * pressured.n) / Math.max(1, pressured.of))}% [~33] at median ${med(pressT).toFixed(2)}s [~2.5]`);
console.log(`      deep (20+ air) ${f1((100 * deep.att) / Math.max(1, c.att))}% of att [11] cmp ${f1((100 * deep.cmp) / Math.max(1, deep.att))}% [37]`);
console.log(`RUN 10+: first contact depth median ${f1(med(contactDepth))} yds, untouched past 8 yds ${f1(pct(contactDepth, (v) => v >= 8))}%`);
console.log(`TACKLE missed ${f1((100 * c.missed) / Math.max(1, c.missed + c.made))}% of attempts [~11]`);
