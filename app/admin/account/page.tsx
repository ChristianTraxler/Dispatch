import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { AccountForm } from "./account-form";
import type { WeeklyHours } from "@/lib/availability";
import { todayInTimezone, formatYmd } from "@/lib/vacation-helpers";

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
  const row = await prisma.adminSettings.findUnique({ where: { id: "global" } });

  const tz = row?.timezone ?? "America/New_York";
  const todayYmd = todayInTimezone(tz);
  const upcomingVacations = await prisma.vacation.findMany({
    where: { endDate: { gte: new Date(`${todayYmd}T00:00:00Z`) } },
    orderBy: { startDate: "asc" },
  });

  const initial = {
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
    <div className="max-w-3xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">§</span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Editorial Desk
        </span>
      </div>
      <h1
        className="font-display text-4xl md:text-5xl leading-none mb-3"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Account
      </h1>
      <p className="font-display italic text-ink-mute text-base md:text-lg mb-10 max-w-2xl">
        Tell the world when you&rsquo;re at the desk.
      </p>

      <AccountForm initial={initial} />
    </div>
  );
}
