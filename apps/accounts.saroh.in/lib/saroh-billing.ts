import { editionProfile } from "@saroh/edition";
import { notFound } from "next/navigation";

import { env } from "@/env";

import type { BillingProfile } from "./billing-profiles";
import type { Business } from "./businesses";

/**
 * Whether this edition's owners pay Saroh through Billing profiles (the
 * edition's `sarohBilling` fact, DEC-204 item 7). Off on Global, whose
 * profiles would be India's (GSTIN, state, PIN): the menu leaves it out and
 * every Billing profiles page is the not-found page. The one check; a later
 * edition that bills turns it on in its profile.
 */
export const SAROH_BILLING = editionProfile(
    env.NEXT_PUBLIC_EDITION,
).sarohBilling;

/**
 * Billing profiles is in the menu for someone who owns a business or a
 * profile; when either read failed (null) it stays in, so an outage never
 * hides the way to it.
 */
export function billingInMenu(
    businesses: Pick<Business, "role">[] | null,
    profiles: BillingProfile[] | null,
): boolean {
    if (!SAROH_BILLING) return false;
    return (
        businesses === null ||
        profiles === null ||
        businesses.some((b) => b.role === "OWNER") ||
        profiles.length > 0
    );
}

/** A Billing profiles page on an edition Saroh doesn't bill: not found. */
export function billingProfilesOrNotFound(): void {
    if (!SAROH_BILLING) notFound();
}
