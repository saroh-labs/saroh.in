"use client";

import { cn } from "@saroh/ui/lib/utils";

import type { CollectionKind } from "@/lib/collections/service";

const KINDS: { value: CollectionKind; label: string; note: string }[] = [
    {
        value: "HAND_PICKED",
        label: "Picked by hand",
        note: "You choose the products and the order they show in.",
    },
    {
        value: "AUTOMATIC",
        label: "Automatic, by category",
        note: "It fills itself from a category and the ones inside it.",
    },
];

/**
 * How a collection fills (#524): picked by hand, or from a category. Chosen
 * when it is made; after that it is said, not offered — the API won't turn
 * one kind into the other, since a hand-picked list would be lost.
 */
export function KindChoice({
    value,
    onChange,
    locked,
    disabled,
}: {
    value: CollectionKind;
    onChange: (kind: CollectionKind) => void;
    /** An existing collection: its kind is fixed. */
    locked: boolean;
    disabled: boolean;
}) {
    if (locked) {
        const kind = KINDS.find((k) => k.value === value);
        return (
            <div className="space-y-1">
                <p className="text-[12.5px] font-medium">How it fills</p>
                <p className="text-[13px]">{kind?.label}</p>
                <p className="text-[11.5px] leading-[1.5] text-muted-foreground">
                    A collection keeps the way it fills. For the other way, make
                    a new collection.
                </p>
            </div>
        );
    }
    return (
        <fieldset className="space-y-2">
            <legend className="mb-2 text-[12.5px] font-medium">
                How it fills
            </legend>
            <div role="radiogroup" className="flex flex-col gap-2">
                {KINDS.map((k) => {
                    const on = k.value === value;
                    return (
                        <button
                            key={k.value}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={disabled}
                            onClick={() => onChange(k.value)}
                            className={cn(
                                "flex w-full items-start gap-2.5 rounded-[9px] border bg-card px-3 py-2.5 text-left coarse:min-h-11",
                                on
                                    ? "border-foreground"
                                    : "border-border hover:bg-muted",
                                disabled && "cursor-not-allowed bg-disabled",
                            )}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px]",
                                    on
                                        ? "border-foreground"
                                        : "border-border-strong",
                                )}
                            >
                                {on ? (
                                    <span className="size-2 rounded-full bg-foreground" />
                                ) : null}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-semibold">
                                    {k.label}
                                </span>
                                <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                                    {k.note}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
}
