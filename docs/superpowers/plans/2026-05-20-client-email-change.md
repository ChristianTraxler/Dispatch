# Client Email Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let clients change their own email via a verified self-serve flow, and let admins override any client's email directly (no verification) as a recovery path when a client has lost access to their old inbox.

**Architecture:** A new `EmailChangeRequest` model holds pending changes with a hashed token. Self-serve requires the current password, sends a verification link to the new address, notifies the old address on both request and confirmation, and on confirm updates Supabase Auth first then Prisma, then signs the user out of all sessions. Admin override skips verification entirely; the admin session is the trust anchor. Email is the login identity, so every successful change forces a re-login.

**Tech Stack:** Next.js 16 (app router), Prisma 5, Postgres (Supabase), Supabase Auth (service role), Resend, TypeScript, Tailwind. No test runner is configured — verification is via `npx tsc --noEmit`, `npm run lint`, and runtime smoke tests against the dev server.

**Design doc:** `docs/plans/2026-05-20-client-email-change-design.md`

---

## Pre-flight context the implementer needs

- **This is NOT vanilla Next.js.** Read `node_modules/next/dist/docs/` if anything looks unfamiliar — APIs and conventions may differ from training data. Heed deprecation notices. (Per `AGENTS.md`.)
- **Two auth systems coexist.** Client portal routes use Supabase Auth via `getCurrentClientAccount()` from `lib/auth/client-session.ts`. Admin routes use `requireAdmin()` from `lib/auth/admin-guard.ts`, which is layered on top of Supabase Auth (it checks `user.app_metadata.role === "admin"`). All admin email-override endpoints in this plan use `requireAdmin`.
- **Service-role Supabase client:** `supabaseAdmin()` from `lib/supabase/admin.ts`. Use it for `auth.admin.updateUserById` and `auth.admin.signOut`. Lazy — only instantiates on first call.
- **Email infrastructure:** Templates live in `lib/email-templates.ts` as pure `render*` functions returning `{ subject, html, text }`. Send wrappers live in `lib/email.ts` using `Resend`. Templates reuse the `shell()` / `headline()` / `bodyText()` / `button()` helpers at the top of `email-templates.ts`. Do not invent new style primitives.
- **`.env` is gitignored and was NOT copied into the worktree.** Schema migrations for this feature should be **created** with `npx prisma migrate dev --create-only` (so the SQL is generated and committed) but NOT applied here — Christian applies them against the real DB. If `prisma migrate dev --create-only` errors due to missing env, copy `.env` from the parent checkout (`cp ../../../.env .`) before running. **Do not Read the .env file** — per project memory, reading it forces a credential rotation.
- **Local DB IS prod.** Do not run `prisma migrate dev` (without `--create-only`), do not run `prisma db push`, do not run any seeds against the local checkout. Generation is safe; application is not.
- **Design language:** Fraunces display, JetBrains Mono labels, parchment surfaces, signal-red accent. Match existing client account UI (`app/portal/(authed)/account/account-client.tsx`) and admin clients UI (`components/AdminClientsPage.tsx`).
- **Working tree is a worktree at** `.claude/worktrees/client-email-change` **on branch** `worktree-client-email-change`. All commits go to that branch.
- **No test runner is configured.** Every task ends with `npx tsc --noEmit` and (where UI changes) `npm run lint`. Manual smoke testing is captured at the end in Task 12.

---

## File map

### New files

- `lib/email-change.ts` — shared token helpers (generate, hash, lookup, sweep).
- `app/api/portal/account/email/request/route.ts` — POST: start a self-serve change.
- `app/api/portal/account/email/cancel/route.ts` — POST: cancel pending self-serve change.
- `app/api/portal/account/email/pending/route.ts` — GET: read current pending state.
- `app/portal/account/verify-email/page.tsx` — server component: consume token, swap email, sign out, render success/error.
- `app/api/admin/clients/[id]/email/route.ts` — PATCH: admin override.

### Modified files

- `prisma/schema.prisma` — add `EmailChangeRequest` model and back-relation on `ClientAccount`.
- `prisma/migrations/<timestamp>_email_change_requests/migration.sql` — generated.
- `lib/email-templates.ts` — add four `render*` functions and their param types.
- `lib/email.ts` — add four `send*` wrappers.
- `app/portal/(authed)/account/page.tsx` — fetch pending request, pass to client component.
- `app/portal/(authed)/account/account-client.tsx` — replace read-only email copy with the new change-email section + pending banner.
- `components/AdminClientsPage.tsx` — add an inline edit affordance on each client row + form state.
- `app/admin/clients/clients-list-client.tsx` — pass a save handler that calls the new admin PATCH endpoint.

---

## Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_email_change_requests/migration.sql` (generated)

- [ ] **Step 1: Add `EmailChangeRequest` model to schema**

Add this model at the bottom of `prisma/schema.prisma` (after the existing models, before any trailing comments):

```prisma
model EmailChangeRequest {
  id              String    @id @default(cuid())
  clientAccountId String    @map("client_account_id")
  newEmail        String    @map("new_email")
  tokenHash       String    @unique @map("token_hash")
  expiresAt       DateTime  @map("expires_at")
  consumedAt      DateTime? @map("consumed_at")
  createdAt       DateTime  @default(now()) @map("created_at")

  clientAccount ClientAccount @relation(fields: [clientAccountId], references: [id], onDelete: Cascade)

  @@index([clientAccountId])
  @@index([newEmail])
  @@map("email_change_requests")
}
```

- [ ] **Step 2: Add back-relation on `ClientAccount`**

In the existing `ClientAccount` model, add a back-relation line next to the existing `sites` and `tickets` relations:

```prisma
emailChangeRequests EmailChangeRequest[]
```

- [ ] **Step 3: Generate the migration SQL (do not apply)**

If `.env` is missing in the worktree, copy it first:

```bash
cp ../../../.env .
```

Then generate:

```bash
npx prisma migrate dev --create-only --name email_change_requests
```

