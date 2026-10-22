import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { Route } from "lucide-react";

import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { PartialRead } from "@/components/shared/states/failed-read";
import type { AnalyticsSummary, AnalyticsView } from "@/lib/analytics/summary";
import type { SourceRead } from "@/lib/analytics/takings";
import { beforePeriod } from "@/lib/insights/compare-words";
import type { SiteLinksRead } from "@/lib/insights/link-maker";
import type { InsightsPeriod, PeriodWindow } from "@/lib/insights/period";
import { PERIOD_LABEL } from "@/lib/insights/period";
import type { SourcesRead } from "@/lib/insights/reads";
import { countedFromLine } from "@/lib/insights/sources-words";

import { HowCounted } from "./overview";
import type { LinkSite } from "./site-links";
import { SiteLinks } from "./site-links";
import type { SiteOption } from "./site-picker";
import { SitePicker } from "./site-picker";
import { SourcesTable } from "./sources-table";
import { VisitPath } from "./visit-path";

/**
 * Insights' "Where customers come from" tab (DEC-171, plan U14, #1097,
 * and U16, #1101; boards `IBFromD`, `IBSiteD`, `IBFromP`, `IBSiteP`,
 * `IBFailedD`): every website figure Insights had, for the page's one
 * period, and where the visits came from.
 *
 * 1. Your website, with the site picker only when there is more than one
 *    (a sheet on a phone), keeping `siteId` in the address.
 * 2. Visits, Visitors, Enquiries and Paid orders and bookings, each with
 *    how it moved on the period before ("People" went back to "Visitors",
 *    owner, 21 Oct: a visitor who comes back another day is counted again).
 * 3. From visit to paid and Where do visitors come from? (U16), side by
 *    side at a desk and one under the other on a phone; when counting
 *    began inside the period the line above them says from when, and
 *    before anything is counted one message says it starts with the next
 *    visit. The "Coming next" banner (A9) went when these came. Under
 *    them, the links made in Saroh (DEC-181, `site-links.tsx`): only these
 *    are counted as themselves; make one, copy it, archive it with Undo.
 * 4. Visits every day, a day nobody came drawn too; which pages people
 *    open, the path kept.
 *
 * Nothing Insights showed before is out of reach: the four figures and
 * the orders' counted-from note, the tappable days, the pages with their
 * paths, and `siteId` (now the picker). A read that fails is named: the
 * figures as a failed card with Try again, and the sources likewise, each
 * apart; the period before, or the list of websites, as one line, the
 * figures still shown.
 */
