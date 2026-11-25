import { RATING_KEYS } from '../core/constants.js';
import { clamp } from '../core/util.js';
import { FIRST_NAMES, LAST_NAMES } from './names.js';

// Mean ratings for an average (~75 OVR) starter at each roster position.
const TEMPLATES = {
  QB: { spd: 66, acc: 72, agi: 70, str: 62, awr: 76, jmp: 60, thp: 88, sac: 80, mac: 77, dac: 74, tor: 72, tup: 72, car: 66, btk: 52, trk: 45, elu: 58, jkm: 55, spm: 50, sfa: 45, bcv: 60, cth: 40 },
  HB: { spd: 89, acc: 90, agi: 88, str: 66, awr: 70, jmp: 80, car: 82, btk: 78, trk: 72, elu: 80, sfa: 70, spm: 75, jkm: 78, bcv: 78, cth: 68, cit: 55, spc: 52, rte: 58, rls: 48, pbk: 50, rbk: 42, ibl: 40 },
  FB: { spd: 74, acc: 78, agi: 70, str: 78, awr: 70, jmp: 65, car: 72, btk: 72, trk: 76, elu: 50, sfa: 66, bcv: 60, cth: 64, cit: 58, rte: 50, rls: 45, rbk: 73, pbk: 66, ibl: 73 },
  WR: { spd: 91, acc: 90, agi: 88, str: 56, awr: 72, jmp: 88, cth: 82, cit: 75, spc: 76, rte: 80, rls: 78, car: 66, btk: 56, trk: 45, elu: 76, jkm: 76, spm: 66, sfa: 52, bcv: 72, rbk: 46, pbk: 30 },
  TE: { spd: 80, acc: 82, agi: 76, str: 73, awr: 72, jmp: 76, cth: 76, cit: 75, spc: 68, rte: 68, rls: 65, rbk: 68, pbk: 62, ibl: 66, car: 66, btk: 70, trk: 72, elu: 56, sfa: 66, bcv: 62 },
  OT: { spd: 58, acc: 70, agi: 62, str: 86, awr: 74, jmp: 55, pbk: 80, rbk: 78, ibl: 72 },
  OG: { spd: 56, acc: 68, agi: 58, str: 88, awr: 73, jmp: 52, pbk: 77, rbk: 80, ibl: 75 },
  C: { spd: 55, acc: 67, agi: 60, str: 85, awr: 77, jmp: 52, pbk: 78, rbk: 78, ibl: 72 },
  DE: { spd: 80, acc: 84, agi: 74, str: 82, awr: 70, jmp: 72, fmv: 76, pmv: 76, bsh: 76, tak: 76, pow: 76, pur: 76, prc: 68, zcv: 40, mcv: 32 },
  DT: { spd: 66, acc: 78, agi: 64, str: 90, awr: 70, jmp: 62, fmv: 66, pmv: 80, bsh: 80, tak: 76, pow: 76, pur: 68, prc: 68 },
  OLB: { spd: 83, acc: 85, agi: 78, str: 74, awr: 70, jmp: 78, tak: 78, pow: 76, pur: 80, prc: 72, bsh: 70, pmv: 66, fmv: 68, zcv: 66, mcv: 58, prs: 55, cth: 50 },
  MLB: { spd: 79, acc: 82, agi: 74, str: 76, awr: 75, jmp: 74, tak: 82, pow: 78, pur: 80, prc: 78, bsh: 72, pmv: 60, fmv: 60, zcv: 67, mcv: 55, prs: 45, cth: 50 },
  CB: { spd: 92, acc: 91, agi: 89, str: 56, awr: 70, jmp: 88, mcv: 80, zcv: 78, prs: 74, tak: 62, pow: 56, pur: 76, prc: 70, cth: 64, spc: 56, cit: 50 },
  FS: { spd: 89, acc: 88, agi: 84, str: 62, awr: 72, jmp: 85, zcv: 80, mcv: 70, prs: 55, tak: 70, pow: 70, pur: 82, prc: 74, cth: 64, spc: 52 },
  SS: { spd: 87, acc: 87, agi: 82, str: 68, awr: 72, jmp: 85, zcv: 76, mcv: 68, prs: 58, tak: 77, pow: 78, pur: 82, prc: 74, cth: 58, spc: 48 },
  K: { spd: 50, acc: 55, agi: 55, str: 45, awr: 70, jmp: 50, kpw: 88, kac: 82, tak: 30 },
  P: { spd: 52, acc: 55, agi: 55, str: 45, awr: 70, jmp: 50, kpw: 86, kac: 78, tak: 30 },
};

