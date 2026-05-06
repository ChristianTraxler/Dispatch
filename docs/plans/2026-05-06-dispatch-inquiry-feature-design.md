# Dispatch — Inquiry feature design

**Date:** 2026-05-06
**Status:** Validated, ready for implementation plan
**Branch:** `client-portal`
**Prior context:** [memory/dispatch_inquiry_feature_handoff.md](../../../.claude/projects/-Users-christiantraxler-Desktop-Current-Projects-Dispatch/memory/dispatch_inquiry_feature_handoff.md)

## 1. Goals & scope

A lightweight chat channel inside the portal so clients can ask quick questions without filing a ticket. Either side can promote the conversation into a real, tracked ticket.

### In scope

- Floating "💬 Have a question?" launcher on every authed portal page (`/portal/dashboard`, `/portal/sites`, `/portal/account`, `/portal/ticket/[id]`).
- One ongoing inquiry per client at a time; first message creates it, subsequent messages append.
- "Promote to ticket" button (client side: in the launcher; admin side: on the inquiry detail page).
- "End chat" button on both sides + auto-archive after 7 days of no activity.
- Archived inquiries hidden from active list, viewable in history.
- New `/admin/inquiries` page (Active + Archived tabs); existing `/admin/tickets` filters inquiries out.
- Reuse `<ChatThread>` verbatim — realtime, typing, attachments, read receipts.
- Email behavior: zero per-message emails; one transcript email to both parties when the chat ends; one admin nudge if a client message has gone unanswered ≥ 1 hour.

### Out of scope

- Multiple concurrent inquiries per client (one active thread at a time).
- Anonymous/unauthed inquiries (would be a separate "public contact form" feature).
- SLA-style status pills, the 6-stage state machine, or status timeline on inquiries.
- Editable title/category at promotion time (auto-fill; matches current ticket model).
- Client-direction "waiting reply" nudge (symmetric to admin nudge — can layer on later if desired).

### Success criteria

A client can ask a question, get a reply, and have it either resolve as a chat or promote into a tracked ticket — all without leaving the portal.

## 2. Data model

One narrow migration on the existing `Ticket` model — no new tables. Inquiries are tickets with a flag.

```prisma
model Ticket {
  // ... existing fields ...

  isInquiry      Boolean   @default(false) @map("is_inquiry")
  inquiryEndedAt DateTime? @map("inquiry_ended_at")
  lastMessageAt  DateTime? @map("last_message_at")
  adminNudgedAt  DateTime? @map("admin_nudged_at")

  @@index([isInquiry, inquiryEndedAt])
  @@index([clientAccountId, isInquiry, inquiryEndedAt])
}
```

| Field | Purpose |
|---|---|
| `isInquiry` | Separates inquiry rows from ticket rows. Default `false` so existing rows stay tickets without backfill. Promotion = flip to `false`. |
| `inquiryEndedAt` | `null` = active; non-null = archived. Set on manual "End chat" or auto-archive. |
| `lastMessageAt` | Denormalized; updated on every message insert. Powers the auto-archive sweep and the inquiries list ordering. Avoids a `MAX(messages.created_at)` join. |
| `adminNudgedAt` | Tracks the last "waiting inquiry" nudge to admin. Cleared whenever admin sends a message (so a fresh client message later can re-trigger). |

Existing tickets are unaffected: every read query that should ignore inquiries gets one explicit `where: { isInquiry: false }` clause. No data migration.

Naming: keeping `Ticket` as the model name. Inquiries are just `Ticket` rows where `isInquiry=true`.

## 3. Backend API

