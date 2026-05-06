import { redirect } from "next/navigation";
import { getCurrentAuthUser, isAdmin } from "@/lib/auth/client-session";
import { AdminShellClient } from "./admin-shell-client";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/portal");
  if (!isAdmin(user)) redirect("/portal/dashboard");

  return <AdminShellClient>{children}</AdminShellClient>;
}
