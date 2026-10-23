import { TabStrip } from "@saroh/ui/tabs";

export type ProductsTab = "all" | "collections" | "inventory" | "reviews";

/**
 * All · Collections · Inventory · Reviews, as the "Saroh Products Screen"
 * design draws them (#519): one row of tabs, each with its count, all of
 * them `?tab=` (a link from before that says `?view=collections` still
 * lands on its tab). Links rather than state, so each is an address the
 * inbox, Home and a product's rating can point at.
 *
 * A count that couldn't be read is "—", never 0.
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
            ? [{ id: "inventory" as const, label: "Stock" }]
            : []),
        ...(showReviews ? [{ id: "reviews" as const, label: "Reviews" }] : []),
    ];
    return (
        <TabStrip
            label="Products"
            value={active}
            tabs={tabs.map((t) => ({
                value: t.id,
                label: t.label,
                href: hrefs[t.id],
                count: counts[t.id],
            }))}
        />
    );
}
