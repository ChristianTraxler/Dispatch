# Dispatch Client Portal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full client portal layer to Dispatch with invite-based signup, real-time chat, presence indicators, screenshot uploads, and email notifications.

**Architecture:** Next.js 14 + Prisma + Postgres on Supabase. Add Supabase Auth for clients (admin auth stays cookie-based). Use Supabase Realtime for chat + presence and Supabase Storage for screenshots. Layer all this onto the existing Dispatch codebase without breaking the admin side.

**Tech Stack:** Next.js 14 (app router), TypeScript, Prisma, Supabase (Auth/Realtime/Storage), Resend, Tailwind, Fraunces + JetBrains Mono.

**Companion design doc:** `docs/plans/2026-05-04-dispatch-client-portal-design.md`

**Working dir:** existing `support-dispatch/` repo. Create a feature branch:

```bash
cd support-dispatch
git checkout -b client-portal
```

---

## Phase 0 — Project setup

### Task 0.1: Install Supabase client libraries

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install --save-dev @types/cookie
```

Commit: `chore: add supabase client libraries`

### Task 0.2: Configure Supabase Auth in dashboard

In Supabase project dashboard:

1. **Authentication → Providers** — enable Email provider, disable "Confirm email" (we'll bypass for invite flow)
2. **Authentication → URL Configuration** — set Site URL to `https://support.developerofcode.com` and add `http://localhost:3000` to Additional Redirect URLs
3. **Authentication → Email Templates** — customize the password reset template to match Dispatch tone (newsroom voice, signal-red accent)
4. **Storage** — create bucket `ticket-attachments` (private)
5. **Database → API** — copy the `service_role` key (server-only) and `anon` key (client-safe), and the JWT secret

No code change. No commit.

### Task 0.3: Update env vars

Add to `.env.example` and `.env`:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
SUPABASE_JWT_SECRET=your-jwt-secret-from-dashboard
SUPABASE_STORAGE_BUCKET=ticket-attachments
```

Update `next.config.js` to expose `NEXT_PUBLIC_*` vars (already handled by Next).

Commit: `chore: add supabase env vars`

### Task 0.4: Update CLAUDE.md

Append a section explaining the new architecture (separate client/admin auth, Supabase Realtime usage, RLS posture) so future agents have context.

Commit: `docs: document client portal architecture in CLAUDE.md`

---

## Phase 1 — Database schema

### Task 1.1: Add new Prisma models

Edit `prisma/schema.prisma` and add the four new models from the design doc: `ClientAccount`, `Site`, `Invite`, `Message`, plus the `SenderType` enum.

### Task 1.2: Modify the existing Ticket model

In `prisma/schema.prisma`:

- Remove fields: `name`, `email`, `websiteUrl` (or whatever the anonymous identity fields are named)
- Add fields: `clientAccountId`, `siteId`, `receivedAt`, `firstViewedAt`, `reviewingStartedAt`, `fixingStartedAt`, `fixedAt`, `confirmedAt`, `reopenedAt`
- Add relations to `ClientAccount` and `Site`
- Add relation to `Message[]`
- Update `TicketStatus` enum to: `NEW`, `REVIEWING`, `FIXING`, `AWAITING_CONFIRMATION`, `CLOSED`, `REOPENED`

(Full schema in design doc, section "Modified Ticket model.")

### Task 1.3: Generate migration

Because there's existing data in `tickets`, write the migration manually with a destructive note (this is pre-launch — no production data yet). If there IS production data, instead write a data-migration script that creates a placeholder `ClientAccount` for existing rows.

```bash
npx prisma migrate dev --name client_portal_schema
```

Verify the SQL it generated under `prisma/migrations/`.

### Task 1.4: Verify schema in Supabase

Open Supabase Table Editor. Confirm:

- `client_accounts`, `sites`, `invites`, `messages` tables exist with correct columns
- `tickets` table has the new FK columns and lost the anonymous fields
- `auth.users` is unchanged (Supabase-managed)

Commit: `feat(db): add client portal schema`

---

## Phase 2 — Row Level Security policies

### Task 2.1: Enable RLS

Run via Supabase SQL Editor:

```sql
ALTER TABLE client_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
```

### Task 2.2: Apply policies

Paste in the policies from the design doc (sections "RLS policies"). Save the SQL as `prisma/rls-policies.sql` so it's version-controlled.

### Task 2.3: Smoke-test RLS

In the Supabase SQL editor, impersonate a future client by setting `request.jwt.claims` and try to SELECT from each table. Confirm:

- Without auth: zero rows from any client-facing table
- With another client's `auth.uid()`: zero rows
- With own `auth.uid()`: own rows only

Document the test queries in `docs/rls-tests.md`.

Commit: `feat(db): enable RLS and policies for client portal tables`

---

## Phase 3 — Supabase clients

Three separate Supabase client instances are needed; each is exported from `lib/supabase/`.

### Task 3.1: Server-side Supabase client (per-request, with cookies)

Create `lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value },
        set(name, value, options) { cookieStore.set({ name, value, ...options }) },
        remove(name, options) { cookieStore.set({ name, value: '', ...options }) },
      },
    }
  )
}
```

### Task 3.2: Browser Supabase client (singleton)

Create `lib/supabase/browser.ts`:

```typescript
'use client'
import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return client
}
```

### Task 3.3: Service role client (server-only, bypasses RLS)

Create `lib/supabase/admin.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
```

Add to `.gitignore` confirmation: never import `lib/supabase/admin.ts` from a client component. Add an ESLint rule or doc comment.

Commit: `feat(supabase): add server, browser, and admin clients`

---

## Phase 4 — Client authentication

### Task 4.1: Auth helper for getting the current client

Create `lib/auth/client-session.ts`:

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function getCurrentClientAccount() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return prisma.clientAccount.findUnique({
    where: { authUserId: user.id },
    include: { sites: true }
  })
}
```

