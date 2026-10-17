import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { stateCode } from "../invoices/gst-states";
import { normalisePublicPhone } from "../organizations/business-phone";

/**
 * Who Saroh bills, before it charges or sets up autopay (owner, 17 Oct
 * 2026): "these details should be added, and must be filled before we
 * setup autopay or charge them payment".
 *
 * A checkout that charges or sets up a mandate (every kind but a move to
 * Free) is refused with a 400 naming the field (`details.field`, as the
 * address's own refusal does) until the business has:
 *
 * - **a billing name**: its legal name, else its business name;
 * - **an email**: the owner's (the person checking out), else the
 *   profile's contact email, else one given at checkout;
 * - **a complete registered address**: first line, city and a six-digit
 *   PIN;
 * - **a state**: the profile's, else the one given at checkout (or a
 *   GSTIN's).
 *
 * A GSTIN stays optional, and a phone is used "if available". Details
 * given at checkout fill only what is missing: the address, the state and
 * the legal name are saved to the business's profile (never over one it
 * has); an email or phone is kept on the checkout instead
 * (`BillingCheckout.billToEmail`, `billToPhone`), since the profile's
 * phone is the one its website shows. The business's Razorpay customer
 * is brought up to date by the `billing.customer.sync` job the checkout
 * queues (`billing-customer.ts`, DEC-165).
 */

export type BillingDetail = "name" | "email" | "address" | "state";

/** The profile columns the check reads. */
export const BILLING_PROFILE_SELECT = {
    legalName: true,
    contactEmail: true,
    phone: true,
    taxId: true,
    gstRegistered: true,
    gstState: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    postalCode: true,
} as const;

export type BillingProfile = Prisma.BusinessProfileGetPayload<{
    select: typeof BILLING_PROFILE_SELECT;
}>;

/** Everything Saroh knows of who it bills, before a checkout adds to it. */
export interface BillingParty {
    profile: BillingProfile | null;
    orgName: string | null;
    userEmail: string | null;
    userName: string | null;
}

type Db = Pick<
    Prisma.TransactionClient,
    "businessProfile" | "organization" | "user"
>;

export async function readBillingParty(
    db: Db,
    organizationId: string,
    userId: string | null,
): Promise<BillingParty> {
    const [profile, org, user] = await Promise.all([
        db.businessProfile.findUnique({
            where: { organizationId },
            select: BILLING_PROFILE_SELECT,
        }),
        db.organization.findUnique({
            where: { id: organizationId },
            select: { name: true },
        }),
        userId
            ? db.user.findUnique({
                  where: { id: userId },
                  select: { email: true, name: true },
              })
            : null,
    ]);
    return {
        profile,
        orgName: nonEmpty(org?.name),
        userEmail: nonEmpty(user?.email),
        userName: nonEmpty(user?.name),
    };
}

/** A typed value, trimmed; blank is none. */
export function nonEmpty(value: string | null | undefined): string | null {
    const t = value?.trim();
    return t === undefined || t === "" ? null : t;
}

/** An Indian PIN code: six digits, never starting with 0. */
export const PIN = /^[1-9][0-9]{5}$/;

/** The name on the bill: the legal name, else the business's. */
export function billingName(p: BillingParty): string | null {
    return nonEmpty(p.profile?.legalName) ?? p.orgName;
}

/** The billing email: the owner's, else the profile's contact email. */
export function billingEmail(p: BillingParty): string | null {
    return p.userEmail ?? nonEmpty(p.profile?.contactEmail);
}

/** First line, city and a six-digit PIN. */
export function addressComplete(profile: BillingProfile | null): boolean {
    const pin = profile?.postalCode?.replace(/\s+/g, "") ?? "";
    return (
        Boolean(nonEmpty(profile?.addressLine1)) &&
        Boolean(nonEmpty(profile?.city)) &&
        PIN.test(pin)
    );
}

/** What is missing before Saroh may charge, in the order the form asks. */
export function missingBillingDetails(p: BillingParty): BillingDetail[] {
    const missing: BillingDetail[] = [];
    if (!billingName(p)) missing.push("name");
    if (!billingEmail(p)) missing.push("email");
    if (!addressComplete(p.profile)) missing.push("address");
    if (!stateCode(p.profile?.gstState)) missing.push("state");
    return missing;
}

