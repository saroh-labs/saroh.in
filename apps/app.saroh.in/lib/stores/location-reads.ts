import { apiFetch } from "@/lib/api/http";
import { listInvitations, listMembers } from "@/lib/members/service";
import type { Organization } from "@/lib/organizations/service";

import type { LocationDetails } from "./location-details";
import type { LocationPeople } from "./people";
import { peopleAccess } from "./people";

/**
 * The two reads a location's page makes beside its settings: its
 * description and logo (a row in The place) and its people (the People
 * tab). Server-only.
 *
 * Both are tolerant on purpose, as `readSiteSelling` is: they come from the
 * location's older owner-and-member routes, and its settings must not
 * become an error page, or a 403 page, because one of them couldn't be
 * read. Each says so in its own place instead.
 */

/**
 * `undefined` when they couldn't be read (a failure, or someone the old
 * route doesn't show the location to): The place then leaves the row out
 * rather than say "No description yet". Never `getJson`, whose 403 throws
 * `forbidden()`.
 */
export async function readLocationDetails(
    storeId: string,
): Promise<LocationDetails | undefined> {
    try {
        const res = await apiFetch(`/stores/${encodeURIComponent(storeId)}`);
        if (!res.ok) return undefined;
        const store = (await res.json()) as Partial<LocationDetails>;
        return {
            description: store.description ?? null,
            logo: store.logo ?? null,
        };
    } catch {
        return undefined;
    }
}

/**
 * `null` when the roster couldn't be read, which the People tab shows as
 * its own failed state. An empty roster is someone the API doesn't show it
 * to (`listMembers` answers a 403 with none).
 */
export async function readLocationPeople(
    storeId: string,
    userId: string,
    organization: Pick<Organization, "actions" | "role"> | null,
): Promise<LocationPeople | null> {
    try {
        const [members, invitations] = await Promise.all([
            listMembers(storeId),
            listInvitations(storeId),
        ]);
        return {
            members,
            invitations,
            ...peopleAccess(members, userId, organization),
        };
    } catch {
        return null;
    }
}
