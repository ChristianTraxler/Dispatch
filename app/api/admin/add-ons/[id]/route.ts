import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import type { AddOnKind, AddOnScope, AddOnPriceUnit } from "@prisma/client";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const KINDS = new Set<AddOnKind>(["RECURRING", "ONE_TIME"]);
const SCOPES = new Set<AddOnScope>(["PER_SITE", "PER_CLIENT"]);
const UNITS = new Set<AddOnPriceUnit>(["ONE_TIME", "PER_MONTH", "PER_YEAR"]);

async function guard() {
  try {
    await requireAdmin();
    return null;
  } catch (err) {
    if (err instanceof AuthRequiredError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AdminRequiredError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
}

interface PatchBody {
  name?: unknown;
  description?: unknown;
  kind?: unknown;
  scope?: unknown;
  priceCents?: unknown;
  priceUnit?: unknown;
  isActive?: unknown;
  sortOrder?: unknown;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const existing = await prisma.addOn.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 120) {
      return NextResponse.json({ error: "name must be 1-120 chars." }, { status: 400 });
    }
    data.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || !body.description.trim()) {
      return NextResponse.json({ error: "description must be non-empty." }, { status: 400 });
    }
    data.description = body.description.trim();
  }
  if (body.kind !== undefined) {
    if (!KINDS.has(body.kind as AddOnKind)) {
      return NextResponse.json({ error: "kind must be RECURRING or ONE_TIME." }, { status: 400 });
    }
    data.kind = body.kind;
  }
  if (body.scope !== undefined) {
    if (!SCOPES.has(body.scope as AddOnScope)) {
      return NextResponse.json({ error: "scope must be PER_SITE or PER_CLIENT." }, { status: 400 });
    }
    data.scope = body.scope;
  }
  if (body.priceCents !== undefined) {
    if (!Number.isInteger(body.priceCents) || (body.priceCents as number) < 0) {
      return NextResponse.json({ error: "priceCents must be a non-negative integer." }, { status: 400 });
    }
    data.priceCents = body.priceCents;
  }
  if (body.priceUnit !== undefined) {
    if (!UNITS.has(body.priceUnit as AddOnPriceUnit)) {
      return NextResponse.json({ error: "priceUnit invalid." }, { status: 400 });
    }
    data.priceUnit = body.priceUnit;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive must be boolean." }, { status: 400 });
    }
    data.isActive = body.isActive;
  }
  if (body.sortOrder !== undefined) {
    if (!Number.isInteger(body.sortOrder)) {
      return NextResponse.json({ error: "sortOrder must be an integer." }, { status: 400 });
    }
    data.sortOrder = body.sortOrder;
  }

  // Cross-field check after merging with existing values
  const finalKind = (data.kind as AddOnKind | undefined) ?? existing.kind;
  const finalUnit = (data.priceUnit as AddOnPriceUnit | undefined) ?? existing.priceUnit;
  if (finalKind === "RECURRING" && finalUnit === "ONE_TIME") {
    return NextResponse.json({ error: "RECURRING add-ons must use PER_MONTH or PER_YEAR." }, { status: 400 });
  }
  if (finalKind === "ONE_TIME" && finalUnit !== "ONE_TIME") {
    return NextResponse.json({ error: "ONE_TIME add-ons must use ONE_TIME unit." }, { status: 400 });
  }

  const addOn = await prisma.addOn.update({ where: { id }, data });
  return NextResponse.json({ addOn });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  const [overrideCount, clientCount, ticketCount] = await Promise.all([
    prisma.addOnClientPrice.count({ where: { addOnId: id } }),
    prisma.clientAddOn.count({ where: { addOnId: id } }),
    prisma.ticket.count({ where: { addOnId: id } }),
  ]);
  if (overrideCount + clientCount + ticketCount > 0) {
    return NextResponse.json(
      { error: "Add-on is referenced; retire it instead.", referenced: true },
      { status: 409 },
    );
  }
  await prisma.addOn.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
