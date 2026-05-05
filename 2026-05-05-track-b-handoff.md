# Dispatch Client Portal — Project Handoff

> **For Claude (you, the AI reading this in Claude Code):** This is a project handoff. You are picking up mid-stream on a feature build for Christian (the Project Owner). Read this entire document before doing anything. Architecture and design decisions are LOCKED — do not rethink them. Pre-built components are LOCKED — do not rebuild them. Your job is to execute Track B (backend wiring) following the implementation plan, using the components Christian already has.
>
> When you're done reading this doc, your first reply should be: a 5-sentence summary of where we are and what you're about to do, then ask Christian which Phase he wants to start with (recommendation: Phase 0, the setup).

**Date generated:** 2026-05-05
**Status:** Track A complete. Track B (Supabase wiring) not started.

---

## Quick context — who and what

**Christian Reaves** owns and operates **Developer of Code, LLC**, a small web design and development business. He's the only admin. The business at `developerofcode.com` builds custom websites for small businesses (current clients include Renegade Wellness Center and Reaves Chiropractic).

**Dispatch** is a support ticket platform Christian built to handle support requests from his clients. It lives at **`support.developerofcode.com`** and is deployed to Vercel from a GitHub repo (likely named `dispatch-support` or similar — confirm by `cd` into the directory). The current production build is a simple anonymous ticket submission system. We are about to transform it into a full client portal with authenticated accounts, real-time chat, presence indicators, and screenshot uploads.

**Pre-launch status:** No production data. We can drop tables and run destructive migrations safely.

**Brand identity for Dispatch:** A 1960s newsroom dispatch desk aesthetic.
- **Fonts:** Fraunces (display, with optical-size variation) + JetBrains Mono (data, IDs, datelines)
- **Colors:** parchment bone surfaces (`#f5f1e8`), deep ink text (`#1a1815`), signal-red accent (`#c8341a`), signal-green for online presence (`#2e7d3f`)
- **Patterns:** hairline rules (no rounded SaaS cards), underline-only inputs, monospaced status pills with thick left bars, paper-grain background, datelines in mono caps

**This identity is locked.** All new components must adhere to it. The Track A components already do. Don't drift.

---

## What we're building (the goal)

A client portal layer on top of Dispatch. End state, by feature:

1. **Invite-only signup** — Christian creates an invite for a client. The invite is bound to one or more website URL(s). The client clicks the link in their email, sets a password, and their account is created with the invited site(s) attached. If the same email is invited twice for two different sites, the second invite **merges** the new site onto the existing account.

2. **Strict site filter** — when a client opens the new-ticket form, the website dropdown is filtered to only their sites. They literally cannot file a ticket against another client's site (enforced by RLS at the database level, not just in app code).

3. **Six-stage ticket lifecycle** — every ticket flows through: `Sent → Received → Viewed → Reviewing Errors → Fixing Errors → Errors Fixed`. The first three are auto-set timestamps, the last three are admin status changes.

4. **Client confirmation** — after Christian marks a ticket "Errors Fixed" (status `AWAITING_CONFIRMATION`), the client must click "Confirm Fixed" to close it OR "Issue Persists" to reopen it back to Christian's queue.

5. **Real-time chat** — every ticket has a chat thread. Both parties' messages appear in real time via Supabase Realtime subscriptions on the `messages` table.

6. **Presence indicators** — green sonar pulse when the other party is online, solid red when offline. Driven by Supabase Realtime Presence, NOT a polling heartbeat. Admin sees per-client presence on the dashboard. Client sees Christian's presence on their ticket detail.

7. **Toast notifications** — admin-side only. When a client signs in or out (presence join/leave), a newsroom-ticker toast fires.

8. **Screenshot uploads** — clients can drag images or PDFs into the new-ticket form or chat composer. Files go to Supabase Storage in a private bucket, accessed via short-lived signed URLs.

9. **Email notifications** — Resend-powered emails for: invites, new tickets, every chat message (debounced), awaiting-confirmation, and reopens.

