import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { gstinProblem, stateCode } from "../invoices/gst-states";
import { normalisePublicPhone } from "../organizations/business-phone";

/**
 * Who Saroh bills, before it charges or sets up autopay (owner, 17 Oct
 * 2026: "these details should be added, and must be filled before we
 * setup autopay or charge them payment"), now the business's billing
 * profile (DEC-167, owner 18 Oct 2026): Settings › Business stays the
 * business's own seller identity, and Saroh's bill-to comes only from the
 * profile.
 *
 * A checkout that charges or sets up a mandate (every kind but a move to
 * Free) is refused with a 400 naming the field (`details.field`, as the
 * address's own refusal does):
 *
 * - **no profile** (`billing-profile`): the business must be given one
 *   first — one of its owner's, or a new one — as when a business is
 *   created; nothing else is asked until it has one;
 * - **a billing name**: the profile's legal name, else the business's name;
 * - **an email**: the profile's billing email;
 * - **a complete billing address**: first line, city and a six-digit PIN;
 * - **a state**: the profile's (or a GSTIN's).
 *
 * A GSTIN stays optional, and a phone is used "if available". Details
 * given at checkout are saved to the profile (never to `BusinessProfile`):
 * the name, email, address, state and phone only where it has none; a
 * GSTIN given there replaces the profile's, with its state. Only the
 * profile's owner may change it this way, and one billing several
 * businesses only once they confirm (`assertMayChangeProfile` in
 * `checkout.service.ts`, owner 18 Oct 2026). The profile's
 * customer at the provider is brought up to date by the
 * `billing.profile.sync` job the save queues (`billing-customer.ts`).
 */

export type BillingDetail = "profile" | "name" | "email" | "address" | "state";

/** The billing profile columns the check and the bill read. */
export const BILLING_PROFILE_SELECT = {
    id: true,
    legalName: true,
    billingEmail: true,
    phone: true,
    gstin: true,
    gstState: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    postalCode: true,
    providerCustomerId: true,
} as const;

/** The billing profile a business is billed to, as the bill reads it. */
export type BilledProfile = Prisma.BillingProfileGetPayload<{
    select: typeof BILLING_PROFILE_SELECT;
}>;

/** Everything Saroh knows of who it bills, before a checkout adds to it. */
export interface BillingParty {
    /** The business's billing profile; null: it has none yet. */
    profile: BilledProfile | null;
    orgName: string | null;
    /** The business's Saroh address, for the provider's notes. */
    orgSlug: string | null;
}

type Db = Pick<Prisma.TransactionClient, "billingProfile" | "organization">;

/**
 * Who the business is billed to: its billing profile now, or (`profileId`)
 * a given one — a checkout's own, when it was made on another.
 */
export async function readBillingParty(
    db: Db,
    organizationId: string,
    profileId?: string | null,
): Promise<BillingParty> {
    const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, slug: true, billingProfileId: true },
    });
    const id = profileId ?? org?.billingProfileId ?? null;
    const profile = id
        ? await db.billingProfile.findUnique({
              where: { id },
              select: BILLING_PROFILE_SELECT,
          })
        : null;
    return {
        profile,
        orgName: nonEmpty(org?.name),
        orgSlug: nonEmpty(org?.slug),
    };
}

/** A typed value, trimmed; blank is none. */
export function nonEmpty(value: string | null | undefined): string | null {
    const t = value?.trim();
    return t === undefined || t === "" ? null : t;
}

/** An Indian PIN code: six digits, never starting with 0. */
export const PIN = /^[1-9][0-9]{5}$/;

/** The name on the bill: the profile's legal name, else the business's. */
export function billingName(p: BillingParty): string | null {
    return nonEmpty(p.profile?.legalName) ?? p.orgName;
}

/** The billing email: the profile's. */
export function billingEmail(p: BillingParty): string | null {
    return nonEmpty(p.profile?.billingEmail);
}

