import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import type { WeekRow } from "@/lib/home/week";

/**
 * This week, as the Home design draws it (round 2, F7): the week's money
 * and work beside the day's, each figure a link to the rows it counts. The
 * API sends a figure only to someone who may read it — takings need
 * `payment:read`, so a Member sees their bookings and orders and no money.
 *
 * Beside the work column from 1100px, and under it below that, as the
 * design lays it out.
 */
export function ThisWeek({ rows }: { rows: WeekRow[] }) {
    const headingId = "home-this-week";
    if (rows.length === 0) return null;
    return (
        <aside
            aria-labelledby={headingId}
            className="grid min-w-0 flex-[1_1_100%] content-start gap-[9px] min-[1100px]:flex-[0_0_300px]"
        >
            <h2
                id={headingId}
                className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            >
                This week
            </h2>
            <ul className="overflow-hidden rounded-xl border border-border bg-card">
                {rows.map((row, i) => (
                    <li
                        key={row.key}
                        className={cn(i > 0 && "border-t border-border")}
                    >
                        <Link
                            href={row.href}
                            className="grid gap-0.5 px-4 py-3 text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted"
                        >
                            <span className="text-xs text-muted-foreground">
                                {row.label}
                            </span>
                            <span className="font-display text-[19px] font-semibold tabular-nums tracking-[-0.02em]">
                                {row.value}
                            </span>
                            <span
                                className={cn(
                                    "text-[12.5px]",
                                    row.bad
                                        ? "font-semibold text-destructive-subtle-foreground"
                                        : "text-muted-foreground",
                                )}
                            >
                                {row.sub}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </aside>
    );
}
