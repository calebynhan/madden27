// Browser check of gameplay features: timeout from the play-call screen, defensive
// assignment + coverage menus, the QB throwing motion, the drive summary card, and coach mode.
// Every step waits on game state (see browser_game.cjs): a software renderer runs the game far
// below real time, so loops are bounded by wall-clock deadlines, not iteration counts.
const { openGame, settle, until } = require('./browser_game.cjs');

const MINUTE = 60000;

(async () => {
  const { browser, page, errors } = await openGame();
  await page.keyboard.press('Enter'); // Play Now
  await page.locator('text=Kick Off').waitFor();
  await page.evaluate(() => { const ui = window.__app.ui; ui.tsState.ctlAway = 'p1'; ui.tsState.ctlHome = 'cpu'; });
  await page.click('text=Kick Off');
  await until(page, () => !!window.__app.game);
  await settle(page);
  await page.keyboard.press('Enter'); // skip the intro
  const results = { timeoutFromPlaycall: null, defAssign: null, coverageShade: null, throwWindupMs: null, coachAutoSnaps: 0, coachUserEnt: null, driveCard: false };
  const st = () => page.evaluate(() => {
    const a = window.__app, g = a.game; if (!g) return null; const s = g.sim; const user = a.humans.findIndex(Boolean);
    const u = s && s.userEnt ? s.userEnt[user] : null;
    return { phase: g.phase, poss: g.possession, user, kind: s && s.kind, simPhase: s && s.phase, qbBall: s && s.qb && s.qb.hasBall, thrown: s && s.thrown, pending: !!(s && s.pendingThrow), simT: s ? s.t : 0, throwT: s ? s.throwT : null, to: g.timeouts[user], km: !!a.ui.km, popup: a.ui.popup ? a.ui.popup.el.querySelector('h2').textContent : null, pc: !!(a.ui.pcState[user] && !a.ui.pcState[user].done), assign: u && u.assign ? u.assign.t : null, shade: s && s.covAdj ? s.covAdj.shade : null, over: g.over };
  });
  // Poll the game state until pred(state) holds or ms pass; returns the last state read.
  const pollSt = async (pred, ms = 15000) => {
    const end = Date.now() + ms;
    let s = await st();
    while (s && !pred(s) && Date.now() < end) { await page.waitForTimeout(100); s = await st(); }
    return s;
  };
  const firstPartDone = (plays) => plays >= 14 && results.timeoutFromPlaycall !== null && results.defAssign !== null &&
    results.coverageShade !== null && results.throwWindupMs !== null && results.driveCard;
  let plays = 0;
  const deadline = Date.now() + 30 * MINUTE;
  while (Date.now() < deadline && !firstPartDone(plays) && plays < 45) {
    const s = await st();
    if (!s || s.over) break;
    if (!results.driveCard) results.driveCard = await page.evaluate(() => { const e = document.querySelector('.drive-card'); return !!(e && !e.classList.contains('hidden') && e.textContent.includes('DRIVE SUMMARY')); });
    if (s.popup && !/Assign|Coverage/.test(s.popup)) { await page.keyboard.press('Enter'); }
    else if (s.phase === 'playcall' && s.pc) {
      if (results.timeoutFromPlaycall === null && s.to > 0) {
        await page.keyboard.press('KeyT');
        const s2 = await pollSt((x) => x.to !== s.to, 10000);
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
      await pollSt((x) => !(x.phase === 'playcall' && x.pc), 5000);
    } else if (s.phase === 'presnap' && s.km) {
      await page.keyboard.press('Space'); await page.waitForTimeout(900); await page.keyboard.press('Space'); await page.waitForTimeout(550); await page.keyboard.press('Space');
    } else if (s.phase === 'presnap' && s.kind === 'scrimmage' && s.poss !== s.user && results.defAssign === null) {
      await page.keyboard.press('KeyH');
      const a = await pollSt((x) => x.popup || x.phase !== 'presnap', 10000);
      if (a.popup && /Assign/.test(a.popup)) { await page.keyboard.press('Digit1'); results.defAssign = (await pollSt((x) => x.assign !== null, 10000)).assign; }
      await pollSt((x) => !x.popup, 10000);
      await page.keyboard.press('KeyN');
      const b = await pollSt((x) => x.popup || x.phase !== 'presnap', 10000);
      if (b.popup && /Coverage/.test(b.popup)) { await page.keyboard.press('Digit4'); results.coverageShade = (await pollSt((x) => x.shade !== null && x.shade !== undefined, 10000)).shade; }
      await pollSt((x) => !x.popup, 10000);
      await page.screenshot({ path: 'test/out/feat-def-assign.png' });
    } else if (s.phase === 'presnap' && s.kind === 'scrimmage' && s.poss === s.user) {
      await page.keyboard.press('Space');
      // Wait until the snap has reached the QB (in game time: simT counts sim seconds).
      const s2 = await pollSt((x) => x.over || x.thrown || x.simPhase === 'dead' || (x.simPhase !== 'presnap' && x.qbBall && x.simT > 0.9), 3 * MINUTE);
      if (s2 && s2.qbBall && !s2.thrown) {
        if (results.throwWindupMs === null) {
          // Measured in game time (press -> ball out), so a slow software renderer (which runs
          // the 60 Hz sim below real time) doesn't skew the result.
          const t0 = Date.now(), simT0 = s2.simT;
          await page.keyboard.down('Digit1'); await page.waitForTimeout(60); await page.keyboard.up('Digit1');
          let sawPending = false;
          const s3 = await pollSt((x) => { if (x.pending) sawPending = true; return x.thrown; }, MINUTE);
          if (s3.thrown) results.throwWindupMs = { ms: Math.round(1000 * (s3.throwT - simT0)), wallMs: Date.now() - t0, sawPending };
        } else {
          // Later plays: get the ball out rather than holding it until a sack
          await page.keyboard.press('Digit1');
        }
      }
      plays++;
    } else if (s.phase === 'post') { plays++; await page.keyboard.press('Space'); }
    await page.waitForTimeout(250);
  }
  // Coach mode: user calls plays, CPU runs them (no user snap, no controlled player).
  await page.evaluate(() => { const a = window.__app; a.settings.coachMode = true; a.startGame({ home: 3, away: 17, humans: [a.input.keyboard, null], settings: { quarterLen: 2, difficulty: 1, accel: true } }); });
  await settle(page);
  await page.keyboard.press('Enter');
  let lastSnapPhase = null;
  const coachDeadline = Date.now() + 15 * MINUTE;
  while (Date.now() < coachDeadline && results.coachAutoSnaps < 3) {
    const s = await page.evaluate(() => { const a = window.__app, g = a.game, sm = g.sim; return { phase: g.phase, over: g.over, coach: g.isCoach(0), pc: !!(a.ui.pcState[0] && !a.ui.pcState[0].done), popup: !!a.ui.popup, simPhase: sm && sm.phase, kind: sm && sm.kind, userEnt: sm && sm.userEnt ? !!sm.userEnt[0] : false }; });
    if (!s.coach) { results.coachUserEnt = 'coach flag off'; break; }
    if (s.over) break;
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
