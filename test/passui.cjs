// Screenshot: user on offense, pass play, receiver icons with the pass assist; then the ball in the air.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve('dist/Gridiron27.html'));
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await page.evaluate(() => { const a = window.__app; a.settings.graphics = 'low'; a.startGame({ home: 5, away: 12, humans: [a.input.keyboard, null], settings: { quarterLen: 5, difficulty: 1, accel: true } }); });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const g = window.__app.game; g.possession = 0; g.ballX = g.xFromYardLine(0, 30); g.ballY = 26.67; g.down = 1; g.firstDown(); g.setupScrimmage(); });
  let done = 0;
  for (let i = 0; i < 300 && done < 2; i++) {
    const s = await page.evaluate(() => { const a = window.__app, g = a.game, sm = g.sim; return { phase: g.phase, pc: !!(a.ui.pcState[0] && !a.ui.pcState[0].done), kind: sm && sm.kind, qbBall: sm && sm.qb && sm.qb.hasBall, thrown: sm && sm.thrown, popup: !!a.ui.popup }; });
    if (s.popup) await page.keyboard.press('Enter');
    else if (s.phase === 'playcall' && s.pc) {
      await page.evaluate(() => { const a = window.__app, st = a.ui.pcState[0]; for (let fi = 0; fi < st.forms.length; fi++) { const pi = st.forms[fi].plays.findIndex((p) => p.type === 'pass' && !(p.tags || []).includes('screen') && (p.drop === 'm' || p.drop === 'd')); if (pi >= 0) { st.fi = fi; st.pi = pi; st.focus = 'plays'; break; } } a.ui.renderPlaycall(); });
      await page.keyboard.press('Enter');
    } else if (s.phase === 'presnap' && s.kind === 'scrimmage') { await page.keyboard.press('Space'); await page.waitForTimeout(1500); await page.screenshot({ path: 'test/out/passui-icons.png' }); done = 1;
      await page.keyboard.down('Digit1'); await page.waitForTimeout(320); await page.keyboard.up('Digit1'); await page.waitForTimeout(350); await page.screenshot({ path: 'test/out/passui-air.png' }); done = 2; }
    await page.waitForTimeout(150);
  }
  console.log('done', done, 'errors', errors.length, errors.slice(0, 3));
  await browser.close();
})();
