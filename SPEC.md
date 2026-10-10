# Task Planner — Build Spec

You are building a personal task planner for one user (me). It replaces TickTick Premium. Read this whole spec before writing code. **If anything is ambiguous or missing, ask me before deciding. Do not invent features that are not listed here.**

I have a JavaScript background but **no experience with Cloudflare**. Walk me through every setup step (accounts, CLI login, creating the database, secrets, deploying) with exact commands, and explain what each one does in one line.

---

## 1. Goals and non-goals

**Goals**
- Works on phone and desktop, installable as a PWA, data synced between devices.
- Costs €0: everything runs on Cloudflare's free tier.
- Claude (claude.ai) can read my tasks and add/edit them through an MCP connector.
- The code is public on GitHub so anyone can fork it and deploy **their own copy** for themselves (see §12). Each deployment is still single-user.

**Non-goals (do NOT build these)**
- Notifications or reminders of any kind
- Subtasks
- Multiple users, sharing, collaboration
- Import/export
- Google Calendar or any other external calendar integration
- Daily workload/capacity view
- Pomodoro, time tracking, Kanban

---

## 2. Tech stack

- **Hosting:** a **single Cloudflare Worker** that serves the built frontend as static assets *and* runs the API (and later the MCP server), all on one origin. Not Cloudflare Pages: a separate `*.pages.dev` frontend and `*.workers.dev` API are different sites, so the `SameSite=Strict` session cookie would not be sent.
- **Repo layout:** one npm package (no workspaces): `src/client` (React app), `src/worker` (Hono API), `src/shared` (shared types + pure logic + tests). Local dev runs through one Vite dev server with `@cloudflare/vite-plugin` (Worker + local D1).
- **Frontend:** React + TypeScript + Vite, built as a PWA (manifest + service worker so it installs on the home screen / desktop). App name: **"Planner"**, with a simple accent-colored icon (no emoji, no gradient). See §2.1 for offline behavior.
- **Backend API:** Hono on the Worker. Request validation with Zod.
- **Database:** Cloudflare **D1** (SQLite) with Drizzle ORM and migrations. IDs are UUIDs; timestamps are ISO 8601 UTC strings.
- **Data fetching:** TanStack Query. Data is refetched when the app regains focus/visibility and after every mutation. No realtime push.
- **Calendar UI:** FullCalendar (MIT plugins only: daygrid, timegrid not needed, interaction) — must support touch drag on mobile.
- **Dates:** date-fns. All "dates" are calendar dates stored as `YYYY-MM-DD` strings, no times. "Today" is computed in the **Europe/Prague** time zone.
- **Week:** Monday–Sunday.
- **Tests:** Vitest. All date/recurrence/streak/sorting logic lives in pure functions in a shared module and has unit tests (see §10).
- **UI language:** English. Date formats: e.g. "Mon 12 Oct". **Dark mode only** for now (see §14).
- **Content language:** I write tasks, lists and habits in **Czech**. Everything must handle Czech diacritics (č ř ž š ě ů ď ť ň á é í ó ú ý): fonts, database, search, sorting. Sort text with `Intl.Collator('cs')` (Czech rules, e.g. "ch" comes after "h"). There is **no search** (no search UI, no search function) — only filters and lists.
- Use TypeScript types shared between frontend and backend.

Before choosing library versions, check their current docs — do not rely on memory for Cloudflare, MCP or FullCalendar APIs.

### 2.1 Offline (read-only)
- The app shell is cached by the service worker and loads offline.
- The last fetched data is persisted on the device (TanStack Query persister + IndexedDB), so **every screen shows my data offline**.
- While offline, editing is disabled (no create/edit/complete/delete/drag) and one muted line explains why ("Offline — changes are disabled until you reconnect"). There is **no offline edit queue**.

---

## 3. Authentication

- Single user, single password. The password hash is stored as a Worker secret (not in the database, not in the repo).
- **Hashing:** PBKDF2-SHA256 via WebCrypto, 100,000 iterations (the Workers maximum), random 16-byte salt. The secret stores algorithm, iterations, salt and hash in one string. `npm run set-password` prompts for the password, hashes it locally and pipes it to `wrangler secret put`.
- I log in **once per device** and then never again. Login screen asks for the password only. On success, set an HttpOnly, Secure, SameSite=Strict session cookie valid for 1 year, **renewed on visits** (sliding expiry), so a device I use regularly never asks again. The installed PWA must keep the session too.
- **Sessions are stored in D1** (`Session` table, §4), so they can be revoked. The cookie holds a random token; the database stores only its SHA-256 hash. Sliding renewal (cookie + DB expiry) happens at most **once per day** per session, to avoid a DB write on every request.
- Every API route except login requires a valid session.
- Brute-force protection: after 5 wrong attempts **from the same IP**, that IP must wait 1 minute. Attempts are tracked in D1 (`LoginAttempt`, §4), so the limit holds across Worker isolates. Per IP, so nobody else can lock me out globally.
- A "Log out" button in settings. It ends **only the current device's** session.

