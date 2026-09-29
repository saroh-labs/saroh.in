"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { useId, useState } from "react";

import type { EditorFields } from "@/components/editor-shell/editor-shell";
import {
    FIELD,
    HELP,
    LABEL,
    Section,
} from "@/components/services/service-editor/fields";
import { Chip } from "@/components/shared/chip";
import { currencySymbol } from "@/lib/format/money";
import type { PlanForm } from "@/lib/subscriptions/plan-editor";
import {
    everyNote,
    INTERVAL_LABEL,
    MAIN_INTERVALS,
    MORE_INTERVALS,
} from "@/lib/subscriptions/plan-editor";

import { FieldError } from "./details-section";

export const CHIP = "h-[34px] px-3 text-[13px]";

/**
 * Price and billing (D7): the price, then how often — month and year
 * first, week and quarter behind More (default 29) — and how it is paid,
 * which never promises autopay the business can't take (DEC-038): it says
 * so only when the business offers it (D14).
 */
export function PriceSection({
    fields,
    currency,
    autopayOffered = false,
}: {
    fields: EditorFields<PlanForm>;
    /** The plan's currency, or the business's for a new one. */
    currency: string;
    /** The business offers autopay (D14); unknown reads as not. */
    autopayOffered?: boolean;
}) {
    const { values, set, errors } = fields;
    const ids = { price: useId(), priceErr: useId(), every: useId() };
    const [more, setMore] = useState(false);
    const moreOpen = more || MORE_INTERVALS.includes(values.interval);
    const shown = moreOpen
        ? [...MAIN_INTERVALS, ...MORE_INTERVALS]
        : MAIN_INTERVALS;
    const note = everyNote({ ...values, currency }, autopayOffered);
    return (
        <Section title="Price and billing">
            <label htmlFor={ids.price} className={LABEL}>
                Price ({currencySymbol(currency)})
            </label>
            <Input
                id={ids.price}
                inputMode="decimal"
                autoComplete="off"
                value={values.price}
                aria-invalid={Boolean(errors.price)}
                aria-describedby={errors.price ? ids.priceErr : undefined}
                onChange={(e) => set({ price: e.target.value })}
                className={cn(FIELD, "w-[140px] max-w-full")}
            />
            <FieldError id={ids.priceErr} message={errors.price} />
            <p id={ids.every} className={cn(LABEL, "mt-3.5")}>
                Charged
            </p>
            <div
                role="radiogroup"
                aria-labelledby={ids.every}
                className="mt-1.5 flex flex-wrap gap-1.5"
            >
                {shown.map((k) => (
                    <Chip
                        key={k}
                        on={values.interval === k}
                        className={CHIP}
                        onClick={() => set({ interval: k })}
                    >
                        {INTERVAL_LABEL[k]}
                    </Chip>
                ))}
                {moreOpen ? null : (
                    <button
                        type="button"
                        aria-expanded={false}
                        onClick={() => setMore(true)}
                        className={cn(
                            CHIP,
                            "rounded-full border border-dashed border-border bg-card font-medium text-muted-foreground transition-colors duration-fast hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-muted disabled:cursor-not-allowed coarse:h-11",
                        )}
                    >
                        More…
                    </button>
                )}
            </div>
            {note ? <p className={HELP}>{note}</p> : null}
        </Section>
    );
}
