// Keyboard, mouse-look (pointer lock or drag), touch (joystick + look) and gamepad input.
// Gamepads (Xbox-layout / "standard" mapping: ROG Ally X, Legion Go, Steam Deck, Xbox, PlayStation, Switch Pro):
// sticks feed the same move / look axes as the touch joystick and mouse, buttons are sent as the keyboard keys
// the game already listens for, and while a menu is up the d-pad / stick moves a focus ring and A presses it.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();      // edge-triggered this frame
    this.look = { dx: 0, dy: 0 };
    this.joy = { x: 0, y: 0 };
    this.wheel = 0;
    this.enabled = true;
    this.pad = { on: false, rt: 0, lt: 0 };   // analog triggers for the car / scooter (rt = throttle, lt = brake)
    this.touchJoy = false;
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
    joyEl.addEventListener('touchstart', (e) => { joyId = e.changedTouches[0].identifier; this.touchJoy = true; e.preventDefault(); }, { passive: false });
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
        if (t.identifier === joyId) { joyId = null; this.touchJoy = false; this.joy.x = this.joy.y = 0; knob.style.transform = ''; }
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

    // gamepad: on screen glyphs follow whichever was used last (pad vs keyboard / mouse / touch)
    this.gp = new Gamepads(this);
    const off = (e) => { if (e.isTrusted !== false) this.gp.setActive(false); };
    addEventListener('keydown', off, true); addEventListener('mousedown', off, true); addEventListener('touchstart', off, true);
    addEventListener('mousemove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) off(e); }, true);
  }

  /** read the gamepads: call once per frame, before the game reads input */
  poll() { this.gp.poll(); }

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

