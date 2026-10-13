# Phase 5: Gamification (replaces §13 of SPEC.md)

This document is the complete design for Phase 5. It **replaces §13 of SPEC.md entirely**, including every earlier gamification rule (points per 7-day streak, freeze for 5 points, and so on).

**Process:** merge this into SPEC.md as the new §13 and commit. Then list your questions and ambiguities, give me a plan, and wait for my approval before building. Don't change any number in this document on your own: all numbers live in one config file (13.2) and I tune them. If a test or simulation shows a number doesn't work, tell me and propose a change.

All other SPEC rules still apply, including the design rules in §14, except for the animation exceptions in 13.11. Tasks, the calendar and All tasks are not affected by gamification, except for the new weight field on weekly tasks.

---

## 13.1 Overview

- Habits and weekly tasks earn **coins** and **XP**. Normal (one-off) tasks earn nothing.
- Income is **normalized**: a perfect week always earns the same budget, however many habits and weekly tasks I have. Each item gets a share by its **weight**.
- XP gives **levels**. Each level-up gives a mystery box.
- Coins are spent in the **Shop**: mystery boxes, streak freezes, vacation days, cosmetics, and real-life rewards I define in the app.
- **Mystery boxes** mostly contain pieces of a seasonal **art collection** of public-domain artworks. Duplicates become **shards**, which buy specific missing pieces.
- Everything bought or won goes to the **Inventory**, where it's used or opened.
- **No penalties.** A missed habit only breaks its streak (unless a freeze or vacation day covers it). Coins and XP are never taken away.

---

## 13.2 Config

All numbers in this document live in `src/shared/economy.ts`, with comments. Logic reads only from there. Key values:

```
WEEKLY_BUDGET            = 10000   // coins for a perfect week (base, before streak bonus)
EXPECTED_RATE            = 0.70    // realistic share of a perfect week; prices are based on it
TYPICAL_WEEK             = WEEKLY_BUDGET * EXPECTED_RATE   // = 7000
PRICE_ROUNDING           = 50      // shop prices rounded to nearest 50
COIN_ROUNDING            = 10      // earned coins rounded to nearest 10
XP_PER_COIN              = 0.1
GAMIFICATION_START       = '2026-10-19'   // Monday; first week snapshot and Season 1 start
```

**Start date (Monday 19 Oct 2026)**
- Nothing earns rewards before `GAMIFICATION_START`. The first week snapshot is for the week of 19 Oct.
- Habit history from before the start still counts for **streak lengths** (and so for the streak multiplier) and for **completion counts**. But milestones whose threshold was crossed before the start are **not** awarded retroactively; only thresholds crossed on or after the start pay.
- If Phase 5 is deployed **after** the start date, run a one-time catch-up on deployment. It creates the snapshots and pays all ticks, weekly tasks, milestones and level-ups from the start date up to deployment, exactly as if the system had been live (the yesterday-only back-fill limit doesn't apply to this catch-up). It's idempotent through the ledger.
- If Phase 5 is deployed **before** the start date, the Habits header shows "Rewards start Mon 19 Oct", and the Shop and Inventory are visible but empty.

`WEEKLY_BUDGET` and `EXPECTED_RATE` are also editable in Settings → Gamification. All prices update from them.

---

## 13.3 Weights and weekly values

**Weights**
- Every habit and every weekly-task template gets a **weight from 1 to 10** (default 5), set in its create/edit form.
- The form shows a live hint: "≈ 330 coins per tick from Monday". Normal tasks have no weight.

**Weekly values (locked each Monday)**
- Every Monday at 00:00 (Europe/Prague), or lazily on the first request of the week, the app creates a **week snapshot**. It records, for every active habit and weekly-task template, its weight and its **value per completion** for that week. The snapshot is computed in 3 steps:

```
share(item)              = WEEKLY_BUDGET × weight(item) / sum of weights of all active items
completionsPerWeek(item) = daily: 7
                           weekdays: number of selected weekdays
                           per_week: target
                           per_month: target × 12 / 52
                           weekly task (fixed or flexible): 1
valuePerCompletion(item) = round(share / completionsPerWeek, COIN_ROUNDING)
```

- Edits to weights, new items, archived items and paused templates take effect at the **next** snapshot. Ticks always use the snapshot of the week they belong to.
- A habit or weekly task **created mid-week earns nothing until next Monday**. Its card shows "Earns from Mon".
- Archived habits and paused or deleted templates are excluded from the next snapshot.

---

## 13.4 Earning

**Habit tick**
- `coins = valuePerCompletion × streakMultiplier`, rounded to COIN_ROUNDING.
- `streakMultiplier = 1 + min(0.50, 0.10 × fullPeriods)`, where fullPeriods is the number of full streak periods **before** this tick:
  - daily: floor(streak in days / 7)
  - weekdays: floor(streak in scheduled days / number of selected weekdays), i.e. full weeks
  - per_week: number of full weeks in the streak
  - per_month: number of full months in the streak
- The multiplier is a bonus on top of the budget, so a perfect week with max streaks earns up to 15,000.
- **Over target:** for per_week and per_month habits, ticks beyond the period's target earn nothing (they're still recorded).

