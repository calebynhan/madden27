// Keyboard + gamepad input. Physical buttons map to several context-dependent
// action names; the simulation checks whichever actions make sense right now.

export const KEYMAP = {
  KeyW: ['up'], ArrowUp: ['up'], KeyS: ['down'], ArrowDown: ['down'], KeyA: ['left'], ArrowLeft: ['left'], KeyD: ['right'], ArrowRight: ['right'],
  ShiftLeft: ['sprint'], ShiftRight: ['sprint'],
  Space: ['snap', 'tackle', 'kick', 'confirm'],
  Digit1: ['pass1'], Digit2: ['pass2'], Digit3: ['pass3'], Digit4: ['pass4'], Digit5: ['pass5'],
  Numpad1: ['pass1'], Numpad2: ['pass2'], Numpad3: ['pass3'], Numpad4: ['pass4'], Numpad5: ['pass5'],
  KeyQ: ['juke_l', 'strip'], KeyE: ['juke_r', 'swat', 'swim', 'catch_rac'], KeyR: ['spin', 'catch_aggr', 'bull'],
  KeyF: ['stiff', 'hitstick', 'fair'], KeyC: ['truck', 'catch_poss'], KeyV: ['hurdle'], KeyZ: ['dive', 'kneel'],
  KeyX: ['pitch', 'stutter', 'throwaway'], KeyG: ['protect'], Tab: ['switch'],
  KeyH: ['hotroute'], KeyM: ['motion'], KeyB: ['audible'], KeyK: ['hardcount'], KeyL: ['protection'], KeyI: ['playart'],
  KeyT: ['timeout'], Escape: ['pause', 'back'], Enter: ['confirm'], KeyY: ['replay'], KeyP: ['pause'],
  KeyJ: ['shift_d'], KeyN: ['coverage_d'],
};

// Standard gamepad button indices -> actions
export const PADMAP = {
  0: ['snap', 'pass1', 'stiff', 'catch_poss', 'swim', 'kick', 'confirm'],
  1: ['pass2', 'spin', 'switch', 'back'],
  2: ['pass3', 'dive', 'tackle', 'swat', 'bull', 'audible', 'catch_rac'],
  3: ['pass4', 'hurdle', 'catch_aggr', 'hotroute'],
  4: ['motion', 'throwaway', 'pitch', 'shift_d', 'playart'],
  5: ['pass5', 'protect', 'strip', 'coverage_d'],
  7: ['sprint'],
  8: ['timeout'],
  9: ['pause'],
  12: ['nav_up'], 13: ['nav_down'], 14: ['nav_left'], 15: ['nav_right'],
};

export class InputSource {
  constructor(kind, index = 0) {
    this.kind = kind; // 'keyboard' | 'gamepad'
    this.index = index;
    this.held = new Set();
    this.pressed = new Set();
    this.released = new Map();
    this.pressT = new Map();
    this.axes = { x: 0, y: 0 }; // screen space: x right, y up
    this.rs = { x: 0, y: 0 };
    this.rsLatch = false;
    this.color = kind === 'keyboard' ? '#2fd5ff' : '#ff7a2f';
  }
  press(a, now) { if (!this.held.has(a)) { this.held.add(a); this.pressed.add(a); this.pressT.set(a, now); } }
  release(a, now) { if (this.held.has(a)) { this.held.delete(a); this.released.set(a, (now - (this.pressT.get(a) || now)) / 1000); } }
  consume() { this.pressed.clear(); this.released.clear(); }
  holdTime(a, now) { return this.held.has(a) ? (now - (this.pressT.get(a) || now)) / 1000 : 0; }
  // Build the per-tick controller snapshot for the sim, rotated by camera direction.
  controller(camDir) {
    let x = this.axes.x, y = this.axes.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return {
      mx: camDir * y, my: camDir * x,
      sx: x, sy: y,
      sprint: this.held.has('sprint') || (this.autoSprint && l > 0.2),
      held: this.held, pressed: this.pressed, released: this.released,
      color: this.color,
    };
  }
}

