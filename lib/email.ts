import "server-only";

import { Resend } from "resend";
import {
  renderInviteEmail,
  renderNewTicketEmail,
  renderNewMessageToAdminEmail,
  renderNewMessageToClientEmail,
  renderAwaitingConfirmationEmail,
  renderTicketReopenedEmail,
  type InviteEmailParams,
  type NewTicketEmailParams,
  type NewMessageToAdminEmailParams,
  type NewMessageToClientEmailParams,
  type AwaitingConfirmationEmailParams,
  type TicketReopenedEmailParams,
} from "@/lib/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.RESEND_FROM ?? "Dispatch <support@developerofcode.com>";

export async function sendInviteEmail(params: InviteEmailParams) {
  const { subject, html, text } = renderInviteEmail(params);
  return resend.emails.send({
    from: FROM,
    to: params.email,
    subject,
    html,
    text,
  });
}

export async function sendNewTicketEmail(
  to: string,
  params: NewTicketEmailParams,
) {
  const { subject, html, text } = renderNewTicketEmail(params);
  return resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    text,
  });
}

export async function sendAwaitingConfirmationEmail(
  to: string,
  params: AwaitingConfirmationEmailParams,
) {
  const { subject, html, text } = renderAwaitingConfirmationEmail(params);
  return resend.emails.send({ from: FROM, to, subject, html, text });
}

export async function sendTicketReopenedEmail(
  to: string,
  params: TicketReopenedEmailParams,
) {
  const { subject, html, text } = renderTicketReopenedEmail(params);
  return resend.emails.send({ from: FROM, to, subject, html, text });
}

// ─── chat-message notifications ─────────────────────────────────────────────
// 60-second per-(recipient, ticket) debounce so a flurry of chat messages
// doesn't fire a flurry of emails. In-memory map; fine for Christian's scale,
// production-grade would switch to Redis.

const NOTIFY_DEBOUNCE_MS = 60_000;
const lastNotified = new Map<string, number>();

function shouldNotify(recipient: string, ticketId: string): boolean {
  const key = `${recipient.toLowerCase()}:${ticketId}`;
  const last = lastNotified.get(key) ?? 0;
  const now = Date.now();
  if (now - last < NOTIFY_DEBOUNCE_MS) return false;
  lastNotified.set(key, now);
  return true;
}

export async function sendNewMessageToAdminEmail(
  to: string,
  ticketId: string,
  params: NewMessageToAdminEmailParams,
) {
  if (!shouldNotify(to, ticketId)) return null;
  const { subject, html, text } = renderNewMessageToAdminEmail(params);
  return resend.emails.send({ from: FROM, to, subject, html, text });
}

export async function sendNewMessageToClientEmail(
  to: string,
  ticketId: string,
  params: NewMessageToClientEmailParams,
) {
  if (!shouldNotify(to, ticketId)) return null;
  const { subject, html, text } = renderNewMessageToClientEmail(params);
  return resend.emails.send({ from: FROM, to, subject, html, text });
}
