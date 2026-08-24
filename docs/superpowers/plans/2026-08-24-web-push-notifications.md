# Web Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Web Push notifications to home-screen-installed devices for eight ticket lifecycle events — four outbound to clients, four inbound to the admin — using self-hosted VAPID.

**Architecture:** A new `push_subscriptions` table keyed on Supabase auth user id stores one row per device for both clients and admin. A service worker at `public/sw.js` receives push events. A new `lib/notify.ts` dispatcher exposes one function per lifecycle event, resolves recipients, and fans out to email (existing Resend helpers) and push (`lib/push.ts`, wrapping `web-push`). Every send is fired inside `after()` so it can never fail the originating request.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19.2.4, Prisma 5.22 → Supabase Postgres, `web-push` (new dependency), Resend (existing), Tailwind 3.4.

**Spec:** `docs/superpowers/specs/2026-08-24-web-push-notifications-design.md`

## Global Constraints

- **This project has NO test runner.** No `test` script in `package.json`; `scripts/test-availability.ts` and `scripts/test-vacation-helpers.ts` are standalone `tsx`-run scripts. Do **not** add Vitest/Jest — this feature is not the place to introduce a framework. Each task's verification is an explicit command or device check with stated expected output, in place of a red/green test cycle.
- **`DATABASE_URL` points at production Supabase.** There is no local database. Any `prisma db push` / `migrate` hits live data. Only the additive change in Task 1 is authorized.
- **Never read `.env` into terminal output.** It contains the live database password. Append to it with redirection; never `cat` it.
- **No AI attribution in commits.** No `Co-Authored-By` trailer, no "Generated with" lines.
- **Read `node_modules/next/dist/docs/` before using an unfamiliar Next.js API.** Per `AGENTS.md`, this Next.js differs from training data. The PWA guide is at `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`.
- **API routes, not Server Actions.** The Next PWA guide demonstrates Server Actions; this codebase uses API routes for every mutation. Follow the codebase.
- **Push sends must never throw to the caller.** `lib/push.ts` logs and returns; callers wrap in `after()`.
- **Design tokens** (from `account-client.tsx`): labels are `font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute`; accent is `signal-red`; borders are `border-rule` / `border-rule-soft`; prose is `font-display`.
- **VAPID keypair is permanent.** Every stored subscription is bound to the public key. Regenerating invalidates all subscriptions. Generate once, in Task 1, and never again.

---

### Task 1: Data model, dependency, and VAPID keys

**Files:**
- Modify: `prisma/schema.prisma` (append new model)
- Modify: `.env` (append, never read)
- Modify: `package.json` (via `npm install`)

**Interfaces:**
- Consumes: nothing
- Produces: Prisma model `PushSubscription` with fields `id, authUserId, isAdmin, endpoint, p256dh, auth, userAgent, createdAt, lastUsedAt`; env vars `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

- [ ] **Step 1: Install the dependency**

```bash
npm install web-push
npm install --save-dev @types/web-push
```

- [ ] **Step 2: Append the model to `prisma/schema.prisma`**

Add at the end of the file, after the `EmailChangeRequest` model:

```prisma
/// One row per device that has opted into Web Push. Keyed on the Supabase
/// auth user id rather than clientAccountId because the admin has no
/// ClientAccount row — this lets client and admin subscriptions share one
/// table and one code path. `isAdmin` is stamped at subscribe time from
/// isAdmin(user) so "push to the admin" needs no env var to stay in sync.
model PushSubscription {
  id         String    @id @default(cuid())
  authUserId String    @map("auth_user_id")
  isAdmin    Boolean   @default(false) @map("is_admin")
  endpoint   String    @unique @db.Text
  p256dh     String
  auth       String
  userAgent  String?   @map("user_agent")
  createdAt  DateTime  @default(now()) @map("created_at")
  lastUsedAt DateTime? @map("last_used_at")

  @@index([authUserId])
  @@index([isAdmin])
  @@map("push_subscriptions")
}
```

- [ ] **Step 3: Inspect the migration before applying it**

⚠️ This runs against production. Generate the SQL and read it before it executes:

```bash
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

Expected: a single `CREATE TABLE "push_subscriptions"` plus three `CREATE INDEX` / `CREATE UNIQUE INDEX` statements. **If the output contains any `ALTER TABLE`, `DROP`, or references any table other than `push_subscriptions`, STOP and report it — do not apply.**

- [ ] **Step 4: Apply the migration**

```bash
npx prisma db push
npx prisma generate
```

Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 5: Generate VAPID keys and write them to `.env` without printing them**

```bash
npx web-push generate-vapid-keys --json > /tmp/vapid.json
node -e "const v=require('/tmp/vapid.json');const fs=require('fs');fs.appendFileSync('.env','\nNEXT_PUBLIC_VAPID_PUBLIC_KEY='+v.publicKey+'\nVAPID_PRIVATE_KEY='+v.privateKey+'\nVAPID_SUBJECT=mailto:support@developerofcode.com\n')"
rm /tmp/vapid.json
```

- [ ] **Step 6: Verify the keys landed without revealing them**

```bash
grep -c "VAPID" .env
```

Expected: `3`. Do not `cat .env`.

- [ ] **Step 7: Verify the table exists**

```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.pushSubscription.count().then(c=>{console.log('push_subscriptions rows:',c);return p.\$disconnect()})"
```