export function FromTab({
    period,
    window,
    current,
    before,
    sites,
    sitesFailed,
    siteId,
    retryHref,
    sources = null,
    links = null,
    linkSites = [],
    canMakeLinks = false,
    today,
}: {
    period: InsightsPeriod;
    window: PeriodWindow;
    /** The period's figures, for the website chosen. */
    current: SourceRead<AnalyticsView>;
    /** The period before's, to say how each moved. */
    before: SourceRead<AnalyticsSummary>;
    /** "All your sites" and each website; null or one site: no picker. */
    sites: readonly SiteOption[] | null;
    /** The list of websites couldn't be read. */
    sitesFailed: boolean;
    /** The website chosen, or null for all of them. */
    siteId: string | null;
    /** This tab, period and website again, for Try again. */
    retryHref: string;
    /** Where the period's visits came from (U16); null: not read. */
    sources?: SourceRead<SourcesRead> | null;
    /** The links made in Saroh (DEC-181); null: not read. */
    links?: SourceRead<SiteLinksRead> | null;
    /** The websites a link opens, with their real addresses. */
    linkSites?: readonly LinkSite[];
    /** Making and archiving a link is the website's (`site:update`). */
    canMakeLinks?: boolean;
    /** Today in the business's zone, `2026-10-19`, for the dates said. */
    today?: string;
}) {
    // "All your sites" plus at least two: a choice worth offering.
    const picker = sites && sites.length > 2 ? sites : null;
    const chosen = picker?.find((s) => s.id === siteId) ?? null;
    // What else couldn't be read, said once above the figures that did.
    const beforeFailed = current.status === "ok" && before.status !== "ok";
    const failed = [
        beforeFailed ? beforePeriod(period) : null,
        sitesFailed ? "your list of websites" : null,
    ].filter((x): x is string => x !== null);
    const sourcesPart = (
        <>
            <SourcesPart
                sources={sources}
                period={period}
                retryHref={retryHref}
                today={today}
            />
            <SiteLinks
                // A new list for each website and period chosen.
                key={`${siteId ?? "all"}:${period}`}
                read={links}
                sites={linkSites}
                siteId={siteId}
                canMake={canMakeLinks}
                retryHref={retryHref}
            />
        </>
    );

    return (
        <div className="flex flex-col gap-5" data-testid="from-tab">
            <section aria-labelledby="website-heading" className="grid gap-4">
                <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                        <h2
                            id="website-heading"
                            data-ph-unmask=""
                            className="font-display text-[19px] font-semibold tracking-[-0.025em]"
                        >
                            Your website
                        </h2>
                        <p
                            data-ph-unmask=""
                            className="mt-1 text-[13px] leading-[1.5] text-muted-foreground"
                        >
                            {PERIOD_LABEL[period]}: visits, visitors, enquiries,
                            and paid orders and bookings
                            {chosen?.id ? (
                                <>
                                    {" "}
                                    for{" "}
                                    <span data-ph-mask="">{chosen.name}</span>
                                </>
                            ) : picker ? (
                                " for all your sites"
                            ) : null}
                            . Updated every hour.
                        </p>
                    </div>
                    {picker ? (
                        <SitePicker
                            value={chosen?.id ?? null}
                            options={picker}
                        />
                    ) : null}
                </div>
                {failed.length > 0 ? (
                    <div data-testid="from-partial" data-ph-unmask="">
                        <PartialRead
                            things={failed.join(" or ")}
                            so={
                                beforeFailed
                                    ? "The figures are shown without how they moved."
                                    : "Another website can be chosen once it loads."
                            }
                        />
                    </div>
                ) : null}
                {current.status === "ok" ? (
                    <AnalyticsDashboard
                        between={sourcesPart}
                        view={current.data}
                        before={before.status === "ok" ? before.data : null}
                        oneSite={siteId !== null}
                        range={{
                            from: window.from,
                            to: window.to,
                            period,
                            label: PERIOD_LABEL[period]
                                .replace(/^Last /, "")
                                .toLowerCase(),
                        }}
                    />
                ) : (
                    <>
                        <FailedState
                            data-ph-unmask=""
                            size="panel"
                            title={couldntLoad("your website's figures")}
                            retryHref={retryHref}
                        />
                        {sourcesPart}
                    </>
                )}
            </section>
            <HowCounted />
        </div>
    );
}

/**
 * The path from visit to paid and where visitors come from (U16, #1101),
 * read apart from the figures: a failure is its own card with Try again,
 * and before anything is counted one message says when it begins.
 */
function SourcesPart({
    sources,
    period,
    retryHref,
    today,
}: {
    sources: SourceRead<SourcesRead> | null;
    period: InsightsPeriod;
    retryHref: string;
    today?: string;
}) {
    if (!sources || sources.status === "denied") return null;
    if (sources.status === "failed") {
        return (
            <FailedState
                data-ph-unmask=""
                data-testid="sources-failed"
                size="panel"
                title={couldntLoad("where visits come from")}
                retryHref={retryHref}
            />
        );
    }
    const read = sources.data;
    if (read.countedFrom === null) {
        return (
            <EmptyState
                data-testid="sources-not-yet"
                size="panel"
                icon={<Route />}
                title="Where visits come from is counted from the next visit to your site"
                description="Then this shows how many visits look at something, start an order or booking and pay, and which sites and apps they came from."
            />
        );
    }
    const counted = countedFromLine(read, today);
    return (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
            {counted ? (
                <p
                    data-testid="sources-counted-from"
                    data-ph-unmask=""
                    className="max-w-[68ch] text-[13px] leading-[1.5] text-muted-foreground"
                >
                    {counted}
                </p>
            ) : null}
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2">
                <VisitPath path={read.path} period={period} />
                <SourcesTable read={read} period={period} />
            </div>
        </div>
    );
}
