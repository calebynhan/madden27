// Close-up renders of player models in different states.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve('dist/Gridiron27.html'));
  await page.waitForTimeout(1000);
  await page.click('text=Practice'); await page.waitForTimeout(300);
  await page.click('text=Start Practice'); await page.waitForTimeout(1200);
  // pick first play (Inside Zone etc.)
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const shot = async (name, sel) => {
    await page.evaluate((sel) => {
      const a = window.__app, r = a.renderer, sim = a.game.sim;
      document.getElementById('ui').style.visibility = 'hidden';
      const e = sel === 'qb' ? sim.qb : sel === 'ol' ? sim.off.find((o) => o.tag === 'C') : sel === 'wr' ? sim.off.find((o) => o.tag === 'X') : sim.def.find((d) => d.pos === 'DL');
      r.updateCamera = function () {
        const x = e.x - 60, z = e.y - 26.667;
        const fx = Math.cos(e.face), fz = Math.sin(e.face);
        this.camera.position.set(x + fx * 3.2 + fz * 1.6, 1.9, z + fz * 3.2 - fx * 1.6);
        this.camera.lookAt(x, 1.05, z);
      };
    }, sel);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test/out/model-${name}.png` });
  };
  await shot('qb-presnap', 'qb');
  await shot('ol-stance', 'ol');
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  await shot('qb-drop', 'qb');
  await page.keyboard.down('Digit1'); await page.waitForTimeout(80); await page.keyboard.up('Digit1');
  await page.waitForTimeout(120);
  await shot('qb-throw', 'qb');
  await page.waitForTimeout(400);
  await shot('wr-run', 'wr');
  await shot('dl', 'dl');
  console.log('errors', errors.length, errors.slice(0, 3));
  await browser.close();
})();
