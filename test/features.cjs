// Browser check of gameplay features: timeout from the play-call screen, defensive
// assignment + coverage menus, the QB throwing motion, and coach mode.
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
  await page.evaluate(() => { const ui = window.__app.ui; ui.tsState.ctlAway = 'p1'; ui.tsState.ctlHome = 'cpu'; });
  await page.click('text=Kick Off');
  await page.waitForTimeout(600);
  await page.keyboard.press('Enter'); // skip the intro
  const results = { timeoutFromPlaycall: null, defAssign: null, coverageShade: null, throwWindupMs: null, coachAutoSnaps: 0, coachUserEnt: null, driveCard: false };
  const st = () => page.evaluate(() => {
    const a = window.__app, g = a.game; if (!g) return null; const s = g.sim; const user = a.humans.findIndex(Boolean);
    const u = s && s.userEnt ? s.userEnt[user] : null;
    return { phase: g.phase, poss: g.possession, user, kind: s && s.kind, simPhase: s && s.phase, qbBall: s && s.qb && s.qb.hasBall, thrown: s && s.thrown, pending: !!(s && s.pendingThrow), to: g.timeouts[user], km: !!a.ui.km, popup: a.ui.popup ? a.ui.popup.el.querySelector('h2').textContent : null, pc: !!(a.ui.pcState[user] && !a.ui.pcState[user].done), assign: u && u.assign ? u.assign.t : null, shade: s && s.covAdj ? s.covAdj.shade : null, over: g.over };
  });
  let plays = 0;
  for (let i = 0; i < 900 && (plays < 14 || results.throwWindupMs === null || !results.driveCard) && plays < 45; i++) {
    const s = await st();
    if (!s || s.over) break;
    if (!results.driveCard) results.driveCard = await page.evaluate(() => { const e = document.querySelector('.drive-card'); return !!(e && !e.classList.contains('hidden') && e.textContent.includes('DRIVE SUMMARY')); });
    if (s.popup && !/Assign|Coverage/.test(s.popup)) { await page.keyboard.press('Enter'); }
    else if (s.phase === 'playcall' && s.pc) {
      if (results.timeoutFromPlaycall === null && s.to > 0) {
        await page.keyboard.press('KeyT'); await page.waitForTimeout(150);
        const s2 = await st();
        results.timeoutFromPlaycall = s2.to === s.to - 1;
      }
      if (s.poss === s.user) {
        // Pick a dropback pass play so the throwing motion can be measured.
        await page.evaluate(() => {
          const a = window.__app, st = a.ui.pcState[a.humans.findIndex(Boolean)];
          for (let fi = 0; fi < st.forms.length; fi++) {
            const pi = st.forms[fi].plays.findIndex((p) => p.type === 'pass' && !(p.tags || []).includes('screen') && !p.special);
            if (pi >= 0) { st.fi = fi; st.pi = pi; st.focus = 'plays'; break; }
          }
          a.ui.renderPlaycall();
        });
        await page.keyboard.press('Enter');
      } else { await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); }
    } else if (s.phase === 'presnap' && s.km) {
      await page.keyboard.press('Space'); await page.waitForTimeout(900); await page.keyboard.press('Space'); await page.waitForTimeout(550); await page.keyboard.press('Space');
    } else if (s.phase === 'presnap' && s.kind === 'scrimmage' && s.poss !== s.user && results.defAssign === null) {
      await page.keyboard.press('KeyH'); await page.waitForTimeout(150);
      const a = await st();
      if (a.popup && /Assign/.test(a.popup)) { await page.keyboard.press('Digit1'); await page.waitForTimeout(150); results.defAssign = (await st()).assign; }
      await page.keyboard.press('KeyN'); await page.waitForTimeout(150);
      const b = await st();
      if (b.popup && /Coverage/.test(b.popup)) { await page.keyboard.press('Digit4'); await page.waitForTimeout(150); results.coverageShade = (await st()).shade; }
      await page.screenshot({ path: 'test/out/feat-def-assign.png' });
    } else if (s.phase === 'presnap' && s.kind === 'scrimmage' && s.poss === s.user) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(1700);
      const s2 = await st();
      if (s2 && s2.qbBall && !s2.thrown && results.throwWindupMs === null) {
        const t0 = Date.now();
        await page.keyboard.down('Digit1'); await page.waitForTimeout(60); await page.keyboard.up('Digit1');
        let sawPending = false;
        for (let k = 0; k < 40; k++) { const s3 = await st(); if (s3.pending) sawPending = true; if (s3.thrown) { results.throwWindupMs = { ms: Date.now() - t0, sawPending }; break; } await page.waitForTimeout(15); }
      }
      plays++;
    } else if (s.phase === 'post') { plays++; await page.keyboard.press('Space'); }
    await page.waitForTimeout(250);
  }
  // Coach mode: user calls plays, CPU runs them (no user snap, no controlled player).
  await page.evaluate(() => { const a = window.__app; a.settings.coachMode = true; a.startGame({ home: 3, away: 17, humans: [a.input.keyboard, null], settings: { quarterLen: 2, difficulty: 1, accel: true } }); });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  let lastSnapPhase = null;
  for (let i = 0; i < 160; i++) {
    const s = await page.evaluate(() => { const a = window.__app, g = a.game, sm = g.sim; return { phase: g.phase, coach: g.isCoach(0), pc: !!(a.ui.pcState[0] && !a.ui.pcState[0].done), popup: !!a.ui.popup, simPhase: sm && sm.phase, kind: sm && sm.kind, userEnt: sm && sm.userEnt ? !!sm.userEnt[0] : false }; });
    if (!s.coach) { results.coachUserEnt = 'coach flag off'; break; }
    if (s.popup) await page.keyboard.press('Enter');
    else if (s.phase === 'playcall' && s.pc) { await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); }
    if (s.phase === 'live' && lastSnapPhase === 'presnap' && s.kind === 'scrimmage') { results.coachAutoSnaps++; if (results.coachUserEnt === null || s.userEnt) results.coachUserEnt = s.userEnt; }
    lastSnapPhase = s.phase;
    await page.waitForTimeout(200);
  }
  console.log(JSON.stringify(results));
  const ok = results.timeoutFromPlaycall === true && results.defAssign === 'blitz' && results.coverageShade === 'inside' && results.throwWindupMs && results.throwWindupMs.ms < 900 && results.coachAutoSnaps >= 2 && results.coachUserEnt === false && results.driveCard;
  console.log(ok ? 'FEATURES OK' : 'FEATURES CHECK FAILED');
  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 20)) console.log(e);
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
})();
