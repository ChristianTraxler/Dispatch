import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminRequiredError, AuthRequiredError } from "@/lib/auth/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isEmailPendingElsewhere } from "@/lib/email-change";
import { sendEmailChangeByAdminEmail } from "@/lib/email";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof AdminRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const { id } = await params;

  let payload: { newEmail?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const newEmail = payload.newEmail?.trim().toLowerCase();
  if (!newEmail || !EMAIL_SHAPE.test(newEmail)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const account = await prisma.clientAccount.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  if (newEmail === account.email.toLowerCase()) {
    return NextResponse.json(
      { error: "That's already this client's current email." },
      { status: 400 },
    );
  }

  // Uniqueness — same checks as the self-serve path.
  const collide = await prisma.clientAccount.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });
  if (collide && collide.id !== id) {
    return NextResponse.json(
      { error: "Another account already uses that email." },
      { status: 409 },
    );
  }
  if (await isEmailPendingElsewhere(newEmail, id)) {
    return NextResponse.json(
      { error: "Another account has a pending change to that email." },
      { status: 409 },
    );
  }

  const oldEmail = account.email;
  const supa = supabaseAdmin();

  const { error: updateErr } = await supa.auth.admin.updateUserById(
    account.authUserId,
    { email: newEmail, email_confirm: true },
  );
  if (updateErr) {
    console.error("[admin email-change] supabase updateUserById failed:", updateErr);
    return NextResponse.json(
      { error: "Could not update auth provider. Try again." },
      { status: 500 },
    );
  }

  try {
    await prisma.$transaction([
      prisma.clientAccount.update({
        where: { id: account.id },
        data: { email: newEmail },
      }),
      // Clear any pending self-serve request — the admin override supersedes.
      prisma.emailChangeRequest.deleteMany({
        where: { clientAccountId: account.id, consumedAt: null },
      }),
    ]);
  } catch (err) {
    console.error(
      `[admin email-change] PRISMA STALE — supabase changed to ${newEmail} but client_accounts.email still ${oldEmail} for account ${account.id}:`,
      err,
    );
    return NextResponse.json(
      { error: "Partial update — contact the developer." },
      { status: 500 },
    );
  }

  try {
    await supa.auth.admin.signOut(account.authUserId);
  } catch (err) {
    console.error("[admin email-change] signOut failed:", err);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  try {
    await sendEmailChangeByAdminEmail(newEmail, {
      newEmail,
      loginUrl: `${appUrl}/portal/login`,
    });
  } catch (err) {
    console.error("[admin email-change] notify email send failed:", err);
  }

  // Audit log to server output.
  console.info(
    `[admin email-change] account=${account.id} ${oldEmail} → ${newEmail}`,
  );

  return NextResponse.json({ ok: true, newEmail });
}
