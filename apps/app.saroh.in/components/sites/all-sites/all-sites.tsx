import { Database } from "lucide-react";

import type { SiteCardData } from "./site-card";
import { SiteCard } from "./site-card";

/**
 * All sites (WXHSites, WXHSitesPhone): a card per site, three across on a
 * desk and one on a phone, and the line that says what the business shares
 * (one web address for now, DEC-230). The page's header holds New site.
 */
export function AllSites({ sites }: { sites: readonly SiteCardData[] }) {
    return (
        <div className="flex flex-col gap-6">
            <ul
                aria-label="Your sites"
                className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
                {sites.map((site) => (
                    <SiteCard key={site.id} site={site} />
                ))}
            </ul>
            <p className="flex max-w-[68ch] items-start gap-2.5 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                <Database aria-hidden className="mt-0.5 size-4 shrink-0" />
                Services, products, bookings and customers belong to the
                business, so your site shows them. More sites, each with its own
                address, come later.
            </p>
        </div>
    );
}
