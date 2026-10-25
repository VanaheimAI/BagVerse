// Missions UI: the HUD tracker, the Missions panel (Guide / Daily / Weekly / Achievements / Journey), the first-run
// welcome guide, the daily login calendar and the small XP feed.
import { REWARDS, TIERS, tierOf, xpToNext, xpToReach, LEVEL_CAP } from './progression.js';
import { TUTORIAL, ACHIEVEMENTS, DAILY_XP, DAILY_BONUS, WEEKLY_XP, WEEKLY_BONUS, WEEKLY_BONUS_AT } from './quests.js';
import { KIOSKS, TIER_LEVEL } from './collectibles.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString();
const bar = (v, max) => `<span class="mq-bar"><i style="width:${Math.min(100, (v / Math.max(1, max)) * 100).toFixed(1)}%"></i></span>`;
const amount = (q) => `${q.unit === 'm' && q.need >= 1000 ? (q.prog / 1000).toFixed(1) + ' / ' + q.need / 1000 + ' km' : `${Math.floor(q.prog)} / ${q.need}${q.unit ? ' ' + q.unit : ''}`}`;

export class MissionsUI {
  constructor({ progress, quests, collect, touch }) {
    this.p = progress; this.q = quests; this.c = collect; this.touch = touch;
    this.tab = 'guide'; this.isOpen = false;
    const el = document.createElement('div'); el.id = 'missions'; el.hidden = true;
    el.innerHTML = `<div class="mq-card" role="dialog" aria-label="Missions">
      <header><b>MISSIONS</b><span id="mq-lvl"></span><button class="mq-x" id="mq-close" aria-label="Close">✕</button></header>
      <nav id="mq-tabs">${['guide', 'daily', 'weekly', 'achievements', 'journey'].map((t) => `<button data-t="${t}">${t === 'achievements' ? 'Awards' : t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</nav>
      <section id="mq-body"></section></div>`;
    document.body.appendChild(el);
    this.el = el;
    $('mq-close').onclick = () => this.close();
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });
    $('mq-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { this.tab = b.dataset.t; this.render(); } });
    $('mq-body').addEventListener('click', (e) => {
      const r = e.target.closest('[data-reroll]'); if (r && this.q.rerollDaily(r.dataset.reroll)) this.render();
      if (e.target.closest('#mq-skip')) { this.q.skipTutorial(); this.render(); this.updateTracker(); }
      if (e.target.closest('#mq-login')) { this.claimLogin(); }
    });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    $('tracker')?.addEventListener('click', () => this.open(this.q.tutorialDone ? 'daily' : 'guide'));
  }

  open(tab) { if (tab) this.tab = tab; this.isOpen = true; this.el.hidden = false; this.render(); if (document.pointerLockElement) document.exitPointerLock(); }
  close() { this.isOpen = false; this.el.hidden = true; this.onClose?.(); }

  render() {
    const P = this.p, S = P.s, t = P.visual;
    $('mq-lvl').innerHTML = `<b style="color:${t.color}">${t.label}</b> · LV ${S.level}${P.legend ? ' · LEGEND ' + P.legend : ''}`;
    this.el.querySelectorAll('#mq-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === this.tab));
    $('mq-body').innerHTML = this[this.tab]();
    $('mq-body').scrollTop = 0;
  }

  // ------------------------------------------------------------------ tabs
  guide() {
    const S = this.p.s, step = this.q.step, hint = (h) => esc(this.touch ? h.touch : h.key);
    const steps = TUTORIAL.map((s, i) => `<li class="${i < step ? 'done' : i === step ? 'now' : ''}"><span class="mq-n">${i < step ? '✓' : i + 1}</span>
      <div><b>${esc(s.title)}</b><small>${hint(s.hint)}</small>${i === step ? bar(S.tut.prog || 0, s.need) : ''}</div><em>+${s.xp} XP</em></li>`).join('');
    const done = this.q.tutorialDone;
    return `<div class="mq-hero"><b>${done ? 'Tutorial complete. Dailies are live!' : `Step ${step + 1} of ${TUTORIAL.length}`}</b>
      <p>${done ? 'Your loop from here: 3 dailies, 7 weeklies, hidden Bags in every district and free RWA tournaments from Lv 25.' : 'Follow the steps (the beacon points the way). Finishing the guide gets you to about Lv 10 and unlocks Thriller + flashmobs.'}</p></div>
      <ol class="mq-steps">${steps}</ol>
      ${done ? '' : '<button class="mq-link" id="mq-skip">Skip the tutorial</button>'}
      <h4>How levelling works</h4>
      <ul class="mq-facts">
        <li><b>Play</b> 10 XP per active minute for your first hour each day, then 5 XP/min up to 3 h. Idle (90 s) or a hidden tab pauses the clock.</li>
        <li><b>Rested XP</b> builds while you're away and doubles play XP until it runs out (shown as the light band on your XP bar).</li>
        <li><b>Dailies</b> ${DAILY_XP} XP each plus ${DAILY_BONUS} for all three. Streak bonus +10/20/30% at 7/14/30 days; a freeze is earned every 7 days.</li>
        <li><b>Weeklies</b> ${WEEKLY_XP} XP each plus ${fmt(WEEKLY_BONUS)} once ${WEEKLY_BONUS_AT} are done.</li>
        <li><b>Bags</b> 100 XP each, 1,000 XP per district cleared (20 per district, 220 total).</li>
        <li><b>Ads, flashmobs, GM</b> capped daily (250 / 200 / 25 XP). XP can't be bought; $VERSE holders get at most +15% on play XP.</li>
      </ul>
      <h4>RWA prize kiosks</h4>
      <ul class="mq-facts">${KIOSKS.map((k) => `<li><b>${esc(k.name)}</b> ${esc(k.event)}: ${esc(k.prize)}. Free entry, Lv ${TIER_LEVEL[k.tier]}+.</li>`).join('')}
        <li><b>Kanto Vault</b> graded Pokémon raffles (Bull Run, south-east); <b>Wano Vault</b> One Piece raffles coming soon (east of the plaza).</li></ul>
      <h4>Controls</h4>
      <p class="mq-small">${this.touch ? 'Left stick move · drag right side to look · JUMP · E interact · 💃 emotes · 🛴 scooter · tap this tracker for missions' : 'WASD move · Shift walk · Space jump · E interact · 1 / 2 emotes · F flashmob · R scooter · J missions · K skins · M map · Enter chat'}</p>`;
  }

  daily() {
    const P = this.p, S = P.s, q = S.q, ds = this.q.dailies;
    if (!this.q.tutorialDone) return `<div class="mq-hero"><b>Dailies unlock after the tutorial</b><p>Finish the Guide steps first. You're on step ${this.q.step + 1} of ${TUTORIAL.length}.</p></div>`;
    const streak = S.streak, bonus = Math.round(P.streakBonus * 100);
    const login = this.loginHtml();
    return `${login}
      <div class="mq-row"><div class="mq-pill">🔥 Streak <b>${streak.count}</b> day${streak.count === 1 ? '' : 's'}${bonus ? ` · +${bonus}% daily XP` : ''}</div><div class="mq-pill">❄ Freezes <b>${streak.freezes}</b>/2</div>${q.bank ? `<div class="mq-pill">🏦 Catch-up <b>${q.bank}</b></div>` : ''}</div>
      <ul class="mq-list">${ds.map((d) => `<li class="${d.done ? 'done' : ''}"><div><b>${esc(d.title)}</b>${bar(d.prog, d.need)}<small>${amount(d)}</small></div>
        <em>${d.done ? '✓' : `+${DAILY_XP}`}</em>${!d.done && q.reroll ? `<button class="mq-re" data-reroll="${d.id}" title="Swap this quest (1 per day)">↻</button>` : ''}</li>`).join('')}</ul>
      <p class="mq-small">${ds.filter((d) => d.done).length}/3 done · all three: +${DAILY_BONUS} XP ${q.dbonus ? '✓' : ''} · new dailies at midnight. ${q.bank ? 'Catch-up: your next daily pays double (missed days bank up to 3).' : ''}</p>`;
  }

  weekly() {
    const S = this.p.s, q = S.q, ws = this.q.weeklies, n = ws.filter((w) => w.done).length;
    if (!this.q.tutorialDone) return `<div class="mq-hero"><b>Weeklies unlock after the tutorial</b><p>Finish the Guide steps first.</p></div>`;
    return `<div class="mq-hero"><b>${n}/${ws.length} done · bonus at ${WEEKLY_BONUS_AT}: +${fmt(WEEKLY_BONUS)} XP ${q.wbonus ? '✓' : ''}</b>${bar(Math.min(n, WEEKLY_BONUS_AT), WEEKLY_BONUS_AT)}<p>Resets Monday. Do them on any days you like.</p></div>
      <ul class="mq-list">${ws.map((w) => `<li class="${w.done ? 'done' : ''}"><div><b>${esc(w.title)}</b>${bar(w.prog, w.need)}<small>${amount(w)}</small></div><em>${w.done ? '✓' : `+${WEEKLY_XP}`}</em></li>`).join('')}</ul>`;
  }

  achievements() {
    const S = this.p.s, st = S.stats, got = ACHIEVEMENTS.filter((a) => S.ach[a.id]).length;
    st.bags = S.bags.length; st.level = S.level;
    return `<div class="mq-hero"><b>${got}/${ACHIEVEMENTS.length} awards</b>${bar(got, ACHIEVEMENTS.length)}</div>
      <ul class="mq-grid">${ACHIEVEMENTS.map((a) => { const v = Math.min(a.need, st[a.stat] || 0), done = !!S.ach[a.id];
        return `<li class="${done ? 'done' : ''}"><b>${done ? '🏆 ' : ''}${esc(a.title)}</b>${done ? '' : bar(v, a.need)}<small>${done ? 'Earned' : `${fmt(v)} / ${fmt(a.need)}`} · +${fmt(a.xp)} XP</small></li>`; }).join('')}</ul>
      <h4>Hidden Bags by district</h4>
      <ul class="mq-grid mq-dist">${Object.keys(this.c.districtTotal).map((z) => { const d = this.c.districtProgress(z); return `<li class="${d.found >= d.total && d.total ? 'done' : ''}"><b>${z.replace(/_/g, ' ').toUpperCase()}</b>${bar(d.found, d.total)}<small>${d.found}/${d.total}</small></li>`; }).join('')}</ul>`;
  }

  journey() {
    const S = this.p.s, L = S.level, t = tierOf(L), cost = xpToNext(L);
    const tiers = TIERS.map((x, i) => { const next = TIERS[i + 1]; const on = L >= x.min; return `<li class="${on ? 'on' : ''}" style="--c:${x.color}"><b>${x.name}</b><small>Lv ${x.min}${next ? '–' + (next.min - 1) : '+'}</small></li>`; }).join('');
    const road = REWARDS.map((r) => `<li class="${L >= r.lv ? 'got' : ''} ${r.big ? 'big' : ''}"><span>Lv ${r.lv}</span><b>${esc(r.label)}</b>${r.soon ? '<em>SOON</em>' : L >= r.lv ? '<em>✓</em>' : ''}</li>`).join('');
    const marks = [10, 25, 50, 100, 150, 200, 250].map((m) => `<li class="${L >= m ? 'got' : ''}"><span>Lv ${m}</span><b>${fmt(xpToReach(m))} XP total</b></li>`).join('');
    return `<div class="mq-hero"><b style="color:${t.color}">${t.label}</b> · Level ${L}${L >= LEVEL_CAP ? ' (Legend ' + this.p.legend + ')' : ''}
      ${bar(S.xp, cost)}<p>${fmt(S.xp)} / ${fmt(cost)} XP to Lv ${L + 1} · total ${fmt(S.totalXp)} XP${S.rested > 1 ? ` · rested ${fmt(S.rested)} XP` : ''}</p></div>
      <ul class="mq-tiers">${tiers}</ul>
      <h4>Reward road</h4><ul class="mq-road">${road}</ul>
      <h4>Milestones</h4><ul class="mq-road">${marks}</ul>
      <p class="mq-small">After Lv 250: Legend levels (6,000 XP each, a star every 10). Level and XP are soulbound: they can't be bought or traded.</p>`;
  }

  loginHtml() {
    const S = this.p.s, n = S.login.day % 7, claimedToday = S.login.last === S.day.key;
    const done = claimedToday && n === 0 ? 7 : n;
    const days = [25, 40, 55, 70, 90, 110, 150].map((xp, i) => `<li class="${i < done ? 'got' : i === done && !claimedToday ? 'now' : ''}"><small>Day ${i + 1}</small><b>${xp}</b>${i === 6 ? '<em>🎁</em>' : ''}</li>`).join('');
    return `<div class="mq-login"><b>Daily login</b><ul>${days}</ul>${!claimedToday ? '<button id="mq-login" class="mq-go">Claim today</button>' : '<small>Claimed today ✓ · a missed day pauses the calendar, it never resets</small>'}</div>`;
  }
  claimLogin() { const xp = this.p.claimLogin(); if (xp) this.onToast?.(`DAILY LOGIN · +${xp} XP`, 'big'); this.render(); }

  // ------------------------------------------------------------------ first run + new day
  welcome(onDone) {
    const el = document.createElement('div'); el.id = 'welcome';
    el.innerHTML = `<div class="mq-card mq-welcome"><header><b>WELCOME TO BAGVERSE</b></header>
      <section>
        <p class="mq-lead">The Bag Square is a city to hang out, grind and win real-world prizes in.</p>
        <ul class="mq-how">
          <li><span>⬆</span><div><b>Level up to 250</b><small>Every minute you play, every quest and every hidden Bag earns XP. New tiers: CHROME, HOLO, APEX, PRISM, ECLIPSE, GENESIS.</small></div></li>
          <li><span>📜</span><div><b>Missions</b><small>A quick guide first (about 10 minutes, gets you to Lv 10), then 3 dailies and 7 weeklies.</small></div></li>
          <li><span>🏆</span><div><b>RWA prizes</b><small>Gold kiosks around the city enter you in free tournaments for vaulted real-world assets from Lv 25.</small></div></li>
          <li><span>🛴</span><div><b>Unlocks</b><small>Dance at Lv 2, your Punk Scooter at Lv 5, Thriller + flashmobs at Lv 10.</small></div></li>
        </ul>
      </section>
      <footer><button class="mq-ghost" id="wl-skip">Skip guide</button><button class="mq-go" id="wl-go">Start the guide</button></footer></div>`;
    document.body.appendChild(el);
    const done = (skip) => { el.remove(); this.p.s.tut.seenWelcome = true; if (skip) this.q.skipTutorial(); this.p.save(); this.updateTracker(); onDone?.(); };
    $('wl-go').onclick = () => done(false); $('wl-skip').onclick = () => done(true);
  }

  // ------------------------------------------------------------------ HUD bits
  updateTracker() {
    const el = $('tracker'); if (!el) return;
    const t = this.q.current;
    if (t) {
      const h = this.touch ? t.hint.touch : t.hint.key;
      el.innerHTML = `<small>GUIDE ${this.q.step + 1}/${TUTORIAL.length} · +${t.xp} XP</small><b>${esc(t.title)}</b><span>${esc(h)}</span>${bar(this.p.s.tut.prog || 0, t.need)}`;
      el.className = 'guide';
      return;
    }
    const ds = this.q.dailies, done = ds.filter((d) => d.done).length, next = ds.find((d) => !d.done);
    const login = this.p.loginPending ? ' · 🎁 login' : '';
    el.className = '';
    el.innerHTML = `<small>DAILIES ${done}/3 · 🔥 ${this.p.s.streak.count}${login}</small><b>${next ? esc(next.title) : 'All dailies done ✓'}</b>${next ? bar(next.prog, next.need) : ''}`;
  }

  feed(text, kind = '') {
    const f = $('xpfeed'); if (!f) return;
    const d = document.createElement('div'); d.textContent = text; d.className = kind; f.prepend(d);
    while (f.children.length > 3) f.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 1800); setTimeout(() => d.remove(), 2600);
  }
}
