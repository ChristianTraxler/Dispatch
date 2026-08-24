# Web Push Notifications — Design

**Date:** 2026-08-24
**Status:** approved, ready for implementation plan

## Problem

Ticket progress is currently invisible unless a client opens the portal or happens to
catch an email. Only one stage sends anything at all: `AWAITING_CONFIRMATION` triggers
`sendAwaitingConfirmationEmail`. The other transitions — Reviewing, Fixing — happen
silently, so a client who filed a ticket has no idea work has started until it is done.

The reverse direction has a gap too. Clients confirming a ticket closed produces **no
notification of any kind** — no email, nothing. The admin only finds out by looking.

Both parties already have the app installable to their home screen: `app/manifest.webmanifest`
declares `display: standalone` with a full icon set, wired up through `app/layout.tsx`.
What is missing is a service worker — the piece that lets the OS wake the app and
display a notification when it is closed.

## Goal

Deliver Web Push notifications to home-screen-installed devices for eight ticket
lifecycle events — four outbound to clients tracking their ticket's progress, four
inbound to the admin tracking client activity — using self-hosted VAPID with no
third-party push vendor.

Consolidate the notification fan-out for ticket events behind a single dispatcher so
that adding a channel later means editing one file rather than eight routes.

## Non-goals

- **Offline support / asset caching.** The service worker exists only to receive push
  events. No Serwist, no precaching, no offline shell.
- **Push for in-ticket messages to clients.** `sendNewMessageToClientEmail` stays
  email-only. Adding it later is a two-line change once the dispatcher exists.
- **Migrating non-ticket email sites.** `signup`, `add-ons/request`, and
  `invites/[token]/merge` keep their inline `ADMIN_EMAIL` blocks. They work, they are
  unrelated to ticket flow, and perturbing them buys this feature nothing.
- **Notification preferences beyond on/off.** No per-event toggles, no quiet hours,
  no digest batching in v1.
- **Replacing email.** Push is additive. iOS silently drops subscriptions when an app
  goes unopened for extended periods, so email remains the reliable channel.
- **Web Push on non-installed iOS Safari.** Not technically possible; out of scope.

## Architecture

```
                    ┌─────────────────────────────┐
   admin PATCH ────►│                             │
   portal confirm ─►│      lib/notify.ts          │──► lib/email.ts  (Resend)
   portal reopen ──►│   (one fn per EVENT,        │
   portal tickets ─►│    resolves recipients,     │──► lib/push.ts   (web-push/VAPID)
   portal messages ►│    fans out to channels)    │         │
                    └─────────────────────────────┘         │
                                                            ▼
                                              push_subscriptions (Prisma)
                                                            │
                                                            ▼
                                              browser push service (FCM/APNs/Mozilla)
                                                            │
                                                            ▼
                                                    public/sw.js
                                                  'push' → showNotification
                                            'notificationclick' → focus or deep-link
```

Every push send is fired inside `after()` so it never blocks the API response and can
never fail the originating request.

### Why key on `authUserId`, not `clientAccountId`

The admin is not a `ClientAccount`. `lib/auth/client-session.ts:25` identifies admins by
`user.app_metadata.role === "admin"` on the Supabase auth user — there is no
corresponding row in `client_accounts`. Keying subscriptions on `clientAccountId` would
therefore require a second table, or a nullable FK with a parallel admin path.

Keying on the Supabase auth user id stores both roles in one table with one code path.
`ClientAccount.authUserId` already exists, so resolving a ticket's client is
`ticket → clientAccount → authUserId`.

### Why an `isAdmin` column rather than an `ADMIN_AUTH_USER_ID` env var

"Send to the admin" needs to resolve which auth user is the admin. An env var would
work but is one more value to set correctly in two environments and keep in sync if
the admin account ever changes.

Stamping `isAdmin` onto the row at subscribe time — read from `isAdmin(user)`, the same
function the guards use — makes the table self-describing. `sendPushToAdmins()` becomes
a single indexed query, and it stays correct automatically.

## Data model change

One new model in `prisma/schema.prisma`:

```prisma
model PushSubscription {
  id         String    @id @default(cuid())
  authUserId String    @map("auth_user_id")
  isAdmin    Boolean   @default(false) @map("is_admin")
  endpoint   String    @unique @db.Text
  p256dh     String
  auth       String
  userAgent  String?   @map("user_agent")
  createdAt  DateTime  @default(now()) @map("created_at")
  lastUsedAt DateTime? @map("last_used_at")

  @@index([authUserId])
  @@index([isAdmin])
  @@map("push_subscriptions")
}
```

- **Additive migration.** New table only; no existing table is altered, no backfill.
- **`endpoint` is unique** — the browser's endpoint URL is the natural identity of a
  subscription, so re-subscribing on the same device upserts rather than duplicating.
