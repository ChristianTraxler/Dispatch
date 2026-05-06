# Dispatch Client Portal — Project Handoff

> **For Claude (you, the AI reading this in Claude Code):** This is a project handoff. You are picking up a feature build mid-stream for Christian. Read this entire document before doing ANYTHING. Architecture and design decisions are LOCKED — do not rethink them. Pre-built UI components are LOCKED — do not rebuild them. Your job is to execute Track B (backend wiring + scaffolding) following the implementation plan, using the components Christian already has.
>
> When you're done reading this doc, your first reply should be: a 5-sentence summary of where we are and what you're about to do, then ask Christian which Phase he wants to start with (recommendation: Phase 0, the project scaffolding).

**Date generated:** 2026-05-05
**Status:** Track A (UI components + email templates) complete. Track B (backend + scaffolding) not started.
**This is a greenfield build.** No Dispatch codebase exists yet. You are starting from an empty directory.

---

## Quick context — who and what

**Christian Traxler** owns and operates **Developer of Code, LLC**, a small web design and development business. He's the only admin. The business at `developerofcode.com` builds custom websites for small businesses (current clients include Renegade Wellness Center and Reaves Chiropractic).

**Dispatch** will be a support ticket platform Christian uses to handle support requests from his web design clients. The plan is to deploy it at **`support.developerofcode.com`** on Vercel, with a Supabase Postgres database. **It does not exist yet.** No code has been written. No Vercel project exists. No Supabase project exists. The domain has not been pointed yet.

This handoff is the spec for building Dispatch from scratch.

**Brand identity:** A 1960s newsroom dispatch desk aesthetic.
- **Fonts:** Fraunces (display, with optical-size variation) + JetBrains Mono (data, IDs, datelines)
- **Colors:** parchment bone surfaces (`#f5f1e8`), deep ink text (`#1a1815`), signal-red accent (`#c8341a`), signal-green for online presence (`#2e7d3f`)
- **Patterns:** hairline rules (no rounded SaaS cards), underline-only inputs, monospaced status pills with thick left bars, paper-grain background, datelines in mono caps

**This identity is locked.** All new components must adhere to it. The Track A components already do. Don't drift.

---

## What we're building (the goal)

A complete Next.js app — client portal + admin portal + email notification system. End state, by feature:

1. **Invite-only signup** — Christian creates an invite for a client. The invite is bound to one website URL. The client clicks the link in their email, sets a password, and their account is created with the invited site attached. If the same email is invited twice for two different sites, the second invite **merges** the new site onto the existing account.

2. **Strict site filter** — when a client opens the new-ticket form, the website dropdown is filtered to only their sites. They literally cannot file a ticket against another client's site (enforced by RLS at the database level, not just in app code).

3. **Six-stage ticket lifecycle** — every ticket flows through: `Sent → Received → Viewed → Reviewing Errors → Fixing Errors → Errors Fixed`. The first three are auto-set timestamps, the last three are admin status changes.

4. **Client confirmation** — after Christian marks a ticket "Errors Fixed" (status `AWAITING_CONFIRMATION`), the client must click "Confirm Fixed" to close it OR "Issue Persists" to reopen it back to Christian's queue.

5. **Real-time chat** — every ticket has a chat thread. Both parties' messages appear in real time via Supabase Realtime subscriptions on the `messages` table.

6. **Presence indicators** — green sonar pulse when the other party is online, solid red when offline. Driven by Supabase Realtime Presence, NOT polling. Admin sees per-client presence on the dashboard. Client sees Christian's presence on their ticket detail.

7. **Toast notifications** — admin-side only. When a client signs in or out (presence join/leave), a newsroom-ticker toast fires.

8. **Screenshot uploads** — clients can drag images or PDFs into the new-ticket form or chat composer. Files go to Supabase Storage in a private bucket, accessed via short-lived signed URLs.