### Task 4.2: Middleware for /portal/* protection

Create or extend `middleware.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/portal')) return NextResponse.next()
  if (req.nextUrl.pathname === '/portal' || req.nextUrl.pathname.startsWith('/portal/forgot-password') || req.nextUrl.pathname.startsWith('/portal/reset-password')) {
    return NextResponse.next()
  }

  const res = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => res.cookies.set({ name, value, ...options }),
        remove: (name, options) => res.cookies.set({ name, value: '', ...options }),
      }
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/portal', req.url))
  }
  return res
}

export const config = { matcher: ['/portal/:path*'] }
```

### Task 4.3: Login page and API

- `app/portal/page.tsx` — login form (email + password) styled in Dispatch language
- `app/api/portal/auth/login/route.ts` — calls `supabase.auth.signInWithPassword`, returns redirect URL
- On success → redirect to `/portal/dashboard`
- On failure → render with error inline (no flash)

### Task 4.4: Logout API + button

- `app/api/portal/auth/logout/route.ts` — calls `supabase.auth.signOut()`, returns 303 to `/portal`
- Logout button lives in portal nav

### Task 4.5: Forgot/reset password flow

- `app/portal/forgot-password/page.tsx` — email input
- `app/api/portal/auth/forgot-password/route.ts` — calls `supabase.auth.resetPasswordForEmail()`
- `app/portal/reset-password/page.tsx` — new password form (extracts token from URL hash)
- `app/api/portal/auth/reset-password/route.ts` — calls `supabase.auth.updateUser({ password })`

Commit: `feat(portal): client auth (login, logout, password reset)`

---

## Phase 5 — Invite system

### Task 5.1: Admin invite list page

Create `app/admin/invites/page.tsx` — table of all invites with columns: email, site URL, status (PENDING/REDEEMED/EXPIRED), expires_at, actions (revoke, copy link).

Filtering: tabs for All / Pending / Redeemed / Expired.

### Task 5.2: Admin invite create page

Create `app/admin/invites/new/page.tsx` — form with: client name, client email, website URL, site display name (auto-suggest from URL hostname).

On submit → POST `/api/admin/invites` → redirect to invite detail (or back to list with toast "Invite sent to email@example.com").

### Task 5.3: Invite create API