// Overall-rating weights by position.
export const OVR_WEIGHTS = {
  QB: { thp: 0.18, sac: 0.15, mac: 0.15, dac: 0.12, awr: 0.22, tor: 0.06, tup: 0.07, spd: 0.03, agi: 0.02 },
  HB: { spd: 0.2, acc: 0.1, agi: 0.1, car: 0.1, btk: 0.1, elu: 0.1, bcv: 0.1, trk: 0.05, cth: 0.05, jkm: 0.05, spm: 0.05 },
  FB: { rbk: 0.3, ibl: 0.15, str: 0.15, car: 0.1, trk: 0.1, cth: 0.1, awr: 0.1 },
  WR: { spd: 0.2, cth: 0.2, rte: 0.18, rls: 0.08, cit: 0.1, spc: 0.08, acc: 0.06, agi: 0.05, awr: 0.05 },
  TE: { cth: 0.2, rte: 0.1, rbk: 0.2, pbk: 0.1, cit: 0.1, spd: 0.1, str: 0.1, awr: 0.1 },
  OT: { pbk: 0.32, rbk: 0.23, str: 0.2, awr: 0.15, agi: 0.05, acc: 0.05 },
  OG: { rbk: 0.32, pbk: 0.25, str: 0.23, awr: 0.15, ibl: 0.05 },
  C: { rbk: 0.3, pbk: 0.27, str: 0.2, awr: 0.18, ibl: 0.05 },
  DE: { fmv: 0.15, pmv: 0.15, bsh: 0.2, str: 0.15, spd: 0.1, acc: 0.1, tak: 0.1, pur: 0.05 },
  DT: { bsh: 0.25, pmv: 0.2, str: 0.25, tak: 0.1, fmv: 0.05, prc: 0.1, acc: 0.05 },
  OLB: { tak: 0.2, pur: 0.15, spd: 0.1, bsh: 0.1, prc: 0.15, zcv: 0.1, pmv: 0.05, fmv: 0.05, pow: 0.1 },
  MLB: { tak: 0.25, prc: 0.2, pur: 0.15, zcv: 0.1, bsh: 0.1, pow: 0.1, spd: 0.1 },
  CB: { mcv: 0.25, zcv: 0.2, spd: 0.2, prs: 0.1, acc: 0.1, agi: 0.05, cth: 0.05, prc: 0.05 },
  FS: { zcv: 0.25, spd: 0.15, prc: 0.15, mcv: 0.1, tak: 0.1, pur: 0.1, cth: 0.1, pow: 0.05 },
  SS: { zcv: 0.2, tak: 0.15, pow: 0.1, prc: 0.15, spd: 0.1, mcv: 0.1, pur: 0.1, str: 0.1 },
  K: { kpw: 0.55, kac: 0.45 },
  P: { kpw: 0.55, kac: 0.45 },
};

// Ratings that should NOT scale up with overall (physical baselines vary less).
const PHYSICAL = new Set(['spd', 'acc', 'agi', 'jmp', 'str']);

export const ROSTER_SLOTS = { QB: 3, HB: 3, FB: 1, WR: 6, TE: 3, OT: 4, OG: 4, C: 2, DE: 4, DT: 4, OLB: 4, MLB: 3, CB: 6, FS: 2, SS: 2, K: 1, P: 1 };
export const STARTERS = { QB: 1, HB: 1, FB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, DE: 2, DT: 2, OLB: 2, MLB: 1, CB: 3, FS: 1, SS: 1, K: 1, P: 1 };

const SIZE = {
  QB: [75, 225], HB: [70, 212], FB: [72, 245], WR: [73, 200], TE: [77, 252], OT: [78, 315], OG: [76, 315], C: [75, 305],
  DE: [76, 270], DT: [75, 310], OLB: [75, 245], MLB: [74, 240], CB: [71, 192], FS: [72, 205], SS: [72, 210], K: [72, 195], P: [74, 210],
};

const NUMBER_RANGES = {
  QB: [[1, 19]], HB: [[20, 49], [1, 19]], FB: [[30, 49], [40, 49]], WR: [[1, 19], [80, 89]], TE: [[80, 89], [40, 49]],
  OT: [[60, 79]], OG: [[60, 79]], C: [[50, 79]], DE: [[90, 99], [50, 59]], DT: [[90, 99], [70, 79]],
  OLB: [[40, 59], [90, 99]], MLB: [[40, 59]], CB: [[20, 39], [1, 19]], FS: [[20, 49]], SS: [[20, 49]], K: [[1, 19]], P: [[1, 19]],
};

export function computeOVR(pos, r) {
  const w = OVR_WEIGHTS[pos];
  let s = 0, tw = 0;
  for (const k in w) { s += (r[k] ?? 40) * w[k]; tw += w[k]; }
  // Spread the scale a little so elite players reach the high 90s.
  const raw = s / tw;
  return clamp(Math.round(raw + (raw - 70) * 0.35), 30, 99);
}

let nextId = 1;
export function setNextPlayerId(n) { nextId = n; }
export function getNextPlayerId() { return nextId; }

