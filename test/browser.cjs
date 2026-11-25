// Browser smoke test: loads the single-file build, navigates menus, plays snaps.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
  const file = 'file://' + path.resolve('dist/Gridiron27.html');
  await page.goto(file);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test/out/01-menu.png' });
  await page.keyboard.press('Enter'); // Play Now
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test/out/02-teamselect.png' });
  await page.click('text=Kick Off');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test/out/03-game.png' });
  // Run several plays: handle whatever UI is up by pressing Enter/Space
  for (let i = 0; i < 40; i++) {
    const state = await page.evaluate(() => { const g = window.__app.game; return g ? { phase: g.phase, kick: g.sim && g.sim.kind, q: g.quarter, clock: Math.round(g.clock), score: g.score.join('-'), poss: g.possession, sim: g.sim && g.sim.phase } : null; });
    if (i % 5 === 0) console.log(JSON.stringify(state));
    if (!state) break;
    if (state.phase === 'playcall') { await page.keyboard.press('Enter'); await page.waitForTimeout(150); await page.keyboard.press('Enter'); }
    else if (state.phase === 'presnap') { await page.keyboard.press('Space'); await page.waitForTimeout(400); await page.keyboard.press('Space'); await page.waitForTimeout(300); await page.keyboard.press('Space'); }
    else if (state.phase === 'kick_call' || state.phase === 'pat_choice') await page.keyboard.press('Enter');
    else if (state.phase === 'live') { await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.press('Digit1'); await page.keyboard.up('KeyW'); }
    else if (state.phase === 'post') await page.keyboard.press('Space');
    await page.waitForTimeout(700);
    if (i === 6) await page.screenshot({ path: 'test/out/04-play.png' });
    if (i === 12) await page.screenshot({ path: 'test/out/05-play.png' });
  }
  await page.screenshot({ path: 'test/out/06-later.png' });
  console.log('ERRORS:', errors.length);
  for (const e of errors.slice(0, 25)) console.log(e);
  await browser.close();
})();