/** First line, city and a six-digit PIN. */
export function addressComplete(
    profile: Pick<BilledProfile, "addressLine1" | "city" | "postalCode"> | null,
): boolean {
    const pin = profile?.postalCode?.replace(/\s+/g, "") ?? "";
    return (
        Boolean(nonEmpty(profile?.addressLine1)) &&
        Boolean(nonEmpty(profile?.city)) &&
        PIN.test(pin)
    );
}

/**
 * What is missing before Saroh may charge, in the order the form asks. A
 * business with no profile is missing only that: the rest is the
 * profile's to have.
 */
export function missingBillingDetails(p: BillingParty): BillingDetail[] {
    if (!p.profile) return ["profile"];
    const missing: BillingDetail[] = [];
    if (!billingName(p)) missing.push("name");
    if (!billingEmail(p)) missing.push("email");
    if (!addressComplete(p.profile)) missing.push("address");
    if (!stateCode(p.profile.gstState)) missing.push("state");
    return missing;
}

/** What a checkout sent of the registered address (`RegisteredAddressDto`). */
export interface AddressSent {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    postalCode?: string | null;
}

/** The billing address a checkout saves to the business's billing profile. */
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

/** The state and GSTIN a checkout was given, checked (`checkoutBillTo`). */
export interface BillToGiven {
    state: string | null;
    gstin: string | null;
}

/** What a checkout saves to the business's billing profile. */
export interface CheckoutDetails {
    /** Only what it was missing, and a GSTIN given; empty: nothing. */
    profile: Partial<CheckoutAddress> & {
        legalName?: string;
        billingEmail?: string;
        phone?: string;
        gstState?: string;
        gstin?: string;
    };
}

/** The refusal's words for a business with no billing profile. */
export const CHOOSE_BILLING_PROFILE =
    "Choose who Saroh bills for this business first.";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The details a paid checkout needs, from the business's billing profile
 * and what the checkout sent; refused, by field, before anything is made
 * at the provider. `given` is the bill-to state and GSTIN from the
 * checkout (`checkoutBillTo`: a GSTIN alone gives its state).
 */
export function checkoutDetails(
    party: BillingParty,
    sent: BillingDetailsSent,
    given: BillToGiven,
): CheckoutDetails {
    const missing = missingBillingDetails(party);
    const profile = party.profile;
    if (!profile) {
        refuse(CHOOSE_BILLING_PROFILE, "billing-profile", missing);
    }
    const out: CheckoutDetails = { profile: {} };

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
        out.profile.billingEmail = email;
    }

    if (missing.includes("address")) {
        const address = checkoutAddress(sent.registeredAddress, true, missing);
        if (address) Object.assign(out.profile, address);
    }

    // A GSTIN given is the one to bill: it replaces the profile's, and
    // names its state.
    if (given.gstin) {
        if (given.gstin !== profile.gstin) out.profile.gstin = given.gstin;
        const state = stateCode(given.state) ?? given.gstin.slice(0, 2);
        if (state !== profile.gstState) out.profile.gstState = state;
    } else if (missing.includes("state")) {
        const state = stateCode(given.state);
        if (!state) {
            refuse(
                "Choose the state your business is registered in.",
                "billingState",
                missing,
            );
        }
        if (profile.gstin) {
            const problem = gstinProblem(profile.gstin, state);
            if (problem) refuse(problem, "billingState", missing);
        }
        out.profile.gstState = state;
    } else if (given.state) {
        // A state given over the profile's own: kept, unless it disagrees
        // with the GSTIN the profile bills to.
        const state = stateCode(given.state);
        if (state && state !== profile.gstState) {
            if (profile.gstin) {
                const problem = gstinProblem(profile.gstin, state);
                if (problem) refuse(problem, "billingState");
            }
            out.profile.gstState = state;
        }
    }

    // "If available": asked when the profile has none, never required.
    const typedPhone = nonEmpty(sent.phone);
    if (typedPhone && !nonEmpty(profile.phone)) {
        const result = normalisePublicPhone(typedPhone);
        if ("problem" in result) refuse(result.problem, "phone");
        if (result.phone) out.profile.phone = result.phone;
    }
    return out;
}
