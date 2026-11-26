// One-button passing in the browser: after the snap a receiver is highlighted (gold ring,
// SPACE badge), Space throws to him, and clicking another receiver throws to that one.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('file://' + path.resolve('dist/Gridiron27.html'));
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.evaluate(() => { const a = window.__app; a.renderer.setQuality('low'); a.startGame({ home: 5, away: 12, humans: [a.input.keyboard, null], settings: { quarterLen: 5, difficulty: 1, accel: true } }); });
  await page.waitForTimeout(600);
  await page.keyboard.press('Enter'); // skip the intro
  const res = { highlighted: false, badge: false, spaceThrow: null, clickThrow: null };
  const st = () => page.evaluate(() => { const a = window.__app, g = a.game, s = g.sim; return { phase: g.phase, simPhase: s && s.phase, kind: s && s.kind, poss: g.possession, qbBall: !!(s && s.qb && s.qb.hasBall), thrown: !!(s && s.thrown), pending: !!(s && s.pendingThrow), sugg: s && s.suggested ? s.suggested.id : null, target: s && s.target ? s.target.id : null, popup: !!a.ui.popup, pc: !!(a.ui.pcState[0] && !a.ui.pcState[0].done), t: s ? s.t : 0 }; });
  // Put our offense on the field with a dropback pass called
  const setup = async () => {
    await page.evaluate(() => { const g = window.__app.game; g.possession = 0; g.ballX = g.xFromYardLine(0, 30); g.ballY = 26.67; g.down = 1; g.firstDown(); g.setupScrimmage(); });
    for (let i = 0; i < 40; i++) {
      const s = await st();
      if (s.popup) await page.keyboard.press('Enter');
      if (s.phase === 'playcall' && s.pc) {
        await page.evaluate(() => {
          const a = window.__app, st = a.ui.pcState[0];
          for (let fi = 0; fi < st.forms.length; fi++) {
            const pi = st.forms[fi].plays.findIndex((p) => p.type === 'pass' && !(p.tags || []).includes('screen') && !p.special && !p.rpo);
            if (pi >= 0) { st.fi = fi; st.pi = pi; st.focus = 'plays'; break; }
          }
          a.ui.renderPlaycall();
        });
        await page.keyboard.press('Enter');
      }
      if (s.phase === 'presnap' && s.kind === 'scrimmage') return true;
      await page.waitForTimeout(400);
    }
    return false;
  };
  const snapAndWait = async () => {
    await page.keyboard.down('Space'); await page.waitForTimeout(80); await page.keyboard.up('Space');
    for (let i = 0; i < 80; i++) {
      const s = await st();
      if (s.qbBall && s.simPhase !== 'presnap' && s.t > 1.0 && s.sugg) return s;
      if (s.thrown || s.phase !== 'live' && s.phase !== 'presnap') return s;
      await page.waitForTimeout(300);
    }
    return st();
  };
  // 1) Space throws to the highlighted receiver
  if (await setup()) {
    const s = await snapAndWait();
    res.highlighted = !!s.sugg;
    res.badge = await page.evaluate(() => !!document.querySelector('.ricon.best .key'));
    await page.screenshot({ path: 'test/out/passui2-highlight.png' });
    if (s.sugg && !s.thrown) {
      const want = s.sugg;
      await page.keyboard.down('Space'); await page.waitForTimeout(60); await page.keyboard.up('Space');
      let s2 = null;
      for (let i = 0; i < 40; i++) { s2 = await st(); if (s2.thrown || s2.pending) break; await page.waitForTimeout(250); }
      for (let i = 0; i < 20 && s2 && !s2.thrown; i++) { await page.waitForTimeout(250); s2 = await st(); }
      const pick = await page.evaluate(() => { const s = window.__app.game.sim; return s.passPick ? s.passPick.id : null; });
      // The throw goes to whoever was highlighted when Space went down
      res.spaceThrow = { thrown: s2.thrown, toHighlighted: s2.target !== null && s2.target === pick, sawBefore: want };
    }
  }
  // 2) Clicking a receiver throws to him
  for (let i = 0; i < 30; i++) { const s = await st(); if (s.phase === 'post' || s.phase === 'playcall') break; await page.waitForTimeout(400); }
  if (await setup()) {
    const s = await snapAndWait();
    if (s.qbBall && !s.thrown) {
      const pick = await page.evaluate(() => {
        const a = window.__app, sim = a.game.sim;
        const list = (sim.icons || []).map((e, i) => ({ e, i })).filter(({ e }) => e.isActive() && e.eligible && e.task && e.task.kind === 'route');
        const c = list.find(({ e }) => e !== sim.suggested) || list[0];
        if (!c) return null;
        const p = a.renderer.project(c.e.x, c.e.y, 1.1);
        return { id: c.e.id, x: p.x, y: p.y };
      });
      if (pick) {
        await page.mouse.click(pick.x, pick.y);
        let s2 = null;
        for (let i = 0; i < 60; i++) { s2 = await st(); if (s2.thrown) break; await page.waitForTimeout(250); }
        res.clickThrow = { thrown: s2.thrown, toClicked: s2.target === pick.id };
      }
    }
  }
  console.log(JSON.stringify(res));
  const ok = res.highlighted && res.badge && res.spaceThrow && res.spaceThrow.thrown && res.spaceThrow.toHighlighted && res.clickThrow && res.clickThrow.thrown && res.clickThrow.toClicked;
  console.log(ok ? 'PASS UI OK' : 'PASS UI CHECK FAILED');
  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 10)) console.log(e);
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
})();
