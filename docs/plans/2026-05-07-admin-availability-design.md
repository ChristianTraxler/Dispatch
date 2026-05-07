# Admin Availability — Design Specification

**Date:** 2026-05-07
**Status:** Approved — ready for implementation
**Project:** Dispatch (support.developerofcode.com)
**Scope:** Admin Account page with business hours + out-of-office, customer-facing availability indicator in the chat surface.

---

## Goal

Give Christian a single place to manage when he's "available" to clients, and surface that state in the customer-facing chat so clients know whether to expect a quick reply, a delayed reply, or nothing until he's back.

Three jobs:

1. **Admin Account page** at `/admin/account` with two sections — Business Hours and Out of Office.
2. **Availability state** computed from (live presence) + (weekly schedule) + (OOO override).
3. **Customer-visible status line** under the chat header in the floating quick-chat launcher and the per-ticket chat page.

---

## Availability model

State is decided by this priority order, in `lib/availability.ts`:

1. `oooEnabled && (!oooUntil || now < oooUntil)` → **`ooo`**, detail = custom message or `"Out of office until {date}"`.
2. `adminOnline === true` (Supabase Realtime presence) → **`online`**, detail = `"usually replies in minutes"`.
3. `now` is within today's enabled window in business timezone → **`available`**, detail = `"usually replies within the hour"`.
4. Otherwise → **`offline`**, with `nextOpenAt` (ISO) computed by walking forward to the next enabled day's open time.

Auto-resume of OOO is computed, not scheduled. Step 1 short-circuits when `oooUntil` is in the past, so the next request stops showing OOO. A nightly cron clears the stale flag for cleanliness only.

---

## Data model

One singleton row in a new `AdminSettings` table:

```
AdminSettings
  id              String   @id   // always "global"
  timezone        String          // IANA, default "America/New_York"
  hours           Json            // { "0": { enabled:false }, "1": { enabled:true, open:"09:00", close:"17:00" }, ... }
  oooEnabled      Boolean  @default(false)
  oooUntil        DateTime?
  oooMessage      String?         // optional custom OOO text
  updatedAt       DateTime @updatedAt
```

`hours` is a JSON map keyed by weekday number (0=Sun … 6=Sat). Times are `"HH:mm"` strings interpreted in the saved timezone. JSON keeps the migration trivial and lets us extend per-day richness later (e.g., split shifts, holiday overrides) without another migration.

Seed defaults on first run: Mon–Fri 09:00–17:00, Sat/Sun disabled, OOO off.

---

## APIs

**`GET /api/availability`** — public, no auth.
Returns:

```ts
{
  state: "online" | "available" | "offline" | "ooo";
  label: string;          // "Online" | "Available" | "Offline" | "Out of office"
  detail: string;         // "usually replies in minutes" | "back at 9am Mon" | custom OOO msg
  nextOpenAt: string|null; // ISO timestamp; client localizes for display
}
```

`Cache-Control: public, max-age=30`. Polled every ~60s by open chat widgets as a safety net.

**`PATCH /api/admin/settings`** — admin-cookie-gated.
Accepts a partial payload (`hours`, `timezone`, `oooEnabled`, `oooUntil`, `oooMessage`). Server-side validation: each row's `close > open`, valid `"HH:mm"`, valid IANA zone, `oooUntil` in the future if set. After write, broadcasts a Supabase Realtime event on a global `admin-status` channel so any open chat widget updates instantly without polling.

---

## Admin Account page

**Route:** `/admin/account` — server component fetches `AdminSettings`; renders a client form. Linked from the masthead's top-right ("Account →" next to "Sign out →").

**Sections:**

1. **Live Preview pill** at the top — calls `computeAvailability` with current saved state so Christian sees exactly what the customer sees right now. Updates after each save.

2. **Business Hours** — 7 rows (Mon–Sun), each with a `role="switch"` toggle and two `<input type="time">` fields. Toggling a day off greys and disables its time inputs. Timezone selector at the top of the section. **Independent save button.**

3. **Out of Office** — large `role="switch"` toggle (signal-red when on), an optional `<input type="date">` for return date, an optional `<textarea>` for custom message. **Independent save button** so flipping OOO never accidentally rewrites your hours.

Save success uses the existing `Toast` component.

**Accessibility:** every toggle is a real `<button role="switch" aria-checked>`; time/date inputs have proper `<label>`s; the OOO section announces state changes with `aria-live="polite"`.

---

## Customer-facing surface

**New component:** `components/AdminAvailabilityLine.tsx` — small line of mono text under the chat header. Used in both the floating `QuickChatLauncher` and the per-ticket chat page.

```tsx
<div className="flex items-center gap-2 px-3 py-1.5 border-b border-rule-soft">
  <PresenceDot status={dotStatus} pulse={state === "online"} />
  <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
    {label} — {detail}
  </span>
</div>
```

State → dot color mapping: `online`→green, `available`→amber, `offline`→grey, `ooo`→signal-red.

**Data flow on the customer side:**

1. On widget open, fetch `/api/availability` → render initial state.
2. Subscribe to Supabase Realtime `admin-status` channel — any admin save broadcasts a fresh `Availability` payload, widget re-renders instantly.
3. Subscribe to existing admin presence channel — when admin's `online` flag flips, recompute locally (settings already in memory; no extra fetch).
4. `setInterval(60_000)` recomputes from cached settings so the line updates if the day's open/close window crosses while the widget is open.

**"Back at" localization:** `nextOpenAt` is an ISO timestamp. Client renders with `new Date(nextOpenAt).toLocaleString(undefined, { weekday:"short", hour:"numeric", minute:"2-digit" })` so a customer in LA sees their own clock.

---

## Files touched (~8)

- `prisma/schema.prisma` — new `AdminSettings` model + migration.
- `lib/availability.ts` — new, pure `computeAvailability` function.
- `app/api/availability/route.ts` — new, GET.
- `app/api/admin/settings/route.ts` — new, PATCH (admin-gated).
- `app/admin/account/page.tsx` + `account-form.tsx` — new.
- `components/AdminAvailabilityLine.tsx` — new.
- `components/AdminShell.tsx` / `Masthead.tsx` — add "Account →" link top-right.
- `app/portal/(authed)/quick-chat-launcher.tsx` + the per-ticket chat page — mount the line.

---

## Out of scope (YAGNI)

Easy to add later if needed:

- Holiday / exception dates.
- Multiple time windows per day (split shifts).
- Per-client custom hours.
- "Notify me when he's back" email/SMS for offline customers.
- Per-day timezone (single business timezone is enough).
