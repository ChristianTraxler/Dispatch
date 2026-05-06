"use client";

import { type CSSProperties } from "react";
import { StatusPill, type TicketStatus } from "./StatusPill";
import { StatusTimeline, type TicketTimestamps } from "./StatusTimeline";
import {
  ChatThread,
  type ChatAttachment,
  type ChatMessage,
  type ViewerType,
} from "./ChatThread";

export interface TicketDetail extends TicketTimestamps {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: string;
  status: TicketStatus;
  siteUrl: string;
  siteDisplayName: string;
  clientName?: string; // shown in admin view
}

export interface TicketDetailPageProps {
  ticket: TicketDetail;
  /** Attachments uploaded with the original ticket (already-signed view URLs) */
  ticketAttachments?: ChatAttachment[];
  messages: ChatMessage[];
  viewerType: ViewerType;
  /** Other party's name (for chat header) */
  otherPartyName: string;
  /** Whether the other party is currently online */
  otherPartyOnline?: boolean;
  /** Whether the other party is currently typing in the chat */
  otherPartyTyping?: boolean;
  /** Send a chat message */
  onSendMessage?: (data: { body: string; attachments: never[] }) => void | Promise<void>;
  /** Fired when the viewer's typing state changes (forwarded to chat thread) */
  onTypingChange?: (isTyping: boolean) => void;
  /** Client clicks "Confirm Fixed" — closes the ticket */
  onConfirmFixed?: () => void | Promise<void>;
  /** Client clicks "Issue Persists" — reopens the ticket */
  onReopen?: () => void | Promise<void>;
  /** Admin status change handler */
  onStatusChange?: (newStatus: TicketStatus) => void | Promise<void>;
  /** Back navigation */
  onBack?: () => void;
  /** Avatar for client-side messages (signed URL or null) */
  clientAvatarUrl?: string | null;
  /** Avatar for admin-side messages (typically /icon.png) */
  adminAvatarUrl?: string | null;
  /** Client display name (for avatar initials when no image set) */
  clientName?: string;
  className?: string;
  style?: CSSProperties;
}

