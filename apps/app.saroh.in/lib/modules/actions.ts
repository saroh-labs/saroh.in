"use server";

import { revalidatePath } from "next/cache";

import type { ModuleLifecycle } from "./schema";
import type { ModuleMutationResult } from "./service";
import {
    deselectProjectModule as deselectApi,
    selectProjectModule as selectApi,
    setModuleStatus as setStatusApi,
} from "./service";

/**
 * Server Actions for Settings → Modules. Thin wrappers that forward the session
 * cookie to api.saroh.in (which enforces module:manage) and revalidate the
 * settings page so the catalog re-fetches effective state after a change. The
 * UI calls these, never the api directly.
 */

const MODULES_PATH = "/settings/modules";

export async function setModuleStatusAction(
    moduleKey: string,
    status: ModuleLifecycle,
    options?: { reason?: string; acknowledgedBlockerCodes?: string[] },
): Promise<ModuleMutationResult> {
    const result = await setStatusApi(moduleKey, status, options);
    if (result.ok) revalidatePath(MODULES_PATH);
    return result;
}

export async function selectProjectModuleAction(
    projectId: string,
    moduleKey: string,
): Promise<ModuleMutationResult> {
    const result = await selectApi(projectId, moduleKey);
    if (result.ok) {
        revalidatePath(MODULES_PATH);
        revalidatePath(`/settings/projects/${projectId}/modules`);
    }
    return result;
}

export async function deselectProjectModuleAction(
    projectId: string,
    moduleKey: string,
): Promise<ModuleMutationResult> {
    const result = await deselectApi(projectId, moduleKey);
    if (result.ok) {
        revalidatePath(MODULES_PATH);
        revalidatePath(`/settings/projects/${projectId}/modules`);
    }
    return result;
}
