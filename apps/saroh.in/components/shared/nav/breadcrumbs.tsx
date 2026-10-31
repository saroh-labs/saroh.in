import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

import { IntentLink } from "../links/intent-link";
import { textLinkClasses } from "../links/text-link";

export interface Crumb {
    name: ReactNode;
    /** Every crumb but the page itself links; the last never does (no self-link). A middle crumb without one is plain words. */
    href?: string;
}

/**
 * The trail above a page's title (DEC-195, V2): "Changelog / 17 Oct 2026",
 * 14px Ink 500 with "/" between. The last crumb is the page itself: not a
 * link, marked `aria-current`.
 *
 * - `current="plain"` — the page's crumb as the rest (Help, Integrations).
 * - `current="brand"` — Saffron 700, 600: a feature or solution hero.
 * - `current="mono"` — JetBrains Mono, Saffron 700: a changelog entry's date.
 */
export function Breadcrumbs({
    crumbs,
    current = "plain",
    className,
}: {
    crumbs: Crumb[];
    current?: "plain" | "brand" | "mono";
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
                                        current === "brand" &&
                                            "font-semibold text-brand-700",
                                        current === "mono" &&
                                            "font-mono text-[13.5px] text-brand-700",
                                    )}
                                >
                                    {crumb.name}
                                </span>
                            ) : crumb.href ? (
                                <IntentLink
                                    href={crumb.href}
                                    className={textLinkClasses({
                                        tone: "quiet",
                                    })}
                                >
                                    {crumb.name}
                                </IntentLink>
                            ) : (
                                <span>{crumb.name}</span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
