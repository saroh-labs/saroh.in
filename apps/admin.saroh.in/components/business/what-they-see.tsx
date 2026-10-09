import { ArrowUpRight } from "lucide-react";

import type { BusinessPresence, BusinessView } from "@/lib/businesses";
import { addressHost, addressLabel, whatTheySee } from "@/lib/what-they-see";

import { Facts } from "../panel";

/**
 * "What they see" (owner, 9 Oct): a link to each live site, opening in a
 * new tab, and what the business can use now, one line per area. Built
 * only from what the business page's read already returned.
 */
export function WhatTheySee({ view }: { view: BusinessView }) {
    const presence = view.presence?.status === "ok" ? view.presence.data : null;
    return (
        <div className="grid gap-5">
            <div className="grid gap-2">
                <p className="text-sm font-medium">Their live site</p>
                {presence ? (
                    <LiveSites sites={presence.sites} />
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Their sites couldn&rsquo;t be read just now.
                    </p>
                )}
            </div>
            <Facts
                rows={whatTheySee(view).map(
                    (line) => [line.area, line.text] as [string, string],
                )}
            />
        </div>
    );
}

function LiveSites({ sites }: { sites: BusinessPresence["sites"] }) {
    if (sites.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No site yet, so there is nothing for customers to see.
            </p>
        );
    }
    const live = sites.filter((site) => site.addresses.length > 0);
    if (live.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                Nothing is published yet, so customers can&rsquo;t see a site.
            </p>
        );
    }
    return (
        <ul className="grid gap-2">
            {live.map((site) => (
                <li key={site.id} className="grid gap-1">
                    {sites.length > 1 && (
                        <span className="text-[12.5px] text-muted-foreground">
                            {site.name}
                        </span>
                    )}
                    <ul className="flex flex-wrap gap-x-4 gap-y-1">
                        {site.addresses.map((address) => (
                            <li key={address.url} className="min-w-0">
                                <a
                                    href={address.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-w-0 items-center gap-1.5 break-all text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {addressHost(address.url)}
                                    <ArrowUpRight
                                        aria-hidden
                                        className="size-3.5 shrink-0"
                                    />
                                    <span className="sr-only">
                                        (opens in a new tab)
                                    </span>
                                </a>
                                <span className="ml-2 text-[12.5px] text-muted-foreground">
                                    {addressLabel(address)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </li>
            ))}
        </ul>
    );
}
