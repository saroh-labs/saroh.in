"use server";

import { revalidatePath } from "next/cache";

import type { ControlPlaneResult } from "./control-plane";
import { adminWrite } from "./control-plane";
import { getPricingImpact, listCoupons } from "./pricing";
import type {
    AdminCoupon,
    AdminPricingImpact,
    CancelResult,
    CouponInput,
    DraftSaved,
    PreviewToken,
    PublishPolicy,
    PublishResult,
} from "./pricing-types";

/**
 * Server Actions for Plans & modules (plans catalogue U6; the API is U3/U4).
 * Thin wrappers, as `flag-actions.ts`: the API authorizes (`pricing:edit`,
 * `pricing:publish`, `coupons:manage`), validates and audits every write,
 * and this only forwards and refreshes. A refusal comes back with the API's
 * own message, its status and its `details`, so the draft store can tell a
 * stale save (409) from an outage.
 *
 * The one place the tabs write from: U7–U10 import from here and add nothing
 * of their own beside it.
 */

const PATH = "/plans";

// ── The shared draft ──────────────────────────────────────────────────────

/**
 * Save the whole draft. `revision` is the one the editor started from; 0
 * starts a draft. Not revalidated: the editor already holds what it sent,
 * and a re-render mid-typing would fight the field under the cursor.
 */
export async function savePricingDraftAction(input: {
    catalog: unknown;
    revision: number;
    idempotencyKey: string;
}): Promise<ControlPlaneResult<DraftSaved>> {
    return adminWrite<DraftSaved>(
        "/pricing/draft",
        "PUT",
        input,
        "The draft could not be saved.",
    );
}

export async function discardPricingDraftAction(input: {
    revision: number;
    reason?: string;
    idempotencyKey: string;
}): Promise<ControlPlaneResult<{ discarded: true }>> {
    const result = await adminWrite<{ discarded: true }>(
        "/pricing/draft",
        "DELETE",
        input,
        "The draft could not be discarded.",
    );
    if (result.ok) revalidatePath(PATH);
    return result;
}

/** A short-lived link to the pricing page as this draft revision draws it. */
export async function previewPricingAction(
    revision: number,
): Promise<ControlPlaneResult<PreviewToken>> {
    return adminWrite<PreviewToken>(
        "/pricing/preview-token",
        "POST",
        { revision },
        "The preview could not be opened.",
    );
}

/**
 * What the saved draft would do, for the status bar and Review & publish.
 * `data: null` when there is nothing to weigh (no draft, or one that does
 * not validate yet).
 */
export async function pricingImpactAction(): Promise<
    ControlPlaneResult<AdminPricingImpact | null>
> {
    try {
        return { ok: true, data: await getPricingImpact() };
    } catch {
        return {
            ok: false,
            error: "What this draft does could not be worked out.",
        };
    }
}

// ── Versions ──────────────────────────────────────────────────────────────

export async function publishPricingAction(input: {
    revision: number;
    /** ISO time; absent publishes now. */
    goLiveAt?: string;
    policy: PublishPolicy;
    note?: string;
    reason: string;
    idempotencyKey: string;
}): Promise<ControlPlaneResult<PublishResult>> {
    const result = await adminWrite<PublishResult>(
        "/pricing/publish",
        "POST",
        input,
        "The draft could not be published.",
    );
    if (result.ok) revalidatePath(PATH);
    return result;
}

/** Cancel a scheduled version, and the moves to it. */
export async function cancelPricingVersionAction(
    version: number,
    input: { reason: string; idempotencyKey: string },
): Promise<ControlPlaneResult<CancelResult>> {
    const result = await adminWrite<CancelResult>(
        `/pricing/versions/${encodeURIComponent(String(version))}`,
        "DELETE",
        input,
        "The schedule could not be cancelled.",
    );
    if (result.ok) revalidatePath(PATH);
    return result;
}

/** Publish an earlier version's pricing again, as the next version. */
export async function rollbackPricingVersionAction(
    version: number,
    input: { note?: string; reason: string; idempotencyKey: string },
): Promise<ControlPlaneResult<PublishResult>> {
    const result = await adminWrite<PublishResult>(
        `/pricing/versions/${encodeURIComponent(String(version))}/rollback`,
        "POST",
        input,
        "That version could not be put back.",
    );
    if (result.ok) revalidatePath(PATH);
    return result;
}

// ── Coupons (outside versions: they apply when saved) ─────────────────────

export async function listCouponsAction(): Promise<
    ControlPlaneResult<AdminCoupon[]>
> {
    try {
        const coupons = await listCoupons();
        if (!coupons) return { ok: false, error: "You can't see coupons." };
        return { ok: true, data: coupons };
    } catch {
        return { ok: false, error: "Coupons could not be loaded." };
    }
}

export async function createCouponAction(
    input: CouponInput & { reason: string; idempotencyKey: string },
): Promise<ControlPlaneResult<AdminCoupon>> {
    const result = await adminWrite<AdminCoupon>(
        "/pricing/coupons",
        "POST",
        input,
        "The coupon could not be created.",
    );
    if (result.ok) revalidatePath(PATH);
    return result;
}

export async function updateCouponAction(
    couponId: string,
    input: Partial<Omit<CouponInput, "code">> & {
        reason: string;
        idempotencyKey: string;
    },
): Promise<ControlPlaneResult<AdminCoupon>> {
    const result = await adminWrite<AdminCoupon>(
        `/pricing/coupons/${encodeURIComponent(couponId)}`,
        "PATCH",
        input,
        "The coupon could not be changed.",
    );
    if (result.ok) revalidatePath(PATH);
    return result;
}

/** Deleted outright, or archived when a business has used it. */
export async function deleteCouponAction(
    couponId: string,
    input: { reason: string; idempotencyKey: string },
): Promise<
    ControlPlaneResult<{
        id: string;
        code: string;
        outcome: "deleted" | "archived";
    }>
> {
    const result = await adminWrite<{
        id: string;
        code: string;
        outcome: "deleted" | "archived";
    }>(
        `/pricing/coupons/${encodeURIComponent(couponId)}`,
        "DELETE",
        input,
        "The coupon could not be deleted.",
    );
    if (result.ok) revalidatePath(PATH);
    return result;
}
