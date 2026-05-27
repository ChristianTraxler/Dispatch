import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import type { AddOnPriceType } from "@prisma/client";

const PRICE_TYPES = new Set<AddOnPriceType>(["FIXED", "RANGE", "PERCENTAGE"]);

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
  priceType?: unknown;
  priceCents?: unknown;
  priceMaxCents?: unknown;
  pricePercentBp?: unknown;
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
  const priceType = (body.priceType ?? "FIXED") as AddOnPriceType;
  const priceCents = typeof body.priceCents === "number" ? body.priceCents : NaN;
  const priceMaxCents = body.priceMaxCents === null || body.priceMaxCents === undefined
    ? null
    : (typeof body.priceMaxCents === "number" ? body.priceMaxCents : NaN);
  const pricePercentBp = body.pricePercentBp === null || body.pricePercentBp === undefined
    ? null
    : (typeof body.pricePercentBp === "number" ? body.pricePercentBp : NaN);

  if (!addOnId) return NextResponse.json({ error: "addOnId required." }, { status: 400 });
  if (!PRICE_TYPES.has(priceType)) {
    return NextResponse.json({ error: "priceType must be FIXED, RANGE, or PERCENTAGE." }, { status: 400 });
  }

  if (priceType === "PERCENTAGE") {
    if (!Number.isInteger(pricePercentBp)) {
      return NextResponse.json({ error: "pricePercentBp required for PERCENTAGE overrides." }, { status: 400 });
    }
  } else {
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      return NextResponse.json({ error: "priceCents must be a non-negative integer." }, { status: 400 });
    }
    if (priceType === "RANGE") {
      if (priceMaxCents === null || !Number.isInteger(priceMaxCents) || priceMaxCents < 0) {
        return NextResponse.json({ error: "priceMaxCents required for RANGE overrides." }, { status: 400 });
      }
      if (priceMaxCents <= priceCents) {
        return NextResponse.json({ error: "priceMaxCents must be greater than priceCents." }, { status: 400 });
      }
    }
  }

  const finalPriceCents = priceType === "PERCENTAGE" ? 0 : priceCents;
  const finalPriceMaxCents = priceType === "RANGE" ? priceMaxCents : null;
  const finalPercentBp = priceType === "PERCENTAGE" ? pricePercentBp : null;

  const override = await prisma.addOnClientPrice.upsert({
    where: { addOnId_clientAccountId: { addOnId, clientAccountId: id } },
    update: {
      priceType,
      priceCents: finalPriceCents,
      priceMaxCents: finalPriceMaxCents,
      pricePercentBp: finalPercentBp,
    },
    create: {
      addOnId,
      clientAccountId: id,
      priceType,
      priceCents: finalPriceCents,
      priceMaxCents: finalPriceMaxCents,
      pricePercentBp: finalPercentBp,
    },
    include: { addOn: true },
  });
  return NextResponse.json({ override }, { status: 201 });
}
