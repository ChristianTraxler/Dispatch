# Invite-Expiry Reminder Email — Design

**Date:** 2026-05-08
**Status:** approved, ready for implementation plan

## Problem

When an admin sends an invite to a new client, the link is valid for 7 days. If the client doesn't notice or gets busy, the invite quietly expires and the admin has to manually renew or chase the client. Today there is no proactive nudge.

## Goal

Send the recipient a single reminder email roughly two days before their invite expires, so they get one chance to act before the link goes stale — without spamming and without admin involvement.

## Non-goals

- Multiple reminders per invite (one nudge only).
- Admin-facing UI to see reminder state (silent backend feature in v1).
- Configurable lead time per invite (hardcoded at "≈2 days").
- Reminding clients about already-redeemed or revoked invites.

## Architecture

A new daily Vercel cron at `14:00 UTC` (≈ 9 AM ET / 7 AM MT) hits `POST /api/admin/cron/remind-expiring-invites`. The handler queries invites whose `expiresAt` falls in a 36–60 hour window from now, sends a reminder email via Resend, and stamps `reminderSentAt` so the same invite isn't reminded twice.

The renew route clears `reminderSentAt` so a renewed invite gets a fresh reminder window against its new `expiresAt`.

```
Daily cron 14:00 UTC
       │
       ▼
POST /api/admin/cron/remind-expiring-invites
       │
       ├── auth via CRON_SECRET (Bearer or x-cron-secret header)
       │
       ├── SELECT invites
       │     WHERE redeemedAt IS NULL
       │       AND revokedAt  IS NULL
       │       AND reminderSentAt IS NULL
       │       AND expiresAt BETWEEN now+36h AND now+60h
       │
       └── for each invite:
             ├── sendInviteReminderEmail(...)
             └── UPDATE reminderSentAt = now()
```

### Why a 36–60h window (not "exactly 48h")

Vercel cron runs once daily. If we required `expiresAt = now + 48h ± small_epsilon`, a single delayed/skipped run would silently miss invites. A 24-hour-wide window centered on 48h means each invite enters the window exactly once and is guaranteed to be picked up by at least one cron tick before it expires, even if a run is delayed by several hours.

## Data model change

Add one nullable column to the `Invite` model in `prisma/schema.prisma`:

```prisma
reminderSentAt  DateTime?  @map("reminder_sent_at")
```

- Migration is additive and nullable — no backfill.
- Existing un-redeemed invites at deploy time will *not* receive retroactive reminders. Any that fall into the 36–60h window the morning after deploy will get one reminder; this is correct behavior.
- No new index — the date-range filter on `expiresAt` already narrows the row set; the null check on `reminderSentAt` is cheap on the filtered subset at this project's scale.

## Email template

Add a new short-style template alongside the existing 8 in [lib/email-templates.ts](../../../lib/email-templates.ts), then expose a `sendInviteReminderEmail` wrapper in [lib/email.ts](../../../lib/email.ts).

### `renderInviteReminderEmail`

```ts
export interface InviteReminderEmailParams {
  recipientName?: string;
  email: string;
  siteDisplayName: string;
  inviteUrl: string;
  expiresAt: Date | string;
}

export function renderInviteReminderEmail(p: InviteReminderEmailParams):
  { subject: string; html: string; text: string }
```

Copy is fixed at "2 days" — the cron's 36–60h window means a `Math.round`-derived "days left" would flip between 2 and 3 depending on exact timing, which would make the subject line jitter. The user requirement is a 2-day reminder, so we just say that.

### Style direction

Reuses the same `shell`, `sectionLabel`, `headline`, `lede`, `dataTable`, `button`, etc. helpers as the rest of the email suite — a "short nudge" feel, not a re-send of the original invite.

| Element | Content |
|---|---|
| Subject | `Reminder: your Dispatch invite for {siteDisplayName} expires in 2 days` |
| Section label | `REMINDER` |
| Headline | `Your invite expires in 2 days` (red-italic accent on "2 days") |
| Lede (italic) | `Your account for {siteDisplayName} is still waiting on you.` |
| Data row | `Expires` → formatted date |
| Primary button | label `Set up your account →`, href = same invite URL |
| Closing line | `Already set it up? You can ignore this — these reminders stop once you redeem the invite.` |

The button reuses the original invite token, so the link the client originally received is the same one in the reminder.

## Cron handler

