# Client Add-Ons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each client see a catalog of add-on services available to them (with their pricing) in the portal, request them via ticket, and see what they currently have active. Admin gets full CRUD for the catalog, per-client price overrides, and a one-click activation flow from a request ticket.

**Architecture:** Three new tables (`AddOn`, `AddOnClientPrice`, `ClientAddOn`) plus one nullable `addOnId` column on `Ticket`. Client view is a single server-rendered page at `/portal/add-ons`. Admin gets a catalog page at `/admin/add-ons` and a new "Add-Ons" section on the existing client detail page. All write paths are Next.js Route Handlers under `app/api/...` matching the existing pattern (no Server Actions in this codebase yet).

**Tech Stack:** Next.js 16 (App Router, webpack), Prisma 5 + PostgreSQL via Supabase, Supabase Auth + RLS, Tailwind, TypeScript.

**Design source:** [docs/plans/2026-05-27-client-add-ons-design.md](./2026-05-27-client-add-ons-design.md)

**Testing approach:** Project has no unit-test runner. Each phase ends with a **manual verification step** — run the dev server, click through, and check DB rows via Prisma queries. Final task in the plan is an end-to-end smoke test of the full request → activate → display loop.

**Important environment notes (read before starting):**
- The local `.env` `DATABASE_URL` points at the **live Supabase Postgres**. `prisma migrate dev` will run the migration against production. Coordinate with the user before applying.
- Per `AGENTS.md`, this is Next.js 16 — route handlers use `context: { params: Promise<{ id: string }> }`. Use existing routes in `app/api/portal/tickets/[id]/messages/route.ts` as the reference.

---

## Phase 1 — Schema migration

### Task 1: Add catalog, override, and active-row tables

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add three models, two enums, and a column on `Ticket`**

Add the two new enums above `enum SenderType`:

```prisma
enum AddOnKind {
  RECURRING
  ONE_TIME
}

enum AddOnScope {
  PER_SITE
  PER_CLIENT
}

enum AddOnPriceUnit {
  ONE_TIME
  PER_MONTH
  PER_YEAR
}

enum ClientAddOnStatus {
  ACTIVE
  PAUSED
  ENDED
}
```

Add the three models above `model AdminSettings`:

```prisma
model AddOn {
  id          String         @id @default(cuid())
  name        String
  description String         @db.Text
  kind        AddOnKind
  scope       AddOnScope
  priceCents  Int            @map("price_cents")
  priceUnit   AddOnPriceUnit @map("price_unit")
  isActive    Boolean        @default(true) @map("is_active")
  sortOrder   Int            @default(0) @map("sort_order")
  createdAt   DateTime       @default(now()) @map("created_at")
  updatedAt   DateTime       @updatedAt @map("updated_at")

  clientPrices AddOnClientPrice[]
  clientAddOns ClientAddOn[]
  tickets      Ticket[]

  @@index([isActive, sortOrder])
  @@map("add_ons")
}

model AddOnClientPrice {
  id              String   @id @default(cuid())
  addOnId         String   @map("add_on_id")
  clientAccountId String   @map("client_account_id")
  priceCents      Int      @map("price_cents")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  addOn         AddOn         @relation(fields: [addOnId], references: [id], onDelete: Cascade)
  clientAccount ClientAccount @relation(fields: [clientAccountId], references: [id], onDelete: Cascade)

  @@unique([addOnId, clientAccountId])
  @@index([clientAccountId])
  @@map("add_on_client_prices")
}

model ClientAddOn {
  id               String            @id @default(cuid())
  clientAccountId  String            @map("client_account_id")
  addOnId          String            @map("add_on_id")
  siteId           String?           @map("site_id")
  status           ClientAddOnStatus @default(ACTIVE)
  priceCents       Int               @map("price_cents")
  startedAt        DateTime          @default(now()) @map("started_at")
  endedAt          DateTime?         @map("ended_at")
  requestTicketId  String?           @map("request_ticket_id")
  note             String?           @db.Text
  createdAt        DateTime          @default(now()) @map("created_at")
  updatedAt        DateTime          @updatedAt @map("updated_at")

  clientAccount ClientAccount @relation(fields: [clientAccountId], references: [id], onDelete: Cascade)
  addOn         AddOn         @relation(fields: [addOnId], references: [id])
  site          Site?         @relation(fields: [siteId], references: [id], onDelete: SetNull)
  requestTicket Ticket?       @relation("AddOnRequestTicket", fields: [requestTicketId], references: [id], onDelete: SetNull)

  @@index([clientAccountId, status])
  @@index([addOnId])
  @@index([siteId])
  @@map("client_add_ons")
}
```

