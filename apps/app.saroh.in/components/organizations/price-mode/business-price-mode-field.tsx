"use client";

import {
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Notice } from "@saroh/ui/notice";
import { useEffect, useState } from "react";
import type { Control } from "react-hook-form";
import { useFormState, useWatch } from "react-hook-form";

import type { FormValues } from "@/components/organizations/business-settings/business-form";
import { RadioCards } from "@/components/shared/choice-group";
import type { OverMrpRead } from "@/lib/gst-rates/over-mrp";
import { overMrpWords } from "@/lib/gst-rates/over-mrp";
import {
    PRICE_MODE_CHOICES,
    PRICE_MODE_SMALL_PRINT,
} from "@/lib/gst/price-mode";
import { loadOverMrpIfAdded } from "@/lib/organizations/settings-actions";

const OPTIONS = PRICE_MODE_CHOICES.map((choice) => ({
    value: choice.value,
    label: choice.label,
    note: choice.hint,
}));

/**
 * "GST on your prices" (12 Oct 2026): whether the prices a GST-registered
 * business types include GST or have GST added to them. Two choices, each
 * with a worked example, and under them what the choice covers and what it
 * leaves alone. Only a registered business's Tax and invoices tab has the
 * row that opens this (`business-tax-rows.tsx`); the API refuses the save
 * for any other.
 *
 * GST is part of MRP (12 Oct 2026): "GST is added" puts GST on top of every
 * product's price at once, and none may cost more than its MRP. So while
 * that choice is picked, the sheet says how many products (and options)
 * would go over their MRP and names the first few, with the way out
 * (`BusinessOverMrp`); the API refuses the save while any would.
 */
export function BusinessPriceModeField({
    control,
    at,
}: {
    control: Control<FormValues>;
    at: (
        basis: string,
        grow?: boolean,
    ) => { className: string; style: React.CSSProperties };
}) {
    const chosen = useWatch({ control, name: "priceMode" });
    const { defaultValues } = useFormState({ control });
    // While the list of products over their MRP is on the sheet it is the
    // whole of what a refused save has to say: the refusal's own sentence
    // would say it twice, and no choice is the one in error.
    const [listed, setListed] = useState(false);
    const said = chosen === "ADDED" && listed;
    return (
        <FormField
            control={control}
            name="priceMode"
            render={({ field, fieldState }) => (
                <FormItem {...at("100%")}>
                    <FormLabel id="business-price-mode-label">
                        How your prices carry GST
                    </FormLabel>
                    <RadioCards
                        labelledBy="business-price-mode-label"
                        describedBy="business-price-mode-note"
                        options={OPTIONS}
                        value={field.value}
                        onChange={field.onChange}
                        invalid={Boolean(fieldState.error) && !said}
                    />
                    {chosen === "ADDED" ? (
                        <BusinessOverMrp
                            switching={defaultValues?.priceMode !== "ADDED"}
                            refused={Boolean(fieldState.error)}
                            onListed={setListed}
                        />
                    ) : null}
                    <FormDescription id="business-price-mode-note">
                        {PRICE_MODE_SMALL_PRINT}
                    </FormDescription>
                    {said ? null : <FormMessage />}
                </FormItem>
            )}
        />
    );
}

/**
 * Under "GST is added to my prices": the products that would cost more
 * than their MRP with GST on top, counted and the first few named, and how
 * to put them right. Read when the choice is picked. Nothing is drawn when
 * none would, or when the read couldn't tell: the API's own check on the
 * save still stands behind it.
 *
 * `switching` is false for a business already saved as "GST is added": the
 * list is then what is over as things stand.
 */
export function BusinessOverMrp({
    switching,
    refused = false,
    onListed,
}: {
    switching: boolean;
    /** A save was just refused for these: the notice is the error. */
    refused?: boolean;
    /** Told whether there is a list on the sheet. */
    onListed?: (listed: boolean) => void;
}) {
    const [read, setRead] = useState<OverMrpRead | null>(null);
    useEffect(() => {
        let live = true;
        void loadOverMrpIfAdded()
            .then((answer) => {
                if (live) setRead(answer);
            })
            // Couldn't be read: say nothing; the save is still checked.
            .catch(() => undefined);
        return () => {
            live = false;
        };
    }, []);
    const words = overMrpWords(read, switching);
    const listed = words !== null;
    useEffect(() => {
        onListed?.(listed);
        return () => onListed?.(false);
    }, [listed, onListed]);
    if (!words) return null;
    return (
        <Notice
            // After a refused save it is the reason, and is read out.
            tone={refused ? "error" : "warning"}
            role={refused ? "alert" : undefined}
            title={words.title}
            data-over-mrp=""
            className="mt-1"
        >
            <ul className="list-none space-y-0.5 tabular-nums">
                {words.rows.map((row) => (
                    <li key={row}>{row}</li>
                ))}
                {words.rest ? <li>{words.rest}</li> : null}
            </ul>
            <p className="mt-2">{words.fix}</p>
        </Notice>
    );
}
