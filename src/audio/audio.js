// Procedural Web Audio: a layered stadium crowd that reacts to the game (murmur, cheers,
// groans, boos, whistles, applause, third-down noise and a defense chant), plus whistles,
// hits, kicks and the horn. The broadcast booth speaks through the browser's speech engine
// (Voices, below). No audio files: everything is synthesized on the fly.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.base = 0.3; // situational crowd level (quiet when the home offense is at the line, loud on third down)
    this.excite = 0; // transient excitement on top of the base (decays)
    this.crowdLevel = 0.3; // what the renderer uses for the visual crowd bounce
    this.chantOn = false;
    this.nextChantT = 0;
    this.duckK = 1;
    this.voices = new Voices();
    this.voices.onSpeaking = (b) => { this.duckK = b ? 0.72 : 1; };
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    // master volume -> gentle compressor (stacked crowd layers can't clip) -> speakers
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.006; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.crowdBus = ctx.createGain();
    this.crowdBus.gain.value = 0;
    this.crowdBus.connect(this.master);
    this.noiseBuf = this.makeNoise(6, 0.6);
    // Murmur: noise through three vowel-like formant bands, each swelling on its own slow
    // cycle, so it reads as thousands of voices rather than wind.
    this.bed = ctx.createGain();
    this.bed.gain.value = 0.3;
    this.bed.connect(this.crowdBus);
    const bands = [[420, 1.1, 0.9, 0.11], [1000, 1.4, 0.55, 0.19], [2300, 2.0, 0.22, 0.31]];
    for (const [f, q, g, rate] of bands) {
      const src = this.loop(this.noiseBuf, Math.random() * 5);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const bg = ctx.createGain(); bg.gain.value = g;
      const lfo = ctx.createOscillator(); lfo.frequency.value = rate;
      const depth = ctx.createGain(); depth.gain.value = g * 0.35;
      lfo.connect(depth); depth.connect(bg.gain); lfo.start();
      src.connect(bp); bp.connect(bg); bg.connect(this.bed);
    }
    // Stadium body: low rumble
    this.rumble = ctx.createGain(); this.rumble.gain.value = 0.12;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170;
    this.loop(this.noiseBuf, 1.3).connect(lp); lp.connect(this.rumble); this.rumble.connect(this.crowdBus);
    // Cheer: brighter shouting layer that rises with excitement
    this.cheerG = ctx.createGain(); this.cheerG.gain.value = 0;
    this.cheerF = ctx.createBiquadFilter(); this.cheerF.type = 'bandpass'; this.cheerF.frequency.value = 1300; this.cheerF.Q.value = 0.8;
    const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 3000; shelf.gain.value = 4;
    this.loop(this.noiseBuf, 2.7).connect(this.cheerF); this.cheerF.connect(shelf); shelf.connect(this.cheerG); this.cheerG.connect(this.crowdBus);
    // Pre-rendered clap textures: a ragged unison clap (for the chant) and applause
    this.clapBuf = this.makeClaps(0.18, 46, 0.035);
    this.applauseBuf = this.makeApplause(3.2);
  }

  makeNoise(sec, pinkness) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        // cheap pink-ish noise (Kellet's filter, 3 poles) blended with a little brown
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        last = (last + 0.02 * w) / 1.02;
        d[i] = ((b0 + b1 + b2 + w * 0.1848) * 0.16) * pinkness + last * 2.5 * (1 - pinkness);
      }
    }
    return buf;
  }
  makeClaps(sec, n, spread) {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * sec);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let k = 0; k < n; k++) {
        const at = Math.floor(Math.random() * spread * sr), dur = Math.floor(sr * (0.012 + Math.random() * 0.012));
        const amp = 0.35 + Math.random() * 0.4;
        for (let i = 0; i < dur && at + i < len; i++) d[at + i] += (Math.random() * 2 - 1) * amp * Math.pow(1 - i / dur, 3);
      }
      let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
      if (pk > 0) for (let i = 0; i < len; i++) d[i] *= 0.9 / pk;
    }
    return buf;
  }
  makeApplause(sec) {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * sec);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const claps = Math.floor(sec * 260);
      for (let k = 0; k < claps; k++) {
        // density swells in, holds, then thins out
        const u = Math.random(); const tt = Math.pow(u, 0.8) * sec;
        const at = Math.floor(tt * sr), dur = Math.floor(sr * (0.008 + Math.random() * 0.014));
        const amp = (0.15 + Math.random() * 0.25) * Math.min(1, tt / 0.25) * Math.min(1, (sec - tt) / 1.2);
        for (let i = 0; i < dur && at + i < len; i++) d[at + i] += (Math.random() * 2 - 1) * amp * Math.pow(1 - i / dur, 2.5);
      }
      let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
      if (pk > 0) for (let i = 0; i < len; i++) d[i] *= 0.9 / pk;
    }
    return buf;
  }
  loop(buf, offset = 0) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.start(this.ctx.currentTime, offset % buf.duration);
    return s;
  }
  play(buf, gain, t = this.ctx.currentTime, rate = 1, dest = this.crowdBus) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(g); g.connect(dest); s.start(t);
    return s;
  }

  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; this.voices.volume = Math.min(1, v * 1.15); }

  // ------------------------------------------------------------ crowd control
  crowd(level) { this.base = level; } // situational level
  // A big moment: the crowd erupts (amount 0..1+), with whistles and applause on the biggest ones.
  roar(amount = 1) {
    this.excite = Math.max(this.excite, clamp(amount, 0, 1.4));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (amount >= 0.5) this.play(this.applauseBuf, 0.25 + amount * 0.25, t + 0.15, 0.95 + Math.random() * 0.1);
    const n = Math.round(amount * 5);
    for (let i = 0; i < n; i++) this.fanWhistle(t + 0.2 + Math.random() * 1.6);
  }
  cheer(amount = 0.5) { this.roar(amount); }
  // Collective "awww": many voices sliding down together.
  groan(amount = 0.7) {
    this.excite *= 0.4;
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.08, dur = 1.5;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.5 * amount, t + 0.22); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(820, t); f.frequency.exponentialRampToValueAtTime(330, t + dur);
    f.connect(out); out.connect(this.crowdBus);
    const nz = ctx.createBufferSource(); nz.buffer = this.noiseBuf; nz.connect(f); nz.start(t, Math.random() * 4); nz.stop(t + dur + 0.05);
    this.chorus(t, dur, 170, 0.75, f, 0.05);
  }
  // Sustained low "boo" with a slow wobble.
  boo(amount = 0.6) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.1, dur = 1.8;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.42 * amount, t + 0.3); out.gain.setValueAtTime(0.42 * amount, t + dur - 0.5); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const trem = ctx.createOscillator(); trem.frequency.value = 3.2; const td = ctx.createGain(); td.gain.value = 0.12 * amount; trem.connect(td); td.connect(out.gain); trem.start(t); trem.stop(t + dur);
    out.connect(this.crowdBus);
    for (const [f, q] of [[310, 5], [860, 7]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; bp.connect(out);
      this.chorus(t, dur, 135, 1, bp, 0.06);
    }
  }
  // Detuned sawtooth "voices" (a crowd's sung tone), with an optional downward pitch slide.
  chorus(t, dur, f0, slide, dest, gain) {
    const ctx = this.ctx;
    for (let i = 0; i < 7; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const f = f0 * (0.82 + i * 0.06 + Math.random() * 0.03);
      o.frequency.setValueAtTime(f, t);
      if (slide !== 1) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
      const g = ctx.createGain(); g.gain.value = gain;
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    }
  }
  // One fan's two-finger whistle somewhere in the stands.
  fanWhistle(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    const f = 1900 + Math.random() * 1200;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.22, t + 0.12); o.frequency.exponentialRampToValueAtTime(f * 0.92, t + 0.42);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022 + Math.random() * 0.02, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.connect(g);
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; g.connect(pan); pan.connect(this.crowdBus); } else g.connect(this.crowdBus);
    o.start(t); o.stop(t + 0.5);
  }
  // Third and fourth down with the home team on defense: the stadium gets loud and chants.
  chant(on) { if (on && !this.chantOn && this.ctx) this.nextChantT = this.ctx.currentTime + 0.4; this.chantOn = on; }
  chantCycle(t) {
    // "DE - FENSE" then two claps, like a whole stadium doing it together
    this.syllable(t, 0.28, 300, 2250, 0.34, false);
    this.syllable(t + 0.34, 0.5, 560, 1800, 0.4, true);
    this.play(this.clapBuf, 0.55, t + 0.98);
    this.play(this.clapBuf, 0.55, t + 1.2);
  }
  syllable(t, dur, f1, f2, gain, sib) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(gain, t + 0.04); out.gain.setValueAtTime(gain, t + dur - 0.09); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(this.crowdBus);
    for (const [f, q, g] of [[f1, 4, 1], [f2, 6, 0.5]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const bg = ctx.createGain(); bg.gain.value = g;
      bp.connect(bg); bg.connect(out);
      this.chorus(t, dur, 190, 0.97, bp, 0.07);
      const nz = ctx.createBufferSource(); nz.buffer = this.noiseBuf; const ng = ctx.createGain(); ng.gain.value = 0.9;
      nz.connect(ng); ng.connect(bp); nz.start(t, Math.random() * 4); nz.stop(t + dur + 0.02);
    }
    if (sib) {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
      const sg = ctx.createGain(); const st = t + dur - 0.16;
      sg.gain.setValueAtTime(0.0001, st); sg.gain.exponentialRampToValueAtTime(gain * 0.5, st + 0.05); sg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
      const nz = ctx.createBufferSource(); nz.buffer = this.noiseBuf; nz.connect(hp); hp.connect(sg); sg.connect(this.crowdBus); nz.start(st, Math.random() * 4); nz.stop(t + dur + 0.08);
    }
  }

  tick(dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.excite *= Math.exp(-dt / 2.4);
    const level = clamp(this.base + this.excite * 0.85, 0, 1.6);
    this.crowdLevel = level;
    const k = 0.25;
    this.ramp(this.crowdBus.gain, 0.9 * this.duckK, t, 0.15);
    this.ramp(this.bed.gain, 0.16 + level * 0.3, t, k);
    this.ramp(this.rumble.gain, 0.08 + level * 0.16, t, k);
    this.ramp(this.cheerG.gain, Math.max(0, this.excite * 0.5 + (this.base - 0.55) * 0.35), t, 0.12);
    this.ramp(this.cheerF.frequency, 1100 + this.excite * 1300, t, 0.2, 15);
    // Scattered whistles while the place is rocking
    const wl = this.excite + Math.max(0, this.base - 0.6);
    if (wl > 0.45 && Math.random() < dt * (wl - 0.35) * 5) this.fanWhistle(t + 0.02);
    if (this.chantOn && t >= this.nextChantT) { this.chantCycle(Math.max(t, this.nextChantT)); this.nextChantT = Math.max(t, this.nextChantT) + 1.75; }
  }

  // Glide a parameter toward a new target, only when the target has actually moved (so the
  // automation timeline doesn't fill up with one event per frame).
  ramp(param, v, t, tc, eps = 0.004) {
    if (param._tgt !== undefined && Math.abs(param._tgt - v) < eps) return;
    param._tgt = v;
    param.setTargetAtTime(v, t, tc);
  }

  // ------------------------------------------------------------ effects
  noise(dur, freq, q, gain, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 4); s.stop(t + dur + 0.02);
  }
  tone(freq, dur, gain, type = 'sine', slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  whistle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const f of [2750, 2930]) {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 38;
      const lg = this.ctx.createGain(); lg.gain.value = 120;
      lfo.connect(lg); lg.connect(o.frequency);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.02); g.gain.setValueAtTime(0.06, t + 0.32); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.connect(g); g.connect(this.master); o.start(t); lfo.start(t); o.stop(t + 0.45); lfo.stop(t + 0.45);
    }
  }
  hit(big = false) { this.noise(big ? 0.28 : 0.16, big ? 260 : 420, 0.8, big ? 0.9 : 0.5); this.tone(big ? 70 : 95, 0.15, big ? 0.5 : 0.25, 'sine', -40); if (big && this.ctx) this.excite = Math.max(this.excite, 0.35); }
  kick() { this.tone(120, 0.12, 0.6, 'sine', -80); this.noise(0.06, 1800, 1, 0.3, 'highpass'); }
  catch_() { this.noise(0.07, 1400, 1.2, 0.35, 'bandpass'); }
  snap() { this.noise(0.05, 900, 1, 0.25, 'bandpass'); }
  click() { this.tone(880, 0.05, 0.08, 'triangle'); }
  horn() {
    if (!this.ctx) return;
    for (const f of [196, 247, 294]) this.tone(f, 1.2, 0.08, 'sawtooth');
  }

  // ------------------------------------------------------------ booth
  call(pbp, color) { this.voices.start([{ text: pbp, who: 'pbp' }, color ? { text: color, who: 'color' } : null]); }
  say(text) { if (text) this.voices.start([{ text, who: 'pbp' }]); }
  queue(text, who = 'pbp') { if (text) this.voices.queue(text, who); }
  hush() { this.voices.hush(); }
}

