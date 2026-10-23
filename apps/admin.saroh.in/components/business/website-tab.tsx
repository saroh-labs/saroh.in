import { Badge } from "@saroh/ui/badge";
import { CopyButton } from "@saroh/ui/copy-button";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { Panel } from "@/components/panel";
import { EmptyPanel } from "@/components/states/empty-panel";
import type { PresenceRow } from "@/lib/business-words";
import { paymentsRow, siteRows } from "@/lib/business-words";
import type { OverviewPanel, OverviewWebsite } from "@/lib/overview-words";

/**
 * Website and payments (admin plan U6, R7): each site and whether it is
 * published, the payments connection, and each site's trackers.
 *
 * The site and payments rows come from the Overview's read, so they need
 * no support session (R10). Publishing a site and connecting a payment
 * provider are the business's alone, so those rows say so and offer the
 * steps to send them (Copy steps). Trackers carry who switched them off
 * and why, so they arrive as `trackers`, drawn inside a support session
 * by the page.
 */
export function WebsiteTab({
    businessName,
    website,
    trackers,
}: {
    businessName: string;
    website: OverviewPanel<OverviewWebsite>;
    /** The Trackers panel's body, or what to show while it can't be read. */
    trackers: ReactNode;
}) {
    return (
        <div className="grid gap-5">
            <Panel
                title="Website"
                description="Their sites, and whether customers can see them."
                data={website}
            >
                {(w) =>
                    w.sites.length === 0 ? (
                        <EmptyPanel
                            size="inline"
                            title="No website yet"
                            description="The business hasn't made a site. Only they can."
                        />
                    ) : (
                        <PresenceRows rows={siteRows(w, businessName)} />
                    )
                }
            </Panel>
            <Panel
                title="Payments"
                description="How their customers pay online. Yes or no, never a key."
                data={website}
            >
                {(w) => (
                    <PresenceRows
                        rows={[paymentsRow(w.payments, businessName)]}
                    />
                )}
            </Panel>
            <Panel
                title="Trackers"
                description="Each site's own trackers. Switched off by Saroh, none load, whatever the plan, until Saroh switches them back on."
            >
                {() => trackers}
            </Panel>
        </div>
    );
}

/** Rows that stack on a phone: what it is, its state, and the one fix. */
export function PresenceRows({ rows }: { rows: PresenceRow[] }) {
    return (
        <ul className="grid">
            {rows.map((row) => (
                <li
                    key={row.key}
                    data-row={row.key}
                    className="flex flex-wrap items-start justify-between gap-3 border-b py-3 last:border-0"
                >
                    <div className="grid min-w-0 flex-1 basis-64 gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="min-w-0 break-words text-sm font-medium">
                                {row.label}
                            </span>
                            <Badge variant={row.tone}>{row.state}</Badge>
                        </div>
                        {row.link && (
                            <a
                                href={row.link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-w-0 items-center gap-1.5 break-all font-mono text-[12.5px] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {row.link.text}
                                <ArrowUpRight
                                    aria-hidden
                                    className="size-3.5 shrink-0"
                                />
                                <span className="sr-only">
                                    (opens in a new tab)
                                </span>
                            </a>
                        )}
                        <p className="break-words text-[13px] text-muted-foreground">
                            {row.text}
                        </p>
                    </div>
                    {row.steps && (
                        <CopyButton
                            value={row.steps}
                            label="Copy steps"
                            thing="steps"
                        />
                    )}
                </li>
            ))}
        </ul>
    );
}
