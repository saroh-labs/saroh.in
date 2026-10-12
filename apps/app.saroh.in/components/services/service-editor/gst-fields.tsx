"use client";

import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { OptionSelect } from "@saroh/ui/option-select";

import type { GstRateValue } from "@/lib/invoices/gst";
import {
    GST_RATE_CHOICES,
    GST_RATE_OPTIONS,
    GST_RATE_PLACEHOLDER,
} from "@/lib/invoices/gst";

import type { Edit } from "./fields";

/**
 * A service's GST rate and SAC code (ADR-008), drawn in one of two places
 * (`gstPlace`).
 *
 * Beside the price, for a GST-registered business (`asked`): the rate is a
 * question with no "Not set" row. The box starts on "Choose a rate", and
 * 0% is a choice like any other, for an exempt or nil-rated service.
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
    asked,
    canEdit,
}: Edit & {
    /** A registered business's: it has to be answered for a priced service. */
    asked: boolean;
    canEdit: boolean;
}) {
    return (
        <>
            <Field
                label="GST rate"
                className="flex-[1_1_200px]"
                error={problem("gstRate")}
                hint={
                    asked
                        ? "The rate the price includes. It isn't added on top."
                        : "Included in the price, on a GST invoice."
                }
            >
                <OptionSelect<GstRateValue>
                    value={draft.gstRate as GstRateValue}
                    onValueChange={(gstRate) => {
                        set({ gstRate });
                        leave("gstRate");
                    }}
                    options={asked ? GST_RATE_CHOICES : GST_RATE_OPTIONS}
                    placeholder={asked ? GST_RATE_PLACEHOLDER : undefined}
                    disabled={!canEdit}
                />
            </Field>
            <Field
                label="SAC code"
                optional={asked}
                className="flex-[1_1_160px]"
                error={problem("sacCode")}
                onBlur={() => leave("sacCode")}
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
