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

export async function GET() {
  const denied = await guard();
  if (denied) return denied;

  const addOns = await prisma.addOn.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ addOns });
}

interface PostBody {
  name?: unknown;
  description?: unknown;
  kind?: unknown;
  scope?: unknown;
  priceCents?: unknown;
  priceUnit?: unknown;
  sortOrder?: unknown;
}

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;

  let body: PostBody;
  try { body = (await req.json()) as PostBody; } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const kind = body.kind as AddOnKind;
  const scope = body.scope as AddOnScope;
  const priceUnit = body.priceUnit as AddOnPriceUnit;
  const priceCents = typeof body.priceCents === "number" ? body.priceCents : NaN;
  const sortOrder = typeof body.sortOrder === "number" ? body.sortOrder : 0;

  if (!name || name.length > 120) {
    return NextResponse.json({ error: "name must be 1-120 chars." }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: "description is required." }, { status: 400 });
  }
  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: "kind must be RECURRING or ONE_TIME." }, { status: 400 });
  }
  if (!SCOPES.has(scope)) {
    return NextResponse.json({ error: "scope must be PER_SITE or PER_CLIENT." }, { status: 400 });
  }
  if (!UNITS.has(priceUnit)) {
    return NextResponse.json({ error: "priceUnit must be ONE_TIME, PER_MONTH, or PER_YEAR." }, { status: 400 });
  }
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return NextResponse.json({ error: "priceCents must be a non-negative integer." }, { status: 400 });
  }
  if (kind === "RECURRING" && priceUnit === "ONE_TIME") {
    return NextResponse.json({ error: "RECURRING add-ons must use PER_MONTH or PER_YEAR." }, { status: 400 });
  }
  if (kind === "ONE_TIME" && priceUnit !== "ONE_TIME") {
    return NextResponse.json({ error: "ONE_TIME add-ons must use ONE_TIME unit." }, { status: 400 });
  }

  const addOn = await prisma.addOn.create({
    data: { name, description, kind, scope, priceCents, priceUnit, sortOrder },
  });
  return NextResponse.json({ addOn }, { status: 201 });
}
