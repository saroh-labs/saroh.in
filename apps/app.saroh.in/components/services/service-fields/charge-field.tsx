"use client";

import { Segmented } from "@saroh/ui/segmented";
import { useId } from "react";

import type { ServiceCharge, ServiceDraft } from "@/lib/services/editor";
import { chargeChange } from "@/lib/services/editor";

import { Eyebrow } from "@/components/bookings/calendar/parts";
import { HELP } from "@/components/services/service-editor/fields";

const CHARGES = [
    { value: "PAID", label: "Paid" },
    { value: "FREE", label: "Free" },
] as const satisfies readonly { value: ServiceCharge; label: string }[];

/** What a free service's customers get, said under the choice (DEC-261). */
export const FREE_NOTE =
    "Customers book it straight away, with nothing to pay. Your booking page shows it as Free.";

/** Said too when a paid service is made free: bookings made stay as they are. */
export const FREE_KEEPS_BOOKINGS = "Bookings already made keep their price.";

/**
 * Free or Paid (DEC-261), the first money question of a service. Free is a
 * price of 0: the price, the deposit and GST beside the price are hidden,
 * and nothing is taken at booking. Paid asks for a price above 0.
 */
export function ChargeField({
    draft,
    set,
    wasPaid = false,
    disabled = false,
}: {
    draft: Pick<ServiceDraft, "charge" | "price">;
    set: (patch: Partial<ServiceDraft>) => void;
    /** Saved as paid: making it free leaves bookings already made alone. */
    wasPaid?: boolean;
    disabled?: boolean;
}) {
    const label = useId();
    return (
        <div>
            <Eyebrow id={label}>Free or paid</Eyebrow>
            <Segmented
                label="Free or paid"
                aria-labelledby={label}
                size="md"
                value={draft.charge}
                onValueChange={(charge) => set(chargeChange(draft, charge))}
                options={CHARGES}
                disabled={disabled}
            />
            {draft.charge === "FREE" ? (
                <p data-ph-unmask="" className={HELP}>
                    {FREE_NOTE}
                    {wasPaid ? ` ${FREE_KEEPS_BOOKINGS}` : ""}
                </p>
            ) : null}
        </div>
    );
}
