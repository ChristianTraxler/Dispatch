import "server-only";

import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "ticket-attachments";

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed", // some browsers/OSes report .zip as this
]);

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
export const MAX_FILES_PER_MESSAGE = 5;

export interface AttachmentRecord {
  filename: string;
  /** Stable storage path; convert to a signed URL at display time. */
  path: string;
  contentType: string;
  sizeBytes: number;
}

/** Sanitize a user-supplied filename for use in a storage path. */
function safeFilename(name: string): string {
  const trimmed = name.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return trimmed.length > 0 ? trimmed : "file";
}

/** Generate a fresh storage path for an upcoming upload. */
export function generateUploadPath(filename: string): string {
  const id = crypto.randomBytes(12).toString("hex");
  return `uploads/${id}/${safeFilename(filename)}`;
}

/** Ask Supabase Storage for a signed URL the client can PUT to directly. */
export async function createSignedUploadUrl(path: string): Promise<{
  uploadUrl: string;
  token: string;
  path: string;
}> {
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Failed to create upload URL");
  return { uploadUrl: data.signedUrl, token: data.token, path };
}

/** Sign a single object path for short-lived viewing. */
export async function createSignedViewUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Sign many paths in one call. Returns null entries for any that fail. */
export async function createSignedViewUrls(
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Array<string | null>> {
  if (paths.length === 0) return [];
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrls(paths, expiresInSeconds);
  if (error || !data) return paths.map(() => null);
  return data.map((d) => d.signedUrl ?? null);
}

/**
 * Hydrate attachments stored as JSON (just paths) into the display shape
 * (with a fresh signed view URL). Pass any falsy `attachments` and you
 * get an empty array back.
 */
export async function hydrateAttachments(
  attachments: unknown,
): Promise<Array<{ filename: string; url: string; contentType: string; sizeBytes: number }>> {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  const records = attachments.filter(
    (a): a is AttachmentRecord =>
      a != null &&
      typeof a === "object" &&
      typeof (a as AttachmentRecord).path === "string" &&
      typeof (a as AttachmentRecord).filename === "string",
  );
  if (records.length === 0) return [];
  const urls = await createSignedViewUrls(records.map((r) => r.path));
  return records.flatMap((r, i) => {
    const url = urls[i];
    if (!url) return [];
    return [{ filename: r.filename, url, contentType: r.contentType, sizeBytes: r.sizeBytes }];
  });
}

export function validateUpload({
  filename,
  contentType,
  sizeBytes,
}: {
  filename: string;
  contentType: string;
  sizeBytes: number;
}): string | null {
  if (!filename || filename.length > 200) return "Invalid filename.";
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return `Unsupported file type "${contentType}".`;
  }
  if (sizeBytes <= 0) return "File is empty.";
  if (sizeBytes > MAX_FILE_SIZE) return `File exceeds 25 MB cap.`;
  return null;
}
