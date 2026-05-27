import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; clientAddOnId: string }> };

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
  action?: unknown;
  note?: unknown;
  priceCents?: unknown;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id: clientAccountId, clientAddOnId } = await params;

  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (body.action !== undefined) {
    if (body.action === "pause") {
      data.status = "PAUSED";
    } else if (body.action === "resume") {
      data.status = "ACTIVE";
      data.endedAt = null;
    } else if (body.action === "end") {
      data.status = "ENDED";
      data.endedAt = new Date();
    } else {
      return NextResponse.json({ error: "action must be pause | resume | end." }, { status: 400 });
    }
  }

  if (body.note !== undefined) {
    if (body.note !== null && typeof body.note !== "string") {
      return NextResponse.json({ error: "note must be a string or null." }, { status: 400 });
    }
    data.note = typeof body.note === "string" ? (body.note.trim() || null) : null;
  }

  if (body.priceCents !== undefined) {
    if (!Number.isInteger(body.priceCents) || (body.priceCents as number) < 0) {
      return NextResponse.json({ error: "priceCents must be a non-negative integer." }, { status: 400 });
    }
    data.priceCents = body.priceCents;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const existing = await prisma.clientAddOn.findUnique({ where: { id: clientAddOnId } });
  if (!existing || existing.clientAccountId !== clientAccountId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const row = await prisma.clientAddOn.update({
    where: { id: clientAddOnId },
    data,
  });
  return NextResponse.json({ row });
}
