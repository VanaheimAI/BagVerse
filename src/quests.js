// Missions: the onboarding tutorial, daily + weekly quests, achievements. Everything listens to one event stream:
//   quests.emit(type, n = 1, data)   e.g. emit('walk', 3.2), emit('zone', 1, { id: 'swamp' }), emit('emote', 1, { name })
// Tutorial steps advance in order; dailies / weeklies are picked from pools with a seeded shuffle (same for every
// player on the same day / week); achievements are lifetime counters.
import { dayKey, weekKey } from './progression.js';

// ---------------------------------------------------------------- onboarding tutorial (Lv 1 -> ~10 in session 1)
// target: world point for the guide beacon ('vault' / 'bag' / 'kiosk' resolved by the game)
export const TUTORIAL = [
  { id: 'move', title: 'Take a walk', hint: { key: 'Move with W A S D', touch: 'Drag the left stick to walk' }, ev: 'walk', need: 15, xp: 60, unit: 'm' },
  { id: 'look', title: 'Look around', hint: { key: 'Drag the mouse (or click to lock) to turn the camera', touch: 'Drag the right side of the screen' }, ev: 'look', need: 1, xp: 40 },
  { id: 'jump', title: 'Jump', hint: { key: 'Press Space', touch: 'Tap JUMP' }, ev: 'jump', need: 1, xp: 40 },
  { id: 'gm', title: 'Say GM', hint: { key: 'Press Enter, type gm, press Enter', touch: 'Tap 💬, type gm and send' }, ev: 'chat', need: 1, xp: 70 },
  { id: 'dance', title: 'Bust a move', hint: { key: 'Press 2 to Dance (unlocked at Lv 2)', touch: 'Tap 💃, then Dance' }, ev: 'emote', need: 1, xp: 90 },
  { id: 'ride', title: 'Ride your scooter', hint: { key: 'Press R to summon the Punk Scooter, then W to ride 50 m', touch: 'Tap 🛴 and push the stick forward for 50 m' }, ev: 'ride', need: 50, xp: 150, unit: 'm' },
  { id: 'vault', title: 'Visit the Wano Vault', hint: { key: 'Follow the gold beacon to the Wano Vault (One Piece card raffles)', touch: 'Follow the gold beacon to the Wano Vault' }, ev: 'zone', match: 'rwa_vault', need: 1, xp: 120, target: 'vault' },
  { id: 'prizes', title: "Check this week's prizes", hint: { key: 'Walk up to the Vault doors and press E', touch: 'Stand at the Vault doors and tap E' }, ev: 'rwa_view', need: 1, xp: 100, target: 'vault' },
  { id: 'bag', title: 'Find a hidden Bag', hint: { key: '220 green money Bags are hidden across the districts; the beacon marks the nearest', touch: 'Follow the beacon to the nearest green Bag' }, ev: 'bag', need: 1, xp: 150, target: 'bag' },
  { id: 'ad', title: 'Watch a billboard', hint: { key: 'Look at an ad screen for 10 seconds', touch: 'Point the camera at an ad screen for 10 s' }, ev: 'billboard', need: 1, xp: 90 },
  { id: 'skin', title: 'Try a new look', hint: { key: 'Press K and equip a skin', touch: 'Tap 👕 and equip a skin' }, ev: 'skin', need: 1, xp: 110 },
  { id: 'flashmob', title: 'Start a flashmob', hint: { key: 'At Lv 10: press 1 (Thriller), then F', touch: 'At Lv 10: 💃 Thriller, then tap FLASHMOB' }, ev: 'flashmob', need: 1, xp: 200 },
];

