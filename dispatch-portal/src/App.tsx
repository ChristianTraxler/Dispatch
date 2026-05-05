import { useState } from "react";
import { ToastProvider } from "./components/Toast";
import { LoginPage } from "./components/LoginPage";
import { PortalShell } from "./components/PortalShell";
import { DashboardPage, type DashboardTicket } from "./components/DashboardPage";
import { NewTicketPage } from "./components/NewTicketPage";
import { TicketDetailPage } from "./components/TicketDetailPage";
import { InviteRedemption } from "./components/InviteRedemption";
import { SitesPage } from "./components/SitesPage";
import { AdminShell } from "./components/AdminShell";
import { AdminInvitesPage, type AdminInvite } from "./components/AdminInvitesPage";
import { AdminInviteNewPage } from "./components/AdminInviteNewPage";
import { AdminClientsPage, type AdminClient } from "./components/AdminClientsPage";
import { EmailPreview } from "./components/EmailPreview";
import {
  renderInviteEmail,
  renderNewTicketEmail,
  renderNewMessageToAdminEmail,
  renderNewMessageToClientEmail,
  renderAwaitingConfirmationEmail,
  renderTicketReopenedEmail,
} from "./lib/email-templates";
import { Showcase } from "./Showcase";
import type { TicketStatus } from "./components/StatusPill";

type View =
  | "showcase"
  | "login"
  | "invite-new"
  | "invite-existing-login"
  | "invite-existing-confirm"
  | "invite-mismatch"
  | "invite-invalid"
  | "dashboard"
  | "new-ticket"
  | "ticket-fixing"
  | "ticket-awaiting"
  | "ticket-admin-view"
  | "sites"
  | "admin-invites"
  | "admin-invite-new"
  | "admin-clients"
  | "email-invite"
  | "email-new-ticket"
  | "email-msg-to-admin"
  | "email-msg-to-client"
  | "email-awaiting"
  | "email-reopened";

const VIEW_GROUPS: { label: string; views: { key: View; label: string }[] }[] = [
  { label: "Dev", views: [{ key: "showcase", label: "Showcase" }] },
  {
    label: "Onboarding",
    views: [
      { key: "login", label: "Login" },
      { key: "invite-new", label: "Invite — New" },
      { key: "invite-existing-login", label: "Invite — Login" },
      { key: "invite-existing-confirm", label: "Invite — Merge" },
      { key: "invite-mismatch", label: "Invite — Mismatch" },
      { key: "invite-invalid", label: "Invite — Invalid" },
    ],
  },
  {
    label: "Client Portal",
    views: [
      { key: "dashboard", label: "Dashboard" },
      { key: "new-ticket", label: "New Ticket" },
      { key: "ticket-fixing", label: "Ticket — Fixing" },
      { key: "ticket-awaiting", label: "Ticket — Awaiting" },
      { key: "sites", label: "Sites" },
    ],
  },
  {
    label: "Admin",
    views: [
      { key: "ticket-admin-view", label: "Ticket — Admin" },
      { key: "admin-invites", label: "Invites" },
      { key: "admin-invite-new", label: "New Invite" },
      { key: "admin-clients", label: "Clients" },
    ],
  },
  {
    label: "Emails",
    views: [
      { key: "email-invite", label: "↳ Invite" },
      { key: "email-new-ticket", label: "↳ New Ticket" },
      { key: "email-msg-to-admin", label: "↳ Msg → Admin" },
      { key: "email-msg-to-client", label: "↳ Msg → Client" },
      { key: "email-awaiting", label: "↳ Awaiting Confirm" },
      { key: "email-reopened", label: "↳ Reopened" },
    ],
  },
];

const SAMPLE_USER = {
  id: "u_sarah",
  name: "Sarah Mathers",
  email: "sarah@renegadewellness.com",
};

