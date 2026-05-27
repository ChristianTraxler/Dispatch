# Notion Ticket Backup — Design

**Date:** 2026-05-27
**Status:** Approved (pending spec review)

## Summary

Mirror every newly-filed Dispatch ticket — and any subsequent status change — into a Notion database as a lightweight, human-browsable backup. Postgres remains the source of truth; Notion is a sidecar. Sync is fire-and-forget: a Notion failure never blocks a user action.

## Goals

- Christian always has a Notion-side overview of every ticket, even if the Dispatch DB is ever lost or corrupted.
- Status of a Notion row stays in sync with Dispatch.
- Zero impact on user-perceived latency or ticket-creation reliability.

## Non-Goals (explicit YAGNI)

- Backfilling existing tickets into Notion.
- Retrying failed syncs (no queue, no cron).
- Mirroring messages, attachments, or per-stage timestamps beyond `createdAt`.
- Two-way sync — edits in Notion do not propagate to Dispatch.
- Mirroring AddOn purchases or ClientAddOn rows (only the Ticket created alongside an add-on request is mirrored).

## Architecture

Direct REST calls from API routes, exactly mirroring the existing `sendNewTicketEmail` fire-and-forget pattern in [app/api/portal/tickets/route.ts](app/api/portal/tickets/route.ts). One new module wraps the Notion SDK; each ticket-mutating route gains one extra `void notionFn().catch(log)` call.

```
POST /api/portal/tickets (and 3 other create sites)
  → prisma.ticket.create(...)
  → sendNewTicketEmail(...)        [existing]
  → createNotionTicketPage(...)    [new, fire-and-forget]

PATCH /api/admin/tickets/[id]      (and 2 other status-mutating sites)
  → prisma.ticket.update({ status })
  → updateNotionTicketStatus(...)  [new, fire-and-forget]
```

## Notion Database Schema

Created once via a setup script. Properties:

| Property | Notion type | Source |
|---|---|---|
| **Ticket #** | Title | `ticketNumber(id, createdAt)` → `DSP-YYYY-MM-DD-XXXX` |
| **Status** | Select | One of: `NEW`, `REVIEWING`, `FIXING`, `AWAITING_CONFIRMATION`, `CLOSED`, `REOPENED` |
| **Category** | Select | Values from `lib/ticket-categories.ts` |
| **Site** | Rich text | `site.displayName` |
| **Client** | Rich text | `clientAccount.name` |
| **Client email** | Email | `clientAccount.email` |
| **Emergency** | Checkbox | `ticket.isEmergency` |
| **Created** | Date | `ticket.createdAt` (ISO 8601) |
| **Dispatch link** | URL | `${NEXT_PUBLIC_APP_URL}/admin/ticket/${ticket.id}` |

Select option colors are not pinned; whatever Notion auto-assigns on first use is fine.

## Environment Variables

Added to local `.env` and Vercel project (all three environments):

| Var | Purpose | When needed |
|---|---|---|
| `NOTION_TOKEN` | Internal-integration secret token | Runtime + setup |
| `NOTION_DATABASE_ID` | ID of the mirror database | Runtime (written after setup) |
| `NOTION_PARENT_PAGE_ID` | Parent page to create the database under | Setup only |

If `NOTION_TOKEN` or `NOTION_DATABASE_ID` is missing at runtime, the sync functions no-op silently and log a single warning per process. This lets dev/preview environments run without a Notion target.

## Schema Change

```prisma
model Ticket {
  // ...existing fields
  notionPageId String? @map("notion_page_id")
}
```

Nullable. One Prisma migration: `add_notion_page_id`. No backfill — old tickets keep `notionPageId = null`, which means status updates on them silently no-op (they were never mirrored to begin with). Also covers tickets where the initial Notion-create call failed.

## New Module — `lib/notion.ts`

Wraps `@notionhq/client` (new dependency). All exported functions return `Promise<void>` and catch their own errors internally — they never throw to callers.

```ts
// Signatures only; types abbreviated for the spec.
export async function createNotionTicketPage(args: {
  ticket: Ticket;
  account: { name: string; email: string };
  site: { displayName: string };
  appUrl: string;
}): Promise<void>;

export async function updateNotionTicketStatus(args: {
  ticketId: string;
  status: TicketStatus;
}): Promise<void>;
```

