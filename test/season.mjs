import * as L from '../src/season/league.js';
import { RNG } from '../src/core/rng.js';
import { TEAMS } from '../src/data/teams.js';
import { ROSTER_SLOTS } from '../src/data/roster.js';
const rng = new RNG(77);
const s = L.newSeason(5, { seed: 123 });
let ok = true;
const fail = (m) => { ok = false; console.error('FAIL', m); };
// Schedule checks
if (s.schedule.length !== 17) fail('weeks ' + s.schedule.length);
const games = new Array(32).fill(0), divGames = new Array(32).fill(0), homeG = new Array(32).fill(0);
for (const wk of s.schedule) {
  const seen = new Set();
  if (wk.length !== 16) fail('week size ' + wk.length);
  for (const g of wk) {
    if (seen.has(g.h) || seen.has(g.a)) fail('team twice in a week');
    seen.add(g.h); seen.add(g.a);
    if (g.h === g.a) fail('self game');
    games[g.h]++; games[g.a]++; homeG[g.h]++;
    if (TEAMS[g.h].conf === TEAMS[g.a].conf && TEAMS[g.h].div === TEAMS[g.a].div) { divGames[g.h]++; divGames[g.a]++; }
  }
}
if (games.some((n) => n !== 17)) fail('games per team ' + games);
if (divGames.some((n) => n !== 6)) fail('div games ' + divGames);
console.log('home games range', Math.min(...homeG), Math.max(...homeG));
// Sim the whole regular season
let guard = 0;
while (s.phase === 'regular' && guard++ < 40) L.simWeek(s, rng);
const st = L.standings(s);
const totalW = st.reduce((a, r) => a + r.w, 0), totalL = st.reduce((a, r) => a + r.l, 0);
if (totalW !== totalL) fail('W != L');
const pts = st.reduce((a, r) => a + r.pf, 0) / (32 * 17);
console.log('avg points per team-game', pts.toFixed(1), 'ties', st.reduce((a, r) => a + r.t, 0) / 2);
if (s.phase !== 'playoffs') fail('not in playoffs');
console.log('seeds', s.playoffs.seeds.map((c) => c.map((i) => TEAMS[i].abbr).join(',')).join(' | '));
while (s.phase === 'playoffs' && guard++ < 60) L.simWeek(s, rng);
if (s.phase !== 'champion') fail('no champion');
console.log('champion', TEAMS[s.champion].city, TEAMS[s.champion].name, 'rounds', s.playoffs.rounds.map((r) => r.length).join('/'));
const ld = L.leaders(s);
console.log('pass leader', ld.pass[0] && `${ld.pass[0].m.p.last} ${ld.pass[0].s.pyds}`, 'rush leader', ld.rush[0] && `${ld.rush[0].m.p.last} ${ld.rush[0].s.ryds}`, 'sack leader', ld.sacks[0] && ld.sacks[0].s.sacks);
const rep = L.runOffseason(s, rng);
console.log('offseason: retired', rep.retired, 'user drafted', rep.drafted.length, 'year', s.year, 'phase', s.phase);
for (const t of s.teams) {
  const c = {};
  for (const p of t.players) c[p.pos] = (c[p.pos] || 0) + 1;
  for (const pos in ROSTER_SLOTS) if (c[pos] !== ROSTER_SLOTS[pos]) fail(`${t.abbr} ${pos} ${c[pos]}`);
  const nums = new Set(t.players.map((p) => p.num));
  if (nums.size !== t.players.length) fail(`${t.abbr} duplicate numbers`);
  const ids = new Set(t.players.map((p) => p.id));
  if (ids.size !== t.players.length) fail(`${t.abbr} duplicate ids`);
}
// Second season runs too
guard = 0;
while (s.phase !== 'champion' && guard++ < 60) L.simWeek(s, rng);
console.log('season 2 champion', TEAMS[s.champion].abbr, 'json size KB', (JSON.stringify(s).length / 1024).toFixed(0));
console.log(ok ? 'SEASON TESTS PASSED' : 'SEASON TESTS FAILED');
if (!ok) process.exit(1);
