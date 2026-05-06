// Admin dashboard placeholder. Phase 8 fills this with the live ledger
// (real-time client presence, ticket queue, etc.).

export default function AdminDashboardPage() {
  return (
    <div className="max-w-6xl mx-auto px-5 md:px-10 py-12 md:py-16">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
          §
        </span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Editorial Desk
        </span>
      </div>

      <h1
        className="font-display text-4xl md:text-6xl leading-none mb-6"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Live Ledger
      </h1>

      <p className="font-display italic text-ink-mute text-lg mb-12 max-w-2xl">
        The newsroom floor — where dispatches land, where pulses tick, where the
        red light goes on. Wiring is in progress; the ledger fills in as
        Phase 8 lands.
      </p>

      <div className="border-l-[3px] border-signal-red bg-parchment-warm/60 px-6 py-5 max-w-2xl">
        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mb-2">
          For now
        </p>
        <p className="font-display text-ink-soft">
          Use the navigation to file{" "}
          <a
            href="/admin/invites"
            className="text-signal-red hover:underline underline-offset-4"
          >
            invitations
          </a>{" "}
          or browse the client roster.
        </p>
      </div>
    </div>
  );
}
