"use client";

import { Field, FieldError } from "@saroh/ui/field";
import { cn } from "@saroh/ui/lib/utils";
import { MoneyInput } from "@saroh/ui/money-input";
import { Notice } from "@saroh/ui/notice";
import { TextLink } from "@saroh/ui/text-link";
import { useId, useState } from "react";

import type { EditorFields } from "@/components/editor-shell/editor-shell";
import {
    HELP,
    LABEL,
    Section,
} from "@/components/services/service-editor/fields";
import { GstFields } from "@/components/services/service-editor/gst-fields";
import { Chip } from "@/components/shared/chip";
import type { GstAsk } from "@/lib/gst/item-words";
import { NOT_ASKED } from "@/lib/gst/item-words";
import { rateBps } from "@/lib/gst/price-mode";
import type { AutopayLimit } from "@/lib/subscriptions/plan-drafts";
import type { PlanForm } from "@/lib/subscriptions/plan-editor";
import {
    autopayLimitWarning,
    everyNote,
    INTERVAL_LABEL,
    MAIN_INTERVALS,
    MORE_INTERVALS,
    priceToPay,
} from "@/lib/subscriptions/plan-editor";
import type { RenewalChange } from "@/lib/subscriptions/renewal-change";
import {
    renewalAmountChanges,
    renewalChangeLines,
} from "@/lib/subscriptions/renewal-change";

export const CHIP = "";

/**
 * Under the price of a plan that has been published (UX audit, 12 Oct
 * 2026): it stood above the Plans list, and belongs where a price is
 * changed. What a GST change does to the members on the plan is the notice
 * under the GST fields, so it is not said here.
 */
export const PRICE_KEPT =
    "A new price is for people who join next. Everyone already on the plan keeps the price they joined at.";

/**
 * Price and billing (D7): the price, then how often — month and year
 * first, week and quarter behind "Another interval" (default 29) — and how
 * it is paid,
 * which never promises autopay the business can't take (DEC-038): it says
 * so only when the business offers it (D14). A price above what the
 * autopay of members switching to the plan covers warns that they will need
 * to authorise again (D13).
 *
 * A GST-registered business answers the GST rate beside the price (12 Oct
 * 2026), as on a service: required for a priced plan, with 0% for an
 * exempt one, the plan's own way of carrying GST and an optional SAC code.
 * A business that isn't registered is shown none of it. What publishing the
 * GST does to the next renewal of the members already on the plan is said
 * under the fields, before Publish (`renewal`, the API's sums).
 */
export function PriceSection({
    fields,
    currency,
    autopayOffered = false,
    autopayLimits,
    gst = NOT_ASKED,
    renewal = null,
}: {
    /** Whether GST is asked, and the business's own way of carrying it. */
    gst?: GstAsk;
    /** What publishing the GST shown does to members' next renewal. */
    renewal?: RenewalChange | null;
    fields: EditorFields<PlanForm>;
    /** The plan's currency, or the business's for a new one. */
    currency: string;
    /** The business offers autopay (D14); unknown reads as not. */
    autopayOffered?: boolean;
    /** What switchers' autopay covers (D13), from the plan's read. */
    autopayLimits?: readonly AutopayLimit[];
}) {
    const { values, set, errors, notes, leave, record, disabled } = fields;
    // Said where a price is changed, of a plan people may already be on: a
    // draft has nobody on it yet.
    const priceHint = record?.published ? PRICE_KEPT : undefined;
    const ids = {
        price: useId(),
        priceErr: useId(),
        limit: useId(),
        every: useId(),
    };
    const [more, setMore] = useState(false);
    const moreOpen = more || MORE_INTERVALS.includes(values.interval);
    const shown = moreOpen
        ? [...MAIN_INTERVALS, ...MORE_INTERVALS]
        : MAIN_INTERVALS;
    const note = everyNote({ ...values, currency }, autopayOffered);
    const limitWarning = autopayLimitWarning(
        values,
        autopayLimits,
        currency,
        gst,
    );
    const toPay = priceToPay(values, currency, gst);
    const renewalLines = gst.asked
        ? renewalChangeLines(renewal, {
              gstInside: (rateBps(values.gstRate) ?? 0) > 0,
          })
        : [];
    const describedBy =
        [
            // `Field` names its help line after the control it was handed.
            priceHint ? `${ids.price}-note` : "",
            errors.price ? ids.priceErr : "",
            limitWarning ? ids.limit : "",
        ]
            .filter(Boolean)
            .join(" ") || undefined;
    return (
        <Section title="Price and billing">
            <Field
                // The help line is Saroh's own words, never a record's.
                holdsData={false}
                label="Price"
                htmlFor={ids.price}
                hint={priceHint}
                className="space-y-[5px]"
            >
                <div className="w-[140px] max-w-full">
                    <MoneyInput
                        id={ids.price}
                        currency={currency}
                        value={values.price}
                        aria-invalid={Boolean(errors.price)}
                        aria-describedby={describedBy}
                        onValueChange={(price) => set({ price })}
                    />
                </div>
            </Field>
            <FieldError id={ids.priceErr}>{errors.price}</FieldError>
            <p
                id={ids.limit}
                aria-live="polite"
                className={cn(
                    "text-pretty text-[12.5px] leading-[1.5] text-warning-subtle-foreground",
                    limitWarning &&
                        "mt-2 rounded-[8px] bg-warning-subtle px-3 py-2",
                )}
            >
                {limitWarning}
            </p>
            {gst.asked ? (
                <div className="mt-3.5 flex flex-wrap items-start gap-3">
                    <GstFields
                        draft={values}
                        set={set}
                        // The shell says a problem as soon as it is there,
                        // but for one the plan was opened with: that is a
                        // note until the field is left or Publish pressed.
                        problem={(field) => errors[field] ?? null}
                        note={(field) => notes[field]}
                        leave={leave}
                        asked
                        canEdit={!disabled}
                        businessPriceMode={gst.priceMode}
                    />
                </div>
            ) : null}
            {/* The price above is the business's own; where GST is added
                to it, what a member pays is said right under it. */}
            {toPay ? (
                <p className={cn(HELP, "mt-2 tabular-nums")}>{toPay}</p>
            ) : null}
            {/* Said before Publish: a GST change reaches the members already
                on the plan at their next renewal. */}
            {renewalLines.length > 0 ? (
                <Notice
                    tone={renewalAmountChanges(renewal) ? "warning" : "info"}
                    className="mt-3"
                    title="Members already on this plan"
                >
                    {renewalLines.length === 1 ? (
                        renewalLines[0]
                    ) : (
                        <ul className="m-0 grid list-none gap-0.5 p-0">
                            {renewalLines.map((line) => (
                                <li key={line}>{line}</li>
                            ))}
                        </ul>
                    )}
                </Notice>
            ) : null}
            <p id={ids.every} className={cn(LABEL, "mt-3.5")}>
                Charged
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div
                    role="radiogroup"
                    aria-labelledby={ids.every}
                    className="flex flex-wrap gap-1.5"
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
                </div>
                {/* Not one of the choices: it shows two more of them (week
                    and quarter), so it is a link beside the group and not a
                    chip in it. A dashed, grey chip read as a choice that
                    was off. */}
                {moreOpen ? null : (
                    <TextLink
                        aria-expanded={false}
                        onClick={() => setMore(true)}
                        className="text-[13px] coarse:inline-flex coarse:min-h-11 coarse:items-center"
                    >
                        Another interval
                    </TextLink>
                )}
            </div>
            {note ? <p className={HELP}>{note}</p> : null}
        </Section>
    );
}
