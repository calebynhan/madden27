// node tools/viewer/shoot.cjs model.glb out.png [json opts]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
(async () => {
  const [glb, out, optStr] = process.argv.slice(2);
  const dir = path.dirname(path.resolve(out));
  const html = path.join(dir, 'viewer.html'), js = path.join(dir, 'viewer.js');
  execSync(`npx esbuild ${path.resolve(__dirname, 'view.js')} --bundle --format=iife --outfile=${js} --log-level=error`, { cwd: path.resolve(__dirname, '../..') });
  fs.writeFileSync(html, `<!doctype html><html><body><script src="viewer.js"></script></body></html>`);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + html);
  const b64 = fs.readFileSync(glb).toString('base64');
  const info = await page.evaluate(([b, o]) => window.loadModel(b, o), [b64, optStr ? JSON.parse(optStr) : {}]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out });
  console.log(JSON.stringify(info), errors.length ? 'ERRORS ' + errors.join(' | ') : '');
  await browser.close();
})();
