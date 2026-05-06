import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  let payload: { token?: string; name?: string; password?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const token = payload.token;
  const password = payload.password;
  const name = payload.name?.trim();

  if (!token || !password || !name) {
    return NextResponse.json(
      { error: "Token, name, and password are required." },
      { status: 400 },
    );
  }
  if (password.length < 12) {
    return NextResponse.json(
      { error: "Password must be at least 12 characters." },
      { status: 400 },
    );
  }

  // Validate the invite — must be a real, unredeemed, unrevoked, unexpired one.
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }
  if (invite.redeemedAt) {
    return NextResponse.json({ error: "Invite already redeemed." }, { status: 409 });
  }
  if (invite.revokedAt) {
    return NextResponse.json({ error: "Invite revoked." }, { status: 410 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite expired." }, { status: 410 });
  }

  const emailNorm = invite.email.toLowerCase();

  // Refuse if a ClientAccount already exists for this email — they must use
  // the EXISTING_NEEDS_LOGIN path instead, not signup.
  const existing = await prisma.clientAccount.findUnique({
    where: { email: emailNorm },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Account already exists for this email. Sign in instead." },
      { status: 409 },
    );
  }

  // Create Supabase Auth user (auto-confirmed — invite token is the trust mechanism)
  const { data: created, error: createErr } = await supabaseAdmin().auth.admin.createUser({
    email: emailNorm,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return NextResponse.json(
      { error: createErr?.message ?? "Could not create account." },
      { status: 400 },
    );
  }

  // Create the app-side account + initial site, redeem the invite. Wrap in a
  // transaction so a partial failure rolls back rather than leaving orphans.
  try {
    await prisma.$transaction(async (tx) => {
      const account = await tx.clientAccount.create({
        data: {
          authUserId: created.user.id,
          email: emailNorm,
          name,
          sites: {
            create: {
              url: invite.siteUrl,
              displayName: invite.siteDisplayName,
            },
          },
        },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: {
          redeemedAt: new Date(),
          redeemedByAccountId: account.id,
        },
      });
    });
  } catch (err) {
    // Clean up the Supabase user so the email can be re-invited later.
    await supabaseAdmin().auth.admin.deleteUser(created.user.id).catch(() => {});
    console.error("[signup] transaction failed:", err);
    return NextResponse.json(
      { error: "Could not finish signup. Try again." },
      { status: 500 },
    );
  }

  // Sign the user in — sets the session cookie on the response.
  const supabase = await createSupabaseServerClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: emailNorm,
    password,
  });
  if (signInErr) {
    return NextResponse.json(
      { error: "Account created but auto-sign-in failed. Try signing in manually." },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true, redirect: "/portal/dashboard" });
}
