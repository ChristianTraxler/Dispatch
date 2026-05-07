import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import { sendAwaitingConfirmationEmail } from "@/lib/email";
import { ticketNumber } from "@/lib/ticket";

const TIMESTAMP_FOR_STATUS = {
  REVIEWING: "reviewingStartedAt",
  FIXING: "fixingStartedAt",
  AWAITING_CONFIRMATION: "fixedAt",
} as const satisfies Partial<Record<string, string>>;

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
  let payload: { status?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const status = payload.status;
  if (!status || !ALLOWED_TRANSITIONS.has(status)) {
    return NextResponse.json(
      { error: `Status must be one of ${[...ALLOWED_TRANSITIONS].join(", ")}.` },
      { status: 400 },
    );
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      site: { select: { url: true, displayName: true } },
      clientAccount: { select: { email: true, name: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const tsField =
    TIMESTAMP_FOR_STATUS[status as keyof typeof TIMESTAMP_FOR_STATUS];

  const updateData: Record<string, unknown> = { status };
  // Only set the stage timestamp if it hasn't already been set — we never
  // overwrite the original moment a stage first happened.
  if (tsField && !ticket[tsField as keyof typeof ticket]) {
    updateData[tsField] = new Date();
  }

  const updated = await prisma.ticket.update({
    where: { id },
    data: updateData,
  });

  if (status === "AWAITING_CONFIRMATION") {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    try {
      await sendAwaitingConfirmationEmail(ticket.clientAccount.email, {
        ticketNumber: ticketNumber(ticket.id, ticket.createdAt),
        ticketTitle: ticket.title,
        ticketUrl: `${appUrl}/portal/ticket/${ticket.id}`,
        siteDisplayName: ticket.site.displayName,
      });
    } catch (err) {
      console.error("[admin/tickets PATCH] awaiting-confirmation email failed:", err);
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