export function generatePlayer(rng, pos, targetOvr, opts = {}) {
  const t = TEMPLATES[pos];
  const r = {};
  const delta = targetOvr - 75;
  for (const k of RATING_KEYS) {
    const base = t[k];
    if (base === undefined) {
      r[k] = clamp(Math.round(rng.range(25, 50)), 10, 99);
      continue;
    }
    const scale = PHYSICAL.has(k) ? 0.35 : 0.9;
    r[k] = clamp(Math.round(base + delta * scale + rng.gauss() * 4.5), 20, 99);
  }
  r.sta = clamp(Math.round(80 + rng.gauss() * 6), 55, 99);
  r.inj = clamp(Math.round(82 + rng.gauss() * 7), 50, 99);
  // Converge overall to target by nudging weighted ratings.
  for (let i = 0; i < 4; i++) {
    const ovr = computeOVR(pos, r);
    const d = targetOvr - ovr;
    if (Math.abs(d) < 1) break;
    for (const k in OVR_WEIGHTS[pos]) r[k] = clamp(Math.round(r[k] + d * 0.75), 20, 99);
  }
  const [hBase, wBase] = SIZE[pos];
  const age = opts.age ?? clamp(Math.round(21 + Math.abs(rng.gauss()) * 4.5 + rng.range(0, 3)), 21, 37);
  const p = {
    id: nextId++,
    first: rng.pick(FIRST_NAMES),
    last: rng.pick(LAST_NAMES),
    pos,
    num: 0,
    age,
    ht: Math.round(hBase + rng.gauss() * 1.6),
    wt: Math.round(wBase + rng.gauss() * 10),
    r,
    ovr: computeOVR(pos, r),
    dev: rng.chance(0.06) ? 'Superstar' : rng.chance(0.18) ? 'Star' : 'Normal',
    exp: Math.max(0, age - 22),
  };
  return p;
}

// Build a 53-man roster for a team. tier (0..1) sets overall talent level.
export function generateRoster(rng, team) {
  const players = [];
  const starterAvg = 71 + team.tier * 13; // ~71 (weak) to ~84 (elite)
  for (const pos in ROSTER_SLOTS) {
    const n = ROSTER_SLOTS[pos];
    const starters = STARTERS[pos];
    for (let i = 0; i < n; i++) {
      let target;
      if (i < starters) target = starterAvg + rng.gauss() * 5 - i * 1.5;
      else target = starterAvg - 9 - (i - starters) * 3 + rng.gauss() * 4;
      // A few franchise players per team.
      if (i === 0 && rng.chance(0.18 + team.tier * 0.25)) target += rng.range(5, 12);
      if (pos === 'QB' && i === 0) target += (team.tier - 0.5) * 8; // QB quality tracks tier strongly
      players.push(generatePlayer(rng, pos, clamp(Math.round(target), 48, 99)));
    }
  }
  assignNumbers(rng, players);
  return players;
}

export function assignNumbers(rng, players) {
  const used = new Set(players.filter((p) => p.num).map((p) => p.num));
  for (const p of players) {
    if (p.num) continue;
    const ranges = NUMBER_RANGES[p.pos];
    let num = 0;
    for (let tries = 0; tries < 60 && !num; tries++) {
      const [a, b] = ranges[tries < 40 ? 0 : ranges.length - 1];
      const n = rng.int(a, b);
      if (!used.has(n)) num = n;
    }
    if (!num) for (let n = 1; n < 100; n++) if (!used.has(n)) { num = n; break; }
    used.add(num);
    p.num = num;
  }
}

// Depth chart: map position -> array of player ids sorted best first.
export function buildDepthChart(players) {
  const dc = {};
  for (const pos in ROSTER_SLOTS) dc[pos] = [];
  for (const p of players) (dc[p.pos] ||= []).push(p);
  for (const pos in dc) dc[pos].sort((a, b) => b.ovr - a.ovr);
  const out = {};
  for (const pos in dc) out[pos] = dc[pos].map((p) => p.id);
  return out;
}

// Team-level ratings summary used by menus and the quick-sim engine.
export function teamRatings(players, depth) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const get = (pos, i) => byId.get(depth[pos]?.[i]);
  const avg = (arr) => arr.filter(Boolean).reduce((s, p) => s + p.ovr, 0) / Math.max(1, arr.filter(Boolean).length);
  const qb = get('QB', 0);
  const skill = [get('HB', 0), get('WR', 0), get('WR', 1), get('WR', 2), get('TE', 0)];
  const ol = [get('OT', 0), get('OT', 1), get('OG', 0), get('OG', 1), get('C', 0)];
  const dl = [get('DE', 0), get('DE', 1), get('DT', 0), get('DT', 1)];
  const lb = [get('OLB', 0), get('OLB', 1), get('MLB', 0)];
  const db = [get('CB', 0), get('CB', 1), get('CB', 2), get('FS', 0), get('SS', 0)];
  const off = Math.round((qb ? qb.ovr : 60) * 0.35 + avg(skill) * 0.35 + avg(ol) * 0.3);
  const def = Math.round(avg(dl) * 0.35 + avg(lb) * 0.25 + avg(db) * 0.4);
  const st = Math.round(avg([get('K', 0), get('P', 0)]));
  const ovr = Math.round(off * 0.46 + def * 0.44 + st * 0.1);
  return { ovr, off, def, st, qb: qb ? qb.ovr : 0, pass: Math.round((qb ? qb.ovr : 60) * 0.5 + avg(skill.slice(1)) * 0.5), run: Math.round(avg([get('HB', 0)]) * 0.5 + avg(ol) * 0.5) };
}
