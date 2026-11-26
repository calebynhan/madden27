// HTML UI: menus, play calling, pre-snap adjustments, HUD, kick meter, results.
import { TEAMS, teamFullName, LEAGUE_NAME } from '../data/teams.js';
import { offensivePlaybook, OFF_STYLE_NAMES, OFF_PLAYS } from '../data/playbook_offense.js';
import { defensivePlaybook, DEF_STYLE_NAMES, DEF_PLAYS } from '../data/playbook_defense.js';
import { OFF_FORMATIONS, DEF_FORMATIONS } from '../data/formations.js';
import { HOT_ROUTES, ROUTES, routeName } from '../data/routes.js';
import { offenseSVG, defenseSVG } from './playart.js';
import { formatClock, ordinal, clamp } from '../core/util.js';
import { DIFFICULTIES } from '../core/constants.js';
import { refreshIcons } from '../sim/ai_offense.js';
import { cyclePresnapDefender } from '../sim/user.js';
import * as AI from '../sim/playcaller.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export const PAD_GLYPH = { pass1: 'A', pass2: 'B', pass3: 'X', pass4: 'Y', pass5: 'RB' };

export function badgeHTML(t, cls = '') {
  return `<div class="badge ${cls}" style="background:${t.primary};border-color:${t.secondary};color:${t.secondary === '#FFFFFF' || t.secondary === '#ffffff' ? '#fff' : '#fff'};text-shadow:0 2px 0 rgba(0,0,0,.4)">${t.abbr}</div>`;
}

