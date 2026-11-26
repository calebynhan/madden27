// Browser check: Season depth chart editing (move a player up, auto-sort) and the FPS meter.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('file://' + path.resolve('dist/Gridiron27.html'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => localStorage.removeItem('g27-season-v1'));
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  // Open Season -> New Season -> start with the default team
  await page.evaluate(() => window.__app.openSeason());
  await page.waitForTimeout(300);
  await page.click('text=New Season');
  await page.waitForTimeout(300);
  const startBtn = await page.$('text=Start Season') || await page.$('text=Start') || await page.$('text=Begin');
  if (startBtn) await startBtn.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.click('button[data-t="roster"]');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => { const s = window.__app.season.s; return s.teams[s.userTeam].depth.WR.slice(0, 3); });
  // Move WR #2 up to WR #1
  await page.click('button.dcb[data-pos="WR"][data-i="1"][data-d="-1"]');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => { const s = window.__app.season.s; return s.teams[s.userTeam].depth.WR.slice(0, 3); });
  const saved = await page.evaluate(() => { try { const raw = localStorage.getItem('g27-season-v1'); return raw ? JSON.parse(raw) : null; } catch { return null; } });
  const savedWR = saved && saved.teams ? saved.teams[saved.userTeam].depth.WR.slice(0, 3) : null;
  await page.screenshot({ path: 'test/out/season-depth.png' });
  await page.click('button[data-auto="1"]');
  await page.waitForTimeout(300);
  const autoWR = await page.evaluate(() => { const s = window.__app.season.s; return s.teams[s.userTeam].depth.WR.slice(0, 3); });
  // FPS meter
  await page.evaluate(() => { window.__app.settings.showFps = true; });
  await page.waitForTimeout(900);
  const fpsTxt = await page.evaluate(() => { const e = document.querySelector('.fps-meter'); return e && e.style.display !== 'none' ? e.textContent : null; });
  const swapped = before[0] === after[1] && before[1] === after[0];
  const persisted = !!savedWR && savedWR[0] === after[0] && savedWR[1] === after[1];
  const autoOk = autoWR[0] === before[0];
  console.log(JSON.stringify({ before, after, savedWR, autoWR, swapped, persisted, autoOk, fpsTxt }));
  const ok = swapped && persisted && autoOk && !!fpsTxt;
  console.log(ok ? 'SEASON DC OK' : 'SEASON DC CHECK FAILED');
  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 10)) console.log(e);
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
})();
