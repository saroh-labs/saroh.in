"use client";

import { Button } from "@saroh/ui/button";

/**
 * The repeated-item editor that `features`, `faq` and `testimonials` share: a
 * numbered card per item, Remove, and "Add" up to the contract's cap (review
 * of #255, where the three had grown three copies of this).
 *
 * The rules are the contracts' and live here once:
 * - at least one item, so the last one cannot be removed; a block with none
 *   would fail its contract and the merchant would hear about it at publish
 *   rather than here;
 * - at most `max`, so "Add" stops where the save would start failing, and the
 *   merchant is told why instead of the button silently vanishing.
 *
 * Each block keeps its own fields: `children` draws one item's inputs.
 */
export function RepeatedItems<T>({
    items,
    onChange,
    max,
    itemNoun,
    addLabel,
    fullMessage,
    newItem,
    children,
}: {
    items: T[];
    onChange: (items: T[]) => void;
    /** The contract's cap on this list. */
    max: number;
    /** What one item is called, sentence case: "Point", "Question". */
    itemNoun: string;
    /** Verb plus noun: "Add a point". */
    addLabel: string;
    /** Shown in place of the Add button once the list is full. */
    fullMessage: string;
    /** A blank item. `NoInfer`: the item type comes from `items`, not this. */
    newItem: () => NoInfer<T>;
    children: (
        item: T,
        set: (next: Partial<T>) => void,
        index: number,
    ) => React.ReactNode;
}) {
    const setAt = (index: number, next: Partial<T>) =>
        onChange(
            items.map((item, i) => (i === index ? { ...item, ...next } : item)),
        );

    return (
        <>
            {items.map((item, index) => (
                <div key={index} className="grid gap-2 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                        {/* The card's title, so it is text a merchant can
                            read, not a 11px muted kicker (14px floor,
                            frontend-design-system.md). */}
                        <span className="text-sm font-medium">
                            {itemNoun} {index + 1}
                        </span>
                        {items.length > 1 ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Remove ${itemNoun.toLowerCase()} ${index + 1}`}
                                onClick={() =>
                                    onChange(
                                        items.filter((_, i) => i !== index),
                                    )
                                }
                            >
                                Remove
                            </Button>
                        ) : null}
                    </div>
                    {children(item, (next) => setAt(index, next), index)}
                </div>
            ))}

            {items.length < max ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onChange([...items, newItem()])}
                >
                    {addLabel}
                </Button>
            ) : (
                <p className="text-sm text-muted-foreground">{fullMessage}</p>
            )}
        </>
    );
}
