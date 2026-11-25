// Season mode: schedule, standings, quick simulation, playoffs, offseason.
import { RNG } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { TEAMS, CONFERENCES, DIVISIONS } from '../data/teams.js';
import { defaultLeague, makeTeamState } from '../data/league.js';
import { generatePlayer, computeOVR, buildDepthChart, assignNumbers, ROSTER_SLOTS, setNextPlayerId } from '../data/roster.js';
import { newPlayerStats } from '../sim/stats.js';

const SAVE_KEY = 'g27-season-v1';

export function divisionTeams() {
  const divs = [];
  for (let c = 0; c < 2; c++) for (let d = 0; d < 4; d++) divs.push(TEAMS.map((t, i) => (t.conf === c && t.div === d ? i : -1)).filter((i) => i >= 0));
  return divs; // 8 arrays of 4 team indices
}

export function makeSchedule(rng) {
  const divs = divisionTeams();
  const weeks = [];
  // Division double round robin: 6 weeks
  const rr = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  for (let rep = 0; rep < 2; rep++) for (const round of rr) {
    const wk = [];
    for (const d of divs) for (const [a, b] of round) wk.push(rep === 0 ? { h: d[a], a: d[b] } : { h: d[b], a: d[a] });
    weeks.push(wk);
  }
  // Cross-division blocks: pair divisions with a circle-method round robin over 8 divisions.
  const ids = [0, 1, 2, 3, 4, 5, 6, 7];
  const rounds = [];
  for (let r = 0; r < 7; r++) {
    const pairs = [];
    for (let i = 0; i < 4; i++) pairs.push([ids[i], ids[7 - i]]);
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop());
  }
  rng.shuffle(rounds);
  const blocks = [rounds[0], rounds[1], rounds[2]];
  const weeksPer = [4, 4, 3];
  blocks.forEach((pairs, bi) => {
    const off = rng.int(0, 3);
    for (let k = 0; k < weeksPer[bi]; k++) {
      const wk = [];
      for (const [A, B] of pairs) for (let i = 0; i < 4; i++) {
        const ta = divs[A][i], tb = divs[B][(i + k + off) % 4];
        // Alternate home sides by week, and flip which division hosts first per block.
        const aHome = (k % 2 === 0) !== (bi % 2 === 1);
        wk.push(aHome ? { h: ta, a: tb } : { h: tb, a: ta });
      }
      weeks.push(wk);
    }
  });
  rng.shuffle(weeks);
  return weeks.map((wk) => wk.map((g) => ({ ...g, hs: null, as: null, played: false })));
}

export function newSeason(userTeam, opts = {}) {
  const seed = opts.seed ?? ((Math.random() * 1e9) >>> 0);
  const rng = new RNG(seed);
  const base = defaultLeague();
  // Deep copy rosters so the season can evolve independently.
  const teams = base.map((ts) => ({ abbr: ts.def.abbr, players: JSON.parse(JSON.stringify(ts.players)), depth: JSON.parse(JSON.stringify(ts.depth)) }));
  let maxId = 0;
  for (const t of teams) for (const p of t.players) maxId = Math.max(maxId, p.id);
  return {
    version: 1, seed, year: 2027, userTeam, week: 0, phase: 'regular',
    schedule: makeSchedule(rng), teams, playoffs: null, champion: null,
    stats: {}, history: [], nextId: maxId + 1,
    difficulty: opts.difficulty ?? 1, quarterLen: opts.quarterLen ?? 5,
  };
}

export function saveSeason(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch { return false; } }
export function loadSeason() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s && s.version === 1 ? s : null; } catch { return null; } }
export function deleteSeason() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

export function teamStates(season) {
  if (season._ts) return season._ts;
  const out = season.teams.map((t, i) => makeTeamState(TEAMS[i], t.players, t.depth));
  Object.defineProperty(season, '_ts', { value: out, enumerable: false, writable: true });
  return out;
}
export function invalidateTeamStates(season) { season._ts = null; }