Expected: a new folder `prisma/migrations/<timestamp>_email_change_requests/` containing `migration.sql` with a `CREATE TABLE "email_change_requests"` statement, a unique index on `token_hash`, and two regular indexes.

If the command fails with "Database connection refused" or similar, the schema is still valid — generation failed but the schema edit is committable. In that case, ask the user to apply manually later. Do **not** run `prisma migrate dev` without `--create-only`.

- [ ] **Step 4: Regenerate the Prisma client**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client`.

- [ ] **Step 5: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors. (The new model is now visible on `prisma.emailChangeRequest`.)

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add EmailChangeRequest model for self-serve email change

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Shared token helpers (`lib/email-change.ts`)

**Files:**
- Create: `lib/email-change.ts`

- [ ] **Step 1: Create the helper module**

Create `lib/email-change.ts` with this exact content:

```typescript
import "server-only";

import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_BYTES = 32;
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const hash = hashToken(raw);
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function expiryFromNow(): Date {
  return new Date(Date.now() + EXPIRY_MS);
}

/**
 * Look up a pending request by raw token. Returns null if missing, expired,
 * or already consumed — callers should treat all three as the same generic
 * "invalid or expired" error.
 */
export async function findValidRequest(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const row = await prisma.emailChangeRequest.findUnique({
    where: { tokenHash },
  });
  if (!row) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

/**
 * Returns the current pending (not consumed, not expired) request for this
 * account, or null. Used by the Account page banner.
 */
export async function getPendingForAccount(clientAccountId: string) {
  const row = await prisma.emailChangeRequest.findFirst({
    where: {
      clientAccountId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  return row;
}

/**
 * Returns true if `newEmail` is currently claimed by another account's
 * pending request. Used to prevent two accounts racing to the same target.
 */
export async function isEmailPendingElsewhere(
  newEmail: string,
  excludeAccountId: string,
): Promise<boolean> {
  const row = await prisma.emailChangeRequest.findFirst({
    where: {
      newEmail,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      NOT: { clientAccountId: excludeAccountId },
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Per-account rate limit for self-serve requests. In-memory bucket; fine for
 * the current scale (single Vercel deployment, low concurrency). Resets on
 * cold start.
 */
const REQUEST_LIMIT = 5;
const REQUEST_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const requestHits = new Map<string, number[]>();

export function checkAndRecordRequestRate(clientAccountId: string): boolean {
  const now = Date.now();
  const cutoff = now - REQUEST_WINDOW_MS;
  const hits = (requestHits.get(clientAccountId) ?? []).filter((t) => t > cutoff);
  if (hits.length >= REQUEST_LIMIT) {
    requestHits.set(clientAccountId, hits);
    return false;
  }
  hits.push(now);
  requestHits.set(clientAccountId, hits);
  return true;
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/email-change.ts
git commit -m "feat(email-change): add token helpers and rate limit

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Email templates (4 new render functions)

**Files:**
- Modify: `lib/email-templates.ts`

- [ ] **Step 1: Append four new param types and render functions to `lib/email-templates.ts`**

Append the following code at the bottom of `lib/email-templates.ts` (after the existing `renderInviteReminderEmail` function). The helpers `shell`, `sectionLabel`, `headline`, `lede`, `bodyText`, `dataTable`, `dataRow`, `button`, `quoteBlock`, `escape`, and `plainTextFooter` already exist at the top of the file — do not redeclare them.

```typescript
/* ============================================
   10. EMAIL CHANGE — VERIFY (to new address)
   ============================================ */
export interface EmailChangeVerifyEmailParams {
  newEmail: string;
  oldEmail: string;
  verifyUrl: string;
  expiresAt: Date | string;
}

export function renderEmailChangeVerifyEmail(
  p: EmailChangeVerifyEmailParams,
): { subject: string; html: string; text: string } {
  const expiresAt = typeof p.expiresAt === "string" ? new Date(p.expiresAt) : p.expiresAt;
  const expiresStr = expiresAt.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });

  const body = `
${sectionLabel("VERIFY NEW EMAIL")}
${headline(`Confirm this address`)}
${lede(`Someone signed in as <strong>${escape(p.oldEmail)}</strong> asked to change their Dispatch login to this email.`)}

${bodyText(`To finish the change, click the button below. The link expires at ${expiresStr}.`)}

${button({ href: p.verifyUrl, label: "Verify this email →" })}

${bodyText(`<span style="font-size:13px;">Or copy this link: <br><span style="font-family:Menlo,monospace;font-size:12px;word-break:break-all;">${escape(p.verifyUrl)}</span></span>`)}

${bodyText(`<strong>If you didn't request this</strong>, you can safely ignore this email — nothing will change.`)}

${bodyText(`— Christian`)}
  `.trim();

  const html = shell({
    title: "Verify your new Dispatch email",
    preheader: `Confirm this address as your new Dispatch login. Expires ${expiresStr}.`,
    body,
  });

  const text = `Someone signed in as ${p.oldEmail} asked to change their Dispatch login to this email.

To finish the change, open this link before ${expiresStr}:

${p.verifyUrl}

If you didn't request this, ignore this email — nothing will change.

— Christian${plainTextFooter()}`;

  return {
    subject: "Verify your new Dispatch email",
    html,
    text,
  };
}

/* ============================================
   11. EMAIL CHANGE — REQUESTED (to old address)
   ============================================ */
export interface EmailChangeRequestedEmailParams {
  oldEmail: string;
  newEmail: string;
}

export function renderEmailChangeRequestedEmail(
  p: EmailChangeRequestedEmailParams,
): { subject: string; html: string; text: string } {
  const body = `
${sectionLabel("EMAIL CHANGE REQUESTED")}
${headline(`Heads up`)}
${lede(`We received a request to change your Dispatch login.`)}

${dataTable(`
${dataRow("From", `<span style="font-family:Menlo,monospace;font-size:13px;">${escape(p.oldEmail)}</span>`)}
${dataRow("To", `<span style="font-family:Menlo,monospace;font-size:13px;">${escape(p.newEmail)}</span>`)}
`)}

${bodyText(`We sent a verification link to the new address. The change won't take effect until that link is clicked.`)}

${bodyText(`<strong>If this wasn't you:</strong> sign in to Dispatch and cancel the pending change from your Account page, or reply to this email so we can lock the account.`)}

${bodyText(`— Christian`)}
  `.trim();

  const html = shell({
    title: "Email change requested on your Dispatch account",
    preheader: `A request was made to change your login from ${p.oldEmail} to ${p.newEmail}.`,
    body,
  });

  const text = `We received a request to change your Dispatch login from ${p.oldEmail} to ${p.newEmail}.

We sent a verification link to the new address. The change won't take effect until that link is clicked.

If this wasn't you: sign in to Dispatch and cancel the pending change from your Account page, or reply to this email.

— Christian${plainTextFooter()}`;

  return {
    subject: "Email change requested on your Dispatch account",
    html,
    text,
  };
}

/* ============================================
   12. EMAIL CHANGE — COMPLETED (to old address)
   ============================================ */
export interface EmailChangeCompletedEmailParams {
  oldEmail: string;
  newEmail: string;
  changedAt: Date | string;
}

export function renderEmailChangeCompletedEmail(
  p: EmailChangeCompletedEmailParams,
): { subject: string; html: string; text: string } {
  const changedAt = typeof p.changedAt === "string" ? new Date(p.changedAt) : p.changedAt;
  const dateStr = changedAt.toLocaleString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const body = `
${sectionLabel("EMAIL CHANGED")}
${headline(`Your login was updated`)}
${lede(`Your Dispatch account email was changed.`)}

${dataTable(`
${dataRow("New email", `<span style="font-family:Menlo,monospace;font-size:13px;">${escape(p.newEmail)}</span>`)}
${dataRow("Changed", dateStr)}
`)}

${bodyText(`You've been signed out of all sessions. Use the new address to sign in from here on.`)}

${bodyText(`<strong>If this wasn't you</strong>, reply to this email immediately — we can revert the change.`)}

${bodyText(`— Christian`)}
  `.trim();

  const html = shell({
    title: "Your Dispatch email was changed",
    preheader: `Your Dispatch login was changed to ${p.newEmail} on ${dateStr}.`,
    body,
  });

  const text = `Your Dispatch account email was changed to ${p.newEmail} on ${dateStr}.

You've been signed out of all sessions. Use the new address to sign in from here on.

If this wasn't you, reply to this email immediately — we can revert the change.

— Christian${plainTextFooter()}`;

  return {
    subject: "Your Dispatch email was changed",
    html,
    text,
  };
}

/* ============================================
   13. EMAIL CHANGE — UPDATED BY ADMIN (to new address)
   ============================================ */
export interface EmailChangeByAdminEmailParams {
  newEmail: string;
  loginUrl: string;
}

export function renderEmailChangeByAdminEmail(
  p: EmailChangeByAdminEmailParams,
): { subject: string; html: string; text: string } {
  const body = `
${sectionLabel("EMAIL UPDATED")}
${headline(`Your login was changed`)}
${lede(`Your Dispatch login was updated by an administrator to this email.`)}

${bodyText(`You've been signed out of all sessions. Use this address to sign in from here on.`)}

${button({ href: p.loginUrl, label: "Sign in →" })}

${bodyText(`If you didn't expect this change, reply to this email and we'll sort it out.`)}

${bodyText(`— Christian`)}
  `.trim();

  const html = shell({
    title: "Your Dispatch login was updated",
    preheader: `Your Dispatch login was updated by an administrator to ${p.newEmail}.`,
    body,
  });

  const text = `Your Dispatch login was updated by an administrator to ${p.newEmail}.

You've been signed out of all sessions. Sign in here: ${p.loginUrl}

If you didn't expect this change, reply to this email.

— Christian${plainTextFooter()}`;

  return {
    subject: "Your Dispatch login was updated",
    html,
    text,
  };
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/email-templates.ts
git commit -m "feat(email): add four email-change templates

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Email send wrappers (`lib/email.ts`)

**Files:**
- Modify: `lib/email.ts`

- [ ] **Step 1: Import the new templates**

Find the existing import block in `lib/email.ts` (the long `import { ... } from "@/lib/email-templates"`) and add the four new renderers and their param types. The updated import should include:

```typescript
import {
  renderInviteEmail,
  renderNewTicketEmail,
  renderNewMessageToAdminEmail,
  renderNewMessageToClientEmail,
  renderAwaitingConfirmationEmail,
  renderTicketReopenedEmail,
  renderInquiryTranscriptEmail,
  renderWaitingInquiryEmail,
  renderInviteReminderEmail,
  renderEmailChangeVerifyEmail,
  renderEmailChangeRequestedEmail,
  renderEmailChangeCompletedEmail,
  renderEmailChangeByAdminEmail,
  type InviteEmailParams,
  type NewTicketEmailParams,
  type NewMessageToAdminEmailParams,
  type NewMessageToClientEmailParams,
  type AwaitingConfirmationEmailParams,
  type TicketReopenedEmailParams,
  type InquiryTranscriptEmailParams,
  type WaitingInquiryEmailParams,
  type InviteReminderEmailParams,
  type EmailChangeVerifyEmailParams,
  type EmailChangeRequestedEmailParams,
  type EmailChangeCompletedEmailParams,
  type EmailChangeByAdminEmailParams,
} from "@/lib/email-templates";
```

- [ ] **Step 2: Append the four send wrappers at the end of the file**

Append these functions to the bottom of `lib/email.ts`:

```typescript
export async function sendEmailChangeVerifyEmail(
  to: string,
  params: EmailChangeVerifyEmailParams,
) {
  const { subject, html, text } = renderEmailChangeVerifyEmail(params);
  return send({ to, subject, html, text });
}

export async function sendEmailChangeRequestedEmail(
  to: string,
  params: EmailChangeRequestedEmailParams,
) {
  const { subject, html, text } = renderEmailChangeRequestedEmail(params);
  return send({ to, subject, html, text });
}

export async function sendEmailChangeCompletedEmail(
  to: string,
  params: EmailChangeCompletedEmailParams,
) {
  const { subject, html, text } = renderEmailChangeCompletedEmail(params);
  return send({ to, subject, html, text });
}

export async function sendEmailChangeByAdminEmail(
  to: string,
  params: EmailChangeByAdminEmailParams,
) {
  const { subject, html, text } = renderEmailChangeByAdminEmail(params);
  return send({ to, subject, html, text });
}
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/email.ts
git commit -m "feat(email): add send wrappers for email-change templates

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Self-serve request endpoint

**Files:**
- Create: `app/api/portal/account/email/request/route.ts`

- [ ] **Step 1: Create the endpoint**

Create `app/api/portal/account/email/request/route.ts` with this content:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateToken,
  expiryFromNow,
  isEmailPendingElsewhere,
  checkAndRecordRequestRate,
} from "@/lib/email-change";
import {
  sendEmailChangeVerifyEmail,
  sendEmailChangeRequestedEmail,
} from "@/lib/email";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let payload: { newEmail?: string; currentPassword?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const newEmail = payload.newEmail?.trim().toLowerCase();
  const currentPassword = payload.currentPassword;

  if (!newEmail || !EMAIL_SHAPE.test(newEmail)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (!currentPassword) {
    return NextResponse.json({ error: "Current password is required." }, { status: 400 });
  }
  if (newEmail === account.email.toLowerCase()) {
    return NextResponse.json(
      { error: "That's already your current email." },
      { status: 400 },
    );
  }

  if (!checkAndRecordRequestRate(account.id)) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  // Re-auth via Supabase signInWithPassword. Mirrors the pattern in the
  // password-change route. Side effect: session is refreshed, which is fine.
  const supabase = await createSupabaseServerClient();
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: account.email,
    password: currentPassword,
  });
  if (verifyErr) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 401 },
    );
  }

  // Uniqueness checks.
  const existingAccount = await prisma.clientAccount.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });
  if (existingAccount) {
    return NextResponse.json(
      { error: "We can't use that email." },
      { status: 409 },
    );
  }
  if (await isEmailPendingElsewhere(newEmail, account.id)) {
    return NextResponse.json(
      { error: "We can't use that email." },
      { status: 409 },
    );
  }

  // Supersede any prior pending row, insert the new one.
  const { raw: rawToken, hash: tokenHash } = generateToken();
  const expiresAt = expiryFromNow();

  await prisma.$transaction([
    prisma.emailChangeRequest.deleteMany({
      where: { clientAccountId: account.id, consumedAt: null },
    }),
    prisma.emailChangeRequest.create({
      data: {
        clientAccountId: account.id,
        newEmail,
        tokenHash,
        expiresAt,
      },
    }),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const verifyUrl = `${appUrl}/portal/account/verify-email?token=${encodeURIComponent(rawToken)}`;

  // Fire both emails. Failures are logged but don't fail the request — the
  // user already saw "we sent a link" and can re-request if it never arrives.
  try {
    await sendEmailChangeVerifyEmail(newEmail, {
      newEmail,
      oldEmail: account.email,
      verifyUrl,
      expiresAt,
    });
  } catch (err) {
    console.error("[email-change] verify email send failed:", err);
  }

  try {
    await sendEmailChangeRequestedEmail(account.email, {
      oldEmail: account.email,
      newEmail,
    });
  } catch (err) {
    console.error("[email-change] requested email send failed:", err);
  }

  return NextResponse.json({ ok: true, newEmail, expiresAt: expiresAt.toISOString() });
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/portal/account/email/request/route.ts
git commit -m "feat(portal): add self-serve email change request endpoint

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Self-serve cancel + pending endpoints

**Files:**
- Create: `app/api/portal/account/email/cancel/route.ts`
- Create: `app/api/portal/account/email/pending/route.ts`

- [ ] **Step 1: Create the cancel endpoint**

Create `app/api/portal/account/email/cancel/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";

export async function POST() {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  await prisma.emailChangeRequest.deleteMany({
    where: { clientAccountId: account.id, consumedAt: null },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create the pending endpoint**

Create `app/api/portal/account/email/pending/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { getPendingForAccount } from "@/lib/email-change";

export async function GET() {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const pending = await getPendingForAccount(account.id);
  if (!pending) {
    return NextResponse.json({ pending: null });
  }

  return NextResponse.json({
    pending: {
      newEmail: pending.newEmail,
      expiresAt: pending.expiresAt.toISOString(),
    },
  });
}
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/portal/account/email/cancel/route.ts app/api/portal/account/email/pending/route.ts
git commit -m "feat(portal): add email change cancel + pending endpoints

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Verify-email page (consume token + swap)

**Files:**
- Create: `app/portal/account/verify-email/page.tsx`

- [ ] **Step 1: Create the verify page**

Create `app/portal/account/verify-email/page.tsx`:

```typescript
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { findValidRequest } from "@/lib/email-change";
import { sendEmailChangeCompletedEmail } from "@/lib/email";

type Outcome =
  | { kind: "ok"; newEmail: string }
  | { kind: "invalid" }
  | { kind: "error" };

async function verifyToken(rawToken: string | undefined): Promise<Outcome> {
  if (!rawToken) return { kind: "invalid" };

  const row = await findValidRequest(rawToken);
  if (!row) return { kind: "invalid" };

  const account = await prisma.clientAccount.findUnique({
    where: { id: row.clientAccountId },
  });
  if (!account) return { kind: "invalid" };

  const supa = supabaseAdmin();

  // Supabase first. If this fails, nothing in our DB has changed and the
  // user can re-click the link.
  const { error: updateErr } = await supa.auth.admin.updateUserById(
    account.authUserId,
    { email: row.newEmail, email_confirm: true },
  );
  if (updateErr) {
    console.error("[email-change] supabase updateUserById failed:", updateErr);
    return { kind: "error" };
  }

  // Prisma update + mark request consumed in one transaction.
  try {
    await prisma.$transaction([
      prisma.clientAccount.update({
        where: { id: account.id },
        data: { email: row.newEmail },
      }),
      prisma.emailChangeRequest.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      }),
    ]);
  } catch (err) {
    // Supabase succeeded, Prisma failed. The user's login now works under
    // the new email but client_accounts.email is stale. Log loudly; manual
    // reconcile from server logs.
    console.error(
      `[email-change] PRISMA STALE — supabase changed to ${row.newEmail} but client_accounts.email still ${account.email} for account ${account.id}:`,
      err,
    );
    return { kind: "error" };
  }

  // Sign out all sessions for this user. Failure is non-fatal — the user
  // will be signed out on next request anyway because their session JWT
  // still has the old email and Supabase will reject it.
  try {
    await supa.auth.admin.signOut(account.authUserId);
  } catch (err) {
    console.error("[email-change] signOut failed:", err);
  }

  // Notify the OLD address that the change completed.
  try {
    await sendEmailChangeCompletedEmail(account.email, {
      oldEmail: account.email,
      newEmail: row.newEmail,
      changedAt: new Date(),
    });
  } catch (err) {
    console.error("[email-change] completed email send failed:", err);
  }

  return { kind: "ok", newEmail: row.newEmail };
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const outcome = await verifyToken(params.token);

  return (
    <div className="max-w-xl mx-auto px-5 md:px-10 py-12 md:py-16">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
          §
        </span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Email verification
        </span>
      </div>

      {outcome.kind === "ok" && (
        <>
          <h1
            className="font-display text-3xl md:text-5xl leading-none mb-4"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            Email updated
          </h1>
          <p className="font-display italic text-ink-mute mb-6">
            Your Dispatch login is now <strong>{outcome.newEmail}</strong>. For
            your security, all sessions have been signed out — sign in again
            with the new address.
          </p>
          <Link href="/portal/login" className="btn-dispatch">
            Sign in
          </Link>
        </>
      )}

      {outcome.kind === "invalid" && (
        <>
          <h1
            className="font-display text-3xl md:text-5xl leading-none mb-4"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            Link expired or invalid
          </h1>
          <p className="font-display italic text-ink-mute mb-6">
            This verification link can&rsquo;t be used. It may have expired,
            already been used, or been replaced by a newer request. Sign in
            and request the change again if you still need to.
          </p>
          <Link href="/portal/login" className="btn-dispatch">
            Sign in
          </Link>
        </>
      )}

      {outcome.kind === "error" && (
        <>
          <h1
            className="font-display text-3xl md:text-5xl leading-none mb-4"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            Something went wrong
          </h1>
          <p className="font-display italic text-ink-mute mb-6">
            We couldn&rsquo;t finish the change. Try the link again, or
            contact{" "}
            <a
              href="mailto:hello@developerofcode.com"
              className="text-signal-red hover:underline"
            >
              hello@developerofcode.com
            </a>
            .
          </p>
          <Link href="/portal/login" className="btn-dispatch">
            Sign in
          </Link>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/portal/account/verify-email/page.tsx
git commit -m "feat(portal): add verify-email page that consumes change token

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Client account UI (page + client component)

**Files:**
- Modify: `app/portal/(authed)/account/page.tsx`
- Modify: `app/portal/(authed)/account/account-client.tsx`

- [ ] **Step 1: Update the server component to fetch pending state**

Replace the entire contents of `app/portal/(authed)/account/page.tsx` with:

```typescript
import { redirect } from "next/navigation";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { hydrateAvatarUrl } from "@/lib/storage";
import { getPendingForAccount } from "@/lib/email-change";
import { AccountClient } from "./account-client";

export default async function AccountPage() {
  const account = await getCurrentClientAccount();
  if (!account) redirect("/portal");

  const [avatarUrl, pending] = await Promise.all([
    hydrateAvatarUrl(account.avatarPath),
    getPendingForAccount(account.id),
  ]);

  return (
    <AccountClient
      name={account.name}
      email={account.email}
      avatarUrl={avatarUrl}
      initialPending={
        pending
          ? {
              newEmail: pending.newEmail,
              expiresAt: pending.expiresAt.toISOString(),
            }
          : null
      }
    />
  );
}
```

- [ ] **Step 2: Update the client component — props signature**

In `app/portal/(authed)/account/account-client.tsx`, replace the props signature (currently `{ name, email, avatarUrl }`) and the function header with this:

```typescript
export function AccountClient({
  name: initialName,
  email,
  avatarUrl: initialAvatarUrl,
  initialPending,
}: {
  name: string;
  email: string;
  avatarUrl: string | null;
  initialPending: { newEmail: string; expiresAt: string } | null;
}) {
```

- [ ] **Step 3: Add email-change state and handlers near the top of the component body**

Inside the component body, right after the existing `const [confirmPwd, setConfirmPwd] = useState("");` line (and before the `async function onSaveName` definition), insert:

```typescript
  // ─── Email change ──────────────────────────────────────────────────────
  const [pending, setPending] = useState<{ newEmail: string; expiresAt: string } | null>(
    initialPending,
  );
  const [emailFormOpen, setEmailFormOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmNewEmail, setConfirmNewEmail] = useState("");
  const [emailPwd, setEmailPwd] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onRequestEmailChange(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);

    if (newEmail.trim().toLowerCase() !== confirmNewEmail.trim().toLowerCase()) {
      setEmailMsg({ kind: "err", text: "New emails don't match." });
      return;
    }
    if (newEmail.trim().toLowerCase() === email.toLowerCase()) {
      setEmailMsg({ kind: "err", text: "That's already your current email." });
      return;
    }

    setEmailBusy(true);
    const res = await fetch("/api/portal/account/email/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newEmail: newEmail.trim().toLowerCase(),
        currentPassword: emailPwd,
      }),
    });
    setEmailBusy(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setEmailMsg({ kind: "err", text: body.error ?? "Could not send verification." });
      return;
    }
    const data = (await res.json()) as { newEmail: string; expiresAt: string };
    setPending({ newEmail: data.newEmail, expiresAt: data.expiresAt });
    setEmailFormOpen(false);
    setNewEmail("");
    setConfirmNewEmail("");
    setEmailPwd("");
  }

  async function onCancelPendingEmail() {
    if (!confirm("Cancel the pending email change?")) return;
    setEmailBusy(true);
    setEmailMsg(null);
    const res = await fetch("/api/portal/account/email/cancel", { method: "POST" });
    setEmailBusy(false);
    if (!res.ok) {
      setEmailMsg({ kind: "err", text: "Could not cancel. Try again." });
      return;
    }
    setPending(null);
  }
```

- [ ] **Step 4: Replace the existing "email is read-only" header copy + email field**

Find this block in the component (around lines 149-156 and 217-224 in the current file):

```tsx
        <p className="font-display italic text-ink-mute">
          Email is set by your invitation and can&rsquo;t be changed here. Contact{" "}
          <a href="mailto:hello@developerofcode.com" className="text-signal-red hover:underline">
            hello@developerofcode.com
          </a>{" "}
          if you need it updated.
        </p>
```

Replace with:

```tsx
        <p className="font-display italic text-ink-mute">
          Your record on the desk.
        </p>
```

Then find the email-display block inside the "Name + email" form:

```tsx
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1">
            Email
          </label>
          <div className="font-mono text-sm text-ink-soft py-2 border-b border-rule-soft">
            {email}
          </div>
        </div>
```

Replace it with the new email + change UI:

```tsx
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1">
            Email
          </label>
          <div className="flex items-center justify-between py-2 border-b border-rule-soft gap-3">
            <span className="font-mono text-sm text-ink-soft">{email}</span>
            {!pending && !emailFormOpen && (
              <button
                type="button"
                onClick={() => {
                  setEmailFormOpen(true);
                  setEmailMsg(null);
                }}
                className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors"
              >
                Change email
              </button>
            )}
          </div>

          {pending && (
            <div className="mt-3 border-l-[3px] border-signal-red bg-signal-red/5 px-4 py-3">
              <p className="font-display text-sm text-ink-soft">
                Check <strong>{pending.newEmail}</strong> for a verification link.
                It expires{" "}
                {new Date(pending.expiresAt).toLocaleString("en-US", {
                  month: "short",
                  day: "2-digit",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                .
              </p>
              <button
                type="button"
                onClick={onCancelPendingEmail}
                disabled={emailBusy}
                className="mt-2 font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors disabled:opacity-50"
              >
                {emailBusy ? "Cancelling…" : "Cancel pending change"}
              </button>
            </div>
          )}

          {!pending && emailFormOpen && (
            <div className="mt-4 space-y-4 border-l-[3px] border-rule pl-4">
              <div>
                <label
                  htmlFor="newEmail"
                  className="block font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute mb-1"
                >
                  New email
                </label>
                <input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="input-line"
                />
              </div>
              <div>
                <label
                  htmlFor="confirmNewEmail"
                  className="block font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute mb-1"
                >
                  Confirm new email
                </label>
                <input
                  id="confirmNewEmail"
                  type="email"
                  value={confirmNewEmail}
                  onChange={(e) => setConfirmNewEmail(e.target.value)}
                  required
                  className="input-line"
                />
              </div>
              <div>
                <label
                  htmlFor="emailPwd"
                  className="block font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute mb-1"
                >
                  Current password
                </label>
                <input
                  id="emailPwd"
                  type="password"
                  value={emailPwd}
                  onChange={(e) => setEmailPwd(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="input-line"
                />
              </div>
              {emailMsg && (
                <div
                  role={emailMsg.kind === "err" ? "alert" : "status"}
                  className={`border-l-[3px] px-4 py-3 font-mono text-xs uppercase tracking-wider ${
                    emailMsg.kind === "err"
                      ? "border-signal-red bg-signal-red/5 text-signal-redDeep"
                      : "border-signal-green bg-signal-green/5 text-signal-green"
                  }`}
                >
                  {emailMsg.text}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmailFormOpen(false);
                    setNewEmail("");
                    setConfirmNewEmail("");
                    setEmailPwd("");
                    setEmailMsg(null);
                  }}
                  className="px-3 py-2 font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onRequestEmailChange}
                  disabled={emailBusy}
                  className="btn-dispatch"
                >
                  {emailBusy ? "Sending…" : "Send verification"}
                </button>
              </div>
            </div>
          )}
        </div>
```

(Note: `onRequestEmailChange` accepts a `React.FormEvent` but is wired to a `button onClick` with no event arg. Keep the signature as-is and just call `onRequestEmailChange(e as unknown as React.FormEvent)` — or simpler, drop the `e.preventDefault()` line and change the signature to `async function onRequestEmailChange()`. Use the second option: it's cleaner.)

Apply that second option: change the function header from `async function onRequestEmailChange(e: React.FormEvent) { e.preventDefault(); ...` to `async function onRequestEmailChange() { ...` and remove the `e.preventDefault()` line.

- [ ] **Step 5: Verify types compile and lint passes**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no new TypeScript errors. Lint output should be unchanged from baseline (33 pre-existing errors in `track-a-deliverables/` only).

- [ ] **Step 6: Smoke test in dev server**

```bash
npm run dev
```

Open http://localhost:3000/portal in a browser, sign in as a test client, navigate to Account. Verify:
- The "Email is set by your invitation…" copy is gone.
- A "Change email" button appears next to the current email.
- Clicking it expands the inline form.
- Submitting with mismatched emails shows the inline error.
- Submitting with a fresh new email and the correct password shows the pending banner.
- Reloading the page persists the pending banner.
- "Cancel pending change" removes the banner.

Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add app/portal/(authed)/account/page.tsx app/portal/(authed)/account/account-client.tsx
git commit -m "feat(portal): add self-serve email change UI to account page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Admin override endpoint

**Files:**
- Create: `app/api/admin/clients/[id]/email/route.ts`

- [ ] **Step 1: Create the endpoint**

Create `app/api/admin/clients/[id]/email/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminRequiredError, AuthRequiredError } from "@/lib/auth/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isEmailPendingElsewhere } from "@/lib/email-change";
import { sendEmailChangeByAdminEmail } from "@/lib/email";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof AdminRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const { id } = await params;

  let payload: { newEmail?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const newEmail = payload.newEmail?.trim().toLowerCase();
  if (!newEmail || !EMAIL_SHAPE.test(newEmail)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const account = await prisma.clientAccount.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  if (newEmail === account.email.toLowerCase()) {
    return NextResponse.json(
      { error: "That's already this client's current email." },
      { status: 400 },
    );
  }

  // Uniqueness — same checks as the self-serve path.
  const collide = await prisma.clientAccount.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });
  if (collide && collide.id !== id) {
    return NextResponse.json(
      { error: "Another account already uses that email." },
      { status: 409 },
    );
  }
  if (await isEmailPendingElsewhere(newEmail, id)) {
    return NextResponse.json(
      { error: "Another account has a pending change to that email." },
      { status: 409 },
    );
  }

  const oldEmail = account.email;
  const supa = supabaseAdmin();

  const { error: updateErr } = await supa.auth.admin.updateUserById(
    account.authUserId,
    { email: newEmail, email_confirm: true },
  );
  if (updateErr) {
    console.error("[admin email-change] supabase updateUserById failed:", updateErr);
    return NextResponse.json(
      { error: "Could not update auth provider. Try again." },
      { status: 500 },
    );
  }

  try {
    await prisma.$transaction([
      prisma.clientAccount.update({
        where: { id: account.id },
        data: { email: newEmail },
      }),
      // Clear any pending self-serve request — the admin override supersedes.
      prisma.emailChangeRequest.deleteMany({
        where: { clientAccountId: account.id, consumedAt: null },
      }),
    ]);
  } catch (err) {
    console.error(
      `[admin email-change] PRISMA STALE — supabase changed to ${newEmail} but client_accounts.email still ${oldEmail} for account ${account.id}:`,
      err,
    );
    return NextResponse.json(
      { error: "Partial update — contact the developer." },
      { status: 500 },
    );
  }

  try {
    await supa.auth.admin.signOut(account.authUserId);
  } catch (err) {
    console.error("[admin email-change] signOut failed:", err);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    await sendEmailChangeByAdminEmail(newEmail, {
      newEmail,
      loginUrl: `${appUrl}/portal/login`,
    });
  } catch (err) {
    console.error("[admin email-change] notify email send failed:", err);
  }

  // Audit log to server output.
  console.info(
    `[admin email-change] account=${account.id} ${oldEmail} → ${newEmail}`,
  );

  return NextResponse.json({ ok: true, newEmail });
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/clients/[id]/email/route.ts
git commit -m "feat(admin): add admin override endpoint for client email

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Admin clients UI — inline email edit

**Files:**
- Modify: `components/AdminClientsPage.tsx`
- Modify: `app/admin/clients/clients-list-client.tsx`

- [ ] **Step 1: Add an `onUpdateEmail` prop to the page + card**

In `components/AdminClientsPage.tsx`, update the `AdminClientsPageProps` interface to include the new handler:

```typescript
export interface AdminClientsPageProps {
  clients: AdminClient[];
  onMessageClient?: (clientId: string) => void;
  onViewSiteTickets?: (siteId: string) => void;
  onUpdateEmail?: (clientId: string, newEmail: string) => Promise<{ ok: boolean; error?: string }>;
  className?: string;
  style?: CSSProperties;
}
```

Update the function signature to destructure `onUpdateEmail`:

```typescript
export function AdminClientsPage({
  clients,
  onMessageClient,
  onViewSiteTickets,
  onUpdateEmail,
  className = "",
  style,
}: AdminClientsPageProps) {
```

Pass it down into each `ClientCard`:

```tsx
            <ClientCard
              key={client.id}
              client={client}
              onMessage={() => onMessageClient?.(client.id)}
              onViewSiteTickets={onViewSiteTickets}
              onUpdateEmail={onUpdateEmail}
            />
```

- [ ] **Step 2: Add the inline edit affordance to `ClientCard`**

Update the `ClientCard` props interface and signature to accept `onUpdateEmail`:

```typescript
function ClientCard({
  client,
  onMessage,
  onViewSiteTickets,
  onUpdateEmail,
}: {
  client: AdminClient;
  onMessage: () => void;
  onViewSiteTickets?: (siteId: string) => void;
  onUpdateEmail?: (clientId: string, newEmail: string) => Promise<{ ok: boolean; error?: string }>;
}) {
```

Inside the `ClientCard` body, just under the existing `const [expanded, setExpanded] = useState(false);` line, add:

```typescript
  const [editingEmail, setEditingEmail] = useState(false);
  const [draftEmail, setDraftEmail] = useState(client.email);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  async function handleSaveEmail() {
    if (!onUpdateEmail) return;
    setEmailErr(null);
    const trimmed = draftEmail.trim().toLowerCase();
    if (trimmed === client.email.toLowerCase()) {
      setEditingEmail(false);
      return;
    }
    if (!confirm(`Change ${client.name}'s email to ${trimmed}? They will be signed out of all sessions.`)) {
      return;
    }
    setEmailBusy(true);
    const result = await onUpdateEmail(client.id, trimmed);
    setEmailBusy(false);
    if (!result.ok) {
      setEmailErr(result.error ?? "Could not update email.");
      return;
    }
    setEditingEmail(false);
  }
```

Find the existing email-rendering line inside `ClientCard`:

```tsx
            <div className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-mute mt-0.5">
              {client.email}
            </div>
```

Replace it with:

```tsx
            <div className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-mute mt-0.5">
              {editingEmail ? (
                <span className="flex flex-wrap items-center gap-2">
                  <input
                    type="email"
                    value={draftEmail}
                    onChange={(e) => setDraftEmail(e.target.value)}
                    className="font-mono text-[0.65rem] uppercase tracking-wider text-ink-soft bg-parchment border border-rule px-2 py-1 min-w-[220px]"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setEditingEmail(false);
                        setDraftEmail(client.email);
                        setEmailErr(null);
                      }
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSaveEmail();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveEmail()}
                    disabled={emailBusy}
                    className="font-mono text-[0.55rem] uppercase tracking-widest text-signal-red hover:underline disabled:opacity-50"
                  >
                    {emailBusy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEmail(false);
                      setDraftEmail(client.email);
                      setEmailErr(null);
                    }}
                    disabled={emailBusy}
                    className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute hover:text-signal-red"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  <span>{client.email}</span>
                  {onUpdateEmail && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEmail(true);
                        setDraftEmail(client.email);
                        setEmailErr(null);
                      }}
                      className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-fade hover:text-signal-red transition-colors"
                      aria-label={`Edit email for ${client.name}`}
                    >
                      Edit
                    </button>
                  )}
                </span>
              )}
              {emailErr && (
                <span className="block normal-case tracking-normal text-signal-redDeep mt-1">
                  {emailErr}
                </span>
              )}
            </div>
