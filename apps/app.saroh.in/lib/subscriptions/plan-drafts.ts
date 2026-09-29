import { apiFetch, orgBase } from "@/lib/api/http";
import { editorFailure } from "@/lib/editor-shell/result";
import type {
    EditorProblem,
    EditorRecord,
    EditorResult,
} from "@/lib/editor-shell/types";

import type { Interval } from "./service";

/**
 * The Plan Editor's calls to D5's draft routes, in the editor shell's shapes
 * (D6: `EditorResult<EditorRecord<PlanValues>>`). Server-only; the editor
 * reaches them through the Server Actions in `actions.ts`.
 *
 * Every write answers with the plan as the editor reads it. A stale revision
 * is a 409 that `editorFailure` turns into the shell's conflict ("Priya
 * changed this plan"); a refusal on a field (a name another plan has, no
 * price) carries `field`.
 */

/** A plan's publishable values. `price` is null on a draft not priced yet. */
export interface PlanValues {
    name: string;
    description: string | null;
    price: string | null;
    currency: string;
    interval: Interval;
    /** 1–60; null is as many as they like. */
    classesPerMonth: number | null;
}

/**
 * A plan as the editor reads it: the shell's record, plus what stops it
 * being published now (the server's check, which includes a name another
 * plan already has) and when its draft was last saved.
 */
export type PlanEditorRecord = EditorRecord<PlanValues> & {
    problems: EditorProblem[];
    pendingChangedAt: string | null;
};

const plans = "/subscription-plans";
const plan = (id: string) => `${plans}/${encodeURIComponent(id)}`;

async function call<T>(
    path: string,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    body: unknown,
    fallback: string,
): Promise<EditorResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business." };
    // A request that never arrives rejects; the shell's autosave and its
    // buttons read a rejection as "Not saved" (lib/editor-shell/autosave.ts).
    const res = await apiFetch(`${base}${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (res.status === 204) return { ok: true, data: null as T };
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: data as T };
    return editorFailure(res.status, data, fallback);
}

/** Read one plan for the editor, and again for Reload after a conflict. */
export function loadPlanDraft(id: string) {
    return call<PlanEditorRecord>(
        `${plan(id)}/draft`,
        "GET",
        undefined,
        "Could not load that plan.",
    );
}

/** The first save of a new plan (it has a name): a DRAFT nobody can buy. */
export function createPlanDraft(values: Partial<PlanValues>) {
    return call<PlanEditorRecord>(
        `${plans}/drafts`,
        "POST",
        values,
        "Could not save that plan.",
    );
}

/** Autosave: a draft's fields, or a live plan's unpublished changes. */
export function savePlanDraft(
    id: string,
    values: Partial<PlanValues>,
    revision: number,
) {
    return call<PlanEditorRecord>(
        `${plan(id)}/draft`,
        "PATCH",
        { ...values, revision },
        "Could not save that plan.",
    );
}

/** Put a draft on sale, or make a live plan's changes its terms. */
export function publishPlan(id: string, revision: number) {
    return call<PlanEditorRecord>(
        `${plan(id)}/publish`,
        "POST",
        { revision },
        "Could not publish that plan.",
    );
}

/** Drop a live plan's unpublished changes. */
export function discardPlanChanges(id: string, revision: number) {
    return call<PlanEditorRecord>(
        `${plan(id)}/discard`,
        "POST",
        { revision },
        "Could not discard those changes.",
    );
}

/** Delete a draft nobody has bought. */
export function deletePlanDraft(id: string, revision: number) {
    return call<null>(
        `${plan(id)}?revision=${encodeURIComponent(String(revision))}`,
        "DELETE",
        undefined,
        "Could not delete that draft.",
    );
}
