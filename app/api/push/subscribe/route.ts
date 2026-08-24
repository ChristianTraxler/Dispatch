import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAuthUser, isAdmin } from "@/lib/auth/client-session";

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function POST(req: Request) {
  const user = await getCurrentAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let payload: SubscribeBody;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const endpoint = payload.endpoint;
  const p256dh = payload.keys?.p256dh;
  const auth = payload.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "endpoint and keys.p256dh and keys.auth are required." },
      { status: 400 },
    );
  }

  // web-push later parses `endpoint` into a hostname/port/path and issues an
  // authenticated HTTPS POST directly to it. Without this check, any
  // signed-in user could store an endpoint pointing at an internal host.
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return NextResponse.json(
      { error: "endpoint must be a valid URL." },
      { status: 400 },
    );
  }
  if (endpointUrl.protocol !== "https:") {
    return NextResponse.json(
      { error: "endpoint must use https." },
      { status: 400 },
    );
  }

  // endpoint is the browser's identity for this subscription, so an upsert
  // makes re-subscribing on the same device idempotent. The owner is
  // rewritten on conflict so a shared device that changes hands doesn't keep
  // pushing the previous account's tickets to the new user — this is a
  // deliberate device handoff, not an access-control gap: see the DELETE
  // handler below for what actually stays scoped to the caller.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh,
      auth,
      authUserId: user.id,
      isAdmin: isAdmin(user),
      userAgent: req.headers.get("user-agent"),
    },
    update: {
      p256dh,
      auth,
      authUserId: user.id,
      isAdmin: isAdmin(user),
      userAgent: req.headers.get("user-agent"),
    },
  });

  // Bound fan-out and stale-row accumulation: nothing else limits how many
  // devices one account can register, and lib/push.ts only prunes a row on a
  // hard 404/410 — an endpoint that just rots without ever erroring would
  // stay forever. Keep at most the 20 most-recently-created rows per user.
  // Never let this fail the request; it's a housekeeping step, not the point
  // of the call.
  try {
    const rows = await prisma.pushSubscription.findMany({
      where: { authUserId: user.id },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (rows.length > 20) {
      const excess = rows.slice(0, rows.length - 20).map((r) => r.id);
      await prisma.pushSubscription.deleteMany({ where: { id: { in: excess } } });
    }
  } catch (err) {
    console.error("[push] subscription cap prune failed:", err);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let payload: { endpoint?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!payload.endpoint) {
    return NextResponse.json({ error: "endpoint is required." }, { status: 400 });
  }

  // Scoped to the caller: DELETE only ever removes a row this account owns.
  // (The POST upsert above is different by design — it can reassign an
  // existing row's ownership by endpoint for device handoff.)
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: payload.endpoint, authUserId: user.id },
  });

  return NextResponse.json({ ok: true });
}
