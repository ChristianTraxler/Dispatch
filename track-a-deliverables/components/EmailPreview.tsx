"use client";

import { type CSSProperties } from "react";

export interface EmailPreviewProps {
  /** Email subject line */
  subject: string;
  /** Sender display (e.g., "Christian @ Developer of Code <support@developerofcode.com>") */
  from: string;
  /** Recipient display */
  to: string;
  /** The rendered HTML email body (the full HTML doc returned by template functions) */
  html: string;
  /** Plain-text version (shown in a collapsible) */
  text?: string;
  className?: string;
  style?: CSSProperties;
}

export function EmailPreview({ subject, from, to, html, text, className = "", style }: EmailPreviewProps) {
  return (
    <div className={`max-w-3xl ${className}`} style={style}>
      {/* Inbox header chrome */}
      <div className="border border-rule bg-parchment-warm">
        <div className="px-5 py-3 rule-thin">
          <div className="font-display text-2xl text-ink leading-tight" style={{ fontVariationSettings: '"opsz" 144' }}>
            {subject}
          </div>
        </div>

        <div className="px-5 py-3 grid grid-cols-[60px_1fr] gap-x-4 gap-y-1 rule-thin">
          <span className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute">From</span>
          <span className="font-mono text-xs text-ink truncate">{from}</span>
          <span className="font-mono text-[0.55rem] uppercase tracking-widest text-ink-mute">To</span>
          <span className="font-mono text-xs text-ink truncate">{to}</span>
        </div>

        {/* Email body inside an iframe-like wrapper */}
        <div className="bg-parchment p-4">
          <div
            className="bg-white border border-rule overflow-hidden"
            style={{ minHeight: 200 }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        {text && (
          <details className="border-t border-ruleSoft">
            <summary className="cursor-pointer px-5 py-2 font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute hover:text-signal-red transition-colors">
              ↳ View plain-text version
            </summary>
            <pre className="px-5 py-3 bg-parchment-deep font-mono text-xs text-ink-soft whitespace-pre-wrap leading-relaxed">
              {text}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
