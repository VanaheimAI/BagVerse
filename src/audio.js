// Game audio: one WebAudio graph (master -> sfx / ambience / music buses), sounds by slot name.
// Every slot has a DailySounds.org source file (public/sfx/<slot>.mp3, see SLOTS) and a synthesized fallback, so the
// game has sound before the files are added and keeps working if one fails to load.
// iOS / Chrome start audio muted until a user gesture: the context is created on the first tap / key.
// Sound effects from DailySounds.org (free for commercial use; see LICENSES/dailysounds.txt).

export const SLOTS = {
  // ui
  click:    { src: 'Crisp Button Click (5944)', bus: 'sfx', vol: 0.5 },
  tap:      { src: 'Soft Interface Tap (5914)', bus: 'sfx', vol: 0.45 },
  open:     { src: 'Game Menu Change (1319)', bus: 'sfx', vol: 0.5 },
  error:    { src: 'Subtle Error Tone (5920)', bus: 'sfx', vol: 0.55 },
  // progression
  success:  { src: 'Gentle Success Chime (5913)', bus: 'sfx', vol: 0.6 },
  levelup:  { src: 'Arcade Power Up (5918)', bus: 'sfx', vol: 0.7 },
  tier:     { src: 'Chest Powerup Special (1457)', bus: 'sfx', vol: 0.75 },
  achieve:  { src: 'Crystal Sparkle (5919)', bus: 'sfx', vol: 0.6 },
  coin:     { src: 'Coin Fall (1447)', bus: 'sfx', vol: 0.6 },
  gift:     { src: 'Choose And Open Gift (1459)', bus: 'sfx', vol: 0.65 },
  ping:     { src: '8-Bit Radar Ping (1521)', bus: 'sfx', vol: 0.45 },
  scanok:   { src: 'Scan Accepted (1064)', bus: 'sfx', vol: 0.55 },
  scandeny: { src: 'Scan Denied (1063)', bus: 'sfx', vol: 0.5 },
  // world
  jump:     { src: 'Fast Whoosh (5975)', bus: 'sfx', vol: 0.35 },
  whoosh:   { src: 'Airy Transition Whoosh (5915)', bus: 'sfx', vol: 0.45 },
  poof:     { src: 'Magic Poof (741)', bus: 'sfx', vol: 0.55 },
  spray:    { src: 'Spray Can', bus: 'sfx', vol: 0.55, lazy: true },   // synth (can rattle + hiss) until a file is added
  scratch:  { src: 'Single Record Scratch (1366)', bus: 'sfx', vol: 0.6 },
  brake:    { src: 'Bicycle Brake Noises (1470)', bus: 'sfx', vol: 0.4 },
  // loops
  steps:    { src: 'Footsteps on Stone (1429)', bus: 'sfx', vol: 0.32, loop: true },
  scooter:  { src: 'Electric Vehicle Acceleration Whine (1121)', bus: 'sfx', vol: 0.35, loop: true },
  city:     { src: 'Big City Ambiance (1472)', bus: 'amb', vol: 0.5, loop: true },
  crowd:    { src: 'Crowd Chatter (5976)', bus: 'amb', vol: 0.5, loop: true },
  pad:      { src: 'Calm Ambient Pad (5977)', bus: 'music', vol: 0.5, loop: true },
  // music tracks: fetched on first use, played with music() / stopMusic()
  bagrun:   { src: 'Final Countdown (BagVerse original, Suno)', bus: 'music', vol: 1.3, lazy: true },
};

const KEY = 'bagverse.audio';

