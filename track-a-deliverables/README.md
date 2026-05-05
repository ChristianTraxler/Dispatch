# Dispatch Portal — Track A Components (Complete)

Drop-in React/TypeScript components and email templates for the full Dispatch
client portal + admin portal + email notifications.

## File map

```
components/
├── PresenceDot.tsx                ── Sonar-pulse online/offline indicator
├── StatusPill.tsx                 ── Monospaced status badge
├── StatusTimeline.tsx             ── 6-stage progress (responsive)
├── ChatThread.tsx                 ── Message thread + composer (Realtime-ready)
├── AttachmentDropzone.tsx         ── Drag/drop file uploader
├── Toast.tsx                      ── Provider + container + useToast hook
├── Masthead.tsx                   ── Newsroom header with auto-dateline
├── EmailPreview.tsx               ── (Dev tool) wraps email HTML in inbox chrome
├── LoginPage.tsx                  ── Portal entry
├── InviteRedemption.tsx           ── All 5 invite states in one component
├── PortalShell.tsx                ── Client portal layout
├── DashboardPage.tsx              ── Client ticket list
├── NewTicketPage.tsx              ── Submit form
├── TicketDetailPage.tsx           ── Centerpiece (timeline + chat + actions)
├── SitesPage.tsx                  ── Client site list
├── AdminShell.tsx                 ── Admin layout (dark sub-nav)
├── AdminInvitesPage.tsx           ── Invite list + filters
├── AdminInviteNewPage.tsx         ── Create-invite form
└── AdminClientsPage.tsx           ── Client list with presence + sites

lib/
└── email-templates.ts             ── 6 email templates (HTML + text + subject)

styles/
├── dispatch-tokens.css            ── Design tokens, sonar pulse keyframes
└── tailwind.config.js             ── Extended Tailwind config
```

## Drop-in for your Next.js Dispatch repo

1. Copy `components/*.tsx` → `components/`
2. Copy `lib/email-templates.ts` → `lib/`
3. Merge `styles/dispatch-tokens.css` into your global CSS
4. Merge `styles/tailwind.config.js` additions into your existing Tailwind config

## Email templates — wiring with Resend

Each function returns `{ subject, html, text }`. Drop in alongside your existing `lib/email.ts`:

```ts
import { Resend } from 'resend';
import {
  renderInviteEmail,
  renderNewTicketEmail,
  renderNewMessageToAdminEmail,
  renderNewMessageToClientEmail,
  renderAwaitingConfirmationEmail,
  renderTicketReopenedEmail,
} from '@/lib/email-templates';

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendInviteEmail(params: InviteEmailParams) {
  const { subject, html, text } = renderInviteEmail(params);
  return resend.emails.send({
    from: process.env.RESEND_FROM!,
    to: params.email,
    subject,
    html,
    text,
  });
}

// Repeat for the other 5 templates. Each fires from the appropriate trigger:
//   renderNewTicketEmail        → POST /api/portal/tickets
//   renderNewMessageToAdminEmail → POST /api/portal/tickets/[id]/messages
//   renderNewMessageToClientEmail → POST /api/admin/tickets/[id]/messages
//   renderAwaitingConfirmationEmail → PATCH /api/admin/tickets/[id]/status (when status → AWAITING_CONFIRMATION)
//   renderTicketReopenedEmail   → POST /api/portal/tickets/[id]/reopen
```

## Page-level usage in Next.js

```tsx
// app/admin/clients/page.tsx
import { AdminShell } from '@/components/AdminShell';
import { AdminClientsPage } from '@/components/AdminClientsPage';
import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function Page() {
  await requireAdmin();
  const clients = await prisma.clientAccount.findMany({
    include: { sites: { include: { tickets: { select: { status: true } } } } },
  });
  return (
    <AdminShell activeNav="clients">
      <AdminClientsPage clients={clients.map(toDto)} />
    </AdminShell>
  );
}
```

## What's still pending (Track B — the backend)

This is everything left in `docs/plans/2026-05-04-dispatch-client-portal-plan.md`:

- **Phase 0** Supabase Auth + Storage setup
- **Phase 1** Database schema (Prisma migration)
- **Phase 2** RLS policies (SQL in Supabase)
- **Phase 3-4** Server-side auth helpers + middleware
- **Phase 5** Invite system server endpoints
- **Phase 8** Real Realtime subscription wiring inside ChatThread
- **Phase 9** Presence channel join/leave + admin watcher
- **Phase 10** Signed upload URLs for AttachmentDropzone

All the UI is wired with realistic data shapes — just swap mock fetch with real
Prisma queries and Supabase client calls following the plan.