All anonymous public flows are removed. Auth gates everything client-facing.

---

## Critical architecture decisions (LOCKED — do not rethink)

These were settled during the design conversation. The reasoning is in the design doc; trust it.

### 1. Two coexisting auth systems

| | Admin | Client |
|---|---|---|
| Provider | **Existing custom cookie auth** (already in Dispatch) | **Supabase Auth** (new) |
| Routes | `/admin/*` | `/portal/*` |

Admin auth stays exactly as it is. The single password / cookie session for Christian. Don't touch it.

Client auth is new and uses Supabase Auth (email + password, with `auth.admin.createUser({ email_confirm: true })` to bypass email verification because we use the invite token as our trust mechanism).

For the admin to interact with Supabase Realtime channels (chat broadcasts, presence), the admin login endpoint additionally signs a Supabase-compatible JWT with the Supabase JWT secret. This separate token is used ONLY for Realtime channel auth — admin DB access stays through the service role on the server.

### 2. RLS at the database level

All client-facing tables (`client_accounts`, `sites`, `tickets`, `messages`) have Row Level Security enabled. Policies use `auth.uid()` to filter to the requesting client's own data. The service role bypasses RLS for server-side admin operations.

This is defense-in-depth. App code may have bugs; RLS keeps cross-client data leaks from happening at the database level. The full policy SQL is in the design doc.

### 3. Realtime architecture

- **Chat:** subscribe to `postgres_changes` on the `messages` table, filtered by `ticket_id`. RLS handles authorization.
- **Presence:** use Supabase's built-in Realtime Presence primitive on a `clients-presence` channel. Clients call `channel.track({ account_id, name, ... })` after login. Admin subscribes to the same channel and gets `'sync'`, `'join'`, and `'leave'` events.
- **Reciprocal admin presence:** a separate `admin-presence` channel that Christian's admin browser tracks, and clients subscribe to (read-only) on their ticket detail page to render his green/red dot.

### 4. Multi-tab handling

Supabase Presence treats multiple browser connections from the same `presence.key` as one logical user. So if a client opens the portal in two tabs, they show online once. Auto-leave on disconnect is ~30 seconds.

### 5. Invite mechanics

- 32-byte hex token, generated by `crypto.randomBytes(32).toString('hex')`
- 7-day expiry (`expiresAt = now() + 7 days`)
- Each invite covers exactly ONE site for ONE email
- On redemption, if the email already has a `ClientAccount`, the new `Site` row just attaches to it (the merge case)
- Invites are managed via service role on the server side; no client-facing RLS policies

### 6. Status state machine

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

### 7. Storage

Supabase Storage bucket: `ticket-attachments`, private. File path pattern: `tickets/{ticketId}/{messageId-or-'initial'}/{filename}`. Access via signed URLs (1-hour expiry). RLS policies on `storage.objects` mirror the ticket ownership rules. Limits: 10MB per file, max 5 files per message, MIME types limited to image/jpeg, image/png, image/webp, image/gif, application/pdf.

---

## Reference documents — READ THESE FIRST

In `docs/plans/` of the Dispatch repo (or wherever Christian dropped them):

1. **`2026-05-04-dispatch-client-portal-design.md`** — Full architectural design spec. Data model with Prisma schemas, RLS SQL policies, route map, real-time architecture, invite flow, email templates list, removal list. **This is the authoritative source for "what we're building" — refer back to it constantly.**

2. **`2026-05-04-dispatch-client-portal-plan.md`** — Phase-by-phase implementation plan with specific file paths, code snippets, commit messages, and a manual QA checklist. **This is your step-by-step playbook for Track B.** Each phase is bite-sized. Follow it in order.

If you don't see these in the repo, ask Christian to drop them into `docs/plans/`.

---

## Track A — what's already built (LOCKED — drop in, don't rebuild)

Christian has a zip file `track-a-components.zip` containing 19 production-ready React/TypeScript components and one email-templates module. The aesthetic is settled, the props are designed, the responsiveness is verified, and screenshots have been captured for every page.

