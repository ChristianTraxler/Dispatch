"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/portal/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not reset password. Try requesting a new link.");
      return;
    }

    router.push("/portal/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <div>
        <label
          htmlFor="password"
          className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1"
        >
          New password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••••"
          required
          minLength={12}
          autoComplete="new-password"
          className="input-line"
        />
      </div>

      <div>
        <label
          htmlFor="confirm"
          className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1"
        >
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••••••"
          required
          minLength={12}
          autoComplete="new-password"
          className="input-line"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="border-l-[3px] border-signal-red bg-signal-red/5 px-4 py-3 font-mono text-xs uppercase tracking-wider text-signal-redDeep"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-end pt-2">
        <button type="submit" disabled={submitting} className="btn-dispatch">
          {submitting ? "Filing…" : "Set password →"}
        </button>
      </div>
    </form>
  );
}
