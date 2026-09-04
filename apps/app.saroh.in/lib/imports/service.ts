import { apiFetch, getJson } from "@/lib/api/http";

/**
 * CSV import data access for app.saroh.in (#175).
 *
 * Forwards the session cookie to api.saroh.in, which enforces store membership
 * and the write role. The file itself is never parsed here: the api parses,
 * validates and plans, so what the merchant approves in the preview is produced
 * by exactly the code that later performs the writes. Server-only.
 */

export const IMPORT_ENTITIES = ["products", "customers"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export type DuplicatePolicy = "SKIP" | "UPDATE";
export type RowOutcome = "CREATE" | "UPDATE" | "SKIP" | "ERROR";

export interface RowIssue {
    row: number;
    field?: string;
    message: string;
}

export interface PlannedRow {
    row: number;
    outcome: RowOutcome;
    key: string | null;
    values: Partial<Record<string, string>>;
    issues: RowIssue[];
}

export interface ImportPlan {
    totalRows: number;
    counts: Record<RowOutcome, number>;
    rows: PlannedRow[];
    fileIssues: RowIssue[];
}

export interface PreviewResult {
    headers: string[];
    mapping: Record<string, string>;
    plan: ImportPlan;
}

export interface ApplyResult {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    plan: ImportPlan;
}

export interface ImportDescriptor {
    entity: ImportEntity;
    requiredFields: string[];
    mappableFields: string[];
    keyLabel: string;
}

export type Result<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; fileIssues?: RowIssue[] };

export interface ImportInput {
    csv: string;
    /** Empty asks the api to suggest a mapping from the file's headers. */
    mapping: Record<string, string>;
    policy: DuplicatePolicy;
}

async function post<T>(path: string, body: unknown): Promise<Result<T>> {
    const res = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as
        (T & { message?: string; fileIssues?: RowIssue[] }) | null;
    if (res.ok) return { ok: true, data: (data ?? {}) as T };
    return {
        ok: false,
        error: data?.message ?? "Something went wrong",
        ...(data?.fileIssues ? { fileIssues: data.fileIssues } : {}),
    };
}

/** What an import WOULD do. Writes nothing. */
export async function previewImport(
    storeId: string,
    entity: ImportEntity,
    input: ImportInput,
): Promise<Result<PreviewResult>> {
    return post<PreviewResult>(
        `/stores/${storeId}/imports/${entity}/preview`,
        input,
    );
}

/**
 * Perform the import. Takes the same input as the preview rather than a plan:
 * the api recomputes from the file, so an approved preview and the writes
 * actually performed cannot diverge.
 */
export async function applyImport(
    storeId: string,
    entity: ImportEntity,
    input: ImportInput,
): Promise<Result<ApplyResult>> {
    return post<ApplyResult>(
        `/stores/${storeId}/imports/${entity}/apply`,
        input,
    );
}

/**
 * The fields a column may be mapped to.
 *
 * Fetched rather than restated here: the api owns which fields exist and which
 * are required, and a second copy in the frontend would be free to drift from
 * the DTOs that actually validate the rows.
 */
export async function describeImport(
    storeId: string,
    entity: ImportEntity,
): Promise<ImportDescriptor | null> {
    return getJson<ImportDescriptor>(`/stores/${storeId}/imports/${entity}`);
}