### New endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/portal/inquiries` | Find-or-create active inquiry; returns `{ ticketId, messages }`. |
| `POST` | `/api/portal/tickets/[id]/end-inquiry` | Client closes chat → set `inquiryEndedAt = now`. |
| `POST` | `/api/portal/tickets/[id]/promote` | Client promotes → set `isInquiry = false`. |
| `POST` | `/api/admin/tickets/[id]/end-inquiry` | Admin closes chat. |
| `POST` | `/api/admin/tickets/[id]/promote` | Admin promotes. |
| `POST` | `/api/admin/cron/archive-inquiries` | Daily cron — auto-archive idle ≥ 7 days. |
| `POST` | `/api/admin/cron/nudge-waiting-inquiries` | 15-minute cron — admin nudge for ≥ 1 hour waits. |

### `POST /api/portal/inquiries` — idempotent find-or-create

1. Auth check → resolve `ClientAccount`.
2. Look up: `where: { clientAccountId, isInquiry: true, inquiryEndedAt: null }`.
3. If found → return it. If not → create with `isInquiry: true`, `category: "QUESTION"`, `title: "Quick question"`, `siteId: <client's first site>`.
4. Return `{ ticketId, messages }` so the launcher can hydrate `<ChatThread>`.

No email fires here — emails happen at end-of-chat (transcript) or after 1-hour wait (nudge). See §7.

### Promote / end-inquiry endpoints

Single `UPDATE` each. RLS:
- Client endpoints require `ticket.clientAccountId === caller.id` AND `ticket.isInquiry === true`.
- Admin endpoints require admin role.

End-inquiry sets `inquiryEndedAt = now` AND fires the transcript email to both parties. Promote flips `isInquiry` to false; the row joins the regular ticket flow via the realtime UPDATE event.

### Updates to existing queries

Every place that reads tickets adds `isInquiry: false`:
- `app/admin/tickets/page.tsx` — main queue.
- `app/admin/page.tsx` — Live Ledger `openCount` (and add a separate `inquiryCount` stat).
- `app/portal/(authed)/dashboard/page.tsx` — client's ticket list.

## 4. Client UI — the launcher

**File:** `components/QuickChatLauncher.tsx`. Mounted once in `app/portal/(authed)/layout.tsx`.

### Collapsed

56px round floating button, fixed bottom-right (24px from edges), z-indexed above page content. Signal-red border, parchment-warm fill, chat-bubble icon. Tooltip: "Have a question?".

### Expanded

~360px wide × ~480px tall panel anchored bottom-right.

- **Header bar** — "Quick chat" title, admin presence dot (`<PresenceDot>`), collapse button, kebab menu with "Promote to ticket", "End chat", and "View past chats".
- **Body** — `<ChatThread>` rendered with the inquiry's `ticketId`. All existing realtime, typing, attachments, read receipts work unchanged.
- **Footer banner** (only when no messages yet) — "This is a quick chat. If it turns into something we need to track, either of us can promote it to a ticket."

### On first open

Fire `POST /api/portal/inquiries` (idempotent find-or-create). Hydrate `<ChatThread>`. The empty inquiry exists in the DB the moment the panel opens — fine, since no email fires until end-of-chat.

### Promote flow

Kebab → "Promote to ticket" → confirm modal ("This will turn this chat into a tracked ticket. You'll be able to follow its progress on your dashboard.") → POST → success state with link to `/portal/ticket/[id]`. Launcher resets; next open creates a fresh inquiry.

### End chat flow

Kebab → "End chat" → confirm ("End this chat? Your history stays viewable.") → POST → panel collapses. Transcript email sent to both parties (see §7).

### View past chats

Kebab → "View past chats" → modal listing the client's archived inquiries. Click one to view its `<ChatThread>` in read-only mode in the panel.

## 5. Admin UI

### New page: `/admin/inquiries`

`app/admin/inquiries/page.tsx`. Same row pattern as `/admin/tickets`. Two tabs: **Active** (`inquiryEndedAt IS NULL`, default) and **Archived** (`inquiryEndedAt IS NOT NULL`). Ordered by `lastMessageAt DESC`.

Per row: client name, last message preview, last activity timestamp, message count, presence dot. Click → `/admin/ticket/[id]`.

Live updates via `useRealtimeRefresh` on the `tickets` table (matches `/admin/invites` and `/admin/tickets`).

