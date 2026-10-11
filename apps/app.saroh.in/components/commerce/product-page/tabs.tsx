import type { ProductTab } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { shownCollections } from "@/lib/products/overview-words";
import { TabStrip } from "@saroh/ui/tabs";

interface TabItem {
    id: ProductTab;
    label: string;
    href: string;
    badge?: { text: string; tone: "plain" | "attention" | "danger" };
}

/**
 * The product page's views (#522): Overview · Stock · Photos · Reviews ·
 * Orders · Discounts · Collections. Links, not client state, so each view is
 * an address: a review notification can open `?tab=reviews`, and Back
 * works. A count says what is waiting, in words where it asks for attention
 * ("2 short", "3 to answer").
 *
 * An untracked product has no Stock tab, as the design draws it; its sizes
 * and prices are still one tap away, from the Overview's Variants card.
 */
export function ProductTabs({
    overview,
    active,
    href,
    counts,
    stockBadge,
}: {
    overview: ProductOverview;
    active: ProductTab;
    href: (tab: ProductTab) => string;
    /** The product counts stock (Track stock, #515). */
    counts: boolean;
    /** "2 short" or "1 low", from the storefronts' shelves; null when fine. */
    stockBadge: string | null;
}) {
    const { product, orders, reviews, discounts, placement } = overview;
    const failed = { text: "Couldn't load", tone: "danger" } as const;
    const all: TabItem[] = [
        { id: "overview", label: "Overview", href: href("overview") },
        {
            id: "stock",
            label: "Stock",
            href: href("stock"),
            badge: stockBadge
                ? { text: stockBadge, tone: "attention" }
                : undefined,
        },
        {
            id: "photos",
            label: "Photos",
            href: href("photos"),
            badge: { text: String(product.images.length), tone: "plain" },
        },
        {
            id: "reviews",
            label: "Reviews",
            href: href("reviews"),
            badge:
                reviews.status === "ok"
                    ? reviews.data.toAnswer > 0
                        ? {
                              text: `${reviews.data.toAnswer} to answer`,
                              tone: "attention",
                          }
                        : {
                              text: String(reviews.data.summary.count),
                              tone: "plain",
                          }
                    : reviews.status === "failed"
                      ? failed
                      : undefined,
        },
        {
            id: "orders",
            label: "Orders",
            href: href("orders"),
            badge:
                orders.status === "ok"
                    ? { text: `${orders.data.openCount} open`, tone: "plain" }
                    : orders.status === "failed"
                      ? failed
                      : undefined,
        },
        {
            id: "discounts",
            label: "Discounts",
            href: href("discounts"),
            badge:
                discounts.status === "ok"
                    ? {
                          text: String(
                              discounts.data.filter((d) => d.state === "ACTIVE")
                                  .length,
                          ),
                          tone: "plain",
                      }
                    : discounts.status === "failed"
                      ? failed
                      : undefined,
        },
        {
            id: "collections",
            label: "Collections",
            href: href("collections"),
            badge:
                placement?.status === "ok"
                    ? {
                          text: String(shownCollections(placement.data).length),
                          tone: "plain",
                      }
                    : placement?.status === "failed"
                      ? failed
                      : undefined,
        },
    ];
    const tabs = all.filter(
        (t) => t.id !== "stock" || counts || active === "stock",
    );
    return (
        <TabStrip
            label="Product sections"
            idPrefix="tab"
            value={active}
            // The page's own gutter: its header and banners carry it too.
            listClassName="px-4 pt-1.5 sm:px-[22px]"
            tabs={tabs.map((t) => ({
                value: t.id,
                label: t.label,
                href: t.href,
                count: t.badge?.text,
                countTone:
                    t.badge?.tone === "attention"
                        ? "strong"
                        : t.badge?.tone === "danger"
                          ? "danger"
                          : "neutral",
            }))}
        />
    );
}