---

## 4. Data model

```
List
  id, name, color (one of a fixed palette of 12 colors), sortOrder, createdAt

Task
  id
  listId            nullable — null means a "loose" task (no list), shown in neutral gray
  title             required
  notes             optional text
  priority          'low' | 'medium' | 'high' (default 'medium')
  deadline          YYYY-MM-DD, REQUIRED for every task, including loose tasks
  plannedDate       YYYY-MM-DD, nullable
  plannedManual     boolean — true once I set/drag the planned date myself
  recurringId       nullable — set if this task is an instance of a weekly task
  weekStart         nullable — Monday of the week this instance belongs to
  completedAt       nullable timestamp
  createdAt, updatedAt

RecurringTask  (template for weekly tasks)
  id, listId (nullable), title, notes, priority
  mode              'fixed' | 'flexible'
  weekday           1–7 (Mon–Sun), only for 'fixed'
  active            boolean (I can pause/delete it)
  createdAt

Habit
  id, name, color
  icon              name of an icon from the app's icon set (see §13)
  frequency         'daily' | 'weekdays' | 'per_week' | 'per_month'
  weekdays          array of 1–7, only for 'weekdays'
  target            integer, only for 'per_week' / 'per_month' (e.g. 4 = 4×/week)
  archived          boolean
  createdAt

HabitCheck
  habitId, date (YYYY-MM-DD)   — unique per habit per date

Session
  id, tokenHash (SHA-256 of the cookie token), createdAt, expiresAt, lastRenewedAt

LoginAttempt
  ip, failedCount, firstFailedAt, lockedUntil (nullable)
```

Phase 1 creates `List`, `Task` (including the `recurringId` / `weekStart` columns, so Phase 3 needs no task-table change), `Session` and `LoginAttempt`. `RecurringTask`, `Habit` and `HabitCheck` are added in Phase 3.

---

## 5. Task rules

### 5.1 Creating and editing
- A task cannot be saved without a deadline. The deadline picker is shown prominently in the create form — choosing it is a deliberate step, there is no default deadline.
- **No past deadlines:** a deadline before today is rejected when creating a task or when changing a task's deadline — in the form, in the API, and (Phase 4) in the MCP tools. Exceptions:
  - An existing task whose deadline is already in the past stays editable (title, notes, priority, list, planned date) as long as the deadline itself is not changed.
  - Undoing a completed task restores its original dates even if they are in the past.
  - Weekly instances generated by the server (§6) are not subject to this check.
- When a deadline is set and `plannedManual` is false:
  `plannedDate = max(today, deadline − 1 day)`
- If I change the deadline and `plannedManual` is false, recompute `plannedDate` with the same rule. If `plannedManual` is true, keep my planned date.
- I can change the planned date (in the form or by dragging in the calendar); this sets `plannedManual = true`. I can also clear it ("unplan"), which sets `plannedDate = null`, `plannedManual = true`.
- A planned date after the deadline is allowed, but the task shows a warning icon ("planned after deadline").
- **No past planned dates:** setting a planned date before today is rejected — in the form (past days are not selectable), by calendar drops (§8.2), in the API, and (Phase 4) in the MCP tools. Clearing it ("unplan") is always allowed, and an existing past planned date may stay while other fields are edited.
- The deadline is only changed in the task form, never by dragging.

### 5.2 Overdue flags (two levels)
For an uncompleted task, with `today` in Europe/Prague:
- **Red / "Overdue"** — `deadline < today`
- **Orange / "Missed plan"** — `plannedDate < today` and not red
- Otherwise no flag.

Overdue tasks are **never moved automatically**. They stay on their dates and are flagged.