### Inventory

```
components/
├── PresenceDot.tsx                ── Sonar-pulse online/offline indicator
├── StatusPill.tsx                 ── Monospaced status badge (6 ticket states)
├── StatusTimeline.tsx             ── 6-stage progress (responsive horizontal/vertical)
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

The `toDto` mapper is something you'll write — it converts Prisma's row shape to the DTO shape the component expects (e.g., adding `messageCount` from `_count.messages`, formatting dates, etc.).

### Drop-in steps for the Dispatch repo

1. Unzip `track-a-components.zip` somewhere (e.g., `~/Downloads/track-a/`)
2. Copy `components/*.tsx` → `support-dispatch/components/`
3. Copy `lib/email-templates.ts` → `support-dispatch/lib/`
4. Merge `styles/dispatch-tokens.css` into `support-dispatch/app/globals.css` (the tokens use `:root` selectors so they're global; the existing styles in `globals.css` should be preserved, just append/merge)
5. Merge the additions in `styles/tailwind.config.js` into `support-dispatch/tailwind.config.ts` — specifically:
   - The `theme.extend.colors` keys (`parchment`, `ink`, `rule`, `signal`)
   - The `fontFamily` keys (`display`, `mono`)
6. Verify the Google Fonts link for Fraunces + JetBrains Mono is in `app/layout.tsx` head or `app/globals.css` `@import` (it should be — the existing Dispatch already uses these)
7. Run `npm install` (no new deps yet — Track A only uses React)
8. Run `npm run dev` and try to import a component into a test page just to confirm everything compiles. Don't deploy yet.

If any of those steps reveal a path mismatch (e.g., `@/components/...` doesn't resolve), check `tsconfig.json` baseUrl/paths and adjust the imports. The components use `@/...` style imports if any.

---

## Track B — what you (Claude) need to build

The implementation plan (`docs/plans/2026-05-04-dispatch-client-portal-plan.md`) is the authoritative playbook. It has 14 phases with detailed tasks, file paths, code snippets, and commit messages.

**Recommended order:**

| Phase | Description | Notes |
|---|---|---|
| 0 | Setup — install Supabase libs, configure project, env vars | ~30 min |
| 1 | Database schema — add new Prisma models, modify Ticket | The schema is in the design doc |
| 2 | RLS policies — apply SQL in Supabase dashboard | The policies are in the design doc |
| 3 | Supabase client files (server, browser, admin) | Code snippets in plan |
| 4 | Client auth (login, logout, password reset) | Middleware for /portal/* |
| 5 | Invite system (admin create, redemption with 5 cases) | The 5 cases are spelled out in the design |
| 6 | Wire client portal pages — replace mock data with Prisma | This is mostly mechanical |
| 7 | Status state machine — auto-timestamps + transitions | |
| 8 | **Real-time chat** — wire Supabase Realtime subscription inside `<ChatThread>` | The component is ready, just needs the hook to fire |
| 9 | **Presence** — channel join in PortalShell, admin watcher with toasts | |
| 10 | Screenshot uploads — bucket + signed URLs + RLS | |
| 11 | Email triggers — wire `email-templates.ts` to the right endpoints | |
| 12 | Cleanup — remove anonymous flows | |
| 13 | Manual QA checklist | The plan has this fully spelled out |
| 14 | Deploy to Vercel | |

**Suggested workflow per phase:**

1. Open the implementation plan and read the phase
2. Implement the tasks in order (each task = 30-60 min of work)
3. Run the dev server, manually test the change
4. Commit with the message specified in the plan
5. Move to next phase

You can do Phases 0, 1, 2 in a single session (they're tightly coupled). After Phase 2 you have a working Supabase setup and schema. Then Phases 3-5 give you working invite + auth. Then 6-8 are the meat (wiring real data + Realtime). 9-11 are the polish features. 12-14 are deploy prep.

---

## Critical gotchas and things to remember

### Don't rebuild Track A components

The components in `track-a-components.zip` are production-ready. Don't second-guess their props or recreate them. If you find yourself wanting to "improve" a component, stop and ask Christian first. We iterated on these — particularly StatusTimeline (the connector lines were tightened twice) and the chat thread layout.

### Aesthetic discipline

The Dispatch design system is locked. Specifically:
- **Don't** introduce rounded `border-radius` on cards (we don't use them)
- **Don't** use generic fonts like Inter, Roboto, Arial, or system stacks
- **Don't** invent new colors beyond what's in `tailwind.config.js`
- **Don't** use shadows except sparingly for depth
- **Do** use hairline rules (`border-bottom: 1px solid var(--rule)`)
- **Do** use `font-mono` uppercase tracking-widest for labels and IDs
- **Do** use `font-display` italic for emphasis and prose
- **Do** use signal-red as the primary accent, signal-green only for online presence

### Christian's communication style

He's direct, brief, prefers downloads over walkthroughs, and wants execution after direction is set. When you finish a phase, just say "Phase X done — committed as `commit-msg`. Ready for Phase X+1?" Don't dump code into chat or explain at length unless asked.

He pushes back when output feels generic or recycled — but in Track B that's mostly a non-issue because we're wiring known patterns. Just match the established conventions.

### The migration is non-destructive ONLY because there's no production data

The plan assumes pre-launch state. If for any reason there IS data in `tickets` table (Christian forgot, or someone submitted a test), STOP and ask before running the migration. The schema change drops the anonymous-ticket fields (`name`, `email`, `websiteUrl`).

### Realtime channel auth — the trickiest part

Phase 9 (presence) is the most architecturally involved part. The reason: admin uses cookie auth (custom), but Supabase Realtime needs a JWT for channel auth. Solution:

1. On admin login (`/api/admin/login` POST), in addition to setting the existing admin session cookie, mint a Supabase-compatible JWT signed with `SUPABASE_JWT_SECRET` (from env), with claims like `{ role: 'authenticated', sub: 'admin', user_role: 'admin' }`
2. Set this JWT as a separate cookie (e.g., `sb-admin-jwt`)
3. Browser-side, when subscribing to the admin presence channel, pass this JWT as the channel auth via `supabase.realtime.setAuth(token)`
4. The clients-presence channel can have a Realtime authorization check that allows admin tokens

Read the Supabase Realtime auth docs before implementing this — the API has been changing. If anything is unclear, this is a "stop and ask Christian" moment, not a "guess and barrel forward" moment.

The simpler alternative (Option C from our design discussion) was rejected because it allows clients to spoof presence identity. So we have to do this properly.

### Email debouncing for chat notifications

When a chat is active, a flurry of messages can fire a flurry of emails. Phase 11 specifies a 60-second debounce per (recipient, ticket) pair. Use a simple in-memory map keyed by `${recipientEmail}:${ticketId}` with the last-sent timestamp. Skip if last send was within 60s. (Production scale would warrant Redis, but for Christian's small client base this is fine.)

### File path conventions

The existing Dispatch app uses Next.js App Router conventions. Server components by default; mark `'use client'` where needed. Track A components mostly already have `'use client'` directives where appropriate. Don't strip them.

### Screenshot upload security

The signed upload URL approach (Phase 10) means clients upload directly to Supabase Storage, not through your Next.js server. This is fast and scales well, but the validation has to happen BEFORE generating the signed URL:

1. Client requests signed URL with `{ ticketId, filename, contentType, sizeBytes }`
2. Server validates: client owns ticket, content type is allowed, size < 10MB
3. Server generates signed URL via `supabase.storage.from('ticket-attachments').createSignedUploadUrl(path)`
4. Client uploads. The signed URL itself encodes path + expiry, so they can't redirect.

The `<AttachmentDropzone>` component already does client-side validation (file size, MIME type). Server validation must repeat — never trust client.

---

## Files Christian should have on his Mac before starting

These are all artifacts I generated during the design + Track A build. They live in `/mnt/user-data/outputs/` in the chat that produced them. He needs to download all of them and place them in his Dispatch repo before starting Track B:

| File | Where it goes |
|---|---|
| `2026-05-04-dispatch-client-portal-design.md` | `support-dispatch/docs/plans/` |
| `2026-05-04-dispatch-client-portal-plan.md` | `support-dispatch/docs/plans/` |
| `2026-05-05-track-b-handoff.md` | `support-dispatch/docs/plans/` (this file) |
| `track-a-components.zip` | Unzip and merge into `support-dispatch/` per Drop-in steps above |
| `dispatch-portal-source.zip` | (Optional reference) — full Vite project with the showcase. Useful for visually reviewing what a component looks like with `npm run dev` if you forget |
| Screenshot PNGs (preview-*.png, admin-*.png, email-*.png) | Reference only — keep them somewhere for visual checks |

---

## Setup checklist — run this before Phase 0

```bash
# 1. cd to your Dispatch repo
cd ~/path/to/support-dispatch

# 2. Confirm git is clean
git status

# 3. Create a feature branch for Track B
git checkout -b client-portal-track-b

# 4. Confirm the design + plan + handoff docs are in place
ls docs/plans/
# Should see:
#   2026-05-04-dispatch-client-portal-design.md
#   2026-05-04-dispatch-client-portal-plan.md
#   2026-05-05-track-b-handoff.md (this file)

# 5. Confirm Track A components are in place
ls components/PresenceDot.tsx components/ChatThread.tsx components/AdminShell.tsx
# All three should exist

# 6. Confirm email templates are in place
ls lib/email-templates.ts

# 7. Confirm dev server still runs
npm run dev
# Visit http://localhost:3000 — should still show the existing public Dispatch homepage
# (we'll be replacing that in Phase 12 cleanup)
```

If any of those checks fail, stop and resolve before starting Phase 0.

---

## Test accounts and sample data

For local testing during Track B, plan to create these via Supabase Auth admin API:

| Email | Password | Role | Notes |
|---|---|---|---|
| `sarah@renegadewellness.com` | `Test-Dispatch-2026!` | Client | Has Renegade Wellness + Reaves Chiropractic sites attached |
| `marcus@nordicwoodworks.com` | `Test-Dispatch-2026!` | Client | Single site for cross-account isolation testing |
| Christian's real email | (existing admin password) | Admin | Already configured |

The sample data fixtures used in the showcase (in `dispatch-portal-source.zip` `App.tsx`) match this — Sarah Mathers with two sites is the canonical client test fixture.

---

## When you're stuck

In rough priority order:

1. **Re-read the design doc** — `2026-05-04-dispatch-client-portal-design.md`. Most architectural questions are answered there.
2. **Re-read the implementation plan** — phase-specific guidance.
3. **Check the Supabase docs** — particularly for Auth, Realtime, RLS, Storage.
4. **Ask Christian** — if you've spent more than 20 minutes blocked on something not covered above.

**Don't:**
- Don't invent new architecture if a decision is in the design doc
- Don't add new dependencies without asking
- Don't change the Track A component prop shapes
- Don't deploy without manually testing every QA checklist item in Phase 13

---

## Final note from the previous Claude session

The aesthetic discipline is the thing that took the most iteration to get right. Christian pushed back hard when designs felt generic or recycled. The Dispatch identity — newsroom dispatch desk, signal-red live-wire accent, parchment paper, mono datelines — is not arbitrary. Every component has been tuned to that vision.

When you wire data into the components, **maintain that identity in everything you add**. Email subject lines should sound like dispatches ("Filed at 14:02"). Error messages should be voiced with the same crisp newsroom register. Confirmation copy should feel printed, not buttery.

The user's exact words during one of the iterations: *"Pushes back when output feels generic or recycled — responds positively when work breaks genuinely new ground."*

Take the components Track A ships you, follow the plan phase by phase, match the established voice, and Track B will land cleanly. You've got this.

— Claude (handing off after Track A)
