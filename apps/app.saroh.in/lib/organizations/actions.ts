"use server";

import { cookies } from "next/headers";

import type { CreateOrganizationInput, OrganizationResult } from "./service";
import {
    ACTIVE_ORG_COOKIE,
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
