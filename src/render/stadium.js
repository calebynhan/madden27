// Stadium bowl, crowd, lights and sky.
import * as THREE from 'three';
import { FIELD_LENGTH, FIELD_WIDTH } from '../core/constants.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// Night sky: deep gradient with a scatter of stars.
function nightSkyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 512;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#01030a'); grd.addColorStop(0.55, '#070d22'); grd.addColorStop(0.85, '#18213a'); grd.addColorStop(1, '#2b3550');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 512);
  let s = 99;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 900; i++) {
    const y = Math.pow(r(), 1.6) * 330;
    g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.7})`;
    const z = r() < 0.06 ? 2 : 1;
    g.fillRect(r() * 1024, y, z, z);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function crowdTexture(home, away, seed = 7) {
  const W = 1024, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#1b1d22';
  g.fillRect(0, 0, W, H);
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const palette = [home.primary, home.primary, home.secondary, home.primary, '#d9d9d9', '#3a3a3a', '#8a6a4a', away.primary, '#c9b18a', '#222'];
  for (let row = 0; row < 32; row++) {
    for (let col = 0; col < 128; col++) {
      const x = col * 8 + (row % 2) * 4 + r() * 2;
      const y = row * 8 + r() * 2;
      g.fillStyle = palette[Math.floor(r() * palette.length)];
      g.fillRect(x, y + 2, 5, 6);
      g.fillStyle = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#ffdbac'][Math.floor(r() * 5)];
      g.fillRect(x + 1, y, 3, 3);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function skyTexture(night) {
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 256;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  if (night) { grd.addColorStop(0, '#02040b'); grd.addColorStop(0.6, '#0b1430'); grd.addColorStop(1, '#2a3550'); }
  else { grd.addColorStop(0, '#2a6fd1'); grd.addColorStop(0.65, '#8fbef0'); grd.addColorStop(1, '#dfeaf5'); }
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- crowd
// Atlas of generic fan silhouettes (16 variants), drawn twice: a color pass (skin, hair,
// hats baked in) and a shirt mask, so each fan can be tinted per instance (team colors,
// neutrals). Keeping the mask separate means distant fans, which sample small mip levels
// where shirt and skin blur together, still read as team colors instead of grey specks.
function fanAtlas() {
  const CW = 64, CH = 96;
  const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#6b3f1f', '#d9a066', '#a0663a'];
  const hairs = ['#2a1a10', '#4a3020', '#111111', '#b89060', '#6a4a30', '#222222'];
  const draw = (mask) => {
    const cv = document.createElement('canvas');
    cv.width = CW * 8; cv.height = CH * 2;
    const g = cv.getContext('2d');
    if (mask) { g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height); }
    let sd = 77;
    const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const SHIRT = '#ffffff';
    const other = (c) => (mask ? '#000000' : c);
    for (let k = 0; k < 16; k++) {
      const ox = (k % 8) * CW, oy = Math.floor(k / 8) * CH;
      const cx = ox + CW / 2;
      const armsUp = k >= 12;
      // Torso
      g.fillStyle = SHIRT;
      g.beginPath();
      g.moveTo(cx - 17, oy + CH);
      g.lineTo(cx - 19, oy + 50);
      g.quadraticCurveTo(cx - 18, oy + 40, cx - 8, oy + 38);
      g.lineTo(cx + 8, oy + 38);
      g.quadraticCurveTo(cx + 18, oy + 40, cx + 19, oy + 50);
      g.lineTo(cx + 17, oy + CH);
      g.closePath();
      g.fill();
      // Arms (raised fans cheer)
      g.lineCap = 'round';
      g.lineWidth = 8;
      g.strokeStyle = SHIRT;
      const skinK = skins[k % skins.length];
      if (armsUp) {
        g.beginPath(); g.moveTo(cx - 15, oy + 46); g.lineTo(cx - 22, oy + 22); g.lineTo(cx - 20, oy + 6); g.stroke();
        g.beginPath(); g.moveTo(cx + 15, oy + 46); g.lineTo(cx + 22, oy + 22); g.lineTo(cx + 20, oy + 6); g.stroke();
        g.fillStyle = other(skinK);
        g.beginPath(); g.arc(cx - 20, oy + 6, 4.5, 0, Math.PI * 2); g.arc(cx + 20, oy + 6, 4.5, 0, Math.PI * 2); g.fill();
      } else {
        g.beginPath(); g.moveTo(cx - 17, oy + 48); g.lineTo(cx - 19, oy + 74); g.stroke();
        g.beginPath(); g.moveTo(cx + 17, oy + 48); g.lineTo(cx + 19, oy + 74); g.stroke();
      }
      // Head
      const skin = skins[Math.floor(r() * skins.length)];
      g.fillStyle = other(skin);
      g.beginPath(); g.ellipse(cx, oy + 26, 10, 12, 0, 0, Math.PI * 2); g.fill();
      // Hair / cap (caps are shirt colored, so they take the tint) / beanie
      const style = k % 4;
      const hair = hairs[Math.floor(r() * hairs.length)];
      g.fillStyle = style === 1 ? SHIRT : other(hair);
      if (style === 0) { g.beginPath(); g.ellipse(cx, oy + 19, 10.5, 7, 0, Math.PI, 0); g.fill(); }
      else if (style === 1) { g.beginPath(); g.ellipse(cx, oy + 18, 11, 7, 0, Math.PI, 0); g.fill(); g.fillRect(cx - 2, oy + 17, 15, 3.5); }
      else if (style === 2) { g.beginPath(); g.ellipse(cx, oy + 17, 10.5, 9, 0, Math.PI, 0); g.fill(); }
      if (!mask) {
        // Shading: a soft darker band at the bottom (rows in front shadow the lower body)
        const sh = g.createLinearGradient(0, oy + 60, 0, oy + CH);
        sh.addColorStop(0, 'rgba(0,0,0,0)');
        sh.addColorStop(1, 'rgba(0,0,0,0.35)');
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = sh;
        g.fillRect(ox, oy + 60, CW, CH - 60);
        g.globalCompositeOperation = 'source-over';
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  const color = draw(false);
  color.colorSpace = THREE.SRGBColorSpace;
  // Premultiplied upload: mip levels then average only the visible pixels (no dark
  // fringes from the transparent background); the shader divides alpha back out.
  color.premultiplyAlpha = true;
  const mask = draw(true);
  return { color, mask, size: [CW * 8, CH * 2] };
}

// Billboard crowd shader. Edges use alpha-to-coverage (sharpened to a pixel and scaled up
// with the mip level) so the multisampled target smooths them instead of the stands
// shimmering; without multisampling (Low quality) it falls back to a plain cutout.
function crowdMaterial(atlas, night) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAtlas: { value: null }, uMask: { value: null }, uTexSize: { value: new THREE.Vector2(...atlas.size) }, uCut: { value: 0.02 }, uTime: { value: 0 }, uExcite: { value: 0.25 }, uBright: { value: night ? 0.62 : 0.95 } }]),
    vertexShader: `
      attribute float aVariant; attribute float aPhase; attribute vec3 aTint;
      uniform float uTime; uniform float uExcite;
      varying vec2 vUv; varying vec3 vTint; varying float vShade;
      #include <fog_pars_vertex>
      void main() {
        float v = aVariant;
        // Big moments: more fans throw their arms up
        if (uExcite > 0.55 && fract(aPhase * 3.7) < (uExcite - 0.5)) v = 12.0 + mod(v, 4.0);
        vUv = vec2((mod(v, 8.0) + uv.x) / 8.0, (floor(v / 8.0) + uv.y) / 2.0);
        vTint = aTint;
        vec3 p = position;
        float sp = 5.0 + fract(aPhase * 7.0) * 3.0;
        p.y += max(0.0, sin(uTime * sp + aPhase * 6.2831)) * (0.03 + uExcite * 0.3);
        p.x += sin(uTime * 1.3 + aPhase * 11.0) * 0.03;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vShade = 0.72 + 0.28 * fract(aPhase * 13.0);
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D uAtlas; uniform sampler2D uMask; uniform vec2 uTexSize; uniform float uCut; uniform float uBright;
      varying vec2 vUv; varying vec3 vTint; varying float vShade;
      #include <fog_pars_fragment>
      void main() {
        vec4 c = texture2D(uAtlas, vUv);
        vec2 tx = vUv * uTexSize;
        vec2 dx = dFdx(tx), dy = dFdy(tx);
        float mip = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
        float a = c.a * (1.0 + mip * 0.3);
        a = (a - 0.5) / max(fwidth(a), 1e-4) + 0.5;
        if (a < uCut) discard;
        float inv = 1.0 / max(c.a, 1e-3);
        vec3 col = c.rgb * inv;
        float shirt = clamp(texture2D(uMask, vUv).r * inv, 0.0, 1.0);
        col = mix(col, vTint * (0.55 + 0.45 * col.r), shirt);
        gl_FragColor = vec4(col * vShade * uBright, clamp(a, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
    alphaToCoverage: true,
  });
}

// Seats on the stand surfaces (team colored rows, grey aisles).
function seatTexture(color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#2a2d33';
  g.fillRect(0, 0, 256, 64);
  const c = new THREE.Color(color);
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k < 32; k++) {
      if (k % 16 === 15) continue; // aisle
      const sh = 0.75 + ((k * 37 + row * 11) % 10) / 40;
      g.fillStyle = `#${c.clone().multiplyScalar(sh).getHexString()}`;
      g.fillRect(k * 8 + 1, row * 16 + 3, 6, 9);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Scrolling LED ribbon board content (original league/team text only).
function ribbonTexture(home, away) {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 64;
  const g = cv.getContext('2d');
  const segs = [[home.primary, '#ffffff', `${home.city.toUpperCase()} ${home.name.toUpperCase()}`], ['#0b1020', '#ffcf1f', 'GRIDIRON 27'], [away.primary, '#ffffff', `${away.city.toUpperCase()} ${away.name.toUpperCase()}`], ['#0b1020', '#2fd5ff', 'PRO GRIDIRON LEAGUE']];
  const w = 2048 / segs.length;
  segs.forEach(([bg, fg, txt], i) => {
    g.fillStyle = bg; g.fillRect(i * w, 0, w, 64);
    g.fillStyle = fg; g.font = '900 38px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, i * w + w / 2, 34);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function suiteTexture(night) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 32;
  const g = cv.getContext('2d');
  g.fillStyle = '#1a1d22';
  g.fillRect(0, 0, 512, 32);
  let s = 5;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let k = 0; k < 32; k++) {
    const lit = night ? 0.55 + r() * 0.45 : 0.25 + r() * 0.2;
    g.fillStyle = night ? `rgba(255, ${200 + r() * 40}, ${140 + r() * 40}, ${lit})` : `rgba(150, 175, 200, ${lit})`;
    g.fillRect(k * 16 + 2, 6, 12, 20);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function buildStadium(scene, home, away, opts) {
  const group = new THREE.Group();
  const night = !!opts.night;
  const lite = !!opts.lite;
  // Sky: physically based daytime sky (atmospheric scattering), starry gradient at night.
  if (!night) {
    const sky = new Sky();
    sky.scale.setScalar(1400);
    const u = sky.material.uniforms;
    u.turbidity.value = 3.2;
    u.rayleigh.value = 1.1;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.86;
    u.sunPosition.value.set(-30, 70, 25).normalize();
    // The sun disk is extremely bright; clamp it so it can't overflow the HDR buffer
    // (an infinite pixel would smear into the bloom and black out the frame).
    sky.material.fragmentShader = sky.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( clamp( retColor, 0.0, 20.0 ), 1.0 );');
    sky.material.needsUpdate = true;
    group.add(sky);
  } else {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), new THREE.MeshBasicMaterial({ map: nightSkyTexture(), side: THREE.BackSide, fog: false }));
    group.add(sky);
  }
  void skyTexture;
  const concrete = new THREE.MeshStandardMaterial({ color: 0x5b6068, roughness: 0.95 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.7, metalness: 0.3 });
  const wallMat = new THREE.MeshStandardMaterial({ color: home.primary, roughness: 0.75 });
  const seatMat = new THREE.MeshStandardMaterial({ map: seatTexture(home.primary), roughness: 0.85 });
  const ribbonTex = ribbonTexture(home, away);
  const ribbonMat = new THREE.MeshBasicMaterial({ map: ribbonTex, color: night ? new THREE.Color(1.6, 1.6, 1.6) : new THREE.Color(1, 1, 1) });
  const suiteMat = new THREE.MeshBasicMaterial({ map: suiteTexture(night), color: night ? new THREE.Color(1.3, 1.3, 1.3) : new THREE.Color(1, 1, 1) });
  const ribbons = [ribbonTex];
  const L = FIELD_LENGTH + 24, Wd = FIELD_WIDTH + 24;
  const tiers = [{ d: 0, h: 2.6, depth: 22, rise: 11.5, rows: 18 }, { d: 25, h: 17, depth: 19, rise: 13, rows: 16 }];
  // Crowd instances
  const atlas = fanAtlas();
  const crowdMat = crowdMaterial(atlas, night);
  crowdMat.uniforms.uAtlas.value = atlas.color;
  crowdMat.uniforms.uMask.value = atlas.mask;
  const fanGeo = new THREE.PlaneGeometry(0.66, 1.0);
  fanGeo.translate(0, 0.5, 0);
  const fans = [];
  let sd = 123;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const tintChoices = [home.primary, home.primary, home.primary, home.secondary, home.secondary, '#f2f2f2', '#2a2a2a', '#7a8088', away.primary, '#b03030', '#2050a0'];
  const tints = tintChoices.map((c) => new THREE.Color(c));
  const spacing = lite ? 1.0 : 0.72;
  const addSide = (len, rotY, off) => {
    const holder = new THREE.Group();
    holder.rotation.y = rotY;
    for (const [ti, t] of tiers.entries()) {
      const slope = Math.atan2(t.rise, t.depth);
      const sl = Math.hypot(t.rise, t.depth);
      const width = len + (t.d + t.depth) * 2;
      // Seating surface
      const tex = seatMat.map.clone();
      tex.needsUpdate = true;
      tex.repeat.set(width / 11, t.rows / 4);
      const mat = seatMat.clone();
      mat.map = tex;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(width, sl), mat);
      m.rotation.x = -(Math.PI / 2 - slope);
      m.position.set(0, t.h + t.rise / 2, -(off + t.d + t.depth / 2));
      m.receiveShadow = true;
      holder.add(m);
      // Fans on the rows (some empty seats)
      for (let r = 0; r < t.rows; r++) {
        const f = (r + 0.55) / t.rows;
        const z = -(off + t.d + f * t.depth);
        const y = t.h + f * t.rise;
        const half = width / 2 - 1;
        for (let x = -half; x < half; x += spacing) {
          if (rnd() < 0.18) continue;
          fans.push({ holder, x: x + (rnd() - 0.5) * 0.18, y, z, v: Math.floor(rnd() * 12), ph: rnd(), tint: tints[Math.floor(rnd() * tints.length)], rotY });
        }
      }
      // Fascia with an LED ribbon at the front of each tier
      const fasciaY = ti === 0 ? 2.6 : t.h - 0.2;
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(width, ti === 0 ? 0.01 : 3.2, 0.8), concrete);
      if (ti === 1) { fascia.position.set(0, t.h - 1.8, -(off + t.d - 0.4)); holder.add(fascia); }
      const rib = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.1), ribbonMat);
      rib.position.set(0, fasciaY - 0.75, -(off + t.d - (ti === 0 ? 0 : 0.81)));
      holder.add(rib);
      // Suites band under the upper deck
      if (ti === 1) {
        const stex = suiteMat.map.clone();
        stex.needsUpdate = true;
        stex.repeat.set(width / 24, 1);
        const sm = suiteMat.clone();
        sm.map = stex;
        const suites = new THREE.Mesh(new THREE.PlaneGeometry(width, 3.6), sm);
        suites.position.set(0, tiers[0].h + tiers[0].rise + 1.8, -(off + tiers[0].d + tiers[0].depth + 0.6));
        holder.add(suites);
      }
      // Back wall
      const back = new THREE.Mesh(new THREE.BoxGeometry(width, 4, 1), concrete);
      back.position.set(0, t.h + t.rise + 2, -(off + t.d + t.depth + 0.5));
      holder.add(back);
    }
    // Roof canopy over the upper deck, with a light strip under its leading edge
    const top = tiers[1];
    const roofY = top.h + top.rise + 9;
    const roofW = len + (top.d + top.depth) * 2 + 6;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(roofW, 1.4, 16), darkSteel);
    roof.position.set(0, roofY, -(off + top.d + top.depth - 6));
    holder.add(roof);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(roofW, 0.9), night ? new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.88).multiplyScalar(3) }) : new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.5 }));
    strip.rotation.x = Math.PI / 2;
    strip.position.set(0, roofY - 0.72, -(off + top.d + top.depth - 13.5));
    holder.add(strip);
    // Padded wall at field level
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, 0.6), wallMat);
    wall.position.set(0, 0.8, -off + 0.3);
    wall.receiveShadow = true;
    holder.add(wall);
    group.add(holder);
  };
  addSide(L, 0, Wd / 2);
  addSide(L, Math.PI, Wd / 2);
  addSide(Wd, Math.PI / 2, L / 2);
  addSide(Wd, -Math.PI / 2, L / 2);
  // Build one instanced mesh for the whole crowd
  const count = fans.length;
  const crowd = new THREE.InstancedMesh(fanGeo, crowdMat, count);
  const aVariant = new Float32Array(count), aPhase = new Float32Array(count), aTint = new Float32Array(count * 3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
  fans.forEach((f, i) => {
    v.set(f.x, f.y, f.z).applyAxisAngle(yAxis, f.rotY);
    q.setFromAxisAngle(yAxis, f.rotY);
    const k = 0.92 + f.ph * 0.16;
    sc.set(k, k, k);
    m4.compose(v, q, sc);
    crowd.setMatrixAt(i, m4);
    aVariant[i] = f.v; aPhase[i] = f.ph;
    aTint[i * 3] = f.tint.r; aTint[i * 3 + 1] = f.tint.g; aTint[i * 3 + 2] = f.tint.b;
  });
  fanGeo.setAttribute('aVariant', new THREE.InstancedBufferAttribute(aVariant, 1));
  fanGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
  fanGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 3));
  crowd.frustumCulled = false;
  group.add(crowd);
  // Night: banks of lights along each roof edge (they bloom); day: plain fixtures
  const lampMat = night ? new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.98, 0.9).multiplyScalar(3.4) }) : new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.4, metalness: 0.3 });
  for (const sz of [-1, 1]) for (let i = -3; i <= 3; i++) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 0.6), lampMat);
    panel.position.set(i * 20, tiers[1].h + tiers[1].rise + 11.4, sz * (Wd / 2 + tiers[1].d + tiers[1].depth - 12));
    panel.lookAt(i * 20 * 0.6, 0, 0);
    group.add(panel);
  }
  // Video boards behind each end zone, showing the live score
  const boards = [];
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 360;
  const boardTex = new THREE.CanvasTexture(cv);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: boardTex, fog: false });
  for (const sx of [-1, 1]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 13, 36), new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.6 }));
    frame.position.set(sx * (L / 2 + 47), 52, 0);
    group.add(frame);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(34, 11.9), screenMat);
    screen.position.set(sx * (L / 2 + 47) - sx * 0.75, 52, 0);
    screen.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(screen);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 46, 8), new THREE.MeshStandardMaterial({ color: 0x2a2d33 }));
    post.position.set(sx * (L / 2 + 48), 23, 0);
    group.add(post);
  }
  boards.push({ canvas: cv, tex: boardTex });
  scene.add(group);
  return { group, crowd, crowdMat, ribbons, boards, crowdTex: [] };
}

