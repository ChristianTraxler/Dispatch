"use client";

import { usePathname, useRouter } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";

function deriveActiveNav(
  pathname: string,
): "dashboard" | "clients" | "invites" {
  if (pathname.startsWith("/admin/clients")) return "clients";
  if (pathname.startsWith("/admin/invites")) return "invites";
  return "dashboard";
}

export function AdminShellClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const router = useRouter();

  async function onNavigate(
    target: "dashboard" | "clients" | "invites" | "logout",
  ) {
    if (target === "logout") {
      await fetch("/api/portal/auth/logout", { method: "POST" });
      router.push("/portal");
      router.refresh();
      return;
    }
    if (target === "dashboard") router.push("/admin");
    else router.push(`/admin/${target}`);
  }

  return (
    <AdminShell activeNav={deriveActiveNav(pathname)} onNavigate={onNavigate}>
      {children}
    </AdminShell>
  );
}
