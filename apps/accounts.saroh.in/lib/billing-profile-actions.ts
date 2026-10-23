"use server";

import { revalidatePath } from "next/cache";

import type { ApiResult } from "./api";
import { apiWrite } from "./api";
import type { ProfileDetail } from "./billing-profiles";

/**
 * The account's Billing profiles writes (DEC-167 step 2), as Server
 * Actions: each forwards the visitor's session to the API, which checks
 * the profile and the business are theirs, and answers the API's own
 * words for a refusal, with the field it is about.
 */

const AREA = "/account/billing-profiles";

/** What a move did: now, at the renewal, a move given up, or nothing. */
export interface MoveDone {
    outcome: "applied" | "scheduled" | "kept" | "none";
    authorise: {
        at: string;
        legalName: string;
        authorisationUrl: string | null;
    } | null;
}

const path = (id: string) => `/billing-profiles/${encodeURIComponent(id)}`;

async function settled<T>(
    result: Promise<ApiResult<T>>,
): Promise<ApiResult<T>> {
    const r = await result;
    if (r.ok) revalidatePath(AREA, "layout");
    return r;
}

export async function updateProfileAction(
    id: string,
    edit: Record<string, string>,
): Promise<ApiResult<{ profile: ProfileDetail; businesses: number }>> {
    return settled(apiWrite("PATCH", path(id), edit));
}

export async function createProfileAction(
    input: Record<string, string>,
    organizationId: string | null,
): Promise<
    ApiResult<{
        profile: ProfileDetail;
        moved: MoveDone["outcome"] | null;
        notMoved: string | null;
    }>
> {
    return settled(
        apiWrite("POST", "/billing-profiles", {
            ...input,
            ...(organizationId ? { organizationId } : {}),
        }),
    );
}

export async function moveBusinessAction(
    id: string,
    organizationId: string,
): Promise<ApiResult<MoveDone>> {
    const r = await settled(
        apiWrite<MoveDone & Record<string, unknown>>(
            "POST",
            `${path(id)}/businesses/${encodeURIComponent(organizationId)}`,
        ),
    );
    if (!r.ok) return r;
    // Only what the page needs: never the provider's checkout handoff.
    const a = r.data.authorise;
    return {
        ok: true,
        data: {
            outcome: r.data.outcome,
            authorise: a
                ? {
                      at: a.at,
                      legalName: a.legalName,
                      authorisationUrl: a.authorisationUrl,
                  }
                : null,
        },
    };
}

export async function cancelMoveAction(
    id: string,
    organizationId: string,
): Promise<ApiResult<{ outcome: MoveDone["outcome"] }>> {
    const r = await settled(
        apiWrite<{ outcome: MoveDone["outcome"] }>(
            "DELETE",
            `${path(id)}/businesses/${encodeURIComponent(organizationId)}/pending`,
        ),
    );
    return r.ok ? { ok: true, data: { outcome: r.data.outcome } } : r;
}

export async function removeProfileAction(
    id: string,
): Promise<ApiResult<{ removed: true }>> {
    return settled(apiWrite("DELETE", path(id)));
}

export async function retrySyncAction(
    id: string,
): Promise<ApiResult<{ sync: string; queued: boolean }>> {
    return settled(apiWrite("POST", `${path(id)}/sync`));
}
