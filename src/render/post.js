// Broadcast look: image-based lighting from a procedural stadium environment, and an
// anti-aliased HDR post chain (bloom -> tone mapping -> color grade with vignette).
// Everything is generated in code; it runs on the player's own GPU in the browser.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Display-space grade: gentle contrast curve, saturation, warmth and a soft vignette.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.07 },
    saturation: { value: 1.1 },
    vignette: { value: 0.24 },
    warmth: { value: 0.012 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float contrast; uniform float saturation; uniform float vignette; uniform float warmth;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      col = (col - 0.5) * contrast + 0.5;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col += vec3(warmth, warmth * 0.35, -warmth);
      vec2 d = (vUv - 0.5) * vec2(1.12, 1.0);
      col *= mix(1.0 - vignette, 1.0, smoothstep(0.8, 0.22, length(d)));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export function createPost(renderer, scene, camera, quality, night) {
  if (quality === 'low') return null;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const samples = quality === 'high' ? 4 : 2;
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), night ? 0.5 : 0.12, 0.5, night ? 0.85 : 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  if (night) { grade.uniforms.warmth.value = 0.004; grade.uniforms.vignette.value = 0.3; }
  composer.addPass(grade);
  return { composer, bloom, grade };
}

// A stadium "light probe": sky, bowl, turf and bright light banks rendered into a
// pre-filtered environment map. It gives helmets real reflections and fills the
// shadows with believable bounce light.
export function buildEnvironment(renderer, night) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(night ? 0x03060f : 0x2f6fcf) },
      horizon: { value: new THREE.Color(night ? 0x141b2e : 0xd5e6f6) },
      bottom: { value: new THREE.Color(night ? 0x07080b : 0x31402f) },
    },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
      void main() { float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.35)); gl_FragColor = vec4(c, 1.0); }`,
  });
  env.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(62, 46, 24, 48, 1, true), new THREE.MeshBasicMaterial({ color: night ? 0x111318 : 0x40454e, side: THREE.BackSide }));
  bowl.position.y = 7;
  env.add(bowl);
  const turf = new THREE.Mesh(new THREE.CircleGeometry(46, 48), new THREE.MeshBasicMaterial({ color: night ? 0x1d4a22 : 0x2e7034 }));
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = -4;
  env.add(turf);
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.9).multiplyScalar(night ? 16 : 4) });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(18, 5), lamp);
    p.position.set(Math.cos(a) * 56, 30, Math.sin(a) * 56);
    p.lookAt(0, 0, 0);
    env.add(p);
  }
  if (!night) {
    const sun = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.85).multiplyScalar(40) }));
    sun.position.set(-55, 75, 30);
    env.add(sun);
  }
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  env.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return tex;
}

// Soft contact shadow under each player (grounds them even when shadow maps are off).
export function makeBlobShadows(scene, max = 64) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grd.addColorStop(0, 'rgba(0,0,0,0.62)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.34)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(geo, mat, max);
  im.renderOrder = 1;
  im.frustumCulled = false;
  im.count = 0;
  scene.add(im);
  return im;
}
