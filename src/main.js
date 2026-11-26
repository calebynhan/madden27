// Gridiron 27 — application entry: game loop, screens, input routing, audio.
import './ui/styles.css';
import { Renderer } from './render/renderer.js';
import { Input } from './input/input.js';
import { Audio } from './audio/audio.js';
import { Booth } from './audio/commentary.js';
import { UI } from './ui/ui.js';
import { Game } from './sim/game.js';
import { defaultLeague } from './data/league.js';
import { SPECIAL_OFF } from './data/playbook_offense.js';
import { RNG } from './core/rng.js';
import { DT } from './core/constants.js';
import { SeasonUI } from './season/season_ui.js';

const DEFAULT_SETTINGS = { graphics: 'auto', showFps: false, camera: 'standard', volume: 0.7, gameSpeed: 1, autoSprint: false, showArt: true, difficulty: 1, quarterLen: 5, commentary: 'all', coachMode: false };

class App {
  constructor() {
    const saved = this.loadSettings();
    // Older saves had an on/off announcer switch; carry "off" over to the commentary setting
    if (saved.announcer === false && saved.commentary === undefined) saved.commentary = 'off';
    delete saved.announcer;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    this.container = document.getElementById('app');
    this.input = new Input();
    this.audio = new Audio();
    this.audio.setVolume(this.settings.volume);
    this.booth = new Booth();
    this.booth.mode = this.settings.commentary;
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
    if (key === 'commentary') { this.booth.mode = this.settings.commentary; if (this.booth.mode === 'off') this.audio.voices.start([]); }
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
      this.audio.say(this.booth.event(this.game, this.game.scenario ? 'drill' : 'welcome'));
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
      // Board flashes for the big moments
      if (r.stats.intBy) R.flashBoard('INTERCEPTION', '#ff4f5e', 1 - s.offIdx);
      else if (r.turnover && r.stats.fumbleBy && s.kind === 'scrimmage') R.flashBoard('FUMBLE', '#ff4f5e', 1 - s.offIdx);
      else if ((s.kind === 'fg') && r.td === null && r.fg) R.flashBoard('FIELD GOAL', '#3ddc84', s.kickTeam);
      else if (r.safety !== null && r.safety !== undefined) R.flashBoard('SAFETY', '#ffcf1f', r.safety);
      this.crowdReact(g, s, r);
      // The booth calls the play (and maybe adds color)
      const c = this.booth.call(g, s, r);
      if (c) this.audio.call(c.pbp, c.color);
    } else if (type === 'touchdown') {
      this.audio.horn();
      const t = g.teams[data.team].def;
      R.flashBoard('TOUCHDOWN', t.primary, data.team);
    }
    else if (type === 'snap') {
      this.audio.snap();
      this.booth.snap(g);
      this.audio.hush();
      this.audio.chant(false);
      if (g.sim && g.sim.kind !== 'scrimmage') this.audio.roar(0.3); // the kick is away
      this.audio.crowd(Math.min(this.audio.base, 0.6));
    }
    else if (type === 'phase') this.crowdMood(g, data);
    else if (type === 'drive') { if (this.humanCount() > 0 || this.game.isCoach(0) || this.game.isCoach(1)) this.ui.showDrive(g, data); }
    else if (type === 'twominute') { this.ui.toast('Two-Minute Warning', 2); this.audio.queue(this.booth.event(g, 'twominute')); }
    else if (type === 'timeout') this.audio.whistle();
    else if (type === 'quarter_end') this.ui.toast(`End of ${['', '1st', '2nd', '3rd', '4th'][data.quarter] || 'OT'} quarter`, 2);
    else if (type === 'halftime') {
      if (this.humanCount() > 0) {
        this.halftime = true;
        this.ui.showBoxScore(g, { overlay: true, title: 'Halftime', buttons: [['Start Second Half', () => this.resumeHalftime(), 'primary']], onBack: () => this.resumeHalftime() });
        this.audio.queue(this.booth.event(g, 'halftime'));
      } else this.ui.toast('Halftime', 2.5);
    }
    else if (type === 'overtime') { this.ui.toast('Overtime!', 2.5); this.audio.queue(this.booth.event(g, 'overtime')); }
    else if (type === 'penalty') {
      this.ui.showTicker(`FLAG: ${data.text || data.type}`);
      this.audio.say(this.booth.event(g, 'penalty', data));
      if (data.team === 0) this.audio.boo(0.55); // flag on the home team
    }
    else if (type === 'final') {
      R.flashBoard('FINAL', '#19d3ff', g.score[0] > g.score[1] ? 0 : g.score[1] > g.score[0] ? 1 : null);
      this.audio.queue(this.booth.event(g, 'final'));
      this.audio.chant(false);
      this.audio.roar(g.score[0] > g.score[1] ? 1 : 0.2);
      setTimeout(() => this.onFinal(g), 1800);
    }
  }

  rng01() { return Math.random(); }

  // The stadium belongs to the home team (index 0): it reacts to how each play went for them.
  crowdReact(g, s, r) {
    const A = this.audio;
    const off = s.offIdx;
    const good = (team, amt) => (team === 0 ? A.roar(amt) : A.groan(Math.min(1, amt)));
    if (r.safety !== null && r.safety !== undefined) return good(r.safety, 0.9);
    if (r.td !== null && r.td !== undefined) { if (r.td === 0) A.roar(1.2); else A.groan(0.9); return; }
    if (s.kind === 'fg' || s.kind === 'xp') {
      const kt = s.kickTeam ?? off;
      if (s.kind === 'xp') { if (r.fg && kt === 0) A.roar(0.35); else if (!r.fg) good(1 - kt, 0.6); return; }
      return r.fg ? good(kt, kt === 0 ? 0.7 : 0.35) : good(1 - kt, 0.7);
    }
    if (s.kind === 'scrimmage') {
      if (r.turnover) return good(1 - off, 0.9); // INT, lost fumble or turnover on downs
      if (r.playType === 'sack') return good(1 - off, 0.65);
      const gain = (r.endX - s.losX) * s.dir;
      const pre = this.booth.pre;
      const first = /FIRST DOWN/.test(g.lastText || '');
      if (gain >= 15) return good(off, Math.min(1, 0.35 + gain / 45));
      if (pre && pre.down >= 3) return first ? good(off, 0.45) : good(1 - off, 0.45);
      if (first && off === 0) A.roar(0.25);
      return;
    }
    // Kick returns: a big one brings the house down (or deflates it)
    if ((s.kind === 'kickoff' || s.kind === 'punt') && r.possession !== off && !r.touchback) {
      const rt = r.possession;
      const ry = (r.endX - (s.catchX ?? r.endX)) * s.attackDir(rt);
      if (ry >= 25) good(rt, Math.min(1, 0.4 + ry / 60));
    } else if (r.possession === off && s.kind !== 'scrimmage') good(off, 0.9); // onside / muff recovered by the kicking team
  }

  // Before the snap: the home crowd quiets down for its own offense, and gets loud (and
  // chants) when its defense needs a stop on third or fourth down.
  crowdMood(g, data) {
    const A = this.audio;
    if (data.phase === 'playcall' || data.phase === 'pat_choice') {
      A.chant(false); A.crowd(0.35);
      if (data.phase === 'playcall') A.queue(this.booth.situation(g));
      return;
    }
    if (data.phase !== 'presnap' || !g.sim) return;
    if (data.kick || g.sim.kind !== 'scrimmage') { A.chant(false); A.crowd(0.5); return; }
    const homeDef = g.possession === 1;
    const close = g.quarter >= 4 && Math.abs(g.score[0] - g.score[1]) <= 8;
    if (homeDef && g.down >= 3) { A.crowd(close ? 0.95 : 0.78); A.chant(true); }
    else if (homeDef) { A.crowd(0.5); A.chant(false); }
    else { A.crowd(0.24); A.chant(false); }
  }

  onFinal(g) {
    if (g !== this.game) return;
    if (g.seasonGame) { this.season.onUserGameFinal(g); return; }
    this.ui.hideInGame();
    this.ui.showBoxScore(g, { buttons: [['Rematch', () => this.startGame(this.gameOpts), 'primary'], ['Main Menu', () => this.quitToMenu()]] });
  }

  quitToMenu() {
    this.game = null;
    this.paused = false;
    this.audio.voices.start([]); // the booth stops talking
    this.audio.chant(false);
    this.audio.crowd(0.3);
    this.view.replay = null;
    this.humans = [null, null];
    this.ui.hideInGame();
    this.startAttract();
    this.ui.showMainMenu();
  }

  togglePause() {
    if (!this.game || this.game.over) return;
    this.paused = !this.paused;
    if (this.paused) { this.ui.showPause(); this.audio.chant(false); } else this.ui.clearScreen();
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
    // The sim steps at most 0.1 s per frame; the FPS meter and Auto graphics use the real frame time
    this.renderer.rawDt = Math.min(dt, 1);
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
