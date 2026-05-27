"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AddOnKind,
  AddOnPriceUnit,
  AddOnScope,
  ClientAddOnStatus,
  TicketStatus,
} from "@prisma/client";
import { formatCents, priceUnitSuffix } from "@/lib/add-ons/format";
import { resolvePrice } from "@/lib/add-ons/pricing";

export type CatalogAddOn = {
  id: string;
  name: string;
  kind: AddOnKind;
  scope: AddOnScope;
  priceCents: number;
  priceUnit: AddOnPriceUnit;
  isActive: boolean;
};

export type Override = { addOnId: string; priceCents: number };

export type ActiveRow = {
  id: string;
  addOnId: string;
  addOnName: string;
  kind: AddOnKind;
  scope: AddOnScope;
  priceUnit: AddOnPriceUnit;
  siteId: string | null;
  siteName: string | null;
  status: ClientAddOnStatus;
  priceCents: number;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
  requestTicket: { id: string; title: string; status: TicketStatus } | null;
};

export type ClientSite = { id: string; displayName: string };

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

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function AddOnsSection({
  clientId,
  catalog,
  overrides,
  active,
  sites,
}: {
  clientId: string;
  catalog: CatalogAddOn[];
  overrides: Override[];
  active: ActiveRow[];
  sites: ClientSite[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Override form state
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideAddOnId, setOverrideAddOnId] = useState<string>("");
  const [overridePrice, setOverridePrice] = useState<string>("");

  // Activation form state
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateAddOnId, setActivateAddOnId] = useState<string>("");
  const [activateSiteId, setActivateSiteId] = useState<string>("");
  const [activatePrice, setActivatePrice] = useState<string>("");
  const [activateNote, setActivateNote] = useState<string>("");
  const [activateError, setActivateError] = useState<string | null>(null);

  const overrideByAddOn = useMemo(() => {
    const m = new Map<string, Override>();
    for (const o of overrides) m.set(o.addOnId, o);
    return m;
  }, [overrides]);

  const activeCatalogAddOns = catalog.filter((a) => a.isActive);
  const selectedActivateAddOn = catalog.find((a) => a.id === activateAddOnId) ?? null;

  function startOverride() {
    setOverrideOpen(true);
    setOverrideAddOnId(activeCatalogAddOns[0]?.id ?? "");
    setOverridePrice("");
  }

  function startActivate() {
    setActivateOpen(true);
    const first = activeCatalogAddOns[0];
    setActivateAddOnId(first?.id ?? "");
    setActivateSiteId("");
    setActivateError(null);
    if (first) {
      const ov = overrideByAddOn.get(first.id);
      setActivatePrice(centsToDollars(ov?.priceCents ?? first.priceCents));
    } else {
      setActivatePrice("");
    }
    setActivateNote("");
  }

  function onChangeActivateAddOn(id: string) {
    setActivateAddOnId(id);
    setActivateSiteId("");
    const addOn = catalog.find((a) => a.id === id);
    if (addOn) {
      const ov = overrideByAddOn.get(id);
      setActivatePrice(centsToDollars(ov?.priceCents ?? addOn.priceCents));
    }
  }

  async function saveOverride() {
    if (!overrideAddOnId) return;
    const cents = dollarsToCents(overridePrice);
    if (cents === null) {
      alert("Price must be a non-negative number.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/add-on-prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addOnId: overrideAddOnId, priceCents: cents }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error || `Save failed (${res.status})`);
        return;
      }
      setOverrideOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeOverride(addOnId: string) {
    if (!confirm("Remove this price override?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/add-on-prices/${addOnId}`, {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveActivate() {
    setActivateError(null);
    if (!activateAddOnId) {
      setActivateError("Pick an add-on.");
      return;
    }
    const addOn = catalog.find((a) => a.id === activateAddOnId);
    if (!addOn) return;
    if (addOn.scope === "PER_SITE" && !activateSiteId) {
      setActivateError("Pick a site.");
      return;
    }
    const cents = dollarsToCents(activatePrice);
    if (cents === null) {
      setActivateError("Price must be a non-negative number.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/add-ons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addOnId: activateAddOnId,
          siteId: addOn.scope === "PER_SITE" ? activateSiteId : undefined,
          priceCents: cents,
          note: activateNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActivateError(data.error || `Activation failed (${res.status})`);
        return;
      }
      setActivateOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateRow(rowId: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/add-ons/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">§</span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Add-Ons
        </span>
      </div>

      <h2
        className="font-display text-2xl md:text-3xl leading-none mb-6"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Add-Ons
      </h2>

      {/* Price overrides */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg">Price overrides</h3>
          <button
            type="button"
            onClick={startOverride}
            disabled={busy || overrideOpen || activeCatalogAddOns.length === 0}
            className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red hover:opacity-80 disabled:opacity-40"
          >
            + Override
          </button>
        </div>

        {overrideOpen && (
          <div className="border border-rule bg-parchment-warm/40 p-4 mb-3 flex flex-col md:flex-row md:items-end gap-3">
            <label className="block flex-1">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Add-on
              </span>
              <select
                value={overrideAddOnId}
                onChange={(e) => setOverrideAddOnId(e.target.value)}
                className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-display"
              >
                {activeCatalogAddOns.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {formatCents(a.priceCents)}{priceUnitSuffix(a.priceUnit)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Their price (USD)
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={overridePrice}
                onChange={(e) => setOverridePrice(e.target.value)}
                className="mt-1 border border-rule bg-parchment px-3 py-2 font-mono w-32"
              />
            </label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={saveOverride} disabled={busy} className="btn-dispatch">Save</button>
              <button
                type="button"
                onClick={() => setOverrideOpen(false)}
                disabled={busy}
                className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {overrides.length === 0 ? (
          <p className="font-display italic text-ink-mute text-sm">No overrides — this client pays the standard catalog price.</p>
        ) : (
          <ul className="divide-y divide-rule border border-rule">
            {overrides.map((o) => {
              const addOn = catalog.find((a) => a.id === o.addOnId);
              if (!addOn) return null;
              return (
                <li key={o.addOnId} className="px-4 py-2.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-display">{addOn.name}</div>
                    <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                      Standard {formatCents(addOn.priceCents)}{priceUnitSuffix(addOn.priceUnit)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">
                      {formatCents(o.priceCents)}<span className="text-ink-mute">{priceUnitSuffix(addOn.priceUnit)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeOverride(o.addOnId)}
                      disabled={busy}
                      className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red hover:opacity-80"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Active add-ons */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg">Active &amp; history</h3>
          <button
            type="button"
            onClick={startActivate}
            disabled={busy || activateOpen || activeCatalogAddOns.length === 0}
            className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red hover:opacity-80 disabled:opacity-40"
          >
            + Activate add-on
          </button>
        </div>

        {activateOpen && (
          <div className="border border-rule bg-parchment-warm/40 p-4 mb-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">Add-on</span>
                <select
                  value={activateAddOnId}
                  onChange={(e) => onChangeActivateAddOn(e.target.value)}
                  className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-display"
                >
                  {activeCatalogAddOns.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>

              {selectedActivateAddOn?.scope === "PER_SITE" && (
                <label className="block">
                  <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">Site</span>
                  <select
                    value={activateSiteId}
                    onChange={(e) => setActivateSiteId(e.target.value)}
                    className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-display"
                  >
                    <option value="">— pick a site —</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.displayName}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">Snapshot price (USD)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={activatePrice}
                  onChange={(e) => setActivatePrice(e.target.value)}
                  className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-mono"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">Note (admin-only)</span>
                <input
                  type="text"
                  value={activateNote}
                  onChange={(e) => setActivateNote(e.target.value)}
                  className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-display"
                />
              </label>
            </div>

            {activateError && <p className="mt-3 text-sm text-signal-red font-mono">{activateError}</p>}

            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={saveActivate} disabled={busy} className="btn-dispatch">Activate</button>
              <button
                type="button"
                onClick={() => setActivateOpen(false)}
                disabled={busy}
                className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {active.length === 0 ? (
          <p className="font-display italic text-ink-mute text-sm">No add-ons activated yet.</p>
        ) : (
          <ul className="divide-y divide-rule border border-rule">
            {active.map((row) => (
              <li
                key={row.id}
                className={`px-4 py-3 ${row.status === "ENDED" ? "opacity-60" : ""}`}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display">
                      {row.addOnName}
                      {row.siteName && (
                        <span className="text-ink-mute"> · {row.siteName}</span>
                      )}
                    </div>
                    <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute mt-0.5">
                      Started {formatDate(row.startedAt)}
                      {row.endedAt && ` · Ended ${formatDate(row.endedAt)}`}
                      {row.requestTicket && (
                        <> · <a className="hover:text-ink underline" href={`/admin/ticket/${row.requestTicket.id}`}>Ticket</a></>
                      )}
                    </div>
                    {row.note && (
                      <div className="text-xs text-ink-soft mt-1 italic">“{row.note}”</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">
                      {formatCents(row.priceCents)}<span className="text-ink-mute">{priceUnitSuffix(row.priceUnit)}</span>
                    </span>
                    <span
                      className={[
                        "font-mono text-[0.55rem] uppercase tracking-widest px-1.5 py-0.5",
                        row.status === "ACTIVE" ? "bg-signal-green text-parchment-warm"
                        : row.status === "PAUSED" ? "bg-ink-mute text-parchment-warm"
                        : "bg-rule text-ink-soft",
                      ].join(" ")}
                    >
                      {row.status}
                    </span>

                    {row.status === "ACTIVE" && (
                      <>
                        <button
                          type="button"
                          onClick={() => updateRow(row.id, { action: "pause" })}
                          disabled={busy}
                          className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-ink"
                        >
                          Pause
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`End "${row.addOnName}"? This is irreversible.`)) {
                              updateRow(row.id, { action: "end" });
                            }
                          }}
                          disabled={busy}
                          className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red hover:opacity-80"
                        >
                          End
                        </button>
                      </>
                    )}
                    {row.status === "PAUSED" && (
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { action: "resume" })}
                        disabled={busy}
                        className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red hover:opacity-80"
                      >
                        Resume
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
