import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AuthRequiredError, AdminRequiredError } from "@/lib/auth/admin-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { WeeklyHours } from "@/lib/availability";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthRequiredError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AdminRequiredError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const row = await prisma.adminSettings.findUnique({ where: { id: "global" } });
  if (!row) return NextResponse.json({ error: "Settings not initialized." }, { status: 500 });
  return NextResponse.json({
    timezone: row.timezone,
    hours: row.hours,
    oooEnabled: row.oooEnabled,
    oooUntil: row.oooUntil?.toISOString() ?? null,
    oooMessage: row.oooMessage,
  });
}

interface PatchBody {
  timezone?: string;
  hours?: WeeklyHours;
  oooEnabled?: boolean;
  oooUntil?: string | null;
  oooMessage?: string | null;
}

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAY_KEYS = ["0", "1", "2", "3", "4", "5", "6"] as const;

function isValidIanaTz(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

function validateHours(h: unknown): h is WeeklyHours {
  if (!h || typeof h !== "object") return false;
  for (const k of WEEKDAY_KEYS) {
    const day = (h as Record<string, unknown>)[k];
    if (!day || typeof day !== "object") return false;
    const d = day as { enabled?: unknown; open?: unknown; close?: unknown };
    if (typeof d.enabled !== "boolean") return false;
    if (d.enabled) {
      if (typeof d.open !== "string" || !HHMM.test(d.open)) return false;
      if (typeof d.close !== "string" || !HHMM.test(d.close)) return false;
      if (d.open >= d.close) return false; // string compare works for HH:mm
    }
  }
  return true;
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthRequiredError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AdminRequiredError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const data: Record<string, unknown> = {};

  if (body.timezone !== undefined) {
    if (typeof body.timezone !== "string" || !isValidIanaTz(body.timezone)) {
      return NextResponse.json({ error: "Invalid timezone." }, { status: 400 });
    }
    data.timezone = body.timezone;
  }
  if (body.hours !== undefined) {
    if (!validateHours(body.hours)) {
      return NextResponse.json({ error: "Invalid hours: each enabled day needs HH:mm open<close." }, { status: 400 });
    }
    data.hours = body.hours;
  }
  if (body.oooEnabled !== undefined) {
    if (typeof body.oooEnabled !== "boolean") return NextResponse.json({ error: "Invalid oooEnabled." }, { status: 400 });
    data.oooEnabled = body.oooEnabled;
  }
  if (body.oooUntil !== undefined) {
    if (body.oooUntil === null) {
      data.oooUntil = null;
    } else {
      const d = new Date(body.oooUntil);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid oooUntil." }, { status: 400 });
      data.oooUntil = d;
    }
  }
  if (body.oooMessage !== undefined) {
    if (body.oooMessage !== null && typeof body.oooMessage !== "string") {
      return NextResponse.json({ error: "Invalid oooMessage." }, { status: 400 });
    }
    if (typeof body.oooMessage === "string" && body.oooMessage.length > 280) {
      return NextResponse.json({ error: "oooMessage too long (280 max)." }, { status: 400 });
    }
    data.oooMessage = body.oooMessage;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const updated = await prisma.adminSettings.upsert({
    where: { id: "global" },
    update: data,
    create: {
      id: "global",
      timezone: (data.timezone as string | undefined) ?? "America/New_York",
      hours: (data.hours as object | undefined) ?? {},
      oooEnabled: (data.oooEnabled as boolean | undefined) ?? false,
      oooUntil: (data.oooUntil as Date | null | undefined) ?? null,
      oooMessage: (data.oooMessage as string | null | undefined) ?? null,
    },
  });

  // Broadcast so any open chat widget refreshes immediately.
  // We MUST wait for SUBSCRIBED before sending — sending earlier silently drops
  // the message. Mirror the pattern used in lib/realtime/use-ticket-channel.ts.
  try {
    const supabase = supabaseAdmin();
    const ch = supabase.channel("admin-status");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 2000); // give up after 2s
      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          await ch.send({ type: "broadcast", event: "settings-changed", payload: { at: Date.now() } });
          resolve();
        }
      });
    });
    void supabase.removeChannel(ch);
  } catch {
    // Best-effort. Polling will catch up within 60s.
  }

  return NextResponse.json({
    timezone: updated.timezone,
    hours: updated.hours,
    oooEnabled: updated.oooEnabled,
    oooUntil: updated.oooUntil?.toISOString() ?? null,
    oooMessage: updated.oooMessage,
  });
}
