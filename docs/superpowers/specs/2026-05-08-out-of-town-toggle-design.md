# Out of Town toggle (silent emergency block)

**Status:** Design approved 2026-05-08
**Owner:** Christian Traxler
**Affects:** admin settings schema, availability API, ticket API, admin account UI, new-ticket form

## Goal

When the admin is traveling, hide the Emergency Fix option from clients so no one can file an after-hours emergency. The toggle is **silent** — clients see their portal as normal (no "out of office" banner, no status change, nothing in the network response that reveals the admin is away). The admin flips one switch labeled "Out of town" on the account page.

## Non-goals

- Scheduling. The toggle is manual on/off — same as how OOO works today, minus the public banner. No date pickers.
- Replacing or merging with the existing public OOO toggle. The two are independent.
- Special handling of in-flight tickets. Already-filed emergencies are unaffected.
- Notifying the admin when a client *wanted* to file an emergency. Out of scope.

## Existing infrastructure (reused, not reinvented)

| Existing thing | How we use it |
|---|---|
| `AdminSettings` Prisma model (singleton `id="global"`) — already holds `timezone`, `hours`, `oooEnabled`, `holidays`, `emergencyFeeCents` | Add one column: `outOfTown Boolean @default(false)`. |
| `lib/availability.ts` — pure module with `isAfterHours(settings, now)` | No change. The new flag is composed at the API boundary, not inside the pure module. |
| `GET /api/availability` route — returns `{ state, label, detail, isAfterHours, emergencyFeeCents, ... }` | Replace the client-facing `isAfterHours` field with `emergencyAvailable: boolean = isAfterHours && !outOfTown`. The raw `outOfTown` value is never sent to clients. |
| `PATCH /api/admin/settings` route — validates and persists existing fields, broadcasts `settings-changed` | Add validation + persistence for `outOfTown`. Existing broadcast already triggers a portal refetch. |
| `POST /api/portal/tickets` route — already independently re-checks `isAfterHours` server-side and silently downgrades emergency to normal when the client lies | Extend the same downgrade rule: also downgrade when `outOfTown` is true. |
| `app/admin/account/account-form.tsx` — admin UI for hours, OOO, holidays, emergency fee | Add a new "Out of Town" section with one toggle and helper copy. |
| `components/NewTicketPage.tsx` — already polls `/api/availability` and shows the Emergency button when `isAfterHours` | Rename the relevant prop/state from `isAfterHours` → `emergencyAvailable`. The auto-clear effect (un-checks emergency state when the flag flips false) keeps working untouched. |
| `requireAdmin()` admin guard, supabase realtime `settings-changed` broadcast | Used as-is. |

## Decisions

| Topic | Decision |
|---|---|
| Internal field name | `outOfTown` — matches the user-facing label. Future-me reads the code and immediately understands the intent. |
| User-facing label | "Out of town" toggle in admin settings. No public-facing label of any kind on the client portal. |
| Privacy | The `outOfTown` boolean **never** appears in any API response a client can see. Server coalesces it into `emergencyAvailable` so a tech-savvy client inspecting the network tab sees nothing unusual. |
| Public availability status | Unchanged. Clients still see "Online" / "Available" / "Offline — back Mon 9 AM" exactly as before. The toggle does not change `state` or `label` returned by `/api/availability`. |
| Relation to OOO | Independent. OOO stays as the public "I am away" signal. Out-of-town is the silent "block emergencies" signal. The four combinations (neither, OOO only, out-of-town only, both) are all valid. |
| Server enforcement | `POST /api/portal/tickets` silently downgrades `isEmergency: true` to `false` when `outOfTown` is on. **No 4xx error** — that would also leak the state. Ticket files normally with no fee. |
| Scheduling | None. Manual on/off only. The user said "toggle button"; matching that. |
| Default | `false` — existing installs behave identically to today. |

## Architecture

Four things change. All extend existing modules; nothing genuinely new.

