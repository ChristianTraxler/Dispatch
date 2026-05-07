# Delete Inquiries — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-row hard-delete affordance to the admin Inquiries page, scoped to inquiries (not tracked tickets).

**Architecture:** New `DELETE` method on `/api/admin/tickets/[id]` (refuses non-inquiries). The existing server-rendered inquiry rows move into a small client component tree (`inquiries-list-client.tsx` for state + `inquiry-row.tsx` for row UI) so a row can own confirm-state and trigger optimistic removal. No schema changes — `Message.ticket` cascade handles message cleanup.

**Tech Stack:** Next.js 15 (App Router, server components by default), Prisma, Tailwind, Supabase Realtime (already wired). No icon library; inline SVGs.

**Spec:** [docs/superpowers/specs/2026-05-07-delete-inquiries-design.md](../specs/2026-05-07-delete-inquiries-design.md)

**Note on tests:** This project has no test framework configured (no Jest/Vitest, no `__tests__` dir). Each task ends with a manual verification step (curl or browser action) instead of an automated test. If a test framework is added later, the curl smoke checks here translate directly to integration tests.

---

## Task 1: Add `DELETE` method to the ticket route

**Files:**
- Modify: `app/api/admin/tickets/[id]/route.ts` (append after the existing `PATCH` export)

- [ ] **Step 1: Add the DELETE handler**

Edit `app/api/admin/tickets/[id]/route.ts`. Append this new export at the very end of the file (after the closing `}` of the `PATCH` function):

```ts
export async function DELETE(
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
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, isInquiry: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Inquiry not found." }, { status: 404 });
  }
  if (!ticket.isInquiry) {
    return NextResponse.json(
      {
        error:
          "Endpoint scoped to inquiries; refusing to delete a tracked ticket.",
      },
      { status: 400 },
    );
  }

  // Message rows are removed automatically by the onDelete: Cascade FK.
  await prisma.ticket.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

The existing imports already cover `NextResponse`, `prisma`, `requireAdmin`, `AuthRequiredError`, and `AdminRequiredError`. No new imports needed.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 3: Smoke-test the endpoint via curl**

Start dev server if it isn't running: `npm run dev` (in another terminal).

Then, while signed in as admin in a browser, copy the `dispatch_session` cookie value from DevTools → Application → Cookies. Pick an existing inquiry id from the DB (or create one fresh from a portal account using the quick-chat launcher).

```bash
# Should return 400 because the id belongs to a tracked ticket (isInquiry = false):
curl -i -X DELETE \
  -H "Cookie: dispatch_session=<paste-value>" \
  http://localhost:3000/api/admin/tickets/<a-tracked-ticket-id>

# Should return 404:
curl -i -X DELETE \
  -H "Cookie: dispatch_session=<paste-value>" \
  http://localhost:3000/api/admin/tickets/does-not-exist

# Should return 200 {"ok":true} and actually delete the inquiry:
curl -i -X DELETE \
  -H "Cookie: dispatch_session=<paste-value>" \
  http://localhost:3000/api/admin/tickets/<an-inquiry-id>
```

Verify the inquiry vanished from `/admin/inquiries` (after a refresh) and from the DB:

```bash
npx prisma studio
# Filter Ticket by id = <an-inquiry-id> → no rows. Filter Message by ticketId = <an-inquiry-id> → no rows.
```

If 401 instead of 200 from any of the calls, the cookie is wrong or expired — re-copy from DevTools.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/tickets/[id]/route.ts
git commit -m "$(cat <<'EOF'
feat(api): DELETE handler for inquiries on /api/admin/tickets/[id]

Hard-deletes the ticket row when isInquiry=true. Refuses tracked tickets
with 400. Message rows are removed by the onDelete: Cascade FK.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extract `InquiryRow` client component (no delete UI yet)

**Files:**
- Create: `app/admin/inquiries/inquiry-row.tsx`
- Modify: `app/admin/inquiries/page.tsx` (lines 105–143 — the `<li>` body inside the `inquiries.map(...)` loop)

This is a pure refactor: same visible markup, just moved into a client component. Adding the delete affordance happens in Task 4.

- [ ] **Step 1: Create the row component**

Create `app/admin/inquiries/inquiry-row.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";

export interface InquiryRowData {
  id: string;
  clientName: string;
  avatarUrl: string | null;
  preview: string;
  lastSenderTag: string;
  messageCount: number;
  activityIso: string;
}

interface Props {
  row: InquiryRowData;
}

