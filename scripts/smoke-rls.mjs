// RLS smoke test — see docs/rls-tests.md
// Run with: node --env-file=.env.local --env-file=.env scripts/smoke-rls.mjs

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

console.log("1. Insert a fake ClientAccount + Site + Ticket via Prisma (bypasses RLS)");
const fake = await prisma.clientAccount.create({
  data: {
    authUserId: "00000000-0000-0000-0000-000000000001",
    email: "rls-test@example.com",
    name: "RLS Test Client",
    sites: {
      create: {
        url: "https://rls-test.example",
        displayName: "RLS Test Site",
      },
    },
  },
  include: { sites: true },
});
const ticket = await prisma.ticket.create({
  data: {
    clientAccountId: fake.id,
    siteId: fake.sites[0].id,
    title: "RLS smoke test ticket",
    description: "This row exists. Anon should not see it.",
    category: "BUG",
  },
});
console.log("   Inserted ticket:", ticket.id);

console.log("\n2. Query via Prisma (postgres role — bypasses RLS):");
console.log("   Tickets visible:", await prisma.ticket.count(), "(expect ≥1)");

console.log("\n3. Query via Supabase anon client (RLS active, no auth.uid()):");
for (const table of ["client_accounts", "sites", "tickets", "invites", "messages"]) {
  const { data, error } = await anon.from(table).select("*");
  const count = error ? `ERR ${error.code}` : (data?.length ?? "?");
  console.log(`   ${table.padEnd(16)} visible:`, count, "(expect 0)");
}

console.log("\n4. Try INSERT via anon (should fail):");
const { error: insertErr } = await anon.from("tickets").insert({
  client_account_id: fake.id,
  site_id: fake.sites[0].id,
  title: "anon-injected",
  description: "shouldn't land",
  category: "BUG",
});
console.log("   Insert error:", insertErr?.code, "—", insertErr?.message ?? "(no error — BAD)");

console.log("\n5. Cleanup: delete fake rows");
await prisma.message.deleteMany({ where: { ticketId: ticket.id } });
await prisma.ticket.delete({ where: { id: ticket.id } });
await prisma.site.delete({ where: { id: fake.sites[0].id } });
await prisma.clientAccount.delete({ where: { id: fake.id } });
console.log("   Tickets after cleanup:", await prisma.ticket.count(), "(expect 0)");

await prisma.$disconnect();
console.log("\n✓ Smoke test complete");
