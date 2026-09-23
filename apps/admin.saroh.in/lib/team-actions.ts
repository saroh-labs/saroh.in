"use server";

import { revalidatePath } from "next/cache";

import type { ControlPlaneResult } from "./control-plane";
import { adminWrite } from "./control-plane";

/**
 * Server Actions for staff access (plan U2). The API decides who may grant
 * and protects the last owner; these forward and refresh.
 */

function refresh<T>(result: ControlPlaneResult<T>) {
    if (result.ok) revalidatePath("/team");
    return result;
}

export async function grantStaffAction(input: {
    email: string;
    roles: string[];
    reason: string;
    expiresAt?: string;
    idempotencyKey: string;
}) {
    return refresh(
        await adminWrite("/staff", "POST", input, "Could not grant access."),
    );
}

export async function amendStaffAction(
    platformAdminId: string,
    input: {
        roles: string[];
        reason: string;
        expiresAt?: string;
        idempotencyKey: string;
    },
) {
    return refresh(
        await adminWrite(
            `/staff/${encodeURIComponent(platformAdminId)}`,
            "PUT",
            input,
            "Could not change their access.",
        ),
    );
}

export async function revokeStaffAction(
    platformAdminId: string,
    input: { reason: string; idempotencyKey: string },
) {
    return refresh(
        await adminWrite(
            `/staff/${encodeURIComponent(platformAdminId)}`,
            "DELETE",
            input,
            "Could not revoke their access.",
        ),
    );
}
