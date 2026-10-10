"use client";

import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { Switch } from "@saroh/ui/switch";
import type { Control } from "react-hook-form";

import type { FormValues } from "@/components/organizations/business-form";
import { GstinGuide } from "@/components/organizations/gstin-guide";
import { InvoiceNumberFields } from "@/components/organizations/invoice-number-fields";
import {
    fieldWidth,
    RegisteredAddressFields,
} from "@/components/organizations/registered-address-fields";
import { OptionSelect } from "@/components/shared/option-select";
import { GST_RATE_OPTIONS, rateOption } from "@/lib/invoices/gst";
import { GSTIN_EXAMPLE } from "@/lib/invoices/gstin";
import { formatOf, prefixOf } from "@/lib/invoices/invoice-number";
import type { BusinessSheet } from "@/lib/organizations/business-rows";

/** Delivery always carries a rate: no "Not set" row. */
const DELIVERY_RATES = GST_RATE_OPTIONS.filter((o) => o.value !== "");

/** One field's wrapper, at the width the design gives it. */
const at = fieldWidth;

/**
 * The fields of the Tax and invoices and Registered address sheets: the
 * GST switch (with the GSTIN, and the address when turning it on needs
 * one), the GSTIN or tax ID, how invoices are numbered, GST on delivery,
 * and the registered address. Country is a picker, not text: the API takes
 * a two-letter code.
 */
export function BusinessTaxFields({
    sheet,
    control,
    v,
    next,
    numberProblem,
    withAddress,
    onRegistered,
}: {
    sheet: BusinessSheet;
    control: Control<FormValues>;
    /** The draft as it stands. */
    v: FormValues;
    /** The next invoice's number in the draft. */
    next: string;
    /** Why the number format is refused, from what is on screen. */
    numberProblem: string | null;
    /** The business is registered and its saved address is short: ask for it. */
    withAddress: boolean;
    /** The GST switch moved: an untouched number format follows it. */
    onRegistered: (on: boolean) => void;
}) {
    const registered = v.gstRegistered;

    const taxId = (
        <FormField
            control={control}
            name="taxId"
            render={({ field }) => (
                <FormItem {...at("100%")}>
                    <FormLabel>
                        {registered ? "GSTIN" : "Tax ID (optional)"}
                    </FormLabel>
                    <FormControl>
                        <Input
                            {...field}
                            onChange={(e) =>
                                field.onChange(e.target.value.toUpperCase())
                            }
                            placeholder={registered ? GSTIN_EXAMPLE : undefined}
                            maxLength={registered ? 20 : undefined}
                            autoComplete="off"
                            spellCheck={false}
                            className="font-mono tracking-[0.04em]"
                        />
                    </FormControl>
                    {registered ? (
                        <GstinGuide value={field.value ?? ""} />
                    ) : null}
                    <FormDescription>
                        {registered
                            ? "15 characters: your state's code, your PAN, the entity number, Z, and a check character. The state code sets your state."
                            : "Any VAT or tax registration number."}
                    </FormDescription>
                    <FormMessage />
                </FormItem>
            )}
        />
    );

    const address = (
        <RegisteredAddressFields
            control={control}
            registered={registered}
            gstinState={(v.taxId ?? "").trim().slice(0, 2).toUpperCase()}
            // States are India's (GST's list); another country's address
            // has none.
            inIndia={registered || ["", "IN"].includes(v.country ?? "")}
            withCountry
            at={at}
        />
    );

    // A registered business needs a registered address, which is another
    // tab's row. When the saved one is short its fields join the sheet
    // that registers the business or sets its GSTIN, so one Save covers
    // both and nobody is sent to another tab halfway.
    const addressNeeded = withAddress ? (
        <>
            <p className="mt-2 basis-full border-t border-border pt-3 text-[13px] font-medium">
                Registered address
                <span className="ml-2 font-normal text-muted-foreground">
                    A tax invoice prints it
                </span>
            </p>
            {address}
        </>
    ) : null;

    switch (sheet) {
        case "gst":
            return (
                <>
                    <FormField
                        control={control}
                        name="gstRegistered"
                        render={({ field }) => (
                            <FormItem {...at("100%")}>
                                <div className="flex items-center gap-3">
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={(on) => {
                                                field.onChange(on);
                                                onRegistered(on);
                                            }}
                                            aria-label="GST-registered"
                                        />
                                    </FormControl>
                                    <FormLabel className="!mt-0">
                                        GST-registered
                                    </FormLabel>
                                </div>
                                <FormDescription>
                                    {field.value
                                        ? "Orders and invoices become tax invoices with your GSTIN, split into CGST + SGST or IGST. Prices include GST."
                                        : "Orders and invoices are receipts, with no GST on them."}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    {registered ? taxId : null}
                    {addressNeeded}
                </>
            );
        case "taxId":
            return (
                <>
                    {taxId}
                    {addressNeeded}
                </>
            );
        case "numbers":
            return (
                <>
                    <FormField
                        control={control}
                        name="invoicePrefix"
                        render={({ field }) => (
                            <FormItem {...at("140px", false)}>
                                <FormLabel>Invoice prefix</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        maxLength={3}
                                        placeholder="RC"
                                        className="font-mono uppercase"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <InvoiceNumberFields
                        format={formatOf(v)}
                        prefix={prefixOf(v.invoicePrefix)}
                        registered={registered}
                        next={next}
                        problem={numberProblem}
                        timezone={v.timezone || null}
                        at={at}
                    />
                    <p className="basis-full text-[11.5px] leading-normal text-muted-foreground">
                        Invoices already numbered keep their numbers; a new
                        format starts with the next one, and the count carries
                        on. The financial year runs April to March, as GST law
                        sets it.
                    </p>
                </>
            );
        case "delivery":
            return (
                <>
                    <FormField
                        control={control}
                        name="deliveryRate"
                        render={({ field }) => (
                            <FormItem {...at("160px", false)}>
                                <FormLabel>GST on delivery</FormLabel>
                                <FormControl>
                                    <OptionSelect
                                        value={rateOption(field.value) || "18"}
                                        onValueChange={field.onChange}
                                        options={DELIVERY_RATES}
                                        className="w-full"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={control}
                        name="deliverySac"
                        render={({ field }) => (
                            <FormItem {...at("160px", false)}>
                                <FormLabel>Delivery SAC</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        inputMode="numeric"
                                        maxLength={8}
                                        placeholder="996813"
                                        className="font-mono"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <p className="basis-full text-[11.5px] leading-normal text-muted-foreground">
                        Delivery is its own line on an invoice, printed with its
                        SAC.
                    </p>
                </>
            );
        case "address":
            return (
                <>
                    {address}
                    <p className="basis-full text-[11.5px] leading-normal text-muted-foreground">
                        Invoices already issued keep the address they went out
                        with.
                    </p>
                </>
            );
        default:
            return null;
    }
}
