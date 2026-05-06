"use client";

import { useState, useRef, useCallback, type CSSProperties, type DragEvent } from "react";

export interface UploadedAttachment {
  filename: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  /** Optional preview URL (for images) */
  previewUrl?: string;
  /** Stable storage path; present after upload, sent to the server on POST. */
  path?: string;
}

export interface AttachmentDropzoneProps {
  /** Existing attachments to display alongside (controlled) */
  attachments?: UploadedAttachment[];
  /** Maximum number of files allowed */
  maxFiles?: number;
  /** Maximum size per file in bytes. Default 10MB. */
  maxSize?: number;
  /** Allowed MIME types. Default: images + PDF. */
  acceptedTypes?: string[];
  /** Triggered when files are accepted (post-validation). In production, this initiates upload. */
  onFilesAccepted?: (files: File[]) => void | Promise<void>;
  /** Triggered when an attachment should be removed */
  onRemove?: (index: number) => void;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentDropzone({
  attachments = [],
  maxFiles = 5,
  maxSize = 10 * 1024 * 1024,
  acceptedTypes = DEFAULT_TYPES,
  onFilesAccepted,
  onRemove,
  className = "",
  style,
}: AttachmentDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback(
    (files: File[]): { ok: File[]; error: string | null } => {
      const slotsRemaining = maxFiles - attachments.length;
      if (files.length > slotsRemaining) {
        return {
          ok: [],
          error: `Maximum ${maxFiles} files (${slotsRemaining} slot${slotsRemaining === 1 ? "" : "s"} remaining).`,
        };
      }
      for (const f of files) {
        if (!acceptedTypes.includes(f.type)) {
          return { ok: [], error: `${f.name} — type not allowed (${f.type || "unknown"}).` };
        }
        if (f.size > maxSize) {
          return {
            ok: [],
            error: `${f.name} — exceeds ${formatSize(maxSize)} limit.`,
          };
        }
      }
      return { ok: files, error: null };
    },
    [acceptedTypes, attachments.length, maxFiles, maxSize]
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      setError(null);
      const arr = Array.from(files);
      const { ok, error } = validate(arr);
      if (error) {
        setError(error);
        return;
      }
      onFilesAccepted?.(ok);
    },
    [onFilesAccepted, validate]
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const slotsRemaining = maxFiles - attachments.length;
  const full = slotsRemaining <= 0;

  return (
    <div className={className} style={style}>
      {/* Dropzone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !full && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-disabled={full}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !full) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={[
          "relative px-5 py-8 md:py-10 cursor-pointer transition-all duration-150 select-none",
          "border border-dashed",
          dragOver
            ? "border-signal-red bg-signal-red/[0.04]"
            : full
              ? "border-rule bg-parchment-deep cursor-not-allowed"
              : "border-rule hover:border-ink hover:bg-parchment-warm",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = ""; // reset so same file can be re-selected
          }}
          disabled={full}
        />

        <div className="flex flex-col items-center text-center gap-2">
          {/* Icon — paperclip-style ASCII */}
          <span
            className={[
              "font-mono text-2xl leading-none",
              dragOver ? "text-signal-red" : full ? "text-ink-fade" : "text-ink-mute",
            ].join(" ")}
            aria-hidden="true"
          >
            ↳
          </span>

          <span
            className={[
              "font-mono text-[0.65rem] uppercase tracking-widest",
              dragOver ? "text-signal-red" : full ? "text-ink-fade" : "text-ink-soft",
            ].join(" ")}
          >
            {dragOver
              ? "Release to attach"
              : full
                ? "Maximum attachments reached"
                : "Drop files or click to attach"}
          </span>

          {!full && !dragOver && (
            <span className="font-display italic text-xs text-ink-mute mt-1">
              {acceptedTypes
                .map((t) => t.split("/")[1].toUpperCase())
                .join(" · ")}
              {" — up to "}
              {formatSize(maxSize)}
              {" each, "}
              {slotsRemaining} slot{slotsRemaining === 1 ? "" : "s"} remaining
            </span>
          )}
        </div>
      </div>

      {/* Validation error */}
      {error && (
        <div
          role="alert"
          className="mt-3 border-l-[3px] border-signal-red bg-signal-red/5 px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-signal-redDeep"
        >
          {error}
        </div>
      )}

      {/* Attached files list */}
      {attachments.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">
              Attached
            </span>
            <span className="h-px flex-1 bg-ruleSoft" />
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade">
              {attachments.length} of {maxFiles}
            </span>
          </div>
          {attachments.map((a, i) => (
            <AttachmentRow
              key={`${a.filename}-${i}`}
              attachment={a}
              onRemove={onRemove ? () => onRemove(i) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================
   ATTACHMENT ROW
   ============================================ */
function AttachmentRow({
  attachment,
  onRemove,
}: {
  attachment: UploadedAttachment;
  onRemove?: () => void;
}) {
  const isImage = attachment.contentType.startsWith("image/");

  return (
    <div className="flex items-center gap-3 px-3 py-2 border border-ruleSoft bg-parchment-warm group">
      {/* Thumbnail or icon */}
      {isImage && attachment.previewUrl ? (
        <img
          src={attachment.previewUrl}
          alt={attachment.filename}
          className="w-10 h-10 object-cover border border-rule flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-10 flex items-center justify-center bg-parchment-deep border border-rule flex-shrink-0 font-mono text-[0.55rem] uppercase tracking-wider text-ink-mute">
          {isImage ? "IMG" : "DOC"}
        </div>
      )}

      {/* Filename + size */}
      <div className="flex-1 min-w-0">
        <div className="font-display text-sm text-ink truncate leading-tight">
          {attachment.filename}
        </div>
        <div className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-mute mt-0.5">
          {formatSize(attachment.sizeBytes)} ·{" "}
          {attachment.contentType.split("/")[1]?.toUpperCase() ?? attachment.contentType}
        </div>
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade hover:text-signal-red transition-colors px-2 opacity-0 group-hover:opacity-100"
          aria-label={`Remove ${attachment.filename}`}
        >
          Remove
        </button>
      )}
    </div>
  );
}