### 5.3 Completing
- One tick completes the task. It disappears from every view, including both of its calendar entries (planned and deadline).
- Completed tasks go to the **Completed** archive, grouped by completion date (the date in the configured time zone, not UTC), newest first. From there I can **undo** (restore it with its original dates) or delete it permanently (with confirmation).
- The Completed archive has the same **list filter** as All tasks (one or more lists, including "No list"), remembered separately on each device. Each completed row shows its list name.
- A **"Delete all"** button (labelled "Delete shown" while a filter is active) permanently deletes exactly the completed tasks currently shown, after a confirmation that states how many.
- Deleting an uncompleted task asks for confirmation.

### 5.4 Lists
- Create, rename, recolor, reorder lists. Reordering is by **drag** (touch-friendly, `@dnd-kit`).
- Every task and calendar entry is shown in its list's color. Loose tasks use neutral gray.
- Deleting a list asks: "Move its tasks to No list" or "Delete its tasks too". "Delete its tasks too" deletes **all** of its tasks, including completed ones in the archive, **and the list's weekly templates** (§6). "Move its tasks to No list" also moves the list's weekly templates to No list.

---

## 6. Weekly (recurring) tasks

- A RecurringTask template generates one Task instance per week (identified by `recurringId` + `weekStart`). Generation must be idempotent — never create two instances for the same week.
- Instances for the current week are generated when the app loads data (lazily on the server), so no cron job is needed. When I complete an instance, also generate next week's instance immediately if it doesn't exist.
- **Fixed** (e.g. "every Tuesday"): `deadline = plannedDate =` that weekday of the instance's week.
- **Flexible** ("any day this week"): `deadline = Sunday` of the instance's week; `plannedDate = null` (unplanned) until I drag it onto a day. The auto-planned-date rule from §5.1 does NOT apply to flexible instances.
- Missed weeks: if an instance is not completed by its deadline it gets the normal red flag and stays. The next week's instance is still created when that week begins.
- Editing a template affects future instances only (not already-created ones). Pausing or deleting a template stops new instances; existing uncompleted instances remain.
- Weekly tasks are managed in a **Weekly** screen: list of templates with mode/weekday, plus "add weekly task".

---

## 7. Habits

- Create/edit/archive habits with one of the frequencies: daily, specific weekdays, X times per week, X times per month.
- **Due today** logic (for the Today screen):
  - daily → always
  - weekdays → if today is one of its weekdays
  - per_week → if this week's check count < target
  - per_month → if this month's check count < target
- Ticking a habit creates a HabitCheck for that date; un-ticking removes it. On a habit's detail screen I can tick/untick past dates (in case I forgot).
- **Streaks** (pure functions, unit tested):
  - daily / weekdays: number of consecutive *scheduled* days that have a check, counting back from today. If today is scheduled but not yet ticked, start counting from the previous scheduled day (today doesn't break the streak until it's over).
  - per_week: number of consecutive weeks where checks ≥ target. The current week counts only if already met; an unfinished current week doesn't break the streak.
  - per_month: same as per_week, with calendar months.
  - Show the unit: "12 days", "5 weeks", "3 months".
- Habit detail shows: current streak, best streak, completion rate over the last 30 days (or last 12 weeks / 12 months for per_week / per_month), and a heatmap-style calendar of checks.
- Habits do **not** appear in the calendar.

---

## 8. Screens

Bottom tab bar on phone, sidebar on desktop: **Today · Calendar · All tasks · Habits · Weekly**, plus Lists and Completed reachable from the sidebar/menu, and Settings.

### 8.1 Today (the screen the app opens on)
In this order:
1. **Overdue** — all red-flagged tasks
2. **Missed plan** — all orange-flagged tasks
3. **Today** — tasks with `plannedDate = today`
4. **Due today** — tasks whose deadline is today but planned elsewhere/unplanned
5. **This week, unplanned** — flexible weekly instances of the current week with no planned date
6. **Habits due today** — tickable

**Deduplication:** each task appears **once**, in the first section (in the order above) that it matches. E.g. an overdue task planned for today is shown only under Overdue.

Sections 5 and 6 are added in Phase 3; Phase 1 builds sections 1–4.