// Draw the live scoreboard onto the video-board canvas.
export function paintBoard(board, game, flash) {
  const { canvas: cv, tex } = board;
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.fillStyle = '#05080f';
  g.fillRect(0, 0, W, H);
  if (flash) {
    g.fillStyle = flash.color || '#ffcf1f';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#05080f';
    g.font = '900 120px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(flash.text, W / 2, H / 2 + 6);
    tex.needsUpdate = true;
    return;
  }
  const A = game.teams[1].def, Hm = game.teams[0].def;
  const col = (x, t, score) => {
    g.fillStyle = t.primary;
    g.fillRect(x, 30, 380, 210);
    g.fillStyle = '#ffffff';
    g.font = '900 64px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t.abbr, x + 190, 80);
    g.font = '900 120px Impact, "Arial Black", sans-serif';
    g.fillText(String(score), x + 190, 180);
  };
  col(40, A, game.score[1]);
  col(W - 420, Hm, game.score[0]);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const q = game.quarter <= 4 ? `Q${game.quarter}` : 'OT';
  const m = Math.floor(Math.max(0, game.clock) / 60), sec = Math.floor(Math.max(0, game.clock) % 60);
  g.font = '700 46px Arial, sans-serif';
  g.fillText(q, W / 2, 70);
  g.font = '900 96px "Courier New", monospace';
  g.fillStyle = '#ffcf1f';
  g.fillText(`${m}:${sec < 10 ? '0' : ''}${sec}`, W / 2, 160);
  g.fillStyle = '#9fb3d1';
  g.font = '700 40px Arial, sans-serif';
  g.fillText(game.phase === 'kick_call' ? 'KICKOFF' : game.downText ? game.downText().toUpperCase() : '', W / 2, 300);
  // Possession arrow
  g.fillStyle = '#ffcf1f';
  const px = game.possession === 1 ? 230 : W - 230;
  g.beginPath(); g.moveTo(px - 16, 262); g.lineTo(px + 16, 262); g.lineTo(px, 284); g.closePath(); g.fill();
  tex.needsUpdate = true;
}
