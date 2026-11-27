// In-game pose check: freezes a play and lines players up in given animations (anim:speed[:L|R]), side view.
// Usage: node tools/viewer/poses.cjs <tag> run:3,run:9,backpedal:2.5,shuffle:2:R  -> test/out/<tag>-N.png
// Freeze a play and line up players in different animations, seen from the side.
const { chromium } = require('playwright');
const path = require('path');
const { startAtLine } = require('./startplay.cjs');
const tag = process.argv[2] || 'p1';
const ANIMS = (process.argv[3] || 'run,stance3,stance2,qb_uc,throw,tackle,block,backpedal').split(',');
const CAM = (process.env.POSECAM || '7.6,1.15,0').split(',').map(Number);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto('file://' + path.resolve(process.env.HTML || 'dist/Gridiron27.html'));
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await startAtLine(page);
  await page.waitForTimeout(600);
  await page.evaluate(([ANIMS, CAM]) => {
    const a = window.__app, R = a.renderer, sim = a.game.sim;
    a.paused = true; a.ui.clearScreen && a.ui.clearScreen();
    const off = sim.ents.filter((e) => e.team === sim.offIdx).slice(0, ANIMS.length);
    const X = 40;
    // Re-apply the lineup every frame (the renderer animates from e.anim and e.speed)
    const place = () => {
      off.forEach((e, i) => { const [an, spd, sd] = ANIMS[i].split(':'); e.x = e.px = X + i * 2.3; e.y = e.py = 26.67; e.face = e.pface = 0; e.anim = an; const v = spd !== undefined ? +spd : an === 'run' ? 7 : an === 'backpedal' ? 3 : 0; e.speed = v; e.vx = an === 'shuffle' ? 0 : an === 'backpedal' ? -v : v; e.vy = an === 'shuffle' ? (sd === 'L' ? -v : v) : 0; e.windup = 0.3; e.state = 'active'; });
      for (const e of sim.ents) if (!off.includes(e)) { e.y = e.py = 2; }
    };
    R._se = R.syncEntities;
    R.syncEntities = function (s, dt, alpha) { place(); return this._se(s, dt, alpha); };
    window.__ids = off.map((e) => e.id);
    R._uc = R.updateCamera;
    const cx = X + (ANIMS.length - 1) * 1.15 - 60;
    // POSECAM=dist,height,yawOffset (default: side view from 7.6 yards)
    const [dist, hgt, side] = CAM;
    R.updateCamera = function () { this.camera.position.set(cx + side, hgt, dist); this.camera.lookAt(cx, 1.0, 0); };
  }, [ANIMS, CAM]);
  for (const [i, wait] of [[0, 900], [1, 250], [2, 250], [3, 250]]) {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `test/out/${tag}-${i}.png` });
  }
  console.log('ERRORS', errors.length, errors.slice(0, 5).join('\n'));
  await browser.close();
})();