/** What a checkout sent of the registered address (`RegisteredAddressDto`). */
export interface AddressSent {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    postalCode?: string | null;
}

/** The registered address a checkout saves to the business's profile. */
export interface CheckoutAddress {
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    postalCode: string;
}

function refuse(
    message: string,
    field: string,
    missing: BillingDetail[] = [],
): never {
    throw new BadRequestException({
        message,
        details: { field, ...(missing.length ? { missing } : {}) },
    });
}

/**
 * The registered address given at checkout, checked before the provider is
 * asked: required when the business has none whole (Saroh's invoice
 * prints it; a registered buyer's carries it, CGST Rule 46(e)); any part
 * given needs the first line, the city and a six-digit PIN, as Settings ›
 * Business asks.
 */
export function checkoutAddress(
    sent: AddressSent | null | undefined,
    required: boolean,
    missing: BillingDetail[] = [],
): CheckoutAddress | null {
    const line1 = nonEmpty(sent?.line1);
    const line2 = nonEmpty(sent?.line2);
    const city = nonEmpty(sent?.city);
    const pin = nonEmpty(sent?.postalCode)?.replace(/\s+/g, "") ?? null;
    if (!line1 && !line2 && !city && !pin) {
        if (required) {
            refuse(
                "Add the business's registered address: it prints on Saroh's invoice.",
                "addressLine1",
                missing,
            );
        }
        return null;
    }
    if (!line1)
        refuse("Add the address's first line.", "addressLine1", missing);
    if (!city) refuse("Add the city.", "city", missing);
    if (!pin) refuse("Add the PIN code.", "postalCode", missing);
    if (!PIN.test(pin)) {
        refuse("A PIN code is six digits, like 560038.", "postalCode", missing);
    }
    return { addressLine1: line1, addressLine2: line2, city, postalCode: pin };
}

/** What a checkout may send to fill in who is billed. */
export interface BillingDetailsSent {
    billingName?: string | null;
    billingEmail?: string | null;
    phone?: string | null;
    registeredAddress?: AddressSent | null;
}

/** What a checkout keeps of the details it was given. */
export interface CheckoutDetails {
    /** Saved to the business's profile: only what it was missing. */
    profile: Partial<CheckoutAddress> & {
        legalName?: string;
        gstState?: string;
    };
    /** Kept on the checkout: given because the business had none. */
    billToEmail: string | null;
    billToPhone: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The details a paid checkout needs, from what the business has and what
 * the checkout sent; refused, by field, before anything is made at the
 * provider. `stateGiven` is the bill-to state from the checkout (its
 * state, or its GSTIN's).
 */
export function checkoutDetails(
    party: BillingParty,
    sent: BillingDetailsSent,
    stateGiven: string | null,
): CheckoutDetails {
    const missing = missingBillingDetails(party);
    const out: CheckoutDetails = {
        profile: {},
        billToEmail: null,
        billToPhone: null,
    };

    if (missing.includes("name")) {
        const name = nonEmpty(sent.billingName);
        if (!name) {
            refuse(
                "Add the business's name as it should read on Saroh's invoice.",
                "billingName",
                missing,
            );
        }
        out.profile.legalName = name.slice(0, 200);
    }

    if (missing.includes("email")) {
        const email = nonEmpty(sent.billingEmail)?.toLowerCase() ?? null;
        if (!email) {
            refuse(
                "Add an email for Saroh's invoices and payment receipts.",
                "billingEmail",
                missing,
            );
        }
        if (email.length > 254 || !EMAIL.test(email)) {
            refuse("That email doesn't look right.", "billingEmail", missing);
        }
        out.billToEmail = email;
    }

    if (missing.includes("address")) {
        const address = checkoutAddress(sent.registeredAddress, true, missing);
        if (address) Object.assign(out.profile, address);
    }

    if (missing.includes("state")) {
        const state = stateCode(stateGiven);
        if (!state) {
            refuse(
                "Choose the state your business is registered in.",
                "billingState",
                missing,
            );
        }
        out.profile.gstState = state;
    }

    // "If available": asked when the profile has none, never required.
    const typedPhone = nonEmpty(sent.phone);
    if (typedPhone && !nonEmpty(party.profile?.phone)) {
        const result = normalisePublicPhone(typedPhone);
        if ("problem" in result) refuse(result.problem, "phone");
        out.billToPhone = result.phone;
    }
    return out;
}
