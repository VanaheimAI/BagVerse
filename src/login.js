// Login screen (website only): the BagVerse key art full-screen, with the sign-in controls inside the art's glowing
// panel under its logo (wide screens), or on a glass card over the art cropped to the character (tall / phone screens).
//   Sign in with X  -> links X to this guest account (progress, wallet, raffle entries carry over) and cloud-saves it
//   Play as guest   -> straight in; progress stays on this device
// Signed-in players see "Continue as @handle" (+ sign out).
import BG from './assets/login/bg.webp';
import BG_M from './assets/login/bg_m.webp';

const X_LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class LoginScreen {
  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'login'; el.hidden = true;
    el.style.setProperty('--lg-bg', `url("${BG}")`); el.style.setProperty('--lg-bg-m', `url("${BG_M}")`);
    el.innerHTML = `<div class="lg-stage"><div class="lg-art" role="img" aria-label="BagVerse"></div>
      <div class="lg-panel"><div class="logo lg-logo" role="img" aria-label="BagVerse">BAGVERSE</div><div class="lg-body" id="lg-body"></div></div></div>`;
    document.body.appendChild(el);
    this.body = el.querySelector('#lg-body');
  }

  /**
   * show and wait for the player to go in. opts: { account: { linked, handle, name, avatar } | null, message, onX(), onSignOut() }
   * resolves 'guest' | 'continue'
   */
  show({ account = null, message = null, onX, onSignOut, inGame = false } = {}) {
    this.el.hidden = false; this.el.classList.toggle('ingame', inGame);
    return new Promise((resolve) => {
      const done = (how) => { this.hide(); resolve(how); };
      const linked = account?.linked;
      const who = linked ? (account.handle ? '@' + account.handle : account.name || 'your X account') : '';
      this.body.innerHTML = `
        <div class="lg-tag">THE BAG SQUARE IS OPEN <i>ALPHA</i></div>
        ${linked ? `
          <button class="lg-btn lg-x" id="lg-go">${account.avatar ? `<img alt="" src="${esc(account.avatar)}" referrerpolicy="no-referrer">` : X_LOGO}<span>Continue as ${esc(who)}</span></button>
          <p class="lg-note">Your progress is saved to your account and follows you to any device.</p>
          <button class="lg-link" id="lg-out">Not you? Sign out</button>`
        : `
          <button class="lg-btn lg-x" id="lg-x">${X_LOGO}<span>Sign in with X</span></button>
          <button class="lg-btn lg-guest" id="lg-guest">${inGame ? 'Back to the game' : 'Play as guest'}</button>
          <p class="lg-note">Sign in with X to save your progress to the cloud and pick up on any device. Guests keep their progress on this device only.</p>`}
        <p class="lg-err" id="lg-err" ${message ? '' : 'hidden'}>${esc(message || '')}</p>
        <p class="lg-legal">By playing you agree to the <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</p>`;
      const $ = (id) => this.body.querySelector('#' + id);
      $('lg-go')?.addEventListener('click', () => done('continue'));
      $('lg-guest')?.addEventListener('click', () => done('guest'));
      $('lg-out')?.addEventListener('click', async () => { $('lg-out').disabled = true; $('lg-out').textContent = 'Signing out…'; await onSignOut?.(); });
      $('lg-x')?.addEventListener('click', async () => {
        const b = $('lg-x'), err = $('lg-err'); b.disabled = true; b.querySelector('span').textContent = 'Opening X…'; err.hidden = true;
        try { await onX?.(); } catch (e) { b.disabled = false; b.querySelector('span').textContent = 'Sign in with X'; err.textContent = e.message || 'Could not reach X. Try again.'; err.hidden = false; }
      });
    });
  }

  hide() { this.el.hidden = true; }
}
