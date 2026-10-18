"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import type { BusinessModuleState } from "./businesses";
import {
    accessCookieName,
    accessUntilCookieName,
    getModuleState,
} from "./businesses";
import type { ControlPlaneResult } from "./control-plane";
import {
    adminWrite,
    clearFlagOverride,
    getJson,
    setFlagOverride,
} from "./control-plane";
import type { OfferDraft, OfferOptions, OfferPreview } from "./offer-words";

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
        // "layout": the header and every tab under it (admin plan U2).
        revalidatePath(`/businesses/${id}`, "layout");
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

    const jar = await cookies();
    const options = {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        expires: new Date(result.data.expiresAt),
    } as const;
    jar.set(accessCookieName(organizationId), result.data.id, options);
    // When it lapses, for "Open until hh:mm" beside Close support access.
    jar.set(
        accessUntilCookieName(organizationId),
        result.data.expiresAt,
        options,
    );
    revalidatePath(`/businesses/${organizationId}`, "layout");
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
    jar.delete(accessUntilCookieName(organizationId));
    revalidatePath(`/businesses/${organizationId}`, "layout");
    return { ok: true, data: null };
}

export async function suspendAction(
    organizationId: string,
    input: Reasoned & { confirmName: string; legalHold?: boolean },
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

/** Place a legal hold on a business already suspended or closing (DEC-122). */
export async function placeLegalHoldAction(
    organizationId: string,
    input: Reasoned,
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/legal-hold`,
            "POST",
            input,
            "Could not place the legal hold.",
        ),
    );
}

/** Lift a legal hold. The API takes it from a Platform Owner only. */
export async function liftLegalHoldAction(
    organizationId: string,
    input: Reasoned,
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/legal-hold/lift`,
            "POST",
            input,
            "Could not lift the legal hold.",
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

/** Grant, remove, or set the limit of one catalogue row (pricing U11). */
export async function moduleOverrideAction(
    organizationId: string,
    input: Reasoned & {
        kind: "grant" | "remove" | "limit";
        moduleKey: string;
        value?: number;
        expiresAt?: string;
    },
) {
    return refresh(
        organizationId,
        await adminWrite<{ id: string; warning: string | null }>(
            `${base(organizationId)}/overrides/modules`,
            "POST",
            input,
            "Could not save the override.",
        ),
    );
}

/**
 * What the offer sheet and Take away a module… can offer this business
 * (admin plan U5): a read, made when a sheet opens. A refusal says so in
 * words; an outage says to try again.
 */
export async function offerOptionsAction(
    organizationId: string,
): Promise<ControlPlaneResult<OfferOptions>> {
    try {
        const data = await getJson<OfferOptions>(
            `${base(organizationId)}/offers`,
        );
        return data
            ? { ok: true, data }
            : {
                  ok: false,
                  status: 403,
                  error: "Your access doesn't cover giving offers.",
              };
    } catch {
        return {
            ok: false,
            error: "Couldn't load what can be offered. Nothing has changed; try again in a moment.",
        };
    }
}

/**
 * The offer's dry run (U5): what the API would refuse, in its words, or
 * what the business would see. It writes nothing, so it refreshes nothing.
 */
export async function previewOfferAction(
    organizationId: string,
    draft: OfferDraft,
): Promise<ControlPlaneResult<OfferPreview>> {
    return adminWrite<OfferPreview>(
        `${base(organizationId)}/overrides/preview`,
        "POST",
        draft,
        "Couldn't check what they'd see. Try again in a moment.",
    );
}

export async function priceOverrideAction(
    organizationId: string,
    input: Reasoned & { pricePaise: number; expiresAt?: string },
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/overrides/price`,
            "POST",
            input,
            "Could not set the price.",
        ),
    );
}

export async function planOverrideAction(
    organizationId: string,
    input: Reasoned & { planKey: string; expiresAt: string },
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/overrides/plan`,
            "POST",
            input,
            "Could not put it on the plan.",
        ),
    );
}

export async function removeOverrideAction(
    organizationId: string,
    overrideId: string,
    input: Reasoned,
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/overrides/${encodeURIComponent(overrideId)}`,
            "DELETE",
            input,
            "Could not remove the override.",
        ),
    );
}

export async function catalogueMoveAction(
    organizationId: string,
    input: Reasoned & { when: "now" | "renewal" },
) {
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/catalogue-move`,
            "POST",
            input,
            "Could not move it to the live version.",
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

/**
 * A module fix's outcome (admin plan U4): the module's state as the API now
 * resolves it, so its row flips to the truth and not to a guess. Null when
 * the write took but the state couldn't be read back; the refresh follows.
 */
export type ModuleFixResult = ControlPlaneResult<{
    row: BusinessModuleState | null;
}>;

async function rowAfter(
    organizationId: string,
    moduleKey: string,
    result: ControlPlaneResult<unknown>,
): Promise<ModuleFixResult> {
    if (!result.ok) return result;
    revalidatePath("/releases", "layout");
    const state = await getModuleState(organizationId);
    const row =
        state.status === "ok"
            ? (state.data.modules.find((m) => m.moduleKey === moduleKey) ??
              null)
            : null;
    return { ok: true, data: { row } };
}

/**
 * A module's release for this one business (the Modules tab's "Turn on for
 * this business…", and its Undo): an override of the release's flag, the
 * same write Releases › Who has it makes (`flags:publish`). `enabled: null`
 * clears the override, so the business follows the default again.
 */
export async function moduleReleaseAction(
    organizationId: string,
    moduleKey: string,
    flagKey: string,
    input: Reasoned & { enabled: boolean | null },
): Promise<ModuleFixResult> {
    const written =
        input.enabled === null
            ? await clearFlagOverride(
                  flagKey,
                  organizationId,
                  input.reason,
                  input.idempotencyKey,
              )
            : await setFlagOverride(
                  flagKey,
                  organizationId,
                  input.enabled,
                  input.reason,
                  input.idempotencyKey,
              );
    return rowAfter(
        organizationId,
        moduleKey,
        refresh(organizationId, written),
    );
}

/**
 * "Switch on for them…": the business's own module switch, the write
 * `ModuleToggle` makes (`organization:modules:write`), read back as the
 * module's state.
 */
export async function switchOnModuleAction(
    organizationId: string,
    moduleKey: string,
    input: Reasoned,
): Promise<ModuleFixResult> {
    const written = await setModuleAction(organizationId, moduleKey, {
        ...input,
        enabled: true,
    });
    return rowAfter(organizationId, moduleKey, written);
}

/** Staff kill switch for one site's trackers (#897): off, or back on. */
export async function siteTrackersAction(
    organizationId: string,
    siteId: string,
    input: Reasoned & { switchOn: boolean },
) {
    const { switchOn, ...body } = input;
    return refresh(
        organizationId,
        await adminWrite(
            `${base(organizationId)}/sites/${encodeURIComponent(siteId)}/trackers/${switchOn ? "switch-on" : "switch-off"}`,
            "POST",
            body,
            switchOn
                ? "Could not switch the trackers back on."
                : "Could not switch the trackers off.",
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
