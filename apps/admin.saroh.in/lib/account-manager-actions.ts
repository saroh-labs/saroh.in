"use server";

import { revalidatePath } from "next/cache";

import type { ControlPlaneResult } from "./control-plane";
import { adminFetch, adminWrite, readError } from "./control-plane";
import type { ManagerCandidate, OverviewManager } from "./overview-words";

/**
 * Who looks after a business (DEC-169, admin console U25): the picker's
 * read, and Assign, Change and End. The API decides who may (`accounts:
 * assign`: Support and Platform owner) and records each write on the
 * ledger; these forward, with the dialog's idempotency key, then refresh
 * the business page.
 */

const manager = (id: string) =>
    `/organizations/${encodeURIComponent(id)}/manager`;

function refresh<T>(organizationId: string, result: ControlPlaneResult<T>) {
    if (result.ok) {
        revalidatePath(`/businesses/${organizationId}`, "layout");
        // The Team screen's loads and its businesses without a manager.
        revalidatePath("/team", "layout");
    }
    return result;
}

/** Who the business can be given to, fewest businesses first. */
export async function managerCandidatesAction(
    organizationId: string,
): Promise<ControlPlaneResult<ManagerCandidate[]>> {
    const res = await adminFetch(`${manager(organizationId)}/candidates`);
    if (!res.ok) {
        return {
            ok: false,
            error: await readError(res, "Could not list the account managers."),
            status: res.status,
        };
    }
    return { ok: true, data: (await res.json()) as ManagerCandidate[] };
}

/** Give the business a manager, or move it to another. */
export async function assignManagerAction(
    organizationId: string,
    input: { platformAdminId: string; reason: string; idempotencyKey: string },
) {
    return refresh(
        organizationId,
        await adminWrite<{
            manager: OverviewManager;
            previous: OverviewManager | null;
        }>(
            manager(organizationId),
            "POST",
            input,
            "Could not give the business a manager.",
        ),
    );
}

/** End the business's link; it then has no manager. */
export async function endManagerAction(
    organizationId: string,
    input: { reason: string; idempotencyKey: string },
) {
    return refresh(
        organizationId,
        await adminWrite<{ ended: OverviewManager }>(
            manager(organizationId),
            "DELETE",
            input,
            "Could not end the account manager's link.",
        ),
    );
}