// ------------------------------------------------------------------ standings
export function standings(season) {
  const rec = TEAMS.map((t, i) => ({ i, w: 0, l: 0, t: 0, pf: 0, pa: 0, dw: 0, dl: 0, dt: 0, cw: 0, cl: 0, ct: 0, streak: '' }));
  for (const wk of season.schedule) for (const g of wk) {
    if (!g.played) continue;
    const H = rec[g.h], A = rec[g.a];
    H.pf += g.hs; H.pa += g.as; A.pf += g.as; A.pa += g.hs;
    const sameDiv = TEAMS[g.h].conf === TEAMS[g.a].conf && TEAMS[g.h].div === TEAMS[g.a].div;
    const sameConf = TEAMS[g.h].conf === TEAMS[g.a].conf;
    const res = g.hs > g.as ? 1 : g.hs < g.as ? -1 : 0;
    const apply = (r, v) => {
      if (v > 0) { r.w++; if (sameDiv) r.dw++; if (sameConf) r.cw++; r.streak = r.streak[0] === 'W' ? `W${+r.streak.slice(1) + 1}` : 'W1'; }
      else if (v < 0) { r.l++; if (sameDiv) r.dl++; if (sameConf) r.cl++; r.streak = r.streak[0] === 'L' ? `L${+r.streak.slice(1) + 1}` : 'L1'; }
      else { r.t++; if (sameDiv) r.dt++; if (sameConf) r.ct++; r.streak = 'T1'; }
    };
    apply(H, res); apply(A, -res);
  }
  for (const r of rec) { r.pct = (r.w + r.t * 0.5) / Math.max(1, r.w + r.l + r.t); r.dpct = (r.dw + r.dt * 0.5) / Math.max(1, r.dw + r.dl + r.dt); r.cpct = (r.cw + r.ct * 0.5) / Math.max(1, r.cw + r.cl + r.ct); }
  return rec;
}

export function rankTeams(list) {
  return list.slice().sort((a, b) => b.pct - a.pct || b.dpct - a.dpct || b.cpct - a.cpct || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf || a.i - b.i);
}

export function divisionStandings(season) {
  const rec = standings(season);
  const out = [];
  for (let c = 0; c < 2; c++) for (let d = 0; d < 4; d++) {
    out.push({ conf: c, div: d, name: `${CONFERENCES[c]} ${DIVISIONS[d]}`, teams: rankTeams(rec.filter((r) => TEAMS[r.i].conf === c && TEAMS[r.i].div === d)) });
  }
  return out;
}

export function playoffSeeds(season) {
  const divs = divisionStandings(season);
  const rec = standings(season);
  const seeds = [[], []];
  for (let c = 0; c < 2; c++) {
    const winners = rankTeams(divs.filter((d) => d.conf === c).map((d) => d.teams[0]));
    const wset = new Set(winners.map((w) => w.i));
    const wild = rankTeams(rec.filter((r) => TEAMS[r.i].conf === c && !wset.has(r.i))).slice(0, 3);
    seeds[c] = [...winners, ...wild].map((r) => r.i);
  }
  return seeds;
}

// ------------------------------------------------------------------ quick sim
function teamPower(ts) { return ts.ratings; }
function starters(ts, pos, n) { return (ts.depth[pos] || []).slice(0, n).map((id) => ts.byId.get(id)).filter(Boolean); }