const SAMPLE_SITES = [
  {
    id: "s_renegade",
    url: "renegadewellness.com",
    displayName: "Renegade Wellness Center",
    addedAt: "2026-03-12T10:00:00Z",
    totalTickets: 7,
    openTickets: 1,
  },
  {
    id: "s_reaves",
    url: "reaveschiropractic.com",
    displayName: "Reaves Chiropractic",
    addedAt: "2026-04-02T14:30:00Z",
    totalTickets: 3,
    openTickets: 0,
  },
];

const SAMPLE_TICKETS: DashboardTicket[] = [
  {
    id: "t1",
    ticketNumber: "DSP-2026-05-04-A3F9",
    title: "Contact form throwing 500 error",
    siteId: "s_renegade",
    siteUrl: "renegadewellness.com",
    status: "FIXING",
    lastActivityAt: new Date(Date.now() - 14 * 60_000).toISOString(),
    unreadCount: 2,
    messageCount: 5,
  },
  {
    id: "t2",
    ticketNumber: "DSP-2026-05-02-B812",
    title: "Update hours on homepage banner",
    siteId: "s_renegade",
    siteUrl: "renegadewellness.com",
    status: "AWAITING_CONFIRMATION",
    lastActivityAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
    messageCount: 3,
  },
  {
    id: "t3",
    ticketNumber: "DSP-2026-04-28-7C2D",
    title: "Salt cabin photo replacement",
    siteId: "s_renegade",
    siteUrl: "renegadewellness.com",
    status: "CLOSED",
    lastActivityAt: new Date(Date.now() - 6 * 24 * 3600_000).toISOString(),
    messageCount: 4,
  },
  {
    id: "t4",
    ticketNumber: "DSP-2026-04-10-9F03",
    title: "Add new service: spinal decompression",
    siteId: "s_reaves",
    siteUrl: "reaveschiropractic.com",
    status: "CLOSED",
    lastActivityAt: new Date(Date.now() - 24 * 24 * 3600_000).toISOString(),
    messageCount: 8,
  },
];

const SAMPLE_TICKET_FIXING = {
  id: "t1",
  ticketNumber: "DSP-2026-05-04-A3F9",
  title: "Contact form throwing 500 error",
  description:
    "The contact form on our about page is throwing a 500 error when someone submits.\n\nTested it twice this morning. Filling out all required fields, hit submit, get a generic error page. We've had 3 patients try to reach out about appointments today and none of them got through.",
  category: "Bug",
  status: "FIXING" as TicketStatus,
  siteUrl: "renegadewellness.com",
  siteDisplayName: "Renegade Wellness Center",
  createdAt: "2026-05-04T13:42:00Z",
  receivedAt: "2026-05-04T13:42:01Z",
  firstViewedAt: "2026-05-04T13:45:00Z",
  reviewingStartedAt: "2026-05-04T13:46:00Z",
  fixingStartedAt: "2026-05-04T14:02:00Z",
};

const SAMPLE_TICKET_AWAITING = {
  ...SAMPLE_TICKET_FIXING,
  id: "t2",
  ticketNumber: "DSP-2026-05-02-B812",
  title: "Update hours on homepage banner",
  description:
    "Need to update the hours displayed on the homepage banner.\n\nNew hours: Mon-Fri 9-7, Sat 10-4, Sun closed.",
  category: "Content",
  status: "AWAITING_CONFIRMATION" as TicketStatus,
  reviewingStartedAt: "2026-05-02T11:00:00Z",
  fixingStartedAt: "2026-05-02T13:00:00Z",
  fixedAt: "2026-05-02T15:30:00Z",
};

