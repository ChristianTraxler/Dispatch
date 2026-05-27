"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AddOnKind,
  AddOnPriceUnit,
  AddOnScope,
  ClientAddOnStatus,
} from "@prisma/client";
import { formatCents, priceUnitSuffix, scopeLabel } from "@/lib/add-ons/format";
import { resolvePrice } from "@/lib/add-ons/pricing";

type CatalogAddOn = {
  id: string;
  name: string;
  description: string;
  kind: AddOnKind;
  scope: AddOnScope;
  priceCents: number;
  priceUnit: AddOnPriceUnit;
};

type Override = { addOnId: string; priceCents: number };

type ActiveAddOn = {
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
};

type OpenRequest = {
  ticketId: string;
  addOnId: string;
  siteId: string | null;
};

type Site = { id: string; displayName: string };

type ModalState =
  | { kind: "closed" }
  | { kind: "request"; addOn: CatalogAddOn; effectiveCents: number };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AddOnsClient({
  catalog,
  overrides,
  activeAddOns,
  openRequests,
  sites,
}: {
  catalog: CatalogAddOn[];
  overrides: Override[];
  activeAddOns: ActiveAddOn[];
  openRequests: OpenRequest[];
  sites: Site[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const overrideByAddOnId = useMemo(() => {
    const m = new Map<string, Override>();
    for (const o of overrides) m.set(o.addOnId, o);
    return m;
  }, [overrides]);

  // Sites that already have an ACTIVE row for a given PER_SITE add-on
  const activeSiteIdsByAddOn = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const row of activeAddOns) {
      if (row.status !== "ACTIVE" || !row.siteId) continue;
      const set = m.get(row.addOnId) ?? new Set<string>();
      set.add(row.siteId);
      m.set(row.addOnId, set);
    }
    return m;
  }, [activeAddOns]);

  // Per-client add-ons that are ACTIVE → hide their catalog card entirely
  const perClientActive = useMemo(() => {
    const s = new Set<string>();
    for (const row of activeAddOns) {
      if (row.status === "ACTIVE" && row.scope === "PER_CLIENT") s.add(row.addOnId);
    }
    return s;
  }, [activeAddOns]);

  const openRequestByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of openRequests) {
      const key = `${r.addOnId}|${r.siteId ?? ""}`;
      m.set(key, r.ticketId);
    }
    return m;
  }, [openRequests]);

  function openRequestModal(addOn: CatalogAddOn) {
    const override = overrideByAddOnId.get(addOn.id);
    const { effectiveCents } = resolvePrice(addOn, override);
    setSelectedSiteId("");
    setNotes("");
    setSubmitError(null);
    setModal({ kind: "request", addOn, effectiveCents });
  }

  async function submitRequest() {
    if (modal.kind !== "request") return;
    setSubmitError(null);

    const { addOn } = modal;
    if (addOn.scope === "PER_SITE" && !selectedSiteId) {
      setSubmitError("Please pick a site.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/add-ons/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addOnId: addOn.id,
          siteId: addOn.scope === "PER_SITE" ? selectedSiteId : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ticketId?: string; error?: string };
      if (!res.ok || !data.ticketId) {
        if (data.ticketId) {
          router.push(`/portal/ticket/${data.ticketId}`);
          return;
        }
        setSubmitError(data.error || `Request failed (${res.status})`);
        return;
      }
      router.push(`/portal/ticket/${data.ticketId}`);
    } finally {
      setSubmitting(false);
    }
  }

  const visibleCatalog = catalog.filter((a) => !perClientActive.has(a.id));

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">§</span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Services
        </span>
      </div>

      <div className="mb-8">
        <h1
          className="font-display text-3xl md:text-5xl leading-none mb-2"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          Add-Ons
        </h1>
        <p className="font-display italic text-ink-mute text-base">
          Services and upgrades you can add to your account.
        </p>
        <p className="mt-3 font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Payment up front — once your invoice is paid, work begins.
        </p>
      </div>

      {/* Your Add-Ons */}
      {activeAddOns.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display text-xl mb-4">Your Add-Ons</h2>
          <ul className="space-y-2">
            {activeAddOns.map((row) => (
              <li
                key={row.id}
                className="border border-rule bg-parchment-warm/50 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-display text-base">{row.addOnName}</div>
                  <div className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mt-0.5">
                    {row.siteName ? `${row.siteName} · ` : ""}
                    Active since {formatDate(row.startedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">
                    {formatCents(row.priceCents)}
                    <span className="text-ink-mute">{priceUnitSuffix(row.priceUnit)}</span>
                  </span>
                  <span
                    className={[
                      "font-mono text-[0.6rem] uppercase tracking-widest px-1.5 py-0.5",
                      row.status === "ACTIVE"
                        ? "bg-signal-green text-parchment-warm"
                        : "bg-ink-mute text-parchment-warm",
                    ].join(" ")}
                  >
                    {row.status === "ACTIVE" ? "Active" : "Paused"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Available Add-Ons */}
      <section>
        <h2 className="font-display text-xl mb-4">Available Add-Ons</h2>

        {visibleCatalog.length === 0 ? (
          <div className="border border-dashed border-rule px-6 py-12 text-center">
            <p className="font-display italic text-ink-mute">
              Nothing available right now — get in touch if you have something in mind.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleCatalog.map((addOn) => {
              const override = overrideByAddOnId.get(addOn.id);
              const { standardCents, effectiveCents, isOverridden } = resolvePrice(addOn, override);

              // PER_SITE: open request exists for any of the client's sites?
              // PER_CLIENT: open request exists at all?
              let openTicketId: string | null = null;
              if (addOn.scope === "PER_CLIENT") {
                openTicketId = openRequestByKey.get(`${addOn.id}|`) ?? null;
              } else {
                for (const site of sites) {
                  const t = openRequestByKey.get(`${addOn.id}|${site.id}`);
                  if (t) { openTicketId = t; break; }
                }
              }

              // PER_SITE: are all sites already active for this add-on?
              const activeSites = activeSiteIdsByAddOn.get(addOn.id) ?? new Set<string>();
              const allSitesActive =
                addOn.scope === "PER_SITE" && sites.length > 0 && sites.every((s) => activeSites.has(s.id));

              return (
                <article
                  key={addOn.id}
                  className="border border-rule bg-parchment-warm p-5 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-lg leading-tight">{addOn.name}</h3>
                    <span className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute shrink-0">
                      {scopeLabel(addOn.scope)}
                    </span>
                  </div>

                  <p className="text-sm text-ink-soft whitespace-pre-wrap">{addOn.description}</p>

                  <div className="flex items-baseline gap-2 mt-auto">
                    {isOverridden ? (
                      <>
                        <span className="font-mono text-sm text-ink-mute line-through">
                          {formatCents(standardCents)}
                        </span>
                        <span className="font-mono text-base text-ink">
                          {formatCents(effectiveCents)}
                          <span className="text-ink-mute">{priceUnitSuffix(addOn.priceUnit)}</span>
                        </span>
                        <span className="font-mono text-[0.55rem] uppercase tracking-widest bg-signal-green text-parchment-warm px-1.5 py-0.5">
                          Your rate
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-base text-ink">
                        {formatCents(effectiveCents)}
                        <span className="text-ink-mute">{priceUnitSuffix(addOn.priceUnit)}</span>
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-rule">
                    {openTicketId ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/portal/ticket/${openTicketId}`)}
                        className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-ink transition-colors"
                      >
                        Requested — view ticket →
                      </button>
                    ) : allSitesActive ? (
                      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
                        Active on all your sites
                      </span>
                    ) : sites.length === 0 ? (
                      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
                        Add a site first to request
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openRequestModal(addOn)}
                        className="btn-dispatch"
                      >
                        Request
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Request modal */}
      {modal.kind === "request" && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 flex items-end md:items-center justify-center p-4"
          onClick={() => !submitting && setModal({ kind: "closed" })}
        >
          <div
            className="bg-parchment border border-rule max-w-md w-full p-5 md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl mb-1">Request {modal.addOn.name}</h3>
            <p className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-3">
              {formatCents(modal.effectiveCents)}{priceUnitSuffix(modal.addOn.priceUnit)} · {scopeLabel(modal.addOn.scope)}
            </p>
            <div className="border-l-2 border-signal-red pl-3 py-1 mb-4 bg-parchment-warm/60">
              <p className="font-display text-sm text-ink-soft leading-snug">
                We&rsquo;ll send you an invoice for{" "}
                <span className="font-mono">
                  {formatCents(modal.effectiveCents)}{priceUnitSuffix(modal.addOn.priceUnit)}
                </span>
                . Work begins once payment is received.
              </p>
            </div>

            {modal.addOn.scope === "PER_SITE" && (
              <label className="block mb-4">
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                  Site
                </span>
                <select
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="mt-1 w-full border border-rule bg-parchment-warm px-3 py-2 font-display"
                >
                  <option value="">— pick a site —</option>
                  {sites
                    .filter((s) => !(activeSiteIdsByAddOn.get(modal.addOn.id) ?? new Set()).has(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>{s.displayName}</option>
                    ))}
                </select>
              </label>
            )}

            <label className="block mb-4">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Notes (optional)
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything you'd like us to know?"
                className="mt-1 w-full border border-rule bg-parchment-warm px-3 py-2 font-display"
              />
            </label>

            {submitError && (
              <p className="text-sm text-signal-red font-mono mb-3">{submitError}</p>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModal({ kind: "closed" })}
                disabled={submitting}
                className="font-mono text-[0.7rem] uppercase tracking-widest text-ink-mute hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRequest}
                disabled={submitting}
                className="btn-dispatch disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
