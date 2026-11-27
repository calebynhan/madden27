// Deformation check: node tools/viewer/posecheck.cjs out.png [json opts]
// opts: { poses: [names], w: build (1 normal, 1.28 heavy, 0.85 lean), yaw, pos: [x,y,z], look: [x,y,z] }
// Poses (tools/viewer/posecheck.js): rest, overhead, throw, sprint, stance, wings.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
(async () => {
  const [out, optStr] = process.argv.slice(2);
  const dir = path.dirname(path.resolve(out));
  fs.mkdirSync(dir, { recursive: true });
  const html = path.join(dir, 'posecheck.html'), js = path.join(dir, 'posecheck.js');
  execSync(`npx esbuild ${path.resolve(__dirname, 'posecheck.js')} --bundle --format=iife --loader:.glb=binary --outfile=${js} --log-level=error`, { cwd: path.resolve(__dirname, '../..') });
  fs.writeFileSync(html, '<!doctype html><html><body><script src="posecheck.js"></script></body></html>');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await page.goto('file://' + html);
  const opts = { pos: [0, 1.5, 9], look: [0, 1.1, 0], ...(optStr ? JSON.parse(optStr) : {}) };
  const names = await page.evaluate((o) => window.render(o), opts);
  await page.waitForTimeout(200);
  await page.screenshot({ path: out });
  console.log(JSON.stringify(names), errors.filter((e) => !/GPU stall/.test(e)).join(' | '));
  await browser.close();
})();
