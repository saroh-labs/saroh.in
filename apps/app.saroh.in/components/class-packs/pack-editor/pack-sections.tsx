"use client";

import { AbsentOr } from "@saroh/ui/absent-value";
import { Field, FieldError } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { MoneyInput } from "@saroh/ui/money-input";
import { Textarea } from "@saroh/ui/textarea";
import { useId } from "react";

import type {
    PackKind,
    PackServiceOption,
    PackValues,
} from "@/lib/class-packs/pack-editor";
import {
    KIND_OPTIONS,
    kindNote,
    MAX_DESCRIPTION,
    parseWhole,
    switchKind,
    unitsOf,
} from "@/lib/class-packs/pack-editor";
import {
    eachNote,
    glance,
    packRules,
    priceToPay,
} from "@/lib/class-packs/pack-editor-words";

import { GstFields } from "@/components/services/service-editor/gst-fields";
import { CheckRow } from "@/components/shared/check-row";
import type { GstAsk } from "@/lib/gst/item-words";
import { NOT_ASKED } from "@/lib/gst/item-words";
import { itemModeInput, itemModeValue } from "@/lib/gst/price-mode";
import { rateOption } from "@/lib/invoices/gst";
import { HELP, LABEL, PackChip, PackSection } from "./parts";
import { ValidityChips } from "./validity-chips";

/*
 * The Pack Editor's sections (E18), in the design's order: Details and
 * Credits and price in the main column (Good for is `services-picker.tsx`),
 * Who can buy it, At a glance and the rules note in the side one. Each
 * edits the values through `set`; problems arrive in `errors` by field.
 */

interface Edit {
    values: PackValues;
    set: (patch: Partial<PackValues>) => void;
    errors: Partial<Record<string, string>>;
}

/** Name, a description, and what the credits are for (locked once sold). */
export function Details({
    values,
    set,
    errors,
    services,
    locked,
    live,
    sold,
}: Edit & {
    services: PackServiceOption[] | null;
    /** A sold pack's kind can't change (E13). */
    locked: boolean;
    live: boolean;
    sold: number | null;
}) {
    const ids = {
        name: useId(),
        desc: useId(),
        kind: useId(),
        kindNote: useId(),
        kindErr: useId(),
    };
    const pick = (kind: PackKind) => {
        if (locked || kind === values.kind) return;
        // Credits never mix: switching the kind swaps what it is good for.
        // Unread services leave the choice as it is.
        set(services ? switchKind(kind, services) : { kind });
    };
    return (
        <PackSection title="Details">
            <Field label="Name" error={errors.name} className="space-y-[5px]">
                <Input
                    id={ids.name}
                    value={values.name}
                    maxLength={120}
                    autoComplete="off"
                    placeholder="e.g. 10 classes"
                    onChange={(e) => set({ name: e.target.value })}
                />
            </Field>

            <Field
                label="Description"
                optional
                error={errors.description}
                className="mt-3 space-y-[5px]"
            >
                <Textarea
                    id={ids.desc}
                    rows={2}
                    maxLength={MAX_DESCRIPTION}
                    value={values.description ?? ""}
                    placeholder="e.g. Any class, any day. Great for getting started."
                    onChange={(e) => set({ description: e.target.value })}
                />
            </Field>

            <div id={ids.kind} className={cn(LABEL, "mt-3")}>
                Credits are for
            </div>
            <div
                role="radiogroup"
                aria-labelledby={ids.kind}
                aria-describedby={
                    errors.kind
                        ? `${ids.kindNote} ${ids.kindErr}`
                        : ids.kindNote
                }
                className="mt-1.5 flex flex-wrap gap-1.5"
            >
                {KIND_OPTIONS.map((o) => {
                    const on = values.kind === o.value;
                    return (
                        <PackChip
                            key={o.value}
                            on={on}
                            // The kind it was sold as stays pressable-looking
                            // but inert; the other one is off, with the reason
                            // said under them.
                            disabled={locked && !on}
                            aria-disabled={locked ? true : undefined}
                            onClick={() => pick(o.value)}
                        >
                            {o.label}
                        </PackChip>
                    );
                })}
            </div>
            <p id={ids.kindNote} className={HELP}>
                {kindNote(live, sold)}
            </p>
            <FieldError id={ids.kindErr}>{errors.kind}</FieldError>
        </PackSection>
    );
}

/**
 * How many, the price, what each works out at, and how long to use it. A
 * GST-registered business answers the pack's GST under the price (12 Oct
 * 2026), as on a service; the values stay as the API holds them (null is
 * not set), and the fields read them as the selects' own.
 */
