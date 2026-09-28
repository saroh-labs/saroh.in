import { PartialNotice } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { env } from "@/env";
import { formatList } from "@/lib/home/needs";
import type { ReviewRow } from "@/lib/home/reviews";
import { liveSites, reviewRows } from "@/lib/home/reviews";
import type { HomeModel } from "@/lib/home/service";

/** Where a merchant's subdomain lives, as the Website screen reads it. */
const ROOT_DOMAIN = env.NEXT_PUBLIC_ROOT_DOMAIN ?? "saroh.app";

/**
 * A Reviewer's Home, as the Home design draws it for Dalia (round 2, F9):
 * "Sent to you for review" — a row per page waiting on them, each opening
 * the Review tab on that page — and "See the live site". Nothing about the
 * business: the API sends only the sites they were granted, and no other
 * source is read for them.
 *
 * A read that failed is named, never shown as "Nothing sent to you".
 */
export function ReviewerHome({ home }: { home: HomeModel }) {
    const sites = home.reviews ?? [];
    const failed = home.unavailable.length > 0;
    const zone = home.lastDay?.zone ?? "Asia/Kolkata";
    const rows =
        failed && sites.length === 0
            ? []
            : reviewRows(sites, { zone, now: new Date() });
    const live = liveSites(sites, ROOT_DOMAIN);

    return (
        <div className="grid min-w-0 max-w-[720px] gap-5">
            {failed ? (
                <PartialNotice>
                    {formatList(home.unavailable.map((part) => part.label))}{" "}
                    could not be loaded, so this may not be everything sent to
                    you.
                </PartialNotice>
            ) : null}

            <section
                aria-labelledby="home-reviews"
                className="grid min-w-0 gap-[9px]"
            >
                <h2
                    id="home-reviews"
                    className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                >
                    Sent to you for review
                </h2>
                {rows.length > 0 ? (
                    <ul className="overflow-hidden rounded-xl border border-border bg-card">
                        {rows.map((row, i) => (
                            <ReviewItem
                                key={row.key}
                                row={row}
                                first={i === 0}
                            />
                        ))}
                    </ul>
                ) : null}
                {live.map((site) => (
                    <a
                        key={site.id}
                        href={site.url}
                        target="_blank"
                        rel="noreferrer"
                        className="justify-self-start rounded text-[13px] font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:min-h-11 coarse:content-center"
                    >
                        {live.length > 1
                            ? `See ${site.name} live`
                            : "See the live site"}
                    </a>
                ))}
            </section>
        </div>
    );
}

function ReviewItem({ row, first }: { row: ReviewRow; first: boolean }) {
    const words = (
        <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-sm font-semibold">{row.title}</span>
            <span className="text-pretty text-[12.5px] text-muted-foreground">
                {row.sub}
            </span>
        </span>
    );
    return (
        <li className={cn(!first && "border-t border-border")}>
            {row.href ? (
                <Link
                    href={row.href}
                    className="flex items-center gap-3 bg-card px-4 py-3.5 text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                    {words}
                    <span className="shrink-0 text-[12.5px] font-semibold text-brand-subtle-foreground">
                        Open
                    </span>
                </Link>
            ) : (
                <div className="flex items-center gap-3 bg-card px-4 py-3.5 text-foreground">
                    {words}
                </div>
            )}
        </li>
    );
}
