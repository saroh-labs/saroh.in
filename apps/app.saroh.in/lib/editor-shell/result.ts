import { toFailure } from "@/lib/api/failure";

import type { EditorConflict, EditorFailure } from "./types";

/*
 * Reading a refused draft write into the shell's failure (D6), for the
 * record services that call D5's endpoints (`lib/subscriptions/service.ts`
 * for plans, `lib/class-packs/service.ts` for packs, E14).
 *
 * D5 answers a stale revision with a 409 whose details are
 * `{ yours, current, changedBy, changedAt }`. Any other 409 — "This plan
 * isn't published yet", a clashing name — is an ordinary refusal: the
 * conflict state is only for "someone else saved first".
 */

interface Envelope {
    details?: unknown;
    error?: unknown;
}

function detailsOf(body: unknown): Record<string, unknown> | null {
    const b = (body ?? {}) as Envelope;
    const inner =
        b.error && typeof b.error === "object" ? (b.error as Envelope) : null;
    const d = inner?.details ?? b.details;
    return d && typeof d === "object" ? (d as Record<string, unknown>) : null;
}

/** "Priya Raman", from a name, or from `{ name }` — never an id. */
function nameOf(v: unknown): string | null {
    if (typeof v === "string") return v.trim() || null;
    if (v && typeof v === "object" && "name" in v) {
        const n = (v as { name?: unknown }).name;
        return typeof n === "string" && n.trim() ? n.trim() : null;
    }
    return null;
}

/** The conflict a 409 describes, or null when it is some other refusal. */
export function readConflict(
    status: number,
    body: unknown,
): EditorConflict | null {
    if (status !== 409) return null;
    const d = detailsOf(body);
    if (!d || !("current" in d || "changedBy" in d || "yours" in d)) {
        return null;
    }
    const at = d.changedAt;
    return {
        changedBy: nameOf(d.changedByName) ?? nameOf(d.changedBy),
        changedAt: typeof at === "string" ? at : null,
        current: typeof d.current === "number" ? d.current : null,
    };
}

/** A non-2xx answer from a draft endpoint, as the shell reads it. */
export function editorFailure(
    status: number,
    body: unknown,
    fallback: string,
): EditorFailure {
    const failure = toFailure(body, fallback);
    const conflict = readConflict(status, body);
    return conflict ? { ...failure, conflict } : failure;
}
