"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AddOnKind, AddOnScope, AddOnPriceUnit } from "@prisma/client";
import { formatCents, priceUnitSuffix } from "@/lib/add-ons/format";

type AddOnRow = {
  id: string;
  name: string;
  description: string;
  kind: AddOnKind;
  scope: AddOnScope;
  priceCents: number;
  priceUnit: AddOnPriceUnit;
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
  priceDollars: string;
  priceUnit: AddOnPriceUnit;
  sortOrder: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  kind: "RECURRING",
  scope: "PER_SITE",
  priceDollars: "",
  priceUnit: "PER_MONTH",
  sortOrder: "0",
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

export function AdminAddOnsClient({ initialAddOns }: { initialAddOns: AddOnRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      priceDollars: centsToDollars(row.priceCents),
      priceUnit: row.priceUnit,
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
    const cents = dollarsToCents(form.priceDollars);
    if (cents === null) {
      setError("Price must be a non-negative number.");
      return;
    }
    if (!form.name.trim() || !form.description.trim()) {
      setError("Name and description are required.");
      return;
    }
    if (form.kind === "RECURRING" && form.priceUnit === "ONE_TIME") {
      setError("Recurring add-ons must use per-month or per-year pricing.");
      return;
    }
    if (form.kind === "ONE_TIME" && form.priceUnit !== "ONE_TIME") {
      setError("One-time add-ons must use one-time pricing.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      kind: form.kind,
      scope: form.scope,
      priceCents: cents,
      priceUnit: form.priceUnit,
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
        if (value === "RECURRING" && next.priceUnit === "ONE_TIME") {
          next.priceUnit = "PER_MONTH";
        }
        if (value === "ONE_TIME") {
          next.priceUnit = "ONE_TIME";
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
                Sort order (lower first)
              </span>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => updateForm("sortOrder", e.target.value)}
                className="mt-1 w-full border border-rule bg-parchment px-3 py-2 font-mono"
              />
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

            <label className="block">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
                Price (USD)
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
                ) : (
                  <option value="ONE_TIME">One-time</option>
                )}
              </select>
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
        <div className="border border-rule">
          <table className="w-full text-sm">
            <thead className="bg-ink text-parchment-warm">
              <tr>
                <th className="text-left font-mono text-[0.6rem] uppercase tracking-widest px-3 py-2.5">Name</th>
                <th className="text-left font-mono text-[0.6rem] uppercase tracking-widest px-3 py-2.5">Kind</th>
                <th className="text-left font-mono text-[0.6rem] uppercase tracking-widest px-3 py-2.5">Scope</th>
                <th className="text-left font-mono text-[0.6rem] uppercase tracking-widest px-3 py-2.5">Price</th>
                <th className="text-left font-mono text-[0.6rem] uppercase tracking-widest px-3 py-2.5">Sort</th>
                <th className="text-left font-mono text-[0.6rem] uppercase tracking-widest px-3 py-2.5">Status</th>
                <th className="text-right font-mono text-[0.6rem] uppercase tracking-widest px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {initialAddOns.map((row) => (
                <tr
                  key={row.id}
                  className={`border-t border-rule ${row.isActive ? "" : "opacity-60"}`}
                >
                  <td className="px-3 py-3 font-display">
                    <div>{row.name}</div>
                    <div className="text-xs text-ink-mute mt-0.5 line-clamp-1">{row.description}</div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs uppercase tracking-widest">
                    {row.kind === "RECURRING" ? "Recurring" : "One-time"}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs uppercase tracking-widest">
                    {row.scope === "PER_SITE" ? "Per site" : "Per client"}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {formatCents(row.priceCents)}
                    <span className="text-ink-mute">{priceUnitSuffix(row.priceUnit)}</span>
                  </td>
                  <td className="px-3 py-3 font-mono">{row.sortOrder}</td>
                  <td className="px-3 py-3 font-mono text-xs uppercase tracking-widest">
                    {row.isActive ? (
                      <span className="text-signal-green">Active</span>
                    ) : (
                      <span className="text-ink-mute">Retired</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        disabled={busy || editingId !== null}
                        className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-ink"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(row)}
                        disabled={busy}
                        className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute hover:text-ink"
                      >
                        {row.isActive ? "Retire" : "Unretire"}
                      </button>
                      <button
                        type="button"
                        onClick={() => destroy(row)}
                        disabled={busy}
                        className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red hover:opacity-80"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
