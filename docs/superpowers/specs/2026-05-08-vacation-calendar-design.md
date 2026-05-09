# Vacation Calendar — Design

**Date:** 2026-05-08
**Author:** Christian (with Claude)
**Branch context:** Extends the work on `feat/out-of-town`, which already ships a manual `outOfTown` boolean on `AdminSettings` and a toggle on `/admin/account`.

## Goal

Add a calendar-based vacation scheduler to the admin Account page. Christian picks a date range (and optional label), saves it, and on the start date the existing **Out-of-Town** toggle automatically flips on at admin-local midnight; the day after the last vacation day, it flips back off — without him having to do anything.

Multiple vacations can be queued at once.

## Non-goals

- This does **not** trigger OOO (out-of-office) — only `outOfTown`. OOO stays separately managed.
- No multi-admin support. The `AdminSettings` row is already a singleton; vacations are too.
- No backdating ("I forgot to set it before I left"). The manual toggle already handles that.
- No half-day or partial-day vacations. Whole calendar days only.

## Decisions locked in during brainstorming

| Decision | Choice |
|---|---|
| Number of scheduled vacations | Multiple, queued |
| What gets triggered | `outOfTown` only (not OOO) |
| Flip timing | Midnight in admin's timezone |
| Mechanism | Daily cron at 05:05 UTC |
| Manual override mid-vacation | Toggling Out-of-Town off deletes the active vacation row |
| Calendar UX | Inline two-month grid, click-and-drag range |
| Label per vacation | Yes, optional |

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│ /admin/account                                              │
│   └─ <AccountForm>                                          │
│        ├─ existing sections (hours, OOO, out-of-town, …)    │
│        └─ <VacationCalendar>  ← NEW                         │
│             ├─ inline 2-month grid (click range to select)  │
│             ├─ optional label input + "Add vacation"        │
│             └─ list of upcoming vacations + delete buttons  │
└─────────────────────────────────────────────────────────────┘
                       │
                       │ fetch
                       ▼
┌──────────────────────────────────────────────┐
│  /api/admin/vacations          (admin-gated) │
│    GET    → list                             │
│    POST   → create + maybe-flip-on           │
│  /api/admin/vacations/[id]                   │
│    DELETE → delete + maybe-flip-off          │
└──────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Postgres                                    │
│    vacations(id, label, start_date, end_date)│
│    admin_settings.out_of_town                │
└──────────────────────────────────────────────┘
                       ▲
                       │
┌──────────────────────────────────────────────┐
│  /api/admin/cron/process-vacations           │
│    runs 05:05 UTC daily (Vercel cron)        │
│    → flip on for vacations starting today    │
│    → flip off + delete for vacations ended   │
│    → broadcast `admin-status` on any change  │
└──────────────────────────────────────────────┘
                       │ Supabase Realtime broadcast
                       ▼
