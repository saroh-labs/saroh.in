"use client";

import { FormField, FormItem, FormLabel, FormMessage } from "@saroh/ui/form";
import type { Control } from "react-hook-form";

import type { FormValues } from "@/components/organizations/business-settings/business-form";
import { TRADE_ROW_LABEL } from "@/lib/organizations/trade";

import { SetupTradeChoice } from "@/components/organizations/setup/setup-trade-choice";

/**
 * "Kind of place" in Settings › Business › Identity (DEC-216, TPLD2): the
 * same chips setup asked with, in the row's own sheet. The sheet's line
 * under its title says what it changes.
 */
export function BusinessTradeField({
    control,
    at,
}: {
    control: Control<FormValues>;
    at: (
        basis: string,
        grow?: boolean,
    ) => { className: string; style: React.CSSProperties };
}) {
    return (
        <FormField
            control={control}
            name="trade"
            render={({ field }) => (
                <FormItem {...at("100%")}>
                    <FormLabel id="business-trade-label" className="sr-only">
                        {TRADE_ROW_LABEL}
                    </FormLabel>
                    <SetupTradeChoice
                        value={field.value}
                        onChange={field.onChange}
                        labelledBy="business-trade-label"
                    />
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
