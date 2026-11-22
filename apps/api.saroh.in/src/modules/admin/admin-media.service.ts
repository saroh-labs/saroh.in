import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { MediaStorages } from "../media/object-storage.provider";
import { OBJECT_STORAGE } from "../media/object-storage.provider";
import { mediaFileKeys } from "../media/variants";
import { assertNotOnLegalHold } from "../organizations/legal-hold";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import type { OperatorCommand } from "./admin-lifecycle.service";
import { requireReason } from "./admin-lifecycle.service";
import { AdminPermission } from "./admin-permissions";

export interface RemoveUploadCommand extends OperatorCommand {
    mediaId: string;
}

/**
 * Staff take one of a business's uploads down (owner, 22 Nov 2026): the
 * stored object, its smaller copies, then the Media row.
 *
 * A takedown, so none of the merchant's own checks in `MediaService.remove`
 * (on a published site, on a product, the logo): what points at it loses it
 * (`SetNull`), and a published page shows a missing image until the merchant
 * republishes. Refused for a business on legal hold (DEC-122): nothing of a
 * held business is deleted. Objects go first, so a row never outlives
 * nothing; `deleteObject` is idempotent, so a retry after a storage failure
 * finishes the job. Admin ledger with the reason, and the business's own
 * history as Saroh support, in one transaction with the row's delete.
 */
@Injectable()
export class AdminMediaService {
    constructor(
        private readonly audit: AdminAuditService,
        @Inject(OBJECT_STORAGE) private readonly storages: MediaStorages,
    ) {}

    async remove(command: RemoveUploadCommand) {
        const reason = requireReason(command.reason);
        const { organizationId, mediaId } = command;
        // By id AND business, so one business's upload under another's path is a 404.
        const media = await prisma.media.findFirst({
            where: { id: mediaId, organizationId },
            select: {
                id: true,
                key: true,
                bucket: true,
                filename: true,
                contentType: true,
                sizeBytes: true,
                variants: true,
            },
        });
        if (!media) throw new NotFoundException("Upload not found");
        await assertNotOnLegalHold(prisma, organizationId);

        // The photo and its smaller copies (DEC-246).
        const keys = mediaFileKeys(media);
        // In the bucket it was written to (owner, 22 Nov 2026).
        const storage = this.storages.of(media.bucket);
        for (const key of keys) await storage.deleteObject(key);

        await prisma.$transaction(async (tx) => {
            await tx.media.deleteMany({
                where: { id: media.id, organizationId },
            });
            await this.audit.write(tx, {
                actorUserId: command.staff.userId,
                permission: AdminPermission.OrganizationLifecycleWrite,
                action: "media.removed",
                targetType: "media",
                targetId: media.id,
                organizationId,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    filename: media.filename,
                    contentType: media.contentType,
                    sizeBytes: media.sizeBytes,
                    objectsDeleted: keys.length,
                },
            });
            // The business's own history, attributed to the operator (DEC-035).
            await tx.auditEvent.create({
                data: {
                    action: "media.removed",
                    actorUserId: command.staff.userId,
                    organizationId,
                    targetType: "media",
                    targetId: media.id,
                    outcome: "SUCCESS",
                    metadata: { byOperator: true },
                },
            });
        });
        return { ok: true, id: media.id, deleted: true };
    }
}
