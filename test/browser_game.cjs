// Shared setup for the browser tests that drive the game's menus and plays (modes.cjs,
// features.cjs). They run the single-file build under a software WebGL renderer (SwiftShader),
// where startup shader compiles block the page for tens of seconds and the 60 Hz simulation
// runs far below real time (it advances at most 0.1 s per rendered frame). So:
// - Graphics are set to Low through the game's own saved settings (about four times the frame
//   rate of Auto here). These tests check menus and gameplay; browser.cjs covers the default
//   graphics and tools/viewer/gfxcheck.cjs the High look.
// - Every step waits on page or game state, with generous timeouts, instead of fixed delays.
const { chromium } = require('playwright');
const path = require('path');

const STEP_TIMEOUT_MS = 120000;   // one click, screen change or game phase
const POLL_MS = 200;

async function openGame({ graphics = 'low' } = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(STEP_TIMEOUT_MS);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  if (graphics) {
    await page.addInitScript((q) => {
      try {
        const s = JSON.parse(localStorage.getItem('g27-settings') || '{}');
        localStorage.setItem('g27-settings', JSON.stringify({ ...s, graphics: q }));
      } catch { /* storage unavailable: the game falls back to Auto */ }
    }, graphics);
  }
  await page.goto('file://' + path.resolve('dist/Gridiron27.html'));
  await settle(page);
  return { browser, page, errors };
}

// Resolves once the page draws frames again (after startup or a screen change that compiles
// shaders, the main thread can be blocked for a long time).
async function settle(page, frames = 2) {
  await page.waitForFunction(() => !!window.__app, null, { timeout: STEP_TIMEOUT_MS, polling: POLL_MS });
  await page.evaluate((n) => new Promise((resolve) => {
    let k = 0;
    const tick = () => (++k >= n ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), frames);
}

// Waits until fn(arg) is truthy in the page (fn runs in the page).
function until(page, fn, arg, timeout = STEP_TIMEOUT_MS) {
  return page.waitForFunction(fn, arg, { timeout, polling: POLL_MS });
}

module.exports = { openGame, settle, until, STEP_TIMEOUT_MS };