export function CreditsAndPrice({
    values,
    set,
    errors,
    services,
    gst = NOT_ASKED,
    disabled = false,
}: Edit & {
    services: PackServiceOption[] | null;
    /** Whether GST is asked, and the business's own way of carrying it. */
    gst?: GstAsk;
    disabled?: boolean;
}) {
    const ids = {
        credits: useId(),
        creditsErr: useId(),
        price: useId(),
        priceErr: useId(),
    };
    const note = eachNote(values, services ?? [], gst);
    const toPay = priceToPay(values, gst);
    return (
        <PackSection title="Credits and price">
            <div className="flex flex-wrap items-end gap-3">
                <Field label="How many" className="space-y-[5px]">
                    <Input
                        id={ids.credits}
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`How many ${unitsOf(values.kind)}`}
                        value={
                            values.credits === null
                                ? ""
                                : String(values.credits)
                        }
                        aria-invalid={errors.credits ? true : undefined}
                        aria-describedby={
                            errors.credits ? ids.creditsErr : undefined
                        }
                        onChange={(e) =>
                            set({ credits: parseWhole(e.target.value) })
                        }
                        className="w-[88px] max-w-full"
                    />
                </Field>
                <Field
                    label="Price"
                    htmlFor={ids.price}
                    className="space-y-[5px]"
                >
                    <div className="w-[140px] max-w-full">
                        <MoneyInput
                            id={ids.price}
                            currency={values.currency}
                            value={values.price ?? ""}
                            aria-invalid={errors.price ? true : undefined}
                            aria-describedby={
                                errors.price ? ids.priceErr : undefined
                            }
                            onValueChange={(price) =>
                                set({ price: price || null })
                            }
                        />
                    </div>
                </Field>
            </div>
            <FieldError id={ids.creditsErr}>{errors.credits}</FieldError>
            <FieldError id={ids.priceErr}>{errors.price}</FieldError>
            {/* The price above is the business's own; where GST is added
                to it, what a customer pays is said right under it. */}
            {toPay ? <p className={cn(HELP, "tabular-nums")}>{toPay}</p> : null}
            {note ? <p className={HELP}>{note}</p> : null}
            {gst.asked ? (
                <div className="mt-3 flex flex-wrap items-start gap-3">
                    <GstFields
                        draft={{
                            gstRate: rateOption(values.gstRate),
                            sacCode: values.sacCode ?? "",
                            gstPriceMode: itemModeValue(values.gstPriceMode),
                        }}
                        set={(patch) =>
                            set({
                                ...(patch.gstRate !== undefined
                                    ? { gstRate: patch.gstRate || null }
                                    : {}),
                                ...(patch.sacCode !== undefined
                                    ? { sacCode: patch.sacCode || null }
                                    : {}),
                                ...(patch.gstPriceMode !== undefined
                                    ? {
                                          gstPriceMode: itemModeInput(
                                              patch.gstPriceMode,
                                          ),
                                      }
                                    : {}),
                            })
                        }
                        // The shell says a problem as soon as it is there.
                        problem={(field) => errors[field] ?? null}
                        asked
                        canEdit={!disabled}
                        businessPriceMode={gst.priceMode}
                    />
                </div>
            ) : null}
            <ValidityChips
                value={values.validityDays}
                onChange={(validityDays) => set({ validityDays })}
                error={errors.validityDays}
            />
        </PackSection>
    );
}

/** "Only for someone's first pack" (E13's first-pack rule). */
export function WhoCanBuy({ values, set, errors }: Edit) {
    const errId = useId();
    const units = values.kind === "ONE_TO_ONE" ? "one-to-one" : "class";
    return (
        <PackSection title="Who can buy it" tight>
            <CheckRow
                checked={values.firstPackOnly}
                onChange={(firstPackOnly) => set({ firstPackOnly })}
                aria-describedby={errors.firstPackOnly ? errId : undefined}
                className="mt-1 items-start gap-[9px]"
                boxClassName="mt-0.5"
            >
                <span>
                    Only for someone&apos;s first pack
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                        An intro offer: only someone who has never bought a{" "}
                        {units} pack before can buy it.
                    </span>
                </span>
            </CheckRow>
            <FieldError id={errId}>{errors.firstPackOnly}</FieldError>
        </PackSection>
    );
}

/** At a glance: per class, the saving against drop-in, and sold so far. */
export function PackGlance({
    values,
    services,
    sold,
    gst = NOT_ASKED,
}: {
    values: PackValues;
    services: PackServiceOption[] | null;
    sold: number | null;
    /** The business's GST standing, for what the pack costs to pay. */
    gst?: GstAsk;
}) {
    return (
        <>
            <PackSection title="At a glance" tight>
                <dl className="m-0">
                    {glance(values, services ?? [], sold, gst).map(([k, v]) => (
                        <div
                            key={k}
                            className="flex gap-2.5 border-t border-border/60 py-[7px] text-[13px]"
                        >
                            <dt className="flex-1 text-muted-foreground">
                                {k}
                            </dt>
                            <dd className="m-0 text-right font-semibold tabular-nums">
                                <AbsentOr
                                    says={
                                        k === "Sold so far"
                                            ? "Not known"
                                            : "Not set"
                                    }
                                >
                                    {v}
                                </AbsentOr>
                            </dd>
                        </div>
                    ))}
                </dl>
            </PackSection>
            <p className="m-0 text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                {packRules(values.kind)}
            </p>
        </>
    );
}