9. **Email notifications** — Resend-powered emails for: invites, new tickets, every chat message (debounced), awaiting-confirmation, and reopens. The HTML templates already exist in `lib/email-templates.ts` (Track A).

There is no public anonymous ticket flow. Auth gates everything client-facing.

---

## The stack (assumed and locked)

The design doc and implementation plan were written assuming this stack:

- **Framework:** Next.js 14 with App Router
- **Language:** TypeScript
- **Database:** Postgres on Supabase
- **ORM:** Prisma
- **Auth (clients):** Supabase Auth (email + password)
- **Auth (admin):** See "Architecture decisions" below — this needs a small clarification given greenfield context
- **Realtime:** Supabase Realtime (chat subscriptions + Presence)
- **Storage:** Supabase Storage (private bucket for attachments)
- **Email:** Resend
- **Styling:** Tailwind CSS + custom design tokens
- **Hosting:** Vercel
- **Domain:** `support.developerofcode.com` (not yet configured)

Christian uses this stack across his work and his other products. Don't change it without asking.

---

## Critical architecture decisions

These were settled during the design conversation. Trust the design doc. **One section needs clarification because it was written assuming an existing codebase** — see #1 below.

### 1. Admin auth — clarification required at Phase 0

**The design doc says:** "Admin auth stays exactly as it is. Custom cookie auth. Don't touch it."

**The reality:** There is no existing admin auth because there's no existing app. So we have a small decision to make at Phase 0. Recommend **Option A** unless Christian wants otherwise:

**Option A (recommended for greenfield):** Use Supabase Auth for everyone — admin and clients alike. Christian's account gets a `role: 'admin'` claim in `app_metadata`. `/admin/*` routes check `role === 'admin'`. Realtime + Presence work naturally with `auth.uid()` for both sides. **Simplest path. Least JWT plumbing. Clean RLS story.**

**Option B (matches the original design doc literally):** Custom admin auth (single env-stored bcrypt password, signed session cookie) + Supabase Auth for clients. This is what the design doc describes, but it was based on the false assumption that custom admin auth already existed. For a greenfield build, this option means writing more glue code (admin login route, session cookie, JWT minting for Realtime channel auth) for arguably no benefit.

**Action:** Before starting Phase 4 (auth implementation), ask Christian which option he wants. If he says Option A, the rest of the plan still applies — you just skip the "mint a separate JWT for admin Realtime auth" part because admin and client both authenticate through Supabase Auth.

### 2. RLS at the database level (LOCKED)

All client-facing tables (`client_accounts`, `sites`, `tickets`, `messages`) have Row Level Security enabled. Policies use `auth.uid()` to filter to the requesting client's own data. The service role bypasses RLS for server-side admin operations. Full policy SQL is in the design doc.

This is defense-in-depth. App code may have bugs; RLS keeps cross-client data leaks from happening at the database level.

### 3. Realtime architecture (LOCKED)

- **Chat:** subscribe to `postgres_changes` on the `messages` table, filtered by `ticket_id`. RLS handles authorization.
- **Presence:** Supabase's built-in Realtime Presence on a `clients-presence` channel. Clients call `channel.track({ account_id, name, ... })` after login. Admin subscribes to the same channel and receives `'sync'` / `'join'` / `'leave'` events.
- **Reciprocal admin presence:** a separate `admin-presence` channel that Christian's admin browser tracks, and clients subscribe to (read-only) on their ticket detail page.

### 4. Multi-tab handling (LOCKED)

Supabase Presence treats multiple browser connections from the same `presence.key` as one logical user. So if a client opens the portal in two tabs, they show online once. Auto-leave on disconnect is ~30 seconds.

### 5. Invite mechanics (LOCKED)

- 32-byte hex token, generated by `crypto.randomBytes(32).toString('hex')`
- 7-day expiry (`expiresAt = now() + 7 days`)
- Each invite covers exactly ONE site for ONE email
- On redemption, if the email already has a `ClientAccount`, the new `Site` row attaches to it (the merge case)
- Invites managed via service role on the server side; no client-facing RLS policies

