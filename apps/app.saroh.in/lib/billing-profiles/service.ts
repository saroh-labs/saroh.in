import { getList } from "@/lib/api/http";
import type { BillingProfileOption } from "@/lib/organizations/setup-billing";
import { addressLine } from "@/lib/organizations/setup-billing";

/**
 * The signed-in person's own billing profiles (DEC-167), from
 * `GET /billing-profiles`: session-scoped, so it needs no business. Read
 * by setup, which asks who Saroh bills for a new business of an owner who
 * has any (R7). Server-only.
 */

/** A profile as the API sends its owner. */
export interface BillingProfile {
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

/**
 * The owner's profiles, oldest first. An API from before them (404) has
 * none; any other failure throws, so setup says it couldn't load rather
 * than skip a question the create would then refuse.
 */
export async function listMyBillingProfiles(): Promise<BillingProfile[]> {
    return getList<BillingProfile>("/billing-profiles");
}

/** The profiles as setup's step lists them. */
export function profileOptions(
    profiles: readonly BillingProfile[],
): BillingProfileOption[] {
    return profiles.map((p) => ({
        id: p.id,
        legalName: p.legalName,
        gstin: p.gstin,
        address: addressLine(p),
        billingEmail: p.billingEmail,
    }));
}
