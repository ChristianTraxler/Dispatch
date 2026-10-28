import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { AccountForm } from "./account-form";
import type { WeeklyHours } from "@/lib/availability";
import { todayInTimezone, formatYmd } from "@/lib/vacation-helpers";
import { PageHead } from "../docket-ui";
import { SectionIndex } from "./section-index";
import { hydrateAvatarUrl } from "@/lib/storage";
import { reconcileVacationFlip, broadcastSettingsChanged } from "@/lib/vacation-reconcile";

export const dynamic = "force-dynamic";

const DEFAULT_HOURS: WeeklyHours = {
  "0": { enabled: false },
  "1": { enabled: true, open: "09:00", close: "17:00" },
  "2": { enabled: true, open: "09:00", close: "17:00" },
  "3": { enabled: true, open: "09:00", close: "17:00" },
  "4": { enabled: true, open: "09:00", close: "17:00" },
  "5": { enabled: true, open: "09:00", close: "17:00" },
  "6": { enabled: false },
};

export default async function AccountPage() {
  await requireAdmin();
  // Reconcile before reading so the Out-of-Town toggle reflects truth even
  // if the daily cron missed a tick (e.g., right after midnight on a
  // vacation start day, before 05:05 UTC).
  const recon = await reconcileVacationFlip();
  if (recon.flipped) {
    await broadcastSettingsChanged();
  }
  const row = await prisma.adminSettings.findUnique({ where: { id: "global" } });

  const tz = row?.timezone ?? "America/New_York";
  const todayYmd = todayInTimezone(tz);
  const upcomingVacations = await prisma.vacation.findMany({
    where: { endDate: { gte: new Date(`${todayYmd}T00:00:00Z`) } },
    orderBy: { startDate: "asc" },
  });

  const avatarUrl = await hydrateAvatarUrl(row?.avatarPath);

  const initial = {
    avatarUrl,
    timezone: tz,
    hours: ((row?.hours as WeeklyHours | undefined) ?? DEFAULT_HOURS),
    oooEnabled: row?.oooEnabled ?? false,
    oooFromIso: row?.oooFrom?.toISOString() ?? "",
    oooUntilIso: row?.oooUntil?.toISOString() ?? "",
    oooMessage: row?.oooMessage ?? "",
    holidays: row?.holidays ?? [],
    emergencyFeeCents: row?.emergencyFeeCents ?? 5000,
    outOfTown: row?.outOfTown ?? false,
    vacations: upcomingVacations.map((v) => ({
      id: v.id,
      label: v.label,
      startDate: formatYmd(v.startDate.getUTCFullYear(), v.startDate.getUTCMonth() + 1, v.startDate.getUTCDate()),
      endDate: formatYmd(v.endDate.getUTCFullYear(), v.endDate.getUTCMonth() + 1, v.endDate.getUTCDate()),
    })),
  };

  return (
    <div className="dk-narrow">
      <PageHead
        eyebrow="Editorial Desk"
        title="Account"
        sub={<>Tell the world when you&rsquo;re at the desk.</>}
      />

      <div className="dk-acct">
        <SectionIndex />
        <div className="min-w-0">
          <AccountForm initial={initial} />
        </div>
      </div>
    </div>
  );
}
