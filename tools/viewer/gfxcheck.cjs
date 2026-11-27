// In-game look check: day broadcast view, day and night close-ups of the line. Usage: node tools/viewer/gfxcheck.cjs <tag>
// Visual check: day broadcast view, day close-up of the line, night close-up.
const { chromium } = require('playwright');
const path = require('path');
const { startAtLine } = require('./startplay.cjs');
const tag = process.argv[2] || 'v6';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('file://' + path.resolve(process.env.HTML || 'dist/Gridiron27.html'));
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  for (const time of ['day', 'night']) {
    await page.evaluate(() => window.__app.renderer.setQuality('high'));
    await startAtLine(page, { time });
    await page.waitForTimeout(1500);
    if (time === 'day') await page.screenshot({ path: `test/out/${tag}-day-broadcast.png` });
    await page.evaluate(() => { const r = window.__app.renderer; const sim = window.__app.game.sim; const qb = sim.qb; r._uc = r._uc || r.updateCamera; r.updateCamera = function () { const X = qb.x - 60, Z = qb.y - 26.667; this.camera.position.set(X - sim.dir * 4.5, 2.4, Z + 3.2); this.camera.lookAt(X + sim.dir * 3, 1.0, Z); }; });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test/out/${tag}-${time}-closeup.png` });
    const info = await page.evaluate(() => { const r = window.__app.renderer; return { q: r.quality, post: !!r.post, calls: r.r.info.render.calls, tris: r.r.info.render.triangles, fans: r.stadium && r.stadium.crowd ? r.stadium.crowd.count : null }; });
    console.log(time, JSON.stringify(info));
    await page.evaluate(() => { const r = window.__app.renderer; if (r._uc) r.updateCamera = r._uc; });
  }
  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 10)) console.log(e);
  await browser.close();
})();