**Weekly task completion**
- `coins = valuePerCompletion` of the instance's week. No streak multiplier.
- Completing late (after the deadline) still earns **full value**.
- Each instance is paid once.

**XP**
- Every coin earned from ticks and weekly tasks also gives XP: `XP = coins × XP_PER_COIN`. That includes the streak bonus, but excludes coin pouches and anything else from boxes.

**Back-filling and unticking**
- Ticking a habit for **today or yesterday** earns rewards. Ticking older dates counts for streaks and milestones, but earns no tick coins.
- Unticking keeps the reward already paid. Re-ticking the same habit and date pays nothing.

**Rewards ledger**
- Every payout is recorded in a ledger under a unique key, and the same key is never paid twice. Keys:
  - `tick:{habitId}:{date}`
  - `weekly:{taskId}`
  - `streak:{habitId}:{streakStartDate}:{milestone}`
  - `count:{itemId}:{n}`
  - `level:{n}`
- All rewards are computed on the server. The client never sends amounts.

---

## 13.5 Milestones and levels

All milestone and level rewards are **mystery boxes** (current season), added to the Inventory.

**Streak milestones.** Awarded once per streak run; a broken and rebuilt streak can earn them again.

| daily / weekdays (scheduled days) | per_week | per_month | Boxes |
|---|---|---|---|
| 7 | 4 weeks | 3 months | 1 |
| 30 | 12 weeks | 6 months | 3 |
| 100 | 26 weeks | 12 months | 8 |
| 365 | 52 weeks | 24 months | 20 |

**Count milestones.** Awarded once ever, per habit and per weekly-task template, counting total completions. Back-filled ticks count.

| Completions | 10 | 25 | 50 | 100 | 250 | 500 | 1000 |
|---|---|---|---|---|---|---|---|
| Boxes | 1 | 1 | 2 | 3 | 5 | 8 | 12 |

**Levels**
- XP needed to go from level L to L+1: `600 + 100 × (L − 1)`. That's about 9,000 XP to reach level 10, roughly 2–3 months in a typical week.
- Each level-up gives **1 mystery box**. No titles, no shop unlocks.

Milestones and level-ups appear in the History (13.10), e.g. "Čtení: 50× done · 2 boxes".

---

## 13.6 Shop

Prices are derived from `TYPICAL_WEEK` (7,000) and rounded to PRICE_ROUNDING:

| Item | Formula | Price at defaults |
|---|---|---|
| Mystery box | TYPICAL_WEEK × 0.35 / 4 | 600 |
| Streak freeze | = box | 600 |
| Vacation day | = box × 0.5 | 300 |
| Cosmetic (each) | = box × 3 | 1,800 |
| Real-life reward | set by me | — |

Lucky charms and coin pouches can't be bought; they only come from boxes.

**Buying**
- Buying takes the coins and puts the item in the Inventory.
- An undo toast is shown for 5 seconds; undo refunds the item if it hasn't been used or opened.
- Buttons are disabled when I can't afford an item.

**Real-life rewards** are created in the app, no code needed. A "Manage rewards" view in the Shop lets me add, edit, reorder and archive them:
- **Name**, required.
- **Price** in coins. While typing, a hint shows: "≈ 3 days of a typical week", where `days = price / (TYPICAL_WEEK / 7)`, rounded to 0.5.
- **Icon** from a curated picker of about 40 Lucide icons suited to rewards (coffee, cake, ice cream, utensils, pizza, film, tv, gamepad, music, book, shopping bag, bed, plane, gift, and so on).

