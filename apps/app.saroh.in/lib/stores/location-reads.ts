import { apiFetch } from "@/lib/api/http";
import { listInvitations, listMembers } from "@/lib/members/service";

import type { LocationAbilities, OrderPlace } from "./abilities";
import { abilitiesOf, orderPlaces } from "./abilities";
import type { LocationDetails, StoreLogos } from "./location-details";
import { detailsOf } from "./location-details";
import type { LocationRoster } from "./queries";

/**
 * The two reads a location's page makes beside its settings: its
 * description and logo (a row in The place; the one read brings the
 * business logo it uses when it has none of its own) and its people (the
 * People tab). Server-only.
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
        return detailsOf((await res.json()) as StoreLogos);
    } catch {
        return undefined;
    }
}

/**
 * What this person may do at a location, from the same read. `null` when
 * it couldn't be read or the API said nothing: then nothing more is
 * offered than the business role gives.
 */
export async function readLocationAbilities(
    storeId: string,
): Promise<LocationAbilities | null> {
    try {
        const res = await apiFetch(`/stores/${encodeURIComponent(storeId)}`);
        if (!res.ok) return null;
        const body = (await res.json()) as { abilities?: unknown };
        return abilitiesOf(body.abilities);
    } catch {
        return null;
    }
}

/**
 * The locations among these where this person may take a new order, each
 * asked of its own read. For someone whose business role takes none.
 */
export async function readOrderPlaces(
    storeIds: readonly string[],
): Promise<OrderPlace[]> {
    const reads = await Promise.all(
        storeIds.map(async (id) => ({
            id,
            abilities: await readLocationAbilities(id),
        })),
    );
    return orderPlaces(reads);
}

/**
 * Who works at a location and the invitations still out; `null` when it
 * couldn't be read, which the People tab shows as its own failed state.
 * An empty roster is someone the API doesn't show it to (`listMembers`
 * answers a 403 with none). What the reader may do with it is the
 * screen's (`peopleAccess`), from the page's own gates.
 */
export async function readLocationRoster(
    storeId: string,
): Promise<LocationRoster | null> {
    try {
        const [members, invitations] = await Promise.all([
            listMembers(storeId),
            listInvitations(storeId),
        ]);
        return { members, invitations };
    } catch {
        return null;
    }
}
