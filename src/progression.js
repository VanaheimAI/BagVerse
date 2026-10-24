// Progression: the 1–250 "long grind" (see README: Progression 1–250).
//  - curve: xpToNext(L) = 50 + 4000·L²/(L²+45²) + 12·max(0, L−100)   (~894K XP to Lv 250), then flat 6,000 XP
//    "Legend levels". Fast onboarding (Lv 10 in the first session), a predictable plateau, prestige at the top.
//  - XP comes from capped sources (proof-of-play with diminishing returns, quests, social, exploration, ads...),
//    rested XP for returning players, streaks with freezes, a 7-day login calendar.
//  - XP and level are soulbound and can't be bought: $BAG holders get at most +15% on proof-of-play only, and XP no
//    longer mints $BAG.
// Everything is local for now (localStorage); the game server becomes the authority later (same shapes).

export const LEVEL_CAP = 250;
export const LEGEND_XP = 6000;
export const xpToNext = (L) => (L >= LEVEL_CAP ? LEGEND_XP : Math.round(50 + (4000 * L * L) / (L * L + 2025) + 12 * Math.max(0, L - 100)));
/** cumulative XP needed to reach level L */
export function xpToReach(L) { let t = 0; for (let i = 1; i < L; i++) t += xpToNext(i); return t; }

// visual tiers (identity): BASE / CHROME / HOLO / APEX kept, PRISM / ECLIPSE / GENESIS added; each band has I/II/III
export const TIERS = [
  { min: 1, name: 'BASE', color: '#b9c2d0' },
  { min: 25, name: 'CHROME', color: '#d6e4ff' },
  { min: 50, name: 'HOLO', color: '#5ff3ff' },
  { min: 100, name: 'APEX', color: '#ffc83d' },
  { min: 150, name: 'PRISM', color: '#ff6bf0' },
  { min: 200, name: 'ECLIPSE', color: '#b18cff' },
  { min: 250, name: 'GENESIS', color: '#7cff3d' },
];
export function tierOf(level) {
  let i = TIERS.length - 1; while (i > 0 && level < TIERS[i].min) i--;
  const t = TIERS[i], next = TIERS[i + 1];
  let step = '';
  if (next) { const span = next.min - t.min, k = Math.min(2, Math.floor(((level - t.min) / span) * 3)); step = ['I', 'II', 'III'][k]; }
  return { ...t, step, label: step ? `${t.name} ${step}` : t.name, next };
}

export const HOLDER_TIERS = [[100000, 'WHALE', '100K+ TOKENS', 0.15], [50000, 'DEGEN', '50K – 99K TOKENS', 0.10], [10000, 'APE', '10K – 49K TOKENS', 0.05], [0, 'NORMIE', '0 – 9K TOKENS', 0]];

// what each level unlocks. `gate` = a feature the game checks (Progress.has); `soon` = designed, not built yet.
export const REWARDS = [
  { lv: 2, label: 'Dance emote', gate: 'emote:Dance' },
  { lv: 3, label: 'Portal previews (Bag Run & co.)', gate: 'portals' },
  { lv: 4, label: 'Nameplate colour: Mint' },
  { lv: 5, label: 'Punk Scooter + garage', gate: 'scooter' },
  { lv: 6, label: 'Title: Fresh Bag' },
  { lv: 7, label: 'Chat bubble: Neon' },
  { lv: 8, label: 'Nameplate colour: Sunset' },
  { lv: 9, label: 'District stamp book' },
  { lv: 10, label: 'Thriller emote + flashmob hosting', gate: 'emote:Thriller' },
  { lv: 12, label: 'Scooter paint: Acid', soon: true },
  { lv: 15, label: 'Rare skin crate (free, no odds games)', soon: true },
  { lv: 20, label: 'Title: Ape-In' },
  { lv: 25, label: 'CHROME tier · Lv 25 skin · RWA Tier-1 free tournaments · billboard discount', gate: 'rwa:1', big: true },
  { lv: 30, label: 'Hoverboard', soon: true },
  { lv: 40, label: 'Animated nameplate', soon: true },
  { lv: 50, label: 'HOLO tier · Epic skin · RWA Tier-2 tournaments · title: Diamond Paws', gate: 'rwa:2', big: true },
  { lv: 60, label: 'Trail effect: Candle Wick', soon: true },
  { lv: 75, label: 'Legendary scooter', soon: true },
  { lv: 90, label: 'HODL Heights apartment', soon: true },
  { lv: 100, label: 'APEX tier · Legendary skin · Kanto Vault Pokémon raffles · monthly featured billboard', gate: 'rwa:3', big: true },
  { lv: 125, label: 'Vehicle mods', soon: true },
  { lv: 150, label: 'PRISM tier · rooftop VIP hub · leaderboard wall', big: true, soon: true },
  { lv: 175, label: 'Mentor badge (bonus XP for helping new players)', soon: true },
  { lv: 200, label: 'ECLIPSE tier · mythic vehicle · Hall of Fame statue slot', big: true, soon: true },
  { lv: 225, label: 'First-100 one-of-a-kind cosmetics', soon: true },
  { lv: 250, label: 'GENESIS · title: Diamond Hands · monument in the Bag Square · soulbound credential', big: true, soon: true },
];
export const TITLES = { 6: 'Fresh Bag', 20: 'Ape-In', 50: 'Diamond Paws', 250: 'Diamond Hands' };