Expected: `push_subscriptions rows: 0`

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma package.json package-lock.json
git commit -m "feat(push): add PushSubscription model and web-push dependency"
```

- [ ] **Step 9: Set the same three vars in Vercel**

```bash
vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production
vercel env add VAPID_PRIVATE_KEY production
vercel env add VAPID_SUBJECT production
```

Paste each value when prompted. Repeat for `preview`. Verify with `vercel env ls` (lists names only, not values).

---

### Task 2: Service worker and security headers

**Files:**
- Create: `public/sw.js`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a service worker at `/sw.js` handling `push` and `notificationclick`. Push payload contract, relied on by Task 5: `{ title: string, body: string, url: string, tag?: string }`.

- [ ] **Step 1: Create `public/sw.js`**

```js
// Dispatch push service worker.
// Scope is "/" so it covers both /portal and /admin. This worker exists ONLY
// to receive push events — there is deliberately no offline caching here.

self.addEventListener("push", function (event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    // A malformed payload should never take the worker down.
    return;
  }

  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Collapse repeat notifications for the same ticket instead of stacking.
    tag: data.tag || undefined,
    data: { url: data.url || "/portal" },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const target = event.notification.data && event.notification.data.url;
  if (!target) return;

  // Focus an already-open Dispatch window and navigate it, rather than
  // opening a duplicate tab on every tap.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (windowClients) {
        for (const client of windowClients) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
```

- [ ] **Step 2: Add headers to `next.config.ts`**

Replace the whole file:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            // Never serve a stale worker — otherwise a push handler fix
            // can sit uninstalled on a device indefinitely.
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 3: Start the dev server with HTTPS**

Web Push requires a secure context. Plain `npm run dev` will not work for this feature.

```bash
npx next dev --experimental-https
```

- [ ] **Step 4: Verify the worker is served with correct headers**

```bash
curl -kI https://localhost:3000/sw.js
```

Expected: `HTTP/1.1 200`, `content-type: application/javascript; charset=utf-8`, and `cache-control: no-cache, no-store, must-revalidate`.

- [ ] **Step 5: Verify the worker parses**

```bash
node --check public/sw.js && echo "sw.js parses"
```

Expected: `sw.js parses`

- [ ] **Step 6: Commit**

```bash
git add public/sw.js next.config.ts
git commit -m "feat(push): add service worker and sw.js security headers"
```

---

### Task 3: Subscribe and unsubscribe API routes

**Files:**
- Create: `app/api/push/subscribe/route.ts`

**Interfaces:**
- Consumes: `PushSubscription` model (Task 1); `getCurrentAuthUser`, `isAdmin` from `@/lib/auth/client-session`.
- Produces: `POST /api/push/subscribe` accepting `{ endpoint: string, keys: { p256dh: string, auth: string } }` → `{ ok: true }`; `DELETE /api/push/subscribe` accepting `{ endpoint: string }` → `{ ok: true }`. Both 401 when unauthenticated.

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAuthUser, isAdmin } from "@/lib/auth/client-session";

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function POST(req: Request) {
  const user = await getCurrentAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let payload: SubscribeBody;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const endpoint = payload.endpoint;
  const p256dh = payload.keys?.p256dh;
  const auth = payload.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "endpoint and keys.p256dh and keys.auth are required." },
      { status: 400 },
    );
  }

  // endpoint is the browser's identity for this subscription, so an upsert
  // makes re-subscribing on the same device idempotent. The owner is
  // rewritten on conflict so a shared device that changes hands doesn't keep
  // pushing the previous account's tickets to the new user.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh,
      auth,
      authUserId: user.id,
      isAdmin: isAdmin(user),
      userAgent: req.headers.get("user-agent"),
    },
    update: {
      p256dh,
      auth,
      authUserId: user.id,
      isAdmin: isAdmin(user),
      userAgent: req.headers.get("user-agent"),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let payload: { endpoint?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!payload.endpoint) {
    return NextResponse.json({ error: "endpoint is required." }, { status: 400 });
  }

  // Scoped to the caller so one account can never delete another's row.
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: payload.endpoint, authUserId: user.id },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify unauthenticated requests are rejected**

With the HTTPS dev server running:

```bash
curl -ks -o /dev/null -w "%{http_code}\n" -X POST https://localhost:3000/api/push/subscribe \
  -H 'content-type: application/json' -d '{"endpoint":"x","keys":{"p256dh":"a","auth":"b"}}'
```

Expected: `401`

- [ ] **Step 3: Verify the route typechecks**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/push/subscribe/route.ts
git commit -m "feat(push): add subscribe/unsubscribe API routes"
```

---

### Task 4: Notification toggle UI

**Files:**
- Create: `components/PushToggle.tsx`
- Modify: `app/portal/(authed)/account/account-client.tsx`
- Modify: `app/admin/account/account-form.tsx`

**Interfaces:**
- Consumes: `POST`/`DELETE /api/push/subscribe` (Task 3); `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Task 1); `/sw.js` (Task 2).
- Produces: `<PushToggle />`, a default-exported client component taking no props. This is the last task before a subscription row can exist.

- [ ] **Step 1: Create `components/PushToggle.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

// The VAPID public key arrives as base64url text but pushManager.subscribe
// requires raw bytes.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

type State =
  | "loading"
  | "unsupported"
  | "needs-install"
  | "denied"
  | "off"
  | "on";

export default function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!supported) {
        // iOS only exposes these APIs once the app is installed to the home
        // screen, so "unsupported on iOS" really means "not installed yet".
        const isIOS =
          /iPad|iPhone|iPod/.test(navigator.userAgent) &&
          !("MSStream" in window);
        setState(isIOS ? "needs-install" : "unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      const existing = await registration.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    }

    init().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      // Must be called from this click handler — iOS grants permission only
      // in response to a real user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Could not save subscription.");

      setState("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl">Notifications</h2>

      {state === "needs-install" && (
        <p className="font-display italic text-ink-mute text-sm">
          To get notifications on this device, tap the Share button and choose
          &ldquo;Add to Home Screen&rdquo;, then open Dispatch from your home
          screen and come back here.
        </p>
      )}

      {state === "unsupported" && (
        <p className="font-display italic text-ink-mute text-sm">
          This browser doesn&rsquo;t support push notifications.
        </p>
      )}

      {state === "denied" && (
        <p className="font-display italic text-ink-mute text-sm">
          Notifications are blocked for Dispatch. Re-enable them in your browser
          or device settings, then reload this page.
        </p>
      )}

      {(state === "on" || state === "off") && (
        <div className="flex items-center justify-between py-2 border-b border-rule-soft gap-3">
          <span className="font-display text-sm text-ink-soft">
            {state === "on"
              ? "Push notifications are on for this device."
              : "Get notified on this device when a ticket moves."}
          </span>
          <button
            type="button"
            onClick={state === "on" ? disable : enable}
            disabled={busy}
            className="px-3 py-2 border border-rule font-mono text-[0.6rem] uppercase tracking-widest text-ink-soft hover:border-signal-red hover:text-signal-red transition-colors disabled:opacity-50"
          >
            {busy ? "Working…" : state === "on" ? "Turn off" : "Turn on"}
          </button>
        </div>
      )}

      {error && (
        <p className="font-display text-sm text-signal-red">{error}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Mount it in the portal account page**

In `app/portal/(authed)/account/account-client.tsx`, add the import at the top of the file with the other imports:

```tsx
import PushToggle from "@/components/PushToggle";
```

Then inside the outer `<div className="max-w-2xl mx-auto px-5 md:px-10 py-8 md:py-12 space-y-12">` (line 193), add immediately before its closing `</div>`:

```tsx
      <div className="rule-thin" />
      <PushToggle />
```

- [ ] **Step 3: Mount it in the admin account page**

In `app/admin/account/account-form.tsx`, add the same import:

```tsx
import PushToggle from "@/components/PushToggle";
```

Then add `<PushToggle />` as the last child of the component's outermost wrapper element, preceded by `<div className="rule-thin" />` to match the section separators already used in that file.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify subscribing works end to end**

With `npx next dev --experimental-https` running, open `https://localhost:3000/portal/account` in Chrome, accept the certificate warning, and click **Turn on**. Accept the browser permission prompt. Then:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.pushSubscription.findMany({select:{authUserId:true,isAdmin:true,userAgent:true}}).then(r=>{console.log(r);return p.\$disconnect()})"
```

Expected: exactly one row, `isAdmin: false`, with your browser's user agent. Click **Turn off** and re-run — expected: `[]`.

- [ ] **Step 6: Commit**

```bash
git add components/PushToggle.tsx "app/portal/(authed)/account/account-client.tsx" app/admin/account/account-form.tsx
git commit -m "feat(push): add notification toggle to portal and admin account pages"
```

---

### Task 5: Push sending and self-pruning

**Files:**
- Create: `lib/push.ts`
- Create: `scripts/test-push.ts`

> **Import-style deviation, deliberate.** `lib/push.ts` imports Prisma **relatively** (`./prisma`) rather than with the `@/lib/prisma` alias used elsewhere in `lib/`. `scripts/test-push.ts` loads this module outside of Next, where the `@/*` tsconfig path mapping is not applied — the existing standalone scripts (`scripts/test-availability.ts`) use relative imports for exactly this reason. `lib/push.ts` also omits the `import "server-only"` guard that `lib/email.ts` carries, since that guard throws outside a React Server Component context and would break the script. Every consumer of `lib/push.ts` is a route handler or `lib/notify.ts`, both already server-side, and `lib/notify.ts` keeps its own `server-only` guard.

**Interfaces:**
- Consumes: `PushSubscription` model (Task 1); the `{ title, body, url, tag? }` payload contract (Task 2); at least one subscription row (Task 4).
- Produces:
  - `export interface PushPayload { title: string; body: string; url: string; tag?: string }`
  - `export async function sendPushToUser(authUserId: string, payload: PushPayload): Promise<void>`
  - `export async function sendPushToAdmins(payload: PushPayload): Promise<void>`
  - Neither ever throws.

- [ ] **Step 1: Create `lib/push.ts`**

```ts
import webpush from "web-push";
// Relative, not "@/lib/prisma": scripts/test-push.ts loads this module outside
// Next, where the @/* path alias is not resolved. See the note above.
import { prisma } from "./prisma";

export interface PushPayload {
  title: string;
  body: string;
  /** Path the notification opens on tap, e.g. "/portal/ticket/abc123". */
  url: string;
  /** Collapses repeat notifications for the same subject instead of stacking. */
  tag?: string;
}

// Lazy VAPID configuration, mirroring the Resend client in lib/email.ts —
// module evaluation must not blow up when env vars aren't present yet
// (e.g. a Vercel build running before env vars land).
let configured = false;
function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function deliver(subs: SubRow[], payload: PushPayload): Promise<void> {
  if (subs.length === 0) return;
  if (!configure()) {
    console.error("[push] VAPID env vars missing; skipping send.");
    return;
  }

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 mean the push service has permanently retired this
        // endpoint — app uninstalled, site data cleared, or (commonly on
        // iOS) the subscription expired. Drop the row so the table doesn't
        // fill with dead endpoints.
        if (status === 404 || status === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
          return;
        }
        console.error("[push] send failed:", status, err);
      }
    }),
  );
}