In `model ClientAccount`, add:

```prisma
  addOnPrices  AddOnClientPrice[]
  clientAddOns ClientAddOn[]
```

In `model Site`, add:

```prisma
  clientAddOns ClientAddOn[]
```

In `model Ticket`, add (after `attachments Json?`):

```prisma
  addOnId String? @map("add_on_id")
  addOn   AddOn?  @relation(fields: [addOnId], references: [id])

  activatedAddOns ClientAddOn[] @relation("AddOnRequestTicket")
```

And add an index inside the `Ticket` model:

```prisma
  @@index([addOnId])
```

- [ ] **Step 2: Confirm with user before running migration (prod DB)**

Stop and confirm with the user: this `prisma migrate dev` will run against the live Supabase database (per the `.env` `DATABASE_URL`). The user must explicitly approve before proceeding.

- [ ] **Step 3: Generate and apply migration**

Run: `npx prisma migrate dev --name client_add_ons`

Expected: new migration directory appears under `prisma/migrations/`, Prisma client regenerated, four new tables visible in Supabase Studio (`add_ons`, `add_on_client_prices`, `client_add_ons`, plus `add_on_id` column on `tickets`).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add client add-ons schema"
```

---

### Task 2: Add RLS policies

**Files:**
- Modify: `prisma/rls-policies.sql`
- Apply the new policies in Supabase SQL editor (or via psql) after editing the file

- [ ] **Step 1: Add policies for the three new tables**

At the bottom of `prisma/rls-policies.sql`, append:

```sql
-- ===== Add-Ons =====

alter table public.add_ons enable row level security;
alter table public.add_on_client_prices enable row level security;
alter table public.client_add_ons enable row level security;

-- add_ons: clients can SELECT only active rows. Writes via service role only.
create policy "add_ons_select_active"
on public.add_ons for select
to authenticated
using (is_active = true);

-- add_on_client_prices: clients can SELECT only their own override rows.
create policy "add_on_client_prices_select_own"
on public.add_on_client_prices for select
to authenticated
using (
  client_account_id in (
    select id from public.client_accounts where auth_user_id = auth.uid()::text
  )
);

-- client_add_ons: clients can SELECT only their own rows.
create policy "client_add_ons_select_own"
on public.client_add_ons for select
to authenticated
using (
  client_account_id in (
    select id from public.client_accounts where auth_user_id = auth.uid()::text
  )
);
```

- [ ] **Step 2: Apply the policies**

Open Supabase Dashboard → SQL Editor → paste the new block from `prisma/rls-policies.sql` → run. Confirm with `select policyname from pg_policies where tablename in ('add_ons','add_on_client_prices','client_add_ons')` — five policies expected (the three above plus the two auto-created by `enable row level security` are zero; only the explicit policies appear).

- [ ] **Step 3: Commit**

```bash
git add prisma/rls-policies.sql
git commit -m "feat(db): add RLS policies for client add-ons"
```

---

## Phase 2 — Shared helpers and pricing logic

### Task 3: Add a pricing helper + types

**Files:**
- Create: `lib/add-ons/pricing.ts`
- Create: `lib/add-ons/format.ts`

- [ ] **Step 1: Write the pricing helper**

`lib/add-ons/pricing.ts`:

```ts
import type { AddOn, AddOnClientPrice } from "@prisma/client";

export type ResolvedPrice = {
  /** The standard catalog price in cents. */
  standardCents: number;
  /** The price this client pays in cents (override if present, else standard). */
  effectiveCents: number;
  /** True if this client has a per-client override. */
  isOverridden: boolean;
};

export function resolvePrice(
  addOn: Pick<AddOn, "priceCents">,
  override: Pick<AddOnClientPrice, "priceCents"> | null | undefined,
): ResolvedPrice {
  const standardCents = addOn.priceCents;
  if (override && override.priceCents !== addOn.priceCents) {
    return { standardCents, effectiveCents: override.priceCents, isOverridden: true };
  }
  return { standardCents, effectiveCents: standardCents, isOverridden: false };
}
```

`lib/add-ons/format.ts`:

```ts
import type { AddOnPriceUnit } from "@prisma/client";

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

