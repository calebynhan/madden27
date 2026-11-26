// Screenshots of the defensive camera: pre-snap, and during the play (user on defense).
const { chromium } = require('playwright');
const path = require('path');
const tag = process.argv[2] || 'before';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve('dist/Gridiron27.html'));
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  // User = home team on defense: CPU away team receives
  await page.evaluate(() => { const a = window.__app; a.settings.graphics = 'low'; a.startGame({ home: 5, away: 12, humans: [a.input.keyboard, null], settings: { quarterLen: 5, difficulty: 1, accel: true } }); });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  // Jump straight to a CPU possession so the user is on defense.
  const setDefense = () => page.evaluate(() => { const g = window.__app.game; g.possession = 1; g.ballX = g.xFromYardLine(1, 30); g.ballY = 26.67; g.down = 1; g.firstDown(); g.setupScrimmage(); });
  await setDefense();
  let shots = 0;
  for (let i = 0; i < 900 && shots < 4; i++) {
    const s = await page.evaluate(() => { const a = window.__app, g = a.game; const sm = g.sim; return { phase: g.phase, poss: g.possession, kind: sm && sm.kind, t: sm ? sm.t : 0, pc: !!(a.ui.pcState[0] && !a.ui.pcState[0].done), popup: !!a.ui.popup, km: !!a.ui.km }; });
    if (s.popup) await page.keyboard.press('Enter');
    else if (s.phase === 'playcall' && s.pc) { await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); }
    else if (s.phase === 'presnap' && s.km) { await page.keyboard.press('Space'); await page.waitForTimeout(900); await page.keyboard.press('Space'); await page.waitForTimeout(500); await page.keyboard.press('Space'); }
    else if (s.phase === 'presnap' && s.kind === 'scrimmage' && s.poss === 1 && shots === 0) { await page.waitForTimeout(700); await page.screenshot({ path: `test/out/defcam-${tag}-0presnap.png` }); shots = 1; }
    else if (s.phase === 'live' && s.kind === 'scrimmage' && s.poss === 1 && shots >= 1 && shots < 4) {
      await page.waitForTimeout(shots === 1 ? 300 : 500);
      await page.screenshot({ path: `test/out/defcam-${tag}-${shots}live.png` }); shots++;
    } else if (s.phase === 'post') await page.keyboard.press('Space');
    await page.waitForTimeout(120);
  }
  console.log('shots', shots, 'errors', errors.length, errors.slice(0, 3));
  await browser.close();
})();
