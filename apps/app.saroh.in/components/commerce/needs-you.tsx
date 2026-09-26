import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { needsShown, needsSummary } from "@/lib/products/needs-you";
import type { CatalogueNeed } from "@/lib/products/service";

/**
 * "Needs you" above the Products list (#519, the design): what is short,
 * out of stock or running low across the whole catalogue — the API works it
 * out, not the page on screen — each with Restock, which opens the
 * product's stock. "Show only these" narrows the list to them.
 *
 * The design lists every one; past five this says how many more and leaves
 * them to "Show only these", so a long list doesn't push the products off
 * the screen.
 */
export function NeedsYou({
    needs,
    restockHref,
    onlyThese,
    toggleHref,
}: {
    needs: readonly CatalogueNeed[];
    restockHref: (productId: string) => string;
    /** The list shows only these now. */
    onlyThese: boolean;
    /** Where "Show only these" / "Show all" goes. */
    toggleHref: string;
}) {
    if (needs.length === 0) return null;
    const { lines, more } = needsShown(needs);
    return (
        <section
            aria-label="Needs you"
            className="grid gap-2 rounded-[12px] border border-brand-300 bg-brand-subtle px-4 py-3 dark:border-brand-700"
        >
            <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-display text-[15px] font-semibold text-foreground">
                    Needs you
                </h2>
                <span className="text-[12.5px] text-neutral-700 dark:text-muted-foreground">
                    {needsSummary(needs)}
                </span>
                <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="ml-auto bg-card"
                >
                    <Link href={toggleHref} scroll={false}>
                        {onlyThese ? "Show all" : "Show only these"}
                    </Link>
                </Button>
            </div>
            <ul className="grid gap-2">
                {lines.map((n) => (
                    <li
                        key={n.productId}
                        className="flex flex-wrap items-center gap-2.5 text-[13px] text-foreground"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "size-[7px] shrink-0 rounded-full",
                                n.tone === "danger"
                                    ? "bg-destructive"
                                    : "bg-highlight",
                            )}
                        />
                        <span className="min-w-0 flex-[1_1_220px]">
                            <strong className="font-semibold">{n.name}</strong>{" "}
                            — {n.what}
                        </span>
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="bg-card"
                        >
                            <Link
                                href={restockHref(n.productId)}
                                aria-label={`Restock ${n.name}`}
                            >
                                Restock
                            </Link>
                        </Button>
                    </li>
                ))}
            </ul>
            {more > 0 ? (
                <p className="text-[12.5px] text-neutral-700 dark:text-muted-foreground">
                    And {more} more — Show only these lists them all.
                </p>
            ) : null}
        </section>
    );
}