const SAMPLE_MESSAGES = [
  {
    id: "m1",
    senderType: "CLIENT" as const,
    senderName: "Sarah · Renegade Wellness",
    body: "The contact form on our about page is throwing a 500 error when someone submits. Tested it twice this morning.",
    createdAt: "2026-05-04T13:42:00Z",
    readAt: "2026-05-04T13:45:00Z",
  },
  {
    id: "m2",
    senderType: "ADMIN" as const,
    senderName: "Christian · Developer of Code",
    body: "Got it — looking at the server logs now. Likely the SMTP credentials. Will have a fix within the hour.",
    createdAt: "2026-05-04T13:46:00Z",
    readAt: "2026-05-04T13:47:00Z",
  },
  {
    id: "m3",
    senderType: "ADMIN" as const,
    senderName: "Christian · Developer of Code",
    body: "Confirmed — Mailgun rotated their SMTP host. Pushed the fix. Try the form now and let me know.",
    createdAt: "2026-05-04T14:18:00Z",
    attachments: [
      {
        filename: "fix-deploy-log.txt",
        url: "#",
        contentType: "text/plain",
        sizeBytes: 4200,
      },
    ],
  },
];

const SAMPLE_ADMIN_INVITES: AdminInvite[] = [
  {
    id: "inv1",
    email: "owner@maplehillbakery.com",
    recipientName: "Maple Hill Bakery",
    siteUrl: "maplehillbakery.com",
    siteDisplayName: "Maple Hill Bakery",
    status: "PENDING",
    createdAt: "2026-05-03T10:00:00Z",
    expiresAt: "2026-05-10T10:00:00Z",
    inviteUrl: "https://support.developerofcode.com/invite/a4f9c8e2b1d0a4f9c8e2b1d0",
  },
  {
    id: "inv2",
    email: "kevin@henleysonsrealty.com",
    recipientName: "Kevin Henley",
    siteUrl: "henleysonsrealty.com",
    siteDisplayName: "Henley & Sons Realty",
    status: "PENDING",
    createdAt: "2026-05-04T09:30:00Z",
    expiresAt: "2026-05-11T09:30:00Z",
    inviteUrl: "https://support.developerofcode.com/invite/b8d1f3a7e5c2b8d1f3a7e5c2",
  },
  {
    id: "inv3",
    email: "sarah@renegadewellness.com",
    recipientName: "Sarah Mathers",
    siteUrl: "renegadewellness.com",
    siteDisplayName: "Renegade Wellness Center",
    status: "REDEEMED",
    createdAt: "2026-03-12T08:00:00Z",
    expiresAt: "2026-03-19T08:00:00Z",
    redeemedAt: "2026-03-12T10:14:00Z",
    redeemedByEmail: "sarah@renegadewellness.com",
    inviteUrl: "https://support.developerofcode.com/invite/c2e5b8d1f3a7c2e5b8d1f3a7",
  },
  {
    id: "inv4",
    email: "sarah@renegadewellness.com",
    recipientName: "Sarah Mathers",
    siteUrl: "reaveschiropractic.com",
    siteDisplayName: "Reaves Chiropractic",
    status: "REDEEMED",
    createdAt: "2026-04-02T13:00:00Z",
    expiresAt: "2026-04-09T13:00:00Z",
    redeemedAt: "2026-04-02T14:31:00Z",
    redeemedByEmail: "sarah@renegadewellness.com",
    inviteUrl: "https://support.developerofcode.com/invite/d3f7c4a9b6e1d3f7c4a9b6e1",
  },
  {
    id: "inv5",
    email: "old-test@example.com",
    siteUrl: "example.com",
    siteDisplayName: "Example",
    status: "EXPIRED",
    createdAt: "2026-04-01T08:00:00Z",
    expiresAt: "2026-04-08T08:00:00Z",
    inviteUrl: "https://support.developerofcode.com/invite/e4a8b5c2d9f6e4a8b5c2d9f6",
  },
  {
    id: "inv6",
    email: "wrong-person@example.com",
    siteUrl: "wrongsite.com",
    siteDisplayName: "Wrong Site",
    status: "REVOKED",
    createdAt: "2026-04-15T14:00:00Z",
    expiresAt: "2026-04-22T14:00:00Z",
    inviteUrl: "https://support.developerofcode.com/invite/f5b9c6d3e0a7f5b9c6d3e0a7",
  },
];

