import { CopyButton } from "@saroh/ui/copy-button";
import Link from "next/link";

import { StatusBadge } from "@/components/shared/lists/status-badge";
import { StateBadge } from "@/components/sites/header/website-header";
import { overviewHref } from "@/components/sites/shell/group-map";
import { SiteTile } from "@/components/sites/shell/site-switcher";
import type { SiteStateTone } from "@/lib/sites/site-state";

export interface SiteCardData {
    id: string;
    name: string;
    host: string | null;
    url: string | null;
    status: { label: string; tone: SiteStateTone };
    paused: boolean;
    /** `visitsLine`'s words, or null to leave the figure out. */
    visits: string | null;
    /** `lastActivityLine`'s words, or null. */
    last: string | null;
}

/**
 * One site on All sites (WXHSites): its name, web address with Copy, status
 * and, when the API says them, its visits and who last changed it. The whole
 * card opens the site's Overview; Copy is its own press.
 */
export function SiteCard({ site }: { site: SiteCardData }) {
    return (
        <li className="relative flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors duration-fast focus-within:ring-2 focus-within:ring-ring hover:bg-muted/40">
            <div className="flex min-w-0 items-center gap-2.5">
                <SiteTile name={site.name} className="size-8" />
                <Link
                    href={overviewHref(site.id)}
                    className="min-w-0 truncate text-base font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                >
                    {site.name}
                </Link>
            </div>
            {site.host ? (
                <div className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 truncate font-mono text-sm">
                        {site.host}
                    </span>
                    {site.url ? (
                        <CopyButton
                            value={site.url}
                            label="Copy"
                            thing="web address"
                            variant="ghost"
                            className="relative z-10"
                        />
                    ) : null}
                </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-1.5">
                <StateBadge state={site.status} />
                {site.paused ? (
                    <StatusBadge size="default" tone="warning">
                        Paused
                    </StatusBadge>
                ) : null}
            </div>
            {site.visits || site.last ? (
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
                    {site.visits ? <span>{site.visits}</span> : null}
                    {site.last ? <span>{site.last}</span> : null}
                </div>
            ) : null}
        </li>
    );
}