Create `app/api/admin/invites/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth' // existing
import { prisma } from '@/lib/prisma'
import { sendInviteEmail } from '@/lib/email'
import crypto from 'crypto'

export async function POST(req: Request) {
  await requireAdmin()
  const { name, email, siteUrl, siteDisplayName } = await req.json()

  // Validation
  if (!email || !siteUrl) {
    return NextResponse.json({ error: 'Email and site URL required' }, { status: 400 })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const invite = await prisma.invite.create({
    data: { token, email, siteUrl, siteDisplayName, expiresAt }
  })

  await sendInviteEmail({
    to: email,
    name,
    siteUrl,
    inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`,
    expiresAt
  })

  return NextResponse.json({ invite })
}
```

Plus `GET` (list) and `DELETE /api/admin/invites/[id]` (revoke = soft-delete by setting `expiresAt` to now).

### Task 5.4: Invite landing page

Create `app/invite/[token]/page.tsx` — server component that fetches the invite, determines which of 5 cases applies, and renders the appropriate sub-component:

```typescript
const cases = {
  INVALID: 'expired or already used',
  NEW_SIGNUP: 'no existing account, show signup form',
  EXISTING_NEEDS_LOGIN: 'existing account, log in to merge',
  EXISTING_LOGGED_IN_MATCH: 'logged in as the right user, confirm to merge',
  EXISTING_LOGGED_IN_MISMATCH: 'logged in as someone else'
}
```

### Task 5.5: Invite signup API

Create `app/api/portal/auth/signup/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { prisma } from '@/lib/prisma'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const { token, password, name } = await req.json()

  const invite = await prisma.invite.findUnique({ where: { token } })
  if (!invite || invite.redeemedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invite invalid' }, { status: 400 })
  }

  // Create Supabase Auth user
  const { data: { user }, error } = await supabaseAdmin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true
  })
  if (error || !user) return NextResponse.json({ error: error?.message }, { status: 400 })

  // Create app records
  const account = await prisma.clientAccount.create({
    data: {
      authUserId: user.id,
      email: invite.email,
      name,
      sites: {
        create: { url: invite.siteUrl, displayName: invite.siteDisplayName }
      }
    }
  })

  await prisma.invite.update({
    where: { id: invite.id },
    data: { redeemedAt: new Date(), redeemedByAccountId: account.id }
  })

  // Sign the user in via the per-request client
  const supabase = createSupabaseServerClient()
  await supabase.auth.signInWithPassword({ email: invite.email, password })

  return NextResponse.json({ ok: true, redirect: '/portal/dashboard' })
}
```

### Task 5.6: Invite merge API (for existing accounts)

Create `app/api/portal/invites/[token]/merge/route.ts` — verifies session matches invite email, creates `Site`, marks invite redeemed.

### Task 5.7: Invite email template

Add to `lib/email.ts`:

```typescript
export async function sendInviteEmail({ to, name, siteUrl, inviteUrl, expiresAt }: ...) {
  return resend.emails.send({
    from: process.env.RESEND_FROM!,
    to,
    subject: `Your Dispatch invite for ${siteUrl}`,
    html: inviteEmailHtml({ name, siteUrl, inviteUrl, expiresAt })
  })
}
```

Use Fraunces in the email body for headings, JetBrains Mono for the URL, signal-red accent.

Commit: `feat(invites): create, redeem, list, revoke invites with email`

---

## Phase 6 — Client portal pages

### Task 6.1: Portal layout with nav + presence indicator

`app/portal/layout.tsx` — wrap children in a layout that has:

- Masthead (existing Header component, repurposed)
- Logout button
- Optional: "Christian — Online/Offline" presence indicator (admin's status, see Phase 10)

### Task 6.2: Dashboard

`app/portal/dashboard/page.tsx`:

- Server component that fetches `getCurrentClientAccount()` then queries tickets via Prisma (server-side; RLS enforced via authenticated Supabase client also)
- Renders ticket list with: title, site, status pill, last activity timestamp, unread message count
- Filter chips: site (if multiple), status
- "New Ticket" button → `/portal/ticket/new`

### Task 6.3: New ticket form

`app/portal/ticket/new/page.tsx`:

- Site dropdown — pre-filtered to client's own sites (passed from server)
- Title input, description textarea, category select
- AttachmentDropzone (Phase 11)
- Submit → POST `/api/portal/tickets`

`app/api/portal/tickets/route.ts`:

```typescript
export async function POST(req: Request) {
  const account = await getCurrentClientAccount()
  if (!account) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  const { siteId, title, description, category, attachments } = await req.json()

  // Verify site belongs to this account
  if (!account.sites.some(s => s.id === siteId)) {
    return NextResponse.json({ error: 'site not yours' }, { status: 403 })
  }

  const ticket = await prisma.ticket.create({
    data: {
      clientAccountId: account.id,
      siteId, title, description, category, attachments,
      status: 'NEW',
      receivedAt: new Date()  // auto-stage 2
    }
  })

  await sendNewTicketEmail({ admin: process.env.ADMIN_EMAIL!, ticket, account })
  return NextResponse.json({ ticket })
}
```

### Task 6.4: Ticket detail page

`app/portal/ticket/[id]/page.tsx`:

- Status timeline (Phase 7)
- Ticket info card (title, description, attachments, opened date)
- ChatThread component (Phase 9)
- If status === AWAITING_CONFIRMATION: show "Confirm Fixed" + "Issue Persists" buttons

### Task 6.5: Sites page

`app/portal/sites/page.tsx` — list of client's websites with: URL, display name, # of tickets opened, # currently open.

### Task 6.6: Account settings

`app/portal/account/page.tsx` — name change, password change (via Supabase `updateUser`).

Commit: `feat(portal): client-facing pages (dashboard, new ticket, detail, sites, account)`

---

## Phase 7 — Status state machine + 6-stage timeline

### Task 7.1: StatusTimeline component

Create `components/StatusTimeline.tsx`:

- Reads ticket timestamps + status
- Renders 6 stages horizontally on desktop, vertically on mobile
- Filled stages use signal-red, current/active stage gets the sonar pulse treatment
- Each stage shows the timestamp when filled

### Task 7.2: Auto-set first_viewed_at when admin opens detail

In `app/admin/ticket/[id]/page.tsx`, add a server-side mutation on first view:

```typescript
if (!ticket.firstViewedAt) {
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { firstViewedAt: new Date() }
  })
}
```

### Task 7.3: Status transition API (admin)

Extend `app/api/admin/tickets/[id]/route.ts` PATCH handler. When admin changes status, set the corresponding timestamp:

```typescript
const timestampMap = {
  REVIEWING: 'reviewingStartedAt',
  FIXING: 'fixingStartedAt',
  AWAITING_CONFIRMATION: 'fixedAt'
}
const updateData: any = { status }
if (timestampMap[status] && !ticket[timestampMap[status]]) {
  updateData[timestampMap[status]] = new Date()
}
```

If transitioning to AWAITING_CONFIRMATION, fire `sendAwaitingConfirmationEmail` to the client.

### Task 7.4: Confirm fixed action

`app/api/portal/tickets/[id]/confirm/route.ts`:

```typescript
const ticket = await prisma.ticket.findUnique({ where: { id }, ... })
if (ticket.clientAccountId !== account.id) return 403
if (ticket.status !== 'AWAITING_CONFIRMATION') return 400

