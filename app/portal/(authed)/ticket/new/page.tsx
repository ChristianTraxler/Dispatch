import { redirect } from "next/navigation";
import { getCurrentClientAccount } from "@/lib/auth/client-session";
import { type NewTicketSite } from "@/components/NewTicketPage";
import { NewTicketClient } from "./new-ticket-client";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const account = await getCurrentClientAccount();
  if (!account) redirect("/portal");

  if (account.sites.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-5 md:px-10 py-12">
        <div className="border-l-[3px] border-signal-red bg-signal-red/5 px-6 py-5">
          <p className="font-mono text-[0.65rem] uppercase tracking-widest text-signal-redDeep mb-2">
            No sites on file
          </p>
          <p className="font-display text-ink-soft">
            We can&rsquo;t open a ticket without a site to attach it to. Contact{" "}
            <a
              href="mailto:hello@developerofcode.com"
              className="text-signal-red hover:underline"
            >
              hello@developerofcode.com
            </a>{" "}
            to add one.
          </p>
        </div>
      </div>
    );
  }

  const sites: NewTicketSite[] = account.sites.map((s) => ({
    id: s.id,
    url: s.url,
    displayName: s.displayName,
  }));

  const params = await searchParams;
  return <NewTicketClient sites={sites} defaultSiteId={params.site} />;
}
