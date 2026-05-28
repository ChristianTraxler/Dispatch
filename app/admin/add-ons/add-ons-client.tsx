"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AddOnKind,
  AddOnScope,
  AddOnPriceUnit,
  AddOnPriceType,
} from "@prisma/client";
import {
  formatPercentBp,
  formatPriceRange,
  resolveUnitLabel,
} from "@/lib/add-ons/format";

type AddOnRow = {
  id: string;
  name: string;
  description: string;
  kind: AddOnKind;
  scope: AddOnScope;
  priceType: AddOnPriceType;
  priceCents: number;
  priceMaxCents: number | null;
  pricePercentBp: number | null;
  priceUnit: AddOnPriceUnit;
  priceUnitLabel: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  name: string;
  description: string;
  kind: AddOnKind;
  scope: AddOnScope;
  priceType: AddOnPriceType;
  priceDollars: string;
  priceMaxDollars: string;
  pricePercent: string;
  priceUnit: AddOnPriceUnit;
  priceUnitLabel: string;
  sortOrder: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  kind: "RECURRING",
  scope: "PER_SITE",
  priceType: "FIXED",
  priceDollars: "",
  priceMaxDollars: "",
  pricePercent: "",
  priceUnit: "PER_MONTH",
  priceUnitLabel: "",
  sortOrder: "0",
};

