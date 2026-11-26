// Model viewer for the Blender-built player: renders a GLB with game-like lighting from the
// front, side and back (used by tools/viewer/shoot.cjs to screenshot the asset as it's built).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const W = 1500, H = 900;
window.THREE = THREE;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setPixelRatio(1);
r.setSize(W, H);
r.toneMapping = THREE.ACESFilmicToneMapping;
r.toneMappingExposure = 0.95;
r.outputColorSpace = THREE.SRGBColorSpace;
r.shadowMap.enabled = true;
r.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.style.margin = '0';
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7f97b0);
const pm = new THREE.PMREMGenerator(r);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;
const sun = new THREE.DirectionalLight(0xfff1d8, 2.6);
sun.position.set(-3, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x2a4a22, 0.3));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x2e7034, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const cam = new THREE.PerspectiveCamera(26, W / H, 0.05, 100);

const COLORS = { jersey: 0x1d3f9e, pants: 0xe9e7df, socks: 0x1d3f9e, shoes: 0x111111, gloves: 0xf2f2f2, arms: 0x8d5524, skin: 0x8d5524, belt: 0x111111, helmet: 0x1d3f9e, mask: 0xd8d8d8, stripe: 0xf2c230, decal: 0xf2c230, eyes: 0x1a1110, visor: 0x222222 };
window.loadModel = (b64, opts = {}) => new Promise((resolve, reject) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  new GLTFLoader().parse(bin.buffer, '', (gltf) => {
    const info = { meshes: 0, tris: 0, materials: new Set(), skinned: 0, morphs: 0, colors: false };
    gltf.scene.traverse((o) => { if (o.isMesh) o.userData.matName = (o.material && o.material.name) || ''; });
    // Each variant: { yaw, heavy, lean, x }
    const variants = opts.variants || [{ yaw: 0, lean: 1 }, { yaw: 0 }, { yaw: 0, heavy: 1 }, { yaw: Math.PI / 2 }, { yaw: Math.PI }];
    variants.forEach((vr, i) => {
      const m = SkeletonUtils.clone(gltf.scene);
      m.rotation.y = vr.yaw || 0;
      m.position.x = vr.x ?? (i - (variants.length - 1) / 2) * 0.95;
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        const name = o.userData.matName;
        if (i === 0) {
          info.meshes++; info.tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
          info.materials.add(name); if (o.isSkinnedMesh) info.skinned++; if (o.geometry.morphAttributes.position) info.morphs = o.geometry.morphAttributes.position.length;
          if (o.geometry.attributes.color) info.colors = true;
        }
        if (o.morphTargetDictionary) {
          const d = o.morphTargetDictionary;
          if (d.heavy !== undefined) o.morphTargetInfluences[d.heavy] = vr.heavy || 0;
          if (d.lean !== undefined) o.morphTargetInfluences[d.lean] = vr.lean || 0;
        }
        if (name === 'visor') { o.visible = !!opts.visor; }
        if (opts.flat !== false) {
          const col = COLORS[name] ?? 0xbbbbbb;
          const phys = name === 'helmet' || name === 'stripe';
          const mat = phys ? new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06 })
            : new THREE.MeshStandardMaterial({ color: col, roughness: name === 'mask' ? 0.35 : name === 'pants' ? 0.55 : 0.75, metalness: name === 'mask' ? 0.6 : 0 });
          if (name === 'helmetpad') mat.color.set(0x222222);
          if (name === 'strap') mat.color.set(0xeeeeee);
          if (o.geometry.attributes.color && opts.ao !== false) mat.vertexColors = true;
          o.material = mat;
        }
      });
      if (vr.pose) vr.pose(m);
      scene.add(m);
    });
    const ht = opts.height || 2.1;
    cam.position.set(0, ht * 0.62, opts.dist || 4.6);
    cam.lookAt(0, ht * 0.5, 0);
    if (opts.cam) { cam.position.set(...opts.cam.pos); cam.lookAt(...opts.cam.look); }
    r.render(scene, cam);
    info.materials = [...info.materials];
    resolve(info);
  }, reject);
});
