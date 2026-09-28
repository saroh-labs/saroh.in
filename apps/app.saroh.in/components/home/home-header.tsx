import Link from "next/link";

import { dateLine, greeting, sinceLinks } from "@/lib/home/last-day";
import type { HomeLastDay } from "@/lib/home/service";

/**
 * Home's header, as the design draws it (round 2, F6): the greeting in the
 * business's part of the day, the business's date and name, and "Last 24
 * hours" — each figure a link to exactly the rows it counts (`?since=`).
 *
 * It replaces the page title "Home": the rail already says where you are,
 * and the design spends the line on who and when instead. The strip is left
 * out for a new business and on a quiet day, never drawn as zeros; a strip
 * that couldn't be read is named in the notice under it, with the rest.
 */
export function HomeHeader({
    lastDay,
    name,
    businessName,
    only = null,
}: {
    lastDay: HomeLastDay | null;
    /** The viewer's own name, from their session. */
    name: string | null | undefined;
    businessName: string;
    /** A staff member's storefronts, "Hill Road only" (F11); else null. */
    only?: string | null;
}) {
    const links = sinceLinks(lastDay);

    return (
        <header className="grid gap-1">
            <h1 className="text-balance font-display text-[28px] font-semibold tracking-[-0.03em]">
                {greeting(lastDay, name)}
            </h1>
            <p className="text-[13.5px] text-muted-foreground">
                {dateLine(lastDay, businessName, only)}
            </p>
            {links.length > 0 ? (
                <div
                    role="group"
                    aria-labelledby="home-last-24-hours"
                    className="mt-2 flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 text-[13px] text-foreground/80"
                >
                    <span
                        id="home-last-24-hours"
                        className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                    >
                        Last 24 hours
                    </span>
                    {links.map((link) => (
                        <Link
                            key={link.key}
                            href={link.href}
                            className="rounded-sm underline decoration-border-strong underline-offset-[3px] transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            {link.label}
                        </Link>
                    ))}
                </div>
            ) : null}
        </header>
    );
}
