import { redirect } from "next/navigation";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { AccountClient } from "./account-client";

export default async function AccountPage() {
  const account = await getCurrentClientAccount();
  if (!account) redirect("/portal");

  return <AccountClient name={account.name} email={account.email} />;
}