// ---------------------------------------------------------------- daily / weekly pools
const D = (id, title, ev, need, extra = {}) => ({ id, title, ev, need, ...extra });
export const DAILY_POOL = [
  D('d_walk', 'Walk 300 m', 'walk', 300, { unit: 'm' }),
  D('d_ride', 'Ride your scooter 600 m', 'ride', 600, { unit: 'm', gate: 'scooter' }),
  D('d_emote', 'Do 3 emotes', 'emote', 3),
  D('d_mob', 'Host a flashmob', 'flashmob', 1, { gate: 'emote:Thriller' }),
  D('d_zones', 'Visit 3 different districts', 'zone_new_today', 3),
  D('d_ads', 'Watch 2 billboards', 'billboard', 2),
  D('d_bags', 'Find 2 hidden Bags', 'bag', 2),
  D('d_gm', 'Say GM in chat', 'gm', 1),
  D('d_chat', 'Send 3 chat messages', 'chat', 3),
  D('d_play', 'Play 15 active minutes', 'playMin', 15, { unit: 'min' }),
  D('d_kiosk', 'Visit an RWA prize kiosk', 'rwa_view', 1),
  D('d_jump', 'Jump 25 times', 'jump', 25),
  D('d_skin', 'Change your skin', 'skin', 1),
  D('d_bagrun', 'Play 2 Bag Runs', 'bagrun', 2, { gate: 'portals' }),
  D('d_bagrun300', 'Score 800+ in a Bag Run', 'bagrun_300', 1, { gate: 'portals' }),
];
export const WEEKLY_POOL = [
  D('w_play', 'Play 120 active minutes', 'playMin', 120, { unit: 'min' }),
  D('w_bags', 'Find 15 hidden Bags', 'bag', 15),
  D('w_mob', 'Host 5 flashmobs', 'flashmob', 5, { gate: 'emote:Thriller' }),
  D('w_zones', 'Visit all 11 districts', 'zone_new_week', 11),
  D('w_ride', 'Ride 5 km on your scooter', 'ride', 5000, { unit: 'm', gate: 'scooter' }),
  D('w_dailies', 'Complete 10 daily quests', 'daily_done', 10),
  D('w_ads', 'Watch 10 billboards', 'billboard', 10),
  D('w_login', 'Play on 5 different days', 'login_day', 5),
  D('w_emote', 'Do 40 emotes', 'emote', 40),
  D('w_chat', 'Send 25 chat messages', 'chat', 25),
  D('w_kiosk', 'Visit 4 different RWA kiosks', 'kiosk_new_week', 4),
  D('w_walk', 'Walk 3 km', 'walk', 3000, { unit: 'm' }),
  D('w_bagrun', 'Play 10 Bag Runs', 'bagrun', 10, { gate: 'portals' }),
  D('w_bagrun600', 'Score 2,000+ in a Bag Run', 'bagrun_600', 1, { gate: 'portals' }),
];
export const DAILY_XP = 150, DAILY_BONUS = 150, WEEKLY_XP = 300, WEEKLY_BONUS = 1000, WEEKLY_BONUS_AT = 5;

// ---------------------------------------------------------------- achievements (lifetime)
const A = (id, title, stat, need, xp) => ({ id, title, stat, need, xp });
export const ACHIEVEMENTS = [
  A('a_lv10', 'Reach Level 10', 'level', 10, 300), A('a_lv25', 'Reach CHROME (Lv 25)', 'level', 25, 800), A('a_lv50', 'Reach HOLO (Lv 50)', 'level', 50, 2000),
  A('a_lv100', 'Reach APEX (Lv 100)', 'level', 100, 4000), A('a_lv150', 'Reach PRISM (Lv 150)', 'level', 150, 5000), A('a_lv200', 'Reach ECLIPSE (Lv 200)', 'level', 200, 5000), A('a_lv250', 'Reach GENESIS (Lv 250)', 'level', 250, 5000),
  A('a_bag1', 'First Bag', 'bags', 1, 100), A('a_bag25', 'Bag Collector', 'bags', 25, 600), A('a_bag100', 'Bag Hoarder', 'bags', 100, 2000), A('a_bag220', 'Every Last Bag', 'bags', 220, 5000),
  A('a_dist1', 'Clear a district (all 20 Bags)', 'districtsDone', 1, 500), A('a_dist5', 'Clear 5 districts', 'districtsDone', 5, 1500), A('a_dist11', 'Clear the whole city', 'districtsDone', 11, 4000),
  A('a_mob1', 'Flash Mobber', 'flashmob', 1, 150), A('a_mob10', 'Crowd Starter', 'flashmob', 10, 600), A('a_mob50', 'Mob Boss', 'flashmob', 50, 2500),
  A('a_ride1k', 'Kick It (1 km ridden)', 'ride', 1000, 200), A('a_ride10k', 'Road Warrior (10 km)', 'ride', 10000, 1000), A('a_ride100k', 'Scooter Saint (100 km)', 'ride', 100000, 4000),
  A('a_walk5k', 'Street Walker (5 km)', 'walk', 5000, 400), A('a_walk50k', 'Marathon Ape (50 km)', 'walk', 50000, 3000),
  A('a_play60', 'One Hour In', 'playMin', 60, 300), A('a_play600', 'Ten Hours In', 'playMin', 600, 1500), A('a_play6000', 'Resident (100 h)', 'playMin', 6000, 5000),
  A('a_streak7', '7-day streak', 'bestStreak', 7, 500), A('a_streak30', '30-day streak', 'bestStreak', 30, 2500), A('a_streak100', '100-day streak', 'bestStreak', 100, 5000),
  A('a_ads10', 'Ad Enjoyer (10 billboards)', 'billboard', 10, 300), A('a_ads50', 'Billboard Critic (50)', 'billboard', 50, 1200),
  A('a_zones', 'Tourist (visit every district)', 'zonesSeen', 11, 800),
  A('a_skins5', 'Wardrobe (try 5 skins)', 'skinsTried', 5, 500), A('a_chat100', 'Chatterbox (100 messages)', 'chat', 100, 600),
  A('a_rwa1', 'In the Running (enter an RWA tournament)', 'rwaEntries', 1, 500), A('a_rwa10', 'Tournament Regular (10 entries)', 'rwaEntries', 10, 2000),
  A('a_daily30', 'Daily Grinder (30 dailies)', 'daily_done', 30, 1000),
  A('a_run1', 'Off the Blocks (first Bag Run)', 'bagrun', 1, 150), A('a_run25', 'Regular Runner (25 Bag Runs)', 'bagrun', 25, 1000),
  A('a_run500', 'Speed Bagger (1,500+ in a run)', 'bagrunBest', 1500, 500), A('a_run1000', 'Bag Run Legend (3,000+ in a run)', 'bagrunBest', 3000, 1500), A('a_weekly10', 'Weekly Warrior (10 weekly bonuses)', 'weekly_bonus', 10, 3000),
];

