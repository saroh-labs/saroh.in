"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { needsShown, needsSummary } from "@/lib/products/needs-you";
import type { CatalogueNeed } from "@/lib/products/service";

/**
 * "Needs you" above the Products list (#519, the Products audit of 16 Oct):
 * what is short, out of stock or running low across the whole catalogue —
 * the API works it out, not the page on screen, and leaves out drafts and
 * archived products nobody can buy.
 *
 * One line by default — "Needs you · 7 out · 21 low · Review" — so a long
 * list never pushes the products off a phone. A desk also shows the worst
 * two under it; tapping the line opens every one. Review narrows the list
 * to them (`?view=needs`).
 *
 * Each line's button opens the quick look on that product, with the Add
 * box ready for someone who counts stock (Restock), or to read it (View) —
 * the task finishes here, never on another page.
 */
export function NeedsYou({
    needs,
    canStock,
    onOpen,
    onlyThese,
    toggleHref,
}: {
    needs: readonly CatalogueNeed[];
    /** Can count stock: Restock; otherwise View. */
    canStock: boolean;
    /** Open the quick look on this product. */
    onOpen: (productId: string) => void;
    /** The list shows only these now. */
    onlyThese: boolean;
    /** Where Review / Show all goes. */
    toggleHref: string;
}) {
    const [open, setOpen] = useState(false);
    const listId = useId();
    if (needs.length === 0) return null;
    const lines = needsShown(needs, open);
    return (
        <section
            aria-label="Needs you"
            className="grid gap-2 rounded-[12px] border border-border-strong bg-muted px-4 py-2.5"
        >
            <div className="flex min-h-8 items-center gap-2.5">
                <h2 className="min-w-0">
                    <Button
                        type="button"
                        variant="ghost"
                        size="inline"
                        aria-expanded={open}
                        aria-controls={listId}
                        onClick={() => setOpen((o) => !o)}
                        className="-mx-1 flex min-w-0 items-center gap-2 rounded-sm px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                    >
                        <span className="font-display text-[15px] font-semibold text-foreground">
                            Needs you
                        </span>
                        <span className="truncate text-[12.5px] text-neutral-700 dark:text-muted-foreground">
                            · {needsSummary(needs)}
                        </span>
                        <ChevronDown
                            aria-hidden
                            className={cn(
                                "size-4 shrink-0 text-muted-foreground transition-transform duration-fast",
                                open && "rotate-180",
                            )}
                        />
                    </Button>
                </h2>
                <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="ml-auto shrink-0 bg-card"
                >
                    <Link href={toggleHref} scroll={false}>
                        {onlyThese ? "Show all" : "Review"}
                    </Link>
                </Button>
            </div>
            <ul
                id={listId}
                className={cn(
                    "gap-2",
                    // Folded: the worst two on a desk, the line alone on
                    // a phone. Open: every one, scrolling past a screenful.
                    open
                        ? "grid max-h-[min(50vh,360px)] overflow-y-auto"
                        : "hidden min-[760px]:grid",
                )}
            >
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
                                    : "bg-warning",
                            )}
                        />
                        <span className="min-w-0 flex-[1_1_220px]">
                            <strong className="font-semibold">{n.name}</strong>:{" "}
                            {n.what}
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="bg-card"
                            onClick={() => onOpen(n.productId)}
                            aria-label={`${canStock ? "Restock" : "View"} ${n.name}`}
                        >
                            {canStock ? "Restock" : "View"}
                        </Button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
