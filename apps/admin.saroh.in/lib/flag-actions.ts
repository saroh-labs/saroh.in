"use server";

import { revalidatePath } from "next/cache";

import type { ControlPlaneResult } from "./control-plane";
import {
    clearFlagOverride,
    setFlagOverride,
    setGlobalFlag,
} from "./control-plane";

/**
 * Server Actions for flag control. Thin wrappers: authorization (staff) and
 * validation (a reason is mandatory) both live in the API, so nothing here
 * decides anything — it only forwards and refreshes.
 */

export async function setGlobalFlagAction(
    flagKey: string,
    enabled: boolean,
    reason: string,
): Promise<ControlPlaneResult<null>> {
    const result = await setGlobalFlag(flagKey, enabled, reason);
    if (result.ok) revalidatePath("/flags");
    return result;
}

export async function setFlagOverrideAction(
    flagKey: string,
    organizationId: string,
    enabled: boolean,
    reason: string,
): Promise<ControlPlaneResult<null>> {
    const result = await setFlagOverride(
        flagKey,
        organizationId,
        enabled,
        reason,
    );
    if (result.ok) revalidatePath("/flags");
    return result;
}

export async function clearFlagOverrideAction(
    flagKey: string,
    organizationId: string,
    reason: string,
): Promise<ControlPlaneResult<null>> {
    const result = await clearFlagOverride(flagKey, organizationId, reason);
    if (result.ok) revalidatePath("/flags");
    return result;
}