const SAMPLE_ADMIN_CLIENTS: AdminClient[] = [
  {
    id: "c1",
    name: "Sarah Mathers",
    email: "sarah@renegadewellness.com",
    joinedAt: "2026-03-12T10:14:00Z",
    isOnline: true,
    sites: [
      {
        id: "s_renegade",
        url: "renegadewellness.com",
        displayName: "Renegade Wellness Center",
        totalTickets: 7,
        openTickets: 1,
      },
      {
        id: "s_reaves",
        url: "reaveschiropractic.com",
        displayName: "Reaves Chiropractic",
        totalTickets: 3,
        openTickets: 0,
      },
    ],
  },
  {
    id: "c2",
    name: "Marcus Chen",
    email: "marcus@nordicwoodworks.com",
    joinedAt: "2026-02-08T15:42:00Z",
    isOnline: false,
    lastSeenAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    sites: [
      {
        id: "s_nordic",
        url: "nordicwoodworks.com",
        displayName: "Nordic Woodworks",
        totalTickets: 12,
        openTickets: 2,
      },
    ],
  },
  {
    id: "c3",
    name: "Diane Rivera",
    email: "diane@coastalrealty.com",
    joinedAt: "2026-01-20T11:00:00Z",
    isOnline: false,
    lastSeenAt: new Date(Date.now() - 2 * 24 * 3600_000).toISOString(),
    sites: [
      {
        id: "s_coastal",
        url: "coastalrealty.com",
        displayName: "Coastal Realty",
        totalTickets: 4,
        openTickets: 0,
      },
    ],
  },
];

export function App() {
  const [view, setView] = useState<View>("showcase");

  return (
    <ToastProvider>
      <DevNav view={view} setView={setView} />
      <div className="pt-12">{renderView(view, setView)}</div>
    </ToastProvider>
  );
}

