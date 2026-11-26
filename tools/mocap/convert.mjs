// Motion capture -> Gridiron 27 pose clips.
//
// Reads BVH files from the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu; the
// 2010 BVH conversion by B. Hahne) and retargets them onto the game's player rig, which is
// driven by 21 pose channels (see src/render/player.js). Retargeting matches directions, so
// it works across different body proportions:
//   - forward kinematics gives world joint positions for every frame;
//   - the actor's heading is removed (motion expressed in the player's own frame);
//   - torso lean/turn/twist come from the spine and shoulder line, hip/shoulder swing and
//     spread from the thigh/upper-arm directions, knee/elbow bend from the lower segments
//     (measured in their parent's frame), head tilt from the neck;
//   - hip height follows the actor's pelvis, raised when needed so a foot never sinks.
// Looping clips (runs, backpedal, shuffle) are cut to one clean gait cycle and cross-faded
// so they repeat seamlessly; one-shot clips keep a chosen window.
//
// Usage: node tools/mocap/convert.mjs <cmu-bvh-dir> [out=src/data/mocap.json]
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const SRC = process.argv[2];
const OUT = process.argv[3] || 'src/data/mocap.json';
if (!SRC) { console.error('usage: node tools/mocap/convert.mjs <cmu-bvh-dir> [out]'); process.exit(1); }

// Pose channel layout (must match src/render/player.js)
const HIPY = 0, LEAN = 1, TWIST = 2, TURN = 3, HEAD = 4;
const L0X = 5, L0K = 6, L0Z = 7, L1X = 8, L1K = 9, L1Z = 10;
const A0X = 11, A0Z = 12, A0E = 13, A1X = 14, A1Z = 15, A1E = 16;
const N = 21;
// Game rig lengths (yards)
const THIGH = 0.46, SHIN = 0.43, ANKLE = 0.035, HIP_DROP = 0.08;

// ---------------------------------------------------------------- BVH
function parseBVH(text) {
  const tok = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const joints = [];
  const stack = [];
  let channelCount = 0;
  while (tok[i] !== 'MOTION') {
    const t = tok[i++];
    if (t === 'ROOT' || t === 'JOINT') {
      const j = { name: tok[i++], parent: stack.length ? stack[stack.length - 1] : null, offset: null, channels: [], chIndex: 0, end: false };
      joints.push(j);
      stack.push(j);
    } else if (t === 'End') {
      i++; // "Site"
      const j = { name: stack[stack.length - 1].name + '_end', parent: stack[stack.length - 1], offset: null, channels: [], chIndex: 0, end: true };
      joints.push(j);
      stack.push(j);
    } else if (t === 'OFFSET') {
      stack[stack.length - 1].offset = new THREE.Vector3(+tok[i], +tok[i + 1], +tok[i + 2]);
      i += 3;
    } else if (t === 'CHANNELS') {
      const n = +tok[i++];
      const j = stack[stack.length - 1];
      j.chIndex = channelCount;
      for (let k = 0; k < n; k++) j.channels.push(tok[i++]);
      channelCount += n;
    } else if (t === '}') {
      stack.pop();
    }
  }
  i++; // MOTION
  i++; // Frames:
  const frames = +tok[i++];
  i += 2; // Frame Time:
  const dt = +tok[i++];
  const data = new Float32Array(frames * channelCount);
  for (let k = 0; k < data.length; k++) data[k] = +tok[i++];
  return { joints, frames, dt, channelCount, data };
}

