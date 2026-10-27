import { cn } from "@/lib/cn";
import Link from "next/link";
import type { ReactNode } from "react";

import { QUIET_LINK } from "./styles";

export interface Crumb {
    name: ReactNode;
    /** Every crumb but the page itself links; the last never does (no self-link). */
    href?: string;
}

/**
 * The trail above a Resources page's title (plan U1, the Resources
 * designs): "Changelog / 17 Oct 2026", 14px Ink 500 with "/" between. The
 * last crumb is the page itself: not a link, marked `aria-current`.
 * `mono` sets the last one in JetBrains Mono, Saffron 700, as the changelog
 * entry draws its date.
 */
export function Breadcrumbs({
    crumbs,
    mono = false,
    className,
}: {
    crumbs: Crumb[];
    mono?: boolean;
    className?: string;
}) {
    return (
        <nav aria-label="Breadcrumb" className={className}>
            <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0 text-[14px] text-muted-foreground">
                {crumbs.map((crumb, i) => {
                    const last = i === crumbs.length - 1;
                    return (
                        <li key={i} className="flex items-center gap-2">
                            {i > 0 ? <span aria-hidden>/</span> : null}
                            {last ? (
                                <span
                                    aria-current="page"
                                    className={cn(
                                        mono &&
                                            "font-mono text-[13.5px] text-brand-700",
                                    )}
                                >
                                    {crumb.name}
                                </span>
                            ) : (
                                <Link
                                    href={crumb.href ?? "/"}
                                    className={QUIET_LINK}
                                >
                                    {crumb.name}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
