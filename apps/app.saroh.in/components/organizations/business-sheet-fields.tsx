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
import type { Control } from "react-hook-form";

import type { FormValues } from "@/components/organizations/business-form";
import { BusinessKindField } from "@/components/organizations/business-kind-field";
import { BusinessTaxFields } from "@/components/organizations/business-tax-fields";
import { fieldWidth } from "@/components/organizations/registered-address-fields";
import { TimeZoneSelect } from "@/components/organizations/time-zone-select";
import { OptionSelect } from "@/components/shared/option-select";
import { PHONE_EXAMPLE } from "@/lib/organizations/business-phone";
import type { BusinessSheet } from "@/lib/organizations/business-rows";
import { nameLabelOf } from "@/lib/organizations/business-sheet-words";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/organizations/business-types";
import { kindWords } from "@/lib/organizations/kind";
import { browserZone } from "@/lib/organizations/time-zones";

/** One field's wrapper, at the width the design gives it. */
const at = fieldWidth;

/**
 * The fields of one of Settings › Business's sheets, drawn from the sheet's
 * draft (`business-field-sheet.tsx`): the same fields, notes and limits the
 * cards had, a row's worth at a time. Identity's and Contact's are here;
 * the tax and address sheets' are `business-tax-fields.tsx`.
 *
 * Type is a picker, not text: the API accepts only the six business types
 * (`business-types.ts`).
 */
export function BusinessSheetFields({
    sheet,
    control,
    v,
    kind,
    typeAsked,
    zoneSaved,
    next,
    numberProblem,
    withAddress,
    onRegistered,
}: {
    sheet: BusinessSheet;
    control: Control<FormValues>;
    /** The draft as it stands. */
    v: FormValues;
    /** What is being set up, as saved: the words follow it (DEC-070). */
    kind: unknown;
    /** Said Registered at setup, and no type chosen since. */
    typeAsked: boolean;
    /** Whether a time zone is saved; else the browser's was offered. */
    zoneSaved: boolean;
    /** The next invoice's number in the draft. */
    next: string;
    /** Why the number format is refused, from what is on screen. */
    numberProblem: string | null;
    /** The business is registered and its saved address is short: ask for it. */
    withAddress: boolean;
    /** The GST switch moved: an untouched number format follows it. */
    onRegistered: (on: boolean) => void;
}) {
    const words = kindWords(kind);
    switch (sheet) {
        case "kind":
            return <BusinessKindField control={control} name="kind" at={at} />;
        case "name":
            return (
                <FormField
                    control={control}
                    name="name"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <FormLabel>{nameLabelOf(kind)}</FormLabel>
                            <FormControl>
                                <Input {...field} maxLength={120} />
                            </FormControl>
                            <FormDescription>
                                Shown to {words.people} on receipts and in the
                                business switcher. Your links keep working if
                                you rename it.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            );
        case "legalName":
            return (
                <FormField
                    control={control}
                    name="legalName"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <FormLabel>Legal name</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    placeholder="Same as the business name"
                                />
                            </FormControl>
                            <FormDescription>
                                The registered name, if it differs from the
                                business name. Invoices are issued in it.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            );
        case "type":
            return (
                <FormField
                    control={control}
                    name="type"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <FormLabel>Type</FormLabel>
                            <FormControl>
                                <OptionSelect
                                    value={field.value ?? ""}
                                    onValueChange={field.onChange}
                                    options={BUSINESS_TYPE_OPTIONS}
                                    className="w-full"
                                />
                            </FormControl>
                            <FormDescription>
                                {typeAsked
                                    ? "You said at setup that the business is registered. Choose which kind before you take money."
                                    : "An individual trades in their own name; a company is registered as one."}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            );
        case "timezone":
            return (
                <FormField
                    control={control}
                    name="timezone"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <FormLabel>Time zone</FormLabel>
                            <FormControl>
                                <TimeZoneSelect
                                    value={field.value}
                                    onValueChange={field.onChange}
                                />
                            </FormControl>
                            <FormDescription>
                                Invoice numbers, bookings and the calendar use
                                this time.
                                {!zoneSaved &&
                                field.value &&
                                field.value === browserZone()
                                    ? " This one is from your browser. Change it if the business runs elsewhere."
                                    : ""}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            );
        case "contactEmail":
            return (
                <FormField
                    control={control}
                    name="contactEmail"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <FormLabel>Contact email</FormLabel>
                            <FormControl>
                                <Input {...field} type="email" />
                            </FormControl>
                            <FormDescription>
                                Where customers can reach the business. Your
                                website shows it at the foot of every page.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            );
        case "phone":
            return (
                <FormField
                    control={control}
                    name="phone"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <FormLabel>Phone on your website</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    type="tel"
                                    inputMode="tel"
                                    autoComplete="tel"
                                    placeholder={PHONE_EXAMPLE}
                                />
                            </FormControl>
                            <FormDescription>
                                Your site shows it with a Call button, and
                                offers it when a sign-in code can&apos;t be
                                sent. Start with + and the country code. Leave
                                it empty to show none.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            );
        case "website":
            return (
                <FormField
                    control={control}
                    name="website"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <FormLabel>Website</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    type="url"
                                    placeholder="https://example.in"
                                />
                            </FormControl>
                            <FormDescription>
                                A site the business has outside Saroh, if any.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            );
        case "gst":
        case "taxId":
        case "numbers":
        case "delivery":
        case "address":
            return (
                <BusinessTaxFields
                    sheet={sheet}
                    control={control}
                    v={v}
                    next={next}
                    numberProblem={numberProblem}
                    withAddress={withAddress}
                    onRegistered={onRegistered}
                />
            );
        default:
            // The logo, How to pay us and Hours keep forms of their own.
            return null;
    }
}
