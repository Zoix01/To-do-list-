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
- Pomodoro, time tracking, Kanban (status columns like To do / Doing / Done). The only drag-between-groups view is the **Priority** sort in All tasks (§8.3).

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
  activeFrom        YYYY-MM-DD — date it was created or last resumed (§6)
  generatedThrough  YYYY-MM-DD, nullable — Monday of the latest week already generated (§6)
  createdAt

Habit
  id, name, color   (color from the same 12-color palette as lists)
  icon              nullable; name of an icon from the app's icon set — stays empty until Phase 5 (§13)
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
- **New tasks are unplanned by default** (`plannedDate = null`): I rarely know the day when I add a task. A planned date exists only when I set one (in the form or by dragging in the calendar). There is **no automatic planned date**.
- Changing the deadline **never moves** the planned date. (Tasks created before this rule may still have an automatically chosen planned date; it simply stays until I change it.)
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

## 6. Recurring (weekly and monthly) tasks

- A RecurringTask template generates one Task instance per week (identified by `recurringId` + `weekStart`). Generation must be idempotent — never create two instances for the same week.
- Instances for the current week are generated when the app loads data (lazily on the server), so no cron job is needed. When I complete an instance, also generate next week's instance immediately if it doesn't exist.
- **Fixed** (e.g. "every Tuesday"): `deadline = plannedDate =` that weekday of the instance's week.
- **Flexible** ("any day this week"): `deadline = Sunday` of the instance's week; `plannedDate = null` (unplanned) until I drag it onto a day.
- Missed weeks: if an instance is not completed by its deadline it gets the normal red flag and stays. The next week's instance is still created when that week begins.
- Editing a template affects future instances only (not already-created ones). Pausing or deleting a template stops new instances; existing uncompleted instances remain.
- **First week:** a fixed template whose weekday has already passed in the week it is created (or resumed) starts **next week** — no instance is created already overdue. Implemented with `activeFrom`: a fixed instance is generated only if its date is ≥ `activeFrom`.
- **Each week is generated once** (`generatedThrough`): deleting an instance (e.g. to skip a week) does not bring it back on the next load. A unique index on (`recurringId`, `weekStart`) also guarantees no duplicates.
- Instances are normal tasks everywhere (Today, All tasks, calendar, editing). They show a small **repeat icon** after the title in task rows and the task panel.
- Recurring tasks are managed in the **Recurring** screen (formerly "Weekly"): list of templates with their schedule, plus "add recurring task".

### 6.1 Monthly tasks (Phase 5, step 1b)

- A template repeats **weekly** (as above) or **monthly**. Monthly templates have two modes:
  - **On set days of the month** (e.g. the 1st and 15th): each chosen day becomes a task planned and due on that day. Day 29–31 means the last day in shorter months (two days falling on the same date make one task).
  - **N times a month, any day** (1–10): N tasks, unplanned, with deadlines spread over the month: for k < N the k-th is due on day ⌊30·k/N⌋, the last one on the month's last day (2× → 15th and last day; 3× → 10th, 20th, last day).
- Monthly instances are created when the month begins (lazily, like weekly ones); completing one doesn't create next month's early. Each month is generated once (`generatedThrough` = 1st of the latest month).
- **First month:** instances due before the day the template was created or resumed (`activeFrom`) are skipped; the rest of this month's are created right away.
- An instance's `weekStart` holds the start of its period (Monday, or the 1st for monthly), and `occurrence` tells instances of the same period apart (the day of month for set days, k for N times). The unique index is (`recurringId`, `weekStart`, `occurrence`).
- **No ticking in the Recurring list:** templates keep their ring marker; their tasks are completed where they show up (Today, All tasks, calendar). Monthly rows show progress, e.g. "1/2 this month".
- **Rewards:** a monthly template earns like a monthly habit with N completions (N × 12/52 a week, §13.3). A recurring task pays the value of the week its deadline falls in. Count milestones apply per template.

---

## 7. Habits

