"use client";

import { useState } from "react";
import { AuthLayout } from "./AuthLayout";

export interface LoginPageProps {
  /** Hook for the demo to receive submitted values; in production this calls /api/portal/auth/login */
  onSubmit?: (data: { email: string; password: string }) => void | Promise<void>;
  /** Server error to display (e.g., "Invalid credentials") */
  error?: string;
}

export function LoginPage({ onSubmit, error }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({ email, password });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={
        <>
          Sign in to file
          <br />
          a new dispatch.
        </>
      }
      intro={
        <>
          Use the credentials sent with your invitation. New here?
          <br className="hidden lg:inline" />
          Look for an invite link in your inbox.
        </>
      }
      footer={
        <p className="font-mono text-[0.8125rem] text-ink-mute leading-relaxed">
          Developer of Code, LLC ── Support Desk
          <br />
          No public submissions. Invite only.
        </p>
      }
    >
      {/* Form */}
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

        <div>
          <label
            htmlFor="password"
            className="block font-mono text-[0.8125rem] text-ink-mute mb-1"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
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

        <div className="flex items-center justify-between gap-4 pt-2">
          <a
            href="/portal/forgot-password"
            className="font-mono text-[0.8125rem] text-ink-mute hover:text-accent transition-colors underline-offset-4 hover:underline"
          >
            Forgot password?
          </a>

          <button type="submit" disabled={submitting} className="btn-dispatch">
            {submitting ? "Signing in…" : "Sign in →"}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
