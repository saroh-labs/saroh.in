import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ExtendPurchaseDto } from "./dto";
import { MAX_EXTENSION_DAYS } from "./dto";
import { revisedBy } from "./pack-draft-view";
import { packActor, recordPackEvent } from "./pack-events";

const DAY_MS = 86_400_000;

/** Said when a holder's pack has no classes left to give time for. */
export const NOTHING_TO_EXTEND = "Nothing left to extend";

/**
 * Give a holder's pack more days (round-2 E13, default 46): at most 30 at a
 * time, with a reason, logged as a PackExtension and an EXTENDED event, and
 * moving the purchase's use-by date. An expired pack can be extended too,
 * as long as the new date is still to come. A pack with nothing left has
 * nothing to extend.
 *
 * The purchase is locked FOR UPDATE first — the lock every spend of it
 * takes (`redeem-pack.ts`) — so a class booked at the same moment sees the
 * date before or after, never half of it. Answers the purchase's id.
 */
export async function extendPurchase(
    ctx: OrganizationContext,
    purchaseId: string,
    dto: ExtendPurchaseDto,
    now = new Date(),
): Promise<{ purchaseId: string; packId: string }> {
    const { organizationId } = ctx;
    // The DTO checks the range; this is for a caller that skips it.
    if (
        !Number.isInteger(dto.days) ||
        dto.days < 1 ||
        dto.days > MAX_EXTENSION_DAYS
    ) {
        throw new BadRequestException({
            message: "A pack is extended by at most 30 days at a time",
            details: { field: "days" },
        });
    }
    return prisma.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<({ id: string } | undefined)[]>`
            SELECT id FROM "PackPurchase"
            WHERE id = ${purchaseId} AND "organizationId" = ${organizationId}
            FOR UPDATE`;
        if (!locked) {
            throw new NotFoundException({
                message: "Class pack purchase not found",
                details: { field: "purchaseId" },
            });
        }
        const purchase = await tx.packPurchase.findUniqueOrThrow({
            where: { id: purchaseId },
            select: {
                id: true,
                packId: true,
                credits: true,
                expiresAt: true,
                _count: {
                    select: { redemptions: { where: { reversedAt: null } } },
                },
            },
        });
        if (purchase.credits - purchase._count.redemptions <= 0) {
            throw new ConflictException({
                message: NOTHING_TO_EXTEND,
                details: { field: "purchaseId" },
            });
        }
        const before = purchase.expiresAt;
        const after = new Date(before.getTime() + dto.days * DAY_MS);
        if (after <= now) {
            throw new BadRequestException({
                message: `With ${dto.days} more ${dto.days === 1 ? "day" : "days"} it would still have run out. Add more days.`,
                details: { field: "days" },
            });
        }
        await tx.packExtension.create({
            data: {
                organizationId,
                purchaseId,
                days: dto.days,
                reason: dto.reason,
                expiresBefore: before,
                expiresAfter: after,
                byUserId: revisedBy(ctx),
            },
        });
        await tx.packPurchase.update({
            where: { id: purchaseId },
            data: { expiresAt: after },
        });
        await recordPackEvent(tx, {
            organizationId,
            packId: purchase.packId,
            purchaseId,
            kind: "EXTENDED",
            actor: packActor(ctx),
            details: {
                days: dto.days,
                reason: dto.reason,
                expiresAt: [before.toISOString(), after.toISOString()],
            },
        });
        return { purchaseId, packId: purchase.packId };
    });
}