// mulberry32 seeded shuffle
function seeded(str) { let h = 1779033703; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 3432918353), h = (h << 13) | (h >>> 19); return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }
function pick(pool, n, seed, ok) { const r = seeded(seed), a = pool.filter(ok).slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n).map((q) => q.id); }

export class Quests {
  constructor(progress, { onToast, touch } = {}) {
    this.p = progress; this.toast = onToast || (() => {}); this.touch = touch;
    const S = progress.s;
    S.q ||= {};
    this.refresh();
    progress.on((ev) => { if (ev.type === 'level') this.checkAchievements(); if (ev.type === 'newday') this.refresh(); if (ev.type === 'stat') this.emit(ev.key, ev.n); });
  }
  get S() { return this.p.s; }

  /** (re)roll today's dailies and this week's weeklies when the day / week changes */
  refresh() {
    const S = this.S, q = S.q, d = dayKey(), w = weekKey();
    const ok = (x) => !x.gate || this.p.has(x.gate);
    if (q.dayKey !== d) {
      const missed = Math.min(3, S.day?.missed || 0);
      q.dayKey = d; q.daily = pick(DAILY_POOL, 3, 'd' + d, ok); q.dprog = {}; q.ddone = {}; q.dbonus = false; q.reroll = 1; q.zonesToday = [];
      q.bank = missed;   // catch-up: each missed day (max 3) banks one extra daily payout, paid on your next daily
      if (q.weekKey === w) this.emit('login_day', 1);
    }
    if (q.weekKey !== w) {
      q.weekKey = w; q.weekly = pick(WEEKLY_POOL, 7, 'w' + w, ok); q.wprog = {}; q.wdone = {}; q.wbonus = false; q.zonesWeek = []; q.kiosksWeek = [];
      this.emit('login_day', 1);
    }
    this.p.save();
  }

  rerollDaily(id) {
    const q = this.S.q; if (!q.reroll || q.ddone[id]) return false;
    const ok = (x) => (!x.gate || this.p.has(x.gate)) && !q.daily.includes(x.id);
    const alt = pick(DAILY_POOL, 1, 'r' + q.dayKey + id, ok)[0]; if (!alt) return false;
    q.daily = q.daily.map((x) => (x === id ? alt : x)); q.reroll -= 1; this.p.save(); return true;
  }

  get step() { return this.S.tut.step; }
  get tutorialDone() { return this.S.tut.step >= TUTORIAL.length; }
  get current() { return TUTORIAL[this.S.tut.step] || null; }
  skipTutorial() { this.S.tut.step = TUTORIAL.length; this.p.save(); }

