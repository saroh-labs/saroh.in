"use client";

import { SegmentToggle } from "@saroh/marketing/billing-toggle";

/** The Pricing design's Before GST / With GST switch; its default comes from the catalogue. */
export function GstToggle({
    checked,
    on,
    onChange,
}: {
    checked: boolean;
    /** The "with" side's words, from the model. */
    on: string;
    onChange: (checked: boolean) => void;
}) {
    return (
        <SegmentToggle
            label="Show prices"
            value={checked}
            off="Before GST"
            on={on}
            onChange={onChange}
        />
    );
}
