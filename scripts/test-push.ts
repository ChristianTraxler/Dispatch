/**
 * Fires a test push at every subscription belonging to one auth user.
 *
 *   npx tsx --env-file=.env scripts/test-push.ts <authUserId>
 *
 * Find an authUserId with:
 *   npx tsx --env-file=.env scripts/test-push.ts --list
 */
import { prisma } from "../lib/prisma";
import { sendPushToUser } from "../lib/push";

async function main() {
  const arg = process.argv[2];

  if (!arg || arg === "--list") {
    const rows = await prisma.pushSubscription.findMany({
      select: { authUserId: true, isAdmin: true, userAgent: true },
    });
    console.log(rows.length === 0 ? "No subscriptions stored." : rows);
    return;
  }

  await sendPushToUser(arg, {
    title: "Dispatch test",
    body: "If you can see this, push notifications are working.",
    url: "/portal",
    tag: "dispatch-test",
  });
  console.log("Sent. Check the device.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