### 6. Status state machine (LOCKED)

```
NEW → REVIEWING → FIXING → AWAITING_CONFIRMATION → CLOSED
                                   ↓
                              REOPENED → (back to FIXING manually)
```

Auto-set timestamp columns on `Ticket`:
- `createdAt` — always set (Sent stage)
- `receivedAt` — set on insert in app layer (Received stage)
- `firstViewedAt` — set when admin first opens ticket detail (Viewed stage)
- `reviewingStartedAt` — set when admin transitions to REVIEWING
- `fixingStartedAt` — set when admin transitions to FIXING
- `fixedAt` — set when admin transitions to AWAITING_CONFIRMATION
- `confirmedAt` — set when client clicks "Confirm Fixed"
- `reopenedAt` — set when client clicks "Issue Persists"

### 7. Storage (LOCKED)

Supabase Storage bucket: `ticket-attachments`, private. File path pattern: `tickets/{ticketId}/{messageId-or-'initial'}/{filename}`. Access via signed URLs (1-hour expiry). RLS policies on `storage.objects` mirror ticket ownership rules. Limits: 10MB per file, max 5 files per message, MIME types limited to image/jpeg, image/png, image/webp, image/gif, application/pdf.

---

## Reference documents — READ THESE FIRST

In `docs/plans/` of the new repo (Christian will drop these in before you start):

1. **`2026-05-04-dispatch-client-portal-design.md`** — Full architectural design spec. Data model with Prisma schemas, RLS SQL policies, route map, real-time architecture, invite flow, email templates list, removal list. **Authoritative source for "what we're building." Refer back to it constantly.**

   ⚠️ **Note:** the section on "two coexisting auth systems" assumed an existing custom admin auth. For greenfield, see Architecture Decision #1 above.

2. **`2026-05-04-dispatch-client-portal-plan.md`** — Phase-by-phase implementation plan with specific file paths, code snippets, commit messages, and a manual QA checklist. **Your step-by-step playbook for Track B.**

   ⚠️ **Note:** Phase 12 says "Replace homepage with redirect" and "Delete old files" — for greenfield, those file deletions don't apply because the files never existed. Just don't create them in the first place.

If you don't see these in the repo, ask Christian to drop them into `docs/plans/`.

---

## Track A — what's already built (LOCKED — drop in, don't rebuild)

Christian has a zip file `track-a-components.zip` containing 19 production-ready React/TypeScript components and one email-templates module. The aesthetic is settled, the props are designed, the responsiveness is verified, and screenshots have been captured for every page.

### Inventory

```
components/
├── PresenceDot.tsx                ── Sonar-pulse online/offline indicator
├── StatusPill.tsx                 ── Monospaced status badge (6 ticket states)
├── StatusTimeline.tsx             ── 6-stage progress (responsive)
├── ChatThread.tsx                 ── Message thread + composer (Realtime-ready, mock data)
├── AttachmentDropzone.tsx         ── Drag/drop file uploader (validation only, no upload yet)
├── Toast.tsx                      ── Provider + container + useToast hook
├── Masthead.tsx                   ── Newsroom header with auto-dateline
├── EmailPreview.tsx               ── (Dev tool) wraps email HTML in inbox chrome
├── LoginPage.tsx                  ── Portal entry
├── InviteRedemption.tsx           ── All 5 invite states in one component
├── PortalShell.tsx                ── Client portal layout
├── DashboardPage.tsx              ── Client ticket list
├── NewTicketPage.tsx              ── Submit form (site dropdown filters server-side)
├── TicketDetailPage.tsx           ── Centerpiece (timeline + chat + confirm/reopen)
├── SitesPage.tsx                  ── Client site list
├── AdminShell.tsx                 ── Admin layout (dark sub-nav)
├── AdminInvitesPage.tsx           ── Invite list with filters
├── AdminInviteNewPage.tsx         ── Create-invite form
└── AdminClientsPage.tsx           ── Client list with presence + sites

lib/
└── email-templates.ts             ── 6 email templates (HTML + text + subject)

styles/
├── dispatch-tokens.css            ── Design tokens, sonar pulse keyframes, base atoms
└── tailwind.config.js             ── Extended Tailwind config
```

