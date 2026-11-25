// Formation alignment: converts formation specs to positions, numbers receivers,
// determines formation strength and aligns the defense to the offense.
import { FIELD_WIDTH, MID_Y, HASH_OFFSET } from '../core/constants.js';
import { clamp } from '../core/util.js';
import { DL_TECH } from '../data/formations.js';

export const toField = (ballX, ballY, dir, f, l) => ({ x: ballX + dir * f, y: ballY + dir * l });
export const toFrame = (ballX, ballY, dir, x, y) => ({ f: (x - ballX) * dir, l: (y - ballY) * dir });

// Lateral of ball relative to field centre in offense frame (+ = offense right).
export const ballU = (ballY, dir) => (ballY - MID_Y) * dir;
export const sidelineDist = (bu, side) => FIELD_WIDTH / 2 - side * bu;

export function alignOffense(form, ballY, dir, flip) {
  const m = flip ? -1 : 1;
  const bu = ballU(ballY, dir);
  const out = [];
  const teSide = {};
  for (const s of form.slots) if (s.align === 'te') teSide[(s.side || 1) * m] = true;
  for (const s of form.slots) {
    const side = (s.side || 0) * m;
    let f = 0, l = 0;
    const dS = sidelineDist(bu, side || 1);
    const wideL = clamp(dS - 10.5, 8.5, 19);
    switch (s.align) {
      case 'ol': f = s.tag === 'C' ? -0.55 : -0.75; l = s.l * m; break;
      case 'qb': f = s.f; l = 0; break;
      case 'te': f = -0.85; l = side * 3.9; break;
      case 'wing': f = -1.6; l = side * 5.0; break;
      case 'tight': f = -0.6; l = side * 7; break;
      case 'wide': f = s.on ? -0.6 : -1.5; l = side * wideL; break;
      case 'slot': f = s.on ? -0.6 : -1.5; l = side * Math.max(wideL - 5.2, teSide[side] ? 6.3 : 5.2); break;
      case 'slot2': f = s.on ? -0.6 : -1.5; l = side * Math.max(wideL - 9.6, teSide[side] ? 6.3 : 4.6); break;
      case 'bunch_pt': f = -0.6; l = side * clamp(dS * 0.3, 6.2, 8.5); break;
      case 'bunch_in': f = -1.7; l = side * (clamp(dS * 0.3, 6.2, 8.5) - 1.15); break;
      case 'bunch_out': f = -1.7; l = side * (clamp(dS * 0.3, 6.2, 8.5) + 1.15); break;
      case 'back': default: f = s.f ?? -5; l = (s.l || 0) * m; break;
    }
    out.push({ slot: s, tag: s.tag, f, l });
  }
  // Keep receivers spaced and inside the sidelines.
  for (const side of [-1, 1]) {
    const recs = out.filter((o) => o.slot.align !== 'ol' && o.slot.align !== 'qb' && o.slot.align !== 'back' && Math.sign(o.l) === side)
      .sort((a, b) => Math.abs(a.l) - Math.abs(b.l));
    const maxL = sidelineDist(bu, side) - 2.2;
    for (let i = 1; i < recs.length; i++) {
      const prev = Math.abs(recs[i - 1].l);
      const sameDepthGap = Math.abs(recs[i].f - recs[i - 1].f) > 0.8 ? 1.0 : 1.9;
      if (Math.abs(recs[i].l) < prev + sameDepthGap) recs[i].l = side * (prev + sameDepthGap);
    }
    for (const r of recs) if (Math.abs(r.l) > maxL) r.l = side * maxL;
  }
  return out;
}

// Receiver numbering in offense frame from current entity positions.
// Returns { strong, S:[ents], W:[ents], backs:[ents], all:[ents] }
export function numberReceivers(offEnts, ballX, ballY, dir) {
  const left = [], right = [], backs = [];
  let teL = 0, teR = 0;
  for (const e of offEnts) {
    if (!e.eligible) continue;
    const { f, l } = toFrame(ballX, ballY, dir, e.x, e.y);
    e._f = f; e._l = l;
    if (Math.abs(l) < 3.0 && f < -1.2) backs.push(e);
    else if (l < 0) { left.push(e); if (e.pos === 'TE' && Math.abs(l) < 5.5) teL++; }
    else { right.push(e); if (e.pos === 'TE' && Math.abs(l) < 5.5) teR++; }
  }
  left.sort((a, b) => Math.abs(b._l) - Math.abs(a._l));
  right.sort((a, b) => Math.abs(b._l) - Math.abs(a._l));
  backs.sort((a, b) => (a.tag === 'RB' ? -1 : b.tag === 'RB' ? 1 : a._f - b._f));
  let strong;
  if (right.length !== left.length) strong = right.length > left.length ? 1 : -1;
  else if (teR !== teL) strong = teR > teL ? 1 : -1;
  else strong = ballU(ballY, dir) <= 0 ? 1 : -1; // to the wide side of the field
  const S = strong > 0 ? right : left;
  const W = strong > 0 ? left : right;
  return { strong, S, W, backs, left, right };
}

