"use client";

export interface UploadResult {
  filename: string;
  path: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Two-step upload: ask the server for a signed URL, PUT the file straight
 * to Supabase Storage. Server-side validation is the source of truth on
 * size/type; this just plumbs the file through.
 *
 * `endpoint` is "/api/portal/uploads" or "/api/admin/uploads" depending on
 * which side of the app the caller is on.
 */
export async function uploadFile(
  endpoint: "/api/portal/uploads" | "/api/admin/uploads",
  file: File,
): Promise<UploadResult> {
  const signRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    }),
  });

  if (!signRes.ok) {
    const body = (await signRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Could not request upload URL.");
  }

  const { uploadUrl, path, contentType, filename, sizeBytes } =
    (await signRes.json()) as {
      uploadUrl: string;
      path: string;
      contentType: string;
      filename: string;
      sizeBytes: number;
    };

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status}).`);
  }

  return { filename, path, contentType, sizeBytes };
}
