import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthRequiredError, AdminRequiredError } from "@/lib/auth/admin-guard";
import {
  deleteStorageObject,
  generateAvatarPath,
  hydrateAvatarUrl,
  uploadAvatarBytes,
  validateAvatarUpload,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(): Promise<NextResponse | null> {
  try {
    await requireAdmin();
    return null;
  } catch (err) {
    if (err instanceof AuthRequiredError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AdminRequiredError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
}

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  const invalid = validateAvatarUpload({ contentType: file.type, sizeBytes: file.size });
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const newPath = generateAvatarPath("admin", file.type);
  try {
    await uploadAvatarBytes(newPath, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (err) {
    console.error("[admin avatar] upload failed:", err);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }

  const current = await prisma.adminSettings.findUnique({
    where: { id: "global" },
    select: { avatarPath: true },
  });
  await prisma.adminSettings.upsert({
    where: { id: "global" },
    update: { avatarPath: newPath },
    create: { id: "global", hours: {}, avatarPath: newPath },
  });
  if (current?.avatarPath && current.avatarPath !== newPath) {
    deleteStorageObject(current.avatarPath).catch((err) =>
      console.error("[admin avatar] failed to remove old avatar:", err),
    );
  }

  return NextResponse.json({ avatarUrl: await hydrateAvatarUrl(newPath) });
}

export async function DELETE() {
  const denied = await guard();
  if (denied) return denied;

  const current = await prisma.adminSettings.findUnique({
    where: { id: "global" },
    select: { avatarPath: true },
  });
  if (!current?.avatarPath) return NextResponse.json({ ok: true });

  await prisma.adminSettings.update({ where: { id: "global" }, data: { avatarPath: null } });
  deleteStorageObject(current.avatarPath).catch((err) =>
    console.error("[admin avatar] failed to remove avatar:", err),
  );
  return NextResponse.json({ ok: true });
}