No limits or cooldowns. Placeholder examples are shown in the empty state (e.g. "Sweet treat", "Coffee out", "Eat out", "Skip a lecture"), but nothing is seeded.

---

## 13.7 Mystery boxes

**Opening**
- Boxes go to the Inventory; I open them there, one at a time.
- The result is decided **on the server** using a cryptographically secure random generator, stored, and only then animated. Reloading or double-tapping can never re-roll or open twice.

**Contents** (exactly one result per box):

| Result | Chance |
|---|---|
| Art piece (current season) | 70% |
| Coin pouch | 7% |
| Lucky charm | 6% |
| Streak freeze | 5% |
| Vacation day | 5% |
| Real-life reward | 5% |
| Cosmetic | 2% |

**Art piece**
1. Roll the tier: **common 70% · rare 25% · legendary 5%**.
2. Pick one piece of that tier from the current season, uniformly at random (owned or not).
3. If I already own it, it's a duplicate and becomes **shards**: common 10, rare 20, legendary 50.

There's no pity rule.

**Coin pouch**
- `coins = box price × (0.1 + 4.9 × u^2.5)`, with `u` uniform in [0, 1), rounded to COIN_ROUNDING.
- That gives a range of 0.1–5× the box price, skewed toward small amounts, with an average of 1.5× and a median of about 1×.

**Real-life reward**
- One of my active rewards, picked with probability proportional to `1 / price`, so cheaper ones come up more often.
- If I have no active rewards, the result becomes a coin pouch.

**Cosmetic**
- A random cosmetic I **don't own yet**.
- If I own them all, the result becomes a coin pouch.

**Lucky charm** (used from the Inventory)
- It applies to the next box opened. That box is **forced to an art piece I don't own yet** from the current season.
- The tier is rolled with the normal odds, restricted to tiers that still have unowned pieces (renormalized).
- The charm can't be used if I already own every piece of the current season.

---

## 13.8 Shards

- A separate balance, shown next to coins.
- Shards buy a **specific missing piece** in the Gallery:

| | Common | Rare | Legendary |
|---|---|---|---|
| Current season | 40 | 60 | 80 |
| Past seasons (1.5×) | 60 | 90 | 120 |

---

## 13.9 Freezes and vacation days

**Streak freeze**
- Using a freeze from the Inventory **arms** it on a habit I choose. There's no limit per habit.
- When that habit misses a period (a scheduled day, a week below target, or a month below target), one armed freeze is consumed **automatically** after the period ends, and the streak continues.
- A frozen period shows an ice icon in the heatmap. It doesn't add to the streak length and earns nothing.
- An unused armed freeze can be un-armed back to the Inventory.

**Vacation day** (1 item = 1 day)
- Using one asks for a date: today or any future date.
- On that day **all habits are paused**: nothing is due, nothing breaks a streak or uses a freeze, and the day doesn't add to streak length. It shows a vacation marker in the heatmaps.
- **Weekly tasks are not paused.**
- For per_week and per_month habits, the period's target is reduced proportionally to the vacation days in that period (rounded down). Value per completion stays as in the snapshot.
- Several vacation days can be used for consecutive dates.
- A future vacation day can be cancelled, which returns it to the Inventory.

All streak logic must account for freezes and vacation days, stay in pure functions, and be unit tested.

---

## 13.10 Screens

The Habits tab gets a segmented control: **Habits · Shop · Inventory · Gallery**. No new bottom tabs.

**Header**, on all four Habits sub-screens:
- Level, plus an XP bar to the next level
- Coins and shards
- "This week: 7,840 / 10,000": coins earned this week from ticks and weekly tasks, against WEEKLY_BUDGET. It can exceed 100% thanks to streak bonuses.

**Habits**
- As today, plus each habit's coin value per tick and its streak multiplier ("×1.3").
- Habit and weekly-task forms get the weight field (13.3).

**Shop:** built-in items, cosmetics (each shown with a preview), my real-life rewards, and "Manage rewards".

