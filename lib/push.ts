import webpush from "web-push";
// Relative, not "@/lib/prisma": scripts/test-push.ts loads this module outside
// Next, where the @/* path alias is not resolved. See the note above.
import { prisma } from "./prisma";

export interface PushPayload {
  title: string;
  body: string;
  /** Path the notification opens on tap, e.g. "/portal/ticket/abc123". */
  url: string;
  /** Collapses repeat notifications for the same subject instead of stacking. */
  tag?: string;
}

// Lazy VAPID configuration, mirroring the Resend client in lib/email.ts —
// module evaluation must not blow up when env vars aren't present yet
// (e.g. a Vercel build running before env vars land).
let configured = false;
function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function deliver(subs: SubRow[], payload: PushPayload): Promise<void> {
  if (subs.length === 0) return;
  if (!configure()) {
    console.error("[push] VAPID env vars missing; skipping send.");
    return;
  }

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        // web-push sets no default socket timeout, so a degraded push
        // service can otherwise hang the request indefinitely — and because
        // every send here runs inside one Promise.all, a single hung
        // endpoint would block delivery to every other device. Cap it.
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          // urgency "high" maps to APNs priority 10. At the default
          // ("normal") Apple is free to deliver quietly — the notification
          // lands on the lock screen with no sound and no Apple Watch
          // haptic, which is exactly what happened in testing.
          { timeout: 5000, urgency: "high" },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 mean the push service has permanently retired this
        // endpoint — app uninstalled, site data cleared, or (commonly on
        // iOS) the subscription expired. Drop the row so the table doesn't
        // fill with dead endpoints.
        if (status === 404 || status === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
          return;
        }
        console.error("[push] send failed:", status, err);
        return;
      }

      // Bookkeeping only, and deliberately outside the send's catch: a
      // failure here must never be logged as a delivery failure.
      try {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (err) {
        console.error("[push] lastUsedAt update failed:", err);
      }
    }),
  );
}

/** Push to every device belonging to one auth user. Never throws. */
export async function sendPushToUser(
  authUserId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const subs = await prisma.pushSubscription.findMany({
      where: { authUserId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    await deliver(subs, payload);
  } catch (err) {
    console.error("[push] sendPushToUser failed:", err);
  }
}

/** Push to every admin device. Never throws. */
export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  try {
    const subs = await prisma.pushSubscription.findMany({
      where: { isAdmin: true },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    await deliver(subs, payload);
  } catch (err) {
    console.error("[push] sendPushToAdmins failed:", err);
  }
}
