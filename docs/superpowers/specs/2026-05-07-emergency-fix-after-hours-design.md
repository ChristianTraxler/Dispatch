# Emergency Fix (after-hours filing)

**Status:** Design approved 2026-05-07 (revised after codebase audit)
**Owner:** Christian Traxler
**Affects:** new-ticket form, ticket API, ticket schema, email templates, existing admin settings infra

## Goal

Let clients filing a ticket outside business hours opt into an "Emergency Fix" — they acknowledge a $50 fee, the ticket is flagged emergency, and the admin email is prefixed `[EMERGENCY]` so it's obvious it needs immediate attention. During business hours the option is invisible.

## Non-goals

- Charging the fee. Billing is manual and out of scope. The fee amount is captured on the ticket so it can be billed later.
- A test framework. The codebase already has `lib/availability.test-helpers.ts` but no runner; we'll keep manual verification for new code unless the existing helpers fit naturally.
- Holiday auto-import. Holidays are a manually edited list in the admin UI.

## Existing infrastructure (reused, not reinvented)

| Existing thing | How we use it |
|---|---|
| `AdminSettings` Prisma model (singleton `id="global"`) — has `timezone`, per-day `hours` JSON (`WeeklyHours`), and `oooEnabled` / `oooFrom` / `oooUntil` / `oooMessage` | Add two columns: `holidays String[]` and `emergencyFeeCents Int @default(5000)`. |
| `lib/availability.ts` — pure timezone-aware module with `computeAvailability(settings, adminOnline, now)` and a private `isWithinHours` | Add a new exported `isAfterHours(settings, now)` function. Extend `isWithinHours` (or its inputs) to also short-circuit on holidays. |
| `GET /api/availability` route — returns `{ state, label, detail, nextOpenAt, settings }` | Extend response with `isAfterHours: boolean` and `emergencyFeeCents: number`. The new-ticket form polls this. |
| `GET /PATCH /api/admin/settings` route — already validates timezone + hours + OOO fields, broadcasts on save | Add validation for the two new fields. |
| `app/admin/account/page.tsx` + `account-form.tsx` — existing admin UI for these settings | Add Holidays editor and Emergency Fee field to the same page. No new route. |
| `requireAdmin()` admin guard, `Intl.DateTimeFormat` zoned-parts logic, supabase realtime broadcast | Used as-is. |

## Decisions

