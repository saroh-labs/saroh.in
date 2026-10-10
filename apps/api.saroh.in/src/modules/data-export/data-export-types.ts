/** Builds one business's zip (`data-export.handler.ts`). */
export const DATA_EXPORT_BUILD_TYPE = "data-export.build";

/** Deletes a zip 7 days after it was ready (`data-export.handler.ts`). */
export const DATA_EXPORT_EXPIRE_TYPE = "data-export.expire";

/** How long a finished export is kept (owner, 9 Oct, DEC-117). */
export const DATA_EXPORT_KEPT_DAYS = 7;

/** How long the emailed link works; the workspace makes fresh ones. */
export const DATA_EXPORT_EMAIL_LINK_SECONDS = 24 * 60 * 60;

/** How long a link made in the workspace works. */
export const DATA_EXPORT_LINK_SECONDS = 15 * 60;

/**
 * Tries for a build: a storage or database blip is retried, a third
 * failure is told to the owner as failed.
 */
export const DATA_EXPORT_BUILD_ATTEMPTS = 3;

export const DataExportStatus = {
    Queued: "QUEUED",
    Running: "RUNNING",
    Ready: "READY",
    Failed: "FAILED",
    Expired: "EXPIRED",
} as const;

export type DataExportStatus =
    (typeof DataExportStatus)[keyof typeof DataExportStatus];

/** The states that count as "one is being made". */
export const DATA_EXPORT_IN_PROGRESS: DataExportStatus[] = [
    DataExportStatus.Queued,
    DataExportStatus.Running,
];
