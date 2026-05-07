# Admin Test-Delete Ticket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a delete button to each row of `/admin/tickets` that lets the admin permanently delete a tracked ticket (for cleaning up personal test tickets), gated by `requireAdmin()` on the server and `window.confirm()` in the UI.

**Architecture:**
1. Loosen the existing `DELETE` handler at `app/api/admin/tickets/[id]/route.ts` so admins can delete any ticket (today it refuses tracked tickets — only inquiries pass through). Messages cascade via the Prisma schema.
2. Add a small client-component button (`DeleteTicketButton`) and embed it as a sibling of the existing `<Link>` in each `<li>` of the admin tickets list. On click → `confirm()` → `fetch DELETE` → `router.refresh()`.

**Tech Stack:** Next.js 16.2.4 (App Router, server components by default), React 19, Prisma, TypeScript, Tailwind. No test runner is configured in this repo; verification is manual per the spec.

**Spec:** `docs/superpowers/specs/2026-05-07-admin-test-delete-ticket-design.md`

**Important repo convention:** Per `AGENTS.md`, this is Next.js 16, which has breaking changes vs. older mental models. If anything in the App Router APIs (route params being a `Promise`, etc.) feels off, check `node_modules/next/dist/docs/01-app/` before improvising.

---

## File Map

- **Modify** `app/api/admin/tickets/[id]/route.ts` — replace the inquiry-only DELETE branch with an unconditional admin-gated delete.
- **Create** `app/admin/tickets/delete-ticket-button.tsx` — client component, one trash button per row.
- **Modify** `app/admin/tickets/page.tsx` — restructure each `<li>` so the button sits as a sibling of the `<Link>`, not nested inside it.

No new dependencies. No schema changes. No new env vars.

---

## Task 1: Loosen the admin ticket DELETE handler

**Files:**
- Modify: `app/api/admin/tickets/[id]/route.ts` (the existing `DELETE` export, lines 96–135)

The current handler uses `prisma.ticket.deleteMany({ where: { id, isInquiry: true } })` and then a follow-up read to disambiguate whether the id was missing or belonged to a tracked ticket. We replace that whole branch with a single `prisma.ticket.delete({ where: { id } })`, catching Prisma's `P2025` for "record not found".

- [ ] **Step 1: Replace the DELETE handler body**

In `app/api/admin/tickets/[id]/route.ts`, replace the existing `DELETE` function (the entire export starting at `export async function DELETE(`) with this:

```typescript
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
  try {
    await prisma.ticket.delete({ where: { id } });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}
```

Notes:
- Messages cascade automatically — `Message.ticket` has `onDelete: Cascade` in `prisma/schema.prisma`.
- We don't import a Prisma error class because the codebase doesn't elsewhere; duck-typing the `P2025` code is consistent with the surrounding style.
- The handler still relies on the existing imports of `requireAdmin`, `AuthRequiredError`, `AdminRequiredError`, `prisma`, and `NextResponse` — they're already at the top of the file.

- [ ] **Step 2: Type-check and lint**

Run:

```bash
npm run lint
```

Expected: no new errors in `app/api/admin/tickets/[id]/route.ts`. (Pre-existing repo warnings unrelated to this file are fine.)

- [ ] **Step 3: Manual verify with curl**

Start the dev server in another terminal if it isn't already:

```bash
npm run dev
```

Get an admin session cookie by logging into the admin UI in a browser, then open DevTools → Application → Cookies and copy the `sb-*` cookie values. Use them in a curl call against a known test ticket id (read one from the admin UI URL `/admin/ticket/<id>`):

```bash
curl -i -X DELETE \
  -H "Cookie: <paste sb-* cookies here>" \
  http://localhost:3000/api/admin/tickets/<TEST_TICKET_ID>
```

Expected: `HTTP/1.1 200 OK` and body `{"ok":true}`. Hitting it again with the same id: `HTTP/1.1 404` and body `{"error":"Ticket not found."}`. Hitting it without admin cookies: `401` or `403`.

If you don't have a spare test ticket, create one via the portal first.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/tickets/[id]/route.ts
git commit -m "feat(admin): allow deleting tracked tickets via DELETE endpoint

