"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginPage } from "@/components/LoginPage";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleSubmit({ email, password }: { email: string; password: string }) {
    setError(undefined);
    const res = await fetch("/api/portal/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Sign-in failed. Try again.");
      return;
    }

    const body = (await res.json()) as { redirect: string };
    const target = params.get("from") ?? body.redirect;
    router.push(target);
    router.refresh();
  }

  return <LoginPage onSubmit={handleSubmit} error={error} />;
}