┌──────────────────────────────────────────────┐
│  Open client chat widgets                    │
│    `useAdminStatus` re-fetches /api/avail.   │
└──────────────────────────────────────────────┘
```

## Data model

New table:

```prisma
model Vacation {
  id        String   @id @default(cuid())
  label     String?
  startDate DateTime @db.Date  @map("start_date")
  endDate   DateTime @db.Date  @map("end_date")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([startDate, endDate])
  @@map("vacations")
}
```

**Why `@db.Date` and not `DateTime`:** vacations are calendar days in the admin's local timezone, not UTC instants. `Date` columns avoid "did this start 4 hours early because of TZ math?" bugs. Postgres stores them as plain `date` (no time, no zone).

**`endDate` is inclusive** — if Christian sets `endDate = 2026-06-22`, the 22nd is the last day of vacation, and the toggle flips off at 00:00 on the 23rd.

**No `outOfTown` flag on `Vacation`.** The vacation table is purely a *schedule*. The cron is what does the flipping. Storing flip state on the row would just add a sync hazard.

**No `userId`.** Single-admin assumption.

**Migration:** standard Prisma generated migration. Apply via `prisma migrate dev --create-only --name vacations` then commit.

## API surface

All endpoints are admin-gated via the existing `requireAdmin()` from `lib/auth/admin-guard.ts`.

### `GET /api/admin/vacations`

Returns vacations sorted by `startDate` ascending:

```json
[
  { "id": "ck...", "label": "Beach trip", "startDate": "2026-06-15", "endDate": "2026-06-22" },
  { "id": "ck...", "label": null,         "startDate": "2026-08-03", "endDate": "2026-08-10" }
]
```

Past vacations (where `endDate < today`) are not returned — the cron deletes them when they end. So the GET reflects "upcoming + active" only.

### `POST /api/admin/vacations`

Body: `{ label?: string, startDate: string, endDate: string }` (YYYY-MM-DD).

**Validation** (returns 400 with explanatory error string on any failure):

- `startDate` and `endDate` parse as valid YYYY-MM-DD.
- `startDate <= endDate`.
- `endDate >= today` (admin TZ) — no entirely-past vacations.
- No overlap with any existing vacation row.
- `label`, if present, ≤ 80 chars.

**Side effect**: if `startDate <= today <= endDate` (a vacation starting today or already mid-range), set `AdminSettings.outOfTown = true` in the same transaction and broadcast `admin-status` event `settings-changed` on the Supabase channel. So creating an already-active vacation flips the toggle without waiting for the next cron tick.

Response: the created Vacation row as JSON.

### `DELETE /api/admin/vacations/[id]`

**Side effect**: if the deleted vacation was currently active (today is within its range) **and no other vacation is currently active**, set `AdminSettings.outOfTown = false` in the same transaction and broadcast.

Response: `{ ok: true }`.

### Augmented `PATCH /api/admin/settings`

The existing settings PATCH gets one addition: when the body sets `outOfTown: false` and a vacation is currently active, **delete that active vacation row inside the same transaction**.

This implements "manual wins, deletes the active vacation" — flipping off mid-trip cleans up the schedule.

### `POST /api/admin/cron/process-vacations`

Auth: `Authorization: Bearer ${CRON_SECRET}` or `x-cron-secret: ${CRON_SECRET}` header (mirrors `app/api/admin/cron/remind-expiring-invites/route.ts`).

Algorithm:

1. Read `AdminSettings` (single row, id `"global"`). Compute today's calendar date in `settings.timezone`.
2. **Cleanup.** `vacations.findMany({ endDate: { lt: today } })` — vacations whose end day has passed. Delete them. Remember whether any were deleted (`endedSomething`).
3. **Active set.** `vacations.findMany({ startDate: { lte: today }, endDate: { gte: today } })` — vacations active right now.
4. **Decide flip:**
    - If `active.length > 0` AND `outOfTown === false` → set `outOfTown = true`, mark broadcast.
    - Else if `active.length === 0` AND `endedSomething` AND `outOfTown === true` → set `outOfTown = false`, mark broadcast.
    - Else → no change.
5. If broadcast was marked, broadcast `admin-status` event `settings-changed` (same pattern as `app/api/admin/settings/route.ts` — wait for `SUBSCRIBED` before sending).
6. Return JSON: `{ ended: [{id, label}], activeNow: [{id, label}], outOfTownNow: boolean, broadcasted: boolean }` for log inspection.

The handler is **idempotent**: running twice the same day leaves the DB in the same state the second time. (Step 2 finds nothing to delete on the second run; step 4 sees `outOfTown` already matches the active set.)

The handler **survives missed runs**: it doesn't depend on yesterday having executed. A vacation that started two days ago is still found by step 3 today, and step 4 catches up.

**Known semantic quirk** (acceptable for a single-admin personal tool): the cron will flip `outOfTown` off as the side effect of *any* ending vacation, even if the user had manually flipped `outOfTown` on for an unrelated reason while that vacation was scheduled. In practice this means: if you have a vacation queued and you also manually turn the toggle on for a different reason, when that vacation ends the toggle goes off too. If we ever need to distinguish manual vs. vacation-driven on-states, we'd add an `outOfTownSource` enum — flagged in the follow-ups, not implemented now.

`vercel.json` schedule: `"5 5 * * *"`.

**DST safety:** 05:05 UTC is 00:05 EST or 01:05 EDT. Both fall *after* admin-local midnight in `America/New_York`, so the start-trigger fires on the correct local day on both sides of every DST transition. (If `settings.timezone` is later changed to a Pacific timezone — UTC-7/-8 — 05:05 UTC becomes 21:05 / 22:05 PT, which is the *previous* local day. For now, this is acceptable: admin TZ defaults to ET and isn't expected to change. A note in the spec follow-ups mentions making the cron offset configurable if multi-TZ admins ever land.)

## UI

A new section on `/admin/account`, placed below the existing Out-of-Town toggle and above the Holidays section.

### Layout

Inline two-month calendar grid (current month + next month, side-by-side on desktop, stacked vertically below 600px width). Below the grid: optional label input and an "Add vacation" button. Below that: the list of upcoming vacations with delete affordances.

```
§ ─────────────────────────────── SCHEDULED VACATIONS ─

  ┌──────── May 2026 ─────────┬──── Jun 2026 ────────────┐
  │ S  M  T  W  T  F  S       │ S  M  T  W  T  F  S      │
  │            1  2  3        │  ·  1  2  3  4  5  6     │
  │ 4  5  6  7  8 [9] 10      │ 7  8  9 10 11 12 13      │
  │ … etc …                   │ … etc …                  │
  └───────────────────────────┴──────────────────────────┘
                                          ‹ prev   next ›

  Label (optional): [______________________]
                    [ Add vacation ]

  ─── upcoming ───────────────────────────────────────
  • Beach trip      Jun 15 – Jun 22, 2026     [delete]
  • (no label)      Aug  3 – Aug 10, 2026     [delete]
