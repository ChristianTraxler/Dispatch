import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; addOnId: string }> };

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

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await guard();
  if (denied) return denied;
  const { id, addOnId } = await params;
  await prisma.addOnClientPrice.deleteMany({
    where: { clientAccountId: id, addOnId },
  });
  return NextResponse.json({ ok: true });
}
