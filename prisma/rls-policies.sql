-- Dispatch — Row Level Security policies
-- See docs/plans/2026-05-04-dispatch-client-portal-design.md (RLS policies section)
--
-- Run this once, after the initial Prisma migration.
-- Idempotent: safe to re-run; ALTER TABLE ENABLE RLS is a no-op if already on,
-- and we DROP POLICY IF EXISTS before each CREATE POLICY.
--
-- The service_role key (used by server-side admin code) bypasses RLS automatically.
-- Anon and authenticated roles are gated by these policies.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Enable RLS on all client-facing tables
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE client_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites         ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. client_accounts — clients see and update their own row
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "client_read_own_account"   ON client_accounts;
DROP POLICY IF EXISTS "client_update_own_account" ON client_accounts;

CREATE POLICY "client_read_own_account" ON client_accounts
  FOR SELECT USING (auth_user_id = auth.uid()::text);

CREATE POLICY "client_update_own_account" ON client_accounts
  FOR UPDATE USING (auth_user_id = auth.uid()::text);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. sites — clients see only sites attached to their own account
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "client_read_own_sites" ON sites;

CREATE POLICY "client_read_own_sites" ON sites
  FOR SELECT USING (
    client_account_id IN (
      SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()::text
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 4. tickets — clients see, create, and update only their own tickets
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "client_read_own_tickets"   ON tickets;
DROP POLICY IF EXISTS "client_create_own_tickets" ON tickets;
DROP POLICY IF EXISTS "client_update_own_tickets" ON tickets;

CREATE POLICY "client_read_own_tickets" ON tickets
  FOR SELECT USING (
    client_account_id IN (
      SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()::text
    )
  );

CREATE POLICY "client_create_own_tickets" ON tickets
  FOR INSERT WITH CHECK (
    client_account_id IN (
      SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()::text
    )
  );

CREATE POLICY "client_update_own_tickets" ON tickets
  FOR UPDATE USING (
    client_account_id IN (
      SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()::text
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 5. messages — clients read messages on their tickets, send only as CLIENT
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "client_read_own_messages" ON messages;
DROP POLICY IF EXISTS "client_send_own_messages" ON messages;

CREATE POLICY "client_read_own_messages" ON messages
  FOR SELECT USING (
    ticket_id IN (
      SELECT id FROM tickets WHERE client_account_id IN (
        SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()::text
      )
    )
  );

CREATE POLICY "client_send_own_messages" ON messages
  FOR INSERT WITH CHECK (
    sender_type = 'CLIENT'
    AND ticket_id IN (
      SELECT id FROM tickets WHERE client_account_id IN (
        SELECT id FROM client_accounts WHERE auth_user_id = auth.uid()::text
      )
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 6. invites — RLS is enabled but no client-facing policies.
--              All operations happen server-side via service_role (bypasses RLS).
--              Anon and authenticated roles see zero rows.
-- ────────────────────────────────────────────────────────────────────────────

-- (No client policies. RLS-enabled-without-policies = deny-all to non-service-role.)

-- ────────────────────────────────────────────────────────────────────────────
-- 7. ADMIN READ POLICIES
--    Service-role bypasses RLS, but the admin browser session uses the anon
--    key with an authenticated JWT (role:'admin' in app_metadata). For
--    Realtime postgres_changes subscriptions to deliver events to the admin
--    browser, the admin's JWT needs SELECT permission on the underlying tables.
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_reads_all_client_accounts" ON client_accounts;
DROP POLICY IF EXISTS "admin_reads_all_sites"           ON sites;
DROP POLICY IF EXISTS "admin_reads_all_tickets"         ON tickets;
DROP POLICY IF EXISTS "admin_reads_all_messages"        ON messages;
DROP POLICY IF EXISTS "admin_reads_all_invites"         ON invites;

CREATE POLICY "admin_reads_all_client_accounts" ON client_accounts
  FOR SELECT USING (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

CREATE POLICY "admin_reads_all_sites" ON sites
  FOR SELECT USING (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

CREATE POLICY "admin_reads_all_tickets" ON tickets
  FOR SELECT USING (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

CREATE POLICY "admin_reads_all_messages" ON messages
  FOR SELECT USING (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

CREATE POLICY "admin_reads_all_invites" ON invites
  FOR SELECT USING (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 8. REALTIME PUBLICATION
--    Supabase Realtime only emits postgres_changes events for tables added
--    to the supabase_realtime publication. Add the tables we subscribe to.
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE messages';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tickets'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE tickets';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'invites'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE invites';
  END IF;
END $$;