export function resolveManTarget(label, nums) {
  if (!label) return null;
  if (label === 'RB') return nums.backs[0] || null;
  if (label === 'B2') return nums.backs[1] || null;
  const side = label[0] === 'S' ? nums.S : nums.W;
  const n = parseInt(label.slice(1), 10) - 1;
  return side[n] || null;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------
export const ZONES = {
  deep_half: { depth: 17, deep: true, rx: 12, rf: 16 },
  deep_third: { depth: 16, deep: true, rx: 9, rf: 16 },
  deep_mid: { depth: 16, deep: true, rx: 9.5, rf: 16 },
  deep_qtr: { depth: 14, deep: true, rx: 7.5, rf: 14 },
  deep_qtr_M: { depth: 14, deep: true, rx: 7, rf: 14 },
  flat: { depth: 4, deep: false, rx: 7, rf: 5 },
  curl: { depth: 9, deep: false, rx: 6, rf: 5.5 },
  hook: { depth: 7.5, deep: false, rx: 5, rf: 5 },
  hook_M: { depth: 8, deep: false, rx: 5, rf: 5 },
  hole: { depth: 10, deep: false, rx: 6, rf: 5.5 },
  tampa: { depth: 14, deep: true, rx: 6, rf: 9 },
};

// name like 'deep_half_W', 'curl_S', 'hook_M', 'deep_qtr_SM', 'hole', 'tampa', 'deep_mid'
export function zoneSpec(name, strong) {
  let base = name, side = 0;
  const m = name.match(/^(.*)_(S|W|M|SM|WM)$/);
  if (m) {
    base = m[1];
    const s = m[2];
    if (s === 'S' || s === 'SM') side = strong;
    else if (s === 'W' || s === 'WM') side = -strong;
    if (s === 'SM' || s === 'WM') base = 'deep_qtr_M';
    if (s === 'M') { side = 0; if (base === 'hook') base = 'hook_M'; }
  }
  const z = ZONES[base] || ZONES.hook;
  return { name, base, side, ...z };
}

export function zoneLandmark(zs, ballX, ballY, dir) {
  const bu = ballU(ballY, dir);
  const s = zs.side;
  const dS = s ? sidelineDist(bu, s) : FIELD_WIDTH / 2;
  let u;
  switch (zs.base) {
    case 'deep_half': u = s * 13.3 + bu * 0.25; break;
    case 'deep_third': u = s * 16.5 + bu * 0.2; break;
    case 'deep_mid': u = bu * 0.5; break;
    case 'deep_qtr': u = s * 19 + bu * 0.15; break;
    case 'deep_qtr_M': u = s * 6.5 + bu * 0.45; break;
    case 'flat': u = bu + s * dS * 0.62; break;
    case 'curl': u = bu + s * dS * 0.38; break;
    case 'hook': u = bu + s * 4.2; break;
    default: u = bu; break; // hook_M, hole, tampa
  }
  u = clamp(u, -FIELD_WIDTH / 2 + 3, FIELD_WIDTH / 2 - 3);
  return { x: ballX + dir * zs.depth, y: MID_Y + u * dir };
}

// ---------------------------------------------------------------------------
// Defensive alignment
// ---------------------------------------------------------------------------
export function parseAssign(str) {
  if (!str) return { t: 'zone', zone: 'hook_M' };
  if (str === 'rush') return { t: 'rush', lane: 'inside' };
  if (str === 'contain') return { t: 'rush', lane: 'contain' };
  if (str === 'spy') return { t: 'spy' };
  const [k, v] = str.split(':');
  if (k === 'm') return { t: 'man', target: v };
  if (k === 'z') return { t: 'zone', zone: v };
  if (k === 'b') { const [gap, side] = v.split('_'); return { t: 'blitz', gap, side }; }
  return { t: 'zone', zone: 'hook_M' };
}

const GAP_L = { A: 0.65, B: 1.95, C: 3.3, E: 4.8 };
export function gapLateral(gap, side, nums, offEnts) {
  // side: +1/-1 in offense frame
  let l = (GAP_L[gap] ?? 1.95) * side;
  if (gap === 'E' || gap === 'C') {
    const te = offEnts.find((e) => e.pos === 'TE' && Math.sign(e._l ?? 0) === side && Math.abs(e._l) < 5.5 && (e._f ?? -1) > -1.2);
    if (te) l = te._l + side * (gap === 'E' ? 1.4 : -0.6);
  }
  return l;
}

// Computes pre-snap (f, l) for every defender. defEnts carry .slot and .assign.
export function alignDefense(defEnts, offEnts, ballX, ballY, dir, press) {
  const nums = numberReceivers(offEnts, ballX, ballY, dir);
  const st = nums.strong;
  const bu = ballU(ballY, dir);
  const taken = new Set();
  // First resolve man targets so DBs can align on them.
  for (const d of defEnts) {
    d.manTarget = null;
    if (d.assign.t !== 'man') continue;
    let tgt = resolveManTarget(d.assign.target, nums);
    if (tgt && taken.has(tgt)) tgt = null;
    if (!tgt) {
      // Fallback: nearest uncovered eligible on that side, else convert to a zone.
      const want = d.assign.target === 'RB' || d.assign.target === 'B2' ? null : (d.assign.target[0] === 'S' ? nums.S : nums.W);
      const cands = (want || []).filter((e) => !taken.has(e));
      tgt = cands.length ? cands[cands.length - 1] : null;
    }
    if (tgt) { taken.add(tgt); d.manTarget = tgt; }
  }
  for (const d of defEnts) {
    const s = d.slot;
    let f = 5, l = 0;
    const side = (s.side || 1) * st;
    const a = d.assign;
    if (s.dl) {
      const t = DL_TECH[s.dl] ?? 1.9;
      l = side * t;
      if (s.dl === '7' || s.dl === '9') {
        const te = offEnts.find((e) => e.pos === 'TE' && Math.sign(e._l ?? 0) === side && Math.abs(e._l) < 5.5 && (e._f ?? -1) > -1.2);
        l = te ? te._l + side * (s.dl === '9' ? 1.1 : -0.35) : side * 3.9;
      }
      f = 0.95;
    } else if (s.edge) {
      const te = offEnts.find((e) => e.pos === 'TE' && Math.sign(e._l ?? 0) === side && Math.abs(e._l) < 5.5 && (e._f ?? -1) > -1.2);
      l = te ? te._l + side * 1.3 : side * 4.4;
      f = 1.1;
    } else if (s.lb) {
      l = s.lb.l * st; f = s.lb.f;
    } else {
      // DBs: derive from the assignment.
      const isCB = s.db === 'cb', isNB = s.db === 'nb';
      if (a.t === 'man' && d.manTarget) {
        const r = d.manTarget;
        const inside = -Math.sign(r._l || 1);
        const isBack = nums.backs.includes(r);
        if (isBack) { l = r._l * 0.5 + inside * 1.5; f = 5; }
        else {
          l = r._l + inside * 0.7;
          f = press ? 1.1 : (isCB ? 6.2 : 5.2);
          if (!isCB && !isNB && !press) f = 6.5;
        }
      } else if (a.t === 'zone') {
        const zs = zoneSpec(a.zone, st);
        const zside = zs.side || (isCB ? (d.tag === 'CB1' ? -st : st) : 0);
        const recs = zside === st ? nums.S : zside === -st ? nums.W : [];
        if (isCB) {
          const r = recs[0];
          const outside = zside;
          if (r) {
            if (zs.base === 'flat') { l = r._l + outside * 1.0; f = 5.0; }
            else if (zs.base === 'curl') { l = r._l + outside * 0.4; f = 6; }
            else { l = r._l + outside * 0.8; f = zs.base === 'deep_qtr' ? 7.5 : 7.8; }
          } else { l = zside * clamp(sidelineDist(bu, zside || 1) - 12, 6, 16); f = 7.5; }
        } else if (isNB) {
          const r = recs[1] || recs[0];
          if (r && !zs.deep) { l = r._l - Math.sign(r._l) * 0.8; f = 5.0; }
          else { const lm = zoneLandmark(zs, ballX, ballY, dir); const fr = toFrame(ballX, ballY, dir, lm.x, lm.y); l = fr.l; f = zs.deep ? 10 : 6; }
        } else {
          // Safeties
          if (zs.base === 'deep_half') { l = zside * 10.4 - bu; f = 12.5; }
          else if (zs.base === 'deep_mid') { l = -bu * 0.5; f = 13; }
          else if (zs.base === 'deep_qtr_M') { const r = recs[1]; l = r ? r._l - Math.sign(r._l) * 1.2 : zside * 6; f = 10.5; }
          else if (zs.base === 'deep_third') { l = zside * 14 - bu * 0.8; f = 11; }
          else { const lm = zoneLandmark(zs, ballX, ballY, dir); const fr = toFrame(ballX, ballY, dir, lm.x, lm.y); l = fr.l * 0.8; f = Math.min(9.5, fr.f + 1); }
          // Two-high disguise for most safety looks.
          if (d.tag === 'SS' || d.tag === 'FS') f = Math.max(f, 9);
        }
      } else if (a.t === 'blitz') {
        const gs = a.side === 'S' ? st : -st;
        if (isNB || isCB) {
          const r = (gs === st ? nums.S : nums.W)[isNB ? 1 : 0];
          l = r ? r._l - Math.sign(r._l) * 1.5 : gs * 6; f = 3.5;
        } else { l = gapLateral(a.gap, gs, nums, offEnts) * 1.4; f = 5.5; }
      } else if (a.t === 'spy') { l = 0; f = 6; }
      else { l = isCB ? (d.tag === 'CB1' ? -st : st) * 12 : 0; f = 8; }
    }
    // Keep within field
    const u = bu + l;
    const maxU = FIELD_WIDTH / 2 - 1.2;
    if (u > maxU) l = maxU - bu; if (u < -maxU) l = -maxU - bu;
    d.alignF = f; d.alignL = l;
  }
  return nums;
}

export const HASHES = { left: MID_Y - HASH_OFFSET, right: MID_Y + HASH_OFFSET };
