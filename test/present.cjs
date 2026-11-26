const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve('dist/Gridiron27.html'));
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.click('text=Kick Off');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 'test/out/intro-1.png' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test/out/intro-2.png' });
  await page.waitForTimeout(2000);
  // Advance to a scrimmage play quickly, user is home team
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => { const a = window.__app, g = a.game; return { phase: g.phase, kind: g.sim && g.sim.kind, poss: g.possession, popup: !!a.ui.popup, km: !!a.ui.km, intro: !!a.intro }; });
    if (s.intro) { await page.keyboard.press('Space'); continue; }
    if (s.phase === 'presnap' && s.kind === 'scrimmage') break;
    if (s.popup) await page.keyboard.press('Enter');
    else if (s.km) { await page.keyboard.press('Space'); await page.waitForTimeout(1000); await page.keyboard.press('Space'); await page.waitForTimeout(560); await page.keyboard.press('Space'); }
    else if (s.phase === 'playcall') { await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); }
    else if (s.phase === 'post') await page.keyboard.press('Space');
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => { document.getElementById('ui').style.visibility = 'hidden'; const r = window.__app.renderer; const sim = window.__app.game.sim; r.updateCamera = function () { this.camera.position.set(sim.losX - 60 - 8, 9, 26.67 + 22); this.camera.lookAt(sim.losX - 60 + 2, 0, 26.67 - 2); }; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test/out/chains.png' });
  await page.evaluate(() => { const r = window.__app.renderer; r.updateCamera = function () { this.camera.position.set(-20, 20, 0); this.camera.lookAt(80, 34, 0); }; });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test/out/board.png' });
  console.log('errors', errors.length, errors.slice(0, 3));
  await browser.close();
})();
