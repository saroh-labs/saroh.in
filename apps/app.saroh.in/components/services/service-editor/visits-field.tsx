"use client";

import { TREATMENT_NEEDS_STOREFRONT } from "@/lib/services/service-editor";

import { TextLink } from "@saroh/ui/text-link";
import { HELP, NumberField } from "./fields";

/** Where a business adds the storefront a treatment is sold from. */
export const STOREFRONTS_HREF = "/commerce/locations";

/**
 * Visits (E10, the Service Editor design): how many visits one booking of a
 * one-to-one service is, 1 to 12. More than one is a treatment, sold as one
 * order and booked a visit at a time.
 */
export function VisitsField({
    value,
    onChange,
    error,
    onLeave,
}: {
    value: string;
    onChange: (value: string) => void;
    error?: string | null;
    onLeave?: () => void;
}) {
    return (
        <NumberField
            label="Visits"
            value={value}
            onChange={onChange}
            width="w-[90px]"
            error={error}
            onLeave={onLeave}
        />
    );
}

/**
 * Said under Time when the business has no storefront to sell a treatment
 * from (DEC-050): saving more than one visit is refused, so the way to one
 * is one click away.
 */
export function VisitsStorefrontNote() {
    return (
        <p role="alert" className={HELP}>
            <span className="text-destructive-subtle-foreground">
                {TREATMENT_NEEDS_STOREFRONT}
            </span>{" "}
            <TextLink href={STOREFRONTS_HREF}>Add a location</TextLink>
        </p>
    );
}
