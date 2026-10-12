"use client";

import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { OptionSelect } from "@saroh/ui/option-select";
import type { FocusEvent } from "react";

import type { GstForm } from "@/lib/gst/item-words";
import type { GstPriceMode, ItemModeValue } from "@/lib/gst/price-mode";
import {
    ITEM_MODE_LABEL,
    itemModeOptions,
    rateHint,
} from "@/lib/gst/price-mode";
import type { GstRateValue } from "@/lib/invoices/gst";
import {
    GST_RATE_CHOICES,
    GST_RATE_OPTIONS,
    GST_RATE_PLACEHOLDER,
} from "@/lib/invoices/gst";

/** The two GST fields that can be wrong. */
export type GstField = "gstRate" | "sacCode";

/**
 * What the fields need of a draft: the three GST fields, a way to change
 * them, what is wrong with one, and a way to say one was left (for a page
 * that holds a problem back until then; the editor shell says one at once
 * and passes none). The Service Editor's `Edit` fits it, and so do the
 * Plan Editor's, the Pack Editor's and the course form's own drafts.
 */
export interface GstEdit {
    draft: GstForm;
    set: (patch: Partial<GstForm>) => void;
    problem: (field: GstField) => string | null | undefined;
    leave?: (field: GstField) => void;
    /**
     * A plain note in place of the rate's help line, while a missing rate
     * is not yet said as a problem (the editor shell's `notes`: a plan or
     * pack published before the rate was asked for).
     */
    note?: (field: GstField) => string | null | undefined;
}

/**
 * Whether a blur is the rate box being left. Opening its list moves the
 * keyboard into the list, which is not leaving the field, and a blur inside
 * the list reaches here through React though the list is drawn elsewhere.
 */
function leftRate(e: FocusEvent<HTMLElement>): boolean {
    const from = e.target;
    if (!e.currentTarget.contains(from)) return false;
    if (from.getAttribute("aria-expanded") === "true") return false;
    const to = e.relatedTarget;
    return !(to instanceof Element && to.closest('[role="listbox"]'));
}

/**
 * The GST rate, "GST on this price" and the SAC code of something sold as a
 * service is (ADR-008): a service, and since 12 Oct 2026 a membership plan,
 * a class pack and a course, by the same rules. On a service they are drawn
 * in one of two places (`gstPlace`).
 *
 * Beside the price, for a GST-registered business (`asked`): the rate is a
 * question with no "Not set" row. The box starts on "Choose a rate", and
 * 0% is a choice like any other, for an exempt or nil-rated service. Beside
 * it, "GST on this price" for the one service priced differently from the
 * business's own way (12 Oct 2026); a business that isn't registered is
 * never shown it.
 *
 * Under More settings, where the page couldn't tell whether the business
 * is registered, or one that isn't has a rate saved from before: as it
 * always was, with "Not set" to clear it.
 */
export function GstFields({
    draft,
    set,
    problem,
    leave,
    note,
    asked,
    canEdit,
    businessPriceMode = null,
}: GstEdit & {
    /** A registered business's: it has to be answered for a priced one. */
    asked: boolean;
    canEdit: boolean;
    /**
     * How the business's prices carry GST, for "Same as the business (…)";
     * null when it couldn't be told.
     */
    businessPriceMode?: GstPriceMode | null;
}) {
    const rateNote = note?.("gstRate");
    return (
        <>
            <Field
                // Saroh's own words, whichever way the price carries GST.
                holdsData={false}
                label="GST rate"
                className="flex-[1_1_200px]"
                error={problem("gstRate")}
                // Where a note may stand in for the problem (the editor
                // shell), tabbing past the box without choosing is leaving
                // it. The other pages say the rate's problem as they did.
                onBlur={(e) => {
                    if (note && leftRate(e)) leave?.("gstRate");
                }}
                hint={
                    rateNote ? (
                        // Not an error and not small print: ink, so it is
                        // read, with no red and no alert.
                        <span className="text-foreground">{rateNote}</span>
                    ) : asked ? (
                        rateHint(
                            businessPriceMode,
                            draft.gstPriceMode,
                            "The rate the price includes. It isn't added on top.",
                        )
                    ) : (
                        "Included in the price, on a GST invoice."
                    )
                }
            >
                <OptionSelect<GstRateValue>
                    value={draft.gstRate as GstRateValue}
                    onValueChange={(gstRate) => {
                        set({ gstRate });
                        leave?.("gstRate");
                    }}
                    options={asked ? GST_RATE_CHOICES : GST_RATE_OPTIONS}
                    placeholder={asked ? GST_RATE_PLACEHOLDER : undefined}
                    disabled={!canEdit}
                />
            </Field>
            {/* Only a registered business chooses how a price carries GST
                (12 Oct 2026); most leave it as the business's own way. */}
            {asked ? (
                <Field
                    label={ITEM_MODE_LABEL}
                    className="flex-[1_1_220px]"
                    hint="Only if this one is priced differently from the rest."
                >
                    <OptionSelect<ItemModeValue>
                        value={draft.gstPriceMode}
                        onValueChange={(gstPriceMode) => set({ gstPriceMode })}
                        options={itemModeOptions(businessPriceMode)}
                        disabled={!canEdit}
                    />
                </Field>
            ) : null}
            <Field
                label="SAC code"
                optional={asked}
                className="flex-[1_1_160px]"
                error={problem("sacCode")}
                onBlur={() => leave?.("sacCode")}
                hint="The service code printed on tax invoices."
            >
                <Input
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="999723"
                    value={draft.sacCode}
                    onChange={(e) => set({ sacCode: e.target.value })}
                    className="font-mono"
                />
            </Field>
        </>
    );
}
