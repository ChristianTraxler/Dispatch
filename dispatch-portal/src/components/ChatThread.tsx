"use client";

import { useState, useRef, useEffect } from "react";
import type { CSSProperties } from "react";

export type SenderType = "CLIENT" | "ADMIN";
export type ViewerType = "client" | "admin";

export interface ChatMessage {
  id: string;
  senderType: SenderType;
  senderName: string;
  body: string;
  createdAt: string | Date;
  attachments?: ChatAttachment[];
  readAt?: string | Date | null;
}

export interface ChatAttachment {
  filename: string;
  url: string;
  contentType: string;
  sizeBytes: number;
}

export interface ChatThreadProps {
  messages: ChatMessage[];
  viewerType: ViewerType;
  /** Whether the other party is currently online */
  otherPartyOnline?: boolean;
  /** Other party's display name (for header) */
  otherPartyName?: string;
  /** Submit handler — replaced with real /api call in production */
  onSendMessage?: (data: { body: string; attachments: ChatAttachment[] }) => void | Promise<void>;
  /** Whether sending is in progress */
  sending?: boolean;
  className?: string;
  style?: CSSProperties;
}

function formatTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ChatThread({
  messages,
  viewerType,
  otherPartyOnline = false,
  otherPartyName,
  onSendMessage,
  sending = false,
  className = "",
  style,
}: ChatThreadProps) {
  const [draft, setDraft] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed && pendingAttachments.length === 0) return;
    if (!onSendMessage) {
      setDraft("");
      setPendingAttachments([]);
      return;
    }
    await onSendMessage({ body: trimmed, attachments: pendingAttachments });
    setDraft("");
    setPendingAttachments([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div
      className={`flex flex-col bg-parchment-warm border border-rule ${className}`}
      style={style}
    >
      {/* Header — newsroom dateline */}
      <div className="flex items-center justify-between px-4 py-3 rule-thin">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-signal-red">
            §
          </span>
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute truncate">
            Correspondence
          </span>
          {otherPartyName && (
            <>
              <span className="text-ink-fade">·</span>
              <span className="font-display text-sm text-ink-soft truncate">
                {otherPartyName}
              </span>
            </>
          )}
        </div>
        {otherPartyName && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={`presence-dot ${otherPartyOnline ? "online pulse" : "offline"}`}
              aria-hidden="true"
            />
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
              {otherPartyOnline ? "Online" : "Offline"}
            </span>
          </div>
        )}
      </div>

      {/* Message column */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-5"
        style={{ minHeight: "200px", maxHeight: "500px" }}
      >
        {messages.length === 0 && (
          <div className="text-center py-8 font-display italic text-ink-mute text-sm">
            No correspondence yet. Start a conversation below.
          </div>
        )}
        {messages.map((m) => (
          <MessageBlock key={m.id} message={m} viewerType={viewerType} />
        ))}
      </div>

      {/* Composer */}
      <div className="rule-thin border-t">
        <div className="px-4 py-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="File a reply…"
            rows={2}
            className="input-line resize-none w-full"
            style={{ borderBottom: "none" }}
            disabled={sending}
          />

          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2 mb-1">
              {pendingAttachments.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-2 px-2 py-1 border border-rule bg-parchment font-mono text-[0.6rem] uppercase tracking-wider text-ink-mute"
                >
                  ↳ {a.filename}
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAttachments((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="hover:text-signal-red transition-colors"
                    aria-label={`Remove ${a.filename}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 rule-thin border-t border-ruleSoft bg-parchment">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              // demo: add a fake attachment
              setPendingAttachments((prev) => [
                ...prev,
                {
                  filename: `screenshot-${prev.length + 1}.png`,
                  url: "#",
                  contentType: "image/png",
                  sizeBytes: 0,
                },
              ]);
            }}
          >
            ↳ Attach
          </button>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade hidden md:inline">
              ⌘ + Enter to send
            </span>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || (!draft.trim() && pendingAttachments.length === 0)}
              className="btn-dispatch"
            >
              {sending ? "Sending…" : "Send →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================
   MESSAGE BLOCK
   ============================================ */
interface MessageBlockProps {
  message: ChatMessage;
  viewerType: ViewerType;
}

function MessageBlock({ message, viewerType }: MessageBlockProps) {
  const isFromViewer =
    (viewerType === "client" && message.senderType === "CLIENT") ||
    (viewerType === "admin" && message.senderType === "ADMIN");
  const isAdmin = message.senderType === "ADMIN";

  return (
    <article
      className={`flex flex-col ${isFromViewer ? "items-end text-right" : "items-start"}`}
    >
      {/* Byline — sender + time */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className={[
            "font-mono text-[0.6rem] uppercase tracking-widest",
            isAdmin ? "text-signal-red" : "text-ink-soft",
          ].join(" ")}
        >
          {message.senderName}
        </span>
        <span className="text-ink-fade text-xs">·</span>
        <time
          dateTime={
            typeof message.createdAt === "string"
              ? message.createdAt
              : message.createdAt.toISOString()
          }
          className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute"
        >
          {formatTime(message.createdAt)}
        </time>
      </div>

      {/* Body */}
      <div
        className={[
          "max-w-[85%] md:max-w-[75%]",
          isFromViewer ? "text-right" : "text-left",
        ].join(" ")}
      >
        <p
          className={[
            "font-display text-base leading-relaxed",
            isAdmin ? "text-ink" : "text-ink-soft",
            "border-l-[3px] pl-3",
            isFromViewer ? "border-r-[3px] border-l-0 pr-3 pl-0" : "",
            isAdmin ? "border-signal-red" : "border-rule",
          ].join(" ")}
        >
          {message.body}
        </p>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div
            className={`flex flex-wrap gap-2 mt-2 ${
              isFromViewer ? "justify-end" : "justify-start"
            }`}
          >
            {message.attachments.map((a, i) => (
              <a
                key={i}
                href={a.url}
                className="inline-flex items-center gap-2 px-2 py-1 border border-rule bg-parchment font-mono text-[0.6rem] uppercase tracking-wider text-ink-mute hover:border-signal-red hover:text-signal-red transition-colors"
              >
                ↳ {a.filename}
              </a>
            ))}
          </div>
        )}

        {/* Read receipt — only for sent messages */}
        {isFromViewer && message.readAt && (
          <span className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-fade mt-1 inline-block">
            ─ read {formatTime(message.readAt)}
          </span>
        )}
      </div>
    </article>
  );
}