export class Input {
  constructor() {
    this.keyboard = new InputSource('keyboard');
    this.pads = [];
    this.listeners = [];
    this.keysDown = new Set();
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { for (const a of [...this.keyboard.held]) this.keyboard.release(a, performance.now()); this.keysDown.clear(); });
    this.padPrev = [];
  }
  on(fn) { this.listeners.push(fn); }
  emit(ev) { for (const f of this.listeners) f(ev); }

  onKey(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
    const acts = KEYMAP[e.code];
    if (acts) e.preventDefault();
    const now = performance.now();
    if (down) {
      if (this.keysDown.has(e.code)) return; // ignore auto-repeat for actions
      this.keysDown.add(e.code);
      this.emit({ type: 'key', code: e.code, source: this.keyboard, actions: acts || [] });
    } else this.keysDown.delete(e.code);
    if (!acts) return;
    for (const a of acts) down ? this.keyboard.press(a, now) : this.keyboard.release(a, now);
    this.updateKeyboardAxes();
  }

  updateKeyboardAxes() {
    const h = this.keyboard.held;
    this.keyboard.axes.x = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0);
    this.keyboard.axes.y = (h.has('up') ? 1 : 0) - (h.has('down') ? 1 : 0);
  }

  poll() {
    const now = performance.now();
    let gps = [];
    if (!this.padsBlocked) {
      // Some embedded/sandboxed frames forbid the Gamepad API; keep the keyboard working.
      try { gps = (navigator.getGamepads && navigator.getGamepads()) || []; } catch { this.padsBlocked = true; gps = []; }
    }
    // Pads that went to sleep or were unplugged stop driving anything (the keyboard takes over).
    const live = new Set();
    for (const gp of gps) if (gp && gp.connected) live.add(gp.index);
    for (const p of this.pads) {
      const gone = !live.has(p.index);
      if (gone && !p.disconnected) {
        p.axes.x = 0; p.axes.y = 0;
        for (const a of [...p.held]) p.release(a, now);
        this.emit({ type: 'paddisconnect', source: p });
      }
      p.disconnected = gone;
    }
    for (let i = 0; i < gps.length; i++) {
      const gp = gps[i];
      if (!gp || !gp.connected) continue;
      let src = this.pads.find((p) => p.index === gp.index);
      if (!src) { src = new InputSource('gamepad', gp.index); this.pads.push(src); this.emit({ type: 'padconnect', source: src }); }
      const prev = this.padPrev[gp.index] || [];
      gp.buttons.forEach((b, bi) => {
        const pressed = b.pressed || b.value > 0.5;
        const acts = PADMAP[bi];
        if (!acts) { prev[bi] = pressed; return; }
        if (pressed && !prev[bi]) { for (const a of acts) src.press(a, now); this.emit({ type: 'pad', button: bi, source: src, actions: acts }); }
        if (!pressed && prev[bi]) for (const a of acts) src.release(a, now);
        prev[bi] = pressed;
      });
      this.padPrev[gp.index] = prev;
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      let ax = dz(gp.axes[0] || 0), ay = -dz(gp.axes[1] || 0);
      // D-pad also moves the player
      if (gp.buttons[12]?.pressed) ay = 1; if (gp.buttons[13]?.pressed) ay = -1;
      if (gp.buttons[14]?.pressed) ax = -1; if (gp.buttons[15]?.pressed) ax = 1;
      src.axes.x = ax; src.axes.y = ay;
      // Right stick flicks -> moves
      const rx = dz(gp.axes[2] || 0), ry = -dz(gp.axes[3] || 0);
      const mag = Math.hypot(rx, ry);
      if (mag > 0.7 && !src.rsLatch) {
        src.rsLatch = true;
        let acts;
        if (Math.abs(rx) > Math.abs(ry)) acts = rx < 0 ? ['juke_l'] : ['juke_r'];
        else acts = ry > 0 ? ['truck', 'hitstick'] : ['stutter', 'tackle'];
        for (const a of acts) { src.press(a, now); src.release(a, now + 30); }
        for (const a of acts) src.held.delete(a);
      } else if (mag < 0.3) src.rsLatch = false;
      if (gp.buttons[6]?.value > 0.5) src.held.add('playart'); else src.held.delete('playart');
    }
  }

  sources() { return [this.keyboard, ...this.pads]; }
}
