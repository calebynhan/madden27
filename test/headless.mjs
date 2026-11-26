// Headless CPU-vs-CPU games: invariant checks + league-average style stats.
import { Game } from '../src/sim/game.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { TUNE } from '../src/sim/tune.js';
if (process.env.TUNE) Object.assign(TUNE, JSON.parse(process.env.TUNE));

const N = parseInt(process.argv[2] || '6', 10);
const qlen = parseFloat(process.argv[3] || '15');
const teams = defaultLeague();
const agg = { ta: 0, games: 0, pts: 0, plays: 0, passAtt: 0, passCmp: 0, passYds: 0, sacks: 0, sackYds: 0, ints: 0, rushAtt: 0, rushYds: 0, fumLost: 0, punts: 0, puntYds: 0, fga: 0, fgm: 0, xpa: 0, xpm: 0, third: 0, thirdConv: 0, fourth: 0, fourthConv: 0, penalties: 0, tds: 0, two: 0, twoC: 0, kr: 0, krYds: 0, tb: 0, firstDowns: 0, ot: 0, ties: 0 };
const t0 = Date.now();
let errors = 0;
for (let g = 0; g < N; g++) {
  const rng = new RNG(1000 + g * 7919);
  const a = rng.int(0, 31); let b = rng.int(0, 31); if (b === a) b = (a + 1) % 32;
  const game = new Game({ teams: [teams[a], teams[b]], settings: { quarterLen: qlen, difficulty: 2, accel: true, accelTo: 7 }, rng, headless: true });
  let steps = 0;
  try {
    game.start();
    steps = game.simulateToEnd(3e6);
  } catch (e) { errors++; console.error('GAME ERROR', g, e.stack); continue; }
  if (!game.over) { errors++; console.error('Game did not finish', g, game.phase, game.quarter, game.clock); continue; }
  // Invariant checks
  for (const s of game.score) if (!Number.isFinite(s) || s < 0) { errors++; console.error('bad score', game.score); }
  for (const t of [0, 1]) {
    const ts = game.box.team[t];
    for (const k of ['pts']) void k;
    agg.plays += ts.plays; agg.passAtt += ts.passAtt; agg.passCmp += ts.passCmp; agg.passYds += ts.passYds + ts.sackYds; agg.sacks += ts.sacks; agg.sackYds += ts.sackYds;
    agg.ints += ts.ints; agg.rushAtt += ts.rushAtt; agg.rushYds += ts.rushYds; agg.fumLost += ts.fumLost; agg.punts += ts.punts; agg.puntYds += ts.puntYds;
    agg.fga += ts.fga; agg.fgm += ts.fgm; agg.xpa += ts.xpa; agg.xpm += ts.xpm; agg.third += ts.third; agg.thirdConv += ts.thirdConv; agg.fourth += ts.fourth; agg.fourthConv += ts.fourthConv;
    agg.penalties += ts.penalties; agg.two += ts.twoAtt; agg.twoC += ts.twoConv; agg.kr += ts.kr; agg.krYds += ts.krYds; agg.tb += ts.touchbacks; agg.firstDowns += ts.firstDowns;
  }
  agg.pts += game.score[0] + game.score[1];
  agg.games++;
  if (game.ot) agg.ot++;
  if (game.score[0] === game.score[1]) agg.ties++;
  console.log(`G${g}: ${game.teams[0].def.abbr} ${game.score[0]} - ${game.score[1]} ${game.teams[1].def.abbr}  (steps ${steps}${game.ot ? ', OT' : ''})`);
  agg.ta += game.log.filter((l) => l.includes('throws it away')).length;
  if (process.env.LOG) console.log(game.log.join('\n'));
}
const G = Math.max(1, agg.games * 2);
const f = (x, d = 1) => (x).toFixed(d);
console.log(`\n=== ${agg.games} games, ${(Date.now() - t0) / 1000}s, errors ${errors} ===`);
console.log(`Per team per game (NFL 2025 ref in brackets):`);
console.log(` Points ${f(agg.pts / G)} [23.0]   Plays ${f(agg.plays / G)} [~61]   First downs ${f(agg.firstDowns / G)} [~19]`);
console.log(` Pass att ${f(agg.passAtt / G)} [32.1]  Cmp% ${f(100 * agg.passCmp / Math.max(1, agg.passAtt))} [64.2]  Y/A ${f((agg.passYds) / Math.max(1, agg.passAtt), 2)} [~7.0]`);
console.log(` Sack% ${f(100 * agg.sacks / Math.max(1, agg.passAtt + agg.sacks))} [~6.6]  Throwaways/team ${f(agg.ta / G, 2)} [~1.2]`);
console.log(` Sacks ${f(agg.sacks / G, 2)} [~2.3]  INT ${f(agg.ints / G, 2)} [0.70]  Fum lost ${f(agg.fumLost / G, 2)} [0.46]`);
console.log(` Rush att ${f(agg.rushAtt / G)} [26.8]  YPC ${f(agg.rushYds / Math.max(1, agg.rushAtt), 2)} [4.4]`);
console.log(` Punts ${f(agg.punts / G, 2)} [~3.5]  Avg ${f(agg.puntYds / Math.max(1, agg.punts))} [~48]  FG ${agg.fgm}/${agg.fga} ${f(100 * agg.fgm / Math.max(1, agg.fga))}% [85.6]  XP ${f(100 * agg.xpm / Math.max(1, agg.xpa))}% [95.9]`);
console.log(` 3rd down ${f(100 * agg.thirdConv / Math.max(1, agg.third))}% [39.9]  4th down ${agg.fourthConv}/${agg.fourth}  2PT ${agg.twoC}/${agg.two}  Penalties ${f(agg.penalties / G, 2)} [6.4]`);
console.log(` KR avg ${f(agg.krYds / Math.max(1, agg.kr))}  touchbacks ${agg.tb}  OT games ${agg.ot}  ties ${agg.ties}`);
if (errors) process.exit(1);
