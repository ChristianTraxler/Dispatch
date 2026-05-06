import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthRequiredError, AdminRequiredError } from "@/lib/auth/admin-guard";
import { sendInviteEmail } from "@/lib/email";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function inviteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/invite/${token}`;
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const invites = await prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ invites });
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  let payload: {
    recipientName?: string;
    email?: string;
    siteUrl?: string;
    siteDisplayName?: string;
    note?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = payload.email?.trim().toLowerCase();
  const siteUrl = payload.siteUrl?.trim();
  const siteDisplayName = payload.siteDisplayName?.trim();
  const recipientName = payload.recipientName?.trim() || null;
  const note = payload.note?.trim() || null;

  if (!email || !siteUrl || !siteDisplayName) {
    return NextResponse.json(
      { error: "Email, site URL, and site display name are required." },
      { status: 400 },
    );
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

  const invite = await prisma.invite.create({
    data: {
      token,
      email,
      recipientName,
      siteUrl,
      siteDisplayName,
      note,
      expiresAt,
    },
  });

  // Send email — don't fail the whole request if Resend hiccups; the admin
  // can always copy the link from the invite list and send it manually.
  try {
    await sendInviteEmail({
      recipientName: recipientName ?? undefined,
      email: invite.email,
      siteUrl: invite.siteUrl,
      siteDisplayName: invite.siteDisplayName,
      inviteUrl: inviteUrl(invite.token),
      expiresAt: invite.expiresAt,
      note: note ?? undefined,
    });
  } catch (err) {
    console.error("[invite] email send failed:", err);
  }

  return NextResponse.json({ invite }, { status: 201 });
}
