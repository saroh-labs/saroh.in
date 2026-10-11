import {
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { DataExport } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { ObjectStorage } from "@saroh/object-storage";
import { sanitizeFilename } from "@saroh/object-storage";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { OBJECT_STORAGE } from "../media/object-storage.provider";
import {
    LEGAL_HOLD_CODE,
    legalHoldRefusal,
    onLegalHold,
} from "../organizations/legal-hold";
import { isOwner } from "../sites/publish-approval";
import type { DataExportCounts } from "./data-export-build";
import {
    DATA_EXPORT_BUILD_ATTEMPTS,
    DATA_EXPORT_BUILD_TYPE,
    DATA_EXPORT_IN_PROGRESS,
    DATA_EXPORT_LINK_SECONDS,
    DataExportStatus,
} from "./data-export-types";

export const DATA_EXPORT_OWNER_ONLY_MESSAGE =
    "Only an owner can download the business's data.";

/** An export as Settings › Your data shows it. Never a key or a link. */
export interface DataExportView {
    id: string;
    status: DataExportStatus;
    requestedAt: string;
    readyAt: string | null;
    /** When the file is deleted. */
    expiresAt: string | null;
    sizeBytes: number | null;
    counts: DataExportCounts | null;
    /** Why it failed, in words. */
    failure: string | null;
}

export interface DataExportList {
    /** Newest first; at most the last ten. */
    exports: DataExportView[];
    /** One being made now: asking again answers with it. */
    inProgress: boolean;
}

export function toDataExportView(row: DataExport): DataExportView {
    return {
        id: row.id,
        status: row.status as DataExportStatus,
        requestedAt: row.createdAt.toISOString(),
        readyAt: row.readyAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
        counts: (row.counts as DataExportCounts | null) ?? null,
        failure: row.failure,
    };
}

/**
 * "Download your data" (owner, 9 Oct, DEC-120): an owner asks for one zip
 * of everything the business keeps in Saroh; a job builds it
 * (`data-export.handler.ts`), Saroh emails the owner a signed link, and
 * Settings › Your data makes a fresh one until the file is deleted, 7 days
 * after it was ready.
 *
 * Owner only, by role (`isOwner`): the file holds every customer's details,
 * and no permission a role can be given reaches it (DEC-039: no new
 * permission until the matrix review). A Saroh operator's context is not an
 * owner. Open in every state the business's members may open it, a closing
 * or suspended one included (`@LifecycleWrite("takeout")`).
 *
 * **Refused while the business is on legal hold** (DEC-122): asking for an
 * export and making a link both answer "This business's data is on hold.
 * Write to contact@saroh.in.", and each refusal is on the business's audit
 * trail as DENIED. The list still reads.
 */
@Injectable()
export class DataExportService {
    constructor(
        @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
        private readonly audit: AuditService,
    ) {}

    async list(ctx: OrganizationContext): Promise<DataExportList> {
        assertOwner(ctx);
        const rows = await prisma.dataExport.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
            take: 10,
        });
        return {
            exports: rows.map(toDataExportView),
            inProgress: rows.some((r) =>
                DATA_EXPORT_IN_PROGRESS.includes(r.status as DataExportStatus),
            ),
        };
    }

    /**
     * Ask for an export. One at a time per business: with one being made,
     * this answers with it (`already: true`) and starts nothing. The row and
     * its job are written together, under the business's advisory lock, with
     * the partial unique index behind it.
     */
    async request(
        ctx: OrganizationContext,
    ): Promise<{ export: DataExportView; already: boolean }> {
        assertOwner(ctx);
        const { organizationId } = ctx;
        await this.refuseOnHold(ctx, AuditAction.DataExportRequested);
        const made = await prisma.$transaction(async (tx) => {
            const key = `data-export:${organizationId}`;
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
            const running = await tx.dataExport.findFirst({
                where: {
                    organizationId,
                    status: { in: DATA_EXPORT_IN_PROGRESS },
                },
            });
            if (running) return { row: running, already: true };
            const row = await tx.dataExport.create({
                data: {
                    organizationId,
                    requestedByUserId: ctx.userId,
                    status: DataExportStatus.Queued,
                },
            });
            await tx.job.create({
                data: {
                    type: DATA_EXPORT_BUILD_TYPE,
                    organizationId,
                    payload: { exportId: row.id },
                    maxAttempts: DATA_EXPORT_BUILD_ATTEMPTS,
                },
            });
            return { row, already: false };
        });
        if (!made.already) {
            await this.audit.record({
                action: AuditAction.DataExportRequested,
                actorUserId: ctx.userId,
                organizationId,
                targetType: "data-export",
                targetId: made.row.id,
                outcome: AuditOutcome.Success,
                actorRoleKey: ctx.roleKey,
            });
        }
        return { export: toDataExportView(made.row), already: made.already };
    }

    /**
     * A fresh signed link to a ready export, good for
     * {@link DATA_EXPORT_LINK_SECONDS}. Another business's export is a 404;
     * one not ready, or already deleted, a 409 in words. Each link made is
     * on the business's audit trail.
     */
    async link(
        ctx: OrganizationContext,
        exportId: string,
    ): Promise<{ url: string; expiresAt: string }> {
        assertOwner(ctx);
        const row = await prisma.dataExport.findFirst({
            where: { id: exportId, organizationId: ctx.organizationId },
        });
        if (!row) throw new NotFoundException("Export not found");
        await this.refuseOnHold(ctx, AuditAction.DataExportDownloaded, row.id);
        if (
            row.status !== DataExportStatus.Ready ||
            !row.storageKey ||
            (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now())
        ) {
            throw new ConflictException(
                row.status === DataExportStatus.Expired ||
                    row.status === DataExportStatus.Ready
                    ? "This download has been deleted. Ask for a new one."
                    : row.status === DataExportStatus.Failed
                      ? "This download couldn't be made. Ask for a new one."
                      : "Your data is still being prepared.",
            );
        }
        const organization = await prisma.organization.findUnique({
            where: { id: ctx.organizationId },
            select: { slug: true },
        });
        const signed = await this.storage.createSignedDownloadUrl(
            row.storageKey,
            {
                expiresInSeconds: DATA_EXPORT_LINK_SECONDS,
                downloadFilename: dataExportFilename(
                    organization?.slug ?? "business",
                    row.readyAt ?? row.createdAt,
                ),
            },
        );
        await this.audit.record({
            action: AuditAction.DataExportDownloaded,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "data-export",
            targetId: row.id,
            outcome: AuditOutcome.Success,
            actorRoleKey: ctx.roleKey,
        });
        return { url: signed.url, expiresAt: signed.expiresAt };
    }

    /** On legal hold: refused in words, with the refusal on the trail. */
    private async refuseOnHold(
        ctx: OrganizationContext,
        action: AuditAction,
        exportId?: string,
    ): Promise<void> {
        if (!(await onLegalHold(prisma, ctx.organizationId))) return;
        await this.audit.record({
            action,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "data-export",
            targetId: exportId,
            outcome: AuditOutcome.Denied,
            metadata: { reason: LEGAL_HOLD_CODE },
            actorRoleKey: ctx.roleKey,
        });
        throw legalHoldRefusal();
    }
}

/** `rye-bakery-saroh-data-2026-10-09.zip`: safe in a header and on disk. */
export function dataExportFilename(slug: string, made: Date): string {
    return `${sanitizeFilename(slug)}-saroh-data-${made.toISOString().slice(0, 10)}.zip`;
}

function assertOwner(ctx: OrganizationContext): void {
    if (!isOwner(ctx)) {
        throw new ForbiddenException(DATA_EXPORT_OWNER_ONLY_MESSAGE);
    }
}
