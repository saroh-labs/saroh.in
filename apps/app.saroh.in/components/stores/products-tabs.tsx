import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

/**
 * Products | Reviews. A page-level switch, not one of the catalogue's filter
 * tabs: those cut the same products three ways, and a review is not a
 * product. Links rather than state, so `?tab=reviews` is an address the
 * inbox and a product's rating can point at. Drawn like Team's tabs.
 */
export function ProductsTabs({
    active,
    productCount,
    reviewCount,
}: {
    active: "products" | "reviews";
    productCount: number;
    reviewCount: number;
}) {
    const tabs = [
        {
            id: "products",
            label: "Products",
            href: "/commerce/products",
            count: productCount,
        },
        {
            id: "reviews",
            label: "Reviews",
            href: "/commerce/products?tab=reviews",
            count: reviewCount,
        },
    ] as const;
    return (
        <nav
            aria-label="Products or reviews"
            className="flex gap-1 border-b border-border"
        >
            {tabs.map((t) => {
                const on = t.id === active;
                return (
                    <Link
                        key={t.id}
                        href={t.href}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                            "flex items-center gap-2 rounded-t-md px-3.5 py-2.5 text-[14px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
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
                        >
                            {t.count}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