export class Audio {
  constructor({ base = 'sfx/' } = {}) {
    this.base = base; this.ctx = null; this.buf = {}; this.loops = {}; this.failed = new Set();
    let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) {}
    this.settings = { muted: false, sfx: 0.9, amb: 0.6, music: 0.5, ...s };
    const unlock = () => { this.start(); if (this.ctx?.state === 'running') { removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); removeEventListener('touchend', unlock, true); } };
    addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true); addEventListener('touchend', unlock, true);
    document.addEventListener('visibilitychange', () => { if (!this.ctx) return; if (document.hidden) this.ctx.suspend(); else if (!this.settings.muted) this.ctx.resume(); });
  }

  start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.connect(c.destination);
      this.bus = {};
      for (const b of ['sfx', 'amb', 'music']) { const g = c.createGain(); g.connect(this.master); this.bus[b] = g; }
      this.noise = this.makeNoise();
      this.apply();
      for (const name of Object.keys(SLOTS)) if (!SLOTS[name].lazy) this.load(name);   // small files: fetch them all once audio is allowed
      for (const [name, want] of Object.entries(this.pending || {})) this.loop(name, want);
    }
    if (this.ctx.state === 'suspended' && !this.settings.muted) this.ctx.resume();
  }

  apply() {
    if (!this.ctx) return;
    const s = this.settings, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 1, t, 0.05);
    for (const b of ['sfx', 'amb', 'music']) this.bus[b].gain.setTargetAtTime(s[b], t, 0.05);
  }
  set(k, v) { this.settings[k] = v; try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch (_) {} this.apply(); }
  toggleMute() { this.set('muted', !this.settings.muted); if (!this.settings.muted) this.start(); return !this.settings.muted; }

  async load(name) {
    if (this.buf[name] || this.failed.has(name) || !this.ctx) return;
    try {
      const r = await fetch(this.base + name + '.mp3');
      if (!r.ok || /text\/html/.test(r.headers.get('content-type') || '')) throw new Error('missing');   // SPA fallbacks answer 200 + HTML
      const ab = await r.arrayBuffer();
      this.buf[name] = await new Promise((ok, no) => { const pr = this.ctx.decodeAudioData(ab, ok, no); pr?.catch?.(no); });
      const l = this.loops[name]; if (l?.synth) { const want = l.want; this.stopLoop(name); this.loop(name, want); }   // swap a synth loop for the real file
    } catch (_) { this.failed.add(name); }
  }

  /** one-shot */
  play(name, { rate = 1, vol = 1 } = {}) {
    const c = this.ctx, def = SLOTS[name]; if (!c || !def || this.settings.muted || c.state !== 'running') return;
    const out = c.createGain(); out.gain.value = def.vol * vol; out.connect(this.bus[def.bus]);
    const b = this.buf[name];
    if (b) { const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.97 + Math.random() * 0.06); s.connect(out); s.start(); s.onended = () => out.disconnect(); return; }
    SYNTH[name]?.(c, out, this.noise, rate);
    setTimeout(() => out.disconnect(), 3000);
  }

  /** continuous sound: loop(name, { vol, rate }) every frame; vol 0 fades it out (the source keeps running quietly) */
  loop(name, want = { vol: 1, rate: 1 }) {
    if (!this.ctx) { (this.pending ||= {})[name] = want; return; }
    const c = this.ctx, def = SLOTS[name]; let l = this.loops[name];
    if (!l) {
      const g = c.createGain(); g.gain.value = 0; g.connect(this.bus[def.bus]);
      l = this.loops[name] = { g, want };
      const b = this.buf[name];
      if (b) { const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.connect(g); s.start(0, Math.random() * b.duration); l.src = s; }
      else { l.synth = true; l.node = SYNTH_LOOP[name]?.(c, g, this.noise); }
    }
    l.want = want;
    const t = c.currentTime;
    l.g.gain.setTargetAtTime(def.vol * want.vol, t, 0.12);
    if (l.src) l.src.playbackRate.setTargetAtTime(want.rate || 1, t, 0.1);
    if (l.node?.setRate) l.node.setRate(want.rate || 1, t);
  }
  /** a music track from the start (looping), fading in; replaces the current track */
  async music(name, { fade = 0.4 } = {}) {
    this.start(); if (!this.ctx) return;
    this.stopMusic(0.3);
    const token = (this.musicToken = {});
    await this.load(name);
    const c = this.ctx, b = this.buf[name], def = SLOTS[name];
    if (!b || this.musicToken !== token) return;
    const g = c.createGain(); g.gain.value = 0; g.connect(this.bus[def.bus]);
    const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.connect(g); s.start();
    g.gain.setTargetAtTime(def.vol, c.currentTime, fade / 3);
    this.track = { name, s, g };
  }
  stopMusic(fade = 1) {
    this.musicToken = null;
    const t = this.track; if (!t || !this.ctx) return; this.track = null;
    const now = this.ctx.currentTime; t.g.gain.cancelScheduledValues(now); t.g.gain.setTargetAtTime(0, now, fade / 4);
    setTimeout(() => { try { t.s.stop(); } catch (_) {} t.g.disconnect(); }, fade * 1000 + 200);
  }
  get musicPlaying() { return !!this.track; }
  stopLoop(name) { const l = this.loops[name]; if (!l) return; try { l.src?.stop(); l.node?.stop?.(); } catch (_) {} l.g.disconnect(); delete this.loops[name]; }

  makeNoise() {
    const c = this.ctx, n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let p = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; p = 0.97 * p + 0.03 * w; d[i] = w * 0.5 + p * 2; }   // white + a bit of brown
    return b;
  }
}

