// Phase 9 builds the live client roster (presence indicators, last-seen,
// per-client site list). For now: a placeholder so the nav link doesn't 404.

import { prisma } from "@/lib/prisma";

export default async function AdminClientsPage() {
  const clients = await prisma.clientAccount.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      sites: { select: { id: true, displayName: true, url: true } },
      _count: { select: { tickets: true } },
    },
  });

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-red">
          §
        </span>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute">
          Subscriber Roster
        </span>
      </div>

      <h1
        className="font-display text-3xl md:text-5xl leading-none mb-3"
        style={{ fontVariationSettings: '"opsz" 144' }}
      >
        Clients
      </h1>
      <p className="font-display italic text-ink-mute mb-10">
        Live presence and per-client detail lands in Phase 9.
      </p>

      {clients.length === 0 ? (
        <p className="font-display italic text-ink-mute">
          No client accounts yet.
        </p>
      ) : (
        <ul className="rule-thin pt-4 divide-y divide-rule-soft">
          {clients.map((c) => (
            <li key={c.id} className="py-4">
              <div className="flex items-center justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg text-ink truncate">
                    {c.name}
                  </p>
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-ink-mute mt-1 truncate">
                    {c.email} · {c.sites.length} site{c.sites.length === 1 ? "" : "s"} · {c._count.tickets} ticket{c._count.tickets === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
