/**
 * Dispatch email templates.
 *
 * Pure functions that return { subject, html, text } for each notification type.
 * Drop into your existing `lib/email.ts` and call from your Resend integration.
 *
 * Design constraints:
 * - Table-based layout for Outlook/Apple Mail/Gmail compatibility
 * - Inline styles only (no <style> blocks for safety)
 * - Web fonts via Google Fonts link with Georgia/Courier fallbacks
 * - 600px max width, centered
 * - Dark text on warm parchment background
 *
 * Drop-in usage with Resend:
 *
 *   import { renderInviteEmail } from '@/lib/email-templates';
 *   const { subject, html, text } = renderInviteEmail({ ... });
 *   await resend.emails.send({ from, to, subject, html, text });
 */

const COLORS = {
  parchment: "#f5f1e8",
  parchmentWarm: "#faf6ec",
  parchmentDeep: "#ede6d6",
  ink: "#1a1815",
  inkSoft: "#3d3a35",
  inkMute: "#6b665e",
  inkFade: "#a8a39a",
  rule: "#c9c0ab",
  ruleSoft: "#ddd6c2",
  signalRed: "#c8341a",
  signalGreen: "#2e7d3f",
};

const FONT_DISPLAY = `'Fraunces', Georgia, 'Times New Roman', serif`;
const FONT_MONO = `'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, 'Courier New', monospace`;

/* ============================================
   COMMON COMPONENTS (HTML string helpers)
   ============================================ */

