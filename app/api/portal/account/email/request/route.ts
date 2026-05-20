import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateToken,
  expiryFromNow,
  isEmailPendingElsewhere,
  checkAndRecordRequestRate,
} from "@/lib/email-change";
import {
  sendEmailChangeVerifyEmail,
  sendEmailChangeRequestedEmail,
} from "@/lib/email";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let payload: { newEmail?: string; currentPassword?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const newEmail = payload.newEmail?.trim().toLowerCase();
  const currentPassword = payload.currentPassword;

  if (!newEmail || !EMAIL_SHAPE.test(newEmail)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (!currentPassword) {
    return NextResponse.json({ error: "Current password is required." }, { status: 400 });
  }
  if (newEmail === account.email.toLowerCase()) {
    return NextResponse.json(
      { error: "That's already your current email." },
      { status: 400 },
    );
  }

  if (!checkAndRecordRequestRate(account.id)) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  // Re-auth via Supabase signInWithPassword. Mirrors the pattern in the
  // password-change route. Side effect: session is refreshed, which is fine.
  const supabase = await createSupabaseServerClient();
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: account.email,
    password: currentPassword,
  });
  if (verifyErr) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 401 },
    );
  }

  // Uniqueness checks.
  const existingAccount = await prisma.clientAccount.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });
  if (existingAccount) {
    return NextResponse.json(
      { error: "We can't use that email." },
      { status: 409 },
    );
  }
  if (await isEmailPendingElsewhere(newEmail, account.id)) {
    return NextResponse.json(
      { error: "We can't use that email." },
      { status: 409 },
    );
  }

  // Supersede any prior pending row, insert the new one.
  const { raw: rawToken, hash: tokenHash } = generateToken();
  const expiresAt = expiryFromNow();

  await prisma.$transaction([
    prisma.emailChangeRequest.deleteMany({
      where: { clientAccountId: account.id, consumedAt: null },
    }),
    prisma.emailChangeRequest.create({
      data: {
        clientAccountId: account.id,
        newEmail,
        tokenHash,
        expiresAt,
      },
    }),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const verifyUrl = `${appUrl}/portal/account/verify-email?token=${encodeURIComponent(rawToken)}`;

  // Fire both emails. Failures are logged but don't fail the request — the
  // user already saw "we sent a link" and can re-request if it never arrives.
  try {
    await sendEmailChangeVerifyEmail(newEmail, {
      newEmail,
      oldEmail: account.email,
      verifyUrl,
      expiresAt,
    });
  } catch (err) {
    console.error("[email-change] verify email send failed:", err);
  }

  try {
    await sendEmailChangeRequestedEmail(account.email, {
      oldEmail: account.email,
      newEmail,
    });
  } catch (err) {
    console.error("[email-change] requested email send failed:", err);
  }

  return NextResponse.json({ ok: true, newEmail, expiresAt: expiresAt.toISOString() });
}
