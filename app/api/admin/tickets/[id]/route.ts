import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import {
  notifyTicketReviewing,
  notifyTicketFixing,
  notifyTicketFixed,
  type NotifyTicket,
} from "@/lib/notify";
import { isTicketCategory } from "@/lib/ticket-categories";
import { updateNotionTicketStatus } from "@/lib/notion";

const TIMESTAMP_FOR_STATUS = {
  REVIEWING: "reviewingStartedAt",
  FIXING: "fixingStartedAt",
  AWAITING_CONFIRMATION: "fixedAt",
} as const satisfies Partial<Record<string, string>>;

// Mirrors TIMESTAMP_FOR_STATUS above. A status with no entry notifies nobody,
// which keeps this total without a fallback branch.
const STATUS_NOTIFIER = {
  REVIEWING: notifyTicketReviewing,
  FIXING: notifyTicketFixing,
  AWAITING_CONFIRMATION: notifyTicketFixed,
} as const satisfies Partial<
  Record<string, (t: NotifyTicket, appUrl: string) => Promise<void>>
>;

const ALLOWED_TRANSITIONS = new Set([
  "REVIEWING",
  "FIXING",
  "AWAITING_CONFIRMATION",
]);

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const { id } = await context.params;
  let payload: { status?: string; category?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { status, category } = payload;

  // PATCH accepts a status change, a category change, or both. At least one
  // must be present and any provided value must be valid.
  if (status === undefined && category === undefined) {
    return NextResponse.json(
      { error: "Provide a status or category to update." },
      { status: 400 },
    );
  }
  if (status !== undefined && !ALLOWED_TRANSITIONS.has(status)) {
    return NextResponse.json(
      { error: `Status must be one of ${[...ALLOWED_TRANSITIONS].join(", ")}.` },
      { status: 400 },
    );
  }
  if (category !== undefined && !isTicketCategory(category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      site: { select: { url: true, displayName: true } },
      clientAccount: {
        select: { authUserId: true, email: true, name: true, emailNotifications: true },
      },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};

  if (category !== undefined) {
    updateData.category = category;
  }

  if (status !== undefined) {
    updateData.status = status;
    const tsField =
      TIMESTAMP_FOR_STATUS[status as keyof typeof TIMESTAMP_FOR_STATUS];
    // Only set the stage timestamp if it hasn't already been set — we never
    // overwrite the original moment a stage first happened.
    if (tsField && !ticket[tsField as keyof typeof ticket]) {
      updateData[tsField] = new Date();
    }
  }

  const updated = await prisma.ticket.update({
    where: { id },
    data: updateData,
  });

  if (status !== undefined) {
    after(() =>
      updateNotionTicketStatus({
        ticketId: id,
        status: status as import("@prisma/client").TicketStatus,
      }),
    );
  }

  if (status !== undefined) {
    const notifier = STATUS_NOTIFIER[status as keyof typeof STATUS_NOTIFIER];
    if (notifier) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
      // `updated` carries the post-write scalars — including a category that
      // may have changed in this same PATCH — while `ticket` carries the
      // relations that prisma.ticket.update does not return. Merge so the
      // copy always reflects what the ticket now IS.
      const fresh = { ...ticket, ...updated };
      // Wrapped in after(): the notifier sends email and/or push, and
      // web-push has no default socket timeout, so a slow push service must
      // never delay this response — the admin's UI update always returns
      // immediately regardless of notification delivery.
      after(() => notifier(fresh, appUrl));
    }
  }

  return NextResponse.json({ ticket: updated });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const { id } = await context.params;
  try {
    await prisma.ticket.delete({ where: { id } });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}
