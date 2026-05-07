# Emergency Fix (after-hours filing)

**Status:** Design approved 2026-05-07
**Owner:** Christian Traxler
**Affects:** new-ticket form, ticket API, ticket schema, email templates, new admin settings page

## Goal

Let clients filing a ticket outside business hours opt into an "Emergency Fix" — they acknowledge a $50 fee, the ticket is flagged emergency, and the admin email is prefixed `[EMERGENCY]` so it's obvious it needs immediate attention. During business hours the option is invisible.

## Non-goals

- Charging the fee. Billing is manual and out of scope. The fee amount is captured on the ticket so it can be billed later.
- A test framework. This codebase has none today; adding one is a separate decision. Manual test checklist below.
- Holiday auto-import (e.g. federal holidays). Holidays are a manually edited list in admin settings.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Business hours | Mon–Fri 09:00–17:00, editable from a new admin settings page (DB-backed). |
| Relation to existing "Urgent — site is down" category | Kept separate. "Urgent" stays a free same-day flag. "Emergency Fix" is the paid after-hours add-on; categories and emergency are independent. |
| Fee tracking | Persisted on the ticket: `isEmergency Boolean` and `emergencyFeeAmountCents Int?`. The fee is a snapshot — changing the setting later does not retroactively change old tickets. |
| Email signal | Subject gets `[EMERGENCY]` prefix in front of the existing `[CATEGORY]` prefix. Body gets a red banner above the existing layout. |
| Button placement | Above the `File dispatch →` submit button. Visible only when after hours. |
| After-hours rule | Outside business days/hours OR on a holiday-list date = after hours. |
| Timezone | The admin's timezone, stored in admin settings. Default `America/Los_Angeles`. |
| Trust model | Server independently re-checks after-hours on submit. If the client claims emergency but the server says business hours, the server silently forces `isEmergency=false`. Never reject the filing for this reason. |

## Architecture

Five things change:

1. **`AppSettings` model** — singleton DB row holding business-hours config + emergency fee. Lazy-created with defaults on first read.
2. **`lib/business-hours.ts`** — pure helper module. One source of truth for the after-hours rule, used by both the server and the client form.
3. **Admin settings page** — new route `/admin/settings` with a small form to edit the singleton. New API: `GET` and `PATCH /api/admin/settings`.
4. **`Ticket` model** — two new fields: `isEmergency` and `emergencyFeeAmountCents`.
5. **New ticket form + API** — form receives settings + initial after-hours flag, shows the emergency button when applicable, runs the confirmation modal, sends `isEmergency` on POST. API re-validates and persists.

### Component boundaries

- `lib/business-hours.ts` is pure (no DB, no `Date.now()` baked in — takes `now` and `settings` as args). This makes it testable later and lets both server and client call the exact same logic.
- `AppSettings` access goes through a tiny `lib/app-settings.ts` module with `getAppSettings()` (lazy-create) and `updateAppSettings(partial)`. No other code touches the table directly.
- The modal is a separate component (`EmergencyFixModal`) inside `components/`. The new-ticket form composes it.

## Data model

### New table

```prisma
model AppSettings {
  id                       String   @id @default("singleton")
  timezone                 String   @default("America/Los_Angeles")
  businessDays             Int[]    @default([1, 2, 3, 4, 5]) // 0 = Sunday … 6 = Saturday
  businessHoursStart       String   @default("09:00") // HH:MM, 24h
  businessHoursEnd         String   @default("17:00") // HH:MM, 24h
  holidays                 String[] @default([])      // YYYY-MM-DD list
  emergencyFeeCents        Int      @default(5000)
  updatedAt                DateTime @updatedAt @map("updated_at")

  @@map("app_settings")
}
```

The `id` defaults to the literal string `"singleton"`. The app never creates a second row; `getAppSettings()` always queries by `id = "singleton"` and creates it on miss.

### Ticket additions

```prisma
model Ticket {
  // ... existing fields ...
  isEmergency             Boolean @default(false) @map("is_emergency")
  emergencyFeeAmountCents Int?    @map("emergency_fee_amount_cents")
}
```

`emergencyFeeAmountCents` is nullable so non-emergency tickets simply have no fee value. It's a snapshot at creation time of `AppSettings.emergencyFeeCents`.

### Migration

Single Prisma migration: create `app_settings` table, add the two columns to `tickets`. Both columns default-safe so the migration is non-blocking on the existing tickets table.

## `lib/business-hours.ts`

Single exported function:

```ts
export interface BusinessHoursSettings {
  timezone: string;
  businessDays: number[];     // 0–6, Sunday=0
  businessHoursStart: string; // "HH:MM"
  businessHoursEnd: string;   // "HH:MM"
  holidays: string[];         // YYYY-MM-DD strings
}

export function isAfterHours(now: Date, settings: BusinessHoursSettings): boolean;
```

Implementation outline:

