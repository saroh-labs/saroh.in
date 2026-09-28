import { apiFetch, orgBase } from "@/lib/api/http";
import { editorFailure } from "@/lib/editor-shell/result";
import type {
    EditorProblem,
    EditorRecord,
    EditorResult,
} from "@/lib/editor-shell/types";

import type { PackValues } from "./pack-editor";
import { tidyPrice } from "./pack-editor";

/**
 * The Pack Editor's calls to E14's draft routes, in the editor shell's
 * shapes (D6: `EditorResult<EditorRecord<PackValues>>`), after
 * `lib/subscriptions/plan-drafts.ts`. Server-only; the editor reaches them
 * through the Server Actions in `draft-actions.ts`.
 *
 * Every write answers with the pack as the editor reads it. A stale
 * revision is a 409 that `editorFailure` turns into the shell's conflict
 * ("Priya changed this pack"); a refusal on a field — a sold pack's kind
 * (E13), a price missing at Publish — carries `field`, so it shows beside
 * that field in the merchant's words, never as a code.
 */

/** A pack as the editor reads it: the shell's record, plus what stops Publish. */
export type PackEditorRecord = EditorRecord<PackValues> & {
    problems: EditorProblem[];
    pendingChangedAt: string | null;
};

const packs = "/class-packs";
const pack = (id: string) => `${packs}/${encodeURIComponent(id)}`;

/** The server's "4500.00" as the price field shows it. */
function tidy(values: PackValues): PackValues;
function tidy(values: PackValues | null): PackValues | null;
function tidy(values: PackValues | null): PackValues | null {
    return values ? { ...values, price: tidyPrice(values.price) } : null;
}

function tidyRecord(r: PackEditorRecord): PackEditorRecord {
    return { ...r, values: tidy(r.values), published: tidy(r.published) };
}

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

/**
 * The record a write answered, as the field shows it. A 2xx whose body
 * didn't arrive is "not saved", never a crash: the shell keeps the edits
 * and offers Try again.
 */
async function record(
    res: Promise<EditorResult<PackEditorRecord | null>>,
): Promise<EditorResult<PackEditorRecord>> {
    const r = await res;
    if (!r.ok) return r;
    if (!r.data) return { ok: false, error: "Could not read that pack back." };
    return { ok: true, data: tidyRecord(r.data) };
}

/** Read one pack for the editor, and again for Reload after a conflict. */
export function loadPackDraft(id: string) {
    return record(
        call<PackEditorRecord | null>(
            `${pack(id)}/draft`,
            "GET",
            undefined,
            "Could not load that pack.",
        ),
    );
}

/** The first save of a new pack (it has a name): a DRAFT nobody can buy. */
export function createPackDraft(values: Partial<PackValues>) {
    return record(
        call<PackEditorRecord | null>(
            `${packs}/drafts`,
            "POST",
            values,
            "Could not save that pack.",
        ),
    );
}

/** Autosave: a draft's fields, or a live pack's unpublished changes. */
export function savePackDraft(
    id: string,
    values: Partial<PackValues>,
    revision: number,
) {
    return record(
        call<PackEditorRecord | null>(
            `${pack(id)}/draft`,
            "PATCH",
            { ...values, revision },
            "Could not save that pack.",
        ),
    );
}

/** Put a draft on sale, or make a live pack's changes its terms. */
export function publishPack(id: string, revision: number) {
    return record(
        call<PackEditorRecord | null>(
            `${pack(id)}/publish`,
            "POST",
            { revision },
            "Could not publish that pack.",
        ),
    );
}

/** Drop a live pack's unpublished changes. */
export function discardPackChanges(id: string, revision: number) {
    return record(
        call<PackEditorRecord | null>(
            `${pack(id)}/discard`,
            "POST",
            { revision },
            "Could not discard those changes.",
        ),
    );
}

/** Delete a draft nobody has bought. */
export function deletePackDraft(id: string, revision: number) {
    return call<null>(
        `${pack(id)}?revision=${encodeURIComponent(String(revision))}`,
        "DELETE",
        undefined,
        "Could not delete that draft.",
    );
}

// — The page's first read ——————————————————————————————————————————————

export type PackEditorRead =
    | { ok: true; record: PackEditorRecord }
    | { ok: false; reason: "missing" | "forbidden" | "failed" };

/**
 * The pack for the editor's page, or why not. A failed read is never "that
 * pack isn't here" (saroh-product-states).
 */
export async function readPackEditor(id: string): Promise<PackEditorRead> {
    const base = await orgBase();
    if (!base) return { ok: false, reason: "failed" };
    try {
        const res = await apiFetch(`${base}${pack(id)}/draft`);
        if (res.status === 404) return { ok: false, reason: "missing" };
        if (res.status === 403) return { ok: false, reason: "forbidden" };
        if (!res.ok) return { ok: false, reason: "failed" };
        return {
            ok: true,
            record: tidyRecord((await res.json()) as PackEditorRecord),
        };
    } catch {
        return { ok: false, reason: "failed" };
    }
}

/**
 * How many times a live pack has been sold (E13's `GET class-packs/:id`),
 * for the kind lock and "Sold so far". Null when it couldn't be read: the
 * editor then keeps the kind locked rather than guess none.
 */
export async function readPackSold(id: string): Promise<number | null> {
    const base = await orgBase();
    if (!base) return null;
    try {
        const res = await apiFetch(`${base}${pack(id)}`);
        if (!res.ok) return null;
        const body = (await res.json()) as { sold?: unknown };
        return typeof body.sold === "number" ? body.sold : null;
    } catch {
        return null;
    }
}
