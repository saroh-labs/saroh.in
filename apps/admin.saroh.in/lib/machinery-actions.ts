"use server";

import { revalidatePath } from "next/cache";

import type { ControlPlaneResult } from "./control-plane";
import { adminWrite } from "./control-plane";

/**
 * Server Actions for the machinery (plan U7–U8). A bulk action is always a
 * dry run first and then a durable operation; the API decides both.
 */

export type OperationKind = "jobs.retry" | "webhooks.replay";

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
    "webhooks.replay": "/webhooks/replay",
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