function navOf(ev) {
  if (ev.type === 'key') {
    switch (ev.code) {
      case 'ArrowUp': case 'KeyW': return 'up';
      case 'ArrowDown': case 'KeyS': return 'down';
      case 'ArrowLeft': case 'KeyA': return 'left';
      case 'ArrowRight': case 'KeyD': return 'right';
      case 'Enter': case 'Space': return 'confirm';
      case 'Escape': case 'Backspace': return 'back';
      case 'Tab': return 'tab';
      case 'KeyF': return 'flip';
      default: return null;
    }
  }
  if (ev.type === 'pad') return { 12: 'up', 13: 'down', 14: 'left', 15: 'right', 0: 'confirm', 1: 'back', 4: 'tab', 3: 'flip', 9: 'back' }[ev.button] || null;
  return null;
}

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.screenEl = null;
    this.screenNav = null;
    this.popup = null;
    this.pcState = {};
    this.km = null;
    this.lastPhase = null;
    this.tickerT = 0;
    this.bannerT = 0;
    this.toastT = 0;
    this.showArt = true;
    this.buildInGame();
    app.input.on((ev) => this.onInput(ev));
  }

  // ------------------------------------------------------------------ layout
  buildInGame() {
    const L = this.layer = {};
    L.icons = h('div'); L.icons.id = 'icons';
    L.hud = h('div'); L.hud.id = 'hud';
    L.ticker = h('div'); L.ticker.id = 'ticker';
    L.banner = h('div'); L.banner.id = 'banner';
    L.hints = h('div'); L.hints.id = 'hints';
    L.playinfo = h('div'); L.playinfo.id = 'playinfo';
    L.passmeter = h('div', '', '<span>Lob · Touch · Bullet</span><i></i>'); L.passmeter.id = 'passmeter';
    L.playcall = h('div'); L.playcall.id = 'playcall';
    L.kick = h('div', 'panel'); L.kick.id = 'kickmeter';
    L.toast = h('div', 'toast panel');
    L.replay = h('div', 'replay-badge', 'INSTANT REPLAY');
    for (const k in L) { L[k].classList.add('hidden'); this.root.appendChild(L[k]); }
  }

  hideInGame() { for (const k in this.layer) this.layer[k].classList.add('hidden'); this.closePopup(); }

  clearScreen() {
    if (this.screenEl) this.screenEl.remove();
    this.screenEl = null; this.screenNav = null;
  }

  setScreen(el, nav) {
    this.clearScreen();
    this.screenEl = el;
    this.screenNav = nav || null;
    this.root.appendChild(el);
  }

  toast(text, sec = 2) {
    const t = this.layer.toast;
    t.textContent = text;
    t.classList.remove('hidden');
    this.toastT = sec;
  }

  banner(text, cls = '') {
    const b = this.layer.banner;
    b.className = cls;
    b.textContent = text;
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    b.classList.remove('hidden');
    this.bannerT = 2.2;
  }

  // ------------------------------------------------------------------ menu screens
  showMainMenu() {
    this.hideInGame();
    const el = h('div', 'screen');
    el.innerHTML = `<div class="title">Gridiron <span>27</span></div><div class="subtitle">${LEAGUE_NAME} Football</div>`;
    const menu = h('div', 'menu');
    const items = [
      ['Play Now', 'Exhibition game — you vs CPU or a friend', () => this.showTeamSelect('play')],
      ['Season', 'Take a franchise through a 17-game season and playoffs', () => this.app.openSeason()],
      ['Two-Minute Drill', 'Down 4, two minutes left, no timeouts to waste', () => this.showTeamSelect('drill')],
      ['Practice', 'Run any play from the playbook against any look', () => this.showTeamSelect('practice')],
      ['Controls', 'Keyboard and gamepad layouts', () => this.showControls()],
      ['Settings', 'Graphics, audio, camera and gameplay options', () => this.showSettings()],
    ];
    const btns = items.map(([t, s, fn]) => { const b = h('button', 'mbtn', `${t}<small>${s}</small>`); b.onclick = () => { this.app.audio.resume(); this.app.audio.click(); fn(); }; menu.appendChild(b); return b; });
    el.appendChild(menu);
    el.appendChild(h('div', 'footer-hint', 'Arrow keys / D-pad to navigate · Enter / A to select · Best with a gamepad, fully playable on keyboard'));
    this.setScreen(el, this.listNav(btns));
  }

  listNav(btns, onBack) {
    let idx = 0;
    const paint = () => btns.forEach((b, i) => b.classList.toggle('sel', i === idx));
    paint();
    btns.forEach((b, i) => b.addEventListener('mouseenter', () => { idx = i; paint(); }));
    return (nav) => {
      if (nav === 'up') idx = (idx + btns.length - 1) % btns.length;
      else if (nav === 'down') idx = (idx + 1) % btns.length;
      else if (nav === 'confirm') { btns[idx].click(); return; }
      else if (nav === 'back' && onBack) { onBack(); return; }
      paint();
    };
  }

  showControls(back = () => this.showMainMenu()) {
    const el = h('div', 'screen');
    const c = h('div', 'panel controls-grid');
    const sec = (title, rows) => `<div><h3>${title}</h3>${rows.map(([a, k]) => `<div class="c"><span>${a}</span><span>${k}</span></div>`).join('')}</div>`;
    c.innerHTML =
      sec('Pre-snap (offense)', [['Snap ball', 'Space · A'], ['Hot route', 'H · Y'], ['Motion', 'M · LB'], ['Audible / flip', 'B · X'], ['Hard count', 'K'], ['Pass protection slide', 'L'], ['Show / hide play art', 'I · LT'], ['Timeout', 'T · Back'], ['Pause', 'Esc · Start']]) +
      sec('Passing', [['Throw to receiver', '1–5 · A B X Y RB'], ['Lob / touch / bullet', 'tap / medium / hold'], ['Lead the pass', 'hold a direction while releasing'], ['Throw it away', 'X'], ['Scramble', 'move with WASD / stick'], ['Aggressive catch', 'R · Y (hold)'], ['Possession catch', 'C · A (hold)']]) +
      sec('Ball carrier', [['Move', 'WASD / Arrows · Left stick'], ['Sprint', 'Shift · RT'], ['Juke left / right', 'Q / E · Right stick ←/→'], ['Spin', 'R · B'], ['Stiff arm', 'F · A'], ['Truck', 'C · Right stick ↑'], ['Hurdle', 'V · Y'], ['Stutter step', 'X · Right stick ↓'], ['Dive / QB slide', 'Z · X'], ['Protect ball (hold)', 'G · RB']]) +
      sec('Defense', [['Switch player', 'Tab · B'], ['Dive tackle', 'Space · X'], ['Hit stick', 'F · Right stick ↑'], ['Strip ball', 'Q · RB'], ['Swat ball', 'E · X (ball in air)'], ['Play the ball (INT)', 'R · Y'], ['DL swim / bull rush', 'E / R · A / X'], ['Audible coverage', 'B · X (pre-snap)'], ['Assign defender (blitz, spy, zone, man)', 'H · Y (pre-snap)'], ['Coverage adjustments (shade, press, show blitz)', 'N · RB (pre-snap)'], ['Shift D-line', 'J · LB (pre-snap)']]) +
      sec('Special teams', [['Aim kick', '← → / Left stick'], ['Start / set power / accuracy', 'Space · A (3 presses)'], ['Fair catch (returner)', 'F'], ['Kneel in end zone', 'Z']]) +
      sec('Other', [['Instant replay (after play)', 'Y'], ['Skip post-play', 'Space · A'], ['Camera', 'Settings → Camera'], ['Replay: scrub / rotate', '← → / Q E'], ['Replay: play / pause', 'Space']]);
    el.appendChild(c);
    const b = h('button', 'btn primary', 'Back');
    b.style.marginTop = '14px';
    b.onclick = back;
    el.appendChild(b);
    this.setScreen(el, (nav) => { if (nav === 'back' || nav === 'confirm') back(); });
  }

  showSettings(back = () => this.showMainMenu()) {
    const s = this.app.settings;
    const el = h('div', 'screen');
    const p = h('div', 'panel ts-settings');
    p.style.width = 'min(520px, 94vw)';
    p.innerHTML = '<h2>Settings</h2>';
    const rows = [
      ['Graphics', 'graphics', ['auto', 'low', 'medium', 'high'], (v) => (v === 'auto' ? 'Auto (adapts to your laptop)' : v[0].toUpperCase() + v.slice(1))],
      ['Show FPS', 'showFps', [false, true], (v) => (v ? 'On' : 'Off')],
      ['Camera', 'camera', ['standard', 'zoom', 'wide', 'high'], (v) => v[0].toUpperCase() + v.slice(1)],
      ['Volume', 'volume', [0, 0.25, 0.5, 0.7, 0.85, 1], (v) => `${Math.round(v * 100)}%`],
      ['Game speed', 'gameSpeed', [0.85, 1, 1.15], (v) => (v === 1 ? 'Normal' : v < 1 ? 'Slow' : 'Fast')],
      ['Auto sprint', 'autoSprint', [false, true], (v) => (v ? 'On' : 'Off')],
      ['Announcer voice', 'announcer', [true, false], (v) => (v ? 'On' : 'Off')],
      ['Coach mode (call plays, CPU plays them)', 'coachMode', [false, true], (v) => (v ? 'On' : 'Off')],
      ['Play art pre-snap', 'showArt', [true, false], (v) => (v ? 'On' : 'Off')],
      ['Default difficulty', 'difficulty', [0, 1, 2, 3], (v) => DIFFICULTIES[v]],
      ['Default quarter length', 'quarterLen', [1, 2, 3, 4, 5, 6, 8, 10, 12, 15], (v) => `${v} min`],
    ];
    const optEls = [];
    for (const [label, key, vals, fmt] of rows) {
      const o = h('div', 'opt');
      o.innerHTML = `<label>${label}</label><div class="val"><button>‹</button><span></span><button>›</button></div>`;
      const span = o.querySelector('span');
      const paint = () => { span.textContent = fmt(s[key]); };
      const step = (d) => { let i = vals.indexOf(s[key]); if (i < 0) i = 0; s[key] = vals[(i + d + vals.length) % vals.length]; paint(); this.app.applySettings(key); };
      o.querySelectorAll('button')[0].onclick = () => step(-1);
      o.querySelectorAll('button')[1].onclick = () => step(1);
      o.step = step;
      paint();
      p.appendChild(o);
      optEls.push(o);
    }
    const note = h('div', '', '<small style="color:var(--dim)">Graphics changes apply on the next game.</small>');
    p.appendChild(note);
    const b = h('button', 'btn primary', 'Done');
    b.onclick = () => { this.app.saveSettings(); back(); };
    p.appendChild(b);
    el.appendChild(p);
    let idx = 0;
    const paintSel = () => optEls.forEach((o, i) => o.classList.toggle('sel', i === idx));
    paintSel();
    this.setScreen(el, (nav) => {
      if (nav === 'up') idx = (idx + optEls.length - 1) % optEls.length;
      else if (nav === 'down') idx = (idx + 1) % optEls.length;
      else if (nav === 'left') optEls[idx].step(-1);
      else if (nav === 'right') optEls[idx].step(1);
      else if (nav === 'back' || nav === 'confirm') { b.click(); return; }
      paintSel();
    });
  }

  // ------------------------------------------------------------------ team select
  showTeamSelect(mode, preset = {}) {
    const app = this.app;
    const s = app.settings;
    const st = this.tsState = Object.assign({
      mode,
      away: preset.away ?? 16, home: preset.home ?? 0,
      ctlAway: 'cpu', ctlHome: 'p1',
      difficulty: s.difficulty, quarterLen: s.quarterLen, accel: true, weather: 'clear', time: 'day', practiceSide: 'offense',
    }, this.tsState && this.tsState.mode === mode ? this.tsState : {}, preset);
    const el = h('div', 'screen');
    el.innerHTML = `<div class="subtitle" style="margin:0 0 14px">${mode === 'practice' ? 'Practice' : mode === 'drill' ? 'Two-Minute Drill' : 'Play Now'} · choose your matchup</div>`;
    const wrap = h('div', 'ts-wrap');
    const teamPanel = (side) => {
      const p = h('div', 'panel ts-team');
      p.dataset.side = side;
      return p;
    };
    const awayP = teamPanel('away'), homeP = teamPanel('home');
    const mid = h('div', 'panel ts-settings');
    wrap.appendChild(awayP); wrap.appendChild(mid); wrap.appendChild(homeP);
    el.appendChild(wrap);
    const league = app.league();
    const ctlOptions = () => {
      const o = [['cpu', 'CPU'], ['p1', app.input.pads.length ? 'You (Keyboard)' : 'You']];
      app.input.pads.forEach((p, i) => o.push([`pad${i}`, `Gamepad ${i + 1}`]));
      return o;
    };
    const paintTeam = (p, side) => {
      const idx = st[side];
      const t = TEAMS[idx];
      const r = league[idx].ratings;
      const ctl = side === 'away' ? 'ctlAway' : 'ctlHome';
      p.innerHTML = `<h3>${side === 'away' ? 'AWAY' : 'HOME'}</h3>
        <div class="ts-arrows"><button class="btn" data-d="-1">◀</button>${badgeHTML(t)}<button class="btn" data-d="1">▶</button></div>
        <div class="ts-city">${t.city}</div><div class="ts-name">${t.name}</div>
        <div class="ratings"><div class="rating"><b>${r.ovr}</b><span>OVR</span></div><div class="rating"><b>${r.off}</b><span>OFF</span></div><div class="rating"><b>${r.def}</b><span>DEF</span></div></div>
        <div style="font-size:12px;color:var(--dim)">${OFF_STYLE_NAMES[t.offStyle]} offense · ${DEF_STYLE_NAMES[t.defStyle]} defense</div>
        <div class="ctl-pick">${mode === 'play' ? ctlOptions().map(([k, n]) => `<button data-c="${k}" class="${st[ctl] === k ? 'on' : ''}">${n}</button>`).join('') : ''}</div>`;
      p.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { st[side] = (st[side] + (+b.dataset.d) + 32) % 32; paintAll(); }));
      p.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { st[ctl] = b.dataset.c; paintAll(); }));
    };
    const optDefs = [
      ['Difficulty', 'difficulty', [0, 1, 2, 3], (v) => DIFFICULTIES[v]],
      ['Quarter length', 'quarterLen', [1, 2, 3, 4, 5, 6, 8, 10, 12, 15], (v) => `${v} min`],
      ['Accelerated clock', 'accel', [true, false], (v) => (v ? 'On' : 'Off')],
      ['Weather', 'weather', ['clear', 'rain', 'snow', 'wind', 'random'], (v) => v[0].toUpperCase() + v.slice(1)],
      ['Time of day', 'time', ['day', 'night'], (v) => (v === 'day' ? 'Day' : 'Night')],
    ];
    if (mode === 'practice') optDefs.splice(0, 3, ['You play', 'practiceSide', ['offense', 'defense'], (v) => (v === 'offense' ? 'Offense' : 'Defense')], ['Difficulty', 'difficulty', [0, 1, 2, 3], (v) => DIFFICULTIES[v]]);
    if (mode === 'drill') optDefs.splice(1, 2);
    const rows = [];
    const paintMid = () => {
      mid.innerHTML = `<h2>${mode === 'practice' ? 'Practice' : 'Game'} Settings</h2>`;
      rows.length = 0;
      for (const [label, key, vals, fmt] of optDefs) {
        const o = h('div', 'opt');
        o.innerHTML = `<label>${label}</label><div class="val"><button>‹</button><span>${fmt(st[key])}</span><button>›</button></div>`;
        const step = (d) => { let i = vals.indexOf(st[key]); if (i < 0) i = 0; st[key] = vals[(i + d + vals.length) % vals.length]; paintMid(); paintSel(); };
        o.querySelectorAll('button')[0].onclick = () => step(-1);
        o.querySelectorAll('button')[1].onclick = () => step(1);
        o.step = step;
        mid.appendChild(o);
        rows.push(o);
      }
      const desc = mode === 'practice' ? `<div style="font-size:12px;color:var(--dim)">You: <b>${TEAMS[st.home].name}</b> (right panel) vs <b>${TEAMS[st.away].name}</b>. Every snap resets to 1st & 10 at your 35.</div>`
        : mode === 'drill' ? `<div style="font-size:12px;color:var(--dim)">You: <b>${TEAMS[st.home].name}</b>. Trailing by 4 with 2:00 left in the 4th, 1 timeout, ball at your 25.</div>`
          : '<div style="font-size:12px;color:var(--dim)">Pick CPU or a controller for each team. Two humans = local head-to-head.</div>';
      mid.insertAdjacentHTML('beforeend', desc);
      const go = h('button', 'btn primary', mode === 'practice' ? 'Start Practice' : 'Kick Off');
      go.style.marginTop = '6px';
      go.onclick = () => this.startFromSelect();
      mid.appendChild(go);
      const back = h('button', 'btn', 'Back');
      back.onclick = () => this.showMainMenu();
      mid.appendChild(back);
      rows.push(go);
    };
    const paintAll = () => { paintTeam(awayP, 'away'); paintTeam(homeP, 'home'); paintMid(); paintSel(); };
    let sel = 0; // -2 away team, -1 home team, 0.. rows
    const paintSel = () => {
      awayP.style.outline = sel === -2 ? '2px solid var(--accent)' : '';
      homeP.style.outline = sel === -1 ? '2px solid var(--accent)' : '';
      rows.forEach((o, i) => o.classList.toggle('sel', i === sel));
    };
    paintAll();
    this.setScreen(el, (nav) => {
      if (nav === 'up') sel = Math.max(-2, sel - 1);
      else if (nav === 'down') sel = Math.min(rows.length - 1, sel + 1);
      else if (nav === 'left' || nav === 'right') {
        const d = nav === 'left' ? -1 : 1;
        if (sel === -2) { st.away = (st.away + d + 32) % 32; paintAll(); }
        else if (sel === -1) { st.home = (st.home + d + 32) % 32; paintAll(); }
        else if (rows[sel] && rows[sel].step) rows[sel].step(d);
      } else if (nav === 'confirm') { if (rows[sel] && !rows[sel].step) rows[sel].click(); else if (sel < 0) sel = 0; }
      else if (nav === 'back') { this.showMainMenu(); return; }
      paintSel();
    });
  }

  startFromSelect() {
    const st = this.tsState;
    const app = this.app;
    const srcFor = (k) => (k === 'cpu' ? null : k === 'p1' ? app.input.keyboard : app.input.pads[+k.slice(3)] || app.input.keyboard);
    if (st.mode === 'play') {
      let ctlA = srcFor(st.ctlAway), ctlH = srcFor(st.ctlHome);
      if (ctlA && ctlH && ctlA === ctlH) ctlA = app.input.pads[0] && app.input.pads[0] !== ctlH ? app.input.pads[0] : null;
      app.startGame({ home: st.home, away: st.away, humans: [ctlH, ctlA], settings: { difficulty: st.difficulty, quarterLen: st.quarterLen, accel: st.accel, weather: st.weather, time: st.time } });
    } else if (st.mode === 'drill') {
      app.startGame({ home: st.home, away: st.away, humans: [app.input.keyboard, null], settings: { difficulty: st.difficulty, quarterLen: 15, accel: false, weather: st.weather, time: st.time }, scenario: 'drill' });
    } else {
      app.startGame({ home: st.home, away: st.away, humans: [app.input.keyboard, null], settings: { difficulty: st.difficulty, quarterLen: 15, accel: false, weather: st.weather, time: st.time, practice: { side: st.practiceSide } } });
    }
  }

  // Optional frame-rate readout (Settings → Show FPS).
  fpsFrame(r) {
    if (!r) { if (this.fpsEl) this.fpsEl.style.display = 'none'; return; }
    if (!this.fpsEl) { this.fpsEl = h('div', 'fps-meter'); this.root.appendChild(this.fpsEl); }
    this.fpsEl.style.display = 'block';
    const txt = `${Math.round(r.fps)} FPS${r.autoQ ? ` · ${Math.round(r.resScale * 100)}% res` : ''}`;
    if (txt !== this.fpsTxt) { this.fpsTxt = txt; this.fpsEl.textContent = txt; }
  }

  // ------------------------------------------------------------------ input routing
  onInput(ev) {
    const app = this.app;
    const nav = navOf(ev);
    // Full-screen menus
    if (this.screenNav && !app.game) { if (nav) this.screenNav(nav, ev); return; }
    if (this.screenNav && app.game && (app.paused || app.game.over)) { if (nav) this.screenNav(nav, ev); return; }
    const g = app.game;
    if (!g) return;
    if (app.intro) { app.endIntro(); return; }
    if (app.halftime && this.screenNav) { if (nav) this.screenNav(nav, ev); return; }
    // Replay controls
    if (app.view.replay) { this.replayInput(ev, nav); return; }
    // Esc inside the play list steps back to formations instead of pausing
    const evTeam = app.teamOf(ev.source);
    const inPlayList = g.phase === 'playcall' && evTeam !== null && this.pcState[evTeam] && !this.pcState[evTeam].done && this.pcState[evTeam].focus === 'plays';
    if (ev.actions && ev.actions.includes('pause') && !this.popup && !(inPlayList && ev.actions.includes('back'))) { app.togglePause(); return; }
    if (this.popup) {
      if (this.popup.source && ev.source !== this.popup.source && app.humanCount() > 1) return;
      this.popupInput(ev, nav);
      return;
    }
    const team = evTeam;
    if (team === null || team === undefined) return;
    // Timeouts work from the play-call screen as well as at the line
    if ((g.phase === 'playcall' || g.phase === 'presnap') && ev.actions && ev.actions.includes('timeout')) {
      if (g.callTimeout(team)) this.toast(`Timeout — ${g.teams[team].def.name} (${g.timeouts[team]} left)`);
      else if (g.timeouts[team] <= 0) this.toast('No timeouts left', 1.2);
      return;
    }
    // Play calling
    if (g.phase === 'playcall' && this.pcState[team] && !this.pcState[team].done) { this.playcallInput(team, ev, nav); return; }
    if (g.phase === 'post' && ev.actions) {
      if (ev.actions.includes('replay')) { app.startReplay(); return; }
      if (ev.actions.includes('confirm') || ev.actions.includes('snap')) { g.phaseT = 99; return; }
    }
    if (g.phase === 'presnap' && g.sim) this.presnapInput(team, ev);
  }

  // ------------------------------------------------------------------ popups
  openPopup(title, items, onPick, opts = {}) {
    this.closePopup();
    const el = h('div', 'panel popup');
    el.innerHTML = `<h2>${title}</h2>`;
    const list = h('div', 'list');
    items.forEach((it, i) => {
      const d = h('div', 'item', `<span>${it.hotkey ? `<span class="kbd">${it.hotkey}</span> ` : ''}${it.label}</span>${it.sub ? `<small>${it.sub}</small>` : ''}`);
      d.onclick = () => { this.popup.idx = i; this.pickPopup(); };
      d.onmouseenter = () => { this.popup.idx = i; this.paintPopup(); };
      list.appendChild(d);
    });
    el.appendChild(list);
    if (opts.note) el.insertAdjacentHTML('beforeend', `<div style="margin-top:10px;font-size:12px;color:var(--dim)">${opts.note}</div>`);
    if (opts.corner) { el.className = 'panel presnap-menu'; }
    this.root.appendChild(el);
    this.popup = { el, items, idx: opts.idx || 0, onPick, source: opts.source, cancel: opts.cancel };
    this.paintPopup();
  }
  paintPopup() { if (!this.popup) return; [...this.popup.el.querySelectorAll('.item')].forEach((d, i) => d.classList.toggle('sel', i === this.popup.idx)); }
  pickPopup() { const p = this.popup; if (!p) return; const it = p.items[p.idx]; this.closePopup(); p.onPick(it, p.idx); }
  closePopup() { if (this.popup) { this.popup.el.remove(); this.popup = null; } }
  popupInput(ev, nav) {
    const p = this.popup;
    // Number keys pick directly
    if (ev.type === 'key' && /^Digit[1-9]$/.test(ev.code)) { const i = +ev.code.slice(5) - 1; if (i < p.items.length) { p.idx = i; this.pickPopup(); } return; }
    if (nav === 'up') p.idx = (p.idx + p.items.length - 1) % p.items.length;
    else if (nav === 'down') p.idx = (p.idx + 1) % p.items.length;
    else if (nav === 'confirm') { this.pickPopup(); return; }
    else if (nav === 'back') { this.closePopup(); if (p.cancel) p.cancel(); return; }
    this.paintPopup();
  }

  // ------------------------------------------------------------------ play calling
  openPlaycall(team) {
    const g = this.app.game;
    const off = team === g.possession;
    const ts = g.teams[team];
    const book = off ? offensivePlaybook(ts.def.offStyle) : defensivePlaybook(ts.def.defStyle);
    const forms = book.filter((b) => b.plays.length);
    if (off && (g.down === 4 && !g.conversion)) forms.unshift({ form: 'special', special: true, plays: [{ id: 'punt', name: 'Punt', special: 'punt' }, { id: 'fg', name: 'Field Goal', special: 'fg' }] });
    if (off && !g.conversion) forms.push({ form: 'clock', special: true, plays: [{ id: 'spike', name: 'QB Spike', special: 'spike' }, { id: 'kneel', name: 'QB Kneel', special: 'kneel' }] });
    const prev = this.pcState[team];
    const st = { team, off, forms, fi: 0, pi: 0, focus: 'forms', flip: false, done: false };
    // Start on the last formation used
    if (prev && prev.lastForm) { const i = forms.findIndex((f) => f.form === prev.lastForm); if (i >= 0) st.fi = i; }
    st.lastForm = prev?.lastForm;
    // Coach suggestion
    if (off) { const c = g.down === 4 && !g.conversion ? AI.fourthDownDecision(g, team) : null; st.suggest = c && c !== 'go' ? c : AI.chooseOffensivePlay(g, team).play.id; }
    else st.suggest = AI.chooseDefensivePlay(g, team, null).play.id;
    this.pcState[team] = st;
    this.renderPlaycall();
  }

  renderPlaycall() {
    const g = this.app.game;
    const pc = this.layer.playcall;
    const humans = [0, 1].filter((t) => this.pcState[t] && !this.pcState[t].done && g.isUser(t));
    const doneHumans = [0, 1].filter((t) => this.pcState[t] && this.pcState[t].done && g.isUser(t));
    if (!humans.length) { pc.classList.add('hidden'); return; }
    pc.classList.remove('hidden');
    pc.innerHTML = '';
    const split = humans.length + doneHumans.length > 1;
    const container = split ? h('div', 'pc-split') : pc;
    if (split) pc.appendChild(container);
    for (const t of [0, 1]) {
      const st = this.pcState[t];
      if (!st || !g.isUser(t)) continue;
      const panel = split ? h('div', '') : container;
      if (split) { panel.style.display = 'flex'; panel.style.flexDirection = 'column'; panel.style.borderRight = '1px solid var(--line)'; container.appendChild(panel); }
      if (st.done) { panel.appendChild(h('div', 'pc-done', '✓ Play selected')); continue; }
      this.renderPlaycallPanel(panel, st, split);
    }
  }

  renderPlaycallPanel(panel, st, split) {
    const g = this.app.game;
    const ts = g.teams[st.team];
    const sit = `${g.conversion ? '2-PT TRY' : g.downText()} · ${g.ballSpotText()} · ${ordinal(Math.min(g.quarter, 5)).replace('5th', 'OT')} ${formatClock(g.clock)}`;
    const head = h('div', 'pc-head', `<span class="who">${st.off ? 'OFFENSE' : 'DEFENSE'}</span><span>${ts.def.name}</span><span class="sit">${sit}</span><span class="spacer"></span><span>Play clock <b>${Math.max(0, Math.ceil(g.playClock))}</b></span>`);
    panel.appendChild(head);
    const body = h('div', 'pc-body');
    const formsEl = h('div', 'pc-forms');
    st.forms.forEach((f, i) => {
      const name = f.special ? (f.form === 'special' ? 'Special Teams' : 'Clock Management') : (st.off ? OFF_FORMATIONS[f.form].name : DEF_FORMATIONS[f.form].name);
      const sub = f.special ? '' : (st.off ? OFF_FORMATIONS[f.form].personnel : DEF_FORMATIONS[f.form].group);
      const d = h('div', `pc-form ${i === st.fi ? 'sel' : ''} ${st.focus === 'forms' && i === st.fi ? 'focus' : ''}`, `${name}<small>${sub}</small>`);
      d.onclick = () => { st.fi = i; st.pi = 0; st.focus = 'plays'; this.renderPlaycall(); };
      formsEl.appendChild(d);
    });
    body.appendChild(formsEl);
    const playsEl = h('div', 'pc-plays');
    const form = st.forms[st.fi];
    form.plays.forEach((p, i) => {
      const card = h('div', `pc-card ${st.focus === 'plays' && i === st.pi ? 'sel' : ''}`);
      let art = '';
      if (p.special) art = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:34px;font-weight:900;color:var(--accent2)">${p.special === 'punt' ? 'P' : p.special === 'fg' ? 'FG' : p.special === 'spike' ? '⇣' : 'K'}</div>`;
      else art = st.off ? offenseSVG(p, 220, 150, st.flip) : defenseSVG(p, 220, 150);
      const tagTxt = p.special ? '' : st.off ? (p.type === 'run' ? 'Run' : p.type === 'pa' ? 'Play Action' : (p.tags.includes('screen') ? 'Screen' : 'Pass')) : p.cover;
      const sug = st.suggest === p.id || st.suggest === p.special ? ' ★' : '';
      card.innerHTML = `<div class="art">${art}</div><div class="nm"><span>${p.name}${sug}</span><small>${tagTxt}</small></div>`;
      card.onclick = () => { st.pi = i; st.focus = 'plays'; this.submitPlay(st); };
      card.onmouseenter = () => { if (st.focus === 'plays') return; };
      playsEl.appendChild(card);
    });
    body.appendChild(playsEl);
    panel.appendChild(body);
    const foot = h('div', 'pc-foot', `<span><span class="kbd">↑↓←→</span> browse</span><span><span class="kbd">Enter</span> select</span><span><span class="kbd">Esc</span> formations</span>${st.off ? `<span><span class="kbd">F</span> flip (${st.flip ? 'flipped' : 'normal'})</span>` : ''}<span><span class="kbd">Tab</span> coach pick ★</span><span><span class="kbd">T</span> timeout (${g.timeouts[st.team]})</span>`);
    panel.appendChild(foot);
    // keep selected card visible
    requestAnimationFrame(() => { const sel = playsEl.querySelector('.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' }); const fs = formsEl.querySelector('.sel'); if (fs) fs.scrollIntoView({ block: 'nearest' }); });
  }

  playcallInput(team, ev, nav) {
    const st = this.pcState[team];
    const form = st.forms[st.fi];
    const cols = Math.max(1, Math.floor((this.layer.playcall.querySelector('.pc-plays')?.clientWidth || 800) / 200));
    if (nav === 'flip' && st.off) { st.flip = !st.flip; this.renderPlaycall(); return; }
    if (nav === 'tab') {
      // Jump to the coach's suggestion
      for (let fi = 0; fi < st.forms.length; fi++) {
        const pi = st.forms[fi].plays.findIndex((p) => p.id === st.suggest || p.special === st.suggest);
        if (pi >= 0) { st.fi = fi; st.pi = pi; st.focus = 'plays'; break; }
      }
      this.renderPlaycall();
      return;
    }
    if (st.focus === 'forms') {
      if (nav === 'up') st.fi = (st.fi + st.forms.length - 1) % st.forms.length;
      else if (nav === 'down') st.fi = (st.fi + 1) % st.forms.length;
      else if (nav === 'right' || nav === 'confirm') { st.focus = 'plays'; st.pi = 0; }
      else return;
      st.pi = 0;
    } else {
      const n = form.plays.length;
      if (nav === 'left') { if (st.pi % cols === 0) st.focus = 'forms'; else st.pi--; }
      else if (nav === 'right') st.pi = Math.min(n - 1, st.pi + 1);
      else if (nav === 'up') { if (st.pi - cols >= 0) st.pi -= cols; }
      else if (nav === 'down') { if (st.pi + cols < n) st.pi += cols; }
      else if (nav === 'back') st.focus = 'forms';
      else if (nav === 'confirm') { this.submitPlay(st); return; }
      else return;
    }
    this.app.audio.click();
    this.renderPlaycall();
  }

  submitPlay(st) {
    const g = this.app.game;
    const form = st.forms[st.fi];
    const p = form.plays[st.pi];
    if (!p) return;
    st.done = true;
    st.lastForm = form.special ? st.lastForm : form.form;
    let call;
    if (p.special === 'punt' || p.special === 'fg') {
      call = { kind: p.special };
    } else if (p.special === 'spike' || p.special === 'kneel') {
      call = { kind: 'scrimmage', play: OFF_PLAYS.find(() => false) || null, flip: false };
      call.play = this.app.specialPlay(p.special);
    } else call = { kind: 'scrimmage', play: p, flip: st.off ? st.flip : false };
    st.lastCall = call;
    this.app.audio.click();
    g.submitCall(st.team, call);
    this.renderPlaycall();
  }

  // ------------------------------------------------------------------ pre-snap
  presnapInput(team, ev) {
    const g = this.app.game;
    const sim = g.sim;
    const a = ev.actions || [];
    const kick = sim.kind !== 'scrimmage';
    if (kick) {
      if (g.isUser(sim.offIdx) && team === sim.offIdx && this.km && (a.includes('kick') || a.includes('snap'))) this.kickPress();
      return;
    }
    const off = team === sim.offIdx;
    if (off) {
      if (a.includes('snap')) { g.snap(); this.app.renderer.clearArt(); return; }
      if (a.includes('hotroute')) return this.hotRouteMenu(team, ev.source);
      if (a.includes('motion')) return this.motionMenu(team, ev.source);
      if (a.includes('audible')) return this.audibleMenu(team, ev.source);
      if (a.includes('hardcount')) { const drew = g.hardCount(); this.toast(drew ? 'Hard count — they jumped! Offside.' : 'Hard count…', 1.2); return; }
      if (a.includes('protection')) {
        const order = ['normal', 'slide_left', 'slide_right', 'max'];
        const i = (order.indexOf(sim.protection) + 1) % order.length;
        sim.protection = order[i];
        if (order[i] === 'max') { for (const e of sim.off) if ((e.pos === 'TE' || e.pos === 'RB' || e.pos === 'FB') && e.task.kind === 'route') sim.setHotRoute(e.tag, 'block'); refreshIcons(sim); }
        this.toast(`Protection: ${{ normal: 'Normal', slide_left: 'Slide left', slide_right: 'Slide right', max: 'Max protect' }[order[i]]}`, 1.4);
        this.drawArt(team);
        return;
      }
    } else {
      if (a.includes('switch')) { cyclePresnapDefender(sim, team); return; }
      if (a.includes('audible')) return this.defAudibleMenu(team, ev.source);
      if (a.includes('shift_d')) {
        sim.dlShift = ((sim.dlShift || 0) + 1) % 3;
        for (const d of sim.def) if (d.pos === 'DL') { const l = d.slot.side || 1; d.presnapShift = { f: 0, l: sim.dlShift === 1 ? -0.6 * l : sim.dlShift === 2 ? 0.7 * l : 0 }; }
        sim.realignDefense(false);
        this.toast(`D-line: ${['Normal', 'Pinch', 'Spread'][sim.dlShift]}`, 1.2);
        return;
      }
      if (a.includes('hotroute')) return this.defHotRouteMenu(team, ev.source);
      if (a.includes('coverage_d')) return this.coverageMenu(team, ev.source);
    }
    if (a.includes('playart')) { this.showArt = !this.showArt; this.drawArt(team); }
  }

  hotRouteMenu(team, source) {
    const sim = this.app.game.sim;
    const recs = (sim.icons || []).filter((e) => e.eligible);
    this.openPopup('Hot Route — pick receiver', recs.map((e, i) => ({ label: `${e.tag} #${e.num} ${e.p.last}`, sub: e.task.kind === 'route' ? routeName(e.task.key) : 'Block', hotkey: i + 1, e })), (it) => {
      this.openPopup(`Hot Route — ${it.e.tag}`, HOT_ROUTES.map((k, i) => ({ label: ROUTES[k].name, hotkey: i + 1, k })), (r) => {
        if (this.app.game.sim === sim && sim.phase === 'presnap') { sim.setHotRoute(it.e.tag, r.k); refreshIcons(sim); this.drawArt(team); this.toast(`${it.e.tag}: ${ROUTES[r.k].name}`, 1); }
      }, { source, corner: true });
    }, { source, corner: true });
  }

  motionMenu(team, source) {
    const sim = this.app.game.sim;
    const recs = sim.off.filter((e) => e.eligible && Math.abs(e.alignL) > 2);
    this.openPopup('Motion — pick player', recs.map((e, i) => ({ label: `${e.tag} #${e.num} ${e.p.last}`, hotkey: i + 1, e })), (it) => {
      const l = it.e.alignL;
      this.openPopup(`Motion — ${it.e.tag}`, [{ label: 'Across the formation', hotkey: 1, to: -Math.sign(l) * Math.max(4, Math.abs(l) * 0.5) }, { label: 'Short motion (tighten)', hotkey: 2, to: l * 0.45 }, { label: 'Jet to the backfield', hotkey: 3, to: -Math.sign(l) * 2.5 }], (m) => {
        if (this.app.game.sim === sim && sim.phase === 'presnap') { sim.setMotion(it.e, m.to); this.app.renderer.clearArt(); }
      }, { source, corner: true });
    }, { source, corner: true });
  }

  audibleMenu(team, source) {
    const g = this.app.game;
    const sim = g.sim;
    const form = sim.offPlay.form;
    const plays = OFF_PLAYS.filter((p) => p.form === form);
    const items = [{ label: 'Flip play', sub: sim.offPlay.name, hotkey: 1, flip: true }, ...plays.slice(0, 8).map((p, i) => ({ label: p.name, sub: p.type === 'run' ? 'Run' : 'Pass', hotkey: i + 2, p }))];
    this.openPopup('Audible', items, (it) => {
      if (g.sim !== sim || sim.phase !== 'presnap') return;
      g.audible(team, it.flip ? sim.offPlay : it.p, it.flip ? !sim.flip : sim.flip);
      this.drawArt(team);
      this.toast(it.flip ? 'Flipped!' : `Audible: ${it.p.name}`, 1.2);
    }, { source, corner: true });
  }

  defAudibleMenu(team, source) {
    const g = this.app.game;
    const sim = g.sim;
    const plays = DEF_PLAYS.filter((p) => p.form === sim.defPlay.form);
    this.openPopup('Defensive audible', plays.map((p, i) => ({ label: p.name, sub: p.cover, hotkey: i + 1, p })), (it) => {
      if (g.sim !== sim || sim.phase !== 'presnap') return;
      g.audibleDefense(team, it.p);
      this.drawArt(team);
      this.toast(`Coverage: ${it.p.name}`, 1.2);
    }, { source, corner: true });
  }

  // Defensive hot route: re-assign the defender you control.
  defHotRouteMenu(team, source) {
    const sim = this.app.game.sim;
    const d = sim.userEnt[team];
    if (!d || d.side !== 'D') return;
    const fl = sim.frame(d.x, d.y).l;
    const st = sim.nums ? sim.nums.strong : 1;
    const sideTag = Math.sign(fl || st) === st ? 'S' : 'W';
    const gap = Math.abs(fl) < 1.3 ? 'A' : Math.abs(fl) < 2.6 ? 'B' : Math.abs(fl) < 4 ? 'C' : 'E';
    const recs = sim.off.filter((e) => e.eligible && e.isActive());
    const near = recs.slice().sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0];
    const items = [
      { label: 'Blitz', sub: `${gap} gap`, a: `b:${gap}_${sideTag}` },
      { label: 'QB spy', a: 'spy' },
      { label: 'Hook zone', a: `z:hook_${Math.abs(fl) < 2 ? 'M' : sideTag}` },
      { label: 'Curl / flat zone', a: `z:curl_${sideTag}` },
      { label: 'Flat zone', a: `z:flat_${sideTag}` },
      { label: 'Deep half', a: `z:deep_half_${sideTag}` },
      { label: 'Deep middle', a: 'z:deep_mid' },
    ];
    if (near) items.push({ label: `Man: ${near.tag} #${near.num} ${near.p.last}`, a: 'm:S1', man: near });
    if (d.pos === 'DL' || d.pos === 'LB') items.push({ label: 'Contain rush', a: 'contain' });
    items.forEach((it, i) => { it.hotkey = i + 1; });
    this.openPopup(`Assign #${d.num} ${d.p.last} (${d.tag})`, items, (it) => {
      if (this.app.game.sim !== sim || sim.phase !== 'presnap') return;
      sim.setDefAssign(d, it.a, it.man || null);
      this.drawArt(team);
      this.toast(`#${d.num}: ${it.label}`, 1.2);
    }, { source, corner: true });
  }

  // Coverage adjustments for the whole defense.
  coverageMenu(team, source) {
    const sim = this.app.game.sim;
    const items = [
      { label: 'Base alignment', show: 0 },
      { label: 'Show blitz', sub: 'Walk LBs and safeties up', show: 1 },
      { label: 'Bail / back off', sub: 'Disguise with depth', show: 2 },
      { label: 'Shade inside', sub: 'Take away slants and digs', shade: 'inside' },
      { label: 'Shade outside', sub: 'Take away outs and corners', shade: 'outside' },
      { label: 'Play underneath', sub: 'Jump short routes, risk deep', shade: 'under' },
      { label: 'Over the top', sub: 'No deep shots, give up short', shade: 'over' },
      { label: 'No shading', shade: null },
      { label: 'Press coverage', sub: 'Jam at the line', press: true },
      { label: 'Play off', sub: 'Cushion', press: false },
    ].map((it, i) => ({ ...it, hotkey: i < 9 ? i + 1 : 0 }));
    this.openPopup('Coverage adjustments', items, (it) => {
      if (this.app.game.sim !== sim || sim.phase !== 'presnap') return;
      if (it.show !== undefined) {
        sim.showBlitz = it.show;
        for (const d of sim.def) if (d.pos === 'S' || d.pos === 'LB') d.presnapShift = { f: it.show === 1 ? -2.5 : it.show === 2 ? 2 : 0, l: 0 };
        sim.realignDefense(false);
      } else if ('shade' in it) sim.setCoverageAdjust('shade', it.shade);
      else sim.setCoverageAdjust('press', it.press);
      this.drawArt(team);
      this.toast(it.label, 1.2);
    }, { source, corner: true });
  }

  drawArt(team) {
    const g = this.app.game;
    if (!g || !g.sim || !this.showArt || !this.app.settings.showArt) { this.app.renderer.clearArt(); return; }
    this.app.renderer.drawPlayArt(g.sim, team);
  }

  // ------------------------------------------------------------------ kick meter
  startKickMeter() {
    const sim = this.app.game.sim;
    const fg = sim.kind === 'fg' || sim.kind === 'xp';
    this.km = { stage: 'aim', aim: 0, power: 0, acc: 1, fg, onside: sim.kind === 'onside', t: 0 };
    this.layer.kick.classList.remove('hidden');
    this.paintKick();
  }
  kickPress() {
    const km = this.km;
    if (!km) return;
    if (km.stage === 'aim') { km.stage = 'power'; km.power = 0; }
    else if (km.stage === 'power') { km.stage = 'acc'; km.acc = 1; }
    else if (km.stage === 'acc') { this.finishKick(); }
    this.app.audio.click();
  }
  finishKick() {
    const km = this.km;
    const g = this.app.game;
    const sim = g.sim;
    const kicker = sim.kicker || sim.punter;
    const kac = kicker ? kicker.r.kac : 75;
    const diffScale = [0.55, 0.8, 1.0, 1.2][g.difficulty];
    const accErr = km.acc * diffScale * (1.25 - kac / 100);
    // Map the meter (0..1.1) to kick power: a ~90-95% bar is a well-struck ball.
    let power = km.fg ? 0.62 + km.power * 0.4 : 0.55 + km.power * 0.43;
    if (km.onside) power = 0.3;
    const params = { power: clamp(power, 0.3, 1.08), acc: accErr * (km.fg ? 1 : 1.2), aim: km.aim };
    this.km = null;
    this.layer.kick.classList.add('hidden');
    g.setKickParams(params);
    g.snap();
  }
  updateKickMeter(dt, src) {
    const km = this.km;
    if (!km) return;
    km.t += dt;
    if (km.stage === 'aim' && src) {
      const lim = km.fg ? 0.09 : 0.3;
      km.aim = clamp(km.aim + (src.axes.x || 0) * dt * (km.fg ? 0.08 : 0.3) * this.app.view.camDir * -1, -lim, lim);
    } else if (km.stage === 'power') {
      km.power += dt * 0.9;
      if (km.power >= 1.1) { km.power = 1.1; km.stage = 'acc'; km.acc = 1; }
    } else if (km.stage === 'acc') {
      km.acc -= dt * 1.7;
      if (km.acc <= -1) { km.acc = -1; this.finishKick(); return; }
    }
    this.paintKick();
  }
  paintKick() {
    const km = this.km;
    if (!km) return;
    const sim = this.app.game.sim;
    const lbl = { kickoff: 'Kickoff', onside: 'Onside Kick', punt: 'Punt', fg: 'Field Goal', xp: 'Extra Point' }[sim.kind];
    const accPos = 50 + km.acc * 46;
    const step = { aim: 'Aim with ←/→ · press <span class="kbd">Space</span> / <span class="kbd">A</span> to start', power: 'Press to set POWER', acc: 'Press in the green for ACCURACY' }[km.stage];
    const fgDist = sim.kind === 'fg' || sim.kind === 'xp' ? ` · ${Math.round(Math.abs((sim.dir > 0 ? 110 : 10) - sim.losX) + 17)} yds` : '';
    const wind = this.app.game.weather.wind > 3 ? ` · Wind ${Math.round(this.app.game.weather.wind)} mph` : '';
    this.layer.kick.innerHTML = `<div style="font-weight:900;letter-spacing:.12em">${lbl.toUpperCase()}${fgDist}${wind}</div>
      <div class="km-bar"><div class="km-fill" style="width:${(km.power / 1.1) * 100}%"></div><div class="km-zone"></div>${km.stage === 'acc' ? `<div class="km-acc" style="left:${accPos}%"></div>` : ''}</div>
      <div class="km-aim">Aim: ${km.aim === 0 ? 'center' : (km.aim > 0 ? '◀ ' : '') + Math.abs(km.aim * 57).toFixed(0) + '°' + (km.aim < 0 ? ' ▶' : '')}</div>
      <div style="font-size:12px;margin-top:6px">${step}</div>`;
  }

  // ------------------------------------------------------------------ PAT / kickoff choice
  openPATChoice(team, source) {
    const g = this.app.game;
    this.openPopup('Point After', [{ label: 'Extra Point', sub: '33-yard kick', k: 'xp' }, { label: 'Two-Point Conversion', sub: 'From the 2', k: 'two' }], (it) => { if (g.phase === 'pat_choice') g.choosePAT(it.k); }, { source, note: `Score: ${g.teams[1].def.abbr} ${g.score[1]} – ${g.teams[0].def.abbr} ${g.score[0]}` });
  }
  openKickChoice(team, source) {
    const g = this.app.game;
    const trailing = g.score[team] < g.score[1 - team];
    const items = [{ label: 'Kickoff', sub: 'Dynamic kickoff from the 35', k: 'kickoff' }];
    if (trailing) items.push({ label: 'Onside Kick (declared)', sub: '~11% recovery', k: 'onside' });
    this.openPopup('Kickoff', items, (it) => { if (g.phase === 'kick_call') g.submitKickoffCall(it.k); }, { source });
  }

  // ------------------------------------------------------------------ replay
  replayInput(ev, nav) {
    const rp = this.app.view.replay;
    const a = ev.actions || [];
    if (nav === 'back' || a.includes('replay')) { this.app.endReplay(); return; }
    if (nav === 'left') rp.idx = Math.max(0, rp.idx - 30);
    if (nav === 'right') rp.idx = Math.min(rp.sim.frames.length - 1, rp.idx + 30);
    if (nav === 'up') rp.radius = Math.max(6, (rp.radius || 16) - 3);
    if (nav === 'down') rp.radius = Math.min(40, (rp.radius || 16) + 3);
    if (ev.type === 'key' && ev.code === 'KeyQ') rp.angle -= 0.5;
    if (ev.type === 'key' && ev.code === 'KeyE') rp.angle += 0.5;
    if (nav === 'confirm') rp.playing = !rp.playing;
  }

  // ------------------------------------------------------------------ per-frame
  preFrame(dt) {
    const app = this.app;
    const g = app.game;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.layer.toast.classList.add('hidden'); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.layer.banner.classList.add('hidden'); }
    if (!g || app.paused || app.intro || app.halftime) return;
    if (g.phase !== this.lastPhase) this.onPhaseChange(this.lastPhase, g.phase);
    if (g.phase === 'kick_call' && g.isUser(g.kickTeam) && !g.calls[g.kickTeam] && !this.popup) this.openKickChoice(g.kickTeam, app.humans[g.kickTeam]);
    if (g.phase === 'pat_choice' && g.isUser(g.possession) && !this.popup) this.openPATChoice(g.possession, app.humans[g.possession]);
    if (g.phase === 'playcall') {
      let changed = false;
      for (const t of [0, 1]) {
        if (!g.isUser(t)) continue;
        const needs = !g.calls[t] || g.calls[t].pending;
        if (needs && (!this.pcState[t] || this.pcState[t].done || this.pcState[t].callId !== g.callId)) { this.openPlaycall(t); this.pcState[t].callId = g.callId; changed = true; }
      }
      if (changed) this.renderPlaycall();
      // Refresh the play clock text occasionally
      this.pcRefresh = (this.pcRefresh || 0) + dt;
      if (this.pcRefresh > 0.5) { this.pcRefresh = 0; const el = this.layer.playcall.querySelector('.pc-head b'); if (el) el.textContent = Math.max(0, Math.ceil(g.playClock)); }
    }
    if (g.phase === 'presnap' && g.sim && g.sim.kind !== 'scrimmage' && g.isUser(g.sim.offIdx) && !g.isCoach(g.sim.offIdx) && !this.km && g.sim.phase === 'presnap') this.startKickMeter();
    if (this.km) this.updateKickMeter(dt, app.humans[g.sim?.offIdx]);
  }

  onPhaseChange(from, to) {
    const g = this.app.game;
    this.lastPhase = to;
    if (to !== 'playcall') { this.layer.playcall.classList.add('hidden'); for (const t of [0, 1]) if (this.pcState[t]) this.pcState[t].done = true; }
    if (to !== 'presnap' && this.km) { this.km = null; this.layer.kick.classList.add('hidden'); }
    if (this.popup && !(to === 'presnap' && from === 'presnap')) this.closePopup();
    if (to === 'presnap' && g.sim && g.sim.kind === 'scrimmage') {
      const ut = [0, 1].find((t) => g.isUser(t));
      if (ut !== undefined && this.app.humanCount() === 1) this.drawArt(ut);
      else this.app.renderer.clearArt();
    } else this.app.renderer.clearArt();
  }

  postFrame(dt) {
    const app = this.app;
    const g = app.game;
    const L = this.layer;
    if (!g) return;
    const inPlay = !app.view.replay;
    L.hud.classList.toggle('hidden', !!app.view.replay);
    L.replay.classList.toggle('hidden', !app.view.replay);
    this.paintHUD(g);
    // Ticker
    if (this.tickerT > 0) { this.tickerT -= dt; if (this.tickerT <= 0) L.ticker.classList.add('hidden'); }
    this.paintHints(g);
    this.paintIcons(g, inPlay);
  }

  showTicker(text) {
    if (!text) return;
    this.layer.ticker.textContent = text;
    this.layer.ticker.classList.remove('hidden');
    this.tickerT = 6;
  }

  paintHUD(g) {
    const L = this.layer;
    const A = g.teams[1].def, H = g.teams[0].def;
    const q = g.quarter <= 4 ? ordinal(g.quarter) : (g.quarter === 5 ? 'OT' : `${g.quarter - 4}OT`);
    const tos = (t) => [0, 1, 2].map((i) => `<i class="${i < g.timeouts[t] ? '' : 'used'}"></i>`).join('');
    const dd = g.phase === 'kick_call' || (g.sim && (g.sim.kind === 'kickoff' || g.sim.kind === 'onside')) ? 'KICKOFF' : g.conversion ? 'PAT · 2PT' : g.sim && g.sim.kind === 'xp' ? 'EXTRA POINT' : `${g.downText()} · ${g.ballSpotText()}`;
    const showPC = (g.phase === 'presnap' || g.phase === 'playcall') && g.sim?.kind !== 'kickoff';
    const key = `${g.score}|${q}|${Math.ceil(g.clock)}|${dd}|${showPC ? Math.ceil(g.playClock) : ''}|${g.timeouts}|${g.possession}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    const pc = Math.max(0, Math.ceil(g.playClock));
    L.hud.innerHTML = `
      <div class="sb-team" style="background:${A.primary}"><span class="abbr">${A.abbr}</span><span class="pts">${g.score[1]}</span><div class="tos">${tos(1)}</div>${g.possession === 1 ? '<div class="poss"></div>' : ''}</div>
      <div class="sb-team" style="background:${H.primary}"><span class="abbr">${H.abbr}</span><span class="pts">${g.score[0]}</span><div class="tos">${tos(0)}</div>${g.possession === 0 ? '<div class="poss"></div>' : ''}</div>
      <div class="sb-mid"><span class="q">${q}</span><span class="clk">${formatClock(g.clock)}</span></div>
      <div class="sb-dd">${dd}</div>
      ${showPC ? `<div class="sb-pc ${pc <= 5 ? 'low' : ''}">${pc}</div>` : ''}`;
    if (!this.app.view.replay) L.hud.classList.remove('hidden');
  }

  paintHints(g) {
    const L = this.layer;
    const app = this.app;
    const sim = g.sim;
    let html = '';
    const userTeam = [0, 1].find((t) => g.isUser(t));
    const pad = userTeam !== undefined && app.humans[userTeam] && app.humans[userTeam].kind === 'gamepad';
    const k = (kb, gp) => `<span class="kbd">${pad ? gp : kb}</span>`;
    if (g.phase === 'presnap' && sim && sim.kind === 'scrimmage' && userTeam !== undefined) {
      if (g.isCoach(sim.offIdx)) html = `<div>Coach mode — ${k('H', 'Y')} Hot route ${k('M', 'LB')} Motion ${k('B', 'X')} Audible ${k('L', '—')} Protect</div>`;
      else if (g.isUser(sim.offIdx)) html = `<div>${k('Space', 'A')} Snap ${k('H', 'Y')} Hot route ${k('M', 'LB')} Motion</div><div>${k('B', 'X')} Audible ${k('K', '—')} Hard count ${k('L', '—')} Protect ${k('I', 'LT')} Art</div>`;
      else html = `<div>${k('Tab', 'B')} Switch ${k('B', 'X')} Audible ${k('H', 'Y')} Assign player</div><div>${k('N', 'RB')} Coverage ${k('J', 'LB')} D-line shift ${k('I', 'LT')} Art</div>`;
    } else if (g.phase === 'live' && sim && userTeam !== undefined) {
      const u = sim.userEnt[userTeam];
      if (u && u.hasBall && u === sim.qb && !sim.thrown && sim.playType !== 'run' && !u.qbRunner) html = `<div>${k('1-5', 'A B X Y RB')} Throw (tap=lob · hold=bullet)</div><div>${k('X', 'LB')} Throw away · move to scramble</div>`;
      else if (u && u.hasBall) html = `<div>${k('Q/E', 'RS ←→')} Juke ${k('R', 'B')} Spin ${k('F', 'A')} Stiff arm</div><div>${k('C', 'RS ↑')} Truck ${k('V', 'Y')} Hurdle ${k('Z', 'X')} Dive ${k('Shift', 'RT')} Sprint</div>`;
      else if (u && u.team !== sim.possession) html = `<div>${k('Tab', 'B')} Switch ${k('Space', 'X')} Dive tackle ${k('F', 'RS ↑')} Hit stick</div><div>${k('Q', 'RB')} Strip ${k('E', 'X')} Swat ${k('R', 'Y')} Play ball</div>`;
    } else if (g.phase === 'post') html = `<div>${k('Y', 'Y')} Instant replay · ${k('Space', 'A')} Continue</div>`;
    if (html !== this.hintKey) { this.hintKey = html; L.hints.innerHTML = html; }
    L.hints.classList.toggle('hidden', !html || !!app.view.replay);
    // Play info for the human
    let info = '';
    if (sim && sim.kind === 'scrimmage' && userTeam !== undefined && app.humanCount() === 1 && (g.phase === 'presnap' || g.phase === 'live')) {
      if (g.isUser(sim.offIdx)) info = `<b>${sim.offPlay.name}</b><br>${OFF_FORMATIONS[sim.offPlay.form].name}${sim.flip ? ' (flipped)' : ''}`;
      else info = `<b>${sim.defPlay.name}</b><br>${DEF_FORMATIONS[sim.defPlay.form].name} · ${sim.defPlay.cover}`;
    }
    if (info !== this.infoKey) { this.infoKey = info; L.playinfo.innerHTML = info; }
    L.playinfo.classList.toggle('hidden', !info || !!app.view.replay);
  }

  paintIcons(g, inPlay) {
    const L = this.layer;
    const sim = g.sim;
    const r = this.app.renderer;
    let html = '';
    if (sim && inPlay && sim.kind === 'scrimmage' && (g.phase === 'presnap' || g.phase === 'live')) {
      const offUser = g.isUser(sim.offIdx) && !g.isCoach(sim.offIdx);
      const qbHas = sim.qb && (sim.qb.hasBall || sim.phase === 'presnap' || sim.ball.state === 'snap') && !sim.thrown && !sim.qb.qbRunner;
      if (offUser && qbHas && sim.playType !== 'run' && sim.icons) {
        const src = this.app.humans[sim.offIdx];
        const pad = src && src.kind === 'gamepad';
        sim.icons.forEach((e, i) => {
          const p = r.project(e.x, e.y, 2.7);
          if (!p.visible) return;
          const lbl = pad ? PAD_GLYPH['pass' + (i + 1)] : String(i + 1);
          const blocking = e.task && (e.task.kind === 'passblock');
          html += `<div class="ricon c${i + 1} ${blocking ? 'dim' : ''}" style="left:${p.x}px;top:${p.y}px">${lbl}</div>`;
        });
      }
      // Name tags for controlled players
      for (const t of [0, 1]) {
        const u = sim.userEnt[t];
        if (!u || !g.isUser(t)) continue;
        if (offUser && t === sim.offIdx && qbHas && sim.playType !== 'run') continue;
        const p = r.project(u.x, u.y, 2.6);
        if (p.visible) html += `<div class="tag" style="left:${p.x}px;top:${p.y}px">#${u.num} ${u.p.last}</div>`;
      }
    }
    if (html !== this.iconKey) { this.iconKey = html; L.icons.innerHTML = html; }
    L.icons.classList.toggle('hidden', !html);
    // Pass power meter while holding a pass key
    const devs = sim && g.isUser(sim.offIdx) ? this.app.devicesFor(sim.offIdx) : [];
    let hold = 0;
    if (devs.length && g.phase === 'live' && sim.qb && sim.qb.hasBall && !sim.thrown) for (const src of devs) for (let i = 1; i <= 5; i++) hold = Math.max(hold, src.holdTime('pass' + i, performance.now()));
    if (hold > 0.04) { L.passmeter.classList.remove('hidden'); L.passmeter.querySelector('i').style.width = `${Math.min(100, (hold / 0.45) * 100)}%`; }
    else L.passmeter.classList.add('hidden');
  }

  // ------------------------------------------------------------------ results
  onResult(g, r) {
    const s = g.sim;
    this.showTicker(g.lastText);
    let b = null, cls = '';
    if (r.td !== null) { b = 'Touchdown'; cls = 'td'; }
    else if (r.safety !== null) { b = 'Safety'; cls = 'bad'; }
    else if (r.stats.intBy) { b = 'Intercepted'; cls = 'bad'; }
    else if (r.turnover && r.stats.fumbleBy) { b = 'Fumble'; cls = 'bad'; }
    else if (s.kind === 'fg' || s.kind === 'xp') { b = r.fg ? "It's Good" : 'No Good'; cls = r.fg ? 'td' : 'bad'; }
    else if (r.playType === 'sack') { b = 'Sack'; cls = 'bad'; }
    else if (g.lastText && g.lastText.includes('Turnover on downs')) { b = 'Turnover on Downs'; cls = 'bad'; }
    else if (g.lastText && g.lastText.includes('FIRST DOWN')) b = 'First Down';
    else if (g.lastText && g.lastText.startsWith('PENALTY')) { b = 'Flag'; cls = 'bad'; }
    if (b) this.banner(b, cls);
  }

  showBoxScore(g, opts = {}) {
    const A = g.teams[1].def, H = g.teams[0].def;
    const box = g.box;
    const el = h('div', opts.overlay ? 'pause-wrap' : 'screen');
    const p = h('div', 'panel box');
    const qcols = box.quarters[0].length;
    const qh = Array.from({ length: qcols }, (_, i) => `<th>${i < 4 ? i + 1 : 'OT'}</th>`).join('');
    const qrow = (t) => box.quarters[t].map((v) => `<td>${v}</td>`).join('');
    const ts = (t) => box.team[t];
    const statRow = (label, f) => `<tr><td>${label}</td><td>${f(1)}</td><td>${f(0)}</td></tr>`;
    const leaders = (t) => {
      const L = box.leaders(t);
      const out = [];
      if (L.pass) out.push(`${L.pass.m.name}: ${L.pass.s.cmp}/${L.pass.s.att}, ${L.pass.s.pyds} yds, ${L.pass.s.ptd} TD, ${L.pass.s.int} INT`);
      if (L.rush) out.push(`${L.rush.m.name}: ${L.rush.s.ratt} car, ${L.rush.s.ryds} yds, ${L.rush.s.rtd} TD`);
      if (L.rec) out.push(`${L.rec.m.name}: ${L.rec.s.rec} rec, ${L.rec.s.recyds} yds, ${L.rec.s.rectd} TD`);
      return out.join('<br>') || '—';
    };
    const top = (t) => formatClock(ts(t).top);
    p.innerHTML = `<h1>${opts.title || (g.over ? 'Final' : 'Box Score')}</h1>
      <div class="scoreline">${badgeHTML(A)}<div class="big">${g.score[1]}</div><div style="color:var(--dim)">—</div><div class="big">${g.score[0]}</div>${badgeHTML(H)}</div>
      <table><tr><th>Team</th>${qh}<th>T</th></tr><tr><td>${A.city} ${A.name}</td>${qrow(1)}<td><b>${g.score[1]}</b></td></tr><tr><td>${H.city} ${H.name}</td>${qrow(0)}<td><b>${g.score[0]}</b></td></tr></table>
      <table><tr><th>Team stats</th><th>${A.abbr}</th><th>${H.abbr}</th></tr>
      ${statRow('Total yards', (t) => ts(t).yards)}${statRow('Passing', (t) => `${ts(t).passCmp}/${ts(t).passAtt}, ${ts(t).passYds}`)}${statRow('Rushing', (t) => `${ts(t).rushAtt}-${ts(t).rushYds}`)}
      ${statRow('First downs', (t) => ts(t).firstDowns)}${statRow('3rd down', (t) => `${ts(t).thirdConv}/${ts(t).third}`)}${statRow('Turnovers', (t) => ts(t).turnovers)}
      ${statRow('Sacks allowed', (t) => ts(t).sacks)}${statRow('Penalties', (t) => `${ts(t).penalties}-${ts(t).penYds}`)}${statRow('Field goals', (t) => `${ts(t).fgm}/${ts(t).fga}`)}${statRow('Time of possession', top)}</table>
      <div class="row" style="align-items:flex-start;gap:20px;font-size:13px"><div style="flex:1"><b>${A.name}</b><br>${leaders(1)}</div><div style="flex:1"><b>${H.name}</b><br>${leaders(0)}</div></div>
      <h3 style="font-size:12px;letter-spacing:.2em;color:var(--dim);margin:14px 0 6px">PLAY-BY-PLAY</h3><div class="log">${g.log.slice(-60).reverse().map((l) => `<div>${l}</div>`).join('')}</div>`;
    const btns = h('div', 'row');
    btns.style.marginTop = '14px';
    const list = [];
    for (const [label, fn, cls] of opts.buttons || []) { const b = h('button', `btn ${cls || ''}`, label); b.onclick = fn; btns.appendChild(b); list.push(b); }
    p.appendChild(btns);
    el.appendChild(p);
    this.setScreen(el, (nav) => {
      const i = list.findIndex((b) => b.classList.contains('sel'));
      if (nav === 'left' || nav === 'up') { list.forEach((b) => b.classList.remove('sel')); list[(Math.max(0, i) + list.length - 1) % list.length]?.classList.add('sel'); }
      else if (nav === 'right' || nav === 'down') { list.forEach((b) => b.classList.remove('sel')); list[(i + 1) % list.length]?.classList.add('sel'); }
      else if (nav === 'confirm') (list[Math.max(0, i)] || list[0])?.click();
      else if (nav === 'back' && opts.onBack) opts.onBack();
    });
    if (list[0]) list[0].classList.add('sel');
  }

  showIntro(g) {
    this.hideIntro();
    const A = g.teams[1].def, H = g.teams[0].def;
    const ra = g.teams[1].ratings, rh = g.teams[0].ratings;
    const wx = g.weather.label === 'clear' ? (g.settings.time === 'night' ? 'Clear night' : 'Clear skies') : g.weather.label === 'wind' ? `Windy · ${Math.round(g.weather.wind)} mph` : g.weather.label[0].toUpperCase() + g.weather.label.slice(1);
    const sub = g.seasonGame ? (g.settings.playoff ? 'Playoffs' : 'Season game') : g.scenario === 'drill' ? 'Two-Minute Drill' : 'Exhibition';
    const el = h('div', 'intro-card');
    el.innerHTML = `<div class="ic-sub">${sub} · ${H.city} · ${wx}</div>
      <div class="ic-row"><div class="ic-team">${badgeHTML(A)}<b>${A.city}</b><span>${A.name}</span><small>OVR ${ra.ovr}</small></div>
      <div class="ic-at">@</div>
      <div class="ic-team">${badgeHTML(H)}<b>${H.city}</b><span>${H.name}</span><small>OVR ${rh.ovr}</small></div></div>
      <div class="ic-skip">Press any key to skip</div>`;
    this.root.appendChild(el);
    this.introEl = el;
  }
  hideIntro() { if (this.introEl) { this.introEl.remove(); this.introEl = null; } }

  showPause() {
    const app = this.app;
    const el = h('div', 'pause-wrap');
    const p = h('div', 'panel ts-settings');
    p.style.minWidth = '320px';
    p.innerHTML = '<h2>Paused</h2>';
    const items = [
      ['Resume', () => app.togglePause()],
      ['Instant Replay (last play)', () => { app.togglePause(); app.startReplay(); }],
      ['Box Score', () => this.showBoxScore(app.game, { overlay: true, title: 'Box Score', buttons: [['Back', () => this.showPause()]], onBack: () => this.showPause() })],
      ['Controls', () => this.showControls(() => this.showPause())],
      ['Settings', () => this.showSettings(() => this.showPause())],
      ['Quit to Main Menu', () => app.quitToMenu()],
    ];
    const btns = items.map(([t, fn]) => { const b = h('button', 'mbtn', t); b.onclick = fn; p.appendChild(b); return b; });
    el.appendChild(p);
    this.setScreen(el, this.listNav(btns, () => app.togglePause()));
  }
}
