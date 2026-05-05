import { useState } from "react";
import { PresenceDot } from "./components/PresenceDot";
import { StatusPill, type TicketStatus } from "./components/StatusPill";
import { StatusTimeline } from "./components/StatusTimeline";
import { Masthead } from "./components/Masthead";
import { ChatThread, type ChatMessage } from "./components/ChatThread";
import {
  AttachmentDropzone,
  type UploadedAttachment,
} from "./components/AttachmentDropzone";
import { useToast } from "./components/Toast";

export function Showcase() {
  return (
    <div className="min-h-screen pb-24">
      <Masthead
        compact
        rightContent={
          <div className="flex items-center gap-3">
            <PresenceDot status="online" showLabel label="Live" />
          </div>
        }
      />

      <main className="max-w-5xl mx-auto px-5 md:px-10 py-12 md:py-16">
        <Section number="01" title="Presence Indicators" subtitle="Online / offline status with sonar pulse">
          <div className="space-y-6">
            <Row label="Online — pulsing">
              <PresenceDot status="online" />
              <PresenceDot status="online" showLabel />
              <PresenceDot status="online" showLabel label="On the desk" />
            </Row>
            <Row label="Online — static (for dense lists)">
              <PresenceDot status="online" pulse={false} />
              <PresenceDot status="online" pulse={false} showLabel />
            </Row>
            <Row label="Offline">
              <PresenceDot status="offline" />
              <PresenceDot status="offline" showLabel />
              <PresenceDot status="offline" showLabel label="Away" />
            </Row>
            <Row label="In context — client roster">
              <ClientRoster />
            </Row>
          </div>
        </Section>

        <Section number="02" title="Status Pills" subtitle="Six ticket states + reopened">
          <div className="flex flex-wrap gap-2">
            {(["NEW", "REVIEWING", "FIXING", "AWAITING_CONFIRMATION", "CLOSED", "REOPENED"] as TicketStatus[]).map(
              (s) => (
                <StatusPill key={s} status={s} />
              ),
            )}
          </div>
        </Section>

        <Section number="03" title="Status Timeline" subtitle="Six-stage progress driven by ticket timestamps. Active stage pulses.">
          <div className="space-y-12">
            <TimelineExample title="Just submitted" ticket={{ createdAt: "2026-05-04T14:00:00Z", receivedAt: "2026-05-04T14:00:01Z" }} />
            <TimelineExample title="Currently fixing" ticket={{ createdAt: "2026-05-02T09:15:00Z", receivedAt: "2026-05-02T09:15:01Z", firstViewedAt: "2026-05-02T09:32:00Z", reviewingStartedAt: "2026-05-02T11:00:00Z", fixingStartedAt: "2026-05-03T08:30:00Z" }} />
            <TimelineExample title="Fully complete" ticket={{ createdAt: "2026-04-28T13:00:00Z", receivedAt: "2026-04-28T13:00:01Z", firstViewedAt: "2026-04-28T13:15:00Z", reviewingStartedAt: "2026-04-28T14:00:00Z", fixingStartedAt: "2026-04-29T09:00:00Z", fixedAt: "2026-04-30T16:45:00Z" }} />
          </div>
        </Section>

        <Section number="04" title="Chat Thread" subtitle="Per-ticket correspondence — admin red byline, client ink byline">
          <div className="grid lg:grid-cols-2 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">Client viewpoint</span>
                <span className="h-px flex-1 bg-ruleSoft" />
              </div>
              <ChatDemo viewerType="client" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">Admin viewpoint</span>
                <span className="h-px flex-1 bg-ruleSoft" />
              </div>
              <ChatDemo viewerType="admin" />
            </div>
          </div>
        </Section>

        <Section number="05" title="Attachment Dropzone" subtitle="Drag/drop image or PDF. Validates type + size client-side.">
          <AttachmentDemo />
        </Section>

        <Section number="06" title="Toast Notifications" subtitle="Newsroom ticker for sign-in/out events. Hit a button to fire one.">
          <ToastDemo />
        </Section>
      </main>
    </div>
  );
}