export function priceUnitSuffix(unit: AddOnPriceUnit): string {
  switch (unit) {
    case "PER_MONTH":
      return "/mo";
    case "PER_YEAR":
      return "/yr";
    case "ONE_TIME":
      return " one-time";
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/add-ons
git commit -m "feat(add-ons): pricing and format helpers"
```

---

## Phase 3 — Admin catalog manager

### Task 4: API routes for AddOn CRUD

**Files:**
- Create: `app/api/admin/add-ons/route.ts` (GET list, POST create)
- Create: `app/api/admin/add-ons/[id]/route.ts` (PATCH update, DELETE)

- [ ] **Step 1: Look up the existing admin auth pattern**

Read `app/api/admin/sites/route.ts` (or `app/api/admin/clients/route.ts` if sites doesn't exist) to confirm the admin auth helper used. Existing admin routes call a helper like `assertAdmin()` or `getAdminSession()`. **Use the same helper** — do not invent a new auth pattern.

- [ ] **Step 2: Write `GET` + `POST` route**

`app/api/admin/add-ons/route.ts`:

```ts
import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin"; // adjust import to match the codebase
import { prisma } from "@/lib/prisma";
import { z } from "zod"; // only if zod is already a dep; otherwise hand-validate

const CreateBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1),
  kind: z.enum(["RECURRING", "ONE_TIME"]),
  scope: z.enum(["PER_SITE", "PER_CLIENT"]),
  priceCents: z.number().int().nonnegative(),
  priceUnit: z.enum(["ONE_TIME", "PER_MONTH", "PER_YEAR"]),
  sortOrder: z.number().int().default(0),
});

export async function GET() {
  await assertAdmin();
  const addOns = await prisma.addOn.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ addOns });
}

export async function POST(req: Request) {
  await assertAdmin();
  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  // Enforce kind/unit pairing: RECURRING -> PER_MONTH|PER_YEAR; ONE_TIME -> ONE_TIME
  const { kind, priceUnit } = parsed.data;
  if (kind === "RECURRING" && priceUnit === "ONE_TIME") {
    return NextResponse.json({ error: "RECURRING add-ons must be PER_MONTH or PER_YEAR" }, { status: 400 });
  }
  if (kind === "ONE_TIME" && priceUnit !== "ONE_TIME") {
    return NextResponse.json({ error: "ONE_TIME add-ons must use ONE_TIME unit" }, { status: 400 });
  }
  const addOn = await prisma.addOn.create({ data: parsed.data });
  return NextResponse.json({ addOn }, { status: 201 });
}
```

(If `zod` is not a project dep yet, replace with manual `typeof` checks — do not add a new dep.)

- [ ] **Step 3: Write `PATCH` + `DELETE` route**

`app/api/admin/add-ons/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  await assertAdmin();
  const { id } = await params;
  const body = await req.json();
  // Allow partial updates of: name, description, kind, scope, priceCents, priceUnit, isActive, sortOrder
  const allowed = ["name", "description", "kind", "scope", "priceCents", "priceUnit", "isActive", "sortOrder"] as const;
  const data: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) data[key] = body[key];
  const addOn = await prisma.addOn.update({ where: { id }, data });
  return NextResponse.json({ addOn });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  await assertAdmin();
  const { id } = await params;
  // Hard delete only if no references exist; otherwise retire.
  const [overrideCount, clientCount, ticketCount] = await Promise.all([
    prisma.addOnClientPrice.count({ where: { addOnId: id } }),
    prisma.clientAddOn.count({ where: { addOnId: id } }),
    prisma.ticket.count({ where: { addOnId: id } }),
  ]);
  if (overrideCount + clientCount + ticketCount > 0) {
    return NextResponse.json(
      { error: "Add-on is referenced; retire it instead.", referenced: true },
      { status: 409 },
    );
  }
  await prisma.addOn.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Manual smoke test via curl**

With the dev server running, log in as admin in the browser to mint a cookie, then in DevTools console:

```js
await fetch("/api/admin/add-ons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Monthly Maintenance", description: "Ongoing updates and bug fixes for one site.", kind: "RECURRING", scope: "PER_SITE", priceCents: 15000, priceUnit: "PER_MONTH", sortOrder: 10 }) }).then(r => r.json())
```

Expected: 201 with `addOn` returned. Confirm with `await fetch("/api/admin/add-ons").then(r=>r.json())` — list shows the new row.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/add-ons
git commit -m "feat(admin): add-on catalog CRUD API"
```

---

### Task 5: Admin catalog page UI

**Files:**
- Create: `app/admin/add-ons/page.tsx`
- Create: `app/admin/add-ons/add-ons-client.tsx`
- Modify: `components/AdminShell.tsx` — add nav item
- Modify: `app/admin/admin-shell-client.tsx` — extend `onNavigate` switch

- [ ] **Step 1: Add the new admin nav item**

In `components/AdminShell.tsx`, update both unions and the `ADMIN_NAV` array:

```ts
activeNav?: "dashboard" | "inquiries" | "clients" | "invites" | "add-ons" | "account";
onNavigate?: (target: "dashboard" | "inquiries" | "clients" | "invites" | "add-ons" | "account" | "logout") => void;

