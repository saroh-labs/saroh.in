import type {
    BillingField,
    BillingProfileOption,
    BillingValues,
} from "@/lib/organizations/setup-billing";
import { addressLine, NO_BILLING } from "@/lib/organizations/setup-billing";
import type { CheckoutHandoff } from "@/lib/saroh-billing/plan-view";

/**
 * Who Saroh bills for this business, as its Plan & billing shows it
 * (DEC-167, U5): the profile on the business, the owner's own to pick
 * from, and the words of the "Billed to" row and its sheets. Pure and
 * client-safe; the reads are `lib/saroh-billing/service.ts`, the writes
 * `lib/saroh-billing/billing-actions.ts`. The fields and their rules are
 * setup's (`setup-billing.ts`), so a profile is typed the same way
 * wherever it is made.
 */

/** A profile as the API sends its owner (`GET …/billing/profile`). */
export interface OwnBillingProfile {
    id: string;
    legalName: string;
    gstin: string | null;
    gstState: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
    billingEmail: string;
    phone: string | null;
    /** Businesses billed to it. */
    businesses: number;
}

/** The profile on the business: in full only when it is the reader's. */
export type CurrentBillingProfile =
    (OwnBillingProfile & { mine: true }) | { legalName: string; mine: false };

export interface BusinessBillingProfile {
    /** Null: the business has none yet. */
    current: CurrentBillingProfile | null;
    mine: OwnBillingProfile[];
    businessesOnCurrent: number | null;
    /** A move to another profile at the renewal (U6); absent or null: none. */
    pendingSwitch?: PendingSwitch | null;
}

/**
 * A paid plan moving to another profile at its renewal (DEC-167, U6): that
 * profile's legal name, the date, and whether its payment is authorised.
 */
export interface PendingSwitch {
    legalName: string;
    at: string | null;
    authorised: boolean;
}

/** The payment a switch at the renewal waits on, given once. */
export interface SwitchAuthorise {
    at: string;
    legalName: string;
    authorisationUrl: string | null;
    handoff: CheckoutHandoff | null;
}

/**
 * What choosing a profile did (`POST …/billing/profile/choose`, and a new
 * one used): `applied` from now, `scheduled` from the renewal once
 * authorised, `kept` a waiting switch given up, `none` nothing to do.
 */
export interface BillingProfileChosen extends BusinessBillingProfile {
    outcome: "applied" | "scheduled" | "kept" | "none";
    authorise: SwitchAuthorise | null;
}

/** The Change sheet's word once a paid plan's switch is made. */
export function switchStartedSays(legalName: string, on: string): string {
    return `From ${on}, Saroh bills ${legalName}. Authorise the payment to finish.`;
}

/** The row's label, and what a business with none reads. */
export const BILLED_TO = "Billed to";
export const CHOOSE_WHO = "Choose who Saroh bills";

/** The lines under a profile's legal name on the row. */
export function billedToLines(p: OwnBillingProfile): string[] {
    return [
        p.gstin ? `GSTIN ${p.gstin}` : "No GSTIN",
        // A state alone is no address to print.
        (p.addressLine1?.trim() || p.city?.trim() ? addressLine(p) : null) ??
            "No billing address yet",
        p.billingEmail,
    ];
}

/**
 * The edit sheet's one sentence: how many businesses the edit changes,
 * said before Save (R9, AE3). The button says it again.
 */
export function editSays(businesses: number): {
    description: string;
    saveLabel: string;
} {
    if (businesses > 1) {
        return {
            description: `This changes Saroh's invoices for ${businesses} businesses.`,
            saveLabel: `Save for ${businesses} businesses`,
        };
    }
    return {
        description:
            "Saroh's next invoice uses these details. Invoices already issued keep theirs.",
        saveLabel: "Save",
    };
}

/** A profile's details as the sheet's fields hold them. */
export function profileValues(
    p: OwnBillingProfile,
): Record<BillingField, string> {
    return {
        ...NO_BILLING,
        billingChoice: p.id,
        billLegalName: p.legalName,
        billEmail: p.billingEmail,
        billGstin: p.gstin ?? "",
        billAddress: p.addressLine1 ?? "",
        billCity: p.city ?? "",
        billPin: p.postalCode ?? "",
        billState: p.gstState ?? "",
    };
}

/** What an edit of the profile sends to the API, by its field names. */
export interface ProfileEdit {
    legalName?: string;
    billingEmail?: string;
    gstin?: string;
    gstState?: string;
    addressLine1?: string;
    city?: string;
    postalCode?: string;
}

const EDITED: [BillingField, keyof ProfileEdit][] = [
    ["billLegalName", "legalName"],
    ["billEmail", "billingEmail"],
    ["billGstin", "gstin"],
    ["billState", "gstState"],
    ["billAddress", "addressLine1"],
    ["billCity", "city"],
    ["billPin", "postalCode"],
];

/**
 * Only what changed, trimmed; an emptied optional field is sent as "",
 * which clears it. Nothing changed: an empty object.
 */
export function profileEdit(
    values: BillingValues,
    was: OwnBillingProfile,
): ProfileEdit {
    const before = profileValues(was);
    const out: ProfileEdit = {};
    for (const [field, key] of EDITED) {
        let now = (values[field] ?? "").trim();
        if (field === "billGstin") now = now.toUpperCase();
        if (field === "billPin") now = now.replace(/\s+/g, "");
        if (now !== before[field].trim()) out[key] = now;
    }
    return out;
}

/** The profiles as setup's step and the Change sheet list them. */
export function profileOptions(
    profiles: readonly Pick<
        OwnBillingProfile,
        | "id"
        | "legalName"
        | "gstin"
        | "addressLine1"
        | "addressLine2"
        | "city"
        | "postalCode"
        | "gstState"
        | "billingEmail"
    >[],
): BillingProfileOption[] {
    return profiles.map((p) => ({
        id: p.id,
        legalName: p.legalName,
        gstin: p.gstin,
        address: addressLine(p),
        billingEmail: p.billingEmail,
    }));
}
