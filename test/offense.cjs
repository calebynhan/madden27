// Play as offense: pass plays, throws, kick meter. Screenshots + errors.
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
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  // Make the user the AWAY team (receives first usually) — set controllers: away=p1, home=cpu
  await page.evaluate(() => { const ui = window.__app.ui; ui.tsState.ctlAway = 'p1'; ui.tsState.ctlHome = 'cpu'; });
  await page.click('text=Kick Off');
  let shots = 0, throws = 0, kicks = 0;
  const st = () => page.evaluate(() => { const a = window.__app, g = a.game; if (!g) return null; const s = g.sim; return { phase: g.phase, poss: g.possession, user: a.humans.findIndex(Boolean), kind: s && s.kind, simPhase: s && s.phase, qbBall: s && s.qb && s.qb.hasBall, thrown: s && s.thrown, score: g.score.join('-'), dd: g.downText(), q: g.quarter, clock: Math.round(g.clock), text: g.lastText, km: !!a.ui.km, popup: !!a.ui.popup, pc: !!(a.ui.pcState[a.humans.findIndex(Boolean)] && !a.ui.pcState[a.humans.findIndex(Boolean)].done) }; });
  for (let i = 0; i < 220; i++) {
    const s = await st();
    if (!s) break;
    if (i % 15 === 0) console.log(JSON.stringify({ phase: s.phase, poss: s.poss, user: s.user, score: s.score, dd: s.dd, q: s.q, clock: s.clock, text: s.text }));
    if (s.popup) { await page.keyboard.press('Enter'); }
    else if (s.phase === 'playcall' && s.pc) {
      // offense: choose a pass play from the 2nd formation; defense: first play
      if (s.poss === s.user) { await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter'); }
      else { await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); }
    } else if (s.phase === 'presnap' && s.km) {
      kicks++;
      await page.keyboard.press('Space'); await page.waitForTimeout(950); await page.keyboard.press('Space'); await page.waitForTimeout(560); await page.keyboard.press('Space');
    } else if (s.phase === 'presnap' && s.poss === s.user && s.kind === 'scrimmage') {
      if (shots < 2) { await page.screenshot({ path: `test/out/off-presnap-${shots}.png` }); }
      await page.keyboard.press('Space');
      await page.waitForTimeout(1500);
      const s2 = await st();
      if (s2 && s2.qbBall && !s2.thrown) {
        if (shots < 2) await page.screenshot({ path: `test/out/off-pocket-${shots}.png` });
        await page.keyboard.down('Digit1'); await page.waitForTimeout(200); await page.keyboard.up('Digit1');
        throws++;
        await page.waitForTimeout(500);
        if (shots < 2) await page.screenshot({ path: `test/out/off-air-${shots}.png` });
        shots++;
      }
    } else if (s.phase === 'live') {
      await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
    } else if (s.phase === 'post') { await page.keyboard.press('Space'); }
    await page.waitForTimeout(400);
  }
  console.log('throws', throws, 'kicks', kicks);
  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 20)) console.log(e);
  await browser.close();
})();
