// Audio + commentary browser check.
// 1) Renders the synthesized crowd offline (ambient bed, roar with applause and whistles,
//    two defense-chant cycles, a groan and a boo) and checks for NaN/silence/clipping.
// 2) Runs a CPU-vs-CPU game in the page and records what the booth said and how the crowd
//    reacted, failing on page errors or if the booth stays silent.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  // A small window keeps software rendering fast enough for the game to run near real time
  const page = await browser.newPage({ viewport: { width: 400, height: 225 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('file://' + path.resolve('dist/Gridiron27.html'));
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);

  const off = await page.evaluate(async () => {
    const Cls = window.__app.audio.constructor;
    const a = new Cls();
    const sr = 44100, sec = 8;
    const RealAC = window.AudioContext;
    window.AudioContext = function () { return new OfflineAudioContext(2, sr * sec, sr); };
    try { a.init(); } finally { window.AudioContext = RealAC; }
    a.setVolume(0.7);
    a.base = 0.5; a.tick(0.016);
    a.roar(1.2);
    a.chantCycle(2.0); a.chantCycle(3.75);
    for (let i = 0; i < 4; i++) a.fanWhistle(0.4 + i * 0.25);
    const buf = await a.ctx.startRendering();
    const win = (t0, t1) => {
      let s = 0, n = 0;
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = Math.floor(t0 * sr); i < Math.min(d.length, t1 * sr); i++) { s += d[i] * d[i]; n++; } }
      return Math.sqrt(s / Math.max(1, n));
    };
    let peak = 0, nan = 0;
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) { const v = d[i]; if (!Number.isFinite(v)) nan++; else if (Math.abs(v) > peak) peak = Math.abs(v); } }
    // A groan and a boo on their own (they schedule from "now", so give them a fresh context)
    const b = new Cls();
    window.AudioContext = function () { return new OfflineAudioContext(2, sr * 3, sr); };
    try { b.init(); } finally { window.AudioContext = RealAC; }
    b.base = 0.4; b.tick(0.016); b.groan(1); b.boo(1);
    const buf2 = await b.ctx.startRendering();
    let peak2 = 0, nan2 = 0;
    for (let ch = 0; ch < 2; ch++) { const d = buf2.getChannelData(ch); for (let i = 0; i < d.length; i++) { const v = d[i]; if (!Number.isFinite(v)) nan2++; else if (Math.abs(v) > peak2) peak2 = Math.abs(v); } }
    const r = (x) => +x.toFixed(4);
    return { peak: r(peak), nan, ambient: r(win(0.02, 0.14)), roar: r(win(0.4, 1.6)), chant: r(win(2.05, 2.9)), tail: r(win(7.2, 8)), peak2: r(peak2), nan2 };
  });
  console.log('offline render', JSON.stringify(off));

  // Live game, CPU vs CPU, Low graphics for speed; record the booth and crowd calls
  await page.evaluate(() => {
    const a = window.__app;
    a.renderer.setQuality('low');
    const A = a.audio;
    window.__rec = { calls: [], says: [], queues: [], roar: 0, groan: 0, boo: 0, chantOn: 0 };
    const R = window.__rec;
    const wrap = (name, fn) => { const orig = A[name].bind(A); A[name] = (...args) => { try { fn(...args); } catch (e) { /* ignore */ } return orig(...args); }; };
    wrap('call', (p, c) => R.calls.push(c ? `${p}  // ${c}` : p));
    wrap('say', (t) => { if (t) R.says.push(t); });
    wrap('queue', (t) => { if (t) R.queues.push(t); });
    wrap('roar', () => R.roar++);
    wrap('groan', () => R.groan++);
    wrap('boo', () => R.boo++);
    wrap('chant', (on) => { if (on) R.chantOn++; });
    a.startGame({ home: 6, away: 21, humans: [null, null], settings: { quarterLen: 2, difficulty: 1, accel: true, time: 'night' } });
  });
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter'); // skip the intro
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(2000);
    const st = await page.evaluate(() => { const a = window.__app; if (a.ui.popup) { const b = a.ui.popup.el.querySelector('button'); if (b) b.click(); } return { calls: window.__rec.calls.length, over: !!(a.game && a.game.over), q: a.game && a.game.quarter }; });
    if (st.calls >= 18 || st.over) break;
  }
  const rec = await page.evaluate(() => window.__rec);
  const voices = await page.evaluate(() => { const v = window.__app.audio.voices; return { pbp: v.pbpVoice ? v.pbpVoice.name : null, color: v.colorVoice ? v.colorVoice.name : null, hasSS: !!v.ss }; });
  console.log('voices', JSON.stringify(voices));
  console.log('booth calls', rec.calls.length, 'event lines', rec.says.length, 'queued', rec.queues.length, '| crowd roar', rec.roar, 'groan', rec.groan, 'boo', rec.boo, 'chant', rec.chantOn);
  for (const l of [...rec.says.slice(0, 3), ...rec.calls.slice(0, 14), ...rec.queues.slice(0, 4)]) console.log('  ' + l);
  const bad = [...rec.calls, ...rec.says, ...rec.queues].filter((l) => /undefined|NaN|\bnull\b|\[object/.test(l));
  const ok = off.nan === 0 && off.nan2 === 0 && off.peak > 0.02 && off.peak < 1.0 && off.peak2 < 1.0 && off.roar > off.ambient && off.chant > off.ambient * 0.9 && rec.calls.length >= 6 && rec.says.length >= 1 && bad.length === 0;
  console.log(ok ? 'AUDIO OK' : 'AUDIO CHECK FAILED', bad.length ? bad : '');
  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 10)) console.log(e);
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
})();
