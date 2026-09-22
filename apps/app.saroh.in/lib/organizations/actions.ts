"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/env";
import { ACTIVE_ORG_COOKIE } from "@/lib/api/http";

import type {
    AddressAvailability,
    CreateOrganizationInput,
    OrganizationResult,
} from "./service";
import {
    checkOrganizationAddress,
    createOrganization as createOrganizationApi,
    listOrganizations,
} from "./service";

/**
 * Server Actions for organization onboarding + switching. Ownership and
 * membership are always resolved from the session by api.saroh.in; these
 * wrappers additionally guard the active-org cookie so the app never sends an
 * `x-organization-id` for an org the user doesn't belong to (which the API
 * would 403). The cookie is httpOnly — it's read only by server components.
 */

const ONE_YEAR = 60 * 60 * 24 * 365;

async function writeActiveOrgCookie(organizationId: string): Promise<void> {
    (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, {
        httpOnly: true,
        sameSite: "lax",
        // Off in development so the cookie still works over plain-HTTP
        // localhost; in production this rides the same TLS-only guarantee the
        // session cookie already has.
        secure: env.NODE_ENV === "production",
        path: "/",
        maxAge: ONE_YEAR,
    });
}

/**
 * Persist the selected organization as active. Guarded: only sets the cookie
 * when the caller is actually a member (verified against GET /organizations),
 * so a tampered/stale selection can't point the app at a foreign org.
 */
export async function setActiveOrganization(
    organizationId: string,
): Promise<OrganizationResult<{ id: string }>> {
    const organizations = await listOrganizations();
    if (!organizations.some((o) => o.id === organizationId)) {
        return {
            ok: false,
            error: "You are not a member of that organization.",
        };
    }
    await writeActiveOrgCookie(organizationId);
    return { ok: true, data: { id: organizationId } };
}

/**
 * The chooser's action: make one the active business and go there.
 *
 * A form action rather than an `onClick`, so choosing a business works before
 * the page's JavaScript has arrived — this is the first screen of a session
 * and there is nothing behind it to fall back to. The guard is
 * `setActiveOrganization`'s, unchanged: a posted id the caller is not a member
 * of is refused, not trusted.
 */
export async function chooseOrganization(formData: FormData): Promise<void> {
    const organizationId = formData.get("organizationId");
    if (typeof organizationId !== "string") redirect("/choose");

    const result = await setActiveOrganization(organizationId);
    // Sending them back to the chooser is the honest outcome: the list is
    // re-read there, so a membership that ended while they looked at it simply
    // is not on the page the second time.
    redirect(result.ok ? "/" : "/choose");
}

/** Setup's live address check. Read-only; the create re-checks. */
export async function checkAddress(
    address: string,
): Promise<AddressAvailability | null> {
    return checkOrganizationAddress(address);
}

/**
 * Onboarding: create an organization and immediately make it the active one so
 * the dashboard renders under the new tenant on the next navigation/refresh.
 */
export async function createOrganization(
    input: CreateOrganizationInput,
): Promise<OrganizationResult<{ id: string; slug: string }>> {
    const res = await createOrganizationApi(input);
    if (res.ok) {
        await writeActiveOrgCookie(res.data.id);
    }
    return res;
}
