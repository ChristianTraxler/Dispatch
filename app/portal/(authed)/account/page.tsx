import { redirect } from "next/navigation";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { hydrateAvatarUrl } from "@/lib/storage";
import { getPendingForAccount } from "@/lib/email-change";
import { AccountClient } from "./account-client";

export default async function AccountPage() {
  const account = await getCurrentClientAccount();
  if (!account) redirect("/portal");

  const [avatarUrl, pending] = await Promise.all([
    hydrateAvatarUrl(account.avatarPath),
    getPendingForAccount(account.id),
  ]);

  return (
    <AccountClient
      name={account.name}
      email={account.email}
      avatarUrl={avatarUrl}
      initialPending={
        pending
          ? {
              newEmail: pending.newEmail,
              expiresAt: pending.expiresAt.toISOString(),
            }
          : null
      }
    />
  );
}
