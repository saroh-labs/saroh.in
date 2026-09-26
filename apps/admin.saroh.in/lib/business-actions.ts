"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { accessCookieName } from "./businesses";
import type { ControlPlaneResult } from "./control-plane";
import { adminWrite } from "./control-plane";

/**
 * Server Actions for operator actions on one business (plan U4–U5). Thin:
 * the API authorizes, validates and records every one of them; these forward,
 * then refresh the page so it shows the new state.
 *
 * Each carries an idempotency key minted by the client for that attempt, so a
 * double submit or a retry after a dropped response applies the change once.
 */

const base = (id: string) => `/organizations/${encodeURIComponent(id)}`;

function refresh<T>(id: string, result: ControlPlaneResult<T>) {
    if (result.ok) {
        revalidatePath(`/businesses/${id}`);
        revalidatePath("/businesses");
    }
    return result;
}

export interface Reasoned {
    reason: string;
    idempotencyKey: string;
}

/** Open a read-only, 30-minute support session and remember it for this business. */
export async function openAccessAction(
    organizationId: string,
    input: Reasoned,
): Promise<ControlPlaneResult<null>> {
    const result = await adminWrite<{ id: string; expiresAt: string }>(
        `${base(organizationId)}/access-sessions`,
        "POST",
        input,
        "Could not open support access.",
    );
    if (!result.ok) return result;

    (await cookies()).set(accessCookieName(organizationId), result.data.id, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        expires: new Date(result.data.expiresAt),
    });
    revalidatePath(`/businesses/${organizationId}`);
    return { ok: true, data: null };
}

/** Close the support session now rather than letting it lapse. */
export async function closeAccessAction(
    organizationId: string,
    input: Reasoned,
): Promise<ControlPlaneResult<null>> {
    const jar = await cookies();
    const sessionId = jar.get(accessCookieName(organizationId))?.value;
    if (sessionId) {
        const result = await adminWrite(
            `${base(organizationId)}/access-sessions/${encodeURIComponent(sessionId)}`,
            "DELETE",
            input,
            "Could not close support access.",
        );
        if (!result.ok) return result;
    }
    jar.delete(accessCookieName(organizationId));
    revalidatePath(`/businesses/${organizationId}`);
    return { ok: true, data: null };
}

export async function suspendAction(
    organizationId: string,
    input: Reasoned & { confirmName: string },
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/suspend`,
            "POST",
            input,
            "Could not suspend this business.",
        ),
    );
}

export async function reinstateAction(organizationId: string, input: Reasoned) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/reinstate`,
            "POST",
            input,
            "Could not reinstate this business.",
        ),
    );
}

export async function scheduleDeletionAction(
    organizationId: string,
    input: Reasoned & { confirmName: string; retentionDays: number },
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/schedule-deletion`,
            "POST",
            input,
            "Could not schedule deletion.",
        ),
    );
}

export async function changePlanAction(
    organizationId: string,
    input: Reasoned & { planId: string },
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/plan`,
            "PUT",
            input,
            "Could not change the plan.",
        ),
    );
}

export async function trialAction(
    organizationId: string,
    input: Reasoned & { days: number; planId?: string },
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/trial`,
            "POST",
            input,
            "Could not start the trial.",
        ),
    );
}

export async function raiseLimitAction(
    organizationId: string,
    input: Reasoned & { key: string; value: number; days: number },
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/limits`,
            "POST",
            input,
            "Could not raise the limit.",
        ),
    );
}

export async function revokeLimitAction(
    organizationId: string,
    overrideId: string,
    input: Reasoned,
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/limits/${encodeURIComponent(overrideId)}`,
            "DELETE",
            input,
            "Could not end the raised limit.",
        ),
    );
}

export async function setModuleAction(
    organizationId: string,
    moduleKey: string,
    input: Reasoned & { enabled: boolean },
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/modules/${encodeURIComponent(moduleKey)}`,
            "PUT",
            input,
            "Could not change the module.",
        ),
    );
}

export async function repairModulesAction(
    organizationId: string,
    input: Reasoned,
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/modules/repair`,
            "POST",
            input,
            "Could not repair modules.",
        ),
    );
}

export async function addNoteAction(organizationId: string, body: string) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/notes`,
            "POST",
            { body },
            "Could not save the note.",
        ),
    );
}