### How they work

Every page-level component is a **dumb component**: it accepts props, renders, and calls back via callback props. No data fetching inside. No assumptions about routing.

The pattern is: in your Next.js `page.tsx`, fetch data server-side via Prisma + Supabase, pass it in as props, handle callbacks via API calls.

Example:

```tsx
// app/portal/dashboard/page.tsx
import { redirect } from 'next/navigation';
import { PortalShell } from '@/components/PortalShell';
import { DashboardPage } from '@/components/DashboardPage';
import { getCurrentClientAccount } from '@/lib/auth/client-session';
import { isAdminOnline } from '@/lib/presence';
import { prisma } from '@/lib/prisma';

export default async function Page() {
  const account = await getCurrentClientAccount();
  if (!account) redirect('/portal');

  const tickets = await prisma.ticket.findMany({
    where: { clientAccountId: account.id },
    orderBy: { updatedAt: 'desc' },
    include: { site: true, _count: { select: { messages: true } } },
  });

  return (
    <PortalShell user={account} adminOnline={await isAdminOnline()} activeNav="dashboard">
      <DashboardPage
        tickets={tickets.map(toDto)}
        sites={account.sites}
      />
    </PortalShell>
  );
}
```

The `toDto` mapper is something you'll write — converting Prisma's row shape to the DTO shape the component expects.

### Drop-in steps for the new repo

After you scaffold the Next.js project (Phase 0 below):

