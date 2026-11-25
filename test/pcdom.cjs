const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('file://' + path.resolve('dist/Gridiron27.html'));
  await page.waitForTimeout(1000);
  await page.click('text=Two-Minute Drill'); await page.waitForTimeout(300);
  await page.click('text=Kick Off'); await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const card = document.querySelector('.pc-card');
    const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
    return { card: r(card), art: r(card.querySelector('.art')), nm: r(card.querySelector('.nm')), nmText: card.querySelector('.nm').textContent, plays: r(document.querySelector('.pc-plays')), body: r(document.querySelector('.pc-body')), pc: r(document.getElementById('playcall')) };
  });
  console.log(JSON.stringify(info));
  await browser.close();
})();
