# Client Self-Serve Email Change — Design Specification

**Date:** 2026-05-20
**Status:** Approved — ready for implementation plan
**Project:** Dispatch (support.developerofcode.com)
**Scope:** Let signed-in clients change the email on their Dispatch account, with verification on the new address and notifications to the old one. Also: let an admin update any client's email directly (no verification) as a recovery path for clients who have lost access to their old inbox.

---

## Goal

Today, clients cannot change their own email. The Account page renders email read-only with copy that says "Contact hello@developerofcode.com if you need it updated." This forces every legitimate email change (business rebrands, role transitions, typos at invite time) through the admin manually — and the admin has no UI for it either, so it requires a hand-edited Prisma update against prod.

Build two paths:

1. **Client self-serve** for the common case — verified on the new address, with notifications to the old one.
   - Verified — the new address must be proven reachable before the swap happens.
   - Reversible-by-notification — the old address is told what's happening, so a real owner whose session was hijacked has a chance to react.
   - Re-authenticated — the current password is required to start the change, matching the existing password-change pattern.

2. **Admin override** for the recovery case — no verification, because the assumption is the client has lost access to their old inbox. The admin session is the trust anchor.

---

## User flow

A new "Change email" section sits on the existing Account page, between "Name + email" and "Change password."

**State A — no change pending.** The current email is shown read-only with a `[ Change email ]` button. Clicking expands an inline form:

- New email
- Confirm new email (must match)
- Current password
- `[ Send verification ]`

On submit, the form is replaced by a persistent banner:

> Check **you@new.com** — we sent a verification link. It expires in 1 hour. `[ Cancel pending change ]`

**State B — change pending.** The banner is rendered on page load by reading the pending request from the API, so it survives refreshes and re-logins.

**On verification link click** (`/portal/account/verify-email?token=...`):

1. Token validated server-side.
2. Supabase auth user's email updated, then `client_accounts.email` updated, then token consumed.
3. All sessions for this user are signed out.
4. "Change completed" email sent to the old address.
5. Confirmation page rendered with a link to `/portal/login`.

Forcing a re-login is deliberate — email is the login identity, and the cookie session is now stale.

---

## Data model