function head(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escape(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
</head>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(opts: { title: string; preheader: string; body: string }): string {
  return `${head(opts.title)}
<body style="margin:0;padding:0;background:${COLORS.parchment};font-family:${FONT_DISPLAY};color:${COLORS.ink};-webkit-font-smoothing:antialiased;">
<!-- Preheader (hidden in body, shown in inbox preview) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.parchment};">
${escape(opts.preheader)}
</div>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${COLORS.parchment};">
<tr><td align="center" style="padding:32px 16px;">

<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:${COLORS.parchmentWarm};border:1px solid ${COLORS.rule};">

<!-- Masthead -->
<tr><td style="padding:24px 32px 16px 32px;border-bottom:3px double ${COLORS.rule};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="font-family:${FONT_MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${COLORS.inkMute};padding-bottom:6px;">
${currentDateline()}
</td>
<td align="right" style="font-family:${FONT_MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${COLORS.signalRed};padding-bottom:6px;">
DEVELOPER OF CODE
</td>
</tr>
<tr><td colspan="2" style="font-family:${FONT_DISPLAY};font-size:36px;font-weight:300;letter-spacing:-0.01em;line-height:1;color:${COLORS.ink};">
DISPATCH
<span style="font-family:${FONT_MONO};font-size:10px;font-weight:500;letter-spacing:0.18em;color:${COLORS.signalRed};margin-left:12px;">── EST. 2026</span>
</td></tr>
</table>
</td></tr>

<!-- Body -->
<tr><td style="padding:32px;">
${opts.body}
</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 32px 28px 32px;border-top:1px solid ${COLORS.rule};">
<p style="margin:0 0 6px 0;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${COLORS.inkFade};line-height:1.6;">
Developer of Code, LLC ── Support Desk
</p>
<p style="margin:0;font-family:${FONT_DISPLAY};font-style:italic;font-size:13px;color:${COLORS.inkMute};line-height:1.5;">
Sent from the dispatch desk. Reply to this email and it'll land in the right ticket.
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function currentDateline(): string {
  const d = new Date();
  return d
    .toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "2-digit",
    })
    .toUpperCase();
}

function sectionLabel(label: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
<tr>
<td width="20" style="font-family:${FONT_MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${COLORS.signalRed};vertical-align:middle;">§</td>
<td style="border-bottom:1px solid ${COLORS.rule};height:1px;"></td>
<td align="right" width="auto" style="padding-left:12px;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${COLORS.inkMute};vertical-align:middle;white-space:nowrap;">${escape(label)}</td>
</tr>
</table>`;
}

function headline(text: string): string {
  return `<h1 style="margin:0 0 12px 0;font-family:${FONT_DISPLAY};font-size:30px;line-height:1.1;font-weight:400;color:${COLORS.ink};letter-spacing:-0.005em;">
${text}
</h1>`;
}

function lede(text: string): string {
  return `<p style="margin:0 0 24px 0;font-family:${FONT_DISPLAY};font-style:italic;font-size:17px;line-height:1.5;color:${COLORS.inkMute};">
${text}
</p>`;
}

function bodyText(text: string): string {
  return `<p style="margin:0 0 16px 0;font-family:${FONT_DISPLAY};font-size:16px;line-height:1.55;color:${COLORS.inkSoft};">
${text}
</p>`;
}

function button(opts: { href: string; label: string; variant?: "primary" | "ghost" }): string {
  const isPrimary = opts.variant !== "ghost";
  const bg = isPrimary ? COLORS.ink : "transparent";
  const fg = isPrimary ? COLORS.parchmentWarm : COLORS.ink;
  const border = isPrimary ? COLORS.ink : COLORS.rule;
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
<tr><td style="background:${bg};border:1px solid ${border};">
<a href="${escape(opts.href)}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${FONT_MONO};font-size:11px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;color:${fg};text-decoration:none;">
${escape(opts.label)}
</a>
</td></tr>
</table>`;
}

function dataRow(label: string, value: string, accent?: string): string {
  return `<tr>
<td style="padding:6px 16px 6px 0;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${COLORS.inkMute};vertical-align:top;white-space:nowrap;">${escape(label)}</td>
<td style="padding:6px 0;font-family:${FONT_DISPLAY};font-size:15px;color:${accent ?? COLORS.ink};vertical-align:top;line-height:1.4;">${value}</td>
</tr>`;
}

function dataTable(rows: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;border-top:1px solid ${COLORS.ruleSoft};border-bottom:1px solid ${COLORS.ruleSoft};padding:8px 0;">
<tr><td colspan="2" style="height:8px;"></td></tr>
${rows}
<tr><td colspan="2" style="height:8px;"></td></tr>
</table>`;
}

function quoteBlock(text: string, accent: string = COLORS.signalRed): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0 24px 0;width:100%;">
<tr>
<td width="3" style="background:${accent};"></td>
<td width="14"></td>
<td style="padding:4px 0;font-family:${FONT_DISPLAY};font-size:16px;line-height:1.55;color:${COLORS.inkSoft};font-style:italic;">
${text}
</td>
</tr>
</table>`;
}

function caps(text: string, color: string = COLORS.inkMute): string {
  return `<span style="font-family:${FONT_MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${color};">${escape(text)}</span>`;
}

function plainTextFooter(): string {
  return `\n\n--\nDeveloper of Code, LLC — Support Desk\nReply to this email and it'll land in the right ticket.`;
}

/* ============================================
   1. INVITE EMAIL
   ============================================ */
export interface InviteEmailParams {
  recipientName?: string;
  email: string;
  siteUrl: string;
  siteDisplayName: string;
  inviteUrl: string;
  expiresAt: Date | string;
  note?: string;
}

export function renderInviteEmail(p: InviteEmailParams): { subject: string; html: string; text: string } {
  const expiresAt = typeof p.expiresAt === "string" ? new Date(p.expiresAt) : p.expiresAt;
  const expiresStr = expiresAt.toLocaleString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });

  const greeting = p.recipientName ? `Hi ${escape(p.recipientName)},` : "Hi there,";

  const body = `
${sectionLabel("INVITATION")}
${headline(`Your support desk for<br><span style="color:${COLORS.signalRed};font-style:italic;">${escape(p.siteDisplayName)}</span>`)}
${lede(`A personal place to file tickets, track fixes, and stay in touch.`)}

${bodyText(greeting)}
${bodyText(`I've set up a Dispatch account for ${escape(p.siteDisplayName)}. From here on, instead of texts, emails, and lost messages — file a ticket and we'll have a tracked conversation about it. You'll see status updates in real time and can chat with me directly inside each ticket.`)}

${
  p.note
    ? quoteBlock(escape(p.note))
    : ""
}

${dataTable(`
${dataRow("Site", `<strong style="font-weight:500;">${escape(p.siteDisplayName)}</strong> &nbsp;<span style="font-family:${FONT_MONO};font-size:12px;color:${COLORS.inkMute};">${escape(p.siteUrl)}</span>`)}
${dataRow("Email", `<span style="font-family:${FONT_MONO};font-size:13px;">${escape(p.email)}</span>`)}
${dataRow("Expires", expiresStr)}
`)}

${button({ href: p.inviteUrl, label: "Set up your account →" })}

${bodyText(`This invite is valid for 7 days. If it expires before you click, just reply to this email and I'll send a new one.`)}

