import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

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

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const overrides = await prisma.addOnClientPrice.findMany({
    where: { clientAccountId: id },
    include: { addOn: true },
    orderBy: { addOn: { sortOrder: "asc" } },
  });
  return NextResponse.json({ overrides });
}

interface PostBody {
  addOnId?: unknown;
  priceCents?: unknown;
  priceMaxCents?: unknown;
}

export async function POST(req: Request, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  let body: PostBody;
  try { body = (await req.json()) as PostBody; } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const addOnId = typeof body.addOnId === "string" ? body.addOnId : "";
  const priceCents = typeof body.priceCents === "number" ? body.priceCents : NaN;
  const priceMaxCents = body.priceMaxCents === null || body.priceMaxCents === undefined
    ? null
    : (typeof body.priceMaxCents === "number" ? body.priceMaxCents : NaN);
  if (!addOnId) return NextResponse.json({ error: "addOnId required." }, { status: 400 });
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return NextResponse.json({ error: "priceCents must be a non-negative integer." }, { status: 400 });
  }
  if (priceMaxCents !== null) {
    if (!Number.isInteger(priceMaxCents) || priceMaxCents < 0) {
      return NextResponse.json({ error: "priceMaxCents must be a non-negative integer or null." }, { status: 400 });
    }
    if (priceMaxCents <= priceCents) {
      return NextResponse.json({ error: "priceMaxCents must be greater than priceCents." }, { status: 400 });
    }
  }

  const override = await prisma.addOnClientPrice.upsert({
    where: { addOnId_clientAccountId: { addOnId, clientAccountId: id } },
    update: { priceCents, priceMaxCents },
    create: { addOnId, clientAccountId: id, priceCents, priceMaxCents },
    include: { addOn: true },
  });
  return NextResponse.json({ override }, { status: 201 });
}
