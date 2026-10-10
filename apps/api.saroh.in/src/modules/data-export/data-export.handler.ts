import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { ObjectStorage } from "@saroh/object-storage";

import { appBase } from "../../common/app-url";
import { sendDataExportReadyEmail } from "../../common/email";
import { keepJobLease } from "../jobs/job-lease";
import { OBJECT_STORAGE } from "../media/object-storage.provider";
import { LEGAL_HOLD_MESSAGE } from "../organizations/legal-hold";
import { lifecycleAllows } from "../organizations/organization-lifecycle.policy";
import { buildDataExport } from "./data-export-build";
import {
    DATA_EXPORT_EMAIL_LINK_SECONDS,
    DATA_EXPORT_EXPIRE_TYPE,
    DATA_EXPORT_IN_PROGRESS,
    DATA_EXPORT_KEPT_DAYS,
    DataExportStatus,
} from "./data-export-types";
import { dataExportFilename } from "./data-export.service";

const DAY_MS = 24 * 60 * 60 * 1000;

function exportIdOf(job: Job): string | null {
    const payload = job.payload as { exportId?: unknown } | null;
    return typeof payload?.exportId === "string" ? payload.exportId : null;
}

/**
 * The two jobs behind "Download your data" (DEC-120).
 *
 * **`data-export.build`** makes one business's zip (`data-export-build.ts`),
 * stores it, marks the export READY with its 7-day end, queues its own
 * deletion on that transaction and emails the owner who asked a signed
 * link. It can run for minutes, so it keeps its lease
 * (`jobs/job-lease.ts`). Idempotent: an export no longer being made is
 * left alone, and a retry writes the same storage key again. A failure is
 * retried by the queue; the last one marks the export FAILED in words.
 * The email is best-effort — the workspace shows the export either way.
 *
 * **`data-export.expire`** deletes the zip from storage and marks the
 * export EXPIRED. Storage first: a delete that fails throws, the row still
 * names the key, and the queue tries again. The deletion clean-up never
 * cancels it (`CLEANUP_KEEPS_JOB_TYPES`). It runs for a business on legal
 * hold too: the zip is a copy, and every record in it stays where it is
 * (`legal-hold.deletes.spec.ts` lists it as not the business's data).
 */
@Injectable()
export class DataExportHandler {
    private readonly logger = new Logger(DataExportHandler.name);

    constructor(
        @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    ) {}

