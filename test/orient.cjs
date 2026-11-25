const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto('file://' + path.resolve('dist/Gridiron27.html'));
  await page.waitForTimeout(2000);
  for (const [name, px, lx] of [['east', 20, 58], ['west', -20, -58]]) {
    await page.evaluate(([px, lx]) => {
      const r = window.__app.renderer;
      document.getElementById('ui').style.display = 'none';
      r.updateCamera = function () { this.camera.position.set(px, 14, 0); this.camera.lookAt(lx, 0, 0); };
    }, [px, lx]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test/out/orient-${name}.png` });
  }
  await browser.close();
})();