/** Push to every device belonging to one auth user. Never throws. */
export async function sendPushToUser(
  authUserId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const subs = await prisma.pushSubscription.findMany({
      where: { authUserId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    await deliver(subs, payload);
  } catch (err) {
    console.error("[push] sendPushToUser failed:", err);
  }
}

/** Push to every admin device. Never throws. */
export async function sendPushToAdmins(payload: PushPayload): Promise<void> {
  try {
    const subs = await prisma.pushSubscription.findMany({
      where: { isAdmin: true },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    await deliver(subs, payload);
  } catch (err) {
    console.error("[push] sendPushToAdmins failed:", err);
  }
}
```

- [ ] **Step 2: Create `scripts/test-push.ts`**

Follows the standalone-script convention of `scripts/test-availability.ts` — not a test-runner suite.

```ts
/**
 * Fires a test push at every subscription belonging to one auth user.
 *
 *   npx tsx --env-file=.env scripts/test-push.ts <authUserId>
 *
 * Find an authUserId with:
 *   npx tsx --env-file=.env scripts/test-push.ts --list
 */
import { prisma } from "../lib/prisma";
import { sendPushToUser } from "../lib/push";

async function main() {
  const arg = process.argv[2];

  if (!arg || arg === "--list") {
    const rows = await prisma.pushSubscription.findMany({
      select: { authUserId: true, isAdmin: true, userAgent: true },
    });
    console.log(rows.length === 0 ? "No subscriptions stored." : rows);
    return;
  }

  await sendPushToUser(arg, {
    title: "Dispatch test",
    body: "If you can see this, push notifications are working.",
    url: "/portal",
    tag: "dispatch-test",
  });
  console.log("Sent. Check the device.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Confirm the import chain loads outside Next**

The script imports `../lib/push`, which imports `./prisma` — both relative, so no `@/*` alias resolution is required. Verify before relying on it:

```bash
npx tsx --env-file=.env scripts/test-push.ts --list
```

Expected: either `No subscriptions stored.` or a table of rows. **If this fails with `Cannot find module '@/lib/prisma'`**, an alias import survived in `lib/push.ts` — change it to `./prisma`. **If it fails with a `server-only` error**, the `import "server-only"` line is still present in `lib/push.ts` and must be removed.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify a real push arrives**

Subscribe via the toggle (Task 4) if you unsubscribed, then:

```bash
npx tsx --env-file=.env scripts/test-push.ts --list
```

Copy the `authUserId`, then:

```bash
npx tsx --env-file=.env scripts/test-push.ts <authUserId>
```

Expected: `Sent. Check the device.` and a system notification reading "Dispatch test". Close the browser tab entirely and send again — the notification must still arrive, which is what proves the service worker path works.

- [ ] **Step 6: Verify pruning**

In Chrome, go to Settings → Privacy → Site Settings → Dispatch → Clear data (this kills the endpoint without telling the server). Then re-run the send, and:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.pushSubscription.count().then(c=>{console.log('rows:',c);return p.\$disconnect()})"
```

Expected: `rows: 0` — the dead endpoint pruned itself on the failed send.

- [ ] **Step 7: Commit**

```bash
git add lib/push.ts scripts/test-push.ts
git commit -m "feat(push): add push sender with dead-endpoint pruning and test script"
```

---

### Task 6: Notification dispatcher and client-facing status events

**Files:**
- Create: `lib/notify.ts`
- Modify: `app/api/admin/tickets/[id]/route.ts`

**Interfaces:**
- Consumes: `sendPushToUser`, `PushPayload` (Task 5); `sendAwaitingConfirmationEmail` from `@/lib/email`; `ticketNumber` from `@/lib/ticket`.
- Produces:
  - `export interface NotifyTicket { id: string; title: string; category: string; createdAt: Date; clientAccount: { authUserId: string; email: string; name: string }; site: { displayName: string } }`
  - `notifyTicketReviewing(ticket: NotifyTicket, appUrl: string): Promise<void>`
  - `notifyTicketFixing(ticket: NotifyTicket, appUrl: string): Promise<void>`
  - `notifyTicketFixed(ticket: NotifyTicket, appUrl: string): Promise<void>`
  - `notifyTicketViewed(ticket: NotifyTicket, appUrl: string): Promise<void>` (wired in Task 7)

- [ ] **Step 1: Create `lib/notify.ts`**

```ts
import "server-only";

import { sendPushToUser } from "@/lib/push";
import { sendAwaitingConfirmationEmail } from "@/lib/email";
import { ticketNumber } from "@/lib/ticket";

/**
 * The ticket shape every notifier needs. Callers select exactly this much —
 * keeping it explicit means a route can't accidentally pass a ticket that's
 * missing the client's authUserId, which would silently drop the push.
 */
export interface NotifyTicket {
  id: string;
  title: string;
  category: string;
  createdAt: Date;
  clientAccount: { authUserId: string; email: string; name: string };
  site: { displayName: string };
}

// Mirrors WORK_LABELS_BY_CATEGORY in components/StatusTimeline.tsx so a push
// reads the same as the stage the client sees on the timeline.
const WORK_LABELS: Record<
  string,
  { reviewing: string; working: string; done: string }
> = {
  BUG: { reviewing: "Reviewing Errors", working: "Fixing Errors", done: "Errors Fixed" },
  URGENT: { reviewing: "Reviewing Issue", working: "Fixing Issue", done: "Issue Resolved" },
  CONTENT: { reviewing: "Reviewing Changes", working: "Making Changes", done: "Changes Made" },
  UPDATE: { reviewing: "Reviewing Update(s)", working: "Making Update(s)", done: "Update(s) Complete" },
  FEATURE: { reviewing: "Reviewing Request", working: "Building Feature", done: "Feature Added" },
  QUESTION: { reviewing: "Reviewing Question", working: "Drafting Answer", done: "Answered" },
};
const DEFAULT_LABELS = WORK_LABELS.BUG;

function labels(category: string) {
  return WORK_LABELS[category] ?? DEFAULT_LABELS;
}

function clientTicketUrl(appUrl: string, ticketId: string) {
  return `${appUrl}/portal/ticket/${ticketId}`;
}

async function pushToClient(
  ticket: NotifyTicket,
  appUrl: string,
  body: string,
): Promise<void> {
  await sendPushToUser(ticket.clientAccount.authUserId, {
    title: ticketNumber(ticket.id, ticket.createdAt),
    body,
    url: clientTicketUrl(appUrl, ticket.id),
    // One live notification per ticket — a later stage replaces the earlier
    // one rather than stacking six entries in the tray.
    tag: `ticket-${ticket.id}`,
  });
}

export async function notifyTicketViewed(ticket: NotifyTicket, appUrl: string) {
  await pushToClient(ticket, appUrl, `We've seen it — ${ticket.title}`);
}

export async function notifyTicketReviewing(ticket: NotifyTicket, appUrl: string) {
  await pushToClient(ticket, appUrl, `${labels(ticket.category).reviewing} — ${ticket.title}`);
}

export async function notifyTicketFixing(ticket: NotifyTicket, appUrl: string) {
  await pushToClient(ticket, appUrl, `${labels(ticket.category).working} — ${ticket.title}`);
}

export async function notifyTicketFixed(ticket: NotifyTicket, appUrl: string) {
  await pushToClient(ticket, appUrl, `${labels(ticket.category).done} — ready for your review`);

  // Email keeps its own try/catch: a push failure must not swallow the email,
  // and vice versa.
  try {
    await sendAwaitingConfirmationEmail(ticket.clientAccount.email, {
      ticketNumber: ticketNumber(ticket.id, ticket.createdAt),
      ticketTitle: ticket.title,
      ticketUrl: clientTicketUrl(appUrl, ticket.id),
      siteDisplayName: ticket.site.displayName,
    });
  } catch (err) {
    console.error("[notify] awaiting-confirmation email failed:", err);
  }
}
```

- [ ] **Step 2: Rewire the admin PATCH route**

In `app/api/admin/tickets/[id]/route.ts`:

Replace the `sendAwaitingConfirmationEmail` import:

```ts
import {
  notifyTicketReviewing,
  notifyTicketFixing,
  notifyTicketFixed,
  type NotifyTicket,
} from "@/lib/notify";
```

Add below the existing `TIMESTAMP_FOR_STATUS` constant:

```ts
// Mirrors TIMESTAMP_FOR_STATUS above. A status with no entry notifies nobody,
// which keeps this total without a fallback branch.
const STATUS_NOTIFIER = {
  REVIEWING: notifyTicketReviewing,
  FIXING: notifyTicketFixing,
  AWAITING_CONFIRMATION: notifyTicketFixed,
} as const satisfies Partial<
  Record<string, (t: NotifyTicket, appUrl: string) => Promise<void>>
>;
```

Change the `prisma.ticket.findUnique` include block so the client's `authUserId` is selected:

```ts
    include: {
      site: { select: { url: true, displayName: true } },
      clientAccount: { select: { authUserId: true, email: true, name: true } },
    },
```

Then replace the entire `if (status === "AWAITING_CONFIRMATION") { ... }` block with:

```ts
  if (status !== undefined) {
    const notifier =
      STATUS_NOTIFIER[status as keyof typeof STATUS_NOTIFIER];
    if (notifier) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
      // after() so a slow push service never delays the admin's UI.
      after(() => notifier(ticket, appUrl));
    }
  }
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. If `ticket` does not satisfy `NotifyTicket`, the include block in the previous step was not applied correctly.

- [ ] **Step 4: Verify a status change pushes**

Subscribe as a client in one browser. In the admin panel, move that client's ticket to **Reviewing**.

Expected: a notification titled `DSP-YYYY-MM-DD-XXXX` with body `Reviewing Errors — <ticket title>` (wording varies by category). Tapping it opens `/portal/ticket/<id>`.

Repeat for **Fixing** and **Awaiting Confirmation**. On Awaiting Confirmation, confirm the existing email still arrives — that path must not have regressed.

- [ ] **Step 5: Commit**

```bash
git add lib/notify.ts "app/api/admin/tickets/[id]/route.ts"
git commit -m "feat(push): notify clients on every ticket status transition"
```

---

### Task 7: Wire up the dead `firstViewedAt` stage

**Files:**
- Modify: `app/api/admin/tickets/[id]/mark-read/route.ts`

**Interfaces:**
- Consumes: `notifyTicketViewed`, `NotifyTicket` (Task 6).
- Produces: `firstViewedAt` is written exactly once per ticket, the first time the admin reads it.

- [ ] **Step 1: Understand what is broken**

`firstViewedAt` exists in `prisma/schema.prisma` and is rendered as stage 3 ("Viewed") by `components/StatusTimeline.tsx`, but **nothing has ever written it** — confirm with:

```bash
grep -rn "firstViewedAt" app lib --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Expected before this task: only reads in `StatusTimeline.tsx` and page components, no writes. The stage is dark for every ticket in production.

- [ ] **Step 2: Add the write and the notification**

In `app/api/admin/tickets/[id]/mark-read/route.ts`, add imports:

```ts
import { after } from "next/server";
import { notifyTicketViewed } from "@/lib/notify";
```

Replace the `prisma.ticket.findUnique` call with one that pulls what the notifier needs:

```ts
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      title: true,
      category: true,
      createdAt: true,
      firstViewedAt: true,
      clientAccount: { select: { authUserId: true, email: true, name: true } },
      site: { select: { displayName: true } },
    },
  });
```

Then, after the existing `prisma.message.updateMany` call and before the `NextResponse.json` return, add:

```ts
  // Stage 3 of the timeline. The `firstViewedAt: null` guard makes this
  // write-once — count tells us whether this was genuinely the first view,
  // so re-opening a ticket never re-notifies.
  if (!ticket.firstViewedAt) {
    const firstView = await prisma.ticket.updateMany({
      where: { id: ticketId, firstViewedAt: null },
      data: { firstViewedAt: new Date() },
    });
    if (firstView.count === 1) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
      after(() => notifyTicketViewed(ticket, appUrl));
    }
  }
```

Change the handler signature from `_req: Request` to `req: Request` so `req.url` is available.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify write-once behavior**

Open a ticket in the admin panel that has never been opened. Then:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.ticket.findMany({where:{firstViewedAt:{not:null}},select:{id:true,firstViewedAt:true}}).then(r=>{console.log(r);return p.\$disconnect()})"
```

Expected: that ticket now has a `firstViewedAt`. The client device receives one "We've seen it" push. Reload the admin ticket page twice more and confirm **no further notifications arrive** and the timestamp is unchanged.

- [ ] **Step 5: Confirm the accepted quick-chat nuance**

`app/admin/admin-quick-chat-launcher.tsx` also POSTs to this route, so reading a client's message in quick chat also marks the ticket Viewed. This was reviewed and accepted during design — it is correct behavior, not a bug. No code change; this step is a confirmation that the behavior is understood.

- [ ] **Step 6: Commit**

```bash
git add "app/api/admin/tickets/[id]/mark-read/route.ts"
git commit -m "feat(push): set firstViewedAt on first admin read and notify client"
```

---

### Task 8: Admin-direction events

**Files:**
- Modify: `lib/notify.ts`
- Modify: `app/api/portal/tickets/[id]/confirm/route.ts`
- Modify: `app/api/portal/tickets/[id]/reopen/route.ts`
- Modify: `app/api/portal/tickets/route.ts`
- Modify: `app/api/portal/tickets/[id]/messages/route.ts`

**Interfaces:**
- Consumes: `sendPushToAdmins` (Task 5); existing `sendNewTicketEmail`, `sendNewMessageToAdminEmail`, `sendTicketReopenedEmail` from `@/lib/email`.
- Produces:
  - `notifyAdminTicketClosed(ticket: NotifyTicket, appUrl: string): Promise<void>`
  - `notifyAdminTicketReopened(ticket: NotifyTicket, appUrl: string): Promise<void>`
  - `notifyAdminNewTicket(ticket: NotifyTicket, appUrl: string, extra: NewTicketExtra): Promise<void>`
  - `notifyAdminNewMessage(ticket: NotifyTicket, appUrl: string, messageBody: string): Promise<void>`

- [ ] **Step 1: Append admin notifiers to `lib/notify.ts`**

Extend the import from `@/lib/push` to `import { sendPushToUser, sendPushToAdmins } from "@/lib/push";` and the import from `@/lib/email` to include `sendNewTicketEmail`, `sendNewMessageToAdminEmail`, `sendTicketReopenedEmail`. Then append:

```ts
function adminTicketUrl(appUrl: string, ticketId: string) {
  return `${appUrl}/admin/ticket/${ticketId}`;
}

/** ADMIN_EMAIL resolved once, here, instead of in every route. */
function adminEmail(): string | null {
  return process.env.ADMIN_EMAIL ?? null;
}

export interface NewTicketExtra {
  clientEmail: string;
  siteUrl: string;
  description: string;
  isEmergency: boolean;
  emergencyFeeAmountCents: number | null;
}

/** Client confirmed the fix. Push only — no email exists for this event. */
export async function notifyAdminTicketClosed(ticket: NotifyTicket, appUrl: string) {
  await sendPushToAdmins({
    title: `Closed — ${ticketNumber(ticket.id, ticket.createdAt)}`,
    body: `${ticket.clientAccount.name} confirmed: ${ticket.title}`,
    url: adminTicketUrl(appUrl, ticket.id),
    tag: `admin-ticket-${ticket.id}`,
  });
}

export async function notifyAdminTicketReopened(ticket: NotifyTicket, appUrl: string) {
  await sendPushToAdmins({
    title: `Reopened — ${ticketNumber(ticket.id, ticket.createdAt)}`,
    body: `${ticket.clientAccount.name} kicked it back: ${ticket.title}`,
    url: adminTicketUrl(appUrl, ticket.id),
    tag: `admin-ticket-${ticket.id}`,
  });

  const to = adminEmail();
  if (!to) return;
  try {
    await sendTicketReopenedEmail(to, {
      ticketNumber: ticketNumber(ticket.id, ticket.createdAt),
      ticketTitle: ticket.title,
      ticketUrl: adminTicketUrl(appUrl, ticket.id),
      clientName: ticket.clientAccount.name,
      siteDisplayName: ticket.site.displayName,
    });
  } catch (err) {
    console.error("[notify] reopened email failed:", err);
  }
}

export async function notifyAdminNewTicket(
  ticket: NotifyTicket,
  appUrl: string,
  extra: NewTicketExtra,
) {
  await sendPushToAdmins({
    title: extra.isEmergency
      ? `EMERGENCY — ${ticketNumber(ticket.id, ticket.createdAt)}`
      : `New ticket — ${ticketNumber(ticket.id, ticket.createdAt)}`,
    body: `${ticket.clientAccount.name}: ${ticket.title}`,
    url: adminTicketUrl(appUrl, ticket.id),
    tag: `admin-ticket-${ticket.id}`,
  });

  const to = adminEmail();
  if (!to) return;
  try {
    await sendNewTicketEmail(to, {
      ticketNumber: ticketNumber(ticket.id, ticket.createdAt),
      ticketTitle: ticket.title,
      ticketUrl: adminTicketUrl(appUrl, ticket.id),
      category: ticket.category,
      clientName: ticket.clientAccount.name,
      clientEmail: extra.clientEmail,
      siteDisplayName: ticket.site.displayName,
      siteUrl: extra.siteUrl,
      description: extra.description,
      isEmergency: extra.isEmergency,
      emergencyFeeAmountCents: extra.emergencyFeeAmountCents,
    });
  } catch (err) {
    console.error("[notify] new-ticket email failed:", err);
  }
}

export async function notifyAdminNewMessage(
  ticket: NotifyTicket,
  appUrl: string,
  messageBody: string,
) {
  await sendPushToAdmins({
    title: `Reply — ${ticketNumber(ticket.id, ticket.createdAt)}`,
    body: `${ticket.clientAccount.name}: ${messageBody}`,
    url: adminTicketUrl(appUrl, ticket.id),
    tag: `admin-ticket-${ticket.id}`,
  });

  const to = adminEmail();
  if (!to) return;
  try {
    // Note: sendNewMessageToAdminEmail applies its own 60-second per-ticket
    // debounce internally (see lib/email.ts). Push is deliberately NOT
    // debounced — a tray notification collapses by tag instead.
    await sendNewMessageToAdminEmail(to, ticket.id, {
      ticketNumber: ticketNumber(ticket.id, ticket.createdAt),
      ticketTitle: ticket.title,
      ticketUrl: adminTicketUrl(appUrl, ticket.id),
      clientName: ticket.clientAccount.name,
      siteDisplayName: ticket.site.displayName,
      messageBody,
    });
  } catch (err) {
    console.error("[notify] new-message email failed:", err);
  }
}
```

- [ ] **Step 2: Wire `confirm/route.ts`**

Add imports:

```ts
import { notifyAdminTicketClosed } from "@/lib/notify";
```

Change the `findFirst` select to pull the notifier's fields:

```ts
    select: {
      id: true,
      status: true,
      title: true,
      category: true,
      createdAt: true,
      clientAccount: { select: { authUserId: true, email: true, name: true } },
      site: { select: { displayName: true } },
    },
```

Change the handler signature from `_req: Request` to `req: Request`. After the existing `after(() => updateNotionTicketStatus(...))` line, add:

```ts
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  after(() => notifyAdminTicketClosed(ticket, appUrl));
```

- [ ] **Step 3: Wire `reopen/route.ts`**

Replace the `sendTicketReopenedEmail` import with:

```ts
import { notifyAdminTicketReopened } from "@/lib/notify";
```

Change the `findFirst` `include` to:

```ts
    select: {
      id: true,
      status: true,
      title: true,
      category: true,
      createdAt: true,
      clientAccount: { select: { authUserId: true, email: true, name: true } },
      site: { select: { displayName: true } },
    },
```

Delete the entire `const adminEmail = process.env.ADMIN_EMAIL; if (adminEmail) { ... }` block including its `try/catch`, and replace with:

```ts
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  after(() => notifyAdminTicketReopened(ticket, appUrl));
```

Remove the now-unused `ticketNumber` import if nothing else in the file uses it.

- [ ] **Step 4: Wire `tickets/route.ts` (new ticket)**

Replace the `sendNewTicketEmail` import with:

```ts
import { notifyAdminNewTicket } from "@/lib/notify";
```

Delete the whole `if (adminEmail) { try { await sendNewTicketEmail(...) } catch {...} }` block — but **keep** the `const appUrl = ...` line above it, since the Notion `after()` call below still uses it. Replace the deleted block with:

```ts
  after(() =>
    notifyAdminNewTicket(
      {
        id: ticket.id,
        title: ticket.title,
        category: ticket.category,
        createdAt: ticket.createdAt,
        clientAccount: {
          authUserId: account.authUserId,
          email: account.email,
          name: account.name,
        },
        site: { displayName: site.displayName },
      },
      appUrl,
      {
        clientEmail: account.email,
        siteUrl: site.url,
        description: ticket.description,
        isEmergency: ticket.isEmergency,
        emergencyFeeAmountCents: ticket.emergencyFeeAmountCents,
      },
    ),
  );
```

Also delete the now-unused `const adminEmail = process.env.ADMIN_EMAIL;` line and the `ticketNumber` import if unused elsewhere in the file.

- [ ] **Step 5: Wire `messages/route.ts`**

Replace the `sendNewMessageToAdminEmail` import with:

```ts
import { notifyAdminNewMessage } from "@/lib/notify";
```

Ensure the `ticket` lookup earlier in the file selects `id`, `title`, `category`, `createdAt`, `isInquiry`, `clientAccount: { select: { authUserId: true, email: true, name: true } }`, and `site: { select: { displayName: true } }`.

Replace the whole `if (!ticket.isInquiry) { const adminEmail = ... }` block with:

```ts
  // Tickets only. Inquiries notify via the end-of-chat transcript and the
  // 1-hour admin-nudge cron — no per-message noise. This guard is load-bearing.
  if (!ticket.isInquiry) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    after(() =>
      notifyAdminNewMessage(ticket, appUrl, body ?? "(attachment)"),
    );
  }
```

Add `after` to the `next/server` import if not already present.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Verify no stray inline admin-email blocks remain in ticket routes**

```bash
grep -rn "ADMIN_EMAIL" app/api/portal/tickets app/api/admin/tickets
```

Expected: **no output.** All four ticket routes now go through the dispatcher. (`signup`, `add-ons/request`, and `invites/[token]/merge` intentionally keep theirs — out of scope per the spec.)

- [ ] **Step 8: Verify all four admin events**

Subscribe as admin (toggle on `/admin/account`), then as a client in a second browser:

1. File a new ticket → admin push `New ticket — DSP-…` **and** the existing email.
2. Send a message on that ticket → admin push `Reply — DSP-…` **and** the email.
3. As admin move it to Awaiting Confirmation, then as client tap Confirm → admin push `Closed — DSP-…` (no email — correct, none exists).
4. Repeat and tap Reopen instead → admin push `Reopened — DSP-…` **and** the email.

Then verify the inquiry guard still holds: open a quick-chat inquiry as a client, send a message, and confirm **no** admin push or email fires for it.

- [ ] **Step 9: Commit**

```bash
git add lib/notify.ts app/api/portal/tickets
git commit -m "feat(push): notify admin on new ticket, reply, close, and reopen"
```

---

### Task 9: Device verification and deploy

**Files:** none modified — this task is verification only.

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: a verified production deployment.

- [ ] **Step 1: Full typecheck and lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: both clean.

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: build succeeds. Confirm `/api/push/subscribe` appears in the route list.

- [ ] **Step 3: Confirm Vercel env vars are set before deploying**

```bash
vercel env ls | grep VAPID
```

Expected: three entries for both Production and Preview. **If they are missing, the toggle will throw at runtime for every user** — set them before deploying.

- [ ] **Step 4: Deploy**

```bash
git push
```

Wait for the Vercel deployment to reach state `READY` — a green GitHub Action with a `BLOCKED` deployment is a failure, not a success.

- [ ] **Step 5: iPhone verification**

On a real iPhone (iOS 16.4+), in Safari: open the production URL → Share → **Add to Home Screen**. Open Dispatch **from the home screen icon**, not Safari. Go to Account and turn notifications on.

Verify:
- The toggle shows a working on/off control (not the "Add to Home Screen" hint).
- Close the app entirely (swipe up from the app switcher).
- From another device, move one of that client's tickets to Fixing.
- A notification arrives on the locked phone.
- Tapping it opens Dispatch directly to that ticket.

- [ ] **Step 6: Verify the iOS not-installed state**

In iOS **Safari** (not the home screen app), open `/portal/account`. Expected: the Add-to-Home-Screen instructions, not a dead toggle.

- [ ] **Step 7: Android verification**

Repeat Step 5 in Chrome on Android. Push works there without installing, but install it anyway to confirm both paths.

- [ ] **Step 8: Verify the subscription table is sane**

```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.pushSubscription.findMany({select:{authUserId:true,isAdmin:true,lastUsedAt:true,userAgent:true}}).then(r=>{console.table(r);return p.\$disconnect()})"
```

Expected: one row per device that opted in; `isAdmin: true` only for your own devices; `lastUsedAt` populated for any that have received a push.

- [ ] **Step 9: Update the QA checklist**

Add a "Push notifications" section to `docs/qa-checklist.md` covering: subscribe, receive while closed, deep link on tap, unsubscribe, and the iOS-not-installed state.

- [ ] **Step 10: Commit**

```bash
git add docs/qa-checklist.md
git commit -m "docs: add push notification QA steps"
git push
```

---

## Post-Implementation Notes

- **Do not regenerate VAPID keys.** Every stored subscription is bound to the public key; regenerating silently breaks push for everyone and forces re-subscription with no error message.
- **Email remains the reliable channel.** iOS expires push subscriptions when an app goes unopened for extended periods. The pruning in `lib/push.ts` handles this cleanly, but it means a client can silently stop receiving pushes. Never remove an email in favor of a push.
- **Deferred, easy follow-ons now that the dispatcher exists:** push for admin replies to clients (`sendNewMessageToClientEmail` currently email-only), and migrating the three remaining inline `ADMIN_EMAIL` sites (`signup`, `add-ons/request`, `invites/[token]/merge`) into `lib/notify.ts`.
