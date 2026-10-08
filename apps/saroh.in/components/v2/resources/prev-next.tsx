import { cn } from "@/lib/cn";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Arrow } from "../arrow";

interface Neighbour {
    name: string;
    href: string;
}

const CARD =
    "grid min-w-0 cursor-pointer gap-1 rounded-mk-card border border-border bg-card px-5 py-4 text-foreground no-underline transition-colors duration-fast ease-out hover:border-border-strong hover:text-foreground active:bg-mk-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";

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