1. Use `Intl.DateTimeFormat(settings.timezone, { ... })` to extract `weekday`, `year`, `month`, `day`, `hour`, `minute` from `now` in the configured timezone.
2. Compose the `YYYY-MM-DD` string in that timezone; if it's in `settings.holidays` → after hours.
3. If the weekday number is not in `settings.businessDays` → after hours.
4. Convert `HH:MM` start/end to minutes-of-day; convert `now`'s `hour:minute` (in the tz) to minutes-of-day. After hours iff `mins < startMins || mins >= endMins` (5pm exactly is after hours; 9am exactly is business hours).
5. On any `Intl` exception (bad timezone), log and fall back to `America/Los_Angeles`.

No external date library. `Intl` is sufficient and is available in both Node 20 (the Vercel runtime) and modern browsers.

## Form behavior

### Server (`app/portal/(authed)/ticket/new/page.tsx`)

1. Fetch `AppSettings` via `getAppSettings()`.
2. Compute `initialIsAfterHours = isAfterHours(new Date(), settings)`.
3. Pass `{ businessHoursSettings: { ... }, emergencyFeeCents, initialIsAfterHours }` as additional props to `<NewTicketClient />`.

### Client (`components/NewTicketPage.tsx`)

New props:

```ts
interface NewTicketPageProps {
  // ... existing ...
  businessHoursSettings: BusinessHoursSettings;
  emergencyFeeCents: number;
  initialIsAfterHours: boolean;
}
```

New state:

- `isAfterHours: boolean` — initialized from `initialIsAfterHours`.
- `isEmergency: boolean` — initialized to `false`.
- `modalOpen: boolean` — controls the confirmation modal.

A `useEffect` registers a `setInterval(..., 60_000)` that calls `isAfterHours(new Date(), businessHoursSettings)` and updates state. Cleared on unmount.

Another `useEffect` watches `isAfterHours`: if it flips to `false` while `isEmergency === true`, set `isEmergency = false` and show a one-shot inline notice above the submit row: *"Business hours resumed — emergency fee removed."* (Notice is dismissible and disappears on next form interaction.)

The Emergency button is rendered only when `isAfterHours === true`. It sits in its own row immediately above the actions row:

- When `isEmergency === false`: red-outlined button labeled `Emergency Fix — outside business hours ($50 fee)`. Clicking opens the modal.
- When `isEmergency === true`: a confirmation strip showing `Filing with $50 emergency fee` and an `[undo]` link that flips `isEmergency` back to `false`.

The submit button label changes when `isEmergency === true`: `File emergency dispatch →` (red variant of `btn-dispatch`). Otherwise `File dispatch →` as today.

### `EmergencyFixModal`

New component. Props:

```ts
interface EmergencyFixModalProps {
  open: boolean;
  feeCents: number;
  businessHoursLabel: string; // pre-formatted e.g. "Mon–Fri, 9am–5pm PT"
  onConfirm: () => void;
  onCancel: () => void;
}
```

Behavior:

- Modal rendered via a portal into `document.body`. Backdrop dims the page; clicking backdrop = cancel.
- Headline: **Emergency fix — outside business hours**
- Body: *"It's currently outside business hours ({businessHoursLabel}). Filing as Emergency means it gets worked on right away tonight, with a **${fee}** fee added to your next invoice. Otherwise, file a normal ticket and it'll be picked up next business day."*
- Required checkbox: *"I acknowledge the ${fee} emergency fee."*
- Two buttons: `Cancel` and `Confirm — file as emergency`. Confirm is disabled until the checkbox is checked.
- Keyboard: `Esc` cancels. `Enter` confirms only when the checkbox is checked. Focus is trapped inside the modal while open. Focus returns to the Emergency button on close.
- Accessibility: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the headline.

`businessHoursLabel` is formatted server-side from the settings (e.g. `Mon–Fri, 9am–5pm PT`) and passed in. Keeps the modal display-only.

## API

### `POST /api/portal/tickets` (modified)

Body adds one optional field:

```ts
{ siteId, title, description, category, attachments?, isEmergency?: boolean }
```

Server flow:

1. Existing validation.
2. Read `AppSettings`. Compute `serverIsAfterHours = isAfterHours(new Date(), settings)`.
3. `finalIsEmergency = (payload.isEmergency === true) && serverIsAfterHours`. If client claims emergency but server is in business hours, silently set `false` (no error).
4. If `finalIsEmergency`, set `emergencyFeeAmountCents = settings.emergencyFeeCents`.
5. Create ticket with `isEmergency: finalIsEmergency` and `emergencyFeeAmountCents`.
6. `sendNewTicketEmail` is called with `isEmergency: finalIsEmergency` so the template can branch.

### `GET /api/admin/settings` (new)

Returns the current `AppSettings` row (created with defaults on miss).

### `PATCH /api/admin/settings` (new)

Body accepts a partial of: `timezone`, `businessDays`, `businessHoursStart`, `businessHoursEnd`, `holidays`, `emergencyFeeCents`. Validation:

- `timezone`: must be a string that `Intl.DateTimeFormat` accepts (try/catch).
- `businessDays`: array of integers 0–6, no duplicates, length 0–7.
- `businessHoursStart` / `End`: regex `^([01]\d|2[0-3]):[0-5]\d$`. End must be strictly greater than start.
- `holidays`: array of strings matching `^\d{4}-\d{2}-\d{2}$` and parseable as a real date. De-duplicated server-side.
- `emergencyFeeCents`: integer ≥ 0.

Returns 400 with `{ error, field }` on any failure. On success returns the updated row.

Auth guard: same admin session check the rest of `/api/admin/*` uses.

## Admin settings page (`/admin/settings`)

Server component shell + client form. Matches existing admin styling (parchment background, serif headers, mono labels, `input-line` style).

Fields:

- **Timezone** — `<select>` of common US zones (`America/Los_Angeles`, `America/Denver`, `America/Chicago`, `America/New_York`) plus `Other (IANA name)` which reveals a free-text input.
- **Business days** — seven checkboxes (Sun … Sat).
- **Business hours** — two `<input type="time">` fields (start, end).
- **Holidays** — list editor: each row a `<input type="date">` + remove button, plus an "Add holiday" button below. Stored as `string[]` of `YYYY-MM-DD`.
- **Emergency fee** — `<input type="number">` in dollars (e.g. `50`). Converted to cents on save.

Single "Save settings" button at the bottom does `PATCH /api/admin/settings`. On success show a green "Saved" pill that fades out after a few seconds. On 400, render the error against the offending field.

## Email changes

In `lib/email-templates.ts → renderNewTicketEmail`:

- Add `isEmergency: boolean` to `NewTicketEmailParams`.
- Subject: when `isEmergency`, prefix with `[EMERGENCY] ` so the final subject is `[EMERGENCY] [CATEGORY] Title — Site`.
- HTML body: when `isEmergency`, render a red banner block above the existing `sectionLabel("NEW DISPATCH FILED")`. Banner copy: **⚠ EMERGENCY — Outside business hours. Client acknowledged $XX fee.** (XX from the snapshotted `emergencyFeeAmountCents`.)
- Plain-text body: prepend a line `*** EMERGENCY — outside business hours, $XX fee acknowledged ***` above the existing block.

In `lib/email.ts → sendNewTicketEmail`: thread the new `isEmergency` and `emergencyFeeAmountCents` params through.

In `app/api/portal/tickets/route.ts`: pass them when calling `sendNewTicketEmail`.

## Error handling

| Failure | Behavior |
|---|---|
| `AppSettings` row missing | `getAppSettings()` lazy-creates with defaults. |
| Invalid timezone in DB | `isAfterHours` falls back to `America/Los_Angeles`, logs warning. |
| Invalid time / fee / holiday in PATCH body | 400 with `{ error, field }`. No DB write. |
| Client clock drift past 5pm but server still business hours | Server silently sets `isEmergency=false`. Ticket files normally with no fee. |
| User leaves form open across 5pm | 60-second tick reveals the Emergency button. |
| User leaves form open across Mon 9am with `isEmergency=true` | Tick clears `isEmergency`, shows "Business hours resumed — emergency fee removed." |
| Email send fails | Log and continue (existing behavior). Ticket still has `isEmergency` flag. |
| Modal closed mid-submission | Not possible — submit fires from main form, not modal. Modal must close (confirm or cancel) before the Emergency state changes. |

## Manual test checklist

- [ ] During business hours: file a normal ticket. No Emergency button visible.
- [ ] During business hours, a holiday added today: Emergency button visible.
- [ ] After hours: button visible, modal opens, confirm disabled until checkbox checked, confirmed state shown above submit, undo reverts.
- [ ] After hours: file emergency ticket. DB row has `isEmergency=true` and `emergencyFeeAmountCents=5000`. Email subject begins `[EMERGENCY] [BUG]`. Email body has red banner and `$50` text.
- [ ] After hours: file *non*-emergency ticket. DB row has `isEmergency=false` and `emergencyFeeAmountCents=null`.
- [ ] Spoof client clock forward during real business hours, manually POST `isEmergency=true`. Server creates ticket with `isEmergency=false`, no fee. No error to client.
- [ ] Leave form open across 5pm boundary: button appears within 60 seconds.
- [ ] Leave form open across 9am boundary while `isEmergency=true`: button disappears, fee state clears, notice shown.
- [ ] Admin settings page: edit fee from $50 to $75, save, file a new emergency ticket — `emergencyFeeAmountCents` is `7500`. Old emergency tickets still show `5000`.
- [ ] Admin settings: invalid timezone string → field error shown, no save.
- [ ] Admin settings: end time before start → field error shown, no save.

## Out of scope (followups)

- Automatic billing / Stripe integration for the fee.
- Holiday auto-import (US federal, etc.).
- Per-client emergency-fee overrides.
- Test framework setup (Vitest etc.) — implementation will rely on manual checks.
- An admin dashboard view of emergency-fee revenue / outstanding.