Each task row (on every screen) shows, in this order on one line:
- **checkbox** — a circle whose ring is drawn in the task's **list color** (neutral gray for no list); this replaces a separate list color dot. Exception: in **All tasks** the ring shows the **priority** instead (§8.3);
- **title** — high-priority titles use medium weight (500);
- **priority number** in a small outlined tag: `0` low, `1` medium, `2` high (the form's priority buttons show the same numbers: "0 Low · 1 Medium · 2 High");
- **deadline label**, then the **flag** if any, then the planned-after-deadline warning icon if any.

The metadata follows the title directly (not right-aligned), so everything is readable in one glance; on phones it wraps to a second line under the title. Tapping a row opens the edit form. A "+" button adds a task.

**Deadline label** (used everywhere a task row shows its deadline):
- deadline today → "due today"
- deadline tomorrow → "due tomorrow"
- 2–6 days ahead → "due in N days"
- 7+ days ahead → "due Fri 16 Oct"
- deadline in the past → "due Fri 9 Oct" (absolute date) together with the red flag

### 8.2 Calendar
- **Month** and **Week** views, toggle at the top. On phone it opens on Week, on desktop on Month.
- **Week on phones** is a **vertical day list**: 7 stacked rows (Monday at the top), each showing that day's chips at full width so titles stay readable. Chips are dragged between rows with a long-press. Desktop Week (and Month everywhere) uses the normal FullCalendar day grid.
- **Past days don't accept drops** (planned entries or tray items): you can only plan for today or later.
- Each uncompleted task can appear twice:
  - **Planned entry** — filled chip in the list color, draggable to any day (sets `plannedDate`, `plannedManual = true`).
  - **Deadline entry** — outlined chip with a flag icon, same color, **not** draggable.
  - If planned date = deadline, show one chip with both styles combined (filled + flag).
- Overdue chips show their red/orange flag.
- Completing a task from a calendar chip (checkbox inside the chip or in the popup on tap) removes both entries.
- A side tray (desktop) / bottom sheet (phone) lists **unplanned tasks** (including flexible weekly instances) that I can drag onto a day.
- Tapping an empty day **today or later** opens "new task" with that day as the deadline preselected (I can change it).
- Tapping a **past** day opens a short list of the tasks I **completed on that day** (completion date in the configured time zone), read-only except for undo. It does not create a task, because past deadlines are not allowed (§5.1). In deadline pickers, past days are simply not selectable.
- Touch drag must work on mobile (long-press to drag).

### 8.3 All tasks
- Every uncompleted task, with a sort selector:
  - **Deadline** — earliest first
  - **Urgency** — see formula below
  - **List** — grouped by list (in list order), within each group sorted by deadline; loose tasks as a "No list" group at the end
- Filter by one or more lists; **"No list"** is one of the filter options.
- **Color by priority:** in All tasks the checkbox ring shows the task's priority, not its list (the list is available through the filter and the List sort): `2` high = red (`--danger`), `1` medium = amber (`--warning`), `0` low = neutral gray. Today, Completed and the calendar keep list colors.
- Overdue tasks are always shown first within any sort, red before orange:
  - red tasks: most overdue (earliest deadline) first;
  - orange tasks: oldest planned date first;
  - in the **List** sort, overdue tasks are shown first **inside their own list group** (not pulled above all groups).
- **Urgency formula** (pure function, unit tested):
  ```
  weight = { high: 3, medium: 2, low: 1 }[priority]
  days   = deadline − today in whole days
  urgency = weight / max(days, 0.5)
  ```
  Tasks with `days < 0` (red) always rank above everything else, most overdue first. Ties broken by deadline, then title.

### 8.4 Habits
List of active habits with today's tick state, current streak, and progress for per_week/per_month ("2/4 this week"). Tap → detail screen (§7). Archived habits in a collapsed section.

### 8.5 Weekly
Templates (§6), grouped by fixed/flexible, with create/edit/pause/delete.

### 8.6 Lists, Completed, Settings
Lists: manage lists (§5.4). Completed: archive (§5.3). Settings: log out, theme info, and the connector setup info (§9).

---

## 9. Claude MCP connector

Expose a **remote MCP server** from a Cloudflare Worker so I can add it to claude.ai as a custom connector. Check the current MCP spec and Cloudflare docs (e.g. Cloudflare's `agents` MCP tooling and `workers-oauth-provider`) for what claude.ai custom connectors require for authentication. The authorization screen must ask for **my app password**, so only I can connect.

Tools (read + add/edit; **no completing, no deleting**):
- `get_overview(from, to)` — for a date range: overdue tasks, tasks planned per day, deadlines per day, unplanned tasks, habits with their streaks and completion in the range, tasks completed in the range. Designed so Claude can write a weekly review.
- `list_tasks(filters)` — filter by list, status (open/completed), deadline range, flag; returns all task fields plus list name and flag.
- `list_lists()` and `list_habits()`
- `create_task(title, deadline, listName?, priority?, plannedDate?, notes?)` — same rules as the app (deadline required, no past deadline, auto planned date). Match `listName` case-insensitively; return an error listing valid names if not found.
- `update_task(id, fields)` — title, notes, priority, deadline, plannedDate, listName. Cannot set completedAt. A changed deadline must not be in the past (§5.1).

Tool descriptions must explain the deadline/planned-date concepts and the flag meanings so Claude interprets the data correctly. Settings screen shows the connector URL and short setup steps.

---

## 10. Testing requirements

Unit tests (Vitest) for every pure function, covering at least:
- planned-date default: deadline tomorrow, today, in the past, far future; recompute on deadline change; no recompute when `plannedManual`
- deadline validation: past deadline rejected on create and on deadline change; existing past-deadline task editable when the deadline is unchanged
- flags: red, orange, none, planned-after-deadline warning
- deadline label rules (§8.1) and Today section deduplication
- urgency ordering, including overdue first and tie-breaking
- recurrence: fixed and flexible instance dates; idempotent generation; generation across a missed week; next-week instance on completion; week boundaries (Sunday → Monday) and year boundaries
- habit due-today and streaks for all four frequencies, including "today not yet ticked", month boundaries, and weeks crossing months
- Europe/Prague "today" near midnight, including DST change days

All tests must pass before each phase is called done.

---

## 11. Build order

Stop at the end of each phase, tell me exactly how to try it (locally and deployed), and wait for my OK before continuing.

1. **Setup + tasks:** project scaffold, Cloudflare setup walkthrough (starting from creating a Cloudflare account), D1 schema, login, lists, tasks with deadlines/planned dates/flags/priority, Today screen (sections 1–4), All tasks with sorting, Completed archive, read-only offline (§2.1). Deployed and installable on my phone (Android) and desktop (Windows).
2. **Calendar:** month/week views, planned + deadline entries, drag to plan, unplanned tray, mobile touch drag.
3. **Weekly tasks and habits:** recurrence, Weekly screen, habits with all frequencies, streaks, habit detail.
4. **Claude connector:** MCP server, auth, tools, setup instructions.
5. **Habit gamification** (§13) — later, only when I ask for it. Phases 1–4 must not depend on it, but keep the habit code structured so it can be added without rewriting streak logic.

Keep a short `README.md` updated with: how to run locally, how to deploy, how to run tests, where secrets live.

---

## 12. Open-source repository

The repo is public on GitHub so others can deploy their own single-user copy.

- **No personal data or secrets in the repo**: no passwords, hashes, account IDs, database IDs or my URLs. Commit `wrangler.example.toml` (or equivalent) with placeholders; the real config is gitignored. Secrets are set with `wrangler secret put`.
- Provide a `npm run set-password` script that hashes a password and stores it as the Worker secret.
- I (the owner) use Windows and Android only; the walkthrough targets those, but nothing should be platform-specific in a way that breaks iOS/macOS for others.
- `README.md` has a **"Deploy your own"** section a stranger can follow from zero: prerequisites, create Cloudflare account, clone, configure, create D1 database, run migrations, set password, deploy, install the PWA, connect Claude.
- The default time zone (Europe/Prague) is a config value, not hardcoded.
- MIT license. Sensible `.gitignore`. Conventional, small commits with clear messages.
- Add a few screenshots to the README at the end of Phase 3.

---

## 13. Habit gamification (Phase 5 — build only when asked)

**Icons**
- Each habit has an icon chosen from a picker showing a curated set (~60) from the Lucide icon library, grouped (health, learning, music, sport, home, social…). Not emoji.

**Animations**
- Ticking a habit: short, small animation on the checkbox and the streak counter "bumps" up.
- Milestones (7, 30, 100, 365 days; 4, 12, 52 weeks; 3, 6, 12 months): a slightly bigger celebration on that habit's card. Never a full-screen takeover.
- Respect `prefers-reduced-motion`: replace animations with a simple fade.

**Points**
- One shared points balance for all habits.
- Earn **1 point** each time a habit's current streak reaches a multiple of: 7 for daily/weekdays habits (counted in scheduled days), 4 weeks for per_week, 3 months for per_month.
- Points are recorded in a ledger with a unique key per habit + milestone, so un-ticking and re-ticking, or back-filling past days, can never award the same points twice.
- If a later un-tick breaks the streak that earned a point, the point is kept (no clawbacks).

**Streak freezes**
- A freeze costs **5 points** (a config constant). It is bought for a specific habit; each habit can hold at most 2.
- When a habit misses a period (a scheduled day, a week below target, or a month below target), a held freeze is used **automatically** and the streak continues. The frozen period is shown with an ice icon in the habit's heatmap and doesn't add to the streak length.
- Freezes are evaluated when the period has ended (e.g. the day after a missed day), not during it.
- Show the points balance and freezes held on the Habits screen.

Data: add tables for the points ledger, held freezes per habit, and used freezes (habitId + period). Streak functions take used freezes into account and stay pure and unit tested.

---

## 14. Design

The app must look like a carefully designed product, not a generated one. **References: TickTick, Todoist, Slack** — look at how they handle dense list rows, sidebars, and color. Build the design tokens (colors, font, spacing, radius) first, as CSS variables, and use only those everywhere.

### Palette "Ember" (dark mode only)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#1C1916` | App background |
| `--surface` | `#26221E` | Sidebar, panels, task rows on hover, inputs |
| `--surface-raised` | `#302B26` | Popovers, menus, dialogs |
| `--border` | `#3A342E` | 1px hairline dividers |
| `--text` | `#EDE6DB` | Primary text |
| `--text-muted` | `#9C9286` | Secondary text, dates, metadata |
| `--accent` | `#E8925A` | The one accent: primary button, selection, focus ring, streak counter |
| `--danger` | `#D9675A` | Red flag "Overdue", destructive actions |
| `--warning` | `#D9B25A` | Orange flag "Missed plan" |

Text on `--accent` fills uses `--bg` color. Check every text/background pair passes WCAG AA contrast.

**List colors** (fixed palette of 12, in this order in the color picker):
`#D9675A` `#E8925A` `#D9B25A` `#A8B55E` `#7FA36B` `#5FA39A` `#6A9FB5` `#7B8FC9` `#9A82C2` `#B87AA6` `#C98A8A` `#A08C76`
Loose tasks (no list) use `--text-muted` gray. On task rows, the list color is carried by the checkbox ring (§8.1).

### Typography
- **Geist** (self-hosted or Google Fonts) including the **latin-ext** subset so Czech characters render in Geist, not a fallback font. Verify with: "Příliš žluťoučký kůň úpěl ďábelské ódy".
- Geist Mono only for numbers where alignment matters (streak counts, stats), or use tabular figures.
- Sizes: 13px metadata, 14–15px body/task titles, 18px screen titles. Weights 400 and 500 only (600 at most for screen titles). No giant headings.

### Layout and style rules
- Dense and calm, like TickTick: task rows ~40px high (≥44px tap target on phone), separated by hairline dividers, **not** individual cards.
- Spacing on a 4px grid. Border radius: 6px for controls and chips, 10px max for dialogs. Nothing pill-shaped except small tags.
- Left-aligned layouts. Sidebar on desktop (Slack-style: compact, list colors as small dots), bottom tab bar on phone.
- Icons: **Lucide only**, 16–18px, stroke style, used sparingly — not every label needs an icon.
- Motion: 150–200ms ease-out for things appearing/moving; nothing bouncy except the Phase 5 habit animations. Respect `prefers-reduced-motion`.
- Copy: short, plain, sentence case. "Add task", "No tasks today". No exclamation marks, no "Welcome back!", no motivational slogans.

### Avoid (typical generated-app look)
- Gradients of any kind — backgrounds, buttons, text, borders. Especially purple/blue/pink.
- Emoji anywhere in the UI.
- Glassmorphism, blur, glow, neon, or colored drop shadows. Use no shadows except a subtle one on popovers/dialogs.
- Everything wrapped in rounded cards; cards inside cards; large border radius everywhere.
- Excessive padding and empty space that makes lists show only a few items.
- Low-contrast gray-on-gray text.
- Pure black `#000` backgrounds or blue-tinted dark mode — stay with the warm Ember tones.
- Decorative "stat cards" and dashboard widgets nobody asked for ("12 tasks done this week ↑").
- Large empty-state illustrations; a single muted line of text is enough.
- Sparkle/magic icons, "AI-powered" wording, marketing copy ("Supercharge your productivity").
- Hover effects that scale, lift or bounce elements.
- Badges, pills and colored chips everywhere; color carries meaning only (list color, flags, accent).
- Toast notifications for every action; use them only for undo ("Task completed · Undo").
- Unmodified component-library defaults (e.g. stock shadcn/ui look). If a component library is used, restyle it fully with the tokens above.
- Inconsistent spacing, radii or icon styles between screens.
- Seeded demo/placeholder data. The app starts empty, with one line explaining how to add the first list.