**Inventory**
- Sections: Mystery boxes · Freezes · Vacation days · Lucky charms · Real-life rewards. Each item shows its icon, count and a "Use" or "Open" action.
- Cosmetics don't appear here; they unlock immediately (13.12).
- **History** lists everything earned, bought, opened and used, newest first. It covers tick income summarized per day ("Mon: +1,240"), milestones, level-ups, purchases, box results and items used. Used real-life rewards show their date.

**Gallery**
- Current season at the top: name, days left, "13/24 pieces", and each artwork as its grid.
- Owned pieces are shown. Missing pieces are dark tiles with a rarity-colored outline and "Buy · 40 shards".
- A completed artwork opens full-screen with its title, artist, year and completion date.
- Past seasons are listed below, newest first.

**Icons:** every item has an icon.
- Built-in items have fixed Lucide icons: box → package, freeze → snowflake, vacation day → palmtree, lucky charm → clover, coin pouch → coins, cosmetics → palette or sparkles.
- Art pieces show a thumbnail of the piece itself.

---

## 13.11 Animations

These are the only exceptions to the calm rules in §14:

- **Tick:** the checkbox does a short animation, the streak counter bumps up, and "+330" floats up briefly. The default animation is used unless a cosmetic one is selected.
- **Milestone or level-up:** a slightly bigger celebration on the habit card or the header. Never a full-screen takeover.
- **Box opening:** the box shakes, opens, and the item flips in, colored by rarity: common `--text-muted`, rare `#6A9FB5`, legendary `#D9B25A`. A subtle glow is allowed **only** for legendary reveals. No gradients, no emoji, no confetti over the screen.