export function quickSim(season, hIdx, aIdx, rng, neutral = false) {
  const T = teamStates(season);
  const H = T[hIdx], A = T[aIdx];
  const res = { hs: 0, as: 0, ot: false, player: new Map() };
  const P = (id) => { if (!res.player.has(id)) res.player.set(id, newPlayerStats()); return res.player.get(id); };
  const sideScore = [0, 0];
  const offense = [H, A];
  const homeAdv = neutral ? 0 : 0.12;
  const nPoss = 11 + rng.int(-1, 1);
  for (let k = 0; k < 2 * nPoss; k++) {
    const s = k % 2;
    const O = offense[s], D = offense[1 - s];
    const ro = teamPower(O), rd = teamPower(D);
    const d = (ro.off - rd.def) / 9 + (s === 0 ? homeAdv : -homeAdv) + rng.gauss() * 0.15;
    const pTD = clamp(0.2 + 0.07 * d, 0.06, 0.45);
    const pFG = clamp(0.14 + 0.02 * d, 0.05, 0.25);
    const pTO = clamp(0.11 - 0.025 * d, 0.03, 0.22);
    const r = rng.next();
    let outcome = 'punt';
    if (r < pTD) outcome = 'td'; else if (r < pTD + pFG) outcome = 'fg'; else if (r < pTD + pFG + pTO) outcome = 'to';
    // Drive stats
    const yards = outcome === 'td' ? rng.int(55, 85) : outcome === 'fg' ? rng.int(35, 60) : outcome === 'to' ? rng.int(0, 35) : rng.int(5, 30);
    const qb = starters(O, 'QB', 1)[0];
    const rb = starters(O, 'HB', 1)[0];
    const recs = [...starters(O, 'WR', 3), ...starters(O, 'TE', 1), rb].filter(Boolean);
    const passShare = clamp(0.6 + ((qb ? qb.ovr : 70) - (rb ? rb.ovr : 70)) * 0.005 + rng.gauss() * 0.1, 0.3, 0.88);
    const passY = Math.round(yards * passShare), rushY = yards - passY;
    const plays = Math.max(3, Math.round(yards / 5.6) + rng.int(0, 2));
    const passPlays = Math.round(plays * (0.55 + passShare * 0.15));
    if (qb) {
      const q = P(qb.id);
      const att = passPlays, cmp = Math.round(att * clamp(0.6 + (qb.ovr - 75) * 0.004 + rng.gauss() * 0.06, 0.4, 0.82));
      q.att += att; q.cmp += cmp; q.pyds += passY;
      // distribute catches
      let left = passY;
      for (let c = 0; c < cmp; c++) {
        const w = recs.map((x, i) => [0.3, 0.22, 0.15, 0.18, 0.15][i] || 0.1);
        const rr = rng.weighted(recs.map((x, i) => i), (i) => w[i]);
        const who = recs[rr];
        const y = c === cmp - 1 ? left : Math.max(0, Math.round(left / (cmp - c) + rng.gauss() * 4));
        left -= y;
        const st = P(who.id); st.rec++; st.recyds += y; st.tgt++;
      }
      if (outcome === 'to' && rng.chance(0.6)) { q.int++; const db = rng.pick(starters(D, 'CB', 3).concat(starters(D, 'FS', 1), starters(D, 'SS', 1))); if (db) P(db.id).defint++; }
    }
    {
      // Split the ground game: lead back, change-of-pace back, QB scrambles.
      const car = Math.max(1, plays - passPlays);
      const backs = [[rb, 0.6], [starters(O, 'HB', 2)[1], 0.28], [qb, 0.12]].filter(([p]) => p);
      let leftY = rushY, leftC = car;
      backs.forEach(([p, share], bi) => {
        const last = bi === backs.length - 1;
        const c = last ? leftC : Math.round(car * share);
        const y = last ? leftY : Math.round(rushY * share + rng.gauss() * 2);
        leftC -= c; leftY -= y;
        if (c > 0 || y !== 0) { const st = P(p.id); st.ratt += Math.max(0, c); st.ryds += y; }
      });
    }
    // Sacks
    if (rng.chance(0.18)) { const rush = rng.pick(starters(D, 'DE', 2).concat(starters(D, 'DT', 2), starters(D, 'OLB', 2))); if (rush) P(rush.id).sacks += 1; if (qb) P(qb.id).sk++; }
    for (const tk of starters(D, 'MLB', 1).concat(starters(D, 'OLB', 2), starters(D, 'SS', 1))) if (rng.chance(0.55)) P(tk.id).tkl += rng.int(1, 2);
    if (outcome === 'td') {
      sideScore[s] += rng.chance(0.958) ? 7 : 6;
      if (qb && rng.chance(passShare)) { P(qb.id).ptd++; const who = rng.pick(recs); P(who.id).rectd++; }
      else if (rb) P(rb.id).rtd++;
    } else if (outcome === 'fg') {
      sideScore[s] += 3;
      const kk = starters(O, 'K', 1)[0]; if (kk) { const st = P(kk.id); st.fga++; st.fgm++; }
    }
  }
  if (sideScore[0] === sideScore[1]) {
    // Overtime coin flip weighted by strength
    res.ot = true;
    const pH = clamp(0.5 + (teamPower(H).ovr - teamPower(A).ovr) * 0.02, 0.2, 0.8);
    if (rng.chance(0.08) && !neutral) { /* tie */ } else if (rng.chance(pH)) sideScore[0] += 3; else sideScore[1] += 3;
  }
  res.hs = sideScore[0]; res.as = sideScore[1];
  return res;
}

export function addStats(season, playerMap) {
  for (const [id, s] of playerMap) {
    const cur = season.stats[id] || (season.stats[id] = newPlayerStats());
    for (const k in s) cur[k] = (cur[k] || 0) + s[k];
  }
}

// Record a box score from a played (3D) game.
export function addBoxStats(season, box) {
  const m = new Map();
  for (const [id, s] of box.players) m.set(id, { ...s });
  addStats(season, m);
}