// ---------------------------------------------------------------- gamepad
// button index (standard mapping) -> key code it sends while playing
const PLAY = {
  0: 'Space',        // A      jump (held in a car: handbrake)
  1: 'KeyE',         // B      use / drive / ride / get out
  2: 'KeyR',         // X      scooter
  3: 'KeyF',         // Y      flashmob / join a flashmob
  6: 'ShiftLeft',    // LT     walk (on foot; in a car it brakes)
  8: 'KeyM',         // View   map
  9: 'Escape',       // Menu   close / leave a mini-game
  10: 'KeyK',        // L3     skins
  11: 'KeyL',        // R3     leaderboard
  12: 'KeyJ',        // up     missions
  13: 'KeyI',        // down   collection
  14: 'Digit1',      // left   Thriller emote
  15: 'Digit2',      // right  Dance emote
};
const KEY = { Space: ' ', Enter: 'Enter', Escape: 'Escape', ShiftLeft: 'Shift', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
const keyOf = (code) => KEY[code] || (code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code);
// on-screen key hints (<kbd>E</kbd> ...) -> the pad button that does it
export const PAD_GLYPH = { E: 'B', R: 'X', F: 'Y', SPACE: 'A', M: 'VIEW', ESC: 'MENU', K: 'L3', L: 'R3', J: '▲', I: '▼', 1: '◀', 2: '▶', ENTER: 'A' };
// overlays that take the pad over (topmost first); skins has its own arrow-key / Enter navigation
const MENUS = ['login', 'skins', 'modal', 'welcome', 'missions', 'bigmap', 'emotewheel'];
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [data-skin], [data-act], [data-emote]';
const DEAD = 0.2;

const stick = (x, y) => {   // radial dead zone, rescaled so the edge of the dead zone is 0
  const l = Math.hypot(x, y); if (l < DEAD) return [0, 0];
  const k = Math.min(1, (l - DEAD) / (1 - DEAD)) / l; return [x * k, y * k];
};
const shown = (el) => el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

class Gamepads {
  constructor(input) {
    this.input = input; this.prev = new Map(); this.held = new Set(); this.t = performance.now();
    this.rep = { dir: null, at: 0 }; this.focus = null; this.active = false; this.joyFromPad = false;
    addEventListener('gamepadconnected', (e) => {
      dispatchEvent(new CustomEvent('bv-pad', { detail: { connected: true, id: e.gamepad?.id } }));
      this.setActive(true);
    });
    addEventListener('gamepaddisconnected', (e) => {
      this.release(); dispatchEvent(new CustomEvent('bv-pad', { detail: { connected: false, id: e.gamepad?.id } }));
      if (!this.pads().length) this.setActive(false);
    });
    this.glyphs();
  }

  pads() { return navigator.getGamepads ? [...navigator.getGamepads()].filter((g) => g && g.connected) : []; }

  setActive(on) {
    if (on === this.active) return;
    this.active = on; this.input.pad.on = on; document.body.classList.toggle('pad', on);
    if (!on) this.clearFocus();
  }

  send(type, code) {
    // in a menu, aim at the focused control so field-aware handlers see it (e.g. Enter in the skins name box saves the name)
    const ae = this.inMenu && document.activeElement && document.activeElement !== document.body ? document.activeElement : window;
    ae.dispatchEvent(new KeyboardEvent(type, { key: keyOf(code), code, bubbles: true, cancelable: true }));
  }
  press(code) { if (this.held.has(code)) return; this.held.add(code); this.send('keydown', code); }
  lift(code) { if (!this.held.delete(code)) return; this.send('keyup', code); }
  tap(code) { this.send('keydown', code); this.send('keyup', code); }
  release() {
    for (const c of [...this.held]) this.lift(c);
    if (this.joyFromPad) { this.input.joy.x = this.input.joy.y = 0; this.joyFromPad = false; }
    this.input.pad.rt = this.input.pad.lt = 0;
  }

  menu() {
    for (const id of MENUS) { const el = document.getElementById(id); if (shown(el)) return el; }
    return null;
  }

  poll() {
    const now = performance.now(), dt = Math.min(0.1, (now - this.t) / 1000); this.t = now;
    const pads = this.pads(); if (!pads.length) return;
    // merge every pad (an Ally's built-in controls and a paired controller can both be connected)
    const b = [], ax = [0, 0, 0, 0];
    for (const g of pads) {
      g.buttons.forEach((x, i) => { b[i] = Math.max(b[i] || 0, x.value, x.pressed ? 1 : 0); });
      g.axes.slice(0, 4).forEach((v, i) => { if (Math.abs(v) > Math.abs(ax[i])) ax[i] = v; });
    }
    const [lx, ly] = stick(ax[0], ax[1]), [rx, ry] = stick(ax[2], ax[3]);
    const down = (i) => (b[i] || 0) > 0.5;
    const edge = (i) => down(i) && !this.prev.get(i);
    const any = b.some((v, i) => v > 0.5 && i !== 16) || lx || ly || rx || ry;
    if (any) this.setActive(true);
    const menu = this.menu(); this.inMenu = !!menu;
    if (menu) this.menuFrame(menu, b, down, edge, lx, ly, rx, ry, dt);
    else this.playFrame(b, down, edge, lx, ly, rx, ry, dt);
    this.prev = new Map(b.map((v, i) => [i, v > 0.5]));
  }

  playFrame(b, down, edge, lx, ly, rx, ry, dt) {
    const I = this.input;
    this.clearFocus();
    if (this.held.has('Enter')) this.lift('Enter');
    for (const [i, code] of Object.entries(PLAY)) { if (down(+i)) this.press(code); else this.lift(code); }
    // left stick moves (same axes as the touch joystick); leave it alone while a finger is on the touch one
    if (!I.touchJoy) {
      if (lx || ly) { I.joy.x = lx; I.joy.y = ly; this.joyFromPad = true; }
      else if (this.joyFromPad) { I.joy.x = I.joy.y = 0; this.joyFromPad = false; }
    }
    // right stick looks: squared response for fine aim, roughly 3 rad/s yaw at full tilt
    I.look.dx += rx * Math.abs(rx) * 950 * dt;
    I.look.dy += ry * Math.abs(ry) * 650 * dt;
    // bumpers zoom the camera, triggers drive
    if (edge(4)) I.wheel += 1;
    if (edge(5)) I.wheel -= 1;
    I.pad.lt = b[6] || 0; I.pad.rt = b[7] || 0;
  }

  menuFrame(menu, b, down, edge, lx, ly, rx, ry, dt) {
    const I = this.input;
    // nothing held over from play (a held jump / walk would keep going behind the menu)
    for (const c of [...this.held]) this.lift(c);
    if (this.joyFromPad) { I.joy.x = I.joy.y = 0; this.joyFromPad = false; }
    I.pad.rt = I.pad.lt = 0;
    // direction from the d-pad or a firm stick push, with key-repeat
    let dir = down(12) ? 'Up' : down(13) ? 'Down' : down(14) ? 'Left' : down(15) ? 'Right' : null;
    if (!dir && Math.hypot(lx, ly) > 0.6) dir = Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'Right' : 'Left') : (ly > 0 ? 'Down' : 'Up');
    const now = performance.now();
    if (dir && (dir !== this.rep.dir || now >= this.rep.at)) {
      this.rep.at = now + (dir !== this.rep.dir ? 380 : 120); this.rep.dir = dir;
      if (menu.id === 'skins') this.tap('Arrow' + dir); else this.move(menu, dir);
    } else if (!dir) this.rep.dir = null;
    const skins = menu.id === 'skins';
    if (edge(0)) {                       // A: press the focused control
      const f = this.focus;
      if (!skins && f && menu.contains(f) && shown(f)) {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) f.focus(); else f.click();
      } else this.tap('Enter');
    }
    if (edge(1) || edge(9)) this.tap('Escape');   // B / Menu: back
    if (skins) {                         // bumpers flip the ALL / OWNED / UNLOCKED / FAVORITES filters
      const tabs = [...menu.querySelectorAll('#sk-filters [data-f]')].filter(shown);
      if (tabs.length && (edge(4) || edge(5))) {
        const i = Math.max(0, tabs.findIndex((t) => t.classList.contains('on')));
        tabs[(i + (edge(5) ? 1 : tabs.length - 1)) % tabs.length].click();
      }
    }
    // right stick scrolls long panels (missions, collection, leaderboard)
    if (ry || rx) {
      const sc = this.scroller(this.focus && menu.contains(this.focus) ? this.focus : menu, menu);
      sc?.scrollBy(rx * 900 * dt, ry * 900 * dt);
    }
  }

  scroller(el, root) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 4) return e;
      if (e === root) break;
    }
    return root.querySelector('*') && [...root.querySelectorAll('*')].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 4) || null;
  }

  targets(menu) {
    return [...menu.querySelectorAll(FOCUSABLE)].filter((e) => shown(e) && !e.disabled && e.closest('[hidden]') === null);
  }

  /** spatial navigation: the nearest control in that direction, favouring ones lined up with the current one */
  move(menu, dir) {
    const list = this.targets(menu); if (!list.length) return;
    let cur = this.focus && list.includes(this.focus) ? this.focus : null;
    if (!cur) { this.setFocus(list.find((e) => e.matches('.primary, .on, [autofocus]')) || list[0]); return; }
    const r0 = cur.getBoundingClientRect(), c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
    const [ux, uy] = { Up: [0, -1], Down: [0, 1], Left: [-1, 0], Right: [1, 0] }[dir];
    let best = null, bs = Infinity;
    for (const e of list) {
      if (e === cur) continue;
      const r = e.getBoundingClientRect(), dx = r.left + r.width / 2 - c0[0], dy = r.top + r.height / 2 - c0[1];
      const along = dx * ux + dy * uy; if (along <= 4) continue;
      const across = Math.abs(dx * uy - dy * ux);
      const s = along + across * 2.2; if (s < bs) { bs = s; best = e; }
    }
    if (best) this.setFocus(best);
  }

  setFocus(el) {
    this.clearFocus(); this.focus = el; el.classList.add('padfocus');
    try { el.focus({ preventScroll: true }); } catch (_) {}
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  clearFocus() { if (this.focus) { this.focus.classList.remove('padfocus'); this.focus = null; } }

  /** tag <kbd> key hints with the pad button that does the same thing (CSS swaps them in while body.pad) */
  glyphs() {
    const tag = (root) => {
      for (const k of root.querySelectorAll ? root.querySelectorAll('kbd') : []) {
        const g = PAD_GLYPH[k.textContent.trim().toUpperCase()];
        if (g) k.dataset.pad = g; else delete k.dataset.pad;
      }
    };
    const run = () => {
      tag(document);
      new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) tag(n.tagName === 'KBD' ? n.parentNode : n); })
        .observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) run(); else addEventListener('DOMContentLoaded', run);
  }
}