const ADMIN_NAV: { key: "dashboard" | "inquiries" | "clients" | "invites" | "add-ons"; label: string }[] = [
  { key: "dashboard", label: "Live Ledger" },
  { key: "inquiries", label: "Inquiries" },
  { key: "clients", label: "Clients" },
  { key: "invites", label: "Invites" },
  { key: "add-ons", label: "Add-Ons" },
];
```

Update `app/admin/admin-shell-client.tsx`:

- Extend `deriveActiveNav` to return `"add-ons"` when `pathname.startsWith("/admin/add-ons")`.
- Extend `onNavigate` to route `"add-ons"` to `/admin/add-ons`.

- [ ] **Step 2: Build the catalog server page**

`app/admin/add-ons/page.tsx`:

```tsx
import { prisma } from "@/lib/prisma";
import { AdminAddOnsClient } from "./add-ons-client";

export const dynamic = "force-dynamic";

export default async function AdminAddOnsPage() {
  const addOns = await prisma.addOn.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return <AdminAddOnsClient initialAddOns={addOns} />;
}
```

- [ ] **Step 3: Build the client component (table + create/edit form)**

`app/admin/add-ons/add-ons-client.tsx` — a client component with:

- A table listing add-ons (columns: Name, Kind, Scope, Price, Unit, Active, Sort, Actions).
- A `+ New Add-On` button that opens an inline form (or modal) with all fields from the design.
- Edit / Retire / Unretire / Delete inline buttons that call the routes built in Task 4.
- `router.refresh()` after each successful write so the table reflects new data.

Use existing admin styling conventions — look at `app/admin/invites/...` for a working CRUD-table reference.

- [ ] **Step 4: Manual verification**

In the browser at `http://localhost:3000/admin/add-ons`:
- See the row created via curl in the previous task.
- Click `+ New Add-On`, fill in a `ONE_TIME` + `PER_CLIENT` row (e.g. "Google Analytics Setup", $500 one-time), save. Confirm it appears.
- Edit the new row, change the price. Confirm it persists.
- Click Retire on it. Confirm `isActive` flips false (row stays in admin table but greyed).
- Click Delete on it. Confirm a 409 error if any test references exist; otherwise the row disappears.

- [ ] **Step 5: Commit**

```bash
git add components/AdminShell.tsx app/admin/admin-shell-client.tsx app/admin/add-ons
git commit -m "feat(admin): add-on catalog manager page"
```

---

## Phase 4 — Client portal view

### Task 6: Add nav item and page route

**Files:**
- Modify: `components/PortalShell.tsx` — extend nav union + `NAV_ITEMS`
- Modify: `app/portal/portal-shell-client.tsx` — extend `deriveActiveNav` and `onNavigate`
- Create: `app/portal/(authed)/add-ons/page.tsx`
- Create: `app/portal/(authed)/add-ons/add-ons-client.tsx`

- [ ] **Step 1: Extend the portal shell nav**

In `components/PortalShell.tsx`:

```ts
activeNav?: "dashboard" | "sites" | "add-ons" | "account";
onNavigate?: (target: "dashboard" | "sites" | "add-ons" | "account" | "logout" | "new-ticket") => void;

const NAV_ITEMS: { key: "dashboard" | "sites" | "add-ons" | "account"; label: string }[] = [
  { key: "dashboard", label: "Tickets" },
  { key: "sites", label: "Sites" },
  { key: "add-ons", label: "Add-Ons" },
  { key: "account", label: "Account" },
];
```

Update `app/portal/portal-shell-client.tsx` `deriveActiveNav` and `onNavigate` to handle `add-ons` (route to `/portal/add-ons`).

- [ ] **Step 2: Build the data-loading server page**

`app/portal/(authed)/add-ons/page.tsx`:

```tsx
import { prisma } from "@/lib/prisma";
import { getPortalAccount } from "@/lib/auth/portal"; // adjust import to match codebase
import { AddOnsClient } from "./add-ons-client";

export const dynamic = "force-dynamic";

export default async function PortalAddOnsPage() {
  const account = await getPortalAccount();

  const [catalog, overrides, activeAddOns, openRequests, sites] = await Promise.all([
    prisma.addOn.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.addOnClientPrice.findMany({ where: { clientAccountId: account.id } }),
    prisma.clientAddOn.findMany({
      where: { clientAccountId: account.id, status: { in: ["ACTIVE", "PAUSED"] } },
      include: { addOn: true, site: true },
      orderBy: { startedAt: "desc" },
    }),
    prisma.ticket.findMany({
      where: {
        clientAccountId: account.id,
        addOnId: { not: null },
        status: { notIn: ["CLOSED"] },
      },
      select: { id: true, addOnId: true, siteId: true },
    }),
    prisma.site.findMany({
      where: { clientAccountId: account.id },
      orderBy: { displayName: "asc" },
    }),
  ]);

  return (
    <AddOnsClient
      catalog={catalog}
      overrides={overrides}
      activeAddOns={activeAddOns}
      openRequests={openRequests}
      sites={sites}
    />
  );
}
```

