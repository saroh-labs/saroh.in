import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

export type ProductsTab = "all" | "collections" | "inventory" | "reviews";

/**
 * All · Collections · Inventory · Reviews, as the "Saroh Products Screen"
 * design draws them (#519): one row of tabs, each with its count. The
 * first three cut the catalogue (a chip, `?view=`); Reviews is its own view
 * (`?tab=reviews`). Links rather than state, so each is an address the
 * inbox, Home and a product's rating can point at.
 *
 * A count that couldn't be read is "—", never 0. A tab is a filter, not a
 * page, so the current one is `aria-current="true"`; `page` belongs to the
 * rail.
 */
export function ProductsTabs({
    active,
    counts,
    hrefs,
    showInventory = true,
    showReviews = true,
}: {
    active: ProductsTab;
    counts: Record<ProductsTab, number | null>;
    hrefs: Record<ProductsTab, string>;
    /** Off while the business doesn't track stock. */
    showInventory?: boolean;
    /** Off for a role that can't read reviews. */
    showReviews?: boolean;
}) {
    const tabs: { id: ProductsTab; label: string }[] = [
        { id: "all", label: "All" },
        { id: "collections", label: "Collections" },
        ...(showInventory
            ? [{ id: "inventory" as const, label: "Inventory" }]
            : []),
        ...(showReviews ? [{ id: "reviews" as const, label: "Reviews" }] : []),
    ];
    return (
        <nav
            aria-label="Products"
            className="flex flex-wrap gap-0.5 border-b border-border"
        >
            {tabs.map((t) => {
                const on = t.id === active;
                const n = counts[t.id];
                return (
                    <Link
                        key={t.id}
                        href={hrefs[t.id]}
                        scroll={false}
                        aria-current={on ? "true" : undefined}
                        className={cn(
                            "flex items-center gap-[7px] px-[13px] py-[9px] text-[13.5px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                            on
                                ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--foreground))]"
                                : "font-medium text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {t.label}
                        <span
                            className={cn(
                                "rounded-full px-[7px] py-0.5 text-[11px] font-semibold tabular-nums",
                                on
                                    ? "bg-muted text-foreground"
                                    : "bg-foreground/[0.04] text-muted-foreground",
                            )}
                            aria-label={
                                n === null ? "count unknown" : undefined
                            }
                        >
                            {n ?? "—"}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