function renderView(view: View, setView: (v: View) => void) {
  const portalNav = (target: string) => {
    if (target === "dashboard") setView("dashboard");
    if (target === "sites") setView("sites");
    if (target === "new-ticket") setView("new-ticket");
    if (target === "logout") setView("login");
  };

  switch (view) {
    case "showcase":
      return <Showcase />;
    case "login":
      return <LoginPage onSubmit={async () => setView("dashboard")} />;
    case "invite-new":
      return (
        <InviteRedemption
          state="NEW_SIGNUP"
          invite={{
            email: "owner@maplehillbakery.com",
            siteUrl: "maplehillbakery.com",
            siteDisplayName: "Maple Hill Bakery",
          }}
          onSignup={async () => setView("dashboard")}
        />
      );
    case "invite-existing-login":
      return (
        <InviteRedemption
          state="EXISTING_NEEDS_LOGIN"
          invite={{
            email: "sarah@renegadewellness.com",
            siteUrl: "reaveschiropractic.com",
            siteDisplayName: "Reaves Chiropractic",
          }}
          onLogin={async () => setView("dashboard")}
        />
      );
    case "invite-existing-confirm":
      return (
        <InviteRedemption
          state="EXISTING_LOGGED_IN_MATCH"
          invite={{
            email: "sarah@renegadewellness.com",
            siteUrl: "reaveschiropractic.com",
            siteDisplayName: "Reaves Chiropractic",
          }}
          onConfirmMerge={async () => setView("dashboard")}
        />
      );
    case "invite-mismatch":
      return (
        <InviteRedemption
          state="EXISTING_LOGGED_IN_MISMATCH"
          invite={{
            email: "sarah@renegadewellness.com",
            siteUrl: "reaveschiropractic.com",
            siteDisplayName: "Reaves Chiropractic",
          }}
          currentSessionEmail="kevin@somewhere-else.com"
          onSignOut={async () => setView("login")}
        />
      );
    case "invite-invalid":
      return <InviteRedemption state="INVALID" />;
    case "dashboard":
      return (
        <PortalShell user={SAMPLE_USER} adminOnline activeNav="dashboard" onNavigate={portalNav}>
          <DashboardPage
            tickets={SAMPLE_TICKETS}
            sites={SAMPLE_SITES.map((s) => ({ id: s.id, url: s.url, displayName: s.displayName }))}
            onOpenTicket={(id) => setView(id === "t2" ? "ticket-awaiting" : "ticket-fixing")}
            onNewTicket={() => setView("new-ticket")}
          />
        </PortalShell>
      );
    case "new-ticket":
      return (
        <PortalShell user={SAMPLE_USER} adminOnline activeNav="dashboard" onNavigate={portalNav}>
          <NewTicketPage
            sites={SAMPLE_SITES}
            onSubmit={async () => setView("dashboard")}
            onCancel={() => setView("dashboard")}
          />
        </PortalShell>
      );
    case "ticket-fixing":
      return (
        <PortalShell user={SAMPLE_USER} adminOnline activeNav="dashboard" onNavigate={portalNav}>
          <TicketDetailPage
            ticket={SAMPLE_TICKET_FIXING}
            messages={SAMPLE_MESSAGES}
            viewerType="client"
            otherPartyName="Christian · Developer of Code"
            otherPartyOnline
            onBack={() => setView("dashboard")}
          />
        </PortalShell>
      );
    case "ticket-awaiting":
      return (
        <PortalShell user={SAMPLE_USER} adminOnline activeNav="dashboard" onNavigate={portalNav}>
          <TicketDetailPage
            ticket={SAMPLE_TICKET_AWAITING}
            messages={SAMPLE_MESSAGES.slice(0, 3)}
            viewerType="client"
            otherPartyName="Christian · Developer of Code"
            otherPartyOnline
            onBack={() => setView("dashboard")}
            onConfirmFixed={async () => setView("dashboard")}
            onReopen={async () => setView("ticket-fixing")}
          />
        </PortalShell>
      );
    case "ticket-admin-view":
      return (
        <div className="min-h-screen">
          <TicketDetailPage
            ticket={{ ...SAMPLE_TICKET_FIXING, clientName: "Sarah Mathers · Renegade Wellness" }}
            messages={SAMPLE_MESSAGES}
            viewerType="admin"
            otherPartyName="Sarah · Renegade Wellness"
            otherPartyOnline
            onBack={() => setView("dashboard")}
          />
        </div>
      );
    case "sites":
      return (
        <PortalShell user={SAMPLE_USER} adminOnline activeNav="sites" onNavigate={portalNav}>
          <SitesPage
            sites={SAMPLE_SITES}
            onFileTicketFor={() => setView("new-ticket")}
            onViewTicketsFor={() => setView("dashboard")}
          />
        </PortalShell>
      );
    case "admin-invites": {
      const adminNav = (target: string) => {
        if (target === "dashboard") setView("ticket-admin-view");
        if (target === "clients") setView("admin-clients");
        if (target === "invites") setView("admin-invites");
        if (target === "logout") setView("login");
      };
      return (
        <AdminShell activeNav="invites" onlineClientCount={1} onNavigate={adminNav}>
          <AdminInvitesPage
            invites={SAMPLE_ADMIN_INVITES}
            onCreateInvite={() => setView("admin-invite-new")}
            onCopyLink={(url) => {
              navigator.clipboard?.writeText(url);
              alert(`Copied: ${url}`);
            }}
            onRevoke={async (id) => {
              console.log("[demo] revoke", id);
            }}
          />
        </AdminShell>
      );
    }
    case "admin-invite-new": {
      const adminNav = (target: string) => {
        if (target === "dashboard") setView("ticket-admin-view");
        if (target === "clients") setView("admin-clients");
        if (target === "invites") setView("admin-invites");
        if (target === "logout") setView("login");
      };
      return (
        <AdminShell activeNav="invites" onlineClientCount={1} onNavigate={adminNav}>
          <AdminInviteNewPage
            onSubmit={async (data) => {
              console.log("[demo] new invite", data);
              setView("admin-invites");
            }}
            onCancel={() => setView("admin-invites")}
          />
        </AdminShell>
      );
    }
    case "admin-clients": {
      const adminNav = (target: string) => {
        if (target === "dashboard") setView("ticket-admin-view");
        if (target === "clients") setView("admin-clients");
        if (target === "invites") setView("admin-invites");
        if (target === "logout") setView("login");
      };
      return (
        <AdminShell activeNav="clients" onlineClientCount={1} onNavigate={adminNav}>
          <AdminClientsPage
            clients={SAMPLE_ADMIN_CLIENTS}
            onMessageClient={(id) => {
              console.log("[demo] message client", id);
              setView("ticket-admin-view");
            }}
            onViewSiteTickets={(id) => {
              console.log("[demo] view site tickets", id);
              setView("ticket-admin-view");
            }}
          />
        </AdminShell>
      );
    }
    case "email-invite": {
      const e = renderInviteEmail({
        recipientName: "Sarah Mathers",
        email: "sarah@renegadewellness.com",
        siteUrl: "renegadewellness.com",
        siteDisplayName: "Renegade Wellness Center",
        inviteUrl: "https://support.developerofcode.com/invite/a4f9c8e2b1d0a4f9c8e2b1d0",
        expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
        note: "Looking forward to having a real ticket system instead of the back-and-forth texts. Let me know if you have questions.",
      });
      return (
        <EmailViewer
          subject={e.subject}
          from="Christian @ Developer of Code <support@developerofcode.com>"
          to="Sarah Mathers <sarah@renegadewellness.com>"
          html={e.html}
          text={e.text}
        />
      );
    }
    case "email-new-ticket": {
      const e = renderNewTicketEmail({
        ticketNumber: "DSP-2026-05-04-A3F9",
        ticketTitle: "Contact form throwing 500 error",
        ticketUrl: "https://support.developerofcode.com/admin/ticket/abc123",
        category: "Bug",
        clientName: "Sarah Mathers",
        clientEmail: "sarah@renegadewellness.com",
        siteDisplayName: "Renegade Wellness Center",
        siteUrl: "renegadewellness.com",
        description:
          "The contact form on our about page is throwing a 500 error when someone submits.\n\nTested it twice this morning. Filling out all required fields, hit submit, get a generic error page. We've had 3 patients try to reach out about appointments today and none of them got through.",
      });
      return (
        <EmailViewer
          subject={e.subject}
          from="Dispatch <support@developerofcode.com>"
          to="Christian <hello@developerofcode.com>"
          html={e.html}
          text={e.text}
        />
      );
    }
    case "email-msg-to-admin": {
      const e = renderNewMessageToAdminEmail({
        ticketNumber: "DSP-2026-05-04-A3F9",
        ticketTitle: "Contact form throwing 500 error",
        ticketUrl: "https://support.developerofcode.com/admin/ticket/abc123",
        clientName: "Sarah Mathers",
        siteDisplayName: "Renegade Wellness Center",
        messageBody:
          "Working perfectly now. Just had three appointment requests come through in the last 20 minutes — thank you!",
      });
      return (
        <EmailViewer
          subject={e.subject}
          from="Dispatch <support@developerofcode.com>"
          to="Christian <hello@developerofcode.com>"
          html={e.html}
          text={e.text}
        />
      );
    }
    case "email-msg-to-client": {
      const e = renderNewMessageToClientEmail({
        ticketNumber: "DSP-2026-05-04-A3F9",
        ticketTitle: "Contact form throwing 500 error",
        ticketUrl: "https://support.developerofcode.com/portal/ticket/abc123",
        siteDisplayName: "Renegade Wellness Center",
        messageBody:
          "Confirmed — Mailgun rotated their SMTP host. Pushed the fix. Try the form now and let me know if anything still feels off.",
      });
      return (
        <EmailViewer
          subject={e.subject}
          from="Christian @ Developer of Code <support@developerofcode.com>"
          to="Sarah Mathers <sarah@renegadewellness.com>"
          html={e.html}
          text={e.text}
        />
      );
    }
    case "email-awaiting": {
      const e = renderAwaitingConfirmationEmail({
        ticketNumber: "DSP-2026-05-02-B812",
        ticketTitle: "Update hours on homepage banner",
        ticketUrl: "https://support.developerofcode.com/portal/ticket/xyz789",
        siteDisplayName: "Renegade Wellness Center",
        fixSummary:
          "Updated the homepage banner with the new hours: Mon-Fri 9-7, Sat 10-4, Sun closed. Also bumped the matching schema markup so Google search results pull the right times.",
      });
      return (
        <EmailViewer
          subject={e.subject}
          from="Christian @ Developer of Code <support@developerofcode.com>"
          to="Sarah Mathers <sarah@renegadewellness.com>"
          html={e.html}
          text={e.text}
        />
      );
    }
    case "email-reopened": {
      const e = renderTicketReopenedEmail({
        ticketNumber: "DSP-2026-05-02-B812",
        ticketTitle: "Update hours on homepage banner",
        ticketUrl: "https://support.developerofcode.com/admin/ticket/xyz789",
        clientName: "Sarah Mathers",
        siteDisplayName: "Renegade Wellness Center",
        reopenReason:
          "The Saturday hours are still showing as 9-5 on mobile. Desktop looks correct, just mobile.",
      });
      return (
        <EmailViewer
          subject={e.subject}
          from="Dispatch <support@developerofcode.com>"
          to="Christian <hello@developerofcode.com>"
          html={e.html}
          text={e.text}
        />
      );
    }
  }
}

