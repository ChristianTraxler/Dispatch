import "server-only";

import { Resend } from "resend";
import {
  renderInviteEmail,
  renderNewTicketEmail,
  renderNewMessageToAdminEmail,
  renderNewMessageToClientEmail,
  renderAwaitingConfirmationEmail,
  renderTicketReopenedEmail,
  renderInquiryTranscriptEmail,
  renderWaitingInquiryEmail,
  renderInviteReminderEmail,
  renderEmailChangeVerifyEmail,
  renderEmailChangeRequestedEmail,
  renderEmailChangeCompletedEmail,
  renderEmailChangeByAdminEmail,
  type InviteEmailParams,
  type NewTicketEmailParams,
  type NewMessageToAdminEmailParams,
  type NewMessageToClientEmailParams,
  type AwaitingConfirmationEmailParams,
  type TicketReopenedEmailParams,
  type InquiryTranscriptEmailParams,
  type WaitingInquiryEmailParams,
  type InviteReminderEmailParams,
  type EmailChangeVerifyEmailParams,
  type EmailChangeRequestedEmailParams,
  type EmailChangeCompletedEmailParams,
  type EmailChangeByAdminEmailParams,
} from "@/lib/email-templates";

// Lazy-instantiate the Resend client so module evaluation doesn't blow up
// when RESEND_API_KEY isn't set (e.g. Vercel build before env vars land).
let _resend: Resend | null = null;
function resend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set.");
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM = process.env.RESEND_FROM ?? "Dispatch <support@developerofcode.com>";

// Resend's SDK returns { data, error } instead of throwing on send failures.
// Wrap every send so a non-null `error` becomes a thrown exception — otherwise
// callers (e.g. the cron try/catch) can't distinguish "sent" from "silently rejected".
async function send(opts: { to: string; subject: string; html: string; text: string }) {
  const { data, error } = await resend().emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
  if (error) {
    throw new Error(`Resend send failed [${error.name}]: ${error.message}`);
  }
  return data;
}

export async function sendInviteEmail(params: InviteEmailParams) {
  const { subject, html, text } = renderInviteEmail(params);
  return send({ to: params.email, subject, html, text });
}

export async function sendInviteReminderEmail(params: InviteReminderEmailParams) {
  const { subject, html, text } = renderInviteReminderEmail(params);
  return send({ to: params.email, subject, html, text });
}

export async function sendNewTicketEmail(
  to: string,
  params: NewTicketEmailParams,
) {
  const { subject, html, text } = renderNewTicketEmail(params);
  return send({ to, subject, html, text });
}

export async function sendAwaitingConfirmationEmail(
  to: string,
  params: AwaitingConfirmationEmailParams,
) {
  const { subject, html, text } = renderAwaitingConfirmationEmail(params);
  return send({ to, subject, html, text });
}

export async function sendTicketReopenedEmail(
  to: string,
  params: TicketReopenedEmailParams,
) {
  const { subject, html, text } = renderTicketReopenedEmail(params);
  return send({ to, subject, html, text });
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
  return send({ to, subject, html, text });
}

export async function sendNewMessageToClientEmail(
  to: string,
  ticketId: string,
  params: NewMessageToClientEmailParams,
) {
  if (!shouldNotify(to, ticketId)) return null;
  const { subject, html, text } = renderNewMessageToClientEmail(params);
  return send({ to, subject, html, text });
}

export async function sendInquiryTranscriptEmail(
  to: string,
  params: InquiryTranscriptEmailParams,
) {
  const { subject, html, text } = renderInquiryTranscriptEmail(params);
  return send({ to, subject, html, text });
}

export async function sendWaitingInquiryEmail(
  to: string,
  params: WaitingInquiryEmailParams,
) {
  const { subject, html, text } = renderWaitingInquiryEmail(params);
  return send({ to, subject, html, text });
}

export async function sendEmailChangeVerifyEmail(
  to: string,
  params: EmailChangeVerifyEmailParams,
) {
  const { subject, html, text } = renderEmailChangeVerifyEmail(params);
  return send({ to, subject, html, text });
}

export async function sendEmailChangeRequestedEmail(
  to: string,
  params: EmailChangeRequestedEmailParams,
) {
  const { subject, html, text } = renderEmailChangeRequestedEmail(params);
  return send({ to, subject, html, text });
}

export async function sendEmailChangeCompletedEmail(
  to: string,
  params: EmailChangeCompletedEmailParams,
) {
  const { subject, html, text } = renderEmailChangeCompletedEmail(params);
  return send({ to, subject, html, text });
}

export async function sendEmailChangeByAdminEmail(
  to: string,
  params: EmailChangeByAdminEmailParams,
) {
  const { subject, html, text } = renderEmailChangeByAdminEmail(params);
  return send({ to, subject, html, text });
}
