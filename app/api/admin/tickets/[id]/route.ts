import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import { sendAwaitingConfirmationEmail } from "@/lib/email";
import { ticketNumber } from "@/lib/ticket";
import { isTicketCategory } from "@/lib/ticket-categories";
import { updateNotionTicketStatus } from "@/lib/notion";

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
      clientAccount: { select: { email: true, name: true } },
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
