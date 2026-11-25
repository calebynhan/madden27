const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto('file://' + path.resolve('dist/Gridiron27.html'));
  await page.waitForTimeout(1500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.click('text=Kick Off');
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(700);
    const info = await page.evaluate(() => { const a = window.__app; const c = a.renderer.camera; return { phase: a.game.phase, camDir: a.view.camDir, focus: a.renderer.camFocus, pos: c.position.toArray().map((v) => v.toFixed(1)), look: a.renderer.camLook.toArray().map((v) => v.toFixed(1)), sim: !!a.game.sim }; });
    console.log(JSON.stringify(info));
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => { const a = window.__app; const c = a.renderer.camera; return { phase: a.game.phase, kind: a.game.sim && a.game.sim.kind, camDir: a.view.camDir, pos: c.position.toArray().map((v) => v.toFixed(1)), look: a.renderer.camLook.toArray().map((v) => v.toFixed(1)) }; });
  console.log(JSON.stringify(info));
  await page.screenshot({ path: 'test/out/cam-kick.png' });
  await browser.close();
})();