export function TicketDetailPage({
  ticket,
  ticketAttachments = [],
  messages,
  viewerType,
  otherPartyName,
  otherPartyOnline = false,
  otherPartyTyping = false,
  onSendMessage,
  onTypingChange,
  onConfirmFixed,
  onReopen,
  onStatusChange,
  onBack,
  clientAvatarUrl,
  adminAvatarUrl,
  clientName,
  className = "",
  style,
}: TicketDetailPageProps) {
  const isClient = viewerType === "client";
  const showConfirmActions = isClient && ticket.status === "AWAITING_CONFIRMATION";

  return (
    <div className={`max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12 ${className}`} style={style}>
      {/* Back link */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors mb-4"
        >
          ← Back to ledger
        </button>
      )}

      {/* Header */}
      <header className="mb-8 rule-double pb-6">
        <div className="flex items-center gap-3 mb-3">
          <StatusPill status={ticket.status} />
          <span className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-fade">
            {ticket.ticketNumber}
          </span>
          <span className="text-ink-fade">·</span>
          <span className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-mute">
            {ticket.category}
          </span>
        </div>

        <h1
          className="font-display text-3xl md:text-5xl leading-tight mb-2"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          {ticket.title}
        </h1>

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-display italic text-ink-mute">
            Filed for {ticket.siteDisplayName}
          </span>
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-ink-fade">
            {ticket.siteUrl}
          </span>
          {ticket.clientName && (
            <>
              <span className="text-ink-fade">·</span>
              <span className="font-mono text-[0.65rem] uppercase tracking-wider text-ink-mute">
                {ticket.clientName}
              </span>
            </>
          )}
        </div>
      </header>

      {/* Status timeline */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">
            §
          </span>
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
            Progress
          </span>
          <span className="h-px flex-1 bg-ruleSoft" />
        </div>
        <StatusTimeline ticket={ticket} status={ticket.status} />
      </section>

      {/* Confirm / reopen actions — only for client when AWAITING_CONFIRMATION */}
      {showConfirmActions && (
        <section
          className="mb-10 px-5 md:px-6 py-5 md:py-6 border-l-[3px] border-signal-green bg-parchment-warm"
          aria-labelledby="confirm-heading"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="presence-dot online pulse" aria-hidden="true" />
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-green">
              Awaiting your confirmation
            </span>
          </div>
          <h2
            id="confirm-heading"
            className="font-display text-xl md:text-2xl mb-2"
            style={{ fontVariationSettings: '"opsz" 144' }}
          >
            Is everything fixed on your end?
          </h2>
          <p className="font-display italic text-ink-mute mb-5 text-base">
            Verify the fix is working before I close this dispatch. If anything
            still feels off, send it back.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onConfirmFixed}
              className="btn-dispatch"
              style={{ background: "var(--signal-green)" }}
            >
              ✓ Confirm fixed → close
            </button>
            <button type="button" onClick={onReopen} className="btn-ghost">
              ✗ Issue persists → reopen
            </button>
          </div>
        </section>
      )}

      {/* Admin status changer */}
      {viewerType === "admin" && (
        <AdminStatusChanger
          currentStatus={ticket.status}
          onChange={onStatusChange}
        />
      )}

      {/* Two-column: original report + chat */}
      <div className="grid lg:grid-cols-[1fr_2fr] gap-8 items-start">
        {/* Original report — sidebar */}
        <aside className="lg:sticky lg:top-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">
              §
            </span>
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
              Original Report
            </span>
          </div>
          <div className="border-l-[3px] border-rule pl-4">
            <p className="font-display text-base leading-relaxed text-ink-soft whitespace-pre-line">
              {ticket.description}
            </p>
          </div>

          {ticketAttachments.length > 0 && (
            <div className="mt-5">
              <p className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute mb-2">
                Filed with
              </p>
              <ul className="space-y-2">
                {ticketAttachments.map((a, i) => (
                  <li key={i}>
                    <AttachmentRow attachment={a} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Chat */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">
              §
            </span>
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
              Conversation
            </span>
            <span className="h-px flex-1 bg-ruleSoft" />
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade">
              {messages.length} message{messages.length === 1 ? "" : "s"}
            </span>
          </div>
          <ChatThread
            messages={messages}
            viewerType={viewerType}
            otherPartyName={otherPartyName}
            otherPartyOnline={otherPartyOnline}
            otherPartyTyping={otherPartyTyping}
            onSendMessage={onSendMessage as never}
            onTypingChange={onTypingChange}
            clientAvatarUrl={clientAvatarUrl ?? null}
            adminAvatarUrl={adminAvatarUrl ?? null}
            clientName={clientName}
          />
        </section>
      </div>
    </div>
  );
}

/* ============================================
   ADMIN STATUS CHANGER
   ============================================ */
function AdminStatusChanger({
  currentStatus,
  onChange,
}: {
  currentStatus: TicketStatus;
  onChange?: (s: TicketStatus) => void | Promise<void>;
}) {
  const transitions: { status: TicketStatus; label: string }[] = [
    { status: "REVIEWING", label: "Mark Reviewing" },
    { status: "FIXING", label: "Mark Fixing" },
    { status: "AWAITING_CONFIRMATION", label: "Mark Fixed" },
  ];

  return (
    <section className="mb-10 px-5 md:px-6 py-5 border-l-[3px] border-signal-red bg-parchment-warm">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">
          Admin controls
        </span>
        <span className="text-ink-fade">·</span>
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
          Currently: {currentStatus}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => (
          <button
            key={t.status}
            type="button"
            disabled={currentStatus === t.status}
            onClick={() => onChange?.(t.status)}
            className={[
              "btn-ghost",
              currentStatus === t.status ? "opacity-40 pointer-events-none" : "",
            ].join(" ")}
          >
            → {t.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ============================================
   ATTACHMENT ROW
   ============================================
   Used in the Original Report sidebar — image thumb for image MIME types,
   filename + download link for PDFs.
   ============================================ */
function AttachmentRow({ attachment }: { attachment: ChatAttachment }) {
  const isImage = attachment.contentType.startsWith("image/");
  if (isImage) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
      >
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="block max-w-full h-auto border border-rule group-hover:border-signal-red transition-colors"
        />
        <span className="block mt-1 font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade group-hover:text-signal-red transition-colors truncate">
          {attachment.filename}
        </span>
      </a>
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-2 py-1 border border-rule hover:border-signal-red bg-parchment font-mono text-[0.65rem] uppercase tracking-wider text-ink-mute hover:text-signal-red transition-colors"
    >
      ↳ {attachment.filename}
    </a>
  );
}