const LOGIN_XP = [25, 40, 55, 70, 90, 110, 150];
const CAPS = { billboard: 250, flashmob: 200, gm: 25, social: 200 };   // per day
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function weekKey(d = new Date()) {   // Monday-start week
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (t.getDay() + 6) % 7; t.setDate(t.getDate() - wd); return dayKey(t);
}
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

export class Progress {
  constructor() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('bagverse.skin') || 'null'); } catch (_) {}
    this.s = s || { name: 'Guest_' + Math.floor(1000 + Math.random() * 9000), level: 1, xp: 0, totalXp: 0, playMin: 0, playSec: 0, rwaWins: 0, bag: 0 };
    const S = this.s;
    if (!Array.isArray(S.vehicles)) S.vehicles = ['punk'];   // garage (punk scooter is the default while testing)
    if (S.v !== 2) {   // migrate from the old 120·L^1.55 curve: keep every XP point, re-level on the new curve
      S.v = 2; S.totalXp = S.totalXp || 0; this.relevel();
      S.stats = S.stats || {}; S.ach = S.ach || {}; S.bags = S.bags || []; S.rwa = S.rwa || {};
      S.tut = S.tut || { step: S.totalXp > 1500 ? 99 : 0, seenWelcome: S.totalXp > 1500 };
    }
    S.stats ||= {}; S.ach ||= {}; S.bags ||= []; S.rwa ||= {}; S.tut ||= { step: 0, seenWelcome: false };
    S.streak ||= { count: 0, last: null, freezes: 0 };
    S.login ||= { day: 0, last: null };
    S.rested ||= 0; S.levelAt ||= {};
    S.zonesSeen ||= [];
    this.idle = 0; this.listeners = []; this.hidden = false;
    // rested XP: 5% of a level per 8 h offline, up to 150% of a level
    if (S.lastSeen) {
      const h = (Date.now() - S.lastSeen) / 36e5, cost = xpToNext(S.level);
      if (h > 0.25) S.rested = Math.min(cost * 1.5, S.rested + cost * 0.05 * (h / 8));
    }
    this.rollDay();
    this.save();
  }

  on(fn) { this.listeners.push(fn); }
  fire(ev) { for (const f of this.listeners) f(ev); }
  save() { this.s.lastSeen = Date.now(); try { localStorage.setItem('bagverse.skin', JSON.stringify(this.s)); } catch (_) {} }

  get tier() { return HOLDER_TIERS.find(([min]) => this.s.bag >= min); }
  get visual() { return tierOf(this.s.level); }
  get visualTier() { return this.visual.label; }
  get title() { let t = ''; for (const [lv, name] of Object.entries(TITLES)) if (this.s.level >= +lv) t = name; return t; }
  get legend() { return Math.max(0, this.s.level - LEVEL_CAP); }
  get levelCost() { return xpToNext(this.s.level); }
  /** feature gates (REWARDS[].gate). `?unlockall` opens everything for testing. */
  has(gate) {
    if (Progress.unlockAll) return true;
    const r = REWARDS.find((x) => x.gate === gate);
    return !r || this.s.level >= r.lv;
  }
  gateLevel(gate) { return REWARDS.find((x) => x.gate === gate)?.lv || 1; }

  relevel() {
    const S = this.s; let L = 1, left = S.totalXp;
    while (left >= xpToNext(L)) { left -= xpToNext(L); L++; }
    S.level = L; S.xp = left;
  }

  /** new calendar day: reset day counters, advance streaks / freezes */
  rollDay() {
    const S = this.s, today = dayKey();
    if (S.day?.key === today) return false;
    const prev = S.day?.key;
    // streak: counts days with at least one daily quest done; a missed day eats a freeze or resets
    if (prev && S.streak.last) {
      const gap = daysBetween(S.streak.last, today);
      if (gap > 1) { const miss = gap - 1; if (S.streak.freezes >= miss) S.streak.freezes -= miss; else S.streak.count = 0; }
    }
    S.day = { key: today, playMin: 0, caps: {}, loginClaimed: false, missed: prev ? Math.max(0, daysBetween(prev, today) - 1) : 0 };
    S.stats.daysPlayed = (S.stats.daysPlayed || 0) + 1;
    return true;
  }

  /** XP from any source. Returns the XP actually granted (after caps and multipliers). */
  grant(n, source = 'misc') {
    const S = this.s, d = S.day;
    let amt = n;
    if (CAPS[source] !== undefined) { const used = d.caps[source] || 0; amt = Math.max(0, Math.min(amt, CAPS[source] - used)); d.caps[source] = used + amt; }
    if (source === 'daily') amt = Math.round(amt * (1 + this.streakBonus));
    if (source === 'play') {
      amt = Math.round(amt * (1 + this.tier[3]));                              // holder bonus: proof-of-play only, max +15%
      const r = Math.min(S.rested, amt); S.rested -= r; amt += r;               // rested doubles proof-of-play
    }
    if (amt <= 0) return 0;
    S.totalXp += amt; S.xp += amt;
    const before = S.level;
    while (S.xp >= xpToNext(S.level)) { S.xp -= xpToNext(S.level); S.level++; S.levelAt[S.level] = Date.now(); }
    this.save();
    this.fire({ type: 'xp', amount: amt, source });
    for (let L = before + 1; L <= S.level; L++) this.fire({ type: 'level', level: L, rewards: REWARDS.filter((r) => r.lv === L) });
    return amt;
  }
  addXp(n) { const L = this.s.level; this.grant(n, 'misc'); return this.s.level > L; }   // legacy callers

  get streakBonus() { const c = this.s.streak.count; return c >= 30 ? 0.3 : c >= 14 ? 0.2 : c >= 7 ? 0.1 : 0; }
  /** call when the first daily quest of the day completes */
  markStreak() {
    const S = this.s, today = dayKey();
    if (S.streak.last === today) return;
    S.streak.count += 1; S.streak.last = today;
    if (S.streak.count % 7 === 0 && S.streak.freezes < 2) { S.streak.freezes += 1; this.fire({ type: 'freeze' }); }
    S.stats.bestStreak = Math.max(S.stats.bestStreak || 0, S.streak.count);
    this.save();
  }

  /** 7-day login calendar: the cycle pauses on a missed day instead of resetting */
  get loginPending() { return !this.s.day.loginClaimed && this.s.login.last !== this.s.day.key; }
  claimLogin() {
    const S = this.s; if (!this.loginPending) return 0;
    const idx = S.login.day % 7; S.login.day += 1; S.login.last = S.day.key; S.day.loginClaimed = true;
    S.stats.loginDays = (S.stats.loginDays || 0) + 1;
    const xp = this.grant(LOGIN_XP[idx], 'login');
    if (idx === 6) S.stats.weeklyChests = (S.stats.weeklyChests || 0) + 1;
    this.save();
    return xp;
  }
  get loginTrack() { return LOGIN_XP.map((xp, i) => ({ xp, day: i + 1, done: i < this.s.login.day % 7 || (this.s.login.day % 7 === 0 && this.s.login.day > 0 && this.s.login.last === this.s.day.key) })); }

  /** proof-of-play: input pauses the clock after 90 s idle or with the tab hidden; XP/min falls with time played today */
  tick(dt, active) {
    this.rollDay() && this.fire({ type: 'newday' });
    this.idle = active ? 0 : this.idle + dt;
    const playing = this.idle < 90 && !this.hidden;
    if (playing) {
      this.s.playSec += dt;
      if (this.s.playSec >= 60) {
        this.s.playSec -= 60; this.s.playMin += 1;
        const m = this.s.day.playMin++;
        this.grant(m < 60 ? 10 : m < 180 ? 5 : 0, 'play');
        this.fire({ type: 'stat', key: 'playMin', n: 1 });
        this.save();
      }
    }
    return playing;
  }

  count(key, n = 1) { this.s.stats[key] = (this.s.stats[key] || 0) + n; return this.s.stats[key]; }
}