All animations respect `prefers-reduced-motion` (they're replaced by a fade).

---

## 13.12 Cosmetics

Cosmetics are owned forever and unlock immediately when bought or won. They're managed in Settings → Appearance.

**Extra list colors:** 12 extra colors, each sold individually.
- They must fit the Ember palette (warm, slightly muted, readable on `--bg`) and be clearly distinct from the base 12.
- Propose the 12 hex values in your plan.
- Owned extra colors appear in the list color picker after the base 12.

**Tick animations:** 4 extra animations beside the default: **sparks, ripple, ink splash, leaf**.
- One animation is selected **globally**; the default is always available.
- Each animation has a preview in the Shop and in Settings.

---

## 13.13 Seasons and art

**Seasons**
- Seasons are meteorological, in Europe/Prague: spring Mar–May, summer Jun–Aug, autumn Sep–Nov, winter Dec–Feb.
- **Season 1 is longer:** "Autumn–Winter 2026/27" runs from **19 Oct 2026** (`GAMIFICATION_START`) until 28 Feb 2027. Regular seasons start on 1 Mar 2027.

**Collections**
- Each season has **4 artworks × 6 pieces = 24 pieces**.
- Each artwork is cut into a 2×3 or 3×2 grid, depending on its orientation.
- Each artwork has **4 common, 1 rare and 1 legendary** piece. The most striking part of the artwork is the legendary piece, the second most striking is the rare one; set these in the season config.

**Season config**
- One file per season, e.g. `seasons/2026-autumn-winter.json`, containing:
  - id, name, start and end date
  - per artwork: title, artist, year, image file, grid, rarity of each piece, source URL and license
- Adding a season means adding a file plus images, with no code changes.

**Art rules**
- Only **public-domain** works, using museum open-access images (CC0) or Wikimedia Commons public-domain files. Verify each one.
- Record every source and license in `CREDITS.md`.
- Images are WebP, at most about 2000px on the long side, served as static assets.
- Pieces are rendered from the single image with CSS (background-position), not as pre-cut files.

**Planned seasons**
- Season 1 (Autumn–Winter 2026/27): Alfons Mucha, *The Seasons* (1896), the four panels
- Spring 2027: Vincent van Gogh, four spring or blossom paintings (e.g. *Almond Blossom*)
- Summer 2027: Claude Monet, four summer paintings
- Autumn 2027: Katsushika Hokusai, four prints from *Thirty-six Views of Mount Fuji*

Only Season 1 is built in Phase 5. Prepare the others' configs only if I ask.

**End of season:** its pieces leave the boxes. Missing pieces stay buyable with shards at past-season prices.

---

## 13.14 Data

New tables (names indicative; propose the final schema in your plan):

- `week_snapshots` and `week_snapshot_items`: week start, item, weight, value per completion
- `rewards_ledger`: unique key, type, item id, coins, xp, boxes granted, created at
- `wallet`: coins, shards, xp. Either a single row or derived from the ledger; choose one and explain why.
- `shop_rewards`: my real-life rewards (name, price, icon, sort order, archived)
- `inventory_items`: type, payload (e.g. reward id, habit armed on, vacation date), status (owned, armed, scheduled, used, opened, consumed), source (purchase, box, milestone, level-up), timestamps
- `box_openings`: result type, tier, piece id, duplicate, shards gained, coins gained, charm used, created at
- `owned_pieces`: season id, piece id, acquired at, source (box, shards)
- `owned_cosmetics` and `settings.tickAnimation`
- `freezes_used`: habit id, period
- `weight` column on habits and recurring-task templates

Every spend, open, use and arm is **atomic** (a D1 batch), so a double tap can never buy twice, open a box twice, or overspend.

---

## 13.15 Claude connector

Add a read-only MCP tool, `get_rewards(from, to)`. It returns:
- level, XP, coins and shards
- this week's earnings against the budget
- season progress per artwork
- inventory counts
- ledger events in the range

Claude can't buy, open, use or tick anything. Also add each habit's weight and value per tick to `list_habits`.

---

## 13.16 Tests

Unit tests (Vitest) with a seeded RNG where randomness is involved:

- **Normalization:** with 1, 4 and 40 items of mixed weights and frequencies, a perfect week earns WEEKLY_BUDGET (± rounding). Snapshots lock values, mid-week edits and new items wait for Monday, and per_month values are correct.
- **Earning:** the streak multiplier for all four frequencies, including the cap. Over-target ticks earn nothing. Late weekly tasks earn full value. Back-filling yesterday pays, two days back doesn't. Untick/retick pays once.
- **Ledger idempotency:** duplicate requests and undo/redo of weekly tasks.
- **Milestones:** streak runs (re-earnable after a break) and count milestones (once ever).
- **Levels:** the level curve and the box granted per level-up.
- **Boxes** (100,000 simulated openings): each result within ±0.5% of its odds, the rarity split within ±0.5%, and the coin pouch mean at 1.5× ±3%. Fallbacks to coin pouch work (no rewards defined, all cosmetics owned). Real-life rewards are weighted by 1/price. The lucky charm forces an unowned piece and can't be used when the season is complete.
- **Shards:** shards from duplicates, and piece prices for current and past seasons.
- **Freezes and vacation days:** auto-consumption, un-arming, vacation target reduction, cancelling, and weekly tasks staying unaffected.
- **Seasons:** boundaries in Europe/Prague, and the extended Season 1.
- **Start date:** nothing pays before 19 Oct. Pre-start history counts for streaks and counts, but milestones crossed before the start don't pay. The catch-up pays exactly what live operation would have, and running it twice pays nothing extra.

**Balance simulation** (a test that prints a report and doesn't fail on the result):
- The player has 4 daily habits with weights 3, 4, 5, 6 and 2 weekly tasks with weights 7, 8.
- They complete 70% of items at random and arm a freeze on their best streak whenever they own one.
- They spend about 35% of coins on boxes, open every box, and spend shards on missing pieces, legendary first.

Report:
- typical weekly income
- boxes per week, split into bought / milestone / level-up
- weeks to complete a regular 13-week season, and the share of the season completed by week 13
- weeks to reach level 10

The design targets are about 4 boxes per typical week, level 10 in 8–13 weeks, and most of a season's collection within its 13 weeks. If results miss these, report the numbers and propose config changes. Don't apply them.

---

## 13.17 Build order

Stop after each step so I can test:

1. Weights, week snapshots, earning, ledger, XP and levels, milestones, header, habit values and multipliers in the UI, default tick animation
2. Shop and Inventory: real-life rewards (manage view, icon picker, price hint), freezes, vacation days, purchase undo, History
3. Season 1, mystery boxes, box opening animation, lucky charm, coin pouch, shards, Gallery, `CREDITS.md`
4. Cosmetics: extra list colors, 4 tick animations, Settings → Appearance and Gamification
5. `get_rewards` MCP tool and the `list_habits` additions, README update, balance simulation report