export function userGameThisWeek(season) {
  if (season.phase === 'regular') {
    const wk = season.schedule[season.week];
    return wk ? wk.find((g) => g.h === season.userTeam || g.a === season.userTeam) : null;
  }
  if (season.phase === 'playoffs' && season.playoffs) {
    const round = season.playoffs.rounds[season.playoffs.round];
    return round ? round.find((g) => (g.h === season.userTeam || g.a === season.userTeam) && !g.played) : null;
  }
  return null;
}

export function simWeek(season, rng) {
  if (season.phase === 'regular') {
    const wk = season.schedule[season.week];
    for (const g of wk) if (!g.played) { const r = quickSim(season, g.h, g.a, rng); g.hs = r.hs; g.as = r.as; g.ot = r.ot; g.played = true; addStats(season, r.player); }
    season.week++;
    if (season.week >= season.schedule.length) startPlayoffs(season);
  } else if (season.phase === 'playoffs') {
    const po = season.playoffs;
    const round = po.rounds[po.round];
    for (const g of round) if (!g.played) {
      let r = quickSim(season, g.h, g.a, rng, po.round === 3);
      let guard = 0;
      while (r.hs === r.as && guard++ < 5) r = quickSim(season, g.h, g.a, rng, po.round === 3);
      if (r.hs === r.as) r.hs += 3;
      g.hs = r.hs; g.as = r.as; g.played = true; addStats(season, r.player);
    }
    advancePlayoffs(season);
  }
}

export function startPlayoffs(season) {
  season.phase = 'playoffs';
  const seeds = playoffSeeds(season);
  const wc = [];
  for (let c = 0; c < 2; c++) {
    const s = seeds[c];
    wc.push({ h: s[1], a: s[6], conf: c, hs: null, as: null, played: false, seedH: 2, seedA: 7 });
    wc.push({ h: s[2], a: s[5], conf: c, hs: null, as: null, played: false, seedH: 3, seedA: 6 });
    wc.push({ h: s[3], a: s[4], conf: c, hs: null, as: null, played: false, seedH: 4, seedA: 5 });
  }
  season.playoffs = { seeds, round: 0, rounds: [wc], names: ['Wild Card', 'Divisional', 'Conference Championship', 'Gridiron Championship'] };
}

function winner(g) { return g.hs > g.as ? { t: g.h, seed: g.seedH } : { t: g.a, seed: g.seedA }; }

export function advancePlayoffs(season) {
  const po = season.playoffs;
  const round = po.rounds[po.round];
  if (round.some((g) => !g.played)) return;
  if (po.round === 3) {
    const w = winner(round[0]);
    season.champion = w.t;
    season.phase = 'champion';
    season.history.push({ year: season.year, champion: w.t, runnerUp: w.t === round[0].h ? round[0].a : round[0].h });
    return;
  }
  const next = [];
  if (po.round === 0) {
    for (let c = 0; c < 2; c++) {
      const alive = round.filter((g) => g.conf === c).map(winner);
      alive.push({ t: po.seeds[c][0], seed: 1 });
      alive.sort((a, b) => a.seed - b.seed);
      next.push({ h: alive[0].t, a: alive[3].t, conf: c, seedH: alive[0].seed, seedA: alive[3].seed, hs: null, as: null, played: false });
      next.push({ h: alive[1].t, a: alive[2].t, conf: c, seedH: alive[1].seed, seedA: alive[2].seed, hs: null, as: null, played: false });
    }
  } else if (po.round === 1) {
    for (let c = 0; c < 2; c++) {
      const alive = round.filter((g) => g.conf === c).map(winner).sort((a, b) => a.seed - b.seed);
      next.push({ h: alive[0].t, a: alive[1].t, conf: c, seedH: alive[0].seed, seedA: alive[1].seed, hs: null, as: null, played: false });
    }
  } else if (po.round === 2) {
    const a = winner(round[0]), b = winner(round[1]);
    const [x, y] = a.seed <= b.seed ? [a, b] : [b, a];
    next.push({ h: x.t, a: y.t, conf: -1, seedH: x.seed, seedA: y.seed, hs: null, as: null, played: false, neutral: true });
  }
  po.rounds.push(next);
  po.round++;
}

// ------------------------------------------------------------------ leaders
export function leaders(season) {
  const T = teamStates(season);
  const meta = new Map();
  T.forEach((ts, ti) => ts.players.forEach((p) => meta.set(p.id, { p, ti })));
  const list = Object.entries(season.stats).map(([id, s]) => ({ id: +id, s, m: meta.get(+id) })).filter((x) => x.m);
  const top = (key, n = 10) => list.filter((x) => x.s[key] > 0).sort((a, b) => b.s[key] - a.s[key]).slice(0, n);
  return { pass: top('pyds'), rush: top('ryds'), rec: top('recyds'), ptd: top('ptd'), sacks: top('sacks'), ints: top('defint'), tkl: top('tkl') };
}