```

### Interaction

- **Click a day** → it becomes the start (highlighted with `signal-red` ring).
- **Hover other days after that** → range preview rendered with lower-opacity fill.
- **Click a second day** → range locks. Label input + "Add vacation" button activate. (If the second click is *before* the first, swap them.)
- **Click "Add vacation"** → POST → on success, list updates, range clears, toast.
- **Click a day inside an existing scheduled vacation** → no-op (those days render in a "scheduled" tint at lower opacity, not selectable).
- **Click a past day** → no-op (rendered muted).
- **`‹ prev` / `next ›`** → shifts the visible window by one month. Default: current + next month. No "today" jump button needed; clicking far into the future is rare.
- **Delete button on a list row** → confirm via toast/dialog, DELETE, list updates.

### Accessibility

- Each day cell is a `<button>` with `aria-label="Friday, May 9, 2026"`.
- Selected start day: `aria-pressed="true"`. In-range preview days: a separate `data-in-range` attribute styled visually but not announced (the start day is what matters).
- Past days and already-scheduled days: `aria-disabled="true"`, `tabindex="-1"`, no click handler.
- Arrow keys move focus across the grid (left/right one day, up/down one week). Enter selects the focused day. Escape clears an in-progress selection.
- The upcoming list uses semantic `<ul>` so screen readers can iterate.

### Visual styling

Match the existing admin page (Fraunces display, JetBrains Mono labels, parchment surfaces, signal-red accents). Specifically:

- Section header: `§` glyph + uppercase mono "Scheduled Vacations" in the same pattern as `Business Hours` and `Out of Office` sections.
- Day cells: parchment-warm background, ink text, signal-red for selected/in-range.
- Already-scheduled days: signal-red fill at ~30% opacity, ink-fade text, not interactive.
- List rows: parchment-warm bg with `border-rule` separators, `font-mono` dates, `font-display italic` labels.

## Components

### New files

| Path | Responsibility |
|---|---|
| `prisma/schema.prisma` (modified) | Add `Vacation` model. |
| `prisma/migrations/<ts>_vacations/migration.sql` | Generated. |
| `app/api/admin/vacations/route.ts` | GET (list) + POST (create). |
| `app/api/admin/vacations/[id]/route.ts` | DELETE. |
| `app/api/admin/cron/process-vacations/route.ts` | Daily cron handler. |
| `app/admin/account/vacation-calendar.tsx` | Client component — calendar grid + list. |
| `lib/vacation-helpers.ts` | Pure functions: `buildMonthGrid(year, month)`, `daysInRange(a, b)`, `isInAnyRange(day, ranges)`, `formatDateRange(a, b)`, `todayInTimezone(tz)`. |
| `lib/vacation-helpers.test-helpers.ts` | Hand-rolled test cases (matches the existing pattern in `lib/availability.test-helpers.ts`). |
| `scripts/test-vacation-helpers.ts` | Test runner: `npx tsx scripts/test-vacation-helpers.ts`. |

### Modified files

| Path | Change |
|---|---|
| `app/admin/account/page.tsx` | Server-side fetch of the upcoming vacation list; pass to `<AccountForm>`. |
| `app/admin/account/account-form.tsx` | Render `<VacationCalendar>` between Out-of-Town and Holidays sections; receive vacations prop. |
| `app/api/admin/settings/route.ts` | In PATCH handler, when `outOfTown: false` is set, delete any currently-active vacation. |
| `vercel.json` | Add `{ "path": "/api/admin/cron/process-vacations", "schedule": "5 5 * * *" }`. |

## Edge cases

1. **Timezone changes mid-vacation.** Vacations store calendar dates without timezone, so they don't shift. Jun 15 is still Jun 15 in whatever TZ is current. Correct behavior.

2. **Vacation entirely in the past.** Disallowed by validation (`endDate >= today`). The manual toggle covers retro cases.

3. **Deleting an active vacation.** Same logic as cron's end-trigger — flip off only if no other vacation is currently active.

4. **Two API requests for the same vacation creation race.** Postgres unique constraint can't help here (no natural unique key). Mitigation: the validation-then-insert happens inside a Prisma transaction; an overlap check on insert catches double-clicks. Worst case: two near-identical rows; user can delete the duplicate.

5. **Cron runs while admin is mid-form-edit on `/admin/account`.** The Supabase broadcast fires; the page is server-rendered so the next interaction triggers `router.refresh()` and the in-progress form state is preserved (existing pattern from the OOO and Out-of-Town toggles).

6. **Cron auth in dev / local testing.** Use `curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/admin/cron/process-vacations` — same as the other crons.

7. **Holiday vs Vacation.** Separate concepts. Holidays = recurring closed days that affect business-hours computation. Vacations = one-off ranges that flip `outOfTown`. Don't interact.

## Testing strategy

This project has no test runner. Mirroring the existing pattern from `lib/availability.test-helpers.ts`:

**Unit tests** (`scripts/test-vacation-helpers.ts`) cover the pure helpers:

- `buildMonthGrid` — March 2026 starts on Sunday, 31 days, ends on Tuesday → grid is 5 weeks × 7 cells with leading/trailing nulls or sibling-month days as configured.
- `daysInRange(2026-06-15, 2026-06-22)` returns 8 dates inclusive of both ends.
- `isInAnyRange` — day inside one of the existing ranges → true; day on boundary → true; day between ranges → false.
- `todayInTimezone("America/New_York")` correctly returns the local date when run at, e.g., 03:00 UTC (which is the previous day in ET).
- DST edge: `todayInTimezone` on the morning of the spring-forward Sunday returns the correct date.

**Smoke tests** (manual, on dev server):

- Schedule a vacation starting today → toast appears, list shows it, Out-of-Town toggle flips on (live preview reflects), open client tab updates.
- Schedule one starting tomorrow → list shows it, toggle stays in current state.
- Manually toggle Out-of-Town off while a vacation is active → vacation disappears from the list, toggle goes off, broadcast fires.
- Trigger the cron manually with the right `endDate` setup to simulate "yesterday's vacation ended" → toggle flips off, the row is deleted, broadcast fires.
- Try to schedule a vacation with `endDate < startDate` → 400 error toast.
- Try to schedule one overlapping an existing one → 400 error toast.
- Verify on mobile (≤600px) that the calendar stacks vertically and is fully usable with touch.

## Done criteria

- ✅ `prisma/schema.prisma` has `Vacation` model; migration applied locally.
- ✅ `npx tsx scripts/test-vacation-helpers.ts` → all green.
- ✅ `/admin/account` shows the new section; range can be picked, labeled, and saved.
- ✅ List of upcoming vacations renders and supports delete with confirm.
- ✅ Creating a vacation that includes today flips `outOfTown` immediately + broadcast.
- ✅ Manual `outOfTown` off mid-vacation deletes the active row + broadcast.
- ✅ `vercel.json` has the new cron entry.
- ✅ `POST /api/admin/cron/process-vacations` (with secret) flips correctly for start/end days and is idempotent.
- ✅ `npx tsc --noEmit` and `npm run lint` clean.
- ✅ Manual smoke tests above all pass.

## Spec follow-ups (not in scope)

- Configurable cron offset (multi-TZ admin support).
- Recurring vacations (annual leave that repeats every year).
- Ability to *edit* a vacation's dates without delete-and-recreate.
- "All-day vs. partial-day" vacation distinction.
- Visual indicator on the chat widget that says "On vacation until [date]" instead of just the existing Out-of-Town styling.
- `outOfTownSource` enum (`"manual" | "vacation"`) so the cron can distinguish user-driven on-states from vacation-driven on-states and avoid the "ending vacation flips off an unrelated manual on" quirk noted in the cron section.