- [ ] **Step 3: Build the client component**

`app/portal/(authed)/add-ons/add-ons-client.tsx` — render the page per the design:

1. Header + subtitle.
2. **Your Add-Ons** — only when `activeAddOns.length > 0`. Card per row: name, site (if any), price + unit, status badge, started date.
3. **Available Add-Ons** — grid of cards from `catalog`. For each:
   - Resolve price via `resolvePrice(addOn, overridesByAddOnId[addOn.id])`.
   - If `isOverridden`, show standard price struck through + custom price + "Your rate" badge.
   - Scope hint: `per site` or `for your account`.
   - Visibility logic:
     - **Hide** if an `ACTIVE` `ClientAddOn` already exists for this add-on (and for PER_SITE: only hide the card variant — but since the catalog card is single-site-agnostic, hide if all sites are covered for PER_SITE; for PER_CLIENT hide if any ACTIVE row exists).
       - Pragmatic v1: For PER_CLIENT, hide if any `ACTIVE` exists. For PER_SITE, always show the card and let the modal restrict site choices to ones not already active.
     - **Disable + show "Requested — view ticket"** if an open request ticket exists for this add-on (any site).
   - Otherwise show `Request` button (opens modal).
4. Empty state: if `catalog` is empty, show the get-in-touch message.

The Request modal:
- Title: `Request {addOn.name}`
- Price summary (effective price + unit)
- If PER_SITE: site dropdown (sites not already ACTIVE for this add-on)
- Optional notes textarea
- `Cancel` / `Submit Request` buttons → POST `/api/portal/add-ons/request` then `router.push("/portal/ticket/" + ticketId)` on success.

Use existing portal styling — look at `app/portal/(authed)/sites/sites-client.tsx` for a card-grid reference.

- [ ] **Step 4: Manual verification**

Log in as a client. Visit `/portal/add-ons`. Expect to see:
- Sidebar nav now includes "Add-Ons" between Sites and Account.
- The seeded Monthly Maintenance add-on appears.
- If you added a per-client override in DB, the standard price renders struck through and the override price renders next to it with "Your rate" badge.

- [ ] **Step 5: Commit**

```bash
git add components/PortalShell.tsx app/portal/portal-shell-client.tsx app/portal/\(authed\)/add-ons
git commit -m "feat(portal): client add-ons catalog view"
```

---

### Task 7: Request endpoint

**Files:**
- Create: `app/api/portal/add-ons/request/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { getPortalAccount } from "@/lib/auth/portal";
import { prisma } from "@/lib/prisma";

type Body = {
  addOnId: string;
  siteId?: string;
  notes?: string;
};

export async function POST(req: Request) {
  const account = await getPortalAccount();
  const body = (await req.json()) as Body;
  if (!body.addOnId || typeof body.addOnId !== "string") {
    return NextResponse.json({ error: "addOnId is required" }, { status: 400 });
  }

  const addOn = await prisma.addOn.findUnique({ where: { id: body.addOnId } });
  if (!addOn || !addOn.isActive) {
    return NextResponse.json({ error: "Add-on not available" }, { status: 404 });
  }

  // Scope validation
  if (addOn.scope === "PER_SITE" && !body.siteId) {
    return NextResponse.json({ error: "Site is required for this add-on" }, { status: 400 });
  }
  if (addOn.scope === "PER_CLIENT" && body.siteId) {
    return NextResponse.json({ error: "Site must not be provided for this add-on" }, { status: 400 });
  }

  // Site ownership
  let site: { id: string; displayName: string } | null = null;
  if (body.siteId) {
    site = await prisma.site.findFirst({
      where: { id: body.siteId, clientAccountId: account.id },
      select: { id: true, displayName: true },
    });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }
  } else {
    // Pick any site to attach the ticket to (tickets require a siteId). Use first site.
    site = await prisma.site.findFirst({
      where: { clientAccountId: account.id },
      orderBy: { addedAt: "asc" },
      select: { id: true, displayName: true },
    });
    if (!site) {
      return NextResponse.json({ error: "You must add a site before requesting add-ons" }, { status: 400 });
    }
  }

  // Block duplicate active
  const existingActive = await prisma.clientAddOn.findFirst({
    where: {
      clientAccountId: account.id,
      addOnId: addOn.id,
      status: "ACTIVE",
      ...(addOn.scope === "PER_SITE" ? { siteId: body.siteId } : {}),
    },
  });
  if (existingActive) {
    return NextResponse.json({ error: "Already active" }, { status: 409 });
  }

  // Block duplicate open request
  const existingRequest = await prisma.ticket.findFirst({
    where: {
      clientAccountId: account.id,
      addOnId: addOn.id,
      status: { notIn: ["CLOSED"] },
      ...(addOn.scope === "PER_SITE" ? { siteId: body.siteId } : {}),
    },
    select: { id: true },
  });
  if (existingRequest) {
    return NextResponse.json({ error: "Existing request", ticketId: existingRequest.id }, { status: 409 });
  }

  const description = [
    `Add-on requested: **${addOn.name}**`,
    `Scope: ${addOn.scope === "PER_SITE" ? `site (${site.displayName})` : "client account"}`,
    body.notes ? `\nNotes from client:\n${body.notes}` : "",
  ].filter(Boolean).join("\n");

  const ticket = await prisma.ticket.create({
    data: {
      clientAccountId: account.id,
      siteId: site.id,
      title: `Add-on request: ${addOn.name}`,
      description,
      category: "UPDATE",
      status: "NEW",
      addOnId: addOn.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ ticketId: ticket.id }, { status: 201 });
}
```

