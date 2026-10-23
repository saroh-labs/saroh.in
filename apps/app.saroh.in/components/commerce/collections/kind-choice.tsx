"use client";

import { RadioCards } from "@/components/shared/fields/choice-group";
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
            <RadioCards
                label="How it fills"
                value={value}
                onChange={onChange}
                disabled={disabled}
                options={KINDS}
            />
        </fieldset>
    );
}
