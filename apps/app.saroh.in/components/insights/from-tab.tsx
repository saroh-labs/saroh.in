import { FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { Notice } from "@saroh/ui/notice";
import { Info } from "lucide-react";

import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { PartialRead } from "@/components/shared/failed-read";
import type { AnalyticsSummary, AnalyticsView } from "@/lib/analytics/summary";
import type { SourceRead } from "@/lib/analytics/takings";
import { beforePeriod } from "@/lib/insights/compare-words";
import type { InsightsPeriod, PeriodWindow } from "@/lib/insights/period";
import { PERIOD_LABEL } from "@/lib/insights/period";

import { HowCounted } from "./overview";
import type { SiteOption } from "./site-picker";
import { SitePicker } from "./site-picker";

/**
 * Insights' "Where customers come from" tab, now (DEC-171, plan U14,
 * #1097; boards `IBFromD`, `IBSiteD`, `IBFromP`, `IBSiteP`, `IBFailedD`):
 * every website figure Insights had, for the page's one period.
 *
 * 1. "Coming next" (A9): sources and the path from visit to paid come once
 *    the site's links are tracked (U15, U16); what works today is named.
 * 2. Your website, with the site picker only when there is more than one
 *    (a sheet on a phone), keeping `siteId` in the address.
 * 3. Visits, People, Enquiries and Paid orders and bookings, each with how
 *    it moved on the period before; visits every day, a day nobody came
 *    drawn too; which pages people open, the path kept.
 *
 * Nothing Insights showed before is out of reach: the four figures and
 * the orders' counted-from note, the tappable days, the pages with their
 * paths, and `siteId` (now the picker). A read that fails is named: the
 * figures as a failed card with Try again; the period before, or the list
 * of websites, as one line, the figures still shown.
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

    return (
        <div className="flex flex-col gap-5" data-testid="from-tab">
            <Notice
                tone="warning"
                role="note"
                icon={<Info aria-hidden />}
                data-ph-unmask=""
                data-testid="from-next"
            >
                <b className="font-semibold">Coming next.</b> Sources and the
                path from visit to paid need your site&apos;s links to be
                tracked. Visits, people, enquiries, orders, visits each day and
                pages work today.
            </Notice>
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
                            {PERIOD_LABEL[period]}: visits, people, enquiries,
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
                    <FailedState
                        data-ph-unmask=""
                        size="panel"
                        title={couldntLoad("your website's figures")}
                        retryHref={retryHref}
                    />
                )}
            </section>
            <HowCounted />
        </div>
    );
}
