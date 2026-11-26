// Gridiron 27 — application entry: game loop, screens, input routing, audio.
import './ui/styles.css';
import { Renderer } from './render/renderer.js';
import { Input } from './input/input.js';
import { Audio } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { Game } from './sim/game.js';
import { defaultLeague } from './data/league.js';
import { SPECIAL_OFF } from './data/playbook_offense.js';
import { RNG } from './core/rng.js';
import { DT } from './core/constants.js';
import { SeasonUI } from './season/season_ui.js';

const DEFAULT_SETTINGS = { graphics: 'auto', showFps: false, camera: 'standard', volume: 0.7, gameSpeed: 1, autoSprint: false, showArt: true, difficulty: 1, quarterLen: 5, announcer: true, coachMode: false };

class App {
  constructor() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, this.loadSettings());
    this.container = document.getElementById('app');
    this.input = new Input();
    this.audio = new Audio();
    this.audio.setVolume(this.settings.volume);
    this.audio.announcer = this.settings.announcer;
    this.renderer = new Renderer(this.container, this.settings);
    this.view = { camDir: 1, camMode: this.settings.camera, replay: null, followReturn: true };
    this.ui = new UI(this);
    this.season = new SeasonUI(this);
    this.openSeason = () => this.season.open();
    this.game = null;
    this.attract = null;
    this.humans = [null, null];
    this.paused = false;
    this.acc = 0;
    this.last = performance.now();
    this.lastSim = null;
    this.evIdx = new WeakMap();
    this.input.on((ev) => { if (ev.type === 'padconnect') this.ui.toast(`Gamepad ${this.input.pads.length} connected`, 1.6); this.audio.resume(); });
    window.addEventListener('pointerdown', () => this.audio.resume(), { once: false });
    this.startAttract();
    this.ui.showMainMenu();
    const loading = document.getElementById('loading');
    if (loading) loading.remove();
    requestAnimationFrame((t) => this.loop(t));
  }

  loadSettings() { try { return JSON.parse(localStorage.getItem('g27-settings') || '{}'); } catch { return {}; } }
  saveSettings() { try { localStorage.setItem('g27-settings', JSON.stringify(this.settings)); } catch { /* storage unavailable */ } }
  applySettings(key) {
    if (key === 'volume') this.audio.setVolume(this.settings.volume);
    if (key === 'announcer') this.audio.announcer = this.settings.announcer;
    if (key === 'camera') this.view.camMode = this.settings.camera;
    if (key === 'graphics') this.renderer.setQuality(this.settings.graphics);
    if (key === 'autoSprint') for (const s of this.input.sources()) s.autoSprint = this.settings.autoSprint;
    this.saveSettings();
  }

  league() { return this.seasonLeague || defaultLeague(); }
  specialPlay(kind) { return SPECIAL_OFF[kind]; }
  humanCount() { return this.humans.filter(Boolean).length; }
  teamOf(src) {
    const i = this.humans.indexOf(src);
    if (i >= 0) return i;
    for (let t = 0; t < 2; t++) if (this.humans[t] && this.devicesFor(t).includes(src)) return t;
    return null;
  }

  // Devices that drive a human team: in a one-player game every connected device works
  // (keyboard and any pad); otherwise the assigned device, or the keyboard if that pad dropped out.
  devicesFor(tm) {
    const src = this.humans[tm];
    if (!src) return [];
    if (this.humanCount() === 1) return this.input.sources().filter((s) => !s.disconnected);
    if (src.disconnected && !this.humans.includes(this.input.keyboard)) return [this.input.keyboard];
    return [src];
  }

  controllerFor(tm) {
    const cam = this.view.camDir;
    const devs = this.devicesFor(tm);
    if (devs.length <= 1) return (devs[0] || this.humans[tm]).controller(cam);
    const cs = devs.map((d) => d.controller(cam));
    let best = cs[0], bm = -1;
    for (const c of cs) { const m = Math.hypot(c.mx, c.my); if (m > bm) { bm = m; best = c; } }
    const held = new Set(), pressed = new Set(), released = new Map();
    for (const c of cs) { c.held.forEach((a) => held.add(a)); c.pressed.forEach((a) => pressed.add(a)); c.released.forEach((v, k) => released.set(k, v)); }
    return { ...best, sprint: cs.some((c) => c.sprint), held, pressed, released, color: this.humans[tm].color };
  }

  // ------------------------------------------------------------------ attract mode
  startAttract() {
    const lg = defaultLeague();
    const rng = new RNG((Math.random() * 1e9) >>> 0);
    const a = rng.int(0, 31); let b = rng.int(0, 31); if (a === b) b = (b + 7) % 32;
    this.attract = new Game({ teams: [lg[a], lg[b]], settings: { quarterLen: 15, difficulty: 2, accel: true, accelTo: 20, weather: rng.pick(['clear', 'clear', 'rain', 'snow']), time: rng.chance(0.5) ? 'night' : 'day' }, rng });
    this.renderer.setupGame(this.attract);
    this.attract.start();
  }

  // ------------------------------------------------------------------ games
  startGame({ home, away, humans, settings, scenario, season, teams }) {
    this.ui.clearScreen();
    this.attract = null;
    const lg = this.league();
    const ts = teams || [lg[home], lg[away]];
    for (const s of this.input.sources()) s.autoSprint = this.settings.autoSprint;
    this.humans = humans.slice();
    // Controllers array is shared with the sim; entries are refreshed each tick.
    const controllers = [humans[0] ? humans[0].controller(1) : null, humans[1] ? humans[1].controller(1) : null];
    const rng = new RNG((Math.random() * 1e9) >>> 0);
    const coachMode = !!this.settings.coachMode && !scenario && !(settings && settings.practice);
    this.game = new Game({ teams: ts, settings: Object.assign({ gameSpeed: this.settings.gameSpeed, coachMode }, settings), controllers, rng, scenario });
    this.game.seasonGame = season || null;
    this.gameOpts = { home, away, humans, settings, scenario, season, teams };
    this.renderer.setupGame(this.game);
    this.renderer.snapCamera();
    this.view.replay = null;
    this.paused = false;
    this.ui.pcState = {};
    this.ui.lastPhase = null;
    this.game.on((type, data, g) => this.onGameEvent(type, data, g));
    this.game.start();
    this.audio.resume();
    this.audio.crowd(0.45);
    this.halftime = false;
    // Pre-game flyover with the matchup card (skippable with any key)
    if (!this.game.settings.practice) {
      this.intro = { t: 0, dur: this.game.scenario ? 3.5 : 6.5 };
      this.view.intro = this.intro;
      this.ui.showIntro(this.game);
      const A = this.game.teams[1].def, H = this.game.teams[0].def;
      this.audio.say(this.game.scenario ? `Two minute drill. ${H.name} trail by four.` : `Welcome to ${H.city}. The ${A.name} take on the ${H.name}.`);
    }
  }

  endIntro() {
    if (!this.intro) return;
    this.intro = null;
    this.view.intro = null;
    this.ui.hideIntro();
    this.renderer.snapCamera();
  }

  resumeHalftime() {
    this.halftime = false;
    this.ui.clearScreen();
  }

  onGameEvent(type, data, g) {
    if (g !== this.game) return;
    const R = this.renderer;
    if (type === 'result') {
      this.lastSim = g.sim;
      this.ui.onResult(g, data.result);
      this.audio.whistle();
      const r = data.result;
      const s = g.sim;
      const gain = r.turnover ? 0 : (r.endX - s.losX) * s.dir;
      if (r.td !== null || r.stats.intBy || (r.turnover && r.stats.fumbleBy) || gain > 18) this.audio.roar(0.8);
      // Board flashes and PA calls for the big moments
      if (r.stats.intBy) { R.flashBoard('INTERCEPTION', '#ff4f5e', 1 - s.offIdx); this.audio.say('Intercepted!'); }
      else if (r.turnover && r.stats.fumbleBy && s.kind === 'scrimmage') { R.flashBoard('FUMBLE', '#ff4f5e', 1 - s.offIdx); this.audio.say('Fumble! Turnover!'); }
      else if ((s.kind === 'fg') && r.td === null) { if (r.fg) { R.flashBoard('FIELD GOAL', '#3ddc84', s.kickTeam); this.audio.say('The kick is good!'); } else this.audio.say('No good!'); }
      else if (r.safety !== null && r.safety !== undefined) { R.flashBoard('SAFETY', '#ffcf1f', r.safety); this.audio.say('Safety!'); }
      else if (r.playType === 'sack' && this.rng01() < 0.5) this.audio.say('Sacked!');
      else if (g.lastText && g.lastText.includes('FIRST DOWN') && gain >= 15 && this.rng01() < 0.7) this.audio.say('First down!');
    } else if (type === 'touchdown') {
      this.audio.horn(); this.audio.roar(1);
      const t = g.teams[data.team].def;
      R.flashBoard('TOUCHDOWN', t.primary, data.team);
      this.audio.say(`Touchdown, ${t.name}!`);
    }
    else if (type === 'snap') this.audio.snap();
    else if (type === 'drive') { if (this.humanCount() > 0 || this.game.isCoach(0) || this.game.isCoach(1)) this.ui.showDrive(g, data); }
    else if (type === 'twominute') { this.ui.toast('Two-Minute Warning', 2); this.audio.say('Two minute warning.'); }
    else if (type === 'timeout') this.audio.whistle();
    else if (type === 'quarter_end') this.ui.toast(`End of ${['', '1st', '2nd', '3rd', '4th'][data.quarter] || 'OT'} quarter`, 2);
    else if (type === 'halftime') {
      if (this.humanCount() > 0) {
        this.halftime = true;
        this.ui.showBoxScore(g, { overlay: true, title: 'Halftime', buttons: [['Start Second Half', () => this.resumeHalftime(), 'primary']], onBack: () => this.resumeHalftime() });
        this.audio.say('That will do it for the first half.');
      } else this.ui.toast('Halftime', 2.5);
    }
    else if (type === 'overtime') { this.ui.toast('Overtime!', 2.5); this.audio.say('We are headed to overtime!'); }
    else if (type === 'penalty') { this.ui.showTicker(`FLAG: ${data.text || data.type}`); if (this.rng01() < 0.6) this.audio.say(`Flag on the play. ${data.text || ''}`); }
    else if (type === 'final') {
      R.flashBoard('FINAL', '#19d3ff', g.score[0] > g.score[1] ? 0 : g.score[1] > g.score[0] ? 1 : null);
      this.audio.say("That's the ball game!");
      setTimeout(() => this.onFinal(g), 1800);
    }
  }

  rng01() { return Math.random(); }

  onFinal(g) {
    if (g !== this.game) return;
    if (g.seasonGame) { this.season.onUserGameFinal(g); return; }
    this.ui.hideInGame();
    this.ui.showBoxScore(g, { buttons: [['Rematch', () => this.startGame(this.gameOpts), 'primary'], ['Main Menu', () => this.quitToMenu()]] });
  }

  quitToMenu() {
    this.game = null;
    this.paused = false;
    this.view.replay = null;
    this.humans = [null, null];
    this.ui.hideInGame();
    this.startAttract();
    this.ui.showMainMenu();
  }

  togglePause() {
    if (!this.game || this.game.over) return;
    this.paused = !this.paused;
    if (this.paused) this.ui.showPause(); else this.ui.clearScreen();
  }

  startReplay() {
    const sim = this.lastSim;
    if (!sim || !sim.frames.length) return;
    this.view.replay = { sim, idx: 0, speed: 0.6, playing: true, angle: Math.PI * 0.75, radius: 16 };
    this.renderer.bindPlay(sim);
  }
  endReplay() { this.view.replay = null; this.renderer.boundSim = null; this.renderer.snapCamera(); }

  // Camera direction: behind the human's unit (offense or defense).
  updateCamDir(g) {
    const sim = g.sim;
    if (!sim) return;
    let dir = sim.dir;
    const humans = [0, 1].filter((t) => g.isUser(t) && !g.isCoach(t));
    this.view.userTeam = humans.length === 1 ? humans[0] : null;
    if (sim.kind === 'scrimmage') {
      if (humans.length === 1 && humans[0] !== sim.offIdx) dir = -sim.dir;
      if (sim.carrier && sim.carrier.team !== sim.offIdx && humans.length === 1 && humans[0] === sim.carrier.team) dir = sim.attackDir(sim.carrier.team);
    } else {
      dir = sim.dir;
      if (sim.carrier && sim.carrier.team === sim.recvTeam && sim.phase === 'run') dir = sim.attackDir(sim.carrier.team);
    }
    this.view.camDir = dir;
  }

  // ------------------------------------------------------------------ loop
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.1);
    this.input.poll();
    const g = this.game || this.attract;
    this.view.excite = this.audio.crowdLevel || 0;
    if (this.intro) {
      this.intro.t += dt;
      if (this.intro.t >= this.intro.dur) this.endIntro();
    }
    if (this.game) {
      this.ui.preFrame(dt);
      if (!this.paused && !this.view.replay && !this.intro && !this.halftime) {
        this.updateCamDir(this.game);
        this.acc += dt * (this.game.settings.gameSpeed || 1);
        let steps = 0;
        while (this.acc >= DT && steps < 8) {
          for (const tm of [0, 1]) if (this.humans[tm]) this.game.controllers[tm] = this.controllerFor(tm);
          this.game.update(DT);
          for (const s of this.input.sources()) s.consume();
          this.acc -= DT;
          steps++;
        }
        if (steps === 8) this.acc = 0;
        this.view.alpha = Math.min(1, this.acc / DT);
        this.playSimSounds(this.game.sim);
      } else {
        for (const s of this.input.sources()) s.consume();
      }
      if (this.view.replay) {
        const rp = this.view.replay;
        if (rp.playing) rp.idx += dt * 30 * rp.speed;
        if (rp.idx >= rp.sim.frames.length - 1) { rp.idx = rp.sim.frames.length - 1; rp.playing = false; }
        rp.angle += dt * 0.15;
      }
    } else if (this.attract) {
      this.view.camDir = this.attract.sim ? this.attract.sim.dir : 1;
      this.acc += dt;
      while (this.acc >= DT) { this.attract.update(DT); this.acc -= DT; }
      this.view.alpha = Math.min(1, this.acc / DT);
      // Keep the demo flowing: auto-advance through any phase
      if (this.attract.over) this.startAttract();
      for (const s of this.input.sources()) s.consume();
    }
    this.renderer.update(dt, g, this.view);
    if (this.game) this.ui.postFrame(dt);
    this.ui.fpsFrame(this.settings.showFps ? this.renderer : null);
    this.audio.tick(dt);
  }

  playSimSounds(sim) {
    if (!sim) return;
    let i = this.evIdx.get(sim) || 0;
    const evs = sim.events;
    for (; i < evs.length; i++) {
      const e = evs[i];
      switch (e.type) {
        case 'tackle': this.audio.hit(!!e.hit); break;
        case 'sack': this.audio.hit(true); this.audio.roar(0.6); break;
        case 'catch': this.audio.catch_(); break;
        case 'kick': case 'punt': case 'fgkick': this.audio.kick(); break;
        case 'truck': case 'pancake': this.audio.hit(true); break;
        case 'int': this.audio.roar(1); break;
        default: break;
      }
    }
    this.evIdx.set(sim, i);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try { window.__app = new App(); }
  catch (e) {
    console.error(e);
    const l = document.getElementById('loading');
    if (l) l.textContent = 'Could not start: ' + e.message + ' — your browser needs WebGL.';
  }
});
