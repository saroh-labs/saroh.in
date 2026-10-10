import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { UpdateUsageSharingDto } from "./usage-sharing.dto";

/**
 * "Help improve Saroh": the signed-in person's own choice to share how they
 * use the workspace (DEC-125), Settings › Your profile.
 *
 * It is the person's, not the business's: stored on their user row, so it
 * is the same in every business they belong to and on every device. `null`
 * means they have never chosen; the workspace reads that as yes only where
 * session recording is switched on at all, and as nothing where it is not.
 * `false` is a refusal, and the recorder never starts for them anywhere.
 *
 * Only ever the session's own user (`ctx.userId`): there is no id to pass.
 */
export interface UsageSharingView {
    sharesUsage: boolean | null;
}

@Injectable()
export class UsageSharingService {
    async read(ctx: OrganizationContext): Promise<UsageSharingView> {
        const user = await prisma.user.findUnique({
            where: { id: ctx.userId },
            select: { sharesUsage: true },
        });
        return { sharesUsage: user?.sharesUsage ?? null };
    }

    async update(
        ctx: OrganizationContext,
        dto: UpdateUsageSharingDto,
    ): Promise<UsageSharingView> {
        const user = await prisma.user.update({
            where: { id: ctx.userId },
            data: { sharesUsage: dto.sharesUsage },
            select: { sharesUsage: true },
        });
        return { sharesUsage: user.sharesUsage };
    }
}
