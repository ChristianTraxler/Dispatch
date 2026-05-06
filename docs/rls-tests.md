# RLS smoke tests

Verifies the policies in [prisma/rls-policies.sql](../prisma/rls-policies.sql) actually deny cross-account access at the database level.

## Run the smoke test

```bash
node --env-file=.env.local --env-file=.env scripts/smoke-rls.mjs
```

Script: [scripts/smoke-rls.mjs](../scripts/smoke-rls.mjs).

It inserts a fake `ClientAccount + Site + Ticket` via Prisma (which connects as `postgres` and bypasses RLS), reads and writes the same rows via the Supabase anon client (which is fully gated by RLS, just like an unauthenticated browser), and cleans up.

### Expected output

```
1. Insert a fake ClientAccount + Site + Ticket via Prisma (bypasses RLS)
   Inserted ticket: <cuid>

2. Query via Prisma (postgres role — bypasses RLS):
   Tickets visible: 1 (expect ≥1)

3. Query via Supabase anon client (RLS active, no auth.uid()):
   client_accounts visible: 0 (expect 0)
   sites            visible: 0 (expect 0)
   tickets          visible: 0 (expect 0)
   invites          visible: 0 (expect 0)
   messages         visible: 0 (expect 0)

4. Try INSERT via anon (should fail):
   Insert error: 42501 — new row violates row-level security policy for table "tickets"

5. Cleanup: delete fake rows
   Tickets after cleanup: 0 (expect 0)

✓ Smoke test complete
```

Last verified: **2026-05-05** — all assertions passed against project `nejfqfbqxyydvstvbauh`.

## What this proves

| Assertion | What it covers |
|---|---|
| Anon read returns 0 rows from each client-facing table | RLS is enabled, default deny works |
| Anon INSERT errors with code `42501` | The `WITH CHECK` clauses are firing (not just `USING`) |
| Prisma read sees inserted rows | Service-role / postgres bypass works (admin path is unblocked) |
| Cleanup leaves the DB empty | The test is non-destructive and idempotent |

## What this does NOT cover (yet)

These need real Supabase auth users, which don't exist until **Phase 4** (login) and **Phase 5** (invite redemption):

- **Cross-client isolation** — sign in as client A, query, confirm you can't see client B's tickets when logged in.
- **Own-data access** — sign in as client A, query, confirm you *can* see client A's own tickets.
- **`sender_type = 'CLIENT'` enforcement** — signed-in client tries to insert a message with `sender_type = 'ADMIN'`, should be blocked.

When Phase 4 lands, extend this doc with those scenarios and re-run.