  /** game event: walk / ride metres, jump, chat, emote, zone, bag, billboard, rwa_view, rwa_enter, skin, flashmob ... */
  emit(type, n = 1, data = {}) {
    const S = this.S, q = S.q, st = S.stats;
    // derived events
    if (type === 'zone' && data.id && DISTRICTS.includes(data.id)) {   // only the 11 real districts count
      if (!q.zonesToday.includes(data.id)) { q.zonesToday.push(data.id); this.emit('zone_new_today', 1); }
      if (!q.zonesWeek.includes(data.id)) { q.zonesWeek.push(data.id); this.emit('zone_new_week', 1); }
      if (!S.zonesSeen.includes(data.id)) { S.zonesSeen.push(data.id); st.zonesSeen = S.zonesSeen.length; }
    }
    if (type === 'rwa_view' && data.id && !q.kiosksWeek.includes(data.id)) { q.kiosksWeek.push(data.id); this.emit('kiosk_new_week', 1); }
    if (type === 'chat' && /\bgm\b/i.test(data.text || '')) this.emit('gm', 1);
    if (type === 'skin' && data.id) { S.skinsTried = [...new Set([...(S.skinsTried || []), data.id])]; st.skinsTried = S.skinsTried.length; }
    if (!['zone', 'zone_new_today', 'zone_new_week', 'kiosk_new_week', 'playMin'].includes(type)) st[type] = (st[type] || 0) + n;
    if (type === 'playMin') st.playMin = S.playMin;

    // tutorial: only the current step counts
    const t = this.current;
    if (t && t.ev === type && (!t.match || t.match === data.id)) {
      S.tut.prog = (S.tut.prog || 0) + n;
      if (S.tut.prog >= t.need) this.finishStep();
    }
    // dailies + weeklies open once the tutorial is done (achievements always count)
    if (!this.tutorialDone) { this.checkAchievements(); this.dirty = true; return; }
    for (const id of q.daily || []) {
      const d = DAILY_POOL.find((x) => x.id === id); if (!d || q.ddone[id] || d.ev !== type) continue;
      q.dprog[id] = (q.dprog[id] || 0) + n;
      if (q.dprog[id] >= d.need) this.finishDaily(d);
    }
    for (const id of q.weekly || []) {
      const w = WEEKLY_POOL.find((x) => x.id === id); if (!w || q.wdone[id] || w.ev !== type) continue;
      q.wprog[id] = (q.wprog[id] || 0) + n;
      if (q.wprog[id] >= w.need) this.finishWeekly(w);
    }
    this.checkAchievements();
    this.dirty = true;
  }

  finishStep() {
    const S = this.S, t = this.current; if (!t) return;
    S.tut.step += 1; S.tut.prog = 0; this.p.save();
    const xp = this.p.grant(t.xp, 'tutorial');
    this.toast(`GUIDE · ${t.title.toUpperCase()} · +${xp} XP`, 'quest');
    if (this.tutorialDone) { const b = this.p.grant(300, 'tutorial'); this.toast(`TUTORIAL COMPLETE · +${b} XP · DAILIES UNLOCKED`, 'big'); }
    this.onStep?.(this.current);
  }
  finishDaily(d) {
    const q = this.S.q; q.ddone[d.id] = true;
    let xp = this.p.grant(DAILY_XP, 'daily');
    if (q.bank > 0) { q.bank -= 1; xp += this.p.grant(DAILY_XP, 'daily'); }
    this.p.markStreak(); this.emit('daily_done', 1);
    this.toast(`DAILY · ${d.title.toUpperCase()} · +${xp} XP`, 'quest');
    if (!q.dbonus && q.daily.every((id) => q.ddone[id])) { q.dbonus = true; const b = this.p.grant(DAILY_BONUS, 'daily'); this.toast(`ALL DAILIES DONE · +${b} XP`, 'big'); }
    this.p.save();
  }
  finishWeekly(w) {
    const q = this.S.q; q.wdone[w.id] = true;
    const xp = this.p.grant(WEEKLY_XP, 'weekly'); this.toast(`WEEKLY · ${w.title.toUpperCase()} · +${xp} XP`, 'quest');
    const n = Object.keys(q.wdone).length;
    if (!q.wbonus && n >= WEEKLY_BONUS_AT) { q.wbonus = true; const b = this.p.grant(WEEKLY_BONUS, 'weekly'); this.emit('weekly_bonus', 1); this.toast(`WEEKLY BONUS · ${WEEKLY_BONUS_AT} DONE · +${b} XP`, 'big'); }
    this.p.save();
  }
  checkAchievements() {
    const S = this.S, st = S.stats;
    st.level = S.level; st.bags = S.bags.length;
    for (const a of ACHIEVEMENTS) {
      if (S.ach[a.id] || (st[a.stat] || 0) < a.need) continue;
      S.ach[a.id] = Date.now();
      const xp = this.p.grant(a.xp, 'achievement');
      this.toast(`ACHIEVEMENT · ${a.title.toUpperCase()} · +${xp} XP`, 'big');
    }
  }
  progressOf(list, prog, done, pool) { return list.map((id) => { const d = pool.find((x) => x.id === id); return d && { ...d, prog: Math.min(d.need, prog[id] || 0), done: !!done[id] }; }).filter(Boolean); }
  get dailies() { const q = this.S.q; return this.progressOf(q.daily || [], q.dprog, q.ddone, DAILY_POOL); }
  get weeklies() { const q = this.S.q; return this.progressOf(q.weekly || [], q.wprog, q.wdone, WEEKLY_POOL); }
}

// the 11 districts with hidden Bags (20 each) and the "visit every district" goals
export const DISTRICTS = ['bag_square', 'ad_canyon', 'arcade', 'gm_gate', 'copium', 'hodl_heights', 'rekt', 'bull_run', 'doge_park', 'swamp', 'apex_arena'];
