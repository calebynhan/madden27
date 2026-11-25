import { Game } from '../src/sim/game.js';
import { defaultLeague } from '../src/data/league.js';
import { RNG } from '../src/core/rng.js';
const teams = defaultLeague();
const N = +(process.argv[2] || 6);
const out = { sacks: 0, drop: 0, unblocked: 0, shed: 0, t: [], blitz: 0, scr: 0, qbRun: 0, byPos: {}, dropTypes: {}, setT: [] };
for (let g = 0; g < N; g++) {
  const game = new Game({ teams: [teams[g % 32], teams[(g * 7 + 3) % 32]], settings: { quarterLen: 15, accelTo: 7 }, rng: new RNG(700 + g), headless: true });
  game.on((type, data, gm) => {
    if (type !== 'result') return;
    const s = gm.sim, r = data.result;
    if (s.kind !== 'scrimmage' || s.playType === 'run' && r.playType !== 'sack') return;
    if (s.offPlay.type === 'run' || s.playType === 'kneel' || s.playType === 'spike') return;
    out.drop++;
    if (r.playType !== 'sack') return;
    out.sacks++;
    const ev = r.events.find((e) => e.type === 'sack');
    out.t.push(ev.t);
    if (s.qbDrop) out.setT.push(s.qbDrop.setT);
    const d = s.ents.find((e) => e.id === ev.by);
    out.byPos[d.pos] = (out.byPos[d.pos] || 0) + 1;
    out.dropTypes[s.dropType] = (out.dropTypes[s.dropType] || 0) + 1;
    if (r.events.some((e) => e.type === 'shed' && e.by === d.id)) out.shed++; else out.unblocked++;
    if (s.defPlay.tags.includes('blitz')) out.blitz++;
  });
  game.start(); game.simulateToEnd();
}
const avg = (a) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(2);
console.log(`dropbacks ${out.drop} sacks ${out.sacks} (${(100 * out.sacks / out.drop).toFixed(1)}%) unblocked ${out.unblocked} shed ${out.shed} vs blitz ${out.blitz} avg sack t ${avg(out.t)} avg set t ${avg(out.setT)}`, out.byPos, out.dropTypes);
