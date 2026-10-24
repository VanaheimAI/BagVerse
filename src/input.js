// Keyboard, mouse-look (pointer lock or drag) and touch (joystick + look) input.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();      // edge-triggered this frame
    this.look = { dx: 0, dy: 0 };
    this.joy = { x: 0, y: 0 };
    this.wheel = 0;
    this.enabled = true;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.touch) document.body.classList.add('touch');
    // inside a host app's viewer (iframe) the host draws its own close / menu buttons over the top corners
    let embedded = false; try { embedded = window.self !== window.top; } catch (_) { embedded = true; }
    if (embedded) document.body.classList.add('embedded');

    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // mouse: click to lock, or hold-drag to look when lock is unavailable
    let dragging = false;
    canvas.addEventListener('mousedown', (e) => {
      if (this.touch) return;
      dragging = true;
      if (e.button === 0 && canvas.requestPointerLock && !document.pointerLockElement) {
        try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
      }
    });
    addEventListener('mouseup', () => (dragging = false));
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === canvas || dragging) {
        this.look.dx += e.movementX; this.look.dy += e.movementY;
      }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    // touch: left joystick element, right side of screen looks
    const joyEl = document.getElementById('joy');
    const knob = document.getElementById('joyknob');
    let joyId = null, lookId = null, lx = 0, ly = 0;
    const joyCenter = () => { const r = joyEl.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width / 2]; };
    joyEl.addEventListener('touchstart', (e) => { joyId = e.changedTouches[0].identifier; e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }, { passive: true });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          const [cx, cy, r] = joyCenter();
          let x = (t.clientX - cx) / r, y = (t.clientY - cy) / r;
          const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
          this.joy.x = x; this.joy.y = y;
          knob.style.transform = `translate(${x * r * 0.6}px, ${y * r * 0.6}px)`;
        } else if (t.identifier === lookId) {
          this.look.dx += (t.clientX - lx) * 1.6; this.look.dy += (t.clientY - ly) * 1.6;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) { joyId = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; }
        if (t.identifier === lookId) lookId = null;
      }
    };
    addEventListener('touchend', end); addEventListener('touchcancel', end);
    // jump is a tap on foot; held, it is the car's brake
    const jb = document.getElementById('jumpbtn');
    jb.addEventListener('touchstart', (e) => { this.pressed.add('Space'); this.keys.add('Space'); e.preventDefault(); }, { passive: false });
    jb.addEventListener('touchend', () => this.keys.delete('Space')); jb.addEventListener('touchcancel', () => this.keys.delete('Space'));
    document.getElementById('usebtn').addEventListener('touchstart', (e) => { this.pressed.add('KeyE'); e.preventDefault(); }, { passive: false });
    document.getElementById('mobbtn')?.addEventListener('touchstart', (e) => { this.pressed.add('KeyF'); e.preventDefault(); }, { passive: false });
  }

  down(...codes) { return this.enabled && codes.some((c) => this.keys.has(c)); }
  hit(code) { return this.enabled && this.pressed.has(code); }

  /** movement axes in camera space: x = strafe right, y = forward */
  move() {
    let x = 0, y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.joy.x || this.joy.y) { x = this.joy.x; y = -this.joy.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y, mag: Math.min(1, l) };
  }

  endFrame() { this.pressed.clear(); this.look.dx = this.look.dy = 0; this.wheel = 0; }
}