// ------------------------------------------------------------------ offseason
export function runOffseason(season, rng) {
  const rec = standings(season);
  const order = rankTeams(rec).reverse().map((r) => r.i); // worst picks first
  if (season.champion !== null) { const i = order.indexOf(season.champion); order.splice(i, 1); order.push(season.champion); }
  setNextPlayerId(season.nextId || 100000);
  const report = { retired: 0, drafted: [], progressed: [] };
  // Age, progress / regress, retire
  for (const t of season.teams) {
    const keep = [];
    for (const p of t.players) {
      p.age++;
      p.exp = (p.exp || 0) + 1;
      const devK = p.dev === 'Superstar' ? 1.8 : p.dev === 'Star' ? 1.3 : 1;
      let delta;
      if (p.age <= 24) delta = rng.range(1, 5) * devK;
      else if (p.age <= 27) delta = rng.range(-1, 3.5) * devK;
      else if (p.age <= 30) delta = rng.range(-2.5, 1.5);
      else delta = rng.range(-5.5, -0.5);
      for (const k in p.r) {
        if (k === 'inj' || k === 'sta') continue;
        const phys = ['spd', 'acc', 'agi', 'jmp'].includes(k);
        const dd = phys && p.age > 28 ? delta * 1.3 : delta;
        p.r[k] = clamp(Math.round(p.r[k] + dd + rng.gauss() * 1.2), 15, 99);
      }
      const old = p.ovr;
      p.ovr = computeOVR(p.pos, p.r);
      if (p.ovr - old >= 5) report.progressed.push({ name: `${p.first} ${p.last}`, pos: p.pos, from: old, to: p.ovr, team: t.abbr });
      const retireP = p.age >= 37 ? 0.85 : p.age >= 34 ? 0.35 : p.age >= 32 && p.ovr < 70 ? 0.25 : 0;
      if (rng.chance(retireP)) { report.retired++; continue; }
      keep.push(p);
    }
    t.players = keep;
  }
  // Draft: 7 rounds, need-based position picks
  const posList = Object.keys(ROSTER_SLOTS);
  for (let round = 0; round < 7; round++) {
    for (const ti of order) {
      const t = season.teams[ti];
      const counts = {};
      for (const p of t.players) counts[p.pos] = (counts[p.pos] || 0) + 1;
      const need = posList.map((pos) => ({ pos, n: (ROSTER_SLOTS[pos] - (counts[pos] || 0)) + rng.next() * 0.8 })).sort((a, b) => b.n - a.n)[0].pos;
      const target = clamp(Math.round(74 - round * 3.2 + rng.gauss() * 4), 50, 88);
      const p = generatePlayer(rng, need, target, { age: rng.int(21, 23) });
      p.rookie = true;
      p.draft = { round: round + 1, year: season.year + 1 };
      t.players.push(p);
      if (ti === season.userTeam) report.drafted.push({ name: `${p.first} ${p.last}`, pos: p.pos, ovr: p.ovr, round: round + 1 });
    }
  }
  // Cut to roster limits per position (keep best), fill gaps with free agents
  for (const t of season.teams) {
    const byPos = {};
    for (const p of t.players) (byPos[p.pos] ||= []).push(p);
    const kept = [];
    for (const pos of posList) {
      const arr = (byPos[pos] || []).sort((a, b) => b.ovr - a.ovr);
      const lim = ROSTER_SLOTS[pos];
      kept.push(...arr.slice(0, lim));
      for (let k = arr.length; k < lim; k++) kept.push(generatePlayer(rng, pos, rng.int(58, 68)));
    }
    for (const p of kept) p.num = p.num || 0;
    // Resolve duplicate jersey numbers
    const seen = new Set();
    for (const p of kept) { if (seen.has(p.num)) p.num = 0; else seen.add(p.num); }
    assignNumbers(rng, kept);
    t.players = kept;
    t.depth = buildDepthChart(kept);
  }
  season.nextId = (season.nextId || 100000) + 5000;
  season.year++;
  season.week = 0;
  season.phase = 'regular';
  season.schedule = makeSchedule(rng);
  season.playoffs = null;
  season.champion = null;
  season.stats = {};
  invalidateTeamStates(season);
  return report;
}

export function rebuildDepth(season, ti) {
  const t = season.teams[ti];
  t.depth = buildDepthChart(t.players);
  invalidateTeamStates(season);
}
