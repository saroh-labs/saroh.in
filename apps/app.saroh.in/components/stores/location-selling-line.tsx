import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import type { LocationSelling } from "@/lib/sites/sells-from";
import { locationSellingLine } from "@/lib/sites/sells-from";

const LINK =
    "inline-flex min-h-6 cursor-pointer items-center gap-0.5 rounded-sm font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors duration-fast hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-70";

/**
 * Where a location sells, said on its own panel (DEC-069, R3):
 * "Sells in person only", "Sells in person and online · Your online shop"
 * or "Online only · Your online shop". The link opens `/shop` when the
 * shop is live, and otherwise the site's Sells from row, where it is set —
 * saying the shop isn't live, rather than promise a page that 404s.
 */
export function LocationSellingLine({ selling }: { selling: LocationSelling }) {
    const shop = selling.says === "in-person" ? null : selling.shop;
    return (
        <p
            data-testid="location-selling"
            className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13.5px] text-foreground"
        >
            <span className="font-medium">{locationSellingLine(selling)}</span>
            {shop ? (
                <>
                    <span aria-hidden className="text-muted-foreground">
                        ·
                    </span>
                    {shop.live ? (
                        <a
                            href={shop.href}
                            target="_blank"
                            rel="noreferrer"
                            className={LINK}
                        >
                            Your online shop
                            <ArrowUpRight aria-hidden className="size-3.5" />
                            <span className="sr-only">
                                (opens in a new tab)
                            </span>
                        </a>
                    ) : (
                        <Link href={shop.href} className={LINK}>
                            {selling.says === "not-yet"
                                ? "Your online shop →"
                                : "Your online shop isn't live yet →"}
                        </Link>
                    )}
                </>
            ) : null}
        </p>
    );
}
