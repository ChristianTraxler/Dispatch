# Notion Ticket Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror every new Dispatch ticket and subsequent status change into a Notion database as a fire-and-forget sidecar backup.

**Architecture:** Direct Notion REST calls from each ticket-mutating API route, mirroring the existing `sendNewTicketEmail` fire-and-forget pattern. One new module (`lib/notion.ts`) wraps the Notion SDK; one new Prisma column (`Ticket.notionPageId`) ties Postgres rows to their Notion pages.

**Tech Stack:** Notion SDK (`@notionhq/client`), Prisma, Next.js App Router. No test framework in this codebase — verification is manual against the dev server, consistent with project conventions per [[dispatch_local_db_is_prod]].

**Reference spec:** [docs/superpowers/specs/2026-05-27-notion-ticket-backup-design.md](docs/superpowers/specs/2026-05-27-notion-ticket-backup-design.md)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `package.json` | Modify | Add `@notionhq/client` dep, add `notion:setup` script |
| `prisma/schema.prisma` | Modify | Add `Ticket.notionPageId` field |
| `prisma/migrations/<ts>_add_notion_page_id/migration.sql` | Create (via Prisma CLI) | Migration for the new column |
| `lib/notion.ts` | Create | Module wrapping Notion SDK — exports `createNotionTicketPage`, `updateNotionTicketStatus` |
| `scripts/notion-setup.mjs` | Create | One-time database-creation script |
| `.env` | Modify (locally only — do NOT read) | Add `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `NOTION_PARENT_PAGE_ID` |
| `app/api/portal/tickets/route.ts` | Modify | Hook in createNotionTicketPage after email |
| `app/api/portal/inquiries/route.ts` | Modify | Hook in createNotionTicketPage on inquiry create |
| `app/api/admin/inquiries/route.ts` | Modify | Hook in createNotionTicketPage on inquiry create |
| `app/api/portal/add-ons/request/route.ts` | Modify | Hook in createNotionTicketPage after email |
| `app/api/admin/tickets/[id]/route.ts` | Modify | Hook in updateNotionTicketStatus on status change |
| `app/api/portal/tickets/[id]/confirm/route.ts` | Modify | Hook in updateNotionTicketStatus on close |
| `app/api/portal/tickets/[id]/reopen/route.ts` | Modify | Hook in updateNotionTicketStatus on reopen |

---

## Task 1: Install Notion SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dependency**

Run:
```bash
npm install @notionhq/client
```

Expected: `@notionhq/client` added under `dependencies` in `package.json` and `package-lock.json` updated. The current latest is `2.x`; pin whatever npm installs.

- [ ] **Step 2: Verify install**

Run:
```bash
node -e "console.log(require('@notionhq/client').Client.name)"
```
Expected output: `Client`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(notion): install @notionhq/client SDK"
```

---

## Task 2: Add `notionPageId` to Ticket schema and migrate

**Files:**
- Modify: `prisma/schema.prisma:68-108` (Ticket model)
- Create (via CLI): `prisma/migrations/<timestamp>_add_notion_page_id/migration.sql`

- [ ] **Step 1: Edit the Ticket model**

In `prisma/schema.prisma`, inside `model Ticket { ... }`, add `notionPageId` next to the other optional scalar fields. Insert this line after `addOnId` (around line 77):

```prisma
  notionPageId    String?        @map("notion_page_id")
```

So the surrounding block becomes:

```prisma
  addOnId         String?        @map("add_on_id")
  notionPageId    String?        @map("notion_page_id")
  isInquiry      Boolean   @default(false) @map("is_inquiry")
```

- [ ] **Step 2: Generate the migration**

⚠️ Per [[dispatch_local_db_is_prod]], the local `DATABASE_URL` points at prod Supabase. `prisma migrate dev` will run against prod. This is a purely additive nullable column — safe — but be deliberate.

Run:
```bash
npx prisma migrate dev --name add_notion_page_id
```

Expected:
- A new directory `prisma/migrations/<timestamp>_add_notion_page_id/` is created.
- `migration.sql` contains: `ALTER TABLE "tickets" ADD COLUMN "notion_page_id" TEXT;`
- Prisma Client regenerates automatically.

- [ ] **Step 3: Sanity-check the column exists**