// Two-voice booth over the browser's speech engine. A new call replaces whatever is being
// said; the color line follows the play-by-play unless the next snap comes first. Prefers
// natural-sounding and on-device voices (so it works offline) and skips novelty voices.
export class Voices {
  constructor() {
    this.ss = (typeof window !== 'undefined' && window.speechSynthesis) || null;
    this.q = [];
    this.token = 0;
    this.busy = false;
    this.startedAt = 0;
    this.volume = 0.8;
    this.onSpeaking = null;
    this.pbpVoice = null;
    this.colorVoice = null;
    if (this.ss) {
      this.pickVoices();
      const again = () => this.pickVoices();
      if (this.ss.addEventListener) this.ss.addEventListener('voiceschanged', again);
      else this.ss.onvoiceschanged = again;
    }
  }

  pickVoices() {
    let all = [];
    try { all = this.ss.getVoices() || []; } catch { all = []; }
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    const score = (v) => {
      let s = 0;
      if (v.localService) s += 2; else s += online ? 1 : -20;
      if (/natural|neural|premium|enhanced/i.test(v.name)) s += 3;
      if (/en[-_]US/i.test(v.lang)) s += 1; else if (/en[-_](GB|AU|CA|IE)/i.test(v.lang)) s += 0.5;
      if (/google|microsoft|samantha|alex|daniel|aaron|karen|moira|tessa|guy|davis|jenny|aria|andrew|brian|emma|ava|christopher|eric/i.test(v.name)) s += 1;
      if (/novelty|whisper|bells|bubbles|cellos|zarvox|trinoids|albert|bad news|good news|organ|jester|superstar|wobble|boing|deranged|hysterical|pipe organ/i.test(v.name)) s -= 30;
      if (/\b(fred|junior|ralph|kathy|princess|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley)\b/i.test(v.name)) s -= 5;
      return s;
    };
    const en = all.filter((v) => /^en([-_]|$)/i.test(v.lang || '')).sort((a, b) => score(b) - score(a));
    this.pbpVoice = en[0] || null;
    this.colorVoice = en.find((v) => v !== this.pbpVoice && score(v) > -10) || this.pbpVoice;
  }

