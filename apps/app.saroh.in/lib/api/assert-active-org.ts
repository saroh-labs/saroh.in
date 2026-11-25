import { cookies } from "next/headers";

import type { ApiFailure } from "@/lib/api/failure";
import { ACTIVE_ORG_COOKIE, getActiveOrgId } from "@/lib/api/http";
import {
    inReadScope,
    isOrganizationList,
    setScopedOrg,
} from "@/lib/api/read-scope";

/** Said when a tab saves into a business that is no longer the open one. */
export const ORG_MOVED =
    "Another business was opened in another tab, so this change wasn’t saved. Open this business again to carry on.";

/**
 * A Server Action's first step on a migrated screen (DEC-259): the business
 * the tab believes is open (`useActionMutation` sends it) must be the one
 * open now, or the action refuses before it writes anything.
 *
 *     const moved = await assertActiveOrg(orgId);
 *     if (moved) return moved;
 */
export async function assertActiveOrg(
    expected: string,
): Promise<ApiFailure | null> {
    const active = await getActiveOrgId();
    return active !== null && active === expected
        ? null
        : { ok: false, error: ORG_MOVED };
}

/**
 * A Server Action's write from a React Query screen (DEC-259): refused
 * when the tab's business isn't the open one, and nothing revalidated (the
 * screen reads its own queries again). When the tab's business is the
 * cookie's, the business list isn't read at all; otherwise once, for the
 * check and the write together.
 *
 *     if (orgId) return writeAsOrg(orgId, () => api.refund(id));
 */
export function writeAsOrg<R>(
    orgId: string,
    write: () => Promise<R>,
): Promise<R | ApiFailure> {
    return inReadScope(async () => {
        // The tab's business is the cookie's: settled for the whole write
        // without the business list, as a read route settles it. The API
        // refuses a non-member or a paused seat on the write itself. Only
        // here, where the scope carries it to the write's every call.
        if ((await cookies()).get(ACTIVE_ORG_COOKIE)?.value === orgId) {
            setScopedOrg(orgId);
            return write();
        }
        return (await assertActiveOrg(orgId)) ?? write();
    }, isOrganizationList);
}

/**
 * A write shared by a React Query screen, which sends its business, and
 * one not on it yet, which doesn't: `writeAsOrg` when `orgId` came, else
 * the write as it was. The refusal (`ORG_MOVED`) is `{ ok: false, error }`,
 * which every write's own failure shape already allows, so callers keep
 * reading its extras (`code`, `suggestion`) as absent.
 */
export function writeAsOrgIfSent<R extends { ok: boolean }>(
    orgId: string | undefined,
    write: () => Promise<R>,
): Promise<R> {
    return orgId ? (writeAsOrg(orgId, write) as Promise<R>) : write();
}
