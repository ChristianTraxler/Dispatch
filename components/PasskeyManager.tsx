"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Passkey = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

const BUTTON =
  "px-3 py-2 border border-rule font-mono text-[0.8125rem] text-ink-soft hover:border-accent hover:text-accent transition-colors disabled:opacity-50 rounded-full whitespace-nowrap shrink-0";

function fmt(iso: string) {
  // Pinned to UTC so server and client render the same text (hydration).
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function messageFor(err: { name?: string; message?: string } | null) {
  if (!err) return "Something went wrong.";
  if (err.name === "WebAuthnError" || /abort|cancel|not allowed/i.test(err.message ?? "")) {
    return "Passkey setup was cancelled.";
  }
  return err.message || "Something went wrong.";
}

/** Add, rename and remove passkeys for the signed-in user. */
export default function PasskeyManager() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: listError } = await getSupabaseBrowserClient().auth.passkey.list();
    if (listError) setError(messageFor(listError));
    else setPasskeys(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      const ok = "PublicKeyCredential" in window;
      setSupported(ok);
      if (ok) await load();
      else setLoading(false);
    }
    void init();
  }, [load]);

  async function add() {
    setBusy(true);
    setError(null);
    const { error: regError } = await getSupabaseBrowserClient().auth.registerPasskey();
    if (regError) setError(messageFor(regError));
    else await load();
    setBusy(false);
  }

  async function rename(p: Passkey) {
    const next = window.prompt("Name this passkey", p.friendly_name ?? "")?.trim();
    if (!next || next === p.friendly_name) return;
    setBusy(true);
    setError(null);
    const { error: upError } = await getSupabaseBrowserClient().auth.passkey.update({
      passkeyId: p.id,
      friendlyName: next.slice(0, 120),
    });
    if (upError) setError(messageFor(upError));
    else await load();
    setBusy(false);
  }

  async function remove(p: Passkey) {
    if (!window.confirm(`Remove "${p.friendly_name || "this passkey"}"? You will no longer be able to sign in with it.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const { error: delError } = await getSupabaseBrowserClient().auth.passkey.delete({
      passkeyId: p.id,
    });
    if (delError) setError(messageFor(delError));
    else await load();
    setBusy(false);
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl">Passkeys</h2>

      {supported === false && (
        <p className="font-display italic text-ink-mute text-sm">
          This browser doesn&rsquo;t support passkeys.
        </p>
      )}

      {supported && (
        <>
          <div className="flex items-center justify-between py-2 border-b border-rule-soft gap-3">
            <span className="font-display text-sm text-ink-soft">
              Sign in with Face ID, Touch ID or a security key instead of a password.
            </span>
            <button type="button" onClick={add} disabled={busy} className={BUTTON}>
              {busy ? "Working…" : "Add a passkey"}
            </button>
          </div>

          {!loading && passkeys.length === 0 && !error && (
            <p className="font-display italic text-ink-mute text-sm">No passkeys yet.</p>
          )}

          <ul>
            {passkeys.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between py-2 border-b border-rule-soft gap-3"
              >
                <div className="min-w-0">
                  <div className="font-display text-sm text-ink-soft truncate">
                    {p.friendly_name || "Unnamed passkey"}
                  </div>
                  <div className="font-mono text-[0.75rem] text-ink-mute">
                    Added {fmt(p.created_at)}
                    {p.last_used_at ? ` · last used ${fmt(p.last_used_at)}` : ""}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => rename(p)} disabled={busy} className={BUTTON}>
                    Rename
                  </button>
                  <button type="button" onClick={() => remove(p)} disabled={busy} className={BUTTON}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <p className="font-display text-sm text-signal-red">{error}</p>}
    </section>
  );
}
