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

  // endpoint is the browser's identity for this subscription, so an upsert
  // makes re-subscribing on the same device idempotent. The owner is
  // rewritten on conflict so a shared device that changes hands doesn't keep
  // pushing the previous account's tickets to the new user.
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

  // Scoped to the caller so one account can never delete another's row.
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: payload.endpoint, authUserId: user.id },
  });

  return NextResponse.json({ ok: true });
}