function Section({ number, title, subtitle, children }: { number: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-20">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">§{number}</span>
        <span className="h-px flex-1 bg-rule" />
      </div>
      <h2 className="font-display text-3xl md:text-4xl leading-tight mb-1" style={{ fontVariationSettings: '"opsz" 144' }}>{title}</h2>
      {subtitle && <p className="font-display italic text-ink-mute mb-8 text-base">{subtitle}</p>}
      <div>{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid md:grid-cols-[200px_1fr] gap-3 md:gap-8 items-start py-3 border-b border-ruleSoft last:border-b-0">
      <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute pt-1">{label}</span>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">{children}</div>
    </div>
  );
}

function ClientRoster() {
  const clients = [
    { name: "Reaves Chiropractic", site: "reaveschiropractic.com", online: true },
    { name: "Renegade Wellness Center", site: "renegadewellness.com", online: true },
    { name: "Maple Hill Bakery", site: "maplehillbakery.com", online: false },
    { name: "Henley & Sons Realty", site: "henleysonsrealty.com", online: false },
  ];
  return (
    <div className="w-full max-w-md border-l-2 border-rule pl-4">
      {clients.map((c) => (
        <div key={c.name} className="flex items-center justify-between py-2 border-b border-ruleSoft last:border-b-0">
          <div className="flex items-center gap-3 min-w-0">
            <PresenceDot status={c.online ? "online" : "offline"} pulse={c.online} />
            <div className="min-w-0">
              <div className="font-display text-base truncate">{c.name}</div>
              <div className="font-mono text-[0.65rem] uppercase tracking-wider text-ink-mute truncate">{c.site}</div>
            </div>
          </div>
          <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-fade">{c.online ? "Live" : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function TimelineExample({ title, ticket }: { title: string; ticket: Parameters<typeof StatusTimeline>[0]["ticket"] }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink-mute">{title}</span>
        <span className="h-px flex-1 bg-ruleSoft" />
      </div>
      <StatusTimeline ticket={ticket} />
    </div>
  );
}

function ChatDemo({ viewerType }: { viewerType: "client" | "admin" }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "m1", senderType: "CLIENT", senderName: "Sarah · Renegade Wellness", body: "The contact form on our about page is throwing a 500 error when someone submits. Tested it twice this morning.", createdAt: "2026-05-04T13:42:00Z", readAt: "2026-05-04T13:45:00Z" },
    { id: "m2", senderType: "ADMIN", senderName: "Christian · Developer of Code", body: "Got it — looking at the server logs now. Likely the SMTP credentials. Will have a fix within the hour.", createdAt: "2026-05-04T13:46:00Z", readAt: "2026-05-04T13:47:00Z" },
    { id: "m3", senderType: "ADMIN", senderName: "Christian · Developer of Code", body: "Confirmed — Mailgun rotated their SMTP host. Pushed the fix. Try the form now and let me know.", createdAt: "2026-05-04T14:18:00Z", attachments: [{ filename: "fix-deploy-log.txt", url: "#", contentType: "text/plain", sizeBytes: 4200 }] },
    { id: "m4", senderType: "CLIENT", senderName: "Sarah · Renegade Wellness", body: "Working perfectly. Thank you!", createdAt: "2026-05-04T14:24:00Z" },
  ]);
  return (
    <ChatThread
      messages={messages}
      viewerType={viewerType}
      otherPartyOnline={viewerType === "admin"}
      otherPartyName={viewerType === "client" ? "Christian · Developer of Code" : "Sarah · Renegade Wellness"}
      onSendMessage={async ({ body, attachments }) => {
        await new Promise((r) => setTimeout(r, 400));
        setMessages((prev) => [...prev, { id: `m${prev.length + 1}`, senderType: viewerType === "client" ? "CLIENT" : "ADMIN", senderName: viewerType === "client" ? "Sarah · Renegade Wellness" : "Christian · Developer of Code", body, createdAt: new Date().toISOString(), attachments: attachments.length ? attachments : undefined }]);
      }}
    />
  );
}

function AttachmentDemo() {
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([
    { filename: "contact-form-error.png", url: "#", contentType: "image/png", sizeBytes: 482_000 },
    { filename: "browser-console.pdf", url: "#", contentType: "application/pdf", sizeBytes: 1_200_000 },
  ]);
  return (
    <div className="max-w-2xl">
      <AttachmentDropzone
        attachments={attachments}
        onFilesAccepted={(files) => {
          setAttachments((prev) => [...prev, ...files.map((f) => ({ filename: f.name, url: "#", contentType: f.type, sizeBytes: f.size, previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined }))]);
        }}
        onRemove={(i) => setAttachments((prev) => prev.filter((_, j) => j !== i))}
      />
    </div>
  );
}

function ToastDemo() {
  const { push } = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <button className="btn-dispatch" onClick={() => push({ kind: "signin", title: "Sarah · Renegade Wellness", detail: "signed in" })}>Fire sign-in toast</button>
      <button className="btn-dispatch" onClick={() => push({ kind: "signout", title: "Sarah · Renegade Wellness", detail: "signed off" })}>Fire sign-off toast</button>
      <button className="btn-ghost" onClick={() => push({ kind: "info", title: "Reaves Chiropractic filed a new ticket", detail: "ticket #dsp-2c8a opened" })}>Fire info toast</button>
    </div>
  );
}
