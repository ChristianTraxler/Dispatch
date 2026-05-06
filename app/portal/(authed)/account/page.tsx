import { redirect } from "next/navigation";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { hydrateAvatarUrl } from "@/lib/storage";
import { AccountClient } from "./account-client";

export default async function AccountPage() {
  const account = await getCurrentClientAccount();
  if (!account) redirect("/portal");

  const avatarUrl = await hydrateAvatarUrl(account.avatarPath);

  return (
    <AccountClient
      name={account.name}
      email={account.email}
      avatarUrl={avatarUrl}
    />
  );
}
