"use server";

import { revalidatePath } from "next/cache";

import type { PayoutView, RateKind, RatesView } from "./commission-words";
import type { ControlPlaneResult } from "./control-plane";
import { adminFetch, adminWrite, readError } from "./control-plane";

/**
 * Commission's writes and the export (DEC-169, admin console U21). The API
 * decides who may (`team:pay` to mark paid and export, `commission:rates`
 * to set a rate), refuses someone marking their own commission paid, and
 * records each on the ledger; these forward, with the dialog's idempotency
 * key, then refresh the Team pages.
 */

function refresh<T>(result: ControlPlaneResult<T>): ControlPlaneResult<T> {
    if (result.ok) revalidatePath("/team", "layout");
    return result;
}

/** Mark a teammate's month paid, with the payment's reference. */
export async function markPayoutPaidAction(input: {
    platformAdminId: string;
    month: string;
    reference: string;
    reason: string;
    idempotencyKey: string;
}): Promise<ControlPlaneResult<{ payout: PayoutView }>> {
    return refresh(
        await adminWrite<{ payout: PayoutView }>(
            "/team/payouts",
            "POST",
            input,
            "Could not mark the payout paid.",
        ),
    );
}

/** Set a kind's commission rate from now, or from a later date. */
export async function setCommissionRateAction(input: {
    kind: RateKind;
    basisPoints: number;
    effectiveFrom?: string;
    reason: string;
    idempotencyKey: string;
}): Promise<ControlPlaneResult<RatesView>> {
    return refresh(
        await adminWrite<RatesView>(
            "/commission/rates",
            "POST",
            input,
            "Could not set the rate.",
        ),
    );
}

/** The month's statement as a CSV, for the operator to save. */
export async function exportPayoutsAction(
    month: string,
): Promise<ControlPlaneResult<{ filename: string; csv: string }>> {
    const res = await adminFetch(
        `/team/payouts/export?month=${encodeURIComponent(month)}`,
        { headers: { accept: "text/csv" } },
    );
    if (!res.ok) {
        return {
            ok: false,
            error: await readError(res, "Could not export the payouts."),
            status: res.status,
        };
    }
    return {
        ok: true,
        data: {
            filename: `saroh-commission-${month}.csv`,
            csv: await res.text(),
        },
    };
}
