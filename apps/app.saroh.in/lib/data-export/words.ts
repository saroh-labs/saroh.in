/**
 * Settings › Your data, as it reads (DEC-120). The API decides what an
 * export is and holds (`GET organizations/:org/data-exports`); this only
 * words it. Client-safe: no server imports.
 */

export type DataExportStatus =
    "QUEUED" | "RUNNING" | "READY" | "FAILED" | "EXPIRED";

export interface DataExportView {
    id: string;
    status: DataExportStatus;
    requestedAt: string;
    readyAt: string | null;
    /** When the file is deleted. */
    expiresAt: string | null;
    sizeBytes: number | null;
    counts: {
        files: Record<string, number>;
        media: { included: number; leftOut: number; bytes: number };
    } | null;
    failure: string | null;
}

export interface DataExportList {
    exports: DataExportView[];
    inProgress: boolean;
}

/** What one download holds, said once on the page and in the email. */
export const DATA_EXPORT_HOLDS =
    "Your customers, orders, invoices and credit notes, bookings, products and stock, memberships, class packs, courses and enquiries as spreadsheets (CSV), and the photos and videos you uploaded.";

export const DATA_EXPORT_KEPT =
    "Each download is kept for 7 days, then deleted. It holds your customers' details, so keep it somewhere safe.";

export const DATA_EXPORT_STARTED =
    "We're putting your data together. We'll email you a link when it's ready, and it will show here.";

export const DATA_EXPORT_ALREADY =
    "Your data is already being put together. We'll email you a link when it's ready.";

/** "12.4 MB": a file's size as a person reads it. */
export function fileSize(bytes: number | null): string | null {
    if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export interface DataExportLine {
    id: string;
    /** The state in words: never a colour alone. */
    state: string;
    tone: "progress" | "ready" | "problem" | "gone";
    /** The date the line turns on, with the words before it. */
    when: { label: string; iso: string } | null;
    /** Size and what was left out, joined; null when there is nothing to say. */
    detail: string | null;
    /** Offer Download. */
    downloadable: boolean;
}

/** One export's line. `now` decides whether a ready one has already gone. */
export function dataExportLine(
    view: DataExportView,
    now: Date = new Date(),
): DataExportLine {
    const base = { id: view.id, detail: null, downloadable: false };
    if (view.status === "QUEUED" || view.status === "RUNNING") {
        return {
            ...base,
            state: "Being put together",
            tone: "progress",
            when: { label: "Asked for", iso: view.requestedAt },
        };
    }
    if (view.status === "FAILED") {
        return {
            ...base,
            state: "Couldn't be made",
            tone: "problem",
            when: { label: "Asked for", iso: view.requestedAt },
            detail: view.failure ?? "Ask for it again.",
        };
    }
    const gone =
        view.status === "EXPIRED" ||
        (view.expiresAt !== null &&
            Date.parse(view.expiresAt) <= now.getTime());
    if (gone) {
        return {
            ...base,
            state: "Deleted",
            tone: "gone",
            when: view.expiresAt
                ? { label: "Deleted", iso: view.expiresAt }
                : null,
        };
    }
    const left = view.counts?.media.leftOut ?? 0;
    const parts = [
        fileSize(view.sizeBytes),
        left > 0
            ? `${left} ${left === 1 ? "file was" : "files were"} too big to fit; media.csv inside lists ${left === 1 ? "it" : "them"}`
            : null,
    ].filter((part): part is string => Boolean(part));
    return {
        ...base,
        state: "Ready",
        tone: "ready",
        when: view.expiresAt
            ? { label: "Kept until", iso: view.expiresAt }
            : null,
        detail: parts.length > 0 ? parts.join(" · ") : null,
        downloadable: true,
    };
}
