"use server";

import { revalidatePath } from "next/cache";

import type { PayoutView, RateKind, RatesView } from "./commission-words";
import type { ControlPlaneResult } from "./control-plane";
import { adminFetch, adminWrite, readError } from "./control-plane";
import type { OwnRatePreview, OwnRateSummary } from "./own-rate-words";

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

const ownRate = (organizationId: string) =>
    `/organizations/${encodeURIComponent(organizationId)}/commission-rate`;

/** After a business's own rate changes: its page and the Team pages. */
function refreshOwnRate<T>(
    organizationId: string,
    result: ControlPlaneResult<T>,
): ControlPlaneResult<T> {
    if (result.ok) {
        revalidatePath(`/businesses/${organizationId}`, "layout");
        revalidatePath("/team", "layout");
    }
    return result;
}

/**
 * A business's own commission rate (#1035): in force, to come, every one
 * set, and the days the dialog's chips offer. `team:pay` or
 * `commission:rates`; anyone else gets the API's refusal.
 */
export async function readOwnRateAction(
    organizationId: string,
): Promise<ControlPlaneResult<OwnRateSummary>> {
    const res = await adminFetch(ownRate(organizationId));
    if (!res.ok) {
        return {
            ok: false,
            error: await readError(
                res,
                "Could not read the business's own rate.",
            ),
            status: res.status,
        };
    }
    return { ok: true, data: (await res.json()) as OwnRateSummary };
}

/** The dry run: what saving would price. Writes nothing. */
export async function previewOwnRateAction(
    organizationId: string,
    input: { basisPoints: number; earnsFrom: string; lastDay?: string },
): Promise<ControlPlaneResult<OwnRatePreview>> {
    return adminWrite<OwnRatePreview>(
        `${ownRate(organizationId)}/preview`,
        "POST",
        input,
        "Could not work out what it would pay.",
    );
}

/** Set the business's own rate for its manager, back-paying once. */
export async function setOwnRateAction(
    organizationId: string,
    input: {
        basisPoints: number;
        earnsFrom: string;
        lastDay?: string;
        reason: string;
        idempotencyKey: string;
    },
): Promise<
    ControlPlaneResult<
        OwnRateSummary & {
            backPaid: { payments: number; amountPaise: number };
        }
    >
> {
    return refreshOwnRate(
        organizationId,
        await adminWrite(
            ownRate(organizationId),
            "POST",
            input,
            "Could not set the business's own rate.",
        ),
    );
}

/** End the business's own rate now (or before it starts). */
export async function endOwnRateAction(
    organizationId: string,
    input: { reason: string; idempotencyKey: string },
): Promise<ControlPlaneResult<OwnRateSummary>> {
    return refreshOwnRate(
        organizationId,
        await adminWrite<OwnRateSummary>(
            `${ownRate(organizationId)}/end`,
            "POST",
            input,
            "Could not end the business's own rate.",
        ),
    );
}
