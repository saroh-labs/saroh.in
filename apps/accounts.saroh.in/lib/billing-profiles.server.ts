import { apiGet } from "./api";
import type {
    BillingProfile,
    OwnedBusiness,
    ProfileDetail,
} from "./billing-profiles";

/**
 * The reads of the account's Billing profiles, on this app's server with
 * the visitor's own session (`lib/api.ts`). The API answers only for the
 * signed-in owner: another person's profile is a 404.
 */

export function listProfiles(): Promise<BillingProfile[]> {
    return apiGet<BillingProfile[]>("/billing-profiles");
}

export function getProfile(id: string, all = false): Promise<ProfileDetail> {
    return apiGet<ProfileDetail>(
        `/billing-profiles/${encodeURIComponent(id)}${all ? "?invoices=all" : ""}`,
    );
}

/** Every business the visitor owns, wherever it is billed. */
export function ownedBusinesses(): Promise<OwnedBusiness[]> {
    return apiGet<OwnedBusiness[]>("/billing-profiles/businesses");
}