**File:** `app/api/admin/cron/remind-expiring-invites/route.ts`

Mirrors the structure of [app/api/admin/cron/nudge-waiting-inquiries/route.ts](../../../app/api/admin/cron/nudge-waiting-inquiries/route.ts):

```ts
export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_START_HOURS = 36;
const WINDOW_END_HOURS   = 60;

export async function POST(req: Request) {
  // 1. Auth — accept "Authorization: Bearer ${CRON_SECRET}" OR "x-cron-secret: ${CRON_SECRET}"
  //    Return 500 if CRON_SECRET unset, 401 if mismatch.

  const now = Date.now();
  const windowStart = new Date(now + WINDOW_START_HOURS * HOUR_MS);
  const windowEnd   = new Date(now + WINDOW_END_HOURS   * HOUR_MS);

  const candidates = await prisma.invite.findMany({
    where: {
      redeemedAt: null,
      revokedAt: null,
      reminderSentAt: null,
      expiresAt: { gte: windowStart, lte: windowEnd },
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const sent: string[] = [];

  for (const inv of candidates) {
    const inviteUrl = `${appUrl}/invite/${inv.token}`;
    try {
      await sendInviteReminderEmail({
        recipientName: inv.recipientName ?? undefined,
        email: inv.email,
        siteDisplayName: inv.siteDisplayName,
        inviteUrl,
        expiresAt: inv.expiresAt,
      });
      await prisma.invite.update({
        where: { id: inv.id },
        data: { reminderSentAt: new Date() },
      });
      sent.push(inv.id);
    } catch (err) {
      console.error(`[cron] reminder for ${inv.id} failed:`, err);
    }
  }

  return NextResponse.json({ scanned: candidates.length, sent });
}

export const GET = POST;
```

### vercel.json

Add one entry to the `crons` array:

```json
{
  "path": "/api/admin/cron/remind-expiring-invites",
  "schedule": "0 14 * * *"
}
```

## Renew-route change

In [app/api/admin/invites/[id]/renew/route.ts](../../../app/api/admin/invites/%5Bid%5D/renew/route.ts), add `reminderSentAt: null` to the update payload:

```ts
const updated = await prisma.invite.update({
  where: { id },
  data: {
    expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
    reminderSentAt: null,
  },
});
```

This is the only change to existing code — every other change is additive.

## Edge cases

| Case | Behavior |
|---|---|
| Invite created with <36h TTL | Skipped — there isn't time for a 2-day-out reminder. |
| Invite created already inside the 36–60h window | Picked up by next cron tick, reminded once. |
| Renewed invite that was already reminded | Renew clears `reminderSentAt`; cron re-picks it up when new expiry enters window. |
| Client redeems between query and send | One stray reminder lands; closing-line copy makes it graceful. |
| Resend throws on one invite | Logged, others continue, retry next day (no `reminderSentAt` write). |
| Cron run delayed/missed | 24h-wide window guarantees catch on the next run before invite expires. |
| DST / timezone shifts | Non-issue — Vercel cron and `expiresAt` are both UTC. |
| Existing un-redeemed invites at deploy | Eligible from the next 14:00 UTC tick onward, scoped by the same window. |

## Error handling

- Missing `CRON_SECRET` → 500.
- Bad/missing auth → 401.
- Missing `NEXT_PUBLIC_APP_URL` → fall back to `new URL(req.url).origin`.
- Per-invite send failure → `console.error` + continue + retry tomorrow.

No new env vars required (`RESEND_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` already provisioned).

## Manual test plan

1. Apply migration locally; confirm `reminder_sent_at` column on `invites`.
2. Create a test invite to a personal email with `expiresAt = now + 48h`.
3. `POST /api/admin/cron/remind-expiring-invites` locally with the bearer header — verify email arrives, response shows `sent: [<id>]`, DB row has `reminderSentAt` set.
4. POST the route again immediately — verify response shows `sent: []` (idempotency).
5. Create a second invite with `expiresAt = now + 10h` — verify it is *not* picked up (outside window).
6. Renew an invite that already had `reminderSentAt` set — verify `reminderSentAt` is cleared.
7. Hit the route without auth — verify 401.

## Out of scope for v1 (revisit later)

- Admin UI indicator on the invites list showing "reminder sent" state.
- Configurable lead time (hardcoded at ~2 days).
- Multiple reminders / escalating cadence (intentionally chose single nudge).
- Per-invite opt-out from reminders.
