# Inquiry Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a floating quick-chat launcher in the portal that creates lightweight "inquiries" (one per client at a time) which either side can promote into a tracked ticket. Inquiries email participants only at end-of-chat (transcript) and after a 1-hour admin response delay (nudge).

**Architecture:** Inquiries are `Ticket` rows with `isInquiry=true`. Three new columns (`is_inquiry`, `inquiry_ended_at`, `last_message_at`, plus `admin_nudged_at`) carry all state. Existing chat plumbing (`<ChatThread>`, realtime, attachments, presence, read receipts) is reused verbatim. Two daily/15-min cron jobs handle auto-archive and admin nudges.

**Tech Stack:** Next.js 16 (app router), Prisma 5 + PostgreSQL via Supabase, Supabase Realtime + Auth, Resend (email), Tailwind, TypeScript. Vercel Cron for scheduled jobs.

**Design source:** [docs/plans/2026-05-06-dispatch-inquiry-feature-design.md](./2026-05-06-dispatch-inquiry-feature-design.md)

**Testing approach:** Project has no unit-test runner (only `eslint`). Each task ends with a **manual verification step** — run dev server, click through, check DB. Final Task 20 is an end-to-end smoke test.

**Note on Next 16 conventions:** Per `AGENTS.md`, this is not the Next.js you remember. Before writing any cron config, read `node_modules/next/dist/docs/01-app/` for current routing/runtime/cron rules. App-router route handlers in this version use `(req: Request, context: { params: Promise<{ id: string }> })` — `params` is a Promise. Existing routes in `app/api/portal/tickets/[id]/messages/route.ts` show the pattern.

---

## Phase 1 — Schema migration

### Task 1: Add inquiry fields to `Ticket`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_inquiry_fields/migration.sql` (auto-generated)

- [ ] **Step 1: Add four fields and two indexes to the `Ticket` model**

In `prisma/schema.prisma`, inside the `Ticket` model, add after the existing `attachments Json?` line:

```prisma
  isInquiry      Boolean   @default(false) @map("is_inquiry")
  inquiryEndedAt DateTime? @map("inquiry_ended_at")
  lastMessageAt  DateTime? @map("last_message_at")
  adminNudgedAt  DateTime? @map("admin_nudged_at")
```

And add these indexes alongside the existing `@@index` lines (before `@@map("tickets")`):

```prisma
  @@index([isInquiry, inquiryEndedAt])
  @@index([clientAccountId, isInquiry, inquiryEndedAt])
```

- [ ] **Step 2: Generate and run the migration**

Run: `npx prisma migrate dev --name inquiry_fields`

Expected: migration file created under `prisma/migrations/`; Prisma client regenerated; psql shows `is_inquiry`, `inquiry_ended_at`, `last_message_at`, `admin_nudged_at` columns and the two new indexes on the `tickets` table.

- [ ] **Step 3: Verify schema in DB**

Run: `npx prisma db pull --print | head -40` — should show the new columns reflected back. (No need to apply; just visual confirmation.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(inquiry): schema fields for isInquiry, ended/last-message/nudged timestamps"
```

---

## Phase 2 — Email templates and senders

### Task 2: Add `renderInquiryTranscriptEmail` template

**Files:**
- Modify: `lib/email-templates.ts`

- [ ] **Step 1: Add the params interface and render function**

Append to `lib/email-templates.ts` before the final `EXPORTS` block:

```typescript
/* ============================================
   7. INQUIRY TRANSCRIPT (to admin + client)
   ============================================ */
export interface InquiryTranscriptMessage {
  senderName: string;
  senderType: "CLIENT" | "ADMIN";
  body: string;
  createdAt: Date | string;
  attachmentNames?: string[];
}

export interface InquiryTranscriptEmailParams {
  recipientType: "CLIENT" | "ADMIN";
  clientName: string;
  startedAt: Date | string;
  endedAt: Date | string;
  endedBy: "client" | "admin" | "auto";
  messages: InquiryTranscriptMessage[];
  /** For admin recipient: link to /admin/ticket/[id]. Omitted for client. */
  ticketUrl?: string;
}

export function renderInquiryTranscriptEmail(p: InquiryTranscriptEmailParams): { subject: string; html: string; text: string } {
  const startedAt = typeof p.startedAt === "string" ? new Date(p.startedAt) : p.startedAt;
  const endedAt = typeof p.endedAt === "string" ? new Date(p.endedAt) : p.endedAt;
  const endedStr = endedAt.toLocaleString("en-US", { month: "long", day: "2-digit", year: "numeric" });
  const startedStr = startedAt.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });

  const endedByLine =
    p.endedBy === "auto"
      ? "Auto-archived after 7 days of inactivity."
      : p.endedBy === "admin"
        ? "Ended by Christian."
        : `Ended by ${escape(p.clientName)}.`;

  const transcript = p.messages
    .map((m) => {
      const ts =
        typeof m.createdAt === "string"
          ? new Date(m.createdAt)
          : m.createdAt;
      const tsStr = ts.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
      const accent = m.senderType === "ADMIN" ? COLORS.signalRed : COLORS.ink;
      const attachmentLine = m.attachmentNames?.length
        ? `<div style="margin-top:6px;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.inkFade};">📎 ${m.attachmentNames.map((n) => escape(n)).join(", ")}</div>`
        : "";
      return `<div style="margin:0 0 14px 0;padding:10px 14px;background:${COLORS.parchment};border-left:3px solid ${accent};">
<div style="font-family:${FONT_MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${COLORS.inkMute};margin-bottom:4px;">
<strong style="color:${accent};">${escape(m.senderName)}</strong> · ${tsStr}
</div>
<div style="font-family:${FONT_DISPLAY};font-size:15px;line-height:1.5;color:${COLORS.inkSoft};">
${escape(m.body).replace(/\n/g, "<br>")}
</div>
${attachmentLine}
</div>`;
    })
    .join("\n");

  const followUp =
    p.recipientType === "CLIENT"
      ? bodyText(`Want to follow up? Open the portal and start a new chat anytime.`)
      : p.ticketUrl
        ? button({ href: p.ticketUrl, label: "Open the inquiry archive →" })
        : "";

  const body = `
${sectionLabel("INQUIRY TRANSCRIPT")}
${headline(`Quick chat with<br><span style="color:${COLORS.signalRed};font-style:italic;">${escape(p.clientName)}</span>`)}
${lede(endedByLine)}

${dataTable(`
${dataRow("Started", startedStr)}
${dataRow("Ended", endedStr)}
${dataRow("Messages", String(p.messages.length))}
`)}

<div style="margin:0 0 8px 0;">${caps("Conversation")}</div>
${p.messages.length === 0 ? bodyText("(No messages were exchanged.)") : transcript}

${followUp}
  `.trim();

  const html = shell({
    title: `Inquiry transcript — ${p.clientName} — ${endedStr}`,
    preheader: `${p.messages.length} message${p.messages.length === 1 ? "" : "s"} exchanged. ${endedByLine}`,
    body,
  });

  const textTranscript = p.messages
    .map((m) => {
      const ts = typeof m.createdAt === "string" ? new Date(m.createdAt) : m.createdAt;
      const tsStr = ts.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
      return `[${tsStr}] ${m.senderName}:\n${m.body}${m.attachmentNames?.length ? `\n(attachments: ${m.attachmentNames.join(", ")})` : ""}`;
    })
    .join("\n\n");

  const text = `Inquiry transcript — ${p.clientName}
${endedByLine}
Started: ${startedStr}
Ended: ${endedStr}
Messages: ${p.messages.length}

${p.messages.length === 0 ? "(No messages were exchanged.)" : textTranscript}

${p.recipientType === "CLIENT" ? "Want to follow up? Open the portal and start a new chat." : p.ticketUrl ? `Open the archive: ${p.ticketUrl}` : ""}${plainTextFooter()}`;

  return {
    subject: `Inquiry transcript — ${p.clientName} — ${endedStr}`,
    html,
    text,
  };
}
```

- [ ] **Step 2: Export from the `dispatchEmails` const**

In the `EXPORTS` block at the bottom of `lib/email-templates.ts`, add:

```typescript
export const dispatchEmails = {
  renderInviteEmail,
  renderNewTicketEmail,
  renderNewMessageToAdminEmail,
  renderNewMessageToClientEmail,
  renderAwaitingConfirmationEmail,
  renderTicketReopenedEmail,
  renderInquiryTranscriptEmail,
  renderWaitingInquiryEmail,  // added in Task 3
};
```

(Stays compile-broken until Task 3 adds `renderWaitingInquiryEmail` — that's fine, we'll commit after both are added.)

- [ ] **Step 3: Manual verify (typecheck only)**

Defer until Task 3 completes; do not commit yet.

### Task 3: Add `renderWaitingInquiryEmail` template

**Files:**
- Modify: `lib/email-templates.ts`

- [ ] **Step 1: Add the params interface and render function**

In `lib/email-templates.ts`, append after `renderInquiryTranscriptEmail` (before `EXPORTS`):

```typescript
/* ============================================
   8. WAITING INQUIRY (admin nudge)
   ============================================ */