Internal behavior:

- `createNotionTicketPage` builds the property payload, POSTs to `/v1/pages`, and on success updates `prisma.ticket.update({ where: { id }, data: { notionPageId } })`. On any failure: `console.error("[notion] create failed:", err)` and return.
- `updateNotionTicketStatus` reads `notionPageId` from the ticket (one Prisma `findUnique`); if null, return silently. Otherwise PATCH `/v1/pages/{pageId}` with the new Status property. On failure: `console.error("[notion] update failed:", err)` and return.
- Both check `NOTION_TOKEN` and `NOTION_DATABASE_ID` are set; if not, return silently.

## Hook Points

### Ticket creation (4 sites)

After existing email/notification logic, before the `NextResponse.json` return:

```ts
void createNotionTicketPage({ ticket, account, site, appUrl })
  .catch((err) => console.error("[notion] uncaught:", err));
```

(The `.catch` is belt-and-suspenders — the function already swallows internally.)

Sites:
- `app/api/portal/tickets/route.ts` — standard ticket create.
- `app/api/portal/inquiries/route.ts` — inquiry (a Ticket with `isInquiry=true`).
- `app/api/admin/inquiries/route.ts` — admin-created inquiry.
- `app/api/portal/add-ons/request/route.ts` — only on the branch that creates a Ticket alongside the add-on request.

### Status updates (3 sites)

Trigger only when `status` actually changed in the mutation:

- `app/api/admin/tickets/[id]/route.ts` — PATCH handler; the existing code already conditionally sets `updateData.status` when status was in the payload. Add the Notion call inside that same `if (status !== undefined)` branch, after the Prisma update succeeds.
- `app/api/portal/tickets/[id]/confirm/route.ts` — sets status to `CLOSED`.
- `app/api/portal/tickets/[id]/reopen/route.ts` — sets status to `REOPENED`.

## One-Time Setup Script

`scripts/notion-setup.ts`, runnable via a new `package.json` script: `"notion:setup": "tsx scripts/notion-setup.ts"`.

Behavior:

1. Read `NOTION_TOKEN` and `NOTION_PARENT_PAGE_ID` from env. Error out clearly if missing.
2. If `NOTION_DATABASE_ID` is already set and the database is reachable, print "Already configured" and exit 0.
3. Otherwise POST `/v1/databases` to create the database with the schema above under the given parent page.
4. Print the new database ID and instruct Christian to paste it into `.env` and Vercel as `NOTION_DATABASE_ID`.

Script is local-run only; never invoked at runtime.

## Failure Handling

Every Notion call is wrapped in `try/catch` inside `lib/notion.ts`. On failure:

- Log: `console.error("[notion] <op> failed:", err)` — visible in Vercel logs.
- Return; never propagate to caller.
- No retry, no queue, no alert. Postgres is the source of truth; an occasional missed Notion row is acceptable.

This is the same trust model already in use for `sendNewTicketEmail`.

## Testing Plan

Manual, in dev against the real (prod) DB — consistent with this project's setup per [[dispatch_local_db_is_prod]]:

1. **Setup script:** run `npm run notion:setup` against a throwaway parent page. Confirm DB is created with all 9 properties.
2. **Create flow:** file a ticket from the portal. Confirm a row appears in Notion with correct Ticket #, Status=NEW, all fields populated, and `ticket.notionPageId` is set in Postgres.
3. **Status flow:** in admin, move the ticket through NEW → REVIEWING → FIXING → AWAITING_CONFIRMATION. Confirm the Notion row's Status updates each time.
4. **Portal close/reopen:** confirm the ticket from the portal (→ CLOSED), then reopen (→ REOPENED). Confirm Notion reflects both.
5. **Failure injection:** temporarily set `NOTION_TOKEN` to garbage. File a ticket. Confirm: ticket creation succeeds, no 500, and `[notion] create failed` appears in logs.
6. **Missing config:** unset `NOTION_DATABASE_ID`. File a ticket. Confirm silent no-op, no error spam.

## Rollout

1. Merge schema migration first (additive, safe to deploy alone).
2. Run `notion:setup` locally, add `NOTION_*` env vars to Vercel.
3. Deploy code changes.
4. Verify in prod with a real test ticket (delete afterward).
