# Dispatch — QA checklist

Walk-through against the preview URL: `https://dispatch-git-client-portal-developer-of-code-llcs-projects.vercel.app`. Mark a box once verified; if anything's red, paste the symptom into the chat and we'll fix before promoting to production.

## What's already verified during the build

These were exercised live during Phase 4–10. Re-verifying isn't urgent.

- [x] Invite signup, new email path (Phase 5 commit testing)
- [x] Invite revoke + clean-up (the manual `_wipe_test_invite.mjs` run)
- [x] Login + logout + session persistence
- [x] Admin role tag drives `/admin` redirect on login
- [x] Real-time chat across two tabs (Phase 8 testing)
- [x] Typing indicators across two tabs (Phase 8 testing)
- [x] Per-ticket presence (Online / Offline indicator on chat header)
- [x] Global admin presence (portal masthead green pulse when admin tab open)
- [x] Toast on client sign-in / sign-out (newsroom ticker, bottom-left)
- [x] Toast on every new ticket (regardless of admin page)
- [x] Live-update of `/admin/invites` and `/admin/tickets` lists
- [x] Status-driven 6-stage timeline (active marker, filled boxes track current status)
- [x] Screenshot upload via signed URL → appears in chat / ticket info card
- [x] Email: invite (Phase 5)
- [x] Email: new message → admin (debounced, Phase 8)
- [x] Email: new message → client (debounced, Phase 8)

## Pending verification before Phase 14

### Email triggers — open inbox to verify each

- [ ] **New ticket → admin email** lands in `developerofcodellc@gmail.com` when a client submits a ticket
- [ ] **Awaiting Confirmation email** lands in client's inbox when admin transitions ticket to `AWAITING_CONFIRMATION` ("Mark Fixed")
- [ ] **Ticket Reopened email** lands in admin inbox when client clicks "Issue Persists" on an awaiting-confirmation ticket
- [ ] All emails show **`Dispatch · Developer of Code <support@developerofcode.com>`** as the From (verifies the env var update propagated)

### Status transitions

- [ ] Mark Fixed → status flips to `AWAITING_CONFIRMATION` → client portal shows the green "Awaiting your confirmation" panel with Confirm/Reopen buttons
- [ ] Client clicks **Confirm Fixed** → status flips to `CLOSED`, ticket detail still loads but the action panel is gone
- [ ] Client clicks **Issue Persists** instead → status flips to `REOPENED`, admin can transition back to FIXING

### Cross-client isolation (RLS)

This is the most important security check before launch. Need **two distinct test clients** to verify.

- [ ] File an invite to a second test email (a different gmail+ alias works, e.g. `developerofcodellc+secondclient@gmail.com`)
- [ ] Redeem it, log in as that second client
- [ ] Confirm second-client dashboard shows **zero** of the first client's tickets
- [ ] Try direct URL `/portal/ticket/<first-client-ticket-id>` → should 404 or "Ticket not found"
- [ ] Sites dropdown on `/portal/ticket/new` shows **only** sites attached to second client

### Upload limits

- [ ] >25 MB file → rejected with "File exceeds 25 MB cap."
- [ ] `.exe` or other unsupported MIME → rejected with "Unsupported file type."
- [ ] `.zip` accepted (with the bucket settings update from earlier)
- [ ] PDF accepted, renders as filename + download link

### Error paths

- [ ] Expired invite token → "Invite no longer valid" page
- [ ] Wrong password → inline error on `/portal`, no flash redirect
- [ ] Logged-in client visits `/admin` → redirect to `/portal/dashboard` (not `/admin`)
- [ ] Logged-out user visits `/portal/dashboard` → redirect to `/portal?from=...`

---

After every box above is green, we're clear for Phase 14 (production cutover).
