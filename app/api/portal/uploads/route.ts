import { NextResponse } from "next/server";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import {
  createSignedUploadUrl,
  generateUploadPath,
  validateUpload,
} from "@/lib/storage";

export async function POST(req: Request) {
  const account = await getCurrentClientAccount();
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
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
    console.error("[uploads] sign failed:", err);
    return NextResponse.json(
      { error: "Could not create upload URL. Try again." },
      { status: 500 },
    );
  }
}
