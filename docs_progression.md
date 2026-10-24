# BagVerse progression: Level 1 → 250 (as built, Oct 22)

Implements the "long grind" blueprint (research report, Oct 22), plus the onboarding tutorial, missions and RWA prize entry kiosks.

## Curve
- **Formula:** `xpToNext(L) = 50 + 4000·L²/(L²+45²) + 12·max(0, L−100)`. Total XP to Lv 250 is about 894K. After that come **Legend levels** at a flat 6,000 XP each.
- **Milestones (cumulative XP):** Lv 10 ≈ 1.0K · 25 ≈ 9.5K · 50 ≈ 50K · 100 ≈ 197K · 150 ≈ 390K · 200 ≈ 625K · 250 ≈ 894K.
- **Modelled pace:** engaged players reach Lv 250 in about 16 months, hardcore in about 8.5 months; casual players reach Lv 100 in about 8 months. These are model estimates; re-baseline after 4–6 weeks of telemetry.
- **Tiers:** BASE 1 · CHROME 25 · HOLO 50 · APEX 100 · PRISM 150 · ECLIPSE 200 · GENESIS 250. Each band shows I/II/III sub-steps.
- **Migration:** old saves keep every XP point and are re-levelled on the new curve. XP no longer mints $BAG, and the old 3× multiplier is gone.

## XP sources (caps per day)
| Source | XP | Guard |
|---|---|---|
| Proof-of-play | 10/min for the first 60 min, 5/min up to 180, then 0 | Idle 90 s or a hidden tab pauses the clock |
| Rested XP | Doubles play XP | Builds 5% of a level per 8 h offline, max 150% of a level |
| Login calendar | 25 → 150 over 7 days | A missed day pauses the calendar, never resets it |
| Dailies (3) | 150 each + 150 for all three | 1 reroll a day. Missed days bank up to 3 catch-up payouts. Streak bonus +10/20/30% at 7/14/30 days; a freeze every 7 days (hold up to 2) |
| Weeklies (7) | 300 each + 1,000 at 5 done | Reset Monday |
| Tutorial (12 steps) | about 1,400 incl. 300 completion bonus | Once |
| Hidden Bags | 100 each, +1,000 per district | 220 total (20 × 11 districts), at least 6 m apart, open sky |
| Billboards | 50 per new screen | 250/day |
| Flashmob host | 50 | 200/day |
| GM | 25 | Once a day |
| Achievements | 100–5,000 | 37 awards, once each |
| $BAG holders | APE +5% · DEGEN +10% · WHALE +15% | Play XP only |

## Onboarding flow (session 1 → about Lv 10–13)
1. **Welcome card:** what levelling, missions, RWA prizes and unlocks are, then Start the guide or Skip.
2. **Guide:** walk → look → jump → say GM → Dance (unlocks at Lv 2) → ride the scooter (Lv 5) → visit the RWA Vault (gold beacon) → view prizes → find a hidden Bag (beacon on the nearest) → watch a billboard → equip a skin → start a flashmob (Thriller + F, Lv 10).
3. **The tracker** on the HUD shows the current step, its hint and progress. Tap it, or press J, to open Missions.
4. **After the guide:** dailies, weeklies, streaks and the login calendar open. From the next day, the login reward pops up when the game opens.

## Gates
Dance Lv 2 · portals Lv 3 · Punk Scooter Lv 5 · Thriller and flashmobs Lv 10 · RWA Tier-1 Lv 25 · Tier-2 Lv 50 · APEX Arena Lv 100. Locked actions show a toast saying the level they unlock at. `?unlockall` opens everything for testing.

## RWA prize entry kiosks (free, skill-based, one entry per week)
| Kiosk | District | Tier | Event | Prize |
|---|---|---|---|---|
| Chad's Bull Run | bull_run | 1 · Lv 25 | Bull Run Sprint Cup | 1 g tokenized gold |
| Doge Park | doge_park | 1 · Lv 25 | Doge Park Dash | Graded card (PSA 9) |
| Pepe's Swamp | swamp | 1 · Lv 25 | Swamp Stomp Showdown | Tokenized silver coin |
| GM Gate | gm_gate | 1 · Lv 25 | GM Gate Gauntlet | Vaulted sneaker grail |
| HODL Heights | hodl_heights | 2 · Lv 50 | Heights High Score | Tokenized gold watch |
| Copium Refinery | copium | 2 · Lv 50 | Refinery Rush | 10 g tokenized gold |
| Arcade | arcade | 2 · Lv 50 | Arcade Masters | Graded grail (PSA 10) |
| APEX RWA Arena | apex_arena | 3 · Lv 100 | APEX Grand Final | 1 kg tokenized gold |

The prize names are placeholders until real vault inventory is assigned. The RWA Vault keeps its featured-asset showroom. Kiosks are gold diamonds on the minimap. Entries are stored locally for now. Before real prizes run, get legal review covering free entry, KYC, region rules and 1099s at $2,000+.

## Code
- `src/progression.js`: curve, tiers, `REWARDS` / gates, capped `grant()`, rested XP, streaks, login.
- `src/quests.js`: tutorial, daily/weekly pools (seeded per day/week), achievements, and the `emit()` event stream.
- `src/collectibles.js`: Bags, kiosks, beacon.
- `src/missions_ui.js`: panel, tracker, welcome, login, XP feed.
- Events emitted from `main.js`: walk/ride metres, jump, look, chat, gm, emote, zone, bag, billboard, flashmob, rwa_view, rwa_enter, skin, portal, playMin.

## Not built yet (marked SOON on the reward road)
Hoverboard, Legendary scooter, apartment, trails, auras, PRISM-and-up hubs and statues, mini-games (Bag Run etc., so tournaments have scores to rank), server-authoritative XP, anti-bot reputation score, soulbound Passport, telemetry dashboards.