Run:
```bash
npx prisma studio
```
Open the Ticket table; confirm a `notionPageId` column appears (all rows null). Close studio.

Alternative if you'd rather not open studio:
```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.ticket.findFirst({select:{id:true,notionPageId:true}}).then(r=>{console.log(r);return p.\$disconnect()})"
```
Expected: prints `{ id: '...', notionPageId: null }` or `null` if there are no tickets.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(notion): add Ticket.notionPageId for Notion sync"
```

---

## Task 3: Create `lib/notion.ts` core module

**Files:**
- Create: `lib/notion.ts`

This module exports two functions; both swallow their own errors and never throw.

- [ ] **Step 1: Create the module**

Create `lib/notion.ts` with this exact content:

```ts
import "server-only";
import { Client } from "@notionhq/client";
import { prisma } from "@/lib/prisma";
import type { TicketStatus } from "@prisma/client";
import { ticketNumber } from "@/lib/ticket";

let cachedClient: Client | null = null;
let warnedMissing = false;

function getClient(): Client | null {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!token || !dbId) {
    if (!warnedMissing) {
      console.warn(
        "[notion] NOTION_TOKEN or NOTION_DATABASE_ID not set; Notion sync disabled.",
      );
      warnedMissing = true;
    }
    return null;
  }
  if (!cachedClient) cachedClient = new Client({ auth: token });
  return cachedClient;
}

export interface CreateNotionTicketArgs {
  ticket: {
    id: string;
    createdAt: Date;
    title: string;
    category: string;
    status: TicketStatus;
    isEmergency: boolean;
  };
  account: { name: string; email: string };
  site: { displayName: string };
  appUrl: string;
}

export async function createNotionTicketPage(
  args: CreateNotionTicketArgs,
): Promise<void> {
  const notion = getClient();
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!notion || !dbId) return;

  try {
    const num = ticketNumber(args.ticket.id, args.ticket.createdAt);
    const page = await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        "Ticket #": {
          title: [{ text: { content: num } }],
        },
        Status: { select: { name: args.ticket.status } },
        Category: { select: { name: args.ticket.category } },
        Site: {
          rich_text: [{ text: { content: args.site.displayName } }],
        },
        Client: {
          rich_text: [{ text: { content: args.account.name } }],
        },
        "Client email": { email: args.account.email },
        Emergency: { checkbox: args.ticket.isEmergency },
        Created: { date: { start: args.ticket.createdAt.toISOString() } },
        "Dispatch link": {
          url: `${args.appUrl}/admin/ticket/${args.ticket.id}`,
        },
      },
    });

    await prisma.ticket.update({
      where: { id: args.ticket.id },
      data: { notionPageId: page.id },
    });
  } catch (err) {
    console.error("[notion] create failed:", err);
  }
}

