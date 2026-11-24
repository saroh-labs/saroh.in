import type { ApiFailure } from "@/lib/api/failure";
import { getActiveOrgId } from "@/lib/api/http";
import { inReadScope, isOrganizationList } from "@/lib/api/read-scope";

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
 * screen reads its own queries again). The business list is read once for
 * the check and the write together.
 *
 *     if (orgId) return writeAsOrg(orgId, () => api.refund(id));
 */
export function writeAsOrg<R>(
    orgId: string,
    write: () => Promise<R>,
): Promise<R | ApiFailure> {
    return inReadScope(
        async () => (await assertActiveOrg(orgId)) ?? write(),
        isOrganizationList,
    );
}