1. Unzip `track-a-components.zip` somewhere (e.g., `~/Downloads/track-a/`)
2. Copy `components/*.tsx` → the new project's `components/` directory
3. Copy `lib/email-templates.ts` → `lib/`
4. Replace the default `app/globals.css` with `styles/dispatch-tokens.css` (or merge if you've already added Tailwind imports)
5. Replace the default `tailwind.config.ts` with the contents of `styles/tailwind.config.js` (note: the source is `.js`, but Next.js conventions prefer `.ts` — copy the config object into a `.ts` file with proper TypeScript typing)
6. Add the Google Fonts link for Fraunces + JetBrains Mono to `app/layout.tsx` head OR keep the `@import` at the top of `globals.css` (that's already in the dispatch-tokens.css file)
7. Run `npm install` (the components only depend on React)
8. Run `npm run dev` and confirm the components compile

If any imports fail (e.g., `@/components/...`), check `tsconfig.json` `paths` and adjust.

---

## Track B — what you (Claude) need to build

The implementation plan (`2026-05-04-dispatch-client-portal-plan.md`) is the authoritative playbook. It has 14 phases with detailed tasks, file paths, code snippets, and commit messages. **Phase 0 is the part that needs adapting for greenfield (see "Setup checklist" below).**

**Phase order:**

| Phase | Description | Notes |
|---|---|---|
| 0 | **Scaffold** Next.js + Supabase + Prisma + Resend (this replaces the original Phase 0) | See Setup checklist below |
| 1 | Database schema — Prisma models | Schema is in design doc |
| 2 | RLS policies — apply SQL in Supabase dashboard | Policies are in design doc |
| 3 | Supabase client files (server, browser, admin) | Code snippets in plan |
| 4 | Auth (login, logout, password reset) — confirm Option A vs B from Decision #1 first | Middleware for /portal/* |
| 5 | Invite system (admin create, redemption with 5 cases) | The 5 cases are in the design |
| 6 | Wire client portal pages — Prisma queries replacing mock data | Mostly mechanical |
| 7 | Status state machine — auto-timestamps + transitions | |
| 8 | **Real-time chat** — wire Supabase Realtime subscription inside `<ChatThread>` | The component is ready |
| 9 | **Presence** — channel join in PortalShell, admin watcher with toasts | |
| 10 | Screenshot uploads — bucket + signed URLs + RLS | |
| 11 | Email triggers — wire `email-templates.ts` to the right endpoints | |
| 12 | Cleanup — N/A for greenfield (the files to delete were never created) | Skip |
| 13 | Manual QA checklist | The plan has this fully spelled out |
| 14 | Deploy to Vercel + point domain | |

You can do Phases 0–2 in a single session (tightly coupled). After Phase 2 you have a working Supabase setup and schema. Phases 3–5 give you working invite + auth. Phases 6–8 are the meat (wiring real data + Realtime). 9–11 are the polish features. 13–14 are deploy prep.

---

## Setup checklist (Phase 0 — adapted for greenfield)

This replaces the original Phase 0 in the implementation plan because we're starting from zero.

### 0.1 — Scaffold the Next.js app

```bash
# Pick a parent directory for your projects
cd ~/code  # or wherever you keep projects

# Scaffold a new Next.js app with TypeScript, Tailwind, App Router, src dir, no eslint default
npx create-next-app@latest support-dispatch \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*" \
  --use-npm

cd support-dispatch

# Verify it runs
npm run dev
# → visit http://localhost:3000, should see the default Next.js page
# Stop the dev server (Ctrl+C)
```

### 0.2 — Initialize git and create the feature branch

```bash
git init
git add .
git commit -m "chore: initial Next.js scaffold"
git checkout -b client-portal
```

### 0.3 — Install Prisma + Supabase + Resend

```bash
npm install @prisma/client @supabase/supabase-js @supabase/ssr resend
npm install --save-dev prisma @types/cookie

# Initialize Prisma
npx prisma init
# → creates prisma/schema.prisma and adds DATABASE_URL to .env
```

### 0.4 — Create Supabase project

In a browser:

1. Go to https://supabase.com → New project
2. Name: `dispatch-prod` (or `dispatch-dev` if you want a separate dev DB later)
3. Database password: generate a strong one and save to your password manager
4. Region: choose closest to your users (likely `us-east-1`)
5. Wait for the project to provision (~2 min)
6. Once ready: **Project Settings → API** — copy:
   - Project URL
   - `anon` public key
   - `service_role` key (server-only, treat as secret)
7. **Project Settings → API → JWT Settings** — copy the JWT secret
8. **Project Settings → Database → Connection String** — copy the URI for Prisma. Use the "URI" tab, not "Connection pooling." It looks like `postgres://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres`

### 0.5 — Set up Storage bucket

In the Supabase dashboard:

1. **Storage → New bucket**
2. Name: `ticket-attachments`
3. Set to **Private**
4. Save

### 0.6 — Configure Auth

In the Supabase dashboard:

1. **Authentication → Providers → Email** — confirm enabled
2. **Authentication → Providers → Email** — *disable* "Confirm email" (we use the invite token as our trust mechanism, so we'll create users with `email_confirm: true` directly)
3. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (will change to `https://support.developerofcode.com` at deploy time)
   - Redirect URLs: add `http://localhost:3000/portal/reset-password`
4. **Authentication → Email Templates → Reset Password** — customize the body to match Dispatch tone (newsroom voice, signal-red accent). Use the existing `email-templates.ts` style as reference; this template lives in Supabase's UI, not in your codebase.

### 0.7 — Create Resend account and API key

1. https://resend.com → Sign up
2. **Domains** → Add `developerofcode.com` (or a subdomain like `mail.developerofcode.com`)
3. Add the DNS records Resend provides to your domain registrar
4. Wait for verification (~5–60 min)
5. **API Keys** → Create API key, copy it

### 0.8 — Set up environment variables

Create `.env.local` (in addition to whatever Prisma put in `.env`):

```bash
# .env.local (gitignored by default in Next.js)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
SUPABASE_JWT_SECRET=your-jwt-secret-from-dashboard
SUPABASE_STORAGE_BUCKET=ticket-attachments

# Database
DATABASE_URL="postgres://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres"

# Resend
RESEND_API_KEY=re_...
RESEND_FROM="Dispatch <support@developerofcode.com>"

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_EMAIL=hello@developerofcode.com  # Christian's email for new-ticket notifications
```

Verify with: `cat .env.local` (don't commit this file — it should already be in `.gitignore`).

### 0.9 — Drop in Track A components

Christian will hand you `track-a-components.zip`. Follow the drop-in steps from the Track A section above.

After dropping in, run:
```bash
npm run dev
```

Visit http://localhost:3000 — you should still see the default Next.js page (because we haven't replaced `app/page.tsx` yet). The new components are in `components/` but nothing references them yet. That's fine; we'll wire them in starting Phase 6.

### 0.10 — Create the docs folder and drop in the planning docs

```bash
mkdir -p docs/plans
# Christian will drop the design doc, plan doc, and this handoff into docs/plans/
```

### 0.11 — Commit Phase 0

```bash
git add .
git commit -m "chore: phase 0 — scaffolding, deps, env, supabase setup, track A components"
```

You're now ready for Phase 1 (database schema). Proceed using the implementation plan.

---

## Critical gotchas and things to remember

### Don't rebuild Track A components

The components in `track-a-components.zip` are production-ready. Don't second-guess their props or recreate them. If you find yourself wanting to "improve" a component, stop and ask Christian first. We iterated on these — particularly StatusTimeline (the connector lines were tightened twice) and the chat thread layout.

### Aesthetic discipline

The Dispatch design system is locked. Specifically:
- **Don't** introduce rounded `border-radius` on cards
- **Don't** use generic fonts like Inter, Roboto, Arial, or system stacks
- **Don't** invent new colors beyond what's in `tailwind.config.js`
- **Don't** use shadows except sparingly for depth
- **Do** use hairline rules (`border-bottom: 1px solid var(--rule)`)
- **Do** use `font-mono` uppercase tracking-widest for labels and IDs
- **Do** use `font-display` italic for emphasis and prose
- **Do** use signal-red as the primary accent, signal-green only for online presence

### Christian's communication style

He's direct, brief, prefers downloads over walkthroughs, and wants execution after direction is set. When you finish a phase, just say "Phase X done — committed as `commit-msg`. Ready for Phase X+1?" Don't dump code into chat or explain at length unless asked.

He pushes back when output feels generic or recycled. In Track B that's mostly a non-issue because we're wiring known patterns. Just match the established conventions.

### Greenfield = no migration risk

There is no existing data anywhere. The first Prisma migration in Phase 1 builds the schema from scratch. No data to preserve, no anonymous-ticket fields to remove. If at any point you find yourself thinking about "migrating from the old shape" — stop. There is no old shape.

### Realtime channel auth

If Christian picks **Option A** (Supabase Auth for everyone) at Phase 4 — the auth question above — Realtime channel auth Just Works because everyone has an `auth.uid()`. This is the simpler path.

If he picks **Option B** (custom admin auth + Supabase for clients), then Phase 9 has more work: admin login must additionally mint a Supabase-compatible JWT signed with `SUPABASE_JWT_SECRET`, set as a separate cookie, and passed to `supabase.realtime.setAuth(token)` on the client side. The Supabase Realtime auth API has been changing — read the latest docs before implementing.

Recommend Option A unless Christian has a specific reason to do otherwise.

### Email debouncing for chat notifications

When a chat is active, a flurry of messages can fire a flurry of emails. Phase 11 specifies a 60-second debounce per (recipient, ticket) pair. Use a simple in-memory map keyed by `${recipientEmail}:${ticketId}` with the last-sent timestamp. Skip if last send was within 60s. (Production scale would warrant Redis, but for Christian's small client base this is fine.)

### File path conventions

Use Next.js App Router conventions throughout. Server components by default; mark `'use client'` only where needed. Track A components mostly already have `'use client'` directives where appropriate. Don't strip them.

### Screenshot upload security

The signed upload URL approach (Phase 10) means clients upload directly to Supabase Storage, not through your Next.js server. This is fast and scales well, but validation has to happen BEFORE generating the signed URL:

1. Client requests signed URL with `{ ticketId, filename, contentType, sizeBytes }`
2. Server validates: client owns ticket, content type allowed, size < 10MB
3. Server generates signed URL via `supabase.storage.from('ticket-attachments').createSignedUploadUrl(path)`
4. Client uploads. The signed URL itself encodes path + expiry, so they can't redirect.

The `<AttachmentDropzone>` component already does client-side validation (file size, MIME type). Server validation must repeat — never trust client.

---

## Files Christian should have on his Mac before starting

These are all artifacts generated during the design + Track A build. He should download them all and have them ready:

| File | Where it goes |
|---|---|
| `2026-05-04-dispatch-client-portal-design.md` | `support-dispatch/docs/plans/` (after scaffolding) |
| `2026-05-04-dispatch-client-portal-plan.md` | `support-dispatch/docs/plans/` |
| `2026-05-05-track-b-handoff.md` | `support-dispatch/docs/plans/` (this file) |
| `track-a-components.zip` | Unzip and merge per Drop-in steps in Setup checklist 0.9 |
| `dispatch-portal-source.zip` | (Optional reference) — full Vite project with the showcase. Useful for `npm run dev` visual checks |
| Screenshot PNGs | (Optional reference) — visual checks |

---

## Sample test data for local dev

For local testing during Track B, plan to create these via Supabase Auth admin API at some point in Phase 4 or 5:

| Email | Password | Role | Notes |
|---|---|---|---|
| Christian's real email | `Test-Dispatch-Admin-2026!` (change for real use) | Admin | Use Supabase dashboard → Authentication → Users → Add user, then update `app_metadata` to `{ "role": "admin" }` |
| `sarah@renegadewellness.com` | `Test-Dispatch-2026!` | Client | Has Renegade Wellness + Reaves Chiropractic sites attached |
| `marcus@nordicwoodworks.com` | `Test-Dispatch-2026!` | Client | Single site for cross-account isolation testing |

The sample data fixtures used in the showcase (in `dispatch-portal-source.zip` `App.tsx`) match this — Sarah Mathers with two sites is the canonical client test fixture.

---

## When you're stuck

In rough priority order:

1. **Re-read the design doc** — `2026-05-04-dispatch-client-portal-design.md`. Most architectural questions are answered there.
2. **Re-read the implementation plan** — phase-specific guidance.
3. **Check the Supabase docs** — particularly for Auth, Realtime, RLS, Storage. Their docs have changed and Realtime auth in particular has multiple API revisions.
4. **Ask Christian** — if you've spent more than 20 minutes blocked.

**Don't:**
- Don't invent new architecture if a decision is in the design doc
- Don't add new dependencies without asking
- Don't change the Track A component prop shapes
- Don't deploy without manually testing every QA checklist item in Phase 13

---

## Final note from the previous Claude session

The aesthetic discipline is what took the most iteration to get right. Christian pushed back hard when designs felt generic or recycled. The Dispatch identity — newsroom dispatch desk, signal-red live-wire accent, parchment paper, mono datelines — is not arbitrary. Every component has been tuned to that vision.

When you wire data into the components, **maintain that identity in everything you add**. Email subject lines should sound like dispatches ("Filed at 14:02"). Error messages should be voiced with the same crisp newsroom register. Confirmation copy should feel printed, not buttery.

Take the components Track A ships you, follow the plan phase by phase, match the established voice, and Track B will land cleanly. You've got this.

— Claude (handing off after Track A)
