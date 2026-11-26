// SVG play diagrams generated from the same alignment code the simulation uses.
import { OFF_FORMATIONS, DEF_FORMATIONS } from '../data/formations.js';
import { ROUTES } from '../data/routes.js';
import { alignOffense, alignDefense, parseAssign, zoneSpec, zoneLandmark, toFrame } from '../sim/align.js';
import { MID_Y } from '../core/constants.js';

const LOSX = 50;

function frameToSvg(f, l, w, h, flip) {
  const sc = w / 44;
  const losY = h - 10 * sc;
  return { x: w / 2 + (flip ? -l : l) * sc, y: losY - f * sc };
}

function arrowHead(x1, y1, x2, y2, col, size = 5) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p1 = [x2 - Math.cos(a - 0.5) * size, y2 - Math.sin(a - 0.5) * size];
  const p2 = [x2 - Math.cos(a + 0.5) * size, y2 - Math.sin(a + 0.5) * size];
  return `<polygon points="${x2},${y2} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}" fill="${col}"/>`;
}

export function routePoints(slotF, slotL, key, releaseSide) {
  const def = ROUTES[key];
  if (!def || !def.pts) return null;
  let inside = -Math.sign(slotL || 1);
  if (Math.abs(slotL) < 2.5) {
    const rel = slotL < -0.3 ? -1 : slotL > 0.3 ? 1 : releaseSide;
    inside = -rel;
  }
  const pts = [[slotF, slotL]];
  let prevF = slotF, prevL = slotL;
  for (const [d, i] of def.pts) {
    let f = slotF + d, l = slotL + i * inside;
    // Trim long continuations
    const dd = Math.hypot(f - prevF, l - prevL);
    const maxSeg = 12;
    if (dd > maxSeg) { f = prevF + (f - prevF) * maxSeg / dd; l = prevL + (l - prevL) * maxSeg / dd; }
    if (f > 24) { const k = (24 - prevF) / Math.max(0.01, f - prevF); f = 24; l = prevL + (l - prevL) * k; }
    pts.push([f, l]);
    prevF = f; prevL = l;
  }
  return { pts, sit: !!def.sit };
}

const run2 = (play) => play.run || {};

