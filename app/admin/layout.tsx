import { redirect } from "next/navigation";
import { Archivo, Martian_Mono } from "next/font/google";
import { getCurrentAuthUser, isAdmin } from "@/lib/auth/client-session";
import { getAdminAvatarUrl } from "@/lib/storage";
import { AdminShellClient } from "./admin-shell-client";
import { AdminQuickChatLauncher } from "./admin-quick-chat-launcher";
import "./docket.css";

// Docket faces, admin only. Both use their width axis (font-stretch).
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--dk-font-archivo",
});

const martianMono = Martian_Mono({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--dk-font-martian",
});

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/portal");
  if (!isAdmin(user)) redirect("/portal/dashboard");

  const adminAvatarUrl = await getAdminAvatarUrl();

  return (
    <div className={`admin-root ${archivo.variable} ${martianMono.variable}`}>
      <AdminShellClient>
        {children}
        <AdminQuickChatLauncher adminAvatarUrl={adminAvatarUrl} />
      </AdminShellClient>
    </div>
  );
}
