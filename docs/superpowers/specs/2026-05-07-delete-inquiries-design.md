# Delete inquiries from the admin Inquiries page

**Date:** 2026-05-07
**Status:** Approved, ready for implementation plan
**Author:** Christian (with Claude)

## Problem

The admin Inquiries page at `/admin/inquiries` lists lightweight quick-chat threads. There is currently no way to remove a chat — only "End the chat" (which moves it to the Archived tab) and "Promote to ticket" (which converts it to a tracked ticket). Throwaway chats accumulate in both Active and Archived, and the admin has no control over the list's contents.

## Goal

Give the admin a per-row delete affordance on both Active and Archived tabs of the Inquiries page that hard-deletes the inquiry and its messages.

## Non-goals

- Deleting tracked tickets (`isInquiry: false`). Out of scope; the new endpoint will explicitly reject those.
- Bulk select / multi-delete. Single-row only.
- Undo / soft-delete / Trash tab. Hard delete is final.
- Cleaning up Supabase Storage objects for any attachments on the deleted inquiry's messages. Inquiries rarely carry attachments, and the existing post-launch attachment-cleanup task covers this class of orphan.

## Design choices (confirmed during brainstorm)

- **Hard delete.** Permanently removes the row; no recovery. Fits the "lightweight quick chat" framing.
- **Per-row trash icon.** Hover-revealed on desktop, always visible on mobile.
- **Inline confirmation.** The row's right-side metadata area swaps to `DELETE? ✓ ✗`. No modal.
- **Both tabs.** Active and Archived both get the affordance.

## Architecture

### Backend

**New method on existing route:** `DELETE /api/admin/tickets/[id]` (added to `app/api/admin/tickets/[id]/route.ts`, which already exports GET and PATCH).

Behavior:
1. Auth-guard with `requireAdmin`.
2. Look up the ticket by `id`.
3. If not found → 404 `{ error: "Inquiry not found." }`.
4. If `ticket.isInquiry === false` → 400 `{ error: "Endpoint scoped to inquiries; refusing to delete a tracked ticket." }`.
5. Otherwise `prisma.ticket.delete({ where: { id } })`. The `Message.ticket` foreign key has `onDelete: Cascade`, so messages are removed by Postgres.
6. Return `{ ok: true }` (200).

No schema changes.

### Frontend file shape

```
app/admin/inquiries/
  page.tsx                    (server: query + hydrate avatars, pass data to client wrapper)
  inquiries-list-client.tsx   (NEW — client: row state for optimistic removal)
  inquiry-row.tsx             (NEW — client: row UI with delete confirm)
  inquiries-refresh.tsx       (existing — unchanged)
```

**`page.tsx`** continues to do the Prisma query, avatar hydration, and tab counts. Instead of mapping rows inline, it serializes them into a flat DTO array and renders `<InquiriesListClient initial={dtos} showArchived={...} />`. Tab navigation, headers, and empty state stay in the server component.

**`inquiries-list-client.tsx`** is a small client wrapper modeled on the existing `ClientsListClient`. Holds `useState(initial)` for the displayed rows, exposes `removeRow(id)` to children, and renders the row list plus an `<InquiryRow>` per item.

**`inquiry-row.tsx`** owns the row markup and delete UI:
- Default mode: same `<Link>` → `/admin/ticket/{id}` with avatar, name, last-message preview, and the metadata chip (`N MSGS · X AGO`). Adds a trash icon at the right edge after the chip.
- Trash icon: inline SVG (the codebase uses inline SVGs, not an icon library), small, ink-mute color, `aria-label="Delete inquiry"`. Visibility: hidden on desktop until the row is hovered (`opacity-0 md:group-hover:opacity-100`); always visible on mobile (no hover state on touch).
- Confirm mode (toggled by `useState`): the metadata chip's slot swaps to a small inline group: `DELETE?  ✓  ✗`, mono uppercase, `signal-red ✓`, `ink-mute ✗`. The outer `<Link>` is rendered as a non-link `<div>` while confirming, so accidental clicks don't navigate.
- Cancel triggers: click the `✗`, press `Esc`, or click anywhere outside the row (`useEffect` listens on `document` while confirming).

### Data flow

1. Click trash → `setConfirming(true)`. No network.
2. Click `✓` → `fetch("/api/admin/tickets/{id}", { method: "DELETE" })`.
3. On 200 → call `removeRow(id)` (optimistic) and `router.refresh()` (re-syncs the active/archived header counts).
4. On non-200 → `setConfirming(false)`, push toast via existing `ToastProvider`: kind `"info"`, title `"Couldn't delete inquiry"`, detail `"Try again."`. Row stays.
5. `✗` / `Esc` / click-outside → `setConfirming(false)`. No network.

### Realtime

The existing `InquiriesLiveRefresh` subscribes to changes on the `ticket` table and calls `router.refresh()`. Supabase Realtime emits DELETE events by default for tables in the `supabase_realtime` publication; if the ticket table is already in the publication for INSERT/UPDATE events (it is, given the existing realtime feed), DELETE will work too. Verify during implementation; if DELETE events don't fire, the fix is a one-line publication update on the Supabase project.

The end-result: deleting an inquiry in one admin tab will make it disappear from any other open admin tab within the realtime debounce window.

### Error handling

- Backend `delete` failure (rare — only if the row is gone between findUnique and delete): return 500 `{ error: "Delete failed." }`. The frontend already has the toast for non-200 responses.
- Network failure on the client: same toast path.

## Testing

Manual smoke test against the running dev server:
1. Create a throwaway inquiry from a portal account (existing quick-chat launcher).
2. As admin, navigate to `/admin/inquiries` → row appears in Active tab.
3. Hover the row → trash icon fades in. On mobile width, icon is always visible.
4. Click trash → metadata chip swaps to `DELETE? ✓ ✗`. The row link is no longer clickable in this state.
5. Click `✗` → returns to idle, no network call.
6. Click trash again → click `✓` → row disappears, header counts update, network tab shows `DELETE … 200`.
7. Refresh page → row stays gone.
8. Repeat steps 1–7 on the Archived tab (after ending an inquiry first).
9. Negative test — temporarily curl `DELETE /api/admin/tickets/<a tracked-ticket id>` → expect 400.
10. Negative test — curl `DELETE /api/admin/tickets/<bogus id>` → expect 404.

## Risks

- **Storage leaks.** A deleted inquiry with attachments orphans the Supabase Storage objects. Acceptable given the existing planned cleanup work.
- **Realtime DELETE events.** If the ticket table's publication doesn't include DELETE, other open admin tabs won't auto-update on a delete. Easy one-line fix when discovered.
- **Misclicks.** Mitigated by the two-click inline confirm; no destructive action happens until the second click.