One new Prisma model. No changes to `ClientAccount` other than a back-relation.

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
  @@map("email_change_requests")
}
```

Add to `ClientAccount`:

```prisma
emailChangeRequests EmailChangeRequest[]
```

Design choices:

- **`tokenHash`, not raw `token`.** Store SHA-256(token); only the email link carries the raw value. The existing `Invite.token` stores raw — for an email change the blast radius of a leak (account takeover) is worse, so it's worth the stricter pattern.
- **`newEmail` on the request row, not on the account row.** Pending state stays out of `client_accounts` until the swap is real.
- **At most one active pending change per account**, enforced by the request endpoint deleting prior rows. Simpler than a partial unique index.
- **1-hour expiry.** Matches typical reset windows; tunable.
- **`onDelete: Cascade`** so deleting an account cleans up in-flight requests automatically.

---

## APIs

All under `app/api/portal/account/email/`. All require an authenticated client account via `getCurrentClientAccount()`.

**`POST /api/portal/account/email/request`** — body `{ newEmail, currentPassword }`

1. 401 if not signed in.
2. Normalize new email (lowercase, trim), basic shape check, must differ from current.
3. Re-auth via Supabase `signInWithPassword(currentEmail, currentPassword)`. Generic "Incorrect password." on failure.
4. Reject if `newEmail` already exists in `client_accounts` (uniqueness) or in another account's pending `EmailChangeRequest` (race avoidance).
5. Transaction: delete any prior pending rows for this account; insert new row with random 32-byte token's SHA-256 hash and `expiresAt = now + 1h`.
6. Send two emails (failures logged but non-fatal to the response):
   - To `newEmail` → verification link with raw token.
   - To current email → "change requested" notice.
7. Return `{ ok: true, newEmail }`.

**`POST /api/portal/account/email/cancel`** — deletes pending rows for the current account. No email. Returns `{ ok: true }`.

**`GET /api/portal/account/email/pending`** — returns `{ newEmail, expiresAt } | null`. Used by the Account page to render the banner.

**`GET /api/portal/account/email/verify?token=...`** — page route (server component at `app/portal/account/verify-email/page.tsx`), not a JSON API.

1. SHA-256 the token, look up row. Reject (missing / expired / consumed) → generic "invalid or expired" page.
2. Call Supabase admin `updateUserById({ email: newEmail, email_confirm: true })`. On failure, surface "Something went wrong, try again." and leave the row intact (user can re-click).
3. Update `client_accounts.email = newEmail`; mark request `consumedAt`.
4. Sign out all sessions for this user (Supabase admin).
5. Send "change completed" email to old address.
6. Render success page with link to `/portal/login`.

**Ordering rationale (Supabase first, then Prisma):** if Supabase fails, nothing has changed and the user can retry. If Supabase succeeds but the Prisma update fails (rare — same process, same transaction), the next sign-in works against the new email but `client_accounts.email` is stale. Mitigation: log loudly; reconcile by hand. The window is tiny and the alternative (distributed transaction) isn't justified.

---

## Email templates

Three new templates in `lib/email-templates.ts`, using the existing `<DispatchEmail>` wrapper and `sendEmail` helper. No new env vars.

**a) Verification — to NEW address.** Subject: `Verify your new email for Dispatch`. CTA button to verify link, plaintext fallback, "expires in 1 hour" note, and explicit "if you didn't request this, ignore — nothing will change" copy so a typo'd recipient does nothing.

**b) Change requested — to OLD address.** Subject: `Email change requested on your Dispatch account`. States the from/to addresses, that verification is pending, and how to react if it wasn't them — sign in and cancel, or contact hello@developerofcode.com. **No action links in this email** — keeps it phish-resistant; the recovery path is sign-in or human contact.

**c) Change completed — to OLD address.** Subject: `Your Dispatch email was changed`. States the new address, the date, that all sessions were signed out, and how to contact support if it wasn't them.

---

## Edge cases & security

- **New email already on another account** → reject with generic "We can't use that email." Don't disclose existence.
- **New email on another account's pending request** → also reject. Avoids two accounts verifying into the same address.
- **Second request supersedes the first** — old row deleted, old link silently dead. Old address gets a fresh "requested" notice.
- **Cancel button** → deletes pending row, no email sent.
- **Expired / consumed / garbage token** → single generic "invalid or expired" page.
- **Supabase `updateUserById` failure mid-verify** → handled by Supabase-first ordering; user retries.
- **Rate limit** → cap at 5 requests/account/hour. Reuse the existing rate-limit helper from `forgot-password` if available, else a small in-memory bucket. Protects against using the "notify old" email as a nuisance vector.
- **FK fanout** — `Site`, `Ticket`, `Inquiry` all reference `clientAccountId`, not email. No data migration.
- **In-flight ticket replies** — those use the account's current email at send time. The swap is atomic from their perspective.
- **Compromised old inbox scenario** — this flow is designed for it: attacker can't complete the change without controlling the *new* email they're trying to set, and the real owner receives two notifications.

---

## Admin override

For clients who have lost access to their old inbox, the self-serve flow is unusable (they can't click the verification link). The admin path skips verification entirely.

**UI.** On the existing `/admin/clients` list, each row already renders the client's email at `components/AdminClientsPage.tsx:194`. Add a small inline edit affordance next to the email — a low-key pencil/text button. Clicking expands an inline form on that row:

- New email (input)
- `[ Save ]` `[ Cancel ]`

No password challenge. No verification step. The admin session is the auth.

**API.** `PATCH /api/admin/clients/[id]/email` — body `{ newEmail }`, guarded by `requireAdmin` (existing admin auth cookie, not Supabase Auth).

1. Validate shape, normalize, reject if `newEmail === current` or already used by another `client_accounts` row or another account's pending `EmailChangeRequest`.
2. Call Supabase admin `updateUserById({ email: newEmail, email_confirm: true })`. Supabase-first ordering for the same reason as the self-serve verify path.
3. Update `client_accounts.email = newEmail`.
4. Sign out all sessions for that user.
5. Delete any pending self-serve `EmailChangeRequest` rows for this account — the admin override supersedes them.
6. Send a single notice to the **new** address: a variant of the self-serve "completed" email opening with "Your Dispatch login was updated by an administrator to this email. You've been signed out — sign in here to continue." No email to the old address; by assumption it's unreachable.

**Audit.** Log the change to server logs (admin id, client id, old email, new email, timestamp) via the existing logging pattern. A proper audit table is out of scope at this volume; the server log plus Supabase Auth's own audit trail are sufficient.

---

## Out of scope

- **Email change history / audit log table.** Server logs + the completed-notification email are the audit trail. A `consumedAt` row remains in the DB as a soft trail until cleaned up.
- **Cleanup job for old `EmailChangeRequest` rows.** Leave them indefinitely for now; add later if the table grows.
- **Sending a paper-trail email to the old address on admin override.** Could be added if "client lost their inbox" turns out to be the minority of admin-override cases, but for now we assume the old inbox is unreachable.

---

## File map

### New files

- `app/portal/account/verify-email/page.tsx` — server component, consumes token, renders success/error.
- `app/api/portal/account/email/request/route.ts`
- `app/api/portal/account/email/cancel/route.ts`
- `app/api/portal/account/email/pending/route.ts`
- `app/api/admin/clients/[id]/email/route.ts` — admin override `PATCH`.
- `lib/email-change.ts` — token generation, hashing, lookup helpers (shared by the verify page and the request endpoint).

### Modified files

- `prisma/schema.prisma` — add `EmailChangeRequest` model and `ClientAccount.emailChangeRequests` back-relation; new Prisma migration.
- `app/portal/(authed)/account/account-client.tsx` — replace the "email is read-only" copy with the new section; add request/cancel UI and pending banner.
- `app/portal/(authed)/account/page.tsx` — fetch any pending request server-side and pass to the client component as initial state.
- `components/AdminClientsPage.tsx` — add the inline edit affordance and form state for the admin override.
- `lib/email-templates.ts` — four new templates: client verification, client "change requested" (to old), client "change completed" (to old), and admin "updated by admin" (to new).

---

## Verification

No test runner is configured. Verification is:

- `npx tsc --noEmit`
- `npm run lint`
- Manual smoke test against the dev server:
  1. **Self-serve happy path.** Sign in as a test client, request a change to a fresh address, confirm both emails arrive (Resend dashboard). Click verify link, confirm sign-out, confirm new login works, confirm "completed" email arrives at old address.
  2. **Self-serve rejections.** Try invalid password — rejected. Try a new email matching another account — rejected.
  3. **Self-serve token edge cases.** Click an expired/consumed link — generic error page.
  4. **Self-serve cancel.** Cancel a pending request — banner disappears, link goes dead.
  5. **Admin override.** As admin, edit a test client's email to a fresh address. Confirm the client is signed out, confirm new login works, confirm the "updated by admin" email arrives at the new address. Confirm any prior self-serve pending request for that client was cleared.