- **One row per device.** A client with a phone and a laptop gets two rows and receives
  the notification on both. This is intended.
- **No FK to `ClientAccount`** — admin rows have no such parent. Orphan cleanup happens
  through endpoint pruning (below), not cascade.
- **`userAgent`** is stored for debugging only ("why is this person not getting pushes"),
  never used in logic.

⚠️ **This migration runs against production.** Per project setup, `DATABASE_URL` points
at the live Supabase instance; there is no separate local database. The change is purely
additive, but it is a real production schema change.

## Components

### `public/sw.js`

Plain JS service worker, served from the domain root so its scope covers `/`. Two handlers:

- **`push`** — parses the JSON payload, calls `showNotification` with title, body, icon
  (`/icon-192.png`), badge, and a `data.url` deep link.
- **`notificationclick`** — closes the notification, then scans `clients.matchAll()`. If a
  window for the app is already open it focuses and navigates that one; otherwise it
  opens `data.url` fresh. This avoids stacking duplicate tabs on repeated taps.

`proxy.ts` matches only `/portal/:path*`, so `/sw.js` is not intercepted and needs no
matcher change.

### `next.config.ts` headers

The config is currently empty. It gains a `headers()` block for `/sw.js` per the shipped
Next.js PWA guide (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`):

- `Content-Type: application/javascript; charset=utf-8`
- `Cache-Control: no-cache, no-store, must-revalidate` — so worker updates are never
  served stale
- `Content-Security-Policy: default-src 'self'; script-src 'self'`

### `/api/push/subscribe` — `POST` and `DELETE`

**API routes, not Server Actions.** The Next.js PWA guide demonstrates Server Actions,
but every mutation in this codebase is an API route under `app/api/`. House style wins.

- `POST` — reads the current auth user via `getCurrentAuthUser()`, upserts on `endpoint`,
  stamps `isAdmin` from `isAdmin(user)`. Returns 401 if unauthenticated.
- `DELETE` — removes the row matching the posted `endpoint`, scoped to the calling user
  so one account cannot delete another's subscription.

### `lib/push.ts`

```
sendPushToUser(authUserId, payload)   → all of that user's devices
sendPushToAdmins(payload)             → every row where isAdmin = true
```

Both load subscriptions, send via `web-push` with VAPID details, and settle all sends
in parallel. **Neither ever throws** — a failed push must not surface to the caller.

On a `404` or `410` from the push service, the endpoint is permanently dead (uninstalled
app, cleared browser, expired iOS subscription) and the row is deleted. This self-pruning
is what keeps the table from filling with garbage; browsers expire endpoints routinely.

Successful sends stamp `lastUsedAt`, giving a way to spot rotting subscriptions later.

### `lib/notify.ts` — the dispatcher

One exported function per **event**, not per channel. Each resolves its own recipients,
builds the copy, and fans out. `ADMIN_EMAIL` and the app URL are resolved once here
instead of being re-derived in every route.

| Function | Client push | Admin push | Email |
|---|---|---|---|
| `notifyTicketViewed` | ✓ | — | — |
| `notifyTicketReviewing` | ✓ | — | — |
| `notifyTicketFixing` | ✓ | — | — |
| `notifyTicketFixed` | ✓ | — | existing `sendAwaitingConfirmationEmail` |
| `notifyAdminNewTicket` | — | ✓ | existing `sendNewTicketEmail` |
| `notifyAdminNewMessage` | — | ✓ | existing `sendNewMessageToAdminEmail` |
| `notifyAdminTicketReopened` | — | ✓ | existing `sendTicketReopenedEmail` |
| `notifyAdminTicketClosed` | — | ✓ | none — push is the only signal |

Notification copy uses `ticketNumber(id, createdAt)` for the title and the existing
per-category stage wording from `components/StatusTimeline.tsx`
(`WORK_LABELS_BY_CATEGORY`), so a push for a `BUG` reads "Fixing Errors" while a
`QUESTION` reads "Drafting Answer" — matching what the client sees in the timeline.

## Wiring into existing routes

| File | Change |
|---|---|
| `app/api/admin/tickets/[id]/route.ts` | Replace the inline `sendAwaitingConfirmationEmail` block with a `STATUS_NOTIFIER` lookup (below). |
| `app/api/admin/tickets/[id]/mark-read/route.ts` | Set `firstViewedAt` (guarded, write-once) and call `notifyTicketViewed`. |
| `app/api/portal/tickets/[id]/confirm/route.ts` | Add `notifyAdminTicketClosed`. |
| `app/api/portal/tickets/[id]/reopen/route.ts` | Replace inline admin email with `notifyAdminTicketReopened`. |
| `app/api/portal/tickets/route.ts` | Replace inline admin email with `notifyAdminNewTicket`. |
| `app/api/portal/tickets/[id]/messages/route.ts` | Replace inline admin email with `notifyAdminNewMessage`. |

The three admin-driven status transitions stay as three separate named functions rather
than one `notifyTicketStatusChanged(status)` switch, so each owns its own copy. The PATCH
route selects between them with a lookup table mirroring the existing
`TIMESTAMP_FOR_STATUS` map directly above it in the same file:

```
const STATUS_NOTIFIER = {
  REVIEWING:             notifyTicketReviewing,
  FIXING:                notifyTicketFixing,
  AWAITING_CONFIRMATION: notifyTicketFixed,
} as const satisfies Record<string, (t: TicketWithRelations) => Promise<void>>
```

A status with no entry sends nothing, which keeps the route's behavior total without a
fallback branch.

### Fixing the dead `firstViewedAt` column

`firstViewedAt` exists in the schema and is rendered as stage 3 ("Viewed") by
`components/StatusTimeline.tsx`, but **nothing in the codebase has ever written it** —
grep finds only `receivedAt` being set, at ticket creation. The stage is permanently dark
for every ticket in production today.

`app/admin/ticket/[id]/admin-ticket-detail-client.tsx:70` already POSTs to the admin
`mark-read` route when the admin opens a ticket. That route becomes the write point,
using a guarded update so the timestamp is only ever set once:

```
updateMany({ where: { id, firstViewedAt: null }, data: { firstViewedAt: new Date() } })
```

The `count` from that call tells us whether this was the first view, and the push only
fires when it was — no notification on subsequent opens.

**Accepted nuance:** `app/admin/admin-quick-chat-launcher.tsx` also calls `mark-read`, so
reading a client's message in quick chat marks the ticket Viewed. This is deliberate —
the admin has genuinely seen it. Reviewed and accepted during design.

## Environment and keys

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=   # safe to expose; the browser needs it to subscribe
VAPID_PRIVATE_KEY=              # server only
VAPID_SUBJECT=                  # mailto: URL, required by the VAPID spec; use ADMIN_EMAIL's address
```

Generated once with `npx web-push generate-vapid-keys`. Set in `.env` locally and in
Vercel for Production and Preview.

⚠️ **The keypair is permanent.** Every stored subscription is cryptographically bound to
the public key it was created with. Rotating VAPID keys invalidates every existing
subscription and forces every user to re-subscribe. Generate once, back up the private
key, do not regenerate.

Note: `.env` in this project also holds the live database password and must not be read
into a chat transcript. Keys go in via redirected shell output or the Vercel dashboard.

## UI

**Portal** — a notifications toggle on the account page.
**Admin** — the same toggle in admin settings.

Both share one client component. The permission prompt fires from the toggle's click
handler, because a **user gesture is mandatory** — iOS grants `Notification.requestPermission()`
only in response to a real tap, and there is no programmatic path.

Three display states:

1. **Supported and installable** → live toggle reflecting current subscription state.
2. **iOS, not installed to home screen** → the toggle is replaced by Add-to-Home-Screen
   instructions (detected via `navigator.userAgent` for iOS plus
   `matchMedia('(display-mode: standalone)')`). A live toggle here would simply fail.
3. **Permission previously denied** → explanatory text pointing at OS settings. Once
   denied, the browser will not re-prompt; the app cannot recover this on its own.

## Error handling

- Every push send runs inside `after()` — a push failure can never fail a ticket update.
- `lib/push.ts` never throws; it logs and returns.
- `404`/`410` responses delete the dead subscription row.
- A user with zero subscriptions is a no-op, not an error.
- Email sends keep their existing individual `try/catch` semantics, now centralized in
  the dispatcher rather than repeated per route.

## Testing

This project has **no test runner** — no `test` script in `package.json`, and the files
in `scripts/` (`test-availability.ts`, `test-vacation-helpers.ts`) are standalone
`tsx`-run scripts rather than a suite. This design follows that existing convention
rather than introducing a framework as a side effect of a notification feature.

- `scripts/test-push.ts`, in the established standalone style, sends a test notification
  to a given `authUserId` to verify the full path end-to-end.
- Manual device verification on a real iPhone (installed to home screen) and an Android
  device, covering: subscribe, receive while app closed, tap-to-deep-link, unsubscribe.
- Local push testing requires HTTPS: `next dev --experimental-https`. The current `dev`
  script is `next dev --webpack` and will need the flag added for this work.
- Pruning is verified by unsubscribing in browser settings, then confirming the next
  send deletes the row.

## Rollout

1. Migration first — additive, safe to deploy ahead of any feature code.
2. VAPID keys into Vercel before the UI ships, or the toggle will fail at runtime.
3. Feature is opt-in by nature: nobody receives a push until they tap the toggle, so
   there is no risk of an unexpected blast to existing clients on deploy.
