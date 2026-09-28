"use client";

import { useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const res = await fetch("/api/portal/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Something went wrong. Try again.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div
        role="status"
        className="border border-signal-green/25 bg-signal-green/5 px-4 py-4 rounded-xl"
      >
        <p className="font-mono text-xs text-signal-green mb-1">
          Wired
        </p>
        <p className="font-display text-ink-soft">
          If <span className="font-mono text-sm">{email}</span> is on file, a reset link
          is on its way.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <div>
        <label
          htmlFor="email"
          className="block font-mono text-[0.8125rem] text-ink-mute mb-1"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourbusiness.com"
          required
          autoComplete="email"
          className="input-line"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="border border-signal-red/20 bg-signal-red/5 px-4 py-3 font-mono text-xs text-signal-redDeep rounded-xl"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-end pt-2">
        <button type="submit" disabled={submitting} className="btn-dispatch">
          {submitting ? "Wiring…" : "Send reset link →"}
        </button>
      </div>
    </form>
  );
}
