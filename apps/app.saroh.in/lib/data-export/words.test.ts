import { describe, expect, it } from "vitest";

import type { DataExportView } from "./words";
import { dataExportLine, fileSize } from "./words";

const NOW = new Date("2026-10-10T10:00:00.000Z");

const view = (over: Partial<DataExportView>): DataExportView => ({
    id: "exp_1",
    status: "READY",
    requestedAt: "2026-10-09T09:00:00.000Z",
    readyAt: "2026-10-09T09:02:00.000Z",
    expiresAt: "2026-10-16T09:02:00.000Z",
    sizeBytes: 13_002_342,
    counts: {
        files: { "customers.csv": 12 },
        media: { included: 40, leftOut: 0, bytes: 12_000_000 },
    },
    failure: null,
    ...over,
});

describe("fileSize", () => {
    it("reads as a person says it", () => {
        expect(fileSize(900)).toBe("900 B");
        expect(fileSize(6649)).toBe("6.5 KB");
        expect(fileSize(13_002_342)).toBe("12.4 MB");
        expect(fileSize(2 * 1024 ** 3)).toBe("2.0 GB");
        expect(fileSize(null)).toBeNull();
    });
});

describe("dataExportLine (DEC-117)", () => {
    it("offers a ready download, with its size and the day it goes", () => {
        expect(dataExportLine(view({}), NOW)).toEqual({
            id: "exp_1",
            state: "Ready",
            tone: "ready",
            when: { label: "Kept until", iso: "2026-10-16T09:02:00.000Z" },
            detail: "12.4 MB",
            downloadable: true,
        });
    });

    it("says what didn't fit, and where it is listed", () => {
        const line = dataExportLine(
            view({
                counts: {
                    files: {},
                    media: { included: 3, leftOut: 2, bytes: 1 },
                },
            }),
            NOW,
        );
        expect(line.detail).toBe(
            "12.4 MB · 2 files were too big to fit; media.csv inside lists them",
        );
    });

    it.each(["QUEUED", "RUNNING"] as const)(
        "says a %s one is being put together, with nothing to download",
        (status) => {
            expect(
                dataExportLine(
                    view({ status, readyAt: null, expiresAt: null }),
                    NOW,
                ),
            ).toMatchObject({
                state: "Being put together",
                downloadable: false,
                when: { label: "Asked for" },
            });
        },
    );

    it("says why one failed, in the API's words", () => {
        expect(
            dataExportLine(
                view({ status: "FAILED", failure: "Ask for it again." }),
                NOW,
            ),
        ).toMatchObject({
            state: "Couldn't be made",
            tone: "problem",
            detail: "Ask for it again.",
            downloadable: false,
        });
    });

    it("never offers one whose file has gone, expired by the job or by the clock", () => {
        for (const gone of [
            view({ status: "EXPIRED" }),
            view({ expiresAt: "2026-10-10T09:59:59.000Z" }),
        ]) {
            expect(dataExportLine(gone, NOW)).toMatchObject({
                state: "Deleted",
                downloadable: false,
            });
        }
    });
});
