import "server-only";

import { sendPushToUser, sendPushToAdmins } from "@/lib/push";
import {
  sendAwaitingConfirmationEmail,
  sendNewTicketEmail,
  sendNewMessageToAdminEmail,
  sendTicketReopenedEmail,
} from "@/lib/email";
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
