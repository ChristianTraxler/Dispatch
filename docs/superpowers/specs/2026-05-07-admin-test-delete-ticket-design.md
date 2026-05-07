# Admin Test-Delete Ticket — Design

Date: 2026-05-07
Status: Approved

## Purpose

Give the admin a one-click way to permanently delete a ticket from the admin
tickets list, primarily so the operator can clean up tickets created during
personal testing without going to the database.

## Scope

In:
- A delete button on each row of the admin tickets list (`/admin/tickets`).
- Backend support for deleting *any* ticket (not just inquiries) when the
  caller is an admin.
- Native `confirm()` dialog as the safety gate.

Out (deferred unless requested later):
- A delete control on the ticket detail page.
- Soft delete / undo.
- Cleaning up orphaned attachments in Supabase Storage.
- Bulk delete.

## Backend

File: `app/api/admin/tickets/[id]/route.ts`

The existing `DELETE` handler currently refuses to remove tracked tickets — it
only allows inquiries through. Loosen it so an authenticated admin can delete
any ticket by id:

- Keep the `requireAdmin()` gate (this is the real authorization).
- Replace the `deleteMany({ where: { id, isInquiry: true } })` + follow-up
  disambiguation with a direct `prisma.ticket.delete({ where: { id } })`.
- Catch Prisma's `P2025` ("record not found") and return `404`.
- On success, return `{ ok: true }`.

Messages cascade automatically via the Prisma schema
(`Message.ticket` has `onDelete: Cascade`), so no manual message cleanup
needed. Attachments stored in Supabase Storage will be orphaned; that is
accepted for now and tracked separately under post-launch cleanup.

## Frontend

### New component — `app/admin/tickets/delete-ticket-button.tsx`

A small client component, one per row.

Props:
- `id: string` — ticket id
- `label: string` — short human-readable identifier used in the confirm
  message (e.g., the ticket number from `ticketNumber(t.id, t.createdAt)`).

Behavior:
- Renders a button containing a trash icon. Style: `signal-red` accent on
  hover, neutral ink at rest, matches the existing mono/display typography
  used elsewhere on the page. Sized to align with the row height.
- `aria-label="Delete ticket {label}"`.
- On click:
  1. Show `window.confirm("Delete ticket {label}? This cannot be undone.")`.
  2. If confirmed, set `pending=true`, `fetch('/api/admin/tickets/' + id, { method: 'DELETE' })`.
  3. On 2xx: call `router.refresh()` to re-render the list.
  4. On non-2xx or thrown error: `alert(parsed error message)` and clear `pending`.
- While `pending`, the button is disabled and visually muted.

### Row restructure — `app/admin/tickets/page.tsx`

Each `<li>` currently wraps the entire row in a `<Link>`. To avoid nested
interactive elements (which break a11y and can swallow the button click),
restructure each row so the link and the delete button are siblings:

```
<li className="relative">
  <div className="flex items-center">
    <Link className="flex-1 ...">...row body unchanged...</Link>
    <DeleteTicketButton id={t.id} label={ticketNumber(t.id, t.createdAt)} />
  </div>
</li>
```

The button sits on the right side of the row. Existing hover background on
the link area is preserved; the button has its own hover treatment so it does
not inherit the row hover.

## Error & edge cases

- Ticket already deleted by another tab: API returns 404 → button shows
  alert, then `router.refresh()` happens implicitly because the row will be
  gone on next load (we still call `router.refresh()` on 404 too, to clean up
  the stale row).
- Non-admin somehow reaches the page: `requireAdmin()` returns 401/403,
  alert shows the API's error message.
- Network failure: `alert("Network error.")` and re-enable the button.

## Testing

Manual verification on the admin tickets page:
1. Create a test ticket from the portal.
2. Click delete on its row → confirm → row disappears, ticket no longer in
   `prisma.ticket.findMany`, related messages gone.
3. Cancel the confirm dialog → no request fires, row stays.
4. Delete a ticket that another tab already deleted → graceful error and the
   list refreshes.

No automated tests for this; it is a thin admin-only utility behind a
confirm dialog.

## Risk

Low. The endpoint is already admin-gated. The only new exposure is that an
admin can now delete tracked tickets through the UI rather than only
inquiries — which is the explicit goal. Native `confirm()` is the safety net
against single-click misfires.