// ------------------------------------------------------------------------- synthesized fallbacks
const env = (c, g, t0, a, d, peak = 1) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); };
function tone(c, out, f, t0, dur, type = 'sine', peak = 0.5, glide = 0) {
  const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(f * glide, t0 + dur);
  env(c, g, t0, 0.005, dur, peak); o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noiseBurst(c, out, noise, t0, dur, { type = 'bandpass', f = 1200, f2 = 0, q = 1, peak = 0.6 } = {}) {
  const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noise; fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q; if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  env(c, g, t0, 0.01, dur, peak); s.connect(fl); fl.connect(g); g.connect(out); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
}
const arp = (c, out, notes, step, type = 'triangle', peak = 0.35, dur = 0.25) => { const t = c.currentTime; notes.forEach((f, i) => tone(c, out, f, t + i * step, dur, type, peak)); };
const SYNTH = {
  click: (c, o) => tone(c, o, 1400, c.currentTime, 0.04, 'square', 0.18),
  tap: (c, o) => tone(c, o, 900, c.currentTime, 0.05, 'sine', 0.3),
  open: (c, o) => arp(c, o, [660, 990], 0.06, 'triangle', 0.3, 0.12),
  error: (c, o) => { const t = c.currentTime; tone(c, o, 220, t, 0.18, 'square', 0.15, 0.8); tone(c, o, 180, t + 0.12, 0.2, 'square', 0.12, 0.8); },
  success: (c, o) => arp(c, o, [784, 988, 1175], 0.07, 'sine', 0.35, 0.35),
  levelup: (c, o) => { arp(c, o, [523, 659, 784, 1047, 1319], 0.07, 'square', 0.18, 0.22); arp(c, o, [1568, 2093], 0.09, 'sine', 0.2, 0.5); },
  tier: (c, o, n) => { arp(c, o, [392, 523, 659, 784, 1047, 1319, 1568], 0.06, 'sawtooth', 0.12, 0.3); noiseBurst(c, o, n, c.currentTime + 0.35, 0.9, { type: 'highpass', f: 6000, peak: 0.15 }); },
  achieve: (c, o) => { const t = c.currentTime; for (let i = 0; i < 7; i++) tone(c, o, 1800 + Math.random() * 1800, t + i * 0.045, 0.2, 'sine', 0.18); },
  coin: (c, o) => { const t = c.currentTime; tone(c, o, 1319, t, 0.08, 'square', 0.16); tone(c, o, 1976, t + 0.07, 0.3, 'square', 0.14); },
  gift: (c, o, n) => { noiseBurst(c, o, n, c.currentTime, 0.25, { f: 2500, q: 0.6, peak: 0.25 }); arp(c, o, [659, 880, 1109, 1319], 0.08, 'triangle', 0.3, 0.4); },
  ping: (c, o) => tone(c, o, 1760, c.currentTime, 0.35, 'sine', 0.3, 0.98),
  scanok: (c, o) => { const t = c.currentTime; tone(c, o, 880, t, 0.08, 'square', 0.15); tone(c, o, 1320, t + 0.1, 0.14, 'square', 0.15); },
  scandeny: (c, o) => { const t = c.currentTime; tone(c, o, 330, t, 0.12, 'square', 0.15); tone(c, o, 247, t + 0.14, 0.2, 'square', 0.15); },
  jump: (c, o, n, r) => noiseBurst(c, o, n, c.currentTime, 0.22, { f: 500 * r, f2: 2200 * r, q: 1.2, peak: 0.35 }),
  whoosh: (c, o, n) => noiseBurst(c, o, n, c.currentTime, 0.45, { f: 300, f2: 3000, q: 0.8, peak: 0.4 }),
  spray: (c, o, n) => { const t = c.currentTime; for (let i = 0; i < 4; i++) tone(c, o, 2300 + Math.random() * 700, t + i * 0.075, 0.03, 'square', 0.07); noiseBurst(c, o, n, t + 0.32, 1.3, { type: 'highpass', f: 5200, f2: 3800, q: 0.7, peak: 0.32 }); },
  poof: (c, o, n) => { noiseBurst(c, o, n, c.currentTime, 0.4, { type: 'lowpass', f: 3000, f2: 300, peak: 0.6 }); tone(c, o, 120, c.currentTime, 0.25, 'sine', 0.4, 0.5); },
  scratch: (c, o, n) => { const t = c.currentTime; noiseBurst(c, o, n, t, 0.18, { f: 900, f2: 2600, q: 4, peak: 0.5 }); noiseBurst(c, o, n, t + 0.16, 0.22, { f: 2600, f2: 700, q: 4, peak: 0.45 }); },
  brake: (c, o, n) => noiseBurst(c, o, n, c.currentTime, 0.5, { type: 'bandpass', f: 4200, f2: 3000, q: 8, peak: 0.25 }),
};
// loops: return { setRate, stop }
const SYNTH_LOOP = {
  steps: (c, out, noise) => {   // filtered thumps on a clock driven by rate
    let rate = 1, alive = true, next = c.currentTime;
    const tick = () => { if (!alive) return; const t = c.currentTime; if (t >= next) { noiseBurst(c, out, noise, t, 0.07, { type: 'lowpass', f: 700, peak: 0.7 }); next = t + 0.5 / Math.max(0.3, rate); } setTimeout(tick, 30); };
    tick(); return { setRate: (r) => { rate = r; }, stop: () => { alive = false; } };
  },
  scooter: (c, out) => {   // electric whine: two detuned saws through a lowpass
    const o1 = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(); o1.type = 'sawtooth'; o2.type = 'sawtooth';
    o1.frequency.value = 180; o2.frequency.value = 183; f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 3;
    const g = c.createGain(); g.gain.value = 0.12; o1.connect(f); o2.connect(f); f.connect(g); g.connect(out); o1.start(); o2.start();
    return { setRate: (r, t) => { o1.frequency.setTargetAtTime(140 * r, t, 0.1); o2.frequency.setTargetAtTime(143 * r, t, 0.1); f.frequency.setTargetAtTime(600 + 900 * r, t, 0.1); }, stop: () => { o1.stop(); o2.stop(); } };
  },
  city: (c, out, noise) => { const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = noise; s.loop = true; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0.25; s.connect(f); f.connect(g); g.connect(out); s.start(); return { stop: () => s.stop() }; },
  crowd: (c, out, noise) => { const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = noise; s.loop = true; s.playbackRate.value = 0.7; f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.7; g.gain.value = 0.12; s.connect(f); f.connect(g); g.connect(out); s.start(); return { stop: () => s.stop() }; },
  pad: (c, out) => {
    const notes = [220, 277.2, 329.6, 415.3], os = notes.map((n, i) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = n; o.detune.value = (i - 1.5) * 6; return o; });
    const g = c.createGain(); g.gain.value = 0.06; os.forEach((o) => { o.connect(g); o.start(); }); g.connect(out);
    return { stop: () => os.forEach((o) => o.stop()) };
  },
};