function percentToBp(input: string): number | null {
  const trimmed = input.trim().replace(/%$/, "").replace(/^\+/, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function bpToPercent(bp: number): string {
  const pct = bp / 100;
  return pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

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

const COLLAPSED_DESC_PX = 56; // ~3.5rem preview

const BULLET_RE = /^\s*[•\-*]/;

// Collapse soft-wrapped newlines (hard-coded for a wider editor) into spaces,
// while preserving paragraph breaks and bullet boundaries. Continuation lines
// inside a bullet get merged back into the bullet they belong to.
function normalizeDescription(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((para) => {
      const lines = para.split("\n");
      const hasBullets = lines.some((l) => BULLET_RE.test(l));
      if (!hasBullets) {
        return lines.map((l) => l.trim()).filter(Boolean).join(" ");
      }
      const out: string[] = [];
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (BULLET_RE.test(line) || out.length === 0) {
          out.push(line);
        } else {
          out[out.length - 1] = `${out[out.length - 1]} ${line}`;
        }
      }
      return out.join("\n");
    })
    .join("\n\n");
}

function AddOnCard({
  row,
  isOpen,
  onToggle,
  onEdit,
  onToggleActive,
  onDelete,
  editDisabled,
  busy,
}: {
  row: AddOnRow;
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  editDisabled: boolean;
  busy: boolean;
}) {
  const descRef = useRef<HTMLParagraphElement>(null);
  const [fullHeight, setFullHeight] = useState<number>(0);
  const description = normalizeDescription(row.description);

  useEffect(() => {
    const el = descRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    // Measure the wrapper so the <p>'s own margins (mt-1) are included —
    // otherwise descenders on the last line get clipped by overflow-hidden.
    const measure = () => setFullHeight(parent.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [description]);

  const priceDisplay =
    row.priceType === "PERCENTAGE"
      ? row.pricePercentBp !== null
        ? formatPercentBp(row.pricePercentBp)
        : "—"
      : formatPriceRange(row.priceCents, row.priceMaxCents);
  const unitLabel = resolveUnitLabel(row.priceUnit, row.priceUnitLabel);

  return (
    <li
      className={`border border-rule bg-parchment-warm/30 ${row.isActive ? "" : "opacity-60"}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full text-left p-4 block"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="font-display text-base md:text-lg leading-tight min-w-0 flex-1">
                {row.name}
              </div>
              <svg
                aria-hidden="true"
                viewBox="0 0 12 12"
                className={`shrink-0 mt-1 w-3 h-3 text-ink-mute transition-transform duration-300 ease-out motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
              >
                <path
                  d="M2 4l4 4 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div
              className="overflow-hidden transition-[max-height] duration-300 ease-out motion-reduce:transition-none"
              style={{
                maxHeight: isOpen
                  ? fullHeight || undefined
                  : COLLAPSED_DESC_PX,
                ...(isOpen
                  ? null
                  : {
                      maskImage:
                        "linear-gradient(to bottom, black 45%, transparent 100%)",
                      WebkitMaskImage:
                        "linear-gradient(to bottom, black 45%, transparent 100%)",
                    }),
              }}
            >
              <p
                ref={descRef}
                className="text-xs text-ink-mute mt-1 leading-snug whitespace-pre-line"
              >
                {description}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-sm whitespace-nowrap">{priceDisplay}</div>
            <div className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute mt-0.5">
              {unitLabel}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute">
          <span>{row.kind === "RECURRING" ? "Recurring" : "One-time"}</span>
          <span className="text-ink-fade">·</span>
          <span>{row.scope === "PER_SITE" ? "Per site" : "Per client"}</span>
          <span className="text-ink-fade">·</span>
          <span>Order {row.sortOrder}</span>
          <span className="text-ink-fade">·</span>
          {row.isActive ? (
            <span className="text-signal-green">Active</span>
          ) : (
            <span>Retired</span>
          )}
        </div>
      </button>

      <div className="px-4 pb-4 -mt-1 pt-3 border-t border-rule flex items-center gap-4">
        <button
          type="button"
          onClick={onEdit}
          disabled={editDisabled}
          className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-ink disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onToggleActive}
          disabled={busy}
          className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-ink disabled:opacity-50"
        >
          {row.isActive ? "Retire" : "Unretire"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="ml-auto font-mono text-[0.65rem] uppercase tracking-widest text-signal-red hover:opacity-80 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

export function AdminAddOnsClient({ initialAddOns }: { initialAddOns: AddOnRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startNew() {
    setForm(EMPTY_FORM);
    setEditingId("new");
    setError(null);
  }

  function startEdit(row: AddOnRow) {
    setForm({
      name: row.name,
      description: row.description,
      kind: row.kind,
      scope: row.scope,
      priceType: row.priceType,
      priceDollars: row.priceType === "PERCENTAGE" ? "" : centsToDollars(row.priceCents),
      priceMaxDollars: row.priceMaxCents !== null ? centsToDollars(row.priceMaxCents) : "",
      pricePercent: row.pricePercentBp !== null ? bpToPercent(row.pricePercentBp) : "",
      priceUnit: row.priceUnit,
      priceUnitLabel: row.priceUnitLabel ?? "",
      sortOrder: String(row.sortOrder),
    });
    setEditingId(row.id);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function save() {
    setError(null);

    if (!form.name.trim() || !form.description.trim()) {
      setError("Name and description are required.");
      return;
    }
    if (form.kind === "RECURRING" && (form.priceUnit === "ONE_TIME" || form.priceUnit === "ON_TOTAL_BUILD")) {
      setError("Recurring add-ons must use per-month or per-year pricing.");
      return;
    }
    if (form.kind === "ONE_TIME" && form.priceUnit !== "ONE_TIME" && form.priceUnit !== "ON_TOTAL_BUILD") {
      setError("One-time add-ons must use one-time or on-total-build pricing.");
      return;
    }
    if (form.priceUnit === "ON_TOTAL_BUILD" && form.priceType !== "PERCENTAGE") {
      setError("On-total-build pricing is only valid for percentage add-ons.");
      return;
    }

    let payloadPrice: {
      priceType: AddOnPriceType;
      priceCents: number;
      priceMaxCents: number | null;
      pricePercentBp: number | null;
    };

    if (form.priceType === "PERCENTAGE") {
      const bp = percentToBp(form.pricePercent);
      if (bp === null) {
        setError('Percent must be a number (e.g. "25" or "+25%").');
        return;
      }
      payloadPrice = { priceType: "PERCENTAGE", priceCents: 0, priceMaxCents: null, pricePercentBp: bp };
    } else {
      const cents = dollarsToCents(form.priceDollars);
      if (cents === null) {
        setError("Price must be a non-negative number.");
        return;
      }
      if (form.priceType === "RANGE") {
        const maxCents = dollarsToCents(form.priceMaxDollars);
        if (maxCents === null) {
          setError("Max price is required for ranges.");
          return;
        }
        if (maxCents <= cents) {
          setError("Max price must be greater than the starting price.");
          return;
        }
        payloadPrice = { priceType: "RANGE", priceCents: cents, priceMaxCents: maxCents, pricePercentBp: null };
      } else {
        payloadPrice = { priceType: "FIXED", priceCents: cents, priceMaxCents: null, pricePercentBp: null };
      }
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      kind: form.kind,
      scope: form.scope,
      ...payloadPrice,
      priceUnit: form.priceUnit,
      priceUnitLabel: form.priceUnitLabel.trim() || null,
      sortOrder: Number(form.sortOrder) || 0,
    };

    setBusy(true);
    try {
      const url = editingId === "new" ? "/api/admin/add-ons" : `/api/admin/add-ons/${editingId}`;
      const method = editingId === "new" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || `Save failed (${res.status})`);
        return;
      }
      setEditingId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: AddOnRow) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/add-ons/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function destroy(row: AddOnRow) {
    if (!confirm(`Delete "${row.name}"? Cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/add-ons/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error || `Delete failed (${res.status})`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Keep priceUnit consistent with kind
      if (key === "kind") {
        if (value === "RECURRING" && (next.priceUnit === "ONE_TIME" || next.priceUnit === "ON_TOTAL_BUILD")) {
          next.priceUnit = "PER_MONTH";
        }
        if (value === "ONE_TIME") {
          // Default ONE_TIME to ONE_TIME unit, or ON_TOTAL_BUILD for percentage add-ons
          if (next.priceType === "PERCENTAGE") {
            next.priceUnit = "ON_TOTAL_BUILD";
          } else if (next.priceUnit !== "ONE_TIME") {
            next.priceUnit = "ONE_TIME";
          }
        }
      }
      // Keep priceUnit consistent with priceType
      if (key === "priceType") {
        if (value === "PERCENTAGE" && next.kind === "ONE_TIME" && next.priceUnit === "ONE_TIME") {
          next.priceUnit = "ON_TOTAL_BUILD";
        }
        if (value !== "PERCENTAGE" && next.priceUnit === "ON_TOTAL_BUILD") {
          next.priceUnit = next.kind === "ONE_TIME" ? "ONE_TIME" : "PER_MONTH";
        }
      }
      return next;
    });
  }

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">§</span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Catalog
        </span>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1
            className="font-display text-3xl md:text-5xl leading-none mb-2"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            Add-Ons
          </h1>
          <p className="font-display italic text-ink-mute text-base">
            Services and upgrades you offer to clients. Per-client pricing overrides
            live on each client&rsquo;s detail page.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          disabled={busy || editingId !== null}
          className="btn-dispatch disabled:opacity-50"
        >
          + New Add-On
        </button>
      </div>

      {editingId !== null && (
        <div className="border border-rule bg-parchment-warm/40 p-5 md:p-6 mb-8">
          <h2 className="font-display text-xl mb-4">
            {editingId === "new" ? "New add-on" : "Edit add-on"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Name
              </span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateForm("name", e.target.value)}
                maxLength={120}
                className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-display"
              />
            </label>

            <label className="block">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Display order
              </span>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => updateForm("sortOrder", e.target.value)}
                className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-mono"
              />
              <span className="block mt-1 font-mono text-[0.55rem] text-ink-mute leading-snug">
                Where this add-on appears in the client&rsquo;s catalog. Lower numbers
                first. Use spaced values (10, 20, 30…) so you can slot new add-ons
                between later.
              </span>
            </label>

            <label className="block md:col-span-2">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Description (visible to clients)
              </span>
              <textarea
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                rows={3}
                className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-display"
              />
            </label>

            <label className="block">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Kind
              </span>
              <select
                value={form.kind}
                onChange={(e) => updateForm("kind", e.target.value as AddOnKind)}
                className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-mono"
              >
                <option value="RECURRING">Recurring</option>
                <option value="ONE_TIME">One-time</option>
              </select>
            </label>

            <label className="block">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Scope
              </span>
              <select
                value={form.scope}
                onChange={(e) => updateForm("scope", e.target.value as AddOnScope)}
                className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-mono"
              >
                <option value="PER_SITE">Per site</option>
                <option value="PER_CLIENT">Per client account</option>
              </select>
            </label>

            <label className="block md:col-span-2">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Pricing style
              </span>
              <select
                value={form.priceType}
                onChange={(e) => updateForm("priceType", e.target.value as AddOnPriceType)}
                className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-mono"
              >
                <option value="FIXED">Fixed — single price (e.g. $500)</option>
                <option value="RANGE">Range — depends on scope (e.g. $500 – $1500)</option>
                <option value="PERCENTAGE">Percentage — modifier on a base (e.g. +25%)</option>
              </select>
            </label>

            {form.priceType !== "PERCENTAGE" && (
              <label className="block">
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                  {form.priceType === "RANGE" ? "Starting price (USD)" : "Price (USD)"}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.priceDollars}
                  onChange={(e) => updateForm("priceDollars", e.target.value)}
                  className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-mono"
                />
              </label>
            )}

            {form.priceType === "RANGE" && (
              <label className="block">
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                  Max price (USD)
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.priceMaxDollars}
                  onChange={(e) => updateForm("priceMaxDollars", e.target.value)}
                  className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-mono"
                />
              </label>
            )}

            {form.priceType === "PERCENTAGE" && (
              <label className="block md:col-span-2">
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                  Percent modifier
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.pricePercent}
                  onChange={(e) => updateForm("pricePercent", e.target.value)}
                  placeholder="e.g. 25 or +25"
                  className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-mono"
                />
                <span className="block mt-1 font-mono text-[0.55rem] text-ink-mute leading-snug">
                  Renders as &ldquo;+25%&rdquo; on the client side. Use a negative number
                  (e.g. -10) for a discount. The actual dollar amount is calculated
                  per-project at activation time.
                </span>
              </label>
            )}

            <label className="block">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Price unit
              </span>
              <select
                value={form.priceUnit}
                onChange={(e) => updateForm("priceUnit", e.target.value as AddOnPriceUnit)}
                className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-mono"
              >
                {form.kind === "RECURRING" ? (
                  <>
                    <option value="PER_MONTH">Per month</option>
                    <option value="PER_YEAR">Per year</option>
                  </>
                ) : form.priceType === "PERCENTAGE" ? (
                  <>
                    <option value="ON_TOTAL_BUILD">On total build</option>
                    <option value="ONE_TIME">One-time</option>
                  </>
                ) : (
                  <option value="ONE_TIME">One-time</option>
                )}
              </select>
            </label>

            <label className="block md:col-span-2">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Display label (optional)
              </span>
              <input
                type="text"
                maxLength={40}
                value={form.priceUnitLabel}
                onChange={(e) => updateForm("priceUnitLabel", e.target.value)}
                placeholder='e.g. "Per page", "Per form", "On total build fee"'
                className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-display"
              />
              <span className="block mt-1 font-mono text-[0.55rem] text-ink-mute leading-snug">
                Shown beside the price on catalog cards (e.g. &ldquo;$75 — Per page&rdquo;).
                Leave blank to use the default for the selected unit
                (&ldquo;One-time&rdquo;, &ldquo;Per month&rdquo;, &ldquo;On total build&rdquo;, etc.).
              </span>
            </label>
          </div>

          {error && (
            <p className="mt-4 text-sm text-signal-red font-mono">{error}</p>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="btn-dispatch disabled:opacity-50"
            >
              {editingId === "new" ? "Create" : "Save"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={busy}
              className="font-mono text-[0.7rem] uppercase tracking-widest text-ink-mute hover:text-ink transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {initialAddOns.length === 0 ? (
        <div className="border border-dashed border-rule px-6 py-12 text-center">
          <p className="font-display italic text-ink-mute">
            No add-ons yet. Click <strong>+ New Add-On</strong> to create your first one.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {initialAddOns.map((row) => (
            <AddOnCard
              key={row.id}
              row={row}
              isOpen={expandedIds.has(row.id)}
              onToggle={() => toggleExpand(row.id)}
              onEdit={() => startEdit(row)}
              onToggleActive={() => toggleActive(row)}
              onDelete={() => destroy(row)}
              editDisabled={busy || editingId !== null}
              busy={busy}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