- [ ] **Step 2: Manual verification**

From the client's `/portal/add-ons` page, click `Request` on Monthly Maintenance, pick a site, submit. Expect to land on the new ticket page. Confirm the ticket has `add_on_id` set in the DB.

- [ ] **Step 3: Commit**

```bash
git add app/api/portal/add-ons
git commit -m "feat(portal): add-on request endpoint"
```

---

## Phase 5 — Admin per-client management

### Task 8: Price-override and active-row APIs

**Files:**
- Create: `app/api/admin/clients/[id]/add-on-prices/route.ts` (GET list, POST upsert)
- Create: `app/api/admin/clients/[id]/add-on-prices/[addOnId]/route.ts` (DELETE)
- Create: `app/api/admin/clients/[id]/add-ons/route.ts` (GET list, POST activate)
- Create: `app/api/admin/clients/[id]/add-ons/[clientAddOnId]/route.ts` (PATCH pause/end/note)

- [ ] **Step 1: Price override routes**

`app/api/admin/clients/[id]/add-on-prices/route.ts`:

```ts
import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await assertAdmin();
  const { id } = await params;
  const overrides = await prisma.addOnClientPrice.findMany({
    where: { clientAccountId: id },
    include: { addOn: true },
  });
  return NextResponse.json({ overrides });
}

export async function POST(req: Request, { params }: Ctx) {
  await assertAdmin();
  const { id } = await params;
  const body = await req.json();
  if (!body.addOnId || typeof body.priceCents !== "number" || body.priceCents < 0) {
    return NextResponse.json({ error: "addOnId and non-negative priceCents required" }, { status: 400 });
  }
  const override = await prisma.addOnClientPrice.upsert({
    where: { addOnId_clientAccountId: { addOnId: body.addOnId, clientAccountId: id } },
    update: { priceCents: body.priceCents },
    create: { addOnId: body.addOnId, clientAccountId: id, priceCents: body.priceCents },
  });
  return NextResponse.json({ override }, { status: 201 });
}
```