${bodyText(`— Christian`)}
  `.trim();

  const html = shell({
    title: `Your Dispatch invite for ${p.siteDisplayName}`,
    preheader: `Set up your support desk for ${p.siteDisplayName}. Valid until ${expiresStr}.`,
    body,
  });

  const text = `${greeting.replace("&nbsp;", " ")}

I've set up a Dispatch account for ${p.siteDisplayName} (${p.siteUrl}). Set it up here:

${p.inviteUrl}

${p.note ? `\n"${p.note}"\n` : ""}This invite is valid for 7 days (expires ${expiresStr}). Reply if you need a fresh one.

— Christian${plainTextFooter()}`;

  return {
    subject: `Your Dispatch invite for ${p.siteDisplayName}`,
    html,
    text,
  };
}

/* ============================================
   2. NEW TICKET (to admin)
   ============================================ */
export interface NewTicketEmailParams {
  ticketNumber: string;
  ticketTitle: string;
  ticketUrl: string;
  category: string;
  clientName: string;
  clientEmail: string;
  siteDisplayName: string;
  siteUrl: string;
  description: string;
  isEmergency: boolean;
  emergencyFeeAmountCents?: number | null;
}

export function renderNewTicketEmail(p: NewTicketEmailParams): { subject: string; html: string; text: string } {
  const feeDollars = p.emergencyFeeAmountCents
    ? (p.emergencyFeeAmountCents / 100).toFixed(0)
    : null;

  const banner = p.isEmergency
    ? `
<div style="background:${COLORS.signalRed};color:${COLORS.parchmentWarm};padding:14px 18px;margin:0 0 20px 0;font-family:${FONT_MONO};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">
  ⚠ EMERGENCY — Outside business hours.${feeDollars ? ` Client acknowledged $${feeDollars} fee.` : ""}
</div>
`.trim()
    : "";

  const body = `
${banner}
${sectionLabel("NEW DISPATCH FILED")}
${headline(escape(p.ticketTitle))}
${lede(`From <strong style="color:${COLORS.signalRed};">${escape(p.clientName)}</strong> for ${escape(p.siteDisplayName)}.`)}

${dataTable(`
${dataRow("Ticket", `<span style="font-family:${FONT_MONO};font-size:13px;">${escape(p.ticketNumber)}</span>`)}
${dataRow("Type", caps(p.category))}
${dataRow("Site", `${escape(p.siteDisplayName)} <span style="font-family:${FONT_MONO};font-size:12px;color:${COLORS.inkMute};">— ${escape(p.siteUrl)}</span>`)}
${dataRow("Filed by", `${escape(p.clientName)} <span style="font-family:${FONT_MONO};font-size:12px;color:${COLORS.inkMute};">${escape(p.clientEmail)}</span>`)}
`)}

<div style="margin:0 0 8px 0;">${caps("Original report")}</div>
${quoteBlock(escape(p.description).replace(/\n/g, "<br>"))}

${button({ href: p.ticketUrl, label: "Open the ticket →" })}
  `.trim();

  const html = shell({
    title: `New ticket: ${p.ticketTitle}`,
    preheader: p.isEmergency
      ? `EMERGENCY — ${p.clientName} filed an after-hours ${p.category.toLowerCase()} ticket for ${p.siteDisplayName}.`
      : `${p.clientName} filed a new ${p.category.toLowerCase()} ticket for ${p.siteDisplayName}.`,
    body,
  });

  const textBanner = p.isEmergency
    ? `*** EMERGENCY — outside business hours${feeDollars ? `, $${feeDollars} fee acknowledged` : ""} ***\n\n`
    : "";

  const text = `${textBanner}New ticket filed: ${p.ticketTitle}

From: ${p.clientName} (${p.clientEmail})
Site: ${p.siteDisplayName} — ${p.siteUrl}
Type: ${p.category}
Ticket: ${p.ticketNumber}

> ${p.description.split("\n").join("\n> ")}

Open it here: ${p.ticketUrl}${plainTextFooter()}`;

  const subject = p.isEmergency
    ? `[EMERGENCY] [${p.category}] ${p.ticketTitle} — ${p.siteDisplayName}`
    : `[${p.category}] ${p.ticketTitle} — ${p.siteDisplayName}`;

  return { subject, html, text };
}

/* ============================================
   3. NEW MESSAGE → ADMIN
   ============================================ */
export interface NewMessageToAdminEmailParams {
  ticketNumber: string;
  ticketTitle: string;
  ticketUrl: string;
  clientName: string;
  siteDisplayName: string;
  messageBody: string;
}

export function renderNewMessageToAdminEmail(p: NewMessageToAdminEmailParams): { subject: string; html: string; text: string } {
  const body = `
