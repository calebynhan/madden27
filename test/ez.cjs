const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
  await page.goto('file://' + path.resolve('dist/Gridiron27.html'));
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300); await page.click('text=Kick Off'); await page.waitForTimeout(800);
  for (const [name, px, lx] of [['east', 40, 56], ['west', -40, -56]]) {
    await page.evaluate(([px, lx]) => { const r = window.__app.renderer; document.getElementById('ui').style.display = 'none'; r.updateCamera = function () { this.camera.position.set(px, 9, 0); this.camera.lookAt(lx, 0, 0); }; }, [px, lx]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test/out/ez-${name}.png` });
  }
  await browser.close();
})();
