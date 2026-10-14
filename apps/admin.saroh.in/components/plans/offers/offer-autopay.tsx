"use client";

import {
    AUTOPAY_CHARGES_MAX,
    AUTOPAY_CHARGES_MIN,
    autopayCharges,
} from "@saroh/pricing-catalog";

import { useDraft } from "../draft-store";
import { WholeField } from "./number-field";
import { ChangedDot, OfferCard } from "./parts";

/**
 * How many monthly charges one autopay approval covers (DEC-161): before it
 * runs out, the business is asked to approve the next one. Part of the
 * draft, so a new count reaches only autopays approved after it is
 * published; those already approved keep theirs. Not a price promise.
 */
export function OfferAutopay() {
    const { catalog, live, edit, canEdit } = useDraft();
    if (!catalog) return null;
    const charges = autopayCharges(catalog);
    const changed = !!live && autopayCharges(live.catalog) !== charges;

    return (
        <OfferCard label="Autopay">
            <span className="flex items-center gap-2 font-semibold">
                Autopay
                <ChangedDot on={changed} />
            </span>
            <div className="flex flex-wrap items-center gap-2 text-foreground/80">
                One approval covers
                <WholeField
                    aria-label="Monthly charges one autopay covers"
                    value={charges}
                    min={AUTOPAY_CHARGES_MIN}
                    max={AUTOPAY_CHARGES_MAX}
                    disabled={!canEdit}
                    className="w-20"
                    onValue={(n) =>
                        edit((c) => {
                            c.autopay = { charges: n };
                        })
                    }
                />
                monthly charges
            </div>
            <span className="text-[12.5px] leading-normal text-muted-foreground">
                Before it runs out, the business is asked to approve the next
                one. A new count applies to autopays approved after this version
                goes live; Razorpay takes up to {AUTOPAY_CHARGES_MAX}.
            </span>
        </OfferCard>
    );
}