${sectionLabel("NEW MESSAGE")}
${headline(`<span style="color:${COLORS.signalRed};">${escape(p.clientName)}</span> replied`)}
${lede(`On <strong>${escape(p.ticketTitle)}</strong> · ${escape(p.siteDisplayName)}`)}

${quoteBlock(escape(p.messageBody).replace(/\n/g, "<br>"))}

${button({ href: p.ticketUrl, label: "Reply in the ticket →" })}

<p style="margin:8px 0 0 0;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.inkFade};line-height:1.6;">
Ticket ${escape(p.ticketNumber)}
</p>
  `.trim();

  const html = shell({
    title: `New message from ${p.clientName}`,
    preheader: p.messageBody.slice(0, 100),
    body,
  });

  const text = `${p.clientName} replied on "${p.ticketTitle}":

> ${p.messageBody.split("\n").join("\n> ")}

Reply here: ${p.ticketUrl}${plainTextFooter()}`;

  return {
    subject: `Re: ${p.ticketTitle} — message from ${p.clientName}`,
    html,
    text,
  };
}

/* ============================================
   4. NEW MESSAGE → CLIENT
   ============================================ */
export interface NewMessageToClientEmailParams {
  ticketNumber: string;
  ticketTitle: string;
  ticketUrl: string;
  siteDisplayName: string;
  messageBody: string;
}

export function renderNewMessageToClientEmail(p: NewMessageToClientEmailParams): { subject: string; html: string; text: string } {
  const body = `
${sectionLabel("REPLY ON YOUR TICKET")}
${headline(`Christian replied`)}
${lede(`On <strong>${escape(p.ticketTitle)}</strong> · ${escape(p.siteDisplayName)}`)}

${quoteBlock(escape(p.messageBody).replace(/\n/g, "<br>"), COLORS.signalRed)}

${button({ href: p.ticketUrl, label: "Read & reply →" })}

<p style="margin:8px 0 0 0;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.inkFade};line-height:1.6;">
Ticket ${escape(p.ticketNumber)}
</p>
  `.trim();

  const html = shell({
    title: `Christian replied on ${p.ticketTitle}`,
    preheader: p.messageBody.slice(0, 100),
    body,
  });

  const text = `Christian replied on "${p.ticketTitle}":

> ${p.messageBody.split("\n").join("\n> ")}

Read & reply here: ${p.ticketUrl}${plainTextFooter()}`;

  return {
    subject: `Re: ${p.ticketTitle}`,
    html,
    text,
  };
}

/* ============================================
   5. AWAITING CONFIRMATION → CLIENT
   ============================================ */
export interface AwaitingConfirmationEmailParams {
  ticketNumber: string;
  ticketTitle: string;
  ticketUrl: string;
  siteDisplayName: string;
  fixSummary?: string;
}

export function renderAwaitingConfirmationEmail(p: AwaitingConfirmationEmailParams): { subject: string; html: string; text: string } {
  const body = `
${sectionLabel("AWAITING YOUR CONFIRMATION")}
${headline(`Is everything fixed<br>on your end?`)}
${lede(`I marked <strong>${escape(p.ticketTitle)}</strong> as fixed. Take a look and let me know.`)}

${
  p.fixSummary
    ? `<div style="margin:0 0 8px 0;">${caps("What I changed")}</div>${quoteBlock(escape(p.fixSummary).replace(/\n/g, "<br>"), COLORS.signalGreen)}`
    : ""
}

${bodyText(`Open the ticket and either confirm the fix (which closes it) or send it back if you're still seeing the issue.`)}

${button({ href: p.ticketUrl, label: "Verify & confirm →" })}

<p style="margin:8px 0 0 0;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.inkFade};line-height:1.6;">
Ticket ${escape(p.ticketNumber)} · ${escape(p.siteDisplayName)}
</p>
  `.trim();

  const html = shell({
    title: `Verify the fix: ${p.ticketTitle}`,
    preheader: `I marked ${p.ticketTitle} as fixed. Verify it's working before I close the ticket.`,
    body,
  });

  const text = `I marked "${p.ticketTitle}" as fixed. Take a look and confirm — or reopen it if it's still acting up.

${p.fixSummary ? `What I changed:\n> ${p.fixSummary.split("\n").join("\n> ")}\n\n` : ""}Verify here: ${p.ticketUrl}${plainTextFooter()}`;

  return {
    subject: `Fixed — please verify: ${p.ticketTitle}`,
    html,
    text,
  };
}

