"use client";

import { type CSSProperties } from "react";
import { StatusPill, type TicketStatus } from "./StatusPill";
import { StatusTimeline, type TicketTimestamps } from "./StatusTimeline";
import { ChatThread, type ChatMessage, type ViewerType } from "./ChatThread";

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
  messages: ChatMessage[];
  viewerType: ViewerType;
  /** Other party's name (for chat header) */
  otherPartyName: string;
  /** Whether the other party is currently online */
  otherPartyOnline?: boolean;
  /** Send a chat message */
  onSendMessage?: (data: { body: string; attachments: never[] }) => void | Promise<void>;
  /** Client clicks "Confirm Fixed" — closes the ticket */
  onConfirmFixed?: () => void | Promise<void>;
  /** Client clicks "Issue Persists" — reopens the ticket */
  onReopen?: () => void | Promise<void>;
  /** Admin status change handler */
  onStatusChange?: (newStatus: TicketStatus) => void | Promise<void>;
  /** Back navigation */
  onBack?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function TicketDetailPage({
  ticket,
  messages,
  viewerType,
  otherPartyName,
  otherPartyOnline = false,
  onSendMessage,
  onConfirmFixed,
  onReopen,
  onStatusChange,
  onBack,
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
        <StatusTimeline ticket={ticket} />
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
            onSendMessage={onSendMessage as never}
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