export function offenseSVG(play, w = 220, h = 150, flip = false) {
  const form = OFF_FORMATIONS[play.form];
  if (!form) return '';
  const al = alignOffense(form, MID_Y, 1, false);
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`;
  const los = frameToSvg(0, 0, w, h, flip).y;
  s += `<rect width="${w}" height="${h}" fill="#0f3d1c"/>`;
  for (let k = -2; k <= 4; k++) { const y = frameToSvg(k * 5, 0, w, h).y; s += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#ffffff" stroke-opacity="0.08"/>`; }
  s += `<line x1="0" y1="${los}" x2="${w}" y2="${los}" stroke="#4b8bff" stroke-width="1.5" stroke-opacity="0.8"/>`;
  const reads = play.reads || [];
  const side = play.side || 1;
  for (const a of al) {
    const p = frameToSvg(a.f, a.l, w, h, flip);
    const tag = a.tag;
    let rk = play.routes ? play.routes[tag] : null;
    if (play.type === 'run' && play.rpo && tag === play.rpo.tag) {
      // RPO read receiver: his route is a live pass option.
      const rp = routePoints(a.f, a.l, play.rpo.route, side);
      if (rp) {
        const sp = rp.pts.map(([f, l]) => frameToSvg(f, l, w, h, flip));
        s += `<polyline points="${sp.map((q) => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="#ffd21f" stroke-width="2" stroke-dasharray="4 2"/>`;
        const n = sp.length;
        if (!rp.sit) s += arrowHead(sp[n - 2].x, sp[n - 2].y, sp[n - 1].x, sp[n - 1].y, '#ffd21f');
      }
    } else if (play.type === 'run' && run2(play).scheme === 'option' && tag === 'RB') {
      // Pitch relationship path
      const pts = [[a.f, a.l], [a.f - 0.5, run2(play).side * 4.5], [1, run2(play).side * 9]].map(([f, l]) => frameToSvg(f, l, w, h, flip));
      s += `<polyline points="${pts.map((q) => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="#ff9f1c" stroke-width="2" stroke-dasharray="3 3"/>`;
    } else if (play.type === 'run') {
      const run = play.run;
      if (tag === run.ball || (tag === 'QB' && run.ball === 'QB')) {
        const aim = run.side * ({ dive: 0.7, iz: 2.0, oz: 5.0, iso: 1.3, power: 3.0, counter: 2.6, toss: 6.2, draw: 1.0, sneak: 0.4, qb_draw: 1.2, read: 2.0, option: 6.5 }[run.scheme] ?? 2);
        const pts = [[a.f, a.l]];
        if (run.scheme === 'counter') pts.push([a.f + 0.5, -run.side * 1.2]);
        if (run.scheme === 'option') pts.push([a.f + 0.5, run.side * 3]);
        if (run.scheme === 'toss') pts.push([-4.5, run.side * 5.5]);
        else pts.push([-3, aim * 0.5]);
        pts.push([1, aim]); pts.push([6, aim * 1.1]);
        const sp = pts.map(([f, l]) => frameToSvg(f, l, w, h, flip));
        s += `<polyline points="${sp.map((q) => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="#ff9f1c" stroke-width="2.4"/>`;
        s += arrowHead(sp[sp.length - 2].x, sp[sp.length - 2].y, sp[sp.length - 1].x, sp[sp.length - 1].y, '#ff9f1c', 6);
      } else if (a.slot.align === 'ol' || a.slot.align === 'te' || tag === 'FB' || (!rk && tag !== 'QB')) {
        const pull = (run.scheme === 'power' && tag === (run.side > 0 ? 'LG' : 'RG')) || (run.scheme === 'counter' && (tag === (run.side > 0 ? 'LG' : 'RG') || tag === (run.side > 0 ? 'LT' : 'RT')));
        const e = pull ? frameToSvg(-1.5, run.side * 3.5, w, h, flip) : frameToSvg(a.f + 2, a.l + run.side * 0.6, w, h, flip);
        s += `<line x1="${p.x}" y1="${p.y}" x2="${e.x}" y2="${e.y}" stroke="#e74c3c" stroke-width="1.6"/>`;
        s += `<line x1="${e.x - 3}" y1="${e.y}" x2="${e.x + 3}" y2="${e.y}" stroke="#e74c3c" stroke-width="1.6"/>`;
      }
    } else if (rk && rk !== 'block' && rk !== 'run_block') {
      const rp = routePoints(a.f, a.l, rk, side);
      if (rp) {
        const sp = rp.pts.map(([f, l]) => frameToSvg(f, l, w, h, flip));
        const primary = reads[0] === tag;
        const col = primary ? '#ffd21f' : ROUTES[rk].depthClass === 'screen' ? '#5cff7a' : '#ffffff';
        s += `<polyline points="${sp.map((q) => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2"/>`;
        const n = sp.length;
        if (!rp.sit) s += arrowHead(sp[n - 2].x, sp[n - 2].y, sp[n - 1].x, sp[n - 1].y, col);
        else s += `<line x1="${sp[n - 1].x - 4}" y1="${sp[n - 1].y}" x2="${sp[n - 1].x + 4}" y2="${sp[n - 1].y}" stroke="${col}" stroke-width="2"/>`;
      }
    } else if (tag !== 'QB') {
      const e = frameToSvg(a.f - 1.5, a.l, w, h, flip);
      s += `<line x1="${p.x}" y1="${p.y}" x2="${e.x}" y2="${e.y}" stroke="#e74c3c" stroke-width="1.6"/>`;
    }
    const isQB = tag === 'QB';
    s += `<circle cx="${p.x}" cy="${p.y}" r="${isQB ? 4.2 : 3.6}" fill="${isQB ? '#ffd21f' : '#ffffff'}" stroke="#000" stroke-width="0.8"/>`;
  }
  if (play.type === 'pa' || play.drop === 'boot') {
    const qb = al.find((a) => a.tag === 'QB');
    const q = frameToSvg(qb.f, qb.l, w, h, flip);
    const bootSide = play.drop === 'boot' ? (play.side || 1) : 0;
    const e = frameToSvg(qb.f - 2.5, bootSide * 6, w, h, flip);
    s += `<polyline points="${q.x},${q.y} ${e.x},${e.y}" fill="none" stroke="#ffd21f" stroke-width="1.5" stroke-dasharray="3,2"/>`;
  }
  s += '</svg>';
  return s;
}

