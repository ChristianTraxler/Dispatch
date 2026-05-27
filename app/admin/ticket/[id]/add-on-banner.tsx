"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AddOnKind, AddOnPriceUnit, AddOnScope } from "@prisma/client";
import { formatCents, priceUnitSuffix, scopeLabel } from "@/lib/add-ons/format";

export type AddOnBannerData = {
  clientId: string;
  addOn: {
    id: string;
    name: string;
    kind: AddOnKind;
    scope: AddOnScope;
    priceCents: number;
    priceUnit: AddOnPriceUnit;
  };
  overridePriceCents: number | null;
  alreadyActiveCount: number;
  defaultSiteId: string;
  clientSites: { id: string; displayName: string }[];
};

function dollarsToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function centsToDollars(cents: number): string {
  const d = cents / 100;
  return d % 1 === 0 ? d.toFixed(0) : d.toFixed(2);
}

export function AddOnRequestBanner({
  data,
  ticketId,
}: {
  data: AddOnBannerData;
  ticketId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState<string>(data.defaultSiteId);
  const [priceDollars, setPriceDollars] = useState<string>(
    centsToDollars(data.overridePriceCents ?? data.addOn.priceCents),
  );
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveCents = data.overridePriceCents ?? data.addOn.priceCents;
  const isOverridden = data.overridePriceCents !== null && data.overridePriceCents !== data.addOn.priceCents;
  const alreadyActive = data.alreadyActiveCount > 0;

  async function activate() {
    setError(null);
    if (data.addOn.scope === "PER_SITE" && !siteId) {
      setError("Pick a site.");
      return;
    }
    const cents = dollarsToCents(priceDollars);
    if (cents === null) {
      setError("Price must be a non-negative number.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/clients/${data.clientId}/add-ons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addOnId: data.addOn.id,
          siteId: data.addOn.scope === "PER_SITE" ? siteId : undefined,
          priceCents: cents,
          note: note.trim() || undefined,
          fromTicketId: ticketId,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || `Activation failed (${res.status})`);
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-10 pt-6">
      <div className="border-2 border-signal-red bg-parchment-warm px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[0.55rem] uppercase tracking-widest text-signal-red mb-1">
            Add-on request
          </div>
          <div className="font-display text-lg">
            {data.addOn.name}
            <span className="text-ink-mute font-mono text-sm ml-2">
              {isOverridden && (
                <span className="line-through mr-1">{formatCents(data.addOn.priceCents)}</span>
              )}
              {formatCents(effectiveCents)}{priceUnitSuffix(data.addOn.priceUnit)} · {scopeLabel(data.addOn.scope)}
            </span>
          </div>
        </div>
        {alreadyActive ? (
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
            Already active
          </span>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="btn-dispatch">
            Activate add-on
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 flex items-end md:items-center justify-center p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="bg-parchment border border-rule max-w-md w-full p-5 md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl mb-4">Activate {data.addOn.name}</h3>

            {data.addOn.scope === "PER_SITE" && (
              <label className="block mb-3">
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">Site</span>
                <select
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="mt-1 w-full border border-rule bg-parchment-warm px-3 py-2 font-display"
                >
                  <option value="">— pick a site —</option>
                  {data.clientSites.map((s) => (
                    <option key={s.id} value={s.id}>{s.displayName}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="block mb-3">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Snapshot price (USD)
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                className="mt-1 w-full border border-rule bg-parchment-warm px-3 py-2 font-mono"
              />
            </label>

            <label className="block mb-3">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Note (admin-only)
              </span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full border border-rule bg-parchment-warm px-3 py-2 font-display"
              />
            </label>

            {error && <p className="text-sm text-signal-red font-mono mb-3">{error}</p>}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-ink"
              >
                Cancel
              </button>
              <button type="button" onClick={activate} disabled={busy} className="btn-dispatch">
                {busy ? "Activating…" : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