- Create/edit/archive habits with one of the frequencies: daily, specific weekdays, X times per week, X times per month.
- **Due today** logic (for the Today screen):
  - daily → always
  - weekdays → if today is one of its weekdays
  - per_week → if this week's check count < target
  - per_month → if this month's check count < target
- Ticking a habit creates a HabitCheck for that date; un-ticking removes it. On a habit's detail screen I can tick/untick past dates (in case I forgot). Future dates can't be ticked.
- The Today screen shows a habit if it is **due today or already ticked today** (so it can be un-ticked).
- Ticking a day that isn't scheduled (e.g. a weekdays habit on a day off) is allowed but doesn't affect the streak.
- Targets: 1–7 for per_week, 1–31 for per_month; a weekdays habit needs at least one weekday.
- Archived habits can be restored or deleted permanently (with confirmation). Deleting removes its checks.
- **Streaks** (pure functions, unit tested):
  - daily / weekdays: number of consecutive *scheduled* days that have a check, counting back from today. If today is scheduled but not yet ticked, start counting from the previous scheduled day (today doesn't break the streak until it's over).
  - per_week: number of consecutive weeks where checks ≥ target. The current week counts only if already met; an unfinished current week doesn't break the streak.
  - per_month: same as per_week, with calendar months.
  - Show the unit: "12 days", "5 weeks", "3 months".
- Habit detail shows: current streak, best streak, completion rate over the last 30 days (or last 12 weeks / 12 months for per_week / per_month), and a heatmap-style calendar of checks.
  - **Completion rate** counts only periods since the habit was created (or its earliest check, if earlier). The current period counts only if already met.
  - The calendar is a **month grid** with prev/next month: ticked days filled in the habit color, scheduled past days without a tick outlined, future days disabled. Tapping a day (today or earlier) ticks / un-ticks it.
- Habits do **not** appear in the calendar.

---

## 8. Screens

Bottom tab bar on phone, sidebar on desktop: **Today · Calendar · All tasks · Habits · Recurring**, plus Lists and Completed reachable from the sidebar/menu, and Settings.

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
- **Planning after the deadline is allowed**, but: the planned chip shows an amber warning badge, and a drop that lands after the deadline shows the message "Planned after the deadline (Wed 14 Oct) · Undo". Undo restores the previous planned date, or unplans the task if it had none (or if the old one has passed).
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
  - **Priority** — three sections, `2 · High`, `1 · Medium`, `0 · Low` (always shown, even when empty), each sorted by deadline (overdue first). **Dragging a task into another section changes its priority** (long-press on touch, like the calendar). Order within a section is automatic; there is no manual ordering. The list filter still applies.
- Filter by one or more lists; **"No list"** is one of the filter options.
- **Color by priority:** in All tasks the checkbox ring shows the task's priority, not its list (the list is available through the filter and the List sort): `2` high = red (`--danger`), `1` medium = amber (`--warning`), `0` low = neutral gray. Today, Completed and the calendar keep list colors.
- So the list stays visible, each All tasks row also shows the **list color dot and the list name in the list color** at the right end of the row (on phones, at the end of the metadata line). Loose tasks show only a gray dot.
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

### 8.5 Recurring
Templates (§6), grouped by schedule (weekly on a set day, weekly any day, monthly), with create/edit/pause/delete, and monthly progress (§6.1).

### 8.6 Lists, Completed, Settings
Lists: manage lists (§5.4). Completed: archive (§5.3). Settings: log out, theme info, and the connector setup info (§9).

---

## 9. Claude MCP connector

