import { PartialRead } from "@/components/shared/states/failed-read";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { env } from "@/env";
import { formatList } from "@/lib/home/needs";
import type { ReviewRow } from "@/lib/home/reviews";
import { liveSites, reviewRows } from "@/lib/home/reviews";
import type { HomeModel } from "@/lib/home/service";
import { TextLink } from "@saroh/ui/text-link";

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
        <div className="grid min-w-0 gap-5">
            {failed ? (
                <PartialRead
                    things={formatList(
                        home.unavailable.map((part) => part.label),
                    )}
                    so="This may not be everything sent to you."
                />
            ) : null}

            <section
                aria-labelledby="home-reviews"
                className="grid min-w-0 gap-[9px]"
            >
                <h2 id="home-reviews" className="label">
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
                    <TextLink
                        key={site.id}
                        href={site.url}
                        external
                        className="justify-self-start text-[13px] coarse:min-h-11 coarse:content-center"
                    >
                        {live.length > 1
                            ? `See ${site.name} live`
                            : "See the live site"}
                    </TextLink>
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
                    className="flex items-center gap-3 bg-card px-4 py-3.5 text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent-active"
                >
                    {words}
                    <span className="shrink-0 text-[12.5px] font-semibold text-foreground">
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
