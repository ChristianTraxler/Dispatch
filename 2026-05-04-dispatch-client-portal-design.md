# Dispatch Client Portal — Design Specification

**Date:** 2026-05-04
**Status:** Approved — ready for implementation
**Project:** Dispatch (support.developerofcode.com)
**Scope:** v1 — full client portal layer with real-time chat, presence, and screenshot uploads

---

## Goal

Add a client portal layer to Dispatch so clients of Developer of Code can:

1. Sign up via invite link tied to specific website URL(s)
2. Submit support tickets bound only to their own websites
3. Track ticket status through a 6-stage progress visualization
4. Chat in real-time with the admin per ticket
5. See real-time presence indicators (who's online)
6. Confirm or reopen tickets when admin marks them fixed

All anonymous public flows are removed. Authentication is required for everything client-facing.

---

## Architecture summary

Dispatch v2 = Dispatch v1 + Supabase Auth (clients) + Supabase Realtime (chat + presence) + Supabase Storage (screenshots) + new Postgres tables + new routes.

**What stays:** Next.js 14 app router, Prisma ORM, custom cookie auth for admin, Resend for email, existing 1960s-newsroom design language (Fraunces / JetBrains Mono / parchment / signal-red), all of `/admin/*` aesthetic, the existing `Ticket` columns that aren't being replaced.

**What changes:** `Ticket` model loses anonymous identity fields and gains FKs to `ClientAccount` + `Site`. Status enum expands. New status timestamp columns. Public homepage and `/status` lookup are removed.

**What's added:** Supabase Auth as a parallel auth system for clients (admin auth stays cookie-based). Four new tables. RLS policies. Realtime subscriptions for chat. Realtime Presence for online/offline. Storage bucket for screenshots. New routes. New email templates.

---

## Coexisting auth systems

Admin and client use **separate auth systems**. This is intentional — admin is one person (Christian) with a high-trust password-protected session; clients are many people who need self-serve signup, password reset, and identity verification.

|  | Admin | Client |
|---|---|---|
| Provider | Custom cookie (existing Dispatch) | Supabase Auth |
| Storage | HTTP-only signed cookie | Supabase session cookie + JWT |
| Routes guarded | `/admin/*` | `/portal/*` |
| Identity used by | Server-side checks | RLS policies + server-side checks |

The two systems never overlap. A request to `/admin/*` checks the admin cookie. A request to `/portal/*` checks the Supabase session. APIs check whichever is appropriate.

For the admin to interact with Supabase Realtime (chat broadcasts, presence), the admin login endpoint additionally signs a Supabase-compatible JWT with `role: 'admin'` using the Supabase JWT secret. This JWT is set as a separate cookie and used only for Realtime channel auth — it never grants DB access (admin uses service role on the server).

---

## Data model

### New Prisma models

```prisma
model ClientAccount {
  id            String    @id @default(cuid())
  authUserId    String    @unique @map("auth_user_id")    // Links to auth.users in Supabase
  email         String    @unique
  name          String
  createdAt     DateTime  @default(now()) @map("created_at")

  sites         Site[]
  tickets       Ticket[]

  @@map("client_accounts")
}

model Site {
  id              String   @id @default(cuid())
  clientAccountId String   @map("client_account_id")
  url             String
  displayName     String   @map("display_name")
  addedAt         DateTime @default(now()) @map("added_at")

  clientAccount   ClientAccount @relation(fields: [clientAccountId], references: [id], onDelete: Cascade)
  tickets         Ticket[]

  @@unique([clientAccountId, url])
  @@map("sites")
}

model Invite {
  id                  String    @id @default(cuid())
  token               String    @unique
  email               String
  siteUrl             String    @map("site_url")
  siteDisplayName     String    @map("site_display_name")
  expiresAt           DateTime  @map("expires_at")
  redeemedAt          DateTime? @map("redeemed_at")
  redeemedByAccountId String?   @map("redeemed_by_account_id")
  createdAt           DateTime  @default(now()) @map("created_at")

  @@index([email])
  @@index([token])
  @@map("invites")
}

model Message {
  id          String        @id @default(cuid())
  ticketId    String        @map("ticket_id")
  senderType  SenderType    @map("sender_type")
  senderId    String        @map("sender_id")
  body        String        @db.Text
  attachments Json?
  readAt      DateTime?     @map("read_at")
  createdAt   DateTime      @default(now()) @map("created_at")

  ticket      Ticket        @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId, createdAt])
  @@map("messages")
}

enum SenderType {
  CLIENT
  ADMIN
}
```

### Modified Ticket model

```prisma
model Ticket {
  id                    String        @id @default(cuid())

  // REMOVED: name, email, websiteUrl (anonymous fields)
  // ADDED:
  clientAccountId       String        @map("client_account_id")
  siteId                String        @map("site_id")

  title                 String
  description           String        @db.Text
  category              TicketCategory
  status                TicketStatus  @default(NEW)
  attachments           Json?

  // 6-stage progress timestamps
  createdAt             DateTime      @default(now()) @map("created_at")
  receivedAt            DateTime?     @map("received_at")
  firstViewedAt         DateTime?     @map("first_viewed_at")
  reviewingStartedAt    DateTime?     @map("reviewing_started_at")
  fixingStartedAt       DateTime?     @map("fixing_started_at")
  fixedAt               DateTime?     @map("fixed_at")
  confirmedAt           DateTime?     @map("confirmed_at")
  reopenedAt            DateTime?     @map("reopened_at")

  clientAccount         ClientAccount @relation(fields: [clientAccountId], references: [id])
  site                  Site          @relation(fields: [siteId], references: [id])
  messages              Message[]

  @@index([clientAccountId])
  @@index([siteId])
  @@index([status])
  @@map("tickets")
}

enum TicketStatus {
  NEW
  REVIEWING
  FIXING
  AWAITING_CONFIRMATION
  CLOSED
  REOPENED
}
```

---

## RLS policies (Supabase)

Enabled on: `client_accounts`, `sites`, `tickets`, `messages`, `invites`. Service role (used by server-side admin code) bypasses all RLS automatically.

### `client_accounts`

```sql
ALTER TABLE client_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_read_own_account" ON client_accounts
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "client_update_own_account" ON client_accounts
  FOR UPDATE USING (auth_user_id = auth.uid());
```

### `sites`

```sql
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_read_own_sites" ON sites
  FOR SELECT USING (
    client_account_id IN (
      SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()
    )
  );
```

### `tickets`

```sql
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_read_own_tickets" ON tickets
  FOR SELECT USING (
    client_account_id IN (
      SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "client_create_own_tickets" ON tickets
  FOR INSERT WITH CHECK (
    client_account_id IN (
      SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "client_update_own_tickets" ON tickets
  FOR UPDATE USING (
    client_account_id IN (
      SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()
    )
  );
```

### `messages`

```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_read_own_messages" ON messages
  FOR SELECT USING (
    ticket_id IN (
      SELECT id FROM tickets WHERE client_account_id IN (
        SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "client_send_own_messages" ON messages
  FOR INSERT WITH CHECK (
    sender_type = 'CLIENT'
    AND ticket_id IN (
      SELECT id FROM tickets WHERE client_account_id IN (
        SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()
      )
    )
  );
```

### `invites`

```sql
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
-- No client-facing policies. All operations via service role.
```

---

## Real-time architecture

### Chat (per ticket)

Each ticket detail page subscribes to a Postgres-changes Realtime channel filtered by `ticket_id`:

```typescript
const channel = supabase
  .channel(`ticket-${ticketId}-messages`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `ticket_id=eq.${ticketId}`
  }, (payload) => {
    setMessages(prev => [...prev, payload.new])
  })
  .subscribe()
```

RLS enforces clients only receive INSERTs for their own tickets. The admin browser uses the admin-signed JWT (issued at admin login) to subscribe with admin claims that bypass the standard RLS path via a dedicated policy.

### Presence

A single global channel `clients-presence`. When a client logs in:

```typescript
const channel = supabase.channel('clients-presence', {
  config: { presence: { key: clientAccount.id } }
})

channel.subscribe(async (status) => {
  if (status === 'SUBSCRIBED') {
    await channel.track({
      account_id: clientAccount.id,
      name: clientAccount.name,
      email: clientAccount.email,
      online_at: new Date().toISOString()
    })
  }
})
```

The admin dashboard subscribes to the same channel and listens for presence events:

- `'sync'` — populates initial state on dashboard load
- `'join'` — fires toast: "Sarah at Renegade Wellness signed in"
- `'leave'` — fires toast: "Sarah signed off"

Multi-tab handling is automatic: Supabase Presence treats multiple connections from the same `presence.key` as one logical user. Auto-leave on connection drop is ~30 seconds.

The reciprocal also runs — clients on a ticket detail subscribe to a smaller `admin-presence` channel that the admin's browser tracks. This drives the green/red dot next to "Christian — Developer of Code" on the client view.

---

## The 6-stage progress bar

Driven by a mix of timestamps (auto) and status (manual):

| Stage | Filled when | Triggered by |
|---|---|---|
| Sent | `created_at` is set | Ticket insert (always) |
| Received | `received_at` is set | App-layer immediately on insert |
| Viewed | `first_viewed_at` is set | Admin opens ticket detail (first time) |
| Reviewing Errors | `reviewing_started_at` is set | Admin sets status → REVIEWING |
| Fixing Errors | `fixing_started_at` is set | Admin sets status → FIXING |
| Errors Fixed | `fixed_at` is set | Admin sets status → AWAITING_CONFIRMATION |

After AWAITING_CONFIRMATION, the client sees two actions:

- **Confirm Fixed** → `confirmed_at` set, status → `CLOSED`
- **Issue Persists** → `reopened_at` set, status → `REOPENED`. Admin must move it back to `FIXING` to clear the reopen flag and continue work.

Progress bar logic (illustrative):

```typescript
const stages = [
  { label: 'Sent', filled: !!ticket.createdAt },
  { label: 'Received', filled: !!ticket.receivedAt },
  { label: 'Viewed', filled: !!ticket.firstViewedAt },
  { label: 'Reviewing Errors', filled: !!ticket.reviewingStartedAt },
  { label: 'Fixing Errors', filled: !!ticket.fixingStartedAt },
  { label: 'Errors Fixed', filled: !!ticket.fixedAt }
]
```

The component renders horizontally on desktop, vertically on mobile. Filled stages use signal-red. The active (most recent) stage gets the sonar pulse treatment.

---

## Invite flow (detailed)

### Admin creates invite

1. Admin visits `/admin/invites/new`
2. Form: client name, client email, website URL, site display name (auto-suggested from URL hostname), optional note
3. Submit → `POST /api/admin/invites`
4. Server: generates 32-byte token (`crypto.randomBytes(32).toString('hex')`), inserts `Invite` row with `expiresAt = now() + 7 days`
5. Server: sends email via Resend with link `${APP_URL}/invite/${token}`
6. Admin sees the new invite in `/admin/invites` list with status `PENDING`

### Client redeems invite

Visiting `/invite/[token]` triggers a server-side fetch by token. Five cases:

| Case | Render |
|---|---|
| Not found / expired / redeemed | "This invite is no longer valid" page with contact link |
| Valid, no Supabase Auth user for email | Signup form (email locked, site URL shown read-only, password input) |
| Valid, existing user, no session | "Welcome back. Log in to add yoursite.com to your account" |
| Valid, existing user, session matches invite email | Confirm dialog: "Add yoursite.com to your account?" |
| Valid, session email ≠ invite email | "This invite isn't for the account you're logged into" + sign-out option |

### Signup case (new account)

1. Client submits password
2. Server uses Supabase Admin API: `supabase.auth.admin.createUser({ email, password, email_confirm: true })`
3. Server creates `ClientAccount` row with `authUserId = newUser.id`
4. Server creates `Site` row with `url = invite.siteUrl`
5. Server marks `Invite` as redeemed
6. Server signs the user in (Supabase session cookie set)
7. Redirect → `/portal/dashboard`

### Merge case (existing account)

1. Client logs in (or already is)
2. Server creates `Site` row attached to existing `ClientAccount`
3. Server marks `Invite` as redeemed
4. Redirect → `/portal/dashboard` with success toast: "yoursite.com added to your account"

---

## Routes (full map)

### Public (unauthenticated)

- `/` → redirect to `/portal`
- `/portal` — login page
- `/portal/forgot-password` — Supabase password reset request
- `/portal/reset-password` — password reset form (from email link)
- `/invite/[token]` — invite landing (handles all 5 cases)

### Client (authenticated, `/portal/*`)

- `/portal/dashboard` — ticket list with site filter chip + status filter
- `/portal/ticket/new` — submit form (site dropdown filtered to client's own sites)
- `/portal/ticket/[id]` — detail: status timeline, chat thread, attachments, confirm/reopen
- `/portal/sites` — list of their websites
- `/portal/account` — name + password change

### Admin (authenticated, `/admin/*` — existing cookie auth)

- `/admin` — login (existing)
- `/admin/dashboard` — ticket list (extend with client name + presence dot)
- `/admin/ticket/[id]` — extend with chat thread, client info card
- `/admin/clients` — list of `ClientAccount`s with sites + ticket counts
- `/admin/invites` — list of invites
- `/admin/invites/new` — create invite

### API

**Client portal (`/api/portal/*`):**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/portal/auth/signup` | Invite-token signup |
| POST | `/api/portal/auth/login` | Login |
| POST | `/api/portal/auth/logout` | Logout |
| POST | `/api/portal/auth/forgot-password` | Send reset email |
| POST | `/api/portal/auth/reset-password` | Submit new password |
| POST | `/api/portal/tickets` | Create ticket |
| GET | `/api/portal/tickets` | List own tickets |
| GET | `/api/portal/tickets/[id]` | Ticket detail |
| POST | `/api/portal/tickets/[id]/messages` | Send chat message |
| POST | `/api/portal/tickets/[id]/confirm` | Confirm fixed |
| POST | `/api/portal/tickets/[id]/reopen` | Issue persists |
| POST | `/api/portal/uploads` | Get signed upload URL |

**Admin (`/api/admin/*`, extending existing):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/clients` | List clients |
| POST | `/api/admin/invites` | Create invite |
| GET | `/api/admin/invites` | List invites |
| DELETE | `/api/admin/invites/[id]` | Revoke invite |
| POST | `/api/admin/tickets/[id]/messages` | Send chat message |
| PATCH | `/api/admin/tickets/[id]/status` | Change status (extend existing) |

### Removed

- `/` public submit form
- `/status` public lookup
- `POST /api/tickets` (anonymous submit)
- `POST /api/tickets/lookup`

---

## Email notifications

All sent via existing Resend integration. New templates added to `lib/email.ts`.

| Trigger | Recipient | Template |
|---|---|---|
| Invite created | Client | `inviteEmail` |
| Ticket submitted | Admin | `newTicketEmail` (extend existing) |
| Client sends message | Admin | `newMessageToAdminEmail` |
| Admin sends message | Client | `newMessageToClientEmail` |
| Status → AWAITING_CONFIRMATION | Client | `awaitingConfirmationEmail` |
| Client reopens ticket | Admin | `ticketReopenedEmail` |
| Password reset | Client | (Supabase Auth handles) |

Each email includes a deep link to the relevant page. Email is rate-limited per recipient per ticket — no more than one chat-related email every 60 seconds (debounce while a conversation is active).

---

## Screenshot uploads

**Storage:** Supabase Storage bucket `ticket-attachments`, private. Files organized as `tickets/{ticketId}/{messageId or 'initial'}/{filename}`.

**Access:** signed URLs only (1-hour expiry, refreshed on view).

**Upload flow:**

1. Client drags file into chat composer or new-ticket form
2. Client requests signed upload URL: `POST /api/portal/uploads { ticketId, filename, contentType }`
3. Server validates: client owns ticket, content type allowed, size < 10MB
4. Server returns signed upload URL
5. Client uploads directly to Supabase Storage (no proxy through Next.js)
6. Client includes resulting path in the message POST body as `attachments` JSON
7. Server stores attachments JSON on `Message` row

**Display:** images render inline as thumbnails in the chat thread; click → lightbox. Non-images render as filename + download link.

**Limits:**

- Max 10MB per file
- Max 5 files per message
- Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`

---

## UI continuity with existing Dispatch design

All new portal pages adopt the existing Dispatch language — no new aesthetic introduced.

- **Type:** Fraunces (display/headings), JetBrains Mono (data, IDs, timestamps)
- **Surfaces:** parchment bone, deep ink, no rounded SaaS cards
- **Accents:** signal-red (existing), now joined by **signal-green** for online presence (single new token)
- **Inputs:** underline-only (existing pattern)
- **Status pills:** monospaced, thick left bar (existing)
- **Borders:** hairline rules (existing)

### New components

- `<PresenceDot status="online | offline" pulse />` — sonar pulse for online, solid red for offline
- `<StatusTimeline ticket={...} />` — 6-stage horizontal/vertical (mobile) progress
- `<ChatThread ticketId={...} viewerType="client | admin" />` — message list + composer + Realtime sub
- `<AttachmentDropzone onAttach={...} maxFiles={5} maxSize={10_000_000} />` — image/pdf upload
- `<ToastContainer />` — admin-side toasts for sign-in/out events
- `<InviteRedemption invite={...} state={...} />` — handles all 5 invite cases

### Sonar pulse CSS

```css
.presence-dot {
  position: relative;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.presence-dot.online { background: var(--signal-green, #16a34a); }
.presence-dot.offline { background: var(--signal-red, #dc2626); }

.presence-dot.online::before,
.presence-dot.online::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--signal-green, #16a34a);
  animation: sonar 2s ease-out infinite;
}
.presence-dot.online::after { animation-delay: 1s; }

@keyframes sonar {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(3); opacity: 0; }
}
```

---

## What's removed from existing Dispatch

| File | Action |
|---|---|
| `app/page.tsx` | Replace with redirect to `/portal` |
| `app/status/page.tsx` | Delete |
| `components/TicketForm.tsx` | Delete (replaced by portal version) |
| `components/StatusLookup.tsx` | Delete |
| `app/api/tickets/route.ts` | Delete (anonymous POST handler) |
| `app/api/tickets/lookup/route.ts` | Delete |

The `<Header>` masthead component stays but updates copy to reflect the portal-first orientation.

---

## Open considerations (not blocking v1)

- **Multi-admin support** — currently one admin password. Defer until needed.
- **Ticket categories** — existing enum stays for v1; can be revisited.
- **Client-to-client messaging** — out of scope, never planned.
- **File scanning for malware on upload** — defer for v1; clients are vetted via invite.
- **Mobile native app** — defer; portal is mobile-responsive.
- **Audit log** — defer; status timestamps already give us a basic trail.

---

## Acceptance criteria

The feature is shippable when:

1. An admin can create an invite and the email arrives at the recipient
2. The invite link presents the correct form for all 5 cases (new email, existing email, etc.)
3. A signed-up client only sees their own sites in the new-ticket dropdown
4. A new ticket flows through all 6 progress stages correctly
5. Real-time chat messages appear within ~1 second on the other party's screen without a page refresh
6. Presence dot shows green with sonar pulse when the other party is logged in, red when offline
7. Admin gets a toast notification when any client signs in or out
8. Client can attach screenshots to a ticket on submit and to chat messages
9. Client can confirm "Fixed" or reopen, and admin sees the result immediately
10. All anonymous public flows are removed and `/` redirects to `/portal`
11. Email notifications fire on all defined triggers
12. RLS policies prevent cross-account data leaks (verified by manual tests)

---

## References

- Existing Dispatch repo structure: `support-dispatch/` (Next.js 14 + Prisma + Supabase + Resend)
- Existing aesthetic guide: defined in original Dispatch build (Fraunces / JetBrains Mono / parchment)
- Implementation plan: `docs/plans/2026-05-04-dispatch-client-portal-plan.md`