Expose a **remote MCP server** from a Cloudflare Worker so I can add it to claude.ai as a custom connector. Check the current MCP spec and Cloudflare docs (e.g. Cloudflare's `agents` MCP tooling and `workers-oauth-provider`) for what claude.ai custom connectors require for authentication. The authorization screen must ask for **my app password**, so only I can connect.

Tools (read + add/edit; **no completing, no deleting**):
- `get_overview(from, to)` — for a date range: overdue tasks, tasks planned per day, deadlines per day, unplanned tasks, habits with their streaks and completion in the range, tasks completed in the range. Designed so Claude can write a weekly review.
- `list_tasks(filters)` — filter by list, status (open/completed), deadline range, flag; returns all task fields plus list name and flag.
- `list_lists()` and `list_habits()`
- `create_task(title, deadline, listName?, priority?, plannedDate?, notes?)` — same rules as the app (deadline required, no past deadline, no past planned date; unplanned unless `plannedDate` is given). Match `listName` case-insensitively; return an error listing valid names if not found.
- `update_task(id, fields)` — title, notes, priority, deadline, plannedDate, listName. Cannot set completedAt. A changed deadline must not be in the past (§5.1).

Tool descriptions must explain the deadline/planned-date concepts and the flag meanings so Claude interprets the data correctly. Settings screen shows the connector URL and short setup steps.

### 9.1 Phase 4 decisions
Based on Anthropic's connector authentication requirements (https://claude.com/docs/connectors/building/authentication):
- **Same Worker**, MCP endpoint at `/mcp` (Streamable HTTP). Cloudflare's `workers-oauth-provider` wraps the Worker and serves OAuth discovery (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`), client registration (`/register`, DCR) and `/token`. CIMD is not enabled (Claude falls back to DCR, and it avoids outbound metadata fetches). The MCP server is stateless (a fresh server per request, JSON responses); no Durable Objects. If `OAUTH_KV` isn't configured, the app works normally and `/mcp` answers 503 with a hint. Unauthenticated `/mcp` requests get `401` with a `resource_metadata` pointer. PKCE S256 is required. Grants/tokens live in a KV namespace bound as `OAUTH_KV` (stored as hashes). The Worker's `run_worker_first` routes must include `/mcp`, `/authorize`, `/token`, `/register` and `/.well-known/*`.
- **Only Claude can connect:** registration and authorization accept only Claude's redirect URIs — `https://claude.ai/api/mcp/auth_callback` (claude.ai web, desktop, mobile) and Claude Code's loopback `http://localhost/callback` / `http://127.0.0.1/callback` on any port. Anything else is rejected.
- **Authorization page** (`/authorize`): server-rendered in the app's style; shows the client's name and its redirect host, and asks for the **app password** (same hash and the same per-IP 5-attempt lockout as the login). Clickjacking protection (`frame-ancestors 'none'`).
- **Connection lifetime:** until I disconnect. Short-lived access tokens (about 1 hour) renewed with rotating refresh tokens; refresh tokens don't expire on their own.
- **Settings → Claude connector:** the connector URL with a copy button, short setup steps, and a list of **connected apps** (name, connected date) with **Disconnect**, which revokes the grant immediately.
- **One connection per kind:** Claude registers a new client on each fresh connection, so a new connection replaces older ones of the same kind — claude.ai (web, desktop and mobile share one) or Claude Code — instead of leaving dead entries in Settings.
- **Shared rules:** task creation/editing is moved into one server module used by both the app API and the MCP tools, so Claude follows exactly the app's rules (deadline required, no past deadline or planned date, unplanned by default, list by name). Reads also generate the current week's weekly instances.
- Every tool result includes `today` and the time zone. `get_overview` accepts ranges up to 92 days.
- Also in this phase: when loading tasks fails while online, the app shows one line ("Couldn't load your tasks. Try again.") instead of failing silently.

---

## 10. Testing requirements

Unit tests (Vitest) for every pure function, covering at least:
- planning: new tasks unplanned unless a planned date is given; a deadline change never moves the planned date; setting / clearing the planned date
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
5. **Habit gamification** (§13), built in the steps of §13.17, stopping after each step.

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

## 13. Habit gamification (Phase 5)

This section replaces the earlier gamification design entirely (points per 7-day streak, freeze for 5 points, and so on).

**Numbers:** don't change any number in this section on my own initiative. All numbers live in one config file (13.2) and I tune them. If a test or simulation shows a number doesn't work, report it and propose a change.

All other SPEC rules still apply, including the design rules in §14, except for the animation exceptions in 13.11. Tasks, the calendar and All tasks are not affected by gamification, except for the new weight field on weekly tasks.

---

### 13.1 Overview

- Habits and weekly tasks earn **coins** and **XP**. Normal (one-off) tasks earn nothing.
- Income is **normalized**: a perfect week always earns the same budget, however many habits and weekly tasks I have. Each item gets a share by its **weight**.
- XP gives **levels**. Each level-up gives a mystery box.
- Coins are spent in the **Shop**: mystery boxes, streak freezes, vacation days, cosmetics, and real-life rewards I define in the app.
- **Mystery boxes** mostly contain pieces of a seasonal **art collection** of public-domain artworks. Duplicates become **shards**, which buy specific missing pieces.
- Everything bought or won goes to the **Inventory**, where it's used or opened.
- **No penalties.** A missed habit only breaks its streak (unless a freeze or vacation day covers it). Coins and XP are never taken away.

---

### 13.2 Config

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

### 13.3 Weights and weekly values

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
                           monthly task: N × 12 / 52 (N = set days or times a month, §6.1)
valuePerCompletion(item) = round(share / completionsPerWeek, COIN_ROUNDING)
```

- Edits to weights, new items, archived items and paused templates take effect at the **next** snapshot. Ticks always use the snapshot of the week they belong to.
- A habit or weekly task **created mid-week earns nothing until next Monday**. Its card shows "Earns from Mon".
- Archived habits and paused or deleted templates are excluded from the next snapshot.

---

### 13.4 Earning

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

### 13.5 Milestones and levels

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

### 13.6 Shop

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

### 13.7 Mystery boxes

**Opening**
- Boxes go to the Inventory; I open them there, one at a time.
- The result is decided **on the server** using a cryptographically secure random generator, stored, and only then animated. Reloading or double-tapping can never re-roll or open twice.
- A box has no season of its own: its contents come from the season that's current when it's **opened**.

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

### 13.8 Shards

- A separate balance, shown next to coins.
- Shards buy a **specific missing piece** in the Gallery:

| | Common | Rare | Legendary |
|---|---|---|---|
| Current season | 40 | 60 | 80 |
| Past seasons (1.5×) | 60 | 90 | 120 |

---

### 13.9 Freezes and vacation days

**Streak freeze**
- Using a freeze from the Inventory **arms** it on a habit I choose. There's no limit per habit.
- When that habit misses a period (a scheduled day, a week below target, or a month below target), one armed freeze is consumed **automatically** after the period ends, and the streak continues.
- A frozen period shows an ice icon in the heatmap. It doesn't add to the streak length and earns nothing.
- An unused armed freeze can be un-armed back to the Inventory.
- A freeze must be armed **before** the miss: it stays armed (for days or months) until the habit misses a period that ends after it was armed, and only then is it used. Arming it after a miss doesn't repair the streak.
- A freeze is only used if there's a streak of at least 1 to protect.
- If a frozen period is later back-filled until it's met, the freeze returns to that habit, still armed.

**Vacation day** (1 item = 1 day)
- Using one asks for a date: today or any future date.
- On that day **all habits are paused**: nothing is due, nothing breaks a streak or uses a freeze, and the day doesn't add to streak length. It shows a vacation marker in the heatmaps.
- **Weekly tasks are not paused.**
- For per_week and per_month habits, the period's target is reduced proportionally to the vacation days in that period (rounded down). Value per completion stays as in the snapshot. If the reduced target is 0, the whole period counts as paused: it neither adds to the streak nor breaks it.
- Ticking a habit on a vacation day is allowed and pays like a normal tick, but the day still doesn't add to the streak. On a vacation day, habits show on Today only if they're already ticked.
- Several vacation days can be used for consecutive dates.
- A future vacation day can be cancelled, which returns it to the Inventory.

All streak logic must account for freezes and vacation days, stay in pure functions, and be unit tested.

---

### 13.10 Screens

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

### 13.11 Animations

These are the only exceptions to the calm rules in §14:

- **Tick:** the checkbox does a short animation, the streak counter bumps up, and "+330" floats up briefly. The default animation is used unless a cosmetic one is selected.
- **Milestone or level-up:** a slightly bigger celebration on the habit card or the header. Never a full-screen takeover.
- **Box opening:** the box shakes, opens, and the item flips in, colored by rarity: common `--text-muted`, rare `#6A9FB5`, legendary `#D9B25A`. A subtle glow is allowed **only** for legendary reveals. No gradients, no emoji, no confetti over the screen.

All animations respect `prefers-reduced-motion` (they're replaced by a fade).

---

### 13.12 Cosmetics

Cosmetics are owned forever and unlock immediately when bought or won. They're managed in Settings → Appearance.

**Extra list colors:** 12 extra colors, each sold individually.
- They must fit the Ember palette (warm, slightly muted, readable on `--bg`) and be clearly distinct from the base 12.
- Propose the 12 hex values in your plan.
- Owned extra colors appear in the list color picker after the base 12.

**Tick animations:** 4 extra animations beside the default: **sparks, ripple, ink splash, leaf**.
- One animation is selected **globally**; the default is always available.
- Each animation has a preview in the Shop and in Settings.

**Habit icons:** each habit can have an icon, chosen in the habit form from a curated set of **60 Lucide icons**, grouped (health, learning, music, sport, home, social…). Not emoji.
- **30 are free** from the start. The other **30 are cosmetics, each sold individually** at the cosmetic price, and can also come from a box's cosmetic result.
- Locked icons are shown in the picker as locked and can't be chosen.
- Habits without an icon look as they do today.

---

### 13.13 Seasons and art

**Seasons**
- Seasons are meteorological, in Europe/Prague: spring Mar–May, summer Jun–Aug, autumn Sep–Nov, winter Dec–Feb.
- **Season 1 is longer:** "Winter 2026/27" runs from **19 Oct 2026** (`GAMIFICATION_START`) until 28 Feb 2027. Regular seasons start on 1 Mar 2027.
- Each season's art is **inspired by that season of the year** (Season 1: winter, then spring, summer, autumn). The art is the only thing that changes between seasons.
- If no newer season has started when one ends, the latest season that has started stays the current one (its "days left" shows "Ended"), so boxes are never empty.

**Collections**
- Each season has **4 artworks × 6 pieces = 24 pieces**.
- Each artwork is cut into a 2×3 or 3×2 grid, depending on its orientation.
- Each artwork has **4 common, 1 rare and 1 legendary** piece. The most striking part of the artwork is the legendary piece, the second most striking is the rare one; set these in the season config.

**Season config**
- One file per season, e.g. `seasons/2026-27-winter.json`, containing:
  - id, name, start and end date
  - per artwork: title, artist, year, image file, grid, rarity of each piece, source URL and license
- Adding a season means adding a file plus images, with no code changes.

**Art rules**
- Only **public-domain** works, using museum open-access images (CC0) or Wikimedia Commons public-domain files. Verify each one.
- Record every source and license in `CREDITS.md`.
- Images are WebP, at most about 2000px on the long side, served as static assets.
- Pieces are rendered from the single image with CSS (background-position), not as pre-cut files.

**Planned seasons**
- Phase 5 prepares the **first full year**: Winter 2026/27 (Season 1), Spring 2027, Summer 2027 and Autumn 2027.
- Claude chooses the artworks, so they stay a surprise: they're not named in chat or in this spec, only in the season files and `CREDITS.md`.

**End of season:** its pieces leave the boxes. Missing pieces stay buyable with shards at past-season prices.

---

### 13.14 Data

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

### 13.15 Claude connector

Add a read-only MCP tool, `get_rewards(from, to)`. It returns:
- level, XP, coins and shards
- this week's earnings against the budget
- season progress per artwork
- inventory counts
- ledger events in the range

Claude can't buy, open, use or tick anything. Also add each habit's weight and value per tick to `list_habits`.

---

### 13.16 Tests

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

### 13.17 Build order

Stop after each step so I can test:

1. Weights, week snapshots, earning, ledger, XP and levels, milestones, header, habit values and multipliers in the UI, default tick animation
2. Shop and Inventory: real-life rewards (manage view, icon picker, price hint), freezes, vacation days, purchase undo, History
3. Season 1 (and the art for the rest of the first year), mystery boxes, box opening animation, lucky charm, coin pouch, shards, Gallery, `CREDITS.md`
4. Cosmetics: extra list colors, 4 tick animations, habit icon picker (30 free + 30 to unlock), Settings → Appearance and Gamification
5. `get_rewards` MCP tool and the `list_habits` additions, README update, balance simulation report

---

### 13.18 Phase 5 decisions

- **Time zone:** "Europe/Prague" in §13 means the `TIMEZONE` setting, so other deployments work too.
- **Snapshots** are created lazily on the first request of a week (missing weeks are filled in too). No cron job.
- **Settings → Gamification:** a budget change applies from the next snapshot; prices change immediately.
- **"This week"** in the header counts coins by the week the tick or weekly task belongs to.
- **Habit value shown:** what the next tick would pay, plus the multiplier, e.g. "+430 · ×1.3".
- **Over target:** the cap counts ticks already paid in the period, so unticking and ticking another day can't pay past the target.
- **Streak milestones** are checked only when a tick extends a streak, never on an untick. Back-filling a gap only pays thresholds that neither joined part had reached.
- **Day off:** ticking a weekdays habit on a day that isn't scheduled earns no coins (its weekly value is spread over its scheduled days only).
- **Trying it out early:** an optional `REWARDS_START` variable (e.g. in a local `wrangler.jsonc`) overrides `GAMIFICATION_START`, for testing before the real start date.
- **Weekly task completed:** the coins are added to the existing completion toast, e.g. "Completed · +500".
- **Cosmetics icon:** palette (§14 rules out sparkle icons).
- **Lucky charm:** only one can be active at a time.
- **Purchase undo:** the toast shows for 5 seconds; the server accepts the refund for about 30 seconds.
- **Wallet** is derived from the ledger (the sum of its rows), not stored separately. Spends are ledger rows too, inserted only if the sum covers the price, in one D1 batch with the inventory change; each request carries an ID that becomes part of the ledger key, so a double tap can't buy twice.
- **Extra list colors** (cosmetics, after the base 12 in the picker): Sand `#C9B98A`, Pear `#B8C27A`, Sage `#93BC8F`, Seafoam `#6FB7A8`, Sky `#7FB4CF`, Cornflower `#9AA6D8`, Lilac `#C6A0DA`, Pink `#D490B8`, Peach `#E2A48C`, Ochre `#C49A62`, Stone `#B9AFA4`, Lichen `#8FA7A0`. All pass AA as text on `--bg` and `--surface`.
- **Step 2 (Shop and Inventory):**
  - The Habits tab's sub-screens live at `/habits`, `/habits/shop` (with `/habits/shop/rewards` for "Manage rewards") and `/habits/inventory`. The Gallery tab is added in step 3, with boxes; until then boxes are counted in the Inventory but can't be opened yet.
  - Freezes: arming on the missed day itself still counts (armed by the period's end). Several armed freezes on one habit are used oldest first. "Take back" un-arms a freeze. A frozen week or month shows its ice icon on its last day in the month grid.
  - Vacation days lower what a per_week / per_month streak needs, not what can be earned: the over-target cap stays the full target. Past vacation days disappear from the Inventory (they are spent); only today's and planned ones show, and only future ones can be cancelled.
  - Real-life rewards cost 1–1,000,000 coins, are reordered with up/down buttons, and are archived (and restored) from their edit form.
  - History lists the last 1,000 ledger rows, newest first; tick income is summed per day.

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
`#E8925A` `#A8B55E` `#7FA36B` `#4FB077` `#5FA39A` `#6A9FB5` `#7B8FC9` `#9A82C2` `#B77CD0` `#B87AA6` `#C98A8A` `#A08C76`

Red (`#D9675A`) and amber (`#D9B25A`) are deliberately **not** list colors: they mean overdue / missed plan and high / medium priority. (Lists that used them were migrated to orchid `#B77CD0` and emerald `#4FB077`.)
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
