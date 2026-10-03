"use client";

import type { GstShow } from "@saroh/pricing-catalog";

import { useDraft } from "../draft-store";
import { gstExample } from "./offers";
import { ChangedDot, OfferCard, Segmented } from "./parts";

const SHOWN: { value: GstShow; label: string }[] = [
    { value: "excl", label: "Without GST" },
    { value: "incl", label: "With GST" },
];

/** Which price visitors see first; they can switch either way. */
export function OfferGst() {
    const { catalog, live, edit, canEdit } = useDraft();
    if (!catalog) return null;
    const changed = !!live && live.catalog.gst.show !== catalog.gst.show;
    const example = gstExample(catalog);

    return (
        <OfferCard label="GST on the pricing page">
            <span className="flex items-center gap-2 font-semibold">
                GST on the pricing page
                <ChangedDot on={changed} />
            </span>
            <span className="text-[12.5px] leading-normal text-muted-foreground">
                Visitors can switch between with and without GST. Choose which
                they see first.
            </span>
            <Segmented
                label="Shown first"
                value={catalog.gst.show}
                options={SHOWN}
                disabled={!canEdit}
                onValue={(show) =>
                    edit((c) => {
                        c.gst = { show };
                    })
                }
            />
            {example && (
                <span className="text-[12.5px] text-muted-foreground">
                    {example}
                </span>
            )}
        </OfferCard>
    );
}
