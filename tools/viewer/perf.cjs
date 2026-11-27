// Frame-rate comparison at the broadcast camera: node tools/viewer/perf.cjs [page.html ...]
// For each build: starts a game at the line with Graphics on High (no auto-scaling), counts
// frames for a few seconds, and reports fps plus the visible triangles and draw calls of the
// scene's meshes. The software renderer is far slower than a laptop GPU, so compare builds with
// each other rather than reading the numbers as real frame rates.
const { chromium } = require('playwright');
const path = require('path');
const { startAtLine } = require('./startplay.cjs');
const SECONDS = 8;

async function measure(html) {
  // PERF_GPU=1 renders on this machine's GPU (ANGLE/Metal on a Mac) for realistic numbers
  const args = process.env.PERF_GPU === '1' ? ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({ args });
  // PERF_SCALE=2 renders at twice the pixel density (a stress test above the 60 fps cap)
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: +(process.env.PERF_SCALE || 1) });
  await page.goto('file://' + path.resolve(html));
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__app.renderer.setQuality('high'));
  await startAtLine(page);
  await page.waitForTimeout(1500);
  const out = await page.evaluate((secs) => new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
      n++;
      if (performance.now() - t0 < secs * 1000) requestAnimationFrame(tick);
      else {
        const R = window.__app.renderer;
        let tris = 0, calls = 0;
        R.scene.traverseVisible((o) => {
          if (!o.isMesh || !o.geometry) return;
          const g = o.geometry;
          const per = (g.index ? g.index.count : g.attributes.position.count) / 3;
          const inst = o.isInstancedMesh ? o.count : 1;
          tris += per * inst;
          calls += 1;
        });
        const gl = R.r.getContext();
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?';
        resolve({ fps: +(n / secs).toFixed(1), tris: Math.round(tris), meshes: calls, quality: R.quality, gpu });
      }
    };
    requestAnimationFrame(tick);
  }), SECONDS);
  await browser.close();
  return out;
}

(async () => {
  const pages = process.argv.slice(2);
  for (const html of pages.length ? pages : ['dist/Gridiron27.html']) console.log(html, JSON.stringify(await measure(html)));
})();
