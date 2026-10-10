import { prisma, runInOrgContext } from "@saroh/database";
import type { ObjectStorage } from "@saroh/object-storage";
import { buildObjectKey, sanitizeFilename } from "@saroh/object-storage";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    csvCell,
    csvLine,
    EXPORT_PAGE_SIZE,
    EXPORT_TABLES,
    tableCsv,
} from "./data-export-tables";
import { ZipFile } from "./zip-file";

/**
 * How much of the media library one zip carries (DEC-117). The zip format
 * this writes has no ZIP64, so an archive stays under 4 GiB; 2 GiB of
 * photos and videos leaves room for every CSV. A file past it is listed
 * in `media.csv` as left out, with its name, so nothing is silently lost.
 */
export const DATA_EXPORT_MEDIA_BYTES = 2 * 1024 ** 3;

export interface DataExportCounts {
    /** Rows in each CSV, by file name. */
    files: Record<string, number>;
    media: {
        /** Files copied into `media/`. */
        included: number;
        /** Files listed but left out: past the cap or missing in storage. */
        leftOut: number;
        /** Bytes of the files copied in. */
        bytes: number;
    };
}

export interface BuiltDataExport {
    storageKey: string;
    sizeBytes: number;
    counts: DataExportCounts;
}

/** Where an export's zip is kept: tenant-scoped like every stored object. */
export function dataExportKey(
    organizationId: string,
    exportId: string,
): string {
    return buildObjectKey({
        organizationId,
        purpose: "data-export",
        filename: "saroh-data.zip",
        uuid: exportId,
    });
}

const README = (businessName: string, made: Date) =>
    [
        `Your data from Saroh: ${businessName}`,
        `Made ${made.toISOString()} (UTC).`,
        "",
        "One CSV file per kind of record. The first line of each names its columns.",
        "Records refer to each other by id: an order line's orderId is the id in orders.csv,",
        "a booking's contactId is the id in customers.csv, and so on.",
        "Dates and times are in UTC. Amounts are in the currency named on the same row:",
        "a column ending in Cents is in the smallest unit (paise), the others in rupees.",
        "Credit notes are in invoices-and-credit-notes.csv, with kind CREDIT_NOTE.",
        "Text that a spreadsheet would read as a formula starts with ' so it stays text.",
        "",
        "media/ holds the photos and videos you uploaded; media.csv lists every one,",
        "and says if a file was left out of this download and why.",
        "",
    ].join("\r\n");

/**
 * Build one business's zip and put it in object storage (DEC-117).
 *
 * Written to a file in the temp directory as it is made — every CSV a page
 * at a time, every media file streamed from storage — then uploaded from
 * that file and the file removed, whatever happened. Nothing in it is held
 * in memory beyond a page of rows or a chunk of a file.
 */
export async function buildDataExport(input: {
    organizationId: string;
    exportId: string;
    businessName: string;
    storage: ObjectStorage;
    now?: Date;
}): Promise<BuiltDataExport> {
    const { organizationId, exportId, storage } = input;
    const made = input.now ?? new Date();
    const path = join(tmpdir(), `saroh-data-export-${exportId}.zip`);
    const zip = new ZipFile(path);
    const counts: DataExportCounts = {
        files: {},
        media: { included: 0, leftOut: 0, bytes: 0 },
    };
    try {
        await zip.add("README.txt", [README(input.businessName, made)], {
            compress: true,
            modified: made,
        });
        for (const table of EXPORT_TABLES) {
            counts.files[table.file] = 0;
            await zip.add(
                table.file,
                tableCsv(table, organizationId, (n) => {
                    counts.files[table.file] += n;
                }),
                { compress: true, modified: made },
            );
        }
        const listed = await addMedia(zip, organizationId, storage, counts);
        await zip.add("media.csv", listed, { compress: true, modified: made });
        counts.files["media.csv"] =
            counts.media.included + counts.media.leftOut;

        const sizeBytes = await zip.close();
        const storageKey = dataExportKey(organizationId, exportId);
        await storage.putObject(storageKey, createReadStream(path), {
            contentType: "application/zip",
            contentLength: sizeBytes,
        });
        return { storageKey, sizeBytes, counts };
    } catch (error) {
        zip.abort();
        throw error;
    } finally {
        await rm(path, { force: true });
    }
}

const MEDIA_COLUMNS = [
    "id",
    "filename",
    "contentType",
    "sizeBytes",
    "purpose",
    "createdAt",
    "inThisDownload",
    "pathInZip",
] as const;

/**
 * Copy each uploaded file into `media/`, a page of rows at a time, until
 * {@link DATA_EXPORT_MEDIA_BYTES}; then `media.csv`'s lines, which list
 * every file with whether it is in the zip.
 */
async function addMedia(
    zip: ZipFile,
    organizationId: string,
    storage: ObjectStorage,
    counts: DataExportCounts,
): Promise<string[]> {
    const lines = [csvLine(MEDIA_COLUMNS.map((c) => csvCell(c)))];
    let after: string | null = null;
    for (;;) {
        const rows = await runInOrgContext(organizationId, () =>
            prisma.media.findMany({
                where: { organizationId, status: "READY" },
                select: {
                    id: true,
                    key: true,
                    filename: true,
                    contentType: true,
                    sizeBytes: true,
                    purpose: true,
                    createdAt: true,
                },
                orderBy: { id: "asc" },
                take: EXPORT_PAGE_SIZE,
                ...(after ? { skip: 1, cursor: { id: after } } : {}),
            }),
        );
        for (const media of rows) {
            const path = `media/${media.id}-${sanitizeFilename(media.filename)}`;
            let state = "yes";
            if (
                counts.media.bytes + media.sizeBytes >
                DATA_EXPORT_MEDIA_BYTES
            ) {
                state = "no: past what one download holds";
            } else {
                const body = await storage.readObject(media.key);
                if (body) {
                    counts.media.bytes += await zip.add(path, body, {
                        compress: false,
                        modified: media.createdAt,
                    });
                } else {
                    state = "no: the file wasn't found in storage";
                }
            }
            if (state === "yes") counts.media.included += 1;
            else counts.media.leftOut += 1;
            lines.push(
                csvLine([
                    csvCell(media.id),
                    csvCell(media.filename, true),
                    csvCell(media.contentType),
                    csvCell(media.sizeBytes),
                    csvCell(media.purpose, true),
                    csvCell(media.createdAt),
                    csvCell(state),
                    csvCell(state === "yes" ? path : ""),
                ]),
            );
        }
        if (rows.length < EXPORT_PAGE_SIZE) return lines;
        after = rows[rows.length - 1].id;
    }
}
