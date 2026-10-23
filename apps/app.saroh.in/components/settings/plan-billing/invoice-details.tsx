"use client";

import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { OptionSelect } from "@saroh/ui/option-select";
import type { ChangeEvent } from "react";

import { BusinessPhoneInput } from "@/components/shared/fields/business-phone-input";
import { GST_STATES } from "@/lib/invoices/gst";
import { phoneProblem } from "@/lib/organizations/business-phone";
import type { BillingDetail, ChangeQuote } from "@/lib/saroh-billing/plan-view";

/**
 * "Details for Saroh's invoice" in the change-plan dialog (U17; 17 Oct
 * 2026): who Saroh bills. What the business is missing — a name, an email,
 * its registered address, its state — must be given before the payment
 * opens, as the API refuses without them; a GSTIN is optional, and a phone
 * is asked for (optional) when the business has none. Field names are the
 * API's, so a refusal's `details.field` lands on its field.
 */

export type DetailField =
    | "billingName"
    | "billingEmail"
    | "addressLine1"
    | "addressLine2"
    | "city"
    | "postalCode"
    | "billingState"
    | "gstin"
    | "phone";

export const DETAIL_FIELDS: DetailField[] = [
    "billingName",
    "billingEmail",
    "addressLine1",
    "addressLine2",
    "city",
    "postalCode",
    "billingState",
    "gstin",
    "phone",
];

export type DetailsDraft = Record<DetailField, string>;
export type DetailErrors = Partial<Record<DetailField, string>>;

export const EMPTY_DETAILS: DetailsDraft = {
    billingName: "",
    billingEmail: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    postalCode: "",
    billingState: "",
    gstin: "",
    phone: "",
};

/** What the dialog asks for, from the quote. */
export interface DetailsAsked {
    name: boolean;
    email: boolean;
    address: boolean;
    state: boolean;
    phone: boolean;
}

/**
 * What to ask, from the quote: what it says is missing, and a phone when
 * the business has none. An API from before `billingDetails` asks only for
 * an address it says isn't there.
 */
export function detailsAsked(quote: ChangeQuote): DetailsAsked {
    const missing: BillingDetail[] =
        quote.billingDetails?.missing ??
        (quote.registeredAddress === false ? ["address"] : []);
    return {
        name: missing.includes("name"),
        email: missing.includes("email"),
        address: missing.includes("address"),
        state: missing.includes("state"),
        phone: quote.billingDetails ? !quote.billingDetails.phone : false,
    };
}

/** Whether anything must be given before the payment opens. */
export function needsDetails(asked: DetailsAsked): boolean {
    return asked.name || asked.email || asked.address || asked.state;
}

type AddressField = "addressLine1" | "addressLine2" | "city" | "postalCode";

const PIN = /^[1-9][0-9]{5}$/;

/**
 * What is wrong with the registered address typed at checkout, by field:
 * nothing typed is fine unless it is `required`; anything typed needs the
 * first line, the city and a six-digit PIN, as the API asks.
 */
