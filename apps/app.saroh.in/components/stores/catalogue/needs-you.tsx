"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";

import { needsHeadline, needsShown } from "@/lib/products/needs-you";
import type { CatalogueNeed } from "@/lib/products/service";

/**
 * "Needs you" above the Products list (#519, the Products audit of 16 Oct):
 * what is short, out of stock or running low across the whole catalogue —
 * the API works it out, not the page on screen, and leaves out drafts and
 * archived products nobody can buy.
 *
 * On a desk (HPProductsDesk) it lists what its headline counts: "4 out of
 * stock and 6 running low" lists those 4, two to a row, each with
 * Restock; "6 more" opens the rest here. On a phone it is one line, "4 out of
 * stock, 6 low · Restock them", that opens the list. "Show all 10 in the
 * list" narrows the list to them (`?view=needs`).
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
    const { lead, rest, phone } = needsHeadline(needs);
    return (
        <section
            aria-label="Needs you"
            className="overflow-hidden rounded-xl border border-border bg-card"
        >
            {/* A phone: one line that opens the list (HPProductsPhone). */}
            <Button
                type="button"
                variant="ghost"
                size="inline"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setOpen((o) => !o)}
                className="flex min-h-[60px] w-full items-center gap-3 rounded-none px-4 py-2.5 text-left min-[760px]:hidden"
            >
                <span
                    aria-hidden
                    className="size-[7px] shrink-0 rounded-full bg-destructive"
                />
                <span data-ph-unmask="" className="grid min-w-0 flex-1">
                    <span className="truncate text-[14px] font-semibold text-foreground">
                        {phone}
                    </span>
                    <span className="text-[12.5px] text-muted-foreground">
                        {canStock ? "Restock them" : "See them"}
                    </span>
                </span>
                <ChevronRight
                    aria-hidden
                    className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform duration-fast",
                        open && "rotate-90",
                    )}
                />
            </Button>
            <div className="hidden min-h-[64px] items-center gap-3 px-4 py-2.5 min-[760px]:flex">
                <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                    <span className="font-display text-[15px] font-semibold text-foreground">
                        {lead}
                    </span>
                    {rest ? (
                        <span className="text-[13px] text-muted-foreground">
                            {rest}
                        </span>
                    ) : null}
                </h2>
                {needs.length > lines.length ? (
                    // Every one here, as before: the list itself stays put.
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-expanded={open}
                        aria-controls={listId}
                        onClick={() => setOpen(true)}
                    >
                        {needs.length - lines.length} more
                    </Button>
                ) : null}
                <TextLink
                    href={toggleHref}
                    scroll={false}
                    className="ml-auto shrink-0 text-[13px]"
                >
                    {onlyThese
                        ? "Show all products"
                        : `Show all ${needs.length} in the list`}
                </TextLink>
            </div>
            <ul
                id={listId}
                className={cn(
                    "grid-cols-1 border-t border-border min-[1100px]:grid-cols-2",
                    // Folded, what the headline counts on a desk and the
                    // line alone on a phone; open, every one, scrolling.
                    open
                        ? "grid max-h-[min(50vh,420px)] overflow-y-auto"
                        : "hidden min-[760px]:grid",
                )}
            >
                {lines.map((n, i) => (
                    <li
                        key={n.productId}
                        className={cn(
                            "flex min-h-[60px] items-center gap-3 border-border px-4 py-2",
                            i > 0 && "border-t",
                            // Two columns: the second row's top border, and
                            // a rule between the columns.
                            i === 1 && "min-[1100px]:border-t-0",
                            i % 2 === 1 && "min-[1100px]:border-l",
                        )}
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
                        <span className="grid min-w-0 flex-1">
                            <strong className="truncate text-[14px] font-semibold text-foreground">
                                {n.name}
                            </strong>
                            <span
                                className={cn(
                                    "text-[12.5px] font-medium",
                                    n.tone === "danger"
                                        ? "text-destructive-subtle-foreground"
                                        : "text-warning-subtle-foreground",
                                )}
                            >
                                {n.what}
                            </span>
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => onOpen(n.productId)}
                            aria-label={`${canStock ? "Restock" : "View"} ${n.name}`}
                        >
                            {canStock ? "Restock" : "View"}
                        </Button>
                    </li>
                ))}
                {open && !onlyThese ? (
                    <li className="border-t border-border px-4 py-2 min-[760px]:hidden min-[1100px]:col-span-2">
                        <TextLink
                            href={toggleHref}
                            scroll={false}
                            className="text-[13px] coarse:min-h-11"
                        >
                            {`Show all ${needs.length} in the list`}
                        </TextLink>
                    </li>
                ) : null}
            </ul>
        </section>
    );
}