await prisma.ticket.update({
  where: { id },
  data: { status: 'CLOSED', confirmedAt: new Date() }
})
```

### Task 7.5: Reopen action

`app/api/portal/tickets/[id]/reopen/route.ts`:

- Status → REOPENED
- Set `reopenedAt = now()`
- Send `ticketReopenedEmail` to admin
- Optionally append a system message to the chat thread: "Ticket reopened by client"

Commit: `feat(status): 6-stage state machine with timestamps and confirm/reopen`

---

## Phase 8 — Real-time chat thread

### Task 8.1: Message API

`app/api/portal/tickets/[id]/messages/route.ts`:

- POST: validate ownership, create `Message` with `senderType: 'CLIENT', senderId: account.id`, fire `sendNewMessageToAdminEmail` (debounced)
- GET: list messages for the ticket (RLS handles authz)

`app/api/admin/tickets/[id]/messages/route.ts`:

- POST: requireAdmin, create `Message` with `senderType: 'ADMIN', senderId: 'admin'`, fire `sendNewMessageToClientEmail`

### Task 8.2: ChatThread component

Create `components/ChatThread.tsx`:

```typescript
'use client'
import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

export function ChatThread({ ticketId, viewerType, initialMessages }: Props) {
  const [messages, setMessages] = useState(initialMessages)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`ticket-${ticketId}-messages`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `ticket_id=eq.${ticketId}`
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [ticketId])

  // ... render messages and composer
}
```

### Task 8.3: Composer with attachment dropzone

Inside ChatThread, render:

- Textarea (auto-grow)
- Drop area for attachments (Phase 11)
- Send button — disabled while uploading
- On send → POST to the appropriate messages endpoint

### Task 8.4: Email debouncing for chat notifications

In `lib/email.ts`, track last-sent timestamp per (recipient, ticket) in a small in-memory map (or Redis if scaling). Skip if last send was within 60 seconds.

Commit: `feat(chat): real-time chat thread with email notifications`

---

## Phase 9 — Presence

### Task 9.1: PresenceDot component

Create `components/PresenceDot.tsx`:

```typescript
type Props = { status: 'online' | 'offline'; pulse?: boolean; label?: string }

