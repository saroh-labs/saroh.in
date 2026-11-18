import { EmptyState } from "@saroh/ui/empty-state";
import { TextLink } from "@saroh/ui/text-link";

import { formatNumber } from "@/lib/format/money";
import { insightsHref } from "@/lib/insights/period";
import type { SiteOverview } from "@/lib/sites/service";

import { resultParts, resultsRange, weekdayOf } from "./overview-words";

/**
 * What the site brought in over the business's last 7 days (WXHOverview):
 * the results line, then each day's visits and the total. Only measured
 * parts (A3). With no visits it says so plainly; it never draws a row of
 * zeros as if they were news.
 */
export function ResultsLine({
    results,
    live,
    host,
}: {
    results: NonNullable<SiteOverview["results"]>;
    live: boolean;
    host: string | null;
}) {
    return (
        <section
            aria-labelledby="ov-results"
            className="flex min-w-0 flex-col gap-3"
        >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 id="ov-results" className="text-base font-semibold">
                    What the site brought in, last 7 days
                </h2>
                <span className="text-sm text-muted-foreground">
                    {resultsRange(results)}
                </span>
                <TextLink
                    href={insightsHref({ period: "7d" })}
                    className="ml-auto text-sm"
                >
                    Open Insights
                </TextLink>
            </div>
            {results.visits === 0 ? (
                <EmptyState
                    size="inline"
                    title={
                        live ? "No visits in the last 7 days" : "No visits yet"
                    }
                    description={
                        live
                            ? `Your site is live${host ? ` at ${host}` : ""}. Share it and visits show here.`
                            : "Your site isn't live yet. Publish it and the first visits show here."
                    }
                />
            ) : (
                <>
                    <p
                        data-results-line=""
                        className="text-sm text-muted-foreground"
                    >
                        {resultParts(results).map((part, i) => (
                            <span key={part}>
                                {i > 0 ? " · " : null}
                                <b className="font-semibold text-foreground">
                                    {part}
                                </b>
                            </span>
                        ))}
                    </p>
                    <ol
                        aria-label="Visits each day"
                        className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-border bg-border min-[560px]:grid-cols-8"
                    >
                        {results.days.map((day) => (
                            <li key={day.date} className="bg-card px-3 py-2.5">
                                <span className="block text-xs text-muted-foreground">
                                    {weekdayOf(day.date)}
                                </span>
                                <span className="block font-display text-lg font-semibold tabular-nums">
                                    {formatNumber(day.visits)}
                                </span>
                            </li>
                        ))}
                        <li className="bg-muted px-3 py-2.5">
                            <span className="block text-xs text-muted-foreground">
                                Total
                            </span>
                            <span className="block font-display text-lg font-semibold tabular-nums">
                                {formatNumber(results.visits)}
                            </span>
                        </li>
                    </ol>
                </>
            )}
        </section>
    );
}
