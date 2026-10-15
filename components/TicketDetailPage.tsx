"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { StatusPill, type TicketStatus } from "./StatusPill";
import {
  RoutingSlip,
  StatusTimeline,
  workLabelsForCategory,
  type TicketTimestamps,
} from "./StatusTimeline";
import { ArrowIcon, BackIcon } from "@/app/admin/docket-icons";
import { TICKET_CATEGORIES, categoryShortLabel } from "@/lib/ticket-categories";
import { formatFiledAt } from "@/lib/datetime";
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
  /** Client clicks "Confirm Fixed", closes the ticket */
  onConfirmFixed?: () => void | Promise<void>;
  /** Client clicks "Issue Persists", reopens the ticket */
  onReopen?: () => void | Promise<void>;
  /** Admin status change handler. `reason` is only ever passed alongside CLOSED. */
  onStatusChange?: (newStatus: TicketStatus, reason?: string) => void | Promise<void>;
  /** Admin category (type) change handler */
  onCategoryChange?: (newCategory: string) => void | Promise<void>;
  /** Back navigation */
  onBack?: () => void;
  /** Avatar for client-side messages (signed URL or null) */
  clientAvatarUrl?: string | null;
  /** Avatar for admin-side messages (typically /icon.png) */
  adminAvatarUrl?: string | null;
  /** Client display name (for avatar initials when no image set) */
  clientName?: string;
  /** Optional element rendered just above the chat thread (e.g., admin availability line) */
  availabilityLine?: ReactNode;
  /** Optional badge rendered in the header (e.g., "Out of free window" for admin) */
  headerBadge?: ReactNode;
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
  onCategoryChange,
  onBack,
  clientAvatarUrl,
  adminAvatarUrl,
  clientName,
  availabilityLine,
  headerBadge,
  className = "",
  style,
}: TicketDetailPageProps) {
  const isClient = viewerType === "client";
  const showConfirmActions = isClient && ticket.status === "AWAITING_CONFIRMATION";
  // Client component, so this formats in the viewer's own zone, same as the
  // per-stage stamps in the timeline below.
  const filedAt = formatFiledAt(ticket.createdAt);

  // The admin gets the Docket layout (app/admin/docket.css). Same pieces and
  // wording as below, arranged as a routing slip and correspondence card.
  if (viewerType === "admin") {
    return (
      <div className={className} style={style}>
        {onBack && (
          <button type="button" onClick={onBack} className="dk-back">
            <BackIcon />
            Back to ledger
          </button>
        )}

        <div className="dk-tmeta">
          <StatusPill status={ticket.status} />
          <span className="dk-mono">{ticket.ticketNumber}</span>
          <span aria-hidden="true">·</span>
          <span className="dk-type">{categoryShortLabel(ticket.category)}</span>
          {headerBadge}
        </div>

        <h1 className="dk-ttitle">{ticket.title}</h1>

        <div className="dk-tfor">
          <span>Filed for {ticket.siteDisplayName}</span>
          <span className="dk-mono dk-url">{ticket.siteUrl}</span>
          {ticket.clientName && <span>· {ticket.clientName}</span>}
        </div>
        {filedAt && <p className="dk-tfiled">Filed {filedAt}</p>}

        <section className="dk-card dk-slip">
          <div className="dk-slab">
            <span>Progress</span>
            <span>6 stages</span>
          </div>
          <RoutingSlip
            ticket={ticket}
            status={ticket.status}
            category={ticket.category}
            stampLabel={ticket.status === "CLOSED" ? "Closed" : null}
          />
        </section>

        <AdminStatusChanger
          currentStatus={ticket.status}
          onChange={onStatusChange}
          currentCategory={ticket.category}
          onCategoryChange={onCategoryChange}
        />

        <div className="dk-split">
          <aside className="dk-report">
            <div className="dk-slab">
              <span>Original Report</span>
            </div>
            <ReportBody text={ticket.description} />

            {ticketAttachments.length > 0 && (
              <div className="mt-5">
                <p className="dk-slab mb-2">Filed with</p>
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

          <section>
            <div className="dk-slab">
              <span>Conversation</span>
              <span>
                {messages.length} message{messages.length === 1 ? "" : "s"}
              </span>
            </div>
            {availabilityLine}
            <ChatThread
              className="dk-convo"
              messages={messages}
              viewerType={viewerType}
              otherPartyName={otherPartyName}
              otherPartyOnline={otherPartyOnline}
              onlineLabel="Currently viewing"
              offlineLabel="Not currently viewing"
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

  return (
    <div className={`max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12 ${className}`} style={style}>
      {/* Back link */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-[0.8125rem] text-ink-mute hover:text-accent transition-colors mb-4"
        >
          ← Back to ledger
        </button>
      )}

      {/* Header */}
      <header className="mb-8 rule-double pb-6">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <StatusPill status={ticket.status} />
          <span className="font-mono text-[0.8125rem] text-ink-fade">
            {ticket.ticketNumber}
          </span>
          <span className="text-ink-fade">·</span>
          <span className="font-mono text-[0.8125rem] text-ink-mute">
            {categoryShortLabel(ticket.category)}
          </span>
          {headerBadge}
        </div>

        <h1
          className="font-display text-3xl md:text-5xl leading-tight mb-2"
        >
          {ticket.title}
        </h1>

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-display italic text-ink-mute">
            Filed for {ticket.siteDisplayName}
          </span>
          <span className="font-mono text-[0.8125rem] text-ink-fade">
            {ticket.siteUrl}
          </span>
          {ticket.clientName && (
            <>
              <span className="text-ink-fade">·</span>
              <span className="font-mono text-[0.8125rem] text-ink-mute">
                {ticket.clientName}
              </span>
            </>
          )}
        </div>

        {filedAt && (
          <p className="font-mono text-[0.8125rem] text-ink-fade mt-3">
            Filed {filedAt}
          </p>
        )}
      </header>

      {/* Status timeline */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-[0.8125rem] text-accent">
            §
          </span>
          <span className="font-mono text-[0.8125rem] text-ink-mute">
            Progress
          </span>
          <span className="h-px flex-1 bg-ruleSoft" />
        </div>
        <StatusTimeline ticket={ticket} status={ticket.status} category={ticket.category} />
      </section>

      {/* Confirm / reopen actions, only for client when AWAITING_CONFIRMATION */}
      {showConfirmActions && (
        <section
          className="mb-10 px-5 md:px-6 py-5 md:py-6 border border-signal-green/25 bg-parchment-warm rounded-xl"
          aria-labelledby="confirm-heading"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="presence-dot online pulse" aria-hidden="true" />
            <span className="font-mono text-[0.8125rem] text-signal-green">
              Awaiting your confirmation
            </span>
          </div>
          <h2
            id="confirm-heading"
            className="font-display text-xl md:text-2xl mb-2"
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
              // Green sits on top of .btn-dispatch's orange. The fill token stays
              // deep in both themes (plain signal green turns mint after hours),
              // so the label uses the always-light token.
              style={{
                background: "rgb(var(--signal-green-fill))",
                color: "rgb(var(--on-inverse))",
              }}
            >
              ✓ Confirm fixed → close
            </button>
            <button type="button" onClick={onReopen} className="btn-ghost">
              ✗ Issue persists → reopen
            </button>
          </div>
        </section>
      )}

      {/* Two-column: original report + chat */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8 items-start">
        {/* Original report, sidebar */}
        <aside className="lg:sticky lg:top-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-[0.8125rem] text-accent">
              §
            </span>
            <span className="font-mono text-[0.8125rem] text-ink-mute">
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
              <p className="font-mono text-[0.8125rem] text-ink-mute mb-2">
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
            <span className="font-mono text-[0.8125rem] text-accent">
              §
            </span>
            <span className="font-mono text-[0.8125rem] text-ink-mute">
              Conversation
            </span>
            <span className="h-px flex-1 bg-ruleSoft" />
            <span className="font-mono text-[0.8125rem] text-ink-fade">
              {messages.length} message{messages.length === 1 ? "" : "s"}
            </span>
          </div>
          {availabilityLine}
          <ChatThread
            messages={messages}
            viewerType={viewerType}
            otherPartyName={otherPartyName}
            otherPartyOnline={otherPartyOnline}
            onlineLabel="Currently viewing"
            offlineLabel="Not currently viewing"
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
const CLOSE_REASON_PRESETS = ["No response from requester", "Declined to proceed"];

function AdminStatusChanger({
  currentStatus,
  onChange,
  currentCategory,
  onCategoryChange,
}: {
  currentStatus: TicketStatus;
  onChange?: (s: TicketStatus, reason?: string) => void | Promise<void>;
  currentCategory: string;
  onCategoryChange?: (c: string) => void | Promise<void>;
}) {
  // Speak the same language as the progress bar: an UPDATE ticket gets
  // "Start Making Update(s)", a BUG gets "Start Fixing Errors", and so on.
  const work = workLabelsForCategory(currentCategory);
  const transitions: { status: TicketStatus; label: string }[] = [
    { status: "REVIEWING", label: `Start ${work.reviewing}` },
    { status: "FIXING", label: `Start ${work.working}` },
    { status: "AWAITING_CONFIRMATION", label: `Mark ${work.done}` },
  ];
  const canClose = currentStatus !== "CLOSED";
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState("");

  function submitClose() {
    onChange?.("CLOSED", closeReason.trim() || undefined);
    setClosing(false);
    setCloseReason("");
  }

  return (
    <section className="dk-card dk-controls">
      <div className="dk-slab" style={{ justifyContent: "flex-start", gap: 8 }}>
        <span className="dk-hot">Admin controls</span>
        <span aria-hidden="true">·</span>
        <span>Currently: {currentStatus}</span>
      </div>

      {/* Type changer, fix a mis-filed ticket so the progress wording and
          queue grouping match what the work actually is. */}
      {onCategoryChange && (
        <div className="dk-field">
          <label htmlFor="admin-category">Type</label>
          <select
            id="admin-category"
            value={currentCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="dk-select cursor-pointer"
          >
            {TICKET_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="dk-row">
        {transitions.map((t) => (
          <button
            key={t.status}
            type="button"
            disabled={currentStatus === t.status}
            onClick={() => onChange?.(t.status)}
            className="dk-btn dk-sm"
          >
            <ArrowIcon />
            {t.label}
          </button>
        ))}
        {canClose && !closing && (
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="dk-btn dk-sm dk-ghost-signal"
          >
            ✕ Close ticket
          </button>
        )}
      </div>

      {closing && (
        <div className="mt-4 pt-4 border-t border-ruleSoft">
          <label
            htmlFor="admin-close-reason"
            className="dk-flabel block mb-2"
          >
            Reason (shown to the requester — optional)
          </label>
          <input
            id="admin-close-reason"
            type="text"
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            placeholder="e.g. No response from requester"
            maxLength={300}
            className="dk-input max-w-md mb-2"
          />
          <div className="flex flex-wrap gap-2 mb-4">
            {CLOSE_REASON_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setCloseReason(preset)}
                className="dk-btn dk-sm"
              >
                {preset}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submitClose}
              className="dk-btn dk-primary"
            >
              Confirm close
            </button>
            <button
              type="button"
              onClick={() => {
                setClosing(false);
                setCloseReason("");
              }}
              className="dk-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ============================================
   REPORT BODY (admin)
   ============================================
   A report written as bullet lines reads as a numbered list; anything else
   stays one paragraph, exactly as filed.
   ============================================ */
function ReportBody({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullet = /^([•\-*]|\d+[.)])\s+/;
  if (lines.length > 1 && lines.every((l) => bullet.test(l))) {
    return (
      <ul>
        {lines.map((l, i) => (
          <li key={i} data-n={String(i + 1).padStart(2, "0")}>
            {l.replace(bullet, "")}
          </li>
        ))}
      </ul>
    );
  }
  return <p className="dk-reportp">{text}</p>;
}

/* ============================================
   ATTACHMENT ROW
   ============================================
   Used in the Original Report sidebar, image thumb for image MIME types,
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
          className="block max-w-full h-auto border border-rule group-hover:border-accent transition-colors rounded-2xl"
        />
        <span className="block mt-1 font-mono text-[0.8125rem] text-ink-fade group-hover:text-accent transition-colors truncate">
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
      className="inline-flex items-center gap-2 px-2 py-1 border border-rule hover:border-accent bg-parchment font-mono text-[0.8125rem] text-ink-mute hover:text-accent transition-colors rounded-full"
    >
      ↳ {attachment.filename}
    </a>
  );
}