```

- [ ] **Step 3: Wire the handler from `ClientsListClient`**

Replace the entire contents of `app/admin/clients/clients-list-client.tsx` with:

```typescript
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminClientsPage,
  type AdminClient,
} from "@/components/AdminClientsPage";
import { useClientsPresence } from "@/lib/realtime/use-presence";

export function ClientsListClient({ initial }: { initial: AdminClient[] }) {
  const router = useRouter();
  const online = useClientsPresence();

  // Local override map so a successful email edit shows immediately without
  // waiting for router.refresh() to round-trip the server.
  const [emailOverrides, setEmailOverrides] = useState<Record<string, string>>({});

  const clients = useMemo<AdminClient[]>(
    () =>
      initial.map((c) => ({
        ...c,
        email: emailOverrides[c.id] ?? c.email,
        isOnline: online.has(c.id),
      })),
    [initial, online, emailOverrides],
  );

  async function onUpdateEmail(clientId: string, newEmail: string) {
    const res = await fetch(`/api/admin/clients/${clientId}/email`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newEmail }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false as const, error: body.error ?? "Update failed." };
    }
    setEmailOverrides((prev) => ({ ...prev, [clientId]: newEmail }));
    router.refresh();
    return { ok: true as const };
  }

  return (
    <AdminClientsPage
      clients={clients}
      onMessageClient={(id) => {
        router.push(`/admin/clients#${id}`);
      }}
      onViewSiteTickets={(siteId) =>
        router.push(`/admin/tickets?site=${encodeURIComponent(siteId)}`)
      }
      onUpdateEmail={onUpdateEmail}
    />
  );
}
```

- [ ] **Step 4: Verify types compile and lint passes**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no new TypeScript errors. Lint output unchanged from baseline.

- [ ] **Step 5: Smoke test in dev server**

```bash
npm run dev
```

Sign in as admin, go to `/admin/clients`. Verify:
- An "Edit" link appears next to each client's email.
- Clicking it swaps the email line into an input + Save/Cancel.
- Pressing Escape cancels; pressing Enter saves.
- A confirm dialog appears before saving. After confirming, the new email is shown on the row.
- Trying to set an email that's already in use shows an inline error.

Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
git add components/AdminClientsPage.tsx app/admin/clients/clients-list-client.tsx
git commit -m "feat(admin): inline email edit for clients with confirmation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Full smoke test (end-to-end manual)

**Files:** none (verification only)

- [ ] **Step 1: Run final type + lint baseline**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no new errors. Lint output should match the baseline captured at worktree creation (33 pre-existing errors in `track-a-deliverables/` only).

- [ ] **Step 2: Self-serve happy path**

Start `npm run dev`. Use a test client account with a working email you control. Walk through:

1. Sign in → Account page.
2. Click "Change email", enter a fresh address you control, the same address again, current password. Submit.
3. Verify the pending banner appears. Reload — banner persists.
4. Check the Resend dashboard: confirm a verification email arrived at the new address AND a "change requested" email arrived at the old address.
5. Click the verification link. Land on the success page.
6. Confirm you were signed out. Sign in with the new email + same password.
7. Check the Resend dashboard: confirm a "your email was changed" notice arrived at the OLD address.

- [ ] **Step 3: Self-serve rejection paths**

1. Sign in again. Try to change email using a wrong password → "Current password is incorrect."
2. Try a new email that already belongs to another client → "We can't use that email."
3. Try the same email as your current → "That's already your current email."
4. Try mismatched new/confirm emails → "New emails don't match."

- [ ] **Step 4: Self-serve cancel + expired link**

1. Request a change, then click "Cancel pending change" → banner clears.
2. Request a change, copy the verification URL, then request again with a different address. Open the FIRST link → expired/invalid page.

- [ ] **Step 5: Admin override**

1. Sign in as admin → `/admin/clients`.
2. Pick a test client, click Edit on their email row, enter a fresh address, confirm the dialog.
3. Verify the row updates immediately, and the test client (if signed in elsewhere) is signed out.
4. Check Resend: "your login was updated" email arrived at the new address.
5. Verify the test client can sign in with the new address + their existing password.
6. Try editing again to an email that's already taken → inline error.

- [ ] **Step 6: Stop dev server**

Stop `npm run dev`.

- [ ] **Step 7: Final commit (only if anything needed adjusting during smoke)**

If smoke testing revealed any small bugs and you fixed them inline, commit:

```bash
git add -A
git commit -m "fix(email-change): smoke test corrections

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If no fixes were needed, skip this step.

---

## Done criteria

- Self-serve email change works end-to-end with verification.
- Admin can override any client's email without verification.
- All three notifications fire on the self-serve path; the admin path notifies the new address only.
- All sessions are invalidated on every successful change.
- `npx tsc --noEmit` is clean.
- `npm run lint` reports no NEW errors (baseline `track-a-deliverables/` errors unchanged).
- Schema migration committed but NOT applied — Christian applies it against the real DB.
