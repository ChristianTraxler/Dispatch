# Client Add-Ons — Design

**Date:** 2026-05-27

## Goal

Give each client a place inside the portal where they can see add-on
services available to them, the price (including any custom rate set for
them), and request them. Admin gets full UI to manage the catalog,
per-client price overrides, and the active add-ons attached to each
client.

## Concepts

- **Add-on** — a service offering. Either `RECURRING` (e.g. monthly
  maintenance, hosting) or `ONE_TIME` (e.g. add a blog, set up
  analytics). Scoped either `PER_SITE` or `PER_CLIENT`.
- **Catalog** — global list of add-ons. Same set of offerings for
  everyone; visibility is not per-client. Page is rendered per-client so
  each account sees their own prices and active items.
- **Price override** — optional per-client custom price for a given
  add-on. When present, the client sees the standard price struck
  through next to their custom price.
- **Active add-on** — an add-on a client currently has, with a
  snapshotted price (so future catalog price changes do not retroactively
  rewrite the client's record).
- **Request** — when a client clicks `Request` on a catalog card, a
  `Ticket` is created with `addOnId` set. The ticket drives quoting and
  confirmation in the existing flow.

## Data model

Three new tables + one column on `Ticket`.

### `AddOn` — catalog row

| field         | type                                     |
| ------------- | ---------------------------------------- |
| `id`          | cuid                                     |
| `name`        | string                                   |
| `description` | text                                     |
| `kind`        | enum `RECURRING` \| `ONE_TIME`           |
| `scope`       | enum `PER_SITE` \| `PER_CLIENT`          |
| `priceCents`  | int                                      |
| `priceUnit`   | enum `ONE_TIME` \| `PER_MONTH` \| `PER_YEAR` |
| `isActive`    | bool (retired offerings stay queryable)  |
| `sortOrder`   | int                                      |
| `createdAt`   | timestamp                                |
| `updatedAt`   | timestamp                                |

### `AddOnClientPrice` — per-client override

| field             | type   |
| ----------------- | ------ |
| `addOnId`         | fk     |
| `clientAccountId` | fk     |
| `priceCents`      | int    |

Unique on `(addOnId, clientAccountId)`. Absence means use standard price.

### `ClientAddOn` — what a client currently has

| field             | type                                                  |
| ----------------- | ----------------------------------------------------- |
| `id`              | cuid                                                  |
| `clientAccountId` | fk                                                    |
| `addOnId`         | fk                                                    |
| `siteId`          | fk, nullable (only when scope = `PER_SITE`)           |
| `status`          | enum `ACTIVE` \| `PAUSED` \| `ENDED`                  |
| `priceCents`      | int (snapshot at activation)                          |
| `startedAt`       | timestamp                                             |
| `endedAt`         | timestamp, nullable                                   |
| `requestTicketId` | fk, nullable (link back to the originating ticket)    |
| `note`            | text, nullable (admin-visible only)                   |

`siteId` is `ON DELETE SET NULL` — when a site is deleted, the row is
also marked `ENDED` in the same transaction so we never carry orphaned
`ACTIVE` rows.

### `Ticket` — new column

- `addOnId` — nullable fk to `AddOn`. Set when the ticket was created
  via `Request` from the catalog. Drives the admin banner on the ticket
  view.

## Client UI

### Nav

New sidebar item `Add-Ons` in the authed portal, between `Sites` and
`Account`.

### Route

`/portal/add-ons` — server component. One query loads the catalog
(active rows), this client's price overrides, and their `ClientAddOn`
rows.

### Page layout

1. **Header** — title `Add-Ons`, subtitle *"Services and upgrades you
   can add to your account."*
2. **Your Add-Ons** — only rendered if any active rows exist. List of
   quiet status cards: name, site (if per-site), snapshot price + unit,
   `Active` / `Paused` badge, started date.
3. **Available Add-Ons** — catalog grid. Each card:
   - Name and short description
   - Price block: if overridden, standard price struck through next to
     custom price with a small `Your rate` badge. If standard, just the
     price.
   - Price unit suffix: `/mo`, `/yr`, or `one-time`
   - Scope hint: `per site` or `for your account`
   - `Request` button
4. **Empty states**
   - No active add-ons → "Your Add-Ons" section is hidden entirely
   - Empty catalog → small message: *"Nothing available right now — get
     in touch if you have something in mind."*

### Request flow

- Click `Request` opens a modal.
- If scope is `PER_SITE`: dropdown of the client's sites.
- Optional notes textarea.
- Submit calls `requestAddOn({ addOnId, siteId?, notes? })`.
- That creates a `Ticket` with `category=UPDATE`, `addOnId` set, title
  pre-filled (e.g. *"Add-on request: Monthly Maintenance"*), and
  description containing the add-on name + client notes.
- Once the request ticket exists, the catalog card swaps the `Request`
  button for a `Requested — view ticket` link until the admin activates
  or the ticket is closed without activation.

### Catalog card visibility rules

- Hide entirely if there is already an `ACTIVE` `ClientAddOn` for that
  add-on (and matching site for per-site).
- Show with disabled `Requested — view ticket` button if there is an
  open request ticket (not closed, no activation yet).
- Otherwise show with `Request` button.

## Admin UI

### `/admin/add-ons` — catalog manager

Table of all `AddOn` rows. Columns: name, kind, scope, standard price,
unit, status (active/retired), sort order. Inline actions:
edit, retire/unretire, delete (delete blocked if referenced by any
`ClientAddOn` or override — retire instead).

`+ New Add-On` and edit share a form: name, description, kind, scope,
price, price unit, sort order. Reorder via numeric `sortOrder` field
(simplest first; revisit drag-to-reorder later if needed).

### Client detail page — new "Add-Ons" tab

On the existing `/admin/clients/[id]` page, add a section/tab with:

- **Price overrides** — list of `AddOnClientPrice` for this client.
  `+ Override` opens a small form (pick add-on, set price). Inline edit
  and remove.
- **Active add-ons** — the client's `ClientAddOn` rows. Each row shows:
  add-on, site (if per-site), snapshot price, status, started/ended
  dates, note, link to originating request ticket. Inline actions:
  `Pause`, `End`, `Edit note`.
- **`+ Activate add-on`** for manual activation outside a request flow.

### Request ticket integration

When admin opens a ticket with `addOnId` set, the ticket header shows an
"Add-on request" banner with the add-on name and a primary
`Activate add-on` button. Clicking opens a small confirm sheet:

- Pick site (if scope = `PER_SITE`)
- Confirm or override the price (defaults to override-or-standard)
- Optional internal note
- Submit → creates `ClientAddOn` (snapshot price), posts a system
  message into the ticket thread (*"Activated 'Monthly Maintenance' at
  $150/mo."*), and closes/moves the ticket per the normal flow.

## Server actions

### Client-side

- `requestAddOn({ addOnId, siteId?, notes? })`
  - Validates: add-on exists and is active; scope matches (per-site
    requires `siteId`, per-client forbids it); `siteId` belongs to the
    caller; no existing open request ticket for the same add-on +
    site; not already `ACTIVE`.
  - Creates the ticket and returns its id.

### Admin-side

- `createAddOn`, `updateAddOn`, `retireAddOn`, `unretireAddOn`,
  `deleteAddOn` (delete blocked if referenced)
- `upsertClientPrice`, `deleteClientPrice`
- `activateClientAddOn({ clientId, addOnId, siteId?, priceCents, note?, fromTicketId? })`
  - Snapshots price, creates `ClientAddOn`, posts system message into
    the originating ticket when `fromTicketId` is set.
- `pauseClientAddOn`, `endClientAddOn`, `updateClientAddOnNote`

## Permissions (Supabase RLS)

- `add_ons`, `add_on_client_prices` — clients can `SELECT` only. Server
  code further filters to active rows for catalog rendering. Admin uses
  the service role for writes.
- `client_add_ons` — clients can `SELECT` only their own rows (filter
  on `client_account_id` matching the account linked to `auth.uid()`,
  same pattern as existing tables). Admin writes via service role.

## Edge cases

- **Retired add-on with active subscribers** — `ClientAddOn` retains
  snapshotted name + price via the `AddOn` row (kept around but
  `isActive=false`). Catalog hides it; "Your Add-Ons" still renders it.
- **Site deleted while a per-site add-on is active** — `siteId` set to
  null and `ClientAddOn` marked `ENDED` in the same transaction.
- **Duplicate request** — blocked at the server action and reflected in
  the catalog card UI.
- **Already active** — catalog card hidden; row appears in
  "Your Add-Ons" instead.

## Testing

- Unit tests around `requestAddOn` scope/duplicate validation.
- Integration test for the activate-from-ticket flow (request → admin
  activate → `ClientAddOn` created with snapshot price → system message
  posted).
- UI verified manually in the dev server before merge.

## Out of scope (deferred)

- Billing / invoicing of add-ons. The page shows what is available and
  what is active; payment happens offline as today.
- Public marketing catalog (this is portal-only).
- Drag-to-reorder in admin (numeric `sortOrder` for now).