    readonly build = async (job: Job): Promise<void> => {
        const exportId = exportIdOf(job);
        if (!exportId) return;
        const row = await prisma.dataExport.findUnique({
            where: { id: exportId },
            include: {
                organization: {
                    select: {
                        name: true,
                        slug: true,
                        lifecycleStatus: true,
                        legalHoldAt: true,
                    },
                },
            },
        });
        if (
            !row ||
            !DATA_EXPORT_IN_PROGRESS.includes(row.status as DataExportStatus)
        ) {
            return;
        }
        // Deleted since it was asked for: its people can't open it, so
        // nobody is left to download this.
        if (!lifecycleAllows(row.organization.lifecycleStatus, "takeout")) {
            await this.fail(exportId, "The business was deleted first.");
            return;
        }
        // Put on legal hold since it was asked for (DEC-122): no export
        // is made while the hold lasts.
        if (row.organization.legalHoldAt) {
            await this.fail(exportId, LEGAL_HOLD_MESSAGE);
            return;
        }
        await prisma.dataExport.updateMany({
            where: { id: exportId, status: { in: DATA_EXPORT_IN_PROGRESS } },
            data: {
                status: DataExportStatus.Running,
                startedAt: row.startedAt ?? new Date(),
            },
        });

        const release = keepJobLease(job);
        try {
            const built = await buildDataExport({
                organizationId: row.organizationId,
                exportId,
                businessName: row.organization.name,
                storage: this.storage,
            });
            const readyAt = new Date();
            const expiresAt = new Date(
                readyAt.getTime() + DATA_EXPORT_KEPT_DAYS * DAY_MS,
            );
            const marked = await prisma.$transaction(async (tx) => {
                const { count } = await tx.dataExport.updateMany({
                    where: { id: exportId, status: DataExportStatus.Running },
                    data: {
                        status: DataExportStatus.Ready,
                        storageKey: built.storageKey,
                        sizeBytes: BigInt(built.sizeBytes),
                        counts: built.counts as unknown as Prisma.InputJsonValue,
                        failure: null,
                        readyAt,
                        expiresAt,
                    },
                });
                if (count === 0) return false;
                await tx.job.create({
                    data: {
                        type: DATA_EXPORT_EXPIRE_TYPE,
                        organizationId: row.organizationId,
                        payload: { exportId },
                        runAt: expiresAt,
                    },
                });
                return true;
            });
            if (!marked) return;
            this.logger.log(
                `data_export_ready org=${row.organizationId} export=${exportId} bytes=${built.sizeBytes} media=${built.counts.media.included} left_out=${built.counts.media.leftOut}`,
            );
            await this.tell(row, built.storageKey, readyAt, expiresAt);
        } catch (error) {
            const name = error instanceof Error ? error.name : "Error";
            this.logger.warn(
                `data_export_failed org=${row.organizationId} export=${exportId} attempt=${job.attempts + 1}/${job.maxAttempts} error=${name}`,
            );
            if (job.attempts + 1 >= job.maxAttempts) {
                await this.fail(
                    exportId,
                    "We couldn't put your data together. Ask for it again; if it fails again, write to us.",
                );
            }
            throw error;
        } finally {
            release();
        }
    };

    readonly expire = async (job: Job): Promise<void> => {
        const exportId = exportIdOf(job);
        if (!exportId) return;
        const row = await prisma.dataExport.findUnique({
            where: { id: exportId },
            select: { id: true, status: true, storageKey: true },
        });
        if (row?.status !== DataExportStatus.Ready) return;
        if (row.storageKey) await this.storage.deleteObject(row.storageKey);
        await prisma.dataExport.updateMany({
            where: { id: exportId, status: DataExportStatus.Ready },
            data: { status: DataExportStatus.Expired, storageKey: null },
        });
        this.logger.log(`data_export_expired export=${exportId}`);
    };

    private async fail(exportId: string, failure: string): Promise<void> {
        await prisma.dataExport.updateMany({
            where: { id: exportId, status: { in: DATA_EXPORT_IN_PROGRESS } },
            data: { status: DataExportStatus.Failed, failure },
        });
    }

    /** Email the owner who asked. Never fails the job. */
    private async tell(
        row: {
            organizationId: string;
            requestedByUserId: string;
            organization: { name: string; slug: string };
        },
        storageKey: string,
        readyAt: Date,
        keptUntil: Date,
    ): Promise<void> {
        try {
            const user = await prisma.user.findUnique({
                where: { id: row.requestedByUserId },
                select: { email: true },
            });
            if (!user?.email) return;
            const signed = await this.storage.createSignedDownloadUrl(
                storageKey,
                {
                    expiresInSeconds: DATA_EXPORT_EMAIL_LINK_SECONDS,
                    downloadFilename: dataExportFilename(
                        row.organization.slug,
                        readyAt,
                    ),
                },
            );
            const outcome = await sendDataExportReadyEmail(user.email, {
                businessName: row.organization.name,
                url: signed.url,
                linkExpiresAt: new Date(signed.expiresAt),
                keptUntil,
                workspaceUrl: `${appBase()}/settings/data`,
            });
            this.logger.log(
                `data_export_email org=${row.organizationId} outcome=${outcome}`,
            );
        } catch (error) {
            this.logger.warn(
                `data_export_email_failed org=${row.organizationId} error=${error instanceof Error ? error.name : "Error"}`,
            );
        }
    }
}
