import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import type { ProductTab } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";

/**
 * The product page's views. Links, not client state, so each view is an
 * address: a review notification can open `?tab=reviews`, and Back works.
 * Drawn like the Products | Reviews switch. A count says what is waiting,
 * in words where it asks for attention ("2 low", "3 to answer").
 */
export function ProductTabs({
    overview,
    active,
    href,
}: {
    overview: ProductOverview;
    active: ProductTab;
    href: (tab: ProductTab) => string;
}) {
    const { product, stock, orders, reviews, discounts } = overview;
    const tabs: {
        id: ProductTab;
        label: string;
        badge?: { text: string; tone: "plain" | "attention" | "danger" };
    }[] = [
        { id: "overview", label: "Overview" },
        {
            id: "variants",
            label: "Variants and stock",
            badge:
                stock.totals.lowCount > 0
                    ? {
                          text: `${stock.totals.lowCount} low`,
                          tone: "attention",
                      }
                    : product.variants.length > 0
                      ? { text: String(product.variants.length), tone: "plain" }
                      : undefined,
        },
        {
            id: "photos",
            label: "Photos",
            badge: product.images.length
                ? { text: String(product.images.length), tone: "plain" }
                : undefined,
        },
        {
            id: "reviews",
            label: "Reviews",
            badge:
                reviews.status === "ok"
                    ? reviews.data.toAnswer > 0
                        ? {
                              text: `${reviews.data.toAnswer} to answer`,
                              tone: "attention",
                          }
                        : reviews.data.summary.count > 0
                          ? {
                                text: String(reviews.data.summary.count),
                                tone: "plain",
                            }
                          : undefined
                    : reviews.status === "failed"
                      ? { text: "Couldn't load", tone: "danger" }
                      : undefined,
        },
        {
            id: "orders",
            label: "Orders",
            badge:
                orders.status === "ok"
                    ? orders.data.openCount > 0
                        ? {
                              text: `${orders.data.openCount} open`,
                              tone: "plain",
                          }
                        : undefined
                    : orders.status === "failed"
                      ? { text: "Couldn't load", tone: "danger" }
                      : undefined,
        },
        {
            id: "discounts",
            label: "Discounts",
            badge:
                discounts.status === "ok" && discounts.data.length > 0
                    ? {
                          text: String(
                              discounts.data.filter((d) => d.state === "ACTIVE")
                                  .length || discounts.data.length,
                          ),
                          tone: "plain",
                      }
                    : discounts.status === "failed"
                      ? { text: "Couldn't load", tone: "danger" }
                      : undefined,
        },
    ];

    return (
        <nav
            aria-label="Product views"
            className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1"
        >
            {tabs.map((t) => {
                const on = t.id === active;
                return (
                    <Link
                        key={t.id}
                        id={`tab-${t.id}`}
                        href={href(t.id)}
                        scroll={false}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                            "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md px-3.5 py-2.5 text-[14px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                            on
                                ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--foreground))]"
                                : "font-medium text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {t.label}
                        {t.badge ? (
                            <span
                                className={cn(
                                    "rounded-full px-[7px] py-0.5 text-[11px] font-semibold tabular-nums",
                                    t.badge.tone === "attention" &&
                                        "bg-brand-subtle text-brand-subtle-foreground",
                                    t.badge.tone === "danger" &&
                                        "bg-destructive-subtle text-destructive-subtle-foreground",
                                    t.badge.tone === "plain" &&
                                        (on
                                            ? "bg-muted text-foreground"
                                            : "bg-foreground/[0.04] text-muted-foreground"),
                                )}
                            >
                                {t.badge.text}
                            </span>
                        ) : null}
                    </Link>
                );
            })}
        </nav>
    );
}
