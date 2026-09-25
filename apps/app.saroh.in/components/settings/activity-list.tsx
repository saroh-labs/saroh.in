import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { ActivityLine } from "@/lib/settings/activity";

/**
 * Settings › Activity ("Saroh Settings" design): one ruled card, 760px at
 * most, a line per change — when, who and what, and a link to where it
 * happened. The time is the viewer's own ("Today 09:14"), as a log reads.
 *
 * Below 480px the where-link drops under the sentence rather than squeezing
 * it: the sentence is the thing being read.
 */
export function ActivityList({ lines }: { lines: readonly ActivityLine[] }) {
    return (
        <section
            aria-label="Activity"
            className="max-w-[760px] overflow-hidden rounded-xl border border-border bg-card"
        >
            <ol>
                {lines.map((line) => (
                    <li
                        key={line.id}
                        className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-t border-border/70 px-[18px] py-[11px] text-[13px] first:border-t-0 min-[480px]:grid-cols-[96px_minmax(0,1fr)_auto]"
                    >
                        <ViewerDate
                            iso={line.at}
                            variant="recent"
                            className="tabular-nums text-muted-foreground"
                        />
                        <span className="min-w-0 text-pretty">
                            <strong className="font-semibold">
                                {line.who}
                            </strong>{" "}
                            {line.what}
                        </span>
                        <Link
                            href={line.where.href}
                            className="col-start-2 justify-self-start rounded-sm text-[12.5px] font-semibold text-brand hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[480px]:col-start-auto"
                        >
                            {line.where.label}
                        </Link>
                    </li>
                ))}
            </ol>
        </section>
    );
}