// World positions of every joint for one frame
function fk(bvh, f) {
  const pos = new Map();
  const mats = new Map();
  const base = f * bvh.channelCount;
  const q = new THREE.Quaternion(), m = new THREE.Matrix4(), r = new THREE.Matrix4();
  for (const j of bvh.joints) {
    const local = new THREE.Matrix4().makeTranslation(j.offset.x, j.offset.y, j.offset.z);
    if (j.channels.length) {
      const t = new THREE.Vector3();
      const rot = new THREE.Matrix4();
      j.channels.forEach((ch, k) => {
        const v = bvh.data[base + j.chIndex + k];
        if (ch === 'Xposition') t.x = v; else if (ch === 'Yposition') t.y = v; else if (ch === 'Zposition') t.z = v;
        else {
          const a = THREE.MathUtils.degToRad(v);
          if (ch === 'Xrotation') r.makeRotationX(a); else if (ch === 'Yrotation') r.makeRotationY(a); else r.makeRotationZ(a);
          rot.multiply(r);
        }
      });
      if (j.channels.some((c) => c.endsWith('position'))) local.makeTranslation(t.x, t.y, t.z);
      local.multiply(rot);
    }
    const world = j.parent ? mats.get(j.parent).clone().multiply(local) : local;
    mats.set(j, world);
    pos.set(j.name, new THREE.Vector3().setFromMatrixPosition(world));
  }
  void q; void m;
  return pos;
}

// ---------------------------------------------------------------- retarget
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function limbAngles(d) {
  // rest direction (0,-1,0); rotation Rx(X)*Rz(Z) maps it to d
  return [Math.atan2(-d.z, -d.y), Math.asin(clamp(d.x, -1, 1))];
}
function bend(parentRot, d) {
  // 1-DOF hinge about the parent's local X axis
  const l = d.clone().applyMatrix4(parentRot.clone().transpose());
  return Math.atan2(-l.z, -l.y);
}
const rotXZ = (x, z) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, 0, z, 'XYZ'));

function headingOf(P) {
  const L = P.get('LeftUpLeg').clone().sub(P.get('RightUpLeg'));
  L.y = 0;
  const fwd = new THREE.Vector3().crossVectors(L, new THREE.Vector3(0, 1, 0)).normalize();
  return Math.atan2(fwd.x, fwd.z);
}

function unwrap(a) {
  const out = a.slice();
  for (let i = 1; i < out.length; i++) {
    let d = out[i] - out[i - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    out[i] = out[i - 1] + d;
  }
  return out;
}

function smooth(a, w) {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    let s = 0, n = 0;
    for (let k = Math.max(0, i - w); k <= Math.min(a.length - 1, i + w); k++) { s += a[k]; n++; }
    out[i] = s / n;
  }
  return out;
}

