import { apiFetch, orgBase, readError } from "@/lib/api/http";

import type { ModuleBlocker, ModuleLifecycle, ModuleView } from "./schema";
import { decodeModuleList, moduleMutationResponseSchema } from "./schema";

/**
 * Modular-capabilities data access for app.saroh.in (ADR-003 / #115). Forwards
 * the session cookie + active-org header to api.saroh.in, which enforces
 * `module:read` (list) and `module:manage` (mutations). Server-only — the app
 * never imports @saroh/database. A 409 deactivation-blocked response preserves
 * its stable blocker codes so the UI can explain why a disable was refused.
 */

/** Result of a module mutation, preserving API blockers on a safe-guard 409. */
export type ModuleMutationResult =
    | { ok: true; data: ModuleView }
    | { ok: false; error: string; blockers?: ModuleBlocker[] };

/** List every module with effective state for the active org (± a Project). */
export async function listModules(projectId?: string): Promise<ModuleView[]> {
    const base = await orgBase();
    if (!base) return [];
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    const res = await apiFetch(`${base}/modules${qs}`);
    if (!res.ok) {
        throw new Error(`GET modules failed: ${res.status}`);
    }
    return decodeModuleList(await res.json());
}

async function moduleMutation(
    path: string,
    method: "PUT" | "DELETE",
    body: unknown,
    fallback: string,
): Promise<ModuleMutationResult> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}${path}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
    });
    const raw = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
        blockers?: ModuleBlocker[];
    } | null;
    if (res.ok) {
        return { ok: true, data: moduleMutationResponseSchema.parse(raw).data };
    }
    return {
        ok: false,
        error: readError(raw, fallback),
        blockers: raw?.blockers,
    };
}

/** Set a module's lifecycle (enable / disable / archive). */
export function setModuleStatus(
    moduleKey: string,
    status: ModuleLifecycle,
    options?: { reason?: string; acknowledgedBlockerCodes?: string[] },
): Promise<ModuleMutationResult> {
    return moduleMutation(
        `/modules/${encodeURIComponent(moduleKey)}`,
        "PUT",
        { status, ...options },
        "Could not update the module.",
    );
}

/** Select an enabled module for a Project. */
export function selectProjectModule(
    projectId: string,
    moduleKey: string,
): Promise<ModuleMutationResult> {
    return moduleMutation(
        `/projects/${encodeURIComponent(projectId)}/modules/${encodeURIComponent(moduleKey)}`,
        "PUT",
        null,
        "Could not select the module for this project.",
    );
}

/** Deselect a module from a Project. */
export function deselectProjectModule(
    projectId: string,
    moduleKey: string,
): Promise<ModuleMutationResult> {
    return moduleMutation(
        `/projects/${encodeURIComponent(projectId)}/modules/${encodeURIComponent(moduleKey)}`,
        "DELETE",
        null,
        "Could not deselect the module for this project.",
    );
}
