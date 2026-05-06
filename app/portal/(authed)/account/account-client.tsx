"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccountClient({
  name: initialName,
  email,
}: {
  name: string;
  email: string;
}) {
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameSaving(true);
    setNameMsg(null);
    const res = await fetch("/api/portal/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setNameSaving(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setNameMsg({ kind: "err", text: body.error ?? "Could not save." });
      return;
    }
    setNameMsg({ kind: "ok", text: "Saved." });
    router.refresh();
  }

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMsg(null);

    if (newPwd.length < 12) {
      setPwdMsg({ kind: "err", text: "New password must be at least 12 characters." });
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg({ kind: "err", text: "New passwords don’t match." });
      return;
    }

    setPwdSaving(true);
    const res = await fetch("/api/portal/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
    });
    setPwdSaving(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setPwdMsg({ kind: "err", text: body.error ?? "Could not change password." });
      return;
    }
    setPwdMsg({ kind: "ok", text: "Password updated." });
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
  }

  return (
    <div className="max-w-2xl mx-auto px-5 md:px-10 py-8 md:py-12 space-y-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
            §
          </span>
          <span className="h-px flex-1 bg-rule" />
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
            Account
          </span>
        </div>
        <h1
          className="font-display text-3xl md:text-5xl leading-none mb-3"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          Your record
        </h1>
        <p className="font-display italic text-ink-mute">
          Email is set by your invitation and can&rsquo;t be changed here. Contact{" "}
          <a href="mailto:hello@developerofcode.com" className="text-signal-red hover:underline">
            hello@developerofcode.com
          </a>{" "}
          if you need it updated.
        </p>
      </div>

      {/* Name + email */}
      <form onSubmit={onSaveName} className="space-y-7">
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1">
            Email
          </label>
          <div className="font-mono text-sm text-ink-soft py-2 border-b border-rule-soft">
            {email}
          </div>
        </div>

        <div>
          <label
            htmlFor="name"
            className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1"
          >
            Display name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input-line"
          />
        </div>

        {nameMsg && (
          <div
            role={nameMsg.kind === "err" ? "alert" : "status"}
            className={`border-l-[3px] px-4 py-3 font-mono text-xs uppercase tracking-wider ${
              nameMsg.kind === "err"
                ? "border-signal-red bg-signal-red/5 text-signal-redDeep"
                : "border-signal-green bg-signal-green/5 text-signal-green"
            }`}
          >
            {nameMsg.text}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={nameSaving || name.trim() === initialName}
            className="btn-dispatch"
          >
            {nameSaving ? "Filing…" : "Save name"}
          </button>
        </div>
      </form>

      {/* Password */}
      <div className="rule-thin" />

      <form onSubmit={onChangePassword} className="space-y-7">
        <h2
          className="font-display text-2xl"
          style={{ fontVariationSettings: '"opsz" 96' }}
        >
          Change password
        </h2>

        <div>
          <label
            htmlFor="currentPwd"
            className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1"
          >
            Current password
          </label>
          <input
            id="currentPwd"
            type="password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            autoComplete="current-password"
            required
            className="input-line"
          />
        </div>

        <div>
          <label
            htmlFor="newPwd"
            className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1"
          >
            New password (12+ characters)
          </label>
          <input
            id="newPwd"
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            autoComplete="new-password"
            minLength={12}
            required
            className="input-line"
          />
        </div>

        <div>
          <label
            htmlFor="confirmPwd"
            className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-1"
          >
            Confirm new password
          </label>
          <input
            id="confirmPwd"
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            autoComplete="new-password"
            minLength={12}
            required
            className="input-line"
          />
        </div>

        {pwdMsg && (
          <div
            role={pwdMsg.kind === "err" ? "alert" : "status"}
            className={`border-l-[3px] px-4 py-3 font-mono text-xs uppercase tracking-wider ${
              pwdMsg.kind === "err"
                ? "border-signal-red bg-signal-red/5 text-signal-redDeep"
                : "border-signal-green bg-signal-green/5 text-signal-green"
            }`}
          >
            {pwdMsg.text}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={pwdSaving} className="btn-dispatch">
            {pwdSaving ? "Filing…" : "Update password"}
          </button>
        </div>
      </form>
    </div>
  );
}