function retargetClip(bvh, opts = {}) {
  const P = [];
  for (let f = 1; f < bvh.frames; f++) P.push(fk(bvh, f)); // frame 0 is the added T-pose
  const tpose = fk(bvh, 0);
  // Scale: actor leg length (hip joint to sole) -> ours
  const hipY0 = (tpose.get('LeftUpLeg').y + tpose.get('RightUpLeg').y) / 2;
  const sole0 = Math.min(tpose.get('LeftToeBase').y, tpose.get('RightToeBase').y, tpose.get('LeftFoot').y, tpose.get('RightFoot').y);
  const s = (THIGH + SHIN + ANKLE) / (hipY0 - sole0);
  // Ground level over the clip (lowest foot point)
  let ground = Infinity;
  for (const p of P) ground = Math.min(ground, p.get('LeftToeBase').y, p.get('RightToeBase').y, p.get('LeftFoot').y - 0.5, p.get('RightFoot').y - 0.5);
  const hd = unwrap(P.map(headingOf));
  const heading = smooth(hd, Math.round((opts.headingWindow ?? 0.35) / bvh.dt));
  const up = new THREE.Vector3(0, 1, 0);
  const frames = [];
  const root = [];
  for (let f = 0; f < P.length; f++) {
    const p = P[f];
    const h = opts.fixedHeading !== undefined ? opts.fixedHeading : heading[f];
    const rot = new THREE.Matrix4().makeRotationY(-h);
    const hip = p.get('Hips');
    const C = (name) => p.get(name).clone().sub(new THREE.Vector3(hip.x, 0, hip.z)).applyMatrix4(rot);
    const dir = (a, b) => C(b).sub(C(a)).normalize();
    const v = new Array(N).fill(0);
    // Torso frame: up along the spine, left along the shoulder line
    const tUp = dir('Hips', 'Neck');
    let tLeft = C('LeftArm').sub(C('RightArm'));
    tLeft.sub(tUp.clone().multiplyScalar(tLeft.dot(tUp))).normalize();
    const tFwd = new THREE.Vector3().crossVectors(tLeft, tUp).normalize();
    const R = new THREE.Matrix4().makeBasis(tLeft, tUp, tFwd);
    const e = new THREE.Euler().setFromRotationMatrix(R, 'XYZ');
    v[LEAN] = e.x; v[TURN] = e.y; v[TWIST] = e.z;
    // Head (in the torso frame)
    const hl = dir('Neck1', 'Head').applyMatrix4(R.clone().transpose());
    v[HEAD] = Math.atan2(hl.z, hl.y) - 0.12;
    // Legs (in the player frame; the rig's hips don't rotate)
    let reach = 0;
    for (const [side, iX, iK, iZ] of [['Right', L0X, L0K, L0Z], ['Left', L1X, L1K, L1Z]]) {
      const dT = dir(side + 'UpLeg', side + 'Leg');
      const dS = dir(side + 'Leg', side + 'Foot');
      const [X, Z] = limbAngles(dT);
      v[iX] = X; v[iZ] = Z;
      v[iK] = bend(rotXZ(X, Z), dS);
      reach = Math.max(reach, THIGH * -dT.y + SHIN * -dS.y + ANKLE);
    }
    // Arms (in the torso frame)
    for (const [side, iX, iZ, iE] of [['Right', A0X, A0Z, A0E], ['Left', A1X, A1Z, A1E]]) {
      const Rt = R.clone().transpose();
      const dU = dir(side + 'Arm', side + 'ForeArm').applyMatrix4(Rt);
      const dF = dir(side + 'ForeArm', side + 'Hand').applyMatrix4(Rt);
      const [X, Z] = limbAngles(dU);
      v[iX] = X; v[iZ] = Z;
      v[iE] = bend(rotXZ(X, Z), dF);
    }
    // Hip height: the actor's (scaled), but never so low a foot would sink into the turf
    const hipJ = (C('LeftUpLeg').y + C('RightUpLeg').y) / 2;
    const actor = (hipJ - ground) * s;
    v[HIPY] = Math.max(actor, reach) + HIP_DROP;
    frames.push(v);
    root.push({ x: hip.x * s, z: hip.z * s, h });
  }
  return { frames, root, dt: bvh.dt, scale: s };
}

// One gait cycle between consecutive forward swings of the right thigh, cross-faded to loop.
function extractCycle(clip, { near = 0.5, minT = 0.35, maxT = 1.6, samples = 32, blend = 0.18, pick = 0, signal = 'swing' } = {}) {
  const { frames, dt } = clip;
  // Gait signal: forward swing of the right thigh, or its sideways spread for lateral slides
  const sw = smooth(frames.map((v) => (signal === 'spread' ? -v[L0Z] : -v[L0X])), 3);
  const peaks = [];
  for (let i = 2; i < sw.length - 2; i++) if (sw[i] > sw[i - 1] && sw[i] >= sw[i + 1] && sw[i] > sw[i - 2] && sw[i] >= sw[i + 2]) peaks.push(i);
  const cycles = [];
  for (let k = 0; k + 1 < peaks.length; k++) {
    const T = (peaks[k + 1] - peaks[k]) * dt;
    if (T >= minT && T <= maxT) cycles.push([peaks[k], peaks[k + 1]]);
  }
  if (!cycles.length) throw new Error('no gait cycle found');
  const mid = near * frames.length;
  cycles.sort((a, b) => Math.abs((a[0] + a[1]) / 2 - mid) - Math.abs((b[0] + b[1]) / 2 - mid));
  const [a, b] = cycles[Math.min(pick, cycles.length - 1)];
  const len = b - a;
  const lerpFrame = (t) => {
    const i = Math.floor(t), u = t - i;
    const f0 = frames[clamp(i, 0, frames.length - 1)], f1 = frames[clamp(i + 1, 0, frames.length - 1)];
    return f0.map((x, k) => x + (f1[k] - x) * u);
  };
  const out = [];
  for (let k = 0; k < samples; k++) {
    const t = a + (len * k) / samples;
    let v = lerpFrame(t);
    // Cross-fade the end of the cycle into the frames just before its start (seamless loop)
    const u = k / samples;
    if (u > 1 - blend) {
      const w = (u - (1 - blend)) / blend;
      const pre = lerpFrame(t - len);
      const ww = w * w * (3 - 2 * w);
      v = v.map((x, i) => x + (pre[i] - x) * ww * 0.5);
    }
    out.push(v);
  }
  // Ensure the last frame flows into the first
  const T = len * dt;
  const r0 = clip.root[a], r1 = clip.root[b];
  const speed = Math.hypot(r1.x - r0.x, r1.z - r0.z) / T;
  return { loop: true, period: +T.toFixed(3), speed: +speed.toFixed(2), frames: out, cycles: cycles.length };
}

