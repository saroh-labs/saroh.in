"use client";

import Link from "next/link";

import { TREATMENT_NEEDS_STOREFRONT } from "@/lib/services/service-editor";

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
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <NumberField
            label="Visits"
            value={value}
            onChange={onChange}
            width="w-[90px]"
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
            <Link
                href={STOREFRONTS_HREF}
                className="rounded-sm font-medium text-foreground underline underline-offset-2 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                Add a storefront
            </Link>
        </p>
    );
}