export interface WaitingInquiryEmailParams {
  clientName: string;
  ticketUrl: string;
  latestMessageBody: string;
  latestMessageAt: Date | string;
}

export function renderWaitingInquiryEmail(p: WaitingInquiryEmailParams): { subject: string; html: string; text: string } {
  const ts = typeof p.latestMessageAt === "string" ? new Date(p.latestMessageAt) : p.latestMessageAt;
  const tsStr = ts.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });

  const body = `
${sectionLabel("WAITING INQUIRY")}
${headline(`<span style="color:${COLORS.signalRed};">${escape(p.clientName)}</span><br>is waiting on you.`)}
${lede(`A quick-chat message has been sitting unanswered for over an hour.`)}

${quoteBlock(escape(p.latestMessageBody).replace(/\n/g, "<br>"))}

<p style="margin:0 0 16px 0;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${COLORS.inkFade};">
Sent ${tsStr}
</p>

${button({ href: p.ticketUrl, label: "Reply in the inquiry →" })}
  `.trim();

  const html = shell({
    title: `Waiting inquiry from ${p.clientName}`,
    preheader: p.latestMessageBody.slice(0, 100),
    body,
  });

  const text = `${p.clientName} is waiting on a reply. Their last message (${tsStr}):

> ${p.latestMessageBody.split("\n").join("\n> ")}

Reply here: ${p.ticketUrl}${plainTextFooter()}`;

  return {
    subject: `You have a waiting inquiry from ${p.clientName}`,
    html,
    text,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (If errors, fix them before proceeding.)

- [ ] **Step 3: Commit**

```bash
git add lib/email-templates.ts
git commit -m "feat(inquiry): transcript and waiting-inquiry email templates"
```

### Task 4: Add sender wrappers in `lib/email.ts`

**Files:**
- Modify: `lib/email.ts`

- [ ] **Step 1: Update imports**

In `lib/email.ts`, replace the import block at the top with:

```typescript
import "server-only";

import { Resend } from "resend";
import {
  renderInviteEmail,
  renderNewTicketEmail,
  renderNewMessageToAdminEmail,
  renderNewMessageToClientEmail,
  renderAwaitingConfirmationEmail,
  renderTicketReopenedEmail,
  renderInquiryTranscriptEmail,
  renderWaitingInquiryEmail,
  type InviteEmailParams,
  type NewTicketEmailParams,
  type NewMessageToAdminEmailParams,
  type NewMessageToClientEmailParams,
  type AwaitingConfirmationEmailParams,
  type TicketReopenedEmailParams,
  type InquiryTranscriptEmailParams,
  type WaitingInquiryEmailParams,
} from "@/lib/email-templates";
```

- [ ] **Step 2: Add sender functions**

Append at the end of `lib/email.ts`:

```typescript
export async function sendInquiryTranscriptEmail(
  to: string,
  params: InquiryTranscriptEmailParams,
) {
  const { subject, html, text } = renderInquiryTranscriptEmail(params);
  return resend().emails.send({ from: FROM, to, subject, html, text });
}

export async function sendWaitingInquiryEmail(
  to: string,
  params: WaitingInquiryEmailParams,
) {
  const { subject, html, text } = renderWaitingInquiryEmail(params);
  return resend().emails.send({ from: FROM, to, subject, html, text });
}
```

These do **not** use the `shouldNotify` debounce — both are intentionally one-shot (transcript is end-of-chat; waiting nudge is gated by `adminNudgedAt`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/email.ts
git commit -m "feat(inquiry): sender wrappers for transcript and waiting-inquiry emails"
```

---

## Phase 3 — Backend endpoints

### Task 5: Helper for building the transcript email payload

This logic is reused across four endpoints (client/admin end-inquiry + the cron job + the auto-archive path on the cron). Extract once.

**Files:**
- Create: `lib/inquiry.ts`

- [ ] **Step 1: Write the helper**

```typescript
import "server-only";

import { prisma } from "@/lib/prisma";
import {
  sendInquiryTranscriptEmail,
} from "@/lib/email";
import type { InquiryTranscriptMessage } from "@/lib/email-templates";

interface JsonAttachmentLike {
  filename?: unknown;
}

function attachmentNames(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const names = raw
    .map((a) => (a && typeof (a as JsonAttachmentLike).filename === "string" ? (a as { filename: string }).filename : null))
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? names : undefined;
}

/**
 * End an inquiry: set `inquiry_ended_at`, send transcript emails to both parties.
 * Idempotent — if `inquiry_ended_at` is already set, returns without re-sending.
 */
export async function endInquiry(opts: {
  ticketId: string;
  endedBy: "client" | "admin" | "auto";
  appUrl: string;
}): Promise<{ alreadyEnded: boolean }> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: opts.ticketId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      clientAccount: { select: { name: true, email: true } },
    },
  });
  if (!ticket || !ticket.isInquiry) {
    throw new Error(`Ticket ${opts.ticketId} is not an inquiry`);
  }
  if (ticket.inquiryEndedAt) {
    return { alreadyEnded: true };
  }

  const endedAt = new Date();
  await prisma.ticket.update({
    where: { id: opts.ticketId },
    data: { inquiryEndedAt: endedAt },
  });

  const messages: InquiryTranscriptMessage[] = ticket.messages.map((m) => ({
    senderName: m.senderType === "ADMIN" ? "Christian" : ticket.clientAccount.name,
    senderType: m.senderType,
    body: m.body,
    createdAt: m.createdAt,
    attachmentNames: attachmentNames(m.attachments),
  }));

  const adminEmail = process.env.ADMIN_EMAIL;
  const ticketUrl = `${opts.appUrl}/admin/ticket/${ticket.id}`;
  const startedAt = ticket.createdAt;

  // Send to admin (with link to archive)
  if (adminEmail) {
    try {
      await sendInquiryTranscriptEmail(adminEmail, {
        recipientType: "ADMIN",
        clientName: ticket.clientAccount.name,
        startedAt,
        endedAt,
        endedBy: opts.endedBy,
        messages,
        ticketUrl,
      });
    } catch (err) {
      console.error("[inquiry] transcript email to admin failed:", err);
    }
  }

  // Send to client (no link)
  try {
    await sendInquiryTranscriptEmail(ticket.clientAccount.email, {
      recipientType: "CLIENT",
      clientName: ticket.clientAccount.name,
      startedAt,
      endedAt,
      endedBy: opts.endedBy,
      messages,
    });
  } catch (err) {
    console.error("[inquiry] transcript email to client failed:", err);
  }

  return { alreadyEnded: false };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/inquiry.ts
git commit -m "feat(inquiry): endInquiry helper sends transcript to both parties"
```

### Task 6: `POST /api/portal/inquiries` — find-or-create

**Files:**
- Create: `app/api/portal/inquiries/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { hydrateAttachments } from "@/lib/storage";