Drops the inquiry-only guard from the admin ticket DELETE handler so
admins can clean up tracked tickets (primarily test tickets) without
DB access. requireAdmin() remains the authorization gate; messages
cascade via the Prisma schema."
```

---

## Task 2: Add the delete button and wire it into the tickets list

**Files:**
- Create: `app/admin/tickets/delete-ticket-button.tsx`
- Modify: `app/admin/tickets/page.tsx` (the `<li>` block, currently lines 62–88)

Two changes that have to land together — a component nobody renders is dead code, and the row restructure with no button is a regression. One commit.

- [ ] **Step 1: Create the DeleteTicketButton client component**

Create `app/admin/tickets/delete-ticket-button.tsx` with this exact content:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  label: string;
};

export function DeleteTicketButton({ id, label }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    if (pending) return;
    if (!window.confirm(`Delete ticket ${label}? This cannot be undone.`)) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/admin/tickets/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) detail = body.error;
        } catch {
          // body wasn't JSON; keep the HTTP status fallback
        }
        // 404 means it's already gone — refresh so the row disappears.
        if (res.status === 404) router.refresh();
        window.alert(`Couldn't delete ticket: ${detail}`);
        return;
      }
      router.refresh();
    } catch (err) {
      console.error("[DeleteTicketButton] delete failed:", err);
      window.alert("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={`Delete ticket ${label}`}
      className="shrink-0 px-3 py-2 -mr-2 text-ink-mute hover:text-signal-red disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      title="Delete ticket (testing)"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    </button>
  );
}
```

Notes:
- `text-ink-mute` and `text-signal-red` are existing tokens used elsewhere on this page (see `app/admin/tickets/page.tsx` and `tailwind.config.*`). Don't introduce new colors.
- The button intentionally uses `window.confirm` and `window.alert` per the spec — keeping it boring keeps it safe for testing. The codebase has a `Toast` system; we're explicitly *not* wiring it up here, see the spec for rationale.
- `router.refresh()` re-runs the server component and re-fetches `prisma.ticket.findMany`, so the row vanishes without a hard reload.

- [ ] **Step 2: Restructure each row in the tickets list page**

In `app/admin/tickets/page.tsx`, two edits:

(a) Add the import near the top, alongside the other imports:

```tsx
import { DeleteTicketButton } from "./delete-ticket-button";
```

(b) Replace the entire `<li>...</li>` block (currently lines 62–88, the `tickets.map((t) => (...))` body) with this:

```tsx
<li key={t.id} className="flex items-stretch">
  <Link
    href={`/admin/ticket/${t.id}`}
    className="block flex-1 min-w-0 py-4 hover:bg-parchment-warm/40 transition-colors px-2"
  >
    <div className="flex flex-col md:flex-row md:items-center md:gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <StatusPill status={t.status} />
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
            {ticketNumber(t.id, t.createdAt)}
          </span>
        </div>
        <p className="font-display text-lg text-ink truncate">
          {t.title}
        </p>
        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mt-1">
          {t.clientAccount.name} · {t.site.displayName}
        </p>
      </div>
      <div className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-fade md:text-right shrink-0 mt-2 md:mt-0">
        Filed {formatRelative(t.createdAt)}
      </div>
    </div>
  </Link>
  <div className="flex items-center pl-2">
    <DeleteTicketButton
      id={t.id}
      label={ticketNumber(t.id, t.createdAt)}
    />
  </div>
</li>
```

What changed vs. the original:
- The `<li>` now has `className="flex items-stretch"` so the link and the delete button sit side-by-side.
- The `<Link>` lost its outer `<li>` role; it now uses `flex-1 min-w-0` so it stretches and truncates correctly.
- A new `<div>` after the `<Link>` holds the `DeleteTicketButton`. It's a sibling of the link, **not** nested inside it — that's required so clicking the button doesn't also navigate.

- [ ] **Step 3: Type-check and lint**

```bash
npm run lint
```

Expected: no new errors. If TypeScript complains about `useRouter` import path, double-check it's `next/navigation` (not the legacy `next/router`) — Next.js 16 App Router uses `next/navigation`.

- [ ] **Step 4: Manual verify in the browser**

Start the dev server if it isn't already:

```bash
npm run dev
```

Then:

1. Sign in as admin.
2. Create a throwaway ticket from the portal (or use an existing test ticket).
3. Visit `http://localhost:3000/admin/tickets`. Confirm the trash icon appears at the right edge of each row, doesn't overlap the row text, and shows the red hover color.
4. Click the trash icon on the test ticket. The browser confirm should read: `Delete ticket DSP-XXXXXX? This cannot be undone.` (or whatever your `ticketNumber` returns).
5. Click **OK**. The row disappears from the list within a moment (no full page reload — `router.refresh()`).
6. Verify in a second tab: the ticket detail page `/admin/ticket/<deleted-id>` now 404s, and the ticket no longer appears in `/admin/tickets`.
7. Repeat the click-delete flow but choose **Cancel** in the confirm — nothing should happen, the row stays, no network call (check the Network tab).
8. Click the trash icon, click OK, then quickly click another trash icon while the first is in flight (or throttle the network in DevTools). The first button should be `disabled` while pending; you shouldn't be able to fire two deletes from the same button at once.
9. Click on the row body (anywhere outside the trash button) — should navigate to `/admin/ticket/<id>` as before. Clicking the trash button should *not* navigate.

If any step fails, debug before committing.

- [ ] **Step 5: Commit**

```bash
git add app/admin/tickets/delete-ticket-button.tsx app/admin/tickets/page.tsx
git commit -m "feat(admin): delete button on tickets list rows

Adds a trash-icon button per row on /admin/tickets that calls the
admin DELETE endpoint after a confirm() prompt. Restructures each
<li> so the button is a sibling of the row link, avoiding nested
interactive elements. Intended for cleaning up test tickets."
```

---

## Done

- New behavior: admin can delete any ticket from `/admin/tickets` via a per-row trash button.
- No automated tests added (none expected — see spec).
- Two commits land: one backend, one frontend.
- Orphaned Supabase Storage attachments are accepted as known and tracked under post-launch cleanup.
