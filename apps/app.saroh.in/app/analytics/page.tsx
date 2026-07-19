import { Button } from "@saroh/ui/button";
import Link from "next/link";

import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import {
    getAnalyticsDashboard,
    summarizeAnalytics,
} from "@/lib/analytics/service";
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
 * Site/enquiry/sales analytics dashboard for the active organization (S7-003).
 * Reads the org-safe daily aggregates (S7-002) via `analytics:read` and folds
 * them into headline stats + a daily views chart + a top-pages table. A quick
 * range selector (7/30/90 days) drives the `from` filter; the API guarantees
 * every row belongs to the active org.
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

    const rows = await getAnalyticsDashboard({
        from,
        ...(params.siteId ? { siteId: params.siteId } : {}),
    });
    const view = summarizeAnalytics(rows);

    return (
        <main className="mx-auto max-w-5xl p-8">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Analytics</h1>
                    <p className="text-sm text-muted-foreground">
                        Last {range.label} · site views, enquiries and sales
                    </p>
                </div>
                <div className="flex items-center gap-3">
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
                                >
                                    {r.label}
                                </Link>
                            </Button>
                        ))}
                    </div>
                    <Link
                        href="/"
                        className="text-sm text-muted-foreground hover:underline"
                    >
                        ← Dashboard
                    </Link>
                </div>
            </div>

            <AnalyticsDashboard view={view} />
        </main>
    );
}