| Topic | Decision |
|---|---|
| Business hours config | Existing per-day `WeeklyHours` JSON (each weekday has `enabled` + optional `open`/`close` HH:MM) — already supports Mon–Fri 09:00–17:00 default. |
| Holidays | New column `holidays String[]` on `AdminSettings`. List of `YYYY-MM-DD` strings. A holiday is a 24-hour after-hours block in the configured timezone. |
| Relation to existing "Urgent — site is down" category | Kept separate. "Urgent" stays a free same-day flag. "Emergency Fix" is the paid after-hours add-on; categories and emergency are independent. |
| Fee tracking | Persisted on the ticket: `isEmergency Boolean` and `emergencyFeeAmountCents Int?`. The fee is a snapshot — changing the setting later does not retroactively change old tickets. |
| Email signal | Subject gets `[EMERGENCY]` prefix in front of the existing `[CATEGORY]` prefix. Body gets a red banner above the existing layout. |
| Button placement | Above the `File dispatch →` submit button. Visible only when after hours. |
| After-hours rule | `today is in holidays` OR `not within today's configured hours` (in the admin's timezone). **OOO does not count as after-hours** — OOO is for short absences (appointments) where filing should still be a normal ticket. |
| Timezone | Uses existing `AdminSettings.timezone`. |
| Trust model | Server independently re-checks after-hours on submit. If the client claims emergency but the server says business hours, the server silently forces `isEmergency=false`. Never reject the filing for this reason. |

## Architecture

Six things change. Five extend existing modules; one is genuinely new (the modal component).

1. **`AdminSettings` schema** — add `holidays String[]` and `emergencyFeeCents Int @default(5000)`. Single Prisma migration.
2. **`lib/availability.ts`** — add `holidays` to `AdminSettingsInput`, teach `isWithinHours` to skip holiday days, export a new `isAfterHours(settings, now)` function. (No OOO logic in `isAfterHours` — by design.)
3. **`GET /api/availability`** — include `holidays` in serialized settings; include `emergencyFeeCents` and `isAfterHours: boolean` at top level of response.
4. **`PATCH /api/admin/settings`** — accept and validate `holidays` (array of `YYYY-MM-DD`) and `emergencyFeeCents` (int ≥ 0).
5. **`app/admin/account/account-form.tsx`** — add a Holidays list editor (date inputs + add/remove) and an Emergency Fee dollar input. Round-trips through cents.
6. **`Ticket` schema + form + ticket API + emails** — add `isEmergency` / `emergencyFeeAmountCents` columns; new `EmergencyFixModal` component; new-ticket form polls `/api/availability`, shows the button when `isAfterHours`; POST persists; email template branches on `isEmergency`.

### Component boundaries

- `lib/availability.ts` stays pure (no I/O, no `Date.now()` baked in). One source of truth for the after-hours rule.
- `AdminSettings` access continues to use `prisma.adminSettings` directly — no new wrapper module.
- `EmergencyFixModal` is a new file in `components/`. The new-ticket form composes it.

## Data model

### `AdminSettings` additions

```prisma
model AdminSettings {
  // ... existing fields ...
  holidays           String[] @default([])
  emergencyFeeCents  Int      @default(5000) @map("emergency_fee_cents")
}
```

`holidays` is a Postgres `text[]` of `YYYY-MM-DD` strings. Empty default means no holidays. The format matches what's natural to read out of `<input type="date">`.

### `Ticket` additions

```prisma
model Ticket {
  // ... existing fields ...
  isEmergency             Boolean @default(false) @map("is_emergency")
  emergencyFeeAmountCents Int?    @map("emergency_fee_amount_cents")
}
```

`emergencyFeeAmountCents` is nullable so non-emergency tickets simply have no fee value. It's a snapshot at creation time of `AdminSettings.emergencyFeeCents`.

### Migration

Single Prisma migration: add the two columns to `admin_settings` and the two columns to `tickets`. All four columns default-safe so the migration is non-blocking.

## `lib/availability.ts` changes

Add `holidays` to `AdminSettingsInput`:

```ts
export interface AdminSettingsInput {
  timezone: string;
  hours: WeeklyHours;
  oooEnabled: boolean;
  oooFrom: Date | null;
  oooUntil: Date | null;
  oooMessage: string | null;
  holidays: string[]; // new — YYYY-MM-DD list
}
```

Modify `isWithinHours` to take the full settings (or a subset) so it can check holidays. Today's `YYYY-MM-DD` in the configured timezone is built from `getZonedParts(now, tz)`. If that string is in `holidays`, return `false`.

Add a new exported function:

```ts
/**
 * Returns true if `now` is outside the admin's scheduled business hours,
 * in the admin's timezone. Holidays count as after-hours. OOO does NOT count
 * as after-hours (OOO is for short absences; emergency is for clock-based
 * outside-of-hours).
 */
export function isAfterHours(settings: AdminSettingsInput, now: Date): boolean {
  return !isWithinHours(settings, now);
}
```

(`computeAvailability` keeps OOO short-circuiting at the top — that's an availability concept, not an emergency-eligibility concept.)

`computeAvailability` is unaffected by holidays — but when it falls through to `isWithinHours`, holidays now correctly classify the day as offline. That's a free, correct, behavioral improvement to availability.

## Form behavior

### Server (`app/portal/(authed)/ticket/new/page.tsx`)

No new server work needed — the client fetches `/api/availability` on mount. (We could SSR the initial flag for snappier rendering; not required for v1, optional optimization.)

### Client (`components/NewTicketPage.tsx`)

New props (passed in by the existing `NewTicketClient` wrapper):

```ts
interface NewTicketPageProps {
  // ... existing ...
  /** When true on first render, the Emergency button is visible immediately. */
  initialIsAfterHours?: boolean;
  /** Fee in cents; passed to the modal copy. */
  emergencyFeeCents?: number;
}
```

State:

- `isAfterHours: boolean` — initialized from `initialIsAfterHours` (or `false`).
- `feeCents: number` — initialized from `emergencyFeeCents` (or `5000` default).
- `isEmergency: boolean` — initialized to `false`.
- `modalOpen: boolean`.

A `useEffect` polls `GET /api/availability` on mount and every 60 seconds. Updates `isAfterHours` and `feeCents` from the response. Cleared on unmount.

Another `useEffect` watches `isAfterHours`: if it flips to `false` while `isEmergency === true` (rare — they sat through 9am Monday or a holiday ended), set `isEmergency = false` and show a one-shot inline notice above the submit row: *"Business hours resumed — emergency fee removed."* Notice is dismissible and disappears on next form interaction.

The Emergency button is rendered only when `isAfterHours === true`. It sits in its own row immediately above the actions row:

- When `isEmergency === false`: red-outlined button labeled `Emergency Fix — outside business hours ($XX fee)`. Clicking opens the modal.
- When `isEmergency === true`: a confirmation strip showing `Filing with $XX emergency fee` and an `[undo]` link that flips `isEmergency` back to `false`.

The submit button label changes when `isEmergency === true`: `File emergency dispatch →` (red variant of `btn-dispatch`). Otherwise `File dispatch →` as today.

### `EmergencyFixModal`

New component at `components/EmergencyFixModal.tsx`. Props:

```ts
interface EmergencyFixModalProps {
  open: boolean;
  feeCents: number;
  onConfirm: () => void;
  onCancel: () => void;
}
```

Behavior:

- Modal rendered via a portal into `document.body`. Backdrop dims the page; clicking backdrop = cancel.
- Headline: **Emergency fix — outside business hours**
- Body: *"It's currently outside business hours. Filing as Emergency means it gets worked on right away tonight, with a **${fee}** fee added to your next invoice. Otherwise, file a normal ticket and it'll be picked up next business day."*
- Required checkbox: *"I acknowledge the ${fee} emergency fee."*
- Two buttons: `Cancel` and `Confirm — file as emergency`. Confirm is disabled until the checkbox is checked.
- Keyboard: `Esc` cancels. `Enter` confirms only when the checkbox is checked. Focus is trapped inside the modal while open. Focus returns to the Emergency button on close.
- Accessibility: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the headline.

Modal does not need to know the user's timezone or the schedule — just the fee. The "outside business hours" language is correct because the modal only shows after the parent has determined `isAfterHours`.

## API

### `POST /api/portal/tickets` (modified)

Body adds one optional field:

```ts
{ siteId, title, description, category, attachments?, isEmergency?: boolean }
```

Server flow:

1. Existing validation.
2. Read `AdminSettings`. Build `AdminSettingsInput` (same shape `/api/availability` already builds, plus `holidays`).
3. `serverIsAfterHours = isAfterHours(settings, new Date())`.
4. `finalIsEmergency = (payload.isEmergency === true) && serverIsAfterHours`. If client claims emergency but server is in business hours, silently set `false` (no error).
5. If `finalIsEmergency`, set `emergencyFeeAmountCents = settings.emergencyFeeCents`.
6. Create ticket with `isEmergency: finalIsEmergency` and `emergencyFeeAmountCents`.
7. `sendNewTicketEmail` is called with `isEmergency` and (when emergency) `emergencyFeeAmountCents` so the template can branch.

### `GET /api/availability` (modified)

Response shape (additions in **bold**):

```jsonc
{
  "state": "offline",
  "label": "Offline",
  "detail": "back Mon, 9:00 AM",
  "nextOpenAt": "2026-05-12T16:00:00.000Z",
  "settings": { "timezone": "...", "hours": { ... }, "oooEnabled": false, "oooFrom": null, "oooUntil": null, "oooMessage": null, "holidays": ["2026-12-25"] },
  // NEW:
  "isAfterHours": true,
  "emergencyFeeCents": 5000
}
```

Cache headers stay as today (`public, max-age=30, stale-while-revalidate=60`). The form's 60s poll interval pairs cleanly with the 30s cache.

### `PATCH /api/admin/settings` (modified)

Accept partial:

```ts
interface PatchBody {
  // ... existing ...
  holidays?: string[];
  emergencyFeeCents?: number;
}
```

Validation:

- `holidays`: array of strings. Each must match `^\d{4}-\d{2}-\d{2}$` AND parse to a real date (`new Date(s + "T00:00:00Z")` not NaN, and re-formatted equals the input — catches `2026-02-30`). De-duplicated and sorted server-side. Max length 100 (sane upper bound).
- `emergencyFeeCents`: integer ≥ 0, ≤ 1_000_000 ($10,000 cap — prevents a typo charging $50,000).

400 with `{ error }` on any failure. The realtime `settings-changed` broadcast continues to fire.

### `GET /api/admin/settings` (modified)

Add the two new fields to the response.

## Admin UI changes (`/admin/account`)

Extend `app/admin/account/account-form.tsx` to add two sections **below** the existing OOO controls. Match existing styling conventions (mono labels, `input-line` / similar).

### Holidays section

- Section header: **Holidays**
- Helper text: *"Days that count as outside business hours, in your timezone."*
- List of rows: each `<input type="date">` + a remove button.
- "Add holiday" button below the list.
- State held in the form as `string[]` of `YYYY-MM-DD`. Submit includes only valid, non-empty dates, sorted, de-duplicated.

### Emergency fee section

- Section header: **Emergency fee**
- Helper text: *"Charged when a client opts into Emergency Fix outside business hours."*
- A single `<input type="number" min="0" step="1">` in dollars (e.g. `50`), prefixed with `$`. Default `50`.
- On submit, multiply by 100 to get cents.

Existing **Save settings** button covers both. The PATCH body includes whichever fields changed.

## Email changes

In `lib/email-templates.ts → renderNewTicketEmail`:

- Add `isEmergency: boolean` and `emergencyFeeAmountCents?: number` to `NewTicketEmailParams`.
- Subject: when `isEmergency`, prefix with `[EMERGENCY] ` so the final subject is `[EMERGENCY] [CATEGORY] Title — Site`.
- HTML body: when `isEmergency`, render a red banner block above the existing `sectionLabel("NEW DISPATCH FILED")`. Banner copy: **⚠ EMERGENCY — Outside business hours. Client acknowledged $XX fee.** (XX from the snapshotted `emergencyFeeAmountCents`.)
- Plain-text body: prepend a line `*** EMERGENCY — outside business hours, $XX fee acknowledged ***` above the existing block.

In `lib/email.ts → sendNewTicketEmail`: thread the new params through.

In `app/api/portal/tickets/route.ts`: pass them when calling `sendNewTicketEmail`.

## Error handling

| Failure | Behavior |
|---|---|
| `AdminSettings` row missing | Existing fallback to `DEFAULT_HOURS` + sensible defaults applies. `holidays` defaults to `[]`, `emergencyFeeCents` to `5000`. |
| Invalid timezone in DB | `lib/availability.ts` already wraps `Intl.DateTimeFormat` access in try/catch; on failure the helper returns "available" for `computeAvailability` and the form will treat that as "no emergency button". Acceptable. |
| Invalid holiday string in DB | `isWithinHours` builds today's `YYYY-MM-DD` from zoned parts and checks `Array.includes`. A garbage string in `holidays` simply never matches. No-op, no crash. |
| Invalid time / fee / holiday in PATCH body | 400 with `{ error }`. No DB write. |
| Client clock drift past 5pm but server still business hours | Server silently sets `isEmergency=false`. Ticket files normally with no fee. |
| User leaves form open across 5pm | 60-second `/api/availability` poll reveals the Emergency button. |
| User leaves form open across Mon 9am with `isEmergency=true` | Poll clears `isEmergency`, shows "Business hours resumed — emergency fee removed." |
| Email send fails | Log and continue (existing behavior). Ticket still has `isEmergency` flag. |

## Manual test checklist

- [ ] During business hours: file a normal ticket. No Emergency button visible.
- [ ] Add today's date to Holidays in `/admin/account`, save, reload form mid-business-hours: Emergency button visible.
- [ ] After hours: button visible, modal opens, confirm disabled until checkbox checked, confirmed state shown above submit, undo reverts.
- [ ] After hours: file emergency ticket. DB row has `isEmergency=true` and `emergencyFeeAmountCents=5000`. Email subject begins `[EMERGENCY] [BUG]`. Email body has red banner and `$50` text.
- [ ] After hours: file *non*-emergency ticket. DB row has `isEmergency=false` and `emergencyFeeAmountCents=null`.
- [ ] Spoof client clock forward during real business hours, manually POST `isEmergency=true`. Server creates ticket with `isEmergency=false`, no fee. No error to client.
- [ ] Leave form open across 5pm boundary: button appears within ~60–90 seconds (poll + cache).
- [ ] Leave form open across 9am boundary while `isEmergency=true`: button disappears, fee state clears, notice shown.
- [ ] OOO toggle ON during business hours: Emergency button **does not** appear (OOO ≠ after-hours).
- [ ] Admin settings: edit fee from $50 to $75, save, file a new emergency ticket — `emergencyFeeAmountCents` is `7500`. Old emergency tickets still show `5000`.
- [ ] Admin settings: invalid holiday like `2026-02-30` → 400 error, no save.
- [ ] Admin settings: negative or non-integer fee → 400 error, no save.

## Out of scope (followups)

- Automatic billing / Stripe integration for the fee.
- Holiday auto-import (US federal, etc.).
- Per-client emergency-fee overrides.
- Test framework setup (Vitest etc.) — implementation will rely on manual checks.
- An admin dashboard view of emergency-fee revenue / outstanding.
- SSR-passing `initialIsAfterHours` to skip the first poll round-trip.
