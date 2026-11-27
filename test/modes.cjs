// Season, practice and two-minute drill smoke tests in the browser. Every step waits on the
// page or the game (see browser_game.cjs): a software renderer runs the game far below real time.
const { openGame, settle, until } = require('./browser_game.cjs');

const gameState = (page) => page.evaluate(() => {
  const g = window.__app.game;
  return g && { phase: g.phase, down: g.down, practice: !!g.settings.practice, simPhase: g.sim && g.sim.phase };
});

// From the play-call screen to the line: press Enter until a play is called.
async function callPlay(page) {
  await until(page, () => { const g = window.__app.game; return g && g.phase === 'playcall'; });
  await settle(page);
  for (let i = 0; i < 20; i++) {
    const s = await gameState(page);
    if (s && s.phase !== 'playcall') return;
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
  await until(page, () => window.__app.game.phase !== 'playcall');
}

(async () => {
  const { browser, page, errors } = await openGame();
  // Season
  await page.click('text=Season');
  await page.click('text=New Season');
  await page.locator('#sg').waitFor();
  await page.screenshot({ path: 'test/out/season-pick.png' });
  await page.click('#sg');
  await page.locator('#sim').waitFor();
  await page.screenshot({ path: 'test/out/season-hub.png' });
  await page.click('#sim'); await page.waitForTimeout(300);
  for (const tab of ['Schedule', 'Standings', 'Leaders', 'Roster']) { await page.click(`.tabs >> text=${tab}`); await page.waitForTimeout(200); }
  await page.screenshot({ path: 'test/out/season-roster.png' });
  await page.click('.tabs >> text=Home'); await page.waitForTimeout(200);
  await page.click('#play');
  await until(page, () => !!window.__app.game);
  await settle(page);
  await page.screenshot({ path: 'test/out/season-game.png' });
  const sg = await page.evaluate(() => { const g = window.__app.game; return g && { phase: g.phase, season: !!g.seasonGame, teams: g.teams.map((t) => t.def.abbr) }; });
  console.log('season game', JSON.stringify(sg));
  // Simulate to the end quickly via the engine and check the hand-off back to the hub
  await page.evaluate(() => { const g = window.__app.game; g.headless = true; for (const t of [0, 1]) g.controllers[t] = null; window.__app.humans = [null, null]; });
  await page.evaluate(() => { const g = window.__app.game; g.simulateToEnd(); });
  await page.locator('text=Continue Season').waitFor();
  await page.screenshot({ path: 'test/out/season-final.png' });
  await page.click('text=Continue Season');
  await page.locator('.season-top').waitFor();
  const hub = await page.evaluate(() => document.querySelector('.season-top')?.textContent.slice(0, 120));
  console.log('hub after game:', hub);
  await page.click('.tabs >> text=Save & Exit');
  // Practice
  await page.click('text=Practice');
  await page.click('text=Start Practice');
  await callPlay(page);
  await page.screenshot({ path: 'test/out/practice.png' });
  console.log('practice', JSON.stringify(await gameState(page)));
  await until(page, () => window.__app.game.phase === 'presnap');
  await page.keyboard.press('Space');
  await until(page, () => window.__app.game.phase === 'live');
  await until(page, () => window.__app.game.phase !== 'live', null, 300000);
  const pr2 = await page.evaluate(() => { const g = window.__app.game; return { phase: g.phase, down: g.down, yl: Math.round(g.yardLineOf(g.possession, g.ballX)) }; });
  console.log('practice after snap', JSON.stringify(pr2));
  await page.keyboard.press('Escape');
  await page.locator('text=Quit to Main Menu').waitFor();
  await page.screenshot({ path: 'test/out/pause.png' });
  await page.click('text=Quit to Main Menu');
  // Two-minute drill
  await page.click('text=Two-Minute Drill');
  await page.click('text=Kick Off');
  await until(page, () => { const g = window.__app.game; return g && g.phase !== 'coin'; });
  await settle(page);
  const dr = await page.evaluate(() => { const g = window.__app.game; return { q: g.quarter, clock: g.clock, score: g.score, poss: g.possession, phase: g.phase, tos: g.timeouts }; });
  console.log('drill', JSON.stringify(dr));
  await page.screenshot({ path: 'test/out/drill-playcall.png' });
  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 20)) console.log(e);
  await browser.close();
})();
