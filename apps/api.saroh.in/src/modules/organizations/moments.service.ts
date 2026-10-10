import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { MomentKey } from "./moments";
import { isMomentKey, seenMoments } from "./moments";
import { authorize } from "./organization-policy";

/** The moments this business has already been told about. */
export interface MomentsSeen {
    seen: MomentKey[];
}

/**
 * Which moments a business has seen (wave G), and marking one seen.
 *
 * Per business and on the server, like Team's and Orders' one-time notices:
 * once anyone in the business puts a moment away, or opens what it points
 * at, it is gone for everyone, on every device. Marking twice keeps the
 * first time.
 *
 * `org:read` for both: anyone who works in the business may see a moment
 * about something they can open, and putting it away changes nothing else.
 * A Reviewer, who is shown nothing about the business, holds neither.
 */
@Injectable()
export class MomentsService {
    async read(ctx: OrganizationContext): Promise<MomentsSeen> {
        authorize(ctx, "org:read");
        const org = await prisma.organization.findUnique({
            where: { id: ctx.organizationId },
            select: { momentsSeen: true },
        });
        return { seen: keysOf(org?.momentsSeen) };
    }

    async markSeen(
        ctx: OrganizationContext,
        key: string,
    ): Promise<MomentsSeen> {
        authorize(ctx, "org:read");
        if (!isMomentKey(key)) {
            throw new BadRequestException("That isn't a moment Saroh shows.");
        }
        const org = await prisma.organization.findUnique({
            where: { id: ctx.organizationId },
            select: { momentsSeen: true },
        });
        const seen = seenMoments(org?.momentsSeen);
        if (seen[key]) return { seen: keysOf(seen) };

        const next = { ...seen, [key]: new Date().toISOString() };
        await prisma.organization.update({
            where: { id: ctx.organizationId },
            data: { momentsSeen: next },
        });
        return { seen: keysOf(next) };
    }
}

function keysOf(stored: unknown): MomentKey[] {
    return Object.keys(seenMoments(stored)) as MomentKey[];
}
