# Admin Client Detail Page

Date: 2026-05-21
Owner: Christian

## Goal

From `/admin/clients`, clicking a client opens a dedicated detail page at
`/admin/clients/[id]` showing identity, sites, recent tickets, stats, and a
per-site "Production / 30-day free-updates" tracker. Tickets created after a
site's 30-day free window expires are badged in the admin ticket list and
ticket detail page.

## Routes & files

| Path | Purpose |
| --- | --- |
| `app/admin/clients/[id]/page.tsx` | Server Component. Fetches client + sites + recent tickets + signs avatar. |
| `app/admin/clients/[id]/detail-client.tsx` | Client wrapper. Presence + handlers for email edit, production tracker. |
| `components/AdminClientDetail.tsx` | Presentational layout (parchment style, matches `AdminClientsPage`). |
| `app/api/admin/sites/[id]/production/route.ts` | `POST` to start the 30-day window, `DELETE` to reset. Admin-auth required. |
| `lib/free-updates.ts` | Shared helper: `isOutOfFreeWindow(ticket, site)` and day-math utilities. |

## Data model

Single Prisma migration adds a nullable field to `Site`:

```prisma
model Site {
  // existing fields...
  productionStartedAt DateTime? @map("production_started_at")
}
```

No data backfill — `null` means "not in production yet."

## Page layout

1. Back link `← Clients` + `§ ─── Subscriber Profile` strip.
2. Identity header (80px avatar, name + presence dot, editable email, joined / last seen).
3. Stats row: Sites, Total tickets, Open tickets, Messages exchanged.
4. Sites section — one row per site with production tracker controls.
5. Recent tickets — last 10 across all sites with status + site.

`max-w-6xl`, same horizontal padding and vertical rhythm as `/admin/clients`.

## Production tracker UI

Per-site row states:

| State | Display | Action |
| --- | --- | --- |
| `productionStartedAt == null` | "Not in production" (muted) | `Move to production` button |
| Within 30 days | "Live · 12 days of free updates remaining" (green) | `Reset` link |
| Past 30 days | "Free-updates window expired 4 days ago" (signal-red) | `Reset` link |

Both buttons go through `confirm()` dialogs. Day math is computed on the
server so renders match what the API sees.

## API

`app/api/admin/sites/[id]/production/route.ts`:

- `POST` — `requireAdmin()`, set `productionStartedAt = new Date()`, return site.
- `DELETE` — `requireAdmin()`, set `productionStartedAt = null`, return site.

## Free-window badge on tickets

Rule: badge a ticket when
`site.productionStartedAt != null && ticket.createdAt > productionStartedAt + 30 days`.

Tickets created *during* the 30-day window stay un-badged. Inquiries
(`isInquiry: true`) are excluded.

Surfaces:
- `/admin/tickets` list — small font-mono pill next to title.
- `/admin/tickets/[id]` detail — same pill near the header.

Style: signal-red outlined pill, `[OUT OF FREE WINDOW]`, uppercase
tracking-widest ~0.55rem, matching existing status chips.

## Navigation from list page

The client's identity block (avatar + name + email area) on each card
becomes a `<Link href="/admin/clients/{id}">`. The existing "↓ Sites"
toggle and "Message" button retain their behavior on the card.

## Out of scope

- Notes / admin comments on a client
- History of past production-date toggles
- Extending the 30-day window
- Surfacing production status on the list page
