import { FailedRead } from "@saroh/ui/failed-read";

import type { SiteOverview } from "@/lib/sites/service";
import type { SiteStateTone } from "@/lib/sites/site-state";

import { ActivityList } from "./activity-list";
import { NeedsDoing } from "./needs-doing";
import { ResultsLine } from "./results-line";
import { AddressCard, StatusCard } from "./status-card";

/**
 * A site's Overview (WXHOverview, plan 2026-11-18-001 U4): where people
 * reach it and whether it is right, what it brought in, what needs doing
 * and what happened lately. `overview` is null when its read failed: the
 * address and status still show (they come from the site), and the rest
 * says it couldn't load, with Try again; the site header above is kept.
 */
export function Overview({
    siteId,
    overview,
    status,
    live,
    host,
    url,
    canEdit,
    canPublish,
    timeZone,
    now = new Date(),
}: {
    siteId: string;
    overview: SiteOverview | null;
    status: { label: string; tone: SiteStateTone; waiting: number };
    live: boolean;
    host: string | null;
    url: string | null;
    canEdit: boolean;
    canPublish: boolean;
    timeZone: string;
    now?: Date;
}) {
    return (
        <div data-site-overview="" className="flex min-w-0 flex-col gap-6">
            <div className="grid min-w-0 gap-5 min-[1100px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                <AddressCard
                    siteId={siteId}
                    host={host}
                    url={url}
                    live={live}
                />
                <StatusCard
                    siteId={siteId}
                    status={status}
                    lastPublished={overview?.lastPublished ?? null}
                    canPublish={canPublish}
                    timeZone={timeZone}
                    now={now}
                />
            </div>
            {overview === null ? (
                <FailedRead
                    size="panel"
                    things="the overview"
                    reassurance="Your site is unaffected."
                />
            ) : (
                <>
                    {overview.results ? (
                        <ResultsLine
                            results={overview.results}
                            live={live}
                            host={host}
                        />
                    ) : null}
                    <div className="grid min-w-0 gap-6 min-[1100px]:grid-cols-2">
                        <NeedsDoing
                            siteId={siteId}
                            pages={overview.needsDoing}
                            canEdit={canEdit}
                        />
                        <ActivityList
                            activity={overview.activity}
                            timeZone={timeZone}
                            now={now}
                        />
                    </div>
                </>
            )}
        </div>
    );
}