function formatRelative(iso: string): string {
  const value = new Date(iso);
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

export function InquiryRow({ row }: Props) {
  return (
    <li>
      <Link
        href={`/admin/ticket/${row.id}`}
        className="block py-4 hover:bg-parchment-warm/40 transition-colors px-2"
      >
        <div className="flex items-center gap-4">
          <Avatar
            src={row.avatarUrl}
            name={row.clientName}
            size={40}
            tone="client"
          />
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg text-ink">{row.clientName}</p>
            <p className="font-display italic text-ink-mute text-sm mt-1 truncate">
              <span className="font-mono not-italic text-[0.55rem] uppercase tracking-widest text-ink-fade mr-2">
                {row.lastSenderTag}:
              </span>
              {row.preview}
            </p>
          </div>
          <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade text-right shrink-0">
            {row.messageCount} msg{row.messageCount === 1 ? "" : "s"} ·{" "}
            {formatRelative(row.activityIso)}
          </div>
        </div>
      </Link>
    </li>
  );
}
```

- [ ] **Step 2: Update `page.tsx` to use the new component**

In `app/admin/inquiries/page.tsx`:

a) Add the import near the top, alongside the other component imports:

```ts
import { InquiryRow, type InquiryRowData } from "./inquiry-row";
```

b) Remove the unused `formatRelative` function (lines 11–21) — it now lives inside `inquiry-row.tsx`.

c) Replace the existing `inquiries.map(...)` body (the entire `<ul>` block, lines 106–146 — the `<ul className="divide-y divide-rule-soft">` element) with this:

```tsx
        <ul className="divide-y divide-rule-soft">
          {inquiries.map((t, i) => {
            const last = t.messages[0];
            const preview =
              last?.body?.trim().slice(0, 100) ?? "(no messages yet)";
            const lastSenderTag =
              last?.senderType === "CLIENT"
                ? "client"
                : last?.senderType === "ADMIN"
                  ? "you"
                  : "—";
            const row: InquiryRowData = {
              id: t.id,
              clientName: t.clientAccount.name,
              avatarUrl: avatarUrls[i],
              preview,
              lastSenderTag,
              messageCount: t._count.messages,
              activityIso: (t.lastMessageAt ?? t.createdAt).toISOString(),
            };
            return <InquiryRow key={t.id} row={row} />;
          })}
        </ul>
```

d) Remove the now-unused `import Link from "next/link";` and `import { Avatar } from "@/components/Avatar";` from `page.tsx` if they're no longer referenced. (They were used only in the row markup that just moved.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Browser smoke test**

Open `http://localhost:3000/admin/inquiries`. The page should look identical to before — same row layout, same avatar, same preview, same metadata chip, same hover background.

- [ ] **Step 5: Commit**

```bash
git add app/admin/inquiries/page.tsx app/admin/inquiries/inquiry-row.tsx
git commit -m "$(cat <<'EOF'
refactor(inquiries): extract row markup into InquiryRow client component

Pure visual refactor; identical output. Sets up the next change to add
delete UI and confirm state on a per-row basis.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `InquiriesListClient` wrapper for optimistic state

**Files:**
- Create: `app/admin/inquiries/inquiries-list-client.tsx`
- Modify: `app/admin/inquiries/page.tsx`

The wrapper holds the live row array in `useState` so a delete can immediately remove the row without waiting for a `router.refresh()` round-trip.

- [ ] **Step 1: Create the client wrapper**

Create `app/admin/inquiries/inquiries-list-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { InquiryRow, type InquiryRowData } from "./inquiry-row";

interface Props {
  initial: InquiryRowData[];
  emptyMessage: string;
}

export function InquiriesListClient({ initial, emptyMessage }: Props) {
  const [rows, setRows] = useState(initial);

  // If the server hands us a different list (e.g. tab switch via the existing
  // refresh hook), sync the local state. Cheap because the array is short.
  // We compare ids to avoid stomping an in-flight optimistic removal.
  const initialIds = initial.map((r) => r.id).join("|");
  const [knownIds, setKnownIds] = useState(initialIds);
  if (initialIds !== knownIds) {
    setRows(initial);
    setKnownIds(initialIds);
  }

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  if (rows.length === 0) {
    return <p className="font-display italic text-ink-mute">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-rule-soft">
      {rows.map((row) => (
        <InquiryRow key={row.id} row={row} onDelete={removeRow} />
      ))}
    </ul>
  );
}
```

Note: `InquiryRow` doesn't accept `onDelete` yet — that's added in Task 4. The TypeScript error from this line is expected and will be resolved at the end of Task 4. Don't typecheck yet.

- [ ] **Step 2: Update `page.tsx` to use the wrapper and pass empty-state copy**

In `app/admin/inquiries/page.tsx`:

a) Add the import:

```ts
import { InquiriesListClient } from "./inquiries-list-client";
```

b) Remove the import added in Task 2 if you'd rather route everything through the wrapper:

```ts
// Remove this:
import { InquiryRow, type InquiryRowData } from "./inquiry-row";
// Replace with:
import type { InquiryRowData } from "./inquiry-row";
```

c) Replace the entire `{inquiries.length === 0 ? (...) : (<ul>...)}` block with a single call:

```tsx
      <InquiriesListClient
        initial={inquiries.map((t, i) => {
          const last = t.messages[0];
          const preview =
            last?.body?.trim().slice(0, 100) ?? "(no messages yet)";
          const lastSenderTag =
            last?.senderType === "CLIENT"
              ? "client"
              : last?.senderType === "ADMIN"
                ? "you"
                : "—";
          const row: InquiryRowData = {
            id: t.id,
            clientName: t.clientAccount.name,
            avatarUrl: avatarUrls[i],
            preview,
            lastSenderTag,
            messageCount: t._count.messages,
            activityIso: (t.lastMessageAt ?? t.createdAt).toISOString(),
          };
          return row;
        })}
        emptyMessage={
          showArchived ? "Nothing archived yet." : "No active inquiries."
        }
      />
```

- [ ] **Step 3: Defer typecheck and commit until Task 4**

Don't run `tsc` or commit yet — `InquiriesListClient` references an `onDelete` prop that the row component doesn't define. Both go in together at the end of Task 4.

---

## Task 4: Add the trash icon and inline-confirm UI to `InquiryRow`

**Files:**
- Modify: `app/admin/inquiries/inquiry-row.tsx`

- [ ] **Step 1: Replace the row component with the delete-aware version**

Replace the full contents of `app/admin/inquiries/inquiry-row.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";

export interface InquiryRowData {
  id: string;
  clientName: string;
  avatarUrl: string | null;
  preview: string;
  lastSenderTag: string;
  messageCount: number;
  activityIso: string;
}

interface Props {
  row: InquiryRowData;
  onDelete: (id: string) => void;
}

function formatRelative(iso: string): string {
  const value = new Date(iso);
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

function TrashIcon() {
  // Simple inline trash glyph; matches the inline-SVG pattern used elsewhere
  // (see app/admin/admin-quick-chat-launcher.tsx and components/ScrollToTop.tsx).
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function InquiryRow({ row, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const { push: pushToast } = useToast();
  const router = useRouter();
  const liRef = useRef<HTMLLIElement>(null);

  // Cancel confirm on Esc or click outside the row.
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirming(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!liRef.current) return;
      if (!liRef.current.contains(e.target as Node)) setConfirming(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [confirming]);

  const startConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(true);
  };

  const cancelConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
  };

  const commitDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tickets/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDelete(row.id);
      // Re-syncs the server-rendered Active (N) / Archived (N) counts in
      // the page header.
      router.refresh();
    } catch (err) {
      console.error("[InquiryRow] delete failed:", err);
      pushToast({
        kind: "error",
        title: "Couldn't delete inquiry",
        detail: "Try again.",
      });
      setConfirming(false);
      setBusy(false);
    }
    // Note: on success we don't reset busy/confirming because the row unmounts.
  };

  const metaSlot = confirming ? (
    <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute flex items-center gap-3 shrink-0">
      <span>Delete?</span>
      <button
        type="button"
        onClick={commitDelete}
        disabled={busy}
        className="text-signal-red hover:underline disabled:opacity-50 disabled:cursor-wait"
        aria-label="Confirm delete"
      >
        ✓
      </button>
      <button
        type="button"
        onClick={cancelConfirm}
        className="text-ink-mute hover:text-ink"
        aria-label="Cancel delete"
      >
        ✗
      </button>
    </div>
  ) : (
    <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade text-right shrink-0">
      {row.messageCount} msg{row.messageCount === 1 ? "" : "s"} ·{" "}
      {formatRelative(row.activityIso)}
    </div>
  );

  const inner = (
    <div className="flex items-center gap-4">
      <Avatar
        src={row.avatarUrl}
        name={row.clientName}
        size={40}
        tone="client"
      />
      <div className="flex-1 min-w-0">
        <p className="font-display text-lg text-ink">{row.clientName}</p>
        <p className="font-display italic text-ink-mute text-sm mt-1 truncate">
          <span className="font-mono not-italic text-[0.55rem] uppercase tracking-widest text-ink-fade mr-2">
            {row.lastSenderTag}:
          </span>
          {row.preview}
        </p>
      </div>
      {metaSlot}
      {!confirming && (
        <button
          type="button"
          onClick={startConfirm}
          className="text-ink-mute hover:text-signal-red opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0 p-1 -m-1"
          aria-label="Delete inquiry"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );

  return (
    <li ref={liRef} className="group">
      {confirming ? (
        <div className="block py-4 px-2">{inner}</div>
      ) : (
        <Link
          href={`/admin/ticket/${row.id}`}
          className="block py-4 hover:bg-parchment-warm/40 transition-colors px-2"
        >
          {inner}
        </Link>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (`InquiriesListClient` from Task 3 now matches the row's `onDelete` prop.)

- [ ] **Step 3: Browser smoke test — happy path**

In the browser at `http://localhost:3000/admin/inquiries`:

1. Hover over an inquiry row → trash icon fades in at the right edge.
2. Click the trash icon → the metadata chip swaps to `Delete? ✓ ✗`.
3. Verify clicking inside the row does **not** navigate to the ticket detail (the link is replaced with a plain `<div>` while confirming).
4. Click `✗` → row returns to idle. No network request in DevTools → Network.
5. Click trash again → click `✓` → row disappears immediately. Network tab shows `DELETE /api/admin/tickets/<id>` → 200.
6. Refresh the page → row stays gone. Header counts (`Active (N)` / `Archived (N)`) reflect the change.
7. Press `Esc` while a row is in confirm mode → returns to idle.
8. Click outside the row while in confirm mode → returns to idle.

- [ ] **Step 4: Browser smoke test — Archived tab**

1. Create another inquiry, then end it via the existing "End the chat" action so it lands in Archived.
2. Click the **Archived** tab.
3. Hover the archived row → trash icon appears.
4. Delete it. Row disappears, `Archived (N)` count decrements.

- [ ] **Step 5: Browser smoke test — error path**

In DevTools → Network, enable "Offline". Click trash → click `✓`. Expect:
- An error toast slides in from the bottom-left: "Couldn't delete inquiry — Try again."
- The row stays in place.
- The confirm chip returns to idle so the user can try again.

Re-enable the network.

- [ ] **Step 6: Browser smoke test — mobile width**

Open DevTools responsive mode at iPhone 12 width (390px). The trash icon should be **always visible** on each row (no hover state on touch). Click it → confirm UI works the same.

- [ ] **Step 7: Commit**

```bash
git add app/admin/inquiries/inquiry-row.tsx app/admin/inquiries/inquiries-list-client.tsx app/admin/inquiries/page.tsx
git commit -m "$(cat <<'EOF'
feat(inquiries): per-row delete with inline confirm

Click the trash icon to swap the row's metadata chip to "Delete? ✓ ✗".
Confirm hits DELETE /api/admin/tickets/[id] and removes the row
optimistically; failure shows a toast and reverts. Esc and click-outside
cancel the confirm. Trash icon hover-revealed on desktop, always
visible on mobile.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Verify realtime DELETE propagation across tabs

**Files:** None (verification + optional Supabase config tweak)

- [ ] **Step 1: Two-tab realtime test**

1. Open `/admin/inquiries` in two browser tabs side by side.
2. Create a fresh inquiry from the portal so both tabs show it.
3. In Tab A, delete the row using the new control.
4. **Expected:** Tab B removes the row within a second or two (debounce window of `useRealtimeRefresh`).

If Tab B does NOT remove the row automatically:
- The `tickets` table likely isn't publishing DELETE events. Open Supabase Studio → Database → Replication → `supabase_realtime` publication → ensure DELETE is checked for the `tickets` table.
- Save and re-test. No code changes needed.

- [ ] **Step 2: Final commit if anything changed**

If you touched the Supabase publication, no code commit is needed (Supabase config is out-of-repo). If everything worked first try, no commit needed for this task.

---

## Task 6: Push to production

**Files:** None (deploy step)

- [ ] **Step 1: Push branch and fast-forward `main`**

```bash
git push origin client-portal
git push origin HEAD:main
git fetch origin main:main
```

Expected: both pushes succeed; `origin/main` and `origin/client-portal` end at the same commit. Vercel auto-deploys `main` to `https://support.developerofcode.com`.

- [ ] **Step 2: Production smoke test**

After the Vercel deploy lands (~1–2 min):
1. Open `https://support.developerofcode.com/admin/inquiries` while signed in as admin.
2. Create a throwaway inquiry from a portal account.
3. Delete it via the new trash icon → confirm → row disappears, network shows 200.
4. Refresh → row stays gone.

---

## Out of scope (deferred)

- **Supabase Storage cleanup for inquiry attachments.** Existing post-launch task already covers the orphan-attachments problem class.
- **Bulk delete / multi-select.** Future feature if list growth makes single-row tedious.
- **Soft delete with Trash tab.** Explicitly rejected during brainstorm.
- **Deleting tracked tickets via this endpoint.** Endpoint refuses with 400; needs its own design if/when desired.