### Sidebar nav

Add "Inquiries" between "Tickets" and "Clients" in `AdminShell`, with a small badge showing active count.

### Inquiry detail at `/admin/ticket/[id]`

The same page handles tickets and inquiries — branch on `ticket.isInquiry`. When `true`:

- Header pill changes from status badge to a **"Inquiry"** label (parchment-tan with red border).
- Status changer hidden.
- 6-stage status timeline hidden.
- Two new buttons above `<ChatThread>`: **"Promote to ticket"** (primary) and **"End chat"** (secondary).
- Promote confirm modal: "Promote this inquiry to a tracked ticket? It'll appear in the main tickets queue and start the standard status flow." → POST → page re-renders as a normal ticket (status = NEW, timeline appears, status changer enabled).
- End-chat confirm modal: "End this chat? It'll move to the archived list." → POST → redirect to `/admin/inquiries`.

### Toast in `useTicketsFeed`

Branch on `payload.new.is_inquiry`:
- `true` → "💬 New inquiry from {name}" linking to `/admin/ticket/[id]`.
- `false` → existing "🎫 New ticket" toast.

Also handle UPDATE events for `is_inquiry: true → false` (promotion) → fire a "Inquiry promoted to ticket" toast.

## 6. Lifecycle

### States

- **Active** — `isInquiry=true`, `inquiryEndedAt=null`. Visible in launcher and `/admin/inquiries` Active.
- **Archived** — `isInquiry=true`, `inquiryEndedAt IS NOT NULL`. Hidden from launcher default view (accessible via "View past chats"); in `/admin/inquiries` Archived.
- **Promoted** — `isInquiry=false`. Lives in regular tickets system; status starts at `NEW`, follows existing 6-stage flow.

### Transitions

| From | Trigger | To |
|---|---|---|
| (none) | Launcher opened, no active inquiry | Active (created) |
| Active | Either side clicks "End chat" | Archived (manual) — fires transcript email |
| Active | Cron sweep, ≥ 7 days since `lastMessageAt` | Archived (auto) — fires transcript email |
| Active | Either side clicks "Promote to ticket" | Promoted |
| Archived | Client opens launcher | New Active inquiry created (does NOT reactivate old one) |
| Promoted | — | Terminal; ticket follows normal status flow |

### Why "new inquiry, not reactivate" on archived → open

Keeps the model simple — one row = one conversation. Old conversations preserved in history; new question = new row. Avoids "how recent is recent enough?" UX decisions.

### Edge cases

- **Race: client and admin both promote simultaneously** — Both endpoints `UPDATE ... WHERE isInquiry=true`. Second is a no-op (zero rows updated); endpoint returns success either way (idempotent).
- **Race: end-chat + new message arriving same second** — Message-insert handler checks `inquiryEndedAt`; if set, rejects with "this chat has ended". Launcher shifts to ended state; client can start a new inquiry.
- **Promoting an already-archived inquiry** — Allowed. Sets `isInquiry=false` and clears `inquiryEndedAt`. Useful if admin reads the archive and decides "this needs tracking."
- **Auto-archive uses `lastMessageAt`, not `updatedAt`** — A stray admin viewing a row doesn't reset the clock. Only actual messages count.

## 7. Email & realtime behavior

### Email — two new templates

1. **`sendInquiryTranscriptEmail(to, params)`** — fires once when the chat ends (manual "End chat" by either side, OR 7-day auto-archive). Both admin and client receive it.
   - Subject: `Inquiry transcript — {clientName} — {endDate}`
   - Body header: who ended it ("Ended by Christian", "Ended by {clientName}", or "Auto-archived after 7 days of inactivity")
   - Started / ended timestamps
   - Full message history: sender name, timestamp, body, attachment links
   - Footer: "Want to follow up? Start a new chat from the portal" (client) / link to `/admin/ticket/[id]` (admin)

