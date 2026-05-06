import { NextResponse } from "next/server";
import {
  requireAdmin,
  AuthRequiredError,
  AdminRequiredError,
} from "@/lib/auth/admin-guard";
import {
  createSignedUploadUrl,
  generateUploadPath,
  validateUpload,
} from "@/lib/storage";

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthRequiredError || e instanceof AdminRequiredError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  let payload: { filename?: string; contentType?: string; sizeBytes?: number };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const filename = payload.filename;
  const contentType = payload.contentType;
  const sizeBytes = payload.sizeBytes;

  if (!filename || !contentType || typeof sizeBytes !== "number") {
    return NextResponse.json(
      { error: "filename, contentType, and sizeBytes are required." },
      { status: 400 },
    );
  }

  const validationError = validateUpload({ filename, contentType, sizeBytes });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const path = generateUploadPath(filename);
  try {
    const result = await createSignedUploadUrl(path);
    return NextResponse.json({
      uploadUrl: result.uploadUrl,
      token: result.token,
      path: result.path,
      contentType,
      filename,
      sizeBytes,
    });
  } catch (err) {
    console.error("[admin/uploads] sign failed:", err);
    return NextResponse.json(
      { error: "Could not create upload URL. Try again." },
      { status: 500 },
    );
  }
}
