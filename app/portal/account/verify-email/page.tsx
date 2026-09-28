import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { findValidRequest } from "@/lib/email-change";
import { sendEmailChangeCompletedEmail } from "@/lib/email";
import { VerifyEmailView, type VerifyOutcome } from "./verify-email-view";

type Outcome = VerifyOutcome;

async function verifyToken(rawToken: string | undefined): Promise<Outcome> {
  if (!rawToken) return { kind: "invalid" };

  const row = await findValidRequest(rawToken);
  if (!row) return { kind: "invalid" };

  const account = await prisma.clientAccount.findUnique({
    where: { id: row.clientAccountId },
  });
  if (!account) return { kind: "invalid" };

  const supa = supabaseAdmin();

  // Supabase first. If this fails, nothing in our DB has changed and the
  // user can re-click the link.
  const { error: updateErr } = await supa.auth.admin.updateUserById(
    account.authUserId,
    { email: row.newEmail, email_confirm: true },
  );
  if (updateErr) {
    console.error("[email-change] supabase updateUserById failed:", updateErr);
    return { kind: "error" };
  }

  // Prisma update + mark request consumed in one transaction.
  try {
    await prisma.$transaction([
      prisma.clientAccount.update({
        where: { id: account.id },
        data: { email: row.newEmail },
      }),
      prisma.emailChangeRequest.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      }),
    ]);
  } catch (err) {
    // Supabase succeeded, Prisma failed. The user's login now works under
    // the new email but client_accounts.email is stale. Log loudly; manual
    // reconcile from server logs.
    console.error(
      `[email-change] PRISMA STALE — supabase changed to ${row.newEmail} but client_accounts.email still ${account.email} for account ${account.id}:`,
      err,
    );
    return { kind: "error" };
  }

  // Sign out all sessions for this user. Failure is non-fatal, the user
  // will be signed out on next request anyway because their session JWT
  // still has the old email and Supabase will reject it.
  try {
    await supa.auth.admin.signOut(account.authUserId);
  } catch (err) {
    console.error("[email-change] signOut failed:", err);
  }

  // Notify the OLD address that the change completed.
  try {
    await sendEmailChangeCompletedEmail(account.email, {
      oldEmail: account.email,
      newEmail: row.newEmail,
      changedAt: new Date(),
    });
  } catch (err) {
    console.error("[email-change] completed email send failed:", err);
  }

  return { kind: "ok", newEmail: row.newEmail };
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const outcome = await verifyToken(params.token);

  return <VerifyEmailView outcome={outcome} />;
}
