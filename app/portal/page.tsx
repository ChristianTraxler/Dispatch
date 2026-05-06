import { redirect } from "next/navigation";
import { getCurrentAuthUser, isAdmin } from "@/lib/auth/client-session";
import { LoginForm } from "./login-form";

export default async function PortalEntry() {
  const user = await getCurrentAuthUser();

  // Already signed in: route them to the right place. Admins → /admin,
  // clients → /portal/dashboard. Phase 8 wires up /admin; until then the
  // admin redirect lands on a 404 — fine for now, will resolve naturally.
  if (user) {
    if (isAdmin(user)) redirect("/admin");
    redirect("/portal/dashboard");
  }

  return <LoginForm />;
}
