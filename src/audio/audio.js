// Procedural Web Audio: crowd ambience, whistles, hits, kicks, catches, horns.
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.crowdLevel = 0.25;
    this.crowdTarget = 0.25;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // Crowd: looping filtered noise with slow swells
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.035 * w) / 1.035; // brown-ish noise
        d[i] = last * 3.2 + w * 0.05;
      }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.5;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0;
    src.connect(bp); bp.connect(this.crowdGain); this.crowdGain.connect(this.master);
    src.start();
    this.crowdFilter = bp;
  }
  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  crowd(level) { this.crowdTarget = level; }
  tick(dt) {
    if (!this.ctx) return;
    this.crowdLevel += (this.crowdTarget - this.crowdLevel) * Math.min(1, dt * 1.5);
    this.crowdGain.gain.value = this.crowdLevel * 0.5;
    this.crowdFilter.frequency.value = 500 + this.crowdLevel * 900;
    // decay excitement back to ambient
    this.crowdTarget += (0.25 - this.crowdTarget) * Math.min(1, dt * 0.35);
  }
  roar(amount = 1) { this.crowdTarget = Math.min(1.4, 0.4 + amount); }

  noise(dur, freq, q, gain, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
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
  hit(big = false) { this.noise(big ? 0.28 : 0.16, big ? 260 : 420, 0.8, big ? 0.9 : 0.5); this.tone(big ? 70 : 95, 0.15, big ? 0.5 : 0.25, 'sine', -40); }
  kick() { this.tone(120, 0.12, 0.6, 'sine', -80); this.noise(0.06, 1800, 1, 0.3, 'highpass'); }
  catch_() { this.noise(0.07, 1400, 1.2, 0.35, 'bandpass'); }
  snap() { this.noise(0.05, 900, 1, 0.25, 'bandpass'); }
  click() { this.tone(880, 0.05, 0.08, 'triangle'); }
  horn() {
    if (!this.ctx) return;
    for (const f of [196, 247, 294]) this.tone(f, 1.2, 0.08, 'sawtooth');
  }
}
