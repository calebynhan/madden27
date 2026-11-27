// Shared by the in-game look harnesses (poses.cjs, gfxcheck.cjs): start an exhibition, put the
// ball on the 30 and step through the play-call screen until a play is set at the line. Polls the
// game state instead of waiting fixed times, so it also works on a slow software renderer.
const POLL_MS = 150;
const TIMEOUT_MS = 60000;

async function gameState(page) {
  return page.evaluate(() => {
    const a = window.__app, g = a && a.game;
    if (!g) return null;
    const user = a.humans.findIndex(Boolean);
    return {
      phase: g.phase,
      sim: !!g.sim,
      popup: !!a.ui.popup,
      pc: !!(a.ui.pcState && a.ui.pcState[user] && !a.ui.pcState[user].done),
    };
  });
}

// settings: extra game settings (e.g. { time: 'night' }). Resolves once a scrimmage play is at
// the line (phase 'presnap' with a sim), or throws after TIMEOUT_MS.
async function startAtLine(page, settings = {}) {
  await page.evaluate((settings) => {
    const a = window.__app;
    a.startGame({ home: 5, away: 12, humans: [a.input.keyboard, null], settings: { quarterLen: 5, difficulty: 1, accel: true, time: 'day', ...settings } });
  }, settings);
  const t0 = Date.now();
  let placed = false;
  while (Date.now() - t0 < TIMEOUT_MS) {
    const s = await gameState(page);
    if (s && !placed && (s.phase === 'kick_call' || s.phase === 'playcall' || s.phase === 'presnap')) {
      await page.evaluate(() => { const g = window.__app.game; g.possession = 0; g.ballX = g.xFromYardLine(0, 30); g.ballY = 26.67; g.down = 1; g.firstDown(); g.setupScrimmage(); });
      placed = true;
    } else if (s && placed && s.phase === 'presnap' && s.sim && !s.pc) {
      return;
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(POLL_MS);
  }
  throw new Error('timed out waiting for a play at the line');
}

module.exports = { startAtLine };
