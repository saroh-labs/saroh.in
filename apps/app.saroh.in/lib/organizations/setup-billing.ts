import { GST_STATES } from "@/lib/invoices/gst";
import { gstinProblem } from "@/lib/invoices/gstin";

/**
 * "Who does Saroh bill for this business?" (DEC-167, R7): the setup step
 * an owner who has a billing profile already answers before a business
 * exists, since a charged invoice's GST details can't be changed. One of
 * their profiles, or a new one typed here. Nothing is chosen for them.
 *
 * The rules here are the API's (`billing-profiles.service.ts`), said
 * sooner, and the API's refusal names the same fields. Pure and
 * client-safe.
 */

/** One of the owner's profiles, as the step lists it. */
export interface BillingProfileOption {
    id: string;
    legalName: string;
    gstin: string | null;
    /** The billing address on one line, or null when it has none. */
    address: string | null;
    billingEmail: string;
}

/** What the step is asked with: the owner's profiles. */
export interface SetupBilling {
    profiles: readonly BillingProfileOption[];
}

/** The choice that means a new profile, typed on the step. */
export const NEW_PROFILE = "new";

/** The step's answers, in the order it draws them. */
export const BILLING_FIELDS = [
    "billingChoice",
    "billLegalName",
    "billEmail",
    "billGstin",
    "billAddress",
    "billCity",
    "billPin",
    "billState",
] as const;
export type BillingField = (typeof BILLING_FIELDS)[number];

export type BillingValues = Partial<Record<BillingField, string>>;

/** The step's answers before it is answered: nothing chosen. */
export const NO_BILLING: Record<BillingField, string> = {
    billingChoice: "",
    billLegalName: "",
    billEmail: "",
    billGstin: "",
    billAddress: "",
    billCity: "",
    billPin: "",
    billState: "",
};

/** The API's message for a refused choice, said before it is sent. */
export const CHOOSE_BILLING = "Choose who Saroh bills for this business.";
/** The API's message for a billing email the owner uses (R3). */
export const BILLING_EMAIL_TAKEN =
    "You already have a billing profile with this email. Use a different billing email for this one.";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN = /^\d{6}$/;

/** A state's name from its GST code. */
function stateName(code: string | null | undefined): string | null {
    if (!code) return null;
    return GST_STATES.find((s) => s.value === code)?.label ?? null;
}

/** A profile's billing address on one line: "3 Hill Road, Bengaluru 560038, Karnataka". */
export function addressLine(profile: {
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    postalCode?: string | null;
    gstState?: string | null;
}): string | null {
    const town = [profile.city, profile.postalCode]
        .map((p) => p?.trim())
        .filter(Boolean)
        .join(" ");
    const parts = [
        profile.addressLine1,
        profile.addressLine2,
        town,
        stateName(profile.gstState),
    ]
        .map((p) => p?.trim())
        .filter((p): p is string => Boolean(p));
    return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * What is wrong with the step's answers, field by field, in its order:
 * nothing chosen, and for a new profile what the API would refuse. An
 * email one of the owner's profiles uses is refused here, before the
 * business is created (AE7).
 */
export function billingProblems(
    values: BillingValues,
    billing: SetupBilling,
): [BillingField, string][] {
    const choice = values.billingChoice ?? "";
    const known =
        choice === NEW_PROFILE || billing.profiles.some((p) => p.id === choice);
    if (!known) return [["billingChoice", CHOOSE_BILLING]];
    if (choice !== NEW_PROFILE) return [];

    const out: [BillingField, string][] = [];
    const name = (values.billLegalName ?? "").trim();
    if (!name) {
        out.push([
            "billLegalName",
            "Add the legal name Saroh's invoices go to.",
        ]);
    } else if (name.length > 200) {
        out.push([
            "billLegalName",
            "Keep the legal name under 200 characters.",
        ]);
    }
    const email = (values.billEmail ?? "").trim().toLowerCase();
    if (!email) {
        out.push([
            "billEmail",
            "Add an email for Saroh's invoices and payment receipts.",
        ]);
    } else if (email.length > 254 || !EMAIL.test(email)) {
        out.push(["billEmail", "That email doesn't look right."]);
    } else if (
        billing.profiles.some((p) => p.billingEmail.toLowerCase() === email)
    ) {
        out.push(["billEmail", BILLING_EMAIL_TAKEN]);
    }
    const gstin = (values.billGstin ?? "").trim();
    const gstinWrong = gstin ? gstinProblem(gstin) : null;
    if (gstinWrong) out.push(["billGstin", gstinWrong]);
    if ((values.billAddress ?? "").trim().length > 120) {
        out.push(["billAddress", "Keep this under 120 characters."]);
    }
    if ((values.billCity ?? "").trim().length > 60) {
        out.push(["billCity", "Keep this under 60 characters."]);
    }
    const pin = (values.billPin ?? "").replace(/\s+/g, "");
    if (pin && !PIN.test(pin)) {
        out.push(["billPin", "A PIN code is six digits, like 560038."]);
    }
    return out;
}

/** What the API takes for a new profile: what was typed, and nothing empty. */
export interface NewBillingProfileInput {
    legalName: string;
    billingEmail: string;
    gstin?: string;
    gstState?: string;
    addressLine1?: string;
    city?: string;
    postalCode?: string;
}

/** What the create sends of the step's answers. */
export function billingSent(
    values: BillingValues,
):
    | { billingProfileId: string }
    | { newBillingProfile: NewBillingProfileInput } {
    const choice = values.billingChoice ?? "";
    if (choice !== NEW_PROFILE) return { billingProfileId: choice };
    const typed = (v: string | undefined) => {
        const t = (v ?? "").trim();
        return t === "" ? undefined : t;
    };
    const optional = {
        gstin: typed(values.billGstin)?.toUpperCase(),
        gstState: typed(values.billState),
        addressLine1: typed(values.billAddress),
        city: typed(values.billCity),
        postalCode: typed(values.billPin)?.replace(/\s+/g, ""),
    };
    return {
        newBillingProfile: {
            legalName: (values.billLegalName ?? "").trim(),
            billingEmail: (values.billEmail ?? "").trim(),
            ...Object.fromEntries(
                Object.entries(optional).filter(([, v]) => v !== undefined),
            ),
        },
    };
}

const FROM_API: Record<string, BillingField> = {
    billingProfile: "billingChoice",
    legalName: "billLegalName",
    billingEmail: "billEmail",
    gstin: "billGstin",
    gstState: "billState",
    addressLine1: "billAddress",
    addressLine2: "billAddress",
    city: "billCity",
    postalCode: "billPin",
};

/** The step's field an API refusal of the choice names, or null. */
export function billingFieldOf(field: string | undefined): BillingField | null {
    return field ? (FROM_API[field] ?? null) : null;
}
