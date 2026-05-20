import "server-only";

import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_BYTES = 32;
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const hash = hashToken(raw);
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function expiryFromNow(): Date {
  return new Date(Date.now() + EXPIRY_MS);
}

/**
 * Look up a pending request by raw token. Returns null if missing, expired,
 * or already consumed — callers should treat all three as the same generic
 * "invalid or expired" error.
 */
export async function findValidRequest(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const row = await prisma.emailChangeRequest.findUnique({
    where: { tokenHash },
  });
  if (!row) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

/**
 * Returns the current pending (not consumed, not expired) request for this
 * account, or null. Used by the Account page banner.
 */
export async function getPendingForAccount(clientAccountId: string) {
  const row = await prisma.emailChangeRequest.findFirst({
    where: {
      clientAccountId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  return row;
}

/**
 * Returns true if `newEmail` is currently claimed by another account's
 * pending request. Used to prevent two accounts racing to the same target.
 */
export async function isEmailPendingElsewhere(
  newEmail: string,
  excludeAccountId: string,
): Promise<boolean> {
  const row = await prisma.emailChangeRequest.findFirst({
    where: {
      newEmail,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      NOT: { clientAccountId: excludeAccountId },
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Per-account rate limit for self-serve requests. In-memory bucket; fine for
 * the current scale (single Vercel deployment, low concurrency). Resets on
 * cold start.
 */
const REQUEST_LIMIT = 5;
const REQUEST_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const requestHits = new Map<string, number[]>();

export function checkAndRecordRequestRate(clientAccountId: string): boolean {
  const now = Date.now();
  const cutoff = now - REQUEST_WINDOW_MS;
  const hits = (requestHits.get(clientAccountId) ?? []).filter((t) => t > cutoff);
  if (hits.length >= REQUEST_LIMIT) {
    requestHits.set(clientAccountId, hits);
    return false;
  }
  hits.push(now);
  requestHits.set(clientAccountId, hits);
  return true;
}
