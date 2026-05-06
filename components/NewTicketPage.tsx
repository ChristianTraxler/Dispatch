"use client";

import { useState, type CSSProperties } from "react";
import { AttachmentDropzone, type UploadedAttachment } from "./AttachmentDropzone";
import { uploadFile } from "@/lib/upload-client";

export interface NewTicketSite {
  id: string;
  url: string;
  displayName: string;
}

export interface NewTicketSubmission {
  siteId: string;
  title: string;
  category: string;
  description: string;
  attachments: UploadedAttachment[];
}

export interface NewTicketPageProps {
  /** Sites available to the client. Pre-filtered server-side. */
  sites: NewTicketSite[];
  /** Pre-selected site (e.g., when opening from /portal/sites for a specific site) */
  defaultSiteId?: string;
  onSubmit?: (data: NewTicketSubmission) => void | Promise<void>;
  onCancel?: () => void;
  className?: string;
  style?: CSSProperties;
}

const CATEGORIES = [
  { value: "BUG", label: "Bug — something's broken" },
  { value: "CONTENT", label: "Content — text or image change" },
  { value: "FEATURE", label: "Feature request" },
  { value: "QUESTION", label: "Question — not urgent" },
  { value: "URGENT", label: "Urgent — site is down" },
];

export function NewTicketPage({
  sites,
  defaultSiteId,
  onSubmit,
  onCancel,
  className = "",
  style,
}: NewTicketPageProps) {
  const [siteId, setSiteId] = useState(defaultSiteId ?? sites[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("BUG");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !!siteId && !!title.trim() && !!description.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit?.({ siteId, title: title.trim(), category, description: description.trim(), attachments });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`max-w-3xl mx-auto px-5 md:px-10 py-8 md:py-12 ${className}`} style={style}>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
          §
        </span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          New Filing
        </span>
      </div>
      <h1
        className="font-display text-3xl md:text-5xl leading-tight mb-2"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        File a new dispatch.
      </h1>
      <p className="font-display italic text-ink-mute mb-10">
        The more detail, the faster I can solve it.
      </p>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Site dropdown */}
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-2">
            Which site?
          </label>
          {sites.length === 1 ? (
            <div className="flex items-baseline gap-3 pb-2 rule-thin">
              <span className="font-display text-lg text-ink">{sites[0].displayName}</span>
              <span className="font-mono text-[0.65rem] uppercase tracking-wider text-ink-mute">
                {sites[0].url}
              </span>
            </div>
          ) : (
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              required
              className="input-line bg-transparent appearance-none cursor-pointer pr-8"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'><path fill='%231A1815' d='M6 8L0 0h12L6 8z'/></svg>\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 4px center",
                backgroundSize: "10px 7px",
              }}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName} — {s.url}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Title */}
        <div>
          <label
            htmlFor="title"
            className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-2"
          >
            Headline
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief summary of the issue"
            required
            maxLength={120}
            className="input-line"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-3">
            Type
          </label>
          <div className="grid sm:grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <label
                key={c.value}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 border cursor-pointer transition-colors",
                  category === c.value
                    ? "border-ink bg-parchment-warm"
                    : "border-rule hover:border-ink-mute",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="category"
                  value={c.value}
                  checked={category === c.value}
                  onChange={(e) => setCategory(e.target.value)}
                  className="sr-only"
                />
                <span
                  className={[
                    "w-3 h-3 border flex-shrink-0",
                    category === c.value ? "bg-signal-red border-signal-red" : "border-rule",
                  ].join(" ")}
                  aria-hidden="true"
                />
                <span className="font-display text-sm leading-tight">{c.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="description"
            className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-2"
          >
            Details
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's happening? What did you expect? Steps to reproduce, if you have them."
            required
            rows={6}
            className="input-line resize-y min-h-[140px]"
          />
        </div>

        {/* Attachments */}
        <div>
          <label className="block font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-2">
            Attachments (optional)
          </label>
          <AttachmentDropzone
            attachments={attachments}
            onFilesAccepted={async (files) => {
              for (const f of files) {
                try {
                  const result = await uploadFile("/api/portal/uploads", f);
                  const previewUrl = f.type.startsWith("image/")
                    ? URL.createObjectURL(f)
                    : undefined;
                  setAttachments((prev) => [
                    ...prev,
                    {
                      filename: result.filename,
                      url: previewUrl ?? "#",
                      contentType: result.contentType,
                      sizeBytes: result.sizeBytes,
                      previewUrl,
                      path: result.path,
                    },
                  ]);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Upload failed.");
                }
              }
            }}
            onRemove={(i) => setAttachments((prev) => prev.filter((_, j) => j !== i))}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-4 pt-4 rule-thin border-t">
          {onCancel ? (
            <button type="button" onClick={onCancel} className="btn-ghost">
              ← Cancel
            </button>
          ) : (
            <span />
          )}
          <button type="submit" disabled={!canSubmit || submitting} className="btn-dispatch">
            {submitting ? "Filing…" : "File dispatch →"}
          </button>
        </div>
      </form>
    </div>
  );
}
