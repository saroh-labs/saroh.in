import { cn } from "@/lib/cn";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Arrow } from "../shared/links/arrow";
import { cardLinkClasses } from "../shared/links/card-link";

interface Neighbour {
    name: string;
    href: string;
}

const CARD = cardLinkClasses("min-w-0 gap-1 px-5 py-4");

/**
 * Previous and next in a Resources set (plan U1, R1): two cards at the foot
 * of the page, "Previous" left and "Next" right, each with the page's name.
 * Either may be missing at the ends of the set.
 */
export function PrevNext({
    prev,
    next,
    className,
}: {
    prev?: Neighbour;
    next?: Neighbour;
    className?: string;
}) {
    if (!prev && !next) return null;
    return (
        <nav
            aria-label="Previous and next"
            className={cn(
                "grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3",
                className,
            )}
        >
            {prev ? (
                <Link href={prev.href} rel="prev" className={CARD}>
                    <span className="text-[13px] text-muted-foreground">
                        Previous
                    </span>
                    <span className="text-[15.5px] font-semibold">
                        <ArrowLeft
                            aria-hidden
                            strokeWidth={2.25}
                            className="mr-[0.25em] inline-block size-[0.9em] align-[-0.1em]"
                        />
                        {prev.name}
                    </span>
                </Link>
            ) : (
                <span aria-hidden />
            )}
            {next ? (
                <Link
                    href={next.href}
                    rel="next"
                    className={cn(CARD, "text-right")}
                >
                    <span className="text-[13px] text-muted-foreground">
                        Next
                    </span>
                    <span className="text-[15.5px] font-semibold">
                        {next.name}
                        <Arrow />
                    </span>
                </Link>
            ) : null}
        </nav>
    );
}
