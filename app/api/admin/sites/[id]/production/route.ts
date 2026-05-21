import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AdminRequiredError,
  AuthRequiredError,
} from "@/lib/auth/admin-guard";

async function guard() {
  try {
    await requireAdmin();
    return null;
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof AdminRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id }, select: { id: true } });
  if (!site) {
    return NextResponse.json({ error: "Site not found." }, { status: 404 });
  }

  const updated = await prisma.site.update({
    where: { id },
    data: { productionStartedAt: new Date() },
    select: { id: true, productionStartedAt: true },
  });

  return NextResponse.json({
    ok: true,
    productionStartedAt: updated.productionStartedAt?.toISOString() ?? null,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;

  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id }, select: { id: true } });
  if (!site) {
    return NextResponse.json({ error: "Site not found." }, { status: 404 });
  }

  await prisma.site.update({
    where: { id },
    data: { productionStartedAt: null },
  });

  return NextResponse.json({ ok: true, productionStartedAt: null });
}
