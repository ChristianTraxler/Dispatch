import { redirect } from "next/navigation";
import { getCurrentAuthUser, getCurrentClientAccount, isAdmin } from "@/lib/auth/client-session";
import { getAdminAvatarUrl, hydrateAvatarUrl } from "@/lib/storage";
import { PortalShellClient } from "../portal-shell-client";
import { QuickChatLauncher } from "./quick-chat-launcher";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/portal");
  if (isAdmin(user)) redirect("/admin");

  const account = await getCurrentClientAccount();
  if (!account) {
    // Auth user with no ClientAccount row — e.g., directly created in Supabase
    // dashboard without going through the invite flow. Sign them out and route
    // them back to the login page.
    redirect("/api/portal/auth/logout");
  }

  const [avatarUrl, adminAvatarUrl] = await Promise.all([
    hydrateAvatarUrl(account.avatarPath),
    getAdminAvatarUrl(),
  ]);

  return (
    <PortalShellClient
      user={{ id: account.id, name: account.name, email: account.email, avatarUrl }}
    >
      {children}
      <QuickChatLauncher adminAvatarUrl={adminAvatarUrl} clientAvatarUrl={avatarUrl} />
    </PortalShellClient>
  );
}
