// Screen fades: one full-screen veil above everything.
//   through(fn)  fade to dark, run fn (swap screens, start a game, teleport), fade back in
//   cut()        snap to dark and fade in (for jumps that already happened, e.g. any long teleport)
// Off when `enabled` is false (tests with a fixed timestep take screenshots straight away).
const el = document.createElement('div');
el.id = 'fader'; el.setAttribute('aria-hidden', 'true');
document.body.appendChild(el);

export const fx = {
  enabled: true,
  busy: false,
  set(o, ms) { el.style.transition = ms ? `opacity ${ms}ms ease` : 'none'; el.style.opacity = String(o); if (!ms) void el.offsetWidth; },
  /** fade out (out ms), run fn, fade in (inn ms). Resolves when fn has run. */
  through(fn, out = 200, inn = 420) {
    if (!this.enabled || this.busy) { fn(); return Promise.resolve(); }
    this.busy = true; this.set(1, out);
    return new Promise((res) => setTimeout(() => {
      try { fn(); } finally {
        requestAnimationFrame(() => requestAnimationFrame(() => { this.set(0, inn); this.busy = false; res(); }));   // a frame or two to draw the new scene first
      }
    }, out));
  },
  cut(inn = 450) {
    if (!this.enabled || this.busy) return;
    this.set(1, 0); requestAnimationFrame(() => this.set(0, inn));
  },
};