function window(clip, t0, t1, samples) {
  const { frames, dt } = clip;
  const a = Math.max(0, Math.round(t0 / dt)), b = Math.min(frames.length - 1, Math.round(t1 / dt));
  const out = [];
  const n = samples || Math.max(2, Math.round((b - a) * dt * 30));
  for (let k = 0; k < n; k++) {
    const t = a + ((b - a) * k) / (n - 1);
    const i = Math.floor(t), u = t - i;
    const f0 = frames[i], f1 = frames[Math.min(i + 1, frames.length - 1)];
    out.push(f0.map((x, j) => x + (f1[j] - x) * u));
  }
  return { loop: false, duration: +((b - a) * dt).toFixed(3), frames: out };
}

// A stretch of a clip made to loop (idle sway): the tail cross-fades into the frames before t0.
function loopWindow(clip, t0, t1, samples = 48, blend = 0.3) {
  const { frames, dt } = clip;
  const a = Math.round(t0 / dt), b = Math.round(t1 / dt);
  const len = b - a;
  const at = (t) => { const i = clamp(Math.floor(t), 0, frames.length - 2), u = t - Math.floor(t); return frames[i].map((x, k) => x + (frames[i + 1][k] - x) * u); };
  const out = [];
  for (let k = 0; k < samples; k++) {
    const t = a + (len * k) / samples;
    let v = at(t);
    const u = k / samples;
    if (u > 1 - blend) {
      const w = (u - (1 - blend)) / blend, ww = w * w * (3 - 2 * w);
      const pre = at(t - len);
      v = v.map((x, i) => x + (pre[i] - x) * ww);
    }
    out.push(v);
  }
  return { loop: true, period: +(len * dt).toFixed(3), speed: 0, frames: out };
}

const load = (id) => {
  const subj = id.split('_')[0].padStart(3, '0');
  return parseBVH(fs.readFileSync(path.join(SRC, 'data', subj, id + '.bvh'), 'utf8'));
};
const round = (c) => ({ ...c, frames: c.frames.map((v) => v.map((x) => +x.toFixed(3))) });

// ---------------------------------------------------------------- clips
const SPEC = JSON.parse(fs.readFileSync(new URL('./clips.json', import.meta.url), 'utf8'));
const out = { credit: 'Motion capture: CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), BVH conversion by B. Hahne; retargeted for Gridiron 27.', channels: N, clips: {} };
for (const [name, spec] of Object.entries(SPEC)) {
  try {
    const bvh = load(spec.src);
    const clip = retargetClip(bvh, spec);
    let res;
    if (spec.type === 'cycle') res = extractCycle(clip, spec);
    else if (spec.type === 'loop') res = loopWindow(clip, spec.t0, spec.t1, spec.samples, spec.blend);
    else res = window(clip, spec.t0, spec.t1, spec.samples);
    out.clips[name] = round(res);
    const info = res.loop ? `cycle ${res.period}s speed ${res.speed} yd/s (${res.cycles} found)` : `window ${res.duration}s`;
    console.log(`${name.padEnd(12)} ${spec.src.padEnd(8)} ${res.frames.length} frames  ${info}  scale ${clip.scale.toFixed(4)}`);
  } catch (e) {
    console.error(`${name}: ${e.message}`);
  }
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