export function PresenceDot({ status, pulse = true, label }: Props) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wide">
      <span className={`presence-dot ${status} ${pulse ? 'pulse' : ''}`} />
      {label ?? status}
    </span>
  )
}
```

Add the CSS from the design doc to `app/globals.css`.

### Task 9.2: Client presence join on portal layout

In `app/portal/layout.tsx` (client component wrapping):

```typescript
useEffect(() => {
  if (!account) return
  const supabase = getSupabaseBrowserClient()
  const channel = supabase.channel('clients-presence', {
    config: { presence: { key: account.id } }
  })

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({
        account_id: account.id,
        name: account.name,
        email: account.email,
        online_at: new Date().toISOString()
      })
    }
  })

  return () => { supabase.removeChannel(channel) }
}, [account?.id])
```

### Task 9.3: Admin presence subscription + toast

Create `components/AdminPresenceWatcher.tsx` — runs on admin layout:

```typescript
useEffect(() => {
  const supabase = getSupabaseBrowserClient()
  const channel = supabase.channel('clients-presence')

  channel
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      newPresences.forEach(p => {
        toast.success(`${p.name} signed in`, { icon: '🟢' })
        setOnlineClients(prev => new Set([...prev, p.account_id]))
      })
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      leftPresences.forEach(p => {
        toast(`${p.name} signed off`, { icon: '⚫' })
        setOnlineClients(prev => {
          const next = new Set(prev)
          next.delete(p.account_id)
          return next
        })
      })
    })
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      setOnlineClients(new Set(Object.keys(state)))
    })
    .subscribe()
}, [])
```

Use a global Zustand store or React Context (`OnlineClientsContext`) so other admin components can read which clients are currently online.

### Task 9.4: Render presence dots in admin

- Admin dashboard ticket list: presence dot next to the client name on each row
- Admin ticket detail header: presence dot next to client name in the info card

### Task 9.5: Reciprocal — admin presence channel

Create a separate `admin-presence` channel. Admin joins it on admin layout mount; clients subscribe (read-only) on their ticket detail to render the green/red dot next to "Christian — Developer of Code."

### Task 9.6: Toast container

Install `react-hot-toast` (or a custom one matching Dispatch aesthetic — preferable). Render `<ToastContainer />` in admin root layout.

Commit: `feat(presence): online/offline indicators with sonar pulse + admin toasts`

---

## Phase 10 — Screenshot uploads

### Task 10.1: Storage bucket policies

In Supabase dashboard for the `ticket-attachments` bucket:

- Set bucket to private
- Add storage RLS: clients can INSERT objects under `tickets/{ticketId}/...` only if they own the ticket; SELECT requires the same; admin (service role) bypasses

```sql
-- Storage RLS via the storage.objects table
CREATE POLICY "client_upload_own_ticket_attachments" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND (storage.foldername(name))[2] IN (
      SELECT id FROM tickets WHERE client_account_id IN (
        SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "client_read_own_ticket_attachments" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'ticket-attachments'
    AND (storage.foldername(name))[2] IN (
      SELECT id FROM tickets WHERE client_account_id IN (
        SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()
      )
    )
  );
```

### Task 10.2: Signed upload URL endpoint

`app/api/portal/uploads/route.ts`:

```typescript
export async function POST(req: Request) {
  const account = await getCurrentClientAccount()
  if (!account) return 401

  const { ticketId, filename, contentType, sizeBytes } = await req.json()

  // Validate
  if (!ALLOWED_TYPES.includes(contentType)) return 400
  if (sizeBytes > 10_000_000) return 400
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, clientAccountId: account.id }
  })
  if (!ticket) return 403

  const path = `tickets/${ticketId}/${Date.now()}-${filename}`
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.storage
    .from('ticket-attachments')
    .createSignedUploadUrl(path)

  if (error) return 500
  return NextResponse.json({ uploadUrl: data.signedUrl, path })
}
```

### Task 10.3: AttachmentDropzone component

Create `components/AttachmentDropzone.tsx`:

- Drag-and-drop area + file picker
- Validates type and size client-side before upload
- For each file: requests signed URL, PUTs file to Supabase Storage, calls `onAttach({ path, filename, contentType, sizeBytes })`
- Shows upload progress

### Task 10.4: Render attachments in messages and ticket body

Component `components/AttachmentList.tsx`:

- For images: thumbnail with click-to-lightbox (use signed display URL)
- For PDFs: icon + filename + download link
- Signed URLs refreshed via `supabase.storage.from('ticket-attachments').createSignedUrl(path, 3600)` on render

Commit: `feat(uploads): screenshot and PDF attachments via supabase storage`

---

## Phase 11 — Email notifications

### Task 11.1: New email templates in lib/email.ts

Add these functions:

- `sendInviteEmail(...)` — already added in Phase 5
- `sendNewMessageToAdminEmail(ticket, account, message)`
- `sendNewMessageToClientEmail(ticket, account, message)`
- `sendAwaitingConfirmationEmail(ticket, account)`
- `sendTicketReopenedEmail(ticket, account)`

Each uses Fraunces for headings, JetBrains Mono for IDs/timestamps, signal-red accent in HTML.

### Task 11.2: Wire trigger points

Confirm each trigger fires from the right place:

- Invite email → `POST /api/admin/invites`
- New ticket email → `POST /api/portal/tickets`
- Message emails → `POST .../messages` (with debouncing)
- Awaiting confirmation → status change to AWAITING_CONFIRMATION
- Reopened → `POST .../reopen`

### Task 11.3: Verify deliverability

Send each email type to a real address. Check spam folder, links, formatting.

Commit: `feat(email): notification templates and triggers`

---

## Phase 12 — Removing anonymous flows

### Task 12.1: Replace homepage with redirect

`app/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
export default function HomePage() { redirect('/portal') }
```

### Task 12.2: Delete old files

```bash
rm app/status/page.tsx
rm components/TicketForm.tsx
rm components/StatusLookup.tsx
rm app/api/tickets/route.ts
rm app/api/tickets/lookup/route.ts
```

### Task 12.3: Update navigation, README

- Remove any nav links to `/status` or anonymous submit
- Update `README.md` to describe portal-first architecture

Commit: `chore: remove anonymous public flows`

---

## Phase 13 — Manual test checklist

Walk through each scenario. Document results in `docs/qa-checklist.md`.

### Task 13.1: Invite signup (new email)

- [ ] Admin creates invite for `test-client@example.com`
- [ ] Client receives email with valid link
- [ ] Click link → signup form, email locked, site URL shown
- [ ] Submit password → account created, site attached, redirected to dashboard
- [ ] Logout, log back in works

### Task 13.2: Invite merge (existing email)

- [ ] Admin creates a second invite for same email, different site
- [ ] Click link → "Add second-site.com to your account?" prompt (when logged in)
- [ ] Confirm → second Site appears in `/portal/sites`
- [ ] New ticket form dropdown now shows BOTH sites

### Task 13.3: Cross-client isolation (RLS)

- [ ] Client A logs in, creates a ticket
- [ ] Client B logs in
- [ ] Client B's dashboard shows zero of A's tickets
- [ ] Client B's new-ticket form shows only B's sites
- [ ] Direct URL `/portal/ticket/{A_TICKET_ID}` returns 403/404

### Task 13.4: Full ticket lifecycle

- [ ] Submit ticket → "Sent" stage filled, "Received" filled
- [ ] Admin opens detail → "Viewed" filled
- [ ] Admin sets REVIEWING → 4th stage filled
- [ ] Admin sets FIXING → 5th stage filled
- [ ] Admin sets AWAITING_CONFIRMATION → 6th stage filled, client gets email
- [ ] Client clicks "Confirm Fixed" → status CLOSED
- [ ] Client receives email at each transition

### Task 13.5: Reopen flow

- [ ] Repeat 13.4 up to AWAITING_CONFIRMATION
- [ ] Client clicks "Issue Persists" → status REOPENED, admin gets email
- [ ] Admin sets back to FIXING → client sees timeline reset to Fixing stage

### Task 13.6: Real-time chat

- [ ] Two browsers: client on ticket detail, admin on same ticket
- [ ] Admin sends message → appears on client screen within 1s, no refresh
- [ ] Client sends message → appears on admin screen within 1s
- [ ] Both receive email notifications (debounced)

### Task 13.7: Presence

- [ ] Admin dashboard open
- [ ] Client logs in → green pulse appears next to their name on dashboard
- [ ] Admin sees toast: "{name} signed in"
- [ ] Client logs out → red dot, toast: "{name} signed off"
- [ ] Client opens two tabs → still shows online once
- [ ] Client closes one tab, other still open → still online
- [ ] Client closes both tabs → after ~30s, marked offline

### Task 13.8: Screenshot uploads

- [ ] Drag image into new-ticket form → uploads, appears as thumbnail
- [ ] Submit ticket → admin sees image in detail
- [ ] Drag PDF into chat → uploads, appears as link
- [ ] Try to upload >10MB file → rejected client-side
- [ ] Try to upload .exe → rejected

### Task 13.9: Error paths

- [ ] Expired invite → "no longer valid" page
- [ ] Wrong password → inline error, no flash
- [ ] Logged-in client visits /admin → redirect or 401 (admin gate still works)
- [ ] Admin visits /portal/dashboard → redirected to /portal (client gate)

Commit: `test: manual QA checklist passed`

---

## Phase 14 — Deploy

### Task 14.1: Update Vercel env vars

Add to Vercel project settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `SUPABASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_APP_URL=https://support.developerofcode.com` (already set, verify)

### Task 14.2: Push migration to production DB

In Supabase production project (not the local/dev one), apply the SQL migration:

```bash
npx prisma migrate deploy
```

Then run the RLS policies SQL from `prisma/rls-policies.sql` in the Supabase SQL editor.

### Task 14.3: Deploy

```bash
git push origin client-portal
# Open PR, merge to main, Vercel auto-deploys
```

### Task 14.4: Production smoke test

- [ ] Send yourself a real invite — flow works end-to-end
- [ ] Submit a real ticket from the test account
- [ ] Send chat messages both ways
- [ ] Confirm presence works across two real browsers/devices
- [ ] Verify email deliverability to your real inbox

### Task 14.5: Onboard first real client

Pick one client (e.g., Reaves Chiropractic). Send them an invite. Walk through the portal with them on a call so you catch any UX issues before scaling.

Commit (post-deploy): `docs: post-launch notes`

---

## Acceptance criteria recap

The feature is shippable when all 9 boxes in Phase 13 are checked AND production smoke tests pass.

---

## Future work (not in this plan)

- Multi-admin support
- Audit log table
- File scanning on upload
- Custom domain per client (white-label)
- Mobile push notifications (replace toast for offline-admin scenario)