// Defensive diagram vs a reference 2x2 offensive set.
export function defenseSVG(play, w = 220, h = 150) {
  const dform = DEF_FORMATIONS[play.form];
  if (!dform) return '';
  const oform = OFF_FORMATIONS[dform.goalLine ? 'goal_line' : dform.dime ? 'gun_spread' : dform.nickel ? 'gun_doubles' : 'sb_doubles'];
  const oal = alignOffense(oform, MID_Y, 1, false);
  const offEnts = oal.map((a) => {
    const pos = a.slot.pos[0] === 'HB' ? 'RB' : a.slot.pos[0] === 'OT' || a.slot.pos[0] === 'OG' || a.slot.pos[0] === 'C' ? 'OL' : a.slot.pos[0];
    return { tag: a.tag, pos, eligible: ['WR', 'TE', 'RB', 'FB'].includes(pos), x: LOSX + a.f, y: MID_Y + a.l };
  });
  const defEnts = dform.slots.map((sl) => ({ tag: sl.tag, slot: sl, assign: parseAssign(play.assign[sl.tag]), pos: sl.pos[0] }));
  const nums = alignDefense(defEnts, offEnts, LOSX, MID_Y, 1, play.press);
  let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect width="${w}" height="${h}" fill="#0f2a3d"/>`;
  const los = frameToSvg(0, 0, w, h).y;
  s += `<line x1="0" y1="${los}" x2="${w}" y2="${los}" stroke="#4b8bff" stroke-width="1.5" stroke-opacity="0.8"/>`;
  // Zones first
  for (const d of defEnts) {
    const a = d.assign;
    const p = frameToSvg(d.alignF, d.alignL, w, h);
    if (a.t === 'zone') {
      const zs = zoneSpec(a.zone, nums.strong);
      const lm = zoneLandmark(zs, LOSX, MID_Y, 1);
      const fr = toFrame(LOSX, MID_Y, 1, lm.x, lm.y);
      const c = frameToSvg(Math.min(fr.f, 22), fr.l, w, h);
      const col = zs.deep ? '#3a7bff' : zs.base === 'flat' ? '#1ec8e8' : zs.base === 'curl' ? '#b15cff' : '#ffd21f';
      const sc = w / 44;
      s += `<ellipse cx="${c.x}" cy="${c.y}" rx="${zs.rx * 0.55 * sc}" ry="${Math.min(zs.rf, 9) * 0.55 * sc}" fill="${col}" fill-opacity="0.3" stroke="${col}" stroke-opacity="0.8"/>`;
      s += `<line x1="${p.x}" y1="${p.y}" x2="${c.x}" y2="${c.y}" stroke="${col}" stroke-width="1.2"/>`;
    } else if (a.t === 'man' && d.manTarget) {
      const t = offEnts.find((o) => o === d.manTarget);
      if (t) { const q = frameToSvg(t.x - LOSX, t.y - MID_Y, w, h); s += `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="#ff5252" stroke-width="1.2" stroke-dasharray="3,2"/>`; }
    } else if (a.t === 'blitz' || a.t === 'rush') {
      const q = frameToSvg(-3, d.alignL * 0.6, w, h);
      const col = a.t === 'blitz' ? '#ff3b30' : '#ff8a65';
      s += `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${col}" stroke-width="1.8"/>` + arrowHead(p.x, p.y, q.x, q.y, col);
    }
  }
  for (const o of offEnts) { const q = frameToSvg(o.x - LOSX, o.y - MID_Y, w, h); s += `<circle cx="${q.x}" cy="${q.y}" r="3" fill="none" stroke="#aaa" stroke-width="0.8"/>`; }
  for (const d of defEnts) {
    const p = frameToSvg(d.alignF, d.alignL, w, h);
    s += `<text x="${p.x}" y="${p.y + 3.5}" text-anchor="middle" font-size="11" font-weight="900" fill="#fff" stroke="#000" stroke-width="0.5">X</text>`;
  }
  s += '</svg>';
  return s;
}
