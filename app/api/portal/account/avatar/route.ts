import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import {
  AVATAR_MAX_SIZE,
  deleteStorageObject,
  generateAvatarPath,
  hydrateAvatarUrl,
  uploadAvatarBytes,
  validateAvatarUpload,
} from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

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

  const validation = validateAvatarUpload({
    contentType: file.type,
    sizeBytes: file.size,
  });
  if (validation) {
    return NextResponse.json({ error: validation }, { status: 400 });
  }
  if (file.size > AVATAR_MAX_SIZE) {
    return NextResponse.json({ error: "Avatar must be under 2 MB." }, { status: 413 });
  }

  const newPath = generateAvatarPath(account.id, file.type);
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await uploadAvatarBytes(newPath, buffer, file.type);
  } catch (err) {
    console.error("[avatar] upload failed:", err);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }

  // Look up the existing path so we can clean up after a successful replace.
  const current = await prisma.clientAccount.findUnique({
    where: { id: account.id },
    select: { avatarPath: true },
  });

  await prisma.clientAccount.update({
    where: { id: account.id },
    data: { avatarPath: newPath },
  });

  if (current?.avatarPath && current.avatarPath !== newPath) {
    deleteStorageObject(current.avatarPath).catch((err) =>
      console.error("[avatar] failed to remove old avatar:", err),
    );
  }

  const url = await hydrateAvatarUrl(newPath);
  return NextResponse.json({ avatarUrl: url });
}

export async function DELETE() {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const current = await prisma.clientAccount.findUnique({
    where: { id: account.id },
    select: { avatarPath: true },
  });
  if (!current?.avatarPath) {
    return NextResponse.json({ ok: true });
  }

  await prisma.clientAccount.update({
    where: { id: account.id },
    data: { avatarPath: null },
  });

  deleteStorageObject(current.avatarPath).catch((err) =>
    console.error("[avatar] failed to remove avatar:", err),
  );

  return NextResponse.json({ ok: true });
}