  setBusy(b) { if (this.busy !== b) { this.busy = b; if (this.onSpeaking) this.onSpeaking(b); } }

  // Replace whatever is being said with these lines.
  start(lines) {
    if (!this.ss) return;
    this.token++;
    const tok = this.token;
    this.q = lines.filter((l) => l && l.text);
    try { this.ss.cancel(); } catch { /* ignore */ }
    // Some engines drop a speak() issued in the same tick as cancel(); give it a beat.
    setTimeout(() => this.next(tok), 40);
  }
  // Say this once the booth is free.
  queue(text, who = 'pbp') {
    if (!this.ss || !text) return;
    if (this.busy && performance.now() - this.startedAt < 15000) this.q.push({ text, who });
    else this.start([{ text, who }]);
  }
  // The next play is under way: the current sentence finishes, the rest is dropped.
  hush() { this.q.length = 0; }

  next(tok) {
    if (tok !== this.token || !this.ss) return;
    const line = this.q.shift();
    if (!line) { this.setBusy(false); return; }
    let u;
    try { u = new SpeechSynthesisUtterance(line.text); } catch { this.setBusy(false); return; }
    const color = line.who === 'color';
    const v = color ? this.colorVoice : this.pbpVoice;
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    const same = !this.colorVoice || this.colorVoice === this.pbpVoice;
    u.rate = color ? 1.0 : 1.08;
    u.pitch = color ? (same ? 1.15 : 1.0) : 0.95;
    u.volume = Math.max(0, Math.min(1, this.volume));
    let done = false;
    const finish = () => {
      if (done || tok !== this.token) return;
      done = true;
      setTimeout(() => this.next(tok), color ? 150 : 260);
    };
    u.onend = finish;
    u.onerror = finish;
    this.cur = u; // keep a reference: some engines skip onend for collected utterances
    this.startedAt = performance.now();
    this.setBusy(true);
    try { if (this.ss.paused) this.ss.resume(); this.ss.speak(u); } catch { finish(); }
    // Watchdog for engines that never report the end of an utterance
    setTimeout(finish, 4000 + line.text.length * 95);
  }
}
