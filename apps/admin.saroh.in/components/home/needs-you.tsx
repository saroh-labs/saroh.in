import { Badge } from "@saroh/ui/badge";
import { buttonVariants } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { StatCard } from "@saroh/ui/stat-card";
import Link from "next/link";

import type { ConsoleHome, NeedsYouItem } from "@/lib/home-words";
import { needsRow } from "@/lib/home-words";

/**
 * Home's "Needs you" (admin console redesign U10, R14): one row per kind of
 * thing waiting (billing Needs action, customers' reports, people who asked
 * for help, stuck sign-ups, failed jobs), each with the one link to where it
 * is fixed, already filtered. The API leaves out what this person's
 * permissions don't reach, so every link opens. Nothing waiting is one
 * all-clear line.
 */
export function NeedsYou({
    needs,
    now,
}: {
    needs: NeedsYouItem[];
    now?: Date;
}) {
    return (
        <section
            aria-labelledby="needs-you"
            className="rounded-xl border border-border bg-card px-5 py-1"
        >
            <h2
                id="needs-you"
                className="pb-1.5 pt-4 font-display text-[18px] font-semibold tracking-[-0.01em]"
            >
                Needs you
            </h2>
            {needs.length === 0 ? (
                <div className="border-t border-border py-4">
                    <EmptyState
                        size="inline"
                        title="All clear: nothing needs you right now."
                    />
                </div>
            ) : (
                <ul>
                    {needs.map((item) => {
                        const row = needsRow(item, now);
                        return (
                            <li
                                key={row.kind}
                                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border py-3.5"
                            >
                                <span className="w-28 shrink-0">
                                    <Badge variant={row.tone}>{row.area}</Badge>
                                </span>
                                <span className="flex min-w-0 flex-[1_1_18rem] flex-col gap-0.5">
                                    <span className="font-semibold">
                                        {row.title}
                                    </span>
                                    <span className="text-[13px] text-muted-foreground">
                                        {row.detail}
                                    </span>
                                </span>
                                <Link
                                    href={row.href}
                                    className={buttonVariants({
                                        variant: "outline",
                                        size: "sm",
                                    })}
                                >
                                    {row.action}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

/**
 * A few counts across Saroh, under "Needs you". Paying and failed jobs show
 * only to someone who may open Billing or Jobs (the API sends null).
 */
export function HomeCounts({ counts }: { counts: ConsoleHome["counts"] }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
                label="Businesses"
                value={counts.businesses}
                hint={`${counts.businessesThisWeek} new this week`}
            />
            <StatCard
                label="Signed up, no business yet"
                value={counts.noBusinessYet}
            />
            {counts.paying !== null && (
                <StatCard label="Paying" value={counts.paying} />
            )}
            {counts.jobsFailedToday !== null && (
                <StatCard
                    label="Jobs failed today"
                    value={counts.jobsFailedToday}
                />
            )}
        </div>
    );
}