export async function updateNotionTicketStatus(args: {
  ticketId: string;
  status: TicketStatus;
}): Promise<void> {
  const notion = getClient();
  if (!notion) return;

  try {
    const row = await prisma.ticket.findUnique({
      where: { id: args.ticketId },
      select: { notionPageId: true },
    });
    if (!row?.notionPageId) return;

    await notion.pages.update({
      page_id: row.notionPageId,
      properties: {
        Status: { select: { name: args.status } },
      },
    });
  } catch (err) {
    console.error("[notion] update failed:", err);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: exits 0 with no errors. (If you see "Cannot find module @notionhq/client" — Task 1 didn't complete.)

- [ ] **Step 3: Commit**

```bash
git add lib/notion.ts
git commit -m "feat(notion): add lib/notion.ts with create+update helpers"
```

---

## Task 4: Hook into portal ticket create

**Files:**
- Modify: `app/api/portal/tickets/route.ts:97-122`

- [ ] **Step 1: Add the import**

At the top of `app/api/portal/tickets/route.ts`, after the existing `import { sendNewTicketEmail }` line, add:

```ts
import { createNotionTicketPage } from "@/lib/notion";
```

- [ ] **Step 2: Add the Notion sync call**

After the existing `if (adminEmail) { ... }` block (which ends around line 119, after `console.error(...)` and `}`), and before the final `return NextResponse.json(...)`, insert:

```ts
  void createNotionTicketPage({
    ticket,
    account: { name: account.name, email: account.email },
    site: { displayName: site.displayName },
    appUrl,
  }).catch((err) => console.error("[notion] uncaught in portal/tickets:", err));
```

`appUrl` is already in scope from the email block above — leave that block as-is.

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/portal/tickets/route.ts
git commit -m "feat(notion): sync new portal tickets to Notion"
```

---

## Task 5: Hook into portal inquiry create

**Files:**
- Modify: `app/api/portal/inquiries/route.ts:29-42`

- [ ] **Step 1: Add the import**

At the top of `app/api/portal/inquiries/route.ts`, after the existing imports, add:

```ts
import { createNotionTicketPage } from "@/lib/notion";
```

- [ ] **Step 2: Add the Notion sync call**

The route reuses an existing open inquiry if one exists. We only sync when a new one is created. Inside the `if (!ticket) { ... }` block, after `ticket = { ...created, messages: [] };`, insert:

```ts
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    void createNotionTicketPage({
      ticket: created,
      account: { name: account.name, email: account.email },
      site: { displayName: account.sites[0].displayName },
      appUrl,
    }).catch((err) => console.error("[notion] uncaught in portal/inquiries:", err));
```

Note: this route's POST takes no `req` parameter, so we can't derive origin from the request URL. The `NEXT_PUBLIC_APP_URL` env var is set in all deployed environments, and the localhost fallback only triggers in dev (where the link target doesn't matter for backup purposes).

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/portal/inquiries/route.ts
git commit -m "feat(notion): sync new portal inquiries to Notion"
```

---

## Task 6: Hook into admin inquiry create

**Files:**
- Modify: `app/api/admin/inquiries/route.ts:57-70`

- [ ] **Step 1: Add the import**

At the top of `app/api/admin/inquiries/route.ts`, after the existing imports, add:

```ts
import { createNotionTicketPage } from "@/lib/notion";
```

- [ ] **Step 2: Add the Notion sync call**

Inside the `if (!ticket) { ... }` block, after `ticket = { ...created, messages: [] };`, insert:

```ts
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    void createNotionTicketPage({
      ticket: created,
      account: { name: account.name, email: account.email },
      site: { displayName: account.sites[0].displayName },
      appUrl,
    }).catch((err) => console.error("[notion] uncaught in admin/inquiries:", err));
```

This route's POST receives `req`, so we can derive the origin if `NEXT_PUBLIC_APP_URL` is missing.

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/inquiries/route.ts
git commit -m "feat(notion): sync new admin-created inquiries to Notion"
```

---

## Task 7: Hook into add-on request

**Files:**
- Modify: `app/api/portal/add-ons/request/route.ts:112-149`

- [ ] **Step 1: Add the import**

At the top of `app/api/portal/add-ons/request/route.ts`, after the existing imports, add:

```ts
import { createNotionTicketPage } from "@/lib/notion";
```

- [ ] **Step 2: Widen the Prisma select to include status + isEmergency**

The existing create uses `select: { id, title, description, category, createdAt }`. Notion needs `status` and `isEmergency` too. Change the select block (lines 122 in the file) to:

```ts
    select: { id: true, title: true, description: true, category: true, createdAt: true, status: true, isEmergency: true },
```

- [ ] **Step 3: Add the Notion sync call**

After the existing `if (adminEmail) { ... }` block (which ends with the `console.error` and `}` around line 147), and before the final `return NextResponse.json(...)`, insert:

```ts
  void createNotionTicketPage({
    ticket,
    account: { name: account.name, email: account.email },
    site: { displayName: site.displayName },
    appUrl,
  }).catch((err) => console.error("[notion] uncaught in add-ons/request:", err));
```

`appUrl` is already in scope from the email block.

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/add-ons/request/route.ts
git commit -m "feat(notion): sync add-on-request tickets to Notion"
```

---

## Task 8: Hook into admin status update

**Files:**
- Modify: `app/api/admin/tickets/[id]/route.ts:82-96`

- [ ] **Step 1: Add the import**

At the top of `app/api/admin/tickets/[id]/route.ts`, after the existing imports, add:

```ts
import { updateNotionTicketStatus } from "@/lib/notion";
```

- [ ] **Step 2: Add the Notion sync call**

After the existing `const updated = await prisma.ticket.update(...)` (around line 96), and **before** the `if (status === "AWAITING_CONFIRMATION") { ... }` block, insert:

```ts
  if (status !== undefined) {
    void updateNotionTicketStatus({
      ticketId: id,
      status: status as import("@prisma/client").TicketStatus,
    }).catch((err) => console.error("[notion] uncaught in admin PATCH:", err));
  }
```

The `as` cast is safe because we already validated `status` against `ALLOWED_TRANSITIONS` at the top of the handler.

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/tickets/[id]/route.ts
git commit -m "feat(notion): sync admin status changes to Notion"
```

---

## Task 9: Hook into portal confirm (CLOSED)

**Files:**
- Modify: `app/api/portal/tickets/[id]/confirm/route.ts:30-38`

- [ ] **Step 1: Add the import**

At the top of `app/api/portal/tickets/[id]/confirm/route.ts`, after the existing imports, add:

```ts
import { updateNotionTicketStatus } from "@/lib/notion";
```

- [ ] **Step 2: Add the Notion sync call**

After the existing `const updated = await prisma.ticket.update(...)` block, and before the final `return NextResponse.json(...)`, insert:

```ts
  void updateNotionTicketStatus({ ticketId: id, status: "CLOSED" }).catch(
    (err) => console.error("[notion] uncaught in portal confirm:", err),
  );
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/portal/tickets/[id]/confirm/route.ts
git commit -m "feat(notion): sync ticket close (CLOSED) to Notion"
```

---

## Task 10: Hook into portal reopen (REOPENED)

**Files:**
- Modify: `app/api/portal/tickets/[id]/reopen/route.ts:38-56`

- [ ] **Step 1: Add the import**

At the top of `app/api/portal/tickets/[id]/reopen/route.ts`, after the existing imports, add:

```ts
import { updateNotionTicketStatus } from "@/lib/notion";
```

- [ ] **Step 2: Add the Notion sync call**

After the existing `if (adminEmail) { ... }` block (which closes around line 56), and before the final `return NextResponse.json(...)`, insert:

```ts
  void updateNotionTicketStatus({ ticketId: id, status: "REOPENED" }).catch(
    (err) => console.error("[notion] uncaught in portal reopen:", err),
  );
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/portal/tickets/[id]/reopen/route.ts
git commit -m "feat(notion): sync ticket reopen (REOPENED) to Notion"
```

---

## Task 11: One-time setup script + npm script

**Files:**
- Create: `scripts/notion-setup.mjs`
- Modify: `package.json` (add to `"scripts"`)

We use `.mjs` to match the existing `scripts/smoke-rls.mjs` precedent and avoid adding a `tsx` devDep.

- [ ] **Step 1: Create the setup script**

Create `scripts/notion-setup.mjs`:

```js
// One-time script to create the Notion database that backs Dispatch tickets.
// Usage: node scripts/notion-setup.mjs
//   Requires: NOTION_TOKEN, NOTION_PARENT_PAGE_ID in env.
//   If NOTION_DATABASE_ID is already set, exits with "already configured".

import "dotenv/config";
import { Client } from "@notionhq/client";

const token = process.env.NOTION_TOKEN;
const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
const existingDbId = process.env.NOTION_DATABASE_ID;

if (!token) {
  console.error("NOTION_TOKEN is not set. Add it to .env and retry.");
  process.exit(1);
}
if (!parentPageId && !existingDbId) {
  console.error(
    "NOTION_PARENT_PAGE_ID is not set. Add it to .env (the ID of the Notion page you want the database to live under) and retry.",
  );
  process.exit(1);
}

const notion = new Client({ auth: token });

if (existingDbId) {
  try {
    const db = await notion.databases.retrieve({ database_id: existingDbId });
    console.log(`Already configured. Database "${db.title?.[0]?.plain_text ?? existingDbId}" is reachable.`);
    process.exit(0);
  } catch (err) {
    console.error(
      "NOTION_DATABASE_ID is set but the database could not be retrieved. Either fix the ID, unset it to create a new one, or share the page with the integration.",
    );
    console.error(err);
    process.exit(1);
  }
}

const STATUS_OPTIONS = [
  { name: "NEW" },
  { name: "REVIEWING" },
  { name: "FIXING" },
  { name: "AWAITING_CONFIRMATION" },
  { name: "CLOSED" },
  { name: "REOPENED" },
];

const CATEGORY_OPTIONS = [
  { name: "BUG" },
  { name: "CONTENT" },
  { name: "FEATURE" },
  { name: "QUESTION" },
  { name: "URGENT" },
  { name: "UPDATE" },
];

const db = await notion.databases.create({
  parent: { type: "page_id", page_id: parentPageId },
  title: [{ type: "text", text: { content: "Dispatch tickets (backup)" } }],
  properties: {
    "Ticket #": { title: {} },
    Status: { select: { options: STATUS_OPTIONS } },
    Category: { select: { options: CATEGORY_OPTIONS } },
    Site: { rich_text: {} },
    Client: { rich_text: {} },
    "Client email": { email: {} },
    Emergency: { checkbox: {} },
    Created: { date: {} },
    "Dispatch link": { url: {} },
  },
});

console.log("\nDatabase created.");
console.log("NOTION_DATABASE_ID=" + db.id);
console.log("\nNext steps:");
console.log("  1. Paste the above NOTION_DATABASE_ID= line into your .env (do NOT read .env — append via shell).");
console.log("  2. Add NOTION_TOKEN and NOTION_DATABASE_ID to Vercel project env vars for all environments.");
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add `notion:setup` to the `"scripts"` block. The block should look like:

```json
  "scripts": {
    "dev": "next dev --webpack",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "eslint",
    "postinstall": "prisma generate",
    "notion:setup": "node scripts/notion-setup.mjs"
  },
```

- [ ] **Step 3: Verify `dotenv` resolves**

The script imports `dotenv/config`. `dotenv` is not in `package.json` yet. Check if it resolves via a transitive dep:

```bash
node -e "import('dotenv/config').then(()=>console.log('ok')).catch(e=>{console.log('missing');process.exit(1)})"
```

If "missing" → install it as a devDep:
```bash
npm install --save-dev dotenv
```

- [ ] **Step 4: Commit**

```bash
git add scripts/notion-setup.mjs package.json package-lock.json
git commit -m "feat(notion): one-time setup script for backup database"
```

---

## Task 12: Configure environment + run setup (manual, NOT a code task)

⚠️ Per [[dispatch_db_password_rotation]], do NOT read `.env`. Append via shell only.

- [ ] **Step 1: Create a Notion internal integration**

1. Open https://www.notion.so/profile/integrations
2. Click "New integration", name it "Dispatch backup", give it access to your workspace.
3. Capabilities: keep defaults (read + insert + update content). No user info needed.
4. Copy the integration secret (starts with `ntn_` or `secret_`).

- [ ] **Step 2: Pick a parent page and share it with the integration**

1. In Notion, create or pick a page where the backup database should live.
2. Click `...` → "Connections" → add the "Dispatch backup" integration.
3. Copy the page ID from the URL (the 32-char hex after the last `-`).

- [ ] **Step 3: Append env vars to local `.env`**

Run (substituting real values):
```bash
printf '\nNOTION_TOKEN=ntn_REPLACE_ME\nNOTION_PARENT_PAGE_ID=REPLACE_ME\n' >> .env
```

- [ ] **Step 4: Run setup**

```bash
npm run notion:setup
```

Expected: prints "Database created." followed by `NOTION_DATABASE_ID=...`.

- [ ] **Step 5: Append the database ID**

```bash
printf 'NOTION_DATABASE_ID=PASTE_VALUE_HERE\n' >> .env
```

- [ ] **Step 6: Add the same three vars to Vercel**

```bash
vercel env add NOTION_TOKEN production
vercel env add NOTION_TOKEN preview
vercel env add NOTION_TOKEN development
vercel env add NOTION_DATABASE_ID production
vercel env add NOTION_DATABASE_ID preview
vercel env add NOTION_DATABASE_ID development
```

(`NOTION_PARENT_PAGE_ID` is only needed for setup — skip in Vercel.)

- [ ] **Step 7: Re-run setup to confirm idempotence**

```bash
npm run notion:setup
```
Expected: prints `Already configured. Database "Dispatch tickets (backup)" is reachable.`

---

## Task 13: Manual smoke test

No test framework, so this is a manual walk-through. Per [[dispatch_local_db_is_prod]] this runs against prod data — use clearly-marked test content and delete after.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```
Wait for "Ready in ... ms".

- [ ] **Step 2: File a test ticket via the portal**

1. Sign in to `/portal`.
2. Create a new ticket. Title: `[NOTION SMOKE 2026-05-27]`. Category: `QUESTION`. Description: anything.
3. Submit.

Expected:
- Portal redirects to ticket detail.
- Server logs do NOT contain `[notion] create failed`.
- Open Notion → "Dispatch tickets (backup)" DB. A new row appears with Ticket # `DSP-2026-05-27-XXXX`, Status `NEW`, Category `QUESTION`, the client/site populated, and the Dispatch link clickable.

- [ ] **Step 3: Verify `notionPageId` was persisted**

```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.ticket.findFirst({where:{title:{contains:'NOTION SMOKE'}},select:{id:true,notionPageId:true}}).then(r=>{console.log(r);return p.\$disconnect()})"
```
Expected: `notionPageId` is a non-null UUID.

- [ ] **Step 4: Walk status through transitions in admin**

1. Open the ticket in `/admin/ticket/<id>`.
2. Move it through: NEW → REVIEWING → FIXING → AWAITING_CONFIRMATION.
3. After each move, refresh the Notion row.

Expected: Notion Status column updates within ~1 second of each admin change.

- [ ] **Step 5: Confirm from portal (CLOSED)**

1. Back in the portal, click "Confirm" on the test ticket.

Expected: Notion Status → `CLOSED`.

- [ ] **Step 6: Reopen from portal**

1. Reopen the test ticket from the portal (it should still be AWAITING_CONFIRMATION-eligible — if not, walk a fresh test ticket).

Actually: a CLOSED ticket can't be reopened by this route; only AWAITING_CONFIRMATION can. To test reopen, file a fresh test ticket, walk it to AWAITING_CONFIRMATION via admin, then click "Reopen" in the portal.

Expected: Notion Status → `REOPENED`.

- [ ] **Step 7: Failure mode — bad token**

1. Stop the dev server.
2. Temporarily set a bad token: `NOTION_TOKEN=bad_token_test npm run dev`
3. File another test ticket.

Expected:
- Ticket creation in Dispatch still succeeds (HTTP 201, ticket visible in admin).
- Server logs contain `[notion] create failed: APIResponseError` or similar.
- No new Notion row.

Restore the real `NOTION_TOKEN` and restart `npm run dev` before continuing.

- [ ] **Step 8: Cleanup**

1. Delete the smoke-test tickets from `/admin`.
2. Delete the corresponding Notion rows manually (since Dispatch doesn't currently delete from Notion — out of scope per spec).

- [ ] **Step 9: Commit any test-related notes**

If you discovered anything that needs to be documented, commit it now. Otherwise skip.

---

## Self-Review Notes

Reviewed against the spec:

- ✅ Sync scope (creation + status updates): Tasks 4–10 cover all 4 create sites and all 3 status-mutating sites listed in the spec.
- ✅ Notion target (new DB via setup script): Task 11.
- ✅ Schema: Tasks 2 + 11 match the 9-property schema in the spec.
- ✅ Env vars: Task 12 covers all three.
- ✅ Schema change: Task 2.
- ✅ `lib/notion.ts` shape matches spec signatures (Task 3).
- ✅ Hook-point list: Tasks 4–10 are 1:1 with the spec's 4 create + 3 update sites.
- ✅ Failure handling: every call wrapped in try/catch inside `lib/notion.ts`; callers add belt-and-suspenders `.catch`.
- ✅ Testing plan (Task 13) covers all 6 manual checks from the spec.

**Deviations from spec:**

1. Setup script is `.mjs`, not `.ts` — matches existing `smoke-rls.mjs` precedent and avoids adding `tsx` devDep. Functionally identical.
2. Spec mentions `NOTION_PARENT_PAGE_ID` "Setup only" — confirmed in Task 12, we don't add it to Vercel.

**Type consistency check:** `createNotionTicketPage` arg shape in Task 3 matches calls in Tasks 4–7. `updateNotionTicketStatus({ ticketId, status })` shape matches calls in Tasks 8–10. ✅
