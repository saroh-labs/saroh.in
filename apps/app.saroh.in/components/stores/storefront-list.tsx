import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { storefrontHref } from "@/lib/stores/links";
import type {
    StorefrontKind,
    StorefrontSummary,
} from "@/lib/stores/storefronts";

/**
 * The two kinds of location (DEC-069, KTD-12): the `SHOP` and `ONLINE` kinds
 * in the data, named for what they mean to the merchant.
 */
const KIND_LABEL: Record<StorefrontKind, string> = {
    SHOP: "Customers visit",
    ONLINE: "No counter",
};

const ordersLabel = (n: number) =>
    n === 0 ? "no orders yet" : n === 1 ? "1 order" : `${n} orders`;

/**
 * The business's locations, beside the chosen one's page once there are
 * several (ADR-010): each a link to its own page, with what it is.
 */
export function StorefrontList({
    storefronts,
    selectedId,
    notTakingOrders,
}: {
    storefronts: StorefrontSummary[];
    selectedId: string | null;
    notTakingOrders: string[];
}) {
    return (
        <nav
            aria-label="Locations"
            className="min-w-0 max-w-[280px] flex-[0_1_236px] overflow-hidden rounded-xl border border-border bg-card max-sm:max-w-none max-sm:flex-[1_1_100%]"
        >
            <p className="border-b border-border px-[15px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {storefronts.length === 1
                    ? "1 location"
                    : `${storefronts.length} locations`}
            </p>
            <ul className="flex flex-col gap-0.5 p-1.5">
                {storefronts.map((s) => {
                    const on = s.id === selectedId;
                    return (
                        <li key={s.id}>
                            <Link
                                href={storefrontHref(s.id)}
                                scroll={false}
                                aria-current={on ? "page" : undefined}
                                className={cn(
                                    "flex min-h-11 items-center gap-[9px] rounded-lg px-[9px] py-[7px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    on
                                        ? "bg-muted"
                                        : "hover:bg-muted/60 active:bg-muted",
                                )}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-medium">
                                        {s.name}
                                    </span>
                                    <span className="block text-[12px] text-muted-foreground">
                                        {ordersLabel(s.orderCount)}
                                    </span>
                                </span>
                                {notTakingOrders.includes(s.id) ? (
                                    // Past the plan's locations limit (#800).
                                    <Badge
                                        variant="warning"
                                        className="shrink-0"
                                    >
                                        Not taking orders
                                    </Badge>
                                ) : (
                                    <Badge
                                        variant={
                                            s.paused ? "warning" : "neutral"
                                        }
                                        className="shrink-0"
                                    >
                                        {s.paused
                                            ? "Paused"
                                            : KIND_LABEL[s.kind]}
                                    </Badge>
                                )}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
