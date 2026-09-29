import { redirect } from "next/navigation";
import { getCurrentAuthUser, isAdmin } from "@/lib/auth/client-session";
import { safeReturnPath } from "@/lib/safe-return-path";

export default async function PortalEntry({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await getCurrentAuthUser();

  // Already signed in: admins go to /admin, clients to their dashboard.
  if (user) {
    if (isAdmin(user)) redirect("/admin");
    redirect("/portal/dashboard");
  }

  // Signing in happens in the panel on the public page. Carry along where they
  // were headed, if it is a path on this site, so the panel can send them there.
  const from = safeReturnPath((await searchParams).from);
  redirect(from ? `/?from=${encodeURIComponent(from)}#sign-in` : "/#sign-in");
}
