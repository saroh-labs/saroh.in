import { TabStrip } from "@saroh/ui/tabs";

export type ProductsTab = "all" | "collections" | "inventory" | "reviews";

/**
 * All · Collections · Inventory · Reviews, as the "Saroh Products Screen"
 * design draws them (#519): one row of tabs, each with its count, all of
 * them `?tab=` (a link from before that says `?view=collections` still
 * lands on its tab). Links rather than state, so each is an address the
 * inbox, Home and a product's rating can point at.
 *
 * A count that couldn't be read is "—", never 0; an empty tab shows no
 * count at all.
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
    // All · Stock · Collections · Reviews (HPProductsDesk).
    const tabs: { id: ProductsTab; label: string }[] = [
        { id: "all", label: "All" },
        ...(showInventory
            ? [{ id: "inventory" as const, label: "Stock" }]
            : []),
        { id: "collections", label: "Collections" },
        ...(showReviews ? [{ id: "reviews" as const, label: "Reviews" }] : []),
    ];
    return (
        <TabStrip
            label="Products"
            value={active}
            tabs={tabs.map((t) => {
                // An empty tab reads muted, without a 0 (HPProductsNotes);
                // the open one keeps its count, whatever it is.
                const empty = counts[t.id] === 0 && t.id !== active;
                return {
                    value: t.id,
                    label: empty ? (
                        <span className="opacity-70">{t.label}</span>
                    ) : (
                        t.label
                    ),
                    href: hrefs[t.id],
                    count: empty ? undefined : counts[t.id],
                };
            })}
        />
    );
}
