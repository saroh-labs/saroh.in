import { Button } from "@saroh/ui/button";
import { FailedState, PartialNotice } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { TakingsSection } from "@/components/analytics/takings-section";
import { PageContainer } from "@/components/shared/page-container";
import {
    readTakings,
    readTraffic,
    summarizeAnalytics,
} from "@/lib/analytics/service";
import { ApiError } from "@/lib/api/errors";
import { requireSession } from "@/lib/session";

/** Supported quick date ranges (label → days back from today). */
const RANGES: { key: string; label: string; days: number }[] = [
    { key: "7d", label: "7 days", days: 7 },
    { key: "30d", label: "30 days", days: 30 },
    { key: "90d", label: "90 days", days: 90 },
];

/** ISO `YYYY-MM-DD` for `daysBack` days before now (UTC day boundary). */
function isoDaysAgo(daysBack: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysBack);
    return d.toISOString().slice(0, 10);
}

/**
 * A page title is how a merchant with six tabs open finds this one.
 * Without it the tab reads the bare default, "Saroh", on every route.
 */
export const metadata = { title: "Insights" };

/**
 * Insights (DEC-075): the business's takings first — answers in words,
 * then the figures behind them — and the website's views and visitors
 * under them (S7-003).
 *
 * The two are read side by side and fail apart: a source that could not be
 * read is named above what did arrive, never shown as nothing. Both failing
 * is the segment boundary's. A role without Insights (`analytics:read`) is
 * denied the page; a role with Insights but not payments sees the website
 * and is told why the takings aren't there.
 */
export default async function AnalyticsPage({
    searchParams,
}: {
    searchParams?: Promise<{ range?: string; siteId?: string }>;
}) {
    await requireSession();

    const params = (await searchParams) ?? {};
    const range =
        RANGES.find((r) => r.key === params.range) ??
        RANGES[1]; /* default 30 days */
    const from = isoDaysAgo(range.days);

    const [takings, traffic] = await Promise.all([
        readTakings(),
        readTraffic({
            from,
            ...(params.siteId ? { siteId: params.siteId } : {}),
        }),
    ]);
    // Without Insights' own read the page is not theirs (#274): the shell's
    // forbidden page explains it. Outside any try, so the interrupt lands.
    if (traffic.status === "denied") forbidden();
    if (traffic.status === "failed" && takings?.status !== "ok") {
        throw new ApiError(503, "GET analytics");
    }

    const missing =
        takings?.status === "failed"
            ? "Sales couldn't be loaded, so only your website's figures are shown."
            : traffic.status === "failed"
              ? "Your website's figures couldn't be loaded, so only sales are shown."
              : null;

    return (
        <PageContainer width="wide">
            <PageHeader
                title="Insights"
                description="How this week is going, what the business took week by week, and how your website is doing."
            />

            {missing ? (
                <PartialNotice
                    action={
                        <Button asChild size="sm" variant="outline">
                            <Link href="/analytics">Try again</Link>
                        </Button>
                    }
                >
                    {missing}
                </PartialNotice>
            ) : null}

            {takings ? <TakingsSection read={takings} /> : null}

            <section aria-labelledby="website-heading" className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                        <h2
                            id="website-heading"
                            className="font-display text-[19px] font-semibold tracking-[-0.025em]"
                        >
                            Your website
                        </h2>
                        <p className="mt-1 text-[13px] leading-[1.5] text-muted-foreground">
                            Last {range.label}: visits, visitors, enquiries and
                            paid orders. Updated every hour.
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        {RANGES.map((r) => (
                            <Button
                                key={r.key}
                                asChild
                                size="sm"
                                variant={
                                    r.key === range.key ? "default" : "outline"
                                }
                            >
                                <Link
                                    href={`/analytics?range=${r.key}${
                                        params.siteId
                                            ? `&siteId=${params.siteId}`
                                            : ""
                                    }`}
                                    aria-current={
                                        r.key === range.key ? "true" : undefined
                                    }
                                >
                                    {r.label}
                                </Link>
                            </Button>
                        ))}
                    </div>
                </div>
                {traffic.status === "ok" ? (
                    <AnalyticsDashboard
                        view={summarizeAnalytics(traffic.data)}
                        range={{
                            from,
                            to: isoDaysAgo(0),
                            label: range.label,
                        }}
                    />
                ) : (
                    <FailedState
                        title="Your website's figures could not be loaded"
                        action={
                            <Button asChild variant="outline">
                                <Link href="/analytics">Try again</Link>
                            </Button>
                        }
                    />
                )}
            </section>
        </PageContainer>
    );
}
