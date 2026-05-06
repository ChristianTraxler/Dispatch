import "server-only";

import { Resend } from "resend";
import {
  renderInviteEmail,
  renderNewTicketEmail,
  renderAwaitingConfirmationEmail,
  renderTicketReopenedEmail,
  type InviteEmailParams,
  type NewTicketEmailParams,
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
