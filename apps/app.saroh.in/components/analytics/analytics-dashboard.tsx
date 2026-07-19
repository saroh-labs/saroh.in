import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";

import type {
    AnalyticsView,
    DailyPoint,
    TopPage,
} from "@/lib/analytics/service";

/** A single headline metric card. */
function StatCard({ label, value }: { label: string; value: number }) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                    {value.toLocaleString()}
                </CardTitle>
            </CardHeader>
        </Card>
    );
}

/**
 * A dependency-free daily bar chart of site views. Bars are CSS-height only
 * (no chart library, so nothing new to install), scaled to the busiest day.
 */
function DailyViewsChart({ daily }: { daily: DailyPoint[] }) {
    const max = daily.reduce((m, d) => Math.max(m, d.views), 0);
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Site views by day</CardTitle>
                <CardDescription>
                    Daily views (bar) with unique visitors in the tooltip
                </CardDescription>
            </CardHeader>
            <CardContent>
                {daily.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No views recorded in this range yet.
                    </p>
                ) : (
                    <div className="flex h-40 items-end gap-1">
                        {daily.map((d) => (
                            <div
                                key={d.date}
                                className="flex flex-1 flex-col items-center gap-1"
                                title={`${d.date}: ${d.views} views, ${d.uniques} unique`}
                            >
                                <div
                                    className="w-full rounded-t bg-primary/80"
                                    style={{
                                        height: `${
                                            max > 0
                                                ? Math.max(
                                                      2,
                                                      Math.round(
                                                          (d.views / max) * 100,
                                                      ),
                                                  )
                                                : 2
                                        }%`,
                                    }}
                                />
                                <span className="text-[10px] text-muted-foreground">
                                    {d.date.slice(5)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/** The top-visited pages table. */
function TopPagesTable({ pages }: { pages: TopPage[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Top pages</CardTitle>
                <CardDescription>
                    Most-viewed paths in this range
                </CardDescription>
            </CardHeader>
            <CardContent>
                {pages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No page-view data yet.
                    </p>
                ) : (
                    <div className="divide-y">
                        {pages.map((p) => (
                            <div
                                key={p.path}
                                className="flex items-center justify-between py-2 text-sm"
                            >
                                <span className="truncate pr-4 font-mono text-muted-foreground">
                                    {p.path}
                                </span>
                                <span className="font-medium tabular-nums">
                                    {p.views.toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/**
 * The site/enquiry/sales analytics dashboard (S7-003), rendered purely from the
 * org-safe daily aggregates. Every number here is scoped to the active
 * organization by the API (`analytics:read`); this component only presents.
 */
export function AnalyticsDashboard({ view }: { view: AnalyticsView }) {
    const { summary, daily, topPages } = view;
    return (
        <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Site views" value={summary.siteViews} />
                <StatCard
                    label="Unique visitors"
                    value={summary.uniqueVisitors}
                />
                <StatCard label="Enquiries" value={summary.enquiries} />
                <StatCard label="Orders" value={summary.orders} />
            </div>
            <DailyViewsChart daily={daily} />
            <TopPagesTable pages={topPages} />
        </div>
    );
}