export function addressProblems(
    a: Record<AddressField, string>,
    required: boolean,
): Partial<Record<AddressField, string>> {
    const line1 = a.addressLine1.trim();
    const city = a.city.trim();
    const pin = a.postalCode.replace(/\s+/g, "");
    const any = Boolean(line1 || a.addressLine2.trim() || city || pin);
    if (!any && !required) return {};
    const out: Partial<Record<AddressField, string>> = {};
    if (!line1) {
        out.addressLine1 = any
            ? "Add the address's first line."
            : "Add the business's registered address: it prints on Saroh's invoice.";
    }
    if (!city) out.city = "Add the city.";
    if (!pin) out.postalCode = "Add the PIN code.";
    else if (!PIN.test(pin)) {
        out.postalCode = "A PIN code is six digits, like 560038.";
    }
    return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN = /^[0-9A-Z]{15}$/;

/**
 * Everything wrong with the details, by field, in the form's order: what
 * is asked for and missing, and anything typed that the API would refuse.
 * The state may come from a GSTIN, whose first two digits are its state.
 */
export function detailsProblems(
    d: DetailsDraft,
    asked: DetailsAsked,
): DetailErrors {
    const out: DetailErrors = {};
    if (asked.name && !d.billingName.trim()) {
        out.billingName =
            "Add the business's name as it should read on Saroh's invoice.";
    }
    const email = d.billingEmail.trim();
    if (asked.email && !email) {
        out.billingEmail =
            "Add an email for Saroh's invoices and payment receipts.";
    } else if (asked.email && !EMAIL.test(email)) {
        out.billingEmail = "That email doesn't look right.";
    }
    Object.assign(out, addressProblems(d, asked.address));
    const gstin = d.gstin.trim().toUpperCase();
    if (asked.state && !d.billingState && !gstin) {
        out.billingState = "Choose the state your business is registered in.";
    }
    if (gstin && !GSTIN.test(gstin)) out.gstin = "A GSTIN is 15 characters.";
    const phone = d.phone.trim() ? phoneProblem(d.phone) : null;
    if (phone) out.phone = phone;
    return out;
}

/** What the change-plan action is sent of the details. */
export function detailsSent(d: DetailsDraft, asked: DetailsAsked) {
    const typedAddress = asked.address && d.addressLine1.trim();
    return {
        billingState: d.billingState || undefined,
        gstin: d.gstin.trim().toUpperCase() || undefined,
        billingName: asked.name ? d.billingName : undefined,
        billingEmail: asked.email ? d.billingEmail : undefined,
        phone: asked.phone && d.phone.trim() ? d.phone : undefined,
        registeredAddress: typedAddress
            ? {
                  line1: d.addressLine1,
                  line2: d.addressLine2,
                  city: d.city,
                  postalCode: d.postalCode,
              }
            : undefined,
    };
}

const STATE_OPTIONS_KEPT = [
    { value: "", label: "As on the business's details" },
    ...GST_STATES,
];

/**
 * The fields themselves: only what is asked, in one column, each with its
 * error in place. When anything is required, the optional ones say so.
 */
export function InvoiceDetailsFields({
    asked,
    value,
    errors,
    onChange,
}: {
    asked: DetailsAsked;
    value: DetailsDraft;
    errors: DetailErrors;
    onChange: (field: DetailField, value: string) => void;
}) {
    const required = needsDetails(asked);
    const input = (field: DetailField) => ({
        value: value[field],
        onChange: (e: ChangeEvent<HTMLInputElement>) =>
            onChange(field, e.target.value),
    });
    return (
        <div className="grid gap-3">
            {required ? (
                <p className="text-[12px] text-muted-foreground">
                    Saroh&apos;s invoice needs these before the payment opens.
                    They&apos;re saved to the billing profile Saroh bills.
                </p>
            ) : null}
            {asked.name ? (
                <Field label="Business name" error={errors.billingName}>
                    <Input
                        id="bill-name"
                        {...input("billingName")}
                        maxLength={200}
                        autoComplete="organization"
                    />
                </Field>
            ) : null}
            {asked.email ? (
                <Field label="Email for invoices" error={errors.billingEmail}>
                    <Input
                        id="bill-email"
                        {...input("billingEmail")}
                        type="email"
                        maxLength={254}
                        autoComplete="email"
                    />
                </Field>
            ) : null}
            {asked.address ? (
                <AddressFields
                    value={value}
                    errors={errors}
                    onChange={onChange}
                />
            ) : null}
            <Field
                label="State your business is registered in"
                optional={required && !asked.state}
                error={errors.billingState}
            >
                <OptionSelect
                    id="bill-state"
                    value={value.billingState}
                    onValueChange={(v) => onChange("billingState", v)}
                    options={asked.state ? GST_STATES : STATE_OPTIONS_KEPT}
                    placeholder="Choose a state"
                />
            </Field>
            <Field
                label="GSTIN"
                optional={required}
                hint="Leave it empty if the business has none."
                error={errors.gstin}
            >
                <Input
                    id="bill-gstin"
                    {...input("gstin")}
                    maxLength={15}
                    autoComplete="off"
                    className="font-mono uppercase"
                />
            </Field>
            {asked.phone ? (
                <Field
                    label="Phone"
                    optional
                    hint="Printed on Saroh's invoice."
                    error={errors.phone}
                >
                    <BusinessPhoneInput
                        id="bill-phone"
                        value={value.phone}
                        onValueChange={(v) => onChange("phone", v)}
                        autoComplete="tel-national"
                    />
                </Field>
            ) : null}
        </div>
    );
}

/**
 * The billing address, asked for when the business's billing profile has
 * none whole and kept there (Plan & billing's "Billed to" shows it after,
 * DEC-167): it prints on Saroh's invoice (CGST Rule 46(e)).
 */
function AddressFields({
    value,
    errors,
    onChange,
}: {
    value: DetailsDraft;
    errors: DetailErrors;
    onChange: (field: DetailField, value: string) => void;
}) {
    return (
        <div
            role="group"
            aria-labelledby="bill-address-label"
            className="grid gap-3"
        >
            <p id="bill-address-label" className="text-[13px] font-semibold">
                Registered address
            </p>
            <Field label="Address line 1" error={errors.addressLine1}>
                <Input
                    id="bill-address-line1"
                    value={value.addressLine1}
                    onChange={(e) => onChange("addressLine1", e.target.value)}
                    maxLength={120}
                    autoComplete="address-line1"
                />
            </Field>
            <Field label="Address line 2" optional error={errors.addressLine2}>
                <Input
                    id="bill-address-line2"
                    value={value.addressLine2}
                    onChange={(e) => onChange("addressLine2", e.target.value)}
                    maxLength={120}
                    autoComplete="address-line2"
                />
            </Field>
            <div className="grid grid-cols-2 gap-3">
                <Field label="City" error={errors.city}>
                    <Input
                        id="bill-city"
                        value={value.city}
                        onChange={(e) => onChange("city", e.target.value)}
                        maxLength={60}
                        autoComplete="address-level2"
                    />
                </Field>
                <Field label="PIN code" error={errors.postalCode}>
                    <Input
                        id="bill-pin"
                        value={value.postalCode}
                        onChange={(e) => onChange("postalCode", e.target.value)}
                        maxLength={12}
                        inputMode="numeric"
                        autoComplete="postal-code"
                    />
                </Field>
            </div>
        </div>
    );
}