export async function POST() {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (account.sites.length === 0) {
    return NextResponse.json(
      { error: "No site on file. Contact support." },
      { status: 400 },
    );
  }

  // 1. Find the existing active inquiry, if any.
  const existing = await prisma.ticket.findFirst({
    where: {
      clientAccountId: account.id,
      isInquiry: true,
      inquiryEndedAt: null,
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  let ticket = existing;

  // 2. Create one if none.
  if (!ticket) {
    const created = await prisma.ticket.create({
      data: {
        clientAccountId: account.id,
        siteId: account.sites[0].id,
        title: "Quick question",
        description: "(quick chat)",
        category: "QUESTION",
        status: "NEW",
        isInquiry: true,
      },
    });
    ticket = { ...created, messages: [] };
  }

  const messages = await Promise.all(
    ticket.messages.map(async (m) => ({
      id: m.id,
      senderType: m.senderType,
      senderName: m.senderType === "ADMIN" ? "Christian" : account.name,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt?.toISOString() ?? null,
      attachments: await hydrateAttachments(m.attachments),
    })),
  );

  return NextResponse.json({ ticketId: ticket.id, messages });
}
```

- [ ] **Step 2: Manual verify**

```bash
npm run dev
```

In another shell, with a portal session cookie:

```bash
curl -X POST http://localhost:3000/api/portal/inquiries \
  -H "Cookie: <your-supabase-session-cookie>"
```

Expected: 200 with `{ ticketId, messages: [] }`. Run again — should return the *same* `ticketId`. Check Supabase: the `tickets` row has `is_inquiry=true`, `inquiry_ended_at` null, `category=QUESTION`, `title="Quick question"`.

- [ ] **Step 3: Commit**

```bash
git add app/api/portal/inquiries/route.ts
git commit -m "feat(inquiry): POST /api/portal/inquiries (find-or-create active inquiry)"
```

### Task 7: Client end-inquiry endpoint

**Files:**
- Create: `app/api/portal/tickets/[id]/end-inquiry/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { endInquiry } from "@/lib/inquiry";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;

  const ticket = await prisma.ticket.findFirst({
    where: { id, clientAccountId: account.id, isInquiry: true },
    select: { id: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Inquiry not found." }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const result = await endInquiry({ ticketId: id, endedBy: "client", appUrl });

  return NextResponse.json({ ok: true, alreadyEnded: result.alreadyEnded });
}
```

- [ ] **Step 2: Manual verify**

After Task 6 created an inquiry, hit:

```bash
curl -X POST http://localhost:3000/api/portal/tickets/<ticketId>/end-inquiry \
  -H "Cookie: <your-supabase-session-cookie>"
```

Expected: 200 with `{ ok: true, alreadyEnded: false }`. Inquiry row's `inquiry_ended_at` is now set. Both `ADMIN_EMAIL` and the client's email receive the transcript (check Resend logs or actual inbox).

- [ ] **Step 3: Commit**

```bash
git add app/api/portal/tickets/[id]/end-inquiry/route.ts
git commit -m "feat(inquiry): client-side end-inquiry endpoint"
```

### Task 8: Admin end-inquiry endpoint

**Files:**
- Create: `app/api/admin/tickets/[id]/end-inquiry/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import { endInquiry } from "@/lib/inquiry";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const { id } = await context.params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, isInquiry: true },
  });
  if (!ticket || !ticket.isInquiry) {
    return NextResponse.json({ error: "Inquiry not found." }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const result = await endInquiry({ ticketId: id, endedBy: "admin", appUrl });

  return NextResponse.json({ ok: true, alreadyEnded: result.alreadyEnded });
}
```

- [ ] **Step 2: Manual verify**

Recreate an inquiry (open the launcher in browser once Phase 8 is done; for now just `curl` Task 6's endpoint), then admin-side close:

```bash
curl -X POST http://localhost:3000/api/admin/tickets/<ticketId>/end-inquiry \
  -H "Cookie: <admin-session-cookie>"
```

Expected: 200; transcript email sent to both addresses (the email body shows "Ended by Christian").

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/tickets/[id]/end-inquiry/route.ts
git commit -m "feat(inquiry): admin-side end-inquiry endpoint"
```

### Task 9: Client and admin promote endpoints

**Files:**
- Create: `app/api/portal/tickets/[id]/promote/route.ts`
- Create: `app/api/admin/tickets/[id]/promote/route.ts`

- [ ] **Step 1: Client promote**

`app/api/portal/tickets/[id]/promote/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;

  const result = await prisma.ticket.updateMany({
    where: {
      id,
      clientAccountId: account.id,
      isInquiry: true,
    },
    data: {
      isInquiry: false,
      inquiryEndedAt: null,
      receivedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "Inquiry not found or already promoted." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
```

`receivedAt` is set so the promoted ticket shows the standard 6-stage timeline starting at "Received" — see `app/api/portal/tickets/route.ts:65` for the same pattern on regular ticket creation.

- [ ] **Step 2: Admin promote**

`app/api/admin/tickets/[id]/promote/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const { id } = await context.params;

  const result = await prisma.ticket.updateMany({
    where: { id, isInquiry: true },
    data: {
      isInquiry: false,
      inquiryEndedAt: null,
      receivedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "Inquiry not found or already promoted." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
```

Both use `updateMany` (not `update`) so a race where both sides promote at once is idempotent — second call gets `count=0` and returns 404, which the UI can ignore on optimistic flows.

- [ ] **Step 3: Manual verify**

Create a fresh inquiry, then promote it:

```bash
curl -X POST http://localhost:3000/api/portal/tickets/<ticketId>/promote \
  -H "Cookie: <client-session-cookie>"
```

Expected: 200. DB row now has `is_inquiry=false`, `received_at` set. The row should now appear in `/admin/tickets` (after Phase 5 filters land).

- [ ] **Step 4: Commit**

```bash
git add app/api/portal/tickets/[id]/promote app/api/admin/tickets/[id]/promote
git commit -m "feat(inquiry): client and admin promote-to-ticket endpoints"
```

---

## Phase 4 — Wire message handlers for `lastMessageAt` and `adminNudgedAt`

### Task 10: Update both message-create handlers

Both `app/api/portal/tickets/[id]/messages/route.ts` and `app/api/admin/tickets/[id]/messages/route.ts` need to:
1. Reject messages on archived inquiries (`isInquiry=true` AND `inquiryEndedAt != null`).
2. Update `lastMessageAt` on every successful insert.
3. Clear `adminNudgedAt` when admin sends a message.
4. Skip the existing per-message email when `isInquiry=true` (no email noise during chat — transcript covers it at end).

**Files:**
- Modify: `app/api/portal/tickets/[id]/messages/route.ts`
- Modify: `app/api/admin/tickets/[id]/messages/route.ts`

- [ ] **Step 1: Update the portal messages route**

In `app/api/portal/tickets/[id]/messages/route.ts`:

Replace the `prisma.ticket.findFirst` block (current lines 42–50) and everything below up through the email send + return, with this (preserve imports, validation, and attachment handling above it):

```typescript
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, clientAccountId: account.id },
    include: {
      site: { select: { displayName: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  if (ticket.isInquiry && ticket.inquiryEndedAt) {
    return NextResponse.json(
      { error: "This chat has ended. Open the launcher to start a new one." },
      { status: 409 },
    );
  }

  const now = new Date();

  const message = await prisma.message.create({
    data: {
      ticketId,
      senderType: "CLIENT",
      senderId: account.id,
      body: body ?? "",
      ...(attachments.length > 0 ? { attachments } : {}),
    },
  });

  // Bookkeeping: bump lastMessageAt for the auto-archive sweep + inquiry list ordering.
  await prisma.ticket.update({
    where: { id: ticketId },
    data: { lastMessageAt: now },
  });

  // Per-message email — for tickets only. Inquiries notify via end-of-chat transcript
  // and the 1-hour admin-nudge cron; no per-message email noise.
  if (!ticket.isInquiry) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
      try {
        await sendNewMessageToAdminEmail(adminEmail, ticket.id, {
          ticketNumber: ticketNumber(ticket.id, ticket.createdAt),
          ticketTitle: ticket.title,
          ticketUrl: `${appUrl}/admin/ticket/${ticket.id}`,
          clientName: account.name,
          siteDisplayName: ticket.site.displayName,
          messageBody: body ?? "(attachment)",
        });
      } catch (err) {
        console.error("[messages] new-message-to-admin email failed:", err);
      }
    }
  }

  return NextResponse.json({
    message: {
      id: message.id,
      senderType: message.senderType,
      senderName: account.name,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      readAt: message.readAt?.toISOString() ?? null,
      attachments: await hydrateAttachments(message.attachments),
    },
  });
```

- [ ] **Step 2: Update the admin messages route**

In `app/api/admin/tickets/[id]/messages/route.ts`:

Replace from the `prisma.ticket.findUnique` block (current lines 52–60) through the end of the function with:

```typescript
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      site: { select: { displayName: true } },
      clientAccount: { select: { email: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  if (ticket.isInquiry && ticket.inquiryEndedAt) {
    return NextResponse.json(
      { error: "This chat has ended." },
      { status: 409 },
    );
  }

  const now = new Date();

  const message = await prisma.message.create({
    data: {
      ticketId,
      senderType: "ADMIN",
      senderId: adminUser.id,
      body: body ?? "",
      ...(attachments.length > 0 ? { attachments } : {}),
    },
  });

  // Admin sending a message clears the waiting-nudge flag — a fresh client message
  // later can re-trigger a nudge.
  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      lastMessageAt: now,
      adminNudgedAt: null,
    },
  });

  // Per-message email — tickets only; inquiries notify via end-of-chat transcript.
  if (!ticket.isInquiry) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    try {
      await sendNewMessageToClientEmail(ticket.clientAccount.email, ticket.id, {
        ticketNumber: ticketNumber(ticket.id, ticket.createdAt),
        ticketTitle: ticket.title,
        ticketUrl: `${appUrl}/portal/ticket/${ticket.id}`,
        siteDisplayName: ticket.site.displayName,
        messageBody: body ?? "(attachment)",
      });
    } catch (err) {
      console.error("[messages] new-message-to-client email failed:", err);
    }
  }

  return NextResponse.json({
    message: {
      id: message.id,
      senderType: message.senderType,
      senderName: "Christian",
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      readAt: message.readAt?.toISOString() ?? null,
      attachments: await hydrateAttachments(message.attachments),
    },
  });
```

- [ ] **Step 3: Manual verify**

1. Start dev server. Create inquiry via `POST /api/portal/inquiries`.
2. Send a client message via `POST /api/portal/tickets/<id>/messages` with `{ body: "hello" }`. Expected: 200, message returned, no admin email sent. DB row has `last_message_at` set.
3. Send an admin message. Expected: 200, no client email. `last_message_at` updated, `admin_nudged_at` is null.
4. Manually `UPDATE tickets SET inquiry_ended_at = now() WHERE id = '<id>';` then try to send another message. Expected: 409 "This chat has ended."
5. Send a regular ticket message (use any existing ticket). Expected: behavior unchanged — email fires.

- [ ] **Step 4: Commit**

```bash
git add app/api/portal/tickets/[id]/messages/route.ts app/api/admin/tickets/[id]/messages/route.ts
git commit -m "feat(inquiry): message handlers update lastMessageAt, clear nudge, skip per-message email on inquiries"
```

---

## Phase 5 — Filter existing queries

### Task 11: Add `isInquiry: false` filters and `inquiryCount` stat

**Files:**
- Modify: `app/admin/tickets/page.tsx`
- Modify: `app/admin/page.tsx`
- Modify: `app/portal/(authed)/dashboard/page.tsx`

- [ ] **Step 1: Filter `/admin/tickets`**

In `app/admin/tickets/page.tsx`, change the `prisma.ticket.findMany` (currently around line 23):

```typescript
  const tickets = await prisma.ticket.findMany({
    where: { isInquiry: false },
    orderBy: { createdAt: "desc" },
    include: {
      site: { select: { displayName: true, url: true } },
      clientAccount: { select: { name: true, email: true } },
    },
  });
```

- [ ] **Step 2: Filter Live Ledger and add `inquiryCount` stat**

In `app/admin/page.tsx`, change the `Promise.all` stats block (currently lines 23–37) to:

```typescript
  const [openCount, awaitingCount, inquiryCount, totalClients, totalSites, recent] =
    await Promise.all([
      prisma.ticket.count({
        where: {
          isInquiry: false,
          status: { in: [...OPEN_STATUSES] },
        },
      }),
      prisma.ticket.count({
        where: { isInquiry: false, status: "AWAITING_CONFIRMATION" },
      }),
      prisma.ticket.count({
        where: { isInquiry: true, inquiryEndedAt: null },
      }),
      prisma.clientAccount.count(),
      prisma.site.count(),
      prisma.ticket.findMany({
        where: { isInquiry: false },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          site: { select: { displayName: true } },
          clientAccount: { select: { name: true } },
        },
      }),
    ]);
```

Then in the stat strip JSX (currently around line 65), replace the four `<Stat>` lines with:

```tsx
        <Stat label="Open Tickets" value={openCount} accent="signal-red" />
        <Stat label="Awaiting Confirm" value={awaitingCount} />
        <Stat label="Open Inquiries" value={inquiryCount} />
        <Stat label="Clients" value={totalClients} />
```

(Drops "Sites" from the headline strip — four stats is the visual cap. `totalSites` is unused now; remove the variable or keep if you prefer to leave room.)

If you prefer to keep Sites: change the grid to `md:grid-cols-5` and add `<Stat label="Sites" value={totalSites} />` back. Christian's call.

- [ ] **Step 3: Filter portal dashboard**

In `app/portal/(authed)/dashboard/page.tsx`, change the `prisma.ticket.findMany` (around line 15) `where` clause to:

```typescript
    where: { clientAccountId: account.id, isInquiry: false },
```

- [ ] **Step 4: Manual verify**

1. Hit `/admin/tickets` with an inquiry in the DB — inquiry must NOT appear.
2. Hit `/admin` (Live Ledger) — Open Tickets count excludes inquiries; Open Inquiries shows the count.
3. Hit `/portal/dashboard` as the inquiry's owning client — inquiry must NOT appear.
4. Promote the inquiry (POST to promote endpoint), then refresh — it appears in `/admin/tickets`, `/portal/dashboard`, and Open Tickets count goes up.

- [ ] **Step 5: Commit**

```bash
git add app/admin/tickets/page.tsx app/admin/page.tsx app/portal/(authed)/dashboard/page.tsx
git commit -m "feat(inquiry): filter inquiries out of ticket queues; add Open Inquiries stat"
```

---

## Phase 6 — Cron jobs

### Task 12: `archive-inquiries` cron route

**Files:**
- Create: `app/api/admin/cron/archive-inquiries/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { endInquiry } from "@/lib/inquiry";

export const dynamic = "force-dynamic";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  // Vercel Cron sets `Authorization: Bearer $CRON_SECRET` automatically.
  // Allow either that or our custom header for manual testing.
  const authHeader = req.headers.get("authorization");
  const customHeader = req.headers.get("x-cron-secret");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set." }, { status: 500 });
  }
  const ok = authHeader === `Bearer ${secret}` || customHeader === secret;
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const stale = await prisma.ticket.findMany({
    where: {
      isInquiry: true,
      inquiryEndedAt: null,
      OR: [
        { lastMessageAt: { lt: cutoff } },
        // Inquiries with no messages yet — use createdAt instead.
        { lastMessageAt: null, createdAt: { lt: cutoff } },
      ],
    },
    select: { id: true },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const results: Array<{ id: string; archived: boolean; error?: string }> = [];
  for (const t of stale) {
    try {
      await endInquiry({ ticketId: t.id, endedBy: "auto", appUrl });
      results.push({ id: t.id, archived: true });
    } catch (err) {
      results.push({
        id: t.id,
        archived: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ scanned: stale.length, results });
}

// Vercel Cron sends GET; accept both for safety.
export const GET = POST;
```

- [ ] **Step 2: Manual verify locally**

Set `CRON_SECRET=devtest` in `.env.local`, restart dev server, then:

```bash
# Create inquiry, then manually backdate it:
psql "$DATABASE_URL" -c "UPDATE tickets SET created_at = now() - interval '8 days', last_message_at = now() - interval '8 days' WHERE is_inquiry = true AND inquiry_ended_at IS NULL;"

curl -X POST http://localhost:3000/api/admin/cron/archive-inquiries \
  -H "x-cron-secret: devtest"
```

Expected: JSON response with `scanned >= 1`, `archived: true` for each. DB row now has `inquiry_ended_at` set. Both transcript emails sent (subject mentions "Auto-archived after 7 days of inactivity").

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/cron/archive-inquiries/route.ts
git commit -m "feat(inquiry): daily auto-archive cron with transcript email"
```

### Task 13: `nudge-waiting-inquiries` cron route

**Files:**
- Create: `app/api/admin/cron/nudge-waiting-inquiries/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWaitingInquiryEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const customHeader = req.headers.get("x-cron-secret");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set." }, { status: 500 });
  }
  const ok = authHeader === `Bearer ${secret}` || customHeader === secret;
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json({ error: "ADMIN_EMAIL not set." }, { status: 500 });
  }

  const cutoff = new Date(Date.now() - ONE_HOUR_MS);

  // Candidate inquiries: active, last message ≥ 1h old, not yet nudged for this state.
  const candidates = await prisma.ticket.findMany({
    where: {
      isInquiry: true,
      inquiryEndedAt: null,
      adminNudgedAt: null,
      lastMessageAt: { lt: cutoff, not: null },
    },
    include: {
      clientAccount: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { senderType: true, body: true, createdAt: true },
      },
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const sent: string[] = [];
  for (const t of candidates) {
    const last = t.messages[0];
    // Only nudge if the last message was from the CLIENT (admin hasn't replied).
    if (!last || last.senderType !== "CLIENT") continue;

    try {
      await sendWaitingInquiryEmail(adminEmail, {
        clientName: t.clientAccount.name,
        ticketUrl: `${appUrl}/admin/ticket/${t.id}`,
        latestMessageBody: last.body || "(attachment only)",
        latestMessageAt: last.createdAt,
      });
      await prisma.ticket.update({
        where: { id: t.id },
        data: { adminNudgedAt: new Date() },
      });
      sent.push(t.id);
    } catch (err) {
      console.error(`[cron] nudge for ${t.id} failed:`, err);
    }
  }

  return NextResponse.json({ scanned: candidates.length, sent });
}

export const GET = POST;
```

- [ ] **Step 2: Manual verify**

```bash
# Backdate an inquiry's last_message_at:
psql "$DATABASE_URL" -c "UPDATE tickets SET last_message_at = now() - interval '70 minutes', admin_nudged_at = NULL WHERE is_inquiry = true AND inquiry_ended_at IS NULL;"

curl -X POST http://localhost:3000/api/admin/cron/nudge-waiting-inquiries \
  -H "x-cron-secret: devtest"
```

Expected: response shows `sent: ["<id>"]`. ADMIN_EMAIL inbox receives a "You have a waiting inquiry from {name}" email. DB row's `admin_nudged_at` is now set.

Run again immediately. Expected: `sent: []` (already nudged). Now send an admin message via the messages endpoint — `admin_nudged_at` clears. Backdate again, run cron — sends a fresh nudge.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/cron/nudge-waiting-inquiries/route.ts
git commit -m "feat(inquiry): 15-min cron to nudge admin on waiting inquiries"
```

### Task 14: Wire crons into `vercel.json`

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Write the cron config**

If `vercel.json` doesn't exist, create it:

```json
{
  "crons": [
    {
      "path": "/api/admin/cron/archive-inquiries",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/admin/cron/nudge-waiting-inquiries",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

(Daily at 9am UTC for archive sweep; every 15 minutes for nudges.)

If a `vercel.json` already exists, merge the `crons` array.

- [ ] **Step 2: Set `CRON_SECRET` in Vercel**

In the Vercel dashboard for the `dispatch` project: Settings → Environment Variables → add `CRON_SECRET` (long random string, generate with `openssl rand -hex 32`). Apply to Production + Preview + Development.

Add the same value to local `.env` for dev testing.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore(inquiry): vercel cron schedules for archive sweep and waiting nudge"
```

After deploy, verify in Vercel dashboard → Project → Crons that both entries appear and the next-run timestamps are sensible.

---

## Phase 7 — Admin UI

### Task 15: `/admin/inquiries` page

**Files:**
- Create: `app/admin/inquiries/page.tsx`
- Create: `app/admin/inquiries/inquiries-refresh.tsx`

- [ ] **Step 1: Write the live-refresh client component**

`app/admin/inquiries/inquiries-refresh.tsx`:

```typescript
"use client";

import { useRealtimeRefresh } from "@/lib/realtime/use-realtime-refresh";

export function InquiriesLiveRefresh() {
  useRealtimeRefresh({ table: "tickets" });
  return null;
}
```

- [ ] **Step 2: Write the page**

`app/admin/inquiries/page.tsx`:

```typescript
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { InquiriesLiveRefresh } from "./inquiries-refresh";

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

function formatRelative(value: Date): string {
  const diff = Date.now() - value.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return value.toLocaleString("en-US", { month: "short", day: "2-digit" });
}

export default async function AdminInquiriesPage({ searchParams }: PageProps) {
  const { tab } = await searchParams;
  const showArchived = tab === "archived";

  const inquiries = await prisma.ticket.findMany({
    where: {
      isInquiry: true,
      ...(showArchived
        ? { inquiryEndedAt: { not: null } }
        : { inquiryEndedAt: null }),
    },
    orderBy: [
      { lastMessageAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    include: {
      clientAccount: { select: { name: true } },
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, senderType: true },
      },
    },
  });

  const [activeCount, archivedCount] = await Promise.all([
    prisma.ticket.count({ where: { isInquiry: true, inquiryEndedAt: null } }),
    prisma.ticket.count({ where: { isInquiry: true, inquiryEndedAt: { not: null } } }),
  ]);

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <InquiriesLiveRefresh />

      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">§</span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">Quick Chat</span>
      </div>

      <h1
        className="font-display text-3xl md:text-5xl leading-none mb-3"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Inquiries
      </h1>
      <p className="font-display italic text-ink-mute mb-8">
        Lightweight quick-chat threads. Promote one to a tracked ticket, or end the chat to archive it.
      </p>

      <div className="flex items-center gap-6 mb-6 border-b border-rule">
        <Link
          href="/admin/inquiries"
          className={`font-mono text-[0.65rem] uppercase tracking-widest pb-2 transition-colors ${
            !showArchived
              ? "text-ink border-b-2 border-signal-red"
              : "text-ink-mute hover:text-ink"
          }`}
        >
          Active ({activeCount})
        </Link>
        <Link
          href="/admin/inquiries?tab=archived"
          className={`font-mono text-[0.65rem] uppercase tracking-widest pb-2 transition-colors ${
            showArchived
              ? "text-ink border-b-2 border-signal-red"
              : "text-ink-mute hover:text-ink"
          }`}
        >
          Archived ({archivedCount})
        </Link>
      </div>

      {inquiries.length === 0 ? (
        <p className="font-display italic text-ink-mute">
          {showArchived ? "Nothing archived yet." : "No active inquiries."}
        </p>
      ) : (
        <ul className="divide-y divide-rule-soft">
          {inquiries.map((t) => {
            const last = t.messages[0];
            const preview = last?.body?.trim().slice(0, 100) ?? "(no messages yet)";
            const lastSenderTag =
              last?.senderType === "CLIENT" ? "client" : last?.senderType === "ADMIN" ? "you" : "—";
            const activity = t.lastMessageAt ?? t.createdAt;
            return (
              <li key={t.id}>
                <Link
                  href={`/admin/ticket/${t.id}`}
                  className="block py-4 hover:bg-parchment-warm/40 transition-colors px-2"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:gap-6">
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-lg text-ink">
                        {t.clientAccount.name}
                      </p>
                      <p className="font-display italic text-ink-mute text-sm mt-1 truncate">
                        <span className="font-mono not-italic text-[0.55rem] uppercase tracking-widest text-ink-fade mr-2">
                          {lastSenderTag}:
                        </span>
                        {preview}
                      </p>
                    </div>
                    <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade md:text-right shrink-0 mt-2 md:mt-0">
                      {t._count.messages} msg{t._count.messages === 1 ? "" : "s"} · {formatRelative(activity)}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manual verify**

Hit `http://localhost:3000/admin/inquiries`. Expected: page renders with Active tab default, lists existing active inquiries with last-message preview. Click "Archived" — switches tab. Send a message in a different browser tab — page auto-refreshes via `useRealtimeRefresh`.

- [ ] **Step 4: Commit**

```bash
git add app/admin/inquiries/
git commit -m "feat(inquiry): /admin/inquiries page with Active and Archived tabs"
```

### Task 16: Add Inquiries to `AdminShell` nav

**Files:**
- Modify: `components/AdminShell.tsx`
- Modify: `app/admin/admin-shell-client.tsx`

- [ ] **Step 1: Update `AdminShell` types and nav**

In `components/AdminShell.tsx`, change the nav-key union type and array. Replace the existing `activeNav`, `onNavigate`, `ADMIN_NAV` lines with:

```typescript
export interface AdminShellProps {
  /** Active nav item key */
  activeNav?: "dashboard" | "inquiries" | "clients" | "invites";
  /** How many clients are currently online (drives the live count badge) */
  onlineClientCount?: number;
  /** Active-inquiry count badge on the Inquiries nav item */
  inquiryCount?: number;
  /** Click handler for nav items */
  onNavigate?: (target: "dashboard" | "inquiries" | "clients" | "invites" | "logout") => void;
  children: ReactNode;
}

const ADMIN_NAV: { key: "dashboard" | "inquiries" | "clients" | "invites"; label: string }[] = [
  { key: "dashboard", label: "Live Ledger" },
  { key: "inquiries", label: "Inquiries" },
  { key: "clients", label: "Clients" },
  { key: "invites", label: "Invites" },
];
```

Then update the function signature/destructuring:

```typescript
export function AdminShell({
  activeNav = "dashboard",
  onlineClientCount = 0,
  inquiryCount = 0,
  onNavigate,
  children,
}: AdminShellProps) {
```

And in the nav `<button>` JSX, render the badge for `inquiries`. Replace the existing nav-button block (currently lines 67–81) with:

```tsx
            {ADMIN_NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate?.(item.key)}
                className={[
                  "font-mono text-[0.6rem] uppercase tracking-widest pb-0.5 transition-colors whitespace-nowrap",
                  activeNav === item.key
                    ? "text-parchment-warm border-b-2 border-signal-red"
                    : "text-parchment-warm/60 hover:text-parchment-warm",
                ].join(" ")}
              >
                {item.label}
                {item.key === "inquiries" && inquiryCount > 0 && (
                  <span className="ml-1.5 inline-block min-w-[1.1rem] px-1 py-px text-center bg-signal-red text-parchment-warm font-mono text-[0.55rem] leading-none">
                    {inquiryCount}
                  </span>
                )}
              </button>
            ))}
```

- [ ] **Step 2: Update the client wrapper to pass the count and handle nav**

In `app/admin/admin-shell-client.tsx`, update `deriveActiveNav` and `onNavigate`:

```typescript
function deriveActiveNav(
  pathname: string,
): "dashboard" | "inquiries" | "clients" | "invites" {
  if (pathname.startsWith("/admin/inquiries")) return "inquiries";
  if (pathname.startsWith("/admin/clients")) return "clients";
  if (pathname.startsWith("/admin/invites")) return "invites";
  return "dashboard";
}
```

And replace `onNavigate`:

```typescript
  async function onNavigate(
    target: "dashboard" | "inquiries" | "clients" | "invites" | "logout",
  ) {
    if (target === "logout") {
      await fetch("/api/portal/auth/logout", { method: "POST" });
      router.push("/portal");
      router.refresh();
      return;
    }
    if (target === "dashboard") router.push("/admin");
    else router.push(`/admin/${target}`);
  }
```

The active-inquiry count badge needs to be live. Add a fetch + state for it. Inside `AdminShellInner`, before the `return`, add:

```typescript
  const [inquiryCount, setInquiryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/admin/inquiries/count", { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { count: number };
          setInquiryCount(data.count);
        }
      } catch {
        /* ignore */
      }
    };
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
```

(Add `useState` and `useEffect` to the React imports at the top of the file.)

Pass `inquiryCount` to `<AdminShell>`:

```tsx
    <AdminShell
      activeNav={deriveActiveNav(pathname)}
      onNavigate={onNavigate}
      onlineClientCount={onlineClients.size}
      inquiryCount={inquiryCount}
    >
```

- [ ] **Step 3: Add the count endpoint**

Create `app/api/admin/inquiries/count/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const count = await prisma.ticket.count({
    where: { isInquiry: true, inquiryEndedAt: null },
  });

  return NextResponse.json({ count });
}
```

- [ ] **Step 4: Manual verify**

Reload `/admin`. Expected: nav has "Inquiries" between "Live Ledger" and "Clients" with a red badge if there are active inquiries. Click it → goes to `/admin/inquiries`. Active tab styling matches other admin pages.

- [ ] **Step 5: Commit**

```bash
git add components/AdminShell.tsx app/admin/admin-shell-client.tsx app/api/admin/inquiries/
git commit -m "feat(inquiry): admin nav adds Inquiries tab with live active-count badge"
```

### Task 17: Branch admin ticket detail on `isInquiry`

When viewing an inquiry on `/admin/ticket/[id]`, hide the status flow and show Promote/End buttons instead.

**Files:**
- Modify: `app/admin/ticket/[id]/page.tsx`
- Modify: `app/admin/ticket/[id]/admin-ticket-detail-client.tsx`

- [ ] **Step 1: Pass `isInquiry` and `inquiryEndedAt` from the server page**

In `app/admin/ticket/[id]/page.tsx`, after the `if (!ticket) notFound();` line, before the `firstViewedAt` block, capture the inquiry flags:

```typescript
  const isInquiry = ticket.isInquiry;
  const inquiryEndedAt = ticket.inquiryEndedAt?.toISOString() ?? null;

  // For inquiries, skip the auto-set-firstViewedAt logic — that's part of the
  // 6-stage status flow which doesn't apply.
  if (!isInquiry && !ticket.firstViewedAt) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { firstViewedAt: new Date() },
    });
    ticket.firstViewedAt = new Date();
  }
```

(Wrap the existing `firstViewedAt` block in the `!isInquiry` check — replace lines 28–34 of `page.tsx` with the above.)

Then update the JSX returned at the bottom to pass `isInquiry` and `inquiryEndedAt`:

```tsx
  return (
    <AdminTicketDetailClient
      ticket={detail}
      ticketAttachments={ticketAttachments}
      messages={messages}
      otherPartyName={ticket.clientAccount.name}
      isInquiry={isInquiry}
      inquiryEndedAt={inquiryEndedAt}
    />
  );
```

- [ ] **Step 2: Read the current client component**

Run: `cat app/admin/ticket/[id]/admin-ticket-detail-client.tsx | head -80`

(So the next step's edit lines up with whatever's there. The plan can't anticipate all current contents — read and adjust.)

- [ ] **Step 3: Add inquiry mode to the client component**

In `admin-ticket-detail-client.tsx`, extend the props and render branched UI. Add to the props interface:

```typescript
  isInquiry?: boolean;
  inquiryEndedAt?: string | null;
```

At the top of the component body, when `isInquiry === true`, render an inquiry header replacing the status pill / status changer / 6-stage timeline blocks. Specifically:

- Hide the `<StatusPill>` element (or replace with `<span>` showing "INQUIRY" in parchment-tan with red border).
- Hide the `<StatusTimeline>` component (entirely skip if `isInquiry`).
- Hide any status-action buttons ("Mark Reviewing", "Mark Fixing", "Mark Fixed").
- Above `<ChatThread>`, render two new buttons (only when `!inquiryEndedAt`):

```tsx
{isInquiry && !inquiryEndedAt && (
  <div className="flex flex-wrap gap-3 mb-6">
    <button
      type="button"
      onClick={onPromote}
      disabled={busy}
      className="px-4 py-2 bg-ink text-parchment-warm font-mono text-[0.65rem] uppercase tracking-widest hover:bg-signal-red transition-colors disabled:opacity-50"
    >
      Promote to ticket →
    </button>
    <button
      type="button"
      onClick={onEndChat}
      disabled={busy}
      className="px-4 py-2 border border-rule font-mono text-[0.65rem] uppercase tracking-widest text-ink-soft hover:border-signal-red hover:text-signal-red transition-colors disabled:opacity-50"
    >
      End chat
    </button>
  </div>
)}

{isInquiry && inquiryEndedAt && (
  <div className="mb-6 px-4 py-3 border border-rule bg-parchment-warm/60 font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
    Chat ended {new Date(inquiryEndedAt).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" })}
  </div>
)}
```

Add these handlers (use `useState` for `busy`, `useRouter` for navigation):

```typescript
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onPromote() {
    if (!confirm("Promote this inquiry to a tracked ticket? It'll appear in the main tickets queue and start the standard status flow.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/promote`, { method: "POST" });
      if (!res.ok) {
        alert("Promote failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onEndChat() {
    if (!confirm("End this chat? It'll move to the archived list, and we'll both get an email transcript.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/end-inquiry`, { method: "POST" });
      if (!res.ok) {
        alert("End chat failed.");
        return;
      }
      router.push("/admin/inquiries");
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 4: Manual verify**

1. Visit `/admin/ticket/<inquiry-id>` — the page shows the "INQUIRY" label, no status timeline, Promote and End-chat buttons visible. ChatThread still works.
2. Click "End chat" → confirm → redirected to `/admin/inquiries`. The inquiry now shows under the Archived tab. Both transcript emails sent.
3. Visit `/admin/ticket/<archived-inquiry-id>` — shows "Chat ended …" banner; Promote/End buttons hidden; ChatThread still rendered (read-only feel; sending a message returns 409).
4. Visit `/admin/ticket/<regular-ticket-id>` — unchanged (still shows status timeline and status changer).
5. Create a fresh inquiry, click "Promote to ticket" → confirm → page refreshes; status pill now shows NEW; timeline appears. Inquiry is gone from `/admin/inquiries` and present at `/admin/tickets`.

- [ ] **Step 5: Commit**

```bash
git add app/admin/ticket/[id]/
git commit -m "feat(inquiry): admin ticket detail branches on isInquiry; promote and end-chat buttons"
```

### Task 18: Update `useTicketsFeed` toast for inquiries

The hook should differentiate inquiry inserts and detect promotion-via-update.

**Files:**
- Modify: `lib/realtime/use-tickets-feed.ts`
- Modify: `app/admin/admin-shell-client.tsx`

- [ ] **Step 1: Extend the hook's row type and event signature**

Replace the contents of `lib/realtime/use-tickets-feed.ts` with:

```typescript
"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export interface RawTicketRow {
  id: string;
  client_account_id: string;
  site_id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  created_at: string;
  is_inquiry?: boolean;
  inquiry_ended_at?: string | null;
}

export interface PromotionEvent {
  id: string;
  title: string;
}

/**
 * Subscribe to tickets-table INSERT and UPDATE events globally.
 * - INSERT → onInsert (with raw row, including is_inquiry flag)
 * - UPDATE where is_inquiry flips true → false → onPromotion
 */
export function useTicketsFeed({
  onInsert,
  onPromotion,
}: {
  onInsert: (row: RawTicketRow) => void;
  onPromotion?: (event: PromotionEvent) => void;
}) {
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;
  const onPromotionRef = useRef(onPromotion);
  onPromotionRef.current = onPromotion;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);

      const channel = supabase
        .channel("admin-tickets-feed")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "tickets" },
          (payload: { new: RawTicketRow }) => {
            onInsertRef.current(payload.new);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "tickets" },
          (payload: { new: RawTicketRow; old: RawTicketRow }) => {
            // Detect promotion: was inquiry, now not.
            const wasInquiry = payload.old.is_inquiry === true;
            const isInquiry = payload.new.is_inquiry === true;
            if (wasInquiry && !isInquiry && onPromotionRef.current) {
              onPromotionRef.current({ id: payload.new.id, title: payload.new.title });
            }
          },
        )
        .subscribe();

      cleanup = () => supabase.removeChannel(channel);
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);
}
```

- [ ] **Step 2: Branch the toast in `admin-shell-client.tsx`**

Replace the existing `useTicketsFeed({ onInsert: ... })` call with:

```typescript
  useTicketsFeed({
    onInsert: (row) => {
      if (row.is_inquiry) {
        pushToast({
          kind: "info",
          title: "💬 New inquiry",
          detail: row.title || "(no preview)",
        });
      } else {
        pushToast({
          kind: "info",
          title: "New ticket filed",
          detail: row.title,
        });
      }
    },
    onPromotion: (event) => {
      pushToast({
        kind: "info",
        title: "Inquiry promoted to ticket",
        detail: event.title || "(untitled)",
      });
    },
  });
```

- [ ] **Step 3: Manual verify**

1. Open `/admin` in one browser, sign in as admin.
2. In another browser/incognito, sign in as a client and `POST /api/portal/inquiries`. Expected: admin browser shows "💬 New inquiry" toast.
3. From the client, send a message via `POST /api/portal/tickets/<id>/messages`. Expected: no toast on admin (we don't toast on every message — that's intentional; matches existing per-message toast suppression).
4. Promote the inquiry. Expected: admin browser shows "Inquiry promoted to ticket" toast.

- [ ] **Step 4: Commit**

```bash
git add lib/realtime/use-tickets-feed.ts app/admin/admin-shell-client.tsx
git commit -m "feat(inquiry): toast distinguishes inquiry inserts and promotion updates"
```

---

## Phase 8 — Client UI (the launcher)

### Task 19: Build `<QuickChatLauncher>`

**Files:**
- Create: `app/portal/(authed)/quick-chat-launcher.tsx`

- [ ] **Step 1: Write the component**

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ChatThread, type ChatMessage, type ChatAttachment } from "@/components/ChatThread";
import { useTicketChannel } from "@/lib/realtime/use-ticket-channel";

type LauncherState =
  | { kind: "collapsed" }
  | { kind: "loading" }
  | { kind: "open"; ticketId: string; messages: ChatMessage[]; ended: boolean }
  | { kind: "promoted"; ticketId: string }
  | { kind: "error"; message: string };

export function QuickChatLauncher() {
  const [state, setState] = useState<LauncherState>({ kind: "collapsed" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; endedAt: string; messageCount: number }>>([]);
  const [busy, setBusy] = useState(false);

  const ticketIdRef = useRef<string | null>(null);
  if (state.kind === "open") ticketIdRef.current = state.ticketId;

  const open = useCallback(async () => {
    setMenuOpen(false);
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/portal/inquiries", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState({ kind: "error", message: data.error ?? "Couldn't start a chat." });
        return;
      }
      const data = (await res.json()) as { ticketId: string; messages: ChatMessage[] };
      setState({ kind: "open", ticketId: data.ticketId, messages: data.messages, ended: false });
    } catch {
      setState({ kind: "error", message: "Network error." });
    }
  }, []);

  const collapse = useCallback(() => {
    setState({ kind: "collapsed" });
    setMenuOpen(false);
    setHistoryOpen(false);
  }, []);

  const sendMessage = useCallback(
    async (data: { body: string; attachments: ChatAttachment[] }) => {
      const ticketId = ticketIdRef.current;
      if (!ticketId) return;
      const res = await fetch(`/api/portal/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: data.body,
          attachments: data.attachments.map((a) => ({
            filename: a.filename,
            path: a.path,
            contentType: a.contentType,
            sizeBytes: a.sizeBytes,
          })),
        }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          setState((s) => (s.kind === "open" ? { ...s, ended: true } : s));
        }
        throw new Error("Send failed.");
      }
      const payload = (await res.json()) as { message: ChatMessage };
      setState((s) =>
        s.kind === "open"
          ? { ...s, messages: [...s.messages, payload.message] }
          : s,
      );
    },
    [],
  );

  const promote = async () => {
    if (state.kind !== "open") return;
    if (!confirm("Promote this chat to a tracked ticket? You'll be able to follow its progress on your dashboard.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/tickets/${state.ticketId}/promote`, { method: "POST" });
      if (!res.ok) {
        alert("Promote failed.");
        return;
      }
      setState({ kind: "promoted", ticketId: state.ticketId });
      setMenuOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const endChat = async () => {
    if (state.kind !== "open") return;
    if (!confirm("End this chat? Your history stays viewable, and we'll both get an email transcript.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/tickets/${state.ticketId}/end-inquiry`, { method: "POST" });
      if (!res.ok) {
        alert("End chat failed.");
        return;
      }
      collapse();
    } finally {
      setBusy(false);
    }
  };

  const loadHistory = async () => {
    setHistoryOpen(true);
    setMenuOpen(false);
    try {
      const res = await fetch("/api/portal/inquiries/history");
      if (!res.ok) return;
      const data = (await res.json()) as { items: typeof history };
      setHistory(data.items);
    } catch {
      /* ignore */
    }
  };

  // Live updates while the panel is open. The hook returns RawMessageRow (snake_case DB shape)
  // — to keep this launcher simple we just refetch the inquiry on admin inserts (idempotent,
  // returns fully hydrated ChatMessages with attachments and senderName resolved). This avoids
  // duplicating the row-to-ChatMessage conversion logic that lives server-side.
  const activeTicketId = state.kind === "open" ? state.ticketId : "";
  useTicketChannel({
    ticketId: activeTicketId,
    viewerSide: "CLIENT",
    onMessageInsert: (row) => {
      if (row.sender_type === "CLIENT") return; // we already appended optimistically
      // Refetch the inquiry's hydrated message list.
      void fetch("/api/portal/inquiries", { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { ticketId: string; messages: ChatMessage[] } | null) => {
          if (!data) return;
          setState((s) =>
            s.kind === "open" && s.ticketId === data.ticketId
              ? { ...s, messages: data.messages }
              : s,
          );
        });
    },
  });

  // Collapsed state — floating button.
  if (state.kind === "collapsed") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="Have a question?"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-parchment-warm border-2 border-signal-red text-signal-red shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
      >
        <span className="text-2xl">💬</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-2rem)] bg-parchment-warm border border-rule shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-rule bg-ink text-parchment-warm">
        <div className="font-mono text-[0.65rem] uppercase tracking-widest">
          Quick chat
        </div>
        <div className="flex items-center gap-2">
          {state.kind === "open" && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="px-2 py-1 hover:text-signal-red transition-colors"
                aria-label="Chat options"
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="absolute top-full right-0 mt-1 w-48 bg-parchment-warm text-ink border border-rule shadow-lg z-10">
                  <button
                    type="button"
                    onClick={promote}
                    disabled={busy}
                    className="block w-full text-left px-3 py-2 font-mono text-[0.6rem] uppercase tracking-widest hover:bg-parchment-deep transition-colors disabled:opacity-50"
                  >
                    Promote to ticket
                  </button>
                  <button
                    type="button"
                    onClick={endChat}
                    disabled={busy}
                    className="block w-full text-left px-3 py-2 font-mono text-[0.6rem] uppercase tracking-widest hover:bg-parchment-deep transition-colors disabled:opacity-50"
                  >
                    End chat
                  </button>
                  <button
                    type="button"
                    onClick={loadHistory}
                    className="block w-full text-left px-3 py-2 font-mono text-[0.6rem] uppercase tracking-widest hover:bg-parchment-deep transition-colors border-t border-rule-soft"
                  >
                    View past chats
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={collapse}
            className="px-2 py-1 hover:text-signal-red transition-colors"
            aria-label="Close panel"
          >
            ×
          </button>
        </div>
      </div>

      {/* Body */}
      {state.kind === "loading" && (
        <div className="flex-1 flex items-center justify-center font-display italic text-ink-mute">
          Loading…
        </div>
      )}

      {state.kind === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p className="font-display italic text-ink-mute mb-4">{state.message}</p>
          <button
            type="button"
            onClick={open}
            className="px-3 py-2 border border-rule font-mono text-[0.6rem] uppercase tracking-widest hover:border-signal-red hover:text-signal-red transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {state.kind === "promoted" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <p className="font-display text-lg text-ink">This chat is now a tracked ticket.</p>
          <Link
            href={`/portal/ticket/${state.ticketId}`}
            className="px-4 py-2 bg-ink text-parchment-warm font-mono text-[0.65rem] uppercase tracking-widest hover:bg-signal-red transition-colors"
          >
            Open the ticket →
          </Link>
          <button
            type="button"
            onClick={collapse}
            className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-ink transition-colors"
          >
            Close
          </button>
        </div>
      )}

      {state.kind === "open" && (
        <>
          {state.messages.length === 0 && !state.ended && (
            <div className="px-4 py-3 bg-parchment-deep/40 border-b border-rule-soft font-display italic text-ink-mute text-sm">
              This is a quick chat. If it turns into something we need to track, either of us can promote it to a ticket.
            </div>
          )}
          {state.ended && (
            <div className="px-4 py-3 bg-parchment-deep border-b border-rule-soft font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
              This chat has ended. Close and reopen the launcher to start a new one.
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <ChatThread
              messages={state.messages}
              viewerType="client"
              otherPartyName="Christian"
              onSendMessage={state.ended ? undefined : sendMessage}
              className="h-full"
            />
          </div>
        </>
      )}

      {historyOpen && (
        <div className="absolute inset-0 bg-parchment-warm overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-rule">
            <div className="font-mono text-[0.65rem] uppercase tracking-widest">Past chats</div>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="px-2 py-1 hover:text-signal-red transition-colors"
              aria-label="Close history"
            >
              ×
            </button>
          </div>
          {history.length === 0 ? (
            <p className="px-4 py-6 font-display italic text-ink-mute">No past chats yet.</p>
          ) : (
            <ul className="divide-y divide-rule-soft">
              {history.map((h) => (
                <li key={h.id} className="px-4 py-3">
                  <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                    {new Date(h.endedAt).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric" })}
                  </div>
                  <div className="font-display text-sm text-ink">
                    {h.messageCount} message{h.messageCount === 1 ? "" : "s"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the history endpoint**

Create `app/api/portal/inquiries/history/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";

export async function GET() {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const items = await prisma.ticket.findMany({
    where: {
      clientAccountId: account.id,
      isInquiry: true,
      inquiryEndedAt: { not: null },
    },
    orderBy: { inquiryEndedAt: "desc" },
    take: 20,
    select: {
      id: true,
      inquiryEndedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({
    items: items.map((t) => ({
      id: t.id,
      endedAt: t.inquiryEndedAt!.toISOString(),
      messageCount: t._count.messages,
    })),
  });
}
```

- [ ] **Step 3: Mount the launcher in the authed portal layout**

In `app/portal/(authed)/layout.tsx`, import the launcher and render it inside `<PortalShellClient>`:

```typescript
import { redirect } from "next/navigation";
import { getCurrentAuthUser, getCurrentClientAccount, isAdmin } from "@/lib/auth/client-session";
import { PortalShellClient } from "../portal-shell-client";
import { QuickChatLauncher } from "./quick-chat-launcher";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/portal");
  if (isAdmin(user)) redirect("/admin");

  const account = await getCurrentClientAccount();
  if (!account) {
    redirect("/api/portal/auth/logout");
  }

  return (
    <PortalShellClient
      user={{ id: account.id, name: account.name, email: account.email }}
    >
      {children}
      <QuickChatLauncher />
    </PortalShellClient>
  );
}
```

- [ ] **Step 4: Manual verify**

1. Sign in to `/portal/dashboard` as a client. Expected: 💬 button bottom-right.
2. Click it → panel opens with empty `<ChatThread>` and the parchment intro banner.
3. Send "hello" — message appears.
4. In another tab signed in as admin, open `/admin/inquiries` → see the inquiry; click into it → reply in the ChatThread. Back on the client tab: admin's message appears in real time (via `useTicketChannel`).
5. Kebab → "Promote to ticket" → confirm → panel shows "This chat is now a tracked ticket." Open `/portal/dashboard` → ticket is there.
6. Reopen launcher (it's now empty/fresh). Send "another question". Kebab → "End chat" → confirm → panel collapses. Both inboxes receive transcript email.
7. Reopen launcher → fresh empty inquiry. Kebab → "View past chats" → list shows the just-ended chat.
8. Verify no per-message emails were sent during steps 3–4 or 6.

- [ ] **Step 5: Commit**

```bash
git add app/portal/\(authed\)/quick-chat-launcher.tsx app/portal/\(authed\)/layout.tsx app/api/portal/inquiries/history/
git commit -m "feat(inquiry): floating QuickChatLauncher with promote, end-chat, history"
```

---

## Phase 9 — End-to-end verification

### Task 20: Full smoke test

- [ ] **Step 1: Start fresh**

```bash
psql "$DATABASE_URL" -c "DELETE FROM messages WHERE ticket_id IN (SELECT id FROM tickets WHERE is_inquiry = true); DELETE FROM tickets WHERE is_inquiry = true;"
```

- [ ] **Step 2: Run the full happy path in a real browser**

Open two browser profiles (or one normal + one incognito):
- A: signed in as Christian on `/admin`
- B: signed in as a test client on `/portal/dashboard`

Run through:

1. **B** clicks the 💬 launcher → panel opens, intro banner visible.
2. **B** sends "Hi! Quick question — what time zone do you operate in?".
3. **A** Live Ledger shows "💬 New inquiry" toast. Open Inquiries stat = 1.
4. **A** clicks Inquiries nav → list shows the new inquiry. Click into it → page shows "INQUIRY" label, NO status timeline, Promote/End buttons.
5. **A** types a reply in the ChatThread. **B**'s panel shows the reply in realtime.
6. **B** keeps the panel open. Verify no email has arrived for either side yet.
7. **A** clicks "End chat" → confirm → redirected to `/admin/inquiries` Active tab (now empty). Both **A** and **B** receive transcript email within ~1 minute (subject: "Inquiry transcript — {clientName} — {date}", body lists both messages).
8. Switch to Archived tab on `/admin/inquiries` → the chat is there.
9. **B** reopens launcher → fresh empty inquiry. Sends "another question". Kebab → "View past chats" → shows the previous archived chat.
10. **B** clicks Promote → confirm → panel shows "This chat is now a tracked ticket." `/portal/dashboard` shows it. `/admin/tickets` shows it. **A** sees "Inquiry promoted to ticket" toast.

- [ ] **Step 3: Run the cron paths**

```bash
# Backdate to test auto-archive:
psql "$DATABASE_URL" -c "UPDATE tickets SET created_at = now() - interval '8 days', last_message_at = now() - interval '8 days' WHERE is_inquiry = true AND inquiry_ended_at IS NULL;"
curl -X POST http://localhost:3000/api/admin/cron/archive-inquiries -H "x-cron-secret: $CRON_SECRET"
# Expect: archived, transcript email mentions "Auto-archived after 7 days of inactivity".

# Backdate to test waiting nudge:
# (First make sure there's an active inquiry where the last message is from the CLIENT.)
psql "$DATABASE_URL" -c "UPDATE tickets SET last_message_at = now() - interval '70 minutes', admin_nudged_at = NULL WHERE is_inquiry = true AND inquiry_ended_at IS NULL;"
curl -X POST http://localhost:3000/api/admin/cron/nudge-waiting-inquiries -H "x-cron-secret: $CRON_SECRET"
# Expect: admin email "You have a waiting inquiry from {name}".
# Run again immediately — sent: [] (already nudged).
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors. Fix any that pop up before merging.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: clean build. Address any TypeScript errors.

- [ ] **Step 6: Final commit and merge**

If all checks pass, on `client-portal`:

```bash
git log --oneline main..HEAD
```

Review the commits. Then per the workflow in [memory/dispatch_inquiry_feature_handoff.md](../../../.claude/projects/-Users-christiantraxler-Desktop-Current-Projects-Dispatch/memory/dispatch_inquiry_feature_handoff.md): fast-forward `main`, push both branches, Vercel deploys to production.

```bash
git checkout main && git merge --ff-only client-portal && git push origin main && git push origin client-portal && git checkout client-portal
```

In Vercel, after deploy, set `CRON_SECRET` env var and verify the two cron entries appear under Project → Crons.

- [ ] **Step 7: Update the handoff memory**

Update `memory/dispatch_inquiry_feature_handoff.md` to mark the feature as shipped (or remove the file and add a brief project memory: "Inquiry feature shipped 2026-05-XX — see `docs/plans/2026-05-06-dispatch-inquiry-feature-design.md` for the spec.").

---

## File summary

### Created
- `prisma/migrations/<ts>_inquiry_fields/migration.sql`
- `lib/inquiry.ts`
- `app/api/portal/inquiries/route.ts`
- `app/api/portal/inquiries/history/route.ts`
- `app/api/portal/tickets/[id]/end-inquiry/route.ts`
- `app/api/portal/tickets/[id]/promote/route.ts`
- `app/api/admin/tickets/[id]/end-inquiry/route.ts`
- `app/api/admin/tickets/[id]/promote/route.ts`
- `app/api/admin/inquiries/count/route.ts`
- `app/api/admin/cron/archive-inquiries/route.ts`
- `app/api/admin/cron/nudge-waiting-inquiries/route.ts`
- `app/admin/inquiries/page.tsx`
- `app/admin/inquiries/inquiries-refresh.tsx`
- `app/portal/(authed)/quick-chat-launcher.tsx`
- `vercel.json` (or merge into existing)

### Modified
- `prisma/schema.prisma`
- `lib/email-templates.ts`
- `lib/email.ts`
- `lib/realtime/use-tickets-feed.ts`
- `app/api/portal/tickets/[id]/messages/route.ts`
- `app/api/admin/tickets/[id]/messages/route.ts`
- `app/admin/tickets/page.tsx`
- `app/admin/page.tsx`
- `app/portal/(authed)/dashboard/page.tsx`
- `app/admin/ticket/[id]/page.tsx`
- `app/admin/ticket/[id]/admin-ticket-detail-client.tsx`
- `app/admin/admin-shell-client.tsx`
- `components/AdminShell.tsx`
- `app/portal/(authed)/layout.tsx`

### Configuration
- `CRON_SECRET` env var (Vercel + local)
