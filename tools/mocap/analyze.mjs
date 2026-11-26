// Timeline of a CMU clip (per 0.1 s): a joint's speed and height, left hand, right foot and hips.
// Used to pick one-shot windows (throw release, kick contact). Usage: node tools/mocap/analyze.mjs <cmu-dir> <id> [joint]
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
const [dir, id, joint = 'RightHand'] = process.argv.slice(2);
const src = fs.readFileSync(path.join(dir, 'data', id.split('_')[0].padStart(3, '0'), id + '.bvh'), 'utf8');
const tok = src.split(/\s+/).filter(Boolean);
let i = 0; const joints = []; const stack = []; let cc = 0;
while (tok[i] !== 'MOTION') { const t = tok[i++];
  if (t === 'ROOT' || t === 'JOINT') { const j = { name: tok[i++], parent: stack.at(-1) || null, ch: [], ci: 0 }; joints.push(j); stack.push(j); }
  else if (t === 'End') { i++; const j = { name: stack.at(-1).name + '_end', parent: stack.at(-1), ch: [], ci: 0 }; joints.push(j); stack.push(j); }
  else if (t === 'OFFSET') { stack.at(-1).off = [+tok[i], +tok[i + 1], +tok[i + 2]]; i += 3; }
  else if (t === 'CHANNELS') { const n = +tok[i++]; const j = stack.at(-1); j.ci = cc; for (let k = 0; k < n; k++) j.ch.push(tok[i++]); cc += n; }
  else if (t === '}') stack.pop(); }
i += 2; const F = +tok[i++]; i += 2; const dt = +tok[i++];
const data = new Float32Array(F * cc); for (let k = 0; k < data.length; k++) data[k] = +tok[i++];
function fk(f) { const M = new Map(), P = {}; for (const j of joints) { const L = new THREE.Matrix4().makeTranslation(...j.off); if (j.ch.length) { const t = [0, 0, 0]; const R = new THREE.Matrix4(); const r = new THREE.Matrix4(); j.ch.forEach((c, k) => { const v = data[f * cc + j.ci + k]; if (c[1] === 'p') t['XYZ'.indexOf(c[0])] = v; else { const a = v * Math.PI / 180; c[0] === 'X' ? r.makeRotationX(a) : c[0] === 'Y' ? r.makeRotationY(a) : r.makeRotationZ(a); R.multiply(r); } }); if (j.ch.length === 6) L.makeTranslation(...t); L.multiply(R); } const W = j.parent ? M.get(j.parent).clone().multiply(L) : L; M.set(j, W); P[j.name] = new THREE.Vector3().setFromMatrixPosition(W); } return P; }
const step = Math.max(1, Math.round((+process.env.STEP || 0.1) / dt)); const T0 = +process.env.T0 || 0, T1 = +process.env.T1 || 1e9;
let prev = null;
const rows = [];
for (let f = Math.max(1, Math.round(T0 / dt)); f < Math.min(F, Math.round(T1 / dt)); f += step) { const P = fk(f); if (prev) { const sp = (n) => P[n].distanceTo(prev[n]) / (step * dt); rows.push(`${(f * dt).toFixed(1).padStart(5)}s  ${joint} sp ${sp(joint).toFixed(0).padStart(4)} h ${P[joint].y.toFixed(1).padStart(5)}  LHand sp ${sp('LeftHand').toFixed(0).padStart(4)}  RFoot sp ${sp('RightFoot').toFixed(0).padStart(4)} h ${P.RightFoot.y.toFixed(1)}  hips sp ${sp('Hips').toFixed(0).padStart(3)} h ${P.Hips.y.toFixed(1)}`); } prev = P; }
console.log(`${id}: ${F} frames, ${(F * dt).toFixed(1)} s`); console.log(rows.join('\n'));