/* ============================================
   EMAIL VIEWER WRAPPER
   ============================================ */
function EmailViewer({
  subject,
  from,
  to,
  html,
  text,
}: {
  subject: string;
  from: string;
  to: string;
  html: string;
  text: string;
}) {
  return (
    <div className="min-h-screen px-5 py-10 md:py-14">
      <div className="max-w-3xl mx-auto mb-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">§</span>
          <span className="h-px flex-1 bg-rule" />
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
            Email Preview
          </span>
        </div>
        <h1
          className="font-display text-2xl md:text-3xl mt-3"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          As it lands in the inbox
        </h1>
        <p className="font-display italic text-ink-mute mt-1 text-sm">
          The HTML below is the actual rendered email body. Subject + headers shown above are
          metadata Resend sends with the message.
        </p>
      </div>

      <div className="max-w-3xl mx-auto">
        <EmailPreview subject={subject} from={from} to={to} html={html} text={text} />
      </div>
    </div>
  );
}

/* ============================================
   DEV NAV
   ============================================ */
function DevNav({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-ink text-parchment-warm border-b border-signal-red shadow-md">
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-2">
        <span className="font-mono text-[0.55rem] uppercase tracking-widest text-signal-red mr-3 flex-shrink-0">
          DEV ↳
        </span>
        {VIEW_GROUPS.map((group, gi) => (
          <div key={group.label} className="flex items-center gap-1 flex-shrink-0">
            {gi > 0 && <span className="text-ink-fade mx-1">|</span>}
            <span className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-fade mr-1">
              {group.label}
            </span>
            {group.views.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={[
                  "font-mono text-[0.55rem] uppercase tracking-wider px-2 py-1 transition-colors whitespace-nowrap",
                  view === v.key
                    ? "bg-signal-red text-parchment-warm"
                    : "text-parchment-warm/70 hover:text-parchment-warm hover:bg-ink-soft",
                ].join(" ")}
              >
                {v.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
