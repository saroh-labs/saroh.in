import { getJson, mutate, orgBase } from "@/lib/api/http";

import type { DataExportList, DataExportView } from "./words";

/**
 * Settings › Your data (DEC-120): the owner's downloads. Server-only. The
 * read throws on an outage (the tab's error boundary says so) and a 403 —
 * someone who isn't an owner typing the address — renders as a denial
 * (`getJson`).
 */
export async function listDataExports(): Promise<DataExportList | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<DataExportList>(`${base}/data-exports`);
}

/** Start one; with one being made, the API answers with it (`already`). */
export function requestDataExport() {
    return mutate<{ export: DataExportView; already: boolean }>(
        "/data-exports",
        "POST",
        {},
        "Your data couldn't be prepared. Try again in a moment.",
    );
}

/** A fresh signed link to a ready download, good for a few minutes. */
export function dataExportLink(exportId: string) {
    return mutate<{ url: string; expiresAt: string }>(
        `/data-exports/${encodeURIComponent(exportId)}/link`,
        "POST",
        {},
        "The download link couldn't be made. Try again in a moment.",
    );
}
