// Season, practice and two-minute drill smoke tests in the browser.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('file://' + path.resolve('dist/Gridiron27.html'));
  await page.waitForTimeout(1200);
  // Season
  await page.click('text=Season');
  await page.waitForTimeout(300);
  await page.click('text=New Season');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test/out/season-pick.png' });
  await page.click('#sg');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test/out/season-hub.png' });
  await page.click('#sim'); await page.waitForTimeout(300);
  for (const tab of ['Schedule', 'Standings', 'Leaders', 'Roster']) { await page.click(`.tabs >> text=${tab}`); await page.waitForTimeout(200); }
  await page.screenshot({ path: 'test/out/season-roster.png' });
  await page.click('.tabs >> text=Home'); await page.waitForTimeout(200);
  await page.click('#play'); await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test/out/season-game.png' });
  const sg = await page.evaluate(() => { const g = window.__app.game; return g && { phase: g.phase, season: !!g.seasonGame, teams: g.teams.map((t) => t.def.abbr) }; });
  console.log('season game', JSON.stringify(sg));
  // Simulate to the end quickly via the engine and check the hand-off back to the hub
  await page.evaluate(() => { const g = window.__app.game; g.headless = true; for (const t of [0, 1]) g.controllers[t] = null; window.__app.humans = [null, null]; });
  await page.evaluate(() => { const g = window.__app.game; g.simulateToEnd(); });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: 'test/out/season-final.png' });
  await page.click('text=Continue Season');
  await page.waitForTimeout(500);
  const hub = await page.evaluate(() => document.querySelector('.season-top')?.textContent.slice(0, 120));
  console.log('hub after game:', hub);
  await page.click('.tabs >> text=Save & Exit');
  await page.waitForTimeout(400);
  // Practice
  await page.click('text=Practice'); await page.waitForTimeout(300);
  await page.click('text=Start Practice'); await page.waitForTimeout(1500);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  await page.screenshot({ path: 'test/out/practice.png' });
  const pr = await page.evaluate(() => { const g = window.__app.game; return { phase: g.phase, down: g.down, practice: !!g.settings.practice }; });
  console.log('practice', JSON.stringify(pr));
  await page.keyboard.press('Space'); await page.waitForTimeout(4000);
  const pr2 = await page.evaluate(() => { const g = window.__app.game; return { phase: g.phase, down: g.down, yl: Math.round(g.yardLineOf(g.possession, g.ballX)) }; });
  console.log('practice after snap', JSON.stringify(pr2));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'test/out/pause.png' });
  await page.click('text=Quit to Main Menu'); await page.waitForTimeout(500);
  // Two-minute drill
  await page.click('text=Two-Minute Drill'); await page.waitForTimeout(300);
  await page.click('text=Kick Off'); await page.waitForTimeout(1500);
  const dr = await page.evaluate(() => { const g = window.__app.game; return { q: g.quarter, clock: g.clock, score: g.score, poss: g.possession, phase: g.phase, tos: g.timeouts }; });
  console.log('drill', JSON.stringify(dr));
  await page.screenshot({ path: 'test/out/drill-playcall.png' });
  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 20)) console.log(e);
  await browser.close();
})();
