// Commentary check: plays full CPU-vs-CPU games headless with the broadcast booth listening
// to every event, and fails on any malformed line (undefined/NaN/null, empty text, a
// negative yardage spoken). Prints a sample of calls. Usage: node test/commentary.mjs [games=4]
import { Game } from '../src/sim/game.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
import { Booth } from '../src/audio/commentary.js';

const N = parseInt(process.argv[2] || '4', 10);
const teams = defaultLeague();
const bad = /undefined|NaN|\bnull\b|\[object|for -\d|of -\d|-\d+ yards|\s{2,}|\.\./;
let errors = 0, lines = 0, big = 0, colors = 0, plays = 0, silent = 0;
const sample = [];
const kinds = new Map();
for (let gi = 0; gi < N; gi++) {
  const rng = new RNG(4242 + gi * 104729);
  const a = rng.int(0, 31); let b = rng.int(0, 31); if (b === a) b = (a + 1) % 32;
  const game = new Game({ teams: [teams[a], teams[b]], settings: { quarterLen: 8, difficulty: 2, accel: true, accelTo: 5, time: gi % 2 ? 'night' : 'day' }, rng, headless: true });
  const booth = new Booth(() => rng.next ? rng.next() : Math.random());
  const check = (txt, where) => {
    if (txt === null || txt === undefined) return;
    lines++;
    if (typeof txt !== 'string' || !txt.trim() || bad.test(txt.replace(/\.\.\./g, '…'))) { errors++; console.error(`BAD LINE (${where}): ${JSON.stringify(txt)}`); }
  };
  const w = booth.event(game, 'welcome');
  check(w, 'welcome');
  game.on((type, data, g) => {
    try {
      if (type === 'snap') booth.snap(g);
      else if (type === 'phase' && data.phase === 'playcall') check(booth.situation(g), 'situation');
      else if (type === 'result') {
        plays++;
        const c = booth.call(g, g.sim, data.result);
        const k = g.sim.kind;
        kinds.set(k, (kinds.get(k) || 0) + 1);
        if (!c) { silent++; return; }
        check(c.pbp, `pbp ${k}`); check(c.color, `color ${k}`);
        if (c.big) big++;
        if (c.color) colors++;
        if (sample.length < 400) sample.push(`${c.big ? '*' : ' '} ${c.pbp}${c.color ? `  // ${c.color}` : ''}   [${g.lastText}]`);
      } else if (['twominute', 'halftime', 'overtime', 'final', 'penalty'].includes(type)) check(booth.event(g, type, data), type);
    } catch (e) { errors++; console.error('BOOTH ERROR', type, e.stack); }
  });
  try { game.start(); game.simulateToEnd(3e6); } catch (e) { errors++; console.error('GAME ERROR', e.stack); }
  console.log(`G${gi}: ${game.teams[0].def.abbr} ${game.score[0]} - ${game.score[1]} ${game.teams[1].def.abbr}`);
}
const shuffled = sample.filter((_, i) => i % 9 === 0).slice(0, 45);
console.log('\n--- sample calls (* = big play) ---\n' + shuffled.join('\n'));
console.log(`\nplays ${plays} (${[...kinds].map(([k, v]) => `${k} ${v}`).join(', ')}), spoken ${plays - silent}, big ${big}, color ${colors}, lines checked ${lines}`);
console.log('errors', errors);
if (errors || plays < 50 || plays - silent < plays * 0.6) { console.log('COMMENTARY CHECK FAILED'); process.exit(1); }
console.log('COMMENTARY OK');