2. **`sendWaitingInquiryEmail(to, params)`** — admin-only nudge. Fires when:
   - Inquiry is active (`isInquiry=true`, `inquiryEndedAt IS NULL`)
   - Most recent message is from CLIENT
   - That message is ≥ 1 hour old
   - `adminNudgedAt IS NULL` (haven't already nudged for this waiting state)

   Subject: `You have a waiting inquiry from {clientName}`. Body: snippet of latest client message + link to `/admin/ticket/[id]`.

   `adminNudgedAt` is set to `now` after sending; cleared every time admin sends a message (so a fresh client message later re-triggers).

### Existing ticket emails

Once an inquiry is promoted, it's a regular ticket and `sendNewMessageToAdminEmail` / `sendNewMessageToClientEmail` flows take over. No change.

### Realtime

- `<ChatThread>` already subscribes to `messages:ticket_id=eq.{id}` — works for inquiries unchanged.
- `useTicketsFeed` (admin's global toast hook) branches on `payload.new.is_inquiry` for INSERT toast copy, and on UPDATE events to detect `is_inquiry: true → false` (promotion).
- `/admin/inquiries` uses `useRealtimeRefresh` on `tickets` — covers all create/update/archive transitions.
- Presence (`use-presence`) is global, no changes needed.

### Cron jobs

| Path | Frequency | Purpose |
|---|---|---|
| `/api/admin/cron/archive-inquiries` | Daily | Archive idle ≥ 7 days; fires transcript email |
| `/api/admin/cron/nudge-waiting-inquiries` | Every 15 min | Send admin nudge for client messages ≥ 1 hour old |

Both secured by `x-cron-secret` header matching `process.env.CRON_SECRET`. Configured in the appropriate Next.js cron file (this repo's Next version may differ — check `node_modules/next/dist/docs/` before writing the config; per `AGENTS.md`).

## Files touched (summary)

### New

- `prisma/migrations/<timestamp>_inquiry_fields/` — three columns + two indexes.
- `components/QuickChatLauncher.tsx`
- `app/admin/inquiries/page.tsx`
- `app/api/portal/inquiries/route.ts`
- `app/api/portal/tickets/[id]/end-inquiry/route.ts`
- `app/api/portal/tickets/[id]/promote/route.ts`
- `app/api/admin/tickets/[id]/end-inquiry/route.ts`
- `app/api/admin/tickets/[id]/promote/route.ts`
- `app/api/admin/cron/archive-inquiries/route.ts`
- `app/api/admin/cron/nudge-waiting-inquiries/route.ts`
- Email templates for transcript + waiting-inquiry in `lib/email-templates.ts`; sender wrappers in `lib/email.ts`.

### Modified

- `prisma/schema.prisma` — three columns + two indexes on `Ticket`.
- `app/portal/(authed)/layout.tsx` — mount `<QuickChatLauncher>`.
- `app/admin/tickets/page.tsx` — add `isInquiry: false`.
- `app/admin/page.tsx` — Live Ledger filters; add `inquiryCount` stat.
- `app/portal/(authed)/dashboard/page.tsx` — add `isInquiry: false`.
- `app/admin/ticket/[id]/...` — branch on `isInquiry` for inquiry UI.
- `components/AdminShell.tsx` — add "Inquiries" nav item with active-count badge.
- `lib/realtime/use-tickets-feed.ts` — branch on `is_inquiry` for toast copy; handle UPDATE events for promotion.
- Message-create handler — update `lastMessageAt`; clear `adminNudgedAt` on admin message; reject messages on archived inquiries.

### Configuration

- Cron config (per Next docs in `node_modules/next/dist/docs/`).
- New env var: `CRON_SECRET`.

## Open questions / deferrable

- **Client-direction "waiting reply" nudge** — symmetric to admin nudge if admin replies and client doesn't see it. Not in v1; layer on if needed.
- **Editable inquiry title at promotion time** — currently inquiries promote with title "Quick question". A "name this ticket" step at promotion could improve admin queue readability. Not in v1 (matches current ticket UX where titles aren't editable post-create).
