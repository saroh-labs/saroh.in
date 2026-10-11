"use server";

import { revalidatePath } from "next/cache";

import type { ControlPlaneResult } from "./control-plane";
import { adminWrite } from "./control-plane";

/**
 * Server Actions for the machinery (plan U7–U8). A bulk action is always a
 * dry run first and then a durable operation; the API decides both. The
 * waitlist's opening-day invites (marketing U31) are one too.
 */

export type OperationKind =
    "jobs.retry" | "jobs.cancel" | "webhooks.replay" | "waitlist.invite";

export interface PlannedItem {
    targetId: string;
    verdict: "act" | "skip" | "unsafe";
    detail: string;
}

export interface OperationPlan {
    kind: OperationKind;
    total: number;
    act: number;
    skip: number;
    unsafe: number;
    items: PlannedItem[];
}

const PATHS: Record<OperationKind, string> = {
    "jobs.retry": "/jobs/retry",
    "jobs.cancel": "/jobs/cancel",
    "webhooks.replay": "/webhooks/replay",
    "waitlist.invite": "/waitlist/invite",
};

export async function planOperationAction(
    kind: OperationKind,
    ids: string[],
): Promise<ControlPlaneResult<OperationPlan>> {
    return adminWrite<OperationPlan>(
        `${PATHS[kind]}/plan`,
        "POST",
        { ids },
        "Could not work out what would happen.",
    );
}

export async function startOperationAction(
    kind: OperationKind,
    input: { ids: string[]; reason: string; idempotencyKey: string },
): Promise<ControlPlaneResult<{ id: string }>> {
    const result = await adminWrite<{ id: string }>(
        PATHS[kind],
        "POST",
        input,
        "Could not start it.",
    );
    if (result.ok) {
        revalidatePath("/operations/jobs");
        revalidatePath("/operations/webhooks");
        revalidatePath("/waitlist");
    }
    return result;
}

/**
 * Stop a running operation's rows that have not started (#907). The API
 * checks the permission it was started under and records the reason.
 */
export async function cancelOperationAction(
    operationId: string,
    input: { reason: string; idempotencyKey: string },
): Promise<ControlPlaneResult<{ cancelled: number }>> {
    const result = await adminWrite<{ cancelled: number }>(
        `/operations/${encodeURIComponent(operationId)}/cancel`,
        "POST",
        input,
        "Could not cancel it.",
    );
    if (result.ok) {
        revalidatePath(`/operations/runs/${operationId}`);
    }
    return result;
}

export async function recheckDomainAction(
    domainId: string,
): Promise<ControlPlaneResult<{ verified: boolean; reason: string | null }>> {
    const result = await adminWrite<{
        verified: boolean;
        reason: string | null;
    }>(
        `/providers/domains/${encodeURIComponent(domainId)}/recheck`,
        "POST",
        undefined,
        "Could not check the domain.",
    );
    if (result.ok) revalidatePath("/operations/providers");
    return result;
}