`app/api/admin/clients/[id]/add-on-prices/[addOnId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; addOnId: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  await assertAdmin();
  const { id, addOnId } = await params;
  await prisma.addOnClientPrice.deleteMany({
    where: { clientAccountId: id, addOnId },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Active-row routes**

`app/api/admin/clients/[id]/add-ons/route.ts`:

```ts
import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await assertAdmin();
  const { id } = await params;
  const rows = await prisma.clientAddOn.findMany({
    where: { clientAccountId: id },
    include: { addOn: true, site: true, requestTicket: { select: { id: true, title: true, status: true } } },
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json({ rows });
}

export async function POST(req: Request, { params }: Ctx) {
  await assertAdmin();
  const { id } = await params;
  const body = await req.json();
  const { addOnId, siteId, priceCents, note, fromTicketId } = body as {
    addOnId: string;
    siteId?: string;
    priceCents: number;
    note?: string;
    fromTicketId?: string;
  };

  const addOn = await prisma.addOn.findUnique({ where: { id: addOnId } });
  if (!addOn) return NextResponse.json({ error: "Add-on not found" }, { status: 404 });

  if (addOn.scope === "PER_SITE" && !siteId) {
    return NextResponse.json({ error: "Site is required for this add-on" }, { status: 400 });
  }
  if (addOn.scope === "PER_CLIENT" && siteId) {
    return NextResponse.json({ error: "Site must not be provided for this add-on" }, { status: 400 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.clientAddOn.create({
      data: {
        clientAccountId: id,
        addOnId,
        siteId: siteId ?? null,
        priceCents,
        note: note ?? null,
        requestTicketId: fromTicketId ?? null,
        status: "ACTIVE",
      },
      include: { addOn: true, site: true },
    });

    if (fromTicketId) {
      // System message into the ticket thread
      await tx.message.create({
        data: {
          ticketId: fromTicketId,
          senderType: "ADMIN",
          senderId: "system",
          body: `Activated **${addOn.name}**${row.site ? ` for ${row.site.displayName}` : ""} at ${formatCents(priceCents)}${priceUnitSuffix(addOn.priceUnit)}.`,
        },
      });
      // Move ticket to FIXING+fixedAt or directly to CLOSED — match the project's existing activation pattern.
      // Pragmatic v1: leave ticket status alone; admin can close it manually via existing controls.
    }

    return row;
  });

  return NextResponse.json({ row: created }, { status: 201 });
}
```

Add `import { formatCents } from "@/lib/add-ons/format"; import { priceUnitSuffix } from "@/lib/add-ons/format";` at top.

`app/api/admin/clients/[id]/add-ons/[clientAddOnId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; clientAddOnId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  await assertAdmin();
  const { id, clientAddOnId } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.action === "pause") {
    data.status = "PAUSED";
  } else if (body.action === "resume") {
    data.status = "ACTIVE";
  } else if (body.action === "end") {
    data.status = "ENDED";
    data.endedAt = new Date();
  }
  if (typeof body.note === "string") data.note = body.note;

  const row = await prisma.clientAddOn.update({
    where: { id: clientAddOnId, clientAccountId: id },
    data,
  });
  return NextResponse.json({ row });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/clients
git commit -m "feat(admin): per-client add-on price overrides and activation API"
```

---

### Task 9: Admin client detail page — "Add-Ons" section

**Files:**
- Modify: existing `app/admin/clients/[id]/...` page (find current file with `find /Users/christiantraxler/Desktop/Current-Projects/Dispatch/app/admin/clients -type f`)

- [ ] **Step 1: Add a new section/tab below existing sections**

The section should server-render two lists (price overrides and active add-ons), with inline action buttons:

- **Overrides** list — each row: add-on name, override price, [Edit] [Remove]. `+ Add override` opens a small form (pick from add-on dropdown, enter price).
- **Active add-ons** list — each row: add-on name, site (if any), snapshot price, status badge, started date, note. Actions: [Pause]/[Resume] (toggle), [End], [Edit note], link to request ticket if present.
- **`+ Activate add-on`** button — opens a small form: pick add-on, pick site (if PER_SITE), price (defaults to override-or-standard), note. Submits to `POST /api/admin/clients/[id]/add-ons`.

Pull initial data via the server component using Prisma (same shape as the GET routes return).

- [ ] **Step 2: Manual verification**

Visit the admin client detail page for a real client.
- Add an override for Monthly Maintenance at $100. Confirm DB row appears.
- Click `+ Activate add-on`, pick Monthly Maintenance + a site, accept the override-price default, submit. Confirm:
  - A `ClientAddOn` row exists with `priceCents = 10000`.
  - The active list now shows the row.
- Refresh `/portal/add-ons` for that client. Confirm Monthly Maintenance card now hides (or behaves per the visibility rules in Task 6) and appears in "Your Add-Ons" instead.
- Pause it, then end it. Confirm UI updates.

- [ ] **Step 3: Commit**

```bash
git add app/admin/clients
git commit -m "feat(admin): add-ons tab on client detail page"
```

---

### Task 10: Activate-from-ticket banner

**Files:**
- Modify: existing admin ticket view (find file with `find /Users/christiantraxler/Desktop/Current-Projects/Dispatch/app/admin/ticket -type f`)
- May need: small client component for the activate sheet

- [ ] **Step 1: Add a banner when the ticket has `addOnId`**

In the admin ticket page, when `ticket.addOnId` is set, render a banner above the chat thread:

> ## Add-on request
> **{addOn.name}** — {formatCents(effectivePrice)}{priceUnitSuffix} {addOn.scope === "PER_SITE" ? `· per site` : `· for client account`}
> [Activate add-on] [View add-on details]

The `Activate add-on` button opens a sheet/modal:
- Site picker (if PER_SITE, restricted to the client's sites; default to `ticket.siteId`)
- Price field (defaults to override-or-standard)
- Note field (admin-only)
- Submit → POST `/api/admin/clients/[ticket.clientAccountId]/add-ons` with `{ addOnId, siteId, priceCents, note, fromTicketId: ticket.id }`.

On success: `router.refresh()` (so the system message appears in the chat thread) and dismiss the modal.

- [ ] **Step 2: Manual verification**

Open the request ticket created in Task 7. Expect to see the banner with the correct add-on name and effective price. Click `Activate add-on`, submit. Confirm:
- A new `ClientAddOn` row exists with `request_ticket_id` = this ticket's id.
- A new system message appears in the thread: "Activated **Monthly Maintenance** for {site} at $100/mo."
- The client's `/portal/add-ons` page now shows the add-on under "Your Add-Ons" and removes/disables the catalog card.

- [ ] **Step 3: Commit**

```bash
git add app/admin/ticket
git commit -m "feat(admin): activate add-on directly from request ticket"
```

---

## Phase 6 — Polish

### Task 11: Site deletion cleanup

**Files:**
- Modify: site-delete code path (find with `grep -rn "site.delete\|sites.delete\|deleteMany.*site" app/api/admin/sites`)

- [ ] **Step 1: Wrap site delete in a transaction**

When deleting a site, before (or alongside) the delete, mark any `ACTIVE` or `PAUSED` `ClientAddOn` rows for that site as `ENDED` with `endedAt = now()`. Schema-level `ON DELETE SET NULL` will then null the `siteId`, leaving an `ENDED` row with no site — which is correct (history is preserved).

```ts
await prisma.$transaction(async (tx) => {
  await tx.clientAddOn.updateMany({
    where: { siteId: id, status: { in: ["ACTIVE", "PAUSED"] } },
    data: { status: "ENDED", endedAt: new Date() },
  });
  await tx.site.delete({ where: { id } });
});
```

- [ ] **Step 2: Manual verification**

Activate an add-on against a test site. Delete the site. Confirm the `client_add_ons` row is now `ENDED` with `site_id` null.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/sites
git commit -m "fix(add-ons): end client add-ons when their site is deleted"
```

---

### Task 12: End-to-end smoke test

- [ ] **Step 1: Run the full happy path**

1. As admin: create a new `RECURRING` `PER_SITE` add-on "SEO Package", $300/mo.
2. As admin: visit a real client's detail page, add a price override of $250.
3. As that client: visit `/portal/add-ons`. Confirm SEO Package shows $300 struck through with $250 "Your rate" badge.
4. As that client: click `Request`, choose a site, submit. Land on the new ticket.
5. As admin: open the ticket, click `Activate add-on`, accept the defaults, submit.
6. Confirm:
   - System message appears in the ticket.
   - `/portal/add-ons` now shows the add-on under "Your Add-Ons" with $250/mo and the correct site.
   - The catalog card for SEO Package is hidden (PER_SITE: only if all the client's sites are covered — for a single-site client, hidden; for multi-site, the card still shows but the modal won't offer the already-active site).
7. As admin: on the client detail page, end the add-on. Confirm "Your Add-Ons" on the client side empties, and the catalog card reappears.

- [ ] **Step 2: Run the negative paths**

- Try requesting the same add-on twice (open ticket exists) → API returns 409 and UI shows "Requested — view ticket".
- Try requesting an add-on while it's already ACTIVE → API returns 409.
- Retire the add-on in admin → it disappears from the client catalog. Existing active rows stay visible in "Your Add-Ons".
- Delete the add-on while a `ClientAddOn` references it → API returns 409 with `referenced: true`.

- [ ] **Step 3: Commit anything missed; close the loop**

```bash
git status
# If any tweaks were needed during the smoke test, commit them:
# git add <files>
# git commit -m "fix(add-ons): smoke-test cleanups"
```

---

## Self-review checklist

- [ ] All four spec sections (data model, client UI, admin UI, server actions/edge cases) are covered by tasks above.
- [ ] No "TODO" / "fill in" / "similar to" placeholders — every step has actual code or actual click-paths.
- [ ] Type names are consistent across tasks: `AddOn`, `AddOnClientPrice`, `ClientAddOn`, `ClientAddOnStatus`, `resolvePrice`, `formatCents`, `priceUnitSuffix`.
- [ ] RLS is added explicitly in Task 2 — clients can only `SELECT` their own override and active rows, plus active catalog rows.
- [ ] Snapshotting: `ClientAddOn.priceCents` is set at activation (Task 8 step 2 and Task 10 step 1).
- [ ] Site delete cascade: Task 11 closes the orphan-row edge case.