/* ============================================
   6. TICKET REOPENED → ADMIN
   ============================================ */
export interface TicketReopenedEmailParams {
  ticketNumber: string;
  ticketTitle: string;
  ticketUrl: string;
  clientName: string;
  siteDisplayName: string;
  reopenReason?: string;
}

export function renderTicketReopenedEmail(p: TicketReopenedEmailParams): { subject: string; html: string; text: string } {
  const body = `
${sectionLabel("DISPATCH REOPENED")}
${headline(`<span style="color:${COLORS.signalRed};">${escape(p.clientName)}</span><br>says it's not fixed.`)}
${lede(`<strong>${escape(p.ticketTitle)}</strong> is back in your queue.`)}

${
  p.reopenReason
    ? `<div style="margin:0 0 8px 0;">${caps("Their note")}</div>${quoteBlock(escape(p.reopenReason).replace(/\n/g, "<br>"))}`
    : bodyText(`No additional details were provided — open the ticket to follow up.`)
}

${dataTable(`
${dataRow("Ticket", `<span style="font-family:${FONT_MONO};font-size:13px;">${escape(p.ticketNumber)}</span>`)}
${dataRow("Site", escape(p.siteDisplayName))}
${dataRow("Status", caps("Reopened", COLORS.signalRed))}
`)}

${button({ href: p.ticketUrl, label: "Open the ticket →" })}
  `.trim();

  const html = shell({
    title: `Reopened: ${p.ticketTitle}`,
    preheader: `${p.clientName} reopened the ticket — issue persists.`,
    body,
  });

  const text = `${p.clientName} reopened "${p.ticketTitle}" — issue persists.

${p.reopenReason ? `Their note:\n> ${p.reopenReason.split("\n").join("\n> ")}\n\n` : ""}Open the ticket: ${p.ticketUrl}${plainTextFooter()}`;

  return {
    subject: `Reopened: ${p.ticketTitle}`,
    html,
    text,
  };
}

/* ============================================
   7. INQUIRY TRANSCRIPT (to admin + client)
   ============================================ */
export interface InquiryTranscriptMessage {
  senderName: string;
  senderType: "CLIENT" | "ADMIN";
  body: string;
  createdAt: Date | string;
  attachmentNames?: string[];
}

export interface InquiryTranscriptEmailParams {
  recipientType: "CLIENT" | "ADMIN";
  clientName: string;
  startedAt: Date | string;
  endedAt: Date | string;
  endedBy: "client" | "admin" | "auto";
  messages: InquiryTranscriptMessage[];
  /** For admin recipient: link to /admin/ticket/[id]. Omitted for client. */
  ticketUrl?: string;
}

export function renderInquiryTranscriptEmail(p: InquiryTranscriptEmailParams): { subject: string; html: string; text: string } {
  const startedAt = typeof p.startedAt === "string" ? new Date(p.startedAt) : p.startedAt;
  const endedAt = typeof p.endedAt === "string" ? new Date(p.endedAt) : p.endedAt;
  const endedStr = endedAt.toLocaleString("en-US", { month: "long", day: "2-digit", year: "numeric" });
  const startedStr = startedAt.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });

  const endedByLine =
    p.endedBy === "auto"
      ? "Auto-archived after 7 days of inactivity."
      : p.endedBy === "admin"
        ? "Ended by Christian."
        : `Ended by ${escape(p.clientName)}.`;

  const transcript = p.messages
    .map((m) => {
      const ts =
        typeof m.createdAt === "string"
          ? new Date(m.createdAt)
          : m.createdAt;
      const tsStr = ts.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
      const accent = m.senderType === "ADMIN" ? COLORS.signalRed : COLORS.ink;
      const attachmentLine = m.attachmentNames?.length
        ? `<div style="margin-top:6px;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.inkFade};">📎 ${m.attachmentNames.map((n) => escape(n)).join(", ")}</div>`
        : "";
      return `<div style="margin:0 0 14px 0;padding:10px 14px;background:${COLORS.parchment};border-left:3px solid ${accent};">
<div style="font-family:${FONT_MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${COLORS.inkMute};margin-bottom:4px;">
<strong style="color:${accent};">${escape(m.senderName)}</strong> · ${tsStr}
</div>
<div style="font-family:${FONT_DISPLAY};font-size:15px;line-height:1.5;color:${COLORS.inkSoft};">
${escape(m.body).replace(/\n/g, "<br>")}
</div>
${attachmentLine}
</div>`;
    })
    .join("\n");

  const followUp =
    p.recipientType === "CLIENT"
      ? bodyText(`Want to follow up? Open the portal and start a new chat anytime.`)
      : p.ticketUrl
        ? button({ href: p.ticketUrl, label: "Open the inquiry archive →" })
        : "";

  const body = `
${sectionLabel("INQUIRY TRANSCRIPT")}
${headline(`Quick chat with<br><span style="color:${COLORS.signalRed};font-style:italic;">${escape(p.clientName)}</span>`)}
${lede(endedByLine)}

${dataTable(`
${dataRow("Started", startedStr)}
${dataRow("Ended", endedStr)}
${dataRow("Messages", String(p.messages.length))}
`)}

<div style="margin:0 0 8px 0;">${caps("Conversation")}</div>
${p.messages.length === 0 ? bodyText("(No messages were exchanged.)") : transcript}

${followUp}
  `.trim();

  const html = shell({
    title: `Inquiry transcript — ${p.clientName} — ${endedStr}`,
    preheader: `${p.messages.length} message${p.messages.length === 1 ? "" : "s"} exchanged. ${endedByLine}`,
    body,
  });

  const textTranscript = p.messages
    .map((m) => {
      const ts = typeof m.createdAt === "string" ? new Date(m.createdAt) : m.createdAt;
      const tsStr = ts.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
      return `[${tsStr}] ${m.senderName}:\n${m.body}${m.attachmentNames?.length ? `\n(attachments: ${m.attachmentNames.join(", ")})` : ""}`;
    })
    .join("\n\n");

  const text = `Inquiry transcript — ${p.clientName}
${endedByLine}
Started: ${startedStr}
Ended: ${endedStr}
Messages: ${p.messages.length}

${p.messages.length === 0 ? "(No messages were exchanged.)" : textTranscript}

${p.recipientType === "CLIENT" ? "Want to follow up? Open the portal and start a new chat." : p.ticketUrl ? `Open the archive: ${p.ticketUrl}` : ""}${plainTextFooter()}`;

  return {
    subject: `Inquiry transcript — ${p.clientName} — ${endedStr}`,
    html,
    text,
  };
}

/* ============================================
   8. WAITING INQUIRY (admin nudge)
   ============================================ */
export interface WaitingInquiryEmailParams {
  clientName: string;
  ticketUrl: string;
  latestMessageBody: string;
  latestMessageAt: Date | string;
}

export function renderWaitingInquiryEmail(p: WaitingInquiryEmailParams): { subject: string; html: string; text: string } {
  const ts = typeof p.latestMessageAt === "string" ? new Date(p.latestMessageAt) : p.latestMessageAt;
  const tsStr = ts.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });

  const body = `
${sectionLabel("WAITING INQUIRY")}
${headline(`<span style="color:${COLORS.signalRed};">${escape(p.clientName)}</span><br>is waiting on you.`)}
${lede(`A quick-chat message has been sitting unanswered for over an hour.`)}

${quoteBlock(escape(p.latestMessageBody).replace(/\n/g, "<br>"))}

<p style="margin:0 0 16px 0;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${COLORS.inkFade};">
Sent ${tsStr}
</p>

${button({ href: p.ticketUrl, label: "Reply in the inquiry →" })}
  `.trim();

  const html = shell({
    title: `Waiting inquiry from ${p.clientName}`,
    preheader: p.latestMessageBody.slice(0, 100),
    body,
  });

  const text = `${p.clientName} is waiting on a reply. Their last message (${tsStr}):

> ${p.latestMessageBody.split("\n").join("\n> ")}

Reply here: ${p.ticketUrl}${plainTextFooter()}`;

  return {
    subject: `You have a waiting inquiry from ${p.clientName}`,
    html,
    text,
  };
}

/* ============================================
   EXPORTS
   ============================================ */
export const dispatchEmails = {
  renderInviteEmail,
  renderNewTicketEmail,
  renderNewMessageToAdminEmail,
  renderNewMessageToClientEmail,
  renderAwaitingConfirmationEmail,
  renderTicketReopenedEmail,
  renderInquiryTranscriptEmail,
  renderWaitingInquiryEmail,
};
