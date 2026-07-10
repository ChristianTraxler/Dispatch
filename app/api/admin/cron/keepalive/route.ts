import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Keeps the Supabase project active by touching Postgres on a schedule, so a
// free-tier project isn't paused after 7 days of inactivity. Runs daily via the
// cron entry in vercel.json. This does nothing but issue a trivial query — no
// business logic that could short-circuit before the database is hit.
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const customHeader = req.headers.get("x-cron-secret");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set." }, { status: 500 });
  }
  const ok = authHeader === `Bearer ${secret}` || customHeader === secret;
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await prisma.$queryRaw`SELECT 1`;

  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}

export const GET = POST;