1. **`AdminSettings` schema** — add `outOfTown Boolean @default(false)`. Single Prisma migration.
2. **`GET /api/availability`** — replace top-level `isAfterHours` with `emergencyAvailable = isAfterHours(settings, now) && !settings.outOfTown`.
3. **`POST /api/portal/tickets`** — extend the existing emergency-downgrade rule to also check `!settings.outOfTown`.
4. **`PATCH /api/admin/settings`** — accept and validate `outOfTown: boolean`.
5. **`app/admin/account/account-form.tsx`** — new "Out of Town" section with one toggle, helper copy, and a Save button (or auto-save on flip — see UX below). Standard `saveOutOfTown()` PATCH + toast pattern.
6. **`components/NewTicketPage.tsx`** — rename `initialIsAfterHours` → `initialEmergencyAvailable` and the corresponding state. Refetch effect maps `data.emergencyAvailable`. Auto-clear effect already keys off the flag — keeps working.
7. **Server caller of NewTicketPage** (`app/portal/.../new` page) — server-side, computes `emergencyAvailable = isAfterHours(settings, now) && !settings.outOfTown` and passes as the initial prop. Same composition rule as the API; consider extracting a shared 1-liner if duplication is ugly.

## Data model

```prisma
model AdminSettings {
  // ...existing fields...
  outOfTown  Boolean  @default(false)
}
```

Migration: `prisma migrate dev --name add_out_of_town`. Single additive nullable-with-default column on a single-row table — safe on prod with no downtime.

## API shapes

**`GET /api/availability` response (changed):**

Before:
```json
{ "state": "offline", "label": "Offline", "isAfterHours": true, "emergencyFeeCents": 5000, ... }
```

After:
```json
{ "state": "offline", "label": "Offline", "emergencyAvailable": true, "emergencyFeeCents": 5000, ... }
```

`isAfterHours` is removed from the response. `NewTicketPage` is the only consumer. The semantic change ("after hours" vs "emergency available") is the whole point.

**`PATCH /api/admin/settings` request (extended):**

Add optional `outOfTown?: boolean` to the existing body schema. Validate `typeof === "boolean"`. Persist via `data.outOfTown = body.outOfTown`. Same broadcast as other fields.

**`POST /api/portal/tickets` (server-side rule extended):**

```ts
const finalIsEmergency =
  payload.isEmergency === true &&
  serverIsAfterHours &&
  !settings.outOfTown;
```

Everything else identical.

## UX

**Admin account page** — new section between "Out of Office" and "Holidays":

```
§ OUT OF TOWN ───────────────────────────────────────────

[ Toggle ]  Out of town is OFF / ON

When on, clients won't see the Emergency Fix option after
hours. Their portal looks normal — no indication you're away.
Use this when traveling.

                                                [ Save ]
```

Visual style matches the existing OOO and Hours sections (signal-red § marker, mono uppercase tracking, parchment background).

**Client portal** — no UI change of any kind. Status pill, business hours pill, ticket form layout, all identical to today. The Emergency Fix button simply does not render after hours when the toggle is on.

## Edge cases

1. **Client has the new-ticket modal open when admin flips toggle.** `settings-changed` broadcast → portal refetches `/api/availability` → `emergencyAvailable` becomes false → existing auto-clear effect un-checks any pre-selected emergency state. Even if the client races and POSTs `isEmergency: true`, the server downgrades it. Safe both ways.
2. **Admin flips toggle off mid-night.** Button reappears within ~1s on connected portals via the same broadcast.
3. **Out-of-town ON during business hours.** No-op for the client (button is hidden during business hours regardless). The toggle just continues to gate the after-hours window when it arrives.
4. **Out-of-town ON + OOO ON.** Public status shows "Out of office" (existing behavior). Emergencies blocked (new behavior). The two signals are orthogonal and behave like any other independent settings combination.
5. **Hostile client crafts a direct POST with `isEmergency: true`.** Server downgrades to false silently — no 4xx — so the response is indistinguishable from a successful normal filing. No state leak.
6. **Stale CDN cache.** `/api/availability` already sets `Cache-Control: no-store` for exactly this kind of toggle-flip responsiveness. No change needed.

## Verification

Manual, since the project hasn't adopted a runner yet:

- [ ] Toggle off, after hours: emergency button visible on portal, modal acknowledges fee, ticket persists `isEmergency=true` with fee snapshot.
- [ ] Toggle on, after hours: emergency button absent on portal. Direct POST with `isEmergency: true` files a normal ticket (`isEmergency=false`, no fee, no `[EMERGENCY]` email prefix).
- [ ] Toggle on, business hours: behavior unchanged from today (button absent regardless).
- [ ] Flip toggle while a portal client is connected: button appears/disappears within ~1s without a page refresh.
- [ ] `/api/availability` response inspected in network tab: no `outOfTown` field present in either toggle state. Only `emergencyAvailable` reflects the change.
- [ ] Admin "live preview" panel on account page: unchanged for out-of-town toggle (since public availability is unchanged). OOO preview behavior preserved.

## Open questions

None outstanding — design is implementable as written.
